export type Status = "loading" | "ready" | "error";

export interface ConverterState {
	status: Status;
	output: string;
	/** 変換自体が失敗したときのメッセージ。wasm 読み込み失敗は status: "error" で表す。 */
	message: string;
}

export interface Engine {
	convert(input: string): string;
}

export interface ConverterOptions {
	load: () => Promise<Engine>;
	onChange: (state: ConverterState) => void;
	debounceMs?: number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (id: unknown) => void;
}

export const DEFAULT_DEBOUNCE_MS = 150;

/** debounce・読み込み状態・変換を DOM から切り離して持つ。 */
export function createConverter(opts: ConverterOptions) {
	const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer =
		opts.clearTimer ??
		((id) => clearTimeout(id as ReturnType<typeof setTimeout>));

	let state: ConverterState = { status: "loading", output: "", message: "" };
	let engine: Engine | null = null;
	let input = "";
	let timer: unknown = null;

	const emit = (next: ConverterState) => {
		state = next;
		opts.onChange(state);
	};

	const run = () => {
		timer = null;
		if (!engine) return;
		try {
			emit({ status: "ready", output: engine.convert(input), message: "" });
		} catch (e) {
			emit({
				status: "ready",
				output: "",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	};

	const cancel = () => {
		if (timer !== null) {
			clearTimer(timer);
			timer = null;
		}
	};

	opts.onChange(state);
	const ready = opts.load().then(
		(e) => {
			engine = e;
			// 読み込み中に入力済みのテキストは debounce を待たず変換する。
			cancel();
			run();
		},
		(e: unknown) => {
			emit({
				status: "error",
				output: "",
				message: e instanceof Error ? e.message : String(e),
			});
		},
	);

	return {
		ready,
		setInput(value: string) {
			input = value;
			if (!engine) return;
			cancel();
			timer = setTimer(run, debounceMs);
		},
		getState: () => state,
	};
}
