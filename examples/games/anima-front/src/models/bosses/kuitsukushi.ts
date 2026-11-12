/**
 * クイツクシ (DESIGN §11): a crater maw-flower rooted in the ground. Rigid parts on pivots: the trunk leans and
 * breathes, the maw tilts on its neck, five petal-jaws open and close over the core (open while parts[0] = 1),
 * four three-segment tentacles sway and slam, the sacs swell before acid rain and the roots pulse for summons.
 * Later phases (parts[1], hpFrac) spread the petals, wake dormant veins and heat the glow. Every pose value is
 * smoothed exponentially towards a per-state target, so states blend; update() does not allocate.
 */
import * as THREE from 'three'
import type { FoeAttack } from '../../data/enemies'
import type { BossModel, FoeAnim } from '../api'
import { CREATURE_LOOK, type FoeLook } from '../foes/material'
import { clamp01, mix } from '../foes/rigging'
import { BossBuilder, HitFlash, ease, easeOut, easeOutBack, pivot, toward, type BossAsset } from './common'
import {
  CORE_RISE,
  CORE_Y,
  NECK,
  PETAL_ANGLES,
  PETAL_HINGE_R,
  PETAL_HINGE_Y,
  SAC_PIVOT,
  STALK_PIVOT,
  TENT_L,
  polar
} from './kuitsukushi-parts'

const WINDUP: Partial<Record<FoeAttack, number>> = { slam: 1.1, acidRain: 1.4, summon: 1.2 }
const TENT_ANGLES = [1.0, -1.0, 2.3, -2.3]
const TENT_SCALE = [1, 1, 0.86, 0.86]
const TENT_R = 2.3
const TENT_Y = 0.65
const REST: readonly [number, number, number] = [0.42, -0.08, 0.8]
const SLAM_UP: readonly [number, number, number] = [-0.08, -0.05, 0.55]
const SLAM_DOWN: readonly [number, number, number] = [1.1, 0.5, 0.42]
const WILT: readonly [number, number, number] = [1.3, 0.75, 1.15]

const LOOK: FoeLook = { ...CREATURE_LOOK, gloss: [0.45, 110] }
const OUTLINE = 0.014

const VIOLET = new THREE.Color(0xa86bff)
const MAGENTA = new THREE.Color(0xff5ad2)
const CORE_WARM = new THREE.Color(0xffa040)
const CORE_HOT = new THREE.Color(0xff5a3a)

interface Tentacle {
  anchor: THREE.Group
  segs: [THREE.Group, THREE.Group, THREE.Group]
  angle: number
  /** +1 on the left (+X), −1 on the right. */
  side: number
  bend: [number, number, number]
  yaw: number
  twist: number
  /** Rest scale and the smoothed swell of a rearing tentacle. */
  scale: number
  swell: number
  /** Smoothed outward slide of the anchor on the mound (a rearing tentacle steps clear of the head). */
  out: number
}

export function createKuitsukushi(asset: BossAsset): BossModel {
  const b = new BossBuilder(asset)
  const uBody = b.look(LOOK, OUTLINE)
  const uBase = b.look(LOOK, OUTLINE)
  const uSac = b.look({ ...LOOK, hotColor: 0xe27aff }, OUTLINE)
  const uCore = b.look({ ...LOOK, hotColor: 0xffa040 }, OUTLINE)
  uBody.uGlow3.value = 0

  const root = new THREE.Group()
  root.name = 'kuitsukushi'
  const baseMesh = b.mesh('base', uBase, root)
  const rise = pivot(root, [0, 0, 0], 'rise')
  const stalk = pivot(rise, STALK_PIVOT, 'stalk')
  b.mesh('stalk', uBody, stalk).position.set(-STALK_PIVOT[0], -STALK_PIVOT[1], -STALK_PIVOT[2])
  const sac = pivot(stalk, [0, SAC_PIVOT[1] - STALK_PIVOT[1], 0], 'sacs')
  b.mesh('sacs', uSac, sac).position.set(0, -SAC_PIVOT[1], 0)
  const head = pivot(stalk, [NECK[0], NECK[1] - STALK_PIVOT[1], NECK[2]], 'head')
  head.rotation.order = 'YXZ'
  b.mesh('head', uBody, head)
  const petals = PETAL_ANGLES.map((a) => {
    const g = pivot(head, polar(PETAL_HINGE_R, a, PETAL_HINGE_Y))
    g.rotation.order = 'YXZ'
    g.rotation.y = a
    b.mesh('petal', uBody, g)
    return g
  })
  const core = pivot(head, [0, CORE_Y, 0], 'core')
  b.mesh('core', uCore, core).rotation.x = -0.93
  const tents: Tentacle[] = TENT_ANGLES.map((angle, i) => {
    const anchor = pivot(rise, polar(TENT_R, angle, TENT_Y))
    anchor.rotation.order = 'YXZ'
    anchor.rotation.y = angle
    anchor.scale.setScalar(TENT_SCALE[i])
    const s0 = pivot(anchor, [0, 0, 0])
    b.mesh('tentA', uBody, s0)
    const s1 = pivot(s0, [0, TENT_L[0], 0])
    b.mesh('tentB', uBody, s1)
    const s2 = pivot(s1, [0, TENT_L[1], 0])
    b.mesh('tentC', uBody, s2)
    return {
      anchor,
      segs: [s0, s1, s2],
      angle,
      side: Math.sign(Math.sin(angle)),
      bend: [...REST],
      yaw: 0,
      twist: 0,
      scale: TENT_SCALE[i],
      swell: 0,
      out: 0
    }
  })

  const flash = new HitFlash()
  // Smoothed pose.
  const p = {
    rise: 0,
    lean: 0,
    side: 0,
    pitch: 0.62,
    yaw: 0,
    petal: -0.1,
    core: 0,
    coreGlow: 0.3,
    sac: 0,
    sacGlow: 0.8,
    root: 1.3,
    rootPulse: 3.2,
    anger: 0,
    dim: 0,
    eye: 0
  }
  let slammer = 1
  let prevState = ''
  let prevSt = 0

  function update(dtIn: number, a: FoeAnim) {
    const dt = Math.min(Math.max(dtIn, 0), 0.1)
    const t = a.time
    const st = a.st
    const seed = a.seed
    const state = a.state
    const coreOpen = a.parts?.[0] === 1
    const phase = a.parts?.[1] ?? 1
    if (state === 'windup' && a.attack === 'slam' && (prevState !== 'windup' || st < prevSt - 1e-3)) slammer ^= 1
    prevState = state
    prevSt = st
    p.anger = toward(p.anger, clamp01((phase - 1) / 2 + (1 - a.hpFrac) * 0.2), dt, 1.5)
    const ang = p.anger

    // ---- idle targets
    const sw = 1 + ang * 0.6
    let lean = 0.035 * Math.sin(t * 0.55 * sw + seed * 6)
    let side = 0.03 * Math.sin(t * 0.41 * sw + seed * 9)
    let pitch = 0.62 + 0.04 * Math.sin(t * 0.8 + 1)
    let yaw = 0.06 * Math.sin(t * 0.3 + seed * 4)
    let petal = mix(0.08, 0.3, ang) + 0.035 * Math.sin(t * 1.3)
    let coreT = 0
    let coreGlow = 0.35
    let sacT = 0.05 * Math.sin(t * 1.6)
    let sacGlow = 0.9 + 0.3 * Math.sin(t * 2.3)
    let rootT = 1.3 + ang * 0.6
    let pulse = 3.2 + ang * 2.5
    let eye = 0
    let riseT = 0
    let dim = 0
    let rate = 4
    let tentRate = 4
    /** Tentacle override: 0 none, 1 slam rear, 2 slam strike, 3 spread (summon), 4 lift (acid), 5 curl, 6 wilt. */
    let tentMode = 0
    let tentK = 0
    if (coreOpen) {
      petal = 0.95 + 0.3 * ang + 0.04 * Math.sin(t * 2.1)
      coreT = 1
      coreGlow = 5.5 + 1.2 * Math.sin(t * 5.2)
      pitch = 0.8 + 0.03 * Math.sin(t * 0.9)
    }
    const strike = (state === 'attack' || state === 'recover') && a.attack ? st : -1
    if (state === 'windup' && a.attack) {
      const w = clamp01(st / (WINDUP[a.attack] ?? 1.2))
      eye = w * 2.5
      if (a.attack === 'slam') {
        const e = easeOut(w / 0.75)
        const shake = w > 0.7 ? Math.sin(t * 38) * 0.03 * ((w - 0.7) / 0.3) : 0
        lean = -0.1 * e + shake
        side = (slammer ? -1 : 1) * 0.12 * e
        pitch = mix(pitch, 0.45, e)
        petal = Math.max(petal, 0.25 * e)
        tentMode = 1
        tentK = e
      } else if (a.attack === 'acidRain') {
        const e = ease(w)
        pitch = mix(pitch, -0.14, e)
        lean = -0.15 * e
        sacT = e + 0.07 * Math.sin(t * 16) * e
        sacGlow = 0.9 + 3.4 * e + Math.sin(t * 20) * 0.5 * e
        petal = mix(petal, 0.6, e)
        tentMode = 4
        tentK = e
      } else {
        const e = ease(w)
        petal = mix(petal, 1.3, e)
        pitch = mix(pitch, 0.42, e)
        lean = -0.05 * e + Math.sin(t * 24) * 0.012 * e
        rootT = rootT + 3.2 * e
        pulse = pulse + 9 * e
        tentMode = 3
        tentK = e
      }
    } else if (strike >= 0) {
      const hit = strike < 0.14
      const held = strike < 0.42
      rate = hit ? 20 : held ? 10 : 3.5
      if (a.attack === 'slam') {
        if (held) {
          lean = 0.09
          side = -(slammer ? -1 : 1) * 0.04
          pitch = 0.78
          petal = Math.max(petal, 0.2)
          tentMode = 2
          tentRate = hit ? 30 : 12
        }
      } else if (a.attack === 'acidRain') {
        if (strike < 0.25) {
          pitch = -0.38
          lean = -0.1
          sacT = -0.28
          sacGlow = 5 * (1 - strike / 0.25)
          petal = 0.95
        }
      } else if (a.attack === 'summon') {
        if (strike < 0.35) {
          rootT = 5.5
          pulse = 12
          petal = 1.4
          tentMode = 3
          tentK = 1
        }
      }
    } else if (state === 'stagger') {
      pitch = 0.3
      petal = -0.3
      lean = -0.08
      tentMode = 5
      rate = 8
    } else if (state === 'spawn') {
      // Bursts up out of the crater: the base heaves, the flower shoots up and the petals flick open.
      const u = clamp01(st / 0.6)
      riseT = -10 * (1 - easeOutBack(u, 1.2))
      p.rise = riseT
      petal = st < 0.45 ? -0.35 : 0.75
      rootT = 4.5
      pulse = 10
      rate = 14
      tentMode = 5
      tentRate = 10
    } else if (state === 'dying') {
      lean = 0.45
      side = (seed > 0.5 ? 1 : -1) * 0.22
      pitch = 1.75
      yaw = (seed - 0.5) * 0.6
      petal = -0.45
      coreT = 0
      coreGlow = 0
      sacT = -0.35
      sacGlow = 0
      rootT = 0
      riseT = -1.4
      dim = 1
      rate = 3.2
      tentMode = 6
      tentRate = 3
    }

    // ---- smoothing
    if (state !== 'spawn') p.rise = toward(p.rise, riseT, dt, 5)
    p.lean = toward(p.lean, lean, dt, rate)
    p.side = toward(p.side, side, dt, rate)
    p.pitch = toward(p.pitch, pitch, dt, rate)
    p.yaw = toward(p.yaw, yaw, dt, rate * 0.6)
    p.petal = toward(p.petal, petal, dt, rate * 1.3)
    p.core = toward(p.core, coreT, dt, 3)
    p.coreGlow = toward(p.coreGlow, coreGlow, dt, 6)
    p.sac = toward(p.sac, sacT, dt, rate * 1.5)
    p.sacGlow = toward(p.sacGlow, sacGlow, dt, 8)
    p.root = toward(p.root, rootT, dt, 5)
    p.rootPulse = toward(p.rootPulse, pulse, dt, 3)
    p.dim = toward(p.dim, dim, dt, 2.5)
    p.eye = toward(p.eye, eye, dt, 6)

    // ---- pose
    rise.position.y = p.rise
    if (state === 'spawn') {
      const k = easeOutBack(clamp01(st / 0.35), 2)
      baseMesh.scale.set(0.75 + 0.25 * k, 0.35 + 0.65 * k, 0.75 + 0.25 * k)
    } else baseMesh.scale.set(1, 1, 1)
    const breath = Math.sin(t * 1.15 + seed * 3) * (1 - p.dim)
    stalk.rotation.set(p.lean, 0, p.side)
    stalk.scale.set(1 - breath * 0.012, 1 + breath * 0.015, 1 - breath * 0.012)
    head.rotation.set(p.pitch, p.yaw, p.side * 0.5)
    sac.scale.set(1 + p.sac * 0.3, 1 + p.sac * 0.16, 1 + p.sac * 0.3)
    for (let i = 0; i < petals.length; i++) {
      const g = petals[i]
      const flutter = 0.04 * (1 + ang) * Math.sin(t * (1.7 + ang) + i * 1.3 + seed * 5) * (1 - p.dim)
      g.rotation.x = p.petal + flutter + (p.dim > 0.01 ? -0.12 * p.dim * Math.sin(i * 2.1) : 0)
      g.rotation.z = 0.05 * Math.sin(t * 0.9 + i * 2.4)
    }
    const throb = coreOpen ? 1 + 0.04 * Math.sin(t * 5.2) : 1
    core.position.y = CORE_Y + p.core * CORE_RISE
    core.scale.setScalar(throb * (0.85 + 0.15 * p.core))
    core.rotation.set(0.06 * Math.sin(t * 1.4), 0.2 * Math.sin(t * 0.5), 0)

    for (let i = 0; i < tents.length; i++) poseTentacle(tents[i], i, dt, t, seed, ang, tentMode, tentK, tentRate)

    // ---- glow
    const fl = flash.update(dt, a.hpFrac)
    b.tick(dt, fl, p.dim)
    uBody.uGlowColor.value.lerpColors(VIOLET, MAGENTA, ang)
    uBody.uGlow.value = 1.5 * (1 + 0.45 * ang)
    uBody.uGlow3.value = ang * 2.6 * (0.8 + 0.2 * Math.sin(t * 4))
    uBody.uGlow3Color.value.lerpColors(MAGENTA, CORE_HOT, ang * 0.5)
    b.setPulse(uBody, 3.2 + 3 * ang)
    uBody.uGlow2.value = 2.2 + 1.2 * ang + p.eye
    uBase.uGlow.value = p.root
    b.setPulse(uBase, p.rootPulse)
    uBase.uPulse.value.y = 0.6
    uBase.uGlowColor.value.lerpColors(VIOLET, MAGENTA, ang * 0.6)
    uSac.uGlow3.value = p.sacGlow
    uSac.uGlowColor.value.copy(uBody.uGlowColor.value)
    uCore.uGlow3.value = p.coreGlow
    uCore.uGlow3Color.value.lerpColors(CORE_WARM, CORE_HOT, ang)
    uCore.uGlow.value = 0.6 + p.coreGlow * 0.4
    // A closed core is dormant: dark and desaturated, so an opened maw (summon, acid) does not read as a weak point.
    uCore.uDim.value = Math.max(p.dim, 0.8 * (1 - p.core))
  }

  function poseTentacle(
    tn: Tentacle,
    i: number,
    dt: number,
    t: number,
    seed: number,
    ang: number,
    mode: number,
    k: number,
    rate: number
  ) {
    const ph = seed * 7 + i * 1.9
    const ws = t * (0.9 + 0.5 * ang) + ph
    const amp = 1 + ang * 0.8
    let b0 = REST[0] + 0.06 * amp * Math.sin(ws)
    let b1 = REST[1] + 0.1 * amp * Math.sin(ws - 0.8)
    let b2 = REST[2] + 0.16 * amp * Math.sin(ws - 1.6)
    let yaw = 0.08 * Math.sin(t * 0.5 + ph)
    let twist = 0.06 * Math.sin(t * 0.7 + ph)
    let r = 4
    let swell = 0
    let out = 0
    const front = i < 2
    const slamming = front && i === slammer
    if ((mode === 1 || mode === 2) && slamming) {
      yaw = mode === 1 ? tn.side * 0.7 * k : -tn.side * 0.62
      if (mode === 1) {
        swell = 0.3 * k
        out = 0.85 * k
        const tremble = k > 0.95 ? Math.sin(t * 40 + i) * 0.04 : 0
        b0 = mix(b0, SLAM_UP[0], k)
        b1 = mix(b1, SLAM_UP[1], k) + tremble
        b2 = mix(b2, SLAM_UP[2], k) - tremble
        twist = 0
        r = 7
      } else {
        b0 = SLAM_DOWN[0]
        b1 = SLAM_DOWN[1]
        b2 = SLAM_DOWN[2]
        twist = 0
        r = rate
      }
    } else if (mode === 1 || mode === 2) {
      // The others coil back, ready.
      b1 -= 0.15 * (mode === 1 ? k : 1)
      b2 -= 0.2 * (mode === 1 ? k : 1)
    } else if (mode === 3) {
      b0 += 0.35 * k
      b1 += 0.25 * k + Math.sin(t * 30 + i) * 0.03 * k
      b2 -= 0.2 * k
    } else if (mode === 4) {
      b0 -= 0.12 * k
      b2 += 0.2 * k
    } else if (mode === 5) {
      b0 = -0.05
      b1 = -0.15
      b2 = 0.2
      r = rate
    } else if (mode === 6) {
      b0 = WILT[0] + (i % 2) * 0.1
      b1 = WILT[1]
      b2 = WILT[2] + (i % 3) * 0.15
      yaw = (i % 2 ? 1 : -1) * 0.2
      r = rate
    }
    tn.bend[0] = toward(tn.bend[0], b0, dt, r)
    tn.bend[1] = toward(tn.bend[1], b1, dt, r * 1.15)
    tn.bend[2] = toward(tn.bend[2], b2, dt, r * 1.3)
    tn.yaw = toward(tn.yaw, yaw, dt, r * 0.7)
    tn.twist = toward(tn.twist, twist, dt, r)
    tn.swell = toward(tn.swell, swell, dt, 6)
    tn.out = toward(tn.out, out, dt, r)
    tn.anchor.scale.setScalar(tn.scale * (1 + tn.swell))
    tn.anchor.position.set(
      Math.sin(tn.angle) * (TENT_R + tn.out),
      TENT_Y - 0.25 * tn.out,
      Math.cos(tn.angle) * (TENT_R + tn.out)
    )
    tn.anchor.rotation.y = tn.angle + tn.yaw
    tn.segs[0].rotation.set(tn.bend[0], 0, tn.twist)
    tn.segs[1].rotation.set(tn.bend[1], 0, tn.twist * 0.6)
    tn.segs[2].rotation.set(tn.bend[2], 0, -tn.twist * 0.5)
  }

  return {
    root,
    kind: 'kuitsukushi',
    update,
    weakPoint(out: THREE.Vector3) {
      return core.getWorldPosition(out)
    },
    dispose() {
      b.dispose()
    }
  }
}
