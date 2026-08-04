/**
 * Callback executed by a {@link PipelineTask}. Call `resolve` when the work
 * is done (optionally with a modified input), or `reject` on failure.
 */
export interface IExecuteCallback<T> {
  (
    input: T,
    resolve: (output?: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
  ): void;
}
