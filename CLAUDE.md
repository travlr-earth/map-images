# map-images — Claude Code Guide

> TRAVLR's map imagery engine (posters, prints, share images, thumbnails).
> EditorApp (`src/demo/`) is the main app entry.

## Commands

```bash
npm install                  # install dependencies
npx vite --host              # dev server (http://localhost:5173)
npx vite --port 5007         # demo gallery entry (demo.html)
npm run typecheck            # tsc --noEmit
npm run styles:generate      # bake all 18 theme styles → src/map-styles/*.json
```

## Architecture: Feature-based + Hexagonal/Clean

The UI layer (`features/*/ui/`) has been stripped. Only `domain/` and `infrastructure/` layers remain in features. The new UI lives in `src/demo/`.

```text
src/
  features/
    export/       — domain + infrastructure only (exporters, file download)
    layout/       — domain only (paper size types)
    location/     — domain + infrastructure (geocoding via Nominatim)
    map/          — domain + infrastructure (MapLibre style spec)
    markers/      — domain + infrastructure (marker canvas rendering)
    poster/       — domain + infrastructure (compositor, typography, layers)
    routes/       — domain + infrastructure (GPX parser, route rendering)
    theme/        — domain + infrastructure (theme types, repository)
  core/
    cache/        fonts/        http/        platform/
    config.ts     services.ts
  shared/
    geo/          hooks/        utils/
  data/           fonts/        i18n/        pipeline/
  demo/           types/
  map-styles/     — pre-baked MapLibre style JSON files (one per theme)
  scripts/        — generate-map-styles.ts (run via npm run styles:generate)
```

## Layer import rules

| Layer | May import | Must not import |
|---|---|---|
| `domain/` | nothing | infrastructure, application, ui, React |
| `infrastructure/` | domain, shared, core | application, ui, React |
| `core/services.ts` | infrastructure adapters | any feature |

## Key Services (`src/core/services.ts`)

```ts
compositeExport            // poster compositing (map + fades + text)
captureMapAsCanvas         // MapLibre map → canvas snapshot
createPngBlob / createPdfBlobFromCanvas / createLayeredSvgBlobFromMap
createJpgBlob / createWebpBlob
createPosterFilename       // generate export filename
triggerDownloadBlob        // file download
```

## Renderer modules (`src/features/poster/infrastructure/renderer/`)

| File | Exports | Notes |
|---|---|---|
| `layers.ts` | `applyFades`, `GradientStyle` | 4 gradient presets: symmetric / heavy-bottom / top-bottom / vignette |
| `typography.ts` | `drawPosterText`, `OverlayStyle` | 4 overlay styles: classic / minimal / centered / corner |
| `storyCta.ts` | `drawStoryCta`, `StoryCta` | Story-format CTA bar for TikTok/Instagram share images |

## Poster Renderer (`src/demo/PosterRenderer.ts`)

```ts
export interface PosterSpec {
  themeId, city, country, lat, lon, zoom, width, height,
  fontFamily?, fadeOpacity?, gradientStyle?, showText?, textScale?, overlayStyle?,
  storyMode?,   // enables CTA footer when true
  ctaText?,     // override CTA string (default: "Explore [city] on travlr.earth")
}

renderSinglePosterCanvas(spec)  // → HTMLCanvasElement (multi-format use)
renderSinglePoster(spec)        // → JPEG data URL
renderAllPosters(specs, onProgress, signal?)   // batch
```

Sequential offscreen MapLibre rendering via `styledata` → `idle` two-stage wait.
One shared Map instance; styles switched with `setStyle({ diff: false })`.

## URL State (`src/demo/urlState.ts`)

All editor state serialises to URL params — shareable links / programmatic access:
```
?city=Tokyo&lat=35.6762&lon=139.6503&zoom=12&theme=noir&font=Bebas+Neue
&gs=heavy-bottom&fo=85&os=classic&ts=100&aspect=portrait&efmt=jpeg
```

`encodeToUrl(state)` / `decodeFromUrl()` — module-level, uses `replaceState`.

## Export Service (`src/demo/exportService.ts`)

```ts
exportSingle({ spec, format, filename, widthCm?, heightCm? })
exportBatchProfile(baseSpec, profileId, onProgress)  // → ZIP download
```

Supports JPEG / PNG / PDF. Batch export packages into `.zip` via jszip.

## Pipeline (`src/pipeline/`)

```ts
import { ALL_FORMATS, getFormatsByCategory } from "@/pipeline/formats";
import { OUTPUT_PROFILES } from "@/pipeline/profiles";    // 7 profiles, 51 formats
import { runBatchExport } from "@/pipeline/batchExport";
import { downloadAsZip } from "@/pipeline/zip";
```

## Local Map Styles (`src/map-styles/`)

Pre-baked MapLibre v8 style JSON for all 18 themes. Each file is fully self-contained
(sources + layers) and valid for direct use with MapLibre or any MapLibre-compatible tool.

```ts
import { getLocalStyle } from "@/map-styles";
map.setStyle(getLocalStyle("midnight_blue"));
// or serve statically: map.setStyle("/map-styles/noir.json")
```

Regenerate: `npm run styles:generate`

## i18n (`src/i18n/`)

```ts
import { useI18n, ti } from "@/i18n";
const { t, locale, setLocale } = useI18n();
```

Supported locales: `en` | `nl` | `de` | `fr` | `es` | `ja`

## Font Registry (`src/fonts/registry.ts`)

```ts
import { getFontsForLocale, getDefaultFont } from "@/fonts/registry";
const fonts = getFontsForLocale("ja"); // Noto Sans JP first
```

## TypeScript

- All new files: `.ts` / `.tsx`. No `.js` in `src/`.
- `strict: false`, `allowJs: true`, `baseUrl: "src"`, `@/` → `src/`
- Use `@/` alias for all cross-feature imports

## Crispness / rendering notes

- `forExport: true` in `generateMapStyle` options enables ×3.65 line-width compensation
  (only needed for captureMapAsCanvas overzoom path — NOT for PosterRenderer)
- Canvas DPR: always set `canvas.width/height` in physical pixels (`size × devicePixelRatio`)
- `TEXT_DIMENSION_REFERENCE_PX = 1500` (calibrated for 1240–1920px export range)

## Environment Variables

Access only through `src/core/config.ts`. All optional for local dev.

## Commit Style

```
✨ feat(demo): add location search
🐛 fix(renderer): fix idle timeout on style switch
♻️ refactor(pipeline): simplify batch export loop
```

## Do Not

- Import from `@/lib/`, `@/utils/`, `@/hooks/`, `@/components/` — use `@/shared/`
- Call `fetch()`, `localStorage`, or external APIs directly — use `core/services.ts`
- Add UI components to `features/*/ui/` — that layer was intentionally removed
- Set `forExport: true` when rendering via `PosterRenderer` (not overzoom path)
