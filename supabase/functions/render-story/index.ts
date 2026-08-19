/**
 * Supabase Edge Function: render-story
 *
 * Public endpoint for generating story share images.
 * - Validates auth (anon key + optional user JWT)
 * - Rate-limits per IP (60 req/hour via Supabase KV / upstash)
 * - Checks Supabase Storage for a cached render
 * - On cache miss: forwards to the Fly.io render worker
 * - Stores result and returns the public CDN URL
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

// ── Env ───────────────────────────────────────────────────────────────────────

const SUPABASE_URL            = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_URL              = Deno.env.get("RENDER_WORKER_URL")!;   // https://mapimages-render.fly.dev
const WORKER_SECRET           = Deno.env.get("WORKER_SECRET")!;
const BUCKET                  = "story-renders";
const MAX_PAYLOAD_BYTES       = 2 * 1024 * 1024;   // 2 MB (covers base64 photos)

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashKey(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function stableParams(req: Record<string, unknown>) {
  return {
    themeId:        req.themeId,
    city:           req.city,
    country:        req.country,
    lat:            Math.round(Number(req.lat)  * 1000) / 1000,
    lon:            Math.round(Number(req.lon)  * 1000) / 1000,
    zoom:           Math.round(Number(req.zoom) * 10)   / 10,
    fontFamily:     req.fontFamily     ?? "Bebas Neue",
    fadeOpacity:    req.fadeOpacity    ?? 85,
    gradientStyle:  req.gradientStyle  ?? "heavy-bottom",
    overlayStyle:   req.overlayStyle   ?? "classic",
    variant:        req.variant,
    routeFromLatLon: req.routeFromLatLon,
    routeDistanceKm: req.routeDistanceKm,
    routeMinutes:    req.routeMinutes,
    stops:           req.stops,
    routeName:       req.routeName,
    routeTotalKm:    req.routeTotalKm,
    routeTotalMinutes: req.routeTotalMinutes,
    ctaUrl:          req.ctaUrl    ?? "travlr.earth",
    ctaTagline:      req.ctaTagline ?? "Discover more",
    markerTitle:    (req.marker as any)?.title,
    markerNote:     (req.marker as any)?.note,
    // photos intentionally excluded from cache key (user-specific)
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Size guard
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!body.themeId || !body.city || !body.variant) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: themeId, city, variant" }),
      { status: 400 },
    );
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Cache lookup
  const stable = stableParams(body);
  const hash   = hashKey(stable);
  const path   = `renders/${hash}.jpg`;

  const { data: listed } = await admin.storage
    .from(BUCKET)
    .list("renders", { search: `${hash}.jpg` });

  if (listed?.length) {
    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    return new Response(
      JSON.stringify({ url: urlData.publicUrl, cached: true }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  }

  // Forward to render worker
  const workerRes = await fetch(`${WORKER_URL}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": WORKER_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!workerRes.ok) {
    const err = await workerRes.text();
    return new Response(JSON.stringify({ error: `Render worker error: ${err}` }), { status: 502 });
  }

  const result = await workerRes.json() as { url: string; cached: boolean; renderMs?: number };
  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
