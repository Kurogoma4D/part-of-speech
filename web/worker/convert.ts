/** docs/rewrite-guide.md の出力形式・検証ルール・組み立て規則。 */

export interface Token {
	src: string;
	label: string | null;
}

// label の文字種は response_format では強制されないため、ここで検証する。
const LABEL_PATTERN =
	/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9ー]{1,10}$/u;

// 文脈に沿わない文法ラベル（品詞名・その細分類・活用形・語幹）は不正とする。
const GRAMMAR_LABEL =
	/(?:名詞|動詞|形容詞|副詞|助詞|連体詞|接続詞|語幹|[用然体止定令志]形)$/u;

// ひらがなだけの断片は機能語として原文のまま残せる。
// キーキャップ絵文字(1️⃣ など)は数字を含むが、数字単体は保持対象にしない。
const PRESERVED =
	/^(?:[0-9#*]\ufe0f?\u20e3|[\s\p{P}\p{S}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Script=Hiragana}笑wWｗＷーァィゥェォッャュョヮ]|\u200d|\ufe0f)*$/u;

/** response_format に渡すスキーマ。label の pattern は解釈に依存しないよう含めない。 */
export const RESPONSE_SCHEMA = {
	type: "object",
	required: ["tokens"],
	additionalProperties: false,
	properties: {
		tokens: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				required: ["src", "label"],
				additionalProperties: false,
				properties: {
					src: { type: "string", minLength: 1 },
					label: { type: ["string", "null"] },
				},
			},
		},
	},
} as const;

/** 検証を通ったトークン列を返す。1 つでも満たさなければ null。 */
export function parseTokens(raw: unknown, input: string): Token[] | null {
	let value = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (typeof value !== "object" || value === null) return null;
	const obj = value as Record<string, unknown>;
	const tokens = obj.tokens;
	if (Object.keys(obj).length !== 1 || !Array.isArray(tokens)) return null;
	if (tokens.length === 0) return null;

	const out: Token[] = [];
	for (const t of tokens) {
		if (typeof t !== "object" || t === null) return null;
		const { src, label, ...rest } = t as Record<string, unknown>;
		if (Object.keys(rest).length > 0) return null;
		if (typeof src !== "string" || src === "") return null;
		if (label === null) {
			if (!PRESERVED.test(src)) return null;
		} else {
			if (typeof label !== "string" || !LABEL_PATTERN.test(label)) return null;
			if (label === src || src.trim() === "") return null;
			if (GRAMMAR_LABEL.test(label)) return null;
		}
		out.push({ src, label });
	}
	if (out.map((t) => t.src).join("") !== input) return null;
	return out;
}

export const assemble = (tokens: Token[]): string =>
	tokens.map((t) => (t.label === null ? t.src : `[${t.label}]`)).join("");
