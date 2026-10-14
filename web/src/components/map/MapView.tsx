import {
  AttributionControl,
  GeoJSONSource,
  Map as MlMap,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'

import {
  boundsOf,
  circlePolygon,
  hasBasemap,
  hasOwnAttribution,
  preferredTheme,
  resolveStyle,
} from '@/lib/map'

import { env } from '@/config/env'
import { readMapColors } from '@/components/map/colors'
import { cn } from '@/lib/utils'

/** How a stop turned out, as the map draws it. */
export type MarkerStatus = 'pending' | 'matched' | 'suspect' | 'done' | 'unchecked'

export type Marker = {
  lat: number
  lng: number
  kind: 'expected' | 'captured' | 'base'
  label?: string
  badge?: string
  status?: MarkerStatus
}

export type Circle = { lat: number; lng: number; radiusM: number }

/** The planned route, in stop order, drawn as one line the way a timetable draws a line. */
export type RoutePath = { lat: number; lng: number }[]

const COLORS = readMapColors()

export function MapView({
  markers,
  circles = [],
  route = [],
  className,
  links = [],
}: {
  markers: Marker[]
  circles?: Circle[]
  route?: RoutePath
  links?: { from: Marker; to: Marker; suspect?: boolean }[]
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [basemap, setBasemap] = useState<boolean | null>(null)

  const data = useRef({ markers, circles, links, route })
  data.current = { markers, circles, links, route }

  const fitKey = markersKey(markers)
  const lastFit = useRef<string | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return

    let cancelled = false
    let created: MlMap | null = null

    resolveStyle().then((style) => {
      if (cancelled || !host.current) return
      setBasemap(hasBasemap(style))

      created = new MlMap({
        container: host.current,
        style,
        center: env.VITE_MAP_CENTER as [number, number],
        ...(env.VITE_MAP_BOUNDS && { maxBounds: env.VITE_MAP_BOUNDS as [number, number, number, number] }),
        zoom: 13,
        attributionControl: false,
      })
      map.current = created

      created.addControl(
        new AttributionControl({
          compact: true,
          customAttribution: hasOwnAttribution(style) ? undefined : '© OpenStreetMap',
        }),
      )
      created.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
      created.addControl(new NavigationControl({ showCompass: false }), 'top-right')

      created.on('error', (e) => {
        console.error('map error:', (e as unknown as { error?: Error }).error ?? e)
      })

      created.on('load', () => {
        const d = data.current
        draw(created!, d.markers, d.circles, d.links, d.route, true)
        lastFit.current = markersKey(d.markers)
      })
    })

    return () => {
      cancelled = true
      created?.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return

    const render = () => {
      const fit = lastFit.current !== fitKey
      draw(m, markers, circles, links, route, fit)
      lastFit.current = fitKey
    }

    if (m.isStyleLoaded()) render()
    else m.once('load', render)
  }, [markers, circles, links, route, fitKey])

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')

    const onChange = () => {
      const m = map.current
      if (!m) return
      resolveStyle(preferredTheme()).then((style) => {
        if (map.current !== m) return
        m.setStyle(style)
        m.once('styledata', () => {
          const d = data.current
          draw(m, d.markers, d.circles, d.links, d.route, false)
        })
      })
    }

    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <div className={cn('relative overflow-hidden rounded-card bg-surface', className)}>
      <div ref={host} className="size-full" />
      {basemap === false ? (
        <p className="pointer-events-none absolute inset-x-2 top-2 rounded-lg bg-surface/90 px-3 py-2 text-caption leading-snug text-ink-2">
          Map tiles are not installed on this deployment. Positions and the match circle are
          drawn to scale — see the scale bar.
        </p>
      ) : null}
    </div>
  )
}

function markersKey(markers: Marker[]): string {
  return markers.map((m) => `${m.kind}:${m.lat},${m.lng}`).join('|')
}

function draw(
  map: MlMap,
  markers: Marker[],
  circles: Circle[],
  links: { from: Marker; to: Marker; suspect?: boolean }[],
  route: RoutePath,
  fit: boolean,
) {
  setGeoJson(map, 'route', {
    type: 'FeatureCollection',
    features:
      route.length < 2
        ? []
        : [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: route.map((p) => [p.lng, p.lat]),
              },
            },
          ],
  })
  if (!map.getLayer('route-line')) {
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLORS.route, 'line-width': 4, 'line-opacity': 0.75 },
    })
  }

  setGeoJson(map, 'match-circles', {
    type: 'FeatureCollection',
    features: circles.map((c) => circlePolygon(c.lat, c.lng, c.radiusM)),
  })
  if (!map.getLayer('match-circle-fill')) {
    map.addLayer({
      id: 'match-circle-fill',
      type: 'fill',
      source: 'match-circles',
      paint: { 'fill-color': COLORS.route, 'fill-opacity': 0.08 },
    })
    map.addLayer({
      id: 'match-circle-line',
      type: 'line',
      source: 'match-circles',
      paint: { 'line-color': COLORS.route, 'line-width': 1.5, 'line-dasharray': [2, 2] },
    })
  }

  setGeoJson(map, 'links', {
    type: 'FeatureCollection',
    features: links.map((l) => ({
      type: 'Feature' as const,
      properties: { suspect: l.suspect ? 1 : 0 },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [l.from.lng, l.from.lat],
          [l.to.lng, l.to.lat],
        ],
      },
    })),
  })
  if (!map.getLayer('link-line')) {
    map.addLayer({
      id: 'link-line',
      type: 'line',
      source: 'links',
      paint: {
        'line-color': ['case', ['==', ['get', 'suspect'], 1], COLORS.suspect, COLORS.captured],
        'line-width': 2,
      },
    })
  }

  setGeoJson(map, 'markers', {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature' as const,
      properties: {
        kind: m.kind,
        label: m.label ?? '',
        badge: m.badge ?? '',
        status: m.status ?? 'pending',
      },
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
    })),
  })
  if (!map.getLayer('marker-dot')) {
    map.addLayer({
      id: 'marker-dot',
      type: 'circle',
      source: 'markers',
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'badge'], ''],
          6,
          ['>', ['length', ['get', 'badge']], 1],
          15,
          12,
        ],
        'circle-color': [
          'match',
          ['get', 'status'],
          'matched',
          COLORS.captured,
          'suspect',
          COLORS.suspect,
          'done',
          COLORS.start,
          'unchecked',
          COLORS.unchecked,
          COLORS.pending,
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': COLORS.label,
      },
    })
  }

  if (!map.getLayer('marker-badge')) {
    map.addLayer({
      id: 'marker-badge',
      type: 'symbol',
      source: 'markers',
      filter: ['!=', ['get', 'badge'], ''],
      layout: {
        'text-field': ['get', 'badge'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': COLORS.label },
    })
  }

  if (!fit) return

  const bounds = boundsOf(markers)
  if (bounds) {
    map.fitBounds(bounds, { padding: 56, maxZoom: markers.length > 1 ? 17 : 16, duration: 0 })
  }
}

function setGeoJson(map: MlMap, id: string, data: GeoJSON.FeatureCollection) {
  const existing = map.getSource(id)
  if (existing instanceof GeoJSONSource) {
    existing.setData(data)
    return
  }
  map.addSource(id, { type: 'geojson', data })
}
