import { describe, it, expect, vi } from "vitest";
import { Pipeline } from "../src/engine/Pipeline.js";
import { PipelineTask } from "../src/stages/PipelineTask.js";
import { TestMessage } from "./helpers/TestMessage.js";
import { PipelineExecutionError } from "../src/errors/PipelineExecutionError.js";

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

		await expect(pipeline.run(new TestMessage())).rejects.toMatchObject({ cause: error });
	});

	it("wraps a stage failure with execution details", async () => {
		const pipeline = new Pipeline<TestMessage>();
		const cause = new Error("boom");
		const message = new TestMessage(3);

		pipeline.pipe(
			new PipelineTask<TestMessage>((_input, _resolve, reject) => {
				reject(cause);
			}, "failing"),
		);

		await expect(pipeline.run(message)).rejects.toMatchObject({
			name: "PipelineExecutionError",
			message: 'Pipeline execution failed at stage "TASK__failing"',
			stageName: "TASK__failing",
			pipelineMessage: message,
			cause,
		});
		await expect(pipeline.run(message)).rejects.toBeInstanceOf(PipelineExecutionError);
	});

	it("passes a structured execution error to the error hook", async () => {
		const cause = new Error("boom");
		let observedError: unknown;
		const pipeline = new Pipeline<TestMessage>({
			onError: (_stage, error) => {
				observedError = error;
			},
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((_input, _resolve, reject) => {
				reject(cause);
			}, "failing"),
		);

		await expect(pipeline.run(new TestMessage())).rejects.toBeInstanceOf(PipelineExecutionError);
		expect(observedError).toMatchObject({
			stageName: "TASK__failing",
			cause,
		});
	});

	it("emits debug lifecycle records only when debug is enabled", async () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const pipeline = new Pipeline<TestMessage>({ debug: true });
		const message = new TestMessage(3);

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				resolve(input);
			}, "ok"),
		);

		try {
			await pipeline.run(message);

			expect(debugSpy).toHaveBeenCalledWith(
				"[dirama] pipeline:start",
				expect.objectContaining({ durationMs: 0, message }),
			);
			expect(debugSpy).toHaveBeenCalledWith(
				"[dirama] stage:start",
				expect.objectContaining({ stageName: "TASK__ok", durationMs: 0, message }),
			);
			expect(debugSpy).toHaveBeenCalledWith(
				"[dirama] stage:end",
				expect.objectContaining({ stageName: "TASK__ok", durationMs: expect.any(Number) }),
			);
			expect(debugSpy).toHaveBeenCalledWith(
				"[dirama] pipeline:end",
				expect.objectContaining({ durationMs: expect.any(Number), message }),
			);
		} finally {
			debugSpy.mockRestore();
		}
	});

	it("does not emit debug records by default", async () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const pipeline = new Pipeline<TestMessage>();

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				resolve(input);
			}, "ok"),
		);

		try {
			await pipeline.run(new TestMessage());

			expect(debugSpy).not.toHaveBeenCalled();
		} finally {
			debugSpy.mockRestore();
		}
	});

	it("emits early exit and pipeline end debug records", async () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const pipeline = new Pipeline<TestMessage>({ debug: true });

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				input.setExit(true);
				resolve(input);
			}, "exit"),
		);

		try {
			await pipeline.run(new TestMessage());

			const labels = debugSpy.mock.calls.map(([label]) => label);
			expect(labels).toContain("[dirama] pipeline:early-exit");
			expect(labels).toContain("[dirama] pipeline:end");
			expect(labels.indexOf("[dirama] pipeline:early-exit")).toBeLessThan(
				labels.indexOf("[dirama] pipeline:end"),
			);
		} finally {
			debugSpy.mockRestore();
		}
	});

	it("continues debug logging when a user hook throws", async () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const pipeline = new Pipeline<TestMessage>({
			debug: true,
			onStageStart: () => {
				throw new Error("hook failure");
			},
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				input.value += 1;
				resolve(input);
			}, "increment"),
		);

		try {
			const result = await pipeline.run(new TestMessage());

			expect(result.value).toBe(1);
			expect(debugSpy).toHaveBeenCalledWith(
				"[dirama] stage:start",
				expect.objectContaining({ stageName: "TASK__increment" }),
			);
		} finally {
			debugSpy.mockRestore();
		}
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

	it("invokes pipeline lifecycle hooks around stage hooks", async () => {
		const events: string[] = [];
		const pipeline = new Pipeline<TestMessage>({
			onPipelineStart: () => events.push("pipeline:start"),
			onStageStart: (stage) => events.push(`stage:start:${stage.name}`),
			onStageEnd: (stage) => events.push(`stage:end:${stage.name}`),
			onPipelineEnd: () => events.push("pipeline:end"),
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				resolve(input);
			}, "ok"),
		);

		await pipeline.run(new TestMessage());

		expect(events).toEqual([
			"pipeline:start",
			"stage:start:TASK__ok",
			"stage:end:TASK__ok",
			"pipeline:end",
		]);
	});

	it("continues execution when a lifecycle hook throws", async () => {
		const hookError = new Error("hook failure");
		const reportedErrors: unknown[] = [];
		const pipeline = new Pipeline<TestMessage>({
			onStageStart: () => {
				throw hookError;
			},
			onError: (_stage, error) => reportedErrors.push(error),
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				input.value += 1;
				resolve(input);
			}, "increment"),
		);

		const result = await pipeline.run(new TestMessage());

		expect(result.value).toBe(1);
		expect(reportedErrors).toEqual([hookError]);
	});

	it("continues when pipeline boundary and stage end hooks throw", async () => {
		const startError = new Error("pipeline start failure");
		const endError = new Error("stage end failure");
		const pipelineEndError = new Error("pipeline end failure");
		const reportedErrors: unknown[] = [];
		const pipeline = new Pipeline<TestMessage>({
			onPipelineStart: () => {
				throw startError;
			},
			onStageEnd: () => {
				throw endError;
			},
			onPipelineEnd: () => {
				throw pipelineEndError;
			},
			onError: (_stage, error) => reportedErrors.push(error),
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				input.value += 1;
				resolve(input);
			}, "increment"),
		);

		const result = await pipeline.run(new TestMessage());

		expect(result.value).toBe(1);
		expect(reportedErrors).toEqual([startError, endError, pipelineEndError]);
	});

	it("invokes lifecycle hooks for an empty pipeline", async () => {
		const events: string[] = [];
		const pipeline = new Pipeline<TestMessage>({
			onPipelineStart: () => events.push("start"),
			onPipelineEnd: () => events.push("end"),
		});

		await pipeline.run(new TestMessage());

		expect(events).toEqual(["start", "end"]);
	});

	it("invokes pipeline end after an early exit", async () => {
		const events: string[] = [];
		const pipeline = new Pipeline<TestMessage>({
			onPipelineEnd: () => events.push("end"),
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((input, resolve) => {
				input.setExit(true);
				resolve(input);
			}, "exit"),
		);

		await pipeline.run(new TestMessage());

		expect(events).toEqual(["end"]);
	});

	it("does not invoke pipeline end when a stage rejects", async () => {
		const events: string[] = [];
		const pipeline = new Pipeline<TestMessage>({
			onPipelineEnd: () => events.push("end"),
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((_input, _resolve, reject) => {
				reject(new Error("boom"));
			}, "failing"),
		);

		await expect(pipeline.run(new TestMessage())).rejects.toMatchObject({
			cause: expect.any(Error),
		});

		expect(events).toEqual([]);
	});

	it("swallows errors thrown by the error hook", async () => {
		const pipeline = new Pipeline<TestMessage>({
			onError: () => {
				throw new Error("error hook failure");
			},
		});

		pipeline.pipe(
			new PipelineTask<TestMessage>((_input, _resolve, reject) => {
				reject(new Error("stage failure"));
			}, "failing"),
		);

		await expect(pipeline.run(new TestMessage())).rejects.toMatchObject({
			cause: expect.objectContaining({ message: "stage failure" }),
		});
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
