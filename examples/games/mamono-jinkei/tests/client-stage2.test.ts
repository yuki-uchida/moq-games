/** Stage-2 client helpers: rat hints (mouse holes, currents, valves) and the valve's held E in guest inputs. */
import { describe, expect, test } from 'vitest'
import { flicker } from '../src/render/lighting'
import { validateNetInput } from '../src/net/validate'
import type { HeroView, StageInfo, View } from '../src/sim/types'
import { currentAt, hintsFor, nearHole, windAt } from '../src/ui/hints'

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

describe('crow hints (stage 3)', () => {
  const tower: StageInfo = { ...info, id: 'tower', winds: [{ x: 0, y: 0, w: 2, h: 3, dx: 1, dy: 0, strength: 90 }] }
  test('wind zones, vents, lock doors and bells', () => {
    expect(windAt(tower, hero(64, 64))?.strength).toBe(90)
    expect(windAt(tower, hero(300, 64))).toBeUndefined()
    const v = (h: HeroView, props: View['props'], keys = 0) =>
      hintsFor(
        {
          ...view(h, { props }),
          species: 'crow',
          stage: 'tower',
          party: { gems: 0, keys, techs: 0, kos: 0, time: 0, wipes: 0 }
        },
        tower,
        'me'
      )
    expect(v(hero(64, 64), []).some((x) => x.text.startsWith('陣形なら風に負けない'))).toBe(true)
    expect(
      v(hero(300, 160), [{ id: 1, kind: 'vent', x: 330, y: 160, state: 'idle', st: 0 }]).some(
        (x) => x.text === '上昇気流で回復'
      )
    ).toBe(true)
    expect(
      v(hero(300, 160), [{ id: 2, kind: 'lockdoor', x: 330, y: 160, state: 'closed', st: 0 }], 1)[0].text
    ).toContain('鍵で扉')
    expect(
      v(hero(300, 160), [{ id: 3, kind: 'bell', x: 330, y: 160, state: 'idle', st: 0 }]).some((x) => x.key === 'F')
    ).toBe(true)
  })
})

describe('wolf hints (stage 4)', () => {
  const forest: StageInfo = {
    ...info,
    id: 'forest',
    light: 'night',
    tiles: info.tiles.map((k, i) => (i === 13 ? 'ice' : k))
  }
  const v = (h: HeroView, props: View['props']) =>
    hintsFor({ ...view(h, { props }), species: 'wolf', stage: 'forest' }, forest, 'me')
  test('moonstones, resonance, ice walls and ice', () => {
    expect(v(hero(300, 160), [{ id: 1, kind: 'moonstone', x: 330, y: 160, state: 'off', st: 0 }])[0].text).toBe(
      '遠吠えで月石を灯す'
    )
    expect(v(hero(300, 160), [{ id: 2, kind: 'bigmoon', x: 330, y: 160, state: 'off', st: 0 }])[0].text).toContain(
      '共鳴'
    )
    expect(
      v(hero(300, 160), [{ id: 3, kind: 'icewall', x: 330, y: 160, state: 'idle', st: 0 }]).some((x) =>
        x.text.includes('氷の壁')
      )
    ).toBe(true)
    expect(v(hero(96, 160), []).some((x) => x.text === '氷の上はすべる')).toBe(true)
    expect(v(hero(352, 32), []).some((x) => x.key === 'Space' && x.text === '遠吠え')).toBe(true)
  })
})
