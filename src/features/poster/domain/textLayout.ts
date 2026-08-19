/**
 * Poster label geometry: pure constants and helpers with no canvas or DOM
 * dependency, consumed by the on-screen preview overlay as well as the
 * export renderer so the two can never drift apart.
 */
// Reference size calibrated to our export widths (≈1240–1920px).
export const TEXT_DIMENSION_REFERENCE_PX = 1500;

// Vertical anchors for each line of the label block, as fractions of canvas
// height (0 = top edge, 1 = bottom edge).
export const TEXT_CITY_Y_RATIO = 0.845;
export const TEXT_DIVIDER_Y_RATIO = 0.875;
export const TEXT_COUNTRY_Y_RATIO = 0.9;
export const TEXT_COORDS_Y_RATIO = 0.93;

/** Character count above which the city title starts shrinking. */
export const CITY_TEXT_SHRINK_THRESHOLD = 10;

// Font sizes in px at the reference dimension above.
export const CITY_FONT_BASE_PX = 250;
export const CITY_FONT_MIN_PX = 110;
export const COUNTRY_FONT_BASE_PX = 92;
export const COORDS_FONT_BASE_PX = 58;

// ── Text case ─────────────────────────────────────────────────────────────────

export type TextCase = "upper" | "title" | "sentence" | "none";

export function applyTextCase(text: string, mode: TextCase = "upper"): string {
  switch (mode) {
    case "upper":    return text.toUpperCase();
    case "title":    return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    case "sentence": return text.length ? text[0].toUpperCase() + text.slice(1).toLowerCase() : text;
    case "none":     return text;
  }
}

// ── Text profiles ────────────────────────────────────────────────────────────
// Bundles the font-weight + case pairing that reads as one coherent style,
// so callers pick a named look instead of juggling raw weight/case values
// that can drift out of sync (e.g. a heavy weight with sentence case reads
// muddier than the same weight with upper case). `fontFamily` is optional —
// most profiles intentionally leave it unset so the theme's own display font
// (PosterSpec.fontFamily) still drives the title, and only `mono` (built for
// a technical/spec-sheet product layout) overrides it.

export interface TextProfile {
  id: string;
  label: string;
  /** Overrides PosterSpec.fontFamily for the title/subtitle layer only. Omit to keep the theme's own font. */
  fontFamily?: string;
  cityWeight: number;
  countryWeight: number;
  textCase: TextCase;
}

export const TEXT_PROFILES: Record<string, TextProfile> = {
  // Current/original look — every existing render is unaffected by this
  // feature landing since this profile reproduces the old hardcoded values.
  classic: { id: "classic", label: "Classic", cityWeight: 700, countryWeight: 500, textCase: "upper" },
  // Lighter weights + mixed case — fits low-contrast/pastel themes and
  // narrower product layouts (magnets, stickers) where full-upper reads heavy.
  refined: { id: "refined", label: "Refined", cityWeight: 600, countryWeight: 400, textCase: "title" },
  // Heavier weights for large-format products (posters, banners) viewed from
  // further away.
  bold: { id: "bold", label: "Bold", cityWeight: 800, countryWeight: 600, textCase: "upper" },
  // Technical/spec-sheet feel — monospace title, for product layouts that
  // pair the map with coordinate/route data (e.g. NFC-sticker, travel gear).
  mono: { id: "mono", label: "Mono", fontFamily: "IBM Plex Mono", cityWeight: 500, countryWeight: 400, textCase: "upper" },
};

export const DEFAULT_TEXT_PROFILE_ID = "classic";

export function resolveTextProfile(id: string | undefined): TextProfile {
  return TEXT_PROFILES[id ?? DEFAULT_TEXT_PROFILE_ID] ?? TEXT_PROFILES[DEFAULT_TEXT_PROFILE_ID];
}

// ── Bottom margin ─────────────────────────────────────────────────────────────

export type OverlayStyleId = "classic" | "minimal" | "centered" | "corner";

// Fraction (0-1) of canvas height where the label block's bottom edge sits.
// Each overlayStyle previously hardcoded its own literal (0.92 for classic,
// 0.91 for corner/centered/minimal) -- kept here as the fallback so omitting
// the param reproduces the exact old layout. A caller renders closer to the
// vertical center (a smaller fraction) to keep text clear of a product's own
// crop/mask zone -- e.g. a mug or tote bag mockup that clips the bottom
// portion of the source image against the product's own silhouette.
export const DEFAULT_TEXT_BOTTOM_MARGIN: Record<OverlayStyleId, number> = {
  classic: 0.92,
  corner: 0.91,
  centered: 0.91,
  minimal: 0.91,
};

// Basic Latin plus the Latin-1 Supplement / Latin Extended letter ranges.
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;
const ANY_LETTER = /\p{L}/u;

/**
 * Heuristic script check: true when more than 80% of the letter-like
 * characters are Latin. Strings without letters (or empty input) count as
 * Latin so numeric/symbolic labels keep the default styling.
 */
export function isLatinScript(text: string | undefined | null): boolean {
  if (!text) return true;

  let latin = 0;
  let letters = 0;
  for (const char of text) {
    if (LATIN_LETTER.test(char)) {
      latin += 1;
      letters += 1;
    } else if (ANY_LETTER.test(char)) {
      letters += 1;
    }
  }

  return letters === 0 || latin / letters > 0.8;
}

/**
 * Display treatment for the city title: Latin names are uppercased with a
 * wide two-space gap between characters; other scripts pass through as-is
 * (CJK and similar neither uppercase nor benefit from faked tracking).
 */
export function formatCityLabel(city: string): string {
  if (!isLatinScript(city)) return city;

  const upper = city.toUpperCase();
  let spaced = "";
  for (let i = 0; i < upper.length; i += 1) {
    spaced += i === 0 ? upper[i] : `  ${upper[i]}`;
  }
  return spaced;
}

/**
 * Shrink factor (0–1] for the city title once it exceeds the length
 * threshold, floored so very long names never fall below the minimum size.
 * Multiply against whatever base font size the caller uses.
 */
export function computeCityFontScale(city: string): number {
  const length = Math.max(1, city.length);
  if (length <= CITY_TEXT_SHRINK_THRESHOLD) return 1;

  const floor = CITY_FONT_MIN_PX / CITY_FONT_BASE_PX;
  return Math.max(floor, CITY_TEXT_SHRINK_THRESHOLD / length);
}

