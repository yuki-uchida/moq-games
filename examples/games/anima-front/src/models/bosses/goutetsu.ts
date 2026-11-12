/**
 * ゴウテツ (DESIGN §11): a walking fortress. The body rides on four two-bone IK legs whose feet plant at the
 * sim's leg columns (±3 m, ±3 m); a lateral-sequence walk is driven by the speed, so planted feet do not slide.
 * Broken legs (parts[i] ≤ 0) dangle and spark and the body sags towards them; 'stagger' is the kneel: the body
 * drops, the chest doors swing open and the core slides out. Missile pods open their lids, the lens eye charges
 * and sweeps a beam (its yaw compensates the renderer's smoothed facing), the stomp lifts a front leg high.
 * Pose values are smoothed towards per-state targets; update() does not allocate.
 */
import * as THREE from 'three'
import type { FoeAttack } from '../../data/enemies'
import type { BossModel, FoeAnim } from '../api'
import { MACHINE_LOOK, type FoeLook } from '../foes/material'
import { noShadowDepthMaterial } from '../hull'
import { clamp, clamp01, hash, mix } from '../foes/rigging'
import { BossBuilder, HitFlash, aimSegment, ease, easeOut, pivot, solveTwoBone, toward, type BossAsset } from './common'
import {
  ANKLE_H,
  BODY_Y,
  CORE_AT,
  DOOR_HINGE,
  FEET,
  HEAD_PIVOT,
  HIPS,
  LENS_AT,
  LID_HINGE,
  POD_TILT,
  SHIN_L,
  THIGH_L
} from './goutetsu-parts'

const WINDUP: Partial<Record<FoeAttack, number>> = { missile: 1, sweep: 1.3, stomp: 0.9 }
const LOOK: FoeLook = { ...MACHINE_LOOK, gloss: [0.5, 70] }
const LEG_LOOK: FoeLook = { ...LOOK, hotColor: 0xffa040, hot: 0.6 }
const OUTLINE = 0.016
/** Walk: stride (m), swing share of the cycle, foot lift (m) and the leg phase offsets (LB → LF → RB → RF). */
const STRIDE = 2.4
const SWING = 0.25
const LIFT = 0.75
const OFFSET = [0, 0.5, 0.25, 0.75]
/** Which leg swings in each quarter of the cycle. */
const SWING_ORDER = [0, 2, 1, 3]
const KNEEL_Y = -2.2
const BEAM_LEN = 26
const SWEEP_PITCH = 0.34

interface Leg {
  thigh: THREE.Group
  shin: THREE.Group
  foot: THREE.Group
  u: ReturnType<BossBuilder['look']>
  /** Smoothed ankle target (rise frame). */
  ankle: THREE.Vector3
  pole: THREE.Vector3
  /** +1 left (+X), −1 right; +1 front, −1 back. */
  sx: number
  sz: number
  footYaw: number
  footPitch: number
  maxHp: number
  lastHp: number
  flash: number
  broken: number
}

const _hip = new THREE.Vector3()
const _knee = new THREE.Vector3()

export function createGoutetsu(asset: BossAsset): BossModel {
  const b = new BossBuilder(asset)
  const uBody = b.look(LOOK, OUTLINE)
  const uEye = b.look(LOOK, OUTLINE)
  const uCore = b.look({ ...LOOK, hotColor: 0xff7a3a }, OUTLINE)
  uBody.uGlow3.value = 0.2

  const root = new THREE.Group()
  root.name = 'goutetsu'
  const rise = pivot(root, [0, 0, 0], 'rise')
  const body = pivot(rise, [0, BODY_Y, 0], 'body')
  body.rotation.order = 'YXZ'
  b.mesh('body', uBody, body)
  const head = pivot(body, HEAD_PIVOT, 'head')
  head.rotation.order = 'YXZ'
  b.mesh('head', uBody, head)
  const lens = pivot(head, LENS_AT, 'lens')
  b.mesh('lens', uEye, lens)
  const doorGroups = [1, -1].map((side) => {
    const g = pivot(body, [DOOR_HINGE[0] * side, DOOR_HINGE[1], DOOR_HINGE[2]])
    b.mesh('door', uBody, g, side < 0)
    return g
  })
  const core = pivot(body, CORE_AT, 'core')
  b.mesh('core', uCore, core)
  const lidGroups = [1, -1].map((side) => {
    const g = pivot(body, [LID_HINGE[0] * side, LID_HINGE[1], LID_HINGE[2]])
    g.rotation.z = -POD_TILT * side
    b.mesh('lid', uBody, g, side < 0)
    return g
  })

  // Sweep beam: additive cylinders along the lens axis (no shadow).
  const beamGeo = b.own(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5))
  const beamMat = (color: number, opacity: number) =>
    b.own(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(2.2),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    )
  const beam = pivot(lens, [0, 0, 0.5], 'beam')
  for (const [r, color, opacity] of [
    [0.55, 0x2fd8ff, 0.35],
    [0.2, 0xd8ffff, 0.9]
  ] as const) {
    const m = new THREE.Mesh(beamGeo, beamMat(color, opacity))
    m.scale.set(r, r, 1)
    m.customDepthMaterial = noShadowDepthMaterial()
    m.renderOrder = 2
    beam.add(m)
  }
  beam.visible = false

  const legs: Leg[] = HIPS.map((_, i) => {
    const u = b.look(LEG_LOOK, OUTLINE)
    const thigh = pivot(rise, [0, 0, 0])
    b.mesh('thigh', u, thigh)
    const shin = pivot(rise, [0, 0, 0])
    b.mesh('shin', u, shin)
    const foot = pivot(rise, [0, 0, 0])
    foot.rotation.order = 'YXZ'
    b.mesh('foot', u, foot)
    const f = FEET[i]
    return {
      thigh,
      shin,
      foot,
      u,
      ankle: new THREE.Vector3(f[0], ANKLE_H, f[2]),
      pole: new THREE.Vector3(f[0], 2.2, f[2]).normalize(),
      sx: Math.sign(f[0]),
      sz: Math.sign(f[2]),
      footYaw: Math.atan2(f[0], f[2]) * 0.3,
      footPitch: 0,
      maxHp: 1,
      lastHp: NaN,
      flash: 0,
      broken: 0
    }
  })

  const flash = new HitFlash()
  const p = {
    rise: 0,
    y: 0,
    z: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    headYaw: 0,
    headPitch: 0,
    lensZ: 0,
    eye: 2.6,
    doors: 0,
    core: 0,
    coreGlow: 0.3,
    lids: 0,
    pods: 0.2,
    seams: 1.7,
    dim: 0,
    beam: 0
  }
  let phase = 0
  let walk = 0
  let stomper = 3
  let prevState = ''
  let prevSt = 0

  function update(dtIn: number, a: FoeAnim) {
    const dt = Math.min(Math.max(dtIn, 0), 0.1)
    const t = a.time
    const st = a.st
    const state = a.state
    const parts = a.parts
    // Leg damage: fraction of the highest hp seen, flashes on damage, broken flags.
    let broken = 0
    let brokenFront = 0
    let brokenLeft = 0
    for (let i = 0; i < 4; i++) {
      const L = legs[i]
      const hp = parts?.[i] ?? 1
      L.maxHp = Math.max(L.maxHp, hp)
      const drop = (L.lastHp - hp) / L.maxHp
      if (drop > 1e-4) L.flash = Math.min(0.55, L.flash + Math.min(Math.max(drop * 12, 0.15), 0.55))
      L.lastHp = hp
      L.flash = Math.max(0, L.flash - dt * 4)
      L.broken = parts && hp <= 0 ? 1 : 0
      broken += L.broken
      brokenFront += L.broken * L.sz
      brokenLeft += L.broken * L.sx
    }
    const newWindup = state === 'windup' && (prevState !== 'windup' || st < prevSt - 1e-3)
    if (newWindup && a.attack === 'stomp') {
      const other = stomper === 3 ? 2 : 3
      stomper = legs[other].broken ? (legs[stomper].broken ? other : stomper) : other
    }
    prevState = state
    prevSt = st

    // ---- walk cycle
    const kneel = state === 'stagger'
    const canWalk = state !== 'dying' && !kneel && state !== 'spawn'
    walk = toward(walk, canWalk ? clamp01(a.speed / 1.2) : 0, dt, 3)
    phase = (phase + (dt * a.speed * (1 - SWING)) / STRIDE) % 1
    const stepU = (phase * 4) % 1
    const swingLeg = SWING_ORDER[Math.floor(phase * 4) % 4]

    // ---- body targets (idle hum)
    let y = 0.05 * Math.sin(t * 1.3 + a.seed * 5)
    let z = 0
    let pitch = 0.01 * Math.sin(t * 0.9)
    let roll = 0.012 * Math.sin(t * 0.7 + 1)
    let yaw = 0
    let headYaw = 0.22 * Math.sin(t * 0.31 + a.seed * 7) + 0.08 * Math.sin(t * 0.93)
    let headPitch = 0.04 * Math.sin(t * 0.53)
    let lensZ = 0
    let eye = 2.6 + 0.3 * Math.sin(t * 2.1)
    let doors = 0
    let coreT = 0
    let coreGlow = 0.3
    let lids = 0
    let pods = 0.2
    let seams = 1.7
    let dim = 0
    let beamT = 0
    let riseT = 0
    let rate = 4
    let footRate = 14
    // Walking: the body rises over each swing and settles on the footfall; weight shifts off the swinging leg.
    if (walk > 0.01) {
      const L = legs[swingLeg]
      const s = Math.sin(Math.PI * stepU)
      y += walk * (0.12 * s - 0.06 - 0.07 * Math.exp(-stepU * 10))
      roll += walk * 0.03 * L.sx * s
      pitch += walk * (0.02 - 0.015 * L.sz * s)
    }
    // Broken legs: sag towards them.
    y -= broken * 0.35
    pitch += brokenFront * 0.06
    roll -= brokenLeft * 0.06

    const strike = (state === 'attack' || state === 'recover') && a.attack ? st : -1
    let lift = -1
    let liftK = 0
    if (state === 'windup' && a.attack) {
      const w = clamp01(st / (WINDUP[a.attack] ?? 1))
      if (a.attack === 'missile') {
        const e = ease(w / 0.6)
        lids = e
        pods = 0.2 + 4.5 * e * (0.75 + 0.25 * Math.sin(t * 24))
        y -= 0.25 * e
        pitch -= 0.05 * e
        headPitch = -0.12 * e
      } else if (a.attack === 'sweep') {
        const e = w * w
        eye = 2.6 + 6 * e + (w > 0.8 ? Math.sin(t * 50) * 0.8 : 0)
        lensZ = 0.16 * ease(w)
        headPitch = mix(headPitch, SWEEP_PITCH * 0.7, ease(w))
        headYaw = mix(headYaw, -0.15, ease(w))
        y -= 0.1 * ease(w)
      } else if (a.attack === 'stomp') {
        const e = easeOut(w / 0.8)
        lift = stomper
        liftK = e
        pitch -= 0.08 * e * (legs[stomper].sz > 0 ? 1 : -1)
        roll -= 0.05 * e * legs[stomper].sx
        y += 0.15 * e
        footRate = 8
      }
    } else if (strike >= 0) {
      if (a.attack === 'missile') {
        lids = strike < 0.6 ? 1 : 0
        pods = strike < 0.3 ? 7 * (1 - strike / 0.3) + 0.5 : 0.2
        if (strike < 0.12) {
          y -= 0.18
          rate = 20
        }
      } else if (a.attack === 'sweep') {
        // The sim turns the beam 70° in 1.5 s; the renderer's facing lags with rate 3: compensate it.
        const k = Math.exp(-3 * strike)
        const lag = state === 'attack' ? 0.272 - 0.883 * k : 0.262 * k
        headYaw = clamp(lag, -0.7, 0.7)
        if (state === 'attack') {
          headPitch = SWEEP_PITCH + Math.sin(t * 40) * 0.006
          eye = 9 + Math.sin(t * 60) * 0.6
          lensZ = 0.16
          beamT = 1
          rate = 10
        }
      } else if (a.attack === 'stomp') {
        if (strike < 0.5) {
          lift = stomper
          liftK = 0
          footRate = 40
          y -= strike < 0.15 ? 0.45 : 0.1
          pitch += 0.06 * (legs[stomper].sz > 0 ? 1 : -1)
          rate = strike < 0.15 ? 22 : 5
        }
      }
    } else if (kneel) {
      y = KNEEL_Y - 0.25 * broken + 0.04 * Math.sin(t * 1.1)
      pitch = 0.16
      roll = -brokenLeft * 0.05
      doors = 1
      coreT = 1
      coreGlow = 7 + 1.8 * Math.sin(t * 6)
      headPitch = -0.3
      headYaw = 0.12 * Math.sin(t * 0.4)
      eye = 0.8 + (hash(Math.floor(t * 9), 3) > 0.75 ? 1.8 : 0)
      seams = 0.9 + 0.8 * (hash(Math.floor(t * 14), 7) > 0.5 ? 1 : 0)
      lids = 0.15
      rate = st < 0.6 ? 5 : 2.5
    } else if (state === 'spawn') {
      // Rises out of the water/ground while the legs unfold and the lights power on.
      const u = clamp01(st / 0.8)
      riseT = -11 * (1 - easeOut(u))
      p.rise = riseT
      dim = 1 - ease((st - 0.3) / 0.45)
      eye = st > 0.55 ? 2.6 + 4 * (1 - ease((st - 0.55) / 0.25)) : 0
      rate = 8
    } else if (state === 'dying') {
      y = -4.4
      pitch = 0.18
      roll = (a.seed > 0.5 ? 1 : -1) * 0.12
      yaw = (a.seed - 0.5) * 0.3
      doors = 0.45
      lids = 0.3
      headPitch = 0.5
      headYaw = (a.seed - 0.5) * 0.8
      eye = 0
      coreGlow = 0
      pods = 0
      seams = 0
      dim = 1
      rate = st < 0.25 ? 6 : 3
      footRate = 4
    }

    // ---- smoothing
    if (state !== 'spawn') p.rise = toward(p.rise, riseT, dt, 5)
    p.y = toward(p.y, y, dt, rate)
    p.z = toward(p.z, z, dt, rate)
    p.pitch = toward(p.pitch, pitch, dt, rate)
    p.roll = toward(p.roll, roll, dt, rate)
    p.yaw = toward(p.yaw, yaw, dt, rate)
    p.headYaw = toward(p.headYaw, headYaw, dt, state === 'attack' ? 30 : 4)
    p.headPitch = toward(p.headPitch, headPitch, dt, 5)
    p.lensZ = toward(p.lensZ, lensZ, dt, 6)
    p.eye = toward(p.eye, eye, dt, 10)
    p.doors = toward(p.doors, doors, dt, 3)
    p.core = toward(p.core, coreT, dt, 2.5)
    p.coreGlow = toward(p.coreGlow, coreGlow, dt, 6)
    p.lids = toward(p.lids, lids, dt, 7)
    p.pods = toward(p.pods, pods, dt, 12)
    p.seams = toward(p.seams, seams, dt, 8)
    p.dim = toward(p.dim, dim, dt, state === 'spawn' ? 20 : 2.5)
    p.beam = toward(p.beam, beamT, dt, beamT > p.beam ? 25 : 8)

    // ---- body and details
    rise.position.y = p.rise
    body.position.set(0, BODY_Y + p.y, p.z)
    body.rotation.set(p.pitch, p.yaw, p.roll)
    head.rotation.set(p.headPitch, p.headYaw, 0)
    lens.position.z = LENS_AT[2] + p.lensZ
    lens.rotation.z = t * 0.4
    for (let k = 0; k < 2; k++) {
      const side = k ? -1 : 1
      doorGroups[k].rotation.y = side * p.doors * 1.35
      lidGroups[k].rotation.z = side * (-POD_TILT - p.lids * 1.9)
    }
    core.position.z = CORE_AT[2] + p.core * 0.95
    core.rotation.y = t * (0.6 + 2.5 * p.core)
    core.rotation.x = Math.sin(t * 0.7) * 0.3
    beam.visible = p.beam > 0.02
    beam.scale.set(0.3 + 0.7 * p.beam * (0.92 + 0.08 * Math.sin(t * 70)), 0.3 + 0.7 * p.beam, BEAM_LEN * p.beam)

    // ---- legs
    body.updateMatrix()
    for (let i = 0; i < 4; i++) {
      const L = legs[i]
      const f = FEET[i]
      let tx = f[0]
      let ty = ANKLE_H
      let tz = f[2]
      let rateL = footRate
      let pitchT = 0
      if (L.broken) {
        // Dangling from the hip (or splayed on the ground while kneeling / dead).
        if (kneel || state === 'dying') {
          tx = f[0] + L.sx * 1.4
          tz = f[2] + L.sz * 1.4
          ty = ANKLE_H * 0.7
        } else {
          _hip.set(HIPS[i][0], HIPS[i][1], HIPS[i][2]).applyMatrix4(body.matrix)
          tx = _hip.x + L.sx * 0.9 + Math.sin(t * 1.7 + i) * 0.15
          tz = _hip.z + L.sz * 0.6 + Math.sin(t * 2.2 + i * 2) * 0.2
          ty = Math.max(_hip.y - 4.2, 1.2)
          pitchT = 0.6
        }
        rateL = 5
      } else if (state === 'dying') {
        tx = f[0] + L.sx * 1.6
        tz = f[2] + L.sz * 1.6
      } else if (state === 'spawn') {
        const u = ease(st / 0.7)
        tx = f[0] * (0.55 + 0.45 * u)
        tz = f[2] * (0.55 + 0.45 * u)
        ty = ANKLE_H + 1.5 * (1 - u)
        rateL = 30
      } else if (i === lift) {
        tx = f[0] + L.sx * 0.4
        tz = f[2] + L.sz * 1.4 * liftK
        ty = ANKLE_H + 3.6 * liftK
        pitchT = -0.4 * liftK
      } else if (walk > 0.01) {
        const lp = (phase + OFFSET[i]) % 1
        if (lp < SWING) {
          const s = lp / SWING
          tz += walk * STRIDE * (ease(s) - 0.5)
          ty += walk * LIFT * Math.sin(Math.PI * s)
          pitchT = walk * 0.25 * Math.sin(Math.PI * s)
        } else tz += walk * STRIDE * (0.5 - (lp - SWING) / (1 - SWING))
        rateL = 40
      }
      L.ankle.x = toward(L.ankle.x, tx, dt, rateL)
      L.ankle.y = toward(L.ankle.y, ty, dt, rateL)
      L.ankle.z = toward(L.ankle.z, tz, dt, rateL)
      L.footPitch = toward(L.footPitch, pitchT, dt, 8)
      _hip.set(HIPS[i][0], HIPS[i][1], HIPS[i][2]).applyMatrix4(body.matrix)
      solveTwoBone(_hip, L.ankle, THIGH_L, SHIN_L, L.pole, _knee)
      aimSegment(L.thigh, _hip, _knee, L.pole)
      aimSegment(L.shin, _knee, L.ankle, L.pole)
      L.foot.position.copy(L.ankle)
      L.foot.rotation.set(L.footPitch, L.footYaw + p.yaw * 0.5, 0)
      // Damage: amber warning lights blink faster as the leg weakens; broken legs spark and their seams die.
      const frac = parts ? clamp01((parts[i] ?? 0) / L.maxHp) : 1
      const blink = frac < 0.5 ? (Math.sin(t * (frac < 0.25 ? 18 : 7) + i) > 0 ? 1 : 0.15) : 0.25
      const spark = L.broken ? (hash(Math.floor(t * 22) + i * 13, 5) > 0.55 ? 5 : 0.2) : 0
      L.u.uGlow3.value = (L.broken ? spark : (i === lift ? 3 * liftK : 0) + blink * 1.6) * (1 - p.dim)
      L.u.uGlow.value = p.seams * (L.broken ? 0.15 : 0.5 + 0.5 * frac)
    }

    // ---- glow
    const fl = flash.update(dt, a.hpFrac)
    b.tick(dt, fl, p.dim)
    for (let i = 0; i < 4; i++) {
      const L = legs[i]
      L.u.uFlash.value = Math.max(fl, L.flash)
      L.u.uDim.value = Math.max(p.dim, L.broken * 0.55)
    }
    uBody.uGlow.value = p.seams
    uBody.uGlow3.value = p.pods
    uEye.uGlow2.value = p.eye * (1 - p.dim)
    uEye.uGlow.value = p.seams
    uCore.uGlow3.value = p.coreGlow
    uCore.uGlow.value = p.seams
  }

  return {
    root,
    kind: 'goutetsu',
    update,
    weakPoint(out: THREE.Vector3) {
      return core.getWorldPosition(out)
    },
    dispose() {
      b.dispose()
    }
  }
}
