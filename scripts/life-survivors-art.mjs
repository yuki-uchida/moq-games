// Review exporter for Life Survivors pixel art: sheets (×4, dark + stage ground), in-context mockups and GIFs.
// Usage: node scripts/life-survivors-art.mjs [id-prefix ...]   → .build/life-survivors-art/
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = resolve(root, '.build/life-survivors-art')
const load = async (path) => (await runnerImport(resolve(root, path), { configFile: false, logLevel: 'error' })).module
const art = await load('examples/games/life-survivors/src/art/index.ts')
const { frameAt, duration } = await load('examples/games/life-survivors/src/art/sheet.ts')
/** Sheets as reviewed: lettering layers composited onto their frames (unmirrored, as in the game). */
const lettered = new Map()
const sheetOf = (id) => {
  if (!lettered.has(id)) {
    const raw = art.sheet(id)
    lettered.set(
      id,
      Object.fromEntries(
        Object.keys(raw).map((k) => {
          const anim = raw[k]
          if (!anim.text) return [k, anim]
          return [k, { ...anim, frames: anim.frames.map((f, i) => (anim.text[i] ? f.clone().blit(anim.text[i]) : f)) }]
        })
      )
    )
  }
  return lettered.get(id)
}
const only = process.argv.slice(2)
const pick = (id) => !only.length || only.some((prefix) => id.startsWith(prefix))
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg'
const SCALE = 4
const MAX_W = 1600
const DARK = [43, 41, 51]
mkdirSync(out, { recursive: true })

/** RGBA canvas helpers (plain byte buffers). */
const canvas = (w, h, fill = DARK) => {
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set([...fill, 255], i * 4)
  return { w, h, data }
}
function drawRaster(dst, raster, x, y, scale = 1, flip = false, alpha = 1) {
  const rgba = raster.rgba()
  for (let j = 0; j < raster.h * scale; j++)
    for (let i = 0; i < raster.w * scale; i++) {
      const sx = Math.floor(i / scale)
      const sy = Math.floor(j / scale)
      const s = (sy * raster.w + (flip ? raster.w - 1 - sx : sx)) * 4
      if (!rgba[s + 3]) continue
      const dx = x + i
      const dy = y + j
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue
      const d = (dy * dst.w + dx) * 4
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round(dst.data[d + c] * (1 - alpha) + rgba[s + c] * alpha)
    }
}
function shadow(dst, cx, cy, rx, ry, alpha = 0.32) {
  ry = Math.max(1, ry)
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1) continue
      if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) continue
      const d = (y * dst.w + x) * 4
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round(dst.data[d + c] * (1 - alpha) + 12 * alpha)
    }
}
function fillGround(dst, stage, x0, y0, w, h, scale, ox = 0, oy = 0) {
  const tiles = art.groundTile
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const ax = Math.floor((x - x0) / scale) + ox
      const ay = Math.floor((y - y0) / scale) + oy
      const tile = tiles(stage, Math.floor(ax / 64), Math.floor(ay / 64))
      const c = tile.get(((ax % 64) + 64) % 64, ((ay % 64) + 64) % 64)
      const d = (y * dst.w + x) * 4
      dst.data.set(art.PALETTE_RGBA.subarray(c * 4, c * 4 + 3), d)
    }
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const label = (text, size, width) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size + 8}"><text x="0" y="${size}" font-family="Hiragino Sans, Helvetica, sans-serif" font-size="${size}" fill="#e8e2f4">${esc(text)}</text></svg>`
  )
async function save(file, img, labels = []) {
  await sharp(Buffer.from(img.data), { raw: { width: img.w, height: img.h, channels: 4 } })
    .composite(labels.map(([text, left, top, size]) => ({ input: label(text, size, img.w - left), left, top })))
    .png()
    .toFile(join(out, file))
  return file
}

/** Lays out every anim of a sheet in labelled, wrapped rows; returns one or more PNG pages. */
async function exportSheet(id, sheet, bg) {
  const anims = Object.entries(sheet)
  const fw = anims[0][1].frames[0].w * SCALE
  const fh = anims[0][1].frames[0].h * SCALE
  const gap = SCALE
  const perRow = Math.max(1, Math.floor((MAX_W - 16 + gap) / (fw + gap)))
  const rows = []
  for (const [name, anim] of anims) {
    const w = anim.frames[0].w * SCALE
    const h = anim.frames[0].h * SCALE
    const per = Math.max(1, Math.floor((MAX_W - 16 + gap) / (w + gap)))
    rows.push({
      text: `${id} · ${name} · ${anim.frames.length}f @ ${anim.fps}fps${anim.loop ? '' : ' (holds)'}`,
      h: 26
    })
    for (let i = 0; i < anim.frames.length; i += per)
      rows.push({ frames: anim.frames.slice(i, i + per), start: i, w, h })
  }
  const pages = []
  let page = []
  let height = 16
  for (const row of rows) {
    const rh = (row.h ?? 0) + gap
    if (height + rh > 2400 && page.length) {
      pages.push(page)
      page = []
      height = 16
    }
    page.push(row)
    height += rh
  }
  pages.push(page)
  const files = []
  for (const [p, rowsOnPage] of pages.entries()) {
    const width = Math.min(MAX_W, 16 + perRow * (fw + gap))
    const height = 16 + rowsOnPage.reduce((s, row) => s + row.h + gap, 0)
    const img = canvas(Math.max(width, 400), height)
    const labels = []
    let y = 8
    for (const row of rowsOnPage) {
      if (row.text) labels.push([row.text, 8, y, 16])
      else
        row.frames.forEach((frame, i) => {
          const x = 8 + i * (row.w + gap)
          if (bg) fillGround(img, bg, x, y, row.w, row.h, SCALE)
          else {
            const cell = canvas(row.w, row.h, [52, 50, 62])
            for (let j = 0; j < row.h; j++)
              img.data.set(cell.data.subarray(j * row.w * 4, (j + 1) * row.w * 4), ((y + j) * img.w + x) * 4)
          }
          drawRaster(img, frame, x, y, SCALE)
        })
      y += row.h + gap
    }
    const file = `${id.replace(/[:/]/g, '_')}${bg ? `_on-${bg}` : '_dark'}${pages.length > 1 ? `_${p + 1}` : ''}.png`
    files.push(await save(file, img, labels))
  }
  return files
}

/** One GIF per anim (×4 on dark), honouring per-frame holds; non-looping ones linger on the last frame. */
function exportGif(id, name, anim, bg) {
  const dir = mkdtempSync(join(tmpdir(), 'ls-art-'))
  const ticks = []
  const total = Math.round(duration(anim) * anim.fps)
  for (let t = 0; t < total; t++) ticks.push(frameAt(anim, (t + 0.5) / anim.fps))
  const death = id.startsWith('death:')
  if (!anim.loop) for (let t = 0; t < anim.fps * (death ? 2.5 : 1.2); t++) ticks.push(anim.frames.length - 1)
  const { w, h } = anim.frames[0]
  const jobs = ticks.map((index, t) => {
    const img = canvas(w * SCALE, h * SCALE)
    if (bg) fillGround(img, bg, 0, 0, img.w, img.h, SCALE)
    drawRaster(img, anim.frames[index], 0, 0, SCALE, false, anim.alpha?.[index] ?? 1)
    // Deaths: the renderer floats the soul in over the spot; show the same here.
    const soul = death && art.soulAt(t / anim.fps, duration(anim), anim.soul)
    if (soul) {
      const kind = anim.soul === 'ghost' ? 'ghost' : anim.soul === 'halo' ? 'halo' : 'float'
      const frame = art.sheet('soul')[kind].frames[Math.floor(t / 2) % 4]
      drawRaster(
        img,
        frame,
        Math.round(32 + soul.dx - frame.w / 2) * SCALE,
        Math.round(58 + soul.dy - frame.h) * SCALE,
        SCALE,
        false,
        soul.alpha
      )
    }
    return sharp(Buffer.from(img.data), { raw: { width: img.w, height: img.h, channels: 4 } })
      .png()
      .toFile(join(dir, `f${String(t).padStart(4, '0')}.png`))
  })
  return Promise.all(jobs).then(() => {
    const file = `gif/${id.replace(/[:/]/g, '_')}_${name}.gif`
    mkdirSync(join(out, 'gif'), { recursive: true })
    execFileSync(FFMPEG, [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(anim.fps),
      '-i',
      join(dir, 'f%04d.png'),
      '-vf',
      'split[a][b];[a]palettegen=reserve_transparent=0[p];[b][p]paletteuse=dither=none',
      join(out, file)
    ])
    rmSync(dir, { recursive: true, force: true })
    return file
  })
}

const written = []
for (const id of Object.keys(art.SHEETS)) {
  if (!pick(id)) continue
  const sheet = sheetOf(id)
  written.push(...(await exportSheet(id, sheet)))
  const bg = art.groundFor?.(id)
  if (bg) written.push(...(await exportSheet(id, sheet, bg)))
  for (const [name, anim] of Object.entries(sheet))
    if (anim.frames.length > 1) written.push(await exportGif(id, name, anim, bg))
}

/** A labelled gallery: one frame of each sheet at ×scale on a ground (wrapped ≤ MAX_W), plus a ×1 row. */
async function gallery(file, entries, ground, scale = SCALE) {
  const frames = entries.map(([id, anim, frame = 0]) => art.sheet(id)[anim].frames[frame])
  const cw = Math.max(...frames.map((f) => f.w)) * scale
  const ch = Math.max(...frames.map((f) => f.h)) * scale
  const per = Math.max(1, Math.floor((MAX_W - 8) / (cw + 8)))
  const rows = Math.ceil(frames.length / per)
  const small = Math.max(...frames.map((f) => f.w)) + 6
  const img = canvas(
    Math.min(MAX_W, 8 + per * (cw + 8)),
    8 + rows * (ch + 30) + Math.max(...frames.map((f) => f.h)) + 16
  )
  const labels = []
  frames.forEach((frame, i) => {
    const x = 8 + (i % per) * (cw + 8)
    const y = 8 + Math.floor(i / per) * (ch + 30)
    fillGround(img, ground, x, y, cw, ch, scale)
    drawRaster(img, frame, x + (cw - frame.w * scale) / 2, y + ch - frame.h * scale, scale)
    labels.push([entries[i][0].replace(/^(player|enemy):/, ''), x, y + ch + 4, 13])
    drawRaster(img, frame, 8 + i * small, 8 + rows * (ch + 30), 1)
  })
  return save(file, img, labels)
}

// Deaths: one sheet per kind with a row per body, and the matrix of every Tag × body's held final frame.
const BODY_ORDER = ['baby', 'toddler', 'kid', 'junior', 'high', 'college', 'adult', 'prime', 'middle', 'elder', 'bed']
const STAGE_AGE = {
  baby: 1,
  toddler: 4,
  kid: 8,
  junior: 13,
  high: 16,
  college: 20,
  adult: 25,
  prime: 40,
  middle: 55,
  elder: 70,
  bed: 77
}
const TAGS = [
  undefined,
  'people',
  'money',
  'accident',
  'sickness',
  'insult',
  'work',
  'love',
  'child',
  'exam',
  'sports',
  'class'
]
if (pick('deathtags')) {
  const kinds = new Set()
  for (const b of BODY_ORDER) for (const k of Object.keys(sheetOf(`death:${b}`))) kinds.add(k)
  for (const kind of kinds) {
    const rows = BODY_ORDER.filter((b) => sheetOf(`death:${b}`)[kind])
    const per = 12
    const cw = 64 * 2 + 2
    const lines = rows.map((b) => Math.ceil(sheetOf(`death:${b}`)[kind].frames.length / per))
    const img = canvas(8 + per * cw, 8 + lines.reduce((sum, n) => sum + n * cw + 18, 0))
    const labels = []
    let y = 8
    rows.forEach((b, i) => {
      const anim = sheetOf(`death:${b}`)[kind]
      labels.push([
        `${b} · ${kind} · ${anim.frames.length}f @ ${anim.fps}fps${anim.soul ? ` · ${anim.soul}` : ''}`,
        8,
        y,
        13
      ])
      y += 18
      anim.frames.forEach((frame, f) => {
        const x = 8 + (f % per) * cw
        const yy = y + Math.floor(f / per) * cw
        fillGround(img, art.groundFor(`player:${b}`) ?? 'office', x, yy, 128, 128, 2)
        drawRaster(img, frame, x, yy, 2, false, anim.alpha?.[f] ?? 1)
      })
      y += lines[i] * cw
    })
    written.push(await save(`deathtag_${kind}.png`, img, labels))
  }
  // Matrix: rows = bodies, columns = the killer's Tag (first column: no tag).
  const cw = 64 * 2 + 4
  const img = canvas(8 + TAGS.length * cw, 26 + BODY_ORDER.length * cw)
  const labels = TAGS.map((t, i) => [t ?? '(none)', 8 + i * cw, 4, 12])
  BODY_ORDER.forEach((b, r) =>
    TAGS.forEach((tag, c) => {
      const deaths = sheetOf(`death:${b}`)
      const kind = art.deathKind(tag, STAGE_AGE[b], b)
      const anim = deaths[kind]
      const x = 8 + c * cw
      const y = 22 + r * cw
      fillGround(img, art.groundFor(`player:${b}`) ?? 'office', x, y, 128, 128, 2)
      const last = anim.frames.length - 1
      drawRaster(img, anim.frames[last], x, y, 2, false, Math.max(0.25, anim.alpha?.[last] ?? 1))
      const soul = art.soulAt(duration(anim) + 2, duration(anim), anim.soul)
      const sk = anim.soul === 'ghost' ? 'ghost' : anim.soul === 'halo' ? 'halo' : 'float'
      drawRaster(
        img,
        art.sheet('soul')[sk].frames[0],
        x + Math.round(32 + soul.dx - art.sheet('soul')[sk].frames[0].w / 2) * 2,
        y + Math.round(58 + soul.dy - art.sheet('soul')[sk].frames[0].h) * 2,
        2
      )
      if (c === 0) labels.push([b, x + 2, y + 2, 11])
    })
  )
  written.push(await save('deaths_matrix.png', img, labels))
}

/** A plain labelled grid of rasters at ×scale on a dark backdrop (wrapped ≤ MAX_W). */
async function grid(file, entries, scale, cell) {
  const cw = cell * scale + 8
  const per = Math.max(1, Math.floor((MAX_W - 8) / cw))
  const rows = Math.ceil(entries.length / per)
  const img = canvas(8 + per * cw, 8 + rows * (cell * scale + 24))
  const labels = []
  entries.forEach(([label, r], i) => {
    const x = 8 + (i % per) * cw
    const y = 8 + Math.floor(i / per) * (cell * scale + 24)
    const bg = canvas(cell * scale, cell * scale, [52, 50, 62])
    for (let j = 0; j < bg.h; j++)
      img.data.set(bg.data.subarray(j * bg.w * 4, (j + 1) * bg.w * 4), ((y + j) * img.w + x) * 4)
    drawRaster(img, r, x + Math.round((cell - r.w) / 2) * scale, y + Math.round((cell - r.h) / 2) * scale, scale)
    labels.push([label, x, y + cell * scale + 3, 12])
  })
  return save(file, img, labels)
}

if (pick('weapons')) {
  const entries = []
  for (const id of Object.keys(art.SHEETS).filter((k) => k.startsWith('weapon:'))) {
    const fly = art.sheet(id).fly
    const f = fly.frames[id === 'weapon:w_study' ? 14 : 0]
    entries.push([id.slice(7), f], [`${id.slice(7)} 進化`, art.evolve(f)])
  }
  const fx = art.sheet('fx')
  for (const k of Object.keys(fx)) {
    const f = fx[k].frames[0]
    if (f.h > 40) entries.push([`fx ${k}`, f], [`fx ${k} 進化`, art.evolve(f)])
    else entries.push([`fx ${k}`, f])
  }
  written.push(
    await grid(
      'roster_weapons.png',
      entries.filter(([, r]) => r.h <= 40),
      4,
      32
    )
  )
  written.push(
    await grid(
      'roster_weapons_tall.png',
      [...entries.filter(([, r]) => r.h > 40), ['zone mat r58', art.playMat(58)]],
      2,
      120
    )
  )
  const items = art.sheet('items')
  written.push(
    await grid(
      'roster_items.png',
      Object.keys(items).flatMap((k) => items[k].frames.map((f, i) => [`${k} ${i}`, f])),
      6,
      16
    )
  )
  const icons = art.sheet('icons')
  const ids = Object.keys(icons)
  written.push(
    await grid(
      'hud_icons.png',
      ids.map((k) => [k, icons[k].frames[0]]),
      1,
      32
    )
  )
  written.push(
    await grid(
      'hud_icons_x2.png',
      ids.flatMap((k) => [
        [k, icons[k].frames[0]],
        [`${k} 進化`, art.evolve(icons[k].frames[0])]
      ]),
      2,
      32
    )
  )
}

if (pick('lineup')) {
  const stages = ['baby', 'toddler', 'kid', 'junior', 'high', 'college', 'adult', 'prime', 'middle', 'elder', 'bed']
  written.push(
    await gallery(
      'lineup_stages.png',
      stages.map((s) => [`player:${s}`, 'idle', 0]),
      'office'
    )
  )
}
if (pick('roster')) {
  const enemies = Object.keys(art.SHEETS).filter((id) => id.startsWith('enemy:') && !id.startsWith('enemy:b_'))
  written.push(
    await gallery(
      'roster_enemies.png',
      enemies.map((id) => [id, 'move', 1]),
      'school'
    )
  )
  const bosses = [...Object.keys(art.SHEETS).filter((id) => id.startsWith('enemy:b_')), 'reaper']
  written.push(
    await gallery(
      'roster_bosses.png',
      bosses.map((id) => [id, 'move', 1]),
      'office',
      2
    )
  )
}

// In-context mockups: ×2 crops (640×360 art px) of each stage with its props, the player and enemies,
// plus an overview of all stages (×1 centre crops) in one sheet.
function renderScene(scene, scale, W, H, ox = 0, oy = 0) {
  const img = canvas(W * scale, H * scale)
  fillGround(img, scene.stage, 0, 0, img.w, img.h, scale, ox, oy)
  const items = scene.items.slice().sort((a, b) => (a.layer ?? 1) - (b.layer ?? 1) || a.y - b.y)
  for (const item of items) {
    const anim = art.sheet(item.sheet)[item.anim]
    const frame = anim.frames[(item.frame ?? 0) % anim.frames.length]
    const x = item.x - ox
    const y = item.y - oy
    if (item.shadow) shadow(img, x * scale, (y - 1) * scale, item.shadow * scale, item.shadow * 0.35 * scale)
    else if (!art.FLAT_PROPS.has(item.anim)) {
      // Props get the renderer's soft contact shadow too.
      let lo = 999
      let hi = -1
      let maxY = -1
      frame.map((c, _x, yy) => ((maxY = Math.max(maxY, yy)), c))
      frame.map((c, xx, yy) => (yy >= maxY - 3 && ((lo = Math.min(lo, xx)), (hi = Math.max(hi, xx))), c))
      const cx = x - item.px + (lo + hi + 1) / 2
      const rx = (hi - lo + 1) / 2 + 1
      shadow(img, cx * scale, (y - item.py + maxY + 1) * scale, rx * scale, Math.min(6, rx * 0.2) * scale, 0.2)
    }
    drawRaster(img, frame, (x - item.px) * scale, (y - item.py) * scale, scale, item.flip)
  }
  return img
}
const scenes = art.mockups()
for (const scene of scenes)
  if (pick(`mockup:${scene.stage}`))
    written.push(await save(`mockup_${scene.stage}.png`, renderScene(scene, 2, 640, 360)))
if (pick('maps')) {
  const cw = 384
  const chh = 216
  const per = 4
  const img = canvas(8 + per * (cw + 8), 8 + Math.ceil(scenes.length / per) * (chh + 26))
  const labels = []
  scenes.forEach((scene, i) => {
    const cell = renderScene(scene, 1, cw, chh, (640 - cw) / 2, (360 - chh) / 2)
    const x = 8 + (i % per) * (cw + 8)
    const y = 8 + Math.floor(i / per) * (chh + 26)
    for (let j = 0; j < chh; j++)
      img.data.set(cell.data.subarray(j * cw * 4, (j + 1) * cw * 4), ((y + j) * img.w + x) * 4)
    labels.push([scene.stage, x, y + chh + 4, 13])
  })
  written.push(await save('maps_overview.png', img, labels))
}
console.log(written.map((f) => join(out, f)).join('\n'))
