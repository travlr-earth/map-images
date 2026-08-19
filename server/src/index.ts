import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initBrowser, closeBrowser, renderStory } from "./browserPool.js";
import { hashKey, getCached, store } from "./cache.js";
import { cacheKey, type RenderRequest } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDER_HTML = readFileSync(join(__dirname, "../public/render.html"), "utf8");

const app = new Hono();

// Playwright loads /render from this server itself — no separate Vite app needed.
const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3001";
const PORT = Number(process.env.PORT ?? 3001);
const WORKER_SECRET = process.env.WORKER_SECRET;

// Health check (used by Fly.io HTTP health checks)
app.get("/health", (c) => c.json({ ok: true }));

// Render page — loaded by Playwright headless browser to execute the MapLibre render
app.get("/render", (c) => c.html(RENDER_HTML));

// Local-dev: serve rendered JPEGs directly (production uses Supabase Storage CDN URLs)
app.use("/renders-local/*", serveStatic({ root: "." }));

// Main render endpoint — called by the Supabase Edge Function
app.post("/render", async (c) => {
  // Verify the internal secret so only the Edge Function can call this
  if (WORKER_SECRET) {
    const auth = c.req.header("x-worker-secret");
    if (auth !== WORKER_SECRET) return c.json({ error: "Forbidden" }, 403);
  }

  let req: RenderRequest;
  try {
    req = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!req.themeId || !req.city || !req.variant) {
    return c.json({ error: "Missing required fields: themeId, city, variant" }, 400);
  }

  const stable = cacheKey(req);
  const hash   = hashKey(stable);

  // Cache check (worker-level — Edge Function also checks, but this avoids re-rendering
  // if two requests race past the Edge Function cache simultaneously)
  const cached = await getCached(hash).catch(() => null);
  if (cached) return c.json({ url: cached, cached: true });

  const t0 = Date.now();
  let jpeg: Buffer;
  try {
    jpeg = await renderStory(APP_ORIGIN, JSON.stringify(req));
  } catch (err) {
    console.error("[render]", err);
    return c.json({ error: String(err) }, 500);
  }

  const url = await store(hash, jpeg);
  return c.json({ url, cached: false, renderMs: Date.now() - t0 });
});

// Static assets — after API routes so POST /render is not intercepted
// Serves render-lib.iife.js, fonts, and any other files in server/public/
app.use("/*", serveStatic({ root: "./public" }));

// Startup
await initBrowser();

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[server] render worker listening on :${PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("[server] shutting down…");
  await closeBrowser();
  server.close();
});
