import { expect, test } from 'vitest'
import { EVENTS } from '../src/data'
import { Game } from '../src/game'
import { readView, toView } from '../src/view'

test('actual decisions are personal, ordered, stable and terminal-only for eight participants', () => {
  const game = new Game(123)
  const players = Array.from({ length: 8 }, (_, index) => game.addPlayer(String(index), 'p_free')!)
  const run = (kind: string) => {
    const index = EVENTS.findIndex((event) => (event.boss ?? event.swarm) === kind)
    game.state.eventIndex = index
    game.state.time = EVENTS[index].at - 0.001
    for (const player of game.state.players) {
      player.pending = 0
      player.choices = []
      player.careerPending = 0
    }
    game.state.enemies = []
    game.tick(0.001)
  }
  for (const [index, player] of players.entries())
    player.weapons = [{ id: 'w_study', lv: index % 2 ? 2 : 3, cd: 100, held: 0, damage: 0 }]
  players[0].downed = true
  players[0].hp = 0
  run('b_univ')
  expect(players[0].history[0].outcome).toContain('専門課程')
  expect(players[1].history[0].outcome).toContain('実践')
  run('b_univ')
  expect(players.every((player) => player.history.length === 1)).toBe(true)
  for (const [index, player] of players.entries())
    player.weapons = [{ id: 'w_work', lv: index < 4 ? 2 : 1, cd: 100, held: 0, damage: 0 }]
  run('b_shukatsu')
  expect(players[0].history[1].outcome).toContain('専門職')
  expect(players[1].history[1].outcome).toContain('現場')
  expect(players[4].history[1].outcome).toContain('自分の道')
  game.removePlayer('7')
  const late = game.addPlayer('7', 'p_free')!
  expect(late.history).toEqual([])
  players[0].weapons = [{ id: 'w_love', lv: 2, cd: 100, held: 0, damage: 0 }]
  run('b_wedding')
  players[0].weapons = []
  run('b_wedding')
  expect(players[0].history.filter((decision) => EVENTS[decision.event].boss === 'b_wedding')).toHaveLength(1)
  expect(players[0].married).toBe(true)
  run('nightcry')
  game.setInput(players[0].id, { pick: 0, pickSeq: players[0].choiceSeq })
  expect(players[0].history.at(-1)!.outcome).toContain('子どもを迎えた')
  expect(players[1].history.at(-1)!.outcome).toContain('未婚')
  for (const [index, player] of players.entries())
    player.weapons = [{ id: 'w_work', lv: index % 2 ? 3 : 4, cd: 100, held: 0, damage: 0 }]
  run('b_layoff')
  expect(players[0].history.at(-1)!.outcome).toContain('再就職')
  expect(players[1].history.at(-1)!.outcome).toContain('過去の職歴')
  expect(late.history).toHaveLength(3)
  const playing = toView(game.state)
  expect(playing.players.every((player) => player.history === undefined && player.talents === undefined)).toBe(true)
  expect(readView({ ...playing, players: [{ ...playing.players[0], history: players[0].history }] })).toBeUndefined()
  game.state.phase = 'lost'
  const ended = toView(game.state)
  expect(readView(ended)).toBeTruthy()
  expect(readView({ ...ended, players: ended.players.map(({ history: _history, ...player }) => player) })).toBeTruthy()
  expect(ended.players[0].history).toEqual(players[0].history)
  const first = players[0].history[0]
  for (const history of [
    Array(6).fill(first),
    [first, first],
    [{ ...first, event: -1 }],
    [{ ...first, event: 1.5 }],
    [{ ...first, outcome: 'forged' }],
    [{ ...first, talents: players[0].talents }]
  ]) {
    expect(readView({ ...ended, players: [{ ...ended.players[0], history }] })).toBeUndefined()
  }
  expect(readView({ ...ended, time: 0 })).toBeUndefined()
  const early = new Game(1)
  early.addPlayer('early', 'p_free')
  early.state.phase = 'lost'
  expect(toView(early.state).players[0].history).toEqual([])
})

test('joining exactly at a decision boundary does not invent an experience', () => {
  const game = new Game(123)
  game.addPlayer('anchor', 'p_free')
  const index = EVENTS.findIndex((event) => event.boss === 'b_univ')
  game.state.time = EVENTS[index].at
  game.state.eventIndex = index
  const late = game.addPlayer('late', 'p_free')!
  game.tick(0.001)
  expect(late.history).toEqual([])
  game.state.phase = 'reaper'
  expect(toView(game.state).players.every((player) => player.history === undefined)).toBe(true)
})

test.each(['b_univ', 'b_shukatsu', 'b_wedding', 'nightcry', 'b_layoff'])(
  'accepts the rounded terminal snapshot at the %s boundary',
  (kind) => {
    const game = new Game(123)
    game.addPlayer('player', 'p_free')
    const index = EVENTS.findIndex((event) => (event.boss ?? event.swarm) === kind)
    game.state.eventIndex = index
    game.state.time = EVENTS[index].at - 0.001
    game.tick(0.001)
    game.state.phase = 'lost'
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(view.players[0].history).toHaveLength(1)
    expect(readView(view)).toBeTruthy()
    expect(readView({ ...view, time: view.time - 0.01 })).toBeUndefined()
  }
)
