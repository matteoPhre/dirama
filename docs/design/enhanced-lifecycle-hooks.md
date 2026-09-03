# Enhanced Lifecycle Hooks

## Motivation

`IPipelineHooks` already exposes per-stage start, end, and error callbacks, but
it does not identify the beginning or completion of a pipeline run. A
`PipelineFilter` also has no way to report that it skipped its inner pipeline.
This design adds those observability points while ensuring that hooks remain
best-effort side channels and cannot change pipeline behavior.

## Public API

`IPipelineHooks<T>` is extended as follows:

```typescript
export interface IPipelineHooks<T> {
  onPipelineStart?(message: T): void;
  onPipelineEnd?(message: T): void;
  onStageStart?(stage: IStage<T>, input: T): void;
  onStageEnd?(stage: IStage<T>, output: T): void;
  onStageSkip?(stage: IStage<T>, message: T): void;
  onError?(stage: IStage<T> | null, error: unknown, input: T): void;
}
```

No constructor or method signatures change. `new Pipeline<T>(hooks)` and
`new PipelineFilter<T>(predicate, name, hooks)` continue to accept the same
hooks object.

## Behavior

### Pipeline boundaries

- `onPipelineStart` runs once immediately after run initialization and before
  the first stage is considered.
- `onPipelineEnd` runs once when the pipeline resolves successfully, including
  an empty pipeline and an early exit.
- A rejected or aborted run does not call `onPipelineEnd`.
- Every independently invoked `Pipeline` and `SubPipeline` reports its own
  lifecycle when it has hooks.

### Filter skips

- When `PipelineFilter` evaluates its predicate to `false` (including a `null`
  predicate), it calls `onStageSkip` with the filter stage and the current
  message before forwarding to the parent `next` callback.
- A matching predicate does not call `onStageSkip`.
- This applies to hooks supplied directly to that `PipelineFilter`; parent
  pipeline hooks retain their existing `onStageStart` and `onStageEnd` events
  for the filter stage.

### Hook isolation

- All hook invocations are protected: a thrown hook error is swallowed and
  never resolves, rejects, aborts, or otherwise changes the pipeline run.
- If a hook other than `onError` throws, the pipeline makes one best-effort
  call to `onError` with the related stage (or `null` for a pipeline-boundary
  hook), the thrown error, and the current message.
- An error thrown by `onError` is swallowed. It is never forwarded again, which
  prevents recursive error reporting.
- Errors from actual stage execution still follow the existing rejection path
  and are reported to `onError` exactly once for the owning pipeline.

## Usage

```typescript
const pipeline = new Pipeline<OrderMessage>({
  onPipelineStart: (message) => audit.start(message.orderId),
  onStageStart: (stage) => audit.stageStarted(stage.name),
  onStageEnd: (stage) => audit.stageFinished(stage.name),
  onPipelineEnd: (message) => audit.complete(message.orderId),
  onError: (stage, error) => audit.failure(stage?.name, error),
});

const premium = new PipelineFilter<OrderMessage>(
  (message) => message.isPremium,
  "premium",
  {
    onStageSkip: (stage, message) => audit.skipped(stage.name, message.orderId),
  },
);
```

## Test Plan

- Verify start/end ordering around successful stages, empty pipelines, and
  early exits.
- Verify no end event for stage errors and aborts.
- Verify a matching filter does not skip and a non-matching or null predicate
  emits one skip event before the subsequent outer stage starts.
- Verify errors from each hook type are swallowed, execution remains correct,
  and non-`onError` hook errors are forwarded once to `onError`.
- Verify an `onError` exception is swallowed without recursion.

## Out of Scope

- No debug logging, timing information, error-wrapping hierarchy, or new
  pipeline constructor options. Those belong to later roadmap items.
- No parent-pipeline skip event is added for inner stages that are never
  reached because a filter skipped; the skipped stage is the filter itself.
- No asynchronous hook contract is introduced. Hook return values are ignored.