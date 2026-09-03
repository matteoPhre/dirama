import { describe, it, expect } from "vitest";
import { Pipeline } from "../src/engine/Pipeline.js";
import { BasePipelineStage } from "../src/stages/BasePipelineStage.js";
import { BaseConditionalPipelineStage } from "../src/stages/BaseConditionalPipelineStage.js";
import { IMatchCallback } from "../src/contracts/IMatchCallback.js";
import { TestMessage } from "./helpers/TestMessage.js";

class IncrementStage extends BasePipelineStage<TestMessage> {
	protected async executePipelineStep(
		message: TestMessage,
		resolve: (output?: TestMessage | PromiseLike<TestMessage>) => void,
	): Promise<void> {
		message.value += 1;
		resolve(message);
	}
}

class ConditionalDoubleStage extends BaseConditionalPipelineStage<TestMessage> {
	protected matchCallback: IMatchCallback<TestMessage> = (input) => input.value > 0;

	protected async executePipelineStep(
		message: TestMessage,
		resolve: (output?: TestMessage | PromiseLike<TestMessage>) => void,
	): Promise<void> {
		message.value *= 2;
		resolve(message);
	}
}

class FailingStage extends BasePipelineStage<TestMessage> {
	protected async executePipelineStep(
		_message: TestMessage,
		_resolve: (output?: TestMessage | PromiseLike<TestMessage>) => void,
		reject: (reason: unknown) => void,
	): Promise<void> {
		reject(new Error("step failure"));
	}
}

class FailingConditionalStage extends BaseConditionalPipelineStage<TestMessage> {
	protected matchCallback: IMatchCallback<TestMessage> = () => true;

	protected async executePipelineStep(
		_message: TestMessage,
		_resolve: (output?: TestMessage | PromiseLike<TestMessage>) => void,
		reject: (reason: unknown) => void,
	): Promise<void> {
		reject(new Error("conditional step failure"));
	}
}

describe("BasePipelineStage", () => {
	it("wraps executePipelineStep into a runnable PipelineTask", async () => {
		const pipeline = new Pipeline<TestMessage>();
		pipeline.pipe(new IncrementStage().getPipelineTask("increment"));

		const result = await pipeline.run(new TestMessage(1));

		expect(result.value).toBe(2);
	});

	it("propagates a rejection raised inside executePipelineStep", async () => {
		const pipeline = new Pipeline<TestMessage>();
		pipeline.pipe(new FailingStage().getPipelineTask("failing"));

		await expect(pipeline.run(new TestMessage())).rejects.toMatchObject({
			stageName: "TASK__failing",
			cause: expect.objectContaining({ message: "step failure" }),
		});
	});
});

describe("BaseConditionalPipelineStage", () => {
	it("runs the step when the predicate matches", async () => {
		const pipeline = new Pipeline<TestMessage>();
		pipeline.pipe(new ConditionalDoubleStage().getPipelineFilter("double"));

		const result = await pipeline.run(new TestMessage(3));

		expect(result.value).toBe(6);
	});

	it("skips the step when the predicate does not match", async () => {
		const pipeline = new Pipeline<TestMessage>();
		pipeline.pipe(new ConditionalDoubleStage().getPipelineFilter("double"));

		const result = await pipeline.run(new TestMessage(-3));

		expect(result.value).toBe(-3);
	});

	it("propagates a rejection raised inside a matching conditional step", async () => {
		const pipeline = new Pipeline<TestMessage>();
		pipeline.pipe(new FailingConditionalStage().getPipelineFilter("failing"));

		await expect(pipeline.run(new TestMessage(1))).rejects.toMatchObject({
			stageName: "FILTER__failing",
			cause: expect.objectContaining({
				stageName: "TASK__failing",
				cause: expect.objectContaining({ message: "conditional step failure" }),
			}),
		});
	});
});
