export type Status = "idle" | "loading" | "ready" | "error";

export interface ConverterState {
	status: Status;
	output: string;
	/** status が "error" のときの失敗理由。 */
	message: string;
}

export const MAX_LENGTH = 500;

export const remainingChars = (text: string): number =>
	MAX_LENGTH - text.length;

/** 変換ボタンを押せるか。Turnstile のトークンは 1 回の変換で使い切る。 */
export const canConvert = (
	text: string,
	token: string | null,
	status: Status,
): boolean =>
	token !== null &&
	status !== "loading" &&
	text.trim() !== "" &&
	text.length <= MAX_LENGTH;

export interface ConverterOptions {
	convert: (text: string) => Promise<string>;
	onChange: (state: ConverterState) => void;
}

/** 変換の状態遷移を DOM から切り離して持つ。 */
export function createConverter(opts: ConverterOptions) {
	let state: ConverterState = { status: "idle", output: "", message: "" };

	const emit = (next: ConverterState) => {
		state = next;
		opts.onChange(state);
	};

	return {
		async run(text: string): Promise<void> {
			if (state.status === "loading") return;
			emit({ status: "loading", output: "", message: "" });
			try {
				emit({
					status: "ready",
					output: await opts.convert(text),
					message: "",
				});
			} catch (e) {
				emit({
					status: "error",
					output: "",
					message: e instanceof Error ? e.message : String(e),
				});
			}
		},
		getState: () => state,
	};
}
