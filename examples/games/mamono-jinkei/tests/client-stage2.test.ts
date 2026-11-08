/** Stage-2 client helpers: rat hints (mouse holes, currents, valves) and the valve's held E in guest inputs. */
import { describe, expect, test } from 'vitest'
import { flicker } from '../src/render/lighting'
import { validateNetInput } from '../src/net/validate'
import type { HeroView, StageInfo, View } from '../src/sim/types'
import { currentAt, hintsFor, nearHole } from '../src/ui/hints'

const info: StageInfo = {
  id: 'sewer',
  w: 6,
  h: 3,
  tiles: [
    'sewer',
    'sewer',
    'hole',
    'hole',
    'sewer',
    'sewer',
    'current',
    'current',
    'current',
    'current',
    'current',
    'current',
    'sewer',
    'sewer',
    'sewer',
    'sewer',
    'sewer',
    'sewer'
  ],
  decor: [],
  npcs: [],
  rooms: [{ id: 'A', x: 0, y: 0, w: 6, h: 3 }],
  light: 'dim',
  holes: [[2, 3]],
  currents: [{ channel: 'R', dx: 1, dy: 0, speed: 120, tiles: [6, 7, 8, 9, 10, 11] }]
}

const hero = (x: number, y: number, extra: Partial<HeroView> = {}): HeroView => ({
  slot: 0,
  job: 'sword',
  x,
  y,
  z: 0,
  facing: 0,
  aim: 0,
  state: 'idle',
  st: 0,
  hp: 10,
  maxHp: 10,
  charge: 0,
  inv: 0,
  owner: 'me',
  ctrl: true,
  mode: 'follow',
  ...extra
})

function view(h: HeroView, extra: Partial<View> = {}): View {
  return {
    v: 1,
    t: 1,
    seq: 1,
    stage: 'sewer',
    species: 'rat',
    phase: 'play',
    heroes: [h],
    enemies: [],
    props: [],
    gone: [],
    shots: [],
    pickups: [],
    techs: [],
    formations: [],
    events: [],
    players: [{ id: 'me', name: 'me', slots: [0], ctrl: 0 }],
    party: { gems: 0, keys: 0, techs: 0, kos: 0, time: 0, wipes: 0 },
    dialogs: [],
    objective: '',
    ...extra
  }
}

describe('rat hints', () => {
  test('mouse holes and currents are found around the hero', () => {
    expect(nearHole(info, hero(96, 32))).toBe(true)
    expect(nearHole(info, hero(352, 160))).toBe(false)
    expect(currentAt(info, hero(96, 96))?.channel).toBe('R')
    expect(currentAt(info, hero(96, 96), ['R'])).toBeUndefined()
    expect(currentAt(info, hero(96, 160))).toBeUndefined()
  })
  test('the HUD suggests dashing into holes and walking currents as a formation', () => {
    const near = hintsFor(view(hero(96, 32)), info, 'me')
    expect(near.some((h) => h.key === 'Space' && h.text.includes('ネズミ穴'))).toBe(true)
    const wet = hintsFor(view(hero(96, 96)), info, 'me')
    expect(wet.some((h) => h.text.includes('陣形なら流されない'))).toBe(true)
    const valve = hintsFor(
      view(hero(300, 160), { props: [{ id: 1, kind: 'valve', x: 330, y: 160, state: 'off', st: 0 }] }),
      info,
      'me'
    )
    expect(valve[0]).toEqual({ key: 'E長押し', text: 'バルブをまわす' })
  })
})

test('guest inputs keep E held for valves; lamp flicker stays gentle', () => {
  expect(validateNetInput({ interactHeld: true })?.interactHeld).toBe(true)
  expect(validateNetInput({ interactHeld: 'yes' })?.interactHeld).toBe(false)
  expect(validateNetInput({})?.interactHeld).toBeUndefined()
  for (let t = 0; t < 10; t += 0.37) {
    const f = flicker(t, 3)
    expect(f).toBeGreaterThan(0.85)
    expect(f).toBeLessThan(1.15)
  }
})
