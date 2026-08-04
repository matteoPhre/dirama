import { IStage } from "./IStage.js";

/**
 * Optional external observability hooks. The core engine never logs anything
 * itself — if you want visibility into stage execution (logging, metrics,
 * tracing, ...), pass hooks and wire them to whatever you use.
 *
 * All hooks are best-effort side channels: throwing inside a hook is not
 * caught by the pipeline and will propagate as an unhandled rejection, so
 * keep them defensive.
 */
export interface IPipelineHooks<T> {
  /** Called right before a stage's `invoke` is called. */
  onStageStart?(stage: IStage<T>, input: T): void;

  /** Called once a stage has resolved, with the value it resolved with. */
  onStageEnd?(stage: IStage<T>, output: T): void;

  /** Called when a stage rejects. `stage` is null for pipeline-level failures. */
  onError?(stage: IStage<T> | null, error: unknown, input: T): void;
}
