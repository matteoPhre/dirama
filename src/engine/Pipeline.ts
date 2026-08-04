import { IBaseMessage } from "../contracts/IBaseMessage.js";
import { IStage } from "../contracts/IStage.js";
import { IPipeline } from "../contracts/IPipeline.js";
import { IPipelineHooks } from "../contracts/IPipelineHooks.js";

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

  public pipe(stage: IStage<T>): Pipeline<T> {
    this.pushStage(stage);

    return this;
  }

  public pipes(stages: IStage<T>[]): Pipeline<T> {
    stages.forEach((stage) => {
      this.pushStage(stage);
    });

    return this;
  }

  public run(input: T): Promise<T> {
    this.reset();
    this.resetInputExitState(input);
    return this.next(input);
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

  /**
   * Call the next stage in the pipeline.
   *
   * Not a class method (it's an arrow-function field) so it can be passed
   * as-is to `stage.invoke` without needing `.bind(this)`.
   */
  protected next = (input: T): Promise<T> => {
    if (input.getExit()) {
      return new Promise<T>((resolve, reject) => {
        this.end(input, resolve, reject);
      });
    }

    return new Promise<T>((resolve, reject) => {
      this.incrementCurrent();

      const currentStage = this.getCurrentStage();
      if (currentStage !== null && currentStage !== undefined) {
        this.hooks?.onStageStart?.(currentStage, input);

        const wrappedResolve = (output?: T | PromiseLike<T>): void => {
          Promise.resolve(output ?? input).then((resolved) => {
            this.hooks?.onStageEnd?.(currentStage, resolved);
          });
          resolve(output ?? input);
        };

        const wrappedReject = (reason: unknown): void => {
          this.hooks?.onError?.(currentStage, reason, input);
          reject(reason);
        };

        currentStage.invoke(input, this.next, wrappedResolve, wrappedReject);
        return;
      }

      // End of pipeline
      this.end(input, resolve, reject);
    });
  };

  /**
   * End the pipeline: acts as a "null stage" that immediately resolves with
   * the input, triggering the `.then` callbacks on every executed stage's
   * `next` call. Overridden by {@link SubPipeline} to hand control back to
   * a parent pipeline instead.
   */
  protected end(
    input: T,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
  ): void {
    resolve(input);
  }
}
