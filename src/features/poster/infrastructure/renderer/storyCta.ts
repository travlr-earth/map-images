import type { ResolvedTheme } from "@/features/theme/domain/types";

export interface StoryCta {
  city: string;
  country: string;
  url?: string;   // default: "travlr.earth"
  tagline?: string; // default: "Discover more"
}

/** Fraction of canvas height used by the CTA panel. */
const PANEL_FRACTION = 0.155;
/** Reference width for font scaling. */
const REF_WIDTH = 1080;

/**
 * Draws a branded footer panel at the bottom of the canvas for
 * TikTok / Instagram story exports — Strava-style but for Travlr.
 *
 * Designed for 1080×1920 (9:16) but scales to any size.
 * Call AFTER drawPosterText so the panel sits above all other layers.
 */
export function drawStoryCta(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: ResolvedTheme,
  fontFamily: string,
  cta: StoryCta,
): void {
  const panelH = Math.round(height * PANEL_FRACTION);
  const panelY = height - panelH;
  const s = width / REF_WIDTH; // scale factor relative to 1080px reference

  ctx.save();

  // ── Panel background ──────────────────────────────────────────────────────
  ctx.fillStyle = theme.ui.bg;
  ctx.fillRect(0, panelY, width, panelH);

  // Top separator (subtle)
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = theme.ui.text;
  ctx.fillRect(0, panelY, width, Math.max(1, Math.round(s)));
  ctx.globalAlpha = 1;

  // ── Row positions ─────────────────────────────────────────────────────────
  const upperY = panelY + panelH * 0.36;
  const lowerY = panelY + panelH * 0.70;

  // ── Left: wordmark "◈ travlr" ─────────────────────────────────────────────
  const pad = Math.round(52 * s);
  ctx.font = `700 ${Math.round(34 * s)}px "${fontFamily}", sans-serif`;
  ctx.fillStyle = theme.ui.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  (ctx as any).letterSpacing = "0.03em";
  ctx.fillText("◈  travlr", pad, upperY);

  // ── Right: city name ──────────────────────────────────────────────────────
  ctx.font = `400 ${Math.round(27 * s)}px "${fontFamily}", sans-serif`;
  ctx.textAlign = "right";
  (ctx as any).letterSpacing = "0.13em";
  ctx.fillText(cta.city.toUpperCase(), width - pad, upperY);

  // ── Bottom centre: URL + tagline ──────────────────────────────────────────
  const url = cta.url ?? "travlr.earth";
  const tagline = cta.tagline ?? "Discover more";

  // System font for the URL so it reads as a real link
  ctx.font = `400 ${Math.round(17 * s)}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  (ctx as any).letterSpacing = "0.05em";
  ctx.globalAlpha = 0.48;
  ctx.fillStyle = theme.ui.text;
  ctx.fillText(`${tagline}  ·  ${url}`, width / 2, lowerY);
  ctx.globalAlpha = 1;

  ctx.restore();
}

/**
 * Returns the pixel height that the CTA panel will occupy for a given canvas height.
 * Useful for knowing how much of the poster content will be covered.
 */
export function getCtaPanelHeight(canvasHeight: number): number {
  return Math.round(canvasHeight * PANEL_FRACTION);
}
