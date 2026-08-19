import type { Coordinate } from "@/shared/geo/types";
import type { IGpxParserPort } from "../domain/ports";
import type { ParsedGpx, RouteBounds } from "../domain/types";

/** Track name lookup: prefer <trk><name>, then <metadata><name>, then any <name>. */
function pickLabel(doc: Document, fallback: string): string {
  const node =
    doc.querySelector("trk > name") ??
    doc.querySelector("metadata > name") ??
    doc.querySelector("name");
  const text = node?.textContent?.trim();
  return text && text.length > 0 ? text : fallback;
}

function collectTrackSegments(doc: Document): Coordinate[][] {
  const out: Coordinate[][] = [];

  for (const segEl of Array.from(doc.getElementsByTagName("trkseg"))) {
    const coords: Coordinate[] = [];
    for (const ptEl of Array.from(segEl.getElementsByTagName("trkpt"))) {
      const lat = Number(ptEl.getAttribute("lat"));
      const lon = Number(ptEl.getAttribute("lon"));
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        coords.push({ lat, lon });
      }
    }
    // A segment needs at least two points to draw a line.
    if (coords.length >= 2) out.push(coords);
  }

  return out;
}

function boundsOf(segments: Coordinate[][]): RouteBounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const seg of segments) {
    for (const { lat, lon } of seg) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
  }

  return { minLat, maxLat, minLon, maxLon };
}

export const gpxParser: IGpxParserPort = {
  parse(xml, fallbackLabel = "Track") {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) {
      throw new Error("Could not read GPX file — the XML is invalid.");
    }

    const segments = collectTrackSegments(doc);
    if (segments.length === 0) {
      throw new Error("No track points found in GPX file.");
    }

    let pointCount = 0;
    for (const seg of segments) pointCount += seg.length;

    return {
      label: pickLabel(doc, fallbackLabel),
      segments,
      bounds: boundsOf(segments),
      pointCount,
    } satisfies ParsedGpx;
  },
};
