/**
 * Baseline metadata carried by every {@link ExecutionContext}.
 */
export interface IExecutionMetadata {
  /** Unique identifier correlating a single pipeline run. */
  readonly requestId: string;

  /** Creation time of the context, in epoch milliseconds. */
  readonly timestamp: number;
}
