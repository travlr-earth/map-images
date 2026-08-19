import { applyFades } from "./layers";
import { drawPosterText } from "./typography";
import { drawMarkersOnCanvas } from "@/features/markers/infrastructure/rendering";
import { drawRoutesOnCanvas } from "@/features/routes/infrastructure/rendering";
import { routeEndpointMarkerItems } from "@/features/routes/infrastructure/helpers";
import type { ExportOptions, CanvasSize } from "../../domain/types";

/**
 * Assembles the finished poster from a captured map snapshot. Paint order,
 * bottom to top: map raster → gradient fades → route lines → route-endpoint
 * pins → user pins → text block.
 */
export async function compositeExport(
  mapCanvas: HTMLCanvasElement,
  options: ExportOptions,
): Promise<{ canvas: HTMLCanvasElement; size: CanvasSize }> {
  const {
    theme,
    center,
    displayCity,
    displayCountry,
    fontFamily,
    showPosterText = true,
    showOverlay = true,
    markers = [],
    markerIcons = [],
    markerProjection,
    markerScaleX = 1,
    markerScaleY = 1,
    markerSizeScale = 1,
    routes = [],
  } = options;

  const width = mapCanvas.width;
  const height = mapCanvas.height;

  const poster = document.createElement("canvas");
  poster.width = width;
  poster.height = height;

  const ctx = poster.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is not available.");

  ctx.drawImage(mapCanvas, 0, 0);

  if (showOverlay) {
    applyFades(ctx, width, height, theme.ui.bg);
  }

  const hasIcons = markerIcons.length > 0;

  if (routes.length > 0 && markerProjection) {
    drawRoutesOnCanvas(
      ctx,
      routes,
      markerProjection,
      markerScaleX,
      markerScaleY,
      markerSizeScale,
    );

    // Endpoint pins sit above the route lines but below user markers.
    if (hasIcons) {
      const endpointItems = routeEndpointMarkerItems(routes);
      if (endpointItems.length > 0) {
        await drawMarkersOnCanvas(
          ctx,
          endpointItems,
          markerIcons,
          markerProjection,
          markerScaleX,
          markerScaleY,
          markerSizeScale,
        );
      }
    }
  }

  if (markers.length > 0 && hasIcons && markerProjection) {
    await drawMarkersOnCanvas(
      ctx,
      markers,
      markerIcons,
      markerProjection,
      markerScaleX,
      markerScaleY,
      markerSizeScale,
    );
  }

  drawPosterText(
    ctx,
    width,
    height,
    theme,
    center,
    displayCity,
    displayCountry,
    fontFamily,
    showPosterText,
    showOverlay,
  );

  const size: CanvasSize = {
    width,
    height,
    requestedWidth: width,
    requestedHeight: height,
    downscaleFactor: 1,
  };

  return { canvas: poster, size };
}

export { resolveCanvasSize } from "./canvas";
export { applyFades } from "./layers";
export { drawPosterText } from "./typography";
