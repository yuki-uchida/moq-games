/**
 * Procedural animation of the animals, driven only by CharacterPose. Layers (idle, run, air, dash, slide,
 * glide, hook, launch, down, revive, emotes, hurt, aim) add Euler offsets per bone with smoothed weights; paws
 * holding antiques are then placed by two-bone IK along the aim (ready poses, use tracks, recoil).
 */
import * as THREE from 'three'
import type { ItemId } from '../data/items'
import type { SpeciesId } from '../data/species'
import type { CharacterPose, Emote } from './api'
import { HOLD, RECOIL, readyKey, sampleTrack, useTrack, type Key, type Track } from './motion'
import { BONE_NAMES, type BodyPlan, type BoneName, type Rig } from './rig'

export interface FaceState {
  /** 0 open … 1 closed. */
  blink: number
  /** 0..1 happy closed arcs (^ ^). */
  happy: number
  /** −1 worried … 0 … 1 angry. */
  brow: number
  /** Brow lift (surprise / cheer). */
  browUp: number
  /** 0..1 open mouth. */
  mouth: number
}

export interface HandVisual {
  /** Item scale 0..1 (dissolve on swap, hidden while down / emoting). */
  vis: number
  /** Swap glow 0..1. */
  glow: number
}

const TAU = Math.PI * 2
const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b)
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Mulberry32: deterministic per-instance randomness (blinks, twitches). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface HandAnim {
  item: ItemId | null
  uses: number
  track: Track | null
  trackT: number
  recoil: number
  hold: number
  key: Key
}

const TAIL_STYLE: Record<SpeciesId, { wag: number; speed: number; lag: number }> = {
  shiba: { wag: 0.35, speed: 7, lag: 0.5 },
  cat: { wag: 0.3, speed: 1.4, lag: 0.9 },
  rabbit: { wag: 0.15, speed: 5, lag: 0.3 },
  bear: { wag: 0.1, speed: 2, lag: 0.3 },
  fox: { wag: 0.22, speed: 1.6, lag: 0.7 },
  penguin: { wag: 0.25, speed: 6, lag: 0.3 },
  hamster: { wag: 0.2, speed: 6, lag: 0.3 },
  owl: { wag: 0.12, speed: 2, lag: 0.3 }
}

export class Animator {
  readonly face: FaceState = { blink: 0, happy: 0, brow: 0, browUp: 0, mouth: 0 }
  readonly handVis: [HandVisual, HandVisual] = [
    { vis: 0, glow: 0 },
    { vis: 0, glow: 0 }
  ]
  /** 0..1 brightness factor of the chest core (off while down). */
  core = 1
  /** 0..1 glider membrane opening. */
  glide = 0

  private readonly bones: Record<BoneName, THREE.Bone>
  private readonly rest = new Map<BoneName, THREE.Vector3>()
  private readonly rot: Record<BoneName, THREE.Euler>
  private readonly random: () => number
  private t = 0
  private phase = 0
  private vx = 0
  private vz = 0
  private w = {
    run: 0,
    air: 0,
    dash: 0,
    slide: 0,
    glide: 0,
    hook: 0,
    launch: 0,
    down: 0,
    revive: 0,
    emote: 0,
    ground: 1,
    aim: 1
  }
  private vy = 0
  private grounded = true
  private sq = 0
  private sqVel = 0
  private hurt = -1
  private hurtT = 9
  private hurtSide = 1
  private launchT = 9
  private emote: Emote | null = null
  private emoteT = 0
  private blinkT = 2
  private blinkPhase = -1
  private twitchT = 3
  private twitch = 0
  private twitchSide = 1
  private earBounce = 0
  private earBounceVel = 0
  private lastHipsY = 0
  private lastHipsVel = 0
  private readonly hands: [HandAnim, HandAnim]
  private readonly tail: { wag: number; speed: number; lag: number }

  constructor(
    rig: Rig,
    private readonly plan: BodyPlan,
    species: SpeciesId,
    seed: number,
    private readonly gripOffset: [THREE.Vector3, THREE.Vector3]
  ) {
    this.bones = rig.byName
    this.rot = {} as Record<BoneName, THREE.Euler>
    for (const name of BONE_NAMES) {
      this.rest.set(name, this.bones[name].position.clone())
      const yawFirst = name === 'hips' || name === 'spine' || name === 'chest' || name === 'neck' || name === 'head'
      this.rot[name] = new THREE.Euler(0, 0, 0, yawFirst ? 'YXZ' : 'XYZ')
    }
    this.random = rng(seed)
    this.blinkT = 1 + this.random() * 3
    const mk = (): HandAnim => ({
      item: null,
      uses: 0,
      track: null,
      trackT: 0,
      recoil: 0,
      hold: 0,
      key: { t: 0, pos: [0, 0, 0], fwd: [0, 0, 1] }
    })
    this.hands = [mk(), mk()]
    this.tail = TAIL_STYLE[species]
  }

  update(dtIn: number, pose: CharacterPose): void {
    const dt = clamp(dtIn, 0, 0.1)
    this.t += dt
    const t = this.t
    const H = this.plan.H
    const k = (rate: number) => 1 - Math.exp(-rate * dt)
    const R = this.rot
    for (const name of BONE_NAMES) R[name].set(0, 0, 0)
    const hipsOff = new THREE.Vector3()

    // ---------------------------------------------------------------- events
    if (pose.hurt !== this.hurt) {
      if (this.hurt >= 0) {
        this.hurtT = 0
        this.hurtSide = this.random() < 0.5 ? -1 : 1
      }
      this.hurt = pose.hurt
    }
    this.hurtT += dt
    if (pose.grounded && !this.grounded && this.vy < -3) this.kick(-Math.min(0.13, -this.vy * 0.009))
    if (!pose.grounded && this.grounded && pose.vy > 2) this.kick(0.09)
    this.grounded = pose.grounded
    this.vy = pose.vy
    if (pose.move === 'launch' && this.w.launch < 0.05) this.launchT = 0
    this.launchT += dt
    const emote = pose.state === 'alive' ? (pose.emote ?? null) : null
    if (emote !== this.emote) {
      this.emote = emote
      this.emoteT = 0
    }
    this.emoteT += dt

    // ---------------------------------------------------------------- smoothed inputs
    this.vx += (pose.localVel[0] - this.vx) * k(10)
    this.vz += (pose.localVel[1] - this.vz) * k(10)
    const speed = Math.hypot(this.vx, this.vz)
    const dirX = speed > 0.05 ? -this.vx / speed : 0 // body +X (left)
    const dirZ = speed > 0.05 ? this.vz / speed : 1
    const down = pose.state !== 'alive'
    const mv = down ? 'idle' : pose.move
    const W = this.w
    const ease = (key: keyof typeof W, target: number, rate: number) => (W[key] += (target - W[key]) * k(rate))
    ease('ground', pose.grounded || mv === 'slide' ? 1 : 0, 18)
    ease('run', !down && pose.grounded && (mv === 'run' || mv === 'idle') ? smooth(0.3, 2.6, speed) : 0, 9)
    ease('air', !down && !pose.grounded && (mv === 'air' || mv === 'idle' || mv === 'run') ? 1 : 0, 10)
    ease('dash', mv === 'dash' ? 1 : 0, 16)
    ease('slide', mv === 'slide' ? 1 : 0, 12)
    ease('glide', mv === 'glide' ? 1 : 0, 8)
    ease('hook', mv === 'hook' ? 1 : 0, 14)
    ease('launch', mv === 'launch' ? 1 : 0, 12)
    ease('down', down ? 1 : 0, 6)
    ease('revive', pose.reviving && !down ? 1 : 0, 7)
    ease('emote', emote ? 1 : 0, 6)
    const busy = Math.max(W.down, W.revive, W.emote)
    ease('aim', 1 - Math.max(W.slide * 0.7, W.launch), 10)
    const idle = (1 - W.run) * W.ground * (1 - W.down) * (1 - W.revive) * (1 - W.slide) * (1 - W.dash)

    // ---------------------------------------------------------------- run cycle
    const cps = 0.9 + speed / (1.6 * H)
    this.phase = (this.phase + dt * cps * TAU * (W.run > 0.02 ? 1 : 0.3)) % (TAU * 64)
    const ph = this.phase
    const sp = Math.sin(ph),
      cp = Math.cos(ph)

    // ---------------------------------------------------------------- idle
    const breath = Math.sin(t * 2.1)
    if (idle > 0.001) {
      const w = idle
      R.chest.x += 0.025 * breath * w
      R.spine.x += 0.012 * breath * w
      hipsOff.y += 0.004 * H * breath * w
      R.head.x -= 0.02 * breath * w
      R.hips.z += 0.025 * Math.sin(t * 0.8) * w
      R.spine.z -= 0.025 * Math.sin(t * 0.8) * w
      R.head.z += 0.06 * Math.sin(t * 0.6 + 1) * w
      R.neck.y += 0.12 * Math.sin(t * 0.37) * w
      R.upperArmL.z += (0.02 + 0.03 * breath) * w
      R.upperArmR.z -= (0.02 + 0.03 * breath) * w
      R.lowerArmL.x -= 0.25 * w
      R.lowerArmR.x -= 0.25 * w
      R.thighL.z += 0.03 * w
      R.thighR.z -= 0.03 * w
    }

    // ---------------------------------------------------------------- run
    if (W.run > 0.001) {
      const w = W.run
      const fwd = Math.max(dirZ, 0)
      const amp = 0.62 + 0.18 * fwd
      const aL = sp * amp * w
      R.thighL.x -= aL * dirZ
      R.thighL.z += aL * dirX
      R.thighR.x += aL * dirZ
      R.thighR.z -= aL * dirX
      R.shinL.x += Math.max(0, cp) * 1.25 * w
      R.shinR.x += Math.max(0, -cp) * 1.25 * w
      R.footL.x += (-0.35 * Math.max(0, cp) + 0.25 * sp) * w
      R.footR.x += (-0.35 * Math.max(0, -cp) - 0.25 * sp) * w
      hipsOff.y += (0.032 * Math.cos(2 * ph) - 0.018) * H * w
      R.hips.y += 0.16 * sp * w
      R.chest.y -= 0.22 * sp * w
      R.hips.z += 0.06 * cp * w
      R.spine.x += (0.2 * dirZ - 0.06) * w
      R.spine.z -= 0.14 * dirX * w
      R.head.x -= 0.06 * Math.cos(2 * ph) * w
      R.upperArmL.x += sp * 0.8 * w
      R.upperArmR.x -= sp * 0.8 * w
      R.upperArmL.z += 0.06 * w
      R.upperArmR.z -= 0.06 * w
      R.lowerArmL.x -= 0.7 * w
      R.lowerArmR.x -= 0.7 * w
      R.tail1.x -= 0.35 * w
      R.tail1.y += 0.3 * sp * w
      R.tail2.y += 0.3 * Math.sin(ph - 0.8) * w
      R.tail3.y += 0.3 * Math.sin(ph - 1.6) * w
      R.earL1.x -= 0.22 * w
      R.earR1.x -= 0.22 * w
    }

    // ---------------------------------------------------------------- air
    if (W.air > 0.001) {
      const w = W.air * (1 - W.glide) * (1 - W.launch) * (1 - W.hook)
      const rise = clamp(pose.vy / 9, 0, 1)
      const fall = clamp(-pose.vy / 12, 0, 1)
      R.thighL.x += (-0.75 * rise - 0.2 - 0.1 * fall) * w
      R.thighR.x += (-0.45 * rise - 0.05 + 0.15 * fall) * w
      R.shinL.x += (1.3 * rise + 0.45) * w
      R.shinR.x += (0.9 * rise + 0.3) * w
      R.thighL.z += 0.1 * w
      R.thighR.z -= 0.1 * w
      R.upperArmL.z += (0.55 + 0.7 * fall) * w
      R.upperArmR.z -= (0.55 + 0.7 * fall) * w
      R.lowerArmL.x -= 0.45 * w
      R.lowerArmR.x -= 0.45 * w
      R.spine.x += (0.1 * rise - 0.08 * fall) * w
      R.head.x -= 0.1 * w
      R.earL1.z -= 0.35 * fall * w
      R.earR1.z += 0.35 * fall * w
      R.earL1.x += (0.25 * fall - 0.2 * rise) * w
      R.earR1.x += (0.25 * fall - 0.2 * rise) * w
      R.tail1.x -= 0.3 * fall * w
    }

    // ---------------------------------------------------------------- dash
    if (W.dash > 0.001) {
      const w = W.dash
      R.spine.x += 0.4 * dirZ * w
      R.spine.z -= 0.4 * dirX * w
      R.chest.x += 0.1 * w
      R.head.x -= 0.35 * w
      R.thighL.x -= 0.75 * w
      R.thighR.x += 0.65 * w
      R.shinR.x += 1.0 * w
      R.shinL.x += 0.3 * w
      R.upperArmL.x += 1.0 * w
      R.upperArmR.x += 1.0 * w
      R.upperArmL.z += 0.25 * w
      R.upperArmR.z -= 0.25 * w
      R.earL1.x -= 0.6 * w
      R.earR1.x -= 0.6 * w
      R.tail1.x -= 0.6 * w
      hipsOff.y -= 0.02 * H * w
    }

    // ---------------------------------------------------------------- slide (belly slide)
    if (W.slide > 0.001) {
      const w = W.slide
      R.hips.x += 1.38 * w
      hipsOff.y += (0.2 - this.plan.layout.hips[1] / H) * H * w
      hipsOff.z += 0.06 * H * w
      R.hips.z += 0.05 * Math.sin(t * 13) * w
      R.neck.x -= 0.65 * w
      R.head.x -= 0.65 * w
      R.upperArmL.x += 1.3 * w
      R.upperArmR.x += 1.3 * w
      R.upperArmL.z += 0.35 * w
      R.upperArmR.z -= 0.35 * w
      R.thighL.x += 0.15 * w
      R.thighR.x += 0.15 * w
      R.footL.x += 0.7 * w
      R.footR.x += 0.7 * w
      R.tail1.x -= 0.4 * w
    }

    // ---------------------------------------------------------------- glide
    this.glide += ((mv === 'glide' ? 1 : 0) - this.glide) * k(8)
    if (W.glide > 0.001) {
      const w = W.glide
      R.upperArmL.z += 1.35 * w
      R.upperArmR.z -= 1.35 * w
      R.upperArmL.x -= 0.15 * w
      R.upperArmR.x -= 0.15 * w
      R.spine.x += 0.3 * w
      R.head.x -= 0.32 * w
      R.thighL.x += 0.45 * w
      R.thighR.x += 0.45 * w
      R.shinL.x += 0.3 * w
      R.shinR.x += 0.3 * w
      R.hips.z += 0.08 * Math.sin(t * 1.5) * w
      R.earL1.x -= 0.35 * w
      R.earR1.x -= 0.35 * w
      R.tail1.x -= 0.25 * w
    }

    // ---------------------------------------------------------------- hook
    if (W.hook > 0.001) {
      const w = W.hook
      R.spine.x += 0.35 * w
      R.thighL.x += 0.5 * w
      R.thighR.x += 0.3 * w
      R.shinL.x += 0.7 * w
      R.shinR.x += 0.5 * w
      R.earL1.x -= 0.5 * w
      R.earR1.x -= 0.5 * w
    }

    // ---------------------------------------------------------------- launch (tuck + front flip)
    if (W.launch > 0.001) {
      const w = W.launch
      const flip = smooth(0, 0.7, this.launchT)
      R.hips.x += flip * TAU * w
      R.thighL.x -= 1.35 * w
      R.thighR.x -= 1.35 * w
      R.shinL.x += 1.9 * w
      R.shinR.x += 1.9 * w
      R.spine.x += 0.4 * w
      R.head.x += 0.25 * w
      R.upperArmL.x -= 0.6 * w
      R.upperArmR.x -= 0.6 * w
      R.lowerArmL.x -= 1.2 * w
      R.lowerArmR.x -= 1.2 * w
      hipsOff.y += 0.05 * H * w
    }

    // ---------------------------------------------------------------- down (sitting dazed)
    if (W.down > 0.001) {
      const w = W.down
      hipsOff.y -= 0.135 * H * w
      R.thighL.x -= 1.4 * w
      R.thighR.x -= 1.4 * w
      R.thighL.z += 0.22 * w
      R.thighR.z -= 0.22 * w
      R.shinL.x += 0.25 * w
      R.shinR.x += 0.25 * w
      R.footL.x -= 0.25 * w
      R.footR.x -= 0.25 * w
      R.spine.x += 0.16 * w
      R.chest.x += 0.1 * w
      R.neck.z += 0.12 * Math.sin(t * 2.2) * w
      R.head.x += (0.22 + 0.08 * Math.sin(t * 1.7)) * w
      R.head.z += 0.1 * Math.sin(t * 1.1) * w
      R.upperArmL.z += 0.2 * w
      R.upperArmR.z -= 0.2 * w
      R.upperArmL.x -= 0.25 * w
      R.upperArmR.x -= 0.25 * w
      R.lowerArmL.x -= 0.25 * w
      R.lowerArmR.x -= 0.25 * w
      R.tail1.x += 0.5 * w
      R.earL1.z -= 0.25 * w
      R.earR1.z += 0.25 * w
    }

    // ---------------------------------------------------------------- reviving (kneel)
    if (W.revive > 0.001) {
      const w = W.revive
      hipsOff.y -= 0.1 * H * w
      R.thighR.x -= 1.45 * w
      R.shinR.x += 1.5 * w
      R.thighL.x += 0.2 * w
      R.shinL.x += 1.75 * w
      R.footL.x += 0.55 * w
      R.spine.x += 0.35 * w
      R.head.x += 0.2 * w
    }

    // ---------------------------------------------------------------- emotes (FK part)
    const ew = W.emote
    const et = this.emoteT
    if (ew > 0.001 && this.emote) {
      switch (this.emote) {
        case 'victory':
          hipsOff.y += 0.07 * H * Math.abs(Math.sin(et * 4.2)) * ew
          R.upperArmL.z += 0.65 * ew
          R.lowerArmL.x -= 1.7 * ew
          R.spine.x -= 0.1 * ew
          R.head.x -= 0.15 * ew
          R.tail1.y += 0.4 * Math.sin(et * 9) * ew
          break
        case 'defeat':
          R.spine.x += 0.3 * ew
          R.neck.x += 0.35 * ew
          R.head.x += 0.25 * ew
          R.head.z += 0.08 * Math.sin(et * 0.9) * ew
          R.upperArmL.z += 0.05 * ew
          R.upperArmR.z -= 0.05 * ew
          R.earL1.z -= 0.28 * ew
          R.earR1.z += 0.28 * ew
          R.earL1.x += 0.3 * ew
          R.earR1.x += 0.3 * ew
          R.tail1.x += 0.5 * ew
          hipsOff.y -= 0.01 * H * ew
          break
        case 'cheer':
          hipsOff.y += 0.05 * H * Math.abs(Math.sin(et * 5)) * ew
          R.spine.z += 0.08 * Math.sin(et * 5) * ew
          R.head.x -= 0.2 * ew
          R.tail1.y += 0.4 * Math.sin(et * 10) * ew
          break
        case 'salute':
          R.spine.x -= 0.06 * ew
          R.head.x -= 0.05 * ew
          R.upperArmL.z += 0.04 * ew
          break
        case 'wave':
          R.head.z += 0.12 * ew
          R.upperArmL.z += 0.12 * ew
          R.tail1.y += 0.3 * Math.sin(et * 7) * ew
          break
      }
    }

    // ---------------------------------------------------------------- hurt flinch
    if (this.hurtT < 0.6) {
      const h = Math.exp(-this.hurtT * 8) * smooth(0, 0.04, this.hurtT)
      R.spine.x -= 0.32 * h
      R.head.x -= 0.25 * h
      R.hips.z += 0.08 * this.hurtSide * h
      R.upperArmL.z += 0.3 * h
      R.upperArmR.z -= 0.3 * h
      R.earL1.z -= 0.4 * h
      R.earR1.z += 0.4 * h
    }

    // ---------------------------------------------------------------- tail and ear life
    const tw = this.tail
    const tailW = 1 - 0.7 * W.run
    R.tail1.y += tw.wag * Math.sin(t * tw.speed) * tailW
    R.tail2.y += tw.wag * 0.9 * Math.sin(t * tw.speed - tw.lag) * tailW
    R.tail3.y += tw.wag * 0.9 * Math.sin(t * tw.speed - tw.lag * 2) * tailW
    this.twitchT -= dt
    if (this.twitchT < 0) {
      this.twitchT = 2.5 + this.random() * 4
      this.twitch = 1
      this.twitchSide = this.random() < 0.5 ? -1 : 1
    }
    this.twitch = Math.max(0, this.twitch - dt * 5)
    const tz = Math.sin(this.twitch * Math.PI) * 0.25
    if (this.twitchSide > 0) R.earL1.z += tz
    else R.earR1.z -= tz
    // Ears bounce with the hips' vertical acceleration (spring).
    const hipsVel = (hipsOff.y - this.lastHipsY) / Math.max(dt, 1e-3)
    const accel = (hipsVel - this.lastHipsVel) / Math.max(dt, 1e-3)
    this.lastHipsY = hipsOff.y
    this.lastHipsVel = hipsVel
    this.earBounceVel += (-120 * this.earBounce - 9 * this.earBounceVel - clamp(accel, -60, 60) * 0.02) * dt
    this.earBounce = clamp(this.earBounce + this.earBounceVel * dt, -0.4, 0.4)
    R.earL1.x += this.earBounce
    R.earR1.x += this.earBounce
    R.earL2.x += this.earBounce * 0.8
    R.earR2.x += this.earBounce * 0.8
    R.tail2.x += this.earBounce * 0.6

    // ---------------------------------------------------------------- aim (spine → head)
    const aimW = W.aim * (1 - busy)
    const ay = clamp(pose.aimYaw, -1.3, 1.3) * aimW
    const ap = clamp(pose.aimPitch, -1.35, 1.35) * aimW
    R.spine.y += 0.22 * ay
    R.chest.y += 0.3 * ay
    R.neck.y += 0.2 * ay
    R.head.y += 0.28 * ay
    R.chest.x -= 0.22 * ap
    R.neck.x -= 0.22 * ap
    R.head.x -= 0.32 * ap

    // ---------------------------------------------------------------- hand tracks (body accents)
    const keys: (Key | null)[] = [null, null]
    for (const h of [0, 1] as const) {
      const hp = pose.hands[h]
      const ha = this.hands[h]
      if (hp.item !== ha.item) {
        ha.item = hp.item
        ha.uses = hp.uses
        ha.track = null
      }
      if (hp.uses !== ha.uses) {
        ha.uses = hp.uses
        if (hp.item) {
          const tr = useTrack(hp.item, hp.combo)
          if (tr) {
            ha.track = tr
            ha.trackT = 0
          }
          ha.recoil = Math.min(1.6, ha.recoil + (RECOIL[hp.item] ?? 0))
        }
      }
      ha.recoil *= Math.exp(-dt * 11)
      ha.hold += ((hp.item && !down ? 1 : 0) * (1 - busy) - ha.hold) * k(10)
      if (!hp.item) continue
      const hold = HOLD[hp.item]
      let key = readyKey(hold, hp.act, hp.charge, hp.item)
      if (ha.track) {
        ha.trackT += dt
        if (ha.trackT >= ha.track.dur) ha.track = null
        else key = sampleTrack(ha.track, ha.trackT, ha.key)
      }
      if (hp.act === 'beam') {
        key = { ...key, pos: [key.pos[0], key.pos[1] + 0.004 * Math.sin(t * 61), key.pos[2]], lean: -0.12 }
      }
      keys[h] = key
      const side = h === 0 ? -1 : 1
      R.chest.y += (key.twist ?? 0) * -side * 0.55 * ha.hold
      R.spine.y += (key.twist ?? 0) * -side * 0.3 * ha.hold
      R.spine.x += (key.lean ?? 0) * 0.55 * ha.hold
      R.chest.x += (key.lean ?? 0) * 0.35 * ha.hold
      const drop = (key.drop ?? 0) * ha.hold
      hipsOff.y -= drop * H
      R.thighL.x -= drop * 3
      R.thighR.x -= drop * 3
      R.shinL.x += drop * 6
      R.shinR.x += drop * 6
      R.footL.x -= drop * 3
      R.footR.x -= drop * 3
      R.chest.x -= ha.recoil * 0.06
    }

    // ---------------------------------------------------------------- squash & stretch spring
    this.sqVel += (-160 * this.sq - 11 * this.sqVel) * dt
    this.sq = clamp(this.sq + this.sqVel * dt, -0.16, 0.16)
    const sq = this.sq

    // ---------------------------------------------------------------- write FK
    const B = this.bones
    for (const name of BONE_NAMES) B[name].quaternion.setFromEuler(R[name])
    const hipsRest = this.rest.get('hips')!
    B.hips.position.set(
      hipsRest.x + hipsOff.x,
      hipsRest.y + hipsOff.y + Math.min(sq, 0) * H * 0.3,
      hipsRest.z + hipsOff.z
    )
    B.hips.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5)

    // ---------------------------------------------------------------- arms: IK for held antiques and emotes
    this.solveArms(pose, keys, hipsOff, dt)

    // ---------------------------------------------------------------- face
    this.updateFace(dt, pose, keys)

    // ---------------------------------------------------------------- items / core
    for (const h of [0, 1] as const) {
      const hp = pose.hands[h]
      const hv = this.handVis[h]
      const target = hp.item && !down ? (1 - busy) * (1 - W.revive) : 0
      const swapScale = hp.swap > 0 ? Math.abs(1 - 2 * hp.swap) : 1
      hv.vis += (target - hv.vis) * k(14)
      hv.vis = Math.min(hv.vis, swapScale)
      hv.glow = hp.swap > 0 ? 1 - Math.abs(1 - 2 * hp.swap) : hv.glow * Math.exp(-dt * 10)
    }
    this.core += ((down ? 0 : 1) - this.core) * k(5)
  }

  private kick(amount: number) {
    this.sqVel += amount * 18
  }

  private readonly tmp = {
    m: new THREE.Matrix4(),
    mi: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    qi: new THREE.Quaternion(),
    qU: new THREE.Quaternion(),
    qL: new THREE.Quaternion(),
    qP: new THREE.Quaternion(),
    v: new THREE.Vector3(),
    w: new THREE.Vector3(),
    e: new THREE.Vector3(),
    s: new THREE.Vector3(),
    u: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    f: new THREE.Vector3(),
    r: new THREE.Vector3(),
    up: new THREE.Vector3(),
    basis: new THREE.Matrix4(),
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3()
  }

  private solveArms(pose: CharacterPose, keys: (Key | null)[], hipsOff: THREE.Vector3, dt: number) {
    const B = this.bones
    const H = this.plan.H
    const L = this.plan.layout
    const T = this.tmp
    // Chest frame in body space.
    B.hips.updateMatrix()
    B.spine.updateMatrix()
    B.chest.updateMatrix()
    T.m.copy(B.hips.matrix).multiply(B.spine.matrix).multiply(B.chest.matrix)
    T.mi.copy(T.m).invert()
    T.m.decompose(T.v, T.q, T.s)
    T.qi.copy(T.q).invert()
    // Aim frame (body space).
    const yaw = clamp(pose.aimYaw, -1.3, 1.3),
      pitch = clamp(pose.aimPitch, -1.35, 1.35)
    const f = T.f.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    const r = T.r.set(-Math.cos(yaw), 0, Math.sin(yaw))
    const up = T.up.crossVectors(r, f).normalize()
    const origin = new THREE.Vector3(0, L.upperArmL[1] + hipsOff.y, L.upperArmL[2] + hipsOff.z)
    const emote = this.emote
    const ew = this.w.emote
    const et = this.emoteT
    for (const h of [0, 1] as const) {
      const S = h === 0 ? 'R' : 'L'
      const side = h === 0 ? 1 : -1 // in aim-right units
      const ha = this.hands[h]
      const key = keys[h]
      let weight = 0
      const target = new THREE.Vector3()
      const fwd = new THREE.Vector3(0, 0, 1)
      const upv = new THREE.Vector3(0, 1, 0)
      if (key && ha.hold > 0.001) {
        weight = ha.hold
        const back = ha.recoil * 0.035
        target
          .copy(origin)
          .addScaledVector(r, key.pos[0] * side * H)
          .addScaledVector(up, key.pos[1] * H)
          .addScaledVector(f, (key.pos[2] - back) * H)
        fwd
          .set(0, 0, 0)
          .addScaledVector(r, key.fwd[0] * side)
          .addScaledVector(up, key.fwd[1] + ha.recoil * 0.3)
          .addScaledVector(f, key.fwd[2])
          .normalize()
        if (key.up)
          upv
            .set(0, 0, 0)
            .addScaledVector(r, key.up[0] * side)
            .addScaledVector(up, key.up[1])
            .addScaledVector(f, key.up[2])
        else upv.copy(up)
      }
      // Hook: the paw holding the gecko (or the right paw) reaches along the aim.
      if (this.w.hook > 0.01) {
        const hookHand = pose.hands[1].item === 'gecko' && pose.hands[0].item !== 'gecko' ? 1 : 0
        if (h === hookHand) {
          const w = this.w.hook
          const tgt = origin
            .clone()
            .addScaledVector(r, 0.05 * side * H)
            .addScaledVector(f, 0.3 * H)
          target.lerp(tgt, weight > 0 ? w : 1)
          fwd.lerp(f, w).normalize()
          weight = Math.max(weight, w)
        }
      }
      // Reviving: both paws reach forward-down.
      if (this.w.revive > 0.01) {
        const w = this.w.revive
        const tgt = new THREE.Vector3(-0.08 * side * H, 0.18 * H + hipsOff.y, 0.3 * H)
        target.lerp(tgt, weight > 0 ? w : 1)
        fwd.set(0, -0.6, 0.8).normalize()
        weight = Math.max(weight, w)
      }
      // Emotes with the paws.
      if (ew > 0.01 && emote) {
        const sx = -side // body +X is left; right paw (h 0) is −X
        let tgt: THREE.Vector3 | null = null
        let fw: THREE.Vector3 | null = null
        if (emote === 'victory' && h === 0) {
          tgt = new THREE.Vector3(sx * 0.12 * H, 0.98 * H + Math.sin(et * 8.4) * 0.03 * H, 0.05 * H)
          fw = new THREE.Vector3(0, 1, 0.2)
        } else if (emote === 'cheer') {
          const wave = Math.sin(et * 7 + h * Math.PI)
          tgt = new THREE.Vector3(sx * (0.18 + 0.04 * wave) * H, (0.95 + 0.04 * wave) * H, 0.06 * H)
          fw = new THREE.Vector3(sx * 0.3, 1, 0.2)
        } else if (emote === 'salute' && h === 0) {
          const hc = this.plan.headC
          tgt = new THREE.Vector3(sx * 0.14 * H, hc[1] + 0.07 * H, hc[2] + 0.16 * H)
          fw = new THREE.Vector3(sx * 0.6, 0.5, -0.3)
        } else if (emote === 'wave' && h === 0) {
          tgt = new THREE.Vector3(sx * (0.27 + 0.05 * Math.sin(et * 9)) * H, 0.88 * H, 0.1 * H)
          fw = new THREE.Vector3(sx * Math.sin(et * 9) * 0.5, 1, 0.3)
        }
        if (tgt && fw) {
          target.lerp(tgt, weight > 0 ? ew : 1)
          fwd.lerp(fw.normalize(), weight > 0 ? ew : 1).normalize()
          weight = Math.max(weight, ew)
          upv.set(0, 0, 1)
        }
      }
      if (weight < 0.001) continue
      this.ikArm(S, target, fwd, upv, weight, h)
    }
    void dt
  }

  /** Two-bone IK in chest space; `target` is the grip point in body space. */
  private ikArm(S: 'L' | 'R', target: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, weight: number, h: 0 | 1) {
    const B = this.bones
    const T = this.tmp
    const upper = B[`upperArm${S}`],
      lower = B[`lowerArm${S}`],
      paw = B[`paw${S}`]
    const sx = S === 'L' ? 1 : -1
    // Desired paw orientation (body → chest space).
    T.z.copy(fwd).normalize()
    T.x.crossVectors(up, T.z)
    if (T.x.lengthSq() < 1e-6) T.x.set(sx, 0, 0).cross(T.z)
    T.x.normalize()
    T.y.crossVectors(T.z, T.x)
    T.basis.makeBasis(T.x, T.y, T.z)
    T.qP.setFromRotationMatrix(T.basis).premultiply(T.qi)
    // Grip target → wrist target in chest space.
    const tgt = T.w.copy(target).applyMatrix4(T.mi)
    const grip = this.gripOffset[h === 0 ? 1 : 0]
    tgt.sub(T.v.copy(grip).applyQuaternion(T.qP))
    const sh = upper.position
    const restU = this.rest.get(`lowerArm${S}`)!
    const restL = this.rest.get(`paw${S}`)!
    const L1 = restU.length(),
      L2 = restL.length()
    const v = T.e.subVectors(tgt, sh)
    let d = v.length()
    d = clamp(d, (L1 + L2) * 0.25, (L1 + L2) * 0.999)
    const u = T.u.copy(v).normalize()
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    const hh = Math.sqrt(Math.max(L1 * L1 - a * a, 0))
    const pole = T.pole.set(sx * 0.75, -0.55, -0.35)
    pole.addScaledVector(u, -pole.dot(u))
    if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0)
    pole.normalize()
    const elbow = T.s.copy(sh).addScaledVector(u, a).addScaledVector(pole, hh)
    const dirU = new THREE.Vector3().subVectors(elbow, sh).normalize()
    const wrist = new THREE.Vector3().copy(sh).addScaledVector(u, d)
    const dirL = new THREE.Vector3().subVectors(wrist, elbow).normalize()
    T.qU.setFromUnitVectors(restU.clone().normalize(), dirU)
    const localL = dirL.applyQuaternion(T.qU.clone().invert())
    T.qL.setFromUnitVectors(restL.clone().normalize(), localL)
    const chain = T.qU.clone().multiply(T.qL)
    const qPaw = chain.invert().multiply(T.qP)
    upper.quaternion.slerp(T.qU, weight)
    lower.quaternion.slerp(T.qL, weight)
    paw.quaternion.slerp(qPaw, weight)
  }

  private updateFace(dt: number, pose: CharacterPose, keys: (Key | null)[]) {
    const F = this.face
    const k = (rate: number) => 1 - Math.exp(-rate * dt)
    // Blinks.
    this.blinkT -= dt
    if (this.blinkT < 0 && this.blinkPhase < 0) {
      this.blinkPhase = 0
      this.blinkT = 1.8 + this.random() * 3.4
      if (this.random() < 0.2) this.blinkT = 0.25
    }
    let blink = 0
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.16
      blink = Math.sin(Math.min(this.blinkPhase, 1) * Math.PI)
      if (this.blinkPhase >= 1) this.blinkPhase = -1
    }
    const hurt = this.hurtT < 0.5 ? Math.exp(-this.hurtT * 5) : 0
    const down = this.w.down
    const emote = this.emote
    const ew = this.w.emote
    let happy = 0,
      brow = 0,
      browUp = 0,
      mouth = 0
    const attacking = keys.some((key, h) => key && this.hands[h].track) || pose.hands.some((hp) => hp.act === 'charge')
    if (attacking) brow = 0.8
    if (pose.hands.some((hp) => hp.act === 'beam' || hp.act === 'guard')) brow = 0.6
    if (this.w.launch > 0.3 || this.w.glide > 0.5) mouth = 0.6
    if (emote === 'victory' || emote === 'cheer') {
      happy = ew
      mouth = ew
      browUp = ew
    } else if (emote === 'defeat') {
      brow = -ew
    } else if (emote === 'salute') {
      brow = 0.35 * ew
    } else if (emote === 'wave') {
      happy = 0.6 * ew
      browUp = 0.5 * ew
    }
    brow = brow * (1 - down) - down - hurt * 0.8
    mouth = Math.max(mouth, hurt * 0.8, down * 0.25)
    const revive = pose.state === 'down' ? pose.revive : 0
    const daze = down * (0.55 - 0.45 * revive)
    F.blink = Math.max(blink, hurt * 0.85, daze)
    F.happy += (happy - F.happy) * k(10)
    F.brow += (clamp(brow, -1, 1) - F.brow) * k(12)
    F.browUp += (browUp - F.browUp) * k(10)
    F.mouth += (mouth - F.mouth) * k(14)
  }
}
