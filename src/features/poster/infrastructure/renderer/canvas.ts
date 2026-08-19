import { MAX_PIXELS, MAX_SIDE, OUTPUT_DPI } from "./constants";
import type { CanvasSize } from "../../domain/types";

const MIN_EDGE_PX = 600;

/**
 * Converts a physical print size to render-target pixels, shrinking the
 * result uniformly when it would exceed the area or edge-length budgets.
 */
export function resolveCanvasSize(
  widthInches: number,
  heightInches: number,
): CanvasSize {
  const requestedWidth = Math.max(MIN_EDGE_PX, Math.round(widthInches * OUTPUT_DPI));
  const requestedHeight = Math.max(MIN_EDGE_PX, Math.round(heightInches * OUTPUT_DPI));

  // Two independent limits: total pixel area, and the longest edge.
  const area = requestedWidth * requestedHeight;
  const byArea = area > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / area) : 1;
  const longestEdge = Math.max(requestedWidth, requestedHeight);
  const byEdge = longestEdge > MAX_SIDE ? MAX_SIDE / longestEdge : 1;

  const downscaleFactor = Math.min(byArea, byEdge, 1);

  return {
    width: Math.max(MIN_EDGE_PX, Math.round(requestedWidth * downscaleFactor)),
    height: Math.max(MIN_EDGE_PX, Math.round(requestedHeight * downscaleFactor)),
    requestedWidth,
    requestedHeight,
    downscaleFactor,
  };
}
