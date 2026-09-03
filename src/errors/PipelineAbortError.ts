/**
 * Raised when a {@link Pipeline} run is aborted via an {@link AbortSignal}
 * (either passed to `run` or triggered internally on early exit/failure)
 * before it settles naturally.
 */
import { PipelineExecutionError } from "./PipelineExecutionError.js";

export class PipelineAbortError<T> extends PipelineExecutionError<T | undefined> {
  constructor(
    message: string = "Pipeline execution aborted",
    options?: ErrorOptions,
    pipelineMessage?: T,
    stageName?: string,
  ) {
    super(pipelineMessage, stageName, options ?? {});
    this.name = "PipelineAbortError";
    this.message = message;
  }
}
