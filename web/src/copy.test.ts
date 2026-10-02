import { describe, expect, it, vi } from "vitest";
import type { ConverterState } from "./converter";
import {
	COPIED_LABEL,
	COPY_FAILED_LABEL,
	COPY_LABEL,
	type CopyButtonElement,
	createCopyButton,
} from "./copy";

const state = (output: string): ConverterState => ({
	status: "ready",
	output,
	message: "",
});

function setup(writeText: (t: string) => Promise<void>) {
	let click: () => void = () => {};
	const button: CopyButtonElement = {
		disabled: false,
		textContent: null,
		addEventListener: (_t, l) => {
			click = l;
		},
	};
	let pending: (() => void) | null = null;
	const copy = createCopyButton({
		button,
		writeText,
		setTimer: (fn) => {
			pending = fn;
			return 1;
		},
		clearTimer: () => {
			pending = null;
		},
	});
	return { button, copy, click: () => click(), fire: () => pending?.() };
}

describe("createCopyButton", () => {
	it("結果が空のあいだは disabled、結果があれば有効になる", () => {
		const { button, copy } = setup(async () => {});
		expect(button.disabled).toBe(true);
		copy.update(state("[名詞]"));
		expect(button.disabled).toBe(false);
		copy.update(state(""));
		expect(button.disabled).toBe(true);
	});

	it("押下で結果を書き込み、完了表示のあと元のラベルへ戻る", async () => {
		const writeText = vi.fn(async () => {});
		const { button, copy, click, fire } = setup(writeText);
		copy.update(state("[名詞][助詞]"));
		click();
		await vi.waitFor(() => expect(button.textContent).toBe(COPIED_LABEL));
		expect(writeText).toHaveBeenCalledWith("[名詞][助詞]");
		fire();
		expect(button.textContent).toBe(COPY_LABEL);
	});

	it("書き込みに失敗したら失敗を表示する", async () => {
		const { button, copy, click } = setup(async () => {
			throw new Error("denied");
		});
		copy.update(state("x"));
		click();
		await vi.waitFor(() => expect(button.textContent).toBe(COPY_FAILED_LABEL));
	});

	it("結果が空なら書き込まない", async () => {
		const writeText = vi.fn(async () => {});
		const { copy } = setup(writeText);
		await copy.copy();
		expect(writeText).not.toHaveBeenCalled();
	});
});
