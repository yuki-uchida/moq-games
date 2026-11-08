/**
 * Stage 4 guild parts, registered into the shared rig tables: longbow, fur hood and cloak, snare belt (hunter);
 * sun helm, pauldrons, sun tabard, sun kite shield, sun mace with a healing glow (paladin); icicle crown, frost
 * gown, crystal staff (ice witch); great helm, tower shield, war hammer (heavy).
 */
import { C, R } from '../palette'
import { Raster, bayer, shadeEdges, type Ramp } from '../raster'
import { plateMapper } from './items'
import {
  BACK_ITEMS,
  HEADGEAR,
  HEADGEAR_HIDES_HAIR,
  ITEMS,
  OVERLAYS,
  V,
  aimDir,
  bar,
  fillTorso,
  vadd,
  vlerp,
  vscale,
  type HeadCtx,
  type ItemCtx,
  type Pt,
  type V3
} from './rig'

HEADGEAR_HIDES_HAIR.add('furhood')
HEADGEAR_HIDES_HAIR.add('greathelm')
HEADGEAR_HIDES_HAIR.add('sunhelm')

const pt = (c: ItemCtx, p: V3): Pt => c.cam.px(p)
const along = (hand: V3, d: V3, k: number) => vadd(hand, vscale(d, k))

function px(h: HeadCtx, l: Raster, test: (dx: number, dy: number) => boolean, c: number) {
  for (let y = h.cy - 24; y <= h.cy + 12; y++)
    for (let x = h.cx - 16; x <= h.cx + 16; x++) if (test(x + 0.5 - h.cx, y + 0.5 - h.cy)) l.set(x, y, c)
}

/** A sun: gold disc with eight rays. */
export function sun(l: Raster, cx: number, cy: number, r: number, ramp: Ramp = R.gold) {
  // Eight one-pixel rays around the disc.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const d = r + 1.4
    l.set(cx + Math.cos(a) * d, cy + Math.sin(a) * d, i % 2 ? ramp[2] : ramp[1])
  }
  l.ellipse(cx, cy, r, r, ramp[1])
  l.set(cx - 1, cy - 1, ramp[0])
  l.set(cx + r - 1, cy + r - 1, ramp[2])
}

/** A dithered glow disc (no outline layers): `a` 0..1 opacity of the dither. */
function halo(l: Raster, cx: number, cy: number, r: number, ramp: Ramp) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
      if (d > 1) continue
      if (l.get(x, y)) continue
      const t = 1 - d
      if (bayer(x, y) < t * 0.62) l.set(x, y, t > 0.55 ? ramp[0] : t > 0.3 ? ramp[1] : ramp[2])
    }
}

const sparkle = (l: Raster, x: number, y: number, c: number) => {
  l.set(x, y, c)
  l.set(x - 1, y, c)
  l.set(x + 1, y, c)
  l.set(x, y - 1, c)
  l.set(x, y + 1, c)
}

/** An arc swing smear for heavy weapons. */
function swing(c: ItemCtx, radius: number, color: number) {
  const s = c.state.smear
  if (!s) return
  c.paint.add(
    c.depth + 0.3,
    (l) => {
      const n = 12
      let prev: Pt | undefined
      for (let i = 6; i <= n; i++) {
        const t = i / n
        const p = pt(c, along(c.hand, aimDir({ p: s.p + (c.state.aim.p - s.p) * t }), radius))
        if (prev) bar(l, prev, p, i < 9 ? 1 : 2, i > 10 ? C.white : color)
        prev = p
      }
    },
    false
  )
}

// ---------------------------------------------------------------------------------------------------------
// Hunter

ITEMS.longbow = (c) => {
  const d = aimDir(c.state.aim)
  const up = aimDir({ p: c.state.aim.p - 90, y: c.state.aim.y })
  const draw = c.state.draw ?? 0
  const L = 15
  const limb = (t: number): V3 => vadd(vadd(c.hand, vscale(up, L * t)), vscale(d, -4.6 * t * t))
  const wood = c.spec.a
  const stringC = c.spec.b ?? R.paper
  const topTip = pt(c, limb(1))
  const botTip = pt(c, limb(-1))
  const nock: V3 =
    draw > 0 ? vlerp(along(c.hand, d, -1.5), c.other, Math.min(1, draw * 1.2)) : along(c.hand, d, -1.2 - draw * 3.4)
  const n = pt(c, nock)
  c.paint.add(c.depth, (l) => {
    let prev: Pt | undefined
    for (let i = -8; i <= 8; i++) {
      const p = pt(c, limb(i / 8))
      if (prev) bar(l, prev, p, 2, wood[1])
      prev = p
    }
    shadeEdges(l, wood, 1, true)
    // Fur-wrapped grip and horn tips.
    const g = pt(c, c.hand)
    l.rect(Math.round(g[0]) - 1, Math.round(g[1]) - 2, 3, 4, R.wolfCream[1])
    l.set(Math.round(g[0]) - 1, Math.round(g[1]) - 2, R.wolfCream[0])
    l.set(Math.round(topTip[0]), Math.round(topTip[1]), R.wolfCream[1])
    l.set(Math.round(botTip[0]), Math.round(botTip[1]), R.wolfCream[1])
  })
  c.paint.add(
    c.depth + 0.05,
    (l) => {
      l.line(topTip[0], topTip[1], n[0], n[1], stringC[1])
      l.line(botTip[0], botTip[1], n[0], n[1], stringC[1])
      if (draw > 0) {
        const head = pt(c, along(c.hand, d, 7))
        bar(l, n, head, 1, R.wood[0])
        const dx = head[0] - n[0]
        const dy = head[1] - n[1]
        const L2 = Math.hypot(dx, dy) || 1
        l.set(n[0] + (dx / L2) * 1, n[1] + (dy / L2) * 1, R.clothForest[1])
        l.set(n[0] + (dx / L2) * 2, n[1] + (dy / L2) * 2, R.clothForest[0])
        l.set(head[0], head[1], R.steel[1])
        l.set(head[0] + dx / L2, head[1] + dy / L2, R.steel[0])
      }
    },
    false
  )
}

HEADGEAR.furhood = (h) => {
  const { ramp } = h.gear
  const fur = h.gear.trim ?? R.wolfCream
  const down = h.view === 'down'
  const side = h.view === 'side'
  const dome = (dx: number, dy: number) => (dx / 10.6) ** 2 + ((dy + 1.4) / 10) ** 2 <= 1
  const face = (dx: number, dy: number, grow = 0) =>
    down
      ? (dx / (6.4 + grow)) ** 2 + ((dy - 1.4) / (6.2 + grow)) ** 2 <= 1 && dy > -4.4 - grow
      : side
        ? dx > 0.4 - grow &&
          dy > -4.4 - grow &&
          ((dx - 2.6) / (6.6 + grow)) ** 2 + ((dy - 1.4) / (6.2 + grow)) ** 2 <= 1
        : false
  h.paint.add(h.depth, (l) => {
    px(h, l, (dx, dy) => dome(dx, dy) && dy < (h.view === 'up' ? 8.5 : 6.6) && !face(dx, dy), ramp[1])
    // The pointed tip of the hood, flopping back.
    const tx = h.cx + (down ? 2 : side ? -10 : 1) + h.pose.flow * 0.5
    const ty = h.cy - (down ? 14 : side ? 11 : 12)
    l.poly(
      down ? [h.cx - 5, h.cy - 8, h.cx + 5, h.cy - 8, tx, ty] : [h.cx - 5, h.cy - 8, h.cx + 4, h.cy - 5, tx, ty],
      ramp[1]
    )
    shadeEdges(l, ramp, 1, true)
    // A drawstring seam.
    if (!down) for (let y = h.cy - 8; y < h.cy + 5; y += 2) l.paint(h.cx - (side ? 4 : 0), y, ramp[3])
  })
  if (down || side)
    h.paint.add(h.depth + 0.01, (l) => {
      px(h, l, (dx, dy) => dome(dx, dy) && face(dx, dy, 1.9) && !face(dx, dy) && dy < 7.2, fur[1])
      shadeEdges(l, fur, 1, true)
      for (let i = 0; i < 6; i++) l.paint(h.cx - 6 + i * 2, h.cy - 4 + (i % 2), fur[0])
    })
}

BACK_ITEMS.furcloak = ({ cam, paint, item, pose, torso }) => {
  const depth = cam.view === 'up' ? 0.3 : -0.8
  const fur = item.trim ?? R.wolfCream
  const sideBack = cam.view === 'side'
  paint.add(depth, (l) => {
    const top = torso.sy - 1
    const bottom = 52
    for (let y = top; y < bottom; y++) {
      const t = (y - top) / (bottom - top)
      const hw = (sideBack ? 3 : torso.ws + 1.5) + t * (sideBack ? 1.4 : 4.5)
      const c0 = (sideBack ? torso.sx - 5 : torso.sx) + pose.flow * t * (sideBack ? -1.8 : 1)
      for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++) {
        // Ragged hem.
        if (y >= bottom - 2 && (x * 3 + y) % 4 === 0) continue
        l.set(x, y, item.ramp[1])
      }
    }
    shadeEdges(l, item.ramp, 2, true)
    for (let y = top + 6; y < bottom - 2; y += 4) l.paint(torso.sx + (sideBack ? -5 : 3), y, item.ramp[3])
  })
  paint.add(cam.view === 'up' ? 0.32 : 0.31, (l) => {
    // Fur mantle over the shoulders.
    const hw = sideBack ? 4.5 : torso.ws + 2
    const cx = sideBack ? torso.sx - 1 : torso.sx
    for (let y = torso.sy - 2; y < torso.sy + 3; y++)
      for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
        if (y === torso.sy + 2 && (x + 1) % 3 === 0) continue
        if (y < torso.sy - 1 && Math.abs(x + 0.5 - cx) > hw - 2.5) continue
        l.set(x, y, fur[1])
      }
    shadeEdges(l, fur, 1, true)
    for (let x = Math.round(cx - hw) + 2; x < cx + hw - 3; x += 4) l.paint(x, torso.sy - 1, fur[0])
  })
}

OVERLAYS.snares = ({ paint, T, view, ov }) => {
  paint.add(0.25, (l) => {
    const y = T.hy - 1
    const rope = ov.ramp
    const cx = view === 'side' ? Math.round(T.hx) + 1 : Math.round(T.hx) + 6
    l.ring(cx, y, 1.4, 3.3, rope[1])
    l.ring(cx + 1, y + 1, 1.2, 2.2, rope[2], 0, Math.PI)
    l.set(cx - 2, y - 2, rope[0])
    l.line(cx - 3, y + 2, cx - 4, y + 5, rope[2])
    if (view !== 'side') {
      // Knife in a sheath on the other hip.
      const kx = Math.round(T.hx) - 7
      l.rect(kx, y - 2, 2, 3, R.leather[2])
      l.rect(kx, y + 1, 2, 4, R.steel[1])
      l.set(kx, y + 1, R.steel[0])
    }
  })
}

// ---------------------------------------------------------------------------------------------------------
// Paladin

HEADGEAR.sunhelm = (h) => {
  const { ramp } = h.gear
  const gold = h.gear.trim ?? R.gold
  HEADGEAR.helmet?.(h)
  h.paint.add(h.depth + 0.02, (l) => {
    const cx = h.cx
    const cy = h.cy
    if (h.view === 'side') {
      // A swept gold fin along the crown.
      for (let i = 0; i < 12; i++) {
        const x = cx + 4 - i
        const top = cy - 9 - Math.round(Math.sin((i / 11) * Math.PI) * 5)
        l.rect(x, top, 1, 3, gold[1])
        l.set(x, top, gold[0])
      }
      l.rect(cx - 8, cy - 3, 3, 5, gold[1])
    } else {
      l.rect(cx - 1, cy - 15, 2, 7, gold[1])
      l.rect(cx - 1, cy - 15, 1, 5, gold[0])
      l.set(cx, cy - 16, gold[1])
      if (h.view === 'down') {
        // Small gold wings at the temples.
        for (const s of [-1, 1]) {
          l.poly([cx + s * 9, cy - 3, cx + s * 14, cy - 10, cx + s * 11.5, cy - 1], gold[1])
        }
      }
    }
    shadeEdges(l, gold, 1, true)
    void ramp
  })
}

OVERLAYS.pauldrons = ({ paint, T, view, ov }) => {
  paint.add(1.2, (l) => {
    const r = ov.ramp
    const trim = ov.trim ?? R.gold
    const spots = view === 'side' ? [T.sx + 0.5] : [T.sx - T.ws - 0.5, T.sx + T.ws + 0.5]
    for (const x of spots) {
      const rx = view === 'side' ? 4.8 : 5
      l.ellipse(x, T.sy + 1.5, rx, 3.8, r[1])
      l.rect(Math.round(x - rx) + 1, T.sy + 4, Math.round(rx * 2) - 2, 1, trim[1])
    }
    shadeEdges(l, r, 1, true)
    for (const x of spots) l.set(x - 2, T.sy, trim[0])
  })
}

OVERLAYS.suntabard = ({ paint, T, view, ov }) => {
  paint.add(0.12, (l) => {
    const blue = ov.ramp
    const gold = ov.trim ?? R.gold
    const inFront = (dx: number) => (view === 'side' ? dx > -1.4 && dx < 2.4 : Math.abs(dx) < 4.4)
    fillTorso(
      l,
      T,
      T.sy + 1,
      T.hy + 7,
      blue[1],
      (dx, y) => inFront(dx) && !(y > T.hy + 5 && (Math.round(dx) + y) % 2 === 0)
    )
    shadeEdges(l, blue, 1, true)
    if (view !== 'side') {
      // Gold edging down both sides and the sun on the chest.
      for (let y = T.sy + 1; y < T.hy + 5; y++) {
        l.paint(T.sx - 4, y, gold[1])
        l.paint(T.sx + 3, y, gold[2])
      }
    }
    if (view === 'down') sun(l, T.sx, T.sy + 5.5, 2, gold)
  })
}

ITEMS.kite = (c) => {
  const turn = c.state.turn ?? 0
  const center = vadd(c.hand, V(3.4, 0, 0.5))
  const gold = c.spec.trim ?? R.gold
  const field = c.spec.a
  const { map, facing, width } = plateMapper(c, center, 14, 24, turn)
  const KITE: [number, number][] = [
    [-1, -0.94],
    [-0.88, -1],
    [0.88, -1],
    [1, -0.94],
    [1, -0.2],
    [0.55, 0.62],
    [0, 1],
    [-0.55, 0.62],
    [-1, -0.2]
  ]
  const poly = (k: number, dy = 0) => KITE.flatMap(([a, b]) => map(a * k, b * k + dy))
  c.paint.add(c.depth + 0.15, (l) => {
    l.poly(poly(1), gold[2])
    l.poly(poly(0.9), gold[1])
    l.poly(poly(0.78), facing > 0 ? field[1] : R.steel[2])
    if (width < 5) bar(l, map(0, -1), map(0, 1), 3, gold[1])
    if (facing > 0 && width >= 5) {
      const tl = map(-0.78, -0.78)
      const tr = map(0.78, -0.78)
      const bl = map(-0.78, -0.1)
      l.line(tl[0], tl[1], tr[0], tr[1], field[0])
      l.line(tl[0], tl[1], bl[0], bl[1], field[0])
      const m = map(0, -0.1)
      sun(l, m[0], m[1], Math.max(2, width * 0.18), gold)
    } else if (width >= 5) {
      const a = map(-0.2, -0.5)
      const b = map(-0.2, 0.4)
      l.line(a[0], a[1], b[0], b[1], R.leather[1])
    }
  })
}

ITEMS.sunmace = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -2))
  const neck = pt(c, along(c.hand, d, 8))
  const headP = pt(c, along(c.hand, d, 10.5))
  const gold = c.spec.a
  const shaft = c.spec.b ?? R.steel
  c.paint.add(c.depth, (l) => {
    bar(l, a, neck, 2, shaft[1])
    const hx = Math.round(headP[0])
    const hy = Math.round(headP[1])
    l.ellipse(hx, hy, 3.4, 3.4, gold[1])
    for (const [dx, dy] of [
      [-4, 0],
      [4, 0],
      [0, -4],
      [0, 4]
    ])
      l.set(hx + dx, hy + dy, gold[2])
    shadeEdges(l, gold, 1, true)
    l.set(hx, hy, gold[0])
  })
  const glow = c.state.glow ?? 0
  if (glow > 0)
    c.paint.add(
      c.depth + 0.25,
      (l) => {
        const hx = Math.round(headP[0])
        const hy = Math.round(headP[1])
        halo(l, hx, hy, 5 + glow * 7, R.holy)
        sparkle(l, hx - 6 - Math.round(glow * 2), hy - 5, C.white)
        if (glow > 0.6) sparkle(l, hx + 6, hy - 7, R.holy[0])
        if (glow > 1) sparkle(l, hx + 2, hy - 11, C.glow)
      },
      false
    )
  swing(c, 15, R.holy[0])
}

// ---------------------------------------------------------------------------------------------------------
// Ice witch

HEADGEAR.icecrown = (h) => {
  const { ramp } = h.gear
  const down = h.view !== 'side'
  h.paint.add(h.depth, (l) => {
    px(h, l, (dx, dy) => dy > -8.8 && dy < -6.4 && (dx / 9.2) ** 2 + ((dy + 0.7) / 8.6) ** 2 <= 1, ramp[1])
    const spikes: [number, number][] = down
      ? [
          [-7, 5],
          [-4.5, 8],
          [-1.5, 6],
          [1.5, 11],
          [4.5, 7],
          [7, 5]
        ]
      : [
          [-6, 5],
          [-3, 8],
          [0, 11],
          [3, 7],
          [5.5, 5]
        ]
    for (const [sx, hh] of spikes) {
      const x = h.cx + sx
      l.poly([x - 1.3, h.cy - 8, x + 1.3, h.cy - 8, x + (sx < 0 ? -0.2 : 0.4), h.cy - 8 - hh], ramp[1])
    }
    shadeEdges(l, ramp, 1, true)
    l.paint(h.cx + 1, h.cy - 7, R.ice[0])
    l.set(h.cx + (down ? 2 : 1), h.cy - 7, R.jobBlue[0])
  })
  // Long hair strands (painted over the hair of the back and side views only).
  if (h.view !== 'down')
    h.paint.add(
      h.depth - 0.005,
      (l) => {
        const side = h.view === 'side'
        const x0 = side ? -7 : -7
        const x1 = side ? -2 : 7
        for (let dx = x0; dx <= x1; dx++) {
          const x = h.cx + dx
          const k = (dx + 20) % 3
          for (let dy = side ? -1 : -2; dy <= (side ? 8 : 8); dy++) {
            if ((dy + dx * 2 + 40) % 5 === 0) continue
            l.set(x, h.cy + dy, k === 0 ? R.ice[1] : k === 1 ? R.snow[1] : R.snow[0])
          }
        }
      },
      false
    )
}

OVERLAYS.frostgown = ({ paint, T, view, ov, pose }) => {
  paint.add(0.15, (l) => {
    const r = ov.ramp
    const top = T.hy - 2
    const hem = 53
    const sway = Math.round(pose.flow * 0.5)
    for (let y = top; y < hem; y++) {
      const t = (y - top) / (hem - top)
      const hw = Math.round(T.wh + 1 + t * 3.8)
      const c0 = Math.round(T.hx + sway * t)
      for (let x = c0 - hw; x < c0 + hw; x++) {
        // Icicle hem: alternating long and short teeth.
        if (y >= hem - 3 && ((x - c0 + 40) % 3 === 0 ? y >= hem - 1 : (x - c0 + 40) % 3 === 1 && y >= hem - 2)) continue
        l.set(x, y, r[1])
      }
    }
    shadeEdges(l, r, 2, true)
    const snow = ov.trim ?? R.snow
    // Snow-white hem band and frost flakes.
    for (let y = hem - 7; y < hem - 4; y++)
      for (let x = T.hx - 12 + sway; x < T.hx + 12 + sway; x++)
        l.paint(x, y, y === hem - 7 ? snow[0] : y === hem - 6 ? snow[1] : snow[2])
    const flakes: [number, number][] = [
      [-6, 8],
      [3, 12],
      [-2, 17],
      [6, 22],
      [-7, 26]
    ]
    for (const [fx, fy] of flakes) {
      const x = Math.round(T.hx + fx + sway * 0.5)
      const y = top + fy
      if (view === 'side' && fx > 0) continue
      l.paint(x, y, snow[0])
      l.paint(x - 1, y, snow[1])
      l.paint(x + 1, y, snow[1])
      l.paint(x, y - 1, snow[1])
      l.paint(x, y + 1, snow[1])
    }
    // Silver sash and chest frost.
    for (let x = T.hx - 6; x < T.hx + 6; x++) l.paint(x, T.hy - 1, snow[1])
    if (view === 'down') for (let i = 0; i < 4; i++) l.paint(T.hx - 1 + (i % 2), top + 2 + i * 3, R.ice[2])
  })
}

ITEMS.crystalstaff = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -13))
  const t = pt(c, along(c.hand, d, 13))
  const wood = c.spec.a
  const gem = c.spec.b ?? R.ice
  const glow = c.state.glow ?? 0.3
  const mid = pt(c, along(c.hand, d, 18.5))
  const lo = pt(c, along(c.hand, d, 14.5))
  const hi = pt(c, along(c.hand, d, 24))
  const ds: Pt = [hi[0] - lo[0], hi[1] - lo[1]]
  const L = Math.hypot(ds[0], ds[1]) || 1
  const u: Pt = [ds[0] / L, ds[1] / L]
  const n: Pt = [-u[1], u[0]]
  c.paint.add(c.depth, (l) => {
    bar(l, a, t, 2, wood[1])
    shadeEdges(l, wood, 1, true)
    // Silver claws holding the crystal.
    for (const s of [-1, 1])
      l.line(t[0], t[1], t[0] + u[0] * 4 + n[0] * s * 3, t[1] + u[1] * 4 + n[1] * s * 3, R.steel[1])
  })
  c.paint.add(c.depth + 0.1, (l) => {
    const k = 4.6 + glow * 0.9
    const P = (su: number, sn: number) => [mid[0] + u[0] * su + n[0] * sn, mid[1] + u[1] * su + n[1] * sn]
    l.poly([...P(k + 1.5, 0), ...P(0, 3.2), ...P(-k, 0), ...P(0, -3.2)], gem[1])
    l.poly([...P(k + 1.5, 0), ...P(0, -3.2), ...P(-k, 0), ...P(0, -0.2)], gem[0])
    l.poly([...P(k + 1.5, 0), ...P(0, 3.2), ...P(-k, 0), ...P(0, 0.4)], gem[2])
    l.set(mid[0] - 1, mid[1] - 1, C.white)
  })
  if (glow > 0.75)
    c.paint.add(
      c.depth + 0.05,
      (l) => {
        const cx = Math.round(mid[0])
        const cy = Math.round(mid[1])
        halo(l, cx, cy, 3 + glow * 4.5, R.ice)
        if (glow > 0.7) {
          sparkle(l, cx - 8, cy - 4, C.white)
          sparkle(l, cx + 7, cy - 7, R.ice[0])
          sparkle(l, cx + 3, cy + 7, C.spark)
        }
        if (glow > 1) sparkle(l, cx - 3, cy - 11, C.spark)
      },
      false
    )
}

// ---------------------------------------------------------------------------------------------------------
// Heavy

HEADGEAR.greathelm = (h) => {
  const { ramp } = h.gear
  h.paint.add(h.depth, (l) => {
    const side = h.view === 'side'
    px(
      h,
      l,
      (dx, dy) => {
        const dome = (dx / 10.2) ** 2 + ((dy + 1) / 9.6) ** 2 <= 1
        const jaw =
          dy >= -1 &&
          dy < 8.8 &&
          (side ? dx > -9 && dx < 8.4 - Math.max(0, dy - 6) : Math.abs(dx) < 8.6 - Math.max(0, dy - 6.5))
        return dome || jaw
      },
      ramp[1]
    )
    shadeEdges(l, ramp, 1, true)
    // Brow band and visor slit with a faint cold glint.
    const sx0 = side ? h.cx + 0 : h.cx - 7
    const w = side ? 9 : 14
    if (h.view !== 'up') {
      l.rect(sx0, h.cy - 1, w, 3, C.black)
      l.rect(sx0, h.cy - 2, w, 1, ramp[2])
      l.set(sx0 + (side ? w - 3 : 3), h.cy, R.ice[1])
      if (!side) l.set(sx0 + 10, h.cy, R.ice[1])
      for (let i = 0; i < 4; i++) l.paint(sx0 + 2 + i * 3 - (side ? 0 : 0), h.cy + 5, ramp[3])
    }
    if (h.view !== 'side') for (let y = h.cy - 11; y < h.cy - 2; y++) l.paint(h.cx - 1, y, ramp[2])
    if (h.view === 'up') for (let y = h.cy - 10; y < h.cy + 8; y++) l.paint(h.cx, y, ramp[2])
    l.paint(h.cx - 5, h.cy - 6, ramp[0])
    l.paint(h.cx - 6, h.cy - 5, ramp[0])
    // Crest fin.
    l.rect(h.cx - 1 + (side ? -3 : 0), h.cy - 12, 3, 2, ramp[2])
  })
}

ITEMS.bigtower = (c) => {
  const turn = c.state.turn ?? 0
  const center = vadd(c.hand, V(3.6, 0, 1.4))
  const steel = c.spec.a
  const trim = c.spec.trim ?? R.gold
  const { map, facing, width } = plateMapper(c, center, 19, 27, turn)
  const SHAPE: [number, number][] = [
    [-1, -0.8],
    [-0.76, -1],
    [0.76, -1],
    [1, -0.8],
    [1, 0.7],
    [0.7, 1],
    [-0.7, 1],
    [-1, 0.7]
  ]
  const poly = (k: number, dy = 0) => SHAPE.flatMap(([a, b]) => map(a * k, b * k + dy))
  c.paint.add(c.depth + 0.15, (l) => {
    l.poly(poly(1), steel[3])
    l.poly(poly(0.9), steel[2])
    l.poly(poly(0.8), facing > 0 ? steel[1] : steel[3])
    if (width < 5) bar(l, map(0, -1), map(0, 1), 4, steel[2])
    if (facing > 0.1 && width >= 5) {
      const tl = map(-0.8, -0.8)
      const tr = map(0.76, -0.9)
      const bl = map(-0.9, 0.62)
      l.line(tl[0], tl[1], tr[0], tr[1], steel[0])
      l.line(tl[0], tl[1], bl[0], bl[1], steel[0])
      // Horizontal gold bar, a central boss and rivets.
      const g0 = map(-0.8, -0.35)
      const g1 = map(0.8, -0.35)
      bar(l, g0, g1, 2, trim[2])
      l.line(g0[0], g0[1] - 1, g1[0], g1[1] - 1, trim[1])
      const m = map(0, 0.15)
      l.ellipse(m[0], m[1], 3, 3, steel[2])
      l.ellipse(m[0] - 0.3, m[1] - 0.3, 2.2, 2.2, steel[1])
      l.set(m[0] - 1, m[1] - 1, steel[0])
      for (const [a, b] of [
        [-0.65, -0.75],
        [0.62, -0.75],
        [-0.65, 0.65],
        [0.62, 0.65]
      ] as [number, number][]) {
        const r = map(a, b)
        l.set(r[0], r[1], steel[0])
      }
    } else if (width >= 5) {
      const a = map(-0.2, -0.5)
      const b = map(-0.2, 0.4)
      l.line(a[0], a[1], b[0], b[1], R.leather[1])
    }
  })
}

ITEMS.warhammer = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -4))
  const e = pt(c, along(c.hand, d, 13))
  const wood = c.spec.b ?? R.wood
  const steel = c.spec.a
  const p0 = pt(c, along(c.hand, d, 10))
  const p1 = pt(c, along(c.hand, d, 15.5))
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1
  const u: Pt = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L]
  const n: Pt = [-u[1], u[0]]
  c.paint.add(c.depth, (l) => {
    bar(l, a, e, 2, wood[1])
    // Hammer head: a heavy block across the shaft tip with a rear spike.
    const mid: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
    const P = (su: number, sn: number): Pt => [mid[0] + u[0] * su + n[0] * sn, mid[1] + u[1] * su + n[1] * sn]
    const poly = [...P(3.4, -4.4), ...P(3.4, 4.4), ...P(-3.4, 4.4), ...P(-3.4, -4.4)]
    l.poly(poly, steel[1])
    const mid2 = P(0, 0)
    l.rect(Math.round(mid2[0]) - 1, Math.round(mid2[1]) - 1, 2, 2, steel[2])
    shadeEdges(l, steel, 1, true)
    const sp = P(-3.4, 0)
    const sp2 = P(-6.4, 0)
    l.line(sp[0], sp[1], sp2[0], sp2[1], steel[2])
  })
  swing(c, 17, R.steel[0])
}
