import { renderSinglePosterCanvas } from "./PosterRenderer";
import type { PosterSpec } from "./PosterRenderer";
import { createPngBlob } from "@/features/export/infrastructure/pngExporter";
import { createPdfBlobFromCanvas } from "@/features/export/infrastructure/pdfExporter";
import { triggerDownloadBlob } from "@/features/export/infrastructure/fileDownloader";
import { packageAsZip } from "@/pipeline/zip";
import { getProfileById } from "@/pipeline/profiles";
import type { BatchExportResult } from "@/pipeline/types";
import type { ExportFileFormat } from "./urlState";

export type { ExportFileFormat };
export { OUTPUT_PROFILES } from "@/pipeline/profiles";
export { FORMAT_CATEGORIES, getFormatsByCategory } from "@/pipeline/formats";

// ── Single export ─────────────────────────────────────────────────────────────

export interface SingleExportOptions {
  spec: PosterSpec;
  format: ExportFileFormat;
  filename: string;
  widthCm?: number;
  heightCm?: number;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFileFormat,
  widthCm?: number,
  heightCm?: number,
): Promise<Blob> {
  if (format === "png") return createPngBlob(canvas, 300);
  if (format === "pdf") return createPdfBlobFromCanvas(canvas, { widthCm, heightCm });
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.92,
    ),
  );
}

export async function exportSingle(opts: SingleExportOptions): Promise<void> {
  const { canvas } = await renderSinglePosterCanvas(opts.spec);
  const blob   = await canvasToBlob(canvas, opts.format, opts.widthCm, opts.heightCm);
  triggerDownloadBlob(blob, opts.filename);
}

// ── Batch export (profile → ZIP) ──────────────────────────────────────────────

export interface BatchExportProgress {
  done: number;
  total: number;
  current: string;
}

async function pipelineFormatToBlob(
  canvas: HTMLCanvasElement,
  fmt: string,
  widthCm?: number,
  heightCm?: number,
): Promise<Blob> {
  if (fmt === "png")  return createPngBlob(canvas, 300);
  if (fmt === "pdf")  return createPdfBlobFromCanvas(canvas, { widthCm, heightCm });
  if (fmt === "webp") {
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/webp",
        0.85,
      ),
    );
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.92,
    ),
  );
}

/**
 * Render every format in a named profile and package them as a ZIP download.
 * `baseSpec` is the poster configuration without width/height — those come from the format.
 */
export async function exportBatchProfile(
  baseSpec: Omit<PosterSpec, "width" | "height">,
  profileId: string,
  onProgress: (p: BatchExportProgress) => void,
): Promise<void> {
  const profile = getProfileById(profileId);
  if (!profile) throw new Error(`Unknown profile: ${profileId}`);

  const { items } = profile;
  const results: BatchExportResult[] = [];
  const citySlug = baseSpec.city
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  for (let i = 0; i < items.length; i++) {
    const { spec: fmtSpec, format } = items[i];
    onProgress({ done: i, total: items.length, current: fmtSpec.name });

    const posterSpec: PosterSpec = {
      ...baseSpec,
      width:  fmtSpec.pixelWidth,
      height: fmtSpec.pixelHeight,
    };

    const filename = `${citySlug}_${fmtSpec.id}.${format}`;

    try {
      const { canvas } = await renderSinglePosterCanvas(posterSpec);
      const widthCm  = fmtSpec.unit === "cm" ? fmtSpec.width  : undefined;
      const heightCm = fmtSpec.unit === "cm" ? fmtSpec.height : undefined;
      const blob = await pipelineFormatToBlob(canvas, format, widthCm, heightCm);
      results.push({ item: { spec: fmtSpec, format }, blob, filename });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ item: { spec: fmtSpec, format }, blob: new Blob(), filename, error });
    }
  }

  onProgress({ done: items.length, total: items.length, current: "" });

  await packageAsZip(results, `mapimages_${citySlug}_${profileId}.zip`);
}
