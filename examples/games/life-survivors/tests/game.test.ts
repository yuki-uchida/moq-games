import { describe, expect, test } from 'vitest'
import { PARENTS, RUN_SECONDS, TALENT_CATEGORIES, WEAPON_BY_ID } from '../src/data'
import { GIFTED, Game, POOR, REAPER_SECONDS, STRONG_MULTIPLIER, isEvolved, weaponName, weaponStats } from '../src/game'
import { readView, toView } from '../src/view'
import { MAX_PAYLOAD_BYTES } from '../../rabbiters/src/network'
import { playLife } from './bot'

const idle = { x: 0, y: 0, pick: -1, pickSeq: -1 }

describe('birth', () => {
  test('every life starts as a baby holding only the parent card, with hidden talents', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game(seed)
      const player = game.addPlayer('a')!
      expect(PARENTS.map((p) => p.id)).toContain(player.parent)
      expect(player.weapons.map((w) => w.id)).toEqual(player.parent === 'p_gone' ? [] : [player.parent])
      const values = TALENT_CATEGORIES.map((c) => player.talents[c])
      expect(values.filter((v) => v === GIFTED)).toHaveLength(2)
      expect(values.filter((v) => v === POOR).length).toBeGreaterThanOrEqual(1)
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
    const popups = [...seen]
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

  test('greed compounds investments and evolves them at level 8', () => {
    const game = new Game(9)
    const player = game.addPlayer('a', 'p_rich')!
    const invest = { id: 'w_invest', lv: 8, cd: 0, held: 0, damage: 0 }
    player.weapons.push(invest)
    const before = weaponStats(player, invest).damage
    expect(isEvolved(player, invest)).toBe(false)
    player.passives.push({ id: 'p_greedy', lv: 1 })
    expect(isEvolved(player, invest)).toBe(true)
    expect(weaponName(player, invest)).toBe('複利の魔法')
    expect(weaponStats(player, invest).damage).toBeGreaterThan(before * 1.6)
    invest.held = 150
    expect(weaponStats(player, invest).damage).toBeGreaterThan(before * 3)
  })
})

describe('turning points', () => {
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
    expect(baby).toContain('w:w_hobby')
    game.state.time = RUN_SECONDS * (25 / 80)
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

  test('at 30:00 the reaper comes and the life ends in a clear', () => {
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

  test('a well-read life survives all 30 minutes, and snapshots stay small and valid', () => {
    const { game, peak, bytes } = playLife(1, 'smart')
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
    expect(readView({ ...view, enemies: [1, 999, 0, 0, 100, 0] })).toBeUndefined()
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
    game.spawnEnemy('boss', a.x, a.y)
    game.tick(1 / 60)
    expect(a.downed).toBe(true)
    expect(a.killer).toBe('boss')
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(view.players[0].killer).toBe('boss')
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
    expect(readView({ ...view, players: [{ ...view.players[0], killer: 'boss' }] })).toBeTruthy()
    expect(readView({ ...view, players: [{ ...view.players[0], killer: 'nope' }] })).toBeUndefined()
    expect(readView({ ...view, players: [{ ...view.players[0], killer: 'constructor' }] })).toBeUndefined()
    expect(readView({ ...view, players: [{ ...view.players[0], killer: 7 }] })).toBeUndefined()
  })
})
