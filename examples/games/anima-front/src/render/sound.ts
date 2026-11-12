/**
 * Sound direction (DESIGN §16): every SimEvent → GameAudio.sfx with pan and distance attenuation from the
 * camera; sustained loops for beams, charges, gliders, hooks, cloaks, shields, rolling bombs, flyers and the
 * local player's low-anima pulse; ambience per theme; footsteps from run cycles; hit/head/KO markers for the
 * local player's hits. Never throws (audio is decoration).
 */
import * as THREE from 'three'
import type { GameAudio, LoopName, SfxName } from '../audio/api'
import { FOES } from '../data/enemies'
import { SPECIES } from '../data/species'
import type { ActorRef, SimEvent, V3, View } from '../sim/types'
import {
  ATTACK_SFX,
  blastSfx,
  dieSfx,
  EVENT_SFX,
  FIRE_SFX,
  HIT_SFX,
  IMPACT_SFX,
  OBJECTIVE_SFX,
  PROP_BREAK_SFX,
  spawnSfx,
  SWING_SFX,
  WINDUP_SFX
} from './sound-map'

/** Distance (m) at which a sound is at half volume, and the cut-off. */
const REF = 14
const MAX_DIST = 110

/** Volume for a sound at `d` metres (1 at the listener). Exported for tests. */
export function attenuation(d: number): number {
  if (d >= MAX_DIST) return 0
  const v = 1 / (1 + Math.pow(d / REF, 1.7))
  // Smooth fade to zero at the cut-off.
  return v * Math.min(1, (MAX_DIST - d) / 20)
}

export interface SoundContext {
  me?: string
  /** Position (feet) of an actor in the current view. */
  position(ref: ActorRef): V3 | undefined
}

export class SoundDirector {
  private readonly listener = new THREE.Vector3()
  private readonly right = new THREE.Vector3(1, 0, 0)
  private readonly tmp = new THREE.Vector3()
  private loopsNow = new Set<string>()
  private loopsPrev = new Set<string>()
  private readonly lastPlay = new Map<SfxName, number>()
  private readonly burst = new Map<SfxName, number>()
  private time = 0
  private readonly stride = new Map<string, number>()
  private ambience: LoopName | null = null
  enabled = true

  constructor(private readonly audio: GameAudio) {}

  setListener(camera: THREE.Camera) {
    this.listener.setFromMatrixPosition(camera.matrixWorld)
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
  }

  setAmbience(loop: LoopName | null) {
    if (this.ambience === loop) return
    if (this.ambience) this.safeLoop('ambience', null)
    this.ambience = loop
    if (loop) this.safeLoop('ambience', loop, { volume: 0.6 })
  }

  /** Plays a sound at a world point (or at the listener when `at` is omitted). */
  play(name: SfxName, at?: V3 | null, volume = 1, pitch?: number) {
    if (!this.enabled) return
    let pan = 0
    let v = volume
    if (at) {
      this.tmp.set(at[0] - this.listener.x, at[1] - this.listener.y, at[2] - this.listener.z)
      const d = this.tmp.length()
      v *= attenuation(d)
      if (v < 0.02) return
      if (d > 0.5) pan = Math.max(-0.9, Math.min(0.9, this.tmp.dot(this.right) / d))
    }
    // Throttle floods of the same sound (crowds): at most 4 starts per 60 ms window.
    const last = this.lastPlay.get(name) ?? -1
    if (this.time - last < 0.06) {
      const n = (this.burst.get(name) ?? 0) + 1
      this.burst.set(name, n)
      if (n > 4) return
    } else {
      this.lastPlay.set(name, this.time)
      this.burst.set(name, 1)
    }
    try {
      this.audio.sfx(name, { pan, volume: Math.min(1, v), pitch })
    } catch {
      // Audio is decoration.
    }
  }

  private safeLoop(id: string, name: LoopName | null, opts?: { pan?: number; volume?: number; progress?: number }) {
    try {
      this.audio.loop(id, name, opts)
    } catch {
      // ignore
    }
  }

  private loop(id: string, name: LoopName, at: V3 | null, volume = 1, progress?: number) {
    let pan = 0
    let v = volume
    if (at) {
      this.tmp.set(at[0] - this.listener.x, at[1] - this.listener.y, at[2] - this.listener.z)
      const d = this.tmp.length()
      v *= attenuation(d)
      if (v < 0.03) return
      if (d > 0.5) pan = Math.max(-0.9, Math.min(0.9, this.tmp.dot(this.right) / d))
    }
    this.loopsNow.add(id)
    this.safeLoop(id, name, { pan, volume: v, progress })
  }

  /** Answers one event with its sound(s). */
  event(e: SimEvent, ctx: SoundContext) {
    const me = ctx.me
    const own = (who: ActorRef | undefined) => who !== undefined && who === me
    const at = (who: ActorRef) => (own(who) ? null : (ctx.position(who) ?? null))
    switch (e.type) {
      case 'fire': {
        const name = FIRE_SFX[e.item]
        this.play(name, own(e.who) ? null : e.from, own(e.who) ? 0.9 : 0.75)
        return
      }
      case 'swing': {
        const name = SWING_SFX[e.item]
        if (name) this.play(name, at(e.who), own(e.who) ? 0.9 : 0.7, 1 + e.combo * 0.06)
        return
      }
      case 'hit': {
        if (e.negated) this.play('jellyPop', e.at)
        else this.play(e.blocked ? HIT_SFX.guard : HIT_SFX[e.surface], e.at, 0.7)
        if (own(e.by)) this.play(e.head ? 'headmarker' : e.weak ? 'hitWeak' : 'hitmarker', null, 0.55)
        if (e.targetKind === 'player' && own(e.target)) this.play('hurt', null, 0.6)
        return
      }
      case 'impact':
        this.play(IMPACT_SFX[e.surface], e.at, 0.45)
        return
      case 'blast':
        this.play(blastSfx(e.radius), e.at, 1)
        return
      case 'empty':
        if (own(e.who)) this.play('empty', null, 0.7)
        return
      case 'swap':
        this.play('swap', at(e.who), own(e.who) ? 0.6 : 0.3)
        return
      case 'jump':
        this.play(e.air ? 'airJump' : 'jump', at(e.who), own(e.who) ? 0.55 : 0.35)
        return
      case 'land':
        this.play(e.hard ? 'landHard' : 'land', at(e.who), own(e.who) ? 0.55 : 0.35)
        return
      case 'dash':
        this.play(e.slide ? 'slide' : 'dash', at(e.who), own(e.who) ? 0.7 : 0.45)
        return
      case 'launch':
        this.play('frogLaunch', at(e.who), 0.8)
        return
      case 'hook':
        this.play(e.done ? 'land' : 'geckoAttach', e.done ? at(e.who) : e.to, 0.6)
        return
      case 'glide':
        if (e.on) this.play('glideOpen', at(e.who), 0.6)
        return
      case 'cloak':
        this.play(e.on ? 'leafOn' : 'leafOff', at(e.who), 0.6)
        return
      case 'deploy':
        this.play(FIRE_SFX[e.item], e.at, 0.8)
        return
      case 'propHit':
        this.play('hermitHit', e.at, 0.6)
        return
      case 'propBreak':
        this.play(PROP_BREAK_SFX[e.kind], e.at, 0.9)
        return
      case 'passives':
        if (own(e.who)) this.play(e.online ? 'passivesOn' : 'passivesOff', null, 0.7)
        return
      case 'critical':
        if (own(e.who)) this.play('critical', null, 0.8)
        return
      case 'armorBreak':
        this.play('armorBreak', own(e.who) ? null : e.at, 1)
        if (own(e.by)) this.play('komarker', null, 0.7)
        return
      case 'down':
        this.play('down', at(e.who), 0.9)
        return
      case 'reviveStart':
        this.play('reviveTick', at(e.who), 0.7)
        return
      case 'revive':
        this.play('revive', at(e.who), 0.9)
        return
      case 'warp':
        this.play('warp', own(e.who) ? null : e.at, 0.9)
        return
      case 'respawn':
        this.play('respawn', own(e.who) ? null : e.at, 0.9)
        return
      case 'ko':
        if (own(e.by)) this.play('komarker', null, 0.8)
        this.play('koFeed', null, 0.35)
        if (e.points) this.play('scoreUp', null, 0.4)
        return
      case 'shard':
        this.play('shard', own(e.who) ? null : e.at, own(e.who) ? 0.5 : 0.25, 1 + Math.min(0.4, e.amount * 0.03))
        return
      case 'heal':
        if (own(e.who)) this.play('heal', null, 0.35)
        return
      case 'reveal':
        this.play('sonar', e.at, 0.9)
        return
      case 'foeSpawn':
        this.play(spawnSfx(e.kind), e.at, 0.7)
        return
      case 'foeWindup':
        this.play(WINDUP_SFX[e.attack], e.at, 0.85)
        return
      case 'foeAttack':
        this.play(ATTACK_SFX[e.attack], e.at, 0.9)
        return
      case 'foeDie':
        this.play(dieSfx(e.kind), e.at, FOES[e.kind].boss ? 1 : 0.7)
        if (own(e.by)) this.play('komarker', null, 0.45)
        return
      case 'bossPhase':
        this.play('bossRoar', null, 1)
        return
      case 'bossPart':
        this.play('bossPart', null, 1)
        return
      case 'wave':
        this.play('waveStart', null, 0.9)
        return
      case 'waveClear':
        this.play('waveClear', null, 0.9)
        return
      case 'objective':
        this.play(OBJECTIVE_SFX[e.what] ?? 'objectiveProgress', null, 0.8)
        return
      case 'radio':
        this.play('radio', null, 0.4)
        return
      case 'lastSpurt':
      case 'suddenDeath':
        this.play('lastSpurt', null, 0.9)
        return
      case 'countdown':
        this.play('countdown', null, 0.8)
        return
      case 'phase':
        if (e.phase === 'play') this.play('go', null, 0.9)
        else if (e.phase === 'victory') this.play('victory', null, 0.9)
        else if (e.phase === 'defeat') this.play('defeat', null, 0.9)
        return
      case 'tutorial':
        this.play('uiSelect', null, 0.5)
        return
      default: {
        const name = EVENT_SFX[(e as SimEvent).type]
        if (name && name !== 'byItem' && name !== 'bySurface' && name !== 'byKind') this.play(name, null)
      }
    }
  }

  /** Per-frame: loops and footsteps from the view. */
  frame(view: View, me: string | undefined, dt: number) {
    this.time += dt
    const swap = this.loopsPrev
    this.loopsPrev = this.loopsNow
    this.loopsNow = swap
    this.loopsNow.clear()
    for (const p of view.players) {
      const mine = p.id === me
      const at = mine ? null : p.p
      if (p.state !== 'alive') continue
      for (let h = 0; h < 2; h++) {
        const hand = p.hands[h]
        const item = hand.sel >= 0 ? hand.items[hand.sel] : undefined
        if (hand.act === 'beam') this.loop(`eel:${p.id}:${h}`, 'eel', at, mine ? 0.8 : 0.6)
        else if (hand.act === 'charge') this.loop(`charge:${p.id}:${h}`, 'charge', at, mine ? 0.6 : 0.4, hand.charge)
        else if (hand.act === 'guard' && item === 'armadillo') this.loop(`shield:${p.id}:${h}`, 'shield', at, 0.5)
      }
      if (p.move === 'glide') this.loop(`glide:${p.id}`, 'glide', at, mine ? 0.6 : 0.4)
      if (p.move === 'hook') this.loop(`hook:${p.id}`, 'hook', at, 0.6)
      if (p.cloak > 0.3) this.loop(`cloak:${p.id}`, 'cloak', at, mine ? 0.4 : 0.2)
      if (mine && p.anima / Math.max(1, p.maxAnima) <= 0.15) this.loop('lowAnima', 'lowAnima', null, 0.7)
      // Footsteps.
      if (p.grounded && (p.move === 'run' || p.move === 'idle')) {
        const speed = Math.hypot(p.v[0], p.v[2])
        if (speed > 1) {
          const len = 0.75 * (SPECIES[p.species].height / 1.25)
          const acc = (this.stride.get(p.id) ?? 0) + speed * dt
          if (acc >= len) {
            this.play('step', at, mine ? 0.35 : 0.25, 0.9 + Math.random() * 0.2)
            this.stride.set(p.id, acc - len)
          } else this.stride.set(p.id, acc)
        }
      }
    }
    // Rolling bombs and flyers: the closest few of each.
    let rolls = 0
    let wings = 0
    for (const f of view.foes) {
      if (f.state === 'dying' || f.state === 'spawn') continue
      if (f.kind === 'korogashi' && rolls < 3) {
        const d = Math.hypot(f.p[0] - this.listener.x, f.p[2] - this.listener.z)
        if (d < 40) {
          this.loop(`korogashi:${f.id}`, 'korogashi', f.p, 0.6)
          rolls++
        }
      } else if (f.kind === 'kagerou' && wings < 3) {
        const d = Math.hypot(f.p[0] - this.listener.x, f.p[2] - this.listener.z)
        if (d < 35) {
          this.loop(`kagerou:${f.id}`, 'kagerou', f.p, 0.5)
          wings++
        }
      }
    }
    for (const id of this.loopsPrev) if (!this.loopsNow.has(id)) this.safeLoop(id, null)
  }

  stopAll() {
    for (const id of this.loopsNow) this.safeLoop(id, null)
    for (const id of this.loopsPrev) this.safeLoop(id, null)
    this.loopsNow.clear()
    this.loopsPrev.clear()
    this.setAmbience(null)
  }
}
