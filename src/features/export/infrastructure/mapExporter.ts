import type { Map as MaplibreMap } from "maplibre-gl";
import type { MarkerProjectionInput } from "@/features/markers/domain/types";
import { withOffscreenExportMap } from "./exportUtils";

export interface CapturedMapResult {
  canvas: HTMLCanvasElement;
  markerProjection: MarkerProjectionInput;
  markerScaleX: number;
  markerScaleY: number;
  markerSizeScale: number;
}

/**
 * Snapshots the current map view into a 2D canvas at the requested output
 * size. Rendering happens on a hidden high-resolution clone of the map so
 * the result stays sharp for PNG/PDF export.
 */
export async function captureMapAsCanvas(
  map: MaplibreMap,
  exportWidth: number,
  exportHeight: number,
): Promise<CapturedMapResult> {
  return withOffscreenExportMap(
    map,
    exportWidth,
    exportHeight,
    (exportMap, params) => {
      const target = document.createElement("canvas");
      target.width = exportWidth;
      target.height = exportHeight;

      const ctx = target.getContext("2d");
      if (!ctx) {
        throw new Error("2D canvas context unavailable for map capture.");
      }

      // Resample the WebGL buffer to the exact requested pixel dimensions.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(exportMap.getCanvas(), 0, 0, exportWidth, exportHeight);

      return {
        canvas: target,
        markerProjection: params.markerProjection,
        markerScaleX: params.markerScaleX,
        markerScaleY: params.markerScaleY,
        markerSizeScale: params.markerSizeScale,
      };
    },
  );
}
