/**
 * Manages a pool of Playwright browser contexts.
 * Each render gets its own isolated page; contexts are reused across requests.
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import pLimit from "p-limit";

const MAX_CONCURRENT = 4;
const PAGE_TIMEOUT_MS = 35_000;

let browser: Browser | null = null;
const contexts: BrowserContext[] = [];
let contextIndex = 0;

const limit = pLimit(MAX_CONCURRENT);

export async function initBrowser(): Promise<void> {
  // In production (Linux container) use the Playwright-downloaded Chromium with SwiftShader.
  // In local dev on Windows/Mac, fall back to the system Chrome so no download is needed.
  const useSystemChrome = process.platform !== "linux" && !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  browser = await chromium.launch({
    ...(useSystemChrome ? { channel: "chrome" } : {}),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu-sandbox",
      "--enable-webgl",
      ...(useSystemChrome ? [] : ["--use-gl=swiftshader"]),  // SwiftShader only in container
      "--ignore-gpu-blocklist",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  // Pre-warm context pool
  for (let i = 0; i < MAX_CONCURRENT; i++) {
    contexts.push(await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 1,
    }));
  }
  console.log(`[pool] browser ready, ${MAX_CONCURRENT} contexts`);
}

export async function closeBrowser(): Promise<void> {
  await Promise.all(contexts.map((c) => c.close()));
  await browser?.close();
}

/**
 * Render a story image. Returns raw JPEG buffer.
 * Queued — at most MAX_CONCURRENT renders run simultaneously.
 */
export function renderStory(appUrl: string, paramsJson: string): Promise<Buffer> {
  return limit(async () => {
    if (!browser) throw new Error("Browser pool not initialised");

    // Round-robin contexts so we don't hammer one context
    const ctx = contexts[contextIndex % contexts.length];
    contextIndex++;

    const page = await ctx.newPage();
    try {
      // Navigate to the render endpoint page
      const url = new URL("/render", appUrl);
      url.searchParams.set("spec", paramsJson);
      await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });

      // Wait for render complete signal (or error)
      await page.waitForFunction(
        () => {
          const done = (document.getElementById("render-result") as HTMLCanvasElement | null)?.dataset.done;
          return done === "true" || done === "error";
        },
        { timeout: PAGE_TIMEOUT_MS },
      );

      // Fast-fail on render error
      const done = await page.evaluate(
        () => (document.getElementById("render-result") as HTMLCanvasElement | null)?.dataset.done,
      );
      if (done === "error") {
        const msg = await page.evaluate(
          () => (document.getElementById("render-error") as HTMLElement | null)?.textContent ?? "Unknown render error",
        );
        throw new Error(`Render page error: ${msg}`);
      }

      // Read JPEG data URL from the result element
      const dataUrl = await page.evaluate(
        () => (document.getElementById("render-result") as HTMLCanvasElement | null)?.toDataURL("image/jpeg", 0.92) ?? "",
      );

      if (!dataUrl.startsWith("data:image/jpeg")) {
        throw new Error("Render page did not produce a JPEG data URL");
      }

      // Convert data URL → Buffer
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      return Buffer.from(base64, "base64");
    } finally {
      await page.close();
    }
  });
}
