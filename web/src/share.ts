import type { ConverterState } from "./converter";

export const SITE_URL = "https://part-of-speech.kurogoma4d.workers.dev/";

// X のドキュメント（docs.x.com）に到達できなかったため、twitter-text の公開仕様に基づく保守的な値。
// 投稿は重み付け 280、URL は t.co 短縮で 23 固定、日本語など CJK は 1 文字 2 として数える。
const MAX_WEIGHT = 280;
const URL_WEIGHT = 23;
// text と url の区切りとして X が挿入する空白 1 つ分。
const SEPARATOR_WEIGHT = 1;
export const TEXT_BUDGET = MAX_WEIGHT - URL_WEIGHT - SEPARATOR_WEIGHT;

const ELLIPSIS = "…";

// twitter-text の weight 1 の範囲（ラテン文字・一般句読点など）。それ以外は 2。
const isLightWeight = (cp: number): boolean =>
	cp <= 0x10ff ||
	(cp >= 0x2000 && cp <= 0x200d) ||
	(cp >= 0x2010 && cp <= 0x201f) ||
	(cp >= 0x2032 && cp <= 0x2037);

const charWeight = (ch: string): number =>
	isLightWeight(ch.codePointAt(0) ?? 0) ? 1 : 2;

export function weightedLength(text: string): number {
	let total = 0;
	for (const ch of text) total += charWeight(ch);
	return total;
}

/** 重み付けで budget に収まるよう、超える場合のみ末尾を `…` で切り詰める。 */
export function truncateForPost(text: string, budget = TEXT_BUDGET): string {
	if (weightedLength(text) <= budget) return text;
	const limit = budget - charWeight(ELLIPSIS);
	let used = 0;
	let out = "";
	for (const ch of text) {
		const w = charWeight(ch);
		if (used + w > limit) break;
		used += w;
		out += ch;
	}
	return out + ELLIPSIS;
}

export function buildShareUrl(text: string, url = SITE_URL): string {
	const params = new URLSearchParams({ text: truncateForPost(text), url });
	return `https://x.com/intent/post?${params.toString()}`;
}

/** 結果が空（空白のみを含む）のときは共有できない。 */
export const canShare = (s: ConverterState): boolean =>
	s.status === "ready" && s.output.trim() !== "";

export interface ShareButton {
	disabled: boolean;
	addEventListener(type: "click", listener: () => void): void;
}

export function bindShareButton(
	button: ShareButton,
	getState: () => ConverterState,
	open: (url: string) => void = (u) => {
		window.open(u, "_blank", "noopener,noreferrer");
	},
) {
	button.addEventListener("click", () => {
		const s = getState();
		if (canShare(s)) open(buildShareUrl(s.output));
	});
	return (s: ConverterState) => {
		button.disabled = !canShare(s);
	};
}
