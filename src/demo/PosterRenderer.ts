import maplibregl from "maplibre-gl";
import { generateMapStyle } from "@/features/map/infrastructure/maplibreStyle";
import { getTheme } from "@/features/theme/infrastructure/themeRepository";
import { applyFades, type GradientStyle } from "@/features/poster/infrastructure/renderer/layers";
import { drawPosterText, type OverlayStyle } from "@/features/poster/infrastructure/renderer/typography";
import { drawStoryCta } from "@/features/poster/infrastructure/renderer/storyCta";
import type { ResolvedTheme } from "@/features/theme/domain/types";

export type { GradientStyle, OverlayStyle };

export interface PosterSpec {
  themeId: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  zoom: number;
  width: number;
  height: number;
  fontFamily?: string;
  fadeOpacity?: number;
  gradientStyle?: GradientStyle;
  showText?: boolean;
  textScale?: number;
  overlayStyle?: OverlayStyle;
  /** Named font-weight/case bundle (see TEXT_PROFILES in poster/domain/textLayout.ts). Omit for the original "classic" look. */
  textProfile?: string;
  /** Fraction (0-1) of canvas height where the label block's bottom edge sits. Omit to keep each overlayStyle's own default. */
  textBottomMargin?: number;
  /** Render the Travlr story CTA bar at the bottom of the canvas. */
  storyMode?: boolean;
  /** Override the URL shown in the story CTA (default: "travlr.earth"). */
  ctaUrl?: string;
  /** Override the tagline in the story CTA (default: "Discover more"). */
  ctaTagline?: string;
}

export interface RenderedPoster {
  themeId: string;
  dataUrl: string;
  theme: ResolvedTheme;
}

/** Real-world points the camera should frame — e.g. a route's polyline, a
 * polygon ring, or a trip's stops. When supplied, the render camera fits
 * these bounds instead of using the caller's raw lat/lon/zoom verbatim. */
export interface FitBoundsSpec {
  points: { lat: number; lon: number }[];
  /** Pixel padding reserved on each side (e.g. for CTA/title text below the
   * map). Defaults to a generous bottom margin sized for the story overlay. */
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  /** Never zoom in tighter than this — prevents a tiny/degenerate bbox
   * (e.g. two very close points) from producing an unusably close zoom. */
  maxZoom?: number;
}

/** The camera actually used to render — may differ from the caller's
 * requested lat/lon/zoom when `fitBounds` was supplied and honored. */
export interface CameraResult {
  lat: number;
  lon: number;
  zoom: number;
}

const LOAD_TIMEOUT_MS = 90_000;
const STYLE_TIMEOUT_MS = 30_000;

function waitForLoad(map: maplibregl.Map, timeoutMs = LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`map load timeout after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
    const onError = (e: any) => {
      clearTimeout(t);
      reject(new Error("map error: " + (e?.error?.message || JSON.stringify(e))));
    };
    if ((map as any).loaded?.()) {
      clearTimeout(t);
      resolve();
      return;
    }
    map.once("load", () => { clearTimeout(t); map.off("error" as any, onError); resolve(); });
    map.once("error" as any, onError);
  });
}

function waitForIdle(map: maplibregl.Map, timeoutMs = STYLE_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      console.warn("[PosterRenderer] idle timeout, continuing anyway");
      resolve();
    }, timeoutMs);
    const done = () => { clearTimeout(t); resolve(); };
    if (map.loaded() && !map.isMoving() && !map.isEasing()) { done(); return; }
    map.once("idle", done);
  });
}

function delay(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function createContainer(w: number, h: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:-${w + 100}px;top:0;width:${w}px;height:${h}px;pointer-events:none;`;
  return el;
}

/**
 * Actually waits for `fontFamily` to finish loading before we draw with it.
 *
 * Setting ctx.font to an unloaded @font-face does NOT block canvas text —
 * fillText() draws immediately with the fallback if the real glyph data
 * hasn't finished downloading yet, and (unlike DOM text) canvas never
 * re-paints once the font arrives later. `document.fonts.ready` alone does
 * NOT fix this either: it only resolves for fonts that have already been
 * requested: page's <link> registers the @font-face rules but the browser
 * only actually fetches glyph data lazily, on first use. This was the root
 * cause of fonts silently rendering as a generic fallback even for names
 * that were "supported" — nothing ever explicitly requested the load.
 */
async function ensureFontLoaded(fontFamily: string | undefined): Promise<void> {
  if (!fontFamily) return;
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`700 100px "${fontFamily}"`),
        document.fonts.load(`400 100px "${fontFamily}"`),
      ]),
      // Don't let a slow/blocked font fetch stall the whole render — worst
      // case we fall back to the generic font, same as before this fix.
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch (err) {
    console.warn(`[PosterRenderer] failed to load font "${fontFamily}" — falling back:`, err);
  }
}

async function compositeToCanvas(
  mapCanvas: HTMLCanvasElement,
  spec: PosterSpec,
  theme: ResolvedTheme,
): Promise<HTMLCanvasElement> {
  const out = document.createElement("canvas");
  out.width = spec.width;
  out.height = spec.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(mapCanvas, 0, 0, spec.width, spec.height);
  if ((spec.fadeOpacity ?? 1) > 0) {
    applyFades(ctx, spec.width, spec.height, theme.ui.bg, spec.fadeOpacity ?? 1, spec.gradientStyle ?? "symmetric");
  }
  await ensureFontLoaded(spec.fontFamily);
  drawPosterText(
    ctx, spec.width, spec.height, theme,
    { lat: spec.lat, lon: spec.lon },
    spec.city, spec.country,
    spec.fontFamily ?? "",
    spec.showText !== false,
    true,
    spec.textScale ?? 1,
    spec.overlayStyle ?? "classic",
    spec.textProfile,
    spec.textBottomMargin,
  );

  if (spec.storyMode) {
    drawStoryCta(ctx, spec.width, spec.height, theme, spec.fontFamily ?? "", {
      city: spec.city,
      country: spec.country,
      url: spec.ctaUrl,
      tagline: spec.ctaTagline,
    });
  }

  return out;
}

async function composite(
  mapCanvas: HTMLCanvasElement,
  spec: PosterSpec,
  theme: ResolvedTheme,
): Promise<string> {
  const out = await compositeToCanvas(mapCanvas, spec, theme);

  return out.toDataURL("image/jpeg", 0.88);
}

export async function renderAllPosters(
  specs: PosterSpec[],
  onProgress: (result: RenderedPoster) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!specs.length) return;

  // Small delay lets React StrictMode cancel the first mount before we allocate a map
  await delay(80);
  if (signal?.aborted) return;

  const { width, height, lat, lon, zoom } = specs[0];
  const container = createContainer(width, height);
  document.body.appendChild(container);

  const firstTheme = getTheme(specs[0].themeId);

  console.log("[PosterRenderer] creating map…");
  const map = new maplibregl.Map({
    container,
    style: generateMapStyle(firstTheme) as any,
    center: [lon, lat],
    zoom,
    interactive: false,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  try {
    if (signal?.aborted) return;

    console.log("[PosterRenderer] waiting for load…");
    await waitForLoad(map);
    console.log("[PosterRenderer] map loaded, waiting for idle…");
    await waitForIdle(map);
    console.log("[PosterRenderer] starting render loop for", specs.length, "specs");

    for (const spec of specs) {
      if (signal?.aborted) break;

      const theme = getTheme(spec.themeId);

      await new Promise<void>((resolve) => {
        const t = setTimeout(
          () => { console.warn("[PosterRenderer] style switch timeout"); resolve(); },
          STYLE_TIMEOUT_MS,
        );
        map.once("styledata" as any, () => { clearTimeout(t); resolve(); });
        map.setStyle(generateMapStyle(theme) as any, { diff: false });
      });

      if (signal?.aborted) break;

      await waitForIdle(map);
      await delay(100);

      const glCanvas = map.getCanvas();
      const dataUrl = await composite(glCanvas, spec, theme);

      onProgress({ themeId: spec.themeId, dataUrl, theme });
      console.log("[PosterRenderer] rendered", spec.themeId);
    }
  } catch (err) {
    console.error("[PosterRenderer]", err);
  } finally {
    map.remove();
    container.remove();
  }
}

/** Renders a single poster offscreen and returns the JPEG data URL. */
export async function renderSinglePoster(spec: PosterSpec): Promise<string> {
  const { canvas } = await renderSinglePosterCanvas(spec);
  return canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * Renders a single poster offscreen and returns the composited HTMLCanvasElement
 * plus the camera actually used (== the caller's lat/lon/zoom, unless `fitBounds`
 * was supplied and honored — see `FitBoundsSpec`).
 * Use the canvas when you need PNG, PDF, or WebP output — convert it yourself.
 * @param loadTimeoutMs Override the tile-load timeout (default: 90s). Use ~20s for story renders.
 * @param fitBounds When supplied (≥2 points), the render camera fits these real-world
 *   bounds via MapLibre's `cameraForBounds` instead of using `spec.lat/lon/zoom` verbatim
 *   — for real route/polygon geometry, which a single caller-guessed zoom often can't frame.
 */
export async function renderSinglePosterCanvas(
  spec: PosterSpec,
  loadTimeoutMs?: number,
  fitBounds?: FitBoundsSpec,
): Promise<{ canvas: HTMLCanvasElement; camera: CameraResult }> {
  await document.fonts.ready;
  const { width, height, lat, lon, zoom } = spec;
  const container = createContainer(width, height);
  document.body.appendChild(container);
  const theme = getTheme(spec.themeId);

  const map = new maplibregl.Map({
    container,
    style: generateMapStyle(theme) as any,
    center: [lon, lat],
    zoom,
    interactive: false,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  let camera: CameraResult = { lat, lon, zoom };

  // Fit the real geometry's bounds, if any — before waiting for tiles, so we
  // only ever load tiles for the final viewport (not the caller's guess, then
  // a second set after jumping). cameraForBounds only needs the map's transform
  // (container size, set synchronously above), not a loaded style.
  if (fitBounds && fitBounds.points.length >= 2) {
    try {
      const pts = fitBounds.points;
      const bounds = pts.slice(1).reduce(
        (b, p) => b.extend([p.lon, p.lat] as [number, number]),
        new maplibregl.LngLatBounds([pts[0].lon, pts[0].lat], [pts[0].lon, pts[0].lat]),
      );
      const fit = map.cameraForBounds(bounds, {
        padding: {
          top: fitBounds.padding?.top ?? Math.round(height * 0.10),
          bottom: fitBounds.padding?.bottom ?? Math.round(height * 0.32),
          left: fitBounds.padding?.left ?? Math.round(width * 0.10),
          right: fitBounds.padding?.right ?? Math.round(width * 0.10),
        },
        maxZoom: fitBounds.maxZoom ?? zoom,
      });
      if (fit?.center && Number.isFinite(fit.zoom)) {
        const c = maplibregl.LngLat.convert(fit.center);
        map.jumpTo({ center: c, zoom: fit.zoom! });
        camera = { lat: c.lat, lon: c.lng, zoom: fit.zoom! };
      }
    } catch (err) {
      console.warn("[PosterRenderer] cameraForBounds failed, using caller's center/zoom:", err);
    }
  }

  try {
    await waitForLoad(map, loadTimeoutMs);
    await waitForIdle(map);
    const canvas = await compositeToCanvas(map.getCanvas(), spec, theme);
    return { canvas, camera };
  } finally {
    map.remove();
    container.remove();
  }
}
