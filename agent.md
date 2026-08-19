# mapimages — Agent Architecture Guide

> Read this before making any change with an AI coding agent.

## Ground Rules: Verify, Don't Guess

- Never reference a file path, export, type, or API surface you have not just read from disk.
- A function "sounding plausible" is not evidence it exists — confirm via search before using it.
- When uncertain, stop and read the relevant source (or ask) instead of proceeding on assumption.
- If a request conflicts with the architecture described here, raise that conflict before writing code.

## Architecture: Feature-based + Hexagonal/Clean

Code is organised as vertical slices under `src/features/`, each slice layered as:

- **`domain/`** — types, port interfaces, pure functions. Zero React, zero I/O.
- **`application/`** — React hooks orchestrating use cases through domain code and `core/services`.
- **`infrastructure/`** — adapters implementing the domain ports (HTTP, cache, parsers).
- **`ui/`** — React components; they consume context state and application hooks.

### Feature inventory

```text
src/features/
  export/     install/    layout/     location/
  map/        markers/    poster/     theme/      updates/
```

Cross-cutting concerns live outside features:

- **`core/`** — `ICache`, `IHttp`, `IFontLoader` ports and their adapters. `config.ts` for all env vars. `services.ts` wires all adapters into named singletons consumed by application hooks.
- **`shared/geo/`** — geographic math and pure utilities.
- **`shared/hooks/`** — reusable React hooks used across features (`useRepoStars`, `useSwipeDown`).
- **`shared/ui/`** — UI atoms (icons, modals) used across features.
- **`shared/utils/`** — helper utilities (color, location, number, string).
- **`data/`** — static JSON theme and layout definitions.
- **`styles/`** — global CSS only (10 files). Desktop breakpoint `>980px`, mobile `≤760px`.

### Layer import rules

| Layer | May import | Must not import |
| --- | --- | --- |
| `domain/` | nothing | infrastructure, application, ui, React |
| `application/` | domain, shared, core/config, core/services | infrastructure directly |
| `infrastructure/` | domain, shared, core | application, ui, React |
| `ui/` | domain, application, shared/ui, shared/utils | infrastructure directly |
| `core/services.ts` | infrastructure adapters | any feature (no circular deps) |

## State Management

- One store: `PosterContext`, built on React Context plus `useReducer`.
- `PosterState`, `PosterForm`, and the `PosterAction` union all live in `posterReducer.ts`.
- Components read state through `usePosterContext()` — never by threading props down.
- Side-effect logic lives in application hooks: `useFormHandlers`, `useMapSync`, `useGeolocation`, `useLocationAutocomplete`, `useCurrentLocation`, `useExport`.

## Key Application Hooks

| Hook | Feature | Purpose |
| --- | --- | --- |
| `useFormHandlers` | poster | form input and location handlers |
| `useMapSync` | map | bidirectional map ↔ form sync |
| `useGeolocation` | map | browser geolocation on startup |
| `useLocationAutocomplete` | location | debounced search with stale-result guard |
| `useCurrentLocation` | location | GPS + reverse-geocode shared handler |
| `useExport` | export | poster export orchestration |
| `useInstallPrompt` | install | PWA install prompt |
| `useRepoStars` | shared/hooks | GitHub star count with cache |
| `useSwipeDown` | shared/hooks | mobile swipe gesture |

## Services (`src/core/services.ts`)

Pre-instantiated singletons — the only place application hooks should import I/O capabilities from:

```ts
searchLocations            // location autocomplete (Nominatim)
geocodeLocation            // name → coordinates
reverseGeocodeCoordinates  // coordinates → name
ensureGoogleFont           // font loading
compositeExport            // poster compositing
captureMapAsCanvas         // map → canvas snapshot
createPngBlob              // canvas → PNG
createLayeredSvgBlobFromMap
createPdfBlobFromCanvas
createPosterFilename
triggerDownloadBlob
```

## TypeScript Rules

- New source files are `.ts`/`.tsx` only — do not add `.js` under `src/`.
- The project compiles with `strict: false` and `allowJs: true`; migrating files gradually is fine.
- Cross-feature imports always go through the `@/` alias. `../../` paths across feature boundaries are forbidden.
- Ports (interfaces) belong in `domain/ports.ts` or `core/*/ports.ts`; adapters implement them, and concrete adapter types must never surface in domain or application code.
- `tsconfig.json` paths: `"@/*": ["./*"]` with `"baseUrl": "src"`.

## Naming Conventions

- Components: `PascalCase.tsx` · hooks: `useCamelCase.ts` · pure utilities: `camelCase.ts`
- Port interfaces carry an `I` prefix (`ICache`, `IHttp`, `IGeocodePort`)
- CSS class names are `kebab-case`

## Environment Variables

`src/core/config.ts` is the single reader of `VITE_*` variables — no `import.meta.env.*` access anywhere else. Every variable is optional in local development; core features must work without them. `.env.example` documents the full set.

## Branch Strategy

```text
feature/fix branch → dev → beta → main
```

- `dev` — active development; all PRs target this branch
- `beta` — staging and pre-release testing
- `main` — production

External pull requests must be opened against `dev`, never `main` or `beta`.

## Contribution and Documentation Rules

- AI-generated code ships only after human review, cleanup, and alignment with this architecture.
- Reach for reusable modules, hooks, constants, and utilities before hard-coding values or coupling implementations together.
- In Markdown, never put a `---` horizontal rule directly above a `#`/`##`/`###` heading.
- Fenced code blocks must always declare a language.

## What NOT to Do

- ❌ `App.tsx` stays a thin shell — no logic goes there.
- ❌ Do not import from `@/lib/`, `@/utils/`, `@/hooks/`, or `@/components/` — those directories do not exist; use `@/shared/`.
- ❌ Before writing a utility, check `shared/utils/` and `shared/geo/` — no duplicates.
- ❌ Do not call `fetch()`, `localStorage`, or `new URL()` inside React components or hooks — use the port/adapter pattern via `core/services.ts`.
- ❌ Every CSS class used must have a matching rule in `src/styles/`.
- ❌ Never prop-drill around `PosterContext` more than one level.
- ❌ Lockfiles (`bun.lock`, `package-lock.json`) are tool-managed — regenerate with `bun install`, never hand-edit.
- ❌ Do not reference any exported name, type, or file path from memory — always read the source first.
