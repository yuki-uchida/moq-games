/**
 * Slime heroes: `hero:slime:<job>`. A mochi-dome jelly body that squashes and stretches, four job outfits from
 * jobs.ts, pseudopod arms, and expressions per animation. Every frame is drawn natively at 64×64 (feet on 32,56).
 */
import { heroSpec } from '../contract'
import { C, R, dimTable } from '../palette'
import { Raster, type Ramp } from '../raster'
import { despeckleBox as despeckle } from './layer'
import { anim, type Anim, type Sheet } from '../sheet'
import { anchorsOf, arm, drawBody, drawFace, glint, sparkle, sweat, type Anchors, type Face } from './body'
import {
  JOB_RAMP,
  bowNock,
  drawBuckler,
  drawHeadgear,
  drawQuiver,
  drawStole,
  drawWeapon,
  type Dir,
  type JobId,
  type WeaponFx
} from './jobs'

export type { Dir, JobId }
const DIRS: Dir[] = ['down', 'up', 'side']
const rd = Math.round

type V = [number, number]

/** Everything that differs between two frames. */
interface Pose {
  w?: number
  h?: number
  lean?: number
  dx?: number
  dy?: number
  wall?: number
  face?: Face
  /** Hand offsets from the shoulders (px). null = no pseudopod. */
  armR?: V | null
  armL?: V | null
  /** Draw the pseudopod over the body instead of behind it. */
  frontR?: boolean
  frontL?: boolean
  /** Weapon direction (radians) and effects. */
  ang?: number
  wfx?: WeaponFx
  /** Foreshortening of staffs. */
  sway?: number
  tilt?: number
  /** Weapon stowed on the back. */
  slung?: boolean
  noGear?: boolean
  noHat?: boolean
  pale?: boolean
  /** Drawn on top of everything (sparkles, sweat, smears). */
  fx?: (r: Raster, a: Anchors, hand: V, ramp: Ramp) => void
  /** Drawn right after the body, under the gear (smears that wrap the body). */
  mid?: (r: Raster, a: Anchors, hand: V, ramp: Ramp) => void
  dim?: number
  /** Body only, no face (puddles use their own). */
  bubbles?: boolean
}

const REST_ANG: Record<JobId, number> = { sword: -1.35, mage: -1.52, archer: 0, cleric: -1.52 }

const mirrorY = (p: Pose): Pose => ({
  ...p,
  ang: p.ang === undefined ? undefined : -p.ang,
  armR: p.armR ? [p.armR[0], -p.armR[1]] : p.armR,
  armL: p.armL ? [p.armL[0], -p.armL[1]] : p.armL
})

/** Renders one frame of a slime hero. */
export function renderFrame(job: JobId, dir: Dir, p: Pose): Raster {
  const ramp = JOB_RAMP[job]
  const bodyRamp: Ramp = p.pale ? [ramp[0], ramp[0], ramp[1], ramp[2], ramp[3]] : ramp
  const r = new Raster(64, 64)
  const w = p.w ?? 36
  const h = p.h ?? 28
  const feet = 56 - (p.dy ?? 0)
  const b = { cx: 32 + (p.dx ?? 0), feet, w, h, lean: p.lean ?? 0, wall: p.wall }
  // Anchors need the body spec first; compute without drawing.
  const a = anchorsOf(b, dir)
  const sR = a.shoulderR
  const sL = dir === 'side' ? ([a.shoulderR[0] - 5, a.shoulderR[1] + 1] as V) : a.shoulderL
  const armR = p.armR === undefined ? ([3, 2] as V) : p.armR
  const handR: V = armR ? [sR[0] + armR[0], sR[1] + armR[1]] : [sR[0] + 3, sR[1] + 2]
  const ang = p.ang ?? REST_ANG[job]
  const handA = { x: handR[0], y: handR[1], ang, dir }
  const fx: WeaponFx = p.wfx ?? {}
  const weaponBehind = false

  // Off hand: the buckler (sword), the string hand (archer) or a plain pseudopod.
  let armL: V | null | undefined = p.armL
  if (armL === undefined) armL = [-3, 2]
  let handL: V | null = armL ? [sL[0] + armL[0], sL[1] + armL[1]] : null
  if (job === 'archer' && (fx.draw ?? 0) > 0.1) {
    const nock = bowNock(handA, fx.draw ?? 0)
    handL = nock
  }

  const gear = !p.noGear
  // Behind the body.
  if (gear && job === 'archer' && dir !== 'up')
    drawQuiver(r, { x: dir === 'side' ? a.cx - 11 : a.cx + 12, y: a.top + 2, dir })
  if (gear && p.slung) {
    const hx = a.cx + (dir === 'side' ? -2 : 3)
    drawWeapon(r, job, { x: hx, y: a.top + h * 0.5, ang: job === 'archer' ? -0.75 : -0.95, dir }, {})
  }
  if (gear && weaponBehind && !p.slung && armR) {
    if (handL && armL) arm(r, sL[0], sL[1], handL[0], handL[1], bodyRamp)
    if (armR) arm(r, sR[0], sR[1], handR[0], handR[1], bodyRamp, 3)
    drawWeapon(r, job, handA, fx)
  }
  if (!p.frontR && armR && !(gear && weaponBehind && !p.slung)) arm(r, sR[0], sR[1], handR[0], handR[1], bodyRamp, 3)
  if (!p.frontL && handL && !(gear && weaponBehind && !p.slung)) arm(r, sL[0], sL[1], handL[0], handL[1], bodyRamp, 3)

  // Body.
  drawBody(r, b, bodyRamp, dir, p.bubbles !== false)
  if (job === 'archer' && gear && dir === 'up') drawQuiver(r, { x: a.cx + 6, y: a.top + 9, dir })
  if (job === 'cleric' && gear && h >= 14) drawStole(r, a.cx + (p.lean ?? 0) * 0.15, a.top, w, h, dir)
  drawFace(r, a, p.face ?? { eyes: 'open', mouth: 'smile' }, bodyRamp)
  despeckle(r)
  p.mid?.(r, a, handR, ramp)

  if (p.frontR && armR) arm(r, sR[0], sR[1], handR[0], handR[1], bodyRamp, 3)
  if (p.frontL && handL) arm(r, sL[0], sL[1], handL[0], handL[1], bodyRamp, 3)
  // Off-hand gear.
  if (gear && job === 'sword' && !p.slung && armL && handL) {
    if (dir === 'side') drawBuckler(r, a.cx - 6, sL[1] + 3)
    else drawBuckler(r, handL[0] - 1, handL[1])
  }
  // Main-hand weapon in front.
  if (gear && !p.slung && !weaponBehind && armR) {
    if (job === 'archer' && !(handL && (fx.draw ?? 0) > 0.1 && p.frontL)) {
      /* keep order: bow after arms */
    }
    drawWeapon(r, job, handA, fx)
    if (job === 'archer' && handL && (fx.draw ?? 0) > 0.1) arm(r, handL[0], handL[1], handL[0], handL[1], bodyRamp, 3)
  }
  if (!p.noHat) {
    drawHeadgear(r, job, { x: a.hx + (dir === 'side' ? 2 : 0), y: a.top, w, dir }, p.sway ?? 0, p.tilt ?? 0)
  }
  p.fx?.(r, a, handR, ramp)
  if (p.dim) {
    const t = dimTable(p.dim)
    r.map((c) => t[c])
  }
  return r
}

/* ------------------------------------------------------------------ effect helpers */

/** A crescent smear (sword swing) around (cx, cy) between angles a0 and a1, tapering at both ends. */
function smear(r: Raster, cx: number, cy: number, rad: number, a0: number, a1: number, width: number) {
  const steps = 28
  const outer: number[] = []
  const inner: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ang = a0 + (a1 - a0) * t
    const wd = width * Math.pow(Math.sin(Math.PI * t), 0.8) + 0.2
    outer.push(cx + Math.cos(ang) * (rad + wd / 2), cy + Math.sin(ang) * (rad + wd / 2))
    inner.unshift(cx + Math.cos(ang) * (rad - wd / 2), cy + Math.sin(ang) * (rad - wd / 2))
  }
  const layer = new Raster(r.w, r.h)
  layer.poly([...outer, ...inner], R.paper[0])
  const src = layer.clone()
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      if (!src.get(x, y)) continue
      // Outer rim stays white; inner (concave) edge fades to paper shade.
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d < rad - 0.3 && (!src.get(x - 1, y) || !src.get(x + 1, y) || !src.get(x, y - 1) || !src.get(x, y + 1)))
        layer.set(x, y, R.paper[2])
    }
  r.blit(layer)
}

const SPARK_POS: V[] = [
  [-17, -12],
  [16, -16],
  [-13, -26],
  [19, -3],
  [-20, 2],
  [10, -29]
]

/** Job-coloured sparkles near the body; `n` of them, rotating by `phase`. */
function sparkles(r: Raster, a: Anchors, ramp: Ramp, n: number, phase: number, big = false) {
  for (let i = 0; i < n; i++) {
    const [dx, dy] = SPARK_POS[(i + phase) % SPARK_POS.length]
    const x = a.cx + dx
    const y = a.feet + dy
    if ((i + phase) % 2 === 0) sparkle(r, x, y, ramp, big ? 2 : 1)
    else glint(r, x, y, i % 2 ? ramp : R.gold)
  }
}

/* ------------------------------------------------------------------ pose tables */

const FACE_IDLE: Face = { eyes: 'open', mouth: 'smile' }

interface Hold {
  armR: V
  ang: number
  wfx?: WeaponFx
}

/** Attack-ish weapon keyframes per job: down and side views (up mirrors down). */
const ATTACK: Record<JobId, { down: Hold[]; side: Hold[] }> = {
  sword: {
    down: [
      { armR: [7, -9], ang: -1.9 },
      { armR: [8, 5], ang: 0.55 },
      { armR: [1, 10], ang: 1.9 },
      { armR: [4, 0], ang: -1.2 }
    ],
    side: [
      { armR: [-3, -8], ang: -2.2 },
      { armR: [10, 0], ang: -0.05 },
      { armR: [8, 5], ang: 0.9 },
      { armR: [4, 0], ang: -1.2 }
    ]
  },
  mage: {
    down: [
      { armR: [3, -1], ang: -1.45 },
      { armR: [3, 8], ang: 1.2, wfx: { glow: 2, len: 0.45 } },
      { armR: [3, 5], ang: 0.7, wfx: { glow: 1, len: 0.7 } },
      { armR: [3, 1], ang: -1.3 }
    ],
    side: [
      { armR: [-4, 0], ang: -0.95 },
      { armR: [11, -2], ang: -0.2, wfx: { glow: 2 } },
      { armR: [7, -1], ang: -0.5, wfx: { glow: 1 } },
      { armR: [3, 2], ang: -1.2 }
    ]
  },
  archer: {
    down: [
      { armR: [4, 6], ang: 1.4, wfx: { draw: 0.85 } },
      { armR: [4, 7], ang: 1.45 },
      { armR: [4, 8], ang: 1.3 },
      { armR: [4, 2], ang: 0.3 }
    ],
    side: [
      { armR: [6, -4], ang: -0.12, wfx: { draw: 0.85 } },
      { armR: [10, -4], ang: -0.05 },
      { armR: [9, -3], ang: -0.25 },
      { armR: [4, 0], ang: -0.1 }
    ]
  },
  cleric: {
    down: [
      { armR: [4, -10], ang: -1.5 },
      { armR: [5, 7], ang: 0.9, wfx: { glow: 1, len: 0.6 } },
      { armR: [4, 9], ang: 1.1, wfx: { len: 0.6 } },
      { armR: [4, 1], ang: -1.3 }
    ],
    side: [
      { armR: [-5, -9], ang: -2.2 },
      { armR: [10, 5], ang: 0.55, wfx: { glow: 1 } },
      { armR: [8, 7], ang: 0.75 },
      { armR: [4, 1], ang: -1.2 }
    ]
  }
}

const hold = (job: JobId, dir: Dir, i: number): Hold => {
  const t = ATTACK[job][dir === 'side' ? 'side' : 'down'][i]
  return dir === 'up' ? { ...t, armR: [t.armR[0], -t.armR[1]], ang: -t.ang } : t
}

const SIDE_SHIFT = (dir: Dir, v: number) => (dir === 'side' ? v : 0)

/** Frames of one animation for one job and direction. */
function frames(job: JobId, dir: Dir, name: string): Raster[] {
  const ramp = JOB_RAMP[job]
  const side = dir === 'side'
  const R_ = (p: Pose) => renderFrame(job, dir, p)
  const restArm: V = [3, 2]
  switch (name) {
    case 'idle': {
      const hs = [27, 28, 30, 29]
      const ws = [37, 36, 35, 36]
      return hs.map((h, i) =>
        R_({
          h,
          w: ws[i],
          armR: [3, 2 - (i === 2 ? 1 : 0)],
          armL: [-3, 2 - (i === 2 ? 1 : 0)],
          sway: [0, 0, 1, 1][i],
          face: i === 3 ? { eyes: 'half', mouth: 'smile' } : FACE_IDLE
        })
      )
    }
    case 'walk': {
      const hs = [24, 31, 29, 28, 31, 25]
      const ws = [41, 33, 35, 36, 33, 40]
      const dys = [0, 2, 2, 1, 1, 0]
      const lean = [0, 1, 2, 2, 1, 0].map((v) => (side ? v : 0))
      return hs.map((h, i) =>
        R_({
          h,
          w: ws[i],
          dy: dys[i],
          lean: lean[i],
          armR: [3 + (i % 3 === 1 ? 1 : 0), 2 + (i === 1 || i === 4 ? -2 : i === 0 || i === 5 ? 2 : 0)],
          armL: [-3, 2 + (i === 1 || i === 4 ? -2 : i === 0 || i === 5 ? 2 : 0)],
          sway: [2, 0, -1, 0, 1, 3][i],
          face: { eyes: i === 0 || i === 5 ? 'open' : 'open', mouth: i === 2 || i === 3 ? 'open' : 'smile' },
          fx: side
            ? (rr, a) => {
                // A tiny drip trail left behind on the ground.
                if (i === 5 || i === 0) {
                  rr.set(a.cx - 22, 55, ramp[1])
                  rr.set(a.cx - 21, 55, ramp[2])
                  rr.set(a.cx - 24, 56, ramp[2])
                }
                if (i === 1 || i === 2) rr.set(a.cx - 22, 54, ramp[1])
              }
            : undefined
        })
      )
    }
    case 'attack': {
      const bodies = [
        { w: 41, h: 24, lean: -1 },
        { w: 34, h: 31, lean: 3 },
        { w: 38, h: 27, lean: 1 },
        { w: 36, h: 29, lean: 0 }
      ]
      return bodies.map((bd, i) => {
        const t = hold(job, dir, i)
        const lean = side ? bd.lean : 0
        return R_({
          ...bd,
          lean,
          armR: t.armR,
          ang: t.ang,
          wfx: t.wfx,
          armL: job === 'sword' && i === 1 ? [-2, 0] : [-3, 2],
          sway: [-1, 3, 4, 1][i],
          face: i === 0 ? { eyes: 'angry', mouth: 'flat' } : i === 3 ? FACE_IDLE : { eyes: 'wide', mouth: 'o' },
          mid:
            job === 'sword' && i === 1
              ? (rr, a, hand) => {
                  const o = dir === 'side' ? [a.cx + 2, a.top + 16] : [a.cx + 2, a.top + 14]
                  const sgn = dir === 'up' ? -1 : 1
                  if (dir === 'side') smear(rr, o[0], o[1], 22, -1.6, 1.0, 5)
                  else smear(rr, o[0], o[1], 22, sgn * -0.7, sgn * 2.5, 5)
                  void hand
                }
              : undefined,
          dim: undefined
        })
      })
    }
    case 'charge': {
      return [0, 1].map((i) => {
        const t = hold(job, dir, 0)
        return R_({
          w: 40,
          h: 24,
          dx: i === 0 ? -1 : 1,
          lean: side ? -1 : 0,
          armR: [t.armR[0] - (i ? 1 : 0), t.armR[1]],
          ang: t.ang + (i ? 0.08 : -0.08),
          wfx: job === 'archer' ? { draw: 0.7 } : { glow: job === 'mage' || job === 'cleric' ? 1 : 0 },
          armL: [-3, 2],
          sway: i ? 2 : -1,
          face: { eyes: 'angry', mouth: 'grit' },
          fx: (rr, a) => {
            sparkles(rr, a, ramp, 3, i * 2)
            glint(rr, a.cx + 15 - i * 28, a.feet - 2, ramp)
          }
        })
      })
    }
    case 'skill': {
      return [0, 1, 2, 3].map((i) => {
        const bodyS = [
          { w: 41, h: 24 },
          { w: 33, h: 32 },
          { w: 36, h: 30 },
          { w: 37, h: 27 }
        ][i]
        const lean = side ? [0, 2, 1, 0][i] : 0
        const face: Face =
          i === 0 ? { eyes: 'angry', mouth: 'flat' } : i === 3 ? FACE_IDLE : { eyes: 'wide', mouth: 'open' }
        if (job === 'sword') {
          const angs = [-2.6, -0.1, 1.5, -1.2]
          const arms: V[] = [
            [-2, -6],
            [11, -2],
            [3, 10],
            [4, 0]
          ]
          return R_({
            ...bodyS,
            lean,
            armR: arms[i],
            ang: angs[i],
            face,
            sway: [-1, 4, 5, 2][i],
            mid:
              i === 1 || i === 2
                ? (rr, a) => {
                    const cy = a.top + 14
                    if (i === 1) smear(rr, a.cx, cy, 22, 0.5, 4.9, 6)
                    else smear(rr, a.cx, cy, 22, 2.7, 7.0, 6)
                  }
                : undefined
          })
        }
        if (job === 'mage') {
          const arms: V[] = [
            [3, 2],
            [3, -13],
            [3, -14],
            [3, -9]
          ]
          const dirAng = dir === 'up' ? -1.5 : -1.52
          return R_({
            ...bodyS,
            lean,
            armR: arms[i],
            ang: dirAng,
            wfx: { glow: [0, 2, 2, 1][i] },
            armL: [-3, i === 1 || i === 2 ? -4 : 2],
            face,
            sway: [0, 4, 3, 1][i],
            fx: (rr, a) => {
              if (i === 1 || i === 2) sparkles(rr, a, ramp, 3, i)
            }
          })
        }
        if (job === 'archer') {
          const aim = dir === 'down' ? 1.15 : dir === 'up' ? -1.15 : -0.55
          const arms: V[] = side
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
          return R_({
            ...bodyS,
            lean,
            armR: arms[i],
            ang: i === 3 ? 0.1 : aim,
            wfx: { draw: [0.5, 1, 0, 0][i] },
            face,
            sway: [0, 3, 3, 1][i],
            fx: (rr, a, hand) => {
              if (i === 2) {
                glint(
                  rr,
                  hand[0] + (dir === 'side' ? 9 : 3),
                  hand[1] + (dir === 'up' ? -9 : dir === 'down' ? 9 : -5),
                  ramp
                )
                sparkle(
                  rr,
                  hand[0] + (dir === 'side' ? 12 : 4),
                  hand[1] + (dir === 'up' ? -12 : dir === 'down' ? 12 : -7),
                  ramp
                )
              }
              void a
            }
          })
        }
        const arms: V[] = [
          [3, 1],
          [3, -12],
          [3, -13],
          [3, -9]
        ]
        return R_({
          ...bodyS,
          lean,
          armR: arms[i],
          ang: -1.52,
          wfx: { glow: [0, 2, 2, 1][i] },
          armL: [-3, i === 1 || i === 2 ? -5 : 2],
          face,
          sway: [0, 3, 2, 1][i],
          fx: (rr, a) => {
            if (i === 1 || i === 2) {
              sparkles(rr, a, R.holy, 3, i, i === 2)
            }
          }
        })
      })
    }
    case 'hurt': {
      return [0, 1].map((i) =>
        R_({
          w: i === 0 ? 45 : 40,
          h: i === 0 ? 21 : 25,
          lean: side ? (i === 0 ? -3 : -1) : 0,
          dx: i === 0 ? (side ? -1 : 0) : 0,
          armR: [3, 5],
          armL: [-3, 5],
          ang: job === 'archer' ? 0.7 : 0.9,
          sway: i === 0 ? 5 : 3,
          tilt: i === 0 ? 2 : 1,
          pale: i === 0,
          face: i === 0 ? { eyes: 'shut', mouth: 'frown', blush: false } : { eyes: 'squint', mouth: 'wavy' },
          fx: (rr, a) => {
            if (i === 0) {
              rr.set(a.cx + 13, a.top - 2, C.white)
              rr.set(a.cx + 12, a.top - 3, C.white)
              rr.set(a.cx + 14, a.top - 3, C.white)
              rr.set(a.cx + 13, a.top - 4, C.white)
              rr.set(a.cx - 15, a.top + 1, C.white)
            }
          }
        })
      )
    }
    case 'push': {
      const ws = [38, 40, 39, 41]
      const hs = [26, 25, 26, 24]
      return [0, 1, 2, 3].map((i) =>
        R_({
          w: ws[i],
          h: hs[i],
          lean: side ? 3 + (i % 2) : 0,
          wall: side ? 4.5 : 5,
          dx: side ? 0 : i % 2 ? 1 : -1,
          armR: side ? [8 + (i % 2), -2 + (i === 1 ? 1 : 0)] : dir === 'down' ? [2, 7] : [3, -6],
          armL: side ? [8, 1] : dir === 'down' ? [-2, 7] : [-3, -6],
          frontR: true,
          frontL: true,
          slung: true,
          face: { eyes: 'squint', mouth: 'wavy' },
          sway: [1, 2, 1, 0][i],
          fx: (rr, a) => {
            sweat(rr, side ? a.cx - 9 : a.cx + 15, a.top - 2 + (i % 2))
          }
        })
      )
    }
    case 'carry': {
      return [0, 1, 2, 3].map((i) => {
        const bob = [0, 1, 0, 1][i]
        const raise = [0, -1, 0, 1][i]
        return R_({
          w: 33 + (i % 2),
          h: 31 - (i % 2),
          armR: side ? [6, -14 + raise] : [4, -15 + raise],
          armL: side ? [3, -14 - raise] : [-4, -15 - raise],
          frontR: side,
          frontL: side,
          lean: side ? 1 : 0,
          dy: bob,
          slung: true,
          sway: [0, 1, 0, -1][i],
          face: { eyes: 'open', mouth: i % 2 ? 'o' : 'smile' }
        })
      })
    }
    case 'grip': {
      return [0, 1].map((i) =>
        R_({
          w: 43,
          h: 24,
          dx: i ? 1 : -1,
          lean: side ? 2 : 0,
          armR: side ? [9, 4] : dir === 'down' ? [3, 8] : [4, -6],
          armL: side ? [8, 2] : dir === 'down' ? [-3, 8] : [-4, -6],
          frontR: true,
          frontL: true,
          slung: true,
          sway: i ? 2 : 0,
          face: { eyes: 'squint', mouth: 'grit' },
          fx: (rr, a) => {
            sweat(rr, a.cx + (side ? -10 : 16 - i * 3), a.top - 1 + i * 2)
            if (!side) sweat(rr, a.cx - 17 + i * 2, a.top + 3 - i)
          }
        })
      )
    }
    case 'action': {
      const spec: Pose[] = [
        { w: 45, h: 21, face: { eyes: 'angry', mouth: 'flat' }, sway: -1 },
        { w: 29, h: 35, lean: side ? 1 : 0, face: { eyes: 'wide', mouth: 'o' }, sway: 3 },
        { w: 35, h: 31, face: { eyes: 'happy', mouth: 'open' }, sway: 5 },
        { w: 47, h: 19, face: { eyes: 'half', mouth: 'smile' }, sway: 2 }
      ]
      return spec.map((p, i) =>
        R_({
          ...p,
          armR: i === 1 || i === 2 ? [4, -9] : [3, 2],
          armL: i === 1 || i === 2 ? [-4, -9] : [-3, 2],
          slung: i === 1 || i === 2,
          ang: undefined,
          fx: (rr, a) => {
            if (i === 3) {
              // Splat droplets.
              rr.set(a.cx - 26, 54, ramp[1])
              rr.set(a.cx + 26, 54, ramp[1])
              rr.set(a.cx - 28, 55, ramp[2])
              rr.set(a.cx + 28, 55, ramp[2])
            }
          }
        })
      )
    }
    case 'down':
      return puddleFrames(job, 'down')
    case 'revive':
      return puddleFrames(job, 'revive')
    case 'victory': {
      const dys = [0, 3, 6, 5, 1, 0]
      const hs = [25, 31, 30, 31, 29, 24]
      const ws = [40, 33, 35, 33, 36, 41]
      return [0, 1, 2, 3, 4, 5].map((i) =>
        R_({
          w: ws[i],
          h: hs[i],
          dy: dys[i],
          armR: [4, i % 2 ? -12 : -11],
          armL: [-4, i % 2 ? -11 : -12],
          ang: REST_ANG[job] + (i % 2 ? 0.12 : -0.12),
          wfx: { glow: job === 'mage' || job === 'cleric' ? (i > 0 && i < 5 ? 2 : 1) : 0, draw: 0 },
          sway: [0, 2, 4, 4, 2, 0][i],
          face: { eyes: 'happy', mouth: i > 0 && i < 5 ? 'open' : 'smile' },
          fx: (rr, a) => {
            if (i > 0 && i < 5) sparkles(rr, a, ramp, 3 + (i % 2), i * 2, i % 2 === 0)
          }
        })
      )
    }
    case 'fall': {
      const s = [1, 0.75, 0.5, 0.25]
      const dim = [1, 0.85, 0.62, 0.4]
      return [0, 1, 2, 3].map((i) =>
        R_({
          w: 36 * s[i] + (i ? 2 : 0),
          h: 28 * s[i],
          armR: i < 2 ? [3, 2] : null,
          armL: i < 2 ? [-3, 2] : null,
          noGear: i >= 2,
          noHat: i >= 2,
          bubbles: i < 2,
          face: { eyes: i < 2 ? 'wide' : 'open', mouth: i < 2 ? 'o' : 'none' },
          dim: i ? dim[i] : undefined,
          sway: 3
        })
      )
    }
  }
  throw new Error(`unknown animation ${name}`)
}

/** Down (melt) and revive (reform) share the puddle poses. */
function puddleFrames(job: JobId, kind: 'down' | 'revive'): Raster[] {
  const ramp = JOB_RAMP[job]
  const melt: Pose[] = [
    { w: 42, h: 20, face: { eyes: 'x', mouth: 'wavy' }, pale: true, armR: [3, 4], armL: [-3, 4], tilt: 2, sway: 4 },
    {
      w: 47,
      h: 13,
      face: { eyes: 'x', mouth: 'flat' },
      pale: true,
      armR: [4, 3],
      armL: null,
      tilt: 5,
      noGear: true,
      sway: 5
    },
    {
      w: 51,
      h: 8,
      face: { eyes: 'x', mouth: 'none' },
      pale: true,
      armR: null,
      armL: null,
      tilt: 7,
      noGear: true,
      noHat: true
    },
    {
      w: 53,
      h: 6,
      face: { eyes: 'x', mouth: 'none', blush: false },
      pale: true,
      armR: null,
      armL: null,
      noGear: true,
      noHat: true,
      bubbles: false
    }
  ]
  const reform: Pose[] = [
    {
      w: 52,
      h: 6,
      face: { eyes: 'x', mouth: 'none' },
      pale: true,
      armR: null,
      armL: null,
      noGear: true,
      noHat: true,
      bubbles: false
    },
    {
      w: 40,
      h: 16,
      face: { eyes: 'half', mouth: 'o' },
      pale: true,
      armR: null,
      armL: null,
      noGear: true,
      noHat: true,
      bubbles: false
    },
    { w: 29, h: 35, face: { eyes: 'wide', mouth: 'o' }, armR: [4, -8], armL: [-4, -8], sway: 4, slung: true },
    { w: 38, h: 26, face: { eyes: 'open', mouth: 'smile' }, sway: 2 }
  ]
  const poses = kind === 'down' ? melt : reform
  return poses.map((p, i) => {
    const showHat = kind === 'down' ? i === 2 : i >= 1
    const fr = renderFrame(job, 'down', {
      ...p,
      noHat: true,
      noGear: true,
      fx: (rr, a) => {
        const lying = kind === 'down' ? i === 3 : i === 0
        if (lying) {
          // The hat and weapon lie on the puddle.
          const layer = new Raster(64, 64)
          drawHeadgear(layer, job, { x: 32, y: 26, w: 30, dir: 'down' }, 0, 0)
          const bb = layer.bounds()
          if (bb) {
            const crop = layer.crop(bb.x, bb.y, bb.w, bb.h).rot90(job === 'mage' ? -1 : 1)
            rr.blit(crop, a.cx - 4 - rd(crop.w / 2), 56 - crop.h - (job === 'mage' ? 1 : 3))
          }
          const wl = new Raster(64, 64)
          drawWeapon(wl, job, { x: 24, y: 32, ang: 0, dir: 'down' }, {})
          const wb = wl.bounds()
          if (wb) rr.blit(wl.crop(wb.x, wb.y, wb.w, wb.h), a.cx + 9, 53 - wb.h + 3)
        }
        if (kind === 'revive' && i === 1) sparkle(rr, a.cx + 14, a.feet - 18, ramp)
        if (kind === 'revive' && i === 2) {
          sparkle(rr, a.cx - 18, a.feet - 25, ramp, 2)
          sparkle(rr, a.cx + 17, a.feet - 30, ramp)
          glint(rr, a.cx + 21, a.feet - 15, ramp)
        }
        if (kind === 'revive' && i === 3) {
          glint(rr, a.cx - 19, a.feet - 28, ramp)
          glint(rr, a.cx + 20, a.feet - 24, ramp)
        }
        if (kind === 'down' && i === 3) {
          rr.set(a.cx - 12, 51, ramp[0])
          rr.set(a.cx + 6, 52, ramp[0])
        }
      }
    })
    if (showHat) {
      const a = { x: 32 + (p.lean ?? 0), top: 56 - (p.h ?? 28) }
      const tilt = p.tilt ?? 0
      drawHeadgear(fr, job, { x: a.x, y: a.top, w: p.w ?? 36, dir: 'down' }, p.sway ?? 0, tilt)
      if (i >= 2 && kind === 'revive') {
        // Gear returns with the pop.
        const g = new Raster(64, 64)
        drawWeapon(g, job, { x: 32 + 19, y: 44, ang: REST_ANG[job], dir: 'down' }, {})
        fr.blit(g)
      }
    }
    return fr
  })
}

/* ------------------------------------------------------------------ sheet */

/** Builds `hero:slime:<job>`. */
export function slimeSheet(job: JobId): Sheet {
  const spec = heroSpec('slime')
  const sheet: Sheet = {}
  const cache = new Map<string, Raster[]>()
  for (const [name, want] of Object.entries(spec)) {
    const m = /^(\w+?)_(down|up|side)$/.exec(name)
    let fr: Raster[]
    if (m) {
      const key = m[1]
      const dir = m[2] as Dir
      fr = frames(job, dir, key)
    } else fr = frames(job, 'down', name)
    cache.set(name, fr)
    const extra: Partial<Anim> = {}
    if (want.lift) extra.lift = [0, 10, 30, 4]
    sheet[name] = anim(fr, want.fps, want.loop, extra)
  }
  return sheet
}
