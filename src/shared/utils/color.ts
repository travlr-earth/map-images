import { clamp } from "@/shared/geo/math";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

// ── Hex normalisation ──

function expandShortHex(digits: string): string {
  return digits
    .split("")
    .map((d) => d + d)
    .join("");
}

/** Canonicalise to lowercase `#rrggbb`; returns "" for anything unparsable. */
export function normalizeHexColor(color: string): string {
  if (typeof color !== "string") {
    return "";
  }

  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return value;
  }
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${expandShortHex(value.slice(1))}`;
  }
  return "";
}

/** Normalises a list of hex colors, dropping invalid entries and duplicates. */
export function toUniqueHexColors(colors: string[] = []): string[] {
  const seen = new Set<string>();
  for (const color of colors) {
    const hex = normalizeHexColor(color);
    if (hex) {
      seen.add(hex);
    }
  }
  return [...seen];
}

// ── Parsing ──

/** Parses `#rgb`, `#rrggbb` (leading `#` optional) into channels, else null. */
export function parseHex(hex: string): RGB | null {
  if (typeof hex !== "string") {
    return null;
  }

  let digits = hex.trim().replace("#", "");
  if (digits.length === 3) {
    digits = expandShortHex(digits);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(digits)) {
    return null;
  }

  const packed = Number.parseInt(digits, 16);
  return {
    r: (packed >> 16) & 0xff,
    g: (packed >> 8) & 0xff,
    b: packed & 0xff,
  };
}

// ── RGB ↔ HSL ──

function channelToHexPair(v: number): string {
  return clamp(Math.round(Number(v) || 0), 0, 255)
    .toString(16)
    .padStart(2, "0");
}

export function rgbToHexColor({ r, g, b }: RGB): string {
  return `#${channelToHexPair(r)}${channelToHexPair(g)}${channelToHexPair(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const chroma = max - min;
  const l = (max + min) / 2;

  if (chroma === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? chroma / (2 - max - min) : chroma / (max + min);

  let h: number;
  if (max === rn) {
    h = (gn - bn) / chroma + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / chroma + 2;
  } else {
    h = (rn - gn) / chroma + 4;
  }

  return { h: h / 6, s, l };
}

// Standard HSL helper: evaluates one channel from the two lightness bounds.
function hueChannel(p: number, q: number, t: number): number {
  const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hue = ((h % 1) + 1) % 1; // wrap into [0, 1)
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);

  if (sat === 0) {
    const grey = Math.round(light * 255);
    return { r: grey, g: grey, b: grey };
  }

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;

  return {
    r: Math.round(hueChannel(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueChannel(p, q, hue) * 255),
    b: Math.round(hueChannel(p, q, hue - 1 / 3) * 255),
  };
}

export function hslToHexColor(hsl: HSL): string {
  return rgbToHexColor(hslToRgb(hsl));
}

// ── Transformations ──

/** Nudges a hex color in HSL space; unparsable input is returned untouched. */
export function shiftHexColor(
  color: string,
  {
    hShift = 0,
    sShift = 0,
    lShift = 0,
  }: { hShift?: number; sShift?: number; lShift?: number },
): string {
  const rgb = parseHex(color);
  if (!rgb) {
    return color;
  }

  const { h, s, l } = rgbToHsl(rgb);
  return rgbToHexColor(
    hslToRgb({
      h: h + hShift,
      s: clamp(s + sShift, 0, 1),
      l: clamp(l + lShift, 0, 1),
    }),
  );
}

/** Hex → `rgba()` string; falls back to black when the hex is invalid. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  return rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
    : `rgba(0, 0, 0, ${alpha})`;
}

/**
 * Linear per-channel mix of two hex colors. weight 0 → hexA, 1 → hexB.
 * If one side fails to parse the other is returned as given; if both fail,
 * mid-grey.
 */
export function blendHex(hexA: string, hexB: string, weight = 0.5): string {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a) {
    return b ? hexB : "#888888";
  }
  if (!b) {
    return hexA;
  }

  const w = clamp(weight, 0, 1);
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * w);

  return rgbToHexColor({
    r: lerp(a.r, b.r),
    g: lerp(a.g, b.g),
    b: lerp(a.b, b.b),
  });
}
