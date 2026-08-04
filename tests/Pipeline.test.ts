import { describe, it, expect } from "vitest";
import { Pipeline } from "../src/engine/Pipeline.js";
import { PipelineTask } from "../src/stages/PipelineTask.js";
import { TestMessage } from "./helpers/TestMessage.js";

describe("Pipeline", () => {
	it("runs stages in order", async () => {
		const order: string[] = [];
		const pipeline = new Pipeline<TestMessage>();

		pipeline.pipes([
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("a");
				resolve(input);
			}, "a"),
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("b");
				resolve(input);
			}, "b"),
		]);

		await pipeline.run(new TestMessage());

		expect(order).toEqual(["a", "b"]);
	});

	it("passes the (possibly mutated) message through every stage", async () => {
		const pipeline = new Pipeline<TestMessage>();

		pipeline
			.pipe(
				new PipelineTask<TestMessage>((input, resolve) => {
					input.value += 1;
					resolve(input);
				}, "increment"),
			)
			.pipe(
				new PipelineTask<TestMessage>((input, resolve) => {
					input.value *= 2;
					resolve(input);
				}, "double"),
			);

		const result = await pipeline.run(new TestMessage(1));

		expect(result.value).toBe(4);
	});

	it("stops early when a stage sets the exit flag", async () => {
		const order: string[] = [];
		const pipeline = new Pipeline<TestMessage>();

		pipeline.pipes([
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("a");
				input.setExit(true);
				resolve(input);
			}, "a"),
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("b");
				resolve(input);
			}, "b"),
		]);

		await pipeline.run(new TestMessage());

		expect(order).toEqual(["a"]);
	});

	it("resets the exit flag between runs", async () => {
		const order: string[] = [];
		const pipeline = new Pipeline<TestMessage>();
		const message = new TestMessage();
		message.setExit(true);

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("a");
				resolve(input);
			}, "a"),
		);

		await pipeline.run(message);

		expect(order).toEqual(["a"]);
	});

	it("rejects the run when a stage rejects", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const error = new Error("boom");

		pipeline.pipe(
			new PipelineTask<TestMessage>((_input, _resolve, reject) => {
				reject(error);
			}, "failing"),
		);

		await expect(pipeline.run(new TestMessage())).rejects.toThrow("boom");
	});

	it("invokes hooks for stage start/end and errors", async () => {
		const events: string[] = [];
		const pipeline = new Pipeline<TestMessage>({
			onStageStart: (stage) => events.push(`start:${stage.name}`),
			onStageEnd: (stage) => events.push(`end:${stage.name}`),
			onError: (stage) => events.push(`error:${stage?.name}`),
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				resolve(input);
			}, "ok"),
		);

		await pipeline.run(new TestMessage());

		expect(events).toEqual(["start:TASK__ok", "end:TASK__ok"]);
	});

	it("exposes current stage/index while running and resets after", async () => {
		const pipeline = new Pipeline<TestMessage>();

		expect(pipeline.getCurrent()).toBe(-1);
		expect(pipeline.getCurrentStage()).toBeNull();

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				resolve(input);
			}, "only"),
		);

		await pipeline.run(new TestMessage());

		expect(pipeline.getCurrent()).toBe(1);
		expect(pipeline.getCurrentStage()).toBeNull();
	});
});
