import { describe, expect, it } from "vitest";
import { formatProgress, resolveTotal, trackProgress } from "./progress";

const headers = (h: Record<string, string>) =>
	new Headers(h) as { get(name: string): string | null };

describe("resolveTotal", () => {
	it("uses Content-Length when the body is not encoded", () => {
		expect(resolveTotal(headers({ "content-length": "100" }), 500)).toBe(100);
	});
	it("uses the expected size when the body is compressed", () => {
		expect(
			resolveTotal(
				headers({ "content-length": "100", "content-encoding": "gzip" }),
				500,
			),
		).toBe(500);
	});
	it("falls back to the expected size without Content-Length", () => {
		expect(resolveTotal(headers({}), 500)).toBe(500);
		expect(resolveTotal(headers({}), 0)).toBe(0);
	});
});

describe("formatProgress", () => {
	it("shows percent and megabytes when the total is known", () => {
		expect(formatProgress({ loaded: 5 * 1048576, total: 20 * 1048576 })).toBe(
			"辞書を読み込み中です（初回のみ時間がかかります）… 25%（5.0 / 20.0 MB）",
		);
	});
	it("caps at 100%", () => {
		expect(formatProgress({ loaded: 30, total: 10 })).toContain("100%");
	});
	it("shows only downloaded size when the total is unknown", () => {
		expect(formatProgress({ loaded: 2097152, total: 0 })).toContain("2.0 MB");
		expect(formatProgress({ loaded: 0, total: 0 })).toBe(
			"辞書を読み込み中です（初回のみ時間がかかります）…",
		);
	});
});

describe("trackProgress", () => {
	it("reports cumulative bytes and passes the body through", async () => {
		const res = new Response(new Blob(["abcdef"]), {
			headers: { "content-length": "6" },
		});
		const seen: number[] = [];
		const tracked = trackProgress(res, 0, (p) => {
			expect(p.total).toBe(6);
			seen.push(p.loaded);
		});
		expect(await tracked.text()).toBe("abcdef");
		expect(seen.at(-1)).toBe(6);
	});
});
