import { describe, expect, it } from 'vitest'
import { FX_SPEC } from '../src/art/contract'
import { SIM_EVENT_TYPES, type SimEvent, type SimEventType } from '../src/game/events'
import { FX_NAMES } from '../src/view/fx'
import { FX_MAP, playFx, type FxApi } from '../src/view/fx-map'
import { CUE_MAP, SOUND_MAP, SoundBoard, soundFor, type Sfx } from '../src/view/sound-map'

/** One sample of every event type (the record type makes the compiler check the list is complete). */
const SAMPLES: { [K in SimEventType]: Extract<SimEvent, { type: K }>[] } = {
  jump: [{ type: 'jump', x: 100, y: 200 }],
  land: [
    { type: 'land', x: 100, y: 200, speed: 700 },
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
  hurt: [{ type: 'hurt', x: 100, y: 200, dir: -1, hp: 3, cause: 'enemy' }],
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
  'tree-land': [
    { type: 'tree-land', kind: 'tree', x: 100, y: 200, dir: 1, tx: 2, ty: 3, length: 4 },
    { type: 'tree-land', kind: 'pine', x: 100, y: 200, dir: -1, tx: 2, ty: 3, length: 4 }
  ],
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
  'shot-hit': [
    { type: 'shot-hit', kind: 'seed', x: 100, y: 200 },
    { type: 'shot-hit', kind: 'shock', x: 100, y: 200 },
    { type: 'shot-hit', kind: 'rock', x: 100, y: 200 }
  ],
  'boss-awake': [{ type: 'boss-awake', x: 100, y: 200 }],
  'boss-state': [
    { type: 'boss-state', state: 'windup', x: 100, y: 200, dir: 1 },
    { type: 'boss-state', state: 'stunned', x: 100, y: 200, dir: 1 },
    { type: 'boss-state', state: 'tired', x: 100, y: 200, dir: -1 },
    { type: 'boss-state', state: 'recover', x: 100, y: 200, dir: -1 }
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

/** A stub view that records what each effect asked for. */
function stubView() {
  const calls: string[] = []
  const fxNames = new Set<string>(FX_NAMES)
  const check = (name: string) => {
    if (!fxNames.has(name)) throw new Error(`unknown fx clip ${name}`)
  }
  const view: FxApi = {
    spawn: (name) => {
      check(name)
      calls.push(`spawn:${name}`)
    },
    burst: (name, _x, _y, count) => {
      check(name)
      if (!(count > 0)) throw new Error('empty burst')
      calls.push(`burst:${name}`)
    },
    trauma: (a) => {
      if (!(a > 0 && a <= 1)) throw new Error(`trauma ${a}`)
      calls.push('trauma')
    },
    kick: () => calls.push('kick'),
    freeze: (s) => {
      if (!(s > 0 && s < 1)) throw new Error(`freeze ${s}`)
      calls.push('freeze')
    },
    popup: (text) => {
      if (!text) throw new Error('empty popup')
      calls.push('popup')
    },
    flash: () => calls.push('flash'),
    hurtPulse: () => calls.push('hurt'),
    rand: () => 0.5
  }
  return { view, calls }
}

describe('fx-map', () => {
  it('lists exactly the clips of the fx sheet', () => {
    expect([...FX_NAMES].sort()).toEqual(Object.keys(FX_SPEC).sort())
  })

  it('has a visual answer for every event type', () => {
    expect(Object.keys(FX_MAP).sort()).toEqual([...SIM_EVENT_TYPES].sort())
    for (const type of SIM_EVENT_TYPES) {
      const samples = SAMPLES[type] as SimEvent[]
      expect(samples.length, type).toBeGreaterThan(0)
      let total = 0
      for (const event of samples) {
        const { view, calls } = stubView()
        expect(() => playFx(event, view), type).not.toThrow()
        total += calls.length
      }
      expect(total, `${type} does something visible`).toBeGreaterThan(0)
    }
  })

  it('answers hits with hit-stop and kicks as designed', () => {
    const bite = stubView()
    playFx({ type: 'bite', x: 0, y: 0, dir: 1, hit: true }, bite.view)
    expect(bite.calls).toEqual(expect.arrayContaining(['spawn:chomp', 'spawn:spark', 'burst:star', 'kick', 'freeze']))
    const miss = stubView()
    playFx({ type: 'bite', x: 0, y: 0, dir: 1, hit: false }, miss.view)
    expect(miss.calls).toEqual(['spawn:chomp'])
    const pickup = stubView()
    playFx({ type: 'pickup', kind: 'berry', x: 0, y: 0, hp: 6, count: 3, need: 8 }, pickup.view)
    expect(pickup.calls).toContain('popup')
  })
})

describe('sound-map', () => {
  it('has a sound for every event type', () => {
    expect(Object.keys(SOUND_MAP).sort()).toEqual([...SIM_EVENT_TYPES].sort())
    for (const type of SIM_EVENT_TYPES) {
      const sounds = (SAMPLES[type] as SimEvent[]).map((event) => soundFor(event))
      expect(
        sounds.some((sound) => sound !== null),
        type
      ).toBe(true)
    }
  })

  it('plays through a sink with a per-sound cooldown', () => {
    const played: Sfx[] = []
    let now = 0
    const board = new SoundBoard({ play: (name) => played.push(name) }, () => now)
    for (const type of SIM_EVENT_TYPES)
      for (const event of SAMPLES[type] as SimEvent[]) {
        now += 1
        expect(() => board.event(event)).not.toThrow()
      }
    expect(played.length).toBeGreaterThan(SIM_EVENT_TYPES.length - 5)
    played.length = 0
    board.event({ type: 'jump', x: 0, y: 0 })
    board.event({ type: 'jump', x: 0, y: 0 })
    expect(played).toEqual(['jump'])
    now += 1
    board.cue('menu-select')
    board.cue('footstep')
    expect(played).toEqual(['jump', CUE_MAP['menu-select']])
  })
})
