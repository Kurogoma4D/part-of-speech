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
	it("finds all examples", () => expect(guideExamples).toHaveLength(13));

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
		const raw = JSON.stringify({ tokens: [tok("猫", "名詞")] });
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
		expect(ok([tok("が", null)], "が")).toBe(false);
		expect(ok([tok("猫！", null)], "猫！")).toBe(false);
	});
});
