import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

const ORIGIN = "https://part-of-speech.example.workers.dev";
const good = JSON.stringify({
	tokens: [
		{ src: "猫", label: "動物" },
		{ src: "！", label: null },
	],
});
const bad = JSON.stringify({ tokens: [{ src: "犬", label: "動物" }] });

function setup(
	responses: unknown[] = [good],
	turnstile: Record<string, unknown> = {
		success: true,
		hostname: new URL(ORIGIN).hostname,
	},
) {
	const run = vi.fn();
	for (const response of responses) run.mockResolvedValueOnce({ response });
	const siteverify = vi.fn(async () => Response.json(turnstile));
	vi.stubGlobal("fetch", siteverify);
	const env: Env = { AI: { run }, MODEL: "m", TURNSTILE_SECRET_KEY: "secret" };
	const call = (
		body: unknown,
		{
			origin = ORIGIN,
			method = "POST",
			base = ORIGIN,
		}: { origin?: string | null; method?: string; base?: string } = {},
	) =>
		worker.fetch(
			new Request(`${base}/api/convert`, {
				method,
				headers: origin ? { origin } : {},
				body: typeof body === "string" ? body : JSON.stringify(body),
			}),
			env,
		);
	return { run, siteverify, call };
}

const req = { text: "猫！", turnstileToken: "t" };

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/convert", () => {
	it("200 with assembled result", async () => {
		const { call, run, siteverify } = setup();
		const res = await call(req);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ result: "[動物]！" });
		expect(run).toHaveBeenCalledWith(
			"m",
			expect.objectContaining({ max_tokens: 2048 }),
		);
		const form = (
			siteverify.mock.calls[0] as unknown as [string, RequestInit]
		)[1].body as URLSearchParams;
		expect(form.get("secret")).toBe("secret");
		expect(form.get("response")).toBe("t");
		expect(
			(siteverify.mock.calls[0] as unknown as [string, RequestInit])[1].signal,
		).toBeInstanceOf(AbortSignal);
	});

	it("accepts an already parsed response object", async () => {
		const { call } = setup([JSON.parse(good)]);
		expect(await (await call(req)).json()).toEqual({ result: "[動物]！" });
	});

	it("reads OpenAI-style choices and keeps surrounding whitespace", async () => {
		const { call, run } = setup([]);
		run.mockResolvedValueOnce({ choices: [{ message: { content: good } }] });
		const res = await call({ ...req, text: "\n 猫！\n" });
		expect(await res.json()).toEqual({ result: "\n [動物]！\n" });
	});

	it("infers each line separately and keeps newlines and blank lines", async () => {
		const { call, run } = setup([]);
		run.mockImplementation(async (_m: string, input: unknown) => {
			const user = (input as { messages: { content: string }[] }).messages.at(
				-1,
			)?.content;
			return {
				response: JSON.stringify({ tokens: [{ src: user, label: "行" }] }),
			};
		});
		const res = await call({ text: "猫\r\n\n♪♪\n犬\n", turnstileToken: "t" });
		expect(await res.json()).toEqual({ result: "[行]\r\n\n♪♪\n[行]\n" });
		expect(run).toHaveBeenCalledTimes(2);
	});

	it("fails the whole request when one line fails", async () => {
		const { call, run } = setup([]);
		run.mockImplementation(async (_m: string, input: unknown) => {
			const user = (input as { messages: { content: string }[] }).messages.at(
				-1,
			)?.content;
			return {
				response:
					user === "猫"
						? JSON.stringify({ tokens: [{ src: "猫", label: "動物" }] })
						: JSON.stringify({ tokens: [{ src: "x", label: "動物" }] }),
			};
		});
		const res = await call({ text: "猫\n犬", turnstileToken: "t" });
		expect(res.status).toBe(502);
	});

	it("403 for foreign or missing Origin, before anything else", async () => {
		const { call, siteverify, run } = setup();
		expect((await call(req, { origin: "https://evil.example" })).status).toBe(
			403,
		);
		expect((await call(req, { origin: null })).status).toBe(403);
		expect(siteverify).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it("400 for empty, over-limit and malformed input", async () => {
		const { call, siteverify } = setup();
		expect((await call({ ...req, text: "" })).status).toBe(400);
		expect((await call({ ...req, text: " \n" })).status).toBe(400);
		expect((await call({ ...req, text: "あ".repeat(201) })).status).toBe(400);
		expect((await call("{")).status).toBe(400);
		expect((await call({ text: "猫" })).status).toBe(400);
		expect(siteverify).not.toHaveBeenCalled();
		expect(
			(await setup().call({ ...req, text: "あ".repeat(200) })).status,
		).not.toBe(400);
	});

	it("403 when Turnstile fails, without inference", async () => {
		const { call, run } = setup([good], { success: false });
		const res = await call(req);
		expect(res.status).toBe(403);
		expect(await res.json()).toHaveProperty("error");
		expect(run).not.toHaveBeenCalled();
	});

	it("403 when the Turnstile hostname differs", async () => {
		const { call, run } = setup([good], {
			success: true,
			hostname: "evil.example",
		});
		expect((await call(req)).status).toBe(403);
		expect(run).not.toHaveBeenCalled();
	});

	it("skips the hostname check on loopback hosts (Turnstile test keys)", async () => {
		const { call } = setup([good], { success: true, hostname: "example.com" });
		const base = "http://localhost:8787";
		expect((await call(req, { base, origin: base })).status).toBe(200);
	});

	it("502 without inference when siteverify throws or is not ok", async () => {
		const { call, run, siteverify } = setup();
		siteverify.mockRejectedValueOnce(new Error("timeout"));
		expect((await call(req)).status).toBe(502);
		siteverify.mockResolvedValueOnce(new Response("x", { status: 500 }));
		expect((await call(req)).status).toBe(502);
		expect(run).not.toHaveBeenCalled();
	});

	it("413 for oversized bodies, by header or by content", async () => {
		const { call, siteverify } = setup();
		const big = { ...req, text: "あ".repeat(9000) };
		expect((await call(big)).status).toBe(413);
		const withHeader = await worker.fetch(
			new Request(`${ORIGIN}/api/convert`, {
				method: "POST",
				headers: { origin: ORIGIN, "content-length": "9000" },
				body: JSON.stringify(req),
			}),
			{} as Env,
		);
		expect(withHeader.status).toBe(413);
		expect(siteverify).not.toHaveBeenCalled();
	});

	it("counts UTF-16 code units for the 200 limit, like the frontend", async () => {
		const emoji = "😀".repeat(100);
		const { call } = setup([
			JSON.stringify({ tokens: [{ src: emoji, label: null }] }),
		]);
		// 😀 は 2 単位なので 100 個で上限ちょうど、101 個で超過。
		expect((await call({ ...req, text: emoji })).status).toBe(200);
		expect((await call({ ...req, text: "😀".repeat(101) })).status).toBe(400);
	});

	it("retries once on invalid output", async () => {
		const { call, run } = setup([bad, good]);
		expect((await call(req)).status).toBe(200);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it("502 after two invalid outputs", async () => {
		const { call, run } = setup([bad, "not json", good]);
		const res = await call(req);
		expect(res.status).toBe(502);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it("503 when inference throws", async () => {
		const { call, run } = setup([]);
		run.mockRejectedValue(new Error("quota"));
		expect((await call(req)).status).toBe(503);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it("retries once when inference throws", async () => {
		const { call, run } = setup([]);
		run.mockRejectedValueOnce(new Error("blip"));
		run.mockResolvedValueOnce({ response: good });
		expect((await call(req)).status).toBe(200);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it("405 for PUT and 404 for other paths", async () => {
		const { call } = setup();
		expect((await call(req, { method: "PUT" })).status).toBe(405);
		const res = await worker.fetch(new Request(`${ORIGIN}/api/x`), {} as Env);
		expect(res.status).toBe(404);
	});
});
