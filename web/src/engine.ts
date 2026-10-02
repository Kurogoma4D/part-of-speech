import type { Engine } from "./converter";

/** wasm（辞書込み）は大きいので初回表示後に動的 import し、辞書展開まで済ませてから返す。 */
export async function loadEngine(): Promise<Engine> {
	const mod = await import("engine");
	await mod.default();
	mod.init();
	return { convert: mod.convert };
}
