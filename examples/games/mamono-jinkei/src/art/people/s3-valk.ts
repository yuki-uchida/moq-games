/**
 * 竜騎士ヴァルク (`boss:valk`, 192×192, feet/shadow anchor (96, 176)): a dark-teal dragoon with a winged helm and a
 * pennant lance riding a bronze-green wyvern. Drawn natively with the guild rig's 3D-lite projection (forward / right
 * / up in px → down / up / side views), shaded tubes for the body, neck, tail, legs and limbs and membrane polygons
 * for the wings. Poses are plain data (`VP`), every animation just lists poses.
 */
import { BOSS_SPEC } from '../contract'
import { C, LIGHTER, R } from '../palette'
import { Raster, ball, bayer, despeckle, outline, shadeEdges, shadeIndex, type Ramp } from '../raster'
import { anim, type Sheet } from '../sheet'
import { Cam, Painter, V, aimDir, farRamp, ik, vadd, vlerp, vscale, type Pt, type V3, type View } from './rig'

const W = 192
const SC = R.clothForest // wyvern scales
const BELLY = R.wolfCream
const MEM = R.leather // wing membrane
const BRZ = R.clothOchre // bronze trim, horns, claws
const ARM = R.nightLeaf // dragoon armour
const STEEL = R.steel
const CRIM = R.clothCrimson

const rad = (d: number) => (d * Math.PI) / 180
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const flip = (v: V3, s: number): V3 => V(v.f, v.r * s, v.u)

// ---------------------------------------------------------------------------------------------------------
// Shaded tube: circles along a polyline, each pixel shaded from the nearest circle's normal (top-left light).

const bestQ = new Float32Array(W * W)
const bestI = new Int32Array(W * W)

function tube(l: Raster, pts: Pt[], rs: number[], ramp: Ramp, belly?: Ramp, stripe = 0) {
  const samples: [number, number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.6))
    for (let k = 0; k < (i === pts.length - 2 ? n + 1 : n); k++) {
      const t = k / n
      samples.push([lerp(x0, x1, t), lerp(y0, y1, t), lerp(rs[i], rs[i + 1], t)])
    }
  }
  let minX = W
  let minY = W
  let maxX = 0
  let maxY = 0
  for (const [cx, cy, r] of samples) {
    minX = Math.min(minX, Math.floor(cx - r))
    minY = Math.min(minY, Math.floor(cy - r))
    maxX = Math.max(maxX, Math.ceil(cx + r))
    maxY = Math.max(maxY, Math.ceil(cy + r))
  }
  minX = Math.max(0, minX)
  minY = Math.max(0, minY)
  maxX = Math.min(W - 1, maxX)
  maxY = Math.min(W - 1, maxY)
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) bestQ[y * W + x] = 9
  samples.forEach(([cx, cy, r], si) => {
    const x0 = Math.max(minX, Math.floor(cx - r))
    const x1 = Math.min(maxX, Math.ceil(cx + r))
    const y0 = Math.max(minY, Math.floor(cy - r))
    const y1 = Math.min(maxY, Math.ceil(cy + r))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / r
        const dy = (y + 0.5 - cy) / r
        const q = dx * dx + dy * dy
        if (q > 1.0001 || q >= bestQ[y * W + x]) continue
        bestQ[y * W + x] = q
        bestI[y * W + x] = si
        const idx = shadeIndex(dx, dy, Math.sqrt(Math.max(0, 1 - q)), false)
        if (belly && dy > 0.3) {
          const band = stripe && si % stripe < Math.max(1, stripe >> 2) ? 2 : idx
          l.set(x, y, belly[Math.max(idx, band)])
        } else l.set(x, y, ramp[idx])
      }
  })
}

// ---------------------------------------------------------------------------------------------------------
// Pose

export interface VP {
  /** Wing stroke: -1 up .. +1 down. */
  wing: number
  /** 0 spread .. 1 folded against the flank. */
  fold: number
  /** Wing sag (tips hang down). */
  droop: number
  /** Whole-body pitch (deg, + nose up), pivoted about `pivot`. */
  tilt: number
  pivot: V3
  at: V3
  /** 0 standing, 1 tucked for flight, 2 sprawled. */
  legs: number
  /** Head position and pitch (deg above horizontal); jaw 0..1. */
  head: V3
  hpitch: number
  jaw: number
  /** Tail wave phase and lift. */
  wave: number
  tailLift: number
  /** Lance pitch (deg from straight up toward forward) and rider forward lean (px). */
  lance: number
  lean: number
  flow: number
  face: 'normal' | 'hurt' | 'dead'
  dizzy?: number
  riderFree?: { at: V3; tilt: number }
  /** Brighten the whole frame (hit flash). */
  flash?: boolean
}

const vp = (p: Partial<VP> = {}): VP => ({
  wing: 0,
  fold: 0,
  droop: 0,
  tilt: 0,
  pivot: V(0, 0, 40),
  at: V(),
  legs: 0,
  head: V(40, 0, 68),
  hpitch: -8,
  jaw: 0,
  wave: 0,
  tailLift: 0,
  lance: 98,
  lean: 2,
  flow: 0,
  face: 'normal',
  ...p
})

/** The shift that keeps `pivot` fixed when the Cam rotates by `tilt` degrees. */
function pivotAt(tilt: number, pv: V3): V3 {
  const a = rad(tilt)
  const c = Math.cos(a)
  const s = Math.sin(a)
  return V(pv.f - (pv.f * c - pv.u * s), 0, pv.u - (pv.f * s + pv.u * c))
}

// ---------------------------------------------------------------------------------------------------------
// Renderer

function renderValk(view: View, p: VP): Raster {
  const at0 = pivotAt(p.tilt, p.pivot)
  const cam = new Cam(view, 96, 176, p.tilt, vadd(at0, p.at))
  const paint = new Painter(W, W)
  const side = view === 'side'
  const px = (v: V3): Pt => cam.px(v)
  // Wing projection. From the side the span leans toward the viewer (near wing lower, far wing above the back)
  // like the 3/4 camera; from the front, trailing parts drop lower on screen instead of collapsing onto the
  // leading edge.
  const qs = cam.place(V(6, 0, 54))
  const wpx = (v: V3): Pt => {
    const q = cam.place(v)
    if (side) return [96 + q.f - 0.15 * Math.max(0, Math.abs(q.r) - 11), 176 - q.u + 0.45 * q.r]
    if (view === 'down') return [96 - q.r, 176 - q.u + qs.f * 0.5 - 0.4 * (q.f - qs.f)]
    return cam.px(v)
  }
  const dz = (s: number, down: number, up: number) => (side ? s : view === 'down' ? down : up)
  const tuck = p.legs
  const dead = p.face === 'dead'

  // ---- Tail (behind everything from the side/front, nearest from behind).
  const tailPts: V3[] = []
  for (let i = 0; i < 7; i++) {
    const t = i / 6
    tailPts.push(
      V(
        -24 - t * 64,
        Math.sin(p.wave + i * 0.8) * (2 + t * 7) * (view === 'side' ? 0.6 : 1.2),
        34 - t * 8 + Math.sin(p.wave * 1 + i * 0.7) * 3 * t + p.tailLift * t * t
      )
    )
  }
  const tp = tailPts.map(px)
  paint.add(dz(-6, -60, 60), (l) => tube(l, tp, [11, 9.5, 8, 6.5, 5, 3.6, 2.6], SC, BELLY, 7))
  // Spade tip: a leaf-shaped blade, bronze, pointing along the tail's end.
  paint.add(dz(-6, -60, 60), (l) => {
    const e = tp[6]
    const a = tp[5]
    const dx = e[0] - a[0]
    const dy = e[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    const ux = dx / L
    const uy = dy / L
    const nx = -uy
    const ny = ux
    const base: Pt = [e[0] + ux * 1, e[1] + uy * 1]
    const tip: Pt = [e[0] + ux * 12, e[1] + uy * 12]
    const m1: Pt = [e[0] + ux * 6 + nx * 6, e[1] + uy * 6 + ny * 6]
    const m2: Pt = [e[0] + ux * 6 - nx * 6, e[1] + uy * 6 - ny * 6]
    l.poly([base[0], base[1], m1[0], m1[1], tip[0], tip[1], m2[0], m2[1]], BRZ[1])
    l.line(base[0], base[1], tip[0], tip[1], BRZ[2])
    l.line(m1[0], m1[1], tip[0], tip[1], BRZ[0])
    shadeEdges(l, BRZ, 1, false)
  })

  // ---- Hind legs.
  const footFor = (s: number): V3 => {
    const stand = V(-14, s * 12, 1)
    const tucked = V(-40, s * 7, 27)
    const spr = V(-6, s * 22, 12)
    return tuck <= 1 ? vlerp(stand, tucked, tuck) : vlerp(tucked, spr, tuck - 1)
  }
  for (const s of [-1, 1]) {
    const hip = V(-20, s * 10, 35)
    const foot = footFor(s)
    const { mid, end } = ik(hip, foot, 17, 17, V(1, s * 0.4, 0.2))
    const dep = dz(s * 9, -18, 12)
    const pts = [px(hip), px(mid)]
    paint.add(dep, (l) => {
      tube(l, pts, [7.6, 5.6], SC)
      tube(l, [px(mid), px(end)], [4.6, 3], SC)
    })
    paint.add(dep + 0.1, (l) => {
      const e = px(end)
      for (const k of [-1, 0, 1]) {
        const tip = px(vadd(end, V(9, k * 3, -0.5 + Math.abs(k) * 0.6)))
        tube(l, [e, tip], [2.4, 0.9], BRZ)
      }
      const heel = px(vadd(end, V(-5, 0, 1.5)))
      tube(l, [e, heel], [2, 0.8], BRZ)
    })
  }

  // ---- Wings: broad bat-like membranes (dark leather) stretched between light finger bones, with a light
  // leading edge along the arm and first finger and a scalloped trailing edge.
  const wingState = (s: number) => {
    const g = lerp(rad(72), rad(side ? -24 : -27), (p.wing + 1) / 2) - p.droop
    const S0 = V(6, s * 11, 54)
    const L1 = 24
    const lens = side ? [52, 55, 49, 41] : [52, 55, 49, 40]
    let Wr: V3
    let tips: V3[]
    if (side) {
      // From the side the fingers fan in the wing plane (span rotated about the body axis by the stroke, chord
      // pointing back), so the chord lies along the screen and the membrane stays broad through the whole beat.
      const e1 = V(-0.22, s * Math.cos(g), Math.sin(g))
      Wr = vadd(S0, vscale(e1, L1))
      tips = lens.map((len, i) => {
        const ph = -0.3 + i * 0.6
        const c = Math.cos(ph) * len
        return vadd(Wr, V(e1.f * c - Math.sin(ph) * len, e1.r * c, e1.u * c - p.droop * len * 0.12 * (i + 1)))
      })
    } else {
      // From the front and back the fingers fan in the screen plane; on the downstroke they close a little so the
      // trailing ones do not fold under the body.
      Wr = vadd(S0, V(-6, s * L1 * Math.cos(g), L1 * Math.sin(g)))
      const fo = [20, 4, -14, -30]
      const step = lerp(0.52, 0.38, Math.max(0, p.wing))
      tips = lens.map((len, i) => {
        const gi = g + 0.32 - step * i - p.droop * 0.5
        return vadd(Wr, V(fo[i], s * len * Math.cos(gi), len * Math.sin(gi)))
      })
    }
    // Folded: the wrist stands up beside the shoulder and the fingers sweep back and down along the flank, so
    // the membrane still reads as a tall, scalloped cloak.
    const Wf = vadd(S0, side ? V(-14, s * 15, 26) : V(-14, s * 15, 18))
    const tipsF = [0, 1, 2, 3].map((i) =>
      vadd(S0, side ? V(-26 - i * 11, s * (18 + i * 3), 30 - i * 7) : V(-22 - i * 9, s * (19 + i * 3.5), 24 - i * 13))
    )
    const k = side ? Math.min(1, p.fold * 1.25) : p.fold
    return {
      S0,
      Wr: vlerp(Wr, Wf, k),
      tips: tips.map((t, i) => vlerp(t, tipsF[i], k)),
      back: V(-24, s * 13, 38)
    }
  }
  // Membrane: the darkest leather with a lit rim; the far wing has no rim.
  const MEMR: Ramp = [MEM[2], MEM[3], MEM[3], MEM[3], MEM[4]]
  const BONE: Ramp = [SC[0], SC[0], SC[1], SC[2], SC[4]]
  for (const s of [-1, 1]) {
    const w = wingState(s)
    const sp = wpx(w.S0)
    const wr = wpx(w.Wr)
    const tipsP = w.tips.map(wpx)
    const bk = wpx(w.back)
    const far = side && s < 0
    const mem: Ramp = far ? [MEM[3], MEM[3], MEM[3], MEM[3], MEM[4]] : MEMR
    // From the side the near wing lies over the flank but under the rider, and passes in front of the hind leg on
    // the downstroke.
    const dep = dz(s > 0 ? (p.wing > 0.2 && p.fold < 0.5 ? 9.5 : 6.9) : -8, -10, -3)
    paint.add(dep, (l) => {
      const pts: number[] = [sp[0], sp[1], wr[0], wr[1]]
      const edge = [...tipsP, bk]
      for (let i = 0; i < edge.length; i++) {
        pts.push(edge[i][0], edge[i][1])
        const nx = edge[i + 1]
        if (nx) {
          // Scallop: the trailing edge between two fingers sags toward the wrist.
          const mx = (edge[i][0] + nx[0]) / 2
          const my = (edge[i][1] + nx[1]) / 2
          const pull = i === edge.length - 2 ? 0.16 : 0.26
          pts.push(lerp(mx, wr[0], pull), lerp(my, wr[1], pull))
        }
      }
      l.poly(pts, mem[1])
      shadeEdges(l, mem, 1, true)
      // Thin, sunlit membrane toward the finger tips (2×2 ordered dither that survives despeckle).
      if (!far)
        for (let y = 0; y < W; y++)
          for (let x = 0; x < W; x++) {
            if (l.get(x, y) !== mem[1]) continue
            const d = Math.hypot(x - wr[0], y - wr[1]) / 46
            if (d > 0.72 && bayer(x >> 1, y >> 1) < (d - 0.72) * 0.8) l.set(x, y, MEM[2])
          }
    })
    paint.add(
      dep + 0.05,
      (l) => {
        // Finger bones (light), drawn without their own outline so they read as ribs inside the membrane.
        for (let i = 1; i < tipsP.length; i++) tube(l, [wr, tipsP[i]], [2.2 - i * 0.2, 0.9], far ? SC : BONE)
      },
      false
    )
    paint.add(dep + 0.06, (l) => {
      // Arm and first finger: the light leading edge, with a bronze claw at the wrist.
      tube(l, [sp, wr], [4.6, 3.2], far ? SC : BONE)
      tube(l, [wr, tipsP[0]], [2.8, 1], far ? SC : BONE)
      tube(l, [wr, [wr[0] + (side ? 3 : 0), wr[1] - 6]], [2.2, 0.8], BRZ)
    })
  }

  // ---- Body.
  const hipP = px(V(-22, 0, 37))
  const midP = px(V(-4, 0, 40))
  const chestP = px(V(14, 0, 42))
  paint.add(0, (l) => tube(l, [hipP, midP, chestP], [15, 18.5, 17], SC, BELLY, 8))

  // ---- Neck (S-curve) and head.
  const hd = p.head
  const hdir = V(Math.cos(rad(p.hpitch)), 0, Math.sin(rad(p.hpitch)))
  const nb = V(18, 0, 49)
  const hb = vadd(hd, vscale(hdir, -4))
  const c1 = V(30, 0, 52)
  const c2 = vadd(hb, V(-9, 0, -9))
  const neckPts: V3[] = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const u = 1 - t
    const b = (a: number, b1: number, c: number, d: number) =>
      u * u * u * a + 3 * u * u * t * b1 + 3 * u * t * t * c + t * t * t * d
    return V(b(nb.f, c1.f, c2.f, hb.f), 0, b(nb.u, c1.u, c2.u, hb.u))
  })
  const np = neckPts.map(px)
  paint.add(dz(1, 12, -8), (l) => tube(l, np, [11.5, 9.6, 8.2, 7.6, 7.4], SC, BELLY, 6))
  // Bronze spines along neck and tail.
  paint.add(
    dz(1.2, 12.5, -8),
    (l) => {
      const spots = [
        ...np.slice(0, 5).map((q, i) => [q, 4 - i * 0.3] as const),
        ...tp.slice(1, 6).map((q, i) => [q, 3.6 - i * 0.5] as const)
      ]
      for (const [q, h] of spots) {
        l.poly(
          [
            q[0] - 2,
            q[1] - (side ? 5 : 3),
            q[0] + 1,
            q[1] - (side ? 5.5 : 4) - h * 0.6,
            q[0] + (side ? -1 : 2),
            q[1] - 6 - h
          ],
          BRZ[1]
        )
        l.set(q[0], q[1] - 6, BRZ[0])
      }
    },
    false
  )

  // Head: mouth interior, lower jaw, skull, snout, horns, eyes.
  const open = p.jaw
  const jdir = V(Math.cos(rad(p.hpitch - open * 36)), 0, Math.sin(rad(p.hpitch - open * 36)))
  const hdep = dz(3, 20, -14)
  const jawTip = vadd(hd, vadd(vscale(jdir, 21), V(0, 0, -5.6)))
  if (open > 0.2) {
    paint.add(hdep - 0.2, (l) => {
      const m = [
        vadd(hd, vadd(vscale(hdir, 3), V(0, 0, -2.4))),
        vadd(hd, vadd(vscale(hdir, 16), V(0, 0, -2.8))),
        vadd(jawTip, V(0, 0, 1.4)),
        vadd(hd, vadd(vscale(jdir, 2), V(0, 0, -3)))
      ].map(px)
      l.poly(m.flat(), R.jobRed[3])
      const t0 = px(vadd(hd, vadd(vscale(jdir, 4), V(0, 0, -3))))
      const t1 = px(vadd(jawTip, V(-3, 0, 1.2)))
      l.line(t0[0], t0[1], t1[0], t1[1], R.jobRed[1])
    })
  }
  paint.add(hdep - 0.1, (l) => {
    tube(l, [px(vadd(hd, V(-1, 0, -5))), px(jawTip)], [5.6, 3.2], SC, BELLY, 5)
    if (open > 0.2) {
      for (let k = 0; k < 3; k++) {
        const q = px(vadd(hd, vadd(vscale(jdir, 7 + k * 3.5), V(0, 0, -2.4))))
        l.set(q[0], q[1], C.white)
      }
    }
  })
  paint.add(hdep, (l) => {
    ball(l, px(hd)[0], px(hd)[1], 10, 9.4, SC)
    tube(l, [px(vadd(hd, vscale(hdir, 3))), px(vadd(hd, vscale(hdir, 23)))], [8.2, 5.6], SC)
    // Nostril and brow ridge.
    const n = px(vadd(hd, vadd(vscale(hdir, 22), V(0, side ? 1.5 : 1.4, 2))))
    l.set(n[0], n[1], SC[3])
    if (open > 0.2 && open < 0.95) {
      const t = px(vadd(hd, vadd(vscale(hdir, 8), V(0, 0, -3))))
      l.set(t[0], t[1], C.white)
    }
  })
  for (const s of [-1, 1]) {
    const hb0 = vadd(hd, V(-2, s * 6, 6.5))
    const ht = vadd(hb0, V(-14, s * 6, 9))
    paint.add(hdep + (side ? s * 0.5 : 0.2), (l) =>
      tube(l, [px(hb0), px(vadd(hb0, V(-7, s * 3, 6))), px(ht)], [3.6, 2.4, 0.8], BRZ)
    )
    if (view !== 'up' && !(side && s < 0)) {
      paint.add(
        hdep + 0.6,
        (l) => {
          const e = px(vadd(hd, V(6.6, s * 6.2, 3.4)))
          if (p.face === 'dead') {
            l.line(e[0] - 1, e[1] - 1, e[0] + 1, e[1] + 1, C.black)
            l.line(e[0] + 1, e[1] - 1, e[0] - 1, e[1] + 1, C.black)
          } else if (p.face === 'hurt') {
            l.line(e[0] - 2, e[1], e[0] + 1, e[1], C.black)
            l.set(e[0] - 1, e[1] - 1, C.black)
          } else {
            l.rect(e[0] - 1, e[1] - 1, 3, 2, R.fire[1])
            l.set(e[0] - 1, e[1] - 1, R.fire[0])
            l.set(e[0], e[1] - 1, C.black)
            l.set(e[0], e[1], C.black)
            l.line(e[0] - 2, e[1] - 2, e[0] + 2, e[1] - 1, SC[3])
          }
        },
        false
      )
    }
  }

  // ---- Rider.
  drawRider(paint, view, cam, p, dz)

  // Dizzy stars orbiting the head.
  if (p.dizzy !== undefined) {
    const h = px(hd)
    paint.add(
      90,
      (l) => {
        for (let i = 0; i < 3; i++) {
          const a = p.dizzy! + (i * Math.PI * 2) / 3
          const x = Math.round(h[0] + Math.cos(a) * 16)
          const y = Math.round(h[1] - 15 + Math.sin(a) * 4)
          l.rect(x - 1, y - 1, 3, 3, R.gold[1])
          l.set(x, y - 2, R.gold[0])
          l.set(x, y + 2, R.gold[2])
          l.set(x - 2, y, R.gold[0])
          l.set(x + 2, y, R.gold[2])
          l.set(x, y, C.glow)
        }
      },
      false
    )
  }

  const out = paint.render()
  if (p.flash) out.map((c) => LIGHTER[LIGHTER[c]])
  return out
}

function drawRider(paint: Painter, view: View, wcam: Cam, p: VP, dz: (s: number, down: number, up: number) => number) {
  const side = view === 'side'
  const free = p.riderFree
  const cam = free ? new Cam(view, 96, 176, free.tilt, free.at) : wcam
  // Rider-local space: origin at the hip. Seated riders sit on the wyvern's back.
  const seat = free ? V() : V(0, 0, 57)
  const lean = p.lean
  const L = (v: V3) => cam.px(vadd(seat, v))
  const dep = dz(8, 6, -2)
  const dd = (b: number) => dep + b * 0.01
  const sh = (s: number) => V(lean, s * 9.5, 19)
  const pitch = aimDir({ p: p.lance })
  const grip = V(11 + lean, 7, 12)

  // Saddle blanket and the far leg.
  if (!free) {
    paint.add(dz(2, 4, -1), (l) => {
      l.ellipse(L(V(0, 0, -1))[0], L(V(0, 0, -1))[1], side ? 11 : 12, side ? 3.2 : 4.6, CRIM[1])
      shadeEdges(l, CRIM, 1, true)
    })
  }
  for (const s of [-1, 1]) {
    const hip = V(0, s * 5.5, 1)
    const knee = V(11, s * 12, 5)
    const foot = V(4, s * 14.5, -14)
    const near = side ? (s > 0 ? 1 : -1) : 0
    const depth = side ? (s > 0 ? 9 : -2) : dep - 0.5
    paint.add(depth, (l) => {
      tube(l, [L(hip), L(knee)], [5.6, 4.4], ARM)
      tube(l, [L(knee), L(foot)], [4.2, 3.4], ARM)
      // Bronze knee guard, boot and spur.
      const k = L(knee)
      l.rect(k[0] - 1, k[1] - 2, 3, 3, BRZ[1])
      l.set(k[0] - 1, k[1] - 2, BRZ[0])
      const f = L(foot)
      l.rect(f[0] - 2, f[1] - 1, 5, 3, R.leather[2])
      l.set(f[0] + 3, f[1] + 1, BRZ[1])
    })
    void near
  }

  // Cape-scarf streaming back.
  const sc: V3[] = [0, 1, 2, 3].map((i) =>
    V(lean - 4 - i * 8, 0, 21 - i * 1.5 + p.flow * i * 0.8 + Math.sin(i + p.flow) * 1.5)
  )
  paint.add(dd(-1) - (side ? 1 : 0), (l) => tube(l, sc.map(L), [4.6, 3.8, 3, 1.8], CRIM))

  // Torso (dark teal plate with bronze belt and gorget).
  paint.add(dd(0), (l) => {
    tube(l, [L(V(0, 0, 0)), L(V(lean * 0.5, 0, 10)), L(V(lean, 0, 19))], [8.4, 8.8, 9.6], ARM)
    const b = L(V(0, 0, 2))
    l.rect(b[0] - 8, b[1], 16, 2, BRZ[1])
    l.rect(b[0] - 8, b[1], 16, 1, BRZ[0])
    l.rect(b[0] - 1, b[1] - 1, 3, 4, BRZ[2])
    // Chest plate crest and rivets.
    if (view !== 'up') {
      const c = L(V(lean * 0.8, 3, 13))
      l.rect(c[0] - 2, c[1] - 2, 5, 5, BRZ[1])
      l.set(c[0] - 2, c[1] - 2, BRZ[0])
      l.set(c[0] + 2, c[1] + 2, BRZ[2])
      l.set(c[0], c[1], ARM[0])
    }
  })

  // Arms. The right arm couches the lance, the left one holds the reins.
  const hands: Record<number, V3> = { 1: grip, [-1]: V(8 + lean, -4, 6) }
  for (const s of [-1, 1]) {
    const shoulder = sh(s)
    const { mid, end } = ik(shoulder, hands[s], 10, 10, V(-0.4, s * 0.8, -0.7))
    paint.add(side ? (s > 0 ? 10 : -1) : dd(1), (l) => {
      tube(l, [L(shoulder), L(mid)], [4.4, 3.6], ARM)
      tube(l, [L(mid), L(end)], [3.6, 3], ARM)
      const h = L(end)
      l.rect(h[0] - 1, h[1] - 1, 3, 3, R.leather[1])
      l.set(h[0] - 1, h[1] - 1, R.leather[0])
      // Pauldron.
      const ps = L(shoulder)
      ball(l, ps[0], ps[1], 5.4, 4.8, BRZ)
    })
  }

  // Head with the winged helm.
  const hc = V(lean + 1.5, 0, 29.5)
  const hp = L(hc)
  paint.add(dd(2), (l) => {
    ball(l, hp[0], hp[1], 7, 7, ARM)
    // Neck guard under the helm and the visor slit.
    const v = L(vadd(hc, V(5.5, 0, -0.5)))
    if (view === 'down') {
      l.rect(hp[0] - 4, hp[1] + 1, 8, 2, C.black)
      l.set(hp[0] - 2, hp[1] + 1, R.fire[0])
      l.set(hp[0] + 1, hp[1] + 1, R.fire[0])
      l.rect(hp[0] - 1, hp[1] - 6, 2, 12, BRZ[1])
      l.set(hp[0] - 1, hp[1] - 6, BRZ[0])
    } else if (view === 'side') {
      l.rect(v[0] - 4, v[1], 6, 2, C.black)
      l.set(v[0] - 1, v[1], R.fire[0])
      l.rect(v[0] - 6, v[1] - 6, 3, 9, BRZ[1])
      l.rect(hp[0] - 7, hp[1] - 1, 14, 1, BRZ[2])
    } else {
      l.rect(hp[0] - 1, hp[1] - 6, 2, 11, BRZ[1])
      l.rect(hp[0] - 7, hp[1] + 1, 14, 2, BRZ[2])
    }
    // Plume tuft on the crown.
    l.rect(hp[0] - 1, hp[1] - 9, 3, 3, CRIM[1])
    l.set(hp[0] - 1, hp[1] - 9, CRIM[0])
  })
  for (const s of [-1, 1]) {
    if (side && s < 0) continue
    paint.add(dd(2.1) + (side ? 1 : 0), (l) => {
      const b = vadd(hc, V(-1, s * 6.4, 1.5))
      const pts = [
        b,
        vadd(b, V(-2, s * 4, 8)),
        vadd(b, V(-9, s * 9, 14)),
        vadd(b, V(-12, s * 7, 6)),
        vadd(b, V(-8, s * 3, -2))
      ]
      l.poly(pts.map(L).flat(), R.paper[1])
      const a = L(b)
      const t = L(pts[2])
      l.line(a[0], a[1], t[0], t[1], R.paper[2])
      l.line(a[0], a[1] + 2, t[0] + 1, t[1] + 3, R.paper[2])
      l.set(a[0], a[1], BRZ[1])
      const bb = L(vadd(b, V(-6, s * 5, 4)))
      l.set(bb[0], bb[1], R.paper[0])
      shadeEdges(l, R.paper, 1, true)
    })
  }

  // The lance with vamplate, steel head and a crimson pennant.
  const g0 = vadd(grip, vscale(pitch, -26))
  const g1 = vadd(grip, vscale(pitch, 52))
  paint.add(dz(11, 26, 16) + (free ? -20 : 0), (l) => {
    tube(l, [L(g0), L(g1)], [2, 1.6], R.wood)
    const tip0 = vadd(grip, vscale(pitch, 50))
    const tip1 = vadd(grip, vscale(pitch, 74))
    tube(l, [L(tip0), L(tip1)], [2.6, 0.5], STEEL)
    const vp = L(vadd(grip, vscale(pitch, 6)))
    ball(l, vp[0], vp[1], 3.8, 3.8, BRZ)
    // Pennant: a crimson swallow-tail flag fluttering behind the lance head.
    const a = vadd(grip, vscale(pitch, 38))
    const b = vadd(grip, vscale(pitch, 50))
    const flutter = Math.sin(p.flow * 1.3) * 2
    const f1 = vadd(b, V(-6, 0, -7 + flutter))
    const f2 = vadd(a, V(-17, 0, -9 + flutter * 1.5))
    const f3 = vadd(a, V(-12, 0, -5 + flutter))
    const q = [a, b, f1, f2, f3].map(L)
    l.poly(q.flat(), CRIM[1])
    l.line(q[0][0], q[0][1], q[3][0], q[3][1], CRIM[2])
    l.line(q[1][0], q[1][1], q[2][0], q[2][1], CRIM[0])
    const st = L(vadd(a, V(-8, 0, -5 + flutter)))
    l.set(st[0], st[1], BRZ[1])
  })
}

// ---------------------------------------------------------------------------------------------------------
// Animations

const cyc = (i: number, n: number) => Math.cos((i / n) * Math.PI * 2)

function flyPose(i: number): VP {
  const w = -cyc(i, 6)
  return vp({
    wing: w,
    legs: 1,
    tilt: w * 2.5,
    pivot: V(0, 0, 40),
    at: V(0, 0, w * 2),
    head: V(41, 0, 66 + w * 1.5),
    hpitch: -10,
    wave: i * 0.9,
    tailLift: -w * 3,
    lance: 100,
    lean: 3,
    flow: i
  })
}

const DIVE: VP[] = [
  vp({
    wing: -0.4,
    fold: 0.1,
    legs: 1,
    tilt: -6,
    head: V(41, 0, 66),
    hpitch: -6,
    lance: 102,
    lean: 3,
    flow: 0,
    wave: 0.5
  }),
  vp({
    wing: 0.1,
    fold: 0.6,
    legs: 1,
    tilt: -28,
    at: V(2, 0, 6),
    head: V(42, 0, 64),
    hpitch: -14,
    lance: 96,
    lean: 6,
    flow: 1,
    wave: 1.4,
    tailLift: 5
  }),
  vp({
    wing: 0.5,
    fold: 0.8,
    legs: 1,
    tilt: -46,
    at: V(4, 0, 10),
    head: V(42, 0, 62),
    hpitch: -16,
    lance: 92,
    lean: 9,
    flow: 2,
    wave: 2,
    tailLift: 8
  }),
  vp({
    wing: -0.6,
    fold: 0.2,
    legs: 1,
    tilt: -12,
    at: V(2, 0, 6),
    head: V(41, 0, 66),
    hpitch: -8,
    lance: 100,
    lean: 4,
    flow: 3,
    wave: 3
  })
]

const BREATH_WING = [-0.5, 0.2, 0.7, 0]
const BREATH_JAW = [0.5, 0.9, 1, 0.8]
const breathPose = (i: number): VP =>
  vp({
    wing: BREATH_WING[i],
    legs: 0.55,
    tilt: 22,
    pivot: V(-20, 0, 38),
    head: V(34, 0, 82),
    hpitch: 30,
    jaw: BREATH_JAW[i],
    at: V(0, 0, 4 + (i % 2)),
    wave: 1 + i * 0.7,
    tailLift: -6,
    lance: 70,
    lean: -3,
    flow: i
  })

const groundPose = (i: number): VP => {
  const b = [0, 0.7, 1.4, 0.7][i]
  return vp({
    wing: 0.6 + (i % 2) * 0.08,
    fold: 0.66,
    droop: 0.1,
    legs: 0,
    head: V(40, 0, 67 + b * 0.8),
    hpitch: -12,
    jaw: [0, 0.12, 0.28, 0.12][i],
    at: V(0, 0, b * 0.4),
    wave: i * 0.5,
    lance: 14,
    lean: 1,
    flow: i
  })
}

const DOWNED: VP[] = [0, 1, 2, 3].map((i) =>
  vp({
    wing: 0.2,
    fold: 0.5,
    droop: 0.3,
    legs: 2,
    at: V(0, 0, -15),
    head: V(48 + (i % 2) * 2, 0, 33),
    hpitch: -24,
    jaw: 0.1 + (i % 2) * 0.1,
    wave: i * 0.4,
    tailLift: -14,
    lance: 125,
    lean: 10 + (i % 2),
    flow: i,
    face: 'hurt',
    dizzy: i * 1.57
  })
)

const HURT: VP[] = [
  vp({
    wing: -0.9,
    fold: 0.2,
    tilt: 14,
    pivot: V(-20, 0, 38),
    head: V(30, 0, 80),
    hpitch: 34,
    jaw: 0.8,
    face: 'hurt',
    lance: 60,
    lean: -7,
    flow: 3,
    flash: true
  }),
  vp({
    wing: -0.3,
    fold: 0.5,
    tilt: 7,
    pivot: V(-20, 0, 38),
    head: V(34, 0, 76),
    hpitch: 18,
    jaw: 0.35,
    face: 'hurt',
    lance: 74,
    lean: -4,
    flow: 1
  })
]

const DEATH: VP[] = [
  vp({
    wing: -1,
    fold: 0,
    tilt: 10,
    pivot: V(-20, 0, 38),
    head: V(30, 0, 80),
    hpitch: 36,
    jaw: 1,
    face: 'hurt',
    lance: 40,
    lean: -8,
    legs: 0.5,
    flash: true
  }),
  vp({
    wing: 0.4,
    fold: 0.3,
    tilt: -34,
    at: V(0, 0, -10),
    head: V(44, 0, 56),
    hpitch: -30,
    jaw: 0.6,
    face: 'dead',
    legs: 1,
    lance: 130,
    lean: 4,
    tailLift: 10,
    riderFree: { at: V(24, 0, 80), tilt: 25 }
  }),
  vp({
    wing: 0.8,
    fold: 0.3,
    droop: 0.4,
    tilt: -14,
    at: V(0, 0, -16),
    head: V(48, 0, 38),
    hpitch: -30,
    jaw: 0.4,
    face: 'dead',
    legs: 1.6,
    lance: 150,
    lean: 6,
    tailLift: -6,
    riderFree: { at: V(50, 0, 90), tilt: -40 }
  }),
  vp({
    wing: 0.9,
    fold: 0.45,
    droop: 0.5,
    tilt: -4,
    at: V(0, 0, -20),
    head: V(50, 0, 34),
    hpitch: -26,
    jaw: 0.3,
    face: 'dead',
    legs: 2,
    lance: 160,
    lean: 6,
    tailLift: -10,
    riderFree: { at: V(70, 0, 62), tilt: -100 }
  }),
  vp({
    wing: 0.95,
    fold: 0.55,
    droop: 0.55,
    at: V(0, 0, -22),
    head: V(52, 0, 30),
    hpitch: -22,
    jaw: 0.2,
    face: 'dead',
    legs: 2,
    lance: 160,
    lean: 6,
    tailLift: -12,
    riderFree: { at: V(74, 0, 20), tilt: -155 }
  }),
  vp({
    wing: 0.95,
    fold: 0.6,
    droop: 0.6,
    at: V(0, 0, -24),
    head: V(54, 0, 28),
    hpitch: -20,
    jaw: 0.15,
    face: 'dead',
    legs: 2,
    lance: 160,
    lean: 6,
    tailLift: -14,
    riderFree: { at: V(78, 0, 8), tilt: -176 }
  }),
  vp({
    wing: 0.95,
    fold: 0.6,
    droop: 0.6,
    at: V(0, 0, -24),
    head: V(54, 0, 28),
    hpitch: -20,
    jaw: 0.1,
    face: 'dead',
    legs: 2,
    lance: 160,
    lean: 6,
    tailLift: -14,
    riderFree: { at: V(78, 0, 8), tilt: -176 }
  }),
  vp({
    wing: 0.95,
    fold: 0.6,
    droop: 0.6,
    at: V(0, 0, -24),
    head: V(54, 0, 28),
    hpitch: -20,
    jaw: 0.1,
    face: 'dead',
    legs: 2,
    lance: 160,
    lean: 6,
    tailLift: -14,
    riderFree: { at: V(78, 0, 8), tilt: -176 }
  })
]

const A = { w: W, h: W, anchor: [96, 176] as const }
const frame = (view: View, p: VP) => despeckle(renderValk(view, p))

export function buildValkSheet(): Sheet {
  const spec = BOSS_SPEC.valk
  const sheet: Sheet = {}
  const mk = (name: string, poses: VP[], extra: Parameters<typeof anim>[3] = {}) => {
    const want = spec[name]
    const view = (name.split('_')[1] ?? 'side') as View
    sheet[name] = anim(
      poses.map((p) => frame(view, p)),
      want.fps,
      want.loop,
      { anchor: A.anchor, ...extra }
    )
  }
  for (const v of ['down', 'up', 'side'] as const) {
    mk(`fly_${v}`, [0, 1, 2, 3, 4, 5].map(flyPose), { lift: [40, 41, 43, 44, 43, 41] })
    mk(`dive_${v}`, DIVE, { lift: [44, 30, 8, 14] })
    mk(`breath_${v}`, [0, 1, 2, 3].map(breathPose), { lift: [16, 18, 18, 17] })
    mk(`ground_${v}`, [0, 1, 2, 3].map(groundPose))
    mk(`hurt_${v}`, HURT)
  }
  mk('downed', DOWNED)
  mk('death', DEATH, { alpha: [1, 1, 1, 1, 1, 0.85, 0.55, 0.25] })
  return sheet
}

void outline
