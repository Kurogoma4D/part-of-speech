import type { ConverterState } from "./converter";

export const COPY_LABEL = "コピー";
export const COPIED_LABEL = "コピーしました";
export const COPY_FAILED_LABEL = "コピーに失敗しました";
export const FEEDBACK_MS = 2000;

/** DOM の HTMLButtonElement のうち使う部分だけ。テストで差し替えやすくするため。 */
export interface CopyButtonElement {
	disabled: boolean;
	textContent: string | null;
	addEventListener(type: "click", listener: () => void): void;
}

export interface CopyButtonOptions {
	button: CopyButtonElement;
	writeText: (text: string) => Promise<void>;
	feedbackMs?: number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (id: unknown) => void;
}

/** 変換結果をコピーするボタンの挙動。状態は ConverterState から受け取り DOM は読まない。 */
export function createCopyButton(opts: CopyButtonOptions) {
	const { button, writeText } = opts;
	const feedbackMs = opts.feedbackMs ?? FEEDBACK_MS;
	const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer =
		opts.clearTimer ??
		((id) => clearTimeout(id as ReturnType<typeof setTimeout>));

	let output = "";
	let timer: unknown = null;

	const resetLabel = () => {
		timer = null;
		button.textContent = COPY_LABEL;
	};

	const showFeedback = (label: string) => {
		if (timer !== null) clearTimer(timer);
		button.textContent = label;
		timer = setTimer(resetLabel, feedbackMs);
	};

	const copy = async () => {
		if (output === "") return;
		try {
			await writeText(output);
			showFeedback(COPIED_LABEL);
		} catch {
			showFeedback(COPY_FAILED_LABEL);
		}
	};

	button.addEventListener("click", () => {
		void copy();
	});

	const update = (state: ConverterState) => {
		output = state.output;
		button.disabled = output === "";
	};

	button.textContent = COPY_LABEL;
	button.disabled = true;

	return { update, copy };
}
