import type { SearchResult } from "../domain/types";

interface RawGeoEntry {
  lat?: number | string;
  lon?: number | string;
  display_name?: string;
  label?: string;
  place_id?: number | string;
  city?: string;
  country?: string;
  address?: Record<string, string>;
}

// Ordered coarse bounding boxes; first hit wins.
const CONTINENT_BOXES: Array<{
  name: string;
  test: (lat: number, lon: number) => boolean;
}> = [
  { name: "Antarctica", test: (lat) => lat <= -60 },
  {
    name: "North America",
    test: (lat, lon) => lat >= 5 && lat <= 82 && lon >= -170 && lon <= -20,
  },
  {
    name: "South America",
    test: (lat, lon) => lat <= 15 && lat >= -60 && lon >= -92 && lon <= -30,
  },
  {
    name: "Europe",
    test: (lat, lon) => lat >= 35 && lon >= -25 && lon <= 60,
  },
  {
    name: "Africa",
    test: (lat, lon) => lat >= -35 && lat <= 37 && lon >= -20 && lon <= 55,
  },
  {
    name: "Oceania",
    test: (lat, lon) => lat >= -10 && lon >= 110 && lon <= 180,
  },
  {
    name: "Oceania",
    test: (lat, lon) => lat >= -50 && lon >= 110 && lon <= 180,
  },
  { name: "Asia", test: (_lat, lon) => lon >= 25 && lon <= 180 },
];

function guessContinent(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  const hit = CONTINENT_BOXES.find((box) => box.test(lat, lon));
  return hit ? hit.name : "";
}

function firstNonEmpty(
  source: Record<string, string>,
  candidates: string[],
): string {
  for (const candidate of candidates) {
    const raw = source[candidate];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return "";
}

const CITY_LEVEL_KEYS = [
  "city",
  "town",
  "village",
  "hamlet",
  "municipality",
  "county",
  "state",
];

export function normalizeLocationResult(
  entry: RawGeoEntry | null | undefined,
  fallbackLabel = "",
): SearchResult | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const lat = Number(entry.lat);
  const lon = Number(entry.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const label = String(
    entry.display_name ?? entry.label ?? fallbackLabel,
  ).trim();
  if (!label) {
    return null;
  }

  const address = entry.address ?? {};

  return {
    id: String(entry.place_id ?? label),
    label,
    city:
      firstNonEmpty(address, CITY_LEVEL_KEYS) ||
      String(entry.city ?? "").trim(),
    country:
      firstNonEmpty(address, ["country"]) ||
      String(entry.country ?? "").trim(),
    countryCode: firstNonEmpty(address, ["country_code"]).toUpperCase(),
    continent:
      firstNonEmpty(address, ["continent"]) || guessContinent(lat, lon),
    lat,
    lon,
  };
}

export function parseLocationResponseItems(payload: unknown): SearchResult[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const raw of payload as RawGeoEntry[]) {
    const item = normalizeLocationResult(raw);
    if (!item) continue;

    // Collapse duplicate labels (case-insensitive), keeping first occurrence
    const dedupeKey = item.label.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push(item);
  }

  return results;
}
