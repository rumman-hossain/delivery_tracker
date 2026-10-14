#!/usr/bin/env node
import { layers, namedFlavor } from '@protomaps/basemaps'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'map')

const PMTILES_PATH = process.env.PMTILES_PATH ?? '/map/basemap.pmtiles'

const SOURCE = 'protomaps'

const ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap</a>'

function build(flavorName) {
  return {
    version: 8,
    name: `Delivery Tracker — ${flavorName}`,
    glyphs: '/map/glyphs/{fontstack}/{range}.pbf',
    sprite: `/map/sprites/${flavorName}`,
    sources: {
      [SOURCE]: {
        type: 'vector',
        url: `pmtiles://${PMTILES_PATH}`,
        attribution: ATTRIBUTION,
      },
    },
    layers: layers(SOURCE, namedFlavor(flavorName), { lang: 'en' }),
  }
}

const fontstacks = new Set()

function collectFonts(node, into) {
  if (typeof node === 'string') {
    if (node.startsWith('Noto ')) into.add(node)
    return
  }
  if (Array.isArray(node)) for (const child of node) collectFonts(child, into)
}

for (const flavor of ['light', 'dark']) {
  const style = build(flavor)
  for (const layer of style.layers) {
    collectFonts(layer.layout?.['text-font'], fontstacks)
  }
  const out = join(MAP_DIR, `style-${flavor}.json`)
  writeFileSync(out, JSON.stringify(style, null, 2))
  console.log(`wrote style-${flavor}.json (${style.layers.length} layers)`)
}

console.log('\nfontstacks referenced:')
for (const f of [...fontstacks].sort()) console.log(`  ${f}`)
