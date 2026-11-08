/**
 * 勇者レオン: the guild's young hero, a 128×128 boss drawn natively (never scaled) with the guild rig's 3D-lite
 * projection and its own part drawers. ~76 px tall, feet on (64, 116): silver-white hair tied back, a white-and-gold
 * long coat over a light breastplate, a blue scarf and a huge sun-crested greatsword with a glowing edge.
 * Phase 2 (awaken) adds an aura, eyes aglow and wings of light feathers.
 */
import { BOSS_SPEC } from '../contract'
import { C, R, toneTable } from '../palette'
import { LIGHTER } from '../palette'
import { Raster, bayer, despeckle, hash, rng, type Ramp } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { sun } from './s4-parts'
import { Cam, Painter, V, aimDir, bar, ik, pose, vadd, vscale, type Pose, type Pt, type View } from './rig'

const COAT = R.clothWhite
const GOLD = R.gold
const PLATE = R.steel
const SCARF = R.jobBlue
const NAVY = R.clothNavy
const HAIR = [C.white, R.hairSilver[0], R.hairSilver[1], R.hairSilver[2], R.hairSilver[4]] as const
const SKIN = R.skinLight
const BOOT = R.leather

export interface LeonPose extends Pose {
  /** Both hands on the sword grip. */
  two?: boolean
  /** 0..1 awakened aura / wings / eyes / holy bubble / afterimages / brightening / dissolve / light motes. */
  aura?: number
  wings?: number
  eyes?: number
  bubble?: number
  ghost?: number
  bright?: number
  fade?: number
  motes?: number
  moteKind?: 'rise' | 'gather'
  seed?: number
}

/** shadeEdges limited to the painted bounding box (the layers are small; whole-frame passes are the cost). */
function shadeEdges(r: Raster, ramp: Ramp, depth = 1, rim = false) {
  const b = r.bounds()
  if (!b) return r
  const src = r.clone()
  const inside = (x: number, y: number) => src.get(x, y) === ramp[1]
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (!inside(x, y)) continue
      let dark = false
      for (let d = 1; d <= depth; d++) if (!src.get(x + d, y) || !src.get(x, y + d)) dark = true
      if (dark) r.set(x, y, ramp[2])
      else if (rim && (!src.get(x - 1, y) || !src.get(x, y - 1))) r.set(x, y, ramp[0])
    }
  return r
}

const dither = (l: Raster, x: number, y: number, t: number, c: number) => {
  if (bayer(x, y) < t) l.set(x, y, c)
}

function renderLeon(view: View, p: LeonPose): Raster {
  const cam = new Cam(view, 64, 116, p.tilt, p.at)
  const paint = new Painter(128, 128)
  const side = view === 'side'
  const hipU = 29 + p.bob - p.crouch
  const shU = hipU + 23 - p.crouch * 0.15
  const shR = side ? 5 : 12.5
  const [shx, shy] = cam.px(V(p.lean, p.sway, shU))
  const [hx, hy] = cam.px(V(0, 0, hipU))
  const ws = side ? 9 : 13
  const wh = side ? 7.5 : 10
  const sy = Math.round(shy) - 2
  const hyy = Math.round(hy)
  const sx = side ? shx + 0.5 : Math.round(shx)
  const hxx = side ? hx + 0.5 : Math.round(hx)
  const flow = p.flow
  const hf = Math.max(-6, Math.min(6, flow))
  const rowOf = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - sy) / Math.max(1, hyy - sy)))
    return { cx: sx + (hxx - sx) * t, hw: ws + (wh - ws) * t }
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
  let tipPos: Pt = [64, 40]

  // ---- wings of light (phase 2), behind everything: two ranks of tapered feathers
  if ((p.wings ?? 0) > 0.05) {
    const k = p.wings!
    for (const sgn of side ? [-1, 1] : [1, -1]) {
      const root = cam.px(V(side ? -7 : -2, sgn * (side ? 1.5 : 6), shU - 5))
      const far = side && sgn < 0
      paint.add(
        view === 'up' ? 0.8 : -3,
        (l) => {
          const feather = (ex: number, ey: number, w: number, base: number) => {
            const dx = ex - root[0]
            const dy = ey - root[1]
            const L = Math.hypot(dx, dy) || 1
            let nx = -dy / L
            let ny = dx / L
            if (nx + ny > 0) {
              nx = -nx
              ny = -ny
            }
            const m = [root[0] + dx * 0.5, root[1] + dy * 0.5]
            const body = far ? R.holy[1] : base
            l.poly([root[0], root[1], m[0] + nx * w, m[1] + ny * w, ex, ey, m[0] - nx * w, m[1] - ny * w], R.holy[3])
            l.poly(
              [
                root[0],
                root[1],
                m[0] + nx * (w - 1),
                m[1] + ny * (w - 1),
                ex,
                ey,
                m[0] - nx * (w - 1.5),
                m[1] - ny * (w - 1.5)
              ],
              body
            )
            l.line(root[0] + nx, root[1] + ny, m[0] + nx * (w - 1), m[1] + ny * (w - 1), far ? R.holy[1] : R.holy[0])
            l.line(m[0] + nx * (w - 1), m[1] + ny * (w - 1), ex, ey, far ? R.holy[1] : C.white)
            l.set(ex, ey, C.white)
          }
          for (let rank = 0; rank < 2; rank++)
            for (let i = 0; i < 6; i++) {
              const deg = side ? 112 + i * 12 + sgn * 5 : 26 + i * 15 + rank * 6
              const t = (deg * Math.PI) / 180
              const len = (rank ? 28 - i * 1.6 : 48 - i * 3) * k
              const ex = root[0] + (side ? Math.cos(t) : sgn * Math.sin(t)) * len
              const ey = root[1] + (side ? -Math.sin(t) : -Math.cos(t)) * len + (side ? 4 : 0)
              feather(ex, ey, rank ? 5.6 : 7.4, rank ? R.holy[0] : R.holy[1])
            }
        },
        false
      )
    }
  }

  // ---- scarf tail (waves with the hf)
  paint.add(view === 'up' ? 0.7 : side ? -1.5 : 0.3, (l) => {
    const start: Pt = side ? [sx - 4, sy + 1] : view === 'up' ? [sx + 6, sy + 1] : [sx - 8, sy + 2]
    let prev: Pt | undefined
    const n = 14
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const w = 5 - t * 2.4
      let pt: Pt
      if (side)
        pt = [
          start[0] - t * (12 + Math.abs(hf) * 1.6) - hf * t * 0.5,
          start[1] + t * 9 + Math.sin(t * 5 + hf * 0.4) * 2.4
        ]
      else
        pt = [
          start[0] + (view === 'up' ? 1 : -1) * (t * 3 + Math.sin(t * 4) * 1.2 + hf * t * 1.6),
          start[1] + t * (view === 'up' ? 22 : 21)
        ]
      if (prev) bar(l, prev, pt, Math.max(2, Math.round(w)), SCARF[1])
      prev = pt
    }
    // the wrap around the neck
    if (!side) l.rect(sx - (view === 'up' ? 7 : 6), sy - 2, view === 'up' ? 10 : 12, 4, SCARF[1])
    else l.rect(Math.round(sx) - 5, sy - 2, 8, 4, SCARF[1])
    shadeEdges(l, SCARF, 1, true)
    if (prev) l.rect(Math.round(prev[0]) - 1, Math.round(prev[1]), 3, 1, GOLD[1])
  })

  // ---- coat tails (behind arms, over the legs)
  paint.add(side ? 0.1 : 0.15, (l) => {
    const len = 19
    for (let k = 0; k < len; k++) {
      const y = hyy - 1 + k
      const t = k / len
      const sh = flow * t * t * (side ? -3.4 : 2)
      if (side) {
        const hw = 7 + t * 1.5
        const c0 = hxx - 2 - t * 2 + sh
        for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++) {
          if (k > len - 3 && (x + y) % 5 === 0) continue
          l.set(x, y, COAT[1])
        }
      } else {
        const hw = 11 + t * 3.6
        const slit = view === 'down' && k > 3 ? 1 + t * 3 : 0
        const c0 = hxx + sh
        for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++) {
          if (Math.abs(x + 0.5 - c0) < slit) continue
          if (k > len - 3 && (x * 2 + y) % 6 === 0) continue
          l.set(x, y, COAT[1])
        }
      }
    }
    shadeEdges(l, COAT, 2, true)
    // Gold hem and slit trim, a seam on the back.
    for (let x = 0; x < 128; x++) {
      if (l.get(x, hyy + 17) === COAT[1] || l.get(x, hyy + 17) === COAT[2]) l.set(x, hyy + 17, GOLD[1])
    }
    if (view === 'up')
      for (let y = hyy + 4; y < hyy + 17; y++) l.paint(hxx + Math.round(flow * ((y - hyy) / 19) ** 2 * 2), y, COAT[3])
  })

  // ---- legs
  for (const sgn of [1, -1] as const) {
    const foot = sgn === 1 ? p.mainFoot : p.offFoot
    const end0 = V(foot.f * 1.4, sgn * foot.r * 1.5, foot.u)
    const hip = V(0, sgn * 5, hipU)
    const { mid, end } = ik(hip, end0, 14.8, 14.8, V(1, 0, 0.1))
    const far = side && sgn < 0
    const pants: Ramp = far ? [NAVY[1], NAVY[2], NAVY[3], NAVY[3], NAVY[4]] : NAVY
    const boots: Ramp = far ? [BOOT[1], BOOT[2], BOOT[3], BOOT[3], BOOT[4]] : BOOT
    const a = cam.px(hip)
    const m = cam.px(mid)
    const e = cam.px(end)
    paint.add(side ? cam.depth(end) - 0.2 : -1, (l) => {
      bar(l, a, m, 8, pants[1])
      bar(l, m, e, 7, pants[1])
      shadeEdges(l, pants, 1, true)
      const bx = Math.round(e[0])
      const by = Math.round(e[1])
      l.rect(bx - 4, by - 8, 8, 8, boots[1])
      l.rect(bx - 5, by - 3, side ? 12 : 10, 4, boots[1])
      l.rect(bx - 4, by - 9, 8, 2, GOLD[1])
      l.rect(bx - 4, by - 9, 8, 1, GOLD[0])
      shadeEdges(l, boots, 1, true)
      l.rect(bx - 5, by, side ? 12 : 10, 1, boots[3])
    })
  }

  // ---- torso: coat with a breastplate and belt
  paint.add(0, (l) => {
    fill(l, sy, hyy + 2, COAT[1], (dx, y, hw) => !(y <= sy + 1 && Math.abs(dx) > hw - 3))
    shadeEdges(l, COAT, 3, true)
    if (view === 'up') {
      for (let y = sy + 3; y < hyy; y++) l.paint(sx, y, COAT[2])
    }
    // Gold lapel edge down the opening.
    if (view === 'down') {
      for (let y = sy + 2; y < hyy - 1; y++) {
        const { cx } = rowOf(y + 0.5)
        const o = Math.round(7 - (y - sy) * 0.15)
        l.paint(Math.round(cx) - o - 1, y, GOLD[1])
        l.paint(Math.round(cx) + o, y, GOLD[2])
      }
    }
  })
  if (view !== 'up')
    paint.add(0.1, (l) => {
      const front = (dx: number) => (side ? dx > -2 : true)
      for (let y = sy + 1; y < hyy - 5; y++) {
        const { cx } = rowOf(y + 0.5)
        const hw = Math.round(side ? 6.5 : 7 - (y - sy) * 0.15)
        for (let x = Math.round(cx) - hw; x < Math.round(cx) + hw; x++) if (front(x + 0.5 - cx)) l.set(x, y, PLATE[1])
      }
      shadeEdges(l, PLATE, 2, true)
      if (view === 'down') {
        for (let y = sy + 3; y < hyy - 6; y++) l.paint(sx - 1, y, PLATE[0])
        sun(l, sx, sy + 9, 2.4, GOLD)
        l.rect(sx - 6, sy + 1, 12, 1, GOLD[1])
      } else {
        l.rect(Math.round(sx) - 2, sy + 1, 9, 1, GOLD[1])
        l.rect(Math.round(sx) + 1, sy + 4, 4, 5, GOLD[1])
      }
    })
  paint.add(0.12, (l) => {
    // Belt: a navy strap with a gold buckle.
    fill(l, hyy - 5, hyy - 1, NAVY[1])
    shadeEdges(l, NAVY, 1, true)
    if (!side) {
      l.rect(hxx - 3, hyy - 6, 6, 5, GOLD[1])
      l.rect(hxx - 2, hyy - 5, 4, 3, GOLD[0])
      l.set(hxx + 2, hyy - 3, GOLD[2])
    } else l.rect(Math.round(hxx) + 3, hyy - 6, 4, 5, GOLD[1])
  })

  // ---- pauldron (main side) and gold-edged shoulder
  for (const sgn of [1, -1] as const) {
    if (side && sgn < 0) continue
    const c = cam.px(V(p.lean, p.sway + sgn * (side ? 3 : shR - 1), shU - 1))
    paint.add(side ? 4 : 0.35, (l) => {
      const px = Math.round(c[0])
      const py = Math.round(c[1]) - 1
      const big = sgn === 1
      l.ellipse(px, py, side ? 6 : big ? 8 : 6.5, big ? 5.4 : 4.4, big ? PLATE[1] : COAT[1])
      shadeEdges(l, big ? PLATE : COAT, 1, true)
      l.rect(px - (big ? 6 : 5), py + 3, big ? 12 : 10, 1, GOLD[1])
      l.set(px - 2, py - 2, big ? PLATE[0] : COAT[0])
      l.set(px - 3, py - 2, big ? PLATE[0] : COAT[0])
    })
  }

  // ---- arms and the greatsword
  const hands: Record<number, { end: ReturnType<typeof ik>['end']; mid: ReturnType<typeof ik>['mid'] }> = {}
  const d = aimDir(p.main?.aim ?? { p: 140 })
  const shoulder = (sgn: number) => V(p.lean, p.sway + sgn * (side ? 4 : shR), shU - 2)
  // Main arm first (the off hand may grab the grip).
  {
    const sh = shoulder(1)
    const off = p.mainHand
    hands[1] = ik(sh, vadd(sh, V(off.f, off.r, off.u)), 12.4, 12.4, V(-0.7, 0.3, -0.9))
  }
  {
    const sh = shoulder(-1)
    const grip = vadd(hands[1].end, vscale(d, -5.5))
    const target = p.two ? vadd(grip, V(0, side ? -0.5 : -2.5, 0)) : vadd(sh, V(p.offHand.f, -p.offHand.r, p.offHand.u))
    hands[-1] = ik(sh, target, 12.4, 12.4, V(-0.7, -0.3, -0.9))
  }
  for (const sgn of [1, -1] as const) {
    const sh = shoulder(sgn)
    const { mid, end } = hands[sgn]
    const far = side && sgn < 0
    const sleeve: Ramp = far ? [COAT[1], COAT[2], COAT[3], COAT[3], COAT[4]] : COAT
    const brace: Ramp = far ? [PLATE[1], PLATE[2], PLATE[3], PLATE[3], PLATE[4]] : PLATE
    const a = cam.px(sh)
    const m = cam.px(mid)
    const e = cam.px(end)
    const handFront = view === 'down' ? end.f > 6 : view === 'up' ? -end.f > 6 : false
    const depth = side ? cam.depth(end) + (sgn > 0 ? 0.8 : -0.8) : handFront ? 0.9 : 0.4
    paint.add(depth, (l) => {
      bar(l, a, m, 7, sleeve[1])
      shadeEdges(l, sleeve, 1, true)
      bar(l, m, e, 6, brace[1])
      shadeEdges(l, brace, 1, true)
      l.rect(Math.round(m[0]) - 3, Math.round(m[1]) - 1, 6, 1, GOLD[1])
    })
    paint.add(depth + 0.004, (l) => {
      const fx = Math.round(e[0])
      const fy = Math.round(e[1])
      l.rect(fx - 2, fy - 2, 5, 5, NAVY[1])
      shadeEdges(l, NAVY, 1, true)
      l.set(fx - 2, fy - 2, NAVY[0])
    })
  }

  if (p.main && !p.main.hidden) {
    const hand = hands[1].end
    const glow = p.main.glow ?? 0.3
    const depth = (side ? cam.depth(hand) + 0.8 : view === 'down' && hand.f > 6 ? 0.9 : 0.4) + 0.002
    const at = (k: number) => cam.px(vadd(hand, vscale(d, k)))
    const base = at(3)
    const tip = at(3 + 38)
    tipPos = tip
    const L = Math.hypot(tip[0] - base[0], tip[1] - base[1]) || 1
    const u: Pt = [(tip[0] - base[0]) / L, (tip[1] - base[1]) / L]
    let n: Pt = [-u[1], u[0]]
    if (n[0] + n[1] > 0) n = [-n[0], -n[1]]
    const sword = view === 'up' && hand.f > 6 ? -0.3 : depth
    paint.add(sword, (l) => {
      const w = L > 8 ? 3 : 1.5
      const P = (t: number, s: number): Pt => [base[0] + u[0] * L * t + n[0] * s, base[1] + u[1] * L * t + n[1] * s]
      const pts = (a: Pt[]) => a.flatMap((q) => q)
      // blade body, lit half (top-left) and shaded half
      l.poly(pts([P(0, w), P(0.8, w), P(1, 0), P(0.8, -w), P(0, -w)]), PLATE[1])
      l.poly(pts([P(0, w), P(0.8, w), P(1, 0), P(0.85, 0.2), P(0, 0.4)]), PLATE[0])
      l.line(...P(0, -w), ...P(0.8, -w), PLATE[2])
      l.line(...P(0.8, -w), ...P(1, 0), PLATE[2])
      // glowing edges
      const edge = glow > 0.5 ? C.white : PLATE[0]
      l.line(...P(0.02, w), ...P(0.8, w), edge)
      l.line(...P(0.8, w), ...P(1, 0), edge)
      if (glow > 0.3) {
        l.line(...P(0.02, -w + 0.4), ...P(0.8, -w + 0.4), R.holy[1])
        l.line(...P(0.1, 0.2), ...P(0.92, 0.1), glow > 1 ? C.glow : R.holy[0])
      }
      // sun emblem on the blade
      const e = P(0.2, 0)
      l.ellipse(e[0], e[1], 1.7, 1.7, GOLD[1])
      l.set(e[0] - 1, e[1] - 1, GOLD[0])
      // grip, crossguard with the sun, pommel
      const back = at(-6)
      const g0 = at(2)
      bar(l, back, g0, 3, NAVY[2])
      l.ellipse(back[0], back[1], 2.4, 2.4, GOLD[1])
      l.set(back[0] - 1, back[1] - 1, GOLD[0])
      const gp = at(3)
      bar(l, [gp[0] - n[0] * 8, gp[1] - n[1] * 8], [gp[0] + n[0] * 8, gp[1] + n[1] * 8], 3, GOLD[1])
      l.set(gp[0] - n[0] * 8, gp[1] - n[1] * 8, GOLD[0])
      l.set(gp[0] + n[0] * 8 - u[0], gp[1] + n[1] * 8 - u[1], GOLD[2])
      l.ellipse(gp[0], gp[1], 3, 3, GOLD[1])
      l.set(gp[0] - 1, gp[1] - 1, GOLD[0])
      l.set(gp[0], gp[1], C.white)
    })
    // blade glow (dithered halo along the edge)
    if (glow > 0.9)
      paint.add(
        sword + 0.02,
        (l) => {
          for (let i = 0; i <= 14; i++) {
            const t = i / 14
            const cx = base[0] + (tip[0] - base[0]) * t
            const cy = base[1] + (tip[1] - base[1]) * t
            for (let j = -5; j <= 5; j++) {
              const x = Math.round(cx + n[0] * j)
              const y = Math.round(cy + n[1] * j)
              if (l.get(x, y)) continue
              if (Math.abs(j) > 3) dither(l, x, y, Math.min(0.5, glow * 0.2) * (1 - (Math.abs(j) - 3) / 3), R.holy[1])
            }
          }
        },
        false
      )
    if (p.main.smear) {
      const s = p.main.smear
      paint.add(
        sword + 0.5,
        (l) => {
          const nn = 22
          let prev: Pt | undefined
          for (let i = 0; i <= nn; i++) {
            const t = i / nn
            const aim = { p: s.p + (p.main!.aim.p - s.p) * t, y: (s.y ?? 0) + ((p.main!.aim.y ?? 0) - (s.y ?? 0)) * t }
            const pp = cam.px(vadd(hand, vscale(aimDir(aim), 38)))
            if (prev) {
              const wd = 2 + Math.round(t * 6)
              bar(l, prev, pp, wd, t > 0.75 ? C.white : t > 0.4 ? R.holy[0] : R.steel[0])
              if (t > 0.3) bar(l, [prev[0] - u[0] * 0, prev[1] - 2], [pp[0], pp[1] - 2], 1, R.holy[1])
            }
            prev = pp
          }
        },
        false
      )
    }
  }

  // ---- head
  const [hdx, hdy] = cam.px(V(p.lean * 1.1 + p.head.f, p.sway + p.head.r, shU + 12.4 + p.head.u))
  const hcx = Math.round(hdx)
  const hcy = Math.round(hdy)
  const hurt = p.face === 'hurt' || p.face === 'dead'
  const eyes = p.eyes ?? 0
  // ponytail behind (side) / over the back (up), tied with a gold band
  paint.add(view === 'up' ? 0.62 : side ? -0.5 : -2, (l) => {
    if (view === 'down') {
      // a tuft of the tail peeking out behind the neck
      l.rect(hcx + 4, hcy + 4, 3, 5 + Math.round(Math.max(0, hf)), HAIR[1])
      shadeEdges(l, HAIR, 1, true)
      return
    }
    const start: Pt = side ? [hcx - 8, hcy - 3] : [hcx, hcy - 2]
    let prev: Pt | undefined
    const n = 18
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const w = 5.5 - t * 3.5
      const pt: Pt = side
        ? [
            start[0] - 1 - t * (7 + Math.abs(hf) * 1.5) - hf * t * 2,
            start[1] + 1 + t * 20 + Math.sin(t * 3 + hf * 0.3) * 1.5
          ]
        : [start[0] + Math.sin(t * 3.2) * 2 + hf * t * 1.6, start[1] + 4 + t * 22]
      if (prev) bar(l, prev, pt, Math.max(2, Math.round(w)), HAIR[1])
      prev = pt
    }
    shadeEdges(l, HAIR, 1, true)
    for (let i = 3; i < 18; i += 3) l.paint(start[0] + (side ? -2 - i * 0.3 : 1), start[1] + 3 + i, HAIR[2])
  })
  paint.add(0.5, (l) => {
    // neck + face
    l.rect(hcx - 3, hcy + 7, 6, 5, SKIN[2])
    for (let y = hcy - 10; y <= hcy + 11; y++)
      for (let x = hcx - 11; x <= hcx + 11; x++) {
        const dx = x + 0.5 - hcx
        const dy = y + 0.5 - hcy
        let inside: boolean
        if (side)
          inside = (dx / 8.2) ** 2 + (dy / 9) ** 2 <= 1 || (dy > 1 && dy < 10 && dx > -3 && dx < 8 - (dy - 1) * 0.55)
        else
          inside =
            (dx / 8.2) ** 2 + (dy / 9) ** 2 <= 1 && dy < 3
              ? true
              : dy >= 3 && dy < 10.5 && Math.abs(dx) < 8 - (dy - 3) * 0.95
        if (inside) l.set(x, y, SKIN[1])
      }
    shadeEdges(l, SKIN, 1, false)
    const ink = HAIR[4]
    if (view === 'down') {
      for (const s of [-1, 1]) {
        const ex = hcx + (s < 0 ? -6 : 2)
        if (hurt) {
          l.rect(ex, hcy + 2, 4, 1, ink)
          l.set(ex + (s < 0 ? 0 : 3), hcy + 1, ink)
        } else if (eyes > 0.3) {
          l.rect(ex, hcy + 1, 4, 3, R.holy[1])
          l.rect(ex + 1, hcy + 2, 2, 1, C.white)
          l.set(ex - 1, hcy + 2, R.holy[2])
          l.set(ex + 4, hcy + 2, R.holy[2])
          l.rect(ex, hcy, 4, 1, GOLD[2])
        } else {
          l.rect(ex, hcy + 1, 4, 1, ink)
          l.rect(ex, hcy + 2, 4, 2, R.jobBlue[1])
          l.rect(ex + (s < 0 ? 2 : 0), hcy + 2, 2, 2, R.jobBlue[2])
          l.set(ex + (s < 0 ? 0 : 3), hcy + 2, C.white)
          l.set(ex + 1, hcy + 3, C.black)
        }
        // brow: inner end lower
        for (let i = 0; i < 5; i++) {
          const inner = s < 0 ? 4 - i : i
          l.set(ex - 0.5 + i, hcy - 1 + (inner < 2 ? 1 : 0) + (hurt ? -1 : 0), HAIR[3])
        }
      }
      l.set(hcx, hcy + 5, SKIN[2])
      l.rect(hcx - 1, hcy + 7, 3, 1, hurt ? R.jobRed[3] : SKIN[3])
      if (p.face === 'shout') l.rect(hcx - 1, hcy + 7, 3, 2, C.black)
    } else if (side) {
      const ex = hcx + 3
      if (hurt) l.rect(ex, hcy + 2, 3, 1, ink)
      else if (eyes > 0.3) {
        l.rect(ex, hcy + 1, 3, 2, R.holy[1])
        l.set(ex + 1, hcy + 1, C.white)
        l.set(ex + 3, hcy + 1, R.holy[2])
      } else {
        l.rect(ex, hcy + 1, 3, 1, ink)
        l.rect(ex + 1, hcy + 2, 2, 2, R.jobBlue[1])
        l.set(ex + 2, hcy + 2, C.white)
      }
      for (let i = 0; i < 4; i++) l.set(ex - 1 + i, hcy - 1 + (i < 2 ? 1 : 0), HAIR[3])
      l.set(hcx + 8, hcy + 3, SKIN[1])
      l.set(hcx + 8, hcy + 4, SKIN[2])
      l.rect(hcx + 4, hcy + 7, 3, 1, SKIN[3])
      l.set(hcx - 2, hcy + 3, SKIN[2])
      l.set(hcx - 2, hcy + 4, SKIN[2])
    }
  })
  paint.add(0.52, (l) => {
    // hair: swept fringe with a few long locks, short sides
    const rx = 9.8
    for (let y = hcy - 13; y <= hcy + 8; y++)
      for (let x = hcx - 12; x <= hcx + 12; x++) {
        const dx = x + 0.5 - hcx
        const dy = y + 0.5 - hcy
        const big = (dx / rx) ** 2 + ((dy + 1.6) / 10.6) ** 2 <= 1
        let on = false
        if (view === 'up') on = big || (Math.abs(dx) < 9 && dy > 0 && dy < 7.5 - Math.abs(dx) * 0.4)
        else if (view === 'down') {
          const lock = [2, 5, 1, 4, 7, 2, 5, 3, 0, 6, 1, 4, 7, 2, 0, 5, 3, 1, 6, 2, 4][Math.floor(dx + 10)] ?? 1
          const fringe = hcy - 5 + lock * 0.5 + (Math.abs(dx) < 2 ? 0.6 : 0)
          on = big && (y < fringe || (Math.abs(dx) > 7.2 && dy < 5.4))
        } else {
          const fringe = -4.8 + Math.max(0, dx - 1) * 0.3 + (dx > 5.5 ? 2 : 0) + (Math.floor(dx + 10) % 3) * 0.5
          on = big && ((dx < 0.6 && dy < 5) || dy < fringe)
        }
        if (on) l.set(x, y, HAIR[1])
      }
    shadeEdges(l, HAIR, 1, true)
    for (const [dx, dy, c] of [
      [-5, -8, HAIR[0]],
      [-4, -9, HAIR[0]],
      [-6, -6, HAIR[0]],
      [1, -9, HAIR[2]],
      [3, -7, HAIR[2]],
      [-1, -6, HAIR[2]],
      [5, -8, HAIR[2]]
    ] as [number, number, number][])
      l.paint(hcx + dx, hcy + dy, c)
    // the gold hair tie
    if (view !== 'down') l.rect(side ? hcx - 9 : hcx - 1, side ? hcy - 4 : hcy - 3, side ? 2 : 3, side ? 3 : 2, GOLD[1])
  })

  const body = paint.render()
  const out = new Raster(128, 128)

  // ---- aura under the body (phase 2)
  const aura = p.aura ?? 0
  if (aura > 0.05) {
    const cx = 64
    const cy = 78
    for (let y = 18; y < 124; y++)
      for (let x = 20; x < 108; x++) {
        const dx = (x + 0.5 - cx) / (30 + aura * 8)
        const dy = (y + 0.5 - cy) / (44 + aura * 6)
        const r = Math.hypot(dx, dy)
        if (r > 1) continue
        const t = (1 - r) * aura
        // flame-like edge: wobble the radius by column.
        if (bayer(x, y) < t * 0.7 && ((x * 7 + y * 3 + Math.round(flow * 3)) % 9 < 6 || r < 0.6))
          out.set(x, y, t > 0.5 ? R.holy[1] : R.holy[2])
      }
  }
  out.blit(body)

  // ---- brightening and dissolving
  if (p.bright) out.map((c, x, y) => (bayer(x, y) < p.bright! ? LIGHTER[c] : c))
  if (p.fade) {
    const rnd = rng(99 + (p.seed ?? 0))
    out.map((c, x, y) => (bayer(x, y) + rnd() * 0.25 < p.fade! * 1.15 ? 0 : c))
  }

  // ---- light motes
  const motes = p.motes ?? 0
  if (motes > 0) {
    const rnd = rng(1234 + (p.seed ?? 0) * 77)
    const n = Math.round(10 + motes * 16)
    for (let i = 0; i < n; i++) {
      const col = [C.white, R.holy[0], C.glow, R.holy[1]][i % 4]
      if (p.moteKind === 'gather') {
        const a = rnd() * Math.PI * 2
        const dist = 3 + (1 - motes) * (10 + rnd() * 22) + rnd() * 3
        const x = Math.round(tipPos[0] + Math.cos(a) * dist)
        const y = Math.round(tipPos[1] + Math.sin(a) * dist * 0.8)
        out.set(x, y, col)
        if (i % 3 === 0) out.set(x + Math.sign(tipPos[0] - x), y + Math.sign(tipPos[1] - y), R.holy[2])
      } else {
        const x = Math.round(36 + rnd() * 56)
        const y = Math.round(118 - ((rnd() * 80 + motes * 30) % 90))
        out.set(x, y, col)
        if (i % 4 === 0) {
          out.set(x - 1, y, R.holy[1])
          out.set(x + 1, y, R.holy[1])
          out.set(x, y - 1, R.holy[1])
          out.set(x, y + 1, R.holy[1])
        }
      }
    }
    // gathering glow on the blade tip
    if (p.moteKind === 'gather') {
      const r = 3 + motes * 5
      for (let y = Math.floor(tipPos[1] - r - 3); y <= tipPos[1] + r + 3; y++)
        for (let x = Math.floor(tipPos[0] - r - 3); x <= tipPos[0] + r + 3; x++) {
          const dd = Math.hypot(x + 0.5 - tipPos[0], y + 0.5 - tipPos[1])
          if (dd > r + 3) continue
          if (dd < r * 0.55) out.set(x, y, C.white)
          else if (dd < r) out.set(x, y, R.holy[1])
          else dither(out, x, y, 0.45, R.holy[2])
        }
    }
  }

  const finished = despeckle(out)
  // ---- holy bubble (translucent): a dithered shell with a bright rim
  const bub = p.bubble ?? 0
  if (bub > 0) {
    const rx = 36 * bub
    const ry = 46 * bub
    const cx = 64
    const cy = 78
    for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        const r = Math.hypot(dx, dy)
        if (r > 1.0) continue
        if (r > 0.93) finished.set(x, y, dx + dy < -0.4 ? C.white : r > 0.97 ? R.holy[1] : R.holy[2])
        else if (!finished.get(x, y) || bayer(x, y) < 0.1) {
          const lit = dx + dy < -0.5 ? 0.5 : 0.28 + r * 0.2
          if ((hash(x, y, 7) % 100) / 100 < lit * 0.5 && (x + y) % 2 === 0)
            finished.set(x, y, dx + dy < -0.5 ? R.holy[0] : R.holy[1])
        }
      }
    // highlight arcs and sparkles on the shell
    for (let a = 200; a < 250; a += 3) {
      const t = (a * Math.PI) / 180
      finished.set(cx + Math.cos(t) * rx * 0.86, cy + Math.sin(t) * ry * 0.86, C.white)
    }
    finished.set(cx + rx * 0.5, cy - ry * 0.75, C.white)
    finished.set(cx + rx * 0.5 + 1, cy - ry * 0.75, R.holy[0])
    finished.set(cx + rx * 0.5 - 1, cy - ry * 0.75, R.holy[0])
    finished.set(cx + rx * 0.5, cy - ry * 0.75 - 1, R.holy[0])
    finished.set(cx + rx * 0.5, cy - ry * 0.75 + 1, R.holy[0])
  }
  return finished
}

/** A frame plus the dashing afterimages (toned, dithered copies trailing behind). */
function renderFrame(view: View, p: LeonPose): Raster {
  const main = renderLeon(view, p)
  if (!p.ghost) return main
  const out = new Raster(128, 128)
  const tone = toneTable([R.ice[0], R.ice[1], R.ice[2], R.ice[3]])
  for (let g = p.ghost; g >= 1; g--) {
    const ghost = renderLeon(view, { ...p, ghost: 0, at: vadd(p.at, V(-8 * g, 0, 0)), aura: 0 })
    ghost.map((c, x, y) => (bayer(x + g, y) < 0.62 - g * 0.15 ? tone[c] : 0))
    out.blit(ghost)
  }
  return out.blit(main)
}

// ---------------------------------------------------------------------------------------------------------
// Animations

const S = (p: number, extra: object = {}, y = 0) => ({ aim: { p, y }, glow: 0.5, ...extra })

const BASE: Partial<LeonPose> = {
  lean: 1.5,
  crouch: 1,
  mainHand: V(8, 2.4, -6),
  main: S(130),
  offHand: V(1.5, 1.6, -14),
  mainFoot: V(1, 3.6, 0),
  offFoot: V(-1, 3.6, 0)
}
const P = (...ps: Partial<LeonPose>[]) => pose(Object.assign({}, BASE, ...ps)) as LeonPose

function stride(i: number, n: number, amp: number, bobAmp = 1.6): Partial<LeonPose> {
  const a = (i / n) * Math.PI * 2
  const lift = (x: number) => 5 * Math.max(0, Math.cos(x))
  return {
    mainFoot: V(amp * Math.sin(a), 3.6, lift(a)),
    offFoot: V(-amp * Math.sin(a), 3.6, lift(a + Math.PI)),
    bob: -bobAmp * Math.abs(Math.sin(a)) + 0.6,
    flow: Math.cos(a) * 2
  }
}

type Maker = (i: number) => LeonPose

const MOVES: Record<string, Maker> = {
  idle: (i) =>
    P({
      bob: [0, -0.6, -1, -0.5][i],
      flow: [0, 1, 2, 1][i],
      main: S([128, 130, 133, 130][i], { glow: 0.5 + i * 0.1 }),
      offHand: V(1.5, 1.6, -14 - [0, 0.4, 0.8, 0.4][i]),
      head: V(0, 0, [0, 0, -0.4, -0.2][i])
    }),
  walk: (i) => P(stride(i, 6, 6), { lean: 3, mainHand: V(6 + 2.5 * Math.sin((i / 6) * 6.283), 2.4, -8), main: S(128) }),
  windup: (i) =>
    P({
      crouch: [3, 6, 8][i],
      lean: [-2, -5, -6][i],
      two: true,
      mainHand: V([3, -1, -3][i], 3, [4, 11, 13][i]),
      main: S([-30, -62, -78][i], { glow: [0.9, 1.3, 1.8][i] }),
      flow: [2, 5, 7][i],
      head: V(-1, 0, 0.6),
      face: 'shout',
      mainFoot: V([4, 5, 5][i], 3.6, 0),
      offFoot: V(-5, 3.6, 0)
    }),
  slash: (i) => {
    const smear = [undefined, { p: -78 }, { p: -40 }, { p: 110, y: 0 }, { p: 150 }][i]
    return P({
      crouch: [7, 5, 5, 4, 3][i],
      lean: [-5, 3, 8, 6, 3][i],
      sway: [1, 0, -1, -2, 0][i],
      two: i < 4,
      mainHand: [V(-3, 4, 13), V(6, 4, 10), V(12, 2, -2), V(9, 5, -9), V(7, 3, -9)][i],
      main: S([-78, 12, 112, 160, 128][i], { glow: 1.6, ...(smear ? { smear } : {}) }, [0, 0, 0, 16, -18][i]),
      face: 'shout',
      flow: [5, 1, -5, -3, 1][i],
      mainFoot: V([5, 6, 8, 7, 6][i], 3.8, 0),
      offFoot: V(-6, 3.8, 0)
    })
  },
  dash: (i) =>
    P({
      ...stride(i, 3, 9, 1.2),
      lean: 8,
      crouch: 9,
      two: true,
      mainHand: V(7, 3, -3),
      main: S(98, { glow: 1.5 }),
      flow: -9 - (i % 2) * 2,
      ghost: 2,
      face: 'shout',
      head: V(2, 0, -1),
      mainFoot: V(8, 4, i === 1 ? 2 : 0),
      offFoot: V(-9, 4, i === 1 ? 0 : 3)
    }),
  pillar: (i) =>
    P({
      crouch: [6, 3, 0, 0, 1, 3][i],
      lean: [3, -1, -3, -4, 3, 2][i],
      two: true,
      mainHand: [V(7, 3, -8), V(4, 3, 5), V(3, 2, 11), V(2, 2, 13), V(9, 3, 4), V(8, 3, -6)][i],
      main: S([160, 40, 8, 0, 70, 120][i], { glow: [0.8, 1.2, 1.7, 2, 2, 1][i] }),
      face: i > 3 ? 'shout' : 'focus',
      motes: [0, 0.2, 0.5, 0.85, 1, 0][i],
      moteKind: 'gather',
      seed: i,
      bright: [0, 0, 0.05, 0.12, 0.3, 0][i],
      flow: [0, 2, 4, 5, -3, 0][i],
      head: V(-1, 0, [0, 0.5, 1, 1.2, 0, 0][i]),
      mainFoot: V(4, 4, 0),
      offFoot: V(-4, 4, 0)
    }),
  shield: (i) =>
    P({
      crouch: 3 + (i % 2) * 0.6,
      lean: 2,
      two: true,
      mainHand: V(8, 1.4, -10),
      main: S(171, { glow: 1.2 }),
      face: 'focus',
      bubble: [0.97, 1, 1.03, 1][i],
      flow: [1, 0, -1, 0][i],
      mainFoot: V(4, 4, 0),
      offFoot: V(-4, 4, 0),
      bright: [0.1, 0.18, 0.1, 0.05][i]
    }),
  awaken: (i) => {
    const wings = [0, 0, 0, 0.25, 0.55, 0.85, 1, 1][i]
    return P({
      crouch: [2, 8, 11, 5, 0, 0, 0, 0][i],
      lean: [1, 4, 6, 0, -2, -2, -3, -3][i],
      two: i < 3,
      mainHand: [
        V(8, 2.4, -9),
        V(9, 2, -11),
        V(9, 1.6, -14),
        V(5, 7, 4),
        V(3, 9, 2),
        V(3, 9, 3),
        V(3, 9, 4),
        V(3, 9, 4)
      ][i],
      offHand: [V(2, 4, -12), V(2, 4, -12), V(2, 4, -12), V(2, 8, 1), V(1, 9, 3), V(1, 9, 4), V(1, 9, 4), V(1, 9, 5)][
        i
      ],
      main: S([142, 168, 174, 20, 28, 24, 20, 22][i], { glow: [0.5, 0.8, 1, 1.5, 2, 2.2, 2.4, 2.4][i] }),
      face: i === 2 ? 'focus' : 'normal',
      head: V(i === 2 ? 2 : 0, 0, i === 2 ? -3 : i > 3 ? 1.2 : 0),
      at: V(0, 0, [0, 0, 0, 0, 1.5, 3, 4, 4.5][i]),
      aura: [0, 0.12, 0.3, 0.5, 0.7, 0.85, 1, 1][i],
      wings,
      eyes: [0, 0, 0.2, 1, 1, 1, 1, 1][i],
      bright: [0, 0, 0.05, 0.12, 0.2, 0.3, 0.4, 0.5][i],
      motes: [0, 0, 0.3, 0.5, 0.7, 0.9, 1, 1][i],
      moteKind: 'rise',
      seed: i,
      flow: [0, 2, 4, 6, 9, 10, 11, 11][i],
      mainFoot: V(3, 4, [0, 0, 0, 0, 1, 2, 3, 3][i]),
      offFoot: V(-3, 4, [0, 0, 0, 0, 1, 2, 3, 3][i])
    })
  },
  broken: (i) => {
    const sw = [-1.5, 0, 1.5, 0][i]
    return P({
      crouch: 14 + [0, 0.6, 0, -0.4][i],
      lean: 8 + sw * 0.4,
      two: true,
      mainHand: V(10, 1.4, 6),
      main: S(174, { glow: 0.05 }),
      face: 'focus',
      head: V(3, 0, -3 + sw * 0.3),
      flow: [-1, 0, 1, 0][i],
      sway: sw * 0.5,
      mainFoot: V(8, 4, 0),
      offFoot: V(-9, 4, 1.2)
    })
  },
  hurt: (i) =>
    P({
      lean: [-7, -5][i],
      crouch: [4, 6][i],
      bob: -1,
      face: 'hurt',
      head: V([-3, -2][i], 0, -1),
      mainHand: V(2, 6, -12),
      main: S(122, { glow: 0.2 }),
      offHand: V(-2, 6, -12),
      flow: [5, 3][i],
      mainFoot: V(3, 4, 0),
      offFoot: V(-6, 4, 0)
    }),
  death: (i) => {
    const t = [
      { crouch: 4, lean: -6, face: 'hurt' as const },
      { crouch: 9, lean: -2, face: 'hurt' as const },
      { crouch: 14, lean: 3, face: 'dead' as const },
      { crouch: 16, lean: 7, face: 'dead' as const },
      { crouch: 16, lean: 8, face: 'dead' as const },
      { crouch: 16, lean: 8, face: 'dead' as const },
      { crouch: 16, lean: 8, face: 'dead' as const },
      { crouch: 16, lean: 8, face: 'dead' as const }
    ][i]
    return P(t, {
      two: i > 1,
      mainHand: i > 1 ? V(10, 1.4, 6) : V(3, 6, -12),
      main: S(i > 1 ? 175 : 125, { glow: Math.max(0, 0.8 - i * 0.15) }),
      head: V(i > 2 ? 4 : 0, 0, i > 2 ? -4 : 0),
      flow: i > 3 ? 1 : 3,
      mainFoot: V(i > 1 ? 8 : 3, 4, 0),
      offFoot: V(i > 1 ? -9 : -5, 4, i > 1 ? 1.2 : 0),
      fade: [0, 0, 0, 0, 0.2, 0.4, 0.62, 0.8][i],
      motes: i > 3 ? 0.5 + (i - 4) * 0.15 : 0,
      moteKind: 'rise',
      seed: i,
      aura: i > 3 ? 0.4 : 0
    })
  }
}

export function buildLeonSheet(): Sheet {
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(BOSS_SPEC.leon)) {
    const [base, dir] = name.split('_') as [string, View | undefined]
    const view: View = dir ?? 'side'
    const make = MOVES[base]
    const out = Array.from({ length: want.frames }, (_, i) => renderFrame(view, make(i)))
    const a: Anim = anim(out, want.fps, want.loop)
    if (base === 'death') a.alpha = [1, 1, 1, 1, 0.9, 0.75, 0.5, 0.25]
    sheet[name] = a
  }
  return sheet
}
