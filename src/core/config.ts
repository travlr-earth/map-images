// Central app configuration. Environment variables are read here and
// nowhere else; everything below is a plain constant consumers import.

/* Poster physical dimensions (print) */
export const CM_PER_INCH = 2.54;
export const MIN_POSTER_CM = 4;
export const MAX_POSTER_CM = 45;
export const DEFAULT_POSTER_WIDTH_CM = 20;
export const DEFAULT_POSTER_HEIGHT_CM = 30;
export const LAYOUT_MATCH_TOLERANCE_CM = 0.01;

/* View distance (meters across the visible map) */
export const MIN_DISTANCE_METERS = 100;
export const MAX_DISTANCE_METERS = 20_000_000;
export const DEFAULT_DISTANCE_METERS = 4_000;

/* MapLibre / tile scheme */

// Equatorial circumference of Earth, meters.
export const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

// OpenFreeMap / OpenMapTiles serve 512px vector tiles.
export const TILE_SIZE_PX = 512;

export const MIN_MAP_ZOOM = 0.5;
export const MAX_MAP_ZOOM = 20;

// Placeholder container width until ResizeObserver reports the real size.
export const DEFAULT_CONTAINER_PX = 600;

// flyTo animation length when a search result is picked.
export const FLY_TO_DURATION_MS = 1800;

/* Fallback location when geolocation is unavailable: Hanover, Germany */
export const DEFAULT_LAT = 52.3759;
export const DEFAULT_LON = 9.732;
export const DEFAULT_CITY = "Hanover";
export const DEFAULT_COUNTRY = "Germany";

/* Environment-derived values */
export const APP_VERSION = String(
  import.meta.env.VITE_APP_VERSION ?? "0.0.0",
).trim();
export const UPDATES_URL = String(
  import.meta.env.VITE_UPDATES_URL ?? "/updates.json",
).trim();

export const INSTALL_DIAGNOSTICS_ENABLED = false;

/* Poster typeface choices offered in the editor */

export interface FontOption {
  value: string;
  label: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { value: "", label: "Default (Space Grotesk)" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Oswald", label: "Oswald" },
  { value: "Noto Sans JP", label: "Noto Sans JP" },
  { value: "Source Sans Pro", label: "Source Sans Pro" },
  { value: "Raleway", label: "Raleway" },
  { value: "Lato", label: "Lato" },
  { value: "Merriweather", label: "Merriweather" },
  { value: "Bebas neue", label: "Bebas Neue" },
];
