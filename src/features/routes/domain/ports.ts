import type { ParsedGpx } from "./types";

/** Turns raw GPX XML into route data; throws on malformed or empty input. */
export interface IGpxParserPort {
  parse(xml: string, fallbackLabel?: string): ParsedGpx;
}
