/**
 * Renders one frame of a wolf hero from a `WolfPose`: body parts from wolf-parts.ts plus the shared job outfits from
 * jobs.ts. Feet stand on (32, 56) of the 64×64 frame; everything is drawn natively per frame.
 */
import { C, R, dimTable } from '../palette'
import { Raster } from '../raster'
import { despeckleBox } from './layer'
import {
  JOB_RAMP,
  bowNock,
  drawBuckler,
  drawHeadgear,
  drawQuiver,
  drawWeapon,
  edgeShade,
  type Dir,
  type JobId,
  type WeaponFx
} from './jobs'
import { part } from './layer'
import {
  arm,
  earsFront,
  type EarCfg,
  earsSide,
  headBack,
  headFront,
  headSide,
  leg,
  mitt,
  tail,
  torso,
  type Eyes,
  type Mouth,
  type V
} from './wolf-parts'

export type { Dir, JobId, V }
const rd = Math.round

export interface LegPose {
  /** Foot x offset from the hip. */
  ox: number
  /** Foot lift in px. */
  lift: number
}

export interface WolfPose {
  dx?: number
  hop?: number
  /** Lowers torso and head, shortening the legs. */
  crouch?: number
  /** Chest/head lean forward (side view; front view shifts the upper body sideways). */
  lean?: number
  tilt?: number
  hdx?: number
  hdy?: number
  eyes?: Eyes
  mouth?: Mouth
  open?: number
  look?: number
  blush?: boolean
  /** Ears: 0 pricked .. 1 flat back. */
  ears?: number
  chest?: number
  legs?: [LegPose, LegPose]
  /** Tail sway −1..1 and raise 0..1. */
  tail?: number
  tailUp?: number
  tailSize?: number
  /** Hand offsets from the rest hand position. null = arm hidden. */
  armR?: V | null
  armL?: V | null
  /** Weapon direction and effects. */
  ang?: number
  wfx?: WeaponFx
  /** Hat sway/tilt (see jobs.ts). */
  sway?: number
  hatTilt?: number
  slung?: boolean
  noGear?: boolean
  noHat?: boolean
  /** Clip everything below this row (pit falls). */
  clipY?: number
  dim?: number
  fx?: (r: Raster, a: Anchors) => void
}

export interface Anchors {
  gx: number
  hipY: number
  footY: number
  hx: number
  hy: number
  top: number
  torsoY: number
  shoulderR: V
  shoulderL: V
  dir: Dir
}

export const REST_ANG: Record<JobId, number> = { sword: -1.35, mage: -1.52, archer: 0, cleric: -1.52 }
const REST_HAND: V = [2.5, 7]
const EARS: Record<JobId, EarCfg> = {
  sword: { spread: 8.4, dy: -0.5, lean: 0.25, hole: R.steel[3] },
  mage: { spread: 11.8, dy: 2, lean: 0.4, hole: R.clothNavy[3], scale: 0.95 },
  archer: { spread: 9.6, dy: -0.5, lean: 0.4, farU: 0.6, hole: R.clothForest[3] },
  cleric: { spread: 11, dy: 1.5, lean: 0.4, hole: R.clothWhite[3], scale: 0.95, wid: 7.4 }
}

export function anchorsOf(dir: Dir, p: WolfPose): Anchors {
  const gx = 32 + (p.dx ?? 0)
  const hop = p.hop ?? 0
  const hipY = 49 + (p.crouch ?? 0) - hop
  const lean = p.lean ?? 0
  const side = dir === 'side'
  const hx = (side ? gx + 3 : gx) + lean * (side ? 1 : 0.5) + (p.hdx ?? 0)
  const hy = hipY - 20.5 + (p.hdy ?? 0)
  const sh = hipY - 10
  const tx = gx + lean * (side ? 0.6 : 0.3)
  return {
    gx,
    hipY,
    footY: 55 - hop,
    hx,
    hy,
    top: hy - 9.5,
    torsoY: hipY - 6.5,
    shoulderR: side ? [tx + 3, sh] : [tx + 6.6, sh],
    shoulderL: side ? [tx - 1.5, sh + 0.5] : [tx - 6.6, sh],
    dir
  }
}

const LEGS0: [LegPose, LegPose] = [
  { ox: 0, lift: 0 },
  { ox: 0, lift: 0 }
]

/** Renders one frame. */
export function renderWolf(job: JobId, dir: Dir, p: WolfPose = {}): Raster {
  const r = new Raster(64, 64)
  const a = anchorsOf(dir, p)
  const side = dir === 'side'
  const back = dir === 'up'
  const { gx, hipY, footY, hx, hy, shoulderR: sR, shoulderL: sL } = a
  const gear = !p.noGear
  const legs = p.legs ?? LEGS0
  const staffBack = side && (job === 'mage' || job === 'cleric') && p.ang === undefined
  const ang = staffBack ? -1.95 : (p.ang ?? REST_ANG[job])
  const fx: WeaponFx = p.wfx ?? {}
  const armR = p.armR === undefined ? ([0, 0] as V) : p.armR
  const armL = p.armL === undefined ? ([0, 0] as V) : p.armL
  const handR: V = armR
    ? [sR[0] + REST_HAND[0] + (staffBack ? -8 : 0) + armR[0], sR[1] + REST_HAND[1] + armR[1]]
    : [sR[0], sR[1] + 6]
  let handL: V | null = armL ? [sL[0] - REST_HAND[0] + armL[0], sL[1] + REST_HAND[1] + armL[1]] : null
  if (side && handL) handL = [sL[0] + 3.5 + armL![0], handL[1]]
  const hand = { x: handR[0], y: handR[1], ang, dir }
  if (gear && job === 'archer' && (fx.draw ?? 0) > 0.1) handL = bowNock(hand, fx.draw ?? 0)
  const ears = p.ears ?? 0
  const tilt = p.tilt ?? 0
  const sw = p.tail ?? 0
  const up = p.tailUp ?? 0
  const hatOn = !p.noHat
  const ramp = JOB_RAMP[job]

  // ---- behind the body
  if (gear && job === 'archer' && !back) drawQuiver(r, { x: side ? a.gx - 8 : a.gx + 9, y: a.hipY - 17, dir })
  if (gear && p.slung)
    drawWeapon(r, job, { x: a.gx + (side ? -1 : 3), y: a.hipY - 12, ang: job === 'archer' ? -0.75 : -0.95, dir }, {})
  const tailSize = p.tailSize ?? 1
  if (!back) {
    if (side)
      tail(
        r,
        [gx - 5, hipY - 3],
        [gx - 16 - sw * 2, hipY + 0.5 - up * 6],
        [gx - 15 - sw * 3.5, hipY - 12 - up * 6 + sw * 2],
        tailSize
      )
    else
      tail(
        r,
        [gx - 5, hipY - 1.5],
        [gx - 14 - sw * 1.5, hipY + 1.5],
        [gx - 13 + sw * 2.5, hipY - 9.5 - up * 5],
        tailSize
      )
  }
  // far limbs
  if (side) {
    if (handL && gear && !(job === 'archer' && (fx.draw ?? 0) > 0.1)) arm(r, sL[0], sL[1], handL[0], handL[1], true)
  }
  // ---- legs
  const hipOff = side ? [gx + 1.5, gx - 2.5] : [gx + 4.2, gx - 4.2]
  const fl: V[] = [0, 1].map((i) => [hipOff[i] + legs[i].ox, footY - legs[i].lift] as V)
  if (side) {
    leg(r, [hipOff[1], hipY], fl[1], 1, 4.6, true)
    leg(r, [hipOff[0], hipY], fl[0], 1, 4.8)
  } else {
    leg(r, [hipOff[1], hipY], fl[1], 0, 5)
    leg(r, [hipOff[0], hipY], fl[0], 0, 5)
  }
  // ---- torso and neck gear
  const tx = gx + (p.lean ?? 0) * (side ? 0.4 : 0.2) - (side ? 1 : 0)
  torso(r, { x: tx, y: a.torsoY, rx: side ? 6.8 : 7.5, ry: 8, dir, puff: p.chest })
  if (job === 'archer' && gear && back) drawQuiver(r, { x: tx + 4, y: a.torsoY - 7, dir })
  if (gear && !back) bandana(r, job, tx, hipY, dir, p.sway ?? 0)
  if (back)
    tail(r, [gx - 2, hipY - 1], [gx - 16 + sw * 3, hipY + 4], [gx - 12 + sw * 5, hipY - 11 - up * 4], 1.5 * tailSize)
  if (gear && job === 'sword' && !p.slung && handL && !side) {
    arm(r, sL[0], sL[1], handL[0], handL[1], false)
    drawBuckler(r, handL[0] - 1, handL[1])
  } else if (!side && handL && !(job === 'archer' && (fx.draw ?? 0) > 0.1 && gear)) {
    arm(r, sL[0], sL[1], handL[0], handL[1], false)
  }

  // ---- head
  const hs = {
    x: rd(hx),
    y: rd(hy),
    eyes: p.eyes ?? 'open',
    mouth: p.mouth ?? 'smile',
    tilt,
    look: p.look,
    blush: p.blush,
    open: p.open
  }
  if (back) {
    headBack(r, hs)
    if (gear) bandana(r, job, tx, hipY + 1, dir, p.sway ?? 0)
  } else if (side) headSide(r, hs)
  else headFront(r, hs)
  if (hatOn)
    drawHeadgear(
      r,
      job,
      {
        x: rd(hx - (side ? 3 + 11 * Math.sin(tilt) : 0)),
        y: rd(a.top + (side ? 11.5 * (1 - Math.cos(tilt)) : 0)) - (job === 'mage' ? 1 : 2),
        w: 22,
        dir
      },
      p.sway ?? 0,
      p.hatTilt ?? 0
    )
  const ec = EARS[job]
  if (side) earsSide(r, hx, hy, -tilt, ears, ec)
  else earsFront(r, hx, a.top - (hatOn ? 0 : 0), ears, ec)

  // ---- arms and weapon
  if (side) {
    if (job === 'sword' && gear && !p.slung && handL) drawBuckler(r, a.gx - 6, sL[1] + 5)
    else if (handL && gear && job === 'archer' && (fx.draw ?? 0) > 0.1) {
      // string hand drawn with the bow below
    }
  }
  const slung = !!p.slung
  if (armR) {
    arm(r, sR[0], sR[1], handR[0], handR[1], false)
    if (gear && !slung) {
      drawWeapon(r, job, hand, fx)
      mitt(r, handR[0], handR[1])
    }
  }
  if (gear && job === 'archer' && handL && (fx.draw ?? 0) > 0.1) {
    arm(r, sL[0], sL[1], handL[0], handL[1], side)
  }
  void ramp
  void edgeShade
  void part
  void C
  void R

  p.fx?.(r, a)
  despeckleBox(r)
  if (p.clipY !== undefined) for (let y = p.clipY; y < 64; y++) for (let x = 0; x < 64; x++) r.set(x, y, 0)
  if (p.dim) {
    const t = dimTable(p.dim)
    r.map((c) => t[c])
  }
  return r
}

/** Job-coloured neckerchief: a band under the chin, a pointed bib and (side/back) trailing ends. */
function bandana(r: Raster, job: JobId, cx: number, hipY: number, dir: Dir, sway = 0) {
  const rp = JOB_RAMP[job]
  const y = hipY - 11
  part(r, (l) => {
    if (dir === 'down') {
      l.poly([cx - 6.5, y, cx + 6.5, y, cx + 6, y + 2.6, cx - 6, y + 2.6], rp[1])
      l.poly([cx - 5, y + 2, cx + 5, y + 2, cx, y + 9], rp[1])
    } else if (dir === 'side') {
      l.poly([cx - 5.5, y, cx + 6.5, y, cx + 6.5, y + 2.6, cx - 5.5, y + 2.6], rp[1])
      l.poly([cx + 0.5, y + 2, cx + 6.5, y + 2, cx + 5, y + 7.5, cx + 2, y + 6], rp[1])
      l.thick(cx - 5, y + 1.5, cx - 9 - sway * 0.4, y + 4.5, 2.2, rp[1])
    } else {
      l.poly([cx - 7.5, y, cx + 7.5, y, cx + 7, y + 3.2, cx - 7, y + 3.2], rp[1])
      l.poly([cx - 1.5, y + 2, cx + 2.5, y + 2, cx + 3, y + 7, cx - 0.5, y + 5.5], rp[1])
    }
    edgeShade(l, rp)
  })
}
