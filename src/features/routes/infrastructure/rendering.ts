import type { MarkerProjectionInput } from "@/features/markers/domain/types";
import { projectMarkerToCanvas } from "@/features/markers/infrastructure/projection";
import { ROUTE_DASH_PATTERN } from "../domain/constants";
import type { Route } from "../domain/types";

/** Maps a coordinate to canvas pixels, or null when the point is off-map. */
export type RoutePointProjector = (
  lat: number,
  lon: number,
) => { x: number; y: number } | null;

interface DrawOptions {
  widthScale?: number;
}

export function drawRoutesWithProjector(
  ctx: CanvasRenderingContext2D,
  routes: Route[],
  project: RoutePointProjector,
  { widthScale = 1 }: DrawOptions = {},
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const route of routes) {
    if (!route.visible || route.segments.length === 0) continue;

    const strokePx = Math.max(0.5, route.strokeWidth * widthScale);
    ctx.lineWidth = strokePx;
    ctx.strokeStyle = route.color;
    ctx.globalAlpha = route.opacity;
    ctx.setLineDash(
      route.lineStyle === "dashed"
        ? [ROUTE_DASH_PATTERN[0] * strokePx, ROUTE_DASH_PATTERN[1] * strokePx]
        : [],
    );

    for (const segment of route.segments) {
      if (segment.length < 2) continue;
      ctx.beginPath();
      // Unprojectable points split the polyline rather than bridging the gap.
      let penDown = false;
      for (const { lat, lon } of segment) {
        const pt = project(lat, lon);
        if (!pt) {
          penDown = false;
          continue;
        }
        if (penDown) {
          ctx.lineTo(pt.x, pt.y);
        } else {
          ctx.moveTo(pt.x, pt.y);
          penDown = true;
        }
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function drawRoutesOnCanvas(
  ctx: CanvasRenderingContext2D,
  routes: Route[],
  projection: MarkerProjectionInput,
  scaleX = 1,
  scaleY = 1,
  sizeScale = 1,
): void {
  const widthScale = ((scaleX + scaleY) / 2) * sizeScale;
  drawRoutesWithProjector(
    ctx,
    routes,
    (lat, lon) => {
      const pt = projectMarkerToCanvas(lat, lon, projection);
      return { x: pt.x * scaleX, y: pt.y * scaleY };
    },
    { widthScale },
  );
}
