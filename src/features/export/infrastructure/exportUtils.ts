import maplibregl, {
  type Map as MaplibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import type { MarkerProjectionInput } from "@/features/markers/domain/types";
import { MAP_OVERZOOM_SCALE } from "@/features/map/infrastructure/constants";

/** How long an export waits for MapLibre to settle before giving up. */
const IDLE_DEADLINE_MS = 15_000;

/**
 * Resolves once the map has finished loading tiles and is no longer moving.
 * Fails after IDLE_DEADLINE_MS so a stuck tile source can't hang an export.
 */
export function waitForMapIdle(map: MaplibreMap): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let finished = false;

    const deadline = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Map never reached an idle state within the export deadline."));
    }, IDLE_DEADLINE_MS);

    const complete = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(deadline);
      resolve();
    };

    // Already settled — the "idle" event may never fire again, so resolve now.
    if (map.loaded() && !map.isMoving()) {
      complete();
      return;
    }

    map.once("idle", complete);
  });
}

/**
 * Builds an invisible host element for an offscreen export map. The caller
 * attaches it to the document and removes it after the capture completes.
 */
export function createOffscreenContainer(
  width: number,
  height: number,
): HTMLDivElement {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: "none",
    opacity: "0",
  });
  return host;
}

export interface ExportRenderParams {
  center: maplibregl.LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  style: StyleSpecification;
  previewWidth: number;
  previewHeight: number;
  renderWidth: number;
  renderHeight: number;
  pixelRatio: number;
  markerProjection: MarkerProjectionInput;
  markerScaleX: number;
  markerScaleY: number;
  markerSizeScale: number;
}

/**
 * Computes everything an offscreen export map needs so its framing matches
 * the on-screen preview while rendering at the requested output resolution.
 */
export function resolveExportRenderParams(
  map: MaplibreMap,
  exportWidth: number,
  exportHeight: number,
): ExportRenderParams {
  const innerEl = map.getContainer();
  const outerEl = innerEl.parentElement;

  // Measure the overzoom factor as it currently exists in the DOM (the map's
  // own container is larger than the visible frame by this ratio). Adaptive
  // overzoom can push past the static constant, so only fall back to it when
  // the visible frame can't be measured.
  const overzoom =
    outerEl && outerEl.clientWidth > 0
      ? innerEl.clientWidth / outerEl.clientWidth
      : MAP_OVERZOOM_SCALE;

  const previewWidth = Math.max(
    1,
    outerEl?.clientWidth || Math.round(innerEl.clientWidth / overzoom),
  );
  const previewHeight = Math.max(
    1,
    outerEl?.clientHeight || Math.round(innerEl.clientHeight / overzoom),
  );

  const center = map.getCenter();
  const zoom = map.getZoom();
  const pitch = map.getPitch();
  const bearing = map.getBearing();
  const style = map.getStyle() as StyleSpecification;

  // Keep the offscreen map at preview-sized CSS dimensions (times overzoom)
  // and reach the target resolution through pixelRatio instead — this keeps
  // label/line sizing identical to the preview.
  const upscale = Math.max(
    exportWidth / previewWidth,
    exportHeight / previewHeight,
    1,
  );
  const renderWidth = Math.max(1, Math.round(previewWidth * overzoom));
  const renderHeight = Math.max(1, Math.round(previewHeight * overzoom));
  const pixelRatio = Math.max(upscale / overzoom, 1);

  return {
    center,
    zoom,
    pitch,
    bearing,
    style,
    previewWidth,
    previewHeight,
    renderWidth,
    renderHeight,
    pixelRatio,
    markerProjection: {
      centerLat: center.lat,
      centerLon: center.lng,
      zoom,
      bearingDeg: bearing,
      canvasWidth: renderWidth,
      canvasHeight: renderHeight,
    },
    markerScaleX: exportWidth / renderWidth,
    markerScaleY: exportHeight / renderHeight,
    markerSizeScale: overzoom,
  };
}

/**
 * Spins up a hidden clone of the given map at export resolution, waits for it
 * to settle, hands it to `task`, and always tears it down afterwards.
 */
export async function withOffscreenExportMap<T>(
  sourceMap: MaplibreMap,
  exportWidth: number,
  exportHeight: number,
  task: (exportMap: MaplibreMap, params: ExportRenderParams) => T | Promise<T>,
): Promise<T> {
  await waitForMapIdle(sourceMap);

  const params = resolveExportRenderParams(sourceMap, exportWidth, exportHeight);
  const host = createOffscreenContainer(params.renderWidth, params.renderHeight);
  document.body.appendChild(host);

  const exportMap = new maplibregl.Map({
    container: host,
    style: params.style,
    center: [params.center.lng, params.center.lat],
    zoom: params.zoom,
    pitch: params.pitch,
    bearing: params.bearing,
    interactive: false,
    attributionControl: false,
    pixelRatio: params.pixelRatio,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  try {
    await waitForMapIdle(exportMap);
    return await task(exportMap, params);
  } finally {
    exportMap.remove();
    host.remove();
  }
}
