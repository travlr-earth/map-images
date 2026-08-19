/**
 * Wire schema for render requests.
 * Matches StoryShareRequest from storyShareService.ts but serialisable as JSON.
 */

export type ShareVariant =
  | "pin"
  | "route-to"
  | "photo-map"
  | "full-route"
  | "pin-photos"
  | "polygon";

export interface RouteStopInput {
  label: string;
  lat: number;
  lon: number;
}

/** A plain lat/lon point — used for real polyline/polygon geometry. */
export interface LatLon {
  lat: number;
  lon: number;
}

export interface DiaryMarker {
  title: string;
  note?: string;
  /** data-URL photos — base64 encoded, max 6 */
  photos?: string[];
}

/** Requested output pixel dimensions. Defaults to 1080x1920 (story format) when omitted. */
export interface OutputSize {
  width: number;
  height: number;
}

export interface RenderRequest {
  // Map
  themeId: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  zoom: number;
  fontFamily?: string;
  fadeOpacity?: number;
  gradientStyle?: string;
  overlayStyle?: string;
  /** Named font-weight/case bundle (see TEXT_PROFILES in poster/domain/textLayout.ts). Omit for the original "classic" look. */
  textProfile?: string;
  /** Fraction (0-1) of canvas height where the label block's bottom edge sits. Omit to keep each overlayStyle's own default -- lower it to keep text clear of a print product's crop/mask zone. */
  textBottomMargin?: number;
  /**
   * Which label/CTA treatment to use. "story" (default) — the per-variant overlay draws its
   * own place-label + bottom fade, plus a "share to social" CTA footer (wordmark + "Discover
   * more · travlr.earth"). "poster" — suppresses all of that; the plain-poster fields above
   * (overlayStyle/gradientStyle/fadeOpacity) are used instead, with no social CTA — for
   * print-product source images (mockup-machine, Shop) where social branding doesn't belong
   * on a physical product. Route/pin/polygon content still draws normally either way.
   */
  renderMode?: "story" | "poster" | "email-banner";
  /** Output pixel size. Defaults to 1080x1920 (story/poster) or 1200x400 (email-banner). */
  output?: OutputSize;
  // ── email-banner (renderMode: "email-banner") — a landscape "condensed info" strip ──
  /** Which event profile to draw. Required for email-banner mode. */
  bannerEvent?: "trip-invite" | "collection-invite" | "dormancy-nudge" | "trip-recap" | "monthly-summary";
  /** Point collection for collection-invite / dormancy-nudge / monthly-summary. */
  points?: { label?: string; lat: number; lon: number }[];
  /** Small uppercase eyebrow above the headline (per-event default if omitted). */
  eyebrow?: string;
  /** Banner headline (falls back to routeName, then city). */
  headline?: string;
  /** Condensed stat row under the headline. */
  stats?: { value: string; label: string }[];
  /** Inviter name for invites ("from Alex"). */
  fromName?: string;
  // Story
  variant: ShareVariant;
  marker?: DiaryMarker;
  routeFromLatLon?: [number, number];
  routeDistanceKm?: number;
  routeMinutes?: number;
  stops?: RouteStopInput[];
  routeName?: string;
  routeTotalKm?: number;
  routeTotalMinutes?: number;
  /**
   * Real polyline geometry for route-to / full-route — an array of segments,
   * each an ordered list of lat/lon points (e.g. one segment per GPX <trkseg>,
   * or a single segment for a simple multi-point path). When supplied, this is
   * drawn as an accurate multi-point path instead of the decorative curve /
   * straight stop-to-stop line. Omit to keep the legacy decorative behavior.
   */
  routeSegments?: LatLon[][];
  /** Raw GPX (XML) text — parsed server-side into routeSegments. Alternative to routeSegments. */
  routeGpx?: string;
  // Polygon / area (variant: "polygon")
  /** Closed (or auto-closed) ring of lat/lon points describing the area to fill/outline. */
  polygonRing?: LatLon[];
  ctaUrl?: string;
  ctaTagline?: string;
}

export interface RenderResponse {
  url: string;
  cached: boolean;
  renderMs?: number;
}

/** Stable cache key for a render request (excludes photos — those are user-specific). */
export function cacheKey(req: RenderRequest): string {
  const stable = {
    themeId: req.themeId,
    city: req.city,
    country: req.country,
    lat: Math.round(req.lat * 1000) / 1000,   // ~110m precision
    lon: Math.round(req.lon * 1000) / 1000,
    zoom: Math.round(req.zoom * 10) / 10,
    fontFamily: req.fontFamily ?? "Bebas Neue",
    fadeOpacity: req.fadeOpacity ?? 1,
    gradientStyle: req.gradientStyle ?? "heavy-bottom",
    overlayStyle: req.overlayStyle ?? "classic",
    textProfile: req.textProfile ?? "classic",
    textBottomMargin: req.textBottomMargin,
    renderMode: req.renderMode ?? "story",
    output: req.output ?? { width: 1080, height: 1920 },
    variant: req.variant,
    routeFromLatLon: req.routeFromLatLon,
    routeDistanceKm: req.routeDistanceKm,
    routeMinutes: req.routeMinutes,
    stops: req.stops,
    routeName: req.routeName,
    routeTotalKm: req.routeTotalKm,
    routeTotalMinutes: req.routeTotalMinutes,
    routeSegments: req.routeSegments,
    routeGpx: req.routeGpx,
    polygonRing: req.polygonRing,
    ctaUrl: req.ctaUrl ?? "travlr.earth",
    ctaTagline: req.ctaTagline ?? "Discover more",
    markerTitle: req.marker?.title,
    markerNote: req.marker?.note,
    bannerEvent: req.bannerEvent,
    points: req.points,
    eyebrow: req.eyebrow,
    headline: req.headline,
    stats: req.stats,
    fromName: req.fromName,
  };
  return JSON.stringify(stable);
}
