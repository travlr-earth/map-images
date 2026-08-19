// Timing and interaction tuning for the map view.

export const GEOLOCATION_TIMEOUT_MS = 8_000;

export const MAP_BUTTON_ZOOM_STEP = 0.5;
export const MAP_BUTTON_ZOOM_DURATION_MS = 280;

// Thresholds below which camera state coming back from MapLibre is treated as
// unchanged, so UI state and map state don't ping-pong on rounding noise.
export const MAP_CENTER_SYNC_EPSILON = 0.0000005;
export const MAP_ZOOM_SYNC_EPSILON = 0.0008;

export const DISTANCE_SLIDER_STEP_METERS = 100;

// Poster captures render the map into an oversized container (higher internal
// zoom) and scale the viewport back down, trading canvas size for tile detail.
export const MAP_OVERZOOM_SCALE = 5.5;

// Effective container width (px) the capture path aims for regardless of
// screen size — 600px reference viewport × MAP_OVERZOOM_SCALE. Small viewports
// raise their overzoom factor to hit this, keeping tile detail identical to
// desktop output.
export const MIN_EFFECTIVE_CONTAINER_PX = 3300;

// Upper bound on the (possibly raised) overzoom factor so very small viewports
// can't request absurd canvas sizes.
export const MAX_OVERZOOM_SCALE = 10;
