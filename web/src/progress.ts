export interface Progress {
	loaded: number;
	/** 総バイト数。不明なら 0。 */
	total: number;
}

const MB = 1024 * 1024;

/**
 * 進捗表示に使う総バイト数を決める。
 * 圧縮配信では Content-Length が圧縮後の大きさで、読み出すバイト数（展開後）と一致しないため、
 * Content-Encoding があるときはビルド時に分かる展開後サイズを使う。
 */
export function resolveTotal(
	headers: { get(name: string): string | null },
	expectedBytes: number,
): number {
	const encoded = headers.get("content-encoding");
	if (encoded && encoded !== "identity") return expectedBytes;
	const length = Number(headers.get("content-length"));
	return Number.isFinite(length) && length > 0 ? length : expectedBytes;
}

/** 読み込み中ステータスの文言。総量が分かれば割合も出す。 */
export function formatProgress({ loaded, total }: Progress): string {
	const base = "辞書を読み込み中です（初回のみ時間がかかります）";
	const mb = (n: number) => (n / MB).toFixed(1);
	if (total > 0) {
		const percent = Math.min(100, Math.floor((loaded / total) * 100));
		return `${base}… ${percent}%（${mb(loaded)} / ${mb(total)} MB）`;
	}
	return loaded > 0 ? `${base}… ${mb(loaded)} MB` : `${base}…`;
}

/** body を読み進めるたびに onProgress を呼ぶ Response を返す。body が無ければそのまま返す。 */
export function trackProgress(
	response: Response,
	expectedBytes: number,
	onProgress: (p: Progress) => void,
): Response {
	if (!response.body) return response;
	const total = resolveTotal(response.headers, expectedBytes);
	let loaded = 0;
	const reader = response.body.getReader();
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) {
				controller.close();
				return;
			}
			loaded += value.byteLength;
			onProgress({ loaded, total });
			controller.enqueue(value);
		},
		cancel: (reason) => reader.cancel(reason),
	});
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}
