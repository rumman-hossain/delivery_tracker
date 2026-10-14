#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'map')
const BASE = 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main'

const FONTSTACKS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']

const RANGES = Array.from({ length: 256 }, (_, i) => `${i * 256}-${i * 256 + 255}`)

const FLAVORS = ['light', 'dark']
const SPRITE_FILES = (flavor) => [
  `${flavor}.json`,
  `${flavor}.png`,
  `${flavor}@2x.json`,
  `${flavor}@2x.png`,
]

const force = process.argv.includes('--force')
let fetched = 0
let skipped = 0
const failures = []

async function download(url, dest) {
  if (!force && existsSync(dest)) {
    skipped++
    return
  }
  const res = await fetch(url)
  if (!res.ok) {
    failures.push(`${res.status} ${url}`)
    return
  }
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  fetched++
}

async function pool(items, worker, size = 12) {
  let cursor = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++]
        await worker(item)
      }
    }),
  )
}

const jobs = []

for (const stack of FONTSTACKS) {
  for (const range of RANGES) {
    jobs.push({
      url: `${BASE}/fonts/${encodeURIComponent(stack)}/${range}.pbf`,
      dest: join(MAP_DIR, 'glyphs', stack, `${range}.pbf`),
    })
  }
}

for (const flavor of FLAVORS) {
  for (const file of SPRITE_FILES(flavor)) {
    jobs.push({
      url: `${BASE}/sprites/v4/${file}`,
      dest: join(MAP_DIR, 'sprites', file),
    })
  }
}

console.log(`fetching ${jobs.length} files into public/map/ …`)
await pool(jobs, (job) => download(job.url, job.dest))

console.log(`done: ${fetched} downloaded, ${skipped} already present`)

if (failures.length > 0) {
  console.error(`\n${failures.length} file(s) failed:`)
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`)
  process.exit(1)
}
