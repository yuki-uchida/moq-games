/**
 * `tech:crow` — 黒羽の大旋風. A whirlwind of black feathers with violet glints and pale wind streaks (`tornado_2/3/4`,
 * 6-frame loops, the heroes are hidden inside so 2–4 little crows circle in it) and a single tumbling `feather`.
 *
 * Every ring of feathers, wind streaks and crows advances by an exact fraction of its own spacing per frame, so six
 * frames loop seamlessly and the rotation is always readable (never more than half a spacing per frame).
 */
import { TECH_SPEC } from '../contract'
import { R } from '../palette'
import { Raster } from '../raster'
import { anim, type Sheet } from '../sheet'
import { Layer, outlineBox, part } from './layer'
import { BODY, HEAD, blob, fan, leaf, shadeFeather } from './crow-body'

const F = R.crowFeather
const S = R.crowSheen
const B = R.beak
const TAU = Math.PI * 2
const rd = Math.round
const frac = (v: number) => v - Math.floor(v)

/* ------------------------------------------------------------------ small pieces */

/** Cached feather sprites (the angle snaps to 15°): an outlined black leaf with a violet edge light. */
const leafCache = new Map<string, Raster>()
function leafSprite(ang: number, len: number, wid: number, tone: number, glow: boolean) {
  const q = Math.round((((ang % TAU) + TAU) % TAU) / (TAU / 24)) % 24
  const key = `${q}:${len}:${wid}:${tone}:${glow}`
  let sp = leafCache.get(key)
  if (!sp) {
    const sz = Math.ceil(len) * 2 + 6
    sp = new Raster(sz, sz)
    const c = sz / 2
    const a = (q * TAU) / 24
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const base = [F[1], F[2], F[3]][tone]
    part(sp, (l) => {
      leaf(l, c - ca * len * 0.5, c - sa * len * 0.5, ca, sa, len, wid, base)
      const src = l.clone()
      for (let j = 0; j < sz; j++)
        for (let i = 0; i < sz; i++) {
          if (src.get(i, j) !== base) continue
          if (!src.get(i, j - 1) || !src.get(i - 1, j)) l.set(i, j, tone === 0 ? S[2] : F[1])
          else if (!src.get(i, j + 1) || !src.get(i + 1, j)) l.set(i, j, F[3])
        }
      if (glow) {
        l.paint(rd(c - ca * len * 0.12), rd(c - sa * len * 0.12 - 1), S[1])
        l.paint(rd(c + ca * len * 0.2), rd(c + sa * len * 0.2 - 1), S[2])
      }
    })
    leafCache.set(key, sp)
  }
  return sp
}

function putLeaf(r: Raster, x: number, y: number, ang: number, len: number, wid: number, tone = 1, glow = false) {
  const sp = leafSprite(ang, Math.round(len / 2) * 2, Math.round(wid * 2) / 2, tone, glow)
  r.blit(sp, rd(x - sp.w / 2), rd(y - sp.h / 2))
}

/** A tiny flying crow (facing right) in profile; `phase` 0 wings up, 1 level, 2 down. */
function miniCrow(phase: number, sc: number): Raster {
  const r = new Raster(56, 48)
  const cx = 26
  const cy = 26
  const wing = [-1.15, -0.2, 0.85][phase]
  // Far wing and tail first.
  fan(r, cx + 1, cy - 1, wing * 0.8 - 0.1, 9 * sc, true, 4, 0.2, 3 * sc, false, S[3])
  part(r, (l) => {
    l.poly([cx - 3 * sc, cy, cx - 11 * sc, cy + 3.2 * sc, cx - 10 * sc, cy - 0.5 * sc], F[2])
    shadeFeather(l, true, F[2])
  })
  part(r, (l) => blob(l, cx, cy + 1 * sc, 5.4 * sc, 3.7 * sc, BODY))
  fan(r, cx - 1, cy - 1.5 * sc, wing, 15 * sc, true, 5, 0.2, 4.2 * sc, true, S[3])
  part(r, (l) => blob(l, cx + 5 * sc, cy - 1.8 * sc, 3.5 * sc, 3.3 * sc, HEAD))
  part(r, (l) => {
    l.poly([cx + 7.6 * sc, cy - 2.6 * sc, cx + 11 * sc, cy - 1.2 * sc, cx + 7.6 * sc, cy - 0.2 * sc], B[1])
    l.paint(rd(cx + 8 * sc), rd(cy - 2 * sc), B[0])
  })
  r.set(rd(cx + 6 * sc), rd(cy - 2.6 * sc), R.paper[0])
  return r
}

/* ------------------------------------------------------------------ tornado */

interface Geo {
  W: number
  cx: number
  baseY: number
  yTop: number
  H: number
  rt: number
  rb: number
  sc: number
}

const geoOf = (tier: 2 | 3 | 4): Geo => {
  const W = tier === 2 ? 192 : tier === 3 ? 224 : 256
  const rt = Math.round(W * 0.42)
  const ryTop = rt * 0.27
  const yTop = Math.round(ryTop + 10)
  const baseY = W - 16
  return { W, cx: W / 2, baseY, yTop, H: baseY - yTop, rt, rb: 7 + W * 0.012, sc: W / 192 }
}

const radius = (g: Geo, h: number) => g.rb + (g.rt - g.rb) * Math.pow(h, 1.8)
const ringY = (g: Geo, h: number) => g.baseY - h * g.H
const FLAT = 0.27

/** Point on the ring of height h at angle θ: x = sin θ, depth = cos θ (θ = 0 faces the viewer). The column sways. */
const ringPoint = (g: Geo, h: number, theta: number, off: number, f: number): [number, number, number] => {
  const rr = radius(g, h) + off
  const sway = g.W * 0.05 * h * Math.sin((TAU * f) / 6 + 3.4 * h)
  return [g.cx + sway + rr * Math.sin(theta), ringY(g, h) + rr * FLAT * Math.cos(theta), Math.cos(theta)]
}

const DEEPER = new Map<number, number>([
  [S[1], S[2]],
  [S[2], S[3]],
  [S[3], F[2]],
  [F[2], F[3]]
])

function body(g: Geo, f: number): Layer {
  const L = new Layer(g.W, g.W)
  const m = 5
  const put = (x: number, y: number, c: number) => {
    x = rd(x)
    y = rd(y)
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return
    L.data[y * L.w + x] = c
    if (x < L.x0) L.x0 = x
    if (x > L.x1) L.x1 = x
    if (y < L.y0) L.y0 = y
    if (y > L.y1) L.y1 = y
  }
  // Opening at the top: a dark vortex tunnel.
  const topY = ringY(g, 1)
  const rt = radius(g, 1)
  const topX = g.cx + g.W * 0.05 * Math.sin((TAU * f) / 6 + 3.4)
  L.ellipse(topX, topY, rt, rt * FLAT, F[3])
  L.ellipse(topX, topY + 1, rt * 0.78, rt * FLAT * 0.78, F[2])
  L.ellipse(topX, topY + 2, rt * 0.5, rt * FLAT * 0.5, F[3])
  for (let i = 0; i < 3; i++) {
    const th0 = (TAU * i) / 3 + (TAU / 3 / 3) * f
    for (let t = 0; t < 1.3; t += 0.03) {
      const th = th0 + t
      const rr = rt * (0.86 - 0.5 * (t / 1.3))
      L.set(topX + rr * Math.cos(th), topY + 1 + rr * FLAT * Math.sin(th), t < 0.6 ? S[2] : S[3])
    }
  }
  for (let y = 0; y <= g.H; y++) {
    const h = y / g.H
    const rr = radius(g, h)
    const n = Math.ceil(rr * Math.PI * 1.6)
    for (let i = 0; i < n; i++) {
      const th = -Math.PI / 2 + ((i + 0.5) * Math.PI) / n
      const sx = Math.sin(th)
      const [px, py] = ringPoint(g, h, th, 0, f)
      let c = sx < -0.45 ? S[2] : sx < 0.4 ? S[3] : F[2]
      const b = frac((m * th) / TAU + 0.8 * h - f / 3 + 10)
      if (b > 0.5 && b < 0.64) c = DEEPER.get(c) ?? c
      if (h < 0.08) c = DEEPER.get(c) ?? c
      put(px, py, c)
      put(px, py + 1, c)
    }
  }
  // Lip: a violet rim along the front edge of the opening.
  for (let i = 0; i < 140; i++) {
    const th = -Math.PI / 2 + (i * Math.PI) / 139
    const [px, py] = ringPoint(g, 1, th, 0, f)
    L.set(px, py, th < 0.1 ? S[1] : S[2])
  }
  outlineBox(L)
  return L
}

/** Overlapping rows of black feathers on the front of the funnel, flowing round and up. */
function scales(r: Raster, g: Geo, f: number) {
  const rows = 14
  for (let k = rows - 1; k >= 0; k--) {
    const h = 0.045 + (k * 0.93) / (rows - 1)
    const rr = radius(g, h)
    const len = Math.min(30, Math.max(9, rr * 0.36 + 5)) * (0.9 + 0.1 * g.sc)
    const n = Math.max(5, Math.round((TAU * rr) / (len * 0.82)))
    const d = ((TAU / n) * 2) / 6
    for (let j = 0; j < n; j++) {
      const th = (TAU * j) / n + d * f + k * 0.55
      const cz = Math.cos(th)
      if (cz < 0.12) continue
      const sx = Math.sin(th)
      const [px, py] = ringPoint(g, h, th, 1, f)
      // Tangent heading, tipped upward by the climbing spiral.
      const ang = Math.atan2(-rr * FLAT * sx, rr * cz) - 0.42
      const fore = 0.5 + 0.5 * cz
      const tone = sx < -0.35 ? 0 : sx < 0.45 ? 1 : 2
      putLeaf(r, px, py, ang, Math.max(5, len * fore), 4.4 + 0.9 * g.sc, tone, (j + k) % 2 === 0 && sx < 0.4)
    }
  }
}

/** Pale wind streaks winding up the column, each fading in and out along its length. */
function streaks(r: Raster, g: Geo, f: number, front: boolean) {
  const levels = [
    { h: 0.14, m: 3, a: 1.5, off: 9 },
    { h: 0.34, m: 3, a: 1.7, off: 11 },
    { h: 0.52, m: 4, a: 1.4, off: 12 },
    { h: 0.7, m: 3, a: 1.8, off: 13 },
    { h: 0.88, m: 4, a: 1.5, off: 14 }
  ]
  levels.forEach((lv, k) => {
    for (let j = 0; j < lv.m; j++) {
      const th0 = (TAU * j) / lv.m + (((TAU / lv.m) * 2) / 6) * f + k * 1.1
      const steps = 56
      let last: [number, number] | undefined
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const th = th0 + lv.a * t
        if (front ? Math.cos(th) < 0 : Math.cos(th) >= 0) {
          last = undefined
          continue
        }
        const [px, py] = ringPoint(g, lv.h + 0.07 * t, th, lv.off * g.sc, f)
        const c = t < 0.15 || t > 0.85 ? R.sky[2] : t < 0.3 || t > 0.7 ? R.sky[0] : R.paper[0]
        if (last) r.line(last[0], last[1], px, py, c)
        if (t > 0.3 && t < 0.7 && g.sc > 1.1) r.set(px, py + 1, R.sky[1])
        last = [px, py]
      }
    }
  })
}

/** Loose black feathers whipping around the funnel at their own speeds. */
function feathers(r: Raster, g: Geo, f: number, front: boolean) {
  const levels = [0.06, 0.16, 0.27, 0.38, 0.49, 0.6, 0.71, 0.82, 0.93]
  levels.forEach((h, k) => {
    const n = 4 + (k % 3)
    const d = ((TAU / n) * 2) / 6
    for (let j = 0; j < n; j++) {
      const th = (TAU * j) / n + d * f + k * 1.3
      const cz = Math.cos(th)
      if (front ? cz < 0 : cz >= 0) continue
      const off = (5 + 5 * ((k + j) % 3)) * g.sc
      const [px, py] = ringPoint(g, h, th, off, f)
      const rr = radius(g, h) + off
      const ang = Math.atan2(-rr * FLAT * Math.sin(th), rr * cz) - 0.3 + 0.2 * Math.sin(k + j)
      const len = (9 + 9 * h) * g.sc * (0.85 + 0.15 * ((j + k) % 3))
      putLeaf(r, px, py, ang, len * (0.55 + 0.45 * Math.abs(cz)), 3.4 * Math.min(1.3, g.sc), 1, (j + k) % 2 === 0)
    }
  })
}

function crows(r: Raster, g: Geo, f: number, count: number, front: boolean) {
  const d = TAU / count / 6
  const sprites = new Map<string, Raster>()
  for (let k = 0; k < count; k++) {
    const th = (TAU * k) / count + d * f + 0.35
    const cz = Math.cos(th)
    if (front ? cz < 0 : cz >= 0) continue
    const h = 0.56 + 0.1 * Math.sin(k * 2.3 + 1)
    const [px, py] = ringPoint(g, h, th, 16 * g.sc, f)
    const size = Math.round((1.35 + 0.45 * cz) * g.sc * 10) / 10
    const key = `${f % 3}:${size}:${front}`
    let s = sprites.get(key)
    if (!s) {
      s = miniCrow(f % 3, size)
      if (!front) s = s.flipX()
      sprites.set(key, s)
    }
    r.blit(s, rd(px - 26), rd(py - 26))
  }
}

function tornado(tier: 2 | 3 | 4, f: number): Raster {
  const g = geoOf(tier)
  const r = new Raster(g.W, g.W)
  streaks(r, g, f, false)
  feathers(r, g, f, false)
  crows(r, g, f, tier, false)
  const bl = body(g, f)
  for (let y = bl.y0; y <= bl.y1; y++)
    for (let x = bl.x0; x <= bl.x1; x++) {
      const c = bl.data[y * g.W + x]
      if (c) r.data[y * g.W + x] = c
    }
  scales(r, g, f)
  streaks(r, g, f, true)
  crows(r, g, f, tier, true)
  feathers(r, g, f, true)
  // Ground whirl at the foot.
  for (let j = 0; j < 4; j++) {
    const th = (TAU * j) / 4 + (((TAU / 4) * 2) / 6) * f
    for (let i = 0; i < 9; i++) {
      const t = th + i * 0.12
      if (Math.cos(t) < -0.2) continue
      const rr = 18 + 4 * g.sc
      r.set(g.cx + rr * Math.sin(t), g.baseY + 3 + rr * FLAT * Math.cos(t), i > 6 ? R.sky[1] : R.paper[0])
    }
  }
  return r
}

/* ------------------------------------------------------------------ feather particle */

function featherFrame(f: number): Raster {
  const r = new Raster(16, 16)
  const angs = [-0.85, -0.25, 0.6, 0.05]
  const wids = [4.2, 2.8, 4.0, 1.8]
  const len = [11, 10.5, 11, 10][f]
  const sp = leafSprite(angs[f], len, wids[f], 0, true)
  r.blit(sp, rd(8 - sp.w / 2), rd(8 - sp.h / 2))
  return r
}

/* ------------------------------------------------------------------ sheet */

export function crowTechSheet(): Sheet {
  const spec = TECH_SPEC.crow
  const sheet: Sheet = {}
  for (const tier of [2, 3, 4] as const) {
    const want = spec[`tornado_${tier}`]
    sheet[`tornado_${tier}`] = anim(
      [0, 1, 2, 3, 4, 5].map((f) => tornado(tier, f)),
      want.fps,
      want.loop,
      { anchor: want.anchor }
    )
  }
  const fe = spec.feather
  sheet.feather = anim(
    [0, 1, 2, 3].map((f) => featherFrame(f)),
    fe.fps,
    fe.loop
  )
  return sheet
}
