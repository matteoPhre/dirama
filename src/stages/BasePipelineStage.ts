import { IBaseMessage } from "../contracts/IBaseMessage.js";
import { PipelineTask } from "./PipelineTask.js";

/**
 * Base class for building an unconditional pipeline stage out of a domain
 * class. Implement {@link executePipelineStep} with the stage's logic; call
 * {@link getPipelineTask} to obtain the {@link PipelineTask} to pipe onto a
 * {@link Pipeline}.
 */
export abstract class BasePipelineStage<T extends IBaseMessage> {
  public getPipelineTask(name: string): PipelineTask<T> {
    return new PipelineTask<T>(async (message, resolve, reject) => {
      await this.executePipelineStep(message, resolve, reject);
    }, name);
  }

  protected abstract executePipelineStep(
    message: T,
    resolve: (output?: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
  ): Promise<void>;
}
