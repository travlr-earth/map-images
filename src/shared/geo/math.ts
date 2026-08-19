const EARTH_RADIUS_METERS = 6_371_000; // mean radius

export function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Great-circle distance between two lat/lon points (haversine formula). */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const halfDLat = toRadians(b.lat - a.lat) / 2;
  const halfDLon = toRadians(b.lon - a.lon) / 2;

  const h =
    Math.sin(halfDLat) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(halfDLon) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}
