# Debug Mode

## Motivation

`IPipelineHooks` enables application-defined observability, but inspecting a
pipeline during development currently requires manually wiring every lifecycle
callback. Debug mode provides opt-in console diagnostics built entirely by
composing those hooks. It adds no runtime dependency and leaves normal
pipeline execution unchanged when disabled.

## Public API

```typescript
export interface IPipelineOptions<T> extends IPipelineHooks<T> {
  debug?: boolean;
}

export class Pipeline<T extends IBaseMessage> implements IPipeline<T> {
  constructor(options?: IPipelineOptions<T>);
}
```

The options are flat: hooks remain top-level fields. Existing code such as
`new Pipeline<T>({ onStageStart() {} })` is structurally compatible with
`IPipelineOptions<T>` and needs no change. `debug` defaults to `false`.

`IPipelineOptions` is re-exported from the package entry point. No debug API
is added to `PipelineFilter`, `Pipeline.run`, or `IStage`.

## Behavior

### Hook composition

- With `debug: true`, `Pipeline` composes internal debug callbacks with the
  supplied hooks during construction.
- The engine continues to invoke only its effective hook object. It has no
  debug-specific branches in `run`, `next`, or stage execution.
- User callbacks and debug callbacks are invoked independently, so an
  exception in one does not suppress the other. Existing hook isolation and
  best-effort forwarding to `onError` remain in force.
- With `debug: false` or omitted, no `console.debug` calls occur and existing
  hook behavior is preserved.

### Log records

Each record is emitted with `console.debug` as a readable event label followed
by a structured record:

```typescript
console.debug("[dirama] stage:start", {
  stageName: "TASK__validate",
  durationMs: 0,
  message: snapshot,
});
```

All records have `stageName`, `durationMs`, and `message`. Pipeline-wide events
use `stageName: undefined`. `durationMs` is measured with `performance.now()`:

- `pipeline:start`: duration since the run was initialized, `0`.
- `stage:start`: duration since this stage began, `0`.
- `stage:end`: duration from its corresponding `stage:start`.
- `stage:skip`: duration from the filter stage's `stage:start`.
- `pipeline:early-exit`: duration since `pipeline:start` when
  `onPipelineEnd` receives a message whose `getExit()` is `true`.
- `pipeline:end`: duration since `pipeline:start` for every successful run,
  including early exits.
- `pipeline:abort`: duration since `pipeline:start` when `onError` receives a
  `PipelineAbortError`.

The record message is a best-effort snapshot made with `structuredClone`. If
cloning fails, the original message is emitted instead; logging remains
best-effort and never affects execution.

### Filter skip propagation

`PipelineFilter` keeps invoking its directly supplied `onStageSkip` hook. It
also implements an internal, non-exported observer method. When the filter is
piped into a `Pipeline`, that pipeline registers its effective skip callback.
On a non-matching predicate, the filter reports the same skip to both hook
owners before calling `next`.

This allows a debug-enabled parent pipeline to log `stage:skip`; it also makes
a parent `onStageSkip` hook observe filters piped directly into that pipeline.
The observer is not part of `IStage`, adds no public export, and does not alter
filter control flow.

### Nested pipelines

- Each pipeline with `debug: true` logs only its own lifecycle.
- A filter’s inner `SubPipeline` uses the hooks explicitly passed to that
  filter; it does not inherit debug mode from the parent pipeline.
- An abort is detected through the existing `onError` callback and logged once
  by each debug-enabled pipeline that observes it.

## Usage

```typescript
const pipeline = new Pipeline<OrderMessage>({
  debug: true,
  onError: (stage, error) => audit.failure(stage?.name, error),
});

pipeline.pipe(validateOrder);

await pipeline.run(order);
```

## Test Plan

- Verify debug-disabled pipelines do not call `console.debug`.
- Spy on `console.debug` and verify labels, stage names, durations, and message
  snapshots for stage start/end and successful pipeline completion.
- Verify a non-matching filter emits `stage:skip` before the next outer stage.
- Verify early exit emits `pipeline:early-exit` followed by `pipeline:end`.
- Verify an aborted run emits `pipeline:abort` and does not emit `pipeline:end`.
- Verify a user hook throwing does not suppress debug output or alter the run.
- Verify a parent `onStageSkip` hook observes a piped filter, while a filter’s
  direct hook continues to run.

## Out of Scope

- No custom logger interface, log levels, log sinks, tracing integration, or
  runtime configuration after pipeline construction.
- No persistence, serialization guarantee, deep clone fallback, or redaction
  of message snapshots.
- No implicit debug propagation into a filter’s inner sub-pipeline.