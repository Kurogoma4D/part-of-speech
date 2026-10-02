import { describe, expect, it, vi } from "vitest";
import { type ConverterState, createConverter, type Engine } from "./converter";

function setup(load: () => Promise<Engine>) {
	let nextId = 1;
	const timers = new Map<number, () => void>();
	const states: ConverterState[] = [];
	const c = createConverter({
		load,
		onChange: (s) => states.push(s),
		debounceMs: 100,
		setTimer: (fn) => {
			timers.set(nextId, fn);
			return nextId++;
		},
		clearTimer: (id) => {
			timers.delete(id as number);
		},
	});
	const flush = () => {
		for (const [id, fn] of [...timers]) {
			timers.delete(id);
			fn();
		}
	};
	return { c, states, timers, flush };
}

const engine = (convert = (s: string) => `<${s}>`): Engine => ({ convert });

describe("createConverter", () => {
	it("starts in loading state", () => {
		const { states } = setup(() => new Promise(() => {}));
		expect(states).toEqual([{ status: "loading", output: "", message: "" }]);
	});

	it("converts text typed during loading as soon as the engine is ready", async () => {
		let resolve: (e: Engine) => void = () => {};
		const { c, states } = setup(() => new Promise((r) => (resolve = r)));
		c.setInput("猫");
		expect(c.getState().status).toBe("loading");
		resolve(engine());
		await c.ready;
		expect(states.at(-1)).toEqual({
			status: "ready",
			output: "<猫>",
			message: "",
		});
	});

	it("debounces: only the last input is converted", async () => {
		const convert = vi.fn((s: string) => `<${s}>`);
		const { c, timers, flush } = setup(async () => engine(convert));
		await c.ready;
		convert.mockClear();
		c.setInput("a");
		c.setInput("ab");
		c.setInput("abc");
		expect(timers.size).toBe(1);
		expect(convert).not.toHaveBeenCalled();
		flush();
		expect(convert).toHaveBeenCalledTimes(1);
		expect(c.getState().output).toBe("<abc>");
	});

	it("shows error state when loading fails", async () => {
		const { c } = setup(() => Promise.reject(new Error("boom")));
		await c.ready;
		expect(c.getState()).toEqual({
			status: "error",
			output: "",
			message: "boom",
		});
		c.setInput("x");
		expect(c.getState().status).toBe("error");
	});

	it("keeps ready state and reports a message when convert throws", async () => {
		const { c, flush } = setup(async () =>
			engine(() => {
				throw new Error("bad");
			}),
		);
		await c.ready;
		c.setInput("x");
		flush();
		expect(c.getState()).toEqual({
			status: "ready",
			output: "",
			message: "bad",
		});
	});
});
