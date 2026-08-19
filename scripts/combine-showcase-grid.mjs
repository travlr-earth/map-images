// Dev utility: tiles the posters in public/assets/showcase into two 3x2
// grid sheets (showcase_1.png = images 1-6, showcase_2.png = images 7-12).
// Usage: npm run showcase:grid

import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const SHOWCASE_DIR = path.join(
  process.cwd(),
  "public",
  "assets",
  "showcase",
);

const GRID = { columns: 3, rows: 2, gap: 0 };
const CELL = { width: 900, height: 1273 };
const BACKGROUND = { r: 245, g: 241, b: 235, alpha: 1 };
const SHEET_NAMES = ["showcase_1.png", "showcase_2.png"];
const PER_SHEET = GRID.columns * GRID.rows;

function byNumericName(a, b) {
  const numA = Number.parseInt(path.parse(a).name, 10);
  const numB = Number.parseInt(path.parse(b).name, 10);
  // 1.png … 12.png sort numerically; anything else falls back to lexicographic.
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return numA - numB;
  }
  return a.localeCompare(b);
}

async function listSourcePngs() {
  const entries = await readdir(SHOWCASE_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter(
      (name) =>
        name.toLowerCase().endsWith(".png") && !SHEET_NAMES.includes(name),
    )
    .sort(byNumericName);
}

function cellPosition(index) {
  const col = index % GRID.columns;
  const row = Math.floor(index / GRID.columns);
  return {
    left: GRID.gap + col * (CELL.width + GRID.gap),
    top: GRID.gap + row * (CELL.height + GRID.gap),
  };
}

async function toCompositeLayer(fileName, index) {
  const input = await sharp(path.join(SHOWCASE_DIR, fileName))
    .resize(CELL.width, CELL.height, { fit: "contain", background: BACKGROUND })
    .png()
    .toBuffer();

  return { input, ...cellPosition(index) };
}

async function renderSheet(fileNames, outputName) {
  const layers = [];
  for (let i = 0; i < fileNames.length; i += 1) {
    layers.push(await toCompositeLayer(fileNames[i], i));
  }

  const width = GRID.columns * CELL.width + (GRID.columns + 1) * GRID.gap;
  const height = GRID.rows * CELL.height + (GRID.rows + 1) * GRID.gap;

  const sheet = await sharp({
    create: { width, height, channels: 4, background: BACKGROUND },
  })
    .composite(layers)
    .png()
    .toBuffer();

  const outputPath = path.join(SHOWCASE_DIR, outputName);
  await sharp(sheet).toFile(outputPath);
  console.log(`Created ${outputPath}`);
}

async function main() {
  const fileNames = await listSourcePngs();
  if (fileNames.length === 0) {
    throw new Error("No PNG files were found in public/assets/showcase.");
  }

  for (let sheet = 0; sheet < SHEET_NAMES.length; sheet += 1) {
    const batch = fileNames.slice(sheet * PER_SHEET, (sheet + 1) * PER_SHEET);
    if (batch.length > 0) {
      await renderSheet(batch, SHEET_NAMES[sheet]);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
