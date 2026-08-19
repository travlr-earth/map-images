import type { Map as MaplibreMap } from "maplibre-gl";
import type { ResolvedTheme } from "@/features/theme/domain/types";
import type { MarkerItem, MarkerIconDefinition } from "@/features/markers/domain/types";
import type { Route } from "@/features/routes/domain/types";
import { captureMapAsCanvas } from "@/features/export/infrastructure/mapExporter";
import { compositeExport } from "@/features/poster/infrastructure/renderer";
import { createPngBlob } from "@/features/export/infrastructure/pngExporter";
import { createJpgBlob } from "@/features/export/infrastructure/jpgExporter";
import { createWebpBlob } from "@/features/export/infrastructure/webpExporter";
import { createPdfBlobFromCanvas } from "@/features/export/infrastructure/pdfExporter";
import { slugify } from "@/shared/utils/string";
import type { BatchExportItem, BatchExportOptions, BatchExportResult, FileFormat } from "./types";

export interface BatchExportContext {
  map: MaplibreMap;
  theme: ResolvedTheme;
  center: { lat: number; lon: number };
  displayCity: string;
  displayCountry: string;
  displayContinent?: string;
  fontFamily: string;
  showPosterText: boolean;
  showOverlay: boolean;
  markers: MarkerItem[];
  markerIcons: MarkerIconDefinition[];
  routes: Route[];
}

export type BatchProgress = {
  total: number;
  completed: number;
  current: string;
};

async function blobForFormat(
  canvas: HTMLCanvasElement,
  format: FileFormat,
  widthCm?: number,
  heightCm?: number,
): Promise<Blob> {
  switch (format) {
    case "png":
      return createPngBlob(canvas, 300);
    case "jpg":
      return createJpgBlob(canvas, 0.92);
    case "webp":
      return createWebpBlob(canvas, 0.85);
    case "pdf":
      return createPdfBlobFromCanvas(canvas, { widthCm, heightCm });
    default:
      return createPngBlob(canvas, 300);
  }
}

function buildFilename(
  city: string,
  specId: string,
  themeId: string,
  format: FileFormat,
): string {
  const citySlug = slugify(city) || "city";
  return `${citySlug}_${specId}_${themeId}.${format}`;
}

/**
 * Exports all selected formats sequentially (MapLibre's offscreen renderer
 * is single-threaded), reporting progress via the optional callback.
 */
export async function runBatchExport(
  ctx: BatchExportContext,
  items: BatchExportItem[],
  themeId: string,
  onProgress?: (p: BatchProgress) => void,
): Promise<BatchExportResult[]> {
  const results: BatchExportResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const { spec, format } = items[i];
    onProgress?.({ total: items.length, completed: i, current: spec.name });

    try {
      const { canvas: mapCanvas, markerProjection, markerScaleX, markerScaleY, markerSizeScale } =
        await captureMapAsCanvas(ctx.map, spec.pixelWidth, spec.pixelHeight);

      const widthInches = spec.unit === "cm" ? spec.width / 2.54 : spec.pixelWidth / 96;
      const heightInches = spec.unit === "cm" ? spec.height / 2.54 : spec.pixelHeight / 96;

      const hasOverlays = ctx.showOverlay && (ctx.markers.length > 0 || ctx.routes.length > 0);

      const { canvas } = await compositeExport(mapCanvas, {
        theme: ctx.theme,
        center: ctx.center,
        widthInches,
        heightInches,
        displayCity: ctx.displayCity,
        displayCountry: ctx.displayCountry,
        displayContinent: ctx.displayContinent,
        fontFamily: ctx.fontFamily,
        showPosterText: ctx.showPosterText,
        showOverlay: ctx.showOverlay,
        markers: ctx.showOverlay ? ctx.markers : [],
        markerIcons: hasOverlays ? ctx.markerIcons : [],
        markerProjection: hasOverlays ? markerProjection : undefined,
        markerScaleX: hasOverlays ? markerScaleX : undefined,
        markerScaleY: hasOverlays ? markerScaleY : undefined,
        markerSizeScale: hasOverlays ? markerSizeScale : undefined,
        routes: ctx.routes,
      });

      const widthCm = spec.unit === "cm" ? spec.width : undefined;
      const heightCm = spec.unit === "cm" ? spec.height : undefined;

      const blob = await blobForFormat(canvas, format, widthCm, heightCm);
      const filename = buildFilename(ctx.displayCity, spec.id, themeId, format);

      results.push({ item: { spec, format }, blob, filename });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Export failed";
      results.push({
        item: { spec, format },
        blob: new Blob(),
        filename: buildFilename(ctx.displayCity, spec.id, themeId, format),
        error,
      });
    }
  }

  onProgress?.({ total: items.length, completed: items.length, current: "" });
  return results;
}
