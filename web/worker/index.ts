import { assemble, parseTokens, RESPONSE_SCHEMA } from "./convert";
import { buildMessages } from "./prompt";

const MAX_TEXT_LENGTH = 200;
// 200 文字(最大 4 バイト/文字の JSON エスケープ込み)とトークンを収めるのに十分な上限。
const MAX_BODY_BYTES = 8 * 1024;
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

// 他サイトのウィジェットで発行されたトークンを流用されないよう hostname も照合する。
async function verifyTurnstile(token: string, secret: string, host: string) {
	// Turnstile のテストキーは siteverify が常に example.com を返すため、ローカル開発では照合できない。
	const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(host);
	const res = await fetch(SITEVERIFY_URL, {
		method: "POST",
		body: new URLSearchParams({ secret, response: token }),
		signal: AbortSignal.timeout(5000),
	});
	if (!res.ok) throw new Error(`siteverify ${res.status}`);
	const data = (await res.json()) as { success?: boolean; hostname?: string };
	return data.success === true && (loopback || data.hostname === host);
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

class InferFailure extends Error {
	constructor(readonly threw: boolean) {
		super();
	}
}

// 複数行の入力を 1 回で推論すると、推論(思考)が max_tokens を使い切って応答が空になる。
async function convertLine(env: Env, line: string): Promise<string> {
	// 文字・数字を含まない行(空行・記号・絵文字・改行そのもの)はそのまま残す。
	if (!/[\p{L}\p{N}]/u.test(line)) return line;
	// 推論の例外と形式不正は同じ再試行枠(合計 2 回)を共有する。
	let threw = false;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const result = await infer(env, line);
			if (result !== null) return result;
			threw = false;
		} catch {
			threw = true;
		}
	}
	throw new InferFailure(threw);
}

async function convert(request: Request, env: Env): Promise<Response> {
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return fail("許可されていないオリジンです。", 403);

	if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES)
		return fail("リクエストが大きすぎます。", 413);

	let body: { text?: unknown; turnstileToken?: unknown } | null;
	try {
		// Content-Length を持たない転送は読み込み済みの本文を UTF-8 バイト数で事後確認する(バッファ前の制限ではない)。
		const raw = await request.text();
		if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
			return fail("リクエストが大きすぎます。", 413);
		body = JSON.parse(raw);
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
		const host = new URL(request.url).hostname;
		if (
			!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, host))
		)
			return fail("ボット検証に失敗しました。", 403);
	} catch {
		return fail("ボット検証を完了できませんでした。", 502);
	}

	try {
		// 改行ごとに並列で推論する。1 行でも失敗すれば全体を失敗とする。
		const lines = await Promise.all(
			text.split(/(\r?\n)/).map((line) => convertLine(env, line)),
		);
		return json({ result: lines.join("") }, 200);
	} catch (e) {
		if (!(e instanceof InferFailure)) throw e;
		if (e.threw)
			return fail("変換に失敗しました。時間をおいて再試行してください。", 503);
		return fail("変換結果を得られませんでした。再試行してください。", 502);
	}
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
