/**
 * storyOverlay.ts
 *
 * Pure canvas-2D drawing for the five story-share variants.
 * Always call drawStoryOverlay AFTER the poster map has been drawn to the canvas,
 * and BEFORE (or instead of) drawStoryCta — this module calls drawStoryCta itself.
 *
 * Canvas coords assume 1080×1920 (9:16) but scale proportionally to any size.
 */

import type { ResolvedTheme } from "@/features/theme/domain/types";
import { drawStoryCta, getCtaPanelHeight } from "./storyCta";
import { drawRoutesWithProjector } from "@/features/routes/infrastructure/rendering";
import type { Route } from "@/features/routes/domain/types";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ShareVariant =
  | "pin"
  | "route-to"
  | "photo-map"
  | "full-route"
  | "pin-photos"
  | "polygon";

/** Plain lat/lon point — real geo geometry (not yet projected to canvas pixels). */
export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface DiaryMarker {
  /** Place name (city / venue) */
  title: string;
  /** Short memory note shown as floating chip */
  note?: string;
  /** Data URLs for attached photos (used by pin-photos and photo-map) */
  photos?: string[];
}

export interface RouteStop {
  label: string;
  /** Canvas pixel X coordinate (use mercatorProject to compute) */
  px: number;
  /** Canvas pixel Y coordinate */
  py: number;
}

export interface StoryOverlaySpec {
  variant: ShareVariant;
  width: number;
  height: number;
  theme: ResolvedTheme;
  fontFamily: string;
  city: string;
  country: string;
  ctaUrl?: string;
  ctaTagline?: string;
  /** "poster" mode: skip this overlay's own place-label/bottom-fade/CTA footer — the
   * plain-poster overlayStyle/gradientStyle layer (drawn underneath, before this overlay
   * runs) provides the label instead. Route/pin/polygon content still draws normally. */
  printMode?: boolean;
  // A, B, E
  marker?: DiaryMarker;
  // B — canvas pixel coords for the route path
  routeFromPx?: [number, number];
  routeToPx?: [number, number];
  routeDistanceKm?: number;
  routeMinutes?: number;
  // D — full route
  stops?: RouteStop[];
  routeName?: string;
  routeTotalKm?: number;
  routeTotalMinutes?: number;
  // Real polyline geometry (route-to / full-route) + polygon ring (polygon variant).
  // Requires centerLat/centerLon/zoom so raw lat/lon can be projected to canvas
  // pixels here via mercatorProject + the real drawRoutesWithProjector engine.
  centerLat?: number;
  centerLon?: number;
  zoom?: number;
  /** Real multi-point path — one array of GeoPoint per segment (e.g. per GPX <trkseg>). */
  routeSegments?: GeoPoint[][];
  // F — polygon / area
  /** Closed (or auto-closed) ring of lat/lon points. */
  polygonRing?: GeoPoint[];
  // ── email-banner (renderMode: "email-banner") ────────────────────────────
  /** Non-empty → draw the condensed landscape banner instead of a story/poster overlay. */
  bannerEvent?: BannerEvent;
  /** Point collection (geo) — projected here; drawn as pins. */
  points?: { label?: string; lat: number; lon: number }[];
  eyebrow?: string;
  headline?: string;
  stats?: { value: string; label: string }[];
  fromName?: string;
}

export type BannerEvent =
  | "trip-invite"
  | "collection-invite"
  | "dormancy-nudge"
  | "trip-recap"
  | "monthly-summary";

// ─────────────────────────────────────────────────────────────────────────────
// Mercator projection utility
// Converts lat/lon to canvas pixel coordinates given the map's center + zoom.
// Accurate enough for story-card overlays at typical city zoom levels (9-14).
// ─────────────────────────────────────────────────────────────────────────────

export function mercatorProject(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
  zoom: number,
  canvasW: number,
  canvasH: number,
): [number, number] {
  const TILE_SIZE = 512;
  const scale = TILE_SIZE * Math.pow(2, zoom);

  const toX = (lng: number) => (lng + 180) / 360;
  const toY = (la: number) => {
    const sin = Math.sin((la * Math.PI) / 180);
    return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  };

  return [
    canvasW / 2 + (toX(lon) - toX(centerLon)) * scale,
    canvasH / 2 + (toY(lat) - toY(centerLat)) * scale,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Real polyline (route-to / full-route)
//
// When the caller supplies actual geometry (spec.routeSegments — e.g. from a
// GPX track or a list of real waypoints), draw it with the SAME multi-segment
// route engine the full editor/export pipeline uses (drawRoutesWithProjector,
// src/features/routes/infrastructure/rendering.ts) instead of the decorative
// quadratic curve / straight stop-to-stop line below. Returns false (and draws
// nothing) when no usable geometry is present, so callers can fall back to the
// legacy decorative drawing untouched.
// ─────────────────────────────────────────────────────────────────────────────

function drawRealRoutePolyline(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
  accentColor: string,
  scale: number,
): boolean {
  const segments = spec.routeSegments;
  if (!segments?.length) return false;
  if (spec.centerLat === undefined || spec.centerLon === undefined || spec.zoom === undefined) {
    return false;
  }
  const pointCount = segments.reduce((n, seg) => n + seg.length, 0);
  if (pointCount < 2) return false;

  const { centerLat, centerLon, zoom, width, height } = spec;
  const projector = (lat: number, lon: number) => {
    const [x, y] = mercatorProject(lat, lon, centerLat, centerLon, zoom, width, height);
    return { x, y };
  };

  const baseRoute: Omit<Route, "strokeWidth" | "opacity"> = {
    id: "story-route",
    label: spec.routeName ?? "Route",
    source: "manual",
    segments: segments.map((seg) => seg.map(({ lat, lon }) => ({ lat, lon }))),
    color: accentColor,
    lineStyle: "solid",
    visible: true,
    showEndpoints: false,
    startMarker: { iconId: "circle", color: accentColor, size: 1 },
    finishMarker: { iconId: "flag", color: accentColor, size: 1 },
  };

  // Glow pass (wide, faint) then the crisp line on top — matches the look of
  // the decorative variants this replaces.
  drawRoutesWithProjector(
    ctx,
    [{ ...baseRoute, strokeWidth: 22 * scale, opacity: 0.12 }],
    projector,
  );
  drawRoutesWithProjector(
    ctx,
    [{ ...baseRoute, strokeWidth: 5 * scale, opacity: 0.95 }],
    projector,
  );

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export function drawStoryOverlay(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
): void {
  // Email-banner mode: a self-contained landscape "condensed info" treatment — its own
  // geometry + panel, no story variant switch, no social CTA. Short-circuit here.
  if (spec.bannerEvent) {
    drawEmailBanner(ctx, spec);
    return;
  }

  // Print mode has no CTA strip to reserve room for — the variant content uses the
  // full canvas height instead.
  const ctaH = spec.printMode ? 0 : getCtaPanelHeight(spec.height);
  const mapH = spec.height - ctaH; // usable map canvas area above the CTA strip

  switch (spec.variant) {
    case "pin":        drawPin(ctx, spec, mapH);        break;
    case "route-to":   drawRouteTo(ctx, spec, mapH);    break;
    case "photo-map":  drawPhotoMap(ctx, spec, mapH);   break;
    case "full-route": drawFullRoute(ctx, spec, mapH);  break;
    case "pin-photos": drawPinPhotos(ctx, spec, mapH);  break;
    case "polygon":    drawPolygon(ctx, spec, mapH);    break;
  }

  // Social "share to" CTA strip — skipped in print mode (a physical product doesn't
  // need a "Discover more · travlr.earth" footer baked in).
  if (!spec.printMode) {
    drawStoryCta(ctx, spec.width, spec.height, spec.theme, spec.fontFamily, {
      city: spec.city,
      country: spec.country,
      url: spec.ctaUrl,
      tagline: spec.ctaTagline,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email-banner — a landscape "condensed info" treatment for inbox banners.
//
// Geometry is DATA-driven (draw whatever's supplied: routeSegments, stops, points),
// the panel is EVENT-driven (bannerEvent picks the default eyebrow/framing). The five
// events differ only in which geometry they carry + their copy:
//   trip-invite / trip-recap → route line + stop pins
//   collection-invite        → a cluster of points
//   dormancy-nudge           → a single point
//   monthly-summary          → routes + points mixed
// ─────────────────────────────────────────────────────────────────────────────

const BANNER_REF_W = 1200;

/**
 * Geometry only — routes, then stops, then points (draw whatever's
 * present). Used to also draw a bottom+left gradient scrim and an eyebrow/
 * headline/stat-row text block (see DEFAULT_EYEBROW, drawStatRow in git
 * history), sized for the story-share use case. The email pipeline that
 * actually consumes `renderMode: "email-banner"` now draws its own
 * gradient and copy on top of this image (see the emails repo's
 * templates/_layout.tsx `Header` component) — baking the same thing in
 * here too just doubled it up, so this is map content only now: no
 * gradient, no text. `eyebrow`/`headline`/`stats`/`fromName` on the request
 * are unused for this reason; kept on the type for now since the caller
 * still sends them (see docs/map-header-plan.md in the emails repo).
 */
function drawEmailBanner(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
): void {
  const W = spec.width, H = spec.height;
  const sc = W / BANNER_REF_W;
  const accent = spec.theme.map.roads.major;

  drawRealRoutePolyline(ctx, spec, accent, sc);
  if (spec.stops?.length) {
    for (const st of spec.stops) drawPinMarker(ctx, st.px, st.py, sc * 0.82, accent);
  }
  if (spec.points?.length && spec.centerLat !== undefined && spec.centerLon !== undefined && spec.zoom !== undefined) {
    for (const p of spec.points) {
      const [x, y] = mercatorProject(p.lat, p.lon, spec.centerLat, spec.centerLon, spec.zoom, W, H);
      drawPinMarker(ctx, x, y, sc * 0.78, accent);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared drawing helpers
// ─────────────────────────────────────────────────────────────────────────────

const REF_W = 1080;

function s(spec: { width: number }, ref = REF_W) {
  return spec.width / ref;
}

/** Rounded rectangle path */
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Floating memory-note chip */
function drawNoteChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  scale: number,
  accentColor: string,
) {
  ctx.save();
  const fs = Math.round(20 * scale);
  ctx.font = `400 ${fs}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
  const tw = ctx.measureText(text).width;
  const padX = 24 * scale;
  const padY = 14 * scale;
  const dotR = 5 * scale;
  const gap  = 12 * scale;
  const totalW = dotR * 2 + gap + tw + padX * 2;
  const totalH = fs + padY * 2;
  const x = cx - totalW / 2;
  const y = cy - totalH / 2;

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  rrect(ctx, x, y, totalW, totalH, totalH / 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = Math.max(1, scale);
  rrect(ctx, x, y, totalW, totalH, totalH / 2);
  ctx.stroke();

  // Dot
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(x + padX + dotR, cy, dotR, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX + dotR * 2 + gap, cy);

  ctx.restore();
}

/** Location pin (glow rings + inner circle) */
function drawPinMarker(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  scale: number,
  color: string,
) {
  ctx.save();

  // Outer glow rings
  [32, 22].forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(px, py, r * scale, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.06 - i * 0.02})`;
    ctx.fill();
  });

  // Drop shadow
  ctx.beginPath();
  ctx.ellipse(px, py + 10 * scale, 8 * scale, 3 * scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();

  // Pin circle
  ctx.beginPath();
  ctx.arc(px, py, 10 * scale, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Inner dot
  ctx.beginPath();
  ctx.arc(px, py, 4 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();

  ctx.restore();
}

/** Bottom gradient fade into theme background */
function drawBottomFade(
  ctx: CanvasRenderingContext2D,
  width: number,
  mapH: number,
  bgColor: string,
  fractionOfMapH = 0.5,
) {
  const fadeH = mapH * fractionOfMapH;
  const g = ctx.createLinearGradient(0, mapH - fadeH, 0, mapH);
  g.addColorStop(0, bgColor + "00");
  g.addColorStop(1, bgColor + "f5");
  ctx.fillStyle = g;
  ctx.fillRect(0, mapH - fadeH, width, fadeH);
}

/** Place name + subtitle just above CTA strip */
function drawPlaceLabel(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
  mapH: number,
  subtitle?: string,
) {
  const sc = s(spec);
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const pad = 52 * sc;
  const nameSize = 68 * sc;
  const subSize  = 26 * sc;
  const nameY = mapH - 50 * sc;
  const subY  = mapH - 16 * sc;

  ctx.font = `700 ${nameSize}px "${spec.fontFamily}", sans-serif`;
  ctx.fillStyle = spec.theme.ui.text;
  ctx.fillText(spec.city, pad, nameY);

  ctx.font = `400 ${subSize}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
  ctx.globalAlpha = 0.45;
  ctx.fillText(subtitle ?? `${spec.country}`, pad, subY);
  ctx.globalAlpha = 1;

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant A — Pin on map
// ─────────────────────────────────────────────────────────────────────────────

function drawPin(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
  mapH: number,
) {
  const sc = s(spec);
  const accentColor = spec.theme.map.roads.major;
  // Pin is always at map center (marker = center of the render)
  const pinX = spec.width / 2;
  const pinY = mapH * 0.44;

  if (!spec.printMode) drawBottomFade(ctx, spec.width, mapH, spec.theme.ui.bg, 0.52);
  drawPinMarker(ctx, pinX, pinY, sc, accentColor);

  if (spec.marker?.note) {
    drawNoteChip(ctx, spec.marker.note, pinX, pinY - 56 * sc, sc, accentColor);
  }

  if (!spec.printMode) {
    const sub = `${spec.country}  ·  ${spec.theme.name}`;
    drawPlaceLabel(ctx, spec, mapH, sub);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant B — Route to marker
// ─────────────────────────────────────────────────────────────────────────────

function drawRouteTo(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
  mapH: number,
) {
  const sc = s(spec);
  const accentColor = spec.theme.map.roads.major;

  // Veil for better contrast on the route
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(0, 0, spec.width, mapH);

  // Defaults: from bottom-center to upper-center
  const [fx, fy] = spec.routeFromPx ?? [spec.width / 2, mapH * 0.88];
  const [tx, ty] = spec.routeToPx  ?? [spec.width / 2, mapH * 0.40];

  // Prefer the real multi-point path when actual geometry was supplied
  // (e.g. a GPX track or real waypoints) — falls back to the decorative
  // quadratic curve below when no usable routeSegments are present.
  const drewRealPath = drawRealRoutePolyline(ctx, spec, accentColor, sc);

  if (!drewRealPath) {
    // Control point for a gentle curve
    const cpX = fx + (tx - fx) * 0.3;
    const cpY = fy + (ty - fy) * 0.5;

    ctx.save();

    // Glow
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(cpX, cpY, tx, ty);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 18 * sc;
    ctx.globalAlpha = 0.12;
    ctx.lineCap = "round";
    ctx.stroke();

    // Dashed route line
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(cpX, cpY, tx, ty);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 5 * sc;
    ctx.globalAlpha = 0.92;
    ctx.setLineDash([18 * sc, 10 * sc]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  // Start marker (origin — hollow)
  ctx.save();
  ctx.beginPath();
  ctx.arc(fx, fy, 9 * sc, 0, Math.PI * 2);
  ctx.fillStyle = `${accentColor}55`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(fx, fy, 5 * sc, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.restore();

  // End pin (destination)
  drawPinMarker(ctx, tx, ty, sc, accentColor);

  // Distance chip
  if (spec.routeDistanceKm !== undefined) {
    const label = spec.routeMinutes !== undefined
      ? `${spec.routeDistanceKm.toFixed(1)} km · ${spec.routeMinutes} min`
      : `${spec.routeDistanceKm.toFixed(1)} km`;
    const midX = (fx + tx) / 2 + 60 * sc;
    const midY = (fy + ty) / 2;
    drawNoteChip(ctx, label, midX, midY, sc * 0.85, accentColor);
  }

  if (spec.marker?.note) {
    drawNoteChip(ctx, spec.marker.note, spec.width / 2, mapH * 0.12, sc, accentColor);
  }

  if (!spec.printMode) {
    drawBottomFade(ctx, spec.width, mapH, spec.theme.ui.bg, 0.42);
    drawPlaceLabel(ctx, spec, mapH, spec.city);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant C — Photo + mini map
// ─────────────────────────────────────────────────────────────────────────────

function drawPhotoMap(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
  mapH: number,
) {
  const sc = s(spec);
  const splitY = mapH * 0.54;

  // ── Photo half (top 54%) ──────────────────────────────────────────────────
  if (spec.marker?.photos?.[0]) {
    // Draw user photo
    const img = new Image();
    img.src = spec.marker.photos[0];
    // Synchronous draw assumes image is already loaded (caller must ensure this)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, spec.width, splitY);
    ctx.clip();
    // Draw cover-fit
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = spec.width / splitY;
    let sw, sh, sx, sy;
    if (ir > cr) { sh = splitY; sw = sh * ir; sx = (spec.width - sw) / 2; sy = 0; }
    else         { sw = spec.width; sh = sw / ir; sx = 0; sy = (splitY - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh);
    ctx.restore();
  } else {
    // Use the existing poster map image in the photo half but with a warmer filter effect.
    // Apply a semi-opaque warm overlay to make the map top feel like a photo.
    ctx.save();
    ctx.fillStyle = "rgba(20,10,5,0.28)";
    ctx.fillRect(0, 0, spec.width, splitY);
    ctx.restore();
  }

  // Photo fade at bottom of photo area
  const photoFade = ctx.createLinearGradient(0, splitY * 0.55, 0, splitY);
  photoFade.addColorStop(0, "rgba(0,0,0,0)");
  photoFade.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = photoFade;
  ctx.fillRect(0, 0, spec.width, splitY);

  // Memory note in photo area
  if (spec.marker?.note) {
    const accentColor = spec.theme.map.roads.major;
    drawNoteChip(ctx, spec.marker.note, spec.width / 2, 56 * sc, sc, accentColor);
  }

  // Place name in photo area — skipped in print mode (the base poster label covers it)
  if (!spec.printMode) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const pad = 52 * sc;
    ctx.font = `700 ${64 * sc}px "${spec.fontFamily}", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(spec.city, pad, splitY - 48 * sc);
    ctx.font = `400 ${24 * sc}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = spec.theme.ui.text;
    ctx.fillText(`${spec.country} · your memory`, pad, splitY - 16 * sc);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Divider ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(0, splitY, spec.width, Math.max(1, sc));

  // ── Map half (bottom) — darken to contrast with photo ─────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, splitY, spec.width, mapH - splitY);

  // Pin in map half (centered horizontally, centered in lower section)
  const pinX = spec.width / 2;
  const pinY = splitY + (mapH - splitY) * 0.42;
  const accentColor = spec.theme.map.roads.major;
  drawPinMarker(ctx, pinX, pinY, sc, accentColor);

  // Coords below pin
  ctx.save();
  ctx.font = `400 ${18 * sc}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = spec.theme.ui.text;
  ctx.fillText(`${spec.city}`, pinX, pinY + 28 * sc);
  ctx.globalAlpha = 1;
  ctx.restore();

  if (!spec.printMode) drawBottomFade(ctx, spec.width, mapH, spec.theme.ui.bg, 0.35);
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant D — Full route
// ─────────────────────────────────────────────────────────────────────────────

function drawFullRoute(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
  mapH: number,
) {
  const sc = s(spec);
  const accentColor = spec.theme.map.roads.major;
  const stops = spec.stops ?? [];

  if (stops.length < 2 && !spec.routeSegments?.length) return;

  // Prefer the real multi-point path (e.g. GPX track) when supplied — falls
  // back to the straight stop-to-stop lines below when it isn't.
  const drewRealPath = drawRealRoutePolyline(ctx, spec, accentColor, sc);

  if (!drewRealPath && stops.length >= 2) {
    ctx.save();

    // Route glow
    ctx.beginPath();
    ctx.moveTo(stops[0].px, stops[0].py);
    for (let i = 1; i < stops.length; i++) ctx.lineTo(stops[i].px, stops[i].py);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 24 * sc;
    ctx.globalAlpha = 0.10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Route line
    ctx.beginPath();
    ctx.moveTo(stops[0].px, stops[0].py);
    for (let i = 1; i < stops.length; i++) ctx.lineTo(stops[i].px, stops[i].py);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 5 * sc;
    ctx.globalAlpha = 0.95;
    ctx.stroke();

    ctx.restore();
  }

  // Stop markers + labels
  stops.forEach((stop, i) => {
    const isFirst = i === 0;
    const isLast  = i === stops.length - 1;

    ctx.save();

    // Marker
    const r = isLast ? 11 * sc : 7 * sc;
    ctx.beginPath();
    ctx.arc(stop.px, stop.py, r * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = `${accentColor}22`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(stop.px, stop.py, r, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = isFirst ? 0.6 : 0.95;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(stop.px, stop.py, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.globalAlpha = 1;
    ctx.fill();

    // Label (right of marker, left if near right edge)
    const fs = 18 * sc;
    ctx.font = `400 ${fs}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = stop.px > spec.width * 0.75 ? "right" : "left";
    ctx.textBaseline = "middle";
    const labelX = stop.px > spec.width * 0.75
      ? stop.px - r - 6 * sc
      : stop.px + r + 6 * sc;
    ctx.fillText(stop.label, labelX, stop.py);

    ctx.restore();
  });

  // Stats bar above CTA — skipped in print mode (its bottom-anchored position collides
  // with the base poster label, and the route name would duplicate it anyway).
  if (spec.printMode) return;

  drawBottomFade(ctx, spec.width, mapH, spec.theme.ui.bg, 0.55);

  const pad = 52 * sc;
  const statsY = mapH - 12 * sc;

  ctx.save();
  ctx.textBaseline = "alphabetic";

  // Route name
  ctx.font = `700 ${64 * sc}px "${spec.fontFamily}", sans-serif`;
  ctx.fillStyle = spec.theme.ui.text;
  ctx.textAlign = "left";
  ctx.fillText(spec.routeName ?? spec.city, pad, statsY - 68 * sc);

  // Sub: theme name
  ctx.font = `400 ${22 * sc}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
  ctx.globalAlpha = 0.42;
  ctx.fillText(`${stops.length} stops · ${spec.theme.name}`, pad, statsY - 40 * sc);
  ctx.globalAlpha = 1;

  // Stat pills: distance · stops · time
  const statItems = [
    spec.routeTotalKm ? `${spec.routeTotalKm.toFixed(1)} km` : null,
    `${stops.length} stops`,
    spec.routeTotalMinutes ? `~${Math.round(spec.routeTotalMinutes / 60)}h${spec.routeTotalMinutes % 60 > 0 ? ` ${spec.routeTotalMinutes % 60}m` : ""}` : null,
  ].filter(Boolean) as string[];

  let statX = pad;
  statItems.forEach((item) => {
    const fs2 = 22 * sc;
    ctx.font = `600 ${fs2}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
    const tw = ctx.measureText(item).width;
    const ph = 10 * sc; const pv = 5 * sc;
    rrect(ctx, statX, statsY - 28 * sc, tw + ph * 2, fs2 + pv * 2, 6 * sc);
    ctx.fillStyle = `${accentColor}22`;
    ctx.fill();
    ctx.fillStyle = accentColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(item, statX + ph, statsY - 28 * sc + (fs2 / 2) + pv);
    statX += tw + ph * 2 + 12 * sc;
  });

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant E — Pin + multiple photos
// ─────────────────────────────────────────────────────────────────────────────

function drawPinPhotos(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
  mapH: number,
) {
  const sc = s(spec);
  const accentColor = spec.theme.map.roads.major;
  const pinX = spec.width / 2;
  const pinY = mapH * 0.44;

  // Photo thumbnail layout — scattered around the pin
  const photoSlots: Array<{ dx: number; dy: number; w: number; h: number; rot: number }> = [
    { dx: -220, dy: -190, w: 220, h: 170, rot: -5 },
    { dx:  100, dy: -160, w: 200, h: 160, rot:  4 },
    { dx: -200, dy:   60, w: 200, h: 155, rot: -3 },
  ];

  const photos = spec.marker?.photos ?? [];

  photoSlots.forEach(({ dx, dy, w, h, rot }, i) => {
    const photo = photos[i];
    const cx = pinX + dx * sc;
    const cy = pinY + dy * sc;
    const pw = w * sc;
    const ph = h * sc;
    const border = 5 * sc;
    const capH  = 28 * sc;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);

    // Shadow
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur  = 20 * sc;
    ctx.shadowOffsetY = 6 * sc;

    // Polaroid frame
    ctx.fillStyle = "#ffffff";
    rrect(ctx, -pw / 2 - border, -ph / 2 - border, pw + border * 2, ph + capH + border * 2, 4 * sc);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur  = 0;
    ctx.shadowOffsetY = 0;

    // Photo area
    ctx.save();
    rrect(ctx, -pw / 2, -ph / 2, pw, ph, 2 * sc);
    ctx.clip();

    if (photo) {
      const img = new Image();
      img.src = photo;
      // Synchronous — caller must ensure images are loaded
      try {
        const ir = img.naturalWidth / img.naturalHeight;
        const cr = pw / ph;
        let sw, sh, sx, sy;
        if (ir > cr) { sh = ph; sw = sh * ir; sx = (pw - sw) / 2; sy = 0; }
        else         { sw = pw; sh = sw / ir; sx = 0; sy = (ph - sh) / 2; }
        ctx.drawImage(img, -pw / 2 + sx, -ph / 2 + sy, sw, sh);
      } catch { /* image not loaded yet */ }
    } else {
      // Placeholder gradient (warm tones matching theme palette)
      const palettes = [
        [spec.theme.map.land,      spec.theme.map.landcover],
        [spec.theme.map.water,     spec.theme.map.roads.major],
        [spec.theme.map.buildings, spec.theme.map.land],
      ];
      const [c1, c2] = palettes[i % palettes.length];
      const g = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    }

    ctx.restore();

    // Caption area (Polaroid bottom strip)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-pw / 2, ph / 2, pw, capH + border);

    // Caption text
    ctx.font = `400 ${14 * sc}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
    ctx.fillStyle = "#555";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spec.city, 0, ph / 2 + capH / 2 + border / 2);

    ctx.restore();
  });

  // Pin on top of photos
  drawPinMarker(ctx, pinX, pinY, sc, accentColor);

  if (spec.marker?.note) {
    drawNoteChip(ctx, spec.marker.note, pinX, mapH * 0.11, sc, accentColor);
  }

  if (!spec.printMode) {
    const photoCount = Math.min(photos.length || photoSlots.length, photoSlots.length);
    const sub = `${spec.country}  ·  ${photoCount} photo${photoCount !== 1 ? "s" : ""}  ·  ${spec.theme.name}`;
    drawBottomFade(ctx, spec.width, mapH, spec.theme.ui.bg, 0.48);
    drawPlaceLabel(ctx, spec, mapH, sub);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant F — Polygon / area
//
// Projects a closed ring of lat/lon points (spec.polygonRing) using the same
// mercatorProject math the routes/pins use, then fills + strokes the shape
// with the active theme's colors. Clean-slate — no polygon support existed
// anywhere in this codebase before.
// ─────────────────────────────────────────────────────────────────────────────

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  spec: StoryOverlaySpec,
  mapH: number,
) {
  const sc = s(spec);
  const accentColor = spec.theme.map.roads.major;
  const ring = spec.polygonRing ?? [];

  if (!spec.printMode) drawBottomFade(ctx, spec.width, mapH, spec.theme.ui.bg, 0.5);

  if (
    ring.length < 3 ||
    spec.centerLat === undefined ||
    spec.centerLon === undefined ||
    spec.zoom === undefined
  ) {
    if (!spec.printMode) drawPlaceLabel(ctx, spec, mapH, `${spec.country}  ·  ${spec.theme.name}`);
    return;
  }

  const { centerLat, centerLon, zoom, width, height } = spec;
  const pts = ring.map(({ lat, lon }) =>
    mercatorProject(lat, lon, centerLat, centerLon, zoom, width, height),
  );

  ctx.save();

  // Veil for contrast, same treatment as route-to
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0, 0, spec.width, mapH);

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();

  // Fill — theme accent at low opacity so the basemap stays legible underneath
  ctx.fillStyle = `${accentColor}33`;
  ctx.fill();

  // Outline glow + crisp stroke, matching the route line treatment
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 14 * sc;
  ctx.globalAlpha = 0.14;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 4 * sc;
  ctx.stroke();

  ctx.restore();

  // Vertex markers (small dots at each ring point)
  ctx.save();
  for (const [px, py] of pts) {
    ctx.beginPath();
    ctx.arc(px, py, 4 * sc, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
  }
  ctx.restore();

  if (!spec.printMode) {
    const sub = `${spec.country}  ·  ${ring.length} points  ·  ${spec.theme.name}`;
    drawPlaceLabel(ctx, spec, mapH, sub);
  }
}
