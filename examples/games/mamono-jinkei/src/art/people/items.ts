/**
 * Held items, headgear and back items for the guild rig. Everything is positioned in body space (see rig.ts) and
 * projected, so one drawer serves all three views. Register a new kind by adding to ITEMS / HEADGEAR / BACK_ITEMS.
 */
import { C, R } from '../palette'
import { Raster, ball, rng, shadeEdges, type Ramp } from '../raster'
import {
  BACK_ITEMS,
  HEADGEAR,
  ITEMS,
  V,
  aimDir,
  bar,
  inSkull,
  vadd,
  vlerp,
  vscale,
  type Aim,
  type HeadCtx,
  type ItemCtx,
  type Pt,
  type V3
} from './rig'

// ---------------------------------------------------------------------------------------------------------
// Item helpers

const pt = (c: ItemCtx, p: V3): Pt => c.cam.px(p)
const along = (hand: V3, d: V3, k: number) => vadd(hand, vscale(d, k))

/** A three-tone blade (light top-left, shade bottom-right) between two screen points. */
function blade(l: Raster, a: Pt, b: Pt, ramp: Ramp, w = 3) {
  bar(l, a, b, w, ramp[1])
  const dx = Math.abs(b[0] - a[0])
  const dy = Math.abs(b[1] - a[1])
  const ax = Math.round(a[0])
  const ay = Math.round(a[1])
  const bx = Math.round(b[0])
  const by = Math.round(b[1])
  if (dx >= dy) {
    l.line(ax, ay - 1, bx, by - 1, ramp[0])
    l.line(ax, ay + 1, bx, by + 1, ramp[2])
  } else {
    l.line(ax - 1, ay, bx - 1, by, ramp[0])
    l.line(ax + 1, ay, bx + 1, by, ramp[2])
  }
}

/** An arc smear from one aim to another around the hand (attack frames). */
function smear(c: ItemCtx, radius: number, color: number) {
  const s = c.state.smear
  if (!s) return
  c.paint.add(
    c.depth + 0.3,
    (l) => {
      const n = 12
      let prev: Pt | undefined
      for (let i = Math.round(n * 0.5); i <= n; i++) {
        const t = i / n
        const aim: Aim = { p: s.p + (c.state.aim.p - s.p) * t, y: (s.y ?? 0) + ((c.state.aim.y ?? 0) - (s.y ?? 0)) * t }
        const p = pt(c, along(c.hand, aimDir(aim), radius))
        if (prev) {
          const w = i < n * 0.75 ? 1 : 2
          bar(l, prev, p, w, i > n * 0.8 ? C.white : R.steel[0])
        }
        prev = p
      }
    },
    false
  )
}

// ---------------------------------------------------------------------------------------------------------
// Melee

ITEMS.sword = (c) => {
  const d = aimDir(c.state.aim)
  const len = 11.5
  const ramp = c.far ? c.spec.a : c.spec.a
  const grip = c.spec.b ?? R.leather
  const a = pt(c, along(c.hand, d, 1))
  const tip = pt(c, along(c.hand, d, len))
  c.paint.add(c.depth, (l) => {
    const back = pt(c, along(c.hand, d, -3))
    bar(l, back, a, 2, grip[1])
    l.set(Math.round(back[0]), Math.round(back[1]), c.spec.trim?.[1] ?? R.gold[1])
    // Cross guard perpendicular to the blade on screen.
    const dx = tip[0] - a[0]
    const dy = tip[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    const nx = -dy / L
    const ny = dx / L
    const g = c.spec.trim ?? R.gold
    const gx = (c.hand.f >= 0 ? 0 : 0) + a[0]
    for (const s of [-2, -1, 0, 1, 2]) l.set(gx + nx * s, a[1] + ny * s, g[s === 0 ? 1 : Math.abs(s) === 1 ? 1 : 2])
    if (L > 3) blade(l, [a[0] + (dx / L) * 1.5, a[1] + (dy / L) * 1.5], tip, ramp)
    else l.rect(Math.round(tip[0]) - 1, Math.round(tip[1]) - 1, 3, 3, ramp[1])
  })
  smear(c, len + 3, C.white)
}

ITEMS.mace = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -2))
  const neck = pt(c, along(c.hand, d, 8))
  const tip = pt(c, along(c.hand, d, 11))
  const wood = c.spec.b ?? R.wood
  c.paint.add(c.depth, (l) => {
    bar(l, a, neck, 2, wood[1])
    const hx = Math.round((neck[0] + tip[0]) / 2)
    const hy = Math.round((neck[1] + tip[1]) / 2)
    ball(l, hx, hy, 3.2, 3.2, c.spec.a)
    // Flanges.
    for (const [dx, dy] of [
      [-3, 0],
      [3, 0],
      [0, -3],
      [0, 3]
    ])
      l.set(hx + dx, hy + dy, c.spec.a[2])
    l.set(hx - 1, hy - 1, c.spec.a[0])
  })
  smear(c, 14, C.white)
}

ITEMS.spear = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -10))
  const tip = pt(c, along(c.hand, d, 18))
  const wood = c.spec.b ?? R.wood
  c.paint.add(c.depth, (l) => {
    bar(l, a, tip, 2, wood[1])
    const t0 = pt(c, along(c.hand, d, 18))
    const t1 = pt(c, along(c.hand, d, 25))
    blade(l, t0, t1, c.spec.a, 3)
  })
}

// ---------------------------------------------------------------------------------------------------------
// Magic

function fireBall(l: Raster, x: number, y: number, glow: number, ramp: Ramp, seed: number) {
  const r = 1.6 + glow * 1.8
  l.ellipse(x, y, r + 1.3, r + 1.3, ramp[3])
  l.ellipse(x, y, r + 0.4, r + 0.4, ramp[2])
  l.ellipse(x, y, r - 0.4, r - 0.4, ramp[1])
  l.set(x, y, ramp[0])
  l.set(x - 1, y - 1, ramp[0])
  // Sparks orbiting the tip.
  if (glow > 0.5) {
    const rnd = rng(seed)
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2
      const rr = r + 3 + rnd() * 3
      l.set(x + Math.cos(a) * rr, y + Math.sin(a) * rr, i % 2 ? ramp[0] : ramp[1])
    }
  }
}

ITEMS.wand = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -3))
  const tipP = pt(c, along(c.hand, d, 9))
  const wood = c.spec.a
  c.paint.add(c.depth, (l) => {
    bar(l, a, tipP, 2, wood[1])
    l.set(Math.round(a[0]), Math.round(a[1]), wood[2])
    // little knots
    const mx = Math.round((a[0] + tipP[0]) / 2)
    const my = Math.round((a[1] + tipP[1]) / 2)
    l.paint(mx, my, wood[3])
    // clasp
    l.paint(Math.round(tipP[0]), Math.round(tipP[1]), wood[0])
  })
  const glow = c.state.glow ?? 0.25
  c.paint.add(
    c.depth + 0.2,
    (l) => {
      const tip = pt(c, along(c.hand, d, 10.5))
      fireBall(
        l,
        Math.round(tip[0]),
        Math.round(tip[1]) - 0,
        glow,
        c.spec.b ?? R.fire,
        Math.round(c.hand.f * 7 + c.hand.u * 13)
      )
    },
    false
  )
}

ITEMS.staff = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -14))
  const t = pt(c, along(c.hand, d, 15))
  const wood = c.spec.a
  c.paint.add(c.depth, (l) => {
    bar(l, a, t, 3, wood[1])
    shadeEdges(l, wood, 1, false)
    // Gnarled knots + a curled head with a leaf.
    const knots = [-6, 3, 9]
    knots.forEach((k, i) => {
      const p = pt(c, along(c.hand, d, k))
      l.set(Math.round(p[0]) + (i % 2 ? 1 : -2), Math.round(p[1]), wood[2])
      l.set(Math.round(p[0]) + (i % 2 ? 2 : -3), Math.round(p[1]) - 1, wood[1])
    })
    const top = pt(c, along(c.hand, d, 16))
    const tx = Math.round(top[0])
    const ty = Math.round(top[1])
    l.rect(tx - 2, ty - 2, 2, 2, wood[1])
    l.rect(tx, ty - 3, 2, 2, wood[1])
    l.set(tx + 2, ty - 2, wood[2])
    const leaf = R.clothForest
    l.rect(tx + 1, ty - 6, 2, 3, leaf[1])
    l.set(tx + 1, ty - 7, leaf[0])
    l.set(tx + 3, ty - 5, leaf[2])
    l.set(tx - 1, ty - 4, leaf[1])
  })
}

// ---------------------------------------------------------------------------------------------------------
// Bow

ITEMS.bow = (c) => {
  const d = aimDir(c.state.aim)
  const up = aimDir({ p: c.state.aim.p - 90, y: c.state.aim.y })
  const draw = c.state.draw ?? 0
  const L = 12
  const limb = (t: number): V3 => vadd(vadd(c.hand, vscale(up, L * t)), vscale(d, -3.4 * t * t))
  const wood = c.spec.a
  const stringC = c.spec.b ?? R.paper
  const topTip = pt(c, limb(1))
  const botTip = pt(c, limb(-1))
  let nock: V3
  if (draw > 0) nock = vlerp(along(c.hand, d, -1.5), c.other, Math.min(1, draw * 1.2))
  else nock = along(c.hand, d, -1.2 - draw * 3.2)
  const n = pt(c, nock)
  c.paint.add(c.depth, (l) => {
    let prev: Pt | undefined
    for (let i = -6; i <= 6; i++) {
      const p = pt(c, limb(i / 6))
      if (prev) bar(l, prev, p, 2, wood[1])
      prev = p
    }
    // grip wrap
    const g = pt(c, c.hand)
    l.rect(Math.round(g[0]) - 1, Math.round(g[1]) - 1, 2, 3, c.spec.trim?.[1] ?? R.leather[2])
  })
  c.paint.add(
    c.depth + 0.05,
    (l) => {
      l.line(topTip[0], topTip[1], n[0], n[1], stringC[1])
      l.line(botTip[0], botTip[1], n[0], n[1], stringC[1])
      // Arrow on the string.
      if (draw > 0) {
        const head = pt(c, along(c.hand, d, 5))
        bar(l, n, head, 1, R.wood[0])
        const dx = head[0] - n[0]
        const dy = head[1] - n[1]
        const L2 = Math.hypot(dx, dy) || 1
        // fletching and head
        l.set(n[0] + (dx / L2) * 1, n[1] + (dy / L2) * 1, R.jobRed[1])
        l.set(n[0] + (dx / L2) * 2, n[1] + (dy / L2) * 2, C.white)
        l.set(head[0], head[1], R.steel[1])
        l.set(head[0] + dx / L2, head[1] + dy / L2, R.steel[0])
      }
    },
    false
  )
}

// ---------------------------------------------------------------------------------------------------------
// Shields

/** Maps the unit square of a plate (a: -1..1 across, b: -1..1 top to bottom) to the screen. */
export function plateMapper(c: ItemCtx, center: V3, w: number, h: number, turn: number) {
  const yaw = (turn * Math.PI) / 180
  const hAxis = V(-Math.sin(yaw), Math.cos(yaw), 0)
  const o = pt(c, center)
  const hv = c.cam.dir(hAxis)
  const uv = c.cam.dir(V(0, 0, 1))
  const n = V(Math.cos(yaw), Math.sin(yaw), 0)
  const facing = c.cam.view === 'down' ? n.f : c.cam.view === 'up' ? -n.f : n.r
  return {
    map: (a: number, b: number): Pt => [
      o[0] + a * (w / 2) * hv[0] - b * (h / 2) * uv[0],
      o[1] + a * (w / 2) * hv[1] - b * (h / 2) * uv[1]
    ],
    facing,
    width: Math.abs(hv[0]) * w
  }
}

function polyOf(m: (a: number, b: number) => Pt, pts: [number, number][], scale = 1, shift = 0): number[] {
  return pts.flatMap(([a, b]) => m(a * scale + shift, b * scale))
}

const TOWER: [number, number][] = [
  [-1, -0.92],
  [-0.86, -1],
  [0.86, -1],
  [1, -0.92],
  [1, 0.55],
  [0.6, 1],
  [-0.6, 1],
  [-1, 0.55]
]

/** Guild crest: two crossed swords. */
function crest(l: Raster, m: (a: number, b: number) => Pt, gold: Ramp, steel: Ramp) {
  const g = (a: number, b: number): Pt => m(a, b)
  const s1a = g(-0.5, -0.62)
  const s1b = g(0.5, 0.5)
  const s2a = g(0.5, -0.62)
  const s2b = g(-0.5, 0.5)
  l.line(s1a[0], s1a[1], s1b[0], s1b[1], gold[1])
  l.line(s2a[0], s2a[1], s2b[0], s2b[1], gold[1])
  const c0 = g(0, -0.05)
  l.set(c0[0], c0[1], gold[0])
  // crossguard hint
  for (const [a, b] of [
    [-0.28, 0.32],
    [0.28, 0.32]
  ])
    l.rect(g(a, b)[0] - 1, g(a, b)[1], 2, 1, gold[2])
  void steel
}

ITEMS.tower = (c) => {
  const turn = c.state.turn ?? 0
  const p = c.state.aim.p
  const center = vadd(c.hand, V(3.2 + (p > 30 ? 0 : 0), 0, 1))
  const gold = c.spec.trim ?? R.gold
  const steel = c.spec.a
  const { map, facing, width } = plateMapper(c, center, 12, 19, turn)
  c.paint.add(c.depth + 0.15, (l) => {
    l.poly(polyOf(map, TOWER), steel[2])
    if (facing >= 0 || true) {
      // Raised rim: lit top-left edge, shade bottom-right edge via inner plate.
      l.poly(polyOf(map, TOWER, 0.78, 0.0), facing > 0 ? steel[1] : steel[2])
    }
    // lit rim on the top and left
    const tl = map(-1, -0.92)
    const tr = map(0.86, -1)
    const bl = map(-1, 0.55)
    if (facing > 0) {
      l.line(tl[0], tl[1], tr[0], tr[1], steel[0])
      l.line(tl[0], tl[1], bl[0], bl[1], steel[0])
    }
    if (width < 5) bar(l, map(0, -1), map(0, 1), 3, steel[1])
    if (facing > 0.35 && width >= 5) crest(l, map, gold, steel)
    else if (facing <= 0 && width >= 5) {
      // Back of the shield: strap and grip.
      const a = map(-0.2, -0.5)
      const b = map(-0.2, 0.4)
      l.line(a[0], a[1], b[0], b[1], R.leather[1])
    }
  })
}

// ---------------------------------------------------------------------------------------------------------
// Headgear

function headPixels(h: HeadCtx, l: Raster, test: (dx: number, dy: number) => boolean, c: number) {
  for (let y = h.cy - 20; y <= h.cy + 12; y++)
    for (let x = h.cx - 14; x <= h.cx + 14; x++) if (test(x + 0.5 - h.cx, y + 0.5 - h.cy)) l.set(x, y, c)
}

HEADGEAR.headband = (h) => {
  const { ramp } = h.gear
  const k = h.pose.flow > 0 ? 1 : 0
  h.paint.add(h.depth, (l) => {
    // A 2-row band hugging the skull just above the brows.
    headPixels(h, l, (dx, dy) => dy > -4.9 && dy < -2.7 && (dx / 9.1) ** 2 + ((dy + 0.7) / 8.5) ** 2 <= 1, ramp[1])
    shadeEdges(l, ramp, 1, true)
    if (h.view === 'side') {
      // Two short tails trailing behind the head.
      l.rect(h.cx - 11, h.cy - 4, 2, 5 + k, ramp[1])
      l.rect(h.cx - 13 + k, h.cy - 3, 2, 5, ramp[2])
      l.set(h.cx - 11, h.cy - 4, ramp[0])
    } else if (h.view === 'up') {
      l.rect(h.cx - 3, h.cy - 2, 2, 5, ramp[1])
      l.rect(h.cx + 1, h.cy - 2, 2, 4 + k, ramp[2])
      l.set(h.cx - 3, h.cy - 2, ramp[0])
    } else if (h.gear.trim) {
      l.rect(h.cx - 1, h.cy - 4, 2, 2, h.gear.trim[1])
      l.set(h.cx - 1, h.cy - 4, h.gear.trim[0])
    }
  })
}

HEADGEAR.cap = (h) => {
  const { ramp } = h.gear
  h.paint.add(h.depth, (l) => {
    const dome = (dx: number, dy: number) =>
      (dx / 9.5) ** 2 + ((dy + 1) / 8.9) ** 2 <= 1 &&
      dy < -2.2 - (h.view === 'side' ? Math.max(0, 2 - (dx + 4) * 0.4) * 0 : 0)
    headPixels(
      h,
      l,
      (dx, dy) =>
        h.view === 'up' ? dome(dx, dy) || ((dx / 9.5) ** 2 + ((dy + 1) / 8.9) ** 2 <= 1 && dy < 3) : dome(dx, dy),
      ramp[1]
    )
    // Brim / peak.
    if (h.view === 'down') l.rect(h.cx - 7, h.cy - 3, 14, 2, ramp[2])
    if (h.view === 'side') l.rect(h.cx + 2, h.cy - 4, 10, 2, ramp[2])
    shadeEdges(l, ramp, 1, true)
    // Stitched seam and a small tuft button.
    if (h.view !== 'side') for (let y = h.cy - 9; y < h.cy - 4; y += 2) l.paint(h.cx, y, ramp[3])
    else for (let i = 0; i < 6; i += 2) l.paint(h.cx - 2 + i, h.cy - 8 + (i > 3 ? 1 : 0), ramp[3])
    l.paint(h.cx - 1, h.cy - 8, ramp[0])
    if (h.view === 'down' && h.gear.trim) l.rect(h.cx - 1, h.cy - 4, 2, 1, h.gear.trim[1])
  })
}

HEADGEAR.wizhat = (h) => {
  const { ramp, trim } = h.gear
  const bend = 3 + h.pose.flow * 0.8
  const side = h.view === 'side'
  // Crown first (behind the brim), then the brim.
  h.paint.add(h.depth, (l) => {
    const baseY = h.cy - 5
    const tipY = h.cy - 22
    for (let y = baseY; y >= tipY; y--) {
      const t = (baseY - y) / (baseY - tipY)
      const hw = Math.max(0.6, 6.4 * (1 - t) ** 0.85)
      const bendX = (side ? bend * 0.5 : bend) * t * t * (t > 0.7 ? 1.5 : 1) - (side ? 1.5 * t : 0)
      const c0 = h.cx + bendX
      for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw + (hw < 1 ? 1 : 0)); x++) l.set(x, y, ramp[1])
    }
    shadeEdges(l, ramp, 1, true)
    // Hat band.
    if (trim) {
      for (let y = baseY - 2; y <= baseY - 1; y++)
        for (let x = h.cx - 8; x < h.cx + 8; x++) if (l.get(x, y)) l.set(x, y, trim[1])
      if (h.view === 'down') l.rect(h.cx - 1, baseY - 2, 2, 2, trim[0])
      l.set(h.cx + (h.view === 'down' ? 2 : 3), baseY - 1, trim[2])
    }
    // A crooked fold on the cone.
    for (let k = 0; k < 3; k++) l.paint(h.cx + 1 + k, baseY - 8 - k * 2, ramp[2])
    l.paint(h.cx - 3, baseY - 6, ramp[0])
    l.paint(h.cx - 2, baseY - 8, ramp[0])
  })
  h.paint.add(h.depth + 0.01, (l) => {
    const cy = h.cy - 5.5
    headPixels(
      h,
      l,
      (dx, dy) => (dx / (side ? 11.5 : 12.2)) ** 2 + ((dy - (cy - h.cy)) / (side ? 2.6 : 3.4)) ** 2 <= 1,
      ramp[1]
    )
    shadeEdges(l, ramp, 1, true)
    // Underside shadow on the brim.
    for (let x = h.cx - 11; x < h.cx + 11; x++)
      if (l.get(x, h.cy - 5) && !l.get(x, h.cy - 3)) l.paint(x, h.cy - 5, ramp[2])
  })
}

HEADGEAR.helmet = (h) => {
  const { ramp, trim } = h.gear
  h.paint.add(h.depth, (l) => {
    const dome = (dx: number, dy: number) => (dx / 9.8) ** 2 + ((dy + 1.2) / 9) ** 2 <= 1
    headPixels(
      h,
      l,
      (dx, dy) => {
        if (h.view === 'up') return dome(dx, dy) && dy < 6.5
        if (h.view === 'side')
          return (dome(dx, dy) && (dy < -0.8 || dx < 1.8)) || (dx < 2.5 && dx > -9 && dy < 6 && dome(dx, dy))
        return (dome(dx, dy) && dy < -0.8) || (Math.abs(dx) > 6.2 && Math.abs(dx) < 9.8 && dy < 5.5 && dome(dx, dy))
      },
      ramp[1]
    )
    shadeEdges(l, ramp, 1, true)
    // Brow rim.
    for (let x = h.cx - 11; x < h.cx + 11; x++) {
      const y = h.cy - 1
      if (h.view !== 'up' && l.get(x, y) && l.get(x, y - 1)) l.set(x, y, ramp[2])
    }
    // Rivets.
    if (h.view === 'down') {
      l.paint(h.cx - 6, h.cy - 3, ramp[0])
      l.paint(h.cx + 6, h.cy - 3, ramp[3])
    }
    if (h.view === 'up') for (let y = h.cy - 9; y < h.cy + 6; y++) l.paint(h.cx, y, ramp[2])
    if (h.view === 'down') for (let y = h.cy - 9; y < h.cy - 2; y++) l.paint(h.cx - 1, y, ramp[2])
    if (trim) {
      // Crest ridge on the crown.
      l.rect(h.cx - 1, h.cy - 10, 2, 1, trim[1])
    }
    // Nose guard.
    if (h.view === 'down') {
      l.rect(h.cx - 1, h.cy - 1, 2, 5, ramp[1])
      l.set(h.cx - 1, h.cy - 1, ramp[0])
      l.set(h.cx, h.cy + 3, ramp[2])
    } else if (h.view === 'side') {
      l.rect(h.cx + 6, h.cy - 2, 2, 6, ramp[1])
      l.set(h.cx + 6, h.cy - 2, ramp[0])
      l.set(h.cx + 7, h.cy + 3, ramp[2])
    }
  })
}

// ---------------------------------------------------------------------------------------------------------
// Back items

BACK_ITEMS.quiver = ({ cam, paint, item }) => {
  const up = cam.view === 'up'
  const base = cam.px(V(-4.5, -2.8, 20.5))
  const top = cam.px(V(-6.5, -3.4, 34))
  const depth = up ? 0.3 : -0.8
  paint.add(depth, (l) => {
    // Arrow feathers stick out of the mouth.
    const tx = Math.round(top[0])
    const ty = Math.round(top[1])
    for (const [dx, dy, c] of [
      [-2, -3, R.jobRed[1]],
      [0, -4, C.white],
      [2, -3, R.jobRed[2]]
    ] as [number, number, number][]) {
      l.rect(tx + dx, ty + dy, 2, 3, c)
      l.set(tx + dx, ty + dy, c === C.white ? R.paper[1] : R.jobRed[0])
    }
    bar(l, base, top, 5, item.ramp[1])
    shadeEdges(l, item.ramp, 1, true)
    l.rect(tx - 2, ty, 5, 1, item.ramp[3])
    if (item.trim) l.rect(Math.round(base[0]) - 2, Math.round(base[1]) - 3, 5, 1, item.trim[1])
  })
  // Strap across the chest (seen from the front only).
  if (cam.view === 'down') {
    paint.add(0.3, (l) => {
      const a = cam.px(V(0, 6, 36))
      const b = cam.px(V(0, -5, 14))
      bar(l, a, b, 2, item.ramp[2])
      l.line(a[0], a[1] - 1, b[0], b[1] - 1, item.ramp[1])
    })
  }
}

BACK_ITEMS.cape = ({ cam, paint, item, pose, torso }) => {
  const depth = cam.view === 'up' ? 0.3 : -0.8
  paint.add(depth, (l) => {
    const top = torso.sy
    const bottom = 50
    const flow = pose.flow
    const sideBack = cam.view === 'side'
    for (let y = top; y < bottom; y++) {
      const t = (y - top) / (bottom - top)
      const hw = (sideBack ? 2.4 : torso.ws + 0.5) + t * (sideBack ? 1 : 3)
      const c0 = (sideBack ? torso.sx - 5 : torso.sx) + flow * t * (sideBack ? -1.5 : 1)
      for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++) l.set(x, y, item.ramp[1])
    }
    shadeEdges(l, item.ramp, 2, true)
  })
}

export { vlerp }
