# Routekeeper — web

React 19 + TypeScript PWA used by both drivers and admins. The role claim on the Firebase ID token decides which area a user lands in.

## Setup

```bash
npm install
cp .env.example .env   # fill in the Firebase web config and API URL
npm run dev            # http://localhost:5173
```

| Script | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest + Testing Library |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | oxlint |
| `npm run build` | production build into `dist/` |

Geolocation and the camera require HTTPS, so test the driver flow on a deployed URL from a phone.

## Structure

```
src/
  app/          router and root component
  config/       typed, validated environment
  components/   shared UI: ui/ primitives, layout/, map/, trip/, photo/, stops/, feedback/
  features/     auth, account, admin/{users,shops,routes,trips,config}, driver/{trips,active-trip}
                each feature owns its api.ts (requests) and hooks.ts (TanStack Query)
  lib/          http client, zod schemas, query keys, firebase, gps, camera, formatting
```

Styling is Tailwind CSS 4, configured CSS-first in `src/index.css` (`@theme` tokens, `@utility` helpers, dark mode through CSS variables).

## Basemap

Maps are rendered with MapLibre GL from a self-hosted [Protomaps](https://protomaps.com) PMTiles file, so there is no tile server or API key. `public/map/` is gitignored; build it for your region:

```bash
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles \
  public/map/basemap.pmtiles --bbox=<minLng,minLat,maxLng,maxLat> --maxzoom=14
node scripts/make-map-style.mjs      # light and dark styles
node scripts/fetch-map-assets.mjs    # glyphs and sprites
```

Set `VITE_MAP_CENTER` (and optionally `VITE_MAP_BOUNDS`) to the same region. Without a basemap the app still works and draws locations on a blank canvas. Map data © OpenStreetMap contributors.
