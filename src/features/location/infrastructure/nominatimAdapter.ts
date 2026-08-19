import type { ICache } from "@/core/cache/ports";
import type { IHttp } from "@/core/http/ports";
import type { IGeocodePort } from "../domain/ports";
import type { SearchResult } from "../domain/types";
import {
  normalizeLocationResult,
  parseLocationResponseItems,
} from "./locationParser";
import { GEOCODE_TTL_MS, LOCATION_SEARCH_TTL_MS } from "./constants";
import {
  getGeocodeCacheKey,
  getLocationSearchCacheKey,
  getReverseGeocodeCacheKey,
} from "./cacheKeys";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const REQUEST_TIMEOUT_MS = 16_000;
const JSON_HEADERS = { Accept: "application/json" };

// Module-level so identical requests coalesce even across adapter instances
const pendingSearches = new Map<string, Promise<SearchResult[]>>();
const pendingReverse = new Map<string, Promise<SearchResult>>();

function joinAndReuse<T>(
  pending: Map<string, Promise<T>>,
  key: string,
  start: () => Promise<T>,
): Promise<T> {
  const existing = pending.get(key);
  if (existing) {
    return existing;
  }
  const promise = start().finally(() => {
    pending.delete(key);
  });
  pending.set(key, promise);
  return promise;
}

export function createNominatimAdapter(
  http: IHttp,
  cache: ICache,
): IGeocodePort {
  async function searchLocations(
    query: string,
    limit = 6,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const term = String(query ?? "").trim();
    if (term.length < 2) {
      return [];
    }

    const boundedLimit = Math.max(1, Math.min(Math.round(limit), 10));
    const cacheKey = getLocationSearchCacheKey(term, boundedLimit);

    const hit = cache.read<SearchResult[]>(cacheKey, LOCATION_SEARCH_TTL_MS);
    if (Array.isArray(hit)) {
      return hit;
    }

    return joinAndReuse(pendingSearches, cacheKey, async () => {
      const url =
        `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=1` +
        `&limit=${boundedLimit}&q=${encodeURIComponent(term)}`;
      const response = await http.get(
        url,
        { headers: JSON_HEADERS, signal },
        REQUEST_TIMEOUT_MS,
      );
      const parsed = parseLocationResponseItems(await response.json());
      cache.write(cacheKey, parsed);
      return parsed;
    });
  }

  async function geocodeLocation(query: string): Promise<SearchResult> {
    const term = String(query ?? "").trim();
    if (!term) {
      throw new Error("Location is required.");
    }

    const cacheKey = getGeocodeCacheKey(term);
    const hit = cache.read<Record<string, unknown>>(cacheKey, GEOCODE_TTL_MS);
    if (hit && typeof hit === "object") {
      const restored = normalizeLocationResult(hit as any, term);
      if (restored) {
        return restored;
      }
    }

    const matches = await searchLocations(term, 1);
    if (matches.length === 0) {
      throw new Error(`No coordinates found for "${term}"`);
    }

    const best = matches[0];
    cache.write(cacheKey, best);
    return best;
  }

  async function geocodeCity(
    city: string,
    country: string,
  ): Promise<{ lat: number; lon: number; displayName: string }> {
    const resolved = await geocodeLocation(`${city}, ${country}`.trim());
    return {
      lat: resolved.lat,
      lon: resolved.lon,
      displayName: resolved.label,
    };
  }

  async function reverseGeocode(
    lat: number,
    lon: number,
  ): Promise<SearchResult> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error("Latitude and longitude are required.");
    }

    const cacheKey = getReverseGeocodeCacheKey(lat, lon);
    const hit = cache.read<Record<string, unknown>>(cacheKey, GEOCODE_TTL_MS);
    if (hit && typeof hit === "object") {
      const restored = normalizeLocationResult(hit as any);
      if (restored) {
        return restored;
      }
    }

    return joinAndReuse(pendingReverse, cacheKey, async () => {
      const url =
        `${NOMINATIM_BASE}/reverse?format=jsonv2&addressdetails=1&zoom=10` +
        `&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`;
      const response = await http.get(
        url,
        { headers: JSON_HEADERS },
        REQUEST_TIMEOUT_MS,
      );
      const place = normalizeLocationResult(await response.json());
      if (!place) {
        throw new Error("No nearby city found for the selected coordinates.");
      }
      cache.write(cacheKey, place);
      return place;
    });
  }

  return { searchLocations, geocodeLocation, reverseGeocode, geocodeCity };
}
