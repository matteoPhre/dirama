import { describe, it, expect, vi } from "vitest";
import { Pipeline } from "../src/engine/Pipeline.js";
import { PipelineFilter } from "../src/stages/PipelineFilter.js";
import { PipelineTask } from "../src/stages/PipelineTask.js";
import { PipelineExecutionError } from "../src/errors/PipelineExecutionError.js";
import { TestMessage } from "./helpers/TestMessage.js";

describe("PipelineFilter", () => {
	it("runs the inner pipeline when the predicate matches", async () => {
		const order: string[] = [];
		const pipeline = new Pipeline<TestMessage>();

		const filter = new PipelineFilter<TestMessage>((input) => input.value > 0, "positive");
		filter.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("inner");
				resolve(input);
			}, "inner"),
		);

		pipeline
			.pipe(filter)
			.pipe(
				new PipelineTask<TestMessage>((input, resolve) => {
					order.push("outer");
					resolve(input);
				}, "outer"),
			);

		await pipeline.run(new TestMessage(1));

		expect(order).toEqual(["inner", "outer"]);
	});

	it("skips the inner pipeline when the predicate does not match", async () => {
		const order: string[] = [];
		const pipeline = new Pipeline<TestMessage>();

		const filter = new PipelineFilter<TestMessage>((input) => input.value > 0, "positive");
		filter.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("inner");
				resolve(input);
			}, "inner"),
		);

		pipeline
			.pipe(filter)
			.pipe(
				new PipelineTask<TestMessage>((input, resolve) => {
					order.push("outer");
					resolve(input);
				}, "outer"),
			);

		await pipeline.run(new TestMessage(-1));

		expect(order).toEqual(["outer"]);
	});

	it("invokes the filter skip hook before the next outer stage", async () => {
		const events: string[] = [];
		const pipeline = new Pipeline<TestMessage>();
		const filter = new PipelineFilter<TestMessage>(() => false, "never", {
			onStageSkip: (stage, message) => {
				events.push(`skip:${stage.name}:${message.value}`);
			},
		});

		pipeline
			.pipe(filter)
			.pipe(
				new PipelineTask<TestMessage>((input, resolve) => {
					events.push("outer");
					resolve(input);
				}, "outer"),
			);

		await pipeline.run(new TestMessage(3));

		expect(events).toEqual(["skip:FILTER__never:3", "outer"]);
	});

	it("forwards filter skips to the parent hooks and debug records", async () => {
		const events: string[] = [];
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const pipeline = new Pipeline<TestMessage>({
			debug: true,
			onStageSkip: (stage) => events.push(`parent:${stage.name}`),
		});
		const filter = new PipelineFilter<TestMessage>(() => false, "never", {
			onStageSkip: (stage) => events.push(`filter:${stage.name}`),
		});

		pipeline.pipe(filter);

		try {
			await pipeline.run(new TestMessage());

			expect(events).toEqual(["filter:FILTER__never", "parent:FILTER__never"]);
			expect(debugSpy).toHaveBeenCalledWith(
				"[dirama] stage:skip",
				expect.objectContaining({ stageName: "FILTER__never", durationMs: expect.any(Number) }),
			);
		} finally {
			debugSpy.mockRestore();
		}
	});

	it("continues when the filter skip hook throws", async () => {
		const hookError = new Error("skip hook failure");
		const reportedErrors: unknown[] = [];
		const pipeline = new Pipeline<TestMessage>();
		const filter = new PipelineFilter<TestMessage>(() => false, "never", {
			onStageSkip: () => {
				throw hookError;
			},
			onError: (_stage, error) => reportedErrors.push(error),
		});

		pipeline.pipe(filter);

		await pipeline.run(new TestMessage());

		expect(reportedErrors).toEqual([hookError]);
	});

	it("treats a null predicate as always non-matching", async () => {
		const order: string[] = [];
		const pipeline = new Pipeline<TestMessage>();

		const filter = new PipelineFilter<TestMessage>(null, "no-match");
		filter.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("inner");
				resolve(input);
			}, "inner"),
		);

		pipeline.pipe(filter);

		await pipeline.run(new TestMessage());

		expect(order).toEqual([]);
	});

	it("propagates mutations made by the inner pipeline", async () => {
		const pipeline = new Pipeline<TestMessage>();

		const filter = new PipelineFilter<TestMessage>(() => true, "always");
		filter.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				input.value += 10;
				resolve(input);
			}, "add-ten"),
		);

		pipeline.pipe(filter);

		const result = await pipeline.run(new TestMessage(5));

		expect(result.value).toBe(15);
	});

	it("propagates rejections from the inner pipeline", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const error = new Error("inner failure");

		const filter = new PipelineFilter<TestMessage>(() => true, "always");
		filter.pipe(
			new PipelineTask<TestMessage>((_input, _resolve, reject) => {
				reject(error);
			}, "failing"),
		);

		pipeline.pipe(filter);

		await expect(pipeline.run(new TestMessage())).rejects.toMatchObject({
			stageName: "FILTER__always",
			cause: expect.objectContaining({ stageName: "TASK__failing" }),
		});
	});

	it("chains outer and inner stage details for an inner failure", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const cause = new Error("inner failure");
		const filter = new PipelineFilter<TestMessage>(() => true, "always");

		filter.pipe(
			new PipelineTask<TestMessage>((_input, _resolve, reject) => {
				reject(cause);
			}, "failing"),
		);
		pipeline.pipe(filter);

		try {
			await pipeline.run(new TestMessage());
			expect.unreachable("pipeline should reject");
		} catch (error) {
			expect(error).toBeInstanceOf(PipelineExecutionError);
			if (error instanceof PipelineExecutionError) {
				expect(error.stageName).toBe("FILTER__always");
				expect(error.cause).toBeInstanceOf(PipelineExecutionError);
				if (error.cause instanceof PipelineExecutionError) {
					expect(error.cause.stageName).toBe("TASK__failing");
					expect(error.cause.cause).toBe(cause);
				}
			}
		}
	});
});
