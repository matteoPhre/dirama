import { IStage } from "./IStage.js";
import { IPipelineRunOptions } from "./IPipelineRunOptions.js";

/**
 * Generic pipeline contract.
 */
export interface IPipeline<T> {
  pipe(stage: IStage<T>): IPipeline<T>;

  getStages(): IStage<T>[];

  run(input: T, options?: IPipelineRunOptions): Promise<T>;
}
