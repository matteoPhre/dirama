import { IBaseMessage } from "./contracts/IBaseMessage.js";
import { IExecutionMetadata } from "./contracts/IExecutionMetadata.js";

/**
 * Strongly-typed execution context flowing through a {@link Pipeline}.
 *
 * `TState` is the mutable payload shape carried across stages; `TMetadata`
 * extends the baseline {@link IExecutionMetadata} with consumer-defined
 * fields. State mutations are merged immutably and re-typed on every call,
 * so no `as` assertions are required to keep type inference precise.
 */
export interface IExecutionContext<
  TState extends object,
  TMetadata extends object = Record<string, never>,
> extends IBaseMessage {
  readonly metadata: Readonly<IExecutionMetadata & TMetadata>;

  /** Current state snapshot. */
  getState(): Readonly<TState>;

  /** Merge a partial patch into the current state. */
  setState(patch: Partial<TState>): void;

  /** Set a single state field by key. */
  setStateValue<K extends keyof TState>(key: K, value: TState[K]): void;
}

/**
 * Default {@link IExecutionContext} implementation.
 */
export class ExecutionContext<
  TState extends object,
  TMetadata extends object = Record<string, never>,
> implements IExecutionContext<TState, TMetadata>
{
  public readonly metadata: Readonly<IExecutionMetadata & TMetadata>;
  private state: TState;
  private exit = false;

  constructor(initialState: TState, metadata?: TMetadata) {
    this.state = initialState;
    this.metadata = Object.freeze({
      requestId: ExecutionContext.generateRequestId(),
      timestamp: Date.now(),
      ...metadata,
    }) as Readonly<IExecutionMetadata & TMetadata>;
  }

  private static generateRequestId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  public getState(): Readonly<TState> {
    return this.state;
  }

  public setState(patch: Partial<TState>): void {
    this.state = { ...this.state, ...patch };
  }

  public setStateValue<K extends keyof TState>(key: K, value: TState[K]): void {
    this.state = { ...this.state, [key]: value };
  }

  public setExit(value: boolean): void {
    this.exit = value;
  }

  public getExit(): boolean {
    return this.exit;
  }
}
