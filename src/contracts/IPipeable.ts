import { IStage } from "./IStage.js";

/**
 * Generic pipeable contract.
 *
 * A subset of {@link IPipeline}: it does not declare `run`, so a class can be
 * "pipeable" (accept stages) without taking on the overhead of being a full,
 * independently runnable pipeline.
 */
export interface IPipeable<T> {
  /**
   * Pipe a stage onto the subject. Returns self for a fluent API.
   */
  pipe(stage: IStage<T>): IPipeable<T>;
}
