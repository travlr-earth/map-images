import {
  applyTextCase,
  computeCityFontScale,
  isLatinScript,
  resolveTextProfile,
  DEFAULT_TEXT_BOTTOM_MARGIN,
  CITY_FONT_BASE_PX,
  COORDS_FONT_BASE_PX,
  COUNTRY_FONT_BASE_PX,
  TEXT_DIMENSION_REFERENCE_PX,
  type OverlayStyleId,
  type TextProfile,
} from "@/features/poster/domain/textLayout";
import type { Coordinate } from "@/shared/geo/types";
import { formatCoordinates } from "@/shared/geo/posterBounds";
import { withAlpha } from "@/shared/utils/color";

export type OverlayStyle = OverlayStyleId;

// Use native ctx.letterSpacing so measureText accounts for tracking accurately.
// Non-Latin scripts (CJK, Arabic…) get no extra tracking.
function setCityTracking(ctx: CanvasRenderingContext2D, city: string) {
  (ctx as any).letterSpacing = isLatinScript(city) ? "0.18em" : "0px";
}
function setSubtitleTracking(ctx: CanvasRenderingContext2D) {
  (ctx as any).letterSpacing = "0.1em";
}
function clearTracking(ctx: CanvasRenderingContext2D) {
  (ctx as any).letterSpacing = "0px";
}

/**
 * Solid legibility backing for bottom-anchored label styles (classic, corner).
 * A translucent gradient toward the theme's own bg color is invisible whenever
 * that bg color is close to the map's own land fill (common for light themes —
 * confirmed on "terracotta": both are #F5EDE4), leaving text with zero contrast
 * against busy road/building detail. A fully opaque plate — mirroring
 * storyCta.ts's proven solid-panel pattern — guarantees contrast regardless of
 * theme; only its top edge is a soft gradient so the transition isn't a hard line.
 */
function drawLabelPlate(
  ctx: CanvasRenderingContext2D,
  width: number,
  plateTop: number,
  height: number,
  bgColor: string,
): void {
  const softH = Math.max(0, (height - plateTop) * 0.4);
  const solidTop = plateTop + softH;
  const g = ctx.createLinearGradient(0, plateTop, 0, solidTop);
  g.addColorStop(0, withAlpha(bgColor, 0));
  g.addColorStop(1, bgColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, plateTop, width, softH);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, solidTop, width, height - solidTop);
}

// Fallback stacks; a preferred family, when present, is prepended via stackWith.
const TITLE_FALLBACK = '"Montserrat", sans-serif';
const MONO_FALLBACK = '"IBM Plex Mono", monospace';

function stackWith(preferred: string | undefined, fallback: string): string {
  return preferred ? `"${preferred}", ${fallback}` : fallback;
}

export function drawPosterText(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  theme: { ui?: { text?: string; bg?: string }; map?: { land?: string } },
  center: Coordinate,
  city: string, country: string,
  fontFamily: string | undefined,
  showPosterText: boolean, showOverlay: boolean,
  textScale = 1,
  overlayStyle: OverlayStyle = "classic",
  textProfileId?: string,
  textBottomMargin?: number,
): void {
  if (!showPosterText) return;

  const profile = resolveTextProfile(textProfileId);
  // The profile's own fontFamily (if any) wins over the theme's -- e.g. "mono"
  // is meant to look the same regardless of which display font the theme picked.
  const effectiveFontFamily = profile.fontFamily ?? fontFamily;

  const textColor = theme.ui?.text ?? "#111111";
  const bgColor   = theme.ui?.bg   ?? "#F5F5F0";
  const titleFont = stackWith(effectiveFontFamily, TITLE_FALLBACK);
  // Country/subtitle deliberately uses a DIFFERENT family (not just a lighter
  // weight of titleFont) — many display fonts (Bebas Neue, the default, is a
  // single-weight 400-only face) have no real light/regular distinction, so
  // requesting font-weight 300 of the same family silently collapses to the
  // same visual weight as the bold city line. A genuinely different, always-
  // available system-sans face guarantees real hierarchy regardless of which
  // display font is requested. Matches the pattern already used for subtitles
  // in storyOverlay.ts/storyCta.ts.
  const subtitleFont = '-apple-system, "Helvetica Neue", "Segoe UI", sans-serif';
  const monoFont = stackWith(effectiveFontFamily, MONO_FALLBACK);

  // Scale everything relative to the reference dimension, floored so tiny
  // canvases stay legible, then apply the user's own text-scale multiplier.
  const clampedScale = Math.max(0.4, Math.min(2.5, textScale));
  const sizeRatio = Math.min(width, height) / TEXT_DIMENSION_REFERENCE_PX;
  const dimScale = Math.max(0.45, sizeRatio) * clampedScale;

  const coordsLabel = formatCoordinates(center.lat, center.lon);
  const cityLabel   = applyTextCase(city, profile.textCase);
  const countryLabel = applyTextCase(country, profile.textCase);

  if (overlayStyle === "minimal") {
    const bottomMargin = textBottomMargin ?? DEFAULT_TEXT_BOTTOM_MARGIN.minimal;
    _drawMinimal(ctx, width, height, coordsLabel, monoFont, textColor, dimScale, bottomMargin);
    return;
  }
  if (overlayStyle === "centered") {
    const bottomMargin = textBottomMargin ?? DEFAULT_TEXT_BOTTOM_MARGIN.centered;
    _drawCentered(ctx, width, height, cityLabel, city, countryLabel, coordsLabel, titleFont, subtitleFont, monoFont, textColor, dimScale, profile, bottomMargin);
    return;
  }
  if (overlayStyle === "corner") {
    const bottomMargin = textBottomMargin ?? DEFAULT_TEXT_BOTTOM_MARGIN.corner;
    _drawCorner(ctx, width, height, cityLabel, city, countryLabel, coordsLabel, titleFont, subtitleFont, monoFont, textColor, bgColor, dimScale, profile, bottomMargin);
    return;
  }
  const bottomMargin = textBottomMargin ?? DEFAULT_TEXT_BOTTOM_MARGIN.classic;
  _drawClassic(ctx, width, height, cityLabel, city, countryLabel, coordsLabel, titleFont, subtitleFont, monoFont, textColor, bgColor, dimScale, profile, bottomMargin);
}

// ── Classic ───────────────────────────────────────────────────────────────────

function _drawClassic(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  cityLabel: string, city: string,
  countryLabel: string, coordsLabel: string,
  titleFont: string, subtitleFont: string, monoFont: string,
  textColor: string, bgColor: string, dimScale: number,
  profile: TextProfile, bottomMargin: number,
): void {
  const countryFontPx = COUNTRY_FONT_BASE_PX * dimScale;
  const coordsFontPx  = COORDS_FONT_BASE_PX  * dimScale;
  let   cityFontPx    = CITY_FONT_BASE_PX * dimScale * computeCityFontScale(city);

  const maxCityW = width * 0.88;

  setCityTracking(ctx, city);
  ctx.font = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
  let cityW = ctx.measureText(cityLabel).width;
  if (cityW > maxCityW) {
    cityFontPx *= maxCityW / cityW;
    ctx.font    = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
    cityW       = ctx.measureText(cityLabel).width;
  }

  const cityM    = ctx.measureText(cityLabel);
  const cityH    = cityM.actualBoundingBoxAscent + cityM.actualBoundingBoxDescent;

  setSubtitleTracking(ctx);
  ctx.font = `${profile.countryWeight} ${countryFontPx}px ${subtitleFont}`;
  const countryM  = ctx.measureText(countryLabel);
  const countryH  = countryM.actualBoundingBoxAscent + countryM.actualBoundingBoxDescent;

  clearTracking(ctx);
  ctx.font = `400 ${coordsFontPx}px ${monoFont}`;
  const coordsM   = ctx.measureText(coordsLabel);
  const coordsH   = coordsM.actualBoundingBoxAscent + coordsM.actualBoundingBoxDescent;

  const gapMajor     = countryFontPx * 0.55;
  const gapMinor     = countryFontPx * 0.38;
  const dividerThick = Math.max(1, 2 * dimScale);

  const totalH = cityH + gapMajor + dividerThick + gapMajor + countryH + gapMinor + coordsH;
  const blockBottom = height * bottomMargin;

  // Legibility plate — see drawLabelPlate's doc comment for why this replaced
  // a translucent fade-to-bg-color gradient.
  const plateTop = blockBottom - totalH - gapMajor * 1.6;
  drawLabelPlate(ctx, width, plateTop, height, bgColor);

  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle    = textColor;

  const cityBaseY = blockBottom - totalH + cityM.actualBoundingBoxAscent;
  setCityTracking(ctx, city);
  ctx.font = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
  ctx.fillText(cityLabel, width * 0.5, cityBaseY);

  const dividerHalfW = Math.min(cityW, countryM.width) * 0.38;
  const dividerY     = cityBaseY + cityM.actualBoundingBoxDescent + gapMajor + dividerThick * 0.5;
  clearTracking(ctx);
  ctx.strokeStyle = textColor;
  ctx.lineWidth   = dividerThick;
  ctx.beginPath();
  ctx.moveTo(width * 0.5 - dividerHalfW, dividerY);
  ctx.lineTo(width * 0.5 + dividerHalfW, dividerY);
  ctx.stroke();

  const countryBaseY = dividerY + dividerThick * 0.5 + gapMajor + countryM.actualBoundingBoxAscent;
  setSubtitleTracking(ctx);
  ctx.font = `${profile.countryWeight} ${countryFontPx}px ${subtitleFont}`;
  ctx.fillText(countryLabel, width * 0.5, countryBaseY);

  const coordsBaseY = countryBaseY + countryM.actualBoundingBoxDescent + gapMinor + coordsM.actualBoundingBoxAscent;
  ctx.globalAlpha = 0.72;
  clearTracking(ctx);
  ctx.font = `400 ${coordsFontPx}px ${monoFont}`;
  ctx.fillText(coordsLabel, width * 0.5, coordsBaseY);
  ctx.globalAlpha = 1;
}

// ── Minimal ───────────────────────────────────────────────────────────────────

function _drawMinimal(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  coordsLabel: string, monoFont: string,
  textColor: string, dimScale: number,
  bottomMargin: number,
): void {
  const coordsFontPx = COORDS_FONT_BASE_PX * dimScale * 1.15;
  clearTracking(ctx);
  ctx.font = `400 ${coordsFontPx}px ${monoFont}`;

  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle    = textColor;
  ctx.globalAlpha  = 0.8;
  ctx.fillText(coordsLabel, width * 0.5, height * bottomMargin);
  ctx.globalAlpha  = 1;
}

// ── Centered ──────────────────────────────────────────────────────────────────

function _drawCentered(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  cityLabel: string, city: string,
  countryLabel: string, coordsLabel: string,
  titleFont: string, subtitleFont: string, monoFont: string,
  textColor: string, dimScale: number,
  profile: TextProfile, bottomMargin: number,
): void {
  let cityFontPx = CITY_FONT_BASE_PX * dimScale * 1.25 * computeCityFontScale(city);
  const maxCityW = width * 0.88;

  setCityTracking(ctx, city);
  ctx.font = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
  const rawW = ctx.measureText(cityLabel).width;
  if (rawW > maxCityW) cityFontPx *= maxCityW / rawW;

  const countryFontPx = COUNTRY_FONT_BASE_PX * dimScale * 1.1;
  const coordsFontPx  = COORDS_FONT_BASE_PX  * dimScale;
  const gapMajor      = countryFontPx * 0.7;
  const dividerThick  = Math.max(1, 2 * dimScale);

  setCityTracking(ctx, city);
  ctx.font = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
  const cityM = ctx.measureText(cityLabel);

  setSubtitleTracking(ctx);
  ctx.font = `${profile.countryWeight} ${countryFontPx}px ${subtitleFont}`;
  const countryM = ctx.measureText(countryLabel);

  const blockH = cityM.actualBoundingBoxAscent + cityM.actualBoundingBoxDescent
    + gapMajor + dividerThick + gapMajor
    + countryM.actualBoundingBoxAscent + countryM.actualBoundingBoxDescent;

  const cityBaseY = height * 0.5 - blockH * 0.5 + cityM.actualBoundingBoxAscent;

  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle    = textColor;

  setCityTracking(ctx, city);
  ctx.font = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
  ctx.fillText(cityLabel, width * 0.5, cityBaseY);

  const divW     = Math.min(ctx.measureText(cityLabel).width, countryM.width) * 0.32;
  const dividerY = cityBaseY + cityM.actualBoundingBoxDescent + gapMajor + dividerThick * 0.5;
  clearTracking(ctx);
  ctx.strokeStyle = textColor;
  ctx.lineWidth   = dividerThick;
  ctx.beginPath();
  ctx.moveTo(width * 0.5 - divW, dividerY);
  ctx.lineTo(width * 0.5 + divW, dividerY);
  ctx.stroke();

  const countryBaseY = dividerY + dividerThick * 0.5 + gapMajor + countryM.actualBoundingBoxAscent;
  setSubtitleTracking(ctx);
  ctx.font = `${profile.countryWeight} ${countryFontPx}px ${subtitleFont}`;
  ctx.fillText(countryLabel, width * 0.5, countryBaseY);

  clearTracking(ctx);
  ctx.font = `400 ${coordsFontPx}px ${monoFont}`;
  ctx.globalAlpha = 0.65;
  ctx.fillText(coordsLabel, width * 0.5, height * bottomMargin);
  ctx.globalAlpha = 1;
}

// ── Corner ────────────────────────────────────────────────────────────────────

function _drawCorner(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  cityLabel: string, city: string,
  countryLabel: string, coordsLabel: string,
  titleFont: string, subtitleFont: string, monoFont: string,
  textColor: string, bgColor: string, dimScale: number,
  profile: TextProfile, bottomMargin: number,
): void {
  let cityFontPx = CITY_FONT_BASE_PX * dimScale * 0.85 * computeCityFontScale(city);
  const maxCityW = width * 0.52;

  setCityTracking(ctx, city);
  ctx.font = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
  const rawW = ctx.measureText(cityLabel).width;
  if (rawW > maxCityW) cityFontPx *= maxCityW / rawW;

  const countryFontPx = COUNTRY_FONT_BASE_PX * dimScale * 0.9;
  const coordsFontPx  = COORDS_FONT_BASE_PX  * dimScale * 0.85;
  const gapMajor      = countryFontPx * 0.45;
  const gapMinor      = countryFontPx * 0.32;
  const dividerThick  = Math.max(1, 1.5 * dimScale);

  setCityTracking(ctx, city);
  ctx.font = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
  const cityM = ctx.measureText(cityLabel);

  setSubtitleTracking(ctx);
  ctx.font = `${profile.countryWeight} ${countryFontPx}px ${subtitleFont}`;
  const countryM = ctx.measureText(countryLabel);

  clearTracking(ctx);
  ctx.font = `400 ${coordsFontPx}px ${monoFont}`;
  const coordsM = ctx.measureText(coordsLabel);

  const totalH = cityM.actualBoundingBoxAscent + cityM.actualBoundingBoxDescent
    + gapMajor + dividerThick + gapMajor
    + countryM.actualBoundingBoxAscent + countryM.actualBoundingBoxDescent
    + gapMinor + coordsM.actualBoundingBoxAscent + coordsM.actualBoundingBoxDescent;

  const margin    = width * 0.06;
  const cityBaseY = height * bottomMargin - totalH + cityM.actualBoundingBoxAscent;

  // Legibility plate — same rationale as _drawClassic's.
  const plateTop = height * bottomMargin - totalH - gapMajor * 1.6;
  drawLabelPlate(ctx, width, plateTop, height, bgColor);

  ctx.textAlign    = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle    = textColor;

  setCityTracking(ctx, city);
  ctx.font = `${profile.cityWeight} ${cityFontPx}px ${titleFont}`;
  ctx.fillText(cityLabel, margin, cityBaseY);

  const divWidth = Math.min(cityM.width, countryM.width) * 0.55;
  const dividerY = cityBaseY + cityM.actualBoundingBoxDescent + gapMajor + dividerThick * 0.5;
  clearTracking(ctx);
  ctx.strokeStyle = textColor;
  ctx.lineWidth   = dividerThick;
  ctx.beginPath();
  ctx.moveTo(margin, dividerY);
  ctx.lineTo(margin + divWidth, dividerY);
  ctx.stroke();

  const countryBaseY = dividerY + dividerThick * 0.5 + gapMajor + countryM.actualBoundingBoxAscent;
  setSubtitleTracking(ctx);
  ctx.font = `${profile.countryWeight} ${countryFontPx}px ${subtitleFont}`;
  ctx.fillText(countryLabel, margin, countryBaseY);

  const coordsBaseY = countryBaseY + countryM.actualBoundingBoxDescent + gapMinor + coordsM.actualBoundingBoxAscent;
  clearTracking(ctx);
  ctx.globalAlpha = 0.72;
  ctx.font = `400 ${coordsFontPx}px ${monoFont}`;
  ctx.fillText(coordsLabel, margin, coordsBaseY);
  ctx.globalAlpha = 1;
}
