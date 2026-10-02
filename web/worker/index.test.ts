import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

const ORIGIN = "https://part-of-speech.example.workers.dev";
const good = JSON.stringify({
	tokens: [
		{ src: "猫", label: "名詞" },
		{ src: "！", label: null },
	],
});
const bad = JSON.stringify({ tokens: [{ src: "犬", label: "名詞" }] });

function setup(responses: unknown[] = [good], turnstile = { success: true }) {
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
		}: { origin?: string | null; method?: string } = {},
	) =>
		worker.fetch(
			new Request(`${ORIGIN}/api/convert`, {
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
		expect(await res.json()).toEqual({ result: "[名詞]！" });
		expect(run).toHaveBeenCalledWith(
			"m",
			expect.objectContaining({ max_tokens: 2048 }),
		);
		const form = (
			siteverify.mock.calls[0] as unknown as [string, RequestInit]
		)[1].body as URLSearchParams;
		expect(form.get("secret")).toBe("secret");
		expect(form.get("response")).toBe("t");
	});

	it("accepts an already parsed response object", async () => {
		const { call } = setup([JSON.parse(good)]);
		expect(await (await call(req)).json()).toEqual({ result: "[名詞]！" });
	});

	it("reads OpenAI-style choices and keeps surrounding whitespace", async () => {
		const { call, run } = setup([]);
		run.mockResolvedValueOnce({ choices: [{ message: { content: good } }] });
		const res = await call({ ...req, text: "\n 猫！\n" });
		expect(await res.json()).toEqual({ result: "\n [名詞]！\n" });
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
		expect((await call({ ...req, text: "あ".repeat(501) })).status).toBe(400);
		expect((await call("{")).status).toBe(400);
		expect((await call({ text: "猫" })).status).toBe(400);
		expect(siteverify).not.toHaveBeenCalled();
		expect(
			(await setup().call({ ...req, text: "あ".repeat(500) })).status,
		).not.toBe(400);
	});

	it("403 when Turnstile fails, without inference", async () => {
		const { call, run } = setup([good], { success: false });
		const res = await call(req);
		expect(res.status).toBe(403);
		expect(await res.json()).toHaveProperty("error");
		expect(run).not.toHaveBeenCalled();
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
		run.mockRejectedValueOnce(new Error("quota"));
		expect((await call(req)).status).toBe(503);
	});

	it("405 for GET and 404 for other paths", async () => {
		const { call } = setup();
		expect((await call(req, { method: "PUT" })).status).toBe(405);
		const res = await worker.fetch(new Request(`${ORIGIN}/api/x`), {} as Env);
		expect(res.status).toBe(404);
	});
});
