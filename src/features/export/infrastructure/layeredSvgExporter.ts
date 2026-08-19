import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  MarkerIconDefinition,
  MarkerItem,
} from "@/features/markers/domain/types";
import { drawMarkersOnCanvas } from "@/features/markers/infrastructure/rendering";
import type { Route } from "@/features/routes/domain/types";
import { drawRoutesOnCanvas } from "@/features/routes/infrastructure/rendering";
import { routeEndpointMarkerItems } from "@/features/routes/infrastructure/helpers";
import { applyFades } from "@/features/poster/infrastructure/renderer/layers";
import { drawPosterText } from "@/features/poster/infrastructure/renderer/typography";
import type { ResolvedTheme } from "@/features/theme/domain/types";
import { waitForMapIdle, withOffscreenExportMap } from "./exportUtils";

interface LayeredSvgOptions {
  map: MaplibreMap;
  exportWidth: number;
  exportHeight: number;
  theme: ResolvedTheme;
  center: { lat: number; lon: number };
  displayCity: string;
  displayCountry: string;
  fontFamily?: string;
  showPosterText: boolean;
  showOverlay: boolean;
  markers: MarkerItem[];
  markerIcons: MarkerIconDefinition[];
  routes?: Route[];
}

interface SvgLayer {
  id: string;
  dataUrl: string;
}

/**
 * Runs a paint callback against a scratch canvas and returns the result as a
 * PNG data URL. When `optional` is set, a missing 2D context skips the layer
 * (returns null) instead of failing the whole export.
 */
async function paintToDataUrl(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void | Promise<void>,
  optional = false,
): Promise<string | null> {
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;

  const ctx = scratch.getContext("2d");
  if (!ctx) {
    if (optional) return null;
    throw new Error("2D canvas context unavailable for SVG layer rasterization.");
  }

  await paint(ctx);
  return scratch.toDataURL("image/png");
}

function svgSafeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function layerGroupMarkup(
  prefix: string,
  layer: SvgLayer,
  width: number,
  height: number,
): string {
  return [
    `<g id="${prefix}-${svgSafeId(layer.id)}">`,
    `  <image href="${layer.dataUrl}" width="${width}" height="${height}" preserveAspectRatio="none" />`,
    `</g>`,
  ].join("\n");
}

/**
 * Renders each visible style layer in isolation by toggling every other
 * layer's visibility off, capturing the map canvas between idle waits.
 * Original visibility values are restored before returning.
 */
async function captureIsolatedStyleLayers(
  exportMap: MaplibreMap,
  width: number,
  height: number,
): Promise<SvgLayer[]> {
  const styleLayers = exportMap.getStyle().layers ?? [];
  const savedVisibility = new Map<string, string>();
  const shownIds: string[] = [];

  for (const layer of styleLayers) {
    const value = String(
      exportMap.getLayoutProperty(layer.id, "visibility") ?? "visible",
    );
    savedVisibility.set(layer.id, value);
    if (value !== "none") shownIds.push(layer.id);
  }

  for (const id of shownIds) {
    exportMap.setLayoutProperty(id, "visibility", "none");
  }
  await waitForMapIdle(exportMap);

  const captured: SvgLayer[] = [];
  for (const id of shownIds) {
    exportMap.setLayoutProperty(id, "visibility", "visible");
    await waitForMapIdle(exportMap);

    const dataUrl = await paintToDataUrl(width, height, (ctx) => {
      ctx.drawImage(exportMap.getCanvas(), 0, 0, width, height);
    });
    if (dataUrl) captured.push({ id, dataUrl });

    exportMap.setLayoutProperty(id, "visibility", "none");
    await waitForMapIdle(exportMap);
  }

  for (const [id, value] of savedVisibility) {
    exportMap.setLayoutProperty(id, "visibility", value);
  }
  await waitForMapIdle(exportMap);

  return captured;
}

/**
 * Exports the poster as an SVG whose map style layers and overlay passes
 * (fades, routes, markers, text) each live in their own named group, so the
 * file remains editable layer-by-layer in vector tools.
 */
export async function createLayeredSvgBlobFromMap({
  map,
  exportWidth,
  exportHeight,
  theme,
  center,
  displayCity,
  displayCountry,
  fontFamily,
  showPosterText,
  showOverlay,
  markers,
  markerIcons,
  routes = [],
}: LayeredSvgOptions): Promise<Blob> {
  return withOffscreenExportMap(
    map,
    exportWidth,
    exportHeight,
    async (exportMap, params) => {
      const mapLayers = await captureIsolatedStyleLayers(
        exportMap,
        exportWidth,
        exportHeight,
      );

      const overlays: SvgLayer[] = [];
      const addOverlay = async (
        id: string,
        paint: (ctx: CanvasRenderingContext2D) => void | Promise<void>,
        optional = false,
      ): Promise<void> => {
        const dataUrl = await paintToDataUrl(exportWidth, exportHeight, paint, optional);
        if (dataUrl) overlays.push({ id, dataUrl });
      };

      if (showOverlay) {
        await addOverlay("fades", (ctx) => {
          applyFades(ctx, exportWidth, exportHeight, theme.ui.bg);
        });
      }

      if (routes.length > 0) {
        await addOverlay(
          "routes",
          (ctx) => {
            drawRoutesOnCanvas(
              ctx,
              routes,
              params.markerProjection,
              params.markerScaleX,
              params.markerScaleY,
              params.markerSizeScale,
            );
          },
          true,
        );
      }

      if (routes.length > 0 && markerIcons.length > 0) {
        const endpointItems = routeEndpointMarkerItems(routes);
        if (endpointItems.length > 0) {
          await addOverlay(
            "route-endpoints",
            (ctx) =>
              drawMarkersOnCanvas(
                ctx,
                endpointItems,
                markerIcons,
                params.markerProjection,
                params.markerScaleX,
                params.markerScaleY,
                params.markerSizeScale,
              ),
            true,
          );
        }
      }

      if (markers.length > 0 && markerIcons.length > 0) {
        await addOverlay(
          "markers",
          (ctx) =>
            drawMarkersOnCanvas(
              ctx,
              markers,
              markerIcons,
              params.markerProjection,
              params.markerScaleX,
              params.markerScaleY,
              params.markerSizeScale,
            ),
          true,
        );
      }

      await addOverlay("text", (ctx) => {
        drawPosterText(
          ctx,
          exportWidth,
          exportHeight,
          theme,
          { lat: center.lat, lon: center.lon },
          displayCity,
          displayCountry,
          fontFamily,
          showPosterText,
          showOverlay,
        );
      });

      const groups = [
        ...mapLayers.map((layer) =>
          layerGroupMarkup("map-layer", layer, exportWidth, exportHeight),
        ),
        ...overlays.map((layer) =>
          layerGroupMarkup("overlay-layer", layer, exportWidth, exportHeight),
        ),
      ].join("\n");

      const doc = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">`,
        groups,
        `</svg>`,
      ].join("\n");

      return new Blob([doc], { type: "image/svg+xml;charset=utf-8" });
    },
  );
}
