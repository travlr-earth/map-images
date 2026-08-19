const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Resolved coordinates rarely move; suggestion lists go stale faster.
export const GEOCODE_TTL_MS = 30 * DAY_MS;
export const LOCATION_SEARCH_TTL_MS = DAY_MS;
