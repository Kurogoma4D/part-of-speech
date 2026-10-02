import "./styles/tokens.css";
import "./styles/base.css";
import { convertText } from "./api";
import {
	type ConverterState,
	canConvert,
	createConverter,
	MAX_LENGTH,
	remainingChars,
} from "./converter";
import { createCopyButton } from "./copy";
import { bindShareButton } from "./share";
import { appTitle } from "./title";
import { mountTurnstile } from "./turnstile";

document.title = appTitle;

const $ = <T extends HTMLElement>(selector: string): T => {
	const el = document.querySelector<T>(selector);
	if (!el) throw new Error(`missing element: ${selector}`);
	return el;
};
const input = $<HTMLTextAreaElement>("#input");
const count = $<HTMLElement>("#count");
const output = $<HTMLElement>("#output");
const status = $<HTMLElement>("#status");
const convertButton = $<HTMLButtonElement>("#convert");
const retryButton = $<HTMLButtonElement>("#retry");
const copyButton = $<HTMLButtonElement>("#copy");
const share = $<HTMLButtonElement>("#share");
const widget = $<HTMLElement>("#turnstile");

let token: string | null = null;

const statusText = (s: ConverterState): string => {
	if (s.status === "loading") return "変換しています…";
	if (s.status === "error") return s.message;
	return "";
};

const copy = createCopyButton({
	button: copyButton,
	writeText: (text) => navigator.clipboard.writeText(text),
});

let renderShare = (_: ConverterState) => {};

const refresh = () => {
	const s = converter.getState();
	const busy = s.status === "loading";
	convertButton.disabled = !canConvert(input.value, token, s.status);
	retryButton.hidden = s.status !== "error";
	retryButton.disabled = convertButton.disabled;
	input.readOnly = busy;
};

const turnstile = mountTurnstile(widget, (t) => {
	token = t;
	refresh();
});

const converter = createConverter({
	convert: async (text) => {
		const used = token;
		// トークンは 1 回しか使えないので、成否にかかわらず送信後に取り直す。
		token = null;
		try {
			return await convertText(text, used ?? "");
		} finally {
			turnstile.reset();
		}
	},
	onChange: (s) => {
		output.textContent = s.output;
		copy.update(s);
		output.dataset.status = s.status;
		output.setAttribute("aria-busy", String(s.status === "loading"));
		status.textContent = statusText(s);
		status.dataset.status = s.status;
		renderShare(s);
		refresh();
	},
});

renderShare = bindShareButton(share, converter.getState);

const convert = () => {
	if (canConvert(input.value, token, converter.getState().status))
		void converter.run(input.value);
};

input.maxLength = MAX_LENGTH;
const updateCount = () => {
	count.textContent = `残り ${remainingChars(input.value)} 文字`;
	refresh();
};
input.addEventListener("input", updateCount);
input.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		convert();
	}
});
convertButton.addEventListener("click", convert);
retryButton.addEventListener("click", convert);

renderShare(converter.getState());
updateCount();
