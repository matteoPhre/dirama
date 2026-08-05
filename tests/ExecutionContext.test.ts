import { describe, it, expect, expectTypeOf } from "vitest";
import { ExecutionContext } from "../src/ExecutionContext.js";
import { Pipeline } from "../src/engine/Pipeline.js";
import { PipelineTask } from "../src/stages/PipelineTask.js";

interface OrderState {
  total: number;
  items: string[];
}

interface OrderMetadata {
  tenantId: string;
}

describe("ExecutionContext", () => {
  it("creates a context with initial state and generated metadata", () => {
    const ctx = new ExecutionContext<OrderState>({ total: 0, items: [] });

    expect(ctx.getState()).toEqual({ total: 0, items: [] });
    expect(typeof ctx.metadata.requestId).toBe("string");
    expect(ctx.metadata.requestId.length).toBeGreaterThan(0);
    expect(typeof ctx.metadata.timestamp).toBe("number");
  });

  it("merges custom metadata with the baseline requestId/timestamp", () => {
    const ctx = new ExecutionContext<OrderState, OrderMetadata>(
      { total: 0, items: [] },
      { tenantId: "tenant-1" },
    );

    expect(ctx.metadata.tenantId).toBe("tenant-1");
    expect(typeof ctx.metadata.requestId).toBe("string");
  });

  it("generates a distinct requestId per instance", () => {
    const first = new ExecutionContext<OrderState>({ total: 0, items: [] });
    const second = new ExecutionContext<OrderState>({ total: 0, items: [] });

    expect(first.metadata.requestId).not.toBe(second.metadata.requestId);
  });

  it("mutates state via setState without type assertions", () => {
    const ctx = new ExecutionContext<OrderState>({ total: 0, items: [] });

    ctx.setState({ total: 10 });

    expect(ctx.getState().total).toBe(10);
    expect(ctx.getState().items).toEqual([]);
  });

  it("mutates a single field via setStateValue", () => {
    const ctx = new ExecutionContext<OrderState>({ total: 0, items: [] });

    ctx.setStateValue("items", ["sku-1"]);

    expect(ctx.getState().items).toEqual(["sku-1"]);
  });

  it("supports the IBaseMessage exit contract", () => {
    const ctx = new ExecutionContext<OrderState>({ total: 0, items: [] });

    expect(ctx.getExit()).toBe(false);
    ctx.setExit(true);
    expect(ctx.getExit()).toBe(true);
  });

  it("infers strict state types (compile-time check)", () => {
    const ctx = new ExecutionContext<OrderState>({ total: 0, items: [] });

    expectTypeOf(ctx.getState()).toEqualTypeOf<Readonly<OrderState>>();
    expectTypeOf(ctx.setState).parameter(0).toEqualTypeOf<Partial<OrderState>>();
  });

  it("propagates state mutations across asynchronous pipeline stages", async () => {
    const pipeline = new Pipeline<ExecutionContext<OrderState>>();

    pipeline
      .pipe(
        new PipelineTask<ExecutionContext<OrderState>>(async (ctx, resolve) => {
          ctx.setState({ total: ctx.getState().total + 5 });
          resolve(ctx);
        }, "add-total"),
      )
      .pipe(
        new PipelineTask<ExecutionContext<OrderState>>(async (ctx, resolve) => {
          ctx.setStateValue("items", [...ctx.getState().items, "sku-1"]);
          resolve(ctx);
        }, "add-item"),
      );

    const result = await pipeline.run(
      new ExecutionContext<OrderState>({ total: 0, items: [] }),
    );

    expect(result.getState()).toEqual({ total: 5, items: ["sku-1"] });
  });
});
