import "./styles/tokens.css";
import "./styles/base.css";
import { type ConverterState, createConverter } from "./converter";
import { createCopyButton } from "./copy";
import { loadEngine } from "./engine";
import { bindShareButton } from "./share";
import { formatProgress, type Progress } from "./progress";
import { appTitle } from "./title";

document.title = appTitle;

const input = document.querySelector<HTMLTextAreaElement>("#input");
const output = document.querySelector<HTMLElement>("#output");
const status = document.querySelector<HTMLElement>("#status");
const copyButton = document.querySelector<HTMLButtonElement>("#copy");
const share = document.querySelector<HTMLButtonElement>("#share");
if (!input || !output || !status || !copyButton || !share)
	throw new Error("missing converter elements");

let progress: Progress = { loaded: 0, total: 0 };

const statusText = (s: ConverterState): string => {
	if (s.status === "loading") return formatProgress(progress);
	if (s.status === "error")
		return `変換エンジンの読み込みに失敗しました。ページを再読み込みしてください。(${s.message})`;
	return s.message ? `変換に失敗しました: ${s.message}` : "";
};

let renderShare = (_: ConverterState) => {};

const copy = createCopyButton({
	button: copyButton,
	writeText: (text) => navigator.clipboard.writeText(text),
});

const converter = createConverter({
	load: () =>
		loadEngine((p) => {
			progress = p;
			if (converter.getState().status === "loading")
				status.textContent = statusText(converter.getState());
		}),
	onChange: (s) => {
		output.textContent = s.output;
		copy.update(s);
		output.dataset.status = s.status;
		output.setAttribute("aria-busy", String(s.status === "loading"));
		status.textContent = statusText(s);
		status.dataset.status =
			s.message || s.status === "error" ? "error" : s.status;
		renderShare(s);
	},
});

renderShare = bindShareButton(share, converter.getState);
renderShare(converter.getState());

input.addEventListener("input", () => converter.setInput(input.value));
// ブラウザのフォーム復元などで読み込み時点に値が入っている場合も変換対象にする。
converter.setInput(input.value);
