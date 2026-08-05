/**
 * Raised when a {@link Pipeline} run is aborted via an {@link AbortSignal}
 * (either passed to `run` or triggered internally on early exit/failure)
 * before it settles naturally.
 */
export class PipelineAbortError extends Error {
  constructor(message: string = "Pipeline execution aborted", options?: ErrorOptions) {
    super(message, options);
    this.name = "PipelineAbortError";
  }
}
