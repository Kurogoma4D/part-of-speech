import { expect, test } from "vitest";
import { appTitle } from "./title";

test("appTitle is part-of-speech", () => {
	expect(appTitle).toBe("part-of-speech");
});
