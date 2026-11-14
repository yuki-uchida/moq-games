/**
 * What every simulation event and every staging/interface cue sounds like, and the sound board that plays them
 * through `GameAudio`. This file is the whole seam to the audio layer:
 *
 * - `SOUND_MAP` (one entry per `SimEventType`) and `CUE_MAP` (one per `SoundCue`) are tables of effect calls;
 * - `SoundBoard` adds stereo position and distance, a per-effect cooldown, delayed calls, the sounds that follow
 *   the hero's state (skid, swim strokes, heartbeat), the sustained loops (water, bees, wind) and the music.
 */
import type { GameAudio, LoopName, SfxName } from '../audio/api'
import type { SimEvent, SimEventType } from '../game/events'
import type { World } from '../game/sim'
import { TILE } from '../game/types'
import { isSkidding } from './clips'
import type { CueSink, SoundCue } from './cues'
import { SessionMusic } from './music'

export type { SoundCue } from './cues'

/** One effect to play. `delay` is in seconds after the event; `volume`/`pitch` multiply the effect's design. */
export interface SoundCall {
  name: SfxName
  volume?: number
  pitch?: number
  pan?: number
  delay?: number
}

const s = (name: SfxName, extra: Omit<SoundCall, 'name'> = {}): SoundCall => ({ name, ...extra })
const none: readonly SoundCall[] = []

type Picker<K extends SimEventType> = (event: Extract<SimEvent, { type: K }>) => readonly SoundCall[]
export type SoundMap = { [K in SimEventType]: Picker<K> }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const SOUND_MAP: SoundMap = {
  jump: () => [s('jump')],
  land: (e) => (e.speed > 520 ? [s('landHard')] : e.speed > 260 ? [s('land')] : none),
  drop: () => [s('drop')],
  bite: (e) => [s(e.hit ? 'biteHit' : 'bite')],
  splash: (e) => [s(e.enter ? 'splashIn' : 'splashOut', { volume: clamp(0.45 + e.speed / 700, 0.5, 1) })],
  hurt: (e) => (e.cause === 'bee' ? [s('hurt'), s('sting', { volume: 0.35, delay: 0.06 })] : [s('hurt')]),
  respawn: () => [s('respawn')],
  dead: () => [s('die')],
  pickup: (e) =>
    e.kind === 'fruit'
      ? [s('heal')]
      : e.kind === 'star'
        ? [s('starGet')]
        : [s('pickup', { pitch: clamp(1 + 0.07 * ((e.count ?? 1) - 1), 1, 1.7) })],
  dig: (e) => (e.primary ? [s('dig')] : [s('crumble', { volume: 0.6 })]),
  chop: () => [s('chop')],
  'tree-fall': () => [s('treeCreak')],
  'tree-land': () => [s('treeCrash')],
  'pipe-burst': () => [s('pipeBurst')],
  'hive-break': () => [s('hiveBreak')],
  sting: () => [s('sting')],
  'animal-wake': () => [s('animalWake'), s('animalCharge', { delay: 0.25 })],
  'animal-done': () => [s('animalPoof')],
  'rock-crack': () => [s('rockCrack')],
  'rock-break': () => [s('rockBreak')],
  switch: () => [s('switchOn')],
  'door-open': () => [s('doorOpen')],
  spawn: () => [s('spawnItem')],
  'princess-free': () => [s('cageBreak')],
  'goal-open': () => [s('goalOpen')],
  // The clear jingle is music; the board starts it from the world's state.
  clear: () => none,
  'enemy-hit': () => [s('enemyHit')],
  'enemy-down': () => [s('enemyDown')],
  hop: () => [s('hop')],
  spit: () => [s('spit')],
  'shot-hit': () => [s('shotHit')],
  // Staging voices the boss with the cue `boss-roar`.
  'boss-awake': () => none,
  'boss-state': (e) => (e.state === 'windup' ? [s('bossWindup')] : none),
  'boss-attack': (e) =>
    e.attack === 'dive'
      ? [s('bossDive')]
      : e.attack === 'leap'
        ? [s('bossLeap')]
        : e.attack === 'cast'
          ? [s('bossCast')]
          : [s('bossCharge')],
  'boss-shoot': () => [s('spit', { pitch: 0.72 })],
  'boss-slam': () => [s('bossSlam')],
  shock: () => [s('shockwave')],
  'boss-crash': () => [s('bossCrash')],
  'boss-hit': (e) => [s(e.weak ? 'bossHitWeak' : 'bossHit')],
  'boss-phase': () => [s('bossPhase')],
  'boss-tired': () => [s('momTired')],
  'boss-down': () => [s('bossDown')],
  minion: () => [s('minion')],
  'gate-up': () => [s('gateUp')],
  'gate-down': () => [s('gateDown')]
}

export const CUE_MAP: Record<SoundCue, readonly SoundCall[]> = {
  footstep: [s('step', { volume: 0.5 })],
  'menu-move': [s('menuMove')],
  'menu-select': [s('menuSelect')],
  'menu-back': [s('menuBack')],
  pause: [s('pauseIn')],
  resume: [s('pauseOut')],
  mute: none,
  'text-blip': [s('textBlip')],
  'page-turn': [s('pageTurn')],
  unlock: [s('unlock')],
  'tally-tick': [s('tallyTick')],
  'tally-done': [s('tallyDone')],
  'new-record': [s('newRecord')],
  'title-start': [s('titleStart')],
  'stage-start': [s('stageStart')],
  ready: [s('ready')],
  'iris-out': [s('irisOut')],
  'iris-in': [s('irisIn')],
  'boss-roar': [s('bossRoar')],
  'boss-boom': [s('bossBoom')],
  'mom-yell': [s('momYell')],
  'mom-tired': [s('momTired')],
  'low-hp': [s('lowHp')],
  confetti: [s('confetti')]
}

/** Effects the board plays from the hero's and the world's state rather than from an event or cue. */
export const STATE_SFX: readonly SfxName[] = ['skid', 'swim', 'lowHp']

// ---------------------------------------------------------------------------------------------------- space

/** Pan reaches ±PAN_MAX at PAN_RANGE px from the view centre. */
export const PAN_RANGE = 320
export const PAN_MAX = 0.7
/** Full volume up to NEAR px from the view centre, fading to silence at FAR. */
export const NEAR = 400
export const FAR = 800

export const panFor = (x: number, centreX: number) => clamp((x - centreX) / PAN_RANGE, -1, 1) * PAN_MAX

export const distanceGain = (x: number, centreX: number) => {
  const d = Math.abs(x - centreX)
  return d <= NEAR ? 1 : d >= FAR ? 0 : 1 - (d - NEAR) / (FAR - NEAR)
}

/** Events caused by the hero himself: panned, but never attenuated by distance. */
const HERO_EVENTS: ReadonlySet<SimEventType> = new Set<SimEventType>([
  'jump',
  'land',
  'drop',
  'bite',
  'splash',
  'hurt',
  'respawn',
  'dead',
  'pickup',
  'clear'
])

/** Where an event happened (world px). */
export function eventX(event: SimEvent): number {
  switch (event.type) {
    case 'dig':
    case 'gate-up':
    case 'gate-down':
      return event.tx * TILE + TILE / 2
    default:
      return event.x
  }
}

/** The calls for an event with pan and distance applied; calls that end up inaudible are dropped. */
export function callsFor(event: SimEvent, centreX: number): SoundCall[] {
  const calls = (SOUND_MAP[event.type] as (e: SimEvent) => readonly SoundCall[])(event)
  const x = eventX(event)
  const gain = HERO_EVENTS.has(event.type) ? 1 : distanceGain(x, centreX)
  const out: SoundCall[] = []
  for (const call of calls) {
    const volume = (call.volume ?? 1) * gain
    if (volume < 0.01) continue
    out.push({ ...call, volume, pan: call.pan ?? panFor(x, centreX) })
  }
  return out
}

/** The first call of an event (kept for tests and tools that only need the main sound). */
export const soundFor = (event: SimEvent): SfxName | null =>
  (SOUND_MAP[event.type] as (e: SimEvent) => readonly SoundCall[])(event)[0]?.name ?? null

// ------------------------------------------------------------------------------------------------- the board

/** An audio sink that does nothing: the title demo and tests without audio. */
export const SILENT_AUDIO: GameAudio = {
  prepare() {},
  unlock() {},
  playing() {},
  ahead: true,
  whenAhead: () => Promise.resolve(),
  setMusic() {},
  sfx() {},
  loop() {},
  setVolume() {},
  setMuted() {},
  muted: true,
  setDuck() {},
  dispose() {}
}

export const SWIM_INTERVAL = 0.45
export const HEARTBEAT_INTERVAL = 0.9
const COOLDOWN = 0.045

export interface SoundBoardOptions {
  /** Drive the music from the world (a play session). Off for the app's own cue board. */
  music?: boolean
  now?: () => number
  cooldown?: number
}

/** Plays events and cues, plus everything that follows the world's state, through a `GameAudio`. */
export class SoundBoard implements CueSink {
  private readonly last = new Map<SfxName, number>()
  private readonly queue: { due: number; call: SoundCall }[] = []
  private readonly loops = new Map<string, { name: LoopName; volume: number; pan: number }>()
  private readonly music: SessionMusic | null
  private readonly now: () => number
  private readonly cooldown: number
  private centreX = 0
  private stepFlip = false
  private wasSkidding = false
  private swimTimer = 0.15
  private beatTimer = 0
  private paused = false

  constructor(
    private audio: GameAudio,
    options: SoundBoardOptions = {}
  ) {
    this.now = options.now ?? (() => performance.now() / 1000)
    this.cooldown = options.cooldown ?? COOLDOWN
    this.music = options.music ? new SessionMusic(audio) : null
  }

  private play(call: SoundCall) {
    const t = this.now()
    if (t - (this.last.get(call.name) ?? -Infinity) < this.cooldown) return
    this.last.set(call.name, t)
    const options: { pan?: number; volume?: number; pitch?: number } = {}
    if (call.pan !== undefined) options.pan = call.pan
    if (call.volume !== undefined && call.volume !== 1) options.volume = call.volume
    if (call.pitch !== undefined) options.pitch = call.pitch
    this.audio.sfx(call.name, options)
  }

  private fire(call: SoundCall) {
    if (call.delay && call.delay > 0) this.queue.push({ due: this.now() + call.delay, call: { ...call, delay: 0 } })
    else this.play(call)
  }

  private flush() {
    if (!this.queue.length) return
    const t = this.now()
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].due > t) continue
      const [{ call }] = this.queue.splice(i, 1)
      i -= 1
      this.play(call)
    }
  }

  event(event: SimEvent) {
    this.music?.handle(event)
    for (const call of callsFor(event, this.centreX)) this.fire(call)
  }

  cue(cue: SoundCue) {
    for (const call of CUE_MAP[cue]) {
      if (cue === 'footstep') {
        this.stepFlip = !this.stepFlip
        this.fire({ ...call, pitch: this.stepFlip ? 0.94 : 1.07 })
      } else this.fire(call)
    }
  }

  /** Starts the stage's music and loops; call once the session begins. */
  start(world: World) {
    this.audio.playing(true)
    this.music?.update(world, 0)
  }

  /** Per display frame: delayed calls, the hero's state sounds, the loops and the music. */
  update(world: World, dt: number, centreX: number) {
    this.centreX = centreX
    this.flush()
    const p = world.player

    const skidding = !p.dead && isSkidding(p)
    if (skidding && !this.wasSkidding) this.fire(s('skid', { volume: 0.8, pan: panFor(p.x + p.w / 2, centreX) }))
    this.wasSkidding = skidding

    const swimming = p.inWater && !p.dead && (Math.abs(p.vx) > 25 || Math.abs(p.vy) > 25)
    if (swimming) {
      this.swimTimer -= dt
      if (this.swimTimer <= 0) {
        this.fire(s('swim', { pan: panFor(p.x + p.w / 2, centreX) }))
        this.swimTimer = SWIM_INTERVAL
      }
    } else this.swimTimer = 0.15

    const beating = !p.dead && p.hp > 0 && p.hp <= 2 && world.state === 'play'
    if (beating) {
      this.beatTimer -= dt
      if (this.beatTimer <= 0) {
        this.fire(s('lowHp', { volume: 0.7 }))
        this.beatTimer = HEARTBEAT_INTERVAL
      }
    } else this.beatTimer = 0

    this.updateLoops(world, centreX)
    this.music?.update(world, dt)
  }

  private updateLoops(world: World, centreX: number) {
    const p = world.player
    const hx = p.x + p.w / 2
    const hy = p.y + p.h / 2
    let pipe = Infinity
    let pipeX = 0
    for (const prop of world.props) {
      if (prop.kind !== 'pipe' || prop.state !== 'broken') continue
      const x = prop.x + (prop.w * TILE) / 2
      const d = Math.hypot(x - hx, prop.y + (prop.h * TILE) / 2 - hy)
      if (d < pipe) {
        pipe = d
        pipeX = x
      }
    }
    this.setLoop(
      'water',
      'water',
      pipe === Infinity ? null : { volume: clamp(1 - (pipe - 150) / 550, 0, 1) * 0.9, pan: panFor(pipeX, centreX) }
    )
    let bee = Infinity
    let beeX = 0
    for (const b of world.bees) {
      const d = Math.hypot(b.x - hx, b.y - hy)
      if (d < bee) {
        bee = d
        beeX = b.x
      }
    }
    this.setLoop(
      'bees',
      'bees',
      bee === Infinity ? null : { volume: clamp(1 - (bee - 100) / 500, 0, 1), pan: panFor(beeX, centreX) }
    )
    this.setLoop('wind', 'wind', world.theme === 'star' ? { volume: 0.35, pan: 0 } : null)
  }

  private setLoop(id: string, name: LoopName, state: { volume: number; pan: number } | null) {
    const active = this.loops.get(id)
    if (!state) {
      if (active) {
        this.loops.delete(id)
        this.audio.loop(id, null)
      }
      return
    }
    if (active && Math.abs(active.volume - state.volume) < 0.02 && Math.abs(active.pan - state.pan) < 0.02) return
    this.loops.set(id, { name, ...state })
    this.audio.loop(id, name, state)
  }

  private stopLoops() {
    for (const id of this.loops.keys()) this.audio.loop(id, null)
    this.loops.clear()
  }

  /** The pause menu ducks the music and silences the loops until the next frame brings them back. */
  setPaused(paused: boolean) {
    this.paused = paused
    if (paused) this.stopLoops()
    this.music?.setPaused(paused)
    // The frames stand still under the pause menu, so the audio may catch up on its background work.
    this.audio.playing(!paused)
  }

  get isPaused() {
    return this.paused
  }

  /** The session ended: no loops, no queued calls, no duck. The music is left to whatever comes next. */
  stop() {
    this.stopLoops()
    this.queue.length = 0
    this.music?.stop()
    this.audio.playing(false)
  }
}
