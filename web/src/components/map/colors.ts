const FALLBACK = {
  start: '#4a5568',
  captured: '#0b7e85',
  suspect: '#b4650a',
  unchecked: '#64748b',
  pending: '#94a3b8',
  route: '#2347c6',
  label: '#ffffff',
}

export type MapColors = typeof FALLBACK

/** Map paint colors, read from the `--color-map-*` theme tokens in index.css. */
export function readMapColors(): MapColors {
  const style = getComputedStyle(document.documentElement)
  const read = (key: keyof MapColors) => style.getPropertyValue(`--color-map-${key}`).trim() || FALLBACK[key]
  return Object.fromEntries(Object.keys(FALLBACK).map((k) => [k, read(k as keyof MapColors)])) as MapColors
}
