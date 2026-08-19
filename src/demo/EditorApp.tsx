import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { themeOptions, getTheme } from "@/features/theme/infrastructure/themeRepository";
import { generateMapStyle } from "@/features/map/infrastructure/maplibreStyle";
import { resolveMapStyle, ensurePmtiles } from "@/features/map/infrastructure/workerStyle";
import { applyFades, type GradientStyle } from "@/features/poster/infrastructure/renderer/layers";
import { drawPosterText, type OverlayStyle } from "@/features/poster/infrastructure/renderer/typography";
import { drawStoryCta } from "@/features/poster/infrastructure/renderer/storyCta";
import { FONT_REGISTRY } from "@/fonts/registry";
import { useLocationAutocomplete } from "@/features/location/application/useLocationAutocomplete";
import type { SearchResult } from "@/features/location/domain/types";
import type { ResolvedTheme } from "@/features/theme/domain/types";
import type { PosterSpec } from "./PosterRenderer";
import { decodeFromUrl, encodeToUrl, type ExportFileFormat } from "./urlState";
import {
  exportSingle,
  exportBatchProfile,
  OUTPUT_PROFILES,
  type BatchExportProgress,
} from "./exportService";
import { shareStory, type ShareVariant } from "./storyShareService";
import "./editor.css";

// ── Boot-time URL init ────────────────────────────────────────────────────────
// Parsed once before the component mounts — safe to call at module level.
const _u = decodeFromUrl();

// ── Theme list ────────────────────────────────────────────────────────────────
const ALL_THEME_IDS = themeOptions.map((t) => t.id);

// ── Aspect presets (controls preview frame ratio) ─────────────────────────────
const ASPECTS = {
  portrait:  { label: "A4",   exportW: 1240, exportH: 1754, widthCm: 21,   heightCm: 29.7 },
  square:    { label: "1:1",  exportW: 1500, exportH: 1500, widthCm: undefined, heightCm: undefined },
  story:     { label: "9:16", exportW: 1080, exportH: 1920, widthCm: undefined, heightCm: undefined },
  landscape: { label: "16:9", exportW: 1920, exportH: 1080, widthCm: undefined, heightCm: undefined },
} as const;
type AspectKey = keyof typeof ASPECTS;

// ── Overlay settings ref (avoids stale closures) ──────────────────────────────
interface OverlaySettings {
  theme: ResolvedTheme;
  showText: boolean;
  showFades: boolean;
  fadeOpacity: number;
  gradientStyle: GradientStyle;
  city: string;
  country: string;
  fontFamily: string;
  textScale: number;
  overlayStyle: OverlayStyle;
  storyMode: boolean;
  ctaUrl: string;
  ctaTagline: string;
  lat: number;
  lon: number;
}

// ── MapPreviewCanvas ──────────────────────────────────────────────────────────

interface MapPreviewProps {
  themeId: string;
  initLat: number;
  initLon: number;
  initZoom: number;
  city: string;
  country: string;
  fontFamily: string;
  showText: boolean;
  showFades: boolean;
  fadeOpacity: number;
  gradientStyle: GradientStyle;
  textScale: number;
  overlayStyle: OverlayStyle;
  storyMode: boolean;
  ctaUrl: string;
  ctaTagline: string;
  onMove: (lat: number, lon: number, zoom: number) => void;
  onMapReady: (map: maplibregl.Map | null) => void;
}

function MapPreviewCanvas({
  themeId, initLat, initLon, initZoom,
  city, country, fontFamily,
  showText, showFades, fadeOpacity, gradientStyle,
  textScale, overlayStyle,
  storyMode, ctaUrl, ctaTagline,
  onMove, onMapReady,
}: MapPreviewProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const overlayRef    = useRef<HTMLCanvasElement>(null);
  const settingsRef   = useRef<OverlaySettings>({
    theme: getTheme(themeId), showText, showFades, fadeOpacity, gradientStyle,
    city, country, fontFamily, textScale, overlayStyle,
    storyMode, ctaUrl, ctaTagline,
    lat: initLat, lon: initLon,
  });
  const onMoveRef     = useRef(onMove);
  const onMapReadyRef = useRef(onMapReady);
  onMoveRef.current     = onMove;
  onMapReadyRef.current = onMapReady;

  // Keep ref in sync every render
  settingsRef.current = {
    theme: getTheme(themeId), showText, showFades, fadeOpacity, gradientStyle,
    city, country, fontFamily, textScale, overlayStyle,
    storyMode, ctaUrl, ctaTagline,
    lat: settingsRef.current.lat,
    lon: settingsRef.current.lon,
  };

  const redrawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    const s   = settingsRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (s.showFades) {
      applyFades(ctx, canvas.width, canvas.height, s.theme.ui.bg, s.fadeOpacity, s.gradientStyle);
    }
    if (s.showText) {
      drawPosterText(
        ctx, canvas.width, canvas.height, s.theme,
        { lat: s.lat, lon: s.lon },
        s.city, s.country, s.fontFamily, true, true,
        s.textScale, s.overlayStyle,
      );
    }
    if (s.storyMode) {
      drawStoryCta(ctx, canvas.width, canvas.height, s.theme, s.fontFamily, {
        city: s.city, country: s.country,
        url: s.ctaUrl || undefined,
        tagline: s.ctaTagline || undefined,
      });
    }
  }, []);

  useEffect(() => {
    redrawOverlay();
  }, [themeId, showText, showFades, fadeOpacity, gradientStyle, city, country, fontFamily, textScale, overlayStyle, storyMode, ctaUrl, ctaTagline, redrawOverlay]);

  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const s = settingsRef.current;
    ensurePmtiles();   // TRAVLR worker styles use pmtiles:// sources

    // Init with the generated style (sync); the themeId effect immediately swaps
    // in the palette's real worker vector style.
    const map = new maplibregl.Map({
      container,
      style: generateMapStyle(s.theme) as any,
      center: [initLon, initLat],
      zoom: initZoom,
      interactive: true,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.on("idle", redrawOverlay);
    map.on("moveend", () => {
      const c = map.getCenter();
      settingsRef.current.lat = c.lat;
      settingsRef.current.lon = c.lng;
      onMoveRef.current(c.lat, c.lng, map.getZoom());
      redrawOverlay();
    });

    mapRef.current = map;
    onMapReadyRef.current(map);
    return () => {
      onMapReadyRef.current(null);
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const theme = getTheme(themeId);
    // Load the palette's REAL worker vector style (falls back to the generated
    // OpenFreeMap style for palettes without one, or on error).
    void resolveMapStyle(themeId, theme).then((style) => {
      if (cancelled || !mapRef.current) return;
      map.once("styledata", redrawOverlay);
      map.setStyle(style as any, { diff: false });
    });
    return () => { cancelled = true; };
  }, [themeId, redrawOverlay]);

  // HiDPI canvas: size in physical pixels
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = overlayRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(width  * dpr);
      canvas.height = Math.round(height * dpr);
      redrawOverlay();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [redrawOverlay]);

  return (
    <div className="mpc-root">
      <div ref={containerRef} className="mpc-map" />
      <canvas ref={overlayRef} className="mpc-overlay" />
    </div>
  );
}

// ── ThemeRow ──────────────────────────────────────────────────────────────────

function ThemeRow({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  return (
    <div className="picker-row" role="listbox">
      {ALL_THEME_IDS.map((id) => {
        const t = getTheme(id);
        return (
          <button
            key={id}
            role="option"
            aria-selected={activeId === id}
            className={`theme-swatch${activeId === id ? " theme-swatch--active" : ""}`}
            title={t.name}
            onClick={() => onSelect(id)}
          >
            <span className="ts-land"  style={{ background: t.map.land  }} />
            <span className="ts-water" style={{ background: t.map.water }} />
            <span className="ts-bg"    style={{ background: t.ui.bg     }} />
          </button>
        );
      })}
    </div>
  );
}

// ── FontRow ───────────────────────────────────────────────────────────────────

function FontRow({ activeFamily, onSelect }: { activeFamily: string; onSelect: (f: string) => void }) {
  return (
    <div className="picker-row" role="listbox">
      {FONT_REGISTRY.map((f) => (
        <button
          key={f.fontFamily}
          role="option"
          aria-selected={activeFamily === f.fontFamily}
          className={`font-chip${activeFamily === f.fontFamily ? " font-chip--active" : ""}`}
          style={{ fontFamily: `"${f.fontFamily}", sans-serif` }}
          onClick={() => onSelect(f.fontFamily)}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}

// ── SearchBar ─────────────────────────────────────────────────────────────────

function SearchBar({ onSelect }: { onSelect: (r: SearchResult) => void }) {
  const [query,   setQuery]   = useState("");
  const [focused, setFocused] = useState(false);

  const { locationSuggestions, isLocationSearching, clearLocationSuggestions } =
    useLocationAutocomplete(query, focused);

  function pick(r: SearchResult) {
    setQuery("");
    clearLocationSuggestions();
    setFocused(false);
    onSelect(r);
  }

  return (
    <div className="search-wrap">
      <input
        className="search-input"
        type="text"
        placeholder="Search city…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 180)}
        aria-label="Search for a city"
      />
      {isLocationSearching && <span className="search-spinner" aria-hidden />}
      {focused && locationSuggestions.length > 0 && (
        <ul className="search-dropdown" role="listbox">
          {locationSuggestions.map((r) => (
            <li key={r.id} role="option">
              <button className="search-result" onMouseDown={() => pick(r)}>
                <strong>{r.city || r.label.split(",")[0].trim()}</strong>
                <span>{r.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      className={`toggle${on ? " toggle--on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

// ── EditorApp ─────────────────────────────────────────────────────────────────

export function EditorApp() {
  // State — initialised from URL params on first load
  const [themeId,       setThemeId]       = useState(_u.themeId      ?? ALL_THEME_IDS[0]);
  const [fontFamily,    setFontFamily]    = useState(_u.fontFamily   ?? "Bebas Neue");
  const [city,          setCity]          = useState(_u.city         ?? "Amsterdam");
  const [country,       setCountry]       = useState(_u.country      ?? "Netherlands");
  const [lat,           setLat]           = useState(_u.lat          ?? 52.3676);
  const [lon,           setLon]           = useState(_u.lon          ?? 4.9041);
  const [zoom,          setZoom]          = useState(_u.zoom         ?? 12);
  const [showText,      setShowText]      = useState(_u.showText     ?? true);
  const [showFades,     setShowFades]     = useState(_u.showFades    ?? true);
  const [fadeOpacity,   setFadeOpacity]   = useState(_u.fadeOpacity  ?? 1);
  const [gradientStyle, setGradientStyle] = useState<GradientStyle>(_u.gradientStyle ?? "heavy-bottom");
  const [textScale,     setTextScale]     = useState(_u.textScale    ?? 1);
  const [overlayStyle,  setOverlayStyle]  = useState<OverlayStyle>(_u.overlayStyle ?? "classic");
  const [aspect,        setAspect]        = useState<AspectKey>((_u.aspect as AspectKey) ?? "portrait");

  // Export state
  const [exportFmt,       setExportFmt]       = useState<ExportFileFormat>(_u.exportFmt ?? "jpeg");
  const [isExporting,     setIsExporting]     = useState(false);
  const [batchProfileId,  setBatchProfileId]  = useState(OUTPUT_PROFILES[1].id); // Instagram Pack
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [batchProgress,   setBatchProgress]   = useState<BatchExportProgress | null>(null);
  const [exportError,     setExportError]     = useState<string | null>(null);

  // Story share state
  const [storyMode,      setStoryMode]      = useState(_u.storyMode  ?? false);
  const [ctaUrl,         setCtaUrl]         = useState(_u.ctaUrl     ?? "travlr.earth");
  const [ctaTagline,     setCtaTagline]     = useState(_u.ctaTagline ?? "Discover more");
  const [exportingVariant, setExportingVariant] = useState<ShareVariant | null>(null);
  const [storyPhotos,    setStoryPhotos]    = useState<string[]>([]);
  // Real route geometry — raw GPX text, used by route-to / full-route instead
  // of the decorative curve/straight-line when supplied (wires the real
  // multi-segment route engine through to the story-share API request).
  const [routeGpxText,   setRouteGpxText]   = useState<string | null>(null);
  const [routeGpxName,   setRouteGpxName]   = useState<string | null>(null);

  const mapRef          = useRef<maplibregl.Map | null>(null);
  const previewWrapRef  = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);

  // Preload all poster fonts
  useEffect(() => {
    FONT_REGISTRY.forEach((f) => {
      [300, 400, 700].forEach((w) => {
        document.fonts.load(`${w} 1em "${f.fontFamily}"`).catch(() => {});
      });
    });
  }, []);

  // Sync all state → URL (shareable / bookmark)
  useEffect(() => {
    encodeToUrl({
      city, country, lat, lon, zoom,
      themeId, fontFamily,
      showText, showFades, fadeOpacity, gradientStyle,
      textScale, overlayStyle,
      aspect, exportFmt,
      storyMode, ctaUrl, ctaTagline,
    });
  }, [city, country, lat, lon, zoom, themeId, fontFamily,
      showText, showFades, fadeOpacity, gradientStyle,
      textScale, overlayStyle, aspect, exportFmt,
      storyMode, ctaUrl, ctaTagline]);

  // Size preview frame to maintain aspect ratio
  useEffect(() => {
    const wrap  = previewWrapRef.current;
    const frame = previewFrameRef.current;
    if (!wrap || !frame) return;
    const { exportW, exportH } = ASPECTS[aspect];
    const ratio = exportW / exportH;
    const update = () => {
      const availW = wrap.clientWidth  - 24;
      const availH = wrap.clientHeight - 24;
      let w: number, h: number;
      if (availW / availH > ratio) {
        h = availH; w = Math.round(h * ratio);
      } else {
        w = availW; h = Math.round(w / ratio);
      }
      frame.style.width  = `${w}px`;
      frame.style.height = `${h}px`;
    };
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    update();
    return () => ro.disconnect();
  }, [aspect]);

  function handleMove(newLat: number, newLon: number, newZoom: number) {
    setLat(newLat); setLon(newLon); setZoom(newZoom);
  }

  function handleLocationSelect(r: SearchResult) {
    const cityName = r.city || r.label.split(",")[0].trim();
    setCity(cityName);
    setCountry(r.country);
    setLat(r.lat);
    setLon(r.lon);
    mapRef.current?.flyTo({ center: [r.lon, r.lat], zoom: 12, duration: 1200 });
  }

  // ── Single export ───────────────────────────────────────────────────────────
  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const fmt  = ASPECTS[aspect];
      const map  = mapRef.current;
      const cLat  = map?.getCenter().lat  ?? lat;
      const cLon  = map?.getCenter().lng  ?? lon;
      const cZoom = map?.getZoom()        ?? zoom;

      const spec: PosterSpec = {
        themeId, city, country,
        lat: cLat, lon: cLon, zoom: cZoom,
        width: fmt.exportW, height: fmt.exportH,
        fontFamily,
        fadeOpacity: showFades ? fadeOpacity : 0,
        gradientStyle,
        showText,
        textScale,
        overlayStyle,
        storyMode,
        ctaUrl,
        ctaTagline,
      };

      const slug = city.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const ext  = exportFmt === "jpeg" ? "jpg" : exportFmt;
      await exportSingle({
        spec,
        format: exportFmt,
        filename: `mapimages_${slug}_${aspect}.${ext}`,
        widthCm:  fmt.widthCm,
        heightCm: fmt.heightCm,
      });
    } catch (err) {
      console.error("[Export]", err);
      setExportError("Export failed — check console for details.");
    } finally {
      setIsExporting(false);
    }
  }

  // ── Batch export ────────────────────────────────────────────────────────────
  async function handleBatchExport() {
    if (isBatchExporting) return;
    setIsBatchExporting(true);
    setBatchProgress({ done: 0, total: 0, current: "Starting…" });
    try {
      const map   = mapRef.current;
      const cLat  = map?.getCenter().lat ?? lat;
      const cLon  = map?.getCenter().lng ?? lon;
      const cZoom = map?.getZoom()       ?? zoom;

      await exportBatchProfile(
        {
          themeId, city, country,
          lat: cLat, lon: cLon, zoom: cZoom,
          fontFamily,
          fadeOpacity: showFades ? fadeOpacity : 0,
          gradientStyle,
          showText,
          textScale,
          overlayStyle,
        },
        batchProfileId,
        (p) => setBatchProgress(p),
      );
    } catch (err) {
      console.error("[Batch Export]", err);
      setExportError("Batch export failed — check console for details.");
    } finally {
      setIsBatchExporting(false);
      setBatchProgress(null);
    }
  }

  // ── Story share — renders chosen variant and triggers Web Share / download ──
  async function handleShareStory(variant: ShareVariant) {
    if (exportingVariant) return;
    setExportingVariant(variant);
    // Nudge to 9:16 if not already
    if (aspect !== "story") setAspect("story");
    try {
      const map   = mapRef.current;
      const cLat  = map?.getCenter().lat ?? lat;
      const cLon  = map?.getCenter().lng ?? lon;
      const cZoom = map?.getZoom()       ?? zoom;

      // For the full-route demo variant, generate stops around the current center
      const demoStops = variant === "full-route" ? buildDemoStops(cLat, cLon) : undefined;
      // Area/polygon demo: a closed ring around the current center
      const demoPolygon = variant === "polygon" ? buildDemoPolygon(cLat, cLon) : undefined;
      // Real route geometry — prefer the uploaded GPX track (if any) for
      // route-to / full-route over the decorative curve/straight line.
      const useGpx = (variant === "route-to" || variant === "full-route") && routeGpxText;

      // RENDER_API_URL is injected at build time via Vite define (see vite.config.ts).
      // When set, rendering happens server-side; otherwise falls back to local WebGL.
      const apiBaseUrl = (typeof __RENDER_API_URL__ !== "undefined" ? __RENDER_API_URL__ : "") || undefined;

      await shareStory({
        variant,
        posterSpec: {
          themeId, city, country,
          lat: cLat, lon: cLon, zoom: cZoom,
          fontFamily,
          fadeOpacity: showFades ? fadeOpacity : 0,
          gradientStyle,
          showText,
          textScale,
          overlayStyle,
        },
        marker: {
          title: city,
          note: undefined,
          photos: storyPhotos.length ? storyPhotos : undefined,
        },
        // route-to: from ~1 km south of current center
        routeFromLatLon: variant === "route-to"
          ? [cLat - 0.009, cLon - 0.005]
          : undefined,
        routeDistanceKm:    variant === "route-to" ? 1.4 : undefined,
        routeMinutes:       variant === "route-to" ? 18  : undefined,
        // full-route
        stops:              demoStops,
        routeName:          variant === "full-route" ? (routeGpxName ?? city) : undefined,
        routeTotalKm:       variant === "full-route" ? 5.2 : undefined,
        routeTotalMinutes:  variant === "full-route" ? 72  : undefined,
        // real polyline geometry (route-to / full-route), from an uploaded GPX track
        routeGpx:           useGpx ? routeGpxText : undefined,
        // area / polygon
        polygonRing:        demoPolygon,
        ctaUrl,
        ctaTagline,
      }, apiBaseUrl);
    } catch (err) {
      console.error("[Story Share]", err);
      setExportError("Share failed — check console for details.");
    } finally {
      setExportingVariant(null);
    }
  }

  function buildDemoStops(centerLat: number, centerLon: number) {
    // Approximate offsets to place 4 stops within ~3 km of center
    const offsets: Array<[number, number, string]> = [
      [ 0.022,  0.005, "Start"],
      [ 0.012, -0.010, "Stop 2"],
      [ 0.000,  0.008, "Stop 3"],
      [-0.012, -0.004, city],
    ];
    return offsets.map(([dlat, dlon, label]) => ({
      label,
      lat: centerLat + dlat,
      lon: centerLon + dlon,
    }));
  }

  /** Demo closed ring (~1km hexagon) around the current center — polygon/area variant. */
  function buildDemoPolygon(centerLat: number, centerLon: number) {
    const points = 6;
    const radiusLat = 0.006;
    const radiusLon = 0.009;
    return Array.from({ length: points }, (_, i) => {
      const angle = (i / points) * Math.PI * 2;
      return {
        lat: centerLat + Math.sin(angle) * radiusLat,
        lon: centerLon + Math.cos(angle) * radiusLon,
      };
    });
  }

  function handleGpxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRouteGpxText(String(reader.result ?? ""));
      setRouteGpxName(file.name.replace(/\.gpx$/i, ""));
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-upload of same file
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    Promise.all(
      files.map(
        (f) =>
          new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(f);
          }),
      ),
    ).then((urls) => setStoryPhotos((prev) => [...prev, ...urls].slice(0, 6)));
    e.target.value = ""; // allow re-upload of same file
  }

  const exportLabel    = isExporting ? "Rendering…" : `Export ${exportFmt.toUpperCase()} ↓`;
  const isStoryBusy    = exportingVariant !== null;
  const isBusy         = isExporting || isBatchExporting || isStoryBusy;

  const STORY_VARIANTS: Array<{ id: ShareVariant; label: string; icon: string; hint: string }> = [
    { id: "pin",        label: "Pin",       icon: "📍", hint: "Location pin on styled map" },
    { id: "route-to",   label: "Route to",  icon: "🗺",  hint: "Path from your position to here — upload a GPX for the real track" },
    { id: "photo-map",  label: "Photo",     icon: "📸", hint: "Your photo + mini map below" },
    { id: "full-route", label: "Route",     icon: "🛣",  hint: "Full journey with all stops — upload a GPX for the real track" },
    { id: "pin-photos", label: "Memories",  icon: "🖼",  hint: "Pin with your attached photos" },
    { id: "polygon",    label: "Area",      icon: "▱",  hint: "Filled/outlined area around the current center" },
  ];

  return (
    <div className="editor-root">
      {/* ── Header ── */}
      <header className="editor-header">
        <div className="editor-logo">
          <span className="editor-logo-mark">◈</span>
          <span className="editor-logo-name">mapimages</span>
        </div>
        <SearchBar onSelect={handleLocationSelect} />
      </header>

      <div className="editor-body">
        {/* ── Map preview ── */}
        <div className="editor-preview-wrap" ref={previewWrapRef}>
          <div className="editor-preview-frame" ref={previewFrameRef}>
            <MapPreviewCanvas
              themeId={themeId}
              initLat={lat} initLon={lon} initZoom={zoom}
              city={city} country={country}
              fontFamily={fontFamily}
              showText={showText}
              showFades={showFades}
              fadeOpacity={fadeOpacity}
              gradientStyle={gradientStyle}
              textScale={textScale}
              overlayStyle={overlayStyle}
              storyMode={storyMode}
              ctaUrl={ctaUrl}
              ctaTagline={ctaTagline}
              onMove={handleMove}
              onMapReady={(m) => { mapRef.current = m; }}
            />
          </div>
        </div>

        {/* ── Control panel ── */}
        <aside className="editor-panel">

          {/* Theme */}
          <section className="panel-section">
            <span className="panel-label">Theme</span>
            <ThemeRow activeId={themeId} onSelect={setThemeId} />
          </section>

          {/* Font */}
          <section className="panel-section">
            <span className="panel-label">Font</span>
            <FontRow activeFamily={fontFamily} onSelect={setFontFamily} />
          </section>

          {/* Gradient */}
          <section className="panel-section">
            <div className="panel-row panel-row--between">
              <span className="panel-label">Gradient</span>
              <Toggle on={showFades} onChange={setShowFades} />
            </div>
            {showFades && (
              <>
                <div className="aspect-row">
                  {(["symmetric", "heavy-bottom", "top-bottom", "vignette"] as GradientStyle[]).map((g) => (
                    <button
                      key={g}
                      className={`aspect-btn${gradientStyle === g ? " aspect-btn--active" : ""}`}
                      onClick={() => setGradientStyle(g)}
                    >
                      {g === "symmetric" ? "Even" : g === "heavy-bottom" ? "Bottom" : g === "top-bottom" ? "Both" : "Vignette"}
                    </button>
                  ))}
                </div>
                <div className="panel-row">
                  <span className="slider-label">Opacity</span>
                  <input
                    type="range" min={0} max={100}
                    value={Math.round(fadeOpacity * 100)}
                    onChange={(e) => setFadeOpacity(Number(e.target.value) / 100)}
                    className="slider"
                  />
                  <span className="slider-value">{Math.round(fadeOpacity * 100)}%</span>
                </div>
              </>
            )}
          </section>

          {/* Text */}
          <section className="panel-section">
            <div className="panel-row panel-row--between">
              <span className="panel-label">Text</span>
              <Toggle on={showText} onChange={setShowText} />
            </div>
            {showText && (
              <>
                <div className="aspect-row">
                  {(["classic", "minimal", "centered", "corner"] as OverlayStyle[]).map((s) => (
                    <button
                      key={s}
                      className={`aspect-btn${overlayStyle === s ? " aspect-btn--active" : ""}`}
                      onClick={() => setOverlayStyle(s)}
                      style={{ textTransform: "capitalize" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="panel-row">
                  <span className="slider-label">Size</span>
                  <input
                    type="range" min={50} max={180}
                    value={Math.round(textScale * 100)}
                    onChange={(e) => setTextScale(Number(e.target.value) / 100)}
                    className="slider"
                  />
                  <span className="slider-value">{Math.round(textScale * 100)}%</span>
                </div>
                <div className="panel-inputs">
                  <input
                    className="text-input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                  />
                  <input
                    className="text-input"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                  />
                </div>
              </>
            )}
          </section>

          {/* Format */}
          <section className="panel-section">
            <span className="panel-label">Format</span>
            <div className="aspect-row">
              {(Object.keys(ASPECTS) as AspectKey[]).map((key) => (
                <button
                  key={key}
                  className={`aspect-btn${aspect === key ? " aspect-btn--active" : ""}`}
                  onClick={() => setAspect(key)}
                >
                  {ASPECTS[key].label}
                </button>
              ))}
            </div>
          </section>

          {/* Export */}
          <section className="panel-section">
            <span className="panel-label">Export</span>
            <div className="aspect-row">
              {(["jpeg", "png", "pdf"] as ExportFileFormat[]).map((f) => (
                <button
                  key={f}
                  className={`aspect-btn${exportFmt === f ? " aspect-btn--active" : ""}`}
                  onClick={() => setExportFmt(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              className="export-btn"
              onClick={() => { setExportError(null); handleExport(); }}
              disabled={isBusy}
            >
              {exportLabel}
            </button>
            {exportError && (
              <div style={{ fontSize: "0.65rem", color: "#e55", marginTop: 4, lineHeight: 1.3 }}>
                ⚠ {exportError}
                <button onClick={() => setExportError(null)}
                  style={{ marginLeft: 6, background: "none", border: "none", color: "#e55", cursor: "pointer", fontSize: "0.65rem" }}>✕</button>
              </div>
            )}
          </section>

          {/* Story share */}
          <section className="panel-section">
            <div className="panel-row panel-row--between">
              <div className="story-label-group">
                <span className="panel-label">Story Share</span>
                <span className="story-badge">TikTok · Instagram</span>
              </div>
              <Toggle on={storyMode} onChange={(v) => {
                setStoryMode(v);
                if (v) setAspect("story");
              }} />
            </div>
            {storyMode && (
              <>
                <div className="story-preview-note">
                  ◈ travlr CTA + overlay composited onto 1080×1920 poster
                </div>

                {/* CTA customisation */}
                <div className="panel-inputs">
                  <input
                    className="text-input"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="travlr.earth"
                    aria-label="CTA URL"
                  />
                  <input
                    className="text-input"
                    value={ctaTagline}
                    onChange={(e) => setCtaTagline(e.target.value)}
                    placeholder="Discover more"
                    aria-label="CTA tagline"
                  />
                </div>

                {/* Photo upload (used by Photo+Map and Memories variants) */}
                <div className="panel-row panel-row--between">
                  <label
                    htmlFor="story-photo-upload"
                    className="aspect-btn"
                    style={{ cursor: "pointer", flex: "none", padding: "6px 12px" }}
                    title="Attach photos for Photo+Map or Memories variants"
                  >
                    📎 Add photos
                  </label>
                  <input
                    id="story-photo-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={handlePhotoUpload}
                  />
                  {storyPhotos.length > 0 && (
                    <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                      {storyPhotos.length} photo{storyPhotos.length !== 1 ? "s" : ""}
                      <button
                        onClick={() => setStoryPhotos([])}
                        style={{ marginLeft: 6, background: "none", border: "none",
                          color: "var(--muted)", cursor: "pointer", fontSize: "0.65rem" }}
                      >✕</button>
                    </span>
                  )}
                </div>

                {/* GPX upload — real polyline geometry for Route to / Route variants,
                    drawn via the real multi-segment route engine instead of the
                    decorative curve/straight-line. */}
                <div className="panel-row panel-row--between">
                  <label
                    htmlFor="story-gpx-upload"
                    className="aspect-btn"
                    style={{ cursor: "pointer", flex: "none", padding: "6px 12px" }}
                    title="Upload a GPX track for Route to / Route — draws the real path"
                  >
                    🧭 Upload GPX
                  </label>
                  <input
                    id="story-gpx-upload"
                    type="file"
                    accept=".gpx,application/gpx+xml,text/xml"
                    style={{ display: "none" }}
                    onChange={handleGpxUpload}
                  />
                  {routeGpxText && (
                    <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                      {routeGpxName || "track.gpx"}
                      <button
                        onClick={() => { setRouteGpxText(null); setRouteGpxName(null); }}
                        style={{ marginLeft: 6, background: "none", border: "none",
                          color: "var(--muted)", cursor: "pointer", fontSize: "0.65rem" }}
                      >✕</button>
                    </span>
                  )}
                </div>

                {/* 5 share variant buttons */}
                <div className="panel-label" style={{ marginTop: 2 }}>Share as</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  {STORY_VARIANTS.map(({ id, label, icon, hint }) => (
                    <button
                      key={id}
                      className="export-btn export-btn--story"
                      style={{ fontSize: "0.72rem", padding: "9px 4px", letterSpacing: 0 }}
                      onClick={() => { setExportError(null); handleShareStory(id); }}
                      disabled={isBusy}
                      title={hint}
                    >
                      {exportingVariant === id
                        ? "Rendering…"
                        : `${icon} ${label}`}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Batch export */}
          <section className="panel-section">
            <span className="panel-label">Batch Export</span>
            <div className="picker-row">
              {OUTPUT_PROFILES.map((p) => (
                <button
                  key={p.id}
                  className={`profile-chip${batchProfileId === p.id ? " profile-chip--active" : ""}`}
                  onClick={() => setBatchProfileId(p.id)}
                  title={p.description}
                >
                  {p.icon} {p.name}
                </button>
              ))}
            </div>
            {batchProgress && (
              <div className="batch-progress">
                {batchProgress.total > 0
                  ? `${batchProgress.done}/${batchProgress.total} — ${batchProgress.current}`
                  : batchProgress.current}
              </div>
            )}
            <button
              className="export-btn export-btn--secondary"
              onClick={handleBatchExport}
              disabled={isBusy}
            >
              {isBatchExporting ? "Packaging…" : "Export ZIP ↓"}
            </button>
          </section>

          <p className="panel-hint">Drag the map to frame · scroll to zoom</p>
        </aside>
      </div>
    </div>
  );
}
