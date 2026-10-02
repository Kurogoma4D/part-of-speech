import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const root = new URL("../", import.meta.url);
const origin = "https://part-of-speech.kurogoma4d.workers.dev/";

// Prefer the build output; fall back to the source page, which Vite leaves
// untouched for meta content values.
const distIndex = new URL("dist/index.html", root);
const html = readFileSync(
	existsSync(distIndex) ? distIndex : new URL("index.html", root),
	"utf8",
);

function meta(key: string): string | undefined {
	const tag = html
		.match(/<meta\b[^>]*>/g)
		?.find((t) => new RegExp(`(?:property|name)="${key}"`).test(t));
	return tag?.match(/content="([^"]*)"/)?.[1];
}

test("OGP and Twitter Card meta tags use absolute URLs", () => {
	expect(meta("og:title")).toBeTruthy();
	expect(meta("og:description")).toBeTruthy();
	expect(meta("og:url")).toBe(origin);
	expect(meta("og:image")).toBe(`${origin}og-image.png`);
	expect(meta("twitter:card")).toBe("summary_large_image");
});

test("og-image.png is 1200x630", () => {
	const png = readFileSync(new URL("public/og-image.png", root));
	expect(png.subarray(1, 4).toString()).toBe("PNG");
	expect(png.readUInt32BE(16)).toBe(1200);
	expect(png.readUInt32BE(20)).toBe(630);
});

test("og-image.png is included in the build output", () => {
	if (!existsSync(distIndex)) return;
	expect(existsSync(new URL("dist/og-image.png", root))).toBe(true);
});
