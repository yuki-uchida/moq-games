#!/usr/bin/env node
/**
 * アニマフロント map review: renders every map/variant to PNGs in .build/anima-front/maps/.
 *
 *   node scripts/anima-front-maps.mjs                 # all maps and variants
 *   node scripts/anima-front-maps.mjs oldtown arena   # selected maps (with their variants)
 *   node scripts/anima-front-maps.mjs --scale 6       # pixels per metre (default: ~1100 px per image side)
 *
 * Per map/variant:
 *   <id>[-variant]-top.png  top-down: colour by kind, brightness by height, 10 m grid, walkability overlay
 *                           (red = floor not reachable on foot/pads from the player spawns, green tint = reachable
 *                           roofs ≥ 2 m), spawns, bases, foe spawns (red ▲, air ◇), pads (green ●), anchors (★),
 *                           paths (orange), labelled.
 *   <id>[-variant]-iso.png  oblique view from the south-west (painter-sorted boxes).
 * It also prints box/decor counts and any anchor/spawn/path point that cannot be reached.
 *
 * The TypeScript map modules are loaded through Vite's SSR loader; no browser is needed.
 */
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.build/anima-front/maps')
const mapsDir = '/examples/games/anima-front/src/sim/maps'

const args = process.argv.slice(2)
let userScale = 0
let scale = 5
const only = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scale') userScale = Number(args[++i])
  else only.push(args[i])
}

const KIND_COLOR = {
  ground: [110, 140, 95],
  road: [92, 92, 100],
  building: [176, 160, 140],
  roof: [170, 110, 90],
  wall: [150, 120, 95],
  platform: [120, 150, 180],
  stairs: [230, 200, 90],
  crate: [200, 140, 70],
  container: [190, 80, 70],
  car: [130, 160, 200],
  rock: [130, 120, 110],
  crystal: [170, 90, 230],
  tree: [70, 150, 70],
  fence: [180, 180, 180],
  pillar: [120, 120, 130],
  barrier: [255, 0, 0]
}
const GROUND_STYLE = {
  0: [104, 140, 84],
  1: [150, 150, 145],
  2: [140, 115, 85],
  3: [175, 165, 150],
  4: [150, 115, 80],
  5: [110, 80, 130],
  6: [60, 90, 110],
  7: [60, 120, 190]
}
const ROAD_STYLE = { 0: [80, 80, 88], 1: [160, 155, 150], 2: [200, 200, 200], 3: [110, 95, 85] }
const CONTAINER_STYLE = {
  0: [190, 60, 55],
  1: [60, 100, 180],
  2: [60, 150, 90],
  3: [220, 130, 50],
  4: [225, 225, 225],
  5: [140, 90, 60]
}
const BUILDING_STYLE = {
  0: [165, 168, 172],
  1: [175, 110, 90],
  2: [215, 205, 175],
  3: [125, 95, 70],
  4: [150, 190, 210],
  5: [140, 150, 160],
  6: [205, 165, 110],
  7: [225, 240, 245],
  8: [140, 135, 125],
  9: [120, 80, 150]
}
const TEAM_COLOR = { 0: '#e5484d', 1: '#3e8ed0', 2: '#f2b33d', squad: '#ffffff' }

function baseColor(b) {
  const s = b.style ?? 0
  if (b.kind === 'ground') return GROUND_STYLE[s] ?? KIND_COLOR.ground
  if (b.kind === 'road') return ROAD_STYLE[s] ?? KIND_COLOR.road
  if (b.kind === 'container') return CONTAINER_STYLE[s] ?? KIND_COLOR.container
  if (b.kind === 'building') return BUILDING_STYLE[s] ?? KIND_COLOR.building
  return KIND_COLOR[b.kind] ?? [200, 0, 200]
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
function shade([r, g, b], f) {
  return `rgb(${clamp(r * f)},${clamp(g * f)},${clamp(b * f)})`
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

function topDown(map, grid) {
  const { min, max } = map.bounds
  const W = Math.round((max[0] - min[0]) * scale)
  const H = Math.round((max[1] - min[1]) * scale)
  const X = (x) => ((x - min[0]) * scale).toFixed(1)
  const Y = (z) => ((max[1] - z) * scale).toFixed(1)
  const parts = []
  parts.push(`<rect width="${W}" height="${H}" fill="#202020"/>`)
  const boxes = [...map.boxes].filter((b) => b.kind !== 'barrier').sort((a, b) => a.max[1] - b.max[1])
  for (const b of boxes) {
    const flat = b.kind === 'ground' || b.kind === 'road'
    const f = flat
      ? Math.max(0.45, 1 + Math.min(0, b.max[1]) / 4)
      : 0.62 + Math.min(1, Math.max(0, b.max[1]) / 18) * 0.75
    const fill = shade(baseColor(b), f)
    const op = b.solid === false ? 0.75 : 1
    const stroke = flat ? '' : ` stroke="#111" stroke-width="0.6"`
    parts.push(
      `<rect x="${X(b.min[0])}" y="${Y(b.max[2])}" width="${((b.max[0] - b.min[0]) * scale).toFixed(1)}" height="${((b.max[2] - b.min[2]) * scale).toFixed(1)}" fill="${fill}" fill-opacity="${op}"${stroke}/>`
    )
    if (!flat && b.max[1] - Math.max(0, b.min[1]) >= 2.5 && (b.max[0] - b.min[0]) * scale > 14) {
      parts.push(
        `<text x="${((b.min[0] + b.max[0]) / 2 - min[0]) * scale}" y="${(max[1] - (b.min[2] + b.max[2]) / 2) * scale + 3}" font-size="8" text-anchor="middle" fill="#000" fill-opacity="0.6" font-family="sans-serif">${Math.round(b.max[1])}</text>`
      )
    }
  }
  parts.push(
    `<image href="data:image/png;base64,${grid}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" style="image-rendering:pixelated"/>`
  )
  // 10 m grid.
  for (let x = Math.ceil(min[0] / 10) * 10; x <= max[0]; x += 10)
    parts.push(
      `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}" stroke="#fff" stroke-opacity="${x === 0 ? 0.45 : 0.14}" stroke-width="1"/>`
    )
  for (let z = Math.ceil(min[1] / 10) * 10; z <= max[1]; z += 10)
    parts.push(
      `<line x1="0" y1="${Y(z)}" x2="${W}" y2="${Y(z)}" stroke="#fff" stroke-opacity="${z === 0 ? 0.45 : 0.14}" stroke-width="1"/>`
    )
  // Decor as tiny dots.
  for (const d of map.decor)
    parts.push(`<circle cx="${X(d.p[0])}" cy="${Y(d.p[2])}" r="1" fill="#ffd" fill-opacity="0.5"/>`)
  // Paths.
  for (const [name, pts] of Object.entries(map.paths)) {
    parts.push(
      `<polyline points="${pts.map((p) => `${X(p[0])},${Y(p[2])}`).join(' ')}" fill="none" stroke="#ff8a00" stroke-width="2.5" stroke-dasharray="6 3"/>`
    )
    pts.forEach((p, i) => parts.push(`<circle cx="${X(p[0])}" cy="${Y(p[2])}" r="3" fill="#ff8a00"/>`))
    const p = pts[0]
    parts.push(label(X(p[0]), Y(p[2]) - 6, `${name} start`, '#ff8a00'))
  }
  for (const b of map.bases) {
    parts.push(
      `<circle cx="${X(b.p[0])}" cy="${Y(b.p[2])}" r="${b.r * scale}" fill="${TEAM_COLOR[b.team]}" fill-opacity="0.12" stroke="${TEAM_COLOR[b.team]}" stroke-width="2" stroke-dasharray="5 3"/>`
    )
    parts.push(label(X(b.p[0]), Y(b.p[2] + b.r) - 3, `base ${b.team}`, TEAM_COLOR[b.team]))
  }
  for (const s of map.spawns) {
    const x = Number(X(s.p[0]))
    const y = Number(Y(s.p[2]))
    parts.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="${TEAM_COLOR[s.team]}" stroke="#000"/>`)
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x + Math.sin(s.yaw) * 9}" y2="${y - Math.cos(s.yaw) * 9}" stroke="${TEAM_COLOR[s.team]}" stroke-width="2"/>`
    )
  }
  for (const p of map.pads) {
    const x = Number(X(p.p[0]))
    const y = Number(Y(p.p[2]))
    parts.push(`<circle cx="${x}" cy="${y}" r="4" fill="#38e038" stroke="#000"/>`)
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x + Math.sin(p.yaw) * 6 * scale}" y2="${y - Math.cos(p.yaw) * 6 * scale}" stroke="#38e038" stroke-width="1.5"/>`
    )
  }
  for (const f of map.foeSpawns) {
    const x = Number(X(f.p[0]))
    const y = Number(Y(f.p[2]))
    if (f.air)
      parts.push(
        `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" transform="rotate(45 ${x} ${y})" fill="none" stroke="#ff4dff" stroke-width="2"/>`
      )
    else
      parts.push(`<polygon points="${x},${y - 5} ${x - 5},${y + 4} ${x + 5},${y + 4}" fill="#ff3030" stroke="#000"/>`)
    parts.push(label(x, y + 13, (f.tags ?? []).join('/'), f.air ? '#ff9dff' : '#ff8080', 9))
  }
  for (const [name, p] of Object.entries(map.anchors)) {
    const x = Number(X(p[0]))
    const y = Number(Y(p[2]))
    parts.push(
      `<text x="${x}" y="${y + 5}" font-size="16" text-anchor="middle" fill="#ffe14d" stroke="#000" stroke-width="0.8">★</text>`
    )
    parts.push(label(x, y - 9, name, '#ffe14d'))
  }
  parts.push(
    label(
      6,
      14,
      `${map.id} (${map.theme}) — ${map.boxes.length} boxes, ${map.decor.length} decor, N↑ E→, 10 m grid`,
      '#fff',
      12,
      'start'
    )
  )
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`, W, H }
}

function label(x, y, text, color, size = 10, anchor = 'middle') {
  return `<text x="${x}" y="${y}" font-size="${size}" font-family="sans-serif" font-weight="bold" text-anchor="${anchor}" fill="${color}" stroke="#000" stroke-width="2.5" paint-order="stroke">${esc(text)}</text>`
}

/** Reachability overlay as a PNG (one pixel per grid cell, north up). */
async function reachOverlay(grid) {
  const { nx, nz, cellStart, nodeH, reached } = grid
  const px = Buffer.alloc(nx * nz * 4)
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const c = k * nx + i
      const n = cellStart[c + 1] - 1
      if (n < cellStart[c]) continue
      const o = ((nz - 1 - k) * nx + i) * 4
      if (!reached[n]) {
        px[o] = 255
        px[o + 3] = nodeH[n] < 0.5 ? 150 : 70
      } else if (nodeH[n] >= 2) {
        px[o + 1] = 255
        px[o + 3] = 45
      }
    }
  }
  return (
    await sharp(px, { raw: { width: nx, height: nz, channels: 4 } })
      .png()
      .toBuffer()
  ).toString('base64')
}

function iso(map) {
  const s = Math.max(2.5, scale * 0.8)
  const c = Math.cos(Math.PI / 6)
  const P = (x, y, z) => [(x - z) * c * s, (-(x + z) * 0.5 - y * 1.0) * s]
  const { min, max } = map.bounds
  const corners = [
    P(min[0], 0, min[1]),
    P(max[0], 0, min[1]),
    P(min[0], 0, max[1]),
    P(max[0], 0, max[1]),
    P(max[0], 40, max[1])
  ]
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const ox = -Math.min(...xs) + 20
  const oy = -Math.min(...ys) + 20
  const W = Math.round(Math.max(...xs) - Math.min(...xs) + 40)
  const H = Math.round(Math.max(...ys) - Math.min(...ys) + 40)
  const poly = (pts, fill, op = 1) =>
    `<polygon points="${pts
      .map(([x, y, z]) => P(x, y, z))
      .map(([a, b]) => `${(a + ox).toFixed(1)},${(b + oy).toFixed(1)}`)
      .join(' ')}" fill="${fill}" fill-opacity="${op}" stroke="#000" stroke-opacity="0.35" stroke-width="0.5"/>`
  const parts = [`<rect width="${W}" height="${H}" fill="#1c2230"/>`]
  // Far boxes first (camera in the south-west looks north-east).
  const boxes = [...map.boxes]
    .filter((b) => b.kind !== 'barrier')
    .sort((a, b) => {
      const fa = a.kind === 'ground' || a.kind === 'road' ? 0 : 1
      const fb = b.kind === 'ground' || b.kind === 'road' ? 0 : 1
      if (fa !== fb) return fa - fb
      return b.max[0] + b.max[2] - (a.max[0] + a.max[2]) || a.min[1] - b.min[1]
    })
  for (const b of boxes) {
    const col = baseColor(b)
    const [x0, y0, z0] = b.min
    const [x1, y1, z1] = b.max
    const op = b.solid === false ? 0.6 : 1
    if (!(b.kind === 'ground' || b.kind === 'road')) {
      parts.push(
        poly(
          [
            [x0, y0, z0],
            [x1, y0, z0],
            [x1, y1, z0],
            [x0, y1, z0]
          ],
          shade(col, 0.75),
          op
        )
      )
      parts.push(
        poly(
          [
            [x0, y0, z0],
            [x0, y0, z1],
            [x0, y1, z1],
            [x0, y1, z0]
          ],
          shade(col, 0.55),
          op
        )
      )
    }
    parts.push(
      poly(
        [
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x0, y1, z1]
        ],
        shade(col, 1.08),
        op
      )
    )
  }
  for (const p of map.pads) {
    const [a, b] = P(...p.p)
    parts.push(`<circle cx="${a + ox}" cy="${b + oy}" r="3" fill="#38e038"/>`)
  }
  for (const [name, p] of Object.entries(map.anchors)) {
    const [a, b] = P(...p)
    parts.push(label(a + ox, b + oy - 4, `★${name}`, '#ffe14d', 9))
  }
  parts.push(label(6, 14, `${map.id} (${map.theme}) — oblique from the south-west`, '#fff', 12, 'start'))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`
}

const server = await createServer({
  configFile: false,
  root,
  logLevel: 'error',
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true, hmr: false, watch: null }
})
try {
  const maps = await server.ssrLoadModule(`${mapsDir}/index.ts`)
  const reachMod = await server.ssrLoadModule(`${mapsDir}/reach.ts`)
  await mkdir(outDir, { recursive: true })
  const jobs = []
  for (const id of maps.MAP_IDS) {
    if (only.length && !only.includes(id)) continue
    jobs.push([id, undefined])
    for (const v of maps.MAP_VARIANTS[id]) jobs.push([id, v])
  }
  for (const [id, v] of jobs) {
    const t0 = performance.now()
    const map = maps.getMap(id, v)
    scale = userScale || Math.min(10, Math.round((1100 / (map.bounds.max[0] - map.bounds.min[0])) * 2) / 2)
    const t1 = performance.now()
    const grid = reachMod.reach(map)
    const t2 = performance.now()
    const name = v ? `${id}-${v}` : id
    const misses = []
    const check = (what, p) => {
      if (!grid.isReached(p)) misses.push(`${what} [${p.join(', ')}]`)
    }
    for (const f of map.foeSpawns) if (!f.air) check(`foe ${f.id}`, f.p)
    for (const [n, p] of Object.entries(map.anchors)) check(`anchor ${n}`, p)
    for (const [n, pts] of Object.entries(map.paths)) pts.forEach((p, i) => check(`path ${n}[${i}]`, p))
    for (const s of map.spawns) check(`spawn ${s.team}`, s.p)
    let roofN = 0
    let roofR = 0
    for (let i = 0; i < grid.nodeH.length; i++) {
      if (grid.nodeH[i] >= 2) {
        roofN++
        roofR += grid.reached[i]
      }
    }
    const top = topDown(map, await reachOverlay(grid))
    await sharp(Buffer.from(top.svg))
      .png()
      .toFile(join(outDir, `${name}-top.png`))
    await sharp(Buffer.from(iso(map)))
      .png()
      .toFile(join(outDir, `${name}-iso.png`))
    const len = Object.fromEntries(
      Object.entries(map.paths).map(([n, pts]) => [
        n,
        Math.round(pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[2] - pts[i][2]), 0))
      ])
    )
    console.log(
      `${name}: ${map.boxes.length} boxes, ${map.decor.length} decor, ${map.pads.length} pads, ` +
        `build ${(t1 - t0).toFixed(0)} ms, reach ${(t2 - t1).toFixed(0)} ms, raised floors reachable ` +
        `${roofN ? Math.round((roofR / roofN) * 100) : 0}%, paths ${JSON.stringify(len)}`
    )
    for (const miss of misses) console.log(`  UNREACHABLE ${miss}`)
  }
  console.log(`wrote ${outDir}`)
} finally {
  await server.close()
}
