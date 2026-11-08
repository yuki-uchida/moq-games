/**
 * The rat heroes `hero:rat:<job>` and the rat co-op technique sprites `tech:rat`, built lazily.
 * A chibi upright rat (warm grey-brown fur, cream belly and muzzle, pink ears, paws and tail, buck teeth, whiskers)
 * wearing the shared job outfits from jobs.ts on its own anchors: crown of the head, fists and off-hand paw.
 * Everything is drawn natively per frame at 64×64 (feet on 32,56).
 */
import { heroSpec } from '../contract'
import { C, R, dimTable } from '../palette'
import { Raster, ball, type Ramp } from '../raster'
import { anim, type Sheet } from '../sheet'
import { drawFace, glint, sparkle, sweat, type Anchors, type Face } from './body'
import {
  JOB_RAMP,
  bowNock,
  drawBuckler,
  drawHeadgear,
  drawQuiver,
  drawStole,
  drawWeapon,
  edgeShade,
  type Dir,
  type JobId,
  type WeaponFx
} from './jobs'
import { despeckleBox as despeckle, part } from './layer'
import { ratTechSheet } from './rat-tech'
import { REST_ANG, hold, smear } from './slime'

type V = [number, number]
const rd = Math.round
const FUR = R.ratFur
const PINK = R.ratPink
const CREAM = R.wolfCream

/** Everything that differs between two frames of a rat. */
interface RP {
  /** Overall size factor (fall animation). */
  s?: number
  lean?: number
  dx?: number
  /** Whole-body lift in px. */
  hop?: number
  crouch?: number
  stretch?: number
  /** Extra torso width / how far the torso trails behind the head when leaning (side). */
  torsoW?: number
  skew?: number
  /** Stride: feet offset. */
  legs?: number
  armR?: V | null
  armL?: V | null
  frontR?: boolean
  frontL?: boolean
  ang?: number
  wfx?: WeaponFx
  /** Tail tip sway (px). */
  tail?: V
  earDrop?: number
  face?: Face
  sway?: number
  tilt?: number
  slung?: boolean
  noGear?: boolean
  noHat?: boolean
  pale?: boolean
  dim?: number
  fx?: (r: Raster, a: RA, hand: V, ramp: Ramp) => void
  mid?: (r: Raster, a: RA, hand: V, ramp: Ramp) => void
}

/** Rig anchors of a drawn rat. */
interface RA {
  hx: number
  cy: number
  crown: number
  tx: number
  tTop: number
  tcy: number
  feet: number
  dir: Dir
}

const FACE_IDLE: Face = { eyes: 'open', mouth: 'smile' }

/** A fur limb with a pink paw. */
function limb(r: Raster, x0: number, y0: number, x1: number, y1: number, fur: Ramp, s: number) {
  part(r, (l) => {
    l.thick(x0, y0, x1, y1, 3 * s + 0.2, fur[1])
    edgeShade(l, fur)
    l.ellipse(x1, y1, 1.9 * s, 1.9 * s, PINK[1])
    l.set(rd(x1) + 1, rd(y1) + 1, PINK[2])
    l.set(rd(x1) - 1, rd(y1) - 1, PINK[0])
  })
}

function mouth(r: Raster, face: Face, mx: number, m: number) {
  const k = C.black
  const set = (x: number, y: number, c: number) => r.set(x, y, c)
  switch (face.mouth) {
    case 'smile':
    case 'cat':
      set(mx - 3, m, k)
      set(mx + 2, m, k)
      for (let x = mx - 2; x <= mx + 1; x++) set(x, m + 1, k)
      set(mx - 1, m + 2, C.white)
      set(mx, m + 2, C.white)
      set(mx - 2, m + 2, k)
      set(mx + 1, m + 2, k)
      set(mx - 1, m + 3, k)
      set(mx, m + 3, k)
      break
    case 'o':
      set(mx - 1, m, k)
      set(mx, m, k)
      for (let x = mx - 2; x <= mx + 1; x++) set(x, m + 1, k)
      set(mx - 1, m + 2, k)
      set(mx, m + 2, k)
      set(mx - 1, m + 1, PINK[2])
      set(mx, m + 1, PINK[2])
      break
    case 'open':
      for (let x = mx - 3; x <= mx + 2; x++) {
        set(x, m, k)
        set(x, m + 1, k)
      }
      for (let x = mx - 2; x <= mx + 1; x++) set(x, m + 2, k)
      set(mx - 1, m, C.white)
      set(mx, m, C.white)
      set(mx - 1, m + 2, PINK[1])
      set(mx, m + 2, PINK[1])
      break
    case 'wavy':
      ;[1, 0, 1, 0, 1, 0].forEach((o, i) => set(mx - 3 + i, m + o, k))
      break
    case 'grit':
      for (let x = mx - 3; x <= mx + 2; x++) {
        set(x, m, k)
        set(x, m + 2, k)
        set(x, m + 1, x % 2 ? C.white : k)
      }
      break
    case 'frown':
      ;[2, 1, 0, 0, 1, 2].forEach((o, i) => set(mx - 3 + i, m + o, k))
      break
    case 'flat':
      for (let x = mx - 2; x <= mx + 1; x++) set(x, m + 1, k)
      break
    case 'none':
      break
  }
}

/** Renders one frame of a rat hero. */
export function ratFrame(job: JobId, dir: Dir, p: RP): Raster {
  const s = p.s ?? 1
  const u = (v: number) => v * s
  const side = dir === 'side'
  const up = dir === 'up'
  const fur: Ramp = p.pale ? [FUR[0], FUR[0], FUR[1], FUR[2], FUR[3]] : FUR
  const jr = JOB_RAMP[job]
  const r = new Raster(64, 64)
  const lean = p.lean ?? 0
  const feet = 56 - (p.hop ?? 0)
  const H = 35 + (p.stretch ?? 0) - (p.crouch ?? 0)
  const crown = feet - u(H)
  const dx = p.dx ?? 0
  const hx = 32 + dx + lean
  const cy = crown + u(10.5)
  const tx = 32 + dx + (side ? lean * (p.skew ?? 0.4) : lean * 0.3)
  const tTop = cy + u(6)
  const tBot = feet - u(2)
  const tcy = (tTop + tBot) / 2
  const try_ = (tBot - tTop) / 2 + 0.5
  const trx = u(8) + (p.torsoW ?? 0)
  const a: RA = { hx, cy, crown, tx, tTop, tcy, feet, dir }
  const gear = !p.noGear
  const t0 = p.tail?.[0] ?? 0
  const t1 = p.tail?.[1] ?? 0

  // Shoulders (where limbs grow) and the slime-like nominal hand bases that weapon tables are written for.
  const shR: V = [tx + (side ? u(2) : u(6)), tTop + u(4)]
  const shL: V = [tx - (side ? u(2) : u(6)), tTop + u(4)]
  const nomR: V = [tx + (side ? u(10) : u(13)), tTop + (side ? u(8) : u(5))]
  const nomL: V = side ? [nomR[0] - 5, nomR[1] + 1] : [tx - u(13), tTop + u(5)]
  const armR = p.armR === undefined ? ([3, 2] as V) : p.armR
  const armL = p.armL === undefined ? ([-3, 2] as V) : p.armL
  const handR: V = armR ? [nomR[0] + armR[0], nomR[1] + armR[1]] : [nomR[0] + 3, nomR[1] + 2]
  let handL: V | null = armL ? [nomL[0] + armL[0], nomL[1] + armL[1]] : null
  const ang = p.ang ?? REST_ANG[job]
  const handA = { x: handR[0], y: handR[1], ang, dir }
  const wfx = p.wfx ?? {}
  if (job === 'archer' && (wfx.draw ?? 0) > 0.1) handL = bowNock(handA, wfx.draw ?? 0)

  // Tail (behind everything).
  part(r, (l) => {
    let pts: V[]
    if (side)
      pts = [
        [tx - trx + 2, feet - u(8)],
        [tx - u(14), feet - u(6) + t1 * 0.5],
        [tx - u(20) + t0, feet - u(11) + t1],
        [tx - u(25) + t0 * 1.2, feet - u(9) + t1 * 1.4]
      ]
    else if (up)
      pts = [
        [tx - u(3), feet - u(4)],
        [tx - u(11), feet - u(2)],
        [tx - u(16) + t0, feet - u(7) + t1],
        [tx - u(17) + t0 * 1.3, feet - u(14) + t1 * 1.5]
      ]
    else
      pts = [
        [tx + u(6), feet - u(5)],
        [tx + u(12), feet - u(3)],
        [tx + u(17) + t0, feet - u(8) + t1],
        [tx + u(18) + t0 * 1.3, feet - u(15) + t1 * 1.5]
      ]
    for (let i = 0; i + 1 < pts.length; i++)
      l.thick(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 2.4 - i * 0.3, PINK[1])
    edgeShade(l, PINK)
  })
  // Gear behind the body.
  if (gear && job === 'archer' && !up) drawQuiver(r, { x: tx + (side ? -8 : 8), y: tTop - 1, dir })
  if (gear && p.slung)
    drawWeapon(r, job, { x: tx + (side ? -2 : 3), y: tcy, ang: job === 'archer' ? -0.75 : -0.95, dir }, {})
  // Limbs behind the torso.
  if (!p.frontR && armR) limb(r, shR[0], shR[1], handR[0], handR[1], fur, s)
  if (!p.frontL && handL) limb(r, shL[0], shL[1], handL[0], handL[1], fur, s)
  // Feet.
  const lg = p.legs ?? 0
  part(r, (l) => {
    const fy = feet - u(1.5)
    if (side) {
      l.ellipse(tx + u(3) + lg, fy - (lg < -2 ? 1 : 0), u(3.8), u(2), PINK[1])
      l.ellipse(tx - u(3) - lg, fy - (lg > 2 ? 1 : 0), u(3.8), u(2), PINK[1])
    } else {
      l.ellipse(tx + u(5) + lg * 0.4, fy - (lg > 2 ? 1 : 0), u(3.4), u(2), PINK[1])
      l.ellipse(tx - u(5) - lg * 0.4, fy - (lg < -2 ? 1 : 0), u(3.4), u(2), PINK[1])
    }
    edgeShade(l, PINK)
  })
  // Torso with cream belly.
  part(r, (l) => {
    ball(l, tx, tcy, trx, try_, fur, false)
    if (!up) {
      if (side) ball(l, tx + trx * 0.38, tcy + 1, trx * 0.5, try_ * 0.74, CREAM, false)
      else ball(l, tx, tcy + 1, trx * 0.62, try_ * 0.76, CREAM, false)
    }
  })
  if (job === 'cleric' && gear) drawStole(r, tx, tTop - u(1), u(24), u(18), dir)
  if (job === 'archer' && gear && up) drawQuiver(r, { x: tx + 3, y: tTop + 1, dir })
  // Ears (behind the head).
  const drop = p.earDrop ?? 0
  const ear = (ex: number, ey: number, rx: number, ry: number, inner: boolean) =>
    part(r, (l) => {
      ball(l, ex, ey + drop * 2.5, rx, ry * (1 - drop * 0.25), fur, false)
      if (inner) {
        l.ellipse(ex + (ex < hx ? 0.5 : -0.5), ey + 0.8 + drop * 2.5, rx * 0.52, ry * 0.58, PINK[1])
        l.paint(rd(ex), rd(ey + ry * 0.4 + drop * 2.5), PINK[2])
      }
    })
  if (side) {
    ear(hx + u(4), cy - u(8.5), u(4), u(5), false)
    ear(hx - u(3), cy - u(8), u(4.6), u(5.6), true)
  } else {
    ear(hx - u(10.5), cy - u(6.5), u(4.6), u(5.6), !up)
    ear(hx + u(10.5), cy - u(6.5), u(4.6), u(5.6), !up)
  }
  // Head with the cream muzzle.
  part(r, (l) => {
    ball(l, hx, cy, u(12), u(10.5), fur, false)
    if (!up) {
      if (side) ball(l, hx + u(10), cy + u(6), u(6), u(3.9), CREAM, false)
      else ball(l, hx, cy + u(6), u(5.8), u(3.9), CREAM, false)
    }
  })
  // Face.
  const face = p.face ?? FACE_IDLE
  if (!up) {
    const an: Anchors = {
      cx: hx,
      feet,
      top: crown,
      w: 24,
      h: s >= 0.7 ? 28 : 18,
      hx: hx + (side ? 4 : 0),
      lean: 0,
      dir: 'down',
      shoulderL: [0, 0],
      shoulderR: [0, 0],
      eyeY: rd(cy - u(3))
    }
    drawFace(r, an, { ...face, mouth: 'none' }, fur)
    const mx = side ? hx + rd(u(9)) : hx
    const n0 = rd(cy + u(4.4))
    const noseX = side ? mx + 4 : mx - 1
    r.set(noseX, n0, PINK[2])
    r.set(noseX + 1, n0, PINK[2])
    r.set(noseX, n0 - 1, PINK[1])
    r.set(noseX + 1, n0 - 1, PINK[0])
    if (s >= 0.7) mouth(r, face, side ? mx + 1 : mx, n0 + 2)
    // Whiskers.
    const wk = R.paper[1]
    if (side) {
      r.line(hx + 15, n0 + 1, hx + 21, n0 - 2, wk)
      r.line(hx + 15, n0 + 2, hx + 21, n0 + 3, wk)
    } else {
      for (const sg of [-1, 1]) {
        r.line(hx + sg * 7, n0 + 1, hx + sg * 14, n0 - 2, wk)
        r.line(hx + sg * 7, n0 + 2, hx + sg * 14, n0 + 3, wk)
      }
    }
  }
  despeckle(r)
  p.mid?.(r, a, handR, jr)
  // Front limbs, off-hand gear, weapon, hat.
  if (p.frontR && armR) limb(r, shR[0], shR[1], handR[0], handR[1], fur, s)
  if (p.frontL && handL) limb(r, shL[0], shL[1], handL[0], handL[1], fur, s)
  if (gear && job === 'sword' && !p.slung && armL && handL) {
    if (side) drawBuckler(r, tx - 1, tTop + 9)
    else drawBuckler(r, handL[0] - 1, handL[1])
  }
  if (gear && !p.slung && armR) drawWeapon(r, job, handA, wfx)
  if (!p.noHat)
    drawHeadgear(r, job, { x: hx + (side ? 2 : 0), y: rd(crown + u(1)), w: 24, dir }, p.sway ?? 0, p.tilt ?? 0)
  p.fx?.(r, a, handR, jr)
  if (p.dim) {
    const t = dimTable(p.dim)
    r.map((c) => t[c])
  }
  return r
}

/* ------------------------------------------------------------------ effects used by poses */

const SPARK_POS: V[] = [
  [-17, -22],
  [16, -26],
  [-13, -34],
  [19, -14],
  [-20, -8],
  [10, -38]
]

function sparkles(r: Raster, a: RA, ramp: Ramp, n: number, phase: number, big = false) {
  for (let i = 0; i < n; i++) {
    const [dx, dy] = SPARK_POS[(i + phase) % SPARK_POS.length]
    const x = a.tx + dx
    const y = a.feet + dy + 10
    if ((i + phase) % 2 === 0) sparkle(r, x, y, ramp, big ? 2 : 1)
    else glint(r, x, y, i % 2 ? ramp : R.gold)
  }
}

/** Horizontal speed lines behind a running rat (side), or vertical for down/up. */
function streaks(r: Raster, a: RA, dir: Dir, len: number, phase: number) {
  const rows = [-30, -24, -17, -10, -5]
  rows.forEach((o, i) => {
    const L = len - (i % 3) * 3 + (phase % 2) * 2
    if (dir === 'side') {
      const y = a.feet + o + 8
      const x1 = a.tx - 12 - (i % 2) * 4
      for (let k = 0; k < L; k++) r.set(x1 - k, y, k < 2 || k > L - 3 ? R.paper[2] : R.paper[0])
    } else {
      const x = a.tx + (i - 2) * 6
      const y0 = dir === 'down' ? a.crown - 3 - (i % 2) * 3 : a.feet - 5 + (i % 2) * 2
      for (let k = 0; k < L - 3; k++)
        r.set(x, dir === 'down' ? y0 - k : y0 + k, k < 2 || k > L - 6 ? R.paper[2] : R.paper[0])
    }
  })
}

/* ------------------------------------------------------------------ animations */

interface SkillKey {
  armR: V
  ang: number
  wfx?: WeaponFx
}

function skillKey(job: JobId, dir: Dir, i: number): SkillKey {
  const sideV = dir === 'side'
  if (job === 'sword') {
    const angs = [-2.6, -0.1, 1.5, -1.2]
    const arms: V[] = [
      [-2, -6],
      [11, -2],
      [3, 10],
      [4, 0]
    ]
    return { armR: arms[i], ang: angs[i] }
  }
  if (job === 'mage') {
    const arms: V[] = [
      [3, 2],
      [3, -13],
      [3, -14],
      [3, -9]
    ]
    return { armR: arms[i], ang: -1.52, wfx: { glow: [0, 2, 2, 1][i] } }
  }
  if (job === 'archer') {
    const aim = dir === 'down' ? 1.15 : dir === 'up' ? -1.15 : -0.55
    const arms: V[] = sideV
      ? [
          [7, -6],
          [10, -8],
          [9, -7],
          [4, 0]
        ]
      : dir === 'down'
        ? [
            [4, 5],
            [4, 6],
            [4, 7],
            [4, 2]
          ]
        : [
            [4, -5],
            [4, -6],
            [4, -7],
            [4, 2]
          ]
    return { armR: arms[i], ang: i === 3 ? 0.1 : aim, wfx: { draw: [0.5, 1, 0, 0][i] } }
  }
  const arms: V[] = [
    [3, 1],
    [3, -12],
    [3, -13],
    [3, -9]
  ]
  return { armR: arms[i], ang: -1.52, wfx: { glow: [0, 2, 2, 1][i] } }
}

function frames(job: JobId, dir: Dir, name: string): Raster[] {
  const jr = JOB_RAMP[job]
  const side = dir === 'side'
  const F = (p: RP) => ratFrame(job, dir, p)
  switch (name) {
    case 'idle': {
      const st = [0, 1, 1, 0]
      const tl: V[] = [
        [0, 0],
        [1, -1],
        [2, -1],
        [1, 0]
      ]
      return [0, 1, 2, 3].map((i) =>
        F({
          stretch: st[i],
          tail: tl[i],
          earDrop: i === 2 ? 0.6 : 0,
          sway: [0, 0, 1, 1][i],
          armR: [3, 2 - (i === 1 ? 1 : 0)],
          armL: [-3, 2 - (i === 1 ? 1 : 0)],
          face: i === 3 ? { eyes: 'half', mouth: 'smile' } : FACE_IDLE
        })
      )
    }
    case 'walk': {
      const hop = [0, 1, 0, 0, 1, 0]
      const lg = [4, 2, 0, -4, -2, 0]
      const tl: V[] = [
        [-3, 2],
        [-1, 0],
        [2, -2],
        [3, 2],
        [1, 0],
        [-2, -2]
      ]
      return [0, 1, 2, 3, 4, 5].map((i) =>
        F({
          hop: hop[i],
          legs: lg[i],
          crouch: i === 0 || i === 3 ? 1 : 0,
          lean: side ? 2 : 0,
          tail: tl[i],
          armR: [3 + (lg[i] > 0 ? 1 : 0), 2 + (i % 3 === 0 ? 2 : -1)],
          armL: [-3, 2 + (i % 3 === 0 ? -1 : 2)],
          sway: [2, 0, -1, 0, 1, 3][i],
          earDrop: i % 3 === 1 ? 0.4 : 0,
          face: { eyes: 'open', mouth: i === 2 || i === 5 ? 'open' : 'smile' }
        })
      )
    }
    case 'attack': {
      const crouch = [3, 0, 1, 0]
      const stretch = [0, 2, 0, 0]
      const lean = side ? [-2, 4, 2, 0] : [0, 0, 0, 0]
      return [0, 1, 2, 3].map((i) => {
        const t = hold(job, dir, i)
        return F({
          crouch: crouch[i],
          stretch: stretch[i],
          lean: lean[i],
          armR: t.armR,
          ang: t.ang,
          wfx: t.wfx,
          armL: job === 'sword' && i === 1 ? [-2, 0] : [-3, 2],
          sway: [-1, 3, 4, 1][i],
          tail: [
            [-2, 2],
            [4, -2],
            [3, 0],
            [0, 0]
          ][i] as V,
          earDrop: i === 1 ? 1 : 0,
          legs: side ? [-2, 3, 2, 0][i] : 0,
          face: i === 0 ? { eyes: 'angry', mouth: 'flat' } : i === 3 ? FACE_IDLE : { eyes: 'wide', mouth: 'o' },
          mid:
            job === 'sword' && i === 1
              ? (rr, a) => {
                  const o = [a.tx + 2, a.tTop + 6]
                  const sgn = dir === 'up' ? -1 : 1
                  if (side) smear(rr, o[0], o[1], 22, -1.6, 1.0, 5)
                  else smear(rr, o[0], o[1], 22, sgn * -0.7, sgn * 2.5, 5)
                }
              : undefined
        })
      })
    }
    case 'charge':
      return [0, 1].map((i) => {
        const t = hold(job, dir, 0)
        return F({
          crouch: 3,
          dx: i ? 1 : -1,
          lean: side ? -1 : 0,
          armR: [t.armR[0] - (i ? 1 : 0), t.armR[1]],
          ang: t.ang + (i ? 0.08 : -0.08),
          wfx: job === 'archer' ? { draw: 0.7 } : { glow: job === 'mage' || job === 'cleric' ? 1 : 0 },
          tail: [i ? 2 : -2, i ? -2 : 1],
          earDrop: 0.5,
          sway: i ? 2 : -1,
          face: { eyes: 'angry', mouth: 'grit' },
          fx: (rr, a) => {
            sparkles(rr, a, jr, 3, i * 2)
            glint(rr, a.tx + 15 - i * 28, a.feet - 2, jr)
          }
        })
      })
    case 'skill':
      return [0, 1, 2, 3].map((i) => {
        const k = skillKey(job, dir, i)
        return F({
          crouch: [3, -2, 0, 1][i],
          stretch: [0, 3, 1, 0][i],
          lean: side ? [-1, 3, 1, 0][i] : 0,
          armR: k.armR,
          ang: k.ang,
          wfx: k.wfx,
          armL: job === 'mage' || job === 'cleric' ? [-3, i === 1 || i === 2 ? -5 : 2] : [-3, 2],
          sway: [-1, 4, 4, 1][i],
          tail: [
            [-2, 2],
            [3, -3],
            [2, -1],
            [0, 0]
          ][i] as V,
          face: i === 0 ? { eyes: 'angry', mouth: 'flat' } : i === 3 ? FACE_IDLE : { eyes: 'wide', mouth: 'open' },
          mid:
            job === 'sword' && (i === 1 || i === 2)
              ? (rr, a) =>
                  i === 1 ? smear(rr, a.tx, a.tTop + 4, 22, 0.5, 4.9, 6) : smear(rr, a.tx, a.tTop + 4, 22, 2.7, 7.0, 6)
              : undefined,
          fx: (rr, a) => {
            if ((i === 1 || i === 2) && job !== 'sword' && job !== 'archer')
              sparkles(rr, a, job === 'cleric' ? R.holy : jr, 3, i, i === 2)
            if (i === 2 && job === 'archer') glint(rr, a.tx + 10, a.tTop - 6, jr)
          }
        })
      })
    case 'hurt':
      return [0, 1].map((i) =>
        F({
          crouch: i === 0 ? 5 : 2,
          lean: side ? (i === 0 ? -3 : -1) : 0,
          torsoW: i === 0 ? 2 : 1,
          armR: [3, -3],
          armL: [-3, -3],
          ang: job === 'archer' ? 0.7 : 0.9,
          sway: i === 0 ? 5 : 3,
          tilt: i === 0 ? 2 : 1,
          pale: i === 0,
          earDrop: 1,
          tail: [i ? 2 : 3, -5],
          face: i === 0 ? { eyes: 'shut', mouth: 'frown', blush: false } : { eyes: 'squint', mouth: 'wavy' },
          fx: (rr, a) => {
            if (i === 0) {
              rr.set(a.hx + 14, a.crown + 1, C.white)
              rr.set(a.hx + 13, a.crown, C.white)
              rr.set(a.hx + 15, a.crown, C.white)
              rr.set(a.hx + 14, a.crown - 1, C.white)
            }
          }
        })
      )
    case 'push':
      return [0, 1, 2, 3].map((i) =>
        F({
          crouch: 3,
          lean: side ? 3 + (i % 2) : 0,
          torsoW: 1,
          dx: side ? 0 : i % 2 ? 1 : -1,
          legs: [3, 0, -3, 0][i],
          armR: side ? [8 + (i % 2), -2] : dir === 'down' ? [2, 8] : [3, -7],
          armL: side ? [8, 1] : dir === 'down' ? [-2, 8] : [-3, -7],
          frontR: true,
          frontL: true,
          slung: true,
          earDrop: 1,
          tail: [i % 2 ? 2 : -2, i % 2 ? -2 : 1],
          face: { eyes: 'squint', mouth: 'wavy' },
          fx: (rr, a) => sweat(rr, side ? a.hx - 12 : a.hx + 14, a.crown + 2 + (i % 2))
        })
      )
    case 'carry':
      return [0, 1, 2, 3].map((i) => {
        const raise = [0, -1, 0, 1][i]
        return F({
          stretch: 2 - (i % 2),
          hop: [0, 1, 0, 1][i],
          armR: side ? [6, -14 + raise] : [4, -15 + raise],
          armL: side ? [3, -14 - raise] : [-4, -15 - raise],
          frontR: side,
          frontL: side,
          slung: true,
          legs: [2, 0, -2, 0][i],
          tail: [
            [-1, 1],
            [1, -1],
            [2, 0],
            [0, 1]
          ][i] as V,
          sway: [0, 1, 0, -1][i],
          face: { eyes: 'open', mouth: i % 2 ? 'o' : 'smile' }
        })
      })
    case 'grip':
      return [0, 1].map((i) =>
        F({
          crouch: 4,
          torsoW: 2,
          dx: i ? 1 : -1,
          lean: side ? 2 : 0,
          armR: side ? [9, 4] : dir === 'down' ? [3, 9] : [4, -7],
          armL: side ? [8, 2] : dir === 'down' ? [-3, 9] : [-4, -7],
          frontR: true,
          frontL: true,
          slung: true,
          earDrop: 1,
          tail: [i ? 2 : -2, 0],
          face: { eyes: 'squint', mouth: 'grit' },
          fx: (rr, a) => {
            sweat(rr, a.hx + (side ? -12 : 15 - i * 3), a.crown + 3 + i * 2)
          }
        })
      )
    case 'action':
      return dashFrames(job, dir)
    case 'down':
      return [0, 1, 2, 3].map((i) => downFrame(job, i, 'down'))
    case 'revive':
      return [0, 1, 2, 3].map((i) => downFrame(job, i, 'revive'))
    case 'victory': {
      const hop = [0, 3, 6, 5, 1, 0]
      const st = [0, 3, 2, 3, 1, -1]
      return [0, 1, 2, 3, 4, 5].map((i) =>
        F({
          hop: hop[i],
          stretch: st[i] > 0 ? st[i] : 0,
          crouch: st[i] < 0 ? 3 : 0,
          armR: [4, i % 2 ? -12 : -11],
          armL: [-4, i % 2 ? -11 : -12],
          ang: REST_ANG[job] + (i % 2 ? 0.12 : -0.12),
          wfx: { glow: job === 'mage' || job === 'cleric' ? (i > 0 && i < 5 ? 2 : 1) : 0, draw: 0 },
          sway: [0, 2, 4, 4, 2, 0][i],
          tail: [
            [-2, 2],
            [1, -2],
            [3, -3],
            [2, -1],
            [-1, 1],
            [-3, 2]
          ][i] as V,
          legs: [0, 3, 3, 0, -2, 0][i],
          earDrop: i === 0 || i === 5 ? 0.3 : 0,
          face: { eyes: 'happy', mouth: i > 0 && i < 5 ? 'open' : 'smile' },
          fx: (rr, a) => {
            if (i > 0 && i < 5) sparkles(rr, a, jr, 3 + (i % 2), i * 2, i % 2 === 0)
          }
        })
      )
    }
    case 'fall': {
      const s = [1, 0.75, 0.5, 0.25]
      const dim = [1, 0.85, 0.62, 0.4]
      return [0, 1, 2, 3].map((i) =>
        F({
          s: s[i],
          armR: i < 2 ? [3, 2] : null,
          armL: i < 2 ? [-3, 2] : null,
          noGear: i >= 2,
          noHat: i >= 2,
          earDrop: 0.3,
          dim: i ? dim[i] : undefined,
          sway: 3,
          tail: [-2, -2],
          face: { eyes: i < 2 ? 'wide' : 'open', mouth: i < 2 ? 'o' : 'none' }
        })
      )
    }
  }
  throw new Error(`unknown animation ${name}`)
}

/** Dash (the rat's Space action): low forward lean, stretched, with a speed streak in the sprite. */
function dashFrames(job: JobId, dir: Dir): Raster[] {
  const side = dir === 'side'
  const poses: RP[] = [
    {
      crouch: 7,
      lean: side ? 4 : 0,
      torsoW: 2,
      legs: 2,
      tail: [-3, 1],
      face: { eyes: 'angry', mouth: 'flat' },
      sway: -2
    },
    {
      crouch: 11,
      lean: side ? 10 : 0,
      hop: 1,
      torsoW: 4,
      skew: 0.2,
      legs: 6,
      tail: [-7, -2],
      face: { eyes: 'wide', mouth: 'open' },
      sway: 7
    },
    {
      crouch: 10,
      lean: side ? 9 : 0,
      hop: 1,
      torsoW: 3,
      skew: 0.2,
      legs: -5,
      tail: [-6, -1],
      face: { eyes: 'wide', mouth: 'o' },
      sway: 6
    }
  ]
  return poses.map((p, i) =>
    ratFrame(job, dir, {
      ...p,
      slung: true,
      armR: side ? [-4, 5] : [2, 5],
      armL: side ? [-5, 5] : [-2, 5],
      earDrop: 1,
      fx: (rr, a) => {
        if (i > 0) streaks(rr, a, dir, i === 1 ? 14 : 10, i)
      }
    })
  )
}

/** Down (knock-out) and revive share the poses: standing stagger, sitting, reclining, flat on its back. */
function downFrame(job: JobId, step: number, kind: 'down' | 'revive'): Raster {
  const jr = JOB_RAMP[job]
  // Pose index along the fall: 0 stagger .. 3 flat. Revive runs it backwards, then pops up and settles.
  const k = kind === 'down' ? step : [3, 1, -1, -2][step]
  if (k === -1) {
    return ratFrame(job, 'down', {
      stretch: 5,
      hop: 2,
      armR: [4, -12],
      armL: [-4, -12],
      slung: true,
      sway: 6,
      tail: [3, -4],
      legs: 2,
      face: { eyes: 'wide', mouth: 'o' },
      fx: (rr, a) => {
        sparkle(rr, a.tx - 18, a.crown + 6, jr, 2)
        sparkle(rr, a.tx + 17, a.crown + 12, jr)
        glint(rr, a.tx + 21, a.crown + 26, jr)
      }
    })
  }
  if (k === -2)
    return ratFrame(job, 'down', {
      face: { eyes: 'open', mouth: 'smile' },
      sway: 3,
      tail: [2, -1],
      fx: (rr, a) => {
        glint(rr, a.tx - 19, a.crown + 9, jr)
        glint(rr, a.tx + 20, a.crown + 13, jr)
      }
    })
  if (k === 0)
    return ratFrame(job, 'down', {
      lean: -2,
      crouch: 3,
      pale: true,
      armR: [4, -6],
      armL: [-4, -6],
      ang: 0.9,
      sway: 4,
      tilt: 2,
      earDrop: 1,
      tail: [3, -4],
      face: { eyes: 'x', mouth: 'wavy' }
    })
  if (k === 1)
    return ratFrame(job, 'down', {
      crouch: 12,
      torsoW: 4,
      pale: true,
      armR: [6, 2],
      armL: [-6, 2],
      noGear: true,
      sway: 5,
      tilt: 5,
      earDrop: 1,
      legs: 2,
      tail: [4, 2],
      face: { eyes: 'x', mouth: 'o' },
      fx: (rr, a) => {
        if (kind === 'revive') sparkle(rr, a.tx + 14, a.crown + 4, jr)
      }
    })
  return lying(job, k, kind)
}

/** The rat lying on its back (k = 2 reclining, 3 flat) with its hat and weapon beside it. */
function lying(job: JobId, k: number, kind: 'down' | 'revive'): Raster {
  const r = new Raster(64, 64)
  const flat = k === 3
  const jr = JOB_RAMP[job]
  const hy = flat ? 47 : 43
  const hxx = flat ? 29 : 30
  // Tail on the ground.
  part(r, (l) => {
    l.thick(53, 56, 57, 56, 2.4, PINK[1])
    l.thick(57, 56, 62, flat ? 53 : 50, 1.8, PINK[1])
    edgeShade(l, PINK)
  })
  // Feet and arm poking up.
  part(r, (l) => {
    l.ellipse(55, flat ? 47 : 42, 3, 2.2, PINK[1])
    l.ellipse(58, flat ? 51 : 47, 3, 2.2, PINK[1])
    edgeShade(l, PINK)
  })
  part(r, (l) => {
    ball(l, 46, flat ? 51 : 49, 10, flat ? 6 : 7, FUR, false)
    ball(l, 47, flat ? 51 : 49, 7.5, flat ? 4 : 5, CREAM, false)
  })
  limb(r, 39, flat ? 47 : 44, flat ? 38 : 39, flat ? 40 : 37, FUR, 1)
  // Ears flat on the ground behind the head, then the head with X eyes.
  part(r, (l) => {
    ball(l, hxx - 9, hy - 6, 4, 5, FUR, false)
    l.ellipse(hxx - 9, hy - 5, 2, 3, PINK[1])
  })
  part(r, (l) => {
    ball(l, hxx, hy, 11, 9, [FUR[0], FUR[0], FUR[1], FUR[2], FUR[3]], false)
    ball(l, hxx, hy + 4, 5.5, 3.6, CREAM, false)
  })
  const an: Anchors = {
    cx: hxx,
    feet: 56,
    top: hy - 10,
    w: 24,
    h: 28,
    hx: hxx,
    lean: 0,
    dir: 'down',
    shoulderL: [0, 0],
    shoulderR: [0, 0],
    eyeY: hy - 5
  }
  drawFace(r, an, { eyes: 'x', mouth: 'none', blush: false }, FUR)
  r.set(hxx - 1, hy + 2, PINK[2])
  r.set(hxx, hy + 2, PINK[2])
  r.set(hxx - 1, hy + 1, PINK[1])
  mouth(r, { eyes: 'x', mouth: 'o' }, hxx, hy + 5)
  r.line(hxx - 7, hy + 3, hxx - 14, hy + 1, R.paper[1])
  r.line(hxx + 7, hy + 3, hxx + 13, hy + 1, R.paper[1])
  if (kind === 'down' || k === 3) {
    // Hat (rotated a quarter turn) and weapon lie beside it.
    const layer = new Raster(64, 64)
    drawHeadgear(layer, job, { x: 32, y: 26, w: 24, dir: 'down' }, 0, 0)
    const bb = layer.bounds()
    if (bb) {
      const crop = layer.crop(bb.x, bb.y, bb.w, bb.h).rot90(job === 'mage' ? -1 : 1)
      r.blit(crop, flat ? 1 : 0, 56 - crop.h - (job === 'mage' ? 0 : 1))
    }
    const wl = new Raster(64, 64)
    drawWeapon(wl, job, { x: 24, y: 32, ang: 0, dir: 'down' }, {})
    const wb = wl.bounds()
    if (wb && flat) r.blit(wl.crop(wb.x, wb.y, wb.w, wb.h), 62 - wb.w - 4, 58 - wb.h)
  }
  if (k === 3) {
    r.set(hxx - 12, 41, jr[0])
    r.set(hxx + 10, 40, jr[0])
  }
  despeckle(r)
  return r
}

/* ------------------------------------------------------------------ sheet */

/** Builds `hero:rat:<job>`. */
export function ratSheet(job: JobId): Sheet {
  const spec = heroSpec('rat')
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(spec)) {
    const m = /^(\w+?)_(down|up|side)$/.exec(name)
    const fr = m ? frames(job, m[2] as Dir, m[1]) : frames(job, 'down', name)
    sheet[name] = anim(fr, want.fps, want.loop)
  }
  return sheet
}

export const ratSheets: Record<string, () => Sheet> = {
  ...Object.fromEntries(
    (['sword', 'mage', 'archer', 'cleric'] as JobId[]).map((job) => [`hero:rat:${job}`, () => ratSheet(job)])
  ),
  'tech:rat': ratTechSheet
}
