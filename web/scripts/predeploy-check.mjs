#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')
const mapDir = join(publicDir, 'map')
const iconDir = join(publicDir, 'icons')

function fail(message, ...hints) {
  console.error(`\npredeploy check failed: ${message}`)
  for (const hint of hints) console.error(`  ${hint}`)
  console.error('')
  process.exit(1)
}

const MAX_PRECACHED_CHUNK_KB = 320

const REQUIRED_ICONS = [
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
  'apple-touch-icon.png',
]

if (!existsSync(iconDir)) {
  fail('web/public/icons/ does not exist', 'Run: node scripts/make-icons.mjs')
}

const missingIcons = REQUIRED_ICONS.filter((f) => !existsSync(join(iconDir, f)))
if (missingIcons.length > 0) {
  fail(`missing PWA icons: ${missingIcons.join(', ')}`, 'Run: node scripts/make-icons.mjs')
}

const REBUILD = [
  'Rebuild them with, from web/:',
  '  pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles \\',
  '    public/map/basemap.pmtiles --bbox=<minLng,minLat,maxLng,maxLat> --maxzoom=14',
  '  node scripts/make-map-style.mjs',
  '  node scripts/fetch-map-assets.mjs',
  '',
  'Or set ALLOW_NO_MAP_TILES=1 to deploy the tile-free fallback on purpose.',
]

const countFiles = (dir, ext) => {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(ext)) n++
  }
  return n
}

const tiles = existsSync(mapDir)
  ? readdirSync(mapDir).filter((f) => f.endsWith('.pmtiles'))
  : []

if (tiles.length === 0) {
  if (process.env.ALLOW_NO_MAP_TILES !== '1') {
    fail('no .pmtiles extract in web/public/map/', ...REBUILD)
  }
  console.warn(
    'predeploy check: deploying WITHOUT a basemap (ALLOW_NO_MAP_TILES=1).\n' +
      '  Admin trip detail will plot positions and match circles on a plain background.',
  )
} else {
  const missingStyles = ['style-light.json', 'style-dark.json'].filter(
    (f) => !existsSync(join(mapDir, f)),
  )
  if (missingStyles.length > 0) {
    fail(
      `the extract is present but ${missingStyles.join(' and ')} ${missingStyles.length === 1 ? 'is' : 'are'} missing`,
      ...REBUILD,
    )
  }

  const glyphs = countFiles(join(mapDir, 'glyphs'), '.pbf')
  if (glyphs === 0) {
    fail('the extract is present but public/map/glyphs/ has no .pbf files', ...REBUILD)
  }

  const sprites = countFiles(join(mapDir, 'sprites'), '.png')
  if (sprites === 0) {
    fail('the extract is present but public/map/sprites/ has no sprite sheets', ...REBUILD)
  }

  console.log(
    `predeploy check: basemap ok (${tiles.join(', ')}, 2 styles, ${glyphs} glyph ranges, ${sprites} sprite sheets)`,
  )
}

const distDir = join(here, '..', 'dist')
const swPath = join(distDir, 'sw.js')

if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8')
  const assetsDir = join(distDir, 'assets')

  const oversized = existsSync(assetsDir)
    ? readdirSync(assetsDir)
        .filter((f) => f.endsWith('.js') && sw.includes(f))
        .map((f) => ({ file: f, kb: Math.round(statSync(join(assetsDir, f)).size / 1024) }))
        .filter((a) => a.kb > MAX_PRECACHED_CHUNK_KB)
    : []

  if (oversized.length > 0) {
    fail(
      `a precached chunk is over ${MAX_PRECACHED_CHUNK_KB} kB: ` +
        oversized.map((a) => `${a.file} (${a.kb} kB)`).join(', '),
      'Something admin-only is being installed onto every driver phone.',
      'Check the manualChunks names and globIgnores in vite.config.ts.',
    )
  }
  console.log('predeploy check: no precached chunk over ' + MAX_PRECACHED_CHUNK_KB + ' kB')
}

const UPLOAD_HOST = 'https://storage.googleapis.com'

const firebaseJson = JSON.parse(readFileSync(join(here, '..', 'firebase.json'), 'utf8'))

const cspHeaders = firebaseJson.hosting.headers
  .filter((block) => block.source === '**')
  .flatMap((block) => block.headers)
  .filter((h) => h.key === 'Content-Security-Policy')

if (cspHeaders.length === 0) {
  fail(
    'no Content-Security-Policy in the `**` block of firebase.json',
    'Documents would ship without one, or with one that covers only some paths.',
    'Put the Content-Security-Policy in the catch-all `**` header block.',
  )
}
if (cspHeaders.length > 1) {
  fail(
    `the \`**\` block sets Content-Security-Policy ${cspHeaders.length} times`,
    'A later one overrides an earlier one, so this check cannot say which policy is served.',
    'Keep one Content-Security-Policy header in the catch-all block.',
  )
}
const csp = cspHeaders[0].value

const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src')) ?? ''

const ENV_FILES = ['.env.production.local', '.env.production', '.env.local', '.env']

const API_BASE_LINE = /^\s*(?:export\s+)?VITE_API_BASE_URL\s*=\s*(.*)$/gm

function readApiBase() {
  if (process.env.VITE_API_BASE_URL !== undefined) {
    return { raw: process.env.VITE_API_BASE_URL, from: 'the VITE_API_BASE_URL environment variable' }
  }
  for (const name of ENV_FILES) {
    const path = join(here, '..', name)
    if (!existsSync(path)) continue
    const raw = [...readFileSync(path, 'utf8').matchAll(API_BASE_LINE)].at(-1)?.[1]
    if (raw !== undefined) return { raw, from: `web/${name}` }
  }
  return null
}

const found = readApiBase()
if (!found) {
  fail(
    `VITE_API_BASE_URL is not set in the environment or in any of ${ENV_FILES.join(', ')}`,
    'The bundle would be built with no API base URL, and this check could not verify the CSP against it.',
    'Write it from `cd infra && tofu output -raw api_url`.',
  )
}
const rawApiBase = found.raw

const apiBase = rawApiBase
  .replace(/\s+#.*$/, '')
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/\/$/, '')

if (!apiBase) {
  fail(
    `VITE_API_BASE_URL is empty in ${found.from}`,
    'Every API call would go to the page origin and 404.',
    'Set it from `cd infra && tofu output -raw api_url`.',
  )
}

for (const host of [apiBase, UPLOAD_HOST]) {
  if (!connectSrc.includes(host)) {
    fail(
      `the CSP's connect-src does not allow ${host}`,
      host === UPLOAD_HOST
        ? 'Every proof-photo upload would be blocked before it left the browser, so no stop could be recorded.'
        : 'Every API call would be blocked before it left the browser.',
      'Add it to the Content-Security-Policy in firebase.json.',
    )
  }
}
console.log(`predeploy check: the CSP allows the photo upload host and ${apiBase} (from ${found.from})`)

console.log(`predeploy check ok: ${REQUIRED_ICONS.length} PWA icons present`)
