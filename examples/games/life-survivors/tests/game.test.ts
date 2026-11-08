import { describe, expect, test } from 'vitest'
import {
  ageAt,
  EVENTS,
  MAX_PASSIVE_LEVEL,
  MAX_WEAPON_LEVEL,
  PASSIVES,
  PASSIVE_SLOTS,
  PARENTS,
  RUN_SECONDS,
  TALENT_CATEGORIES,
  TALENT_WEAPONS,
  timeAtAge,
  WEAPON_BY_ID,
  WEAPON_SLOTS
} from '../src/data'
import {
  GIFTED,
  Game,
  choiceText,
  playerStats,
  POOR,
  REAPER_SECONDS,
  STRONG_MULTIPLIER,
  isEvolved,
  weaponName,
  weaponStats,
  xpForLevel
} from '../src/game'
import { readView, toView } from '../src/view'
import { MAX_PAYLOAD_BYTES } from '../../rabbiters/src/network'
import { playLife } from './bot'

const idle = { x: 0, y: 0, pick: -1, pickSeq: -1 }

test.each([1, 2, 3, 4, 5, 6, 7, 8])('sports level %s extends duration instead of adding balls', (level) => {
  const game = new Game(1)
  const player = game.addPlayer('a', 'p_gone')!
  const weapon = { id: 'w_sports', lv: level, cd: 0, held: 0, damage: 0 }
  const duration = 3 + 2 * (Number(level >= 2) + Number(level >= 5) + Number(level >= 8))
  player.passives = []
  expect(weaponStats(player, weapon).amount).toBe(1)
  expect(weaponStats(player, weapon).duration).toBeCloseTo(duration)
  player.weapons = [weapon]
  if ([1, 4, 7].includes(level)) {
    expect(choiceText(player, 'w:w_sports').text).toContain('効果時間 +2秒')
    expect(choiceText(player, 'w:w_sports').text).not.toContain('数 +1')
  }
  player.passives = [{ id: 'p_clever', lv: 4 }, { id: 'p_curious', lv: 5 }]
  expect(weaponStats(player, weapon).amount).toBe(3)
  expect(weaponStats(player, weapon).duration).toBeCloseTo(duration * playerStats(player).duration)
  if (level === MAX_WEAPON_LEVEL) {
    player.passives.push({ id: 'p_hot', lv: 1 })
    expect(weaponStats(player, weapon).amount).toBe(3)
    expect(weaponStats(player, weapon).duration).toBeCloseTo(duration * 1.3 * playerStats(player).duration)
  }
})

test('a monster parent chases the nearest enemy', () => {
  const game = new Game(3)
  const player = game.addPlayer('a', 'p_monster')!
  player.weapons[0].cd = 0
  game.spawnEnemy('germ', player.x - 180, player.y)
  game.spawnEnemy('bully', player.x + 100, player.y)
  game.tick(1 / 60)
  const shot = game.state.shots.find((entry) => entry.weapon === 'p_monster')!
  expect(shot.target?.kind).toBe('bully')
  expect(shot.x).toBeGreaterThan(player.x)
})

describe('life pacing', () => {
  test('ages increasingly quickly over a 15 minute life', () => {
    expect(RUN_SECONDS).toBe(900)
    expect(ageAt(0)).toBe(0)
    expect(ageAt(RUN_SECONDS)).toBe(80)
    expect(ageAt(450) - ageAt(0)).toBeLessThan(ageAt(900) - ageAt(450))
    expect(timeAtAge(40) - timeAtAge(20)).toBeGreaterThan(timeAtAge(60) - timeAtAge(40))
    expect(EVENTS.every((event) => event.at < RUN_SECONDS)).toBe(true)
    expect(ageAt(EVENTS.find((event) => event.boss === 'b_hs')!.at + 0.01)).toBe(13)
  })

  test.each([1, 2, 10, 20, 30, 60, 100])('level %s takes 25% more XP with rounding', (level) => {
    const previous = (5 + level * 6 + level * level * 0.3) * 1.3 * (1 + Math.min(20, Math.max(0, level - 10)) * 0.0125)
    expect(xpForLevel(level)).toBe(Math.round(previous / 0.8))
  })

  test.each([1, 2, 4])('slower thresholds apply from birth and after level-up for %s players', (count) => {
    const game = new Game(1)
    for (let index = 0; index < count; index++) game.addPlayer(String(index))
    expect(game.state.xpNext).toBe(xpForLevel(1))
    game.gainXp(game.state.xpNext - 1)
    expect(game.state.level).toBe(1)
    game.gainXp(1)
    expect(game.state.level).toBe(2)
    expect(game.state.xpNext).toBe(Math.round(xpForLevel(2) * (1 + (count - 1) * 0.5)))
  })

  test('levels require more experience and late enemies gain durability', () => {
    expect(xpForLevel(10)).toBeGreaterThan(Math.round(5 + 10 * 6 + 10 * 10 * 0.3))
    expect(xpForLevel(10)).toBe(Math.round((5 + 10 * 6 + 10 * 10 * 0.3) * 1.3 / 0.8))
    expect(xpForLevel(20)).toBe(Math.round((5 + 20 * 6 + 20 * 20 * 0.3) * 1.3 * 1.125 / 0.8))
    expect(xpForLevel(30)).toBe(Math.round((5 + 30 * 6 + 30 * 30 * 0.3) * 1.3 * 1.25 / 0.8))
    const game = new Game(1)
    game.addPlayer('a')
    expect(game.hpScale()).toBe(1)
    game.state.time = RUN_SECONDS
    expect(game.hpScale()).toBeCloseTo((1 + 30 * 0.14 + 30 * 30 * 0.004) * 1.2)
  })
})

describe('birth', () => {
  test('every life starts as a baby holding only the parent card, with hidden talents', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game(seed)
      const player = game.addPlayer('a')!
      expect(PARENTS.map((p) => p.id)).toContain(player.parent)
      expect(player.weapons.map((w) => w.id)).toEqual(player.parent === 'p_gone' ? [] : [player.parent])
      const values = TALENT_CATEGORIES.map((c) => player.talents[c])
      expect(values).toHaveLength(6)
      expect(values.every((v) => v >= POOR && v <= GIFTED)).toBe(true)
      expect(toView(game.state).players[0].talents).toBeUndefined()
    }
  })

  test('an absent parent gives no weapon but a stronger mind', () => {
    const game = new Game(1)
    expect(game.addPlayer('gone', 'p_gone')!.maxHp).toBe(160)
    expect(game.addPlayer('edu', 'p_edu')!.maxHp).toBe(100)
  })
})

describe('combat', () => {
  test('a monster parent tramples people with a 特攻 bonus but not germs', () => {
    const game = new Game(3)
    const player = game.addPlayer('a', 'p_monster')!
    game.spawnEnemy('bully', player.x + 115, player.y)
    game.spawnEnemy('germ', player.x - 160, player.y)
    const seen = new Set<(typeof game.state.popups)[number]>()
    for (let i = 0; i < 240; i++) {
      game.tick(1 / 60)
      game.state.popups.forEach((p) => seen.add(p))
    }
    // Critical hits double any number, so compare ordinary hits only.
    const popups = [...seen].filter((p) => !p.crit)
    expect(popups.some((p) => p.strong)).toBe(true)
    expect(popups.some((p) => !p.strong)).toBe(true)
    const strong = popups.filter((p) => p.strong).map((p) => p.v)
    const plain = popups.filter((p) => !p.strong).map((p) => p.v)
    expect(Math.min(...strong)).toBeGreaterThan(Math.max(...plain) * (STRONG_MULTIPLIER * 0.7))
  })

  test('the same card hits far harder for a gifted life than a poor one', () => {
    const game = new Game(5)
    const player = game.addPlayer('a', 'p_edu')!
    const study = { id: 'w_study', lv: 1, cd: 0, held: 0, damage: 0 }
    player.talents.study = GIFTED
    const gifted = weaponStats(player, study).damage
    player.talents.study = POOR
    expect(gifted / weaponStats(player, study).damage).toBeCloseTo(GIFTED / POOR)
  })

  test('greed only evolves investments at level 8 while holding time still compounds damage', () => {
    const game = new Game(9)
    const player = game.addPlayer('a', 'p_rich')!
    const invest = { id: 'w_invest', lv: 8, cd: 0, held: 0, damage: 0 }
    player.weapons.push(invest)
    const before = weaponStats(player, invest).damage
    expect(isEvolved(player, invest)).toBe(false)
    player.passives.push({ id: 'p_greedy', lv: 1 })
    expect(isEvolved(player, invest)).toBe(true)
    expect(weaponName(player, invest)).toBe('複利の魔法')
    expect(weaponStats(player, invest).damage).toBeCloseTo(before * 1.6)
    invest.held = 150
    expect(weaponStats(player, invest).damage).toBeCloseTo(before * 3.2)
  })
})

describe('turning points', () => {
  test('a complete build skips empty hands and can swap a talent every five levels', () => {
    const game = new Game(2)
    const player = game.addPlayer('a', 'p_edu')!
    game.state.time = RUN_SECONDS / 2
    game.state.eventIndex = EVENTS.findIndex((event) => event.at > game.state.time)
    player.weapons.push(
      ...TALENT_WEAPONS.slice(0, WEAPON_SLOTS).map(({ id }) => ({
        id,
        lv: MAX_WEAPON_LEVEL,
        cd: 0,
        held: 0,
        damage: 0
      }))
    )
    player.weapons[0].lv = MAX_WEAPON_LEVEL
    player.passives = PASSIVES.slice(0, PASSIVE_SLOTS).map(({ id }) => ({ id, lv: MAX_PASSIVE_LEVEL }))
    game.state.level = 3
    game.gainXp(game.state.xpNext)
    game.tick(1 / 60)
    expect(player.choices).toEqual([])
    game.gainXp(game.state.xpNext)
    game.tick(1 / 60)
    expect(player.choices[0]).toMatch(/^s:/)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
    const newWeapon = player.choices[0].split(':')[1]
    game.choose(player, 0)
    expect(player.choices[0]).toMatch(/^r:/)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
    const oldWeapon = player.choices[0].split(':')[1]
    game.choose(player, 0)
    expect(player.weapons.some((weapon) => weapon.id === oldWeapon)).toBe(false)
    expect(player.weapons.find((weapon) => weapon.id === newWeapon)?.lv).toBe(1)
    expect(player.weapons[0].id).toBe('p_edu')
  })

  test('solo pauses for a choice and only accepts the current hand', () => {
    const game = new Game(2)
    const player = game.addPlayer('a')!
    game.gainXp(game.state.xpNext)
    game.tick(1 / 60)
    expect(player.choices).toHaveLength(3)
    const time = game.state.time
    game.step(1)
    expect(game.state.time).toBe(time)
    game.setInput('a', { ...idle, pick: 0, pickSeq: player.choiceSeq + 1 })
    expect(player.choices).toHaveLength(3)
    const choice = player.choices[0]
    game.setInput('a', { ...idle, pick: 0, pickSeq: player.choiceSeq })
    expect(player.choices).toHaveLength(0)
    const [kind, id] = choice.split(':')
    if (kind === 'w') expect(player.weapons.some((w) => w.id === id)).toBe(true)
    else expect(player.passives.some((p) => p.id === id)).toBe(true)
  })

  test('cards unlock with age: no jobs or investing for a baby', () => {
    const game = new Game(4)
    const player = game.addPlayer('a', 'p_gone')!
    const baby = game.options(player)
    expect(baby).not.toContain('w:w_work')
    expect(baby).not.toContain('w:w_invest')
    expect(baby).not.toContain('w:w_hobby')
    game.state.time = timeAtAge(25) + 0.01
    expect(game.options(player)).toEqual(expect.arrayContaining(['w:w_work', 'w:w_invest', 'w:w_love']))
  })

  test('co-op shares experience, deals each player a hand and keeps time running', () => {
    const game = new Game(6)
    const a = game.addPlayer('a')!
    const b = game.addPlayer('b')!
    game.gainXp(game.state.xpNext)
    game.tick(1 / 60)
    expect(a.choices.length && b.choices.length).toBeTruthy()
    const time = game.state.time
    game.tick(1 / 60)
    expect(game.state.time).toBeGreaterThan(time)
  })

  test('host input is sanitised', () => {
    const game = new Game(1)
    const player = game.addPlayer('a')!
    game.setInput('a', { x: 'left', y: 1e9, pick: 99, pickSeq: NaN })
    game.tick(1 / 60)
    expect(Number.isFinite(player.x) && Number.isFinite(player.y)).toBe(true)
    expect(player.y).toBeLessThan(5)
  })
})

describe('end of life', () => {
  test('a downed friend gets back up when someone stays by their side', () => {
    const game = new Game(8)
    const a = game.addPlayer('a')!
    const b = game.addPlayer('b')!
    b.hp = 0
    b.downed = true
    b.x = a.x + 30
    b.y = a.y
    for (let i = 0; i < 60 * 3.2; i++) game.tick(1 / 60)
    expect(b.downed).toBe(false)
    a.downed = b.downed = true
    game.tick(1 / 60)
    expect(game.state.phase).toBe('lost')
  })

  test('at 15:00 the reaper comes and the life ends in a clear', () => {
    const game = new Game(1)
    game.addPlayer('a')
    game.state.time = RUN_SECONDS - 0.01
    game.spawnEnemy('germ')
    game.tick(1 / 60)
    game.tick(1 / 60)
    expect(game.state.phase).toBe('reaper')
    expect(game.state.enemies).toHaveLength(0)
    for (let i = 0; i < 60 * REAPER_SECONDS + 5; i++) game.tick(1 / 60)
    expect(game.state.phase).toBe('won')
    expect(toView(game.state).players[0].talents).toBeDefined()
  })

  test('a full life reaches the reaper and snapshots stay small and valid', () => {
    const { game, peak, bytes } = playLife(6, 'smart', 1, RUN_SECONDS + 10, true)
    expect(game.state.phase).toBe('reaper')
    expect(peak).toBeGreaterThan(250)
    // Busiest snapshot of the life, with headroom for the JSON envelope and non-ASCII log text.
    expect(bytes * 1.5).toBeLessThan(MAX_PAYLOAD_BYTES)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
  }, 120_000)
})

describe('snapshots', () => {
  test('rejects malformed relay data', () => {
    const game = new Game(1)
    game.addPlayer('a')
    game.spawnEnemy('germ')
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView(view)).toBeTruthy()
    expect(readView({ ...view, enemies: [1, 999, 0, 0, 100, 0, 0] })).toBeUndefined()
    expect(readView({ ...view, players: [{ ...view.players[0], weapons: [['nope', 1, 0]] }] })).toBeUndefined()
    expect(readView({ ...view, players: [{ ...view.players[0], color: 'red;x' }] })).toBeUndefined()
    expect(readView({ ...view, phase: 'paused' })).toBeUndefined()
    expect(readView(null)).toBeUndefined()
    expect(WEAPON_BY_ID.size).toBeGreaterThan(14)
  })
})

describe('the final blow', () => {
  test('a downed player remembers who broke them, until they get back up', () => {
    const game = new Game(12)
    const a = game.addPlayer('a')!
    const b = game.addPlayer('b')!
    b.x = a.x + 400
    a.weapons = []
    a.hp = 0.01
    game.spawnEnemy('intimidating_boss', a.x, a.y)
    game.tick(1 / 60)
    expect(a.downed).toBe(true)
    expect(a.killer).toBe('intimidating_boss')
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(view.players[0].killer).toBe('intimidating_boss')
    expect(view.players[1].killer).toBeUndefined()
    expect(readView(view)).toBeTruthy()
    game.state.enemies = []
    b.x = a.x + 20
    b.y = a.y
    for (let i = 0; i < 60 * 3.2; i++) game.tick(1 / 60)
    expect(a.downed).toBe(false)
    expect(a.killer).toBeUndefined()
    expect(toView(game.state).players[0].killer).toBeUndefined()
  })

  test('snapshots only accept a real enemy id as the killer', () => {
    const game = new Game(1)
    game.addPlayer('a')
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView({ ...view, players: [{ ...view.players[0], killer: 'intimidating_boss' }] })).toBeTruthy()
    expect(readView({ ...view, players: [{ ...view.players[0], killer: 'nope' }] })).toBeUndefined()
    expect(readView({ ...view, players: [{ ...view.players[0], killer: 'constructor' }] })).toBeUndefined()
    expect(readView({ ...view, players: [{ ...view.players[0], killer: 7 }] })).toBeUndefined()
  })
})
