import { describe, expect, test } from 'vitest'
import { EVENTS, MAX_PASSIVE_LEVEL, MAX_WEAPON_LEVEL, PASSIVES, PASSIVE_SLOTS, TALENT_WEAPONS } from '../src/data'
import { Game, weaponSlots, type Player } from '../src/game'
import { readView, toView } from '../src/view'
import { careerFor } from '../src/art/careers'
import { LIFE_OUTCOMES } from '../src/history'

const equip = (player: Player, id: string, lv: number) => {
  player.weapons = [{ id, lv, cd: 100, held: 0, damage: 0 }]
}
const event = (game: Game, boss: string) => {
  const index = EVENTS.findIndex((entry) => entry.boss === boss)
  for (const player of game.state.players) {
    player.pending = 0
    player.careerPending = 0
    player.choices = []
  }
  game.state.enemies = []
  game.state.eventIndex = index
  game.state.time = EVENTS[index].at - 0.001
  game.tick(0.001)
}
const arena = () => {
  const game = new Game(123)
  const players = Array.from({ length: 8 }, (_, index) => game.addPlayer(`player${index}`, 'p_free')!)
  return { game, players }
}

describe('education and career history', () => {
  test('social, romantic and creative appearances do not grant or displace career qualifications and rewards', () => {
    for (const talent of [
      'w_friend',
      'w_sns',
      'w_pet',
      'w_love',
      'w_beauty',
      'w_ring',
      'w_perfume',
      'w_hobby',
      'w_karaoke',
      'w_travel',
      'w_cooking'
    ]) {
      for (const qualified of [undefined, 'w_work', 'w_sports', 'w_invest']) {
        const run = (withAppearance: boolean) => {
          const game = new Game(123)
          const player = game.addPlayer('personal', 'p_free')!
          player.weapons = qualified
            ? [{ id: qualified, lv: qualified === 'w_work' ? 2 : 4, cd: 100, held: 0, damage: 0 }]
            : []
          if (withAppearance) player.weapons.push({ id: talent, lv: 8, cd: 100, held: 0, damage: 0 })
          player.passives = [{ id: TALENT_WEAPONS.find(({ id }) => id === talent)!.evolve!.passive, lv: 1 }]
          event(game, 'b_shukatsu')
          const firstReward = player.careerPending
          event(game, 'b_layoff')
          return {
            history: player.history,
            firstReward,
            finalReward: player.careerPending,
            bosses: game.state.enemies.map(({ type }) => type)
          }
        }
        expect(run(true)).toEqual(run(false))
      }
    }
  })
  test('eight personal paths share appearance ranking, preserve history and validate terminal views', () => {
    const { game, players } = arena()
    const builds: [string, number][][] = [
      [['w_sports', 4]],
      [['w_muscle', 4]],
      [['w_invest', 4]],
      [['w_savings', 4]],
      [
        ['w_sports', 4],
        ['w_invest', 5]
      ],
      [
        ['w_muscle', 5],
        ['w_savings', 5]
      ],
      [
        ['w_work', 2],
        ['w_sports', 8],
        ['w_invest', 8]
      ],
      [
        ['w_sports', 3],
        ['w_savings', 3]
      ]
    ]
    players.forEach((player, index) => {
      player.weapons = builds[index].map(([id, lv]) => ({ id, lv, cd: 100, held: 0, damage: 0 }))
    })
    players[0].downed = true
    players[0].hp = 0
    event(game, 'b_shukatsu')
    expect(players.map((player) => player.careerPending)).toEqual([1, 1, 1, 1, 1, 1, 1, 0])
    expect(players.map((player) => player.history[0].outcome)).toEqual([
      ...Array(2).fill('運動を磨き、スポーツの道へ。転機を1回獲得。'),
      ...Array(3).fill('資産を育て、資産を活かす道へ。転機を1回獲得。'),
      '運動を磨き、スポーツの道へ。転機を1回獲得。',
      '運動を磨き、スポーツの道へ。転機を1回獲得。',
      '就職を急がず、自分の道を探す。'
    ])
    const decisions = players.map((player) => [...player.history])
    players.forEach((player, index) => equip(player, index % 2 ? 'w_muscle' : 'w_savings', 4))
    event(game, 'b_shukatsu')
    expect(players.map((player) => player.history)).toEqual(decisions)
    expect(players.every((player) => player.careerPending === 0)).toBe(true)
    event(game, 'b_layoff')
    expect(players.map((player) => player.careerPending)).toEqual([1, 2, 2, 1, 2, 2, 1, 0])
    expect(players[0].downed).toBe(true)
    expect(players[0].hp).toBe(0)
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_layoff')).toHaveLength(0)
    expect(
      toView(game.state).players.every((player) => player.history === undefined && player.talents === undefined)
    ).toBe(true)
    game.state.phase = 'lost'
    const terminal = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView(terminal)).toBeTruthy()
    expect(terminal.players.map((player: Player) => player.history)).toEqual(players.map((player) => player.history))
    expect(terminal.players.every((player: Player) => !('path' in player))).toBe(true)
  })

  test.each<{
    name: string
    weapons: [string, number][]
    passive?: string
    outcome: number
    appearance?: string
  }>([
    {
      name: 'sports outranks qualified work',
      weapons: [
        ['w_work', 2],
        ['w_sports', 8]
      ],
      outcome: 3,
      appearance: 'soccer'
    },
    {
      name: 'assets outrank qualified work',
      weapons: [
        ['w_work', 2],
        ['w_invest', 8]
      ],
      outcome: 4,
      appearance: 'entrepreneur'
    },
    {
      name: 'study contributes to qualified work',
      weapons: [
        ['w_work', 2],
        ['w_study', 8],
        ['w_sports', 7]
      ],
      outcome: 1,
      appearance: 'bureaucrat'
    },
    {
      name: 'reading contributes to qualified work',
      weapons: [
        ['w_work', 2],
        ['w_reading', 8],
        ['w_invest', 7]
      ],
      outcome: 1,
      appearance: 'bureaucrat'
    },
    {
      name: 'overtime contributes to qualified work',
      weapons: [
        ['w_work', 2],
        ['w_overtime', 8],
        ['w_muscle', 7]
      ],
      outcome: 1,
      appearance: 'bureaucrat'
    },
    {
      name: 'definition order puts investment before muscle',
      weapons: [
        ['w_muscle', 5],
        ['w_invest', 5]
      ],
      outcome: 4,
      appearance: 'entrepreneur'
    },
    {
      name: 'definition order puts study before investment',
      weapons: [
        ['w_invest', 8],
        ['w_work', 2],
        ['w_study', 8]
      ],
      outcome: 1,
      appearance: 'bureaucrat'
    },
    {
      name: 'definition order puts sports before study',
      weapons: [
        ['w_study', 8],
        ['w_work', 2],
        ['w_sports', 8]
      ],
      outcome: 3,
      appearance: 'soccer'
    },
    {
      name: 'evolved investment beats earlier sports',
      weapons: [
        ['w_sports', 8],
        ['w_work', 2],
        ['w_invest', 8]
      ],
      passive: 'p_greedy',
      outcome: 4,
      appearance: 'entrepreneur'
    },
    {
      name: 'evolved reading beats earlier sports',
      weapons: [
        ['w_sports', 8],
        ['w_work', 2],
        ['w_reading', 8]
      ],
      passive: 'p_curious',
      outcome: 1,
      appearance: 'bureaucrat'
    },
    {
      name: 'unqualified study is ignored',
      weapons: [
        ['w_study', 8],
        ['w_work', 1],
        ['w_invest', 4]
      ],
      outcome: 4,
      appearance: 'bureaucrat'
    },
    {
      name: 'gambling contributes to qualified assets',
      weapons: [
        ['w_sports', 7],
        ['w_savings', 4],
        ['w_gamble', 8]
      ],
      outcome: 4,
      appearance: 'entrepreneur'
    },
    {
      name: 'gambling alone cannot qualify assets',
      weapons: [
        ['w_gamble', 8],
        ['w_work', 2]
      ],
      outcome: 1,
      appearance: 'entrepreneur'
    },
    {
      name: 'gambling without qualifications finds own path',
      weapons: [['w_gamble', 8]],
      outcome: 2,
      appearance: 'entrepreneur'
    },
    { name: 'level two work needs no ranked appearance', weapons: [['w_work', 2]], outcome: 1 },
    { name: 'level three work needs no ranked appearance', weapons: [['w_work', 3]], outcome: 1 }
  ])('$name', ({ weapons, passive, outcome, appearance }) => {
    const game = new Game(123)
    const player = game.addPlayer('worker', 'p_free')!
    player.weapons = weapons.map(([id, lv]) => ({ id, lv, cd: 100, held: 0, damage: 999999 }))
    player.passives = passive ? [{ id: passive, lv: 1 }] : []
    expect(careerFor(toView(game.state).players[0])).toBe(appearance)
    event(game, 'b_shukatsu')
    expect(player.history[0].outcome).toBe(LIFE_OUTCOMES.b_shukatsu[outcome])
    expect(player.careerPending).toBe(outcome === 2 ? 0 : 1)
    expect(toView(game.state).players[0]).not.toHaveProperty('history')
    const decision = { ...player.history[0] }
    equip(player, outcome === 3 ? 'w_invest' : 'w_sports', 8)
    event(game, 'b_layoff')
    expect(player.history[0]).toEqual(decision)
    expect(player.careerPending).toBe(outcome === 2 ? 0 : 1)
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_layoff')).toHaveLength(outcome === 1 ? 1 : 0)
    game.state.phase = 'lost'
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
  })

  test.each(['w_sports', 'w_muscle', 'w_invest', 'w_savings'])(
    '%s replacement preserves the path, but only current weapons in that field earn two rewards',
    (weapon) => {
      const {
        game,
        players: [player]
      } = arena()
      equip(player, weapon, 4)
      event(game, 'b_shukatsu')
      const decision = { ...player.history[0] }
      player.choices = [`r:${weapon}:w_work`]
      game.choose(player, 0)
      player.weapons[0].lv = 8
      event(game, 'b_layoff')
      expect(player.careerPending).toBe(1)
      expect(player.history[0]).toEqual(decision)
      expect(player.history[1].outcome).toContain(
        weapon === 'w_sports' || weapon === 'w_muscle' ? '過去の運動経験' : '過去の資産経験'
      )
      expect(game.state.enemies.some((enemy) => enemy.kind === 'b_layoff')).toBe(false)
      game.state.phase = 'lost'
      expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
    }
  )

  test('new paths do not transfer to late or reused IDs, nor activate the shared layoff boss', () => {
    const game = new Game(123)
    const original = game.addPlayer('same', 'p_free')!
    equip(original, 'w_sports', 4)
    event(game, 'b_shukatsu')
    const late = game.addPlayer('late', 'p_free')!
    equip(late, 'w_invest', 8)
    game.removePlayer(original.id)
    const reused = game.addPlayer('same', 'p_free')!
    equip(reused, 'w_sports', 8)
    event(game, 'b_layoff')
    expect([late.careerPending, reused.careerPending]).toEqual([0, 0])
    expect(game.state.enemies.some((enemy) => enemy.kind === 'b_layoff')).toBe(false)
  })

  test.each([
    ['w_work', 2, 0],
    ['w_sports', 1, 3],
    ['w_invest', 1, 4]
  ] as const)(
    'education preserves the reward for selected %s, not automatic employment',
    (leading, reward, outcome) => {
      const {
        game,
        players: [player]
      } = arena()
      equip(player, 'w_study', 3)
      event(game, 'b_univ')
      expect(player.careerPending).toBe(1)
      player.weapons = ['w_work', 'w_sports', 'w_invest'].map((id) => ({
        id,
        lv: id === leading ? 8 : 7,
        cd: 100,
        held: 0,
        damage: 0
      }))
      event(game, 'b_shukatsu')
      expect(player.careerPending).toBe(reward)
      expect(player.history.at(-1)!.outcome).toBe(LIFE_OUTCOMES.b_shukatsu[outcome])
    }
  )

  test('a late participant can choose a future path but not one at their join boundary', () => {
    const game = new Game(123)
    game.addPlayer('anchor', 'p_free')
    event(game, 'b_univ')
    const future = game.addPlayer('future', 'p_free')!
    equip(future, 'w_savings', 4)
    const index = EVENTS.findIndex((entry) => entry.boss === 'b_shukatsu')
    game.state.eventIndex = index
    game.state.time = EVENTS[index].at
    const boundary = game.addPlayer('boundary', 'p_free')!
    equip(boundary, 'w_sports', 8)
    game.tick(0.001)
    expect(future.careerPending).toBe(1)
    expect(boundary.history).toEqual([])
    event(game, 'b_layoff')
    expect([future.careerPending, boundary.careerPending]).toEqual([2, 0])
  })

  test('eight players decide independently at all three stages, without using talent', () => {
    const { game, players } = arena()
    players.forEach((player, index) => equip(player, 'w_study', index % 2 ? 2 : 3))
    event(game, 'b_univ')
    expect(players.map((player) => player.careerPending)).toEqual([1, 0, 1, 0, 1, 0, 1, 0])
    players.forEach((player, index) => equip(player, 'w_work', index < 4 ? 2 : 1))
    event(game, 'b_shukatsu')
    expect(players.map((player) => player.careerPending)).toEqual([2, 1, 2, 1, 0, 0, 0, 0])
    players.forEach((player, index) => equip(player, 'w_work', index % 2 ? 3 : 4))
    event(game, 'b_layoff')
    expect(players.map((player) => player.careerPending)).toEqual([2, 1, 2, 1, 0, 0, 0, 0])
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_layoff')).toHaveLength(1)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
    for (const player of toView(game.state).players) {
      expect(player.talents).toBeUndefined()
      expect(player).not.toHaveProperty('studied')
      expect(player).not.toHaveProperty('employed')
    }
    game.state.log = []
    event(game, 'b_layoff')
    expect(players.every((player) => player.careerPending === 0)).toBe(true)
    expect(game.state.log.filter((entry) => entry.to)).toEqual([])
  })

  test('actual replacement preserves education and employment but removes current training', () => {
    const {
      game,
      players: [player]
    } = arena()
    equip(player, 'w_study', 3)
    event(game, 'b_univ')
    player.choices = ['r:w_study:w_work']
    game.choose(player, 0)
    expect(player.weapons[0].id).toBe('w_work')
    player.weapons[0].lv = 2
    event(game, 'b_shukatsu')
    expect(player.careerPending).toBe(2)
    player.choices = ['r:w_work:w_sports']
    game.choose(player, 0)
    event(game, 'b_layoff')
    expect(player.careerPending).toBe(1)
    expect(game.state.log.some((entry) => entry.to === player.id && entry.text.includes('過去の職歴'))).toBe(true)
  })

  test('late training cannot rewrite earlier failures or replay a decided event', () => {
    const {
      game,
      players: [player]
    } = arena()
    equip(player, 'w_study', 2)
    event(game, 'b_univ')
    equip(player, 'w_study', 8)
    event(game, 'b_univ')
    expect(player.careerPending).toBe(0)
    equip(player, 'w_work', 2)
    event(game, 'b_shukatsu')
    expect(player.careerPending).toBe(1)
    const before = game.state.log.filter((entry) => entry.to === player.id).length
    event(game, 'b_shukatsu')
    expect(player.careerPending).toBe(0)
    expect(game.state.log.filter((entry) => entry.to === player.id)).toHaveLength(before)
  })

  test('layoffs affect the shared world only while a player with employment history remains', () => {
    const { game, players } = arena()
    for (const player of players) equip(player, 'w_work', 1)
    event(game, 'b_shukatsu')
    event(game, 'b_layoff')
    expect(game.state.enemies.some((enemy) => enemy.kind === 'b_layoff')).toBe(false)
    expect(game.state.log.some((entry) => !entry.to && entry.text.includes('リストラ'))).toBe(false)

    const next = arena()
    equip(next.players[0], 'w_work', 2)
    event(next.game, 'b_shukatsu')
    next.game.removePlayer(next.players[0].id)
    event(next.game, 'b_layoff')
    expect(next.game.state.enemies.some((enemy) => enemy.kind === 'b_layoff')).toBe(false)
  })

  test.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true]
  ])('career rewards remain usable with a nearly maxed hand (%s), existing pending (%s)', (almost, existing) => {
    const game = new Game(321)
    const player = game.addPlayer('worker', 'p_edu')!
    game.addPlayer('anchor', 'p_free')
    equip(player, 'w_work', 2)
    event(game, 'b_shukatsu')
    player.weapons = [
      { id: 'w_work', lv: MAX_WEAPON_LEVEL, cd: 100, held: 0, damage: 0 },
      ...TALENT_WEAPONS.filter((weapon) => weapon.id !== 'w_work')
        .slice(0, weaponSlots(player) - 1)
        .map((weapon) => ({ id: weapon.id, lv: MAX_WEAPON_LEVEL, cd: 100, held: 0, damage: 0 }))
    ]
    player.passives = PASSIVES.slice(0, PASSIVE_SLOTS).map((passive, index) => ({
      id: passive.id,
      lv: almost && index === 0 ? MAX_PASSIVE_LEVEL - 1 : MAX_PASSIVE_LEVEL
    }))
    event(game, 'b_layoff')
    expect(player.careerPending).toBe(2)
    if (existing) player.pending++
    game.tick(0.01)
    if (almost) {
      expect(player.choices).toEqual([`p:${player.passives[0].id}`])
      game.choose(player, 0)
      game.tick(0.01)
    } else if (existing) {
      expect(player.choices).toEqual([])
      game.tick(0.01)
    }
    expect(player.choices.some((choice) => choice.startsWith('s:'))).toBe(true)
    const replacement = player.choices[0].split(':')[1]
    game.choose(player, 0)
    game.choose(player, 0)
    if (!almost || existing) {
      game.tick(0.01)
      expect(player.choices).toContain(`w:${replacement}`)
      game.choose(player, player.choices.indexOf(`w:${replacement}`))
    }
    expect(player.careerPending).toBe(0)
  })

  test('downed players bank turning points without revival and receive them after recovery', () => {
    const {
      game,
      players: [player]
    } = arena()
    equip(player, 'w_study', 3)
    player.downed = true
    player.hp = 0
    event(game, 'b_univ')
    expect(player.careerPending).toBe(1)
    expect(player.downed).toBe(true)
    expect(player.hp).toBe(0)
    player.downed = false
    player.hp = player.maxHp
    game.tick(0.01)
    expect(player.careerPending).toBe(0)
    expect(player.choices.length).toBeGreaterThan(0)
  })

  test('late joins and reused IDs have no inherited history; future practical careers remain available', () => {
    const game = new Game(123)
    const original = game.addPlayer('same', 'p_free')!
    game.addPlayer('anchor', 'p_free')!
    equip(original, 'w_study', 3)
    event(game, 'b_univ')
    game.removePlayer(original.id)
    const newcomer = game.addPlayer('same', 'p_free')!
    equip(newcomer, 'w_work', 4)
    event(game, 'b_shukatsu')
    expect(newcomer.careerPending).toBe(1)
    const late = game.addPlayer('late', 'p_free')!
    equip(late, 'w_work', 8)
    event(game, 'b_layoff')
    expect(newcomer.careerPending).toBe(2)
    expect(late.careerPending).toBe(0)
  })

  test('joining exactly on an unprocessed boundary skips that decision', () => {
    const game = new Game(123)
    game.addPlayer('anchor', 'p_free')!
    game.state.eventIndex = EVENTS.findIndex((entry) => entry.boss === 'b_univ')
    game.state.time = EVENTS[game.state.eventIndex].at
    const late = game.addPlayer('late', 'p_free')!
    equip(late, 'w_study', 8)
    game.tick(0.001)
    expect(late.careerPending).toBe(0)
    equip(late, 'w_work', 2)
    event(game, 'b_shukatsu')
    expect(late.careerPending).toBe(1)
  })
})
