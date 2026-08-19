/**
 * Regenerates the Google Fonts preload <link> in server/public/render.html
 * FROM src/fonts/registry.ts (the single source of truth for poster fonts),
 * so the server-side Playwright render can never silently drift out of sync
 * with the font registry again (previously only 6/15 fonts were preloaded,
 * hand-maintained, and nothing caught the other 9 quietly falling back to a
 * generic serif/sans-serif).
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/generate-font-preload.ts
 *   (or:  npm run fonts:generate-preload)
 *
 * Rewrites only the content between the FONT-PRELOAD:START/END markers in
 * server/public/render.html — everything else in the file is untouched.
 */

import fs from "fs";
import path from "path";
import { FONT_REGISTRY } from "@/fonts/registry";

const RENDER_HTML = path.resolve(import.meta.dirname, "../server/public/render.html");

const START_MARKER = "<!-- FONT-PRELOAD:START -->";
const END_MARKER = "<!-- FONT-PRELOAD:END -->";

function toGoogleFontsFamilyParam(fontFamily: string, weights: number[]): string {
  const encodedName = fontFamily.trim().split(/\s+/).join("+");
  const sortedWeights = [...new Set(weights)].sort((a, b) => a - b);
  if (sortedWeights.length === 0) return `family=${encodedName}`;
  return `family=${encodedName}:wght@${sortedWeights.join(";")}`;
}

const familyParams = FONT_REGISTRY.map((f) => toGoogleFontsFamilyParam(f.fontFamily, f.weights));
const href = `https://fonts.googleapis.com/css2?${familyParams.join("&")}&display=swap`;

const linkTag = `  <link href="${href}" rel="stylesheet">`;

const html = fs.readFileSync(RENDER_HTML, "utf8");
const startIdx = html.indexOf(START_MARKER);
const endIdx = html.indexOf(END_MARKER);

if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  throw new Error(
    `Could not find FONT-PRELOAD:START/END markers in ${RENDER_HTML} — ` +
    `has the file been edited by hand? Restore the markers before regenerating.`,
  );
}

const before = html.slice(0, startIdx + START_MARKER.length);
const after = html.slice(endIdx);
const updated = `${before}\n${linkTag}\n  ${after}`;

fs.writeFileSync(RENDER_HTML, updated, "utf8");

console.log(`[fonts:generate-preload] wrote ${FONT_REGISTRY.length} fonts into render.html:`);
for (const f of FONT_REGISTRY) console.log(`  - ${f.name} (${f.fontFamily})`);
console.log(`\nGoogle Fonts URL:\n${href}`);
