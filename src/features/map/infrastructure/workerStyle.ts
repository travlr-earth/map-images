import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { StyleSpecification } from "maplibre-gl";
import type { ResolvedTheme } from "@/features/theme/domain/types";
import { generateMapStyle } from "./maplibreStyle";

// The REAL TRAVLR vector styles (same ones the webpage globe uses) are hosted on
// the tiles worker. Their pmtiles + glyph URLs point at the style-builder CDN,
// which we rewrite to the worker on load.
//
// NAMING: these 41 keys (NEW_STYLES + OLD_STYLES) are EDITOR-ONLY — reachable
// from EditorApp.tsx's resolveMapStyle() but never from the POST /render API,
// which only ever renders the 24 flat-color themes in
// src/features/theme/infrastructure/themeRepository.ts (see the doc comment
// there for the full picture). That registry's ids are underscore_case
// ("midnight_blue"); these worker keys are hyphen-case ("midnight-blue").
// workerKey() below is the one-directional alias between the two — it is the
// single place that naming drift is bridged, so if you're hunting for "does
// theme X have a real vector style", convert via workerKey() and check the
// two sets below, not the other way around.
const ORIG_CDN = "https://cdn.jsdelivr.net/gh/travlr-earth/map-style-builder@main/";
const WORKER_CDN = "https://travlr-tiles.matsmiersen.workers.dev/";

const NEW_STYLES = new Set([
  "blueprint", "contrast-zones", "copper", "copper-patina", "coral", "emerald",
  "forest", "heatwave", "japanese-ink", "midnight-blue", "mineral", "neon",
  "noir", "ocean", "pastel-dream", "ruby", "rustic", "sage", "terracotta",
]);
const OLD_STYLES = new Set([
  "basic", "blue-print", "comic", "dark", "decimal", "dune", "glow", "ice-cream",
  "moonlight", "north-star", "osrs", "picture-book", "purple", "ski",
  "standard-oil", "stranger-things", "streets", "topo", "unicorn", "vintage",
  "western", "winter",
]);

let _pmtilesRegistered = false;
export function ensurePmtiles(): void {
  if (_pmtilesRegistered) return;
  try {
    maplibregl.addProtocol("pmtiles", new Protocol().tile);
    _pmtilesRegistered = true;
  } catch {
    /* already registered */
  }
}

// Editor theme ids are underscored (midnight_blue); worker keys are hyphenated.
function workerKey(themeId: string): string {
  return themeId.replace(/_/g, "-");
}

export function workerStyleUrl(themeId: string): string | null {
  const k = workerKey(themeId);
  if (NEW_STYLES.has(k)) return `${WORKER_CDN}(New%20Styles)/${k}.json`;
  if (OLD_STYLES.has(k)) return `${WORKER_CDN}review/${k}/maplibre.json`;
  return null; // no hand-built vector style → generated OpenFreeMap fallback
}

/**
 * The palette's REAL worker vector style (pmtiles + glyphs rewritten to the
 * worker). Falls back to the generated OpenFreeMap style when the palette has no
 * worker style, or on any load error — so the editor always renders something.
 */
export async function resolveMapStyle(
  themeId: string,
  theme: ResolvedTheme,
): Promise<StyleSpecification> {
  ensurePmtiles();
  const url = workerStyleUrl(themeId);
  if (!url) return generateMapStyle(theme);
  try {
    const text = await fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
    return JSON.parse(text.split(ORIG_CDN).join(WORKER_CDN)) as StyleSpecification;
  } catch {
    return generateMapStyle(theme);
  }
}
