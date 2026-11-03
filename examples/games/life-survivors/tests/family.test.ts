import { describe, expect, test } from 'vitest'
import {
  EVENTS,
  MAX_PASSIVE_LEVEL,
  MAX_WEAPON_LEVEL,
  PASSIVES,
  PASSIVE_SLOTS,
  TALENT_WEAPONS,
  timeAtAge
} from '../src/data'
import { Game, weaponSlots, type Player } from '../src/game'
import { readView, toView } from '../src/view'

const wedding = EVENTS.findIndex((event) => event.boss === 'b_wedding')
const birth = EVENTS.findIndex((event) => event.swarm === 'nightcry')
const rebel = EVENTS.findIndex((event) => event.boss === 'b_rebel')
const friends = EVENTS.findIndex((event) => event.swarm === 'kid')
const love = (player: Player, lv: number) => {
  player.weapons = [{ id: 'w_love', lv, cd: 100, held: 0, damage: 0 }]
}
const arena = () => {
  const game = new Game(123)
  const first = game.addPlayer('first', 'p_free')!
  const second = game.addPlayer('second', 'p_free')!
  return { game, first, second }
}
const event = (game: Game, index: number) => {
  game.state.eventIndex = index
  game.state.time = EVENTS[index].at - 0.01
  game.tick(0.01)
}

describe('personal life branches', () => {
  test('new rings require the personal wedding result, not age or current love level', () => {
    const { game, first, second } = arena()
    love(first, 8)
    love(second, 2)
    game.state.time = EVENTS[wedding].at - 0.02
    expect(game.options(first)).not.toContain('w:w_ring')
    expect(game.options(second)).not.toContain('w:w_ring')
    love(first, 1)
    event(game, wedding)
    love(first, 8)
    second.weapons = []
    expect(game.options(first)).not.toContain('w:w_ring')
    expect(game.options(second)).toContain('w:w_ring')
    game.state.time = timeAtAge(21)
    expect(game.options(second)).not.toContain('w:w_ring')
    game.state.time = EVENTS[wedding].at + 1
    second.choices = game.options(second)
    game.choose(second, second.choices.indexOf('w:w_ring'))
    expect(second.weapons).toEqual([expect.objectContaining({ id: 'w_ring', lv: 1 })])
    expect(first.weapons.some((weapon) => weapon.id === 'w_ring')).toBe(false)
  })

  test.each([false, true])('owned rings still upgrade before marriage (%s)', (married) => {
    const { game, first } = arena()
    first.married = married
    first.weapons = [{ id: 'w_ring', lv: 1, cd: 100, held: 0, damage: 0 }]
    expect(game.options(first)).toContain('w:w_ring')
    first.choices = ['w:w_ring']
    game.choose(first, 0)
    expect(first.weapons[0].lv).toBe(2)
    first.weapons[0].lv = MAX_WEAPON_LEVEL
    expect(game.options(first)).not.toContain('w:w_ring')
  })

  test.each(['swapPending', 'careerPending'] as const)(
    '%s ring offers respect marriage and allow cancellation',
    (pending) => {
      const { game, first, second } = arena()
      love(second, 2)
      event(game, wedding)
      game.state.enemies = []
      for (const player of [first, second]) {
        player.weapons = TALENT_WEAPONS.filter((def) => def.id !== 'w_ring').map((def) => ({
          id: def.id,
          lv: MAX_WEAPON_LEVEL,
          cd: 100,
          held: 0,
          damage: 0
        }))
        player.passives = PASSIVES.slice(0, PASSIVE_SLOTS).map((def) => ({ id: def.id, lv: MAX_PASSIVE_LEVEL }))
        player.pending = player.swapPending = player.careerPending = 0
        player.choices = []
      }
      game.state.time = timeAtAge(21)
      second[pending] = 1
      game.tick(0.01)
      expect(second.choices).toEqual([])
      game.state.time = EVENTS[wedding].at + 1
      first[pending] = second[pending] = 1
      game.tick(0.01)
      expect(first.choices).toEqual([])
      expect(first[pending]).toBe(0)
      expect(second.choices).toEqual(['s:w_ring', 'x:skip'])
      const before = structuredClone(second.weapons)
      game.choose(second, 0)
      expect(second.choices).toContain(`r:${before[0].id}:w_ring`)
      game.choose(second, second.choices.indexOf('x:skip'))
      expect(second.weapons).toEqual(before)
      second[pending] = 1
      game.tick(0.01)
      game.choose(second, 0)
      game.choose(second, 0)
      expect(second.weapons[0]).toMatchObject({ id: 'w_ring', lv: 1 })
      expect(second.choices).toEqual([])
      const time = game.state.time
      game.tick(0.01)
      expect(game.state.time).toBeGreaterThan(time)
    }
  )

  test.each(['swapPending', 'careerPending'] as const)(
    '%s offers rings only to married players with a full legal build',
    (pending) => {
      const { game, first, second } = arena()
      love(second, 2)
      event(game, wedding)
      for (const player of [first, second]) {
        player.weapons = TALENT_WEAPONS.filter((def) => def.id !== 'w_ring')
          .slice(0, weaponSlots(player))
          .map((def) => ({ id: def.id, lv: MAX_WEAPON_LEVEL, cd: 100, held: 0, damage: 0 }))
        player.passives = PASSIVES.slice(0, PASSIVE_SLOTS).map((def) => ({ id: def.id, lv: MAX_PASSIVE_LEVEL }))
        player.pending = player.swapPending = player.careerPending = 0
        player.choices = []
        expect(game.options(player)).toHaveLength(0)
      }
      let marriedOffer = false
      for (let attempt = 0; attempt < 60; attempt++) {
        game.state.enemies = []
        first[pending] = second[pending] = 1
        game.tick(0.01)
        expect(first.choices).not.toContain('s:w_ring')
        marriedOffer ||= second.choices.includes('s:w_ring')
        for (const player of [first, second]) game.choose(player, player.choices.indexOf('x:skip'))
      }
      expect(marriedOffer).toBe(true)
    }
  )

  test('every player receives a personal result in a full room', () => {
    const game = new Game(123)
    const players = Array.from({ length: 8 }, (_, index) => game.addPlayer(`player${index}`, 'p_free')!)
    love(players[0], 2)
    event(game, wedding)
    for (const player of players) expect(game.state.log.some((entry) => entry.to === player.id)).toBe(true)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
  })

  test('rejoining a room reuses a free player identity without duplicating another', () => {
    const { game, first, second } = arena()
    const third = game.addPlayer('third', 'p_free')!
    game.removePlayer(second.id)
    const newcomer = game.addPlayer('newcomer', 'p_free')!
    expect(newcomer.name).toBe(second.name)
    expect(newcomer.color).toBe(second.color)
    expect(new Set([first.name, third.name, newcomer.name]).size).toBe(3)
    expect(new Set([first.color, third.color, newcomer.color]).size).toBe(3)
  })

  test('uses converted boundaries, requires Lv2, and never rewrites marriage after swaps', () => {
    const { game, first, second } = arena()
    love(first, 1)
    love(second, 2)
    game.state.eventIndex = wedding
    game.state.time = EVENTS[wedding].at - 0.02
    game.tick(0.01)
    expect(second.married).toBe(false)
    game.tick(0.011)
    expect([first.married, second.married]).toEqual([false, true])
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_wedding')).toHaveLength(1)
    expect(game.state.log.filter((entry) => entry.to === first.id).map((entry) => entry.text)).toEqual([
      '独身の人生を歩む。'
    ])
    expect(game.state.log.find((entry) => entry.text.includes('家族の試練'))?.text).toContain(second.name)
    love(first, 8)
    second.weapons = []
    game.tick(0.01)
    expect([first.married, second.married]).toEqual([false, true])
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_wedding')).toHaveLength(1)
    event(game, birth)
    expect([first.hasChild, second.hasChild]).toEqual([false, true])
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'nightcry')).toHaveLength(29)
    expect(
      game.state.log.filter((entry) => entry.to === first.id).some((entry) => entry.text.includes('生まれた'))
    ).toBe(false)
    event(game, rebel)
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_rebel')).toHaveLength(1)
    game.tick(0.01)
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_rebel')).toHaveLength(1)
  })

  test('single lives skip wedding, birth and child trials entirely', () => {
    const { game, first, second } = arena()
    love(first, 1)
    love(second, 1)
    game.state.log = []
    for (const index of [wedding, birth, rebel, friends]) event(game, index)
    expect(game.state.enemies.some((enemy) => ['b_wedding', 'nightcry', 'b_rebel', 'kid'].includes(enemy.kind))).toBe(
      false
    )
    expect(game.state.log.some((entry) => /結婚|生まれた|反抗期|友だち/.test(entry.text))).toBe(false)
  })

  test('downed players decide once; late joins and reused IDs do not replay the past', () => {
    const { game, first } = arena()
    love(first, 2)
    first.downed = true
    event(game, wedding)
    expect(first.married).toBe(true)
    const late = game.addPlayer('late', 'p_free')!
    love(late, 8)
    event(game, birth)
    expect(first.hasChild).toBe(true)
    expect(late.married || late.hasChild).toBe(false)
    game.removePlayer(first.id)
    const rejoined = game.addPlayer(first.id, 'p_free')!
    love(rejoined, 8)
    event(game, rebel)
    expect(rejoined.married || rejoined.hasChild).toBe(false)
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_rebel')).toHaveLength(0)
  })

  test('a join exactly on an unprocessed event boundary does not inherit the past', () => {
    const { game } = arena()
    game.state.time = EVENTS[wedding].at
    game.state.eventIndex = wedding
    const late = game.addPlayer('late', 'p_free')!
    love(late, 8)
    game.tick(0.01)
    expect(late.married).toBe(false)
  })
})

describe('family healing and wire state', () => {
  test('heals only the owner, caps HP, and stops for downed, departed and ended lives without slots', () => {
    const { game, first, second } = arena()
    love(first, 2)
    event(game, wedding)
    const weapons = first.weapons.length
    game.state.enemies = []
    first.hp = second.hp = 10
    game.tick(0.1)
    expect(first.hp).toBeCloseTo(10.2)
    expect(second.hp).toBe(10)
    event(game, birth)
    game.state.enemies = []
    first.hp = 10
    game.tick(0.1)
    expect(first.hp).toBeCloseTo(10.3)
    expect(first.weapons).toHaveLength(weapons)
    first.hp = first.maxHp - 0.01
    game.tick(0.1)
    expect(first.hp).toBe(first.maxHp)
    first.downed = true
    first.hp = 0
    game.tick(0.1)
    expect(first.hp).toBe(0)
    first.downed = false
    game.state.phase = 'reaper'
    game.state.reaper = { x: 100, y: 100 }
    game.tick(0.1)
    expect(first.hp).toBe(0)
    game.state.phase = 'playing'
    game.removePlayer(first.id)
    const oldHp = first.hp
    game.tick(0.1)
    expect(first.hp).toBe(oldHp)
    expect(second.hp).toBe(10)
  })

  test('round-trips flags without talents and rejects old, inconsistent and malformed snapshots', () => {
    const { game, first } = arena()
    love(first, 2)
    event(game, wedding)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
    event(game, birth)
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView(view)?.players[0]).toMatchObject({ married: true, hasChild: true })
    expect(view.players[0].talents).toBeUndefined()
    for (const v of [1, 2, 4]) expect(readView({ ...view, v })).toBeUndefined()
    for (const patch of [
      { married: false },
      { married: 1 },
      { hasChild: 'yes' },
      { hasChild: undefined },
      { talents: first.talents }
    ]) {
      const invalid = structuredClone(view)
      Object.assign(invalid.players[0], patch)
      expect(readView(invalid)).toBeUndefined()
    }
    expect(readView({ ...view, time: 0 })).toBeUndefined()
    expect(readView({ ...view, players: [view.players[0], view.players[0]] })).toBeUndefined()
  })
})
