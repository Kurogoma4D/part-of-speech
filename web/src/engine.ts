import wasmUrl from "engine/engine_bg.wasm?url";
import type { Engine } from "./converter";
import { type Progress, trackProgress } from "./progress";

declare const __WASM_BYTES__: number;

/** wasm（辞書込み）は大きいので初回表示後に動的 import し、辞書展開まで済ませてから返す。 */
export async function loadEngine(
	onProgress?: (p: Progress) => void,
): Promise<Engine> {
	const mod = await import("engine");
	// wasmUrl は Vite の base（/part-of-speech/）を含む。
	const res = await fetch(wasmUrl);
	if (!res.ok) throw new Error(`wasm の取得に失敗しました (${res.status})`);
	await mod.default({
		module_or_path: onProgress
			? trackProgress(res, __WASM_BYTES__, onProgress)
			: res,
	});
	mod.init();
	return { convert: mod.convert };
}
