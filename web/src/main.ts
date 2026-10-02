import "./styles/tokens.css";
import "./styles/base.css";
import { type ConverterState, createConverter } from "./converter";
import { loadEngine } from "./engine";
import { appTitle } from "./title";

document.title = appTitle;

const input = document.querySelector<HTMLTextAreaElement>("#input");
const output = document.querySelector<HTMLElement>("#output");
const status = document.querySelector<HTMLElement>("#status");
if (!input || !output || !status) throw new Error("missing converter elements");

const statusText = (s: ConverterState): string => {
	if (s.status === "loading")
		return "辞書を読み込み中です（初回のみ時間がかかります）…";
	if (s.status === "error")
		return `変換エンジンの読み込みに失敗しました。ページを再読み込みしてください。(${s.message})`;
	return s.message ? `変換に失敗しました: ${s.message}` : "";
};

const converter = createConverter({
	load: loadEngine,
	onChange: (s) => {
		output.textContent = s.output;
		output.dataset.status = s.status;
		output.setAttribute("aria-busy", String(s.status === "loading"));
		status.textContent = statusText(s);
		status.dataset.status =
			s.message || s.status === "error" ? "error" : s.status;
	},
});

input.addEventListener("input", () => converter.setInput(input.value));
// ブラウザのフォーム復元などで読み込み時点に値が入っている場合も変換対象にする。
converter.setInput(input.value);
