/** Stage 3 props, part 1: the shared puzzle furniture drawn in clocktower stone, brass and oak. */
import { Raster, ball } from '../raster'
import type { Sheet } from '../sheet'
import { solid } from './pp'
import {
  C,
  D,
  G,
  GD,
  GOLD,
  R,
  RK,
  RT,
  S,
  SK,
  STEEL,
  WOOD,
  beam,
  block3,
  frame,
  mk,
  outline,
  part,
  post,
  rivet,
  shade,
  shard,
  strap,
  swing
} from './tower-pp'

// ------------------------------------------------------------------ block

function block() {
  const r = frame('block')
  shade(r, 32, 91, 30, 5)
  part(r, (l) => {
    block3(l, 6, 38, 52, 17, 38, [S[0], S[1], S[2], S[3]], 3)
    // brass corner straps and emblem
    strap(l, 7, 55, 5, 36)
    strap(l, 51, 55, 5, 36)
    rivet(l, 8, 58)
    rivet(l, 52, 58)
    rivet(l, 8, 84)
    rivet(l, 52, 84)
    l.ellipse(32, 73, 7, 7, GOLD[3])
    l.ellipse(32, 72.5, 6, 6, GOLD[1])
    l.ring(32, 72.5, 2.4, 3.4, GOLD[3])
    l.set(32, 72, GOLD[0])
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      l.set(32 + Math.cos(a) * 5, 72.5 + Math.sin(a) * 5, GOLD[0])
    }
    // chipped top edge and moss
    l.rect(20, 38, 7, 1, S[1])
    l.rect(40, 54, 3, 1, S[3])
  })
  return r
}

// ------------------------------------------------------------------ pot

function potBody(r: Raster, split = 0) {
  part(r, (l) => {
    l.ellipse(32, 41, 17, 16, RT[2])
    ball(l, 32, 40, 16.5, 15.5, RT)
    for (let y = 22; y < 28; y++)
      for (let x = 24; x < 41; x++) {
        const t = (x - 24) / 16
        l.set(x, y, t < 0.25 ? RT[0] : t < 0.6 ? RT[1] : RT[2])
      }
    l.ellipse(32, 23, 11, 4, RT[0])
    l.ellipse(32, 24, 8.5, 2.6, C.inkWarm)
    l.ellipse(32, 25, 6, 1.4, RT[3])
    // brass band
    for (let x = 17; x < 48; x++) {
      const y = 38 + Math.round(Math.sin(((x - 17) / 30) * Math.PI) * 3)
      for (let k = 0; k < 3; k++) {
        const inside = l.get(x, y + k)
        if (inside) l.set(x, y + k, k === 0 ? GOLD[0] : k === 1 ? GOLD[1] : GOLD[3])
      }
    }
    // handles
    l.ring(16.5, 34, 2, 3.4, RT[2], -Math.PI * 0.6, Math.PI * 0.6 + Math.PI)
    l.ring(47.5, 34, 2, 3.4, RT[3], -Math.PI * 0.4, Math.PI * 0.4 + Math.PI)
    if (split) l.line(32, 26, 32 + split, 54, C.inkWarm)
  })
  return r
}
function pot() {
  const r = frame('pot')
  shade(r, 32, 55, 17, 4)
  return potBody(r)
}
function potBreak(f: number) {
  const r = frame('pot_break')
  const t = f / 4
  if (f === 0) {
    shade(r, 32, 55, 17, 4)
    potBody(r, 1)
    r.ellipse(32, 38, 20, 18, C.white)
    for (let i = 0; i < 12; i++) r.set(32 + Math.cos(i) * 22, 38 + Math.sin(i) * 20, C.white)
    // overlay the pot again smaller so the flash reads as a rim
    const pot2 = frame('pot')
    potBody(pot2, 1)
    return r.blit(pot2)
  }
  shade(r, 32, 55, 17 - f * 2, 4 - f * 0.5)
  const shards = [
    [-1, -1, 4],
    [1, -1.2, 4],
    [-0.4, -1.6, 3],
    [1.5, -0.4, 3],
    [-1.6, -0.2, 3],
    [0.5, 0.3, 4],
    [-0.8, 0.4, 3],
    [0.2, -0.7, 3],
    [1.1, 0.5, 2],
    [-1.3, 0.6, 2]
  ]
  shards.forEach(([vx, vy, s], i) => {
    const gx = 32 + vx * 14 * t
    const gy = 40 + vy * 16 * t + t * t * 26
    if (f === 4 && i % 2) return
    shard(r, gx - 2, Math.min(gy, 54), s, RT, i)
    if (i % 3 === 0 && f < 4) r.set(gx + 3, gy - 2, GOLD[0])
  })
  if (f >= 3) {
    // base fragment left on the floor
    for (let x = 22; x < 43; x++) r.set(x, 53, RT[2])
    for (let x = 24; x < 41; x++) r.set(x, 52, RT[1])
    for (let x = 26; x < 38; x++) r.set(x, 51, RT[0])
  }
  return r
}

// ------------------------------------------------------------------ rock

function rock() {
  const r = frame('rock')
  shade(r, 32, 52, 27, 6)
  part(r, (l) => {
    l.poly([6, 46, 5, 34, 13, 22, 27, 14, 43, 15, 55, 24, 59, 38, 53, 49, 31, 52], RK[1])
    // lit facets (top-left)
    l.poly([13, 22, 27, 14, 43, 15, 36, 25, 22, 31, 8, 34], RK[0])
    l.poly([27, 14, 43, 15, 39, 19, 30, 20], R.paper[1])
    // shaded facets (bottom-right)
    l.poly([59, 38, 53, 49, 31, 52, 6, 46, 24, 43, 42, 40, 56, 31], RK[2])
    l.poly([53, 49, 31, 52, 6, 46, 20, 47, 40, 47], RK[3])
    // ridge between lit and mid facets
    l.line(22, 31, 36, 25, RK[1])
    l.line(36, 25, 55, 24, RK[1])
    l.line(36, 25, 40, 38, RK[2])
    l.line(22, 31, 24, 43, RK[2])
  })
  // cracks and chips
  r.line(30, 33, 33, 41, RK[3])
  r.line(33, 41, 31, 46, RK[3])
  r.line(46, 28, 49, 34, RK[3])
  r.set(20, 26, RK[0])
  r.set(21, 25, RK[0])
  for (const [x, y] of [
    [24, 22],
    [41, 22],
    [18, 36]
  ]) {
    r.rect(x, y, 3, 1, R.sludge[0])
    r.rect(x + 1, y + 1, 3, 1, R.sludge[1])
  }
  for (let i = 0; i < 4; i++) {
    r.set(48 + i, 51 - (i % 2), G[1])
    r.set(48 + i, 50 - (i % 2), G[0])
  }
  return r
}

// ------------------------------------------------------------------ plates

function feather(r: Raster, x: number, y: number, c: number, c2: number) {
  r.line(x, y + 8, x + 4, y, c)
  r.line(x + 1, y + 7, x + 5, y + 2, c2)
  r.line(x - 1, y + 6, x + 2, y + 3, c2)
  r.set(x + 4, y, c)
  r.set(x + 3, y + 1, c2)
}
function plate(on: boolean, two: boolean) {
  const r = frame(two ? 'plate2_off' : 'plate_off')
  // recessed stone frame
  r.rect(5, 6, 54, 52, S[3])
  r.rect(6, 7, 52, 50, S[2])
  r.rect(7, 8, 51, 49, S[1])
  r.rect(7, 8, 50, 1, S[0])
  r.rect(7, 8, 1, 49, S[0])
  const lift = on ? 0 : 4
  const x0 = 11
  const y0 = 12 + (on ? 3 : 0)
  const w = 42
  const h = 38 - (on ? 3 : 0) - lift + 4
  const ramp = on ? GOLD : STEEL
  // side face
  if (!on) {
    r.rect(x0, y0 + h - 1, w, 5, S[3])
    r.rect(x0, y0 + h, w, 3, ramp[3])
    r.rect(x0 + 1, y0 + h - 1, w - 2, 1, ramp[2])
  }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = ramp[1]
      if (i === 0 || j === 0) c = ramp[0]
      else if (i === w - 1 || j === h - 1) c = ramp[2]
      r.set(x0 + i, y0 + j, c)
    }
  rivetsAt(r, x0 + 2, y0 + 2, w - 5, h - 5)
  // glyph
  const gc = on ? R.holy[0] : STEEL[3]
  const gc2 = on ? GOLD[3] : STEEL[2]
  const cy = y0 + h / 2 - 5
  if (two) {
    feather(r, x0 + w / 2 - 12, cy, gc2, gc)
    feather(r, x0 + w / 2 + 6, cy, gc2, gc)
  } else {
    feather(r, x0 + w / 2 - 2, cy, gc2, gc)
  }
  if (on) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      r.set(32 + Math.cos(a) * 26, 33 + Math.sin(a) * 25, R.holy[1])
    }
  }
  return r
}
function rivetsAt(r: Raster, x: number, y: number, w: number, h: number) {
  for (const [dx, dy] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h]
  ]) {
    r.set(x + dx, y + dy, GOLD[0])
    r.set(x + dx + 1, y + dy + 1, GOLD[3])
  }
}

// ------------------------------------------------------------------ crystal

function crystal(name: string, mode: 'off' | 'on' | 'hit', f: number) {
  const r = frame(name)
  const ramp = mode === 'off' ? R.crowFeather : R.magic
  const bob = mode === 'on' ? Math.round(Math.sin((f / 4) * Math.PI * 2) * 1.2) : mode === 'off' ? f % 2 : 0
  const scale = mode === 'hit' ? [1.12, 1.06, 1, 1][f] : 1
  shade(r, 32, 76, 23, 5)
  // pedestal
  part(r, (l) => {
    block3(l, 14, 62, 36, 8, 13, [S[0], S[1], S[2], S[3]])
    l.rect(15, 62, 34, 2, GOLD[1])
    l.rect(15, 63, 34, 1, GOLD[3])
    l.set(15, 62, GOLD[0])
  })
  if (mode !== 'off') {
    // glow ring on the floor
    const g = mode === 'hit' ? 1 : 0.6 + 0.4 * Math.sin((f / 4) * Math.PI * 2)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + f * 0.2
      if (i % 2 === 0 || g > 0.9) r.set(32 + Math.cos(a) * 24, 72 + Math.sin(a) * 8, ramp[0])
    }
  }
  const cx = 32
  const top = 12 + bob + (1 - scale) * 20
  const bot = 66 + bob
  const w = Math.round(12 * scale)
  const midY = (top + bot) / 2 - 2
  part(r, (l) => {
    const tip: [number, number] = [cx, top]
    const pts: number[] = [cx, top, cx - w, top + 15, cx - w, bot - 18, cx, bot, cx + w, bot - 18, cx + w, top + 15]
    // left (lit) and right (shade) facets
    l.poly([cx, top, cx - w, top + 15, cx - w, bot - 18, cx, bot], ramp[mode === 'off' ? 1 : 1])
    l.poly([cx, top, cx + w, top + 15, cx + w, bot - 18, cx, bot], ramp[2])
    // inner facet highlights
    l.poly([cx, top + 2, cx - w + 3, top + 16, cx - w + 3, midY + 6, cx - 1, midY - 6], ramp[0])
    l.poly([cx + 2, top + 8, cx + w - 3, top + 18, cx + w - 3, bot - 26, cx + 3, midY], ramp[1])
    l.line(cx, top, cx, bot, ramp[3])
    l.line(cx - w, top + 15, cx, top + 24, ramp[3])
    l.line(cx + w, top + 15, cx, top + 24, ramp[3])
    void tip
    void pts
  })
  // sparkles
  if (mode === 'on') {
    const sp = [
      [-18, 18, 0],
      [19, 30, 2],
      [-14, 46, 1],
      [17, 14, 3]
    ]
    for (const [dx, dy, ph] of sp) {
      if ((f + ph) % 4 < 2) {
        const x = 32 + dx
        const y = 12 + dy + bob
        r.set(x, y, C.white)
        r.set(x - 1, y, ramp[0])
        r.set(x + 1, y, ramp[0])
        r.set(x, y - 1, ramp[0])
        r.set(x, y + 1, ramp[0])
      }
    }
  }
  if (mode === 'hit') {
    const n = [10, 14, 12, 8][f]
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const len = 10 + f * 5
      r.line(
        32 + Math.cos(a) * 9,
        38 + Math.sin(a) * 12,
        32 + Math.cos(a) * (9 + len * 0.5),
        38 + Math.sin(a) * (12 + len * 0.6),
        f < 2 ? C.white : ramp[0]
      )
    }
  }
  return r
}

// ------------------------------------------------------------------ lever

function lever(angle: number, name: string) {
  const r = frame(name)
  shade(r, 32, 47, 19, 4)
  part(r, (l) => {
    block3(l, 14, 38, 36, 7, 8, [S[0], S[1], S[2], S[3]])
    l.ellipse(32, 38, 8, 3.4, GOLD[2])
    l.ellipse(32, 37.5, 7, 2.8, GOLD[1])
    l.ellipse(32, 37, 4.5, 1.6, GOLD[3])
  })
  const len = 24
  const tx = 32 + Math.sin(angle) * len
  const ty = 38 - Math.cos(angle) * len
  const arm = new Raster(64, 64)
  arm.thick(32, 38, tx, ty, 4, STEEL[2])
  arm.thick(32 - 0.6, 38 - 0.6, tx - 0.6, ty - 0.6, 2, STEEL[0])
  part(r, (l) => {
    l.blit(arm)
    ball(l, tx, ty - 1, 5.5, 5.5, R.jobRed)
  })
  r.ellipse(32, 38, 2.4, 2, GOLD[0])
  r.set(32, 38, GOLD[2])
  return r
}

// ------------------------------------------------------------------ gate

function gate(open: number) {
  const r = frame('gate_closed')
  shade(r, 32, 92, 31, 4)
  const bars = Math.max(0, 1 - open)
  part(r, (l) => {
    // pillars
    block3(l, 1, 22, 14, 6, 66, [S[0], S[1], S[2], S[3]], 6)
    block3(l, 49, 22, 14, 6, 66, [S[0], S[1], S[2], S[3]], 6)
    // lintel with brass band
    block3(l, 1, 8, 62, 8, 18, [S[0], S[1], S[2], S[3]], 2)
    strap(l, 3, 22, 58, 3)
    for (let i = 0; i < 6; i++) rivet(l, 7 + i * 10, 22)
  })
  // dark passage
  r.rect(15, 29, 34, 59, C.inkBlue)
  for (let y = 29; y < 88; y++) for (let x = 15; x < 49; x++) if (y > 76 && (x + y) % 3 === 0) r.set(x, y, S[3])
  r.rect(15, 87, 34, 2, S[2])
  r.rect(15, 88, 34, 2, S[3])
  // portcullis
  const bottom = 86 - Math.round(open * 56)
  const top = 28
  if (bars > 0 || open < 1) {
    for (let i = 0; i < 6; i++) {
      const x = 17 + i * 6
      for (let y = top; y < bottom; y++) {
        r.set(x, y, STEEL[0])
        r.set(x + 1, y, STEEL[1])
        r.set(x + 2, y, STEEL[2])
        r.set(x + 3, y, STEEL[3])
      }
      for (let k = 0; k < 4; k++) r.set(x + 1 + (k % 2), bottom + k, STEEL[2 + (k > 1 ? 1 : 0)] ?? STEEL[3])
      if (bottom > top) {
        r.set(x + 1, bottom, STEEL[0])
        r.set(x + 1, bottom + 1, STEEL[2])
        r.set(x + 1, bottom + 2, STEEL[3])
      }
    }
    for (const yy of [36, 56, 74]) {
      if (yy < bottom) {
        r.rect(15, yy, 34, 3, STEEL[2])
        r.rect(15, yy, 34, 1, STEEL[0])
        r.rect(15, yy + 2, 34, 1, STEEL[3])
      }
    }
  }
  if (open >= 1) {
    // lintel slot where the bars hide
    r.rect(15, 28, 34, 2, S[3])
  }
  return r
}

// ------------------------------------------------------------------ sign

function sign() {
  const r = frame('sign')
  shade(r, 32, 56, 14, 3)
  part(r, (l) => {
    post(l, 29, 30, 57, 6)
    beam(l, 7, 57, 8, 24)
    // board details
    l.rect(8, 9, 48, 1, WOOD[0])
    l.rect(8, 29, 48, 1, WOOD[3])
    strap(l, 7, 8, 4, 24)
    strap(l, 53, 8, 4, 24)
    rivet(l, 8, 10)
    rivet(l, 54, 10)
    rivet(l, 8, 25)
    rivet(l, 54, 25)
  })
  // carved arrow
  r.rect(16, 19, 26, 3, WOOD[3])
  r.poly([42, 14, 50, 20.5, 42, 27], WOOD[3])
  r.rect(16, 18, 26, 1, WOOD[2])
  r.rect(15, 20, 1, 1, WOOD[3])
  return r
}

// ------------------------------------------------------------------ chest

function chest(open: number, glow = false) {
  const r = frame('chest_closed')
  shade(r, 32, 52, 25, 5)
  const lift = open
  part(r, (l) => {
    // body
    block3(l, 8, 28, 48, 9, 21, [WOOD[0], WOOD[1], WOOD[2], WOOD[3]])
    // interior of an open chest
    if (open > 0) {
      l.rect(10, 29, 44, 8, WOOD[3])
      l.rect(11, 30, 42, 6, glow ? GOLD[2] : C.inkWarm)
      if (glow) for (let x = 12; x < 52; x += 3) l.set(x, 30 + ((x / 3) % 2), GOLD[0])
    }
  })
  // lid
  if (open === 0) {
    part(r, (l) => {
      l.ellipse(32, 29, 24, 10, WOOD[1])
      l.rect(8, 29, 48, 7, WOOD[1])
      l.ellipse(32, 26, 22, 6, WOOD[0])
      l.rect(8, 35, 48, 2, WOOD[2])
    })
  } else {
    const h = [0, 8, 14, 20][open]
    part(r, (l) => {
      // lid standing behind the open chest
      beam(l, 10, 54, 28 - h - 6, h + 6)
      l.rect(10, 28 - h - 6, 44, 1, WOOD[0])
      l.rect(12, 28 - 2, 40, 2, WOOD[3])
    })
  }
  // brass fittings
  const lidY = open === 0 ? 20 : 28
  for (const x of [14, 46]) {
    strap(r, x, open === 0 ? 22 : 29, 5, open === 0 ? 27 : 20)
    rivet(r, x + 1, 31)
    rivet(r, x + 1, 43)
  }
  strap(r, 28, 36, 8, 10)
  r.rect(31, 39, 2, 4, C.inkWarm)
  void lift
  void lidY
  return r
}

// ------------------------------------------------------------------ torch

function torch(f: number) {
  const r = frame('torch')
  shade(r, 16, 56, 9, 3)
  part(r, (l) => {
    // base and pole
    l.ellipse(16, 53, 8, 3.5, S[2])
    l.ellipse(16, 52, 7, 3, S[1])
    l.rect(14, 28, 5, 24, GOLD[2])
    l.rect(14, 28, 2, 24, GOLD[0])
    l.rect(18, 28, 1, 24, GOLD[3])
    for (const y of [36, 44]) l.rect(13, y, 7, 2, GOLD[1])
    // cup
    l.poly([8, 22, 24, 22, 20, 30, 12, 30], GOLD[1])
    l.rect(8, 21, 16, 2, GOLD[0])
    l.rect(11, 29, 10, 2, GOLD[3])
  })
  // flame
  const sway = [0, 1, 0, -1][f]
  const h = [18, 20, 17, 19][f]
  for (let y = 0; y < h; y++) {
    const t = y / h
    const wv = Math.round(Math.sin(t * 3 + f * 1.6) * 2 * t) + sway * Math.round(t * 2)
    const w = Math.max(0, Math.round(6.5 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12)) * (1 - t * 0.35)))
    const yy = 21 - y
    for (let x = -w; x <= w; x++) {
      const e = Math.abs(x) / Math.max(1, w)
      const c = t > 0.7 ? R.fire[3] : e > 0.7 ? R.fire[2] : t < 0.35 && e < 0.45 ? R.fire[0] : R.fire[1]
      r.set(16 + x + wv, yy, c)
    }
  }
  r.set(16 + sway * 2, 21 - h - 1, R.fire[2])
  if (f % 2) r.set(22, 6 + f, R.fire[1])
  return r
}

// ------------------------------------------------------------------ altar

function altar() {
  const r = frame('altar')
  shade(r, 64, 108, 56, 8)
  part(r, (l) => {
    block3(l, 14, 70, 100, 22, 28, [S[0], S[1], S[2], S[3]], 3)
    strap(l, 16, 92, 96, 3)
    for (let i = 0; i < 9; i++) rivet(l, 20 + i * 11, 92)
    block3(l, 34, 52, 60, 14, 22, [S[0], S[1], S[2], S[3]], 2)
    strap(l, 36, 66, 56, 2)
  })
  // runes on the lower front
  for (let i = 0; i < 5; i++) {
    const x = 26 + i * 19
    r.ring(x + 3, 109, 2, 3.2, GOLD[2])
    r.set(x + 3, 105, GOLD[0])
    r.line(x + 1, 109, x + 5, 109, GOLD[3])
  }
  // orb cradle on the top
  r.ellipse(64, 59, 17, 7, GOLD[3])
  r.ellipse(64, 58, 16, 6, GOLD[1])
  r.ellipse(64, 58.5, 11, 4, GOLD[3])
  r.ellipse(64, 59, 9, 3, C.inkWarm)
  r.ellipse(64, 59.5, 6, 1.8, C.black)
  for (const dx of [-14, 0, 14])
    for (const dy of [0]) {
      void dy
      r.rect(64 + dx - 1, 49, 3, 7, GOLD[1])
      r.rect(64 + dx - 1, 49, 1, 7, GOLD[0])
      r.set(64 + dx + 1, 55, GOLD[3])
    }
  return r
}

export const propsA = (): Sheet => ({
  block: mk('block', [block()]),
  pot: mk('pot', [pot()]),
  pot_break: mk('pot_break', [0, 1, 2, 3, 4].map(potBreak)),
  rock: mk('rock', [rock()]),
  plate_off: mk('plate_off', [plate(false, false)]),
  plate_on: mk('plate_on', [plate(true, false)]),
  plate2_off: mk('plate2_off', [plate(false, true)]),
  plate2_on: mk('plate2_on', [plate(true, true)]),
  crystal_off: mk(
    'crystal_off',
    [0, 1].map((f) => crystal('crystal_off', 'off', f))
  ),
  crystal_on: mk(
    'crystal_on',
    [0, 1, 2, 3].map((f) => crystal('crystal_on', 'on', f))
  ),
  crystal_hit: mk(
    'crystal_hit',
    [0, 1, 2, 3].map((f) => crystal('crystal_hit', 'hit', f))
  ),
  lever_off: mk('lever_off', [lever(-0.62, 'lever_off')]),
  lever_on: mk('lever_on', [lever(0.62, 'lever_on')]),
  lever_pull: mk(
    'lever_pull',
    [-0.35, 0.1, 0.8, 0.62].map((a) => lever(a, 'lever_pull'))
  ),
  gate_closed: mk('gate_closed', [gate(0)]),
  gate_opening: mk(
    'gate_opening',
    [0.2, 0.4, 0.6, 0.8, 0.95].map((o) => gate(o))
  ),
  gate_open: mk('gate_open', [gate(1)]),
  sign: mk('sign', [sign()]),
  chest_closed: mk('chest_closed', [chest(0)]),
  chest_opening: mk(
    'chest_opening',
    [1, 2, 3, 3].map((o, i) => chest(o, i === 3))
  ),
  chest_open: mk('chest_open', [chest(3, true)]),
  torch: mk('torch', [0, 1, 2, 3].map(torch)),
  altar: mk('altar', [altar()])
})

export { D, GD, RT, SK, swing }
