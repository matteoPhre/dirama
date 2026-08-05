/**
 * Callback executed by a {@link PipelineTask}. Call `resolve` when the work
 * is done (optionally with a modified input), or `reject` on failure.
 * `signal` carries the current pipeline run's cancellation signal.
 */
export interface IExecuteCallback<T> {
  (
    input: T,
    resolve: (output?: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
    signal?: AbortSignal,
  ): void;
}
