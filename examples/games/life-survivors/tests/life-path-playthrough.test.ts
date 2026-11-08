import { expect, test } from 'vitest'
import { EVENTS, RUN_SECONDS, WEAPON_BY_ID } from '../src/data'
import { Game } from '../src/game'
import { LIFE_OUTCOMES } from '../src/history'
import { botInput } from './bot'

test.each([
  [['w_hobby', 'w_karaoke', 'w_travel', 'w_cooking'], 12, 80, 56],
  [['w_friend', 'w_sns', 'w_pet'], 17, 22, 19]
] as const)(
  'normal cards can turn an early career into later %s with a protected player',
  (laterPriorities, outcome, successfulSeed, preferredSeed) => {
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
    // Try a known successful seed first without dropping any fallback candidates.
    const seeds = new Set([
      successfulSeed,
      ...(outcome === 12 ? [14] : [3]),
      preferredSeed,
      ...Array.from({ length: 20 }, (_, index) => index + 1)
    ])
    for (const seed of seeds) {
      const game = new Game(seed)
      const player = game.addPlayer('p0')!
      for (let frame = 0; frame < RUN_SECONDS * 60; frame += 6) {
        if (game.state.phase !== 'playing' || game.state.eventIndex > laterIndex) break
        const early = player.history.find((decision) => decision.event === earlyIndex)?.outcome
        if (
          early &&
          ((outcome === 12 && !LIFE_OUTCOMES.b_shukatsu.slice(0, 2).includes(early)) ||
            early === LIFE_OUTCOMES.b_shukatsu[2] ||
            early === LIFE_OUTCOMES.b_shukatsu[outcome === 12 ? 5 : 6])
        )
          break
        const priorities = game.state.eventIndex > earlyIndex ? [...laterPriorities] : ['w_work', 'w_study']
        const scores = player.choices.map((choice) => {
          const [kind, id] = choice.split(':')
          const priority = priorities.indexOf(id)
          if (kind === 'r') {
            if (priority >= 0) return -1
            if (game.state.eventIndex > earlyIndex && id === 'w_work') return 100
            if (game.state.eventIndex > earlyIndex && id === 'w_friend') return 95
            if (game.state.eventIndex > earlyIndex && id === 'w_savings') return 90
            return competingCareers.includes(id) ? 3 + (player.weapons.find((weapon) => weapon.id === id)?.lv ?? 0) : 1
          }
          if (kind === 's') return priority >= 0 ? 4 : -1
          if (choice === 'x:skip') return 0
          if (
            kind === 'p' &&
            game.state.eventIndex > earlyIndex &&
            priorities.some((weapon) => WEAPON_BY_ID.get(weapon)?.evolve?.passive === id) &&
            !player.passives.some((passive) => passive.id === id)
          )
            return 10
          if (priority >= 0) return 5 + (player.weapons.some((weapon) => weapon.id === id) ? 3 : 0)
          if (kind === 'w') return player.weapons.some((weapon) => weapon.id === id) ? 3 : 2
          return 1
        })
        const input = botInput(game, { ...player, choices: [] }, 'smart')
        input.pick = scores.length ? scores.indexOf(Math.max(...scores)) : -1
        game.setInput(player.id, input)
        for (let step = 0; step < 6; step++) {
          player.hp = player.maxHp
          game.tick(1 / 60)
        }
      }
      const early = player.history.find((decision) => decision.event === earlyIndex)?.outcome
      const later = player.history.find((decision) => decision.event === laterIndex)?.outcome
      runs.push({ seed, time: game.state.time, early, later })
      if (
        early &&
        (outcome !== 12 || LIFE_OUTCOMES.b_shukatsu.slice(0, 2).includes(early)) &&
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
  const expected: Record<string, string[]> = {
    w_work: LIFE_OUTCOMES.b_shukatsu.slice(0, 2),
    w_sports: [LIFE_OUTCOMES.b_shukatsu[3]],
    w_savings: [LIFE_OUTCOMES.b_shukatsu[4]],
    w_hobby: [LIFE_OUTCOMES.b_shukatsu[5]],
    w_friend: [LIFE_OUTCOMES.b_shukatsu[6]]
  }
  const preferredSeeds: Record<string, number> = { w_work: 32, w_sports: 22, w_savings: 19, w_hobby: 29, w_friend: 3 }

  for (const priorities of [
    ['w_work', 'w_study'],
    ['w_sports', 'w_muscle'],
    ['w_savings', 'w_invest'],
    ['w_hobby', 'w_karaoke', 'w_travel', 'w_cooking'],
    ['w_friend', 'w_sns', 'w_pet']
  ]) {
    for (const seed of new Set([
      preferredSeeds[priorities[0]],
      ...(priorities[0] === 'w_hobby' ? [22] : []),
      13,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ])) {
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
        const input = botInput(game, { ...player, choices: [] }, 'smart')
        const scores = player.choices.map(score)
        input.pick = scores.length ? scores.indexOf(Math.max(...scores)) : -1
        game.setInput(player.id, input)
        for (let step = 0; step < 6; step++) game.tick(1 / 60)
      }

      const outcome = player.history.find((decision) => decision.event === eventIndex)?.outcome
      runs.push({ seed, priorities, time: game.state.time, outcome })
      if (outcome && expected[priorities[0]].includes(outcome)) break
    }
  }

  for (const outcomes of Object.values(expected))
    expect(
      runs.some((run) => run.outcome !== undefined && outcomes.includes(run.outcome)),
      JSON.stringify(runs)
    ).toBe(true)
}, 240_000)
