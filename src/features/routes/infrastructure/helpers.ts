import { haversineMeters } from "@/shared/geo/math";
import type { Coordinate } from "@/shared/geo/types";
import type { MarkerItem } from "@/features/markers/domain/types";
import {
  DEFAULT_ROUTE_COLOR,
  DEFAULT_ROUTE_ENDPOINT_SIZE,
  DEFAULT_ROUTE_FINISH_ICON_ID,
  DEFAULT_ROUTE_OPACITY,
  DEFAULT_ROUTE_START_ICON_ID,
  DEFAULT_ROUTE_STROKE_WIDTH,
} from "../domain/constants";
import type {
  ParsedGpx,
  Route,
  RouteBounds,
  RouteDefaults,
  RouteEndpointMarker,
  RouteSource,
} from "../domain/types";

// One degree of latitude, in meters (spherical approximation).
const LAT_DEGREE_METERS = 111_320;

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultRouteSettings(): RouteDefaults {
  return {
    color: DEFAULT_ROUTE_COLOR,
    strokeWidth: DEFAULT_ROUTE_STROKE_WIDTH,
    opacity: DEFAULT_ROUTE_OPACITY,
    lineStyle: "solid",
    startIconId: DEFAULT_ROUTE_START_ICON_ID,
    finishIconId: DEFAULT_ROUTE_FINISH_ICON_ID,
  };
}

/** Filename minus its extension, or "Route" when nothing usable remains. */
export function getGpxUploadLabel(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "").trim();
  return stem || "Route";
}

export function createRouteEndpointMarker(input: {
  iconId: string;
  defaults: RouteDefaults;
}): RouteEndpointMarker {
  return {
    iconId: input.iconId,
    color: input.defaults.color,
    size: DEFAULT_ROUTE_ENDPOINT_SIZE,
  };
}

export function createRoute(input: {
  parsed: ParsedGpx;
  defaults: RouteDefaults;
  source?: RouteSource;
  label?: string;
  sourceFilename?: string;
}): Route {
  const source = input.source ?? "gpx";
  const { defaults } = input;
  return {
    id: makeId(source),
    label: input.label ?? input.parsed.label,
    source,
    sourceFilename: input.sourceFilename,
    segments: input.parsed.segments,
    color: defaults.color,
    strokeWidth: defaults.strokeWidth,
    opacity: defaults.opacity,
    lineStyle: defaults.lineStyle,
    visible: true,
    showEndpoints: true,
    startMarker: createRouteEndpointMarker({
      iconId: defaults.startIconId,
      defaults,
    }),
    finishMarker: createRouteEndpointMarker({
      iconId: defaults.finishIconId,
      defaults,
    }),
  };
}

/** Start/finish icons for every visible route, as plain marker items. */
export function routeEndpointMarkerItems(routes: Route[]): MarkerItem[] {
  const items: MarkerItem[] = [];
  for (const route of routes) {
    if (!route.visible || !route.showEndpoints) continue;
    const ends = routeEndpoints(route);
    if (!ends) continue;
    items.push(
      {
        id: `${route.id}-start`,
        lat: ends.start.lat,
        lon: ends.start.lon,
        iconId: route.startMarker.iconId,
        color: route.startMarker.color,
        size: route.startMarker.size,
      },
      {
        id: `${route.id}-finish`,
        lat: ends.finish.lat,
        lon: ends.finish.lon,
        iconId: route.finishMarker.iconId,
        color: route.finishMarker.color,
        size: route.finishMarker.size,
      },
    );
  }
  return items;
}

/** First point of the first non-empty segment, last point of the last one. */
export function routeEndpoints(
  route: Route,
): { start: Coordinate; finish: Coordinate } | null {
  let start: Coordinate | null = null;
  let finish: Coordinate | null = null;
  for (const segment of route.segments) {
    if (segment.length === 0) continue;
    if (!start) start = segment[0]!;
    finish = segment[segment.length - 1]!;
  }
  return start && finish ? { start, finish } : null;
}

export function boundsCenter(bounds: RouteBounds): { lat: number; lon: number } {
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lon: (bounds.minLon + bounds.maxLon) / 2,
  };
}

/**
 * Half of the padded bounding-box extent, in meters. The camera form stores
 * zoom as a view distance, so a meter value can go straight into form state.
 */
export function boundsHalfWidthMeters(bounds: RouteBounds): number {
  const center = boundsCenter(bounds);

  const nsMeters = (bounds.maxLat - bounds.minLat) * LAT_DEGREE_METERS;
  const ewMeters =
    (bounds.maxLon - bounds.minLon) *
    LAT_DEGREE_METERS *
    Math.cos((center.lat * Math.PI) / 180);

  const padding = 1.2;
  return (Math.max(nsMeters, ewMeters) / 2) * padding;
}

export function unionBounds(a: RouteBounds, b: RouteBounds): RouteBounds {
  return {
    minLat: Math.min(a.minLat, b.minLat),
    maxLat: Math.max(a.maxLat, b.maxLat),
    minLon: Math.min(a.minLon, b.minLon),
    maxLon: Math.max(a.maxLon, b.maxLon),
  };
}

export function routeBounds(route: Route): RouteBounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let seen = false;

  for (const segment of route.segments) {
    for (const { lat, lon } of segment) {
      seen = true;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
  }

  return seen ? { minLat, maxLat, minLon, maxLon } : null;
}

export function combinedRoutesBounds(
  routes: Route[],
  extra?: RouteBounds,
): RouteBounds | null {
  let merged: RouteBounds | null = extra ? { ...extra } : null;
  for (const route of routes) {
    const b = routeBounds(route);
    if (!b) continue;
    merged = merged ? unionBounds(merged, b) : b;
  }
  return merged;
}

export function routeLengthMeters(route: Route): number {
  let sum = 0;
  for (const segment of route.segments) {
    for (let i = 1; i < segment.length; i += 1) {
      sum += haversineMeters(segment[i - 1]!, segment[i]!);
    }
  }
  return sum;
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read GPX file."));
    reader.readAsText(file);
  });
}
