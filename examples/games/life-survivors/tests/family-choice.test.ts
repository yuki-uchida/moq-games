import { describe, expect, test } from 'vitest'
import { EVENTS, RUN_SECONDS } from '../src/data'
import { Game, type Player } from '../src/game'
import { LIFE_OUTCOMES } from '../src/history'
import { readView, toView } from '../src/view'
import { botInput } from './bot'

const birth = EVENTS.findIndex((event) => event.swarm === 'nightcry')
const wedding = EVENTS.findIndex((event) => event.boss === 'b_wedding')
const rebel = EVENTS.findIndex((event) => event.boss === 'b_rebel')
const advance = (game: Game, index: number) => {
  game.state.time = EVENTS[index].at - 0.01
  game.state.eventIndex = index
  game.tick(0.01)
}
const answer = (game: Game, player: Player, pick = 0, pickSeq = player.choiceSeq) =>
  game.setInput(player.id, { pick, pickSeq })
const family = (count = 2) => {
  const game = new Game(123)
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(`p${index}`, 'p_free')!)
  for (const player of players) player.weapons.push({ id: 'w_love', lv: 2, cd: 100, held: 0, damage: 0 })
  advance(game, wedding)
  game.state.enemies = []
  return { game, players }
}

describe('personal family cards', () => {
  test.each([
    ['w:w_love', 'x:meal'],
    ['s:w_work', 'x:skip'],
    ['r:w_love:w_work', 'x:skip']
  ])('restores the exact hand %j and pending counters without rerolling', (...hand) => {
    const {
      game,
      players: [player, other]
    } = family()
    player.choices = hand
    player.pending = 2
    player.swapPending = 3
    player.careerPending = 4
    const seq = player.choiceSeq
    advance(game, birth)
    expect(player.choices).toEqual(['f:yes', 'f:no'])
    expect(player.choiceSeq).toBe(seq + 1)
    expect(player.hasChild).toBe(false)
    expect(player.history.at(-1)?.outcome).toBe(LIFE_OUTCOMES.nightcry[3])
    expect(toView(game.state).players[0]).not.toHaveProperty('familyHands')
    const otherSeq = other.choiceSeq
    answer(game, player, 0, seq)
    expect(player.hasChild).toBe(false)
    answer(game, player)
    expect(player.choices).toEqual(hand)
    expect([player.pending, player.swapPending, player.careerPending]).toEqual([2, 3, 4])
    expect(player.choiceSeq).toBe(seq + 2)
    expect(player.hasChild).toBe(true)
    expect(other.choiceSeq).toBe(otherSeq)
    expect(other.hasChild).toBe(false)
    answer(game, player, 0, seq + 1)
    expect(player.choices).toEqual(hand)
  })

  test('eight independent answers reject stale, duplicate, fractional and invalid sequences', () => {
    const { game, players } = family(8)
    advance(game, birth)
    const player = players[0]
    const seq = player.choiceSeq
    for (const pick of [0.5, -1, 2, NaN, Infinity]) answer(game, player, pick)
    for (const pickSeq of [seq - 1, seq + 1, seq + 0.5, -1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
      answer(game, player, 0, pickSeq)
    game.setInput(player.id, { pick: 0, pickSeq: String(seq) })
    expect(player.choices).toEqual(['f:yes', 'f:no'])
    for (const [index, owner] of players.entries()) answer(game, owner, index % 2)
    expect(players.map((owner) => owner.hasChild)).toEqual([true, false, true, false, true, false, true, false])
    const count = game.state.enemies.filter((enemy) => enemy.kind === 'nightcry').length
    expect(count).toBe(Math.round(18 * game.playerFactor()))
    for (const owner of players) answer(game, owner, 0, seq)
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'nightcry')).toHaveLength(count)
    expect(players.every((owner) => owner.history.filter((entry) => entry.event === birth).length === 1)).toBe(true)
    game.state.enemies = []
    for (const owner of players) owner.hp = 10
    game.tick(0.1)
    players.forEach((owner, index) => expect(owner.hp).toBeCloseTo(index % 2 ? 10.2 : 10.3))
  })

  test('solo pauses, can answer, and resumes the same hand; down and terminal transitions never pause', () => {
    const {
      game,
      players: [player]
    } = family(1)
    advance(game, birth)
    const time = game.state.time
    expect(game.paused).toBe(true)
    game.tick(1)
    expect(game.state.time).toBe(time)
    answer(game, player, 1)
    expect(game.paused).toBe(false)
    expect(player.history.at(-1)?.outcome).toBe(LIFE_OUTCOMES.nightcry[1])
    game.tick(0.01)
    expect(game.state.time).toBeGreaterThan(time)
    player.choices = ['w:w_love']
    player.downed = true
    player.hp = 0
    expect(game.paused).toBe(false)
    game.tick(0.01)
    expect(game.state.phase).toBe('lost')
  })

  test('downed family choices do not block a solo loss', () => {
    const {
      game,
      players: [player]
    } = family(1)
    advance(game, birth)
    player.downed = true
    player.hp = 0
    game.tick(0.01)
    expect(game.state.phase).toBe('lost')
    const before = structuredClone(player)
    answer(game, player)
    expect(player).toEqual(before)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
  })

  test('co-op down and revival retain the pending choice and its original hand', () => {
    const {
      game,
      players: [player]
    } = family()
    const hand = ['s:w_work', 'x:skip']
    player.choices = hand
    advance(game, birth)
    const seq = player.choiceSeq
    player.downed = true
    player.hp = 0
    game.tick(0.1)
    expect(game.state.phase).toBe('playing')
    expect(player.choiceSeq).toBe(seq)
    expect(player.choices).toEqual(['f:yes', 'f:no'])
    player.downed = false
    player.hp = 10
    answer(game, player)
    expect(player.choices).toEqual(hand)
    expect(player.hasChild).toBe(true)
  })

  test('declining does not start the swarm; the first later acceptance starts it only once, even after exit', () => {
    const {
      game,
      players: [first, second, third]
    } = family(3)
    advance(game, birth)
    answer(game, first, 1)
    expect(game.state.enemies.some((enemy) => enemy.kind === 'nightcry')).toBe(false)
    game.state.time += 10
    answer(game, second)
    const count = game.state.enemies.filter((enemy) => enemy.kind === 'nightcry').length
    expect(count).toBe(Math.round(18 * game.playerFactor()))
    game.removePlayer(second.id)
    answer(game, third)
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'nightcry')).toHaveLength(count)
  })

  test.each(['reaper', 'won', 'lost'] as const)('all card inputs are inert during %s', (phase) => {
    for (const choices of [['w:w_love'], ['s:w_work'], ['r:w_love:w_work'], ['f:yes', 'f:no']]) {
      const {
        game,
        players: [player]
      } = family(1)
      advance(game, birth)
      player.choices = choices
      game.state.phase = phase
      const before = structuredClone(player)
      answer(game, player)
      game.choose(player, 0)
      expect(player).toEqual(before)
      expect(game.paused).toBe(false)
    }
  })

  test('a pending solo card cannot block the reaper at lifespan', () => {
    const {
      game,
      players: [player]
    } = family(1)
    player.choices = ['w:w_love']
    game.state.time = RUN_SECONDS
    game.tick(0.01)
    expect(game.state.phase).toBe('reaper')
    const before = structuredClone(player)
    answer(game, player)
    expect(player).toEqual(before)
    game.tick(9)
    expect(game.state.phase).toBe('won')
  })

  test('late answers record confirmation time after later events and never replay child trials', () => {
    const {
      game,
      players: [player]
    } = family()
    advance(game, birth)
    expect(game.state.enemies.some((enemy) => enemy.kind === 'nightcry')).toBe(false)
    advance(game, rebel)
    expect(game.state.enemies.some((enemy) => enemy.kind === 'b_rebel')).toBe(false)
    const later = EVENTS.findIndex((event) => event.boss === 'b_layoff')
    advance(game, later)
    const at = game.state.time
    answer(game, player)
    expect(player.history.at(-1)).toEqual({ event: birth, outcome: LIFE_OUTCOMES.nightcry[0], at })
    expect(player.history.at(-2)?.event).toBe(later)
    expect(game.state.enemies.some((enemy) => enemy.kind === 'b_rebel')).toBe(false)
    game.state.phase = 'won'
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView(view)).toBeTruthy()
    const history = view.players[0].history
    for (const badAt of [0, at + 1, NaN, 'late']) {
      const invalid = structuredClone(view)
      invalid.players[0].history.at(-1).at = badAt
      expect(readView(invalid)).toBeUndefined()
    }
    expect(history.at(-1).at).toBe(at)
  })

  test('unmarried, boundary join and rejoin never receive a retroactive card', () => {
    const {
      game,
      players: [player, other]
    } = family()
    other.married = false
    other.history[0].outcome = LIFE_OUTCOMES.b_wedding[1]
    game.state.time = EVENTS[birth].at
    game.state.eventIndex = birth
    const late = game.addPlayer('late', 'p_free')!
    late.married = true
    game.tick(0.01)
    expect(other.choices).not.toContain('f:yes')
    expect(other.history.at(-1)?.outcome).toBe(LIFE_OUTCOMES.nightcry[2])
    expect(late.choices).not.toContain('f:yes')
    expect(late.history).toEqual([])
    game.removePlayer(player.id)
    const rejoined = game.addPlayer(player.id, 'p_free')!
    game.tick(0.01)
    expect(rejoined.choices).not.toContain('f:yes')
    expect(rejoined.history).toEqual([])
  })

  test('wire rejects old versions, leaked hands, malformed cards, flags and history', () => {
    const {
      game,
      players: [player]
    } = family()
    advance(game, birth)
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView(view)).toBeTruthy()
    expect(readView({ ...view, v: 6 })).toBeUndefined()
    for (const patch of [
      { familyHands: [] },
      { choiceSeq: 1.5 },
      { choices: ['f:yes'] },
      { choices: ['f:no', 'f:yes'] },
      { choices: ['f:yes', 'w:w_love'] },
      { married: false },
      { hasChild: true },
      { talents: player.talents }
    ]) {
      const invalid = structuredClone(view)
      Object.assign(invalid.players[0], patch)
      expect(readView(invalid)).toBeUndefined()
    }
    answer(game, player)
    game.state.phase = 'won'
    const ended = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView(ended)).toBeTruthy()
    ended.players[0].hasChild = false
    expect(readView(ended)).toBeUndefined()
  })
})

test('normal play from birth reaches and answers a family card using ordinary card inputs', () => {
  const runs = []
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const game = new Game(seed)
    const player = game.addPlayer('p0')!
    for (let frame = 0; frame < RUN_SECONDS * 60; frame += 6) {
      if (game.state.phase !== 'playing') break
      const input = botInput(game, { ...player, choices: [] }, 'random')
      const scores = player.choices.map((choice) => {
        if (choice === 'f:yes') return 100
        if (choice === 'f:no') return -100
        if (choice === 'w:w_love' || choice === 's:w_love') return 20
        const [kind, id] = choice.split(':')
        if (kind === 's') return -1
        if (kind === 'r') return id === 'w_love' ? -10 : 10
        if (kind === 'w') return player.weapons.some((weapon) => weapon.id === id) ? 4 : 3
        return 1
      })
      input.pick = scores.length ? scores.indexOf(Math.max(...scores)) : -1
      game.setInput(player.id, input)
      if (player.hasChild) {
        expect(player.married).toBe(true)
        expect(player.history.at(-1)?.outcome).toBe(LIFE_OUTCOMES.nightcry[0])
        console.info('Normal-card family:', JSON.stringify({ seed, time: game.state.time }))
        return
      }
      for (let step = 0; step < 6; step++) game.tick(1 / 60)
    }
    runs.push({ seed, time: game.state.time, married: player.married })
  }
  expect.fail(JSON.stringify(runs))
}, 120_000)
