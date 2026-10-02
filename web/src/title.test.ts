import { expect, test } from "vitest";
import { appTitle } from "./title";

test("appTitle is 例の歌詞のやつ", () => {
	expect(appTitle).toBe("例の歌詞のやつ");
});
