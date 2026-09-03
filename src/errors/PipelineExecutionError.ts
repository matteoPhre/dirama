export class PipelineExecutionError<T> extends Error {
  public readonly stageName: string | undefined;
  public readonly pipelineMessage: T;
  public readonly cause: unknown;

  constructor(pipelineMessage: T, stageName: string | undefined, options: ErrorOptions) {
    super(
      stageName === undefined
        ? "Pipeline execution failed"
        : `Pipeline execution failed at stage "${stageName}"`,
      options,
    );
    this.name = "PipelineExecutionError";
    this.stageName = stageName;
    this.pipelineMessage = pipelineMessage;
    this.cause = options.cause;
  }
}