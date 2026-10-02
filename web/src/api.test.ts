import { describe, expect, it, vi } from "vitest";
import { convertText } from "./api";

const respond = (body: unknown, status = 200) =>
	vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;

describe("convertText", () => {
	it("posts text and token, returns result", async () => {
		const f = respond({ result: "[名詞]" });
		expect(await convertText("猫", "tok", f)).toBe("[名詞]");
		const [url, init] = vi.mocked(f).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/convert");
		expect(JSON.parse(init.body as string)).toEqual({
			text: "猫",
			turnstileToken: "tok",
		});
	});

	it("surfaces the server error message", async () => {
		await expect(
			convertText("猫", "t", respond({ error: "だめ" }, 502)),
		).rejects.toThrow("だめ");
	});

	it("falls back to the status for non-JSON failures", async () => {
		const f = vi.fn(
			async () => new Response("oops", { status: 500 }),
		) as unknown as typeof fetch;
		await expect(convertText("猫", "t", f)).rejects.toThrow("500");
	});

	it("reports network failures", async () => {
		const f = vi.fn(async () => {
			throw new TypeError("fail");
		}) as unknown as typeof fetch;
		await expect(convertText("猫", "t", f)).rejects.toThrow("通信に失敗");
	});
});
