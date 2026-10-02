const TIMEOUT_MS = 60_000;

/** BFF の `{ error }` をそのまま利用者向けメッセージにする。 */
export async function convertText(
	text: string,
	turnstileToken: string,
	fetchFn: typeof fetch = fetch,
): Promise<string> {
	let res: Response;
	try {
		res = await fetchFn("/api/convert", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text, turnstileToken }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		throw new Error("通信に失敗しました。時間をおいて再試行してください。");
	}
	const data: { result?: unknown; error?: unknown } = await res
		.json()
		.catch(() => ({}));
	if (res.ok && typeof data.result === "string") return data.result;
	throw new Error(
		typeof data.error === "string"
			? data.error
			: `変換に失敗しました (${res.status})`,
	);
}
