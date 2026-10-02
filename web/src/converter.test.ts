import { describe, expect, it } from "vitest";
import {
	type ConverterState,
	canConvert,
	createConverter,
	MAX_LENGTH,
	remainingChars,
} from "./converter";

describe("createConverter", () => {
	const setup = (convert: (text: string) => Promise<string>) => {
		const states: ConverterState[] = [];
		const c = createConverter({ convert, onChange: (s) => states.push(s) });
		return { c, states };
	};

	it("moves idle -> loading -> ready", async () => {
		const { c, states } = setup(async (t) => `<${t}>`);
		await c.run("猫");
		expect(states.map((s) => s.status)).toEqual(["loading", "ready"]);
		expect(c.getState()).toEqual({
			status: "ready",
			output: "<猫>",
			message: "",
		});
	});

	it("reports a failure and can run again", async () => {
		let fail = true;
		const { c } = setup(async () => {
			if (fail) throw new Error("boom");
			return "ok";
		});
		await c.run("猫");
		expect(c.getState()).toEqual({
			status: "error",
			output: "",
			message: "boom",
		});
		fail = false;
		await c.run("猫");
		expect(c.getState().output).toBe("ok");
	});

	it("ignores run while loading", async () => {
		let calls = 0;
		let resolve: (v: string) => void = () => {};
		const { c } = setup(() => {
			calls++;
			return new Promise((r) => {
				resolve = r;
			});
		});
		const first = c.run("a");
		await c.run("b");
		resolve("x");
		await first;
		expect(calls).toBe(1);
	});
});

describe("canConvert", () => {
	it("needs a token, non-blank text within the limit, and no request in flight", () => {
		expect(canConvert("猫", "t", "idle")).toBe(true);
		expect(canConvert("猫", "t", "error")).toBe(true);
		expect(canConvert("猫", null, "idle")).toBe(false);
		expect(canConvert("猫", "t", "loading")).toBe(false);
		expect(canConvert(" \n", "t", "idle")).toBe(false);
		expect(canConvert("あ".repeat(MAX_LENGTH), "t", "idle")).toBe(true);
		expect(canConvert("あ".repeat(MAX_LENGTH + 1), "t", "idle")).toBe(false);
	});

	it("counts remaining characters", () => {
		expect(remainingChars("")).toBe(MAX_LENGTH);
		expect(remainingChars("猫")).toBe(MAX_LENGTH - 1);
	});
});
