/**
 * `tech:slime`: the merged jumbo slime of the co-op technique (tiers 2–4 = ~100/130/160 px wide). Drawn natively at
 * 192×192 (feet on 96,176): a marbled jelly of the four job colours with a big determined face and the four job
 * hats and weapons stuck around its top. Nothing is upscaled; outfit geometry takes a `k` factor instead.
 */
import { TECH_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, type Ramp } from '../raster'
import { anim, type Sheet } from '../sheet'
import { despeckleBox, outlineBox, part } from './layer'
import { JOB_RAMP, drawHeadgear, drawWeapon, type JobId } from './jobs'

const INV_TAU = 1 / (Math.PI * 2)
/** Cheap atan2 (max error ~0.005 rad), plenty for choosing colour sectors. */
function fastAtan(y: number, x: number) {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const m = Math.max(ax, ay)
  if (m === 0) return 0
  const z = Math.min(ax, ay) / m
  let a = z * (0.9724 - 0.1919 * z * z)
  if (ay > ax) a = Math.PI / 2 - a
  if (x < 0) a = Math.PI - a
  return y < 0 ? -a : a
}

const JOB_ORDER: JobId[] = ['sword', 'mage', 'archer', 'cleric']
const RAMPS = JOB_ORDER.map((j) => JOB_RAMP[j])
const SIZE = 192
const CX = 96
const FEET = 176
const TIERS = { 2: { w: 100, h: 80, k: 1.8 }, 3: { w: 130, h: 104, k: 2.3 }, 4: { w: 160, h: 128, k: 2.7 } } as const

interface Blob {
  cx: number
  cy: number
  rx: number
  ry: number
  /** Fixed job (blobs that have not merged yet); otherwise the marbled swirl decides. */
  job?: number
}

interface Look {
  /** Body width / height multipliers. */
  sw: number
  sh: number
  dx?: number
  /** Swirl twist 0 (pie slices) .. 1.5 (marbled). */
  tw: number
  eyes: 'open' | 'angry' | 'shut' | 'wide'
  mouth: 'grit' | 'o' | 'flat' | 'open'
  hats?: boolean
  face?: boolean
  sway?: number
  /** Replace the single dome with separate blobs (form frames), positions relative to the body box. */
  blobs?: (w: number, h: number) => Blob[]
}

function body(r: Raster, tier: 2 | 3 | 4, look: Look) {
  const { w: W, h: H, k } = TIERS[tier]
  const w = W * look.sw
  const h = H * look.sh
  const cx = CX + (look.dx ?? 0)
  const top = FEET - h
  const blobs: Blob[] = look.blobs
    ? look.blobs(w, h).map((b) => ({ ...b, cx: b.cx + cx, cy: b.cy + FEET }))
    : [{ cx, cy: top + h / 2, rx: w / 2, ry: h / 2 }]
  const sector = new Uint8Array(SIZE * SIZE)
  const layer = new Raster(SIZE, SIZE)
  const gcx = cx
  const gcy = FEET - h * 0.5
  let x0 = SIZE
  let x1 = 0
  let y0 = SIZE
  let y1 = 0
  for (const b of blobs) {
    x0 = Math.min(x0, Math.floor(b.cx - b.rx - 1))
    x1 = Math.max(x1, Math.ceil(b.cx + b.rx + 1))
    y0 = Math.min(y0, Math.floor(b.cy - b.ry - 1))
    y1 = Math.max(y1, Math.ceil(b.cy + b.ry + 1))
  }
  const lowest = Math.max(...blobs.map((b) => b.cy + b.ry))
  // Each pixel: the blob that contains it most deeply decides shading; the swirl decides the colour.
  const P = { best: -1, q: 0, u: 0, v: 0 }
  const pick = (x: number, y: number) => {
    if (blobs.length === 1) {
      const b = blobs[0]
      const v = (y + 0.5 - b.cy) / b.ry
      const u = (x + 0.5 - b.cx) / b.rx / (1 + 0.09 * v)
      const av = Math.abs(v)
      const q = u * u + (v < 0 ? av * av : av * av * Math.sqrt(av))
      P.best = q <= 1 ? 0 : -1
      P.q = u * u + v * v
      P.u = u
      P.v = v
      return P
    }
    let best = -1
    let bq = 2
    let bu = 0
    let bv = 0
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i]
      const v = (y + 0.5 - b.cy) / b.ry
      const u = (x + 0.5 - b.cx) / b.rx / (1 + 0.09 * v)
      const av = Math.abs(v)
      const q = u * u + (v < 0 ? av * av : av * av * Math.sqrt(av))
      if (q <= 1 && q < bq) {
        bq = q
        best = i
        bu = u
        bv = v
      }
    }
    P.best = best
    P.q = bu * bu + bv * bv
    P.u = bu
    P.v = bv
    return P
  }
  for (let y = Math.max(0, y0); y <= Math.min(SIZE - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(SIZE - 1, x1); x++) {
      const p = pick(x, y)
      if (p.best < 0) continue
      const b = blobs[p.best]
      let j: number
      if (b.job !== undefined) j = b.job
      else {
        const dx = x + 0.5 - gcx
        const dy = y + 0.5 - gcy
        const nx = dx / (w / 2)
        const ny = dy / (h / 2)
        const rr = Math.sqrt(nx * nx + ny * ny)
        const th = fastAtan(dy, dx) * INV_TAU + rr * look.tw * 0.2 + 0.08 * Math.sin(rr * 7 + look.tw)
        j = Math.floor((th + 4) * 4) & 3
      }
      if (look.face) {
        const px = (x + 0.5 - cx) / (w * 0.36)
        const py = (y + 0.5 - (top + h * 0.56)) / (h * 0.3)
        if (px * px + py * py < 1) j = 1
      }
      sector[y * SIZE + x] = j
      const ramp = RAMPS[j]
      const s = p.u * 0.55 + p.v * 0.8
      let c = ramp[1]
      if (s > 0.02 && p.q > 0.1) c = ramp[2]
      if (s > 0.7 && p.q > 0.66) c = ramp[3]
      // Core glow low in the body.
      const gx = (x + 0.5 - b.cx) / (b.rx * 0.5)
      const gy = (y + 0.5 - (b.cy + b.ry * 0.42)) / Math.max(2, b.ry * 0.26)
      const g = gx * gx + gy * gy
      if (g < 1) c = ramp[1]
      if (s < -0.55 && p.q > 0.3 && p.q < 0.8) c = R.paper[1]
      layer.data[y * SIZE + x] = c
    }
  // Specular cluster, bubbles and the bottom rim.
  const hit = (x: number, y: number, c: number) => {
    if (layer.get(x, y)) layer.set(x, y, c)
  }
  const main = blobs.reduce((a, b) => (b.rx > a.rx ? b : a))
  const sx = Math.round(main.cx - main.rx * 0.55)
  const sy = Math.round(main.cy - main.ry * 0.5)
  const sk = Math.max(1, Math.round(k * 0.9))
  for (let j = 0; j < sk * 2; j++) for (let i = 0; i < sk * 3 - j; i++) hit(sx + i, sy + j, C.white)
  hit(sx + sk * 4, sy + sk * 3, C.white)
  hit(sx + sk * 4 + 1, sy + sk * 3, C.white)
  for (const [bx, by, br] of [
    [0.36, 0.2, 2],
    [0.52, 0.08, 1],
    [0.2, 0.3, 1]
  ]) {
    const px = Math.round(main.cx + main.rx * bx)
    const py = Math.round(main.cy + main.ry * by + 5 * k)
    const rr = Math.round(br * k)
    for (let j = 0; j <= rr; j++)
      for (let i = 0; i <= rr; i++) {
        const edge = i === 0 || j === 0 || i === rr || j === rr
        if (rr > 1 && !edge) continue
        if (i === 0 && j === 0) hit(px + i, py + j, R.paper[0])
        else hit(px + i, py + j, JOB_RAMP[JOB_ORDER[sector[py * SIZE + px] & 3]][0])
      }
  }
  for (let x = x0; x <= x1; x++) {
    // Rim along the lowest edge of the left two thirds.
    if (x > cx + w * 0.2 || x < cx - w * 0.38) continue
    for (let y = y1; y >= y0; y--)
      if (layer.get(x, y)) {
        if (Math.abs(y - (lowest - 1)) <= 2 && layer.get(x, y + 1) === 0)
          hit(x, y, JOB_RAMP[JOB_ORDER[sector[y * SIZE + x] & 3]][0])
        break
      }
  }
  despeckleBox(layer)
  outlineBox(layer)
  // Hats and weapons go behind/over the body; compose in order.
  const out = r
  const mainTop = blobs.reduce((m, b) => Math.min(m, b.cy - b.ry), SIZE)
  const hatK = Math.min(k * 0.82, (mainTop + 2) / 16)
  if (look.hats) {
    const rx = w / 2
    const ry = h / 2
    // Weapons first (they stick out behind the hats).
    const wk = hatK * 1.05
    const wpos: [JobId, number, number, number][] = [
      ['sword', -0.62, 0.1, -2.35],
      ['mage', -0.3, 0.02, -1.95],
      ['archer', 0.62, 0.1, -0.75],
      ['cleric', 0.3, 0.02, -1.2]
    ]
    for (const [job, fx, fy, ang] of wpos) {
      const x = cx + rx * fx
      const y = mainTop + ry * (fy + 0.45)
      drawWeapon(out, job, { x, y, ang, dir: 'down', k: wk }, { glow: job === 'mage' || job === 'cleric' ? 1 : 0 })
    }
    out.blit(layer)
    const outer = Math.min(0.78, (92 - 11 * hatK) / rx)
    const hpos: [JobId, number][] = [
      ['sword', -outer],
      ['archer', outer],
      ['mage', -0.3],
      ['cleric', 0.32]
    ]
    for (const [job, fx] of hpos) {
      const x = cx + rx * fx
      const sy = mainTop + ry * (1 - Math.sqrt(Math.max(0, 1 - fx * fx))) + 2.5 * hatK
      const sway = (look.sway ?? 0) * hatK
      drawHeadgear(
        out,
        job,
        { x: Math.round(x), y: Math.round(sy), w: 24 * hatK, dir: 'down', k: hatK, dome: 1.7 },
        sway
      )
    }
  } else out.blit(layer)
  if (look.face) face(out, cx, top, w, h, tier, look)
}

/** Big determined face. */
function face(r: Raster, cx: number, top: number, w: number, h: number, tier: 2 | 3 | 4, look: Look) {
  const k = TIERS[tier].k * 0.8
  const ey = Math.round(top + h * 0.5)
  const gap = Math.round(w * 0.2)
  const rxE = w * 0.075
  const ryE = rxE * 1.4
  for (const side of [-1, 1]) {
    const ex = Math.round(cx + side * gap)
    if (look.eyes === 'shut') {
      r.rect(Math.round(ex - rxE), ey + Math.round(ryE * 0.6), Math.round(rxE * 2), Math.round(k * 1.4), C.black)
      continue
    }
    const ry = look.eyes === 'angry' ? ryE * 0.82 : look.eyes === 'wide' ? ryE * 1.08 : ryE
    r.ellipse(ex, ey, rxE, ry, C.black)
    // Glossy lower tint and catchlights.
    for (let y = ey + 1; y <= ey + ry; y++)
      for (let x = ex - rxE; x <= ex + rxE; x++) {
        const nx = (x + 0.5 - ex) / rxE
        const ny = (y + 0.5 - ey) / ry
        if (nx * nx + ny * ny < 0.62 && ny > 0.34 && r.get(Math.round(x), y) === C.black)
          r.set(Math.round(x), y, R.jobBlue[3])
      }
    r.ellipse(ex - rxE * 0.38, ey - ry * 0.4, rxE * 0.36, ryE * 0.28, C.white)
    r.ellipse(ex + rxE * 0.42, ey + ry * 0.45, rxE * 0.16, rxE * 0.16, C.white)
    // Heavy determined brow sloping down to the middle.
    const bx = ex - side * rxE * 1.3
    const by = ey - ry - 2 * k - 1
    r.thick(bx, by - 2 * k * 0.5, ex + side * rxE * 1.2, by + 2.5 * k, Math.max(2, 2.2 * k), C.black)
    // Blush.
    r.ellipse(ex + side * rxE * 1.4, ey + ry + 2 * k + 1, 3 * k, 1.1 * k, C.blush)
  }
  // Mouth: a bold rounded shape on the single colour patch.
  const my = ey + Math.round(ryE + 5 * k)
  const mw = 5.2 * k
  const blob = (x: number, y: number, rx: number, ry: number, c: number) => r.ellipse(x, y, rx, ry, c)
  if (look.mouth === 'grit') {
    blob(cx, my + 1.6 * k, mw, 2.3 * k, C.black)
    r.rect(
      Math.round(cx - mw + 1),
      Math.round(my + 0.2 * k),
      Math.round(mw * 2 - 2),
      Math.max(2, Math.round(1.4 * k)),
      C.white
    )
    for (let x = Math.round(cx - mw + 3 * k); x < cx + mw - 1; x += Math.max(3, Math.round(2.8 * k)))
      r.rect(x, Math.round(my + 0.2 * k), 1, Math.max(2, Math.round(1.4 * k)), C.black)
    blob(cx, my + 2.6 * k, mw * 0.5, 0.8 * k, R.ratPink[2])
  } else if (look.mouth === 'o') {
    blob(cx, my + 2 * k, 2.8 * k, 3.2 * k, C.black)
    blob(cx, my + 3.2 * k, 1.7 * k, 1.2 * k, R.ratPink[2])
  } else if (look.mouth === 'open') {
    blob(cx, my + 1.8 * k, mw, 3.2 * k, C.black)
    r.rect(
      Math.round(cx - mw * 0.7),
      Math.round(my - 0.8 * k),
      Math.round(mw * 1.4),
      Math.max(1, Math.round(k)),
      C.white
    )
    blob(cx, my + 3.4 * k, mw * 0.55, 1.5 * k, R.ratPink[2])
  } else {
    // Flat determined mouth with down-turned corners.
    r.rect(Math.round(cx - mw), my + 1, Math.round(mw * 2), Math.max(2, Math.round(1.3 * k)), C.black)
    r.rect(Math.round(cx - mw) - 1, my + 2, 1, Math.max(1, Math.round(k)), C.black)
    r.rect(Math.round(cx + mw), my + 2, 1, Math.max(1, Math.round(k)), C.black)
  }
}

const shapes = (tier: 2 | 3 | 4) => {
  const mk = (sw: number, sh: number, tw: number, extra: Partial<Look> = {}): Look => ({
    sw,
    sh,
    tw,
    eyes: 'open',
    mouth: 'grit',
    hats: true,
    face: true,
    ...extra
  })
  const formBlobs =
    (spread: number, grow: number) =>
    (w: number, h: number): Blob[] =>
      [
        [-1, -1, 0],
        [1, -1, 1],
        [-1, 1, 2],
        [1, 1, 3]
      ].map(([sx, sy, job]) => ({
        cx: sx * w * 0.5 * spread,
        cy: -h * 0.5 + sy * h * 0.24 * spread,
        rx: w * grow,
        ry: h * grow * 1.05,
        job
      }))
  void tier
  return {
    form: [
      mk(0.9, 0.8, 0, { blobs: formBlobs(0.95, 0.2), hats: false, face: false }),
      mk(0.9, 0.82, 0, { blobs: formBlobs(0.6, 0.3), hats: false, face: false }),
      mk(1.06, 0.9, 0.9, { eyes: 'angry', mouth: 'flat', sway: 2 }),
      mk(1, 1.04, 1.3, { eyes: 'open', mouth: 'grit', sway: 4 })
    ],
    jump: [
      mk(1.14, 0.82, 1.3, { eyes: 'angry', mouth: 'flat', sway: -1 }),
      mk(0.88, 1.12, 1.3, { eyes: 'wide', mouth: 'o', sway: 5 }),
      mk(1.0, 1.02, 1.3, { eyes: 'open', mouth: 'open', sway: 3 })
    ],
    land: [
      mk(1.16, 0.68, 1.3, { eyes: 'shut', mouth: 'flat', sway: 1 }),
      mk(0.92, 1.1, 1.3, { eyes: 'wide', mouth: 'o', sway: 5 }),
      mk(1.07, 0.93, 1.3, { eyes: 'open', mouth: 'grit', sway: 2 }),
      mk(0.98, 1.03, 1.3, { eyes: 'open', mouth: 'grit', sway: 3 }),
      mk(1, 1, 1.3, { eyes: 'open', mouth: 'grit', sway: 0 })
    ]
  }
}

/** Builds `tech:slime`. */
export function slimeTechSheet(): Sheet {
  const sheet: Sheet = {}
  for (const [name, spec] of Object.entries(TECH_SPEC.slime)) {
    const m = /^jumbo_(\d)_(form|jump|land)$/.exec(name)
    if (!m) continue
    const tier = Number(m[1]) as 2 | 3 | 4
    const looks = shapes(tier)[m[2] as 'form' | 'jump' | 'land']
    const frames = looks.map((look) => {
      const r = new Raster(SIZE, SIZE)
      body(r, tier, look)
      return r
    })
    sheet[name] = anim(frames, spec.fps, spec.loop, {
      anchor: [CX, FEET],
      ...(spec.lift ? { lift: [0, 14 + tier * 4, 46 + tier * 6] } : {})
    })
  }
  return sheet
}

export type { Ramp }
void part
