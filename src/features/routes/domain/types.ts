import type { Coordinate } from "@/shared/geo/types";
import type { ROUTE_LINE_STYLES } from "./constants";

export type RouteLineStyle = (typeof ROUTE_LINE_STYLES)[number];

export type RouteSource = "gpx" | "manual";

/** Geographic bounding box of one or more routes. */
export interface RouteBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Icon shown at a route's first or last point. */
export interface RouteEndpointMarker {
  iconId: string;
  color: string;
  size: number;
}

export interface Route {
  id: string;
  label: string;
  source: RouteSource;
  sourceFilename?: string;
  segments: Coordinate[][];
  color: string;
  strokeWidth: number;
  opacity: number;
  lineStyle: RouteLineStyle;
  visible: boolean;
  showEndpoints: boolean;
  startMarker: RouteEndpointMarker;
  finishMarker: RouteEndpointMarker;
}

/** Styling applied to newly created routes. */
export interface RouteDefaults {
  color: string;
  strokeWidth: number;
  opacity: number;
  lineStyle: RouteLineStyle;
  startIconId: string;
  finishIconId: string;
}

/** Result of parsing a GPX document. */
export interface ParsedGpx {
  label: string;
  segments: Coordinate[][];
  bounds: RouteBounds;
  pointCount: number;
}
