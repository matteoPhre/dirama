import { IBaseMessage } from "../contracts/IBaseMessage.js";
import { Pipeline } from "./Pipeline.js";

/**
 * A pipeline that can run as part of a stage (e.g. {@link PipelineFilter}) in
 * a "main" pipeline. Stages piped onto a sub-pipeline run normally; once the
 * sub-pipeline completes, control is handed back to the parent instead of
 * resolving directly.
 */
export class SubPipeline<T extends IBaseMessage> extends Pipeline<T> {
  /** Callback that triggers the next stage in the parent pipeline. */
  private parentNext?: (input: T) => Promise<T>;

  public setParentNext(parentNext: (input: T) => Promise<T>): void {
    this.parentNext = parentNext;
  }

  protected end(
    input: T,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
  ): void {
    if (typeof this.parentNext !== "function") {
      resolve(input);
      return;
    }

    this.parentNext(input)
      .then((resolved) => {
        resolve(resolved);
      })
      .catch((reason) => {
        reject(reason);
      });
  }
}
