/**
 * SOURCE OF TRUTH — API-level themes (18, from themes.json). This is the
 * registry `POST /render`, PosterRenderer, and generateMapStyle() all use.
 * IDs here are underscore_case (e.g. "midnight_blue", "japanese_ink").
 *
 * This is a DIFFERENT, SMALLER set than the 41 real branded vector styles the
 * live in-browser editor can ALSO reach (src/features/map/infrastructure/
 * workerStyle.ts — NEW_STYLES + OLD_STYLES, fetched live from
 * travlr-tiles.matsmiersen.workers.dev). Those IDs are hyphen-case
 * (e.g. "midnight-blue", "japanese-ink") and only exist for themes that have
 * a hand-built vector style; workerStyle.ts's workerKey() is the thin alias
 * that converts an id from this registry into that lookup ("_" → "-"). The
 * API can only ever render the 18 themes below — it never reaches the 41
 * editor-only vector styles; see EditorApp.tsx's resolveMapStyle() call for
 * the one place that boundary is crossed.
 */
import themesManifest from "@/data/themes.json";
import { blendHex, normalizeHexColor } from "@/shared/utils/color";
import { getThemeColorByPath } from "../domain/colorPaths";
import type { ResolvedTheme, ThemeColorKey, ThemeOption } from "../domain/types";
import { DISPLAY_PALETTE_KEYS } from "../domain/types";

type RawTheme = Record<string, unknown>;

// Accepted CSS color literals: 3/4/6/8-digit hex, rgb()/rgba(), hsl()/hsla().
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE =
  /^rgba?\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const HSL_RE =
  /^hsla?\(\s*-?\d+(?:\.\d+)?(?:deg|rad|turn)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*\d+(?:\.\d+)?%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;

// "$road_motorway"-style references to another slot in the same theme.
const REF_RE = /^\$([a-zA-Z0-9_.]+)$/;

// Short alias → canonical dotted path. These are the legacy flat keys the
// theme JSON format allows both as slot names and as `$ref` targets.
const ALIAS_TO_PATH: Record<string, string> = {
  bg: "ui.bg",
  text: "ui.text",
  gradient_color: "ui.bg",
  land: "map.land",
  landcover: "map.landcover",
  water: "map.water",
  waterway: "map.waterway",
  parks: "map.parks",
  building: "map.buildings",
  aeroway: "map.aeroway",
  rail: "map.rail",
  road_motorway: "map.roads.major",
  road_primary: "map.roads.major",
  road_secondary: "map.roads.minor_mid",
  road_tertiary: "map.roads.path",
  road_residential: "map.roads.path",
  road_default: "map.roads.path",
  road_outline: "map.roads.outline",
};

// Per-slot candidate chains, tried in order until one yields a color.
const SLOT_CANDIDATES: Record<ThemeColorKey, string[]> = {
  "ui.bg": ["ui.bg", "gradient_color", "bg"],
  "ui.text": ["ui.text", "text"],
  "map.land": ["map.land", "bg"],
  "map.landcover": ["map.landcover", "landcover"],
  "map.water": ["map.water", "water"],
  "map.waterway": ["map.waterway", "waterway", "map.water", "water"],
  "map.parks": ["map.parks", "parks"],
  "map.buildings": ["map.buildings", "building", "road_residential"],
  "map.aeroway": ["map.aeroway", "aeroway"],
  "map.rail": ["map.rail", "rail"],
  "map.roads.major": ["map.roads.major", "road_motorway", "road_primary"],
  "map.roads.minor_high": [
    "map.roads.minor_high",
    "map.roads.minor",
    "road_primary",
    "road_secondary",
  ],
  "map.roads.minor_mid": [
    "map.roads.minor_mid",
    "map.roads.minor",
    "road_secondary",
    "road_tertiary",
  ],
  "map.roads.minor_low": [
    "map.roads.minor_low",
    "map.roads.minor",
    "road_residential",
    "road_default",
  ],
  "map.roads.path": [
    "map.roads.path",
    "road_default",
    "road_tertiary",
    "road_residential",
  ],
  "map.roads.outline": ["map.roads.outline", "road_outline", "bg"],
};

// Last-resort palette when a registry entry is missing values entirely.
const SAFETY_NET: ResolvedTheme = {
  name: "Terracotta",
  description: "Cream base with sun-baked clay oranges and a soft sea-glass water tone.",
  ui: {
    bg: "#F5EDE4",
    text: "#8B4513",
  },
  map: {
    land: "#F5EDE4",
    landcover: "#EFE7DA",
    water: "#A8C4C4",
    waterway: "#A8C4C4",
    parks: "#E8E0D0",
    buildings: "#D9A08A",
    aeroway: "#E8E0D0",
    rail: "#8B4513",
    roads: {
      major: "#A0522D",
      minor_high: "#C07048",
      minor_mid: "#DCA882",
      minor_low: "#D8B898",
      path: "#E4C8B0",
      outline: "#EAD4C0",
    },
  },
};

// Themes surfaced first in pickers; anything else follows in manifest order.
const PINNED_ORDER = [
  "midnight_blue",
  "terracotta",
  "neon",
  "coral",
  "heatwave",
  "ruby",
  "sage",
  "copper",
  "rustic",
];

const DEFAULT_ID = "midnight_blue";

function isRawTheme(value: unknown): value is RawTheme {
  return typeof value === "object" && value !== null;
}

function isColorLiteral(value: string): boolean {
  return HEX_RE.test(value) || RGB_RE.test(value) || HSL_RE.test(value);
}

function readPath(theme: RawTheme, path: string): unknown {
  let node: unknown = theme;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!isRawTheme(node) || !(segment in node)) return undefined;
    node = node[segment];
  }
  return node;
}

function expandAlias(rawPath: string): string {
  const trimmed = String(rawPath ?? "").trim();
  if (!trimmed) return "";
  return ALIAS_TO_PATH[trimmed] || trimmed;
}

/**
 * Read a color at `startPath`, chasing `$reference` values through the alias
 * table. A visited-set breaks reference cycles; anything unresolvable is "".
 */
function followColor(theme: RawTheme, startPath: string): string {
  const visited = new Set<string>();
  let path = startPath;

  while (path && !visited.has(path)) {
    visited.add(path);

    const raw = readPath(theme, path);
    if (typeof raw !== "string") return "";

    const value = raw.trim();
    if (isColorLiteral(value)) return value;

    const reference = value.match(REF_RE);
    if (!reference) return "";
    path = expandAlias(reference[1]);
  }

  return "";
}

function pickSlot(theme: RawTheme, slot: ThemeColorKey): string {
  for (const candidate of SLOT_CANDIDATES[slot]) {
    const color = followColor(theme, expandAlias(candidate));
    if (color) return color;
  }
  return "";
}

/** Resolve a raw manifest entry into a fully-populated theme. */
function resolveTheme(input: unknown): ResolvedTheme {
  const raw = isRawTheme(input) ? input : {};
  const pick = (slot: ThemeColorKey) => pickSlot(raw, slot);

  const name = String(readPath(raw, "name") ?? "").trim() || SAFETY_NET.name;
  const description =
    String(readPath(raw, "description") ?? "").trim() || SAFETY_NET.description;

  const bg = pick("ui.bg") || SAFETY_NET.ui.bg;
  const text = pick("ui.text") || SAFETY_NET.ui.text;

  const land = pick("map.land") || bg || SAFETY_NET.map.land;
  const water = pick("map.water") || SAFETY_NET.map.water;
  const waterway = pick("map.waterway") || water;
  const parks = pick("map.parks") || SAFETY_NET.map.parks;
  // Derived tints keep un-specified slots harmonious with the rest of the
  // palette instead of falling back to a foreign constant.
  const landcover = pick("map.landcover") || blendHex(land, parks, 0.35);

  const major = pick("map.roads.major") || text;
  const minorHigh = pick("map.roads.minor_high") || major;
  const minorMid = pick("map.roads.minor_mid") || minorHigh;
  const minorLow = pick("map.roads.minor_low") || blendHex(minorMid, land, 0.28);
  const path = pick("map.roads.path") || minorLow;
  const outline = pick("map.roads.outline") || blendHex(land, text, 0.12);

  const buildings = pick("map.buildings") || blendHex(land, text, 0.14);
  const aeroway = pick("map.aeroway") || blendHex(land, water, 0.2);
  const rail =
    pick("map.rail") || normalizeHexColor(text) || SAFETY_NET.map.rail;

  return {
    name,
    description,
    ui: { bg, text },
    map: {
      land,
      landcover,
      water,
      waterway,
      parks,
      buildings,
      aeroway,
      rail,
      roads: {
        major,
        minor_high: minorHigh,
        minor_mid: minorMid,
        minor_low: minorLow,
        path,
        outline,
      },
    },
  };
}

function manifestEntries(manifest: unknown): Record<string, unknown> {
  if (!isRawTheme(manifest)) return {};
  const inner = (manifest as RawTheme).themes;
  return isRawTheme(inner) ? (inner as Record<string, unknown>) : {};
}

const registry: Record<string, RawTheme> = {};
for (const [id, entry] of Object.entries(manifestEntries(themesManifest))) {
  if (id && isRawTheme(entry)) registry[id] = entry;
}

const registryIds = Object.keys(registry);

export const themeNames = [
  ...PINNED_ORDER.filter((id) => registryIds.includes(id)),
  ...registryIds.filter((id) => !PINNED_ORDER.includes(id)),
];

export function getThemePalette(theme: unknown): string[] {
  const resolved = resolveTheme(theme);
  return DISPLAY_PALETTE_KEYS.map((slot) =>
    String(getThemeColorByPath(resolved, slot) ?? "").trim(),
  ).filter((color) => isColorLiteral(color));
}

export const themeOptions: ThemeOption[] = themeNames.map((id) => ({
  id,
  name: String(readPath(registry[id], "name") ?? id),
  description: String(readPath(registry[id], "description") ?? ""),
  palette: getThemePalette(registry[id]),
}));

export const defaultThemeName = themeNames.includes(DEFAULT_ID)
  ? DEFAULT_ID
  : (themeNames[0] ?? DEFAULT_ID);

export function getTheme(themeName: string): ResolvedTheme {
  if (registry[themeName]) {
    return resolveTheme(registry[themeName]);
  }
  if (defaultThemeName && registry[defaultThemeName]) {
    return resolveTheme(registry[defaultThemeName]);
  }
  return resolveTheme(SAFETY_NET);
}
