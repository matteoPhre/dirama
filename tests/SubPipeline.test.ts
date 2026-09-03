import { describe, it, expect } from "vitest";
import { SubPipeline } from "../src/engine/SubPipeline.js";
import { PipelineTask } from "../src/stages/PipelineTask.js";
import { PipelineExecutionError } from "../src/errors/PipelineExecutionError.js";
import { TestMessage } from "./helpers/TestMessage.js";

describe("SubPipeline", () => {
	it("resolves with the input when no parentNext callback is set", async () => {
		const subPipeline = new SubPipeline<TestMessage>();
		subPipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				input.value += 1;
				resolve(input);
			}, "increment"),
		);

		const result = await subPipeline.run(new TestMessage(1));

		expect(result.value).toBe(2);
	});

	it("hands control back to the parent's next callback once it completes", async () => {
		const order: string[] = [];
		const subPipeline = new SubPipeline<TestMessage>();

		subPipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				order.push("sub");
				resolve(input);
			}, "sub-task"),
		);

		subPipeline.setParentNext((input) => {
			order.push("parent-next");
			return Promise.resolve(input);
		});

		const result = await subPipeline.run(new TestMessage(5));

		expect(order).toEqual(["sub", "parent-next"]);
		expect(result.value).toBe(5);
	});

	it("propagates a rejection coming from the parent's next callback", async () => {
		const subPipeline = new SubPipeline<TestMessage>();
		const error = new Error("parent failure");

		subPipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				resolve(input);
			}, "sub-task"),
		);

		subPipeline.setParentNext(() => Promise.reject(error));

		await expect(subPipeline.run(new TestMessage())).rejects.toMatchObject({
			name: "PipelineExecutionError",
			stageName: "TASK__sub-task",
			cause: expect.objectContaining({
				stageName: undefined,
				cause: error,
			}),
		});
		await expect(subPipeline.run(new TestMessage())).rejects.toBeInstanceOf(PipelineExecutionError);
	});
});
