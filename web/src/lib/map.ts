import { addProtocol, LngLatBounds, type StyleSpecification } from 'maplibre-gl'
import { Protocol } from 'pmtiles'

let registered = false

export function registerPmtiles() {
  if (registered) return
  const protocol = new Protocol({ metadata: true })
  addProtocol('pmtiles', protocol.tile)
  registered = true
}

/** One style per theme. */
export const styleUrl = (theme: 'light' | 'dark') => `/map/style-${theme}.json`

export function preferredTheme(): 'light' | 'dark' {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** A style with no tile source: just the paper the evidence is drawn on. */
export function blankStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': 'rgba(0,0,0,0)' },
      },
    ],
  } satisfies StyleSpecification
}

const stylePromises = new Map<string, Promise<StyleSpecification>>()

/** MapLibre takes ownership of the style object it is constructed with and mutates it in place, so the same object must never reach two maps. */
export function resolveStyle(theme: 'light' | 'dark' = preferredTheme()): Promise<StyleSpecification> {
  const cached = stylePromises.get(theme)
  if (cached) return cached.then(copy)

  const url = styleUrl(theme)
  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status}`)
      return res.json() as Promise<StyleSpecification>
    })
    .then((style) => {
      registerPmtiles()
      return absoluteSprite(style)
    })
    .catch(() => {
      console.warn(
        `No basemap at ${url}. Drawing locations without map tiles. ` +
          'Run `node scripts/make-map-style.mjs` and `node scripts/fetch-map-assets.mjs`, ' +
          'and build a Protomaps extract for your region into web/public/map/ (see web/README.md).',
      )
      return blankStyle()
    })

  stylePromises.set(theme, promise)
  return promise.then(copy)
}

const copy = (style: StyleSpecification): StyleSpecification => structuredClone(style)

function absoluteSprite(style: StyleSpecification): StyleSpecification {
  if (typeof style.sprite !== 'string') return style
  if (/^https?:\/\//.test(style.sprite)) return style
  return { ...style, sprite: new URL(style.sprite, location.origin).toString() }
}

export const hasBasemap = (style: StyleSpecification) =>
  Object.keys(style.sources ?? {}).length > 0

/** True when the style already carries its own attribution, so we must not add a second. */
export const hasOwnAttribution = (style: StyleSpecification) =>
  Object.values(style.sources ?? {}).some(
    (src) => typeof (src as { attribution?: unknown }).attribution === 'string',
  )

const EARTH_R = 6_371_008.8

/** A circle of `radiusM` around a point, as a GeoJSON polygon. */
export function circlePolygon(
  lat: number,
  lng: number,
  radiusM: number,
  points = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const latR = (lat * Math.PI) / 180
  const dLat = (radiusM / EARTH_R) * (180 / Math.PI)
  const dLng = dLat / Math.cos(latR)

  const ring: GeoJSON.Position[] = []
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)])
  }

  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

/** Bounds that contain every point. */
export function boundsOf(points: { lat: number; lng: number }[]): LngLatBounds | null {
  if (points.length === 0) return null
  const b = new LngLatBounds()
  for (const p of points) b.extend([p.lng, p.lat])
  return b
}
