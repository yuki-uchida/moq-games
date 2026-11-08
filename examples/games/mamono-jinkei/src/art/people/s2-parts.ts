/**
 * Stage 2 guild parts, registered into the shared rig tables: dagger, flask, snare pole, round shield, hood with
 * scarf mask, wide-brim hat, goggles, city-guard kettle helm, rat cage, coat/patches/stains/flask-belt overlays.
 */
import { C, R } from '../palette'
import { Raster, ball, shadeEdges, type Ramp } from '../raster'
import { blade, plateMapper } from './items'
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
  inSkull,
  vadd,
  vscale,
  type HeadCtx,
  type ItemCtx,
  type Pt,
  type V3
} from './rig'

HEADGEAR_HIDES_HAIR.add('hood')
HEADGEAR_HIDES_HAIR.add('cityhelm')

const pt = (c: ItemCtx, p: V3): Pt => c.cam.px(p)
const along = (hand: V3, d: V3, k: number) => vadd(hand, vscale(d, k))

function px(h: HeadCtx, l: Raster, test: (dx: number, dy: number) => boolean, c: number) {
  for (let y = h.cy - 22; y <= h.cy + 12; y++)
    for (let x = h.cx - 16; x <= h.cx + 16; x++) if (test(x + 0.5 - h.cx, y + 0.5 - h.cy)) l.set(x, y, c)
}

// ---------------------------------------------------------------------------------------------------------
// Items

ITEMS.dagger = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, 1))
  const tip = pt(c, along(c.hand, d, 8.5))
  const back = pt(c, along(c.hand, d, -2.5))
  c.paint.add(c.depth, (l) => {
    bar(l, back, a, 2, R.clothBlack[2])
    l.set(Math.round(back[0]), Math.round(back[1]), R.gold[2])
    const dx = tip[0] - a[0]
    const dy = tip[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    const nx = -dy / L
    const ny = dx / L
    for (const s of [-2, -1, 0, 1, 2]) l.set(a[0] + nx * s, a[1] + ny * s, s ? R.leather[2] : R.leather[1])
    if (L > 3) blade(l, [a[0] + (dx / L) * 1.5, a[1] + (dy / L) * 1.5], tip, c.spec.a, 2)
    else l.rect(Math.round(tip[0]) - 1, Math.round(tip[1]) - 1, 2, 2, c.spec.a[1])
  })
  const s = c.state.smear
  if (s) {
    c.paint.add(
      c.depth + 0.3,
      (l) => {
        let prev: Pt | undefined
        for (let i = 6; i <= 12; i++) {
          const t = i / 12
          const aim = { p: s.p + (c.state.aim.p - s.p) * t, y: 0 }
          const p = pt(c, along(c.hand, aimDir(aim), 9.5))
          if (prev) bar(l, prev, p, i > 9 ? 2 : 1, C.white)
          prev = p
        }
      },
      false
    )
  }
}

ITEMS.flask = (c) => {
  const d = aimDir(c.state.aim)
  const body = pt(c, along(c.hand, d, 3.4))
  const neck = pt(c, along(c.hand, d, 7.2))
  const liquid = c.spec.b ?? R.poison
  const glow = c.state.glow ?? 0
  c.paint.add(c.depth, (l) => {
    const bx = Math.round(body[0])
    const by = Math.round(body[1])
    l.ellipse(bx, by, 4.2, 4.2, R.paper[2])
    l.ellipse(bx, by + 0.6, 3.2, 3.2, liquid[1])
    l.rect(bx - 2, by + 1, 5, 2, liquid[2])
    l.set(bx - 2, by - 1, liquid[0])
    l.set(bx - 3, by - 2, C.white)
    bar(l, [bx, by - 3], neck, 2, R.paper[1])
    l.set(Math.round(neck[0]), Math.round(neck[1]) - 1, R.leather[1])
    l.set(Math.round(neck[0]) + 1, Math.round(neck[1]) - 1, R.leather[2])
    // bubbles rise when shaken
    if (glow > 0.4) {
      const k = Math.round(c.hand.f * 3 + c.hand.u)
      l.set(neck[0] - 1, neck[1] - 3 - (k % 2), liquid[0])
      l.set(neck[0] + 2, neck[1] - 5 + (k % 3), liquid[1])
      l.set(neck[0], neck[1] - 6, C.white)
    }
  })
}

ITEMS.netpole = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -7))
  const t = pt(c, along(c.hand, d, 15))
  const wood = c.spec.a
  c.paint.add(c.depth, (l) => {
    bar(l, a, t, 2, wood[1])
    shadeEdges(l, wood, 1, false)
    // snare hoop with a net, perpendicular to the view of the pole
    const hc = pt(c, along(c.hand, d, 21))
    const hx = Math.round(hc[0])
    const hy = Math.round(hc[1])
    const rx = 7.2
    const ry = 6
    l.ellipse(hx, hy, rx, ry, R.leather[2])
    for (let y = hy - 6; y <= hy + 6; y++)
      for (let x = hx - 7; x <= hx + 7; x++) {
        const nx = (x + 0.5 - hx) / (rx - 1.2)
        const ny = (y + 0.5 - hy) / (ry - 1.2)
        if (nx * nx + ny * ny >= 1) continue
        // net mesh
        l.set(x, y, (x + y) % 3 === 0 || (x - y) % 4 === 0 ? R.paper[2] : 0)
      }
    // snare cord tail
    l.rect(Math.round(t[0]) - 1, Math.round(t[1]), 2, 2, R.leather[1])
  })
  const s = c.state.smear
  if (s) {
    c.paint.add(
      c.depth + 0.3,
      (l) => {
        let prev: Pt | undefined
        for (let i = 4; i <= 12; i++) {
          const t2 = i / 12
          const aim = { p: s.p + (c.state.aim.p - s.p) * t2, y: 0 }
          const p = pt(c, along(c.hand, aimDir(aim), 26))
          if (prev) bar(l, prev, p, i > 9 ? 2 : 1, C.white)
          prev = p
        }
      },
      false
    )
  }
}

ITEMS.longspear = (c) => {
  const d = aimDir(c.state.aim)
  const a = pt(c, along(c.hand, d, -9))
  const t = pt(c, along(c.hand, d, 14))
  const wood = c.spec.b ?? R.wood
  c.paint.add(c.depth, (l) => {
    bar(l, a, t, 2, wood[1])
    blade(l, t, pt(c, along(c.hand, d, 21)), c.spec.a, 3)
    // tassel under the head
    const k = pt(c, along(c.hand, d, 13))
    l.rect(Math.round(k[0]) - 1, Math.round(k[1]), 2, 2, R.jobRed[1])
  })
}

ITEMS.round = (c) => {
  const turn = c.state.turn ?? 0
  const center = vadd(c.hand, V(3, 0, 1))
  const { map, facing, width } = plateMapper(c, center, 17, 17, turn)
  const field = c.spec.a
  const trim = c.spec.trim ?? R.gold
  const ring = (k: number): number[] =>
    Array.from({ length: 20 }, (_, i) =>
      map(Math.cos((i / 20) * Math.PI * 2) * k, Math.sin((i / 20) * Math.PI * 2) * k)
    ).flat()
  c.paint.add(c.depth + 0.15, (l) => {
    l.poly(ring(1), R.steel[2])
    l.poly(ring(0.86), facing > 0 ? field[1] : R.wood[2])
    if (width < 4) bar(l, map(0, -1), map(0, 1), 3, R.steel[1])
    else if (facing > 0) {
      const tl = map(-0.7, -0.7)
      l.line(tl[0], tl[1] + 1, map(0.2, -0.95)[0], map(0.2, -0.95)[1], R.steel[0])
      // planks / quarters in the field and a boss
      const t = map(0, -0.85)
      const b = map(0, 0.85)
      const le = map(-0.85, 0)
      const ri = map(0.85, 0)
      l.line(t[0], t[1], b[0], b[1], field[2])
      l.line(le[0], le[1], ri[0], ri[1], field[2])
      const o = map(0, 0)
      l.ellipse(o[0], o[1], 3, 3, trim[1])
      l.set(o[0] - 1, o[1] - 1, trim[0])
      l.set(o[0] + 1, o[1] + 1, trim[2])
    } else {
      const a = map(-0.3, -0.5)
      const b = map(-0.3, 0.5)
      l.line(a[0], a[1], b[0], b[1], R.leather[1])
    }
  })
}

// ---------------------------------------------------------------------------------------------------------
// Headgear

HEADGEAR.hood = (h) => {
  const { ramp, trim } = h.gear
  const scarf = trim ?? R.clothPurple
  const down = h.view === 'down'
  const side = h.view === 'side'
  h.paint.add(h.depth, (l) => {
    px(
      h,
      l,
      (dx, dy) => {
        const dome = (dx / 10) ** 2 + ((dy + 1) / 9.6) ** 2 <= 1
        const jaw =
          Math.abs(dx) > 6.4 && Math.abs(dx) < 10.2 && dy < 6 && (dx / 10) ** 2 + ((dy + 1) / 9.6) ** 2 <= 1.15
        if (h.view === 'up') return dome && dy < 7
        if (down) return (dome || jaw) && !(Math.abs(dx) < 6.2 && dy > -3.2 && dy < 2)
        return (
          (dome && !(dx > 2.4 && dy > -3.2 && dy < 2) && (dx < 4 || dy < 0)) ||
          (dx < -1 && dx > -9.5 && dy < 6.5 && dome)
        )
      },
      ramp[1]
    )
    if (side) {
      // pointed hood tail falling behind
      l.poly([h.cx - 8, h.cy - 4, h.cx - 15 - Math.round(h.pose.flow), h.cy + 3, h.cx - 7, h.cy + 5], ramp[1])
    }
    shadeEdges(l, ramp, 1, true)
    // overhang shadow line at the brow
    if (down) for (let x = h.cx - 6; x < h.cx + 6; x++) l.paint(x, h.cy - 4, ramp[2])
    if (side) for (let x = h.cx + 2; x < h.cx + 9; x++) l.paint(x, h.cy - 4, ramp[2])
    if (h.view === 'up') for (let y = h.cy - 8; y < h.cy + 6; y++) l.paint(h.cx, y, ramp[2])
  })
  // Scarf mask over the lower face.
  if (h.view !== 'up') {
    h.paint.add(h.depth + 0.01, (l) => {
      px(h, l, (dx, dy) => inSkull(h.view, dx, dy) && dy >= 2 && (side ? dx > -4 : true) && dy < 8.4, scarf[1])
      shadeEdges(l, scarf, 1, true)
      const k = h.pose.flow > 0 ? 1 : 0
      if (side) {
        bar(l, [h.cx - 4, h.cy + 5], [h.cx - 12, h.cy + 8 + k], 3, scarf[1])
        l.set(h.cx - 12, h.cy + 9 + k, scarf[2])
      } else l.rect(h.cx + 5, h.cy + 5, 2, 4 + k, scarf[2])
      l.paint(h.cx - 3, h.cy + 3, scarf[0])
    })
  }
}

HEADGEAR.brim = (h) => {
  const { ramp, trim } = h.gear
  const side = h.view === 'side'
  h.paint.add(h.depth, (l) => {
    // crown
    px(h, l, (dx, dy) => (dx / 8.2) ** 2 + ((dy + 9.4) / 7.4) ** 2 <= 1 && dy < -5, ramp[1])
    shadeEdges(l, ramp, 1, true)
    // band
    if (trim)
      for (let y = h.cy - 8; y < h.cy - 6; y++)
        for (let x = h.cx - 10; x < h.cx + 10; x++) if (l.get(x, y)) l.set(x, y, trim[1])
    l.paint(h.cx + 2, h.cy - 12, ramp[2])
    // patch
    l.rect(h.cx - 4, h.cy - 12, 3, 3, R.clothOchre[1])
    l.set(h.cx - 4, h.cy - 12, R.clothOchre[0])
  })
  h.paint.add(h.depth + 0.01, (l) => {
    px(h, l, (dx, dy) => (dx / (side ? 13 : 13.8)) ** 2 + ((dy + 5) / (side ? 2.8 : 3.6)) ** 2 <= 1, ramp[1])
    shadeEdges(l, ramp, 1, true)
    for (let x = h.cx - 13; x < h.cx + 13; x++)
      if (l.get(x, h.cy - 4) && !l.get(x, h.cy - 3)) l.paint(x, h.cy - 4, ramp[2])
    l.paint(h.cx - 9, h.cy - 5, ramp[0])
  })
}

HEADGEAR.goggles = (h) => {
  const side = h.view === 'side'
  const strap = R.leather
  h.paint.add(h.depth, (l) => {
    px(h, l, (dx, dy) => dy > -6.4 && dy < -4.4 && (dx / 9.2) ** 2 + ((dy + 0.7) / 8.6) ** 2 <= 1, strap[1])
    shadeEdges(l, strap, 1, true)
    if (h.view !== 'up') {
      for (const lx of side ? [1.5] : [-4.4, 4.4]) {
        const x = h.cx + lx
        const y = h.cy - 6
        l.ellipse(x, y, 3.8, 3.8, R.steel[2])
        l.ellipse(x, y, 2.6, 2.6, R.magic[1])
        l.set(x - 1, y - 1, R.magic[0])
        l.set(x, y - 1, C.white)
        l.set(x + 1, y + 1, R.magic[2])
        l.set(x - 3, y - 1, R.steel[0])
      }
    } else {
      l.rect(h.cx - 1, h.cy - 6, 3, 2, R.steel[2])
    }
  })
}

HEADGEAR.cityhelm = (h) => {
  const { ramp, trim } = h.gear
  const side = h.view === 'side'
  h.paint.add(h.depth, (l) => {
    px(
      h,
      l,
      (dx, dy) => {
        const dome = (dx / 9.4) ** 2 + ((dy + 2.4) / 8.4) ** 2 <= 1
        if (h.view === 'up') return dome && dy < 4
        if (side) return dome && (dy < -1.4 || dx < 1.6)
        return dome && dy < -1.4
      },
      ramp[1]
    )
    shadeEdges(l, ramp, 1, true)
    // gold stud and a short plume
    l.rect(h.cx - 1, h.cy - 11, 2, 2, trim ? trim[1] : R.gold[1])
    l.set(h.cx - 1, h.cy - 11, R.gold[0])
    const pl = R.clothNavy
    if (side) l.rect(h.cx - 7, h.cy - 11, 6, 3, pl[1])
    else l.rect(h.cx + 1, h.cy - 14, 3, 4, pl[1])
    l.paint(h.cx - 4, h.cy - 7, ramp[0])
    l.paint(h.cx - 5, h.cy - 6, ramp[0])
  })
  h.paint.add(h.depth + 0.01, (l) => {
    // wide kettle brim
    px(h, l, (dx, dy) => (dx / (side ? 11 : 12)) ** 2 + ((dy + 1.8) / 2.6) ** 2 <= 1, ramp[1])
    shadeEdges(l, ramp, 1, true)
    for (let x = h.cx - 12; x < h.cx + 12; x++) if (l.get(x, h.cy - 1) && !l.get(x, h.cy)) l.paint(x, h.cy - 1, ramp[2])
    l.paint(h.cx - 7, h.cy - 3, ramp[0])
  })
}

// ---------------------------------------------------------------------------------------------------------
// Back items and overlays

BACK_ITEMS.cage = ({ cam, paint, item }) => {
  const up = cam.view === 'up'
  const a = cam.px(V(-6, -7, 15))
  const b = cam.px(V(-9, 7, 37))
  paint.add(up ? 0.3 : -0.8, (l) => {
    const x0 = Math.round(Math.min(a[0], b[0]))
    const x1 = Math.round(Math.max(a[0], b[0])) + (cam.view === 'side' ? 4 : 0)
    const y0 = Math.round(Math.min(a[1], b[1]))
    const y1 = Math.round(Math.max(a[1], b[1]))
    l.rect(x0, y0, x1 - x0, y1 - y0, item.ramp[1])
    // dark interior between bars, with a rat's nose peeking out
    l.rect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4, C.inkWarm)
    for (let x = x0 + 3; x < x1 - 2; x += 3) l.rect(x, y0, 1, y1 - y0, item.ramp[1])
    l.rect(x0, y0 + Math.floor((y1 - y0) / 2), x1 - x0, 1, item.ramp[2])
    l.set(x0 + 4, y0 + 4, R.ratPink[1])
    l.set(x0 + 5, y0 + 4, R.ratPink[1])
    l.set(x0 + 4, y0 + 3, R.paper[0])
    shadeEdges(l, item.ramp, 1, true)
    // rope handle
    l.rect(x0 + 2, y0 - 2, x1 - x0 - 4, 1, item.ramp[3])
  })
  if (cam.view === 'down') {
    paint.add(0.3, (l) => {
      const s0 = cam.px(V(0, 6, 36))
      const s1 = cam.px(V(0, -5, 14))
      bar(l, s0, s1, 2, R.leather[2])
    })
  }
}

OVERLAYS.coat = ({ paint, T, view, ov }) => {
  paint.add(0.15, (l) => {
    const r = ov.ramp
    const top = T.hy - 2
    const hem = 50
    for (let y = top; y < hem; y++) {
      const t = (y - top) / (hem - top)
      const hw = Math.round(T.wh + 1 + t * 2.2)
      const c0 = Math.round(T.hx)
      for (let x = c0 - hw; x < c0 + hw; x++) {
        if (view === 'down' && t > 0.15 && Math.abs(x + 0.5 - c0) < 0.8 + t * 1.4) continue
        if (y >= hem - 1 && (x + c0) % 5 === 0) continue
        l.set(x, y, r[1])
      }
    }
    shadeEdges(l, r, 2, true)
    if (view === 'up') for (let y = top + 2; y < hem - 1; y++) l.paint(T.hx, y, r[2])
  })
  void fillTorso
}

OVERLAYS.patch = ({ paint, T, view, ov }) => {
  paint.add(0.2, (l) => {
    const c = ov.ramp
    const spots: [number, number, number][] =
      view === 'side'
        ? [[Math.round(T.hx) - 1, T.hy + 3, 4]]
        : [
            [Math.round(T.hx) - 5, T.hy + 3, 4],
            [Math.round(T.hx) + 2, T.hy - 4, 3]
          ]
    for (const [x, y, s] of spots) {
      l.rect(x, y, s, s, c[1])
      l.set(x, y, c[0])
      for (let i = 0; i < s; i += 2) {
        l.paint(x + i, y - 1 + s, c[3])
      }
    }
  })
}

OVERLAYS.stains = ({ paint, T, view, ov }) => {
  paint.add(
    0.13,
    (l) => {
      if (view === 'side') return
      const spots: [number, number, Ramp][] = [
        [-3, 4, R.poison],
        [2, 8, R.jobRed],
        [-1, 11, R.clothOchre]
      ]
      for (const [dx, dy, r] of spots) {
        const x = Math.round(T.sx) + dx
        const y = T.sy + dy
        if (l.get(x, y) || true) {
          l.set(x, y, r[2])
          l.set(x + 1, y, r[2])
          l.set(x, y + 1, r[2])
        }
      }
      void ov
    },
    false
  )
}

OVERLAYS.flasks = ({ paint, T, view }) => {
  paint.add(0.3, (l) => {
    const y = T.hy - 7
    const kinds: [Ramp, number][] = [
      [R.poison, -8],
      [R.jobRed, -4],
      [R.magic, 4],
      [R.jobGold, 8]
    ]
    const xs = view === 'side' ? [[R.poison, 1]] : kinds
    for (const [r, dx] of xs as [Ramp, number][]) {
      const x = Math.round(T.hx) + dx
      l.rect(x, y + 2, 3, 4, r[1])
      l.rect(x, y + 2, 1, 2, r[0])
      l.rect(x + 1, y + 5, 2, 1, r[2])
      l.rect(x + 1, y, 1, 2, R.paper[1])
      l.set(x + 1, y - 1, R.leather[1])
    }
    l.rect(Math.round(T.hx) - 10, T.hy - 2, 20, 1, R.leather[2])
  })
}

OVERLAYS.guardtabard = ({ paint, T, view, ov }) => {
  paint.add(0.12, (l) => {
    const r = ov.ramp
    if (view === 'side') {
      fillTorso(l, T, T.sy + 1, T.hy + 6, r[1], (dx) => dx > -1.2)
    } else fillTorso(l, T, T.sy + 1, T.hy + 6, r[1], (dx) => Math.abs(dx) < 4.6)
    shadeEdges(l, r, 1, true)
    if (view === 'down') {
      // golden crossed-sword emblem
      const x = Math.round(T.sx)
      const y = T.sy + 4
      l.line(x - 2, y, x + 1, y + 5, R.gold[1])
      l.line(x + 1, y, x - 2, y + 5, R.gold[1])
      l.set(x - 1, y + 1, R.gold[0])
      for (let xx = Math.round(T.sx - 4); xx < T.sx + 4; xx += 2) l.paint(xx, T.hy + 5, R.gold[2])
    }
  })
}

export { ball }
