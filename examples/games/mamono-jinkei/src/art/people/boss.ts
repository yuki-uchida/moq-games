/**
 * 盾騎士団長ガルド: a 128×128 armoured knight captain drawn natively (never scaled) with the same 3D-lite
 * projection as the guild rig (rig.ts) but its own heavy-plate part drawers. ~100 px tall, feet on (64, 116).
 */
import { BOSS_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, ball, despeckle, shadeEdges, type Ramp } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { Cam, Painter, V, aimDir, bar, ik, pose, vadd, vscale, type Pose, type Pt, type View } from './rig'

const STEEL = R.steel
const GOLD = R.gold
const CAPE = R.clothCrimson
const DARK: Ramp = [STEEL[1], STEEL[2], STEEL[3], STEEL[3], STEEL[4]]

type BossPose = Pose

function renderBoss(view: View, p: BossPose): Raster {
  const cam = new Cam(view, 64, 116, p.tilt, p.at)
  const paint = new Painter(128, 128)
  const hipU = 37 + p.bob - p.crouch
  const shU = hipU + 30 - p.crouch * 0.15
  const side = view === 'side'
  const shR = side ? 7.5 : 20
  const [shx, shy] = cam.px(V(p.lean, p.sway, shU))
  const [hx, hy] = cam.px(V(0, 0, hipU))
  const ws = side ? 16 : 21
  const wh = side ? 13 : 15
  const sy = Math.round(shy) - 2
  const hyy = Math.round(hy)
  const sx = side ? shx + 0.5 : Math.round(shx)
  const hxx = side ? hx + 0.5 : Math.round(hx)
  const rowOf = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - sy) / Math.max(1, hyy - sy)))
    // barrel chest: full at the breastplate, pinched a little at the waist
    const chest = Math.sin(Math.min(1, t * 1.6) * Math.PI) * (side ? 1.5 : 1.5)
    return { cx: sx + (hxx - sx) * t, hw: ws + (wh - ws) * t + chest }
  }
  const fill = (
    l: Raster,
    y0: number,
    y1: number,
    c: number,
    pred?: (dx: number, y: number, hw: number) => boolean
  ) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      const { cx, hw } = rowOf(y + 0.5)
      const h = Math.round(hw)
      for (let x = Math.round(cx) - h; x < Math.round(cx) + h; x++)
        if (!pred || pred(x + 0.5 - cx, y, h)) l.set(x, y, c)
    }
  }

  // ---- cape (behind the body, in front when seen from behind)
  paint.add(view === 'up' ? 0.3 : -2, (l) => {
    const hem = 98 + Math.round(p.at.u * -0) - (p.crouch > 6 ? 6 : 0)
    for (let y = sy + 2; y < hem; y++) {
      const t = (y - sy) / (hem - sy)
      const hw = (side ? 7 : ws + 2) + t * (side ? 5 : 8)
      const shift = p.flow * t * t * (side ? -2.6 : 1.2)
      const c0 = (side ? sx - 10 - t * 2 : sx) + shift
      for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++) {
        if (y > hem - 4 && (x + y) % 5 === 0) continue
        l.set(x, y, CAPE[1])
      }
    }
    shadeEdges(l, CAPE, 2, true)
    // folds
    for (let y = sy + 8; y < hem - 2; y++)
      for (const k of side ? [0] : [-6, 0, 6])
        l.paint(Math.round(sx + k + p.flow * ((y - sy) / (hem - sy)) ** 2) + (y % 7 === 0 ? 1 : 0), y, CAPE[2])
  })

  // ---- legs
  for (const sgn of [1, -1] as const) {
    const foot = sgn === 1 ? p.mainFoot : p.offFoot
    const end0 = V(foot.f, sgn * foot.r * 2.5, foot.u)
    const hip = V(0, sgn * 8, hipU)
    const { mid, end } = ik(hip, end0, 17.5, 17.5, V(1, 0, 0.1))
    const far = side && sgn < 0
    const ramp: Ramp = far ? DARK : STEEL
    const a = cam.px(hip)
    const m = cam.px(mid)
    const e = cam.px(end)
    paint.add(side ? cam.depth(end) - 0.2 : -1, (l) => {
      // cuisse (thigh plate) and a greave that flares into the sabaton
      bar(l, a, m, side ? 13 : 15, ramp[1])
      bar(l, m, e, side ? 10 : 12, ramp[1])
      bar(l, [m[0] + (e[0] - m[0]) * 0.55, m[1] + (e[1] - m[1]) * 0.55], e, side ? 11 : 13, ramp[1])
      shadeEdges(l, ramp, 2, true)
      // greave ridge
      if (!side)
        for (let y = Math.round(m[1]) + 4; y < Math.round(e[1]) - 6; y++)
          l.paint(Math.round(m[0] + ((e[0] - m[0]) * (y - m[1])) / Math.max(1, e[1] - m[1])) - 1, y, ramp[0])
      // knee cop with a fan
      const kx = Math.round(m[0]) + (side ? 4 : 0)
      const ky = Math.round(m[1])
      l.ellipse(kx, ky, 6, 5, GOLD[2])
      l.ellipse(kx, ky - 0.5, 5, 4, GOLD[1])
      l.ellipse(kx - 1, ky - 1.5, 2.6, 2, GOLD[0])
      l.rect(kx - 4, ky + 4, 8, 1, GOLD[2])
      // sabaton: broad, layered steel toe
      const bx = Math.round(e[0])
      const by = Math.round(e[1])
      const toe = side ? 19 : 15
      l.rect(bx - 7, by - 7, 14, 7, DARK[1])
      l.rect(bx - (side ? 7 : 8), by - 4, toe, 5, DARK[1])
      l.rect(bx - 7, by - 8, 14, 1, GOLD[1])
      shadeEdges(l, DARK, 1, true)
      l.rect(bx - (side ? 6 : 7), by - 4, toe - 2, 1, DARK[0])
    })
  }

  // ---- torso
  paint.add(0, (l) => {
    fill(l, sy, hyy + 2, STEEL[1], (dx, y, hw) => !(y <= sy + 1 && Math.abs(dx) > hw - 3))
    shadeEdges(l, STEEL, 3, false)
    // chest ridge + gold trim
    if (!side) {
      for (let y = sy + 3; y < hyy - 4; y++) {
        l.set(sx - 1, y, STEEL[0])
        l.set(sx, y, STEEL[2])
      }
      for (let k = -1; k <= 1; k += 2)
        for (let y = sy + 4; y < hyy - 8; y++)
          l.paint(sx + k * 10 + (k < 0 ? -1 : 0), y, y % 6 < 3 ? STEEL[2] : STEEL[1])
      // plackart: a lower belly plate with a gold rim
      fill(l, hyy - 13, hyy - 12, GOLD[2], (dx, y, hw) => Math.abs(dx) < hw - 4)
      fill(l, hyy - 12, hyy - 6, STEEL[2], (dx, y, hw) => Math.abs(dx) < hw - 5)
      fill(l, hyy - 12, hyy - 11, STEEL[1], (dx, y, hw) => Math.abs(dx) < hw - 5)
    } else {
      for (let y = sy + 6; y < hyy - 3; y++) l.paint(Math.round(sx) + 2, y, STEEL[2])
    }
    // gorget
    fill(l, sy, sy + 4, GOLD[1], (dx, y, hw) => Math.abs(dx) < hw - 5)
    fill(l, sy + 3, sy + 4, GOLD[2], (dx, y, hw) => Math.abs(dx) < hw - 5)
    // belt with a gold buckle
    fill(l, hyy - 5, hyy - 1, CAPE[2])
    fill(l, hyy - 5, hyy - 4, CAPE[1])
    if (!side) l.rect(hxx - 4, hyy - 6, 8, 6, GOLD[1])
    if (!side) l.rect(hxx - 3, hyy - 5, 6, 4, GOLD[0])
    if (!side) l.rect(hxx - 1, hyy - 4, 2, 2, GOLD[2])
    // faulds: scalloped plates under the belt
    for (let y = hyy - 1; y < hyy + 9; y++) {
      const t = (y - hyy + 1) / 9
      const hw = (side ? 12 : 17) + t * 2
      for (let x = Math.round(hxx - hw); x < Math.round(hxx + hw); x++) {
        const seg = side ? 0 : Math.floor((x - hxx + hw) / 5)
        if (y > hyy + 6 && (x - Math.round(hxx)) % 5 === 0 && !side) continue
        l.set(x, y, seg % 2 ? STEEL[1] : STEEL[2 - (y % 2 ? 0 : 0)])
      }
    }
    shadeEdges(l, STEEL, 1, false)
    for (let x = Math.round(hxx - 16); x < Math.round(hxx + 16); x++) l.paint(x, hyy + 8, GOLD[2])
    // crimson tabard hanging between the faulds, with a gold hem and the guild's crossed swords
    if (view !== 'up') {
      const tx = side ? hxx + 7 : hxx
      const tw = side ? 3 : 6
      const tb = hyy + 19
      for (let y = hyy - 1; y < tb; y++) {
        const t = (y - hyy) / (tb - hyy)
        const fl = Math.round(p.flow * t * t * (side ? -1.2 : 0.6))
        const w = tw + t * 1.5
        for (let x = Math.round(tx - w) + fl; x < Math.round(tx + w) + fl; x++)
          l.set(x, y, y >= tb - 2 ? GOLD[1] : Math.abs(x - fl - tx) >= w - 1 ? CAPE[2] : CAPE[1])
      }
      if (!side) {
        for (let k = -3; k <= 3; k++) {
          l.set(tx + k, hyy + 7 + k, GOLD[1])
          l.set(tx - k - 1, hyy + 7 + k, GOLD[1])
        }
      }
    }
  })

  // ---- pauldrons
  for (const sgn of [1, -1] as const) {
    if (side && sgn < 0) continue
    const c = cam.px(V(p.lean, p.sway + sgn * (side ? 4 : shR - 1), shU - 1))
    paint.add(side ? 4 : 0.35, (l) => {
      // big layered pauldron: a dome over two lames, pushed outwards past the chest
      const px = Math.round(c[0]) + (side ? 0 : sgn * 2)
      const py = Math.round(c[1]) - 2
      const rx = side ? 11.5 : 13
      l.ellipse(px, py + 6, rx - 0.5, 5, STEEL[2])
      l.ellipse(px, py + 2.5, rx + 0.5, 6.5, STEEL[1])
      l.ellipse(px, py - 1, rx, 8.5, STEEL[1])
      shadeEdges(l, STEEL, 2, true)
      // lame seams
      for (const [dy, r] of [
        [4.5, rx + 0.5],
        [8.5, rx - 0.5]
      ] as const)
        for (let a = 2; a < 18; a++) {
          const t = (a / 19) * Math.PI
          l.paint(px + Math.cos(t + Math.PI) * (r - 1), py + dy + Math.sin(t) * 1.5, STEEL[3])
        }
      // gold rim along the lowest lame, with a dark underside to lift it off the arm
      for (let a = 0; a < 28; a++) {
        const t = (a / 27) * Math.PI
        const x = px + Math.cos(t + Math.PI) * (rx - 1)
        const y = py + 6 + Math.sin(t) * 4.5
        l.set(x, y, GOLD[1])
        l.set(x, y + 1, STEEL[4])
      }
      for (let a = 3; a < 17; a++) {
        const t = (a / 19) * Math.PI
        l.set(px + Math.cos(t + Math.PI) * rx, py - Math.sin(t) * 8 + 0.5, STEEL[0])
      }
      l.rect(px - 4, py - 5, 3, 1, STEEL[0])
      l.set(px - 5, py - 4, STEEL[0])
      l.rect(px - 1, py, 3, 2, GOLD[1])
      l.set(px - 1, py, GOLD[0])
    })
  }

  // ---- arms
  const hands: Record<string, { end: ReturnType<typeof ik>['end']; mid: ReturnType<typeof ik>['mid'] }> = {}
  for (const sgn of [1, -1] as const) {
    const isMain = sgn === 1
    const off = isMain ? p.mainHand : p.offHand
    const sh = V(p.lean, p.sway + sgn * (side ? 5 : shR), shU - 4)
    const { mid, end } = ik(sh, vadd(sh, V(off.f, sgn * off.r, off.u)), 15.5, 15.5, V(-0.3, sgn * 0.9, -0.6))
    hands[sgn] = { end, mid }
    const far = side && sgn < 0
    const rs: Ramp = far ? DARK : STEEL
    const a = cam.px(sh)
    const m = cam.px(mid)
    const e = cam.px(end)
    const handFront = view === 'down' ? end.f > 6 : view === 'up' ? -end.f > 6 : false
    const depth = side ? cam.depth(end) + (sgn > 0 ? 0.8 : -0.8) : handFront ? 0.9 : 0.4
    paint.add(depth, (l) => {
      bar(l, a, m, 11, rs[1])
      bar(l, m, e, 9, rs[1])
      // flared vambrace cuff just above the gauntlet
      bar(
        l,
        [m[0] + (e[0] - m[0]) * 0.6, m[1] + (e[1] - m[1]) * 0.6],
        [m[0] + (e[0] - m[0]) * 0.85, m[1] + (e[1] - m[1]) * 0.85],
        11,
        rs[1]
      )
      shadeEdges(l, rs, 2, true)
      l.ellipse(Math.round(m[0]), Math.round(m[1]), 4.4, 4.4, GOLD[2])
      l.ellipse(Math.round(m[0]), Math.round(m[1]) - 0.5, 3.4, 3.4, GOLD[1])
      l.set(Math.round(m[0]) - 1, Math.round(m[1]) - 2, GOLD[0])
    })
    paint.add(depth + 0.004, (l) => {
      const fx = Math.round(e[0])
      const fy = Math.round(e[1])
      // heavy gauntlet: a blocky fist with a gold cuff and knuckle plate
      l.rect(fx - 5, fy - 4, 10, 9, DARK[1])
      l.rect(fx - 4, fy + 5, 8, 1, DARK[1])
      shadeEdges(l, DARK, 1, true)
      l.rect(fx - 5, fy - 4, 10, 2, GOLD[1])
      l.rect(fx - 5, fy - 3, 10, 1, GOLD[2])
      l.rect(fx - 3, fy + 1, 6, 1, DARK[0])
      l.rect(fx - 3, fy + 3, 6, 1, DARK[3])
    })
  }

  // ---- sword (main hand)
  if (p.main && !p.main.hidden) {
    const hand = hands[1].end
    const d = aimDir(p.main.aim)
    const depth = (side ? cam.depth(hand) + 0.8 : view === 'down' && hand.f > 6 ? 0.9 : 0.4) + 0.002
    const g = vadd(hand, vscale(d, 2))
    const base = cam.px(vadd(hand, vscale(d, 4)))
    const tip = cam.px(vadd(hand, vscale(d, 48)))
    paint.add(view === 'up' && hand.f > 6 ? -0.3 : depth, (l) => {
      const back = cam.px(vadd(hand, vscale(d, -7)))
      bar(l, back, cam.px(g), 4, R.leather[1])
      l.ellipse(Math.round(back[0]), Math.round(back[1]), 3.5, 3.5, GOLD[1])
      // crossguard
      const dx = tip[0] - base[0]
      const dy = tip[1] - base[1]
      const L = Math.hypot(dx, dy) || 1
      const nx = -dy / L
      const ny = dx / L
      const gp = cam.px(vadd(hand, vscale(d, 3)))
      bar(l, [gp[0] - nx * 10, gp[1] - ny * 10], [gp[0] + nx * 10, gp[1] + ny * 10], 4, GOLD[1])
      l.set(gp[0] - nx * 10, gp[1] - ny * 10, GOLD[0])
      // blade: 6 wide, lit left/top, shaded right/bottom, centre fuller
      if (L > 6) {
        bar(l, base, tip, 6, STEEL[1])
        const horiz = Math.abs(dx) >= Math.abs(dy)
        for (const [o, c] of [
          [-2, STEEL[0]],
          [-1, STEEL[0]],
          [1, STEEL[2]],
          [2, STEEL[2]]
        ] as const) {
          const bxs = Math.round(base[0])
          const bys = Math.round(base[1])
          const txs = Math.round(tip[0])
          const tys = Math.round(tip[1])
          if (o === -1 || o === 1)
            l.line(bxs + (horiz ? 0 : o), bys + (horiz ? o : 0), txs + (horiz ? 0 : o), tys + (horiz ? o : 0), c)
        }
      } else bar(l, base, tip, 5, STEEL[1])
    })
    if (p.main.smear) {
      const s = p.main.smear
      paint.add(
        depth + 0.5,
        (l) => {
          const n = 16
          let prev: Pt | undefined
          for (let i = Math.round(n * 0.2); i <= n; i++) {
            const t = i / n
            const aim = { p: s.p + (p.main!.aim.p - s.p) * t, y: (s.y ?? 0) + ((p.main!.aim.y ?? 0) - (s.y ?? 0)) * t }
            const pt = cam.px(vadd(hand, vscale(aimDir(aim), 52)))
            if (prev) bar(l, prev, pt, i < n * 0.6 ? 2 : i < n * 0.85 ? 3 : 4, i > n * 0.7 ? C.white : STEEL[0])
            prev = pt
          }
        },
        false
      )
    }
  }

  // ---- shield (off hand), kite shaped with the guild crest
  if (p.off && !p.off.hidden) {
    const hand = hands[-1].end
    const turn = side ? Math.max(p.off.turn ?? 0, 50) : (p.off.turn ?? 0)
    const yaw = (turn * Math.PI) / 180
    const center = vadd(hand, V(6, -3, -2 + (p.off.aim.p ? p.off.aim.p / 10 : 0)))
    const o = cam.px(center)
    const hv = cam.dir(V(-Math.sin(yaw), Math.cos(yaw), 0))
    const uv = cam.dir(V(0, 0, 1))
    const n = V(Math.cos(yaw), Math.sin(yaw), 0)
    const facing = view === 'down' ? n.f : view === 'up' ? -n.f : n.r
    const W = 42
    const H = 64
    const map = (a: number, b: number): Pt => [
      o[0] + a * (W / 2) * hv[0] - b * (H / 2) * uv[0],
      o[1] + a * (W / 2) * hv[1] - b * (H / 2) * uv[1]
    ]
    const KITE: [number, number][] = [
      [-1, -0.92],
      [-0.9, -1],
      [0.9, -1],
      [1, -0.92],
      [1, -0.15],
      [0.55, 0.62],
      [0, 1],
      [-0.55, 0.62],
      [-1, -0.15]
    ]
    const poly = (k: number, dy = 0) => KITE.flatMap(([a, b]) => map(a * k, b * k + dy))
    const depth =
      view === 'up'
        ? hands[-1].end.f > 6
          ? -0.4
          : 0.9
        : view === 'down'
          ? hands[-1].end.f > 6
            ? 0.95
            : 0.45
          : cam.depth(hand) - 0.8 + 1.2
    paint.add(depth, (l) => {
      l.poly(poly(1), GOLD[2])
      l.poly(poly(0.93), GOLD[1])
      l.poly(poly(0.84), facing > 0 ? STEEL[1] : STEEL[2])
      const w = Math.abs(hv[0]) * W
      if (w < 8) bar(l, map(0, -1), map(0, 0.9), 6, STEEL[2])
      if (facing > 0 && w >= 8) {
        // lit top-left, shaded lower right inner edge
        const tl = map(-0.84, -0.84)
        const tr = map(0.84, -0.84)
        const ml = map(-0.84, -0.12)
        l.line(tl[0], tl[1], tr[0], tr[1], STEEL[0])
        l.line(tl[0] + 1, tl[1] + 1, tr[0] - 1, tr[1] + 1, STEEL[0])
        l.line(tl[0], tl[1], ml[0], ml[1], STEEL[0])
        // crest: gold crossed swords over a crimson roundel
        const c = map(0, -0.18)
        const rr = Math.max(4, w * 0.2)
        l.ellipse(c[0], c[1], rr, rr * 1.15, CAPE[2])
        l.ellipse(c[0], c[1], rr - 1, (rr - 1) * 1.15, CAPE[1])
        const s1a = map(-0.5, -0.62)
        const s1b = map(0.5, 0.28)
        const s2a = map(0.5, -0.62)
        const s2b = map(-0.5, 0.28)
        for (const [a, b] of [
          [s1a, s1b],
          [s2a, s2b]
        ] as const) {
          bar(l, a, b, 3, GOLD[1])
          l.line(a[0] - 1, a[1], b[0] - 1, b[1], GOLD[0])
        }
        const c0 = map(0, -0.17)
        l.ellipse(c0[0], c0[1], 2.5, 2.5, GOLD[1])
        l.set(c0[0] - 1, c0[1] - 1, GOLD[0])
        // rivets
        for (const [a, b] of [
          [-0.7, -0.78],
          [0.7, -0.78],
          [-0.72, -0.1],
          [0.72, -0.1],
          [0, 0.72]
        ] as [number, number][]) {
          const r = map(a, b)
          l.set(r[0], r[1], GOLD[0])
          l.set(r[0] + 1, r[1] + 1, GOLD[3])
        }
      } else if (facing <= 0 && w >= 8) {
        const a = map(0, -0.6)
        const b = map(0, 0.3)
        bar(l, a, b, 3, R.leather[1])
        const g1 = map(-0.3, -0.35)
        const g2 = map(0.3, -0.35)
        l.line(g1[0], g1[1], g2[0], g2[1], R.leather[2])
      }
    })
  }

  // ---- head: full helm with a red crest
  const [hdx, hdy] = cam.px(V(p.lean * 1.1 + p.head.f, p.sway + p.head.r, shU + 14 + p.head.u))
  const hcx = Math.round(hdx)
  const hcy = Math.round(hdy)
  paint.add(0.5, (l) => {
    const rx = side ? 11 : 12
    // dome + faceplate
    l.ellipse(hcx, hcy - 1, rx, 12.5, STEEL[1])
    for (let y = hcy + 5; y < hcy + 13; y++) {
      const hw = rx - 2 - (y - hcy - 5) * 0.6
      for (let x = Math.round(hcx - hw); x < Math.round(hcx + hw); x++) l.set(x, y, STEEL[1])
    }
    shadeEdges(l, STEEL, 2, true)
    const tilt = Math.round(p.head.r)
    if (view === 'down') {
      // visor slit with glowing eyes
      l.rect(hcx - 9 + tilt, hcy - 1, 18, 3, C.black)
      l.rect(hcx - 9 + tilt, hcy - 2, 18, 1, STEEL[3])
      l.set(hcx - 5 + tilt, hcy, C.glow)
      l.set(hcx - 4 + tilt, hcy, C.glow)
      l.set(hcx + 4 + tilt, hcy, C.glow)
      l.set(hcx + 3 + tilt, hcy, C.glow)
      // breaths
      for (let k = -1; k <= 1; k++) for (let y = hcy + 5; y < hcy + 11; y += 2) l.set(hcx + k * 3 + tilt, y, STEEL[3])
      l.rect(hcx - 1 + tilt, hcy - 11, 2, 11, STEEL[2])
    } else if (view === 'side') {
      l.rect(hcx + 1, hcy - 1, 11, 3, C.black)
      l.rect(hcx + 1, hcy - 2, 11, 1, STEEL[3])
      l.set(hcx + 8, hcy, C.glow)
      l.set(hcx + 7, hcy, C.glow)
      for (let y = hcy + 5; y < hcy + 11; y += 2) l.set(hcx + 7, y, STEEL[3])
      l.rect(hcx - 3, hcy - 12, 2, 6, STEEL[2])
    } else {
      for (let y = hcy - 10; y < hcy + 10; y++) l.set(hcx, y, STEEL[2])
    }
    // gold brow band + neck rim
    for (let x = hcx - rx + 1; x < hcx + rx; x++) if (l.get(x, hcy - 4)) l.set(x, hcy - 4, GOLD[1])
    for (let x = hcx - rx + 3; x < hcx + rx - 2; x++) if (l.get(x, hcy + 11)) l.set(x, hcy + 11, GOLD[2])
    l.set(hcx - 7, hcy - 8, STEEL[0])
    l.set(hcx - 6, hcy - 9, STEEL[0])
  })
  paint.add(0.6, (l) => {
    // crest: a crimson plume along the helm, streaming backwards with the flow
    const f = p.flow
    const top = hcy - 13
    if (view === 'down') {
      l.rect(hcx - 2, top - 8, 4, 9, CAPE[1])
      l.rect(hcx - 1, top - 10, 2, 3, CAPE[0])
      l.set(hcx + 1, top - 3, CAPE[2])
      l.rect(hcx + 1, top - 6, 1, 6, CAPE[2])
    } else {
      const dir = view === 'side' ? -1 : 0
      for (let i = 0; i < 20; i++) {
        const t = i / 19
        const cx = hcx + dir * (i * 0.95 + t * t * f * 3) + (view === 'up' ? 0 : -2 * dir * 0)
        const cy = top + (view === 'up' ? i * 1.0 : 3 - Math.sin(t * 3) * 4 + t * t * 14)
        const w = 5 - t * 3.5
        l.ellipse(cx, cy, Math.max(1, w), Math.max(1.2, w * 0.8), t > 0.6 ? CAPE[2] : CAPE[1])
      }
      l.rect(hcx - 1, top - 1, 4, 2, CAPE[0])
    }
    shadeEdges(l, CAPE, 1, true)
  })

  return despeckle(paint.render())
}

// ---------------------------------------------------------------------------------------------------------
// Animations

const S = (aim: { p: number; y?: number }, extra: object = {}) => ({ aim, ...extra })

function stride(i: number, n: number, amp: number, bobAmp = 1.6): Partial<Pose> {
  const a = (i / n) * Math.PI * 2
  const lift = (x: number) => 5 * Math.max(0, Math.cos(x))
  return {
    mainFoot: V(amp * Math.sin(a), 3.4, lift(a)),
    offFoot: V(-amp * Math.sin(a), 3.4, lift(a + Math.PI)),
    bob: -bobAmp * Math.abs(Math.sin(a)) + 0.6,
    flow: Math.cos(a) * 1.5
  }
}

const BASE: Partial<Pose> = {
  lean: 2,
  crouch: 2,
  mainHand: V(7, 3, -10),
  offHand: V(9, -4, -12),
  main: S({ p: 128 }),
  off: S({ p: 0 }, { turn: 32 }),
  mainFoot: V(1, 3.4, 0),
  offFoot: V(-1, 3.4, 0)
}

type Maker = (i: number) => Pose
const P = (...ps: Partial<Pose>[]) => pose(Object.assign({}, BASE, ...ps))

const MOVES: Record<string, Maker> = {
  idle: (i) =>
    P({
      bob: [0, -0.8, -1, -0.4][i],
      flow: [0, 0.6, 1, 0.5][i],
      offHand: V(9, -4, -12 - [0, 0.4, 0.8, 0.4][i]),
      head: V(0, 0, [0, 0, -0.5, -0.2][i])
    }),
  walk: (i) => P(stride(i, 6, 7), { mainHand: V(-4 * Math.sin((i / 6) * 6.283) + 5, 3, -15) }),
  guard: (i) =>
    P({
      crouch: 4 + i * 0.6,
      lean: 4,
      offHand: V(13, -5, 0),
      off: S({ p: 0 }, { turn: 6 }),
      mainHand: V(2, 4, -12),
      main: S({ p: 120 }),
      bob: -i * 0.6,
      flow: i ? 1.2 : 0,
      mainFoot: V(5, 3.8, 0),
      offFoot: V(-5, 3.8, 0)
    }),
  windup: (i) =>
    P({
      crouch: [5, 8, 10][i],
      lean: [-2, -5, -6][i],
      offHand: V([12, 12, 12.5][i], -5, [-1, -4, -5][i]),
      off: S({ p: 0 }, { turn: 14 }),
      mainHand: V([-1, -4, -5][i], 4, [8, 10, 12][i]),
      main: S({ p: [-70, -95, -105][i] }),
      flow: [1, 3, 4][i],
      sway: [0, 1, 1.5][i],
      mainFoot: V(6, 3.8, 0),
      offFoot: V(-6, 3.8, 0)
    }),
  charge: (i) =>
    P(stride(i, 4, 9, 2.2), {
      lean: 9,
      crouch: 6,
      offHand: V(15, -4, -3),
      off: S({ p: 0 }, { turn: 10 }),
      mainHand: V(-2, 5, -12),
      main: S({ p: 100 }),
      flow: -5 - (i % 2)
    }),
  sweep: (i) => {
    const yaws = [100, 70, 0, -70, -90]
    const hand = [V(-2, 8, 4), V(2, 8, 2), V(12, 3, -2), V(10, -4, -2), V(6, -6, -6)][i]
    return P({
      crouch: [6, 5, 3, 3, 4][i],
      lean: [-3, 0, 6, 5, 3][i],
      sway: [2, 1, -2, -3, -2][i],
      mainHand: hand,
      main: S({ p: 90, y: yaws[i] }, i === 2 || i === 3 ? { smear: { p: 90, y: i === 2 ? 100 : 20 } } : {}),
      offHand: V(11, -5, [-2, -3, -5, -5, -6][i]),
      off: S({ p: 0 }, { turn: 14 }),
      flow: [2, 0, -2, -1, 1][i],
      mainFoot: V([5, 5, 9, 7, 6][i], 4, 0),
      offFoot: V(-6, 4, 0)
    })
  },
  slam: (i) => {
    const up = [0, 4, 6, 0, 0, 0][i]
    return P({
      crouch: [10, 2, 0, 8, 7, 3][i],
      lean: [0, -2, -2, 7, 4, 2][i],
      at: V(0, 0, up),
      offHand: [V(12, -5, -4), V(8, -4, 8), V(7, -4, 10), V(15, -4, -17), V(14, -4, -14), V(11, -4, -8)][i],
      off: S({ p: 0 }, { turn: [10, 16, 20, 8, 8, 10][i] }),
      mainHand: [V(1, 5, -10), V(0, 6, 2), V(0, 6, 4), V(2, 6, -12), V(2, 5, -12), V(4, 4, -14)][i],
      main: S({ p: [130, 50, 45, 150, 150, 135][i] }),
      mainFoot: V([5, 4, 3, 7, 7, 4][i], 4, [0, 3, 4, 0, 0, 0][i]),
      offFoot: V([-5, -3, -3, -7, -7, -4][i], 4, [0, 3, 4, 0, 0, 0][i]),
      flow: [1, -3, -4, 4, 2, 0][i]
    })
  },
  call: (i) =>
    P({
      crouch: [3, 0, 0, 1][i],
      lean: [-3, -6, -6, -5][i],
      mainHand: V([3, 5, 5, 5][i], 3, [6, 10, 11, 10][i]),
      main: S({ p: [60, 38, 36, 40][i] }, { glow: [0, 0.6, 1, 0.8][i] }),
      offHand: V(8, -9, -6),
      off: S({ p: 0 }, { turn: 40 }),
      flow: [2, 0, -1, 1][i],
      head: V(-1, 0, 1),
      mainFoot: V(4, 4, 0),
      offFoot: V(-4, 4, 0)
    }),
  broken: (i) => {
    const sw = [-4, 0, 4, 0][i]
    return P({
      crouch: [4, 6, 4, 2][i],
      lean: [2, 3, 1, -1][i],
      sway: sw * 0.6,
      tilt: [-3, 0, 3, 0][i],
      offHand: V(2, -8, -17),
      off: S({ p: 0 }, { hidden: true }),
      mainHand: V(4, 5, -14),
      main: S({ p: 170 }),
      head: V(0, sw * 0.9, -2),
      flow: -sw * 0.5,
      mainFoot: V(5 - sw * 0.3, 5, 0),
      offFoot: V(-5 + sw * 0.3, 5, 0)
    })
  },
  hurt: (i) =>
    P({
      lean: [-7, -5][i],
      crouch: [4, 6][i],
      bob: -1,
      head: V([-3, -2][i], 0, -1),
      offHand: V(6, -6, -14),
      off: S({ p: 0 }, { turn: 30 }),
      mainHand: V(-2, 7, -12),
      main: S({ p: 130 }),
      flow: [4, 2][i],
      mainFoot: V(3, 4, 0),
      offFoot: V(-6, 4, 0)
    }),
  death: (i) => {
    const t = [
      { crouch: 3, lean: -5, tilt: 0 },
      { crouch: 9, lean: -1, tilt: 0 },
      { crouch: 14, lean: 3, tilt: 0 },
      { crouch: 16, lean: 6, tilt: 0 },
      { crouch: 14, lean: 4, tilt: -28, at: V(-8, 0, 0) },
      { crouch: 8, lean: 0, tilt: -62, at: V(-18, 0, 4) },
      { crouch: 2, lean: 0, tilt: -90, at: V(-28, 0, 12) },
      { crouch: 2, lean: 0, tilt: -90, at: V(-28, 0, 12) }
    ][i]
    return P(t, {
      main: S({ p: i < 4 ? 178 : 120 }),
      mainHand: i < 4 ? V(11, 3, -14) : V(6, 4, -10),
      offHand: V(8, -6, -15),
      off: S({ p: 0 }, { turn: 40, hidden: i >= 3 }),
      head: V(i > 1 ? 3 : 0, 0, i > 1 ? -4 : 0),
      mainFoot: V(i > 1 ? 7 : 3, 4, i > 1 ? 0 : 0),
      offFoot: V(i > 1 ? -9 : -3, 4, 0),
      flow: i > 3 ? 3 : 0
    })
  }
}

export function buildBossSheet(kind: 'garud'): Sheet {
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(BOSS_SPEC[kind])) {
    const [base, dir] = name.split('_') as [string, View | undefined]
    const view: View = dir ?? 'side'
    const make = MOVES[base]
    const out = Array.from({ length: want.frames }, (_, i) => renderBoss(view, make(i)))
    const a: Anim = anim(out, want.fps, want.loop)
    if (base === 'death') a.alpha = [1, 1, 1, 1, 1, 1, 0.8, 0.4]
    sheet[name] = a
  }
  return sheet
}

void ball
