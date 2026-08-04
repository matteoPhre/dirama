import { IStage } from "../contracts/IStage.js";
import { IExecuteCallback } from "../contracts/IExecuteCallback.js";

/**
 * A stage that wraps a plain callback: the callback acts on the input it
 * receives and resolves/rejects once it's done.
 */
export class PipelineTask<T> implements IStage<T> {
  public readonly name: string;
  private static readonly PREFIX = "TASK__";
  private readonly executeCallback: IExecuteCallback<T>;

  constructor(executeCallback: IExecuteCallback<T>, name: string) {
    this.name = `${PipelineTask.PREFIX}${name}`;
    this.executeCallback = executeCallback;
  }

  public invoke(
    input: T,
    next: (input: T) => Promise<T>,
    resolve: (output?: T | PromiseLike<T>) => void,
    reject: (reason: unknown) => void,
  ): void {
    new Promise<T | undefined>((res, rej) => {
      this.executeCallback(input, res, rej);
    })
      .then((value) => next((value ?? input) as T))
      .then((value) => resolve(value))
      .catch((reason) => reject(reason));
  }
}
