# map-images

TRAVLR's map imagery engine. One renderer, many outputs: shop posters and
print masters, 1080×1920 share/story images, thumbnails, email banners,
product previews — composited map snapshots with theme-matched fades and
typography, rendered with MapLibre GL JS on OpenStreetMap data via
OpenFreeMap vector tiles.

## What's inside

- **18 map themes** — palettes for land, water, roads, text, baked to
  self-contained MapLibre styles in `src/map-styles/`
- **Interactive editor** (`src/demo/EditorApp`) — theme, font, gradient,
  text, format, export; full state in the URL for shareable links
- **Poster compositor** — map snapshot + gradient fades + city/country/
  coordinates typography, plus a story-mode CTA footer
- **51 export format specs** across print (A5→A2, travel sizes), social,
  stories (9:16), wallpaper (16:9), and web
- **7 batch export profiles** — one-click ZIP bundles
- **Render worker** (`server/`) — headless Playwright service on Fly.io
  (`mapimages-render`) behind the `render-story` Supabase edge function;
  powers the in-app story-share feature

## Commands

```bash
npm install
npx vite --host              # dev server
npm run typecheck            # tsc --noEmit
npm run build                # production build
npm run build:render         # render lib for server/public/render.html
npm run styles:generate      # rebake src/map-styles/*.json
```

## Ecosystem

Part of the travlr-earth org — see the knowledge base for the system map.
Siblings: `map-images-mockups` (product mockup galleries) and
`map-images-factory` (poster product generation). Poster vector styles are
authored in `map-style-builder` (`styles/poster-*`).

Proprietary — © TRAVLR / Mats Miersen. All rights reserved.
