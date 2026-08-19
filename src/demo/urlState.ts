import type { GradientStyle } from "@/features/poster/infrastructure/renderer/layers";
import type { OverlayStyle } from "@/features/poster/infrastructure/renderer/typography";

export type ExportFileFormat = "jpeg" | "png" | "pdf";

export interface EditorUrlState {
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  zoom?: number;
  themeId?: string;
  fontFamily?: string;
  showText?: boolean;
  showFades?: boolean;
  fadeOpacity?: number;
  gradientStyle?: GradientStyle;
  textScale?: number;
  overlayStyle?: OverlayStyle;
  aspect?: string;
  exportFmt?: ExportFileFormat;
  storyMode?: boolean;
  ctaUrl?: string;
  ctaTagline?: string;
}

/**
 * Programmatic API — share or bookmark any poster configuration:
 *   ?city=Tokyo&country=Japan&lat=35.676&lon=139.650&zoom=12&theme=noir&font=Bebas+Neue
 *   &gs=heavy-bottom&fo=85&os=classic&ts=100&aspect=portrait&efmt=jpeg
 *   &story=1&ctaurl=travlr.earth&ctatag=Discover+more
 */
export function encodeToUrl(state: EditorUrlState): void {
  const p = new URLSearchParams();
  if (state.city)    p.set("city",    state.city);
  if (state.country) p.set("country", state.country);
  if (state.lat  != null) p.set("lat",  state.lat.toFixed(6));
  if (state.lon  != null) p.set("lon",  state.lon.toFixed(6));
  if (state.zoom != null) p.set("zoom", state.zoom.toFixed(2));
  if (state.themeId)    p.set("theme", state.themeId);
  if (state.fontFamily) p.set("font",  state.fontFamily);
  if (state.showText  === false) p.set("text",  "0");
  if (state.showFades === false) p.set("fades", "0");
  if (state.fadeOpacity != null) p.set("fo", Math.round(state.fadeOpacity * 100).toString());
  if (state.gradientStyle) p.set("gs", state.gradientStyle);
  if (state.textScale != null)  p.set("ts", Math.round(state.textScale * 100).toString());
  if (state.overlayStyle) p.set("os", state.overlayStyle);
  if (state.aspect)     p.set("aspect", state.aspect);
  if (state.exportFmt)  p.set("efmt",   state.exportFmt);
  if (state.storyMode)  p.set("story",  "1");
  if (state.ctaUrl)     p.set("ctaurl", state.ctaUrl);
  if (state.ctaTagline) p.set("ctatag", state.ctaTagline);

  const url = new URL(window.location.href);
  url.search = p.toString();
  window.history.replaceState(null, "", url.toString());
}

export function decodeFromUrl(): EditorUrlState {
  const p = new URLSearchParams(window.location.search);
  const s: EditorUrlState = {};

  if (p.has("city"))    s.city    = p.get("city")!;
  if (p.has("country")) s.country = p.get("country")!;

  const lat  = parseFloat(p.get("lat")  ?? "");
  const lon  = parseFloat(p.get("lon")  ?? "");
  const zoom = parseFloat(p.get("zoom") ?? "");
  if (isFinite(lat))  s.lat  = lat;
  if (isFinite(lon))  s.lon  = lon;
  if (isFinite(zoom)) s.zoom = zoom;

  if (p.has("theme")) s.themeId    = p.get("theme")!;
  if (p.has("font"))  s.fontFamily = p.get("font")!;
  if (p.has("text"))  s.showText  = p.get("text")  !== "0";
  if (p.has("fades")) s.showFades = p.get("fades") !== "0";

  const fo = parseInt(p.get("fo") ?? "");
  const ts = parseInt(p.get("ts") ?? "");
  if (isFinite(fo)) s.fadeOpacity = fo / 100;
  if (isFinite(ts)) s.textScale   = ts / 100;

  if (p.has("gs")) s.gradientStyle = p.get("gs") as GradientStyle;
  if (p.has("os")) s.overlayStyle  = p.get("os") as OverlayStyle;
  if (p.has("aspect")) s.aspect    = p.get("aspect")!;
  if (p.has("efmt"))   s.exportFmt = p.get("efmt") as ExportFileFormat;
  if (p.has("story"))  s.storyMode = p.get("story") === "1";
  if (p.has("ctaurl")) s.ctaUrl    = p.get("ctaurl")!;
  if (p.has("ctatag")) s.ctaTagline = p.get("ctatag")!;

  return s;
}
