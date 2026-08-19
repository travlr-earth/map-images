import type { Locale } from "@/i18n";

export type FontCategory = "display" | "serif" | "sans-serif" | "mono" | "script";

export interface FontEntry {
  name: string;
  fontFamily: string;
  category: FontCategory;
  /** Locales this font renders well for. Empty means all Latin locales. */
  locales: Locale[] | "all";
  /** npm @fontsource package name, if bundled */
  fontsource?: string;
  /** Weight variants available */
  weights: number[];
}

export const FONT_REGISTRY: FontEntry[] = [
  // ── Display ────────────────────────────────────────────────────────────
  {
    name: "Bebas Neue",
    fontFamily: "Bebas Neue",
    category: "display",
    locales: ["en", "nl", "de", "fr", "es"],
    fontsource: "@fontsource/bebas-neue",
    weights: [400],
  },
  {
    name: "Oswald",
    fontFamily: "Oswald",
    category: "display",
    locales: ["en", "nl", "de", "fr", "es"],
    fontsource: "@fontsource/oswald",
    weights: [200, 300, 400, 500, 600, 700],
  },
  {
    name: "Montserrat",
    fontFamily: "Montserrat",
    category: "display",
    locales: "all",
    fontsource: "@fontsource/montserrat",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    name: "Raleway",
    fontFamily: "Raleway",
    category: "display",
    locales: "all",
    fontsource: "@fontsource/raleway",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },

  // ── Serif ──────────────────────────────────────────────────────────────
  {
    name: "Playfair Display",
    fontFamily: "Playfair Display",
    category: "serif",
    locales: ["en", "nl", "de", "fr", "es"],
    fontsource: "@fontsource/playfair-display",
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    name: "Merriweather",
    fontFamily: "Merriweather",
    category: "serif",
    locales: "all",
    fontsource: "@fontsource/merriweather",
    weights: [300, 400, 700, 900],
  },

  // ── Sans-serif ─────────────────────────────────────────────────────────
  {
    name: "Lato",
    fontFamily: "Lato",
    category: "sans-serif",
    locales: "all",
    fontsource: "@fontsource/lato",
    weights: [100, 300, 400, 700, 900],
  },
  {
    name: "Source Sans Pro",
    fontFamily: "Source Sans Pro",
    category: "sans-serif",
    locales: "all",
    fontsource: "@fontsource/source-sans-pro",
    weights: [200, 300, 400, 600, 700, 900],
  },

  // ── CJK – Japanese ────────────────────────────────────────────────────
  {
    name: "Noto Sans JP",
    fontFamily: "Noto Sans JP",
    category: "sans-serif",
    locales: ["ja"],
    fontsource: "@fontsource/noto-sans-jp",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    name: "Noto Serif JP",
    fontFamily: "Noto Serif JP",
    category: "serif",
    locales: ["ja"],
    fontsource: "@fontsource/noto-serif-jp",
    weights: [200, 300, 400, 500, 600, 700, 900],
  },

  // ── Mono ───────────────────────────────────────────────────────────────
  {
    name: "IBM Plex Mono",
    fontFamily: "IBM Plex Mono",
    category: "mono",
    locales: "all",
    fontsource: "@fontsource/ibm-plex-mono",
    weights: [100, 200, 300, 400, 500, 600, 700],
  },
  {
    name: "Space Mono",
    fontFamily: "Space Mono",
    category: "mono",
    locales: "all",
    fontsource: "@fontsource/space-mono",
    weights: [400, 700],
  },

  // ── Script ─────────────────────────────────────────────────────────────
  {
    name: "Dancing Script",
    fontFamily: "Dancing Script",
    category: "script",
    locales: ["en", "nl", "de", "fr", "es"],
    fontsource: "@fontsource/dancing-script",
    weights: [400, 500, 600, 700],
  },
  {
    name: "Pacifico",
    fontFamily: "Pacifico",
    category: "script",
    locales: ["en", "nl", "de", "fr", "es"],
    fontsource: "@fontsource/pacifico",
    weights: [400],
  },
];

/** Returns fonts suitable for the given locale, putting locale-specific fonts first. */
export function getFontsForLocale(locale: Locale): FontEntry[] {
  const specific = FONT_REGISTRY.filter(
    (f) => Array.isArray(f.locales) && f.locales.includes(locale),
  );
  const universal = FONT_REGISTRY.filter((f) => f.locales === "all");
  const others = FONT_REGISTRY.filter(
    (f) => Array.isArray(f.locales) && !f.locales.includes(locale),
  );
  return [...specific, ...universal, ...others];
}

/** Returns all fonts in a given category. */
export function getFontsByCategory(category: FontCategory): FontEntry[] {
  return FONT_REGISTRY.filter((f) => f.category === category);
}

/** Returns a flat list of font family names for a <select>. */
export function getFontOptions(locale: Locale): { label: string; value: string; category: FontCategory }[] {
  return getFontsForLocale(locale).map((f) => ({
    label: f.name,
    value: f.fontFamily,
    category: f.category,
  }));
}

/** Default poster title font for a locale. */
export function getDefaultFont(locale: Locale): string {
  if (locale === "ja") return "Noto Sans JP";
  return "Bebas Neue";
}

/**
 * True if `fontFamily` is a real, bundled/preloadable font from the registry.
 * Used to fail loudly (console.warn) instead of silently substituting a
 * generic serif/sans-serif when a caller requests an unknown font — the
 * silent-substitution failure mode is exactly what made the API-level font
 * support look "done" when only 6/15 fonts were actually preloaded server-side.
 */
export function isFontRegistered(fontFamily: string): boolean {
  return FONT_REGISTRY.some((f) => f.fontFamily === fontFamily);
}
