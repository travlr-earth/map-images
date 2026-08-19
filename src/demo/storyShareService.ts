/**
 * storyShareService.ts
 *
 * Orchestrates the five story-share render variants:
 *   1. Calls renderSinglePosterCanvas() to get the themed map canvas
 *   2. Composites the variant-specific overlay via drawStoryOverlay()
 *   3. Exports as JPEG blob and hands off via Web Share API (mobile)
 *      or triggers a download (desktop fallback)
 */

import { renderSinglePosterCanvas, type PosterSpec } from "./PosterRenderer";
import {
  drawStoryOverlay,
  mercatorProject,
  type ShareVariant,
  type DiaryMarker,
  type RouteStop,
  type GeoPoint,
  type StoryOverlaySpec,
} from "@/features/poster/infrastructure/renderer/storyOverlay";
import { getTheme } from "@/features/theme/infrastructure/themeRepository";
import { gpxParser } from "@/features/routes/infrastructure/gpxParser";
import { isFontRegistered } from "@/fonts/registry";

// ── Public types ──────────────────────────────────────────────────────────────

export type { ShareVariant, DiaryMarker, RouteStop };

export interface RouteStopInput {
  label: string;
  lat: number;
  lon: number;
}

/** Email-banner event profiles — a landscape "condensed info" treatment (see drawEmailBanner). */
export type BannerEvent =
  | "trip-invite"
  | "collection-invite"
  | "dormancy-nudge"
  | "trip-recap"
  | "monthly-summary";

/** A named point for point-collection banners (collection-invite / dormancy / monthly-summary). */
export interface BannerPoint { label?: string; lat: number; lon: number; }

/** One stat in the banner's condensed stat row, e.g. { value: "340 km", label: "distance" }. */
export interface BannerStat { value: string; label: string; }

/** Requested output pixel size. Defaults to 1080×1920 (story format) when omitted. */
export interface OutputSize {
  width: number;
  height: number;
}

export interface StoryShareRequest {
  variant: ShareVariant;
  /** Base poster config. width/height default to 1080×1920 — override via `output`. */
  posterSpec: Omit<PosterSpec, "width" | "height" | "storyMode">;
  /**
   * "story" (default) — the overlay draws its own place-label/bottom-fade + a social
   * "share to" CTA footer; posterSpec's showText/fadeOpacity are suppressed to avoid a
   * redundant double label. "poster" — the reverse: posterSpec's own overlayStyle/
   * gradientStyle label is used instead, no social CTA — for print-product source images.
   */
  renderMode?: "story" | "poster" | "email-banner";
  /** Output pixel size. Omit → 1080×1920 (story/poster) or 1200×400 (email-banner). */
  output?: OutputSize;
  // ── email-banner (renderMode: "email-banner") ─────────────────────────────
  /** Which condensed-info event profile to draw. Required for email-banner mode. */
  bannerEvent?: BannerEvent;
  /** Point collection (collection-invite / dormancy-nudge / monthly-summary). */
  points?: BannerPoint[];
  /** Small uppercase label above the headline (e.g. "You're invited"). Per-event default if omitted. */
  eyebrow?: string;
  /** The banner's main title (falls back to routeName, then city). */
  headline?: string;
  /** Condensed stat row, drawn left→right under the headline. */
  stats?: BannerStat[];
  /** Inviter name for trip-invite / collection-invite ("from Alex"). */
  fromName?: string;
  marker?: DiaryMarker;
  // B — route-to
  routeFromLatLon?: [number, number];   // [lat, lon] of the "from" point
  routeDistanceKm?: number;
  routeMinutes?: number;
  // D — full-route
  stops?: RouteStopInput[];
  routeName?: string;
  routeTotalKm?: number;
  routeTotalMinutes?: number;
  // B/D — real polyline geometry (preferred over the decorative curve/straight
  // line when present). One array of points per segment.
  routeSegments?: GeoPoint[][];
  /** Raw GPX (XML) text — parsed into routeSegments. Alternative to routeSegments. */
  routeGpx?: string;
  // F — polygon: closed (or auto-closed) ring of lat/lon points
  polygonRing?: GeoPoint[];
  // C — photo-map: photos come from marker.photos
  // E — pin-photos: photos come from marker.photos
  ctaUrl?: string;
  ctaTagline?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Legacy default — used only when the caller doesn't supply `output`.
const STORY_W = 1080;
const STORY_H = 1920;
// Email-banner default — a wide, short landscape strip for inbox banners.
const BANNER_W = 1200;
const BANNER_H = 400;

// ── Preload helper (needed for synchronous canvas drawImage) ──────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── API-backed render (server-side) ──────────────────────────────────────────

/**
 * Calls the Supabase Edge Function to render the story server-side.
 * Returns a public CDN URL to the JPEG — no local WebGL render needed.
 * Throws if the API is unavailable or returns an error.
 */
export async function renderStoryViaApi(
  req: StoryShareRequest,
  apiBaseUrl: string,
): Promise<string> {
  const { posterSpec, ...rest } = req;
  const payload = {
    themeId:      posterSpec.themeId,
    city:         posterSpec.city,
    country:      posterSpec.country,
    lat:          posterSpec.lat,
    lon:          posterSpec.lon,
    zoom:         posterSpec.zoom,
    fontFamily:   posterSpec.fontFamily,
    fadeOpacity:  posterSpec.fadeOpacity,
    gradientStyle: posterSpec.gradientStyle,
    overlayStyle: posterSpec.overlayStyle,
    textProfile:  posterSpec.textProfile,
    textBottomMargin: posterSpec.textBottomMargin,
    ...rest,
  };

  const res = await fetch(`${apiBaseUrl}/functions/v1/render-story`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Render API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { url: string; cached: boolean };
  return data.url;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Renders a story-format JPEG (1080×1920) for the given variant and
 * triggers a share sheet (Web Share API) on mobile or a file download on desktop.
 *
 * When `apiBaseUrl` is provided (e.g. your Supabase project URL), rendering
 * happens server-side and only a CDN URL is returned to the client.
 * Falls back to local WebGL rendering if the API call fails.
 */
export async function shareStory(req: StoryShareRequest, apiBaseUrl?: string): Promise<void> {
  const slug = (req.posterSpec.city ?? "travlr")
    .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `travlr_story_${slug}_${req.variant}.jpg`;

  // ── API-backed path (server renders, client gets a URL) ──────────────────
  if (apiBaseUrl) {
    try {
      const cdnUrl = await renderStoryViaApi(req, apiBaseUrl);

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function"
      ) {
        // Fetch the image from CDN so we can pass a File to the share sheet
        const resp = await fetch(cdnUrl);
        const blob = await resp.blob();
        const file = new File([blob], filename, { type: "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `${req.posterSpec.city} — travlr.earth` });
          return;
        }
      }

      // Desktop: open CDN URL directly (no download needed — user can save from browser)
      const a = document.createElement("a");
      a.href = cdnUrl;
      a.download = filename;
      a.click();
      return;
    } catch (err) {
      console.warn("[shareStory] API render failed, falling back to local render:", err);
      // fall through to local render below
    }
  }

  // ── Local render fallback ─────────────────────────────────────────────────
  const blob = await renderStoryBlob(req);

  // Web Share API — works on mobile Safari (iOS 15+) and Android Chrome
  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [new File([blob], filename, { type: "image/jpeg" })] })
  ) {
    const file = new File([blob], filename, { type: "image/jpeg" });
    await navigator.share({
      files: [file],
      title: `${req.posterSpec.city} — travlr.earth`,
    });
    return;
  }

  // Desktop fallback: download the JPEG
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Renders the story canvas and returns a JPEG Blob without triggering share/download.
 * Use this when you need the raw blob (e.g. for preview or further processing).
 */
export async function renderStoryBlob(req: StoryShareRequest): Promise<Blob> {
  const canvas = await renderStoryCanvas(req);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      0.92,
    );
  });
}

/**
 * Core render: builds the themed poster map canvas then composites
 * the variant-specific story overlay on top.
 */
export async function renderStoryCanvas(req: StoryShareRequest): Promise<HTMLCanvasElement> {
  // Output size: honor an explicit request, otherwise keep the legacy 1080×1920
  // default so existing callers see no behavior change.
  const bannerMode = req.renderMode === "email-banner";
  const outW = req.output?.width  ?? (bannerMode ? BANNER_W : STORY_W);
  const outH = req.output?.height ?? (bannerMode ? BANNER_H : STORY_H);

  const printMode = req.renderMode === "poster";

  const spec: PosterSpec = {
    ...req.posterSpec,
    width:     outW,
    height:    outH,
    storyMode: false, // overlay draws its own CTA strip via drawStoryOverlay (story mode only)
    // "story" mode (default): every drawStoryOverlay variant (drawPin, drawRouteTo,
    // drawFullRoute, drawPolygon, drawPinPhotos, drawPhotoMap) already draws its own
    // complete city/route label AND its own drawBottomFade — so the plain-poster
    // layer's drawPosterText (overlayStyle) and applyFades (gradientStyle) below must
    // be suppressed, or every render draws the location name 2-3x through unrelated
    // code paths and stacks two independent gradient passes.
    // "poster" mode: the reverse — drawStoryOverlay skips its own label/fade/CTA (see
    // printMode on overlaySpec below) and this plain-poster layer provides the label
    // instead, honoring the caller's own showText/fadeOpacity/overlayStyle/
    // gradientStyle (or their defaults) — for print-product source images, which
    // shouldn't carry a "share to social" CTA footer on a physical product.
    ...(printMode ? {} : { showText: false, fadeOpacity: 0 }),
  };

  // Fonts: warn loudly (not silently) if the requested font isn't in the
  // bundled registry — it WILL render, but as a generic serif/sans-serif
  // fallback, since only registry fonts are guaranteed to be preloaded for
  // the server-side Playwright render.
  if (spec.fontFamily && !isFontRegistered(spec.fontFamily)) {
    console.warn(
      `[storyShareService] fontFamily "${spec.fontFamily}" is not in FONT_REGISTRY — ` +
      `it will fall back to a generic serif/sans-serif in the rendered image.`,
    );
  }

  // 1. Resolve real route geometry BEFORE rendering the map: explicit
  // routeSegments win; otherwise parse routeGpx (raw GPX text) via the real
  // gpxParser. Needed up front so its points can feed the camera fit below.
  let routeSegments = req.routeSegments;
  if (!routeSegments?.length && req.routeGpx) {
    try {
      routeSegments = gpxParser.parse(req.routeGpx, req.routeName ?? "Track").segments;
    } catch (err) {
      console.warn("[storyShareService] failed to parse routeGpx:", err);
    }
  }
  const hasRealRoute = !!routeSegments?.some((seg) => seg.length >= 2);

  // 2. Collect every real-world point the camera should frame — a route's
  // polyline, a trip's stops, or a polygon's ring. A single caller-supplied
  // zoom can't be expected to correctly frame an arbitrary real route (it
  // might run off-frame entirely), so when real geometry exists we let
  // MapLibre's cameraForBounds compute the right center/zoom instead of
  // trusting posterSpec.lat/lon/zoom verbatim. Pin-only renders (no route/
  // polygon/stops) are untouched — fitPoints stays empty, camera == request.
  const fitPoints: { lat: number; lon: number }[] = [];
  if (routeSegments?.length) for (const seg of routeSegments) fitPoints.push(...seg);
  if (req.stops?.length) fitPoints.push(...req.stops.map((s) => ({ lat: s.lat, lon: s.lon })));
  if (req.polygonRing?.length) fitPoints.push(...req.polygonRing);
  if (req.points?.length) fitPoints.push(...req.points.map((p) => ({ lat: p.lat, lon: p.lon })));

  // 3. Render the base poster map (MapLibre offscreen → canvas), fitting the
  // real geometry's bounds when there's enough of it to form a box.
  // 20s timeout — story renders are single shots; 90s is too long to block the UI
  //
  // email-banner padding: renderSinglePosterCanvas's own default padding
  // (see PosterRenderer.ts) reserves a large bottom margin (32% of height)
  // sized for story mode's own CTA/title text drawn below the map — banner
  // mode no longer draws any text on the image at all (see drawEmailBanner),
  // so that reservation just wastes frame instead of showing map. Generous,
  // symmetric margin on all four sides instead, sized to comfortably fit an
  // entire trip/collection without edge-clipping it.
  const bannerPadding = bannerMode
    ? {
        top:    Math.round(outH * 0.16),
        bottom: Math.round(outH * 0.16),
        left:   Math.round(outW * 0.14),
        right:  Math.round(outW * 0.14),
      }
    : undefined;
  const { canvas: posterCanvas, camera } = await renderSinglePosterCanvas(
    spec, 20_000,
    fitPoints.length >= 2 ? { points: fitPoints, maxZoom: spec.zoom, padding: bannerPadding } : undefined,
  );

  // 4. Resolve theme for overlay colors / fonts
  const theme = getTheme(spec.themeId);

  // 5. Project geo-coordinates to canvas pixel positions — using the camera
  // actually rendered with (the fitted one, when applicable), not the raw
  // request, so overlay markers land where the map really is.
  const { lat, lon, zoom } = camera;

  function project(pLat: number, pLon: number): [number, number] {
    return mercatorProject(pLat, pLon, lat, lon, zoom, outW, outH);
  }

  // 6. Pre-load any user photos so drawImage() is synchronous
  const photos = req.marker?.photos ?? [];
  if (photos.length) {
    await Promise.allSettled(photos.map(loadImage));
  }

  // 7. Build the overlay spec
  const overlaySpec: StoryOverlaySpec = {
    variant:    req.variant,
    width:      outW,
    height:     outH,
    theme,
    fontFamily: spec.fontFamily ?? "Bebas Neue",
    city:       spec.city,
    country:    spec.country,
    ctaUrl:     req.ctaUrl,
    ctaTagline: req.ctaTagline,
    marker:     req.marker,
    centerLat:  lat,
    centerLon:  lon,
    zoom,
    // B — route-to. The destination pin defaults to a fixed decorative screen
    // position (unchanged for callers with no real route) — but once a real
    // path is drawn, that fixed position can land far from where the path
    // actually ends (especially now that the camera may no longer be centered
    // on the destination at all, per the bounds fit above), so it's projected
    // from the destination's real coordinate instead.
    routeFromPx: req.routeFromLatLon
      ? project(req.routeFromLatLon[0], req.routeFromLatLon[1])
      : undefined,
    routeToPx: hasRealRoute ? project(spec.lat, spec.lon) : [outW / 2, outH * 0.40],
    routeDistanceKm: req.routeDistanceKm,
    routeMinutes:    req.routeMinutes,
    routeSegments,
    // D — full-route
    stops: req.stops?.map((stop) => ({
      label: stop.label,
      px: project(stop.lat, stop.lon)[0],
      py: project(stop.lat, stop.lon)[1],
    })) satisfies RouteStop[] | undefined,
    routeName:          req.routeName,
    routeTotalKm:       req.routeTotalKm,
    routeTotalMinutes:  req.routeTotalMinutes,
    // F — polygon
    polygonRing: req.polygonRing,
    printMode,
    // email-banner (renderMode: "email-banner") — geometry passed as geo, projected in the drawer
    bannerEvent: req.bannerEvent,
    points:      req.points,
    eyebrow:     req.eyebrow,
    headline:    req.headline,
    stats:       req.stats,
    fromName:    req.fromName,
  };

  // 8. Composite overlay onto the poster canvas
  const ctx = posterCanvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context from poster canvas");
  drawStoryOverlay(ctx, overlaySpec);

  return posterCanvas;
}
