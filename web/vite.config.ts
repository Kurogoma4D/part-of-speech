import { statSync } from "node:fs";
import { defineConfig } from "vitest/config";

// 圧縮配信では Content-Length が展開後サイズと一致しないため、進捗表示の分母にビルド時のサイズを使う。
const wasmBytes = (() => {
	try {
		return statSync("../crates/engine/pkg/engine_bg.wasm").size;
	} catch {
		return 0;
	}
})();

export default defineConfig({
	define: { __WASM_BYTES__: wasmBytes },
	base: "/part-of-speech/",
	server: {
		// engine は link: でリポジトリ外（crates/engine/pkg）を指すため、dev サーバーに配信を許可する。
		fs: { allow: [".", "../crates/engine/pkg"] },
	},
});
