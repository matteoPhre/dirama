import { IBaseMessage } from "../contracts/IBaseMessage.js";
import { IStage } from "../contracts/IStage.js";
import { IPipeline } from "../contracts/IPipeline.js";
import { IPipelineHooks } from "../contracts/IPipelineHooks.js";
import { IPipelineRunOptions } from "../contracts/IPipelineRunOptions.js";
import { PipelineAbortError } from "../errors/PipelineAbortError.js";
import { PipelineExecutionError } from "../errors/PipelineExecutionError.js";

/**
 * Pipeline of stages executed in sequence.
 *
 * Stages implement {@link IStage} and are responsible for calling the
 * pipeline's `next` callback to advance (or to trigger an early exit). When a
 * stage resolves or rejects, control returns to whoever called `next` on it —
 * so stages can transform the message both before *and* after calling `next`.
 *
 * The pipeline resolves when the first stage resolves (which happens last,
 * since it waits for every subsequent stage to resolve first, unless a stage
 * sets the message's exit flag).
 */
export class Pipeline<T extends IBaseMessage> implements IPipeline<T> {
  protected readonly hooks?: IPipelineHooks<T>;

  /**
   * Index of the stage currently executing. Incremented every time `next`
   * is called; never decremented. Once the pipeline fully resolves this
   * equals the number of piped stages.
   */
  private current: number = -1;

  private stages: Array<IStage<T>> = [];

  /**
   * Internal controller for the current run, aborted automatically once the
   * run settles (resolves, rejects, or exits early) so long-running stages
   * using {@link signal} can clean up.
   */
  private controller: AbortController = new AbortController();
  private externalSignal?: AbortSignal;
  private externalAbortListener?: () => void;

  constructor(hooks?: IPipelineHooks<T>) {
    this.hooks = hooks;
  }

  public getCurrent(): number {
    return this.current;
  }

  public getCurrentStage(): IStage<T> | null {
    if (this.current in this.stages) {
      return this.stages[this.current];
    }

    return null;
  }

  public getStages(): Array<IStage<T>> {
    return this.stages;
  }

  public pipe(stage: IStage<T>): this {
    this.pushStage(stage);

    return this;
  }

  public pipes(stages: IStage<T>[]): this {
    stages.forEach((stage) => {
      this.pushStage(stage);
    });

    return this;
  }

  public run(input: T, options?: IPipelineRunOptions): Promise<T> {
    this.reset();
    this.resetInputExitState(input);
    this.setupAbortController(options?.signal);

    this.invokeHook(() => this.hooks?.onPipelineStart?.(input), null, input);

    return this.next(input)
      .then((output) => {
        this.invokeHook(() => this.hooks?.onPipelineEnd?.(output), null, output);
        return output;
      })
      .finally(() => this.teardownAbortController());
  }

  /** Combined cancellation signal for the current run. */
  protected get signal(): AbortSignal {
    return this.controller.signal;
  }

  protected incrementCurrent(): void {
    this.current++;
  }

  protected pushStage(stage: IStage<T>): void {
    this.stages.push(stage);
  }

  protected reset(): void {
    this.current = -1;
  }

  // Reset the message's exit state: it's the stage's job to set it per-run,
  // but the flag would otherwise leak into the next `run()` call.
  protected resetInputExitState(input: T): void {
    input.setExit(false);
  }

  private setupAbortController(externalSignal?: AbortSignal): void {
    this.controller = new AbortController();
    this.externalSignal = externalSignal;

    if (externalSignal === undefined) {
      return;
    }

    if (externalSignal.aborted) {
      this.controller.abort(externalSignal.reason);
      return;
    }

    this.externalAbortListener = (): void => this.controller.abort(externalSignal.reason);
    externalSignal.addEventListener("abort", this.externalAbortListener);
  }

  private teardownAbortController(): void {
    if (this.externalSignal !== undefined && this.externalAbortListener !== undefined) {
      this.externalSignal.removeEventListener("abort", this.externalAbortListener);
    }

    if (!this.controller.signal.aborted) {
      this.controller.abort();
    }
  }

  /**
   * Call the next stage in the pipeline.
   *
   * Not a class method (it's an arrow-function field) so it can be passed
   * as-is to `stage.invoke` without needing `.bind(this)`.
   */
  protected next = (input: T): Promise<T> => {
    if (input.getExit()) {
      return this.end(input);
    }

    if (this.signal.aborted) {
      const abortReason = this.buildAbortError(input);
      this.invokeHook(
        () => this.hooks?.onError?.(this.getCurrentStage(), abortReason, input),
        this.getCurrentStage(),
        input,
        false,
      );
      return Promise.reject(abortReason);
    }

    return new Promise<T>((resolve, reject) => {
      this.incrementCurrent();

      const currentStage = this.getCurrentStage();
      if (currentStage !== null && currentStage !== undefined) {
        this.invokeHook(
          () => this.hooks?.onStageStart?.(currentStage, input),
          currentStage,
          input,
        );

        const wrappedResolve = (output?: T | PromiseLike<T>): void => {
          Promise.resolve(output ?? input)
            .then((resolved) => {
              this.invokeHook(
                () => this.hooks?.onStageEnd?.(currentStage, resolved),
                currentStage,
                resolved,
              );
              resolve(resolved);
            })
            .catch(wrappedReject);
        };

        const wrappedReject = (reason: unknown): void => {
          const executionError = this.buildExecutionError(reason, currentStage, input);
          this.invokeHook(
            () => this.hooks?.onError?.(currentStage, executionError, input),
            currentStage,
            input,
            false,
          );
          reject(executionError);
        };

        try {
          currentStage.invoke(input, this.next, wrappedResolve, wrappedReject, this.signal);
        } catch (reason) {
          wrappedReject(reason);
        }
        return;
      }

      // End of pipeline
      this.end(input)
        .then(resolve)
        .catch((reason) => reject(this.buildExecutionError(reason, undefined, input)));
    });
  };

  private buildAbortError(input: T): PipelineAbortError<T> {
    const reason: unknown = this.controller.signal.reason;
    if (reason instanceof PipelineAbortError) {
      return reason;
    }

    return new PipelineAbortError(
      "Pipeline execution aborted",
      { cause: reason },
      input,
      this.getCurrentStage()?.name,
    );
  }

  private buildExecutionError(
    reason: unknown,
    stage: IStage<T> | undefined,
    input: T,
  ): PipelineExecutionError<T> | PipelineAbortError<T> {
    if (reason instanceof PipelineAbortError) {
      return reason;
    }

    return new PipelineExecutionError(input, stage?.name, { cause: reason });
  }

  private invokeHook(
    callback: () => void,
    stage: IStage<T> | null,
    message: T,
    reportError: boolean = true,
  ): void {
    try {
      callback();
    } catch (error) {
      if (reportError) {
        this.invokeHook(
          () => this.hooks?.onError?.(stage, error, message),
          stage,
          message,
          false,
        );
      }
    }
  }

  /**
   * End the pipeline: acts as a "null stage" that immediately resolves with
   * the input, triggering the `.then` callbacks on every executed stage's
   * `next` call. Overridden by {@link SubPipeline} to hand control back to
   * a parent pipeline instead.
   */
  protected end(input: T): Promise<T> {
    return Promise.resolve(input);
  }
}
