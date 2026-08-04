import { IBaseMessage } from "../contracts/IBaseMessage.js";
import { IMatchCallback } from "../contracts/IMatchCallback.js";
import { IPipelineHooks } from "../contracts/IPipelineHooks.js";
import { PipelineFilter } from "./PipelineFilter.js";
import { PipelineTask } from "./PipelineTask.js";

/**
 * Base class for building a *conditional* pipeline stage out of a domain
 * class: {@link matchCallback} decides whether the stage runs at all, and
 * {@link executePipelineStep} holds its logic.
 *
 * `getPipelineFilter` wires the two together into a single {@link PipelineFilter}
 * you can pipe onto a {@link Pipeline}: the filter is skipped entirely when
 * `matchCallback` returns false.
 */
export abstract class BaseConditionalPipelineStage<T extends IBaseMessage> {
  protected abstract matchCallback: IMatchCallback<T>;

  public getPipelineFilter(
    name: string,
    hooks?: IPipelineHooks<T>,
  ): PipelineFilter<T> {
    const filter = new PipelineFilter<T>(this.matchCallback, name, hooks);

    filter.pipe(
      new PipelineTask<T>(async (message, resolve, reject) => {
        await this.executePipelineStep(message, resolve, reject);
      }, name),
    );

    return filter;
  }

  protected abstract executePipelineStep(
    message: T,
    resolve: (output?: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
  ): Promise<void>;
}
