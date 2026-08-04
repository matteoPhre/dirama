/**
 * Minimal contract required from any message that flows through a pipeline.
 * The engine only needs early-exit control; everything else about the
 * message shape is left entirely to the consumer.
 */
export interface IBaseMessage {
	/** Signal that the pipeline should stop invoking further stages. */
	setExit(value: boolean): void;

	/** Whether the pipeline should stop invoking further stages. */
	getExit(): boolean;
}
