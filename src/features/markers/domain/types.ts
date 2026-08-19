import type { IconType } from "react-icons";

export type MarkerIconSource = "predefined" | "custom";
export type MarkerIconKind = "svg" | "image";

/**
 * One entry in the icon catalogue. SVG icons carry inline markup that can be
 * recolored; image icons carry a ready-made data URL.
 */
export interface MarkerIconDefinition {
  id: string;
  label: string;
  source: MarkerIconSource;
  kind: MarkerIconKind;
  tintWithMarkerColor?: boolean;
  component?: IconType;
  svgMarkup?: string;
  dataUrl?: string;
}

/** A placed marker on the map. */
export interface MarkerItem {
  id: string;
  lat: number;
  lon: number;
  iconId: string;
  size: number;
  color: string;
}

export interface MarkerDefaults {
  size: number;
  color: string;
}

/** Camera + canvas state needed to project lat/lon onto export pixels. */
export interface MarkerProjectionInput {
  centerLat: number;
  centerLon: number;
  zoom: number;
  bearingDeg: number;
  canvasWidth: number;
  canvasHeight: number;
}
