import type { MarkerProjectionInput } from "@/features/markers/domain/types";
import { TILE_SIZE_PX } from "@/core/config";

// Web Mercator latitude limit (where the projection is cut off).
const MERCATOR_LAT_LIMIT = 85.05112878;

interface WorldPoint {
  x: number;
  y: number;
  worldSize: number;
}

/**
 * Standard Web Mercator: map lat/lon into world pixel space at the given
 * zoom, where the full world spans `tileSize * 2^zoom` pixels.
 */
function toWorldPixels(lat: number, lon: number, zoom: number): WorldPoint {
  const worldSize = TILE_SIZE_PX * Math.pow(2, zoom);
  const boundedLat = Math.min(MERCATOR_LAT_LIMIT, Math.max(-MERCATOR_LAT_LIMIT, lat));
  const latRad = (boundedLat * Math.PI) / 180;

  const normX = (lon + 180) / 360;
  const normY = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);

  return { x: normX * worldSize, y: normY * worldSize, worldSize };
}

/**
 * Project a coordinate to canvas pixels for a map centered on
 * (centerLat, centerLon) at `zoom` with the given bearing.
 */
export function projectMarkerToCanvas(
  lat: number,
  lon: number,
  input: MarkerProjectionInput,
) {
  const origin = toWorldPixels(input.centerLat, input.centerLon, input.zoom);
  const target = toWorldPixels(lat, lon, input.zoom);

  // Offset from the map center, unwrapping across the antimeridian.
  let offsetX = target.x - origin.x;
  const offsetY = target.y - origin.y;
  const half = target.worldSize / 2;
  if (offsetX > half) offsetX -= target.worldSize;
  if (offsetX < -half) offsetX += target.worldSize;

  // The map rotates by `bearing`, so screen offsets rotate the opposite way.
  const theta = (-input.bearingDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  return {
    x: input.canvasWidth / 2 + (offsetX * cosT - offsetY * sinT),
    y: input.canvasHeight / 2 + (offsetX * sinT + offsetY * cosT),
  };
}
