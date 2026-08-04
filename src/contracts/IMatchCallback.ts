/**
 * Predicate used by {@link PipelineFilter} to decide whether its inner
 * sub-pipeline should run for a given input.
 */
export interface IMatchCallback<T> {
  (input: T): boolean;
}
