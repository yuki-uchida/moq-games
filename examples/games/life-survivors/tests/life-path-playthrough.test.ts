import { expect, test } from 'vitest'
import { EVENTS, RUN_SECONDS } from '../src/data'
import { Game } from '../src/game'
import { LIFE_OUTCOMES } from '../src/history'
import { botInput } from './bot'

test('normal cards can turn an early career into a different later career', () => {
  const earlyIndex = EVENTS.findIndex((event) => event.boss === 'b_shukatsu')
  const laterIndex = EVENTS.findIndex((event) => event.boss === 'b_layoff')
  const competingCareers = [
    'w_work',
    'w_study',
    'w_reading',
    'w_overtime',
    'w_sports',
    'w_muscle',
    'w_invest',
    'w_savings',
    'w_gamble'
  ]
  const runs: { seed: number; time: number; early?: string; later?: string }[] = []
  for (let seed = 1; seed <= 20; seed++) {
    const game = new Game(seed)
    const player = game.addPlayer('p0')!
    for (let frame = 0; frame < RUN_SECONDS * 60; frame += 6) {
      if (game.state.phase !== 'playing' || game.state.eventIndex > laterIndex) break
      const priorities =
        game.state.eventIndex > earlyIndex ? ['w_hobby', 'w_karaoke', 'w_travel', 'w_cooking'] : ['w_work', 'w_study']
      const scores = player.choices.map((choice) => {
        const [kind, id] = choice.split(':')
        const priority = priorities.indexOf(id)
        if (kind === 'r') {
          if (priority >= 0) return -1
          return game.state.eventIndex > earlyIndex && competingCareers.includes(id)
            ? 3 + (player.weapons.find((weapon) => weapon.id === id)?.lv ?? 0)
            : 1
        }
        if (kind === 's') return priority >= 0 ? 4 : -1
        if (choice === 'x:skip') return 0
        if (priority >= 0) return 5 - priority
        if (kind === 'w') return player.weapons.some((weapon) => weapon.id === id) ? 3 : 2
        return 1
      })
      const input = botInput(game, { ...player, choices: [] }, 'random')
      input.pick = scores.length ? scores.indexOf(Math.max(...scores)) : -1
      game.setInput(player.id, input)
      for (let step = 0; step < 6; step++) game.tick(1 / 60)
    }
    const early = player.history.find((decision) => decision.event === earlyIndex)?.outcome
    const later = player.history.find((decision) => decision.event === laterIndex)?.outcome
    runs.push({ seed, time: game.state.time, early, later })
    if (early && LIFE_OUTCOMES.b_shukatsu.slice(0, 2).includes(early) && later === LIFE_OUTCOMES.b_layoff[12]) {
      console.info('Normal-card later career:', JSON.stringify(runs.at(-1)))
      return
    }
  }
  expect.fail(JSON.stringify(runs))
}, 120_000)

test('movement does not consume game randomness when choices are made separately', () => {
  const game = new Game(7)
  const control = new Game(7)
  const player = game.addPlayer('p0', 'p_gone')!
  control.addPlayer('p0', 'p_gone')
  game.tick(1 / 60)
  control.tick(1 / 60)
  expect(player.choices.length).toBeGreaterThan(0)
  botInput(game, { ...player, choices: [] }, 'random')
  expect(game.random()).toBe(control.random())
})

test('normal play from birth can reach employment, sports, asset and creative paths without talent-aware choices', () => {
  const eventIndex = EVENTS.findIndex((event) => event.boss === 'b_shukatsu')
  expect(eventIndex).toBeGreaterThanOrEqual(0)
  const runs: { seed: number; priorities: readonly string[]; time: number; outcome: string | undefined }[] = []

  for (const priorities of [
    ['w_work', 'w_study'],
    ['w_sports', 'w_muscle'],
    ['w_savings', 'w_invest'],
    ['w_hobby', 'w_karaoke', 'w_travel', 'w_cooking']
  ]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = new Game(seed)
      const player = game.addPlayer('p0')!
      const score = (choice: string) => {
        const [kind, id] = choice.split(':')
        const priority = priorities.indexOf(id)
        if (kind === 'r') return priority >= 0 ? -1 : 1
        if (kind === 's') return priority >= 0 ? 4 : -1
        if (choice === 'x:skip') return 0
        if (priority >= 0) return 5 - priority
        if (kind === 'w') return player.weapons.some((weapon) => weapon.id === id) ? 3 : 1
        return 2
      }

      for (let frame = 0; frame < RUN_SECONDS * 60; frame += 6) {
        if (game.state.phase !== 'playing' || game.state.eventIndex > eventIndex) break
        const input = botInput(game, { ...player, choices: [] }, 'random')
        const scores = player.choices.map(score)
        input.pick = scores.length ? scores.indexOf(Math.max(...scores)) : -1
        game.setInput(player.id, input)
        for (let step = 0; step < 6; step++) game.tick(1 / 60)
      }

      const outcome = player.history.find((decision) => decision.event === eventIndex)?.outcome
      runs.push({ seed, priorities, time: game.state.time, outcome })
    }
  }

  const employment = LIFE_OUTCOMES.b_shukatsu.slice(0, 2)
  expect(
    runs.some((run) => run.priorities[0] === 'w_work' && run.outcome !== undefined && employment.includes(run.outcome)),
    JSON.stringify(runs)
  ).toBe(true)
  expect(
    runs.some((run) => run.priorities[0] === 'w_sports' && run.outcome === LIFE_OUTCOMES.b_shukatsu[3]),
    JSON.stringify(runs)
  ).toBe(true)
  expect(
    runs.some((run) => run.priorities[0] === 'w_savings' && run.outcome === LIFE_OUTCOMES.b_shukatsu[4]),
    JSON.stringify(runs)
  ).toBe(true)
  expect(
    runs.some((run) => run.priorities[0] === 'w_hobby' && run.outcome === LIFE_OUTCOMES.b_shukatsu[5]),
    JSON.stringify(runs)
  ).toBe(true)
}, 120_000)
