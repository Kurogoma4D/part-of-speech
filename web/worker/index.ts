import { assemble, parseTokens, RESPONSE_SCHEMA } from "./convert";
import { buildMessages } from "./prompt";

const MAX_TEXT_LENGTH = 500;
const SITEVERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface Env {
	AI: { run(model: string, input: unknown): Promise<unknown> };
	MODEL: string;
	TURNSTILE_SECRET_KEY: string;
}

const json = (body: unknown, status: number, headers?: HeadersInit) =>
	Response.json(body, {
		status,
		headers: { "cache-control": "no-store", ...headers },
	});
const fail = (error: string, status: number) => json({ error }, status);

async function verifyTurnstile(token: string, secret: string) {
	const res = await fetch(SITEVERIFY_URL, {
		method: "POST",
		body: new URLSearchParams({ secret, response: token }),
	});
	const data = (await res.json()) as { success?: boolean };
	return data.success === true;
}

interface AiOutput {
	response?: unknown;
	choices?: { message?: { content?: unknown } }[];
}

// モデルは前後の空白・改行を落としがちなので、推論対象から外して結果に付け直す。
async function infer(env: Env, input: string): Promise<string | null> {
	const text = input.trim();
	const out = (await env.AI.run(env.MODEL, {
		messages: buildMessages(text),
		response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
		// 既定の 256 では長い入力の JSON が途中で切れる。
		max_tokens: 2048,
	})) as AiOutput | null;
	// モデルによって応答の形が Workers AI 独自形式と OpenAI 互換形式に分かれる。
	const tokens = parseTokens(
		out?.response ?? out?.choices?.[0]?.message?.content,
		text,
	);
	if (!tokens) return null;
	const start = input.indexOf(text);
	return (
		input.slice(0, start) + assemble(tokens) + input.slice(start + text.length)
	);
}

async function convert(request: Request, env: Env): Promise<Response> {
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return fail("許可されていないオリジンです。", 403);

	let body: { text?: unknown; turnstileToken?: unknown } | null;
	try {
		body = await request.json();
	} catch {
		return fail("リクエストの形式が正しくありません。", 400);
	}
	const { text, turnstileToken } = body ?? {};
	if (typeof text !== "string" || typeof turnstileToken !== "string")
		return fail("リクエストの形式が正しくありません。", 400);
	if (text.trim() === "") return fail("テキストを入力してください。", 400);
	if (text.length > MAX_TEXT_LENGTH)
		return fail(`${MAX_TEXT_LENGTH}文字以内で入力してください。`, 400);

	try {
		if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY)))
			return fail("ボット検証に失敗しました。", 403);
	} catch {
		return fail("ボット検証を完了できませんでした。", 502);
	}

	try {
		// 形式不正の応答は 1 回だけ再推論する。
		for (let attempt = 0; attempt < 2; attempt++) {
			const result = await infer(env, text);
			if (result !== null) return json({ result }, 200);
		}
	} catch {
		return fail("変換に失敗しました。時間をおいて再試行してください。", 503);
	}
	return fail("変換結果を得られませんでした。再試行してください。", 502);
}

// Static Assets は run_worker_first で /api/* だけを Worker に回す。
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname !== "/api/convert") return fail("Not Found", 404);
		if (request.method !== "POST")
			return json({ error: "Method Not Allowed" }, 405, { allow: "POST" });
		return convert(request, env);
	},
};
