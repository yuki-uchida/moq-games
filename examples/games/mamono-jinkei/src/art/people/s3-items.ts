/**
 * Stage 3 held items, headgear and torso overlays for the guild rig (registered into rig.ts's tables):
 * falconer gauntlet + perched hawk, crossbow, wind staff, hand bell, feathered cap, kettle hat, hood, wind circlet,
 * quilted gambeson, swirling sash and rope belt.
 */
import { C, R } from '../palette'
import { Raster, ball, outline, shadeEdges, type Ramp } from '../raster'
import {
  HEADGEAR,
  ITEMS,
  OVERLAYS,
  V,
  aimDir,
  bar,
  fillTorso,
  vadd,
  vscale,
  type HeadCtx,
  type ItemCtx,
  type Pt,
  type V3
} from './rig'
import './items'

const pt = (c: ItemCtx, p: V3): Pt => c.cam.px(p)
const along = (hand: V3, d: V3, k: number) => vadd(hand, vscale(d, k))
const round = (p: Pt): Pt => [Math.round(p[0]), Math.round(p[1])]

/** Pale wind-green cloth: white highlight, lime base, soft sage shade. */
export const PALE_GREEN: Ramp = [R.paper[0], R.jobGreen[0], R.sludge[1], R.sludge[2], R.sludge[3]]
/** Padded blue-grey gambeson cloth. */
export const GAMBESON: Ramp = [R.clothNavy[0], R.clothNavy[0], R.clothNavy[1], R.clothNavy[2], R.clothNavy[3]]

function headPixels(h: HeadCtx, l: Raster, test: (dx: number, dy: number) => boolean, c: number) {
  for (let y = h.cy - 20; y <= h.cy + 14; y++)
    for (let x = h.cx - 14; x <= h.cx + 14; x++) if (test(x + 0.5 - h.cx, y + 0.5 - h.cy)) l.set(x, y, c)
}

// ---------------------------------------------------------------------------------------------------------
// Falconer: gauntlet with a perched hawk (state.glow: 0 gone, 1 perched, 1.6 wings flared)

const HAWK = R.hairBrown

/** A small perched hawk centred on (x, y) = its feet; `view` is the rig view, `flare` spreads its wings. */
function perchedHawk(l: Raster, x: number, y: number, view: 'down' | 'up' | 'side', flare: boolean) {
  const bodyY = y - 5
  if (flare) {
    // Wings thrown open: two feathered fans.
    for (const s of [-1, 1]) {
      const wx = view === 'side' ? x - 1 + (s > 0 ? 2 : -2) : x + s * 3
      l.poly(
        [wx, bodyY - 1, wx + s * 8, bodyY - 8, wx + s * 10, bodyY - 3, wx + s * 8, bodyY + 1, wx + s * 3, bodyY + 3],
        HAWK[2]
      )
      l.poly([wx, bodyY - 1, wx + s * 7, bodyY - 7, wx + s * 6, bodyY - 1], HAWK[1])
      l.set(wx + s * 8, bodyY - 5, HAWK[0])
      l.set(wx + s * 9, bodyY - 3, HAWK[3])
      l.set(wx + s * 7, bodyY - 2, HAWK[3])
    }
  }
  if (view === 'side') {
    // Tail pointing back-down, body leaning forward, hooked beak forward.
    l.poly([x - 2, bodyY + 1, x - 7, bodyY + 6, x - 5, bodyY + 7, x, bodyY + 4], HAWK[2])
    l.set(x - 6, bodyY + 6, HAWK[3])
    l.ellipse(x, bodyY, 3.6, 4.6, HAWK[1])
    l.ellipse(x + 1.2, bodyY + 0.6, 2, 3.2, R.wolfCream[1])
    l.set(x + 1, bodyY - 1, R.wolfCream[0])
    if (!flare) {
      l.ellipse(x - 1.4, bodyY - 0.2, 1.8, 3.2, HAWK[2])
      l.set(x - 2, bodyY - 2, HAWK[1])
      l.set(x - 1, bodyY + 2, HAWK[3])
    }
    l.ellipse(x + 2.4, bodyY - 5, 2.5, 2.4, HAWK[1])
    l.set(x + 1, bodyY - 6, HAWK[0])
    l.set(x + 4, bodyY - 5, R.beak[1])
    l.set(x + 5, bodyY - 5, R.beak[1])
    l.set(x + 5, bodyY - 4, R.beak[2])
    l.set(x + 3, bodyY - 6, R.beak[0])
    l.set(x + 3, bodyY - 5.2, C.black)
    l.set(x - 1, y - 1, R.beak[2])
    l.set(x + 1, y - 1, R.beak[2])
  } else if (view === 'down') {
    l.ellipse(x, bodyY, 4.4, 4.8, HAWK[1])
    l.ellipse(x, bodyY + 1, 2.6, 3.6, R.wolfCream[1])
    l.set(x - 1, bodyY, R.wolfCream[0])
    for (const dy of [1, 3]) {
      l.set(x - 1, bodyY + dy, HAWK[2])
      l.set(x + 1, bodyY + dy + 1, HAWK[2])
    }
    l.ellipse(x, bodyY - 4.4, 2.6, 2.5, HAWK[1])
    l.set(x - 1, bodyY - 5, R.beak[0])
    l.set(x + 1, bodyY - 5, R.beak[0])
    l.set(x - 1, bodyY - 5, C.black)
    l.set(x + 1, bodyY - 5, C.black)
    l.set(x, bodyY - 3.4, R.beak[1])
    l.set(x, bodyY - 2.4, R.beak[2])
    l.set(x - 2, y - 1, R.beak[2])
    l.set(x + 2, y - 1, R.beak[2])
  } else {
    l.poly([x - 2, bodyY + 2, x + 2, bodyY + 2, x + 3, bodyY + 7, x - 3, bodyY + 7], HAWK[2])
    l.set(x - 1, bodyY + 6, HAWK[3])
    l.set(x + 1, bodyY + 5, HAWK[3])
    l.ellipse(x, bodyY, 4.2, 4.8, HAWK[1])
    l.ellipse(x, bodyY - 4.4, 2.4, 2.2, HAWK[2])
    l.set(x - 1, bodyY - 1, HAWK[0])
    l.set(x - 2, bodyY, HAWK[0])
    l.set(x + 2, bodyY + 1, HAWK[2])
    l.set(x, bodyY + 2, HAWK[3])
  }
}

ITEMS.s3gauntlet = (c) => {
  const d = aimDir(c.state.aim)
  const lea = c.spec.a
  const trim = c.spec.trim ?? R.gold
  const a = pt(c, along(c.hand, d, -5.5))
  const b = pt(c, along(c.hand, d, 1.5))
  c.paint.add(c.depth, (l) => {
    bar(l, a, b, 6, lea[1])
    shadeEdges(l, lea, 1, true)
    // Flared cuff band, stitching and two rivets.
    const bx = Math.round(b[0])
    const by = Math.round(b[1])
    const ax = Math.round(a[0])
    const ay = Math.round(a[1])
    l.line(ax, ay - 2, ax, ay + 2, lea[3])
    l.set((ax + bx) >> 1, (ay + by) / 2 - 1, trim[1])
    l.set((ax + bx) >> 1, (ay + by) / 2 + 1, trim[2])
    l.set(bx - 1, by - 2, trim[0])
  })
  const g = c.state.glow ?? 0
  if (g > 0) {
    const top = pt(c, along(c.hand, d, -1.5))
    c.paint.add(
      c.depth + 0.1,
      (l) => perchedHawk(l, Math.round(top[0]), Math.round(top[1]) - 2, c.cam.view, g > 1.3),
      true
    )
  }
}

// ---------------------------------------------------------------------------------------------------------
// Crossbow

ITEMS.s3crossbow = (c) => {
  const d = aimDir(c.state.aim)
  const steel = c.spec.a
  const wood = c.spec.b ?? R.wood
  const cc: V3 = V(c.hand.f, c.hand.r * 0.3, c.hand.u)
  const rear = pt(c, along(cc, d, -8))
  const front = pt(c, along(cc, d, 15))
  const prod = along(cc, d, 11)
  const loaded = (c.state.glow ?? 0) > 0.5
  const cocked = (c.state.draw ?? 0) > 0.5
  // Limbs of the prod (steel bow), perpendicular to the stock on the right axis.
  const side = c.cam.view === 'side'
  const span = side ? 0 : 12
  const lift = side ? 6 : 0
  const back = cocked ? -4.5 : -2
  const tipR = pt(c, vadd(along(prod, d, back - (side ? 3 : 0)), V(0, span, lift)))
  const tipL = pt(c, vadd(along(prod, d, back - (side ? 3 : 0)), V(0, -span, -lift)))
  const mid = pt(c, prod)
  c.paint.add(c.depth, (l) => {
    // Stock: a heavy wooden bar, thicker at the rear, with a steel cheek plate.
    bar(l, rear, front, 5, wood[1])
    shadeEdges(l, wood, 1, true)
  })
  c.paint.add(c.depth + 0.01, (l) => {
    bar(l, tipL, mid, 4, steel[1])
    bar(l, mid, tipR, 4, steel[1])
    shadeEdges(l, steel, 1, true)
    // Stirrup ring at the front.
    const fx = Math.round(front[0])
    const fy = Math.round(front[1])
    l.set(fx, fy, steel[3])
  })
  c.paint.add(
    c.depth + 0.02,
    (l) => {
      // Bowstring: tips to the nut (drawn back when cocked) and the bolt along the groove.
      const nut = pt(c, along(cc, d, cocked ? 3 : 8))
      l.line(tipL[0], tipL[1], nut[0], nut[1], R.paper[2])
      l.line(nut[0], nut[1], tipR[0], tipR[1], R.paper[2])
      if (loaded) {
        const b0 = round(pt(c, along(vadd(cc, V(0, 0, 1.5)), d, 3)))
        const b1 = round(pt(c, along(vadd(cc, V(0, 0, 1.5)), d, 14)))
        l.line(b0[0], b0[1], b1[0], b1[1], R.steel[0])
        l.set(b1[0], b1[1], R.paper[0])
        l.set(b0[0], b0[1], R.jobRed[1])
      }
    },
    false
  )
}

// ---------------------------------------------------------------------------------------------------------
// Wind staff (state.glow 0..: wind swirl around the head; >=1.2 a forward gust with swirl lines)

const WIND = [R.paper[0], R.jobGreen[0], R.sky[1], R.sky[2]] as const

ITEMS.s3windstaff = (c) => {
  const d = aimDir(c.state.aim)
  const wood = c.spec.a
  const k = c.state.draw ?? 1
  const a = pt(c, along(c.hand, d, -10 * k))
  const t = pt(c, along(c.hand, d, 26 * k))
  const head = round(pt(c, along(c.hand, d, 30 * k)))
  const flow = c.pose.flow
  c.paint.add(c.depth, (l) => {
    bar(l, a, t, 2, wood[1])
    shadeEdges(l, wood, 1, true)
    // Grip wraps.
    for (let k = -2; k <= 2; k += 2) {
      const p = round(pt(c, along(c.hand, d, k)))
      l.set(p[0], p[1], R.clothWhite[2])
    }
  })
  c.paint.add(c.depth + 0.05, (l) => {
    // A gold ring crowning the shaft with a second small ring through it, and feathers streaming back.
    const [hx, hy] = head
    l.ring(hx + 0.5, hy - 0.5, 3, 4.7, R.gold[1])
    l.ring(hx + 0.5, hy - 0.5, 3, 3.8, R.gold[2], 0.3, 2.6)
    l.set(hx - 3, hy - 3, R.gold[0])
    l.set(hx - 2, hy - 4, R.gold[0])
    const drift = Math.round(flow)
    const feathers: [number, number, Ramp][] = [
      [-3, 3, R.paper],
      [-1, 5, PALE_GREEN],
      [1, 3, R.paper]
    ]
    feathers.forEach(([dx, len, ramp], i) => {
      const x0 = hx + dx - 3
      const y0 = hy + 4 + i
      l.poly([x0, y0, x0 + 3, y0 + 1, x0 + 4 + drift, y0 + len + 3, x0 + 1 + drift, y0 + len + 4], ramp[1])
      l.line(x0 + 1, y0, x0 + 2 + drift, y0 + len + 3, ramp[2])
      l.set(x0 + 1, y0, ramp[0])
    })
  })
  const g = c.state.glow ?? 0
  if (g > 0.2) {
    c.paint.add(
      c.depth + 0.3,
      (l) => {
        const [hx, hy] = head
        const n = g >= 1.2 ? 3 : 2
        // Small orbiting swirls around the head.
        for (let i = 0; i < n; i++) {
          const r = 6 + i * 2.6
          const a0 = i * 2.1 + g * 1.4
          l.ring(hx + 0.5, hy - 0.5, r - 0.6, r + 0.4, WIND[i % 2 ? 1 : 0], a0, a0 + 2.1)
        }
      },
      false
    )
  }
  if (g >= 1.2) {
    // Sweeping gust: swirl lines streaming forward from the head.
    const v = c.cam.view
    const fx = v === 'side' ? 1 : 0
    const fy = v === 'side' ? 0 : v === 'down' ? 1 : -1
    c.paint.add(
      c.depth + 0.4,
      (l) => {
        const [hx, hy] = head
        for (let k = 0; k < 3; k++) {
          const amp = 3 + k * 2.2
          const ph = k * 1.9 + g * 2
          let prev: Pt | undefined
          for (let i = 0; i <= 26; i++) {
            const tt = i / 26
            const run = 4 + tt * (14 + k * 2)
            const sw = Math.sin(tt * Math.PI * 2.4 + ph) * amp * (0.4 + tt)
            const x = hx + fx * run + -fy * sw
            const y = hy + fy * run + fx * sw + (k - 1) * 4 * (v === 'side' ? 1 : 0)
            const xx = v === 'side' ? x : x + (k - 1) * 4
            if (prev && i % 7 !== 6) l.line(prev[0], prev[1], xx, y, k === 0 ? C.white : k === 1 ? WIND[1] : WIND[2])
            prev = [xx, y]
          }
        }
      },
      false
    )
  }
}

// ---------------------------------------------------------------------------------------------------------
// Hand bell (state.glow: ring glow 0..2)

ITEMS.s3bell = (c) => {
  const d = aimDir(c.state.aim)
  const gold = c.spec.a
  const base = along(c.hand, d, 1)
  const mouth = along(c.hand, d, 13)
  const a = pt(c, base)
  const b = pt(c, mouth)
  const hx = Math.round(pt(c, c.hand)[0])
  const hy = Math.round(pt(c, c.hand)[1])
  const g = c.state.glow ?? 0
  c.paint.add(
    c.depth,
    (l) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 4.5) {
        ball(l, Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), 5.5, 5, gold)
        l.set(Math.round(b[0]), Math.round(b[1]), C.black)
        return
      }
      // The bell is drawn upright (handle at the centre, mouth down) and turned to the item axis.
      const spr = new Raster(40, 40)
      const L = Math.round(len)
      for (let y = 0; y <= L; y++) {
        const t = y / L
        const half =
          t < 0.12
            ? 1.2
            : t < 0.62
              ? 1.6 + 4.6 * Math.sin(((t - 0.12) / 0.5) * 1.35)
              : 5.9 + ((t - 0.62) / 0.38) ** 1.6 * 1.9
        for (let x = -8; x <= 8; x++) {
          const n = x / (half + 0.01)
          if (Math.abs(n) > 1) continue
          const lip = t > 0.86
          const idx = n < -0.5 ? 0 : n < 0.25 ? 1 : n < 0.7 ? 2 : 3
          spr.set(20 + x, 20 + y, lip && idx === 1 ? gold[2] : gold[idx])
        }
      }
      // Rim band, clapper, and the dark inside of the mouth.
      for (let x = -8; x <= 8; x++) if (spr.get(20 + x, 20 + L)) spr.set(20 + x, 20 + L, gold[3])
      spr.rect(19, 20 + L + 1, 2, 2, R.leather[2])
      spr.rect(19, 18, 2, 2, gold[2])
      spr.set(19, 18, gold[0])
      outline(spr)
      const turned = spr.rotate(Math.atan2(-(b[0] - a[0]) / len, (b[1] - a[1]) / len))
      l.blit(turned, Math.round(a[0]) - 20, Math.round(a[1]) - 20)
    },
    false
  )
  if (g > 0.65) {
    c.paint.add(
      c.depth + 0.2,
      (l) => {
        // Golden ring of sound/light around the bell, wider with `glow`.
        const cx = (a[0] + b[0]) / 2
        const cy = (a[1] + b[1]) / 2
        const r0 = 8 + g * 4
        l.ring(cx, cy, r0 - 1.2, r0, R.holy[1])
        l.ring(cx, cy, r0 - 0.4, r0 + 0.8, R.holy[0], -2.6, -0.5)
        l.ring(cx, cy, r0 + 3, r0 + 3.8, R.holy[2], 0.4, 2.4)
        const n = g > 1.2 ? 6 : 4
        for (let i = 0; i < n; i++) {
          const ang = i * 2.1 + 0.4
          l.set(cx + Math.cos(ang) * (r0 + 5), cy + Math.sin(ang) * (r0 + 5), i % 2 ? R.holy[0] : C.glow)
        }
      },
      false
    )
  }
  void hx
  void hy
}

// ---------------------------------------------------------------------------------------------------------
// Headgear

HEADGEAR.s3feathercap = (h) => {
  HEADGEAR.cap!(h)
  const { trim } = h.gear
  const k = h.pose.flow
  h.paint.add(h.depth + 0.02, (l) => {
    // A long red-and-white pheasant feather tucked in the band.
    const fx = h.view === 'side' ? h.cx - 4 : h.cx + (h.view === 'up' ? -6 : 6)
    const fy = h.cy - 7
    const dir = h.view === 'side' ? -1 : h.view === 'up' ? -1 : 1
    l.poly(
      [
        fx,
        fy,
        fx + dir * 2,
        fy - 1,
        fx + dir * 6 + k,
        fy - 9,
        fx + dir * 9 + k,
        fy - 11,
        fx + dir * 8 + k,
        fy - 5,
        fx + dir * 4,
        fy + 1
      ],
      R.jobRed[1]
    )
    l.line(fx + dir, fy, fx + dir * 8 + k, fy - 10, R.paper[1])
    l.set(fx + dir * 3, fy - 3, R.jobRed[0])
    l.set(fx + dir * 5, fy - 5, R.jobRed[2])
    if (trim) l.set(fx, fy, trim[1])
  })
}

HEADGEAR.s3kettle = (h) => {
  const { ramp, trim } = h.gear
  const side = h.view === 'side'
  h.paint.add(h.depth, (l) => {
    const dome = (dx: number, dy: number) => (dx / 8.6) ** 2 + ((dy + 6.2) / 6.4) ** 2 <= 1 && dy < -3.4
    headPixels(h, l, dome, ramp[1])
    shadeEdges(l, ramp, 1, true)
    l.paint(h.cx - 3, h.cy - 10, ramp[0])
    l.paint(h.cx - 4, h.cy - 9, ramp[0])
    if (trim) l.rect(h.cx - 1, h.cy - 13, 2, 2, trim[1])
    // Rivets around the dome.
    if (!side) {
      l.paint(h.cx - 5, h.cy - 7, ramp[3])
      l.paint(h.cx + 4, h.cy - 7, ramp[3])
    }
  })
  h.paint.add(h.depth + 0.01, (l) => {
    // Wide brim sitting above the brows.
    const rx = side ? 11.4 : 12.4
    const ry = side ? 2.8 : 3.4
    headPixels(h, l, (dx, dy) => (dx / rx) ** 2 + ((dy + 5.2) / ry) ** 2 <= 1, ramp[1])
    shadeEdges(l, ramp, 1, true)
    for (let x = h.cx - 13; x < h.cx + 13; x++)
      if (l.get(x, h.cy - 3) === ramp[1] && !l.get(x, h.cy - 2)) l.paint(x, h.cy - 3, ramp[2])
  })
}

HEADGEAR.s3hood = (h) => {
  const { ramp, trim } = h.gear
  const v = h.view
  h.paint.add(h.depth, (l) => {
    const big = (dx: number, dy: number) => (dx / 10.4) ** 2 + ((dy + 1.2) / 9.8) ** 2 <= 1
    headPixels(
      h,
      l,
      (dx, dy) => {
        if (v === 'up') return (big(dx, dy) || (dy > 0 && dy < 8 && Math.abs(dx) < 9.4 - dy * 0.3)) && true
        if (v === 'down') {
          const face = (dx / 6.3) ** 2 + ((dy - 2.2) / 6.2) ** 2 <= 1 && dy > -3.8
          const drape = dy >= 0 && dy < 9 && Math.abs(dx) > 5.2 && Math.abs(dx) < 10.6 - Math.max(0, dy - 5) * 0.8
          return (big(dx, dy) || drape) && !face
        }
        const face = dx > 1.2 && dy > -3.6 && dx < 9.4
        const drape = dy >= 0 && dy < 9 && dx < 2 && dx > -10.2 + Math.max(0, dy - 5)
        return (big(dx, dy) || drape) && !face
      },
      ramp[1]
    )
    shadeEdges(l, ramp, 1, true)
    // Peak of the cowl and fold lines.
    if (v !== 'side') l.rect(h.cx - 1, h.cy - 12, 2, 2, ramp[1])
    else l.rect(h.cx - 5, h.cy - 12, 3, 2, ramp[1])
    for (let y = h.cy - 9; y < h.cy - 3; y += 2) l.paint(h.cx + (v === 'side' ? -3 : 1), y, ramp[3])
    if (v === 'down') {
      l.paint(h.cx - 9, h.cy - 3, ramp[0])
      l.paint(h.cx - 8, h.cy + 2, ramp[2])
      l.paint(h.cx + 8, h.cy + 3, ramp[3])
    }
    if (trim) {
      // Pale hem line where the hood frames the face.
      if (v === 'down') {
        for (let y = h.cy - 2; y < h.cy + 7; y++) {
          l.paint(h.cx - 7, y, trim[1])
          l.paint(h.cx + 6, y, trim[2])
        }
      }
    }
  })
}

HEADGEAR.s3windcirclet = (h) => {
  HEADGEAR.headband!(h)
  const { trim } = h.gear
  const k = h.pose.flow
  h.paint.add(h.depth + 0.02, (l) => {
    // A wing-shaped feather clipped over the ear that streams back with the wind.
    const dir = h.view === 'side' ? -1 : h.view === 'up' ? -1 : 1
    const fx = h.view === 'side' ? h.cx - 5 : h.cx + dir * 8
    const fy = h.cy - 5
    l.poly(
      [
        fx,
        fy,
        fx + dir * 3,
        fy - 2,
        fx + dir * 8 + k,
        fy - 4,
        fx + dir * 11 + k * 2,
        fy - 2,
        fx + dir * 8 + k,
        fy + 1,
        fx + dir * 4,
        fy + 2
      ],
      R.paper[1]
    )
    l.line(fx, fy, fx + dir * 10 + k, fy - 2, PALE_GREEN[2])
    l.set(fx + dir * 4, fy - 2, R.paper[0])
    if (trim) l.set(fx, fy, trim[1])
  })
}

// ---------------------------------------------------------------------------------------------------------
// Torso overlays

OVERLAYS.s3quilt = ({ paint, T, ov, view }) => {
  // Quilted gambeson: diamond stitching across the torso and a skirt flaring over the thighs.
  paint.add(0.1, (l) => {
    const r = ov.ramp
    fillTorso(l, T, T.sy, T.hy + 4, r[1], (dx, y) => {
      if (y > T.hy - 1) return Math.abs(dx) < T.wh + 0.8
      return !(y <= T.sy && Math.abs(dx) > T.ws - 1.5)
    })
    shadeEdges(l, r, 2, true)
    for (let y = T.sy + 1; y < T.hy + 4; y++)
      for (let x = Math.round(T.sx - T.ws - 1); x < T.sx + T.ws + 1; x++)
        if (l.get(x, y) === r[1] && ((x + y) % 5 === 0 || (x - y + 100) % 5 === 0)) l.set(x, y, r[2])
    // Neck collar of the padded coat and a centre seam.
    if (view === 'down') {
      l.rect(T.sx - 3, T.sy - 1, 6, 2, r[1])
      l.set(T.sx - 3, T.sy - 1, r[0])
      for (let y = T.sy + 2; y < T.hy + 3; y++) l.paint(T.sx, y, r[3])
    }
    if (ov.trim) {
      // Leather strap belt over the quilting.
      fillTorso(l, T, T.hy - 2, T.hy, ov.trim[1], undefined, 0)
    }
  })
}

OVERLAYS.s3sash = ({ paint, T, view, ov, pose }) => {
  const k = pose.flow
  paint.add(0.25, (l) => {
    const r = ov.ramp
    const k = pose.flow
    if (view === 'down') {
      // Diagonal sash over the chest + a waist band, knotted at the hip with two swirling tails.
      for (let i = 0; i < 18; i++) {
        const x = T.sx - T.ws + 1 + i * 0.75
        const y = T.sy + 1 + i * 0.95
        l.rect(Math.round(x), Math.round(y), 3, 2, r[1])
      }
      fillTorso(l, T, T.hy - 3, T.hy - 0, r[1])
    } else if (view === 'up') {
      fillTorso(l, T, T.hy - 3, T.hy - 0, r[1])
    } else {
      fillTorso(l, T, T.hy - 3, T.hy - 0, r[1])
      for (let i = 0; i < 5; i++) l.rect(Math.round(T.sx - 1 + i * 0.4), Math.round(T.sy + 1 + i), 3, 2, r[1])
    }
    shadeEdges(l, r, 1, true)
  })
  paint.add(0.4, (l) => {
    // Two trailing tails that swirl with the flow.
    const r = ov.ramp
    const kx = view === 'side' ? T.hx - 3 : T.hx + 3
    const ky = T.hy - 2
    for (let t = 0; t < 2; t++) {
      let px = kx
      let py = ky
      const sgn = t ? 1 : -1
      for (let i = 0; i < 9; i++) {
        const wob = Math.sin(i * 0.45 + t * 2 + k * 0.9) * (0.2 + i * 0.08)
        if (view === 'side') {
          px = kx - i * 0.9
          py = ky + 1 + i * 0.28 + wob
        } else {
          px = kx + sgn * (1 + i * 0.22) + wob * 0.9
          py = ky + 1 + i * 0.8
        }
        l.rect(Math.round(px), Math.round(py), i < 6 ? 3 : 2, 2, i % 5 === 4 ? r[2] : r[1])
      }
      l.set(Math.round(px), Math.round(py) + 1, r[0])
    }
    shadeEdges(l, r, 1, true)
    l.rect(kx - 1, ky - 1, 3, 3, r[2])
    l.set(kx - 1, ky - 1, r[0])
  })
}

OVERLAYS.s3rope = ({ paint, T, view, ov }) => {
  paint.add(0.3, (l) => {
    const r = ov.ramp
    const y = T.hy - 3
    for (let yy = y; yy < y + 2; yy++) {
      const { cx, hw } = { cx: T.hx, hw: T.wh }
      for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) l.set(x, yy, (x + yy) % 2 ? r[1] : r[2])
    }
    // Knot and a dangling end with a tassel.
    const kx = view === 'side' ? Math.round(T.hx) + 2 : Math.round(T.hx) + 3
    if (view !== 'up') {
      l.rect(kx - 1, y - 1, 3, 3, r[1])
      l.set(kx - 1, y - 1, r[0])
      for (let i = 0; i < 9; i++) l.set(kx + (i > 5 ? 1 : 0), y + 2 + i, i % 2 ? r[1] : r[2])
      l.rect(kx, y + 10, 3, 2, r[2])
      l.set(kx, y + 10, r[1])
    }
  })
}
