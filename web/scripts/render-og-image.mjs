// Renders scripts/og-image.html to public/og-image.png (1200x630).
// Requires Playwright; set CHROMIUM_PATH to a Chromium executable if needed.

import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const src = fileURLToPath(new URL("./og-image.html", import.meta.url));
const out = fileURLToPath(new URL("../public/og-image.png", import.meta.url));
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH,
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${src}`);
await page.screenshot({ path: out });
await browser.close();
