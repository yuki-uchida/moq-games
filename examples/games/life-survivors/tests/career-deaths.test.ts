import { expect, test, vi } from 'vitest'
import { careerBody, careerSheets } from '../src/art/careers'
import { careerDeathSheet, deathKind } from '../src/art/deaths'
import { sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'
import { flatBody, lying, lyingBack } from '../src/art/rig'
import { ENEMIES, stageAt, timeAtAge } from '../src/data'
import { bodyFor, Renderer } from '../src/render'
import type { View, ViewPlayer } from '../src/view'

const styles = ['soccer', 'bureaucrat', 'entrepreneur', 'social', 'romantic', 'creative']

test.each(Object.keys(careerSheets))(
  '%s retains its outfit through every death without changing animation clocks',
  (key) => {
    const [, body, career] = key.split(':')
    const dressed = careerBody(body, career)
    const normal = sheet(key)
    expect(normal.idle.frames[0].data.includes(dressed.sleeve[1])).toBe(true)
    for (const frame of [lying(dressed), lyingBack(dressed), flatBody(dressed)])
      expect(frame.data.includes(dressed.sleeve[1])).toBe(true)
    const deaths = careerDeathSheet(body, career)
    const standard = sheet(`death:${body}`)
    expect(Object.keys(deaths)).toEqual(Object.keys(standard))
    for (const kind of Object.keys(deaths)) {
      const animation = deaths[kind]
      const original = standard[kind]
      expect(deaths[kind]).toBe(animation)
      expect(animation.frames).toHaveLength(original.frames.length)
      for (const field of ['fps', 'loop', 'hold', 'alpha', 'lift', 'soul'] as const)
        expect(animation[field]).toEqual(original[field])
      expect(animation.text?.map((frame) => frame?.data)).toEqual(original.text?.map((frame) => frame?.data))
      expect(animation.frames.some((frame) => frame.data.includes(dressed.sleeve[1]))).toBe(true)
      expect(
        animation.frames.some(
          (frame, index) => !frame.data.every((color, pixel) => color === original.frames[index].data[pixel])
        )
      ).toBe(true)
    }
  }
)

test('death sheets stay lazy, and lying outfits keep their own details and age-specific heads', () => {
  for (const style of styles) {
    const deaths = careerDeathSheet('adult', style)
    expect(Object.getOwnPropertyDescriptor(deaths, 'illness')?.get).toBeTypeOf('function')
    const adult = careerBody('adult', style)
    const elder = careerBody('elder', style)
    expect(adult.head).not.toBe(elder.head)
    expect(adult.lie.head).not.toBe(elder.lie.head)
    expect(adult.lie.coat).toBe(adult.sleeve)
    expect(adult.lie.beside).toBeUndefined()
    expect(lying(adult).data).not.toEqual(lying({ ...adult, lie: { ...adult.lie, detail: undefined } }).data)
  }
  expect(lying(careerBody('adult', 'soccer')).data.includes(R.paper[0])).toBe(true)
})

interface Harness {
  clock: number
  art: ReturnType<typeof vi.fn>
  deaths: Map<string, { at: number; body: string; kind: string }>
  prewarm: (body: string) => void
  player: (player: ViewPlayer, pos: { x: number; y: number }, local: boolean, time: number, phase: 'playing') => void
}

function harness() {
  return Object.assign(Object.create(Renderer.prototype), {
    clock: 0,
    ctx: { beginPath: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fillRect: vi.fn() },
    motion: new Map(),
    deaths: new Map(),
    warmedDeaths: new Set(),
    world: vi.fn(),
    shadow: vi.fn(),
    art: vi.fn(),
    label: vi.fn(),
    blit: vi.fn()
  }) as Harness
}

function participant(id: string, weapon = 'w_sports'): ViewPlayer {
  return {
    id,
    name: id,
    color: '#fff',
    x: 0,
    y: 0,
    fx: 1,
    fy: 0,
    hp: 100,
    maxHp: 100,
    downed: false,
    revive: 0,
    married: false,
    hasChild: false,
    hurt: false,
    parent: 'p_normal',
    weapons: [[weapon, 4, 0]],
    passives: [],
    choices: [],
    choiceSeq: 0
  }
}

test.each([8, 13, 16, 20, 30, 40, 60, 70])(
  'renderer retains death selection at age %s with a dedicated outfit',
  (age) => {
    const renderer = harness()
    const body = bodyFor(stageAt(timeAtAge(age)))
    for (const enemy of ENEMIES) {
      renderer.art.mockClear()
      const player = participant(enemy.id)
      player.downed = true
      player.killer = enemy.id
      const original = structuredClone(player)
      renderer.player(player, { x: 0, y: 0 }, false, timeAtAge(age), 'playing')
      const kind = deathKind(enemy.tag, age, body)
      expect(renderer.deaths.get(player.id)).toEqual({ at: 0, body: `${body}:soccer`, kind })
      expect(renderer.art.mock.calls.some((call) => call[0] === sheet(`death:${body}:soccer`)[kind].frames[0])).toBe(
        true
      )
      expect(player).toEqual(original)
    }
  }
)

test('eight participants freeze their own death appearance until revival, without mutating view inputs', () => {
  const renderer = harness()
  const weapons = ['w_sports', 'w_study', 'w_invest', 'w_friend', 'w_love', 'w_hobby', 'w_sports', 'w_study']
  const players = weapons.map((weapon, index) => participant(String(index), weapon))
  for (const player of players) {
    const original = structuredClone(player)
    renderer.player(player, { x: 0, y: 0 }, false, timeAtAge(30), 'playing')
    const style = styles[Number(player.id) % 6]
    expect(renderer.art.mock.lastCall?.[0]).toBe(sheet(`player:adult:${style}`).idle.frames[0])
    expect(player).toEqual(original)
    player.downed = true
    renderer.player(player, { x: 0, y: 0 }, false, timeAtAge(30), 'playing')
    expect(renderer.art.mock.lastCall?.[0]).toBe(sheet(`death:adult:${style}`).collapse.frames[0])
  }
  for (const player of players) {
    player.weapons = [['w_invest', 8, 0]]
    player.killer = 'intimidating_boss'
  }
  renderer.clock = 0.1
  for (const player of players) {
    const original = structuredClone(player)
    renderer.player(player, { x: 0, y: 0 }, false, timeAtAge(60), 'playing')
    expect(renderer.deaths.get(player.id)).toEqual({
      at: 0,
      body: `adult:${styles[Number(player.id) % 6]}`,
      kind: 'collapse'
    })
    expect(player).toEqual(original)
    player.downed = false
    renderer.player(player, { x: 0, y: 0 }, false, timeAtAge(60), 'playing')
    expect(renderer.deaths.has(player.id)).toBe(false)
    player.downed = true
    renderer.player(player, { x: 0, y: 0 }, false, timeAtAge(60), 'playing')
    expect(renderer.deaths.get(player.id)?.body).toBe('middle:entrepreneur')
  }
})

test('an observed absence resets only the departed ID death outfit and clock', () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  try {
    const ctx = { setTransform: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), fill: vi.fn() }
    const renderer = new Renderer({
      clientWidth: 800,
      clientHeight: 600,
      getContext: () => ctx
    } as unknown as HTMLCanvasElement)
    const internals = renderer as unknown as Harness
    for (const method of ['ground', 'prewarm', 'world', 'particles', 'lifeBars', 'shadow', 'label', 'blit'] as const)
      vi.spyOn(renderer as never, method).mockImplementation(vi.fn() as never)
    internals.art = vi.fn()
    Object.assign(ctx, { ellipse: vi.fn(), stroke: vi.fn(), arc: vi.fn() })
    const departed = participant('reused')
    const remaining = participant('remaining', 'w_study')
    departed.downed = remaining.downed = true
    const view: View = {
      v: 10,
      time: timeAtAge(30),
      phase: 'playing',
      level: 1,
      xp: 0,
      xpNext: 10,
      kills: 0,
      players: [departed, remaining],
      enemies: [],
      shots: [],
      bullets: [],
      gems: [],
      items: [],
      popups: [],
      fx: [],
      log: [],
      reaper: null
    }
    renderer.draw(view, 'spectator', 0.1, false)
    const retained = internals.deaths.get(remaining.id)
    view.players = [remaining]
    renderer.draw(view, 'spectator', 1, false)
    expect(internals.deaths.has(departed.id)).toBe(false)
    expect(internals.deaths.get(remaining.id)).toBe(retained)
    const replacement = participant(departed.id, 'w_invest')
    replacement.downed = true
    view.players = [replacement, remaining]
    view.time = timeAtAge(60)
    remaining.weapons = [['w_love', 8, 0]]
    renderer.draw(view, 'spectator', 0.1, false)
    expect(internals.deaths.get(replacement.id)).toEqual({
      at: internals.clock,
      body: 'middle:entrepreneur',
      kind: 'collapse'
    })
    expect(
      internals.art.mock.calls.some((call) => call[0] === sheet('death:middle:entrepreneur').collapse.frames[0])
    ).toBe(true)
    expect(internals.deaths.get(remaining.id)).toBe(retained)
  } finally {
    vi.unstubAllGlobals()
  }
})

test.each([
  [0, 'baby'],
  [4, 'toddler'],
  [8, 'kid'],
  [90, 'bed']
] as const)('standard appearance at age %s keeps its original death frames', (age, body) => {
  const renderer = harness()
  const player = participant('standard')
  if (body === 'kid') player.weapons = []
  player.downed = true
  renderer.player(player, { x: 0, y: 0 }, false, timeAtAge(age), 'playing')
  expect(renderer.art.mock.lastCall?.[0] as Raster).toBe(sheet(`death:${body}`).collapse.frames[0])
  expect(renderer.deaths.get(player.id)?.body).toBe(body)
})

test('prewarm queues only selected outfits once and builds at most one death per idle callback', () => {
  const callbacks: (() => void)[] = []
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => callbacks.push(callback))
  try {
    const renderer = harness()
    renderer.prewarm('adult:soccer')
    renderer.prewarm('adult:soccer')
    expect(callbacks).toHaveLength(1)
    callbacks.shift()!()
    expect(callbacks).toHaveLength(1)
    renderer.prewarm('adult:social')
    expect(callbacks).toHaveLength(2)
  } finally {
    vi.unstubAllGlobals()
  }
})
