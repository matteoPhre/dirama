import { describe, it, expect, vi } from "vitest";
import { Pipeline } from "../src/engine/Pipeline.js";
import { PipelineFilter } from "../src/stages/PipelineFilter.js";
import { PipelineTask } from "../src/stages/PipelineTask.js";
import { PipelineAbortError } from "../src/errors/PipelineAbortError.js";
import { PipelineExecutionError } from "../src/errors/PipelineExecutionError.js";
import { TestMessage } from "./helpers/TestMessage.js";

describe("Pipeline cancellation", () => {
	it("passes the run's (not-yet-aborted) signal through to stage invoke/execute callbacks", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const controller = new AbortController();
		let observedSignal: AbortSignal | undefined;
		let wasAbortedDuringExecution = true;

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve, _reject, signal) => {
				observedSignal = signal;
				wasAbortedDuringExecution = signal?.aborted ?? true;
				resolve(input);
			}, "capture-signal"),
		);

		await pipeline.run(new TestMessage(), { signal: controller.signal });

		expect(observedSignal).toBeInstanceOf(AbortSignal);
		expect(wasAbortedDuringExecution).toBe(false);
	});

	it("rejects with a PipelineAbortError when the external signal is already aborted", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const controller = new AbortController();
		controller.abort();
		let ran = false;
		const message = new TestMessage();

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				ran = true;
				resolve(input);
			}, "should-not-run"),
		);

		await expect(pipeline.run(message, { signal: controller.signal })).rejects.toBeInstanceOf(
			PipelineAbortError,
		);
		await expect(pipeline.run(message, { signal: controller.signal })).rejects.toBeInstanceOf(
			PipelineExecutionError,
		);
		await expect(pipeline.run(message, { signal: controller.signal })).rejects.toMatchObject({
			pipelineMessage: message,
			stageName: undefined,
		});
		expect(ran).toBe(false);
	});

	it("emits an abort debug record without a pipeline end record", async () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const pipeline = new Pipeline<TestMessage>({ debug: true });
		const controller = new AbortController();
		controller.abort();

		try {
			await expect(pipeline.run(new TestMessage(), { signal: controller.signal })).rejects.toBeInstanceOf(
				PipelineAbortError,
			);

			const labels = debugSpy.mock.calls.map(([label]) => label);
			expect(labels).toContain("[dirama] pipeline:abort");
			expect(labels).not.toContain("[dirama] pipeline:end");
		} finally {
			debugSpy.mockRestore();
		}
	});

	it("allows PipelineAbortError without a pipeline message", () => {
		const error = new PipelineAbortError<TestMessage>();

		expect(error.pipelineMessage).toBeUndefined();
		expect(error).toBeInstanceOf(PipelineExecutionError);
	});

	it("stops running further stages once the external signal aborts mid-run", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const controller = new AbortController();
		const order: string[] = [];

		pipeline
			.pipe(
				new PipelineTask<TestMessage>((input, resolve) => {
					order.push("first");
					controller.abort();
					resolve(input);
				}, "first"),
			)
			.pipe(
				new PipelineTask<TestMessage>((input, resolve) => {
					order.push("second");
					resolve(input);
				}, "second"),
			);

		await expect(pipeline.run(new TestMessage(), { signal: controller.signal })).rejects.toBeInstanceOf(
			PipelineAbortError,
		);
		expect(order).toEqual(["first"]);
	});

	it("rejects with the custom abort reason when the external signal provides one", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const controller = new AbortController();
		const reason = new Error("custom cancellation reason");
		controller.abort(reason);

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				resolve(input);
			}, "unreachable"),
		);

		await expect(pipeline.run(new TestMessage(), { signal: controller.signal })).rejects.toMatchObject({
			cause: reason,
		});
	});

	it("aborts its internal signal automatically once the run resolves successfully", async () => {
		const pipeline = new Pipeline<TestMessage>();
		let capturedSignal: AbortSignal | undefined;
		let wasAbortedDuringExecution = true;

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve, _reject, signal) => {
				capturedSignal = signal;
				wasAbortedDuringExecution = signal?.aborted ?? true;
				resolve(input);
			}, "capture"),
		);

		await pipeline.run(new TestMessage());

		expect(wasAbortedDuringExecution).toBe(false);
		expect(capturedSignal?.aborted).toBe(true);
	});

	it("aborts its internal signal automatically once the run fails", async () => {
		const pipeline = new Pipeline<TestMessage>();
		let capturedSignal: AbortSignal | undefined;

		pipeline.pipe(
			new PipelineTask<TestMessage>((_input, _resolve, reject, signal) => {
				capturedSignal = signal;
				reject(new Error("boom"));
			}, "failing"),
		);

		await expect(pipeline.run(new TestMessage())).rejects.toMatchObject({
			cause: expect.objectContaining({ message: "boom" }),
		});
		expect(capturedSignal?.aborted).toBe(true);
	});

	it("propagates the signal through a PipelineFilter's inner sub-pipeline", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const controller = new AbortController();
		let innerSignal: AbortSignal | undefined;

		const filter = new PipelineFilter<TestMessage>(() => true, "always");
		let wasAbortedDuringExecution = true;
		filter.pipe(
			new PipelineTask<TestMessage>((input, resolve, _reject, signal) => {
				innerSignal = signal;
				wasAbortedDuringExecution = signal?.aborted ?? true;
				resolve(input);
			}, "inner"),
		);

		pipeline.pipe(filter);

		await pipeline.run(new TestMessage(), { signal: controller.signal });

		expect(innerSignal).toBeInstanceOf(AbortSignal);
		expect(wasAbortedDuringExecution).toBe(false);
	});
});
