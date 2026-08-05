/**
 * Options accepted by {@link Pipeline.run}.
 */
export interface IPipelineRunOptions {
  /**
   * External signal used to cancel the run. Combined with the pipeline's
   * own internal signal, which aborts automatically once the run settles
   * (resolves, rejects, or exits early), so long-running stages can clean
   * up resources tied to `signal`.
   */
  signal?: AbortSignal;
}
