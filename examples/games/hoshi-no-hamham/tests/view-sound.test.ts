import { describe, expect, it } from 'vitest'
import {
  LOOPS,
  SFX,
  THEMES,
  type GameAudio,
  type LoopName,
  type SfxName,
  type SfxOptions,
  type ThemeName
} from '../src/audio/api'
import type { SimEvent, SimEventType } from '../src/game/events'
import { SIM_EVENT_TYPES } from '../src/game/events'
import { World } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import { SOUND_CUES } from '../src/view/cues'
import { BOSS_DOWN_SILENCE, duckFor, musicFor, musicStateOf, type MusicState } from '../src/view/music'
import {
  CUE_MAP,
  FAR,
  HEARTBEAT_INTERVAL,
  NEAR,
  SILENT_AUDIO,
  SOUND_MAP,
  STATE_SFX,
  SWIM_INTERVAL,
  SoundBoard,
  callsFor,
  distanceGain,
  panFor
} from '../src/view/sound-map'

interface Recorded {
  sfx: { name: SfxName; options?: SfxOptions }[]
  music: { theme: ThemeName | null; layer: number }[]
  loops: { id: string; name: LoopName | null; options?: SfxOptions }[]
  ducks: number[]
  /** Every `playing(on)` call: the board tells the audio when a stage is being played. */
  playing: boolean[]
}

/** A GameAudio that records every call. */
function recorder() {
  const rec: Recorded = { sfx: [], music: [], loops: [], ducks: [], playing: [] }
  const audio: GameAudio = {
    prepare() {},
    unlock() {},
    playing: (on) => rec.playing.push(on),
    ahead: true,
    whenAhead: () => Promise.resolve(),
    setMusic: (theme, layer = 0) => rec.music.push({ theme, layer }),
    sfx: (name, options) => rec.sfx.push({ name, options }),
    loop: (id, name, options) => rec.loops.push({ id, name, options }),
    setVolume() {},
    setMuted() {},
    muted: false,
    setDuck: (amount) => rec.ducks.push(amount),
    dispose() {}
  }
  return { audio, rec }
}

/** One or more samples of every event type. */
const SAMPLES: Record<SimEventType, SimEvent[]> = {
  jump: [{ type: 'jump', x: 100, y: 200 }],
  land: [
    { type: 'land', x: 100, y: 200, speed: 700 },
    { type: 'land', x: 100, y: 200, speed: 300 },
    { type: 'land', x: 100, y: 200, speed: 100 }
  ],
  drop: [{ type: 'drop', x: 100, y: 200 }],
  bite: [
    { type: 'bite', x: 100, y: 200, dir: 1, hit: true },
    { type: 'bite', x: 100, y: 200, dir: -1, hit: false }
  ],
  splash: [
    { type: 'splash', x: 100, y: 200, enter: true, speed: 400 },
    { type: 'splash', x: 100, y: 200, enter: false, speed: 100 }
  ],
  hurt: [
    { type: 'hurt', x: 100, y: 200, dir: -1, hp: 3, cause: 'enemy' },
    { type: 'hurt', x: 100, y: 200, dir: -1, hp: 3, cause: 'bee' }
  ],
  respawn: [{ type: 'respawn', x: 100, y: 200 }],
  dead: [{ type: 'dead', x: 100, y: 200 }],
  pickup: [
    { type: 'pickup', kind: 'fruit', x: 100, y: 200, hp: 4 },
    { type: 'pickup', kind: 'star', x: 100, y: 200, hp: 6 },
    { type: 'pickup', kind: 'twig', x: 100, y: 200, hp: 6, count: 3, need: 8 }
  ],
  dig: [
    { type: 'dig', tx: 3, ty: 4, primary: true },
    { type: 'dig', tx: 3, ty: 5, primary: false }
  ],
  chop: [{ type: 'chop', kind: 'tree', x: 100, y: 200, dir: 1, left: 1 }],
  'tree-fall': [{ type: 'tree-fall', kind: 'pine', x: 100, y: 200, dir: -1 }],
  'tree-land': [{ type: 'tree-land', kind: 'tree', x: 100, y: 200, dir: 1, tx: 2, ty: 3, length: 4 }],
  'pipe-burst': [{ type: 'pipe-burst', x: 100, y: 200 }],
  'hive-break': [{ type: 'hive-break', x: 100, y: 200 }],
  sting: [{ type: 'sting', x: 100, y: 200 }],
  'animal-wake': [{ type: 'animal-wake', x: 100, y: 200, dir: 1 }],
  'animal-done': [{ type: 'animal-done', x: 100, y: 200 }],
  'rock-crack': [{ type: 'rock-crack', x: 100, y: 200 }],
  'rock-break': [{ type: 'rock-break', x: 100, y: 200 }],
  switch: [{ type: 'switch', x: 100, y: 200, id: 2 }],
  'door-open': [{ type: 'door-open', x: 64, y: 128, w: 1, h: 3, id: 1 }],
  spawn: [{ type: 'spawn', kind: 'berry', x: 100, y: 200 }],
  'princess-free': [{ type: 'princess-free', x: 100, y: 200 }],
  'goal-open': [{ type: 'goal-open', x: 100, y: 200 }],
  clear: [{ type: 'clear', x: 100, y: 200 }],
  'enemy-hit': [{ type: 'enemy-hit', id: 3, kind: 'walker', x: 100, y: 200, dir: 1 }],
  'enemy-down': [{ type: 'enemy-down', id: 3, kind: 'spitter', x: 100, y: 200, dir: -1 }],
  hop: [{ type: 'hop', id: 4, x: 100, y: 200 }],
  spit: [{ type: 'spit', id: 5, x: 100, y: 200, dir: -1 }],
  'shot-hit': [{ type: 'shot-hit', kind: 'seed', x: 100, y: 200 }],
  'boss-awake': [{ type: 'boss-awake', x: 100, y: 200 }],
  'boss-state': [
    { type: 'boss-state', state: 'windup', x: 100, y: 200, dir: 1 },
    { type: 'boss-state', state: 'stunned', x: 100, y: 200, dir: 1 }
  ],
  'boss-attack': (['charge', 'dive', 'dash', 'leap', 'cast'] as const).map((attack) => ({
    type: 'boss-attack' as const,
    attack,
    x: 100,
    y: 200,
    dir: 1 as const
  })),
  'boss-shoot': [{ type: 'boss-shoot', x: 100, y: 200, count: 3 }],
  'boss-slam': [{ type: 'boss-slam', x: 100, y: 200 }],
  shock: [{ type: 'shock', x: 100, y: 200, dir: 1 }],
  'boss-crash': [{ type: 'boss-crash', x: 100, y: 200, dir: -1 }],
  'boss-hit': [
    { type: 'boss-hit', x: 100, y: 200, ratio: 0.5, weak: false },
    { type: 'boss-hit', x: 100, y: 200, ratio: 0.2, weak: true }
  ],
  'boss-phase': [{ type: 'boss-phase', phase: 2, x: 100, y: 200 }],
  'boss-tired': [{ type: 'boss-tired', x: 100, y: 200 }],
  'boss-down': [{ type: 'boss-down', x: 100, y: 200 }],
  minion: [{ type: 'minion', kind: 'jumper', x: 100, y: 200 }],
  'gate-up': [{ type: 'gate-up', tx: 4, top: 2, bottom: 5 }],
  'gate-down': [{ type: 'gate-down', tx: 4, top: 2, bottom: 5 }]
}

const sfxSet = new Set<string>(SFX)
const world = (stageNo = 1) => new World(STAGES[stageNo - 1], { seed: 1 })

/** A board on a fake clock the test advances by hand. */
function board(music = false) {
  const { audio, rec } = recorder()
  const clock = { t: 100 }
  const b = new SoundBoard(audio, { music, now: () => clock.t })
  return { b, rec, clock }
}

describe('event and cue maps', () => {
  it('yield only valid effect names for every event type', () => {
    expect(Object.keys(SOUND_MAP).sort()).toEqual([...SIM_EVENT_TYPES].sort())
    for (const type of SIM_EVENT_TYPES) {
      expect(SAMPLES[type].length, type).toBeGreaterThan(0)
      for (const event of SAMPLES[type])
        for (const call of callsFor(event, 100)) {
          expect(sfxSet.has(call.name), `${type} -> ${call.name}`).toBe(true)
          if (call.volume !== undefined) expect(call.volume).toBeGreaterThan(0)
          if (call.pan !== undefined) expect(Math.abs(call.pan)).toBeLessThanOrEqual(0.7)
        }
    }
  })

  it('keeps every event audible except the two voiced elsewhere', () => {
    const silent = SIM_EVENT_TYPES.filter((type) => SAMPLES[type].every((event) => callsFor(event, 100).length === 0))
    expect(silent.sort()).toEqual(['boss-awake', 'clear'])
  })

  it('maps every cue to valid names or to nothing', () => {
    expect(Object.keys(CUE_MAP).sort()).toEqual([...SOUND_CUES].sort())
    for (const cue of SOUND_CUES) for (const call of CUE_MAP[cue]) expect(sfxSet.has(call.name), cue).toBe(true)
    expect(CUE_MAP.mute).toEqual([])
  })

  it('reaches every effect from events, cues or the state sounds', () => {
    const reached = new Set<string>(STATE_SFX)
    for (const type of SIM_EVENT_TYPES)
      for (const e of SAMPLES[type]) for (const c of callsFor(e, 100)) reached.add(c.name)
    for (const cue of SOUND_CUES) for (const c of CUE_MAP[cue]) reached.add(c.name)
    expect(SFX.filter((name) => !reached.has(name))).toEqual([])
  })

  it('follows the specified details', () => {
    const names = (event: SimEvent) => callsFor(event, 100).map((c) => c.name)
    expect(names({ type: 'land', x: 100, y: 0, speed: 700 })).toEqual(['landHard'])
    expect(names({ type: 'land', x: 100, y: 0, speed: 300 })).toEqual(['land'])
    expect(names({ type: 'land', x: 100, y: 0, speed: 100 })).toEqual([])
    expect(names({ type: 'hurt', x: 100, y: 0, dir: 1, hp: 2, cause: 'bee' })).toEqual(['hurt', 'sting'])
    expect(names({ type: 'animal-wake', x: 100, y: 0, dir: 1 })).toEqual(['animalWake', 'animalCharge'])
    expect(callsFor({ type: 'animal-wake', x: 100, y: 0, dir: 1 }, 100)[1].delay).toBeCloseTo(0.25)
    const pitch = (count: number) =>
      callsFor({ type: 'pickup', kind: 'twig', x: 0, y: 0, hp: 6, count, need: 8 }, 0)[0].pitch ?? 1
    expect(pitch(5)).toBeGreaterThan(pitch(2))
    expect(callsFor({ type: 'boss-shoot', x: 0, y: 0, count: 2 }, 0)[0]).toMatchObject({ name: 'spit' })
    expect(callsFor({ type: 'boss-shoot', x: 0, y: 0, count: 2 }, 0)[0].pitch).toBeLessThan(1)
  })
})

describe('pan and distance', () => {
  it('pans by 0.7 at 320 px and clamps', () => {
    expect(panFor(500, 500)).toBe(0)
    expect(panFor(820, 500)).toBeCloseTo(0.7)
    expect(panFor(180, 500)).toBeCloseTo(-0.7)
    expect(panFor(5000, 500)).toBeCloseTo(0.7)
    expect(panFor(660, 500)).toBeCloseTo(0.35)
  })

  it('fades events from 400 px and silences them beyond 800 px', () => {
    expect(distanceGain(NEAR, 0)).toBe(1)
    expect(distanceGain(600, 0)).toBeCloseTo(0.5)
    expect(distanceGain(FAR, 0)).toBe(0)
    expect(distanceGain(-900, 0)).toBe(0)
    const enemy: SimEvent = { type: 'enemy-down', id: 1, kind: 'walker', x: 600, y: 0, dir: 1 }
    expect(callsFor(enemy, 0)[0].volume).toBeCloseTo(0.5)
    expect(callsFor({ ...enemy, x: 900 }, 0)).toEqual([])
  })

  it('never attenuates the hero’s own sounds', () => {
    const jump: SimEvent = { type: 'jump', x: 5000, y: 0 }
    expect(callsFor(jump, 0)[0].volume).toBe(1)
    expect(callsFor(jump, 0)[0].pan).toBeCloseTo(0.7)
  })

  it('places tile events by their tile column', () => {
    const [call] = callsFor({ type: 'dig', tx: 10, ty: 2, primary: true }, 10 * 64 + 32)
    expect(call.pan).toBeCloseTo(0)
  })
})

describe('the board', () => {
  it('plays calls with a per-effect cooldown', () => {
    const { b, rec, clock } = board()
    b.event({ type: 'jump', x: 0, y: 0 })
    b.event({ type: 'jump', x: 0, y: 0 })
    expect(rec.sfx.map((c) => c.name)).toEqual(['jump'])
    clock.t += 0.1
    b.event({ type: 'jump', x: 0, y: 0 })
    expect(rec.sfx).toHaveLength(2)
    b.cue('menu-select')
    b.cue('mute')
    expect(rec.sfx.map((c) => c.name)).toEqual(['jump', 'jump', 'menuSelect'])
  })

  it('holds delayed calls until their time', () => {
    const { b, rec, clock } = board()
    const w = world()
    b.event({ type: 'animal-wake', x: 0, y: 0, dir: 1 })
    expect(rec.sfx.map((c) => c.name)).toEqual(['animalWake'])
    clock.t += 0.1
    b.update(w, 0.1, 0)
    expect(rec.sfx).toHaveLength(1)
    clock.t += 0.2
    b.update(w, 0.2, 0)
    expect(rec.sfx.map((c) => c.name)).toEqual(['animalWake', 'animalCharge'])
  })

  it('alternates the footstep pitch', () => {
    const { b, rec, clock } = board()
    for (let i = 0; i < 4; i++) {
      b.cue('footstep')
      clock.t += 0.3
    }
    const pitches = rec.sfx.map((c) => c.options?.pitch ?? 1)
    expect(pitches[0]).not.toBe(pitches[1])
    expect(pitches[0]).toBe(pitches[2])
    expect(rec.sfx.every((c) => c.name === 'step' && (c.options?.volume ?? 1) < 1)).toBe(true)
  })

  it('plays a skid once when the hero reverses at speed on the ground', () => {
    const { b, rec, clock } = board()
    const w = world()
    const p = w.player
    p.onGround = true
    p.facing = 1
    p.vx = 200
    b.update(w, 1 / 60, 0)
    expect(rec.sfx).toHaveLength(0)
    p.facing = -1
    for (let i = 0; i < 5; i++) {
      clock.t += 1 / 60
      b.update(w, 1 / 60, 0)
    }
    expect(rec.sfx.filter((c) => c.name === 'skid')).toHaveLength(1)
    p.vx = -200
    clock.t += 1
    b.update(w, 1 / 60, 0)
    p.facing = 1
    clock.t += 1
    b.update(w, 1 / 60, 0)
    expect(rec.sfx.filter((c) => c.name === 'skid')).toHaveLength(2)
  })

  it('strokes about every 0.45 s while swimming', () => {
    const { b, rec, clock } = board()
    const w = world()
    w.player.inWater = true
    w.player.vx = 100
    for (let i = 0; i < 120; i++) {
      clock.t += 1 / 60
      b.update(w, 1 / 60, 0)
    }
    const strokes = rec.sfx.filter((c) => c.name === 'swim').length
    expect(strokes).toBeGreaterThanOrEqual(Math.floor(2 / SWIM_INTERVAL) - 1)
    expect(strokes).toBeLessThanOrEqual(Math.ceil(2 / SWIM_INTERVAL) + 1)
    rec.sfx.length = 0
    w.player.vx = 0
    w.player.vy = 0
    for (let i = 0; i < 60; i++) {
      clock.t += 1 / 60
      b.update(w, 1 / 60, 0)
    }
    expect(rec.sfx).toHaveLength(0)
  })

  it('beats at two hearts or fewer, and stops when healed, dead or cleared', () => {
    const { b, rec, clock } = board()
    const w = world()
    const run = (seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) {
        clock.t += 1 / 60
        b.update(w, 1 / 60, 0)
      }
    }
    const beats = () => rec.sfx.filter((c) => c.name === 'lowHp').length
    w.player.hp = 3
    run(2)
    expect(beats()).toBe(0)
    w.player.hp = 2
    run(2)
    const n = beats()
    expect(n).toBeGreaterThanOrEqual(Math.floor(2 / HEARTBEAT_INTERVAL))
    expect(n).toBeLessThanOrEqual(Math.ceil(2 / HEARTBEAT_INTERVAL) + 1)
    w.player.hp = 5
    run(2)
    expect(beats()).toBe(n)
    w.player.hp = 1
    w.state = 'clear'
    run(2)
    expect(beats()).toBe(n)
    w.state = 'play'
    w.player.dead = true
    run(2)
    expect(beats()).toBe(n)
  })

  it('runs the loops while their source is near and stops them all at the end', () => {
    const { b, rec } = board()
    const w = world()
    const p = w.player
    b.update(w, 1 / 60, p.x)
    expect(rec.loops.filter((l) => l.name !== null)).toHaveLength(0)
    w.bees.push({ x: p.x + 50, y: p.y, vx: 0, vy: 0, life: 5, t: 0, cooldown: 0 })
    w.props.push({
      id: 999,
      kind: 'pipe',
      x: p.x + 100,
      y: p.y,
      w: 1,
      h: 1,
      hp: 1,
      state: 'broken',
      timer: 6,
      dir: 1,
      data: 0
    })
    b.update(w, 1 / 60, p.x)
    const started = rec.loops.filter((l) => l.name !== null).map((l) => l.name)
    expect(started.sort()).toEqual(['bees', 'water'])
    const water = rec.loops.find((l) => l.name === 'water')!
    expect(water.options?.volume).toBeGreaterThan(0.5)
    w.bees.length = 0
    b.update(w, 1 / 60, p.x)
    expect(rec.loops.at(-1)).toMatchObject({ id: 'bees', name: null })
    b.stop()
    expect(rec.loops.at(-1)).toMatchObject({ id: 'water', name: null })
  })

  it('plays the wind only in the star world', () => {
    const star = board()
    star.b.update(world(10), 1 / 60, 0)
    expect(star.rec.loops.some((l) => l.name === 'wind')).toBe(true)
    const meadow = board()
    meadow.b.update(world(1), 1 / 60, 0)
    expect(meadow.rec.loops.some((l) => l.name === 'wind')).toBe(false)
    expect(LOOPS).toContain('wind')
  })

  it('is silent for a demo (silent audio) and for an unused board', () => {
    const b = new SoundBoard(SILENT_AUDIO, { music: false })
    expect(() => {
      b.event({ type: 'jump', x: 0, y: 0 })
      b.cue('menu-select')
      b.update(world(), 1 / 60, 0)
      b.stop()
    }).not.toThrow()
  })
})

describe('music', () => {
  const play = (over: Partial<Extract<MusicState, { screen: 'play' }>> = {}): MusicState => ({
    screen: 'play',
    theme: 'meadow',
    hp: 6,
    outcome: 'play',
    boss: null,
    silent: false,
    ...over
  })

  it('plays the screens’ own themes', () => {
    for (const screen of ['title', 'select', 'story', 'ending'] as const)
      expect(musicFor({ screen })).toEqual({ theme: screen, layer: 0 })
    expect(musicFor({ screen: 'result' }).theme).toBe('clear')
    expect(musicFor({ screen: 'dead' }).theme).toBe('gameover')
  })

  it('plays each world’s theme with layer 1 at two hearts or fewer', () => {
    for (const theme of ['meadow', 'night', 'cave', 'forest', 'fortress', 'castle', 'star'] as const) {
      expect(musicFor(play({ theme }))).toEqual({ theme, layer: 0 })
      expect(musicFor(play({ theme, hp: 3 })).layer).toBe(0)
      expect(musicFor(play({ theme, hp: 2 }))).toEqual({ theme, layer: 1 })
      expect(musicFor(play({ theme, hp: 1 })).layer).toBe(1)
    }
  })

  it('switches to the boss themes with their layers', () => {
    expect(musicFor(play({ boss: { final: false, ratio: 1, phase: 1 } }))).toEqual({ theme: 'boss', layer: 0 })
    expect(musicFor(play({ boss: { final: false, ratio: 0.29, phase: 1 } }))).toEqual({ theme: 'boss', layer: 1 })
    expect(musicFor(play({ boss: { final: true, ratio: 0.9, phase: 1 } }))).toEqual({ theme: 'finalBoss', layer: 0 })
    expect(musicFor(play({ boss: { final: true, ratio: 0.45, phase: 2 } }))).toEqual({ theme: 'finalBoss', layer: 2 })
  })

  it('has jingles and silences', () => {
    expect(musicFor(play({ outcome: 'clear' })).theme).toBe('clear')
    expect(musicFor(play({ outcome: 'dead', boss: { final: false, ratio: 1, phase: 1 } })).theme).toBe('gameover')
    expect(musicFor(play({ silent: true }))).toEqual({ theme: null, layer: 0 })
    for (const theme of ['title', 'select', 'story', 'ending', 'clear', 'gameover']) expect(THEMES).toContain(theme)
  })

  it('ducks for pause and water', () => {
    expect(duckFor(false, false)).toBe(0)
    expect(duckFor(false, true)).toBe(0.6)
    expect(duckFor(true, false)).toBe(1)
    expect(duckFor(true, true)).toBe(1)
  })

  it('reads the state from a world: the chasing parent is not a boss fight', () => {
    const chase = world(1)
    expect(chase.boss?.def.stamina).toBeTruthy()
    expect(musicFor(musicStateOf(chase, false)).theme).toBe('meadow')
    const brute = world(5)
    expect(musicFor(musicStateOf(brute, false)).theme).toBe('forest')
    brute.boss!.active = true
    expect(musicFor(musicStateOf(brute, false)).theme).toBe('boss')
    brute.boss!.hp = brute.boss!.maxHp * 0.2
    expect(musicFor(musicStateOf(brute, false))).toEqual({ theme: 'boss', layer: 1 })
    brute.boss!.dead = true
    expect(musicFor(musicStateOf(brute, false)).theme).toBe('forest')
    const final = world(10)
    final.boss!.active = true
    expect(musicFor(musicStateOf(final, false))).toEqual({ theme: 'finalBoss', layer: 0 })
    final.boss!.phase = 2
    expect(musicFor(musicStateOf(final, false))).toEqual({ theme: 'finalBoss', layer: 2 })
  })

  it('drives the audio during a stage: world theme, boss, silence after the boss, return, jingles, ducks', () => {
    const { b, rec } = board(true)
    const w = world(5)
    b.start(w)
    expect(rec.music.at(-1)).toEqual({ theme: 'forest', layer: 0 })
    const count = rec.music.length
    b.update(w, 1 / 60, 0)
    expect(rec.music).toHaveLength(count)
    w.boss!.active = true
    b.update(w, 1 / 60, 0)
    expect(rec.music.at(-1)).toEqual({ theme: 'boss', layer: 0 })
    w.boss!.dead = true
    b.event({ type: 'boss-down', x: 0, y: 0 })
    b.update(w, 1 / 60, 0)
    expect(rec.music.at(-1)).toEqual({ theme: null, layer: 0 })
    b.update(w, BOSS_DOWN_SILENCE - 0.1, 0)
    expect(rec.music.at(-1)?.theme).toBeNull()
    b.update(w, 0.2, 0)
    expect(rec.music.at(-1)).toEqual({ theme: 'forest', layer: 0 })
    w.state = 'clear'
    b.update(w, 1 / 60, 0)
    expect(rec.music.at(-1)?.theme).toBe('clear')
    w.state = 'dead'
    b.update(w, 1 / 60, 0)
    expect(rec.music.at(-1)?.theme).toBe('gameover')
    // Ducks.
    w.state = 'play'
    w.player.inWater = true
    b.update(w, 1 / 60, 0)
    expect(rec.ducks.at(-1)).toBe(0.6)
    b.setPaused(true)
    expect(rec.ducks.at(-1)).toBe(1)
    b.setPaused(false)
    expect(rec.ducks.at(-1)).toBe(0.6)
    b.stop()
    expect(rec.ducks.at(-1)).toBe(0)
    // The audio is told when the stage is being played: from the start, not under the pause menu, not after the end.
    expect(rec.playing).toEqual([true, false, true, false])
  })

  it('a board without music (the app’s cue board, a demo) never changes the music', () => {
    const { b, rec } = board(false)
    const w = world()
    b.start(w)
    b.update(w, 1 / 60, 0)
    b.setPaused(true)
    b.stop()
    expect(rec.music).toEqual([])
    expect(rec.ducks).toEqual([])
  })
})
