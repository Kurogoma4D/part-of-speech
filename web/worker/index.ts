import { assemble, parseTokens, RESPONSE_SCHEMA } from "./convert";
import { buildMessages } from "./prompt";

const MAX_TEXT_LENGTH = 200;
const MAX_INFERABLE_LINES = 20;
const CONCURRENCY = 4;
// 200 文字(最大 4 バイト/文字の JSON エスケープ込み)とトークンを収めるのに十分な上限。
const MAX_BODY_BYTES = 8 * 1024;
const SITEVERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface Env {
	AI: {
		run(
			model: string,
			input: unknown,
			options?: { gateway?: { id: string } },
		): Promise<unknown>;
	};
	RATE_LIMITER: {
		limit(options: { key: string }): Promise<{ success: boolean }>;
	};
	MODEL: string;
	AI_GATEWAY_ID: string;
	TURNSTILE_SECRET_KEY: string;
}

const json = (body: unknown, status: number, headers?: HeadersInit) =>
	Response.json(body, {
		status,
		headers: {
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
			...headers,
		},
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
	const out = (await env.AI.run(
		env.MODEL,
		{
			messages: buildMessages(text),
			response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
			// 既定の 256 では長い入力の JSON が途中で切れる。
			max_tokens: 2048,
		},
		{ gateway: { id: env.AI_GATEWAY_ID } },
	)) as AiOutput | null;
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

// ゲートウェイのレート制限超過は、code などの独自プロパティを持たない Error(message は "2003: Rate limited")として届く。
const isGatewayLimit = (e: unknown) =>
	e instanceof Error && /^2003: Rate limited$/.test(e.message);

class InferFailure extends Error {
	constructor(
		readonly threw: boolean,
		readonly limited = false,
	) {
		super();
	}
}

// 文字・数字を含まない行(空行・記号・絵文字・改行そのもの)は推論せず原文のまま残す。
const isInferable = (line: string) => /[\p{L}\p{N}]/u.test(line);

// 複数行の入力を 1 回で推論すると、推論(思考)が max_tokens を使い切って応答が空になる。
async function convertLine(
	env: Env,
	line: string,
	stopped: () => boolean,
): Promise<string> {
	// 推論の例外と形式不正は同じ再試行枠(合計 2 回)を共有する。
	let threw = false;
	for (let attempt = 0; attempt < 2 && !stopped(); attempt++) {
		try {
			const result = await infer(env, line);
			if (result !== null) return result;
			threw = false;
		} catch (e) {
			// 上限に達している間の再推論は無駄な呼び出しになる。
			if (isGatewayLimit(e)) throw new InferFailure(true, true);
			threw = true;
		}
	}
	throw new InferFailure(threw);
}

// 同時実行数を抑え、1 行でも失敗したら残りの行は開始しない。
async function convertLines(env: Env, lines: string[]) {
	const results = new Map<string, string>();
	const queue = [...lines];
	let failure: InferFailure | undefined;
	const record = (e: InferFailure) => {
		// 同時に失敗した行があっても、ゲートウェイ制限を優先して応答の状態を一意にする。
		if (!failure?.limited) failure = e;
	};
	const worker = async () => {
		for (let line = queue.shift(); line !== undefined; line = queue.shift()) {
			if (failure) return;
			try {
				results.set(line, await convertLine(env, line, () => !!failure));
			} catch (e) {
				if (!(e instanceof InferFailure)) throw e;
				record(e);
				return;
			}
		}
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	if (failure) throw failure;
	return results;
}

// IPv6 の利用者は /64 以上を自由に使えるため、先頭 4 ヘクステットに丸めて同じ枠で数える。
export function rateLimitKey(ip: string | null): string {
	// cf-connecting-ip は Cloudflare のエッジが常に付与するので、無いのはローカル開発時だけ。その場合は共通キーで数える。
	if (!ip) return "unknown";
	if (!ip.includes(":")) return ip;
	const [head, tail] = ip.split("::");
	const part = (g: string | undefined) => (g ? g.split(":") : []);
	// 末尾の IPv4 表記は 2 ヘクステット分として数える。
	const size = (g: string[]) =>
		g.length + g.filter((x) => x.includes(".")).length;
	const left = part(head);
	const right = tail === undefined ? [] : part(tail);
	const zeros = Array(Math.max(0, 8 - size(left) - size(right))).fill("0");
	const groups = tail === undefined ? left : [...left, ...zeros, ...right];
	return `${groups
		.slice(0, 4)
		.map((g) => Number.parseInt(g, 16).toString(16))
		.join(":")}::/64`;
}

async function convert(request: Request, env: Env): Promise<Response> {
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return fail("許可されていないオリジンです。", 403);

	// 本文の検証や Turnstile より前に判定し、超過した送信元には siteverify も推論も実行しない。
	const key = rateLimitKey(request.headers.get("cf-connecting-ip"));
	if (!(await env.RATE_LIMITER.limit({ key })).success)
		return fail(
			"リクエストが多すぎます。しばらく待ってから再試行してください。",
			429,
		);

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
	const parts = text.split(/(\r?\n)/);
	// 重複行は 1 回だけ推論するので、上限は異なる行の数で数える。
	const distinct = [...new Set(parts.filter(isInferable))];
	if (distinct.length > MAX_INFERABLE_LINES)
		return fail(
			`行数が多すぎます。異なる行は${MAX_INFERABLE_LINES}行以内にしてください。`,
			400,
		);

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
		const results = await convertLines(env, distinct);
		return json(
			{ result: parts.map((p) => results.get(p) ?? p).join("") },
			200,
		);
	} catch (e) {
		if (!(e instanceof InferFailure)) throw e;
		if (e.limited)
			return fail(
				"ただいま混み合っています。しばらく待ってから再試行してください。",
				429,
			);
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
