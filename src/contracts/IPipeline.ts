import { IStage } from "./IStage.js";

/**
 * Generic pipeline contract.
 */
export interface IPipeline<T> {
  pipe(stage: IStage<T>): IPipeline<T>;

  getStages(): IStage<T>[];

  run(input: T): Promise<T>;
}
