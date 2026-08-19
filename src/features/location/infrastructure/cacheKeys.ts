// Key formats are load-bearing: they must stay stable so previously
// persisted cache entries keep resolving across app versions.

export function getLocationSearchCacheKey(
  lookup: string,
  limit: number,
): string {
  return `location-search:${lookup.toLowerCase()}:limit:${limit}`;
}

export function getGeocodeCacheKey(lookup: string): string {
  return `geocode:location:${lookup.toLowerCase()}`;
}

export function getReverseGeocodeCacheKey(lat: number, lon: number): string {
  // 4 decimals (~11 m) so nearby taps share one cache slot
  return `geocode:reverse:${lat.toFixed(4)},${lon.toFixed(4)}`;
}
