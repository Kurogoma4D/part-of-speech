import { defineConfig } from "vitest/config";

export default defineConfig({
	base: "/part-of-speech/",
	server: {
		// engine は link: でリポジトリ外（crates/engine/pkg）を指すため、dev サーバーに配信を許可する。
		fs: { allow: [".", "../crates/engine/pkg"] },
	},
});
