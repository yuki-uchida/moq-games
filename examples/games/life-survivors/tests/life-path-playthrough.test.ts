import { expect, test } from 'vitest'
import { EVENTS, RUN_SECONDS } from '../src/data'
import { Game } from '../src/game'
import { LIFE_OUTCOMES } from '../src/history'
import { botInput } from './bot'

test('normal cards can turn employment at 28 into a creative career at 64', () => {
  const earlyIndex = EVENTS.findIndex((event) => event.boss === 'b_shukatsu')
  const laterIndex = EVENTS.findIndex((event) => event.boss === 'b_layoff')
  const game = new Game(25)
  const player = game.addPlayer('p0')!
  const acquired = new Set<string>()
  const competingCareers = [
    'w_work',
    'w_study',
    'w_reading',
    'w_overtime',
    'w_sports',
    'w_muscle',
    'w_invest',
    'w_savings',
    'w_gamble',
    'w_friend',
    'w_sns',
    'w_pet'
  ]
  let elapsed = 0
  for (let frame = 0; frame < RUN_SECONDS * 60; frame += 6) {
    if (game.state.phase !== 'playing' || elapsed > EVENTS[laterIndex].at + 0.1) break
    const later = elapsed > EVENTS[earlyIndex].at + 0.1
    const priorities = later ? ['w_hobby', 'w_karaoke', 'w_travel', 'w_cooking'] : ['w_work', 'w_study']
    const scores = player.choices.map((choice) => {
      const [kind, id] = choice.split(':')
      const priority = priorities.indexOf(id)
      if (choice === 'f:no') return 10
      if (choice === 'f:yes') return -10
      if (kind === 'r') return priority >= 0 ? -1 : later && competingCareers.includes(id) ? 4 : 1
      if (kind === 's') return priority >= 0 ? 5 : -1
      if (choice === 'x:skip') return 0
      if (priority >= 0) return 8 - priority
      if (kind === 'w') return acquired.has(id) ? 3 : 2
      return 1
    })
    const input = botInput(game, { ...player, choices: [] }, 'random')
    input.pick = scores.length ? scores.indexOf(Math.max(...scores)) : -1
    if (input.pick >= 0) {
      const [kind, id, replacement] = player.choices[input.pick].split(':')
      if (kind === 'w') acquired.add(id)
      if (kind === 'r') {
        acquired.delete(id)
        acquired.add(replacement)
      }
    }
    game.setInput(player.id, input)
    for (let step = 0; step < 6; step++) {
      if (!player.choices.length) elapsed += 1 / 60
      game.tick(1 / 60)
    }
  }
  const early = player.history.find((decision) => decision.event === earlyIndex)?.outcome
  const later = player.history.find((decision) => decision.event === laterIndex)?.outcome
  expect(LIFE_OUTCOMES.b_shukatsu.slice(0, 2)).toContain(early)
  expect(later).toBe(LIFE_OUTCOMES.b_layoff[12])
}, 30_000)

test.each([
  [['w_hobby', 'w_karaoke', 'w_travel', 'w_cooking'], 12],
  [['w_friend', 'w_sns', 'w_pet'], 17]
] as const)(
  'normal cards can turn an early career into later %s',
  (laterPriorities, outcome) => {
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
      'w_gamble',
      'w_friend',
      'w_sns',
      'w_pet',
      'w_hobby',
      'w_karaoke',
      'w_travel',
      'w_cooking'
    ]
    const runs: { seed: number; time: number; early?: string; later?: string }[] = []
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game(seed)
      const player = game.addPlayer('p0')!
      for (let frame = 0; frame < RUN_SECONDS * 60; frame += 6) {
        if (game.state.phase !== 'playing' || game.state.eventIndex > laterIndex) break
        const priorities = game.state.eventIndex > earlyIndex ? [...laterPriorities] : ['w_work', 'w_study']
        const scores = player.choices.map((choice) => {
          const [kind, id] = choice.split(':')
          const priority = priorities.indexOf(id)
          if (kind === 'r') {
            if (priority >= 0) return -1
            return competingCareers.includes(id) ? 3 + (player.weapons.find((weapon) => weapon.id === id)?.lv ?? 0) : 1
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
      if (
        early &&
        LIFE_OUTCOMES.b_shukatsu.includes(early) &&
        early !== LIFE_OUTCOMES.b_shukatsu[2] &&
        early !== LIFE_OUTCOMES.b_shukatsu[outcome === 12 ? 5 : 6] &&
        later === LIFE_OUTCOMES.b_layoff[outcome]
      ) {
        console.info('Normal-card later career:', JSON.stringify(runs.at(-1)))
        return
      }
    }
    expect.fail(JSON.stringify(runs))
  },
  120_000
)

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

test('normal play from birth can reach employment, sports, asset, creative and social paths without talent-aware choices', () => {
  const eventIndex = EVENTS.findIndex((event) => event.boss === 'b_shukatsu')
  expect(eventIndex).toBeGreaterThanOrEqual(0)
  const runs: { seed: number; priorities: readonly string[]; time: number; outcome: string | undefined }[] = []

  for (const priorities of [
    ['w_work', 'w_study'],
    ['w_sports', 'w_muscle'],
    ['w_savings', 'w_invest'],
    ['w_hobby', 'w_karaoke', 'w_travel', 'w_cooking'],
    ['w_friend', 'w_sns', 'w_pet']
  ]) {
    for (const seed of priorities[0] === 'w_work' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5]) {
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

  expect(
    runs.some((run) => run.priorities[0] === 'w_friend' && run.outcome === LIFE_OUTCOMES.b_shukatsu[6]),
    JSON.stringify(runs)
  ).toBe(true)
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
