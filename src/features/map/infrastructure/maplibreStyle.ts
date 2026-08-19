import type { ResolvedTheme } from "@/features/theme/domain/types";
import { MAP_OVERZOOM_SCALE } from "@/features/map/infrastructure/constants";
import { blendHex } from "@/shared/utils/color";
import type {
  FillLayerSpecification,
  LineLayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

// ---------------------------------------------------------------------------
// Tile source
// ---------------------------------------------------------------------------

const TILE_URL = "https://tiles.openfreemap.org/planet";
const SRC = "openfreemap";

// OpenFreeMap serves OpenMapTiles data; its vector data stops at z14, so we
// declare that ceiling and let MapLibre overzoom above it deterministically.
const TILE_DATA_MAX_ZOOM = 14;

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

// When a theme ships no explicit building color we derive one by nudging the
// land color toward the UI text color.
const DERIVED_BUILDING_MIX = 0.14;
const BUILDING_OPACITY = 0.84;

// Close-up posters (small capture radius) get buildings slightly later so the
// footprint noise doesn't dominate; the threshold picks between the two.
const BUILDING_MIN_ZOOM_FAR = 8;
const BUILDING_MIN_ZOOM_NEAR = 8.2;
const NEAR_VIEW_RADIUS_METERS = 30_000;

function buildingMinZoomFor(distanceMeters?: number): number {
  const near =
    Number.isFinite(distanceMeters) &&
    Number(distanceMeters) <= NEAR_VIEW_RADIUS_METERS;
  return near ? BUILDING_MIN_ZOOM_NEAR : BUILDING_MIN_ZOOM_FAR;
}

// ---------------------------------------------------------------------------
// Road classification
// ---------------------------------------------------------------------------

// OpenMapTiles `class` values, grouped into the tiers this style renders.
// The minor tiers are deliberately generous so a dense street texture
// survives at low zoom instead of vanishing tier by tier.
const CLASSES = {
  major: ["motorway"],
  minorHigh: [
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "motorway_link",
    "trunk",
    "trunk_link",
  ],
  minorMid: ["tertiary", "tertiary_link", "minor"],
  minorLow: [
    "residential",
    "living_street",
    "unclassified",
    "road",
    "street",
    "street_limited",
    "service",
  ],
  path: ["path", "pedestrian", "cycleway", "track"],
  rail: ["rail", "transit"],
};

// ---------------------------------------------------------------------------
// Zoom ramps
// ---------------------------------------------------------------------------

/** [zoom, value] pairs fed into a linear interpolate expression. */
type Ramp = [number, number][];

const WATERWAY_WIDTH: Ramp = [
  [0, 0.2],
  [6, 0.34],
  [12, 0.8],
  [18, 2.4],
];

const RAIL_WIDTH: Ramp = [
  [3, 0.4],
  [6, 0.7],
  [10, 1],
  [18, 1.5],
];

const MAJOR_WIDTH: Ramp = [
  [0, 0.36],
  [3, 0.52],
  [9, 1.1],
  [14, 2.05],
  [18, 3.3],
];

// Minor roads and paths render twice: a hairline "overview" pass that keeps
// texture alive at low zoom, and a "detail" pass that takes over from mid
// zoom with readable widths.
const OVERVIEW_WIDTH: Record<"minorHigh" | "minorMid" | "minorLow", Ramp> = {
  minorHigh: [
    [0, 0.1],
    [4, 0.18],
    [8, 0.3],
    [11, 0.46],
  ],
  minorMid: [
    [0, 0.08],
    [4, 0.14],
    [8, 0.24],
    [11, 0.36],
  ],
  minorLow: [
    [0, 0.06],
    [4, 0.1],
    [8, 0.18],
    [11, 0.3],
  ],
};

const DETAIL_WIDTH: Record<"minorHigh" | "minorMid" | "minorLow", Ramp> = {
  minorHigh: [
    [6, 0.46],
    [10, 0.8],
    [14, 1.48],
    [18, 2.7],
  ],
  minorMid: [
    [6, 0.34],
    [10, 0.62],
    [14, 1.2],
    [18, 2.35],
  ],
  minorLow: [
    [6, 0.24],
    [10, 0.44],
    [14, 0.84],
    [18, 1.65],
  ],
};

const PATH_OVERVIEW_WIDTH: Ramp = [
  [5, 0.06],
  [8, 0.1],
  [11, 0.2],
];

const PATH_DETAIL_WIDTH: Ramp = [
  [8, 0.2],
  [12, 0.42],
  [16, 0.85],
  [18, 1.3],
];

// Casing width = fill width × tier factor.
const CASING_FACTOR = {
  major: 1.38,
  minorHigh: 1.45,
  minorMid: 1.15,
  path: 1.6,
};

// Zoom windows for the two-pass road rendering.
const OVERVIEW_MIN_ZOOM = 0;
const OVERVIEW_MAX_ZOOM = 11.8;
const DETAIL_MIN_ZOOM = 6;
const PATH_OVERVIEW_MIN_ZOOM = 5;
const PATH_DETAIL_MIN_ZOOM = 8;

// The overzoomed capture path draws into a container larger than the visible
// output, which shrinks strokes after downscale; boost widths to compensate.
const EXPORT_STROKE_BOOST = Math.pow(MAP_OVERZOOM_SCALE, 0.8);

// ---------------------------------------------------------------------------
// Expression / layer helpers
// ---------------------------------------------------------------------------

function interpolateByZoom(ramp: Ramp): any {
  const args: number[] = [];
  for (const [zoom, value] of ramp) args.push(zoom, value);
  return ["interpolate", ["linear"], ["zoom"], ...args];
}

function multiplyRamp(ramp: Ramp, factor: number): Ramp {
  return ramp.map(([zoom, value]) => [zoom, value * factor] as [number, number]);
}

const LINESTRING_ONLY = [
  "match",
  ["geometry-type"],
  ["LineString", "MultiLineString"],
  true,
  false,
];

function classFilter(classes: string[]): any {
  return [
    "all",
    LINESTRING_ONLY,
    ["match", ["get", "class"], classes, true, false],
  ];
}

function visibility(shown: boolean): "visible" | "none" {
  return shown ? "visible" : "none";
}

interface FillSpec {
  id: string;
  sourceLayer: string;
  shown: boolean;
  color: string;
  opacity?: number;
  minzoom?: number;
  polygonsOnly?: boolean;
}

function fillLayer(spec: FillSpec): FillLayerSpecification {
  const layer: any = {
    id: spec.id,
    source: SRC,
    "source-layer": spec.sourceLayer,
    type: "fill",
  };
  if (spec.minzoom !== undefined) layer.minzoom = spec.minzoom;
  if (spec.polygonsOnly) {
    layer.filter = [
      "match",
      ["geometry-type"],
      ["MultiPolygon", "Polygon"],
      true,
      false,
    ];
  }
  layer.layout = { visibility: visibility(spec.shown) };
  layer.paint = { "fill-color": spec.color };
  if (spec.opacity !== undefined) layer.paint["fill-opacity"] = spec.opacity;
  return layer;
}

interface LineSpec {
  id: string;
  sourceLayer?: string;
  classes: string[];
  shown: boolean;
  color: string;
  width: Ramp;
  /** A ramp, a constant, or omitted entirely (no line-opacity emitted). */
  opacity?: Ramp | number;
  dash?: number[];
  minzoom?: number;
  maxzoom?: number;
}

function lineLayer(spec: LineSpec): LineLayerSpecification {
  const layer: any = {
    id: spec.id,
    source: SRC,
    "source-layer": spec.sourceLayer ?? "transportation",
    type: "line",
  };
  if (spec.minzoom !== undefined) layer.minzoom = spec.minzoom;
  if (spec.maxzoom !== undefined) layer.maxzoom = spec.maxzoom;
  layer.filter = classFilter(spec.classes);
  const paint: any = {
    "line-color": spec.color,
    "line-width": interpolateByZoom(spec.width),
  };
  if (spec.opacity !== undefined) {
    paint["line-opacity"] =
      typeof spec.opacity === "number"
        ? spec.opacity
        : interpolateByZoom(spec.opacity);
  }
  if (spec.dash) paint["line-dasharray"] = spec.dash;
  layer.paint = paint;
  layer.layout = {
    visibility: visibility(spec.shown),
    "line-cap": "round",
    "line-join": "round",
  };
  return layer;
}

// ---------------------------------------------------------------------------
// Style generator
// ---------------------------------------------------------------------------

export function generateMapStyle(
  theme: ResolvedTheme,
  options?: {
    includeLandcover?: boolean;
    includeBuildings?: boolean;
    includeWater?: boolean;
    includeParks?: boolean;
    includeAeroway?: boolean;
    includeRail?: boolean;
    includeRoads?: boolean;
    includeRoadPath?: boolean;
    includeRoadMinorLow?: boolean;
    includeRoadOutline?: boolean;
    distanceMeters?: number;
    /** Apply overzoom line-width compensation. Only set true when the map container
     *  is rendered larger than the visible output (captureMapAsCanvas overzoom path). */
    forExport?: boolean;
  },
): StyleSpecification {
  const show = {
    landcover: options?.includeLandcover ?? true,
    buildings: options?.includeBuildings ?? true,
    water: options?.includeWater ?? true,
    parks: options?.includeParks ?? true,
    aeroway: options?.includeAeroway ?? true,
    rail: options?.includeRail ?? true,
    roads: options?.includeRoads ?? true,
    path: options?.includeRoadPath ?? true,
    minorLow: options?.includeRoadMinorLow ?? true,
    outline: options?.includeRoadOutline ?? true,
  };

  const buildingColor =
    theme.map.buildings ||
    blendHex(
      theme.map.land || "#ffffff",
      theme.ui.text || "#111111",
      DERIVED_BUILDING_MIX,
    );

  // Width compensation is a no-op unless this style feeds an overzoomed capture.
  const forOutput = options?.forExport
    ? (ramp: Ramp) => multiplyRamp(ramp, EXPORT_STROKE_BOOST)
    : (ramp: Ramp) => ramp;

  const casing = {
    major: forOutput(multiplyRamp(MAJOR_WIDTH, CASING_FACTOR.major)),
    minorHigh: forOutput(
      multiplyRamp(DETAIL_WIDTH.minorHigh, CASING_FACTOR.minorHigh),
    ),
    minorMid: forOutput(
      multiplyRamp(DETAIL_WIDTH.minorMid, CASING_FACTOR.minorMid),
    ),
    path: forOutput(multiplyRamp(PATH_DETAIL_WIDTH, CASING_FACTOR.path)),
  };

  const roadColor = theme.map.roads;

  return {
    version: 8,
    sources: {
      [SRC]: {
        type: "vector",
        url: TILE_URL,
        maxzoom: TILE_DATA_MAX_ZOOM,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": theme.map.land },
      },

      // Ground fills. Landcover goes down first; parks precede water so that
      // marine park polygons end up underneath oceans rather than tinting them.
      fillLayer({
        id: "landcover",
        sourceLayer: "landcover",
        shown: show.landcover,
        color: theme.map.landcover,
        opacity: 0.7,
      }),
      fillLayer({
        id: "park",
        sourceLayer: "park",
        shown: show.parks,
        color: theme.map.parks,
      }),
      fillLayer({
        id: "water",
        sourceLayer: "water",
        shown: show.water,
        color: theme.map.water,
      }),
      lineLayer({
        id: "waterway",
        sourceLayer: "waterway",
        classes: ["river", "canal", "stream", "ditch"],
        shown: show.water,
        color: theme.map.waterway,
        width: forOutput(WATERWAY_WIDTH),
      }),

      fillLayer({
        id: "aeroway",
        sourceLayer: "aeroway",
        shown: show.aeroway,
        color: theme.map.aeroway,
        opacity: 0.85,
        polygonsOnly: true,
      }),
      fillLayer({
        id: "building",
        sourceLayer: "building",
        shown: show.buildings,
        color: buildingColor,
        opacity: BUILDING_OPACITY,
        minzoom: buildingMinZoomFor(options?.distanceMeters),
      }),

      lineLayer({
        id: "rail",
        classes: CLASSES.rail,
        shown: show.rail,
        color: theme.map.rail,
        width: forOutput(RAIL_WIDTH),
        opacity: [
          [0, 0.56],
          [12, 0.62],
          [18, 0.72],
        ],
        dash: [2, 1.6],
      }),

      // Overview pass: hairline roads that fade out as the detail pass ramps in.
      lineLayer({
        id: "road-minor-overview-high",
        classes: CLASSES.minorHigh,
        shown: show.roads,
        color: roadColor.minor_high,
        width: forOutput(OVERVIEW_WIDTH.minorHigh),
        opacity: [
          [0, 0.66],
          [8, 0.76],
          [12, 0],
        ],
        minzoom: OVERVIEW_MIN_ZOOM,
        maxzoom: OVERVIEW_MAX_ZOOM,
      }),
      lineLayer({
        id: "road-minor-overview-mid",
        classes: CLASSES.minorMid,
        shown: show.roads,
        color: roadColor.minor_mid,
        width: forOutput(OVERVIEW_WIDTH.minorMid),
        opacity: [
          [0, 0.46],
          [8, 0.56],
          [12, 0],
        ],
        minzoom: OVERVIEW_MIN_ZOOM,
        maxzoom: OVERVIEW_MAX_ZOOM,
      }),
      lineLayer({
        id: "road-minor-overview-low",
        classes: CLASSES.minorLow,
        shown: show.roads,
        color: roadColor.minor_low,
        width: forOutput(OVERVIEW_WIDTH.minorLow),
        opacity: show.minorLow
          ? [
              [0, 0.26],
              [8, 0.34],
              [12, 0],
            ]
          : 0,
        minzoom: OVERVIEW_MIN_ZOOM,
        maxzoom: OVERVIEW_MAX_ZOOM,
      }),
      lineLayer({
        id: "road-path-overview",
        classes: CLASSES.path,
        shown: show.roads,
        color: roadColor.path,
        width: forOutput(PATH_OVERVIEW_WIDTH),
        opacity: show.path
          ? [
              [5, 0.45],
              [9, 0.58],
              [12, 0],
            ]
          : 0,
        minzoom: PATH_OVERVIEW_MIN_ZOOM,
        maxzoom: OVERVIEW_MAX_ZOOM,
      }),

      // Casings sit under every road fill so outlines never cut across fills.
      lineLayer({
        id: "road-major-casing",
        classes: CLASSES.major,
        shown: show.roads,
        color: roadColor.outline,
        width: casing.major,
        opacity: show.outline ? 0.95 : 0,
      }),
      lineLayer({
        id: "road-minor-high-casing",
        classes: CLASSES.minorHigh,
        shown: show.roads,
        color: roadColor.outline,
        width: casing.minorHigh,
        opacity: show.outline
          ? [
              [6, 0.72],
              [12, 0.85],
              [18, 0.92],
            ]
          : 0,
        minzoom: DETAIL_MIN_ZOOM,
      }),
      lineLayer({
        id: "road-minor-mid-casing",
        classes: CLASSES.minorMid,
        shown: show.roads,
        color: roadColor.outline,
        width: casing.minorMid,
        opacity: show.outline
          ? [
              [6, 0.42],
              [12, 0.56],
              [18, 0.66],
            ]
          : 0,
        minzoom: DETAIL_MIN_ZOOM,
      }),
      lineLayer({
        id: "road-path-casing",
        classes: CLASSES.path,
        shown: show.roads,
        color: roadColor.outline,
        width: casing.path,
        opacity:
          show.outline && show.path
            ? [
                [8, 0.62],
                [12, 0.72],
                [18, 0.85],
              ]
            : 0,
        minzoom: PATH_DETAIL_MIN_ZOOM,
      }),

      // Detail pass fills, major first (bottom) so smaller roads draw on top.
      lineLayer({
        id: "road-major",
        classes: CLASSES.major,
        shown: show.roads,
        color: roadColor.major,
        width: forOutput(MAJOR_WIDTH),
      }),
      lineLayer({
        id: "road-minor-high",
        classes: CLASSES.minorHigh,
        shown: show.roads,
        color: roadColor.minor_high,
        width: forOutput(DETAIL_WIDTH.minorHigh),
        opacity: [
          [6, 0.84],
          [10, 0.92],
          [18, 1],
        ],
        minzoom: DETAIL_MIN_ZOOM,
      }),
      lineLayer({
        id: "road-minor-mid",
        classes: CLASSES.minorMid,
        shown: show.roads,
        color: roadColor.minor_mid,
        width: forOutput(DETAIL_WIDTH.minorMid),
        opacity: [
          [6, 0.62],
          [10, 0.74],
          [18, 0.86],
        ],
        minzoom: DETAIL_MIN_ZOOM,
      }),
      lineLayer({
        id: "road-minor-low",
        classes: CLASSES.minorLow,
        shown: show.roads,
        color: roadColor.minor_low,
        width: forOutput(DETAIL_WIDTH.minorLow),
        opacity: show.minorLow
          ? [
              [6, 0.34],
              [10, 0.46],
              [18, 0.58],
            ]
          : 0,
        minzoom: DETAIL_MIN_ZOOM,
      }),
      lineLayer({
        id: "road-path",
        classes: CLASSES.path,
        shown: show.roads,
        color: roadColor.path,
        width: forOutput(PATH_DETAIL_WIDTH),
        opacity: show.path
          ? [
              [8, 0.7],
              [12, 0.82],
              [18, 0.95],
            ]
          : 0,
        minzoom: PATH_DETAIL_MIN_ZOOM,
      }),
    ],
  };
}
