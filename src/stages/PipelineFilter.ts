import { SubPipeline } from "../engine/SubPipeline.js";
import { IStage } from "../contracts/IStage.js";
import { IMatchCallback } from "../contracts/IMatchCallback.js";
import { IBaseMessage } from "../contracts/IBaseMessage.js";
import { IPipeable } from "../contracts/IPipeable.js";
import { IPipelineHooks } from "../contracts/IPipelineHooks.js";

/**
 * A stage that conditionally runs an inner sub-pipeline.
 *
 * On `invoke`, the match predicate is evaluated against the input. If it
 * returns `true`, the stages piped onto this filter run as a sub-pipeline;
 * otherwise the filter is a no-op and control passes straight to `next`.
 */
export class PipelineFilter<T extends IBaseMessage>
  implements IStage<T>, IPipeable<T>
{
  public readonly name: string;
  private static readonly NAME_PREFIX = "FILTER__";
  private readonly match: IMatchCallback<T> | null;
  private readonly hooks?: IPipelineHooks<T>;
  private innerPipeline: SubPipeline<T> | null = null;
  private stageSkipObserver?: (stage: IStage<T>, message: T) => void;

  constructor(
    match: IMatchCallback<T> | null = null,
    name: string = "unnamed",
    hooks?: IPipelineHooks<T>,
  ) {
    this.name = `${PipelineFilter.NAME_PREFIX}${name}`;
    this.match = match;
    this.hooks = hooks;
  }

  protected get filterPipeline(): SubPipeline<T> {
    if (this.innerPipeline === null) {
      this.innerPipeline = new SubPipeline<T>(this.hooks);
    }

    return this.innerPipeline;
  }

  public pipe(stage: IStage<T>): PipelineFilter<T> {
    this.filterPipeline.pipe(stage);

    return this;
  }

  public setStageSkipObserver(
    observer: (stage: IStage<T>, message: T) => void,
  ): void {
    this.stageSkipObserver = observer;
  }

  public invoke(
    input: T,
    next: (input: T) => Promise<T>,
    resolve: (output?: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
    signal?: AbortSignal,
  ): void {
    if (this.matches(input)) {
      this.filterPipeline.setParentNext(next);

      this.filterPipeline
        .run(input, { signal })
        .then((value) => {
          resolve(value);
        })
        .catch((reason) => {
          reject(reason);
        });
      return;
    }

    // Predicate didn't match: skip the inner pipeline entirely.
      this.invokeHook(
        () => this.hooks?.onStageSkip?.(this, input),
        this,
        input,
      );
      this.invokeHook(() => this.stageSkipObserver?.(this, input), this, input);

    next(input)
      .then((value) => {
        resolve(value);
      })
      .catch((reason) => {
        reject(reason);
      });
  }

  protected matches(input: T): boolean {
    return typeof this.match === "function" ? this.match(input) : false;
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
}
