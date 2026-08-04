/**
 * Contract for a single pipeline stage.
 */
export interface IStage<T> {
  /** If true, the pipeline stops after this stage resolves, even if more stages are piped. */
  exitAfter?: boolean;

  /** Stage name, used for diagnostics/hooks. */
  name: string;

  /**
   * Invoked by the pipeline when this stage should run. The input can be
   * mutated during execution. Implementations MUST eventually call either
   * `resolve` (directly, or via `next`) or `reject`.
   *
   * A well-behaved stage that wants the pipeline to continue calls `next(input)`
   * and resolves once `next`'s returned promise settles, so it can still
   * observe/modify the output on the way back out.
   *
   * @param input the current pipeline message
   * @param next callback that invokes the next stage in the pipeline
   * @param resolve callback to hand control back to the caller with a final output
   * @param reject callback to hand control back to the caller with a failure reason
   */
  invoke: (
    input: T,
    next: (input: T) => Promise<T>,
    resolve: (output?: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
  ) => void;
}
