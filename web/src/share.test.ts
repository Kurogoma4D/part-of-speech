import { describe, expect, test, vi } from "vitest";
import type { ConverterState } from "./converter";
import {
	bindShareButton,
	buildShareUrl,
	SITE_URL,
	TEXT_BUDGET,
	truncateForPost,
	weightedLength,
} from "./share";

const ready = (output: string): ConverterState => ({
	status: "ready",
	output,
	message: "",
});

describe("weightedLength", () => {
	test("ASCII は 1、日本語は 2", () => {
		expect(weightedLength("ab[")).toBe(3);
		expect(weightedLength("名詞")).toBe(4);
	});
});

describe("truncateForPost", () => {
	test("収まるなら変更しない", () => {
		expect(truncateForPost("[名詞][助詞]")).toBe("[名詞][助詞]");
	});
	test("超える場合は末尾を … で切り詰め、予算内に収まる", () => {
		const out = truncateForPost("名".repeat(500));
		expect(out.endsWith("…")).toBe(true);
		expect(weightedLength(out)).toBeLessThanOrEqual(TEXT_BUDGET);
	});
	test("サロゲートペアを分割しない", () => {
		const out = truncateForPost("😀".repeat(500));
		expect(out).toMatch(/^(?:😀)+…$/u);
	});
});

describe("buildShareUrl", () => {
	test("text と url をエンコードして付与する", () => {
		const u = new URL(buildShareUrl("[名詞] & 改行\nあ"));
		expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
		expect(u.searchParams.get("text")).toBe("[名詞] & 改行\nあ");
		expect(u.searchParams.get("url")).toBe(SITE_URL);
	});
	test("長い結果は切り詰められる", () => {
		const text = new URL(buildShareUrl("名".repeat(500))).searchParams.get(
			"text",
		);
		expect(text?.endsWith("…")).toBe(true);
	});
});

describe("bindShareButton", () => {
	const setup = (state: ConverterState) => {
		let click: () => void = () => {};
		const button = {
			disabled: false,
			addEventListener: (_: "click", l: () => void) => {
				click = l;
			},
		};
		const open = vi.fn();
		const render = bindShareButton(button, () => state, open);
		return { button, open, render, click: () => click() };
	};

	test("結果が空なら disabled", () => {
		const t = setup(ready(""));
		t.render(ready(""));
		expect(t.button.disabled).toBe(true);
	});
	test("読み込み中・エラーでは disabled", () => {
		const t = setup(ready("x"));
		t.render({ status: "loading", output: "", message: "" });
		expect(t.button.disabled).toBe(true);
		t.render({ status: "error", output: "", message: "e" });
		expect(t.button.disabled).toBe(true);
	});
	test("結果があれば有効で、クリックで共有 URL を開く", () => {
		const t = setup(ready("[名詞]"));
		t.render(ready("[名詞]"));
		expect(t.button.disabled).toBe(false);
		t.click();
		expect(t.open).toHaveBeenCalledWith(buildShareUrl("[名詞]"));
	});
	test("空のときクリックしても開かない", () => {
		const t = setup(ready(""));
		t.click();
		expect(t.open).not.toHaveBeenCalled();
	});
});
