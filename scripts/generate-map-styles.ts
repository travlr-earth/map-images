/**
 * Bakes every theme into a standalone MapLibre GL style JSON.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/generate-map-styles.ts
 *
 * Output: src/map-styles/{theme-id}.json
 *
 * Each file is a valid MapLibre StyleSpecification you can pass directly to
 * new maplibregl.Map({ style: … }) or load via URL once hosted.
 */

import fs from "fs";
import path from "path";
import { themeNames, getTheme } from "@/features/theme/infrastructure/themeRepository";
import { generateMapStyle } from "@/features/map/infrastructure/maplibreStyle";

const OUT_DIR = path.resolve(import.meta.dirname, "../src/map-styles");

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;

for (const id of themeNames) {
  const theme = getTheme(id);
  const style = generateMapStyle(theme);
  const json  = JSON.stringify(style, null, 2);
  const file  = path.join(OUT_DIR, `${id}.json`);
  fs.writeFileSync(file, json, "utf8");
  console.log(`  ✓  ${id}.json`);
  written++;
}

console.log(`\n${written} styles written to src/map-styles/`);
