import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assemble, parseTokens } from "./convert";
import { EXAMPLES } from "./prompt";

const guide = readFileSync(
	new URL("../../docs/rewrite-guide.md", import.meta.url),
	"utf8",
);
const guideExamples = [
	...guide.matchAll(/```json example\n([\s\S]*?)```/g),
].map(
	(m) =>
		JSON.parse(m[1] ?? "") as {
			input: string;
			tokens: unknown;
			output: string;
		},
);

describe("guide examples", () => {
	it("finds all examples", () => expect(guideExamples).toHaveLength(14));

	it.each(guideExamples.map((e) => [e.input, e] as const))("%j", (_, e) => {
		const tokens = parseTokens({ tokens: e.tokens }, e.input);
		expect(tokens).not.toBeNull();
		expect(assemble(tokens ?? [])).toBe(e.output);
	});
});

it("few-shot examples are valid", () => {
	for (const e of EXAMPLES)
		expect(
			parseTokens(
				{ tokens: e.tokens.map(([src, label]) => ({ src, label })) },
				e.input,
			),
		).not.toBeNull();
});

describe("parseTokens rejects", () => {
	const ok = (tokens: unknown[], input: string) =>
		parseTokens({ tokens }, input) !== null;
	const tok = (src: string, label: string | null) => ({ src, label });

	it("non JSON and wrong shapes", () => {
		expect(parseTokens("nope", "a")).toBeNull();
		expect(parseTokens({ tokens: [] }, "")).toBeNull();
		expect(parseTokens({ tokens: [tok("猫", "名詞")], x: 1 }, "猫")).toBeNull();
		expect(ok([{ src: "猫", label: "名詞", x: 1 }], "猫")).toBe(false);
		expect(ok([{ src: "猫" }], "猫")).toBe(false);
	});
	it("parses a JSON string", () => {
		const raw = JSON.stringify({ tokens: [tok("猫", "動物")] });
		expect(parseTokens(raw, "猫")).not.toBeNull();
	});
	it("concatenation mismatch", () => {
		expect(ok([tok("猫", "名詞")], "犬")).toBe(false);
		expect(ok([tok("猫", "名詞")], "猫 ")).toBe(false);
	});
	it("invalid labels", () => {
		for (const label of [
			"[名詞]",
			"名 詞",
			"",
			"十文字を超えるとても長いラベル",
			"名詞\n",
		])
			expect(ok([tok("猫", label)], "猫")).toBe(false);
		expect(ok([tok("猫", "猫")], "猫")).toBe(false);
		expect(ok([tok(" ", "空白")], " ")).toBe(false);
	});
	it("null label on content words", () => {
		expect(ok([tok("猫", null)], "猫")).toBe(false);
		expect(ok([tok("猫！", null)], "猫！")).toBe(false);
		expect(ok([tok("ネコ", null)], "ネコ")).toBe(false);
	});
	it("grammar labels", () => {
		for (const label of [
			"名詞",
			"動詞",
			"形容詞",
			"助詞",
			"助動詞",
			"格助詞",
			"終助詞",
			"補助動詞",
			"固有名詞",
			"形容詞語幹",
			"連用形",
			"命令形",
		])
			expect(ok([tok("猫", label)], "猫")).toBe(false);
	});
});

describe("parseTokens accepts", () => {
	it("hiragana function words as null", () => {
		const tokens = [
			{ src: "今日", label: "時間" },
			{ src: "も", label: null },
			{ src: "いい", label: "評価" },
			{ src: "ね", label: null },
			{ src: "ー", label: null },
		];
		expect(parseTokens({ tokens }, "今日もいいねー")).not.toBeNull();
	});
	it("semantic labels that merely resemble grammar words", () => {
		const tokens = [{ src: "歌", label: "歌詞" }];
		expect(parseTokens({ tokens }, "歌")).not.toBeNull();
	});
});
