import { IBaseMessage } from "../../src/contracts/IBaseMessage.js";

/** Minimal IBaseMessage implementation used across the test suite. */
export class TestMessage implements IBaseMessage {
	private exit = false;
	public trace: string[] = [];
	public value: number;

	constructor(value: number = 0) {
		this.value = value;
	}

	public setExit(value: boolean): void {
		this.exit = value;
	}

	public getExit(): boolean {
		return this.exit;
	}
}
