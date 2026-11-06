import { describe, expect, it } from 'vitest'
import { ENEMIES, ITEM_KINDS, STAGES, WEAPONS, WEAPON_BY_ID, stageAt, timeAtAge } from '../src/data'
import { GROUNDS } from '../src/art/world'
import { FX, FX_STRIDE } from '../src/fx'
import {
  BANNER_MS,
  BannerQueue,
  FxTracker,
  STAGE_LINES,
  choiceRarity,
  choiceSynergies,
  consumeFx,
  findBoss,
  gainFor,
  heartbeatLevel,
  panFor,
  phaseCue,
  type FxContext,
  type SoundSink
} from '../src/hud'
import { bodyFor } from '../src/render'
import { STRIDE } from '../src/view'

it('shows owned evolution partners for weapon and personality choices', () => {
  const weapons: [string, number, number][] = [
    ['w_friend', 1, 0],
    ['w_ring', 8, 0]
  ]
  const passives: [string, number][] = [['p_kind', 1]]
  expect(choiceSynergies(weapons, passives, 'w:w_friend')).toEqual(['p_kind'])
  expect(choiceSynergies(weapons, passives, 's:w_friend')).toEqual(['p_kind'])
  expect(choiceSynergies(weapons, passives, 'p:p_kind')).toEqual(['w_friend', 'w_ring'])
  expect(choiceSynergies(weapons, [], 'w:w_friend')).toEqual([])
  expect(choiceSynergies([], passives, 'p:p_kind')).toEqual([])
  expect(choiceSynergies(weapons, passives, 'r:w_friend:w_study')).toEqual([])
  expect(choiceSynergies(weapons, passives, 'x:meal')).toEqual([])
})

type Call = [string, string | undefined, Record<string, unknown> | undefined]
function fakeAudio() {
  const calls: Call[] = []
  const sink: SoundSink = {
    play: (name, options) => calls.push(['play', name, options as Record<string, unknown>]),
    fire: (id, options) => calls.push(['fire', id, options as Record<string, unknown>])
  }
  return { calls, sink }
}
const fx = (...events: [number, number, number, number, number, number][]) => events.flat()
const ctx = (extra: Partial<FxContext> = {}): FxContext => ({
  localIndex: 0,
  x: 1000,
  y: 500,
  evolved: () => false,
  ...extra
})
const names = (calls: Call[]) => calls.map((c) => c[1])

describe('life stage presentation', () => {
  it.each([
    [23, 35, '成人期', '自分の歩幅で進んで', 'adult', 'office'],
    [35, 50, '壮年期', '日々を重ねて', 'prime', 'street']
  ] as const)(
    'keeps age %i path-neutral with unchanged artwork and boundaries',
    (age, nextAge, name, line, body, ground) => {
      const stage = stageAt(timeAtAge(age) + 0.01)
      expect(stage.name).toBe(name)
      expect(stage.icon).toBe('🧑')
      expect(stageAt(timeAtAge(age) - 0.01)).not.toBe(stage)
      expect(stageAt(timeAtAge(nextAge) - 0.01)).toBe(stage)
      expect(stageAt(timeAtAge(nextAge) + 0.01)).not.toBe(stage)
      expect(STAGE_LINES[STAGES.indexOf(stage)]).toBe(line)
      expect(bodyFor(stage)).toBe(body)
      expect(GROUNDS[stage.name]).toBe(ground)
    }
  )

  it('uses a path-neutral stage while retaining the youth artwork', () => {
    const stage = stageAt(timeAtAge(18) + 0.01)
    expect(stage.name).toBe('青年期')
    expect(stageAt(timeAtAge(22) + 0.01)).toBe(stage)
    expect(STAGE_LINES[STAGES.indexOf(stage)]).toBe('これからの道を探して')
    expect(bodyFor(stage)).toBe('college')
    expect(GROUNDS[stage.name]).toBe('campus')
  })
})

describe('FxTracker', () => {
  it('hands out each seq once and resets when a new game starts', () => {
    const tracker = new FxTracker()
    const first = fx([1, FX.STAGE, 0, 0, 0, 0], [2, FX.SWARM, 0, 0, 0, 0])
    expect(tracker.take(first).map((e) => e.seq)).toEqual([1, 2])
    expect(tracker.take(first)).toEqual([])
    const more = fx([2, FX.SWARM, 0, 0, 0, 0], [3, FX.ELITE, 0, 0, 0, 0])
    expect(tracker.take(more).map((e) => e.seq)).toEqual([3])
    // a fresh game restarts at seq 1
    expect(tracker.take(fx([1, FX.STAGE, 0, 0, 0, 0])).map((e) => e.seq)).toEqual([1])
    expect(FX_STRIDE).toBe(6)
  })
})

describe('fx -> sound', () => {
  it('maps kills, hits and crits with pan and distance gain', () => {
    const { calls, sink } = fakeAudio()
    consumeFx(
      fx(
        [1, FX.KILL, 1320, 500, 0, 1],
        [2, FX.KILL, 1000, 500, 0, 0],
        [3, FX.HIT, 1000, 500, 0, 2],
        [4, FX.HIT, 1000, 500, 0, 1],
        [5, FX.HIT, 1000, 500, 0, 0]
      ),
      new FxTracker(),
      ctx(),
      sink
    )
    expect(names(calls)).toEqual(['killElite', 'kill', 'crit', 'hitStrong', 'hit'])
    expect(calls[0][2]!.pan).toBeCloseTo(0.5)
    expect(calls[0][2]!.gain).toBeCloseTo(1 - 320 / 900)
    expect(calls[1][2]).toMatchObject({ pan: 0, gain: 1 })
  })

  it('plays FIRE only for the local player, with the evolved layer', () => {
    const { calls, sink } = fakeAudio()
    const id = WEAPONS[3].id
    consumeFx(
      fx([1, FX.FIRE, 1000, 500, 3, 1], [2, FX.FIRE, 1000, 500, 3, 0]),
      new FxTracker(),
      ctx({ evolved: (w) => w === id }),
      sink
    )
    expect(calls).toEqual([['fire', id, { evolved: true, pan: 0 }]])
  })

  it('keeps personal sounds personal', () => {
    const { calls, sink } = fakeAudio()
    consumeFx(
      fx(
        [1, FX.HURT, 1000, 500, 1, 5],
        [2, FX.HURT, 1000, 500, 0, 5],
        [3, FX.GEM, 1000, 500, 4, 1],
        [4, FX.GEM, 1000, 500, 4, 0],
        [5, FX.CHEST, 1500, 500, 1, 1],
        [6, FX.CHEST, 1000, 500, 1, 0],
        [7, FX.EVOLVE, 1700, 500, 0, 1]
      ),
      new FxTracker(),
      ctx(),
      sink
    )
    expect(names(calls)).toEqual(['hurt', 'gem', 'chest', 'chest', 'evolve'])
    expect(calls[2][2]!.gain).toBeLessThan(1) // someone else's chest is quieter
    expect(calls[3][2]).toEqual({})
    expect(calls[4][2]!.gain).toBeLessThan(1)
  })

  it('plays LEVELUP once per new team level, even across snapshots', () => {
    const { calls, sink } = fakeAudio()
    const tracker = new FxTracker()
    consumeFx(fx([1, FX.LEVELUP, 0, 0, 2, 0], [2, FX.LEVELUP, 0, 0, 2, 1]), tracker, ctx(), sink)
    consumeFx(fx([2, FX.LEVELUP, 0, 0, 2, 1], [3, FX.LEVELUP, 0, 0, 3, 0]), tracker, ctx(), sink)
    expect(names(calls)).toEqual(['levelUp', 'levelUp'])
  })

  it('only hears enemy shots and windups near the local player', () => {
    const { calls, sink } = fakeAudio()
    consumeFx(
      fx(
        [1, FX.ENEMY_SHOT, 1400, 500, 0, 0],
        [2, FX.ENEMY_SHOT, 2400, 500, 0, 0],
        [3, FX.WINDUP, 1000, 1000, 0, 0],
        [4, FX.WINDUP, 1000, 2500, 0, 0]
      ),
      new FxTracker(),
      ctx(),
      sink
    )
    expect(names(calls)).toEqual(['enemyShot', 'windup'])
  })

  it('maps the global cues and items', () => {
    const { calls, sink } = fakeAudio()
    const magnet = ITEM_KINDS.indexOf('magnet')
    consumeFx(
      fx(
        [1, FX.BOSS_SPAWN, 0, 0, 0, 0],
        [2, FX.BOSS_KILL, 0, 0, 0, 0],
        [3, FX.STAGE, 0, 0, 1, 0],
        [4, FX.SWARM, 0, 0, 0, 0],
        [5, FX.ELITE, 1000, 500, 0, 0],
        [6, FX.BLAST, 1000, 500, 90, 0],
        [7, FX.DOWN, 1000, 500, 0, 0],
        [8, FX.REVIVE, 1000, 500, 0, 0],
        [9, FX.ITEM, 1000, 500, magnet, 0],
        [10, FX.ITEM, 1000, 500, 0, 0]
      ),
      new FxTracker(),
      ctx(),
      sink
    )
    expect(names(calls)).toEqual([
      'bossWarn',
      'bossKill',
      'stage',
      'swarm',
      'elite',
      'blast',
      'down',
      'revive',
      'magnet',
      'meal'
    ])
  })

  it('clamps pan and floors the distance gain', () => {
    expect(panFor(5000, 0)).toBe(1)
    expect(panFor(-5000, 0)).toBe(-1)
    expect(panFor(320, 0)).toBeCloseTo(0.5)
    expect(gainFor(5000, 0, { x: 0, y: 0 })).toBe(0.25)
    expect(gainFor(0, 0, { x: 0, y: 0 })).toBe(1)
  })

  it('has stinger cues for phase changes and a heartbeat that rises as hp falls', () => {
    expect(phaseCue('playing', 'reaper')).toBe('reaper')
    expect(phaseCue('reaper', 'won')).toBe('won')
    expect(phaseCue('playing', 'lost')).toBe('lost')
    expect(phaseCue('lost', 'lost')).toBeUndefined()
    expect(phaseCue(undefined, 'playing')).toBeUndefined()
    expect(heartbeatLevel(40, 100, true, true)).toBe(0)
    expect(heartbeatLevel(15, 100, true, true)).toBeCloseTo(0.5)
    expect(heartbeatLevel(0, 100, true, true)).toBe(1)
    expect(heartbeatLevel(10, 100, false, true)).toBe(0)
    expect(heartbeatLevel(10, 100, true, false)).toBe(0)
  })
})

describe('BannerQueue', () => {
  it('shows warnings immediately before a stage and resumes the interrupted stage', () => {
    const queue = new BannerQueue()
    queue.push({ kind: 'stage', title: '50歳', duration: BANNER_MS.stage }, 0)
    expect(queue.update(0).show?.title).toBe('50歳')
    queue.push({ kind: 'warning', title: '介護', duration: BANNER_MS.warning }, 100)
    expect(queue.update(100).show?.title).toBe('介護')
    queue.push({ kind: 'warning', title: '別のボス', duration: BANNER_MS.warning }, 200)
    expect(queue.update(200)).toEqual({})
    expect(queue.update(2300).show?.title).toBe('別のボス')
    expect(queue.update(4500).show?.title).toBe('50歳')
    expect(queue.update(6200)).toEqual({ hide: true })
  })

  it('puts a same-frame warning ahead of an unmounted stage', () => {
    const queue = new BannerQueue()
    queue.push({ kind: 'stage', title: '50歳', duration: BANNER_MS.stage }, 0)
    queue.push({ kind: 'warning', title: '介護', duration: BANNER_MS.warning }, 0)
    expect(queue.update(0).show?.title).toBe('介護')
    expect(queue.update(BANNER_MS.warning).show?.title).toBe('50歳')
  })

  it('shows one banner at a time, in order', () => {
    const q = new BannerQueue()
    q.push({ kind: 'warning', title: 'W', duration: BANNER_MS.warning }, 0)
    q.push({ kind: 'stage', title: 'S', duration: BANNER_MS.stage }, 0)
    expect(q.update(0).show?.title).toBe('W')
    expect(q.update(1000)).toEqual({})
    const next = q.update(BANNER_MS.warning)
    expect(next.show?.title).toBe('S')
    expect(q.update(BANNER_MS.warning + BANNER_MS.stage)).toEqual({ hide: true })
    expect(q.size).toBe(0)
  })

  it('drops the least important banner when the line gets long', () => {
    const q = new BannerQueue()
    q.push({ kind: 'warning', title: 'W', duration: 1 }, 0)
    q.update(0)
    q.push({ kind: 'swarm', title: 'swarm', duration: 1 }, 0)
    for (let i = 0; i < 4; i++) q.push({ kind: 'bossKill', title: `k${i}`, duration: 1 }, 0)
    const shown: string[] = []
    for (let t = 1; t < 20; t++) {
      const step = q.update(t * 10)
      if (step.show) shown.push(step.show.title)
    }
    expect(shown).toEqual(['k0', 'k1', 'k2', 'k3'])
  })
})

describe('card rarity', () => {
  const lv = (id: string, level: number): [string, number, number] => [id, level, 0]
  it('classifies new / level / evolve / passive', () => {
    const owned = [lv('p_gone', 1), lv('w_sns', 7)]
    expect(WEAPON_BY_ID.get('w_sns')!.evolve!.passive).toBe('p_savvy')
    expect(choiceRarity(owned, [], 'w:w_pet')).toBe('new')
    expect(choiceRarity(owned, [], 'w:w_sns')).toBe('level')
    // Lv7 -> 8 with the passive already owned completes the evolution
    expect(choiceRarity(owned, [['p_savvy', 1]], 'w:w_sns')).toBe('evolve')
    expect(choiceRarity([lv('w_sns', 6)], [['p_savvy', 1]], 'w:w_sns')).toBe('level')
    // a passive that completes an owned Lv8 weapon
    expect(choiceRarity([lv('w_sns', 8)], [], 'p:p_savvy')).toBe('evolve')
    expect(choiceRarity([lv('w_sns', 7)], [], 'p:p_savvy')).toBe('passive')
    expect(choiceRarity([lv('w_sns', 8)], [['p_savvy', 1]], 'p:p_savvy')).toBe('passive')
    expect(choiceRarity(owned, [], 'x:meal')).toBe('plain')
  })
})

describe('boss bar', () => {
  it('follows the oldest living boss and counts the rest', () => {
    const boss = ENEMIES.findIndex((e) => e.behavior === 'boss')
    const plain = ENEMIES.findIndex((e) => e.behavior !== 'boss')
    const row = (id: number, kind: number, hp: number) => [id, kind, 0, 0, hp, 0, 0]
    expect(row(0, 0, 0)).toHaveLength(STRIDE.enemies)
    expect(findBoss([...row(5, plain, 100)])).toBeUndefined()
    const found = findBoss([...row(5, plain, 100), ...row(9, boss, 40), ...row(7, boss, 80)])
    expect(found).toMatchObject({ id: 7, hp: 80, count: 2, name: ENEMIES[boss].name })
  })
})
