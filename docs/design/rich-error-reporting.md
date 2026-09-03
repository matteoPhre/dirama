# Rich Error Reporting

## Motivation

Pipeline failures currently reject with the raw stage error. Consumers can
inspect the error message but cannot identify the failing stage or recover the
message state at the point of failure. Nested pipelines also provide no
structured lineage between an outer conditional stage and an error raised by
an inner stage.

## TypeScript Constraint

The roadmap sketch declares `readonly message: T` on an `Error` subclass.
That is incompatible with the built-in `Error.message: string` property and
cannot be implemented with strict TypeScript without an unsafe assertion or a
broken `Error` contract.

This design therefore uses `pipelineMessage: T` for the flowing message. The
inherited `message: string` remains the human-readable error description.

## Public API

```typescript
export class PipelineExecutionError<T> extends Error {
  readonly stageName: string | undefined;
  readonly pipelineMessage: T;
  readonly cause: unknown;

  constructor(
    pipelineMessage: T,
    stageName: string | undefined,
    options: ErrorOptions,
  );
}

export class PipelineAbortError<T> extends PipelineExecutionError<T | undefined> {
  constructor(
    message?: string,
    options?: ErrorOptions,
    pipelineMessage?: T,
    stageName?: string,
  );
}
```

`PipelineExecutionError` and the updated `PipelineAbortError` are re-exported
from the package entry point. `PipelineAbortError` remains an `Error` and keeps
its existing name, so existing `error instanceof PipelineAbortError` checks
continue to work.

## Behavior

### Stage failures

- If a stage rejects with a non-pipeline error, the owning pipeline rejects
  with a `PipelineExecutionError`.
- `stageName` is the failing stage's `name`; `pipelineMessage` is the current
  message object; `cause` is the exact rejection reason.
- The error's text is `Pipeline execution failed at stage "<stageName>"` when
  a stage is known, and `Pipeline execution failed` for pipeline-level
  failures.

### Nested lineage

- Each owning pipeline wraps a failure at its boundary, including a failure
  that was already a `PipelineExecutionError` from a nested pipeline.
- The outer error identifies the outer stage and its `cause` identifies the
  inner `PipelineExecutionError`. Recursively following `cause` yields the
  full stage lineage without introducing a second public lineage format.
- A standalone `SubPipeline` reports the stage inside it as its outermost
  `stageName`. If its `parentNext` rejects, the chain continues with a
  pipeline-level error (`stageName: undefined`) as that stage's cause.

### Aborts

- `PipelineAbortError<T>` extends `PipelineExecutionError<T>` and represents
  cancellation observed by the engine.
- `PipelineAbortError` accepts an optional `pipelineMessage` constructor
  argument and exposes `pipelineMessage: T | undefined`. This represents an
  abort raised before the engine has a message available. `PipelineExecutionError`
  instances created for stage failures always carry a message.
- It receives the current message and stage name when available; its `cause`
  remains the external abort reason, preserving existing cancellation details.
- Existing `instanceof PipelineAbortError` checks remain valid. It also becomes
  valid to check `error instanceof PipelineExecutionError` for aborts.
- An existing `PipelineAbortError` is propagated unchanged rather than wrapped
  again, so cancellation remains distinguishable from a stage failure.

### Hooks and cleanup

- `onError` receives the structured error produced by the owning pipeline.
- Pipeline hook isolation remains unchanged: errors thrown by hooks are still
  swallowed and do not create `PipelineExecutionError` instances.
- The internal abort controller continues to be torn down after every settled
  run.

## Usage

```typescript
try {
  await pipeline.run(order);
} catch (error) {
  if (error instanceof PipelineAbortError) {
    console.error("Cancelled at", error.stageName, error.cause);
  } else if (error instanceof PipelineExecutionError) {
    console.error("Failed at", error.stageName, error.cause);
    console.error("Order state", error.pipelineMessage);
  }
}
```

For a nested filter, the error chain is inspectable without type assertions:

```typescript
if (error instanceof PipelineExecutionError &&
    error.cause instanceof PipelineExecutionError) {
  console.error(error.stageName, error.cause.stageName);
}
```

## Test Plan

- Verify a rejected stage produces `PipelineExecutionError` with stage name,
  cause, text, and the exact message reference.
- Verify `onError` receives that structured error.
- Verify nested filters create a cause chain containing outer and inner stage
  names.
- Verify pipeline-level failures have no stage name and remain visible in the
  `cause` chain when they return through a stage.
- Verify pre-aborted and mid-run aborted pipelines reject with
  `PipelineAbortError`, preserve their abort reason, correctly expose an
  available or absent pipeline message, and are also instances of
  `PipelineExecutionError`.
- Verify existing `PipelineAbortError` instance checks remain valid.

## Out of Scope

- No retry policy, timeout, debug logging, additional hook types, or generic
  error serialization.
- No public `lineage` array: recursive `cause` is the single lineage model.
- No conversion of errors thrown inside user hooks; hooks remain observational
  side channels.