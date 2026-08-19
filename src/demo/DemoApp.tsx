import { useState, useEffect, useRef, useCallback } from "react";
import { themeOptions } from "@/features/theme/infrastructure/themeRepository";
import { getTheme } from "@/features/theme/infrastructure/themeRepository";
import { renderAllPosters, type RenderedPoster, type PosterSpec } from "./PosterRenderer";
import { ALL_FORMATS, FORMAT_CATEGORIES } from "@/pipeline/formats";
import type { FormatCategory } from "@/pipeline/types";

// ─── Theme list ───────────────────────────────────────────────────────────────

const ALL_THEME_IDS = themeOptions.map((t) => t.id);

// ─── Preset locations ─────────────────────────────────────────────────────────

const LOCATIONS = [
  { label: "Amsterdam", city: "Amsterdam", country: "Netherlands", lat: 52.3676, lon: 4.9041, zoom: 12 },
  { label: "Tokyo", city: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503, zoom: 12 },
  { label: "New York", city: "New York", country: "United States", lat: 40.7128, lon: -74.006, zoom: 12 },
  { label: "Paris", city: "Paris", country: "France", lat: 48.8534, lon: 2.3488, zoom: 12 },
  { label: "Cape Town", city: "Cape Town", country: "South Africa", lat: -33.9249, lon: 18.4241, zoom: 12 },
  { label: "Sydney", city: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093, zoom: 12 },
];

// ─── Format aspect ratios for card sizing ─────────────────────────────────────

const FORMAT_SIZES: Record<string, { w: number; h: number }> = {
  print:    { w: 360, h: 509 }, // A4 portrait ~√2
  social:   { w: 360, h: 360 }, // square
  stories:  { w: 220, h: 391 }, // 9:16
  wallpaper:{ w: 400, h: 225 }, // 16:9
  web:      { w: 400, h: 210 }, // wide
};

const CATEGORY_ICONS: Record<FormatCategory, string> = {
  print: "🖨️", social: "📲", stories: "📱", wallpaper: "🖥️", web: "🌐",
};

// ─── PosterCard ───────────────────────────────────────────────────────────────

function PosterCard({
  themeId,
  result,
  isActive,
  onClick,
}: {
  themeId: string;
  result: RenderedPoster | null;
  isActive: boolean;
  onClick: () => void;
}) {
  const theme = getTheme(themeId);

  return (
    <button
      className={`poster-card ${isActive ? "poster-card--active" : ""}`}
      onClick={onClick}
      style={{ background: theme.ui.bg }}
    >
      {result ? (
        <img
          src={result.dataUrl}
          alt={theme.name}
          className="poster-card__img"
        />
      ) : (
        <div className="poster-card__loading" style={{ background: theme.ui.bg }}>
          <div className="poster-card__shimmer" />
          <span className="poster-card__loading-name" style={{ color: theme.ui.text }}>
            {theme.name}
          </span>
        </div>
      )}
      <div className="poster-card__label" style={{ background: theme.ui.bg, color: theme.ui.text }}>
        <span className="poster-card__name">{theme.name}</span>
      </div>
    </button>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  result,
  themeId,
  onClose,
  onPrev,
  onNext,
}: {
  result: RenderedPoster;
  themeId: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const theme = getTheme(themeId);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox__inner" onClick={(e) => e.stopPropagation()}>
        <img src={result.dataUrl} alt={theme.name} className="lightbox__img" />
        <div className="lightbox__bar" style={{ background: theme.ui.bg, color: theme.ui.text }}>
          <button className="lightbox__nav" onClick={onPrev}>‹</button>
          <div>
            <strong>{theme.name}</strong>
            <span className="lightbox__desc">{theme.description}</span>
          </div>
          <button className="lightbox__nav" onClick={onNext}>›</button>
          <button className="lightbox__close" onClick={onClose}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── DemoApp ──────────────────────────────────────────────────────────────────

export function DemoApp() {
  const [section, setSection] = useState<"themes" | "formats">("themes");
  const [locationIdx, setLocationIdx] = useState(0);
  const [rendered, setRendered] = useState<Record<string, RenderedPoster>>({});
  const [renderCount, setRenderCount] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loc = LOCATIONS[locationIdx];

  const startRender = useCallback(() => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setRendered({});
    setRenderCount(0);

    const specs: PosterSpec[] = ALL_THEME_IDS.map((id) => ({
      themeId: id,
      city: loc.city,
      country: loc.country,
      lat: loc.lat,
      lon: loc.lon,
      zoom: loc.zoom,
      width: 420,
      height: 594, // A4 ratio at preview size
    }));

    renderAllPosters(
      specs,
      (result) => {
        if (abort.signal.aborted) return;
        setRendered((prev) => ({ ...prev, [result.themeId]: result }));
        setRenderCount((n) => n + 1);
      },
      abort.signal,
    ).catch(() => {});
  }, [loc]);

  useEffect(() => {
    startRender();
    return () => { abortRef.current?.abort(); };
  }, [startRender]);

  const lightboxThemeIds = ALL_THEME_IDS.filter((id) => rendered[id]);
  const lightboxIdx = lightbox ? lightboxThemeIds.indexOf(lightbox) : -1;

  return (
    <div className="demo-root">
      {/* Header */}
      <header className="demo-header">
        <div className="demo-logo">
          <span className="demo-logo-mark">◈</span>
          <span className="demo-logo-name">mapimages</span>
          <span className="demo-logo-sub">travlr-earth</span>
        </div>

        <div className="demo-controls">
          {/* Location picker */}
          <div className="demo-loc-picker">
            {LOCATIONS.map((l, i) => (
              <button
                key={l.label}
                className={`demo-loc-btn ${i === locationIdx ? "active" : ""}`}
                onClick={() => setLocationIdx(i)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <nav className="demo-nav">
          <button
            className={`demo-nav-btn ${section === "themes" ? "active" : ""}`}
            onClick={() => setSection("themes")}
          >
            {ALL_THEME_IDS.length} Themes
            {renderCount > 0 && renderCount < ALL_THEME_IDS.length && (
              <span className="demo-nav-progress"> {renderCount}/{ALL_THEME_IDS.length}</span>
            )}
          </button>
          <button
            className={`demo-nav-btn ${section === "formats" ? "active" : ""}`}
            onClick={() => setSection("formats")}
          >
            {ALL_FORMATS.length} Formats
          </button>
          <a className="demo-nav-link" href="/" target="_blank">Open App ↗</a>
        </nav>
      </header>

      {/* Themes grid */}
      {section === "themes" && (
        <main className="demo-grid-wrap">
          {renderCount === 0 && (
            <div className="demo-render-hint">
              Rendering posters… {renderCount}/{ALL_THEME_IDS.length}
            </div>
          )}
          <div className="demo-poster-grid">
            {ALL_THEME_IDS.map((id) => (
              <PosterCard
                key={id}
                themeId={id}
                result={rendered[id] ?? null}
                isActive={lightbox === id}
                onClick={() => rendered[id] && setLightbox(id)}
              />
            ))}
          </div>
        </main>
      )}

      {/* Formats reference */}
      {section === "formats" && (
        <main className="demo-formats-wrap">
          {FORMAT_CATEGORIES.map((cat) => {
            const formats = ALL_FORMATS.filter((f) => f.category === cat.id);
            const previewTheme = getTheme(ALL_THEME_IDS[0]);
            const sz = FORMAT_SIZES[cat.id] ?? { w: 300, h: 200 };

            return (
              <section key={cat.id} className="demo-fmt-section">
                <h2 className="demo-fmt-title">
                  {CATEGORY_ICONS[cat.id]} {cat.name}
                  <span className="demo-fmt-count">{formats.length} formats</span>
                </h2>
                <div className="demo-fmt-cards">
                  {formats.map((f) => {
                    const ar = f.pixelWidth / f.pixelHeight;
                    const bh = Math.round(sz.w / ar);
                    const maxH = 140;
                    const bw = bh > maxH ? Math.round(sz.w * (maxH / bh)) : sz.w;
                    const bh2 = bh > maxH ? maxH : bh;
                    return (
                      <div key={f.id} className="demo-fmt-card">
                        <div className="demo-fmt-preview-wrap" style={{ height: 150 }}>
                          <div
                            className="demo-fmt-box"
                            style={{
                              width: bw,
                              height: bh2,
                              background: `linear-gradient(150deg, ${previewTheme.map.land}, ${previewTheme.map.water})`,
                              borderColor: previewTheme.map.roads.major,
                              color: previewTheme.ui.text,
                            }}
                          >
                            <span className="demo-fmt-dim">
                              {f.unit === "cm"
                                ? `${f.width}×${f.height} cm`
                                : `${f.pixelWidth}×${f.pixelHeight}px`}
                            </span>
                          </div>
                        </div>
                        <span className="demo-fmt-name">{f.name}</span>
                        <span className="demo-fmt-desc">{f.description}</span>
                        <span className="demo-fmt-ext">.{f.defaultFormat.toUpperCase()}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </main>
      )}

      {/* Lightbox */}
      {lightbox && rendered[lightbox] && (
        <Lightbox
          result={rendered[lightbox]}
          themeId={lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => {
            const i = (lightboxIdx - 1 + lightboxThemeIds.length) % lightboxThemeIds.length;
            setLightbox(lightboxThemeIds[i]);
          }}
          onNext={() => {
            const i = (lightboxIdx + 1) % lightboxThemeIds.length;
            setLightbox(lightboxThemeIds[i]);
          }}
        />
      )}
    </div>
  );
}
