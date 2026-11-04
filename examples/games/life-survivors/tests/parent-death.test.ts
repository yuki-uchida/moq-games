import { describe, expect, test } from 'vitest'
import {
  EVENTS,
  INHERITED_PASSIVES,
  MAX_PASSIVE_LEVEL,
  MAX_WEAPON_LEVEL,
  PARENTS,
  PARENT_LEGACIES,
  PASSIVES,
  PASSIVE_SLOTS,
  TALENT_WEAPONS,
  WEAPON_INDEX,
  ageAt,
  timeAtAge
} from '../src/data'
import { Game, passiveLevel, playerStats, weaponSlots } from '../src/game'
import { historyOk } from '../src/history'
import { FX } from '../src/fx'
import { Effects } from '../src/effects'
import { parentMemorialAt } from '../src/hud'
import { readView, toView } from '../src/view'
import { sheet } from '../src/art/index'
import { PET_MEMORY } from '../src/weapon-life'

const care = EVENTS.findIndex((event) => event.boss === 'b_care')
const at = EVENTS[care].at
const parents = PARENTS.filter((parent) => parent.id !== 'p_gone').map((parent) => parent.id)
function runCare(game: Game) {
  game.state.time = at - 0.001
  game.state.eventIndex = care
  game.tick(0.001)
}

function cappedBuild() {
  const game = new Game(9)
  const player = game.addPlayer('a', 'p_over')!
  player.weapons[0].lv = MAX_WEAPON_LEVEL
  player.weapons.push(
    ...TALENT_WEAPONS.slice(0, weaponSlots(player)).map(({ id }) => ({
      id,
      lv: MAX_WEAPON_LEVEL,
      cd: 100,
      held: 0,
      damage: 0
    }))
  )
  player.passives = [
    { id: 'p_affection', lv: MAX_PASSIVE_LEVEL },
    ...PASSIVES.slice(0, PASSIVE_SLOTS - 1).map(({ id }) => ({ id, lv: MAX_PASSIVE_LEVEL }))
  ]
  return { game, player }
}

describe('parent farewell', () => {
  test.each(INHERITED_PASSIVES)(
    '$name is inheritance-only, then upgrades normally and scales with talent',
    (passive) => {
      const game = new Game(1)
      const parent = Object.keys(PARENT_LEGACIES).find((id) => PARENT_LEGACIES[id] === passive.id)!
      const player = game.addPlayer('a', parent)!
      expect(game.options(player)).not.toContain(`p:${passive.id}`)
      player.weapons[0].lv = MAX_WEAPON_LEVEL
      runCare(game)
      expect(game.options(player)).toContain(`p:${passive.id}`)
      player.choices = [`p:${passive.id}`]
      game.choose(player, 0)
      expect(passiveLevel(player, passive.id)).toBe(2)
      player.talents[passive.category] = 0.55
      const low = playerStats(player)
      player.talents[passive.category] = 1.7
      expect(playerStats(player)).not.toEqual(low)
    }
  )
  test('care and death happen at age 50, before retirement', () => {
    expect(at).toBe(timeAtAge(50))
    expect(ageAt(at + 0.001)).toBe(50)
    expect(at).toBeLessThan(EVENTS.find((event) => event.boss === 'b_layoff')!.at)
  })

  test('parent and pet legacies both survive a full hand at the same age', () => {
    const game = new Game(11)
    const player = game.addPlayer('a', 'p_over')!
    player.weapons[0].lv = MAX_WEAPON_LEVEL
    player.weapons.push({ id: 'w_pet', lv: 1, cd: 100, held: 0, damage: 0, acquiredAge: 30 })
    player.passives = PASSIVES.filter((passive) => passive.id !== PET_MEMORY)
      .slice(0, PASSIVE_SLOTS)
      .map(({ id }) => ({ id, lv: 1 }))
    const regen = playerStats(player).regen
    runCare(game)
    expect(player.weapons.some((weapon) => weapon.id === 'p_over' || weapon.id === 'w_pet')).toBe(false)
    expect(passiveLevel(player, 'p_affection')).toBe(1)
    expect(passiveLevel(player, PET_MEMORY)).toBe(1)
    expect(player.passives).toHaveLength(PASSIVE_SLOTS + 2)
    expect(playerStats(player).regen).toBeCloseTo(regen + 0.4 * (player.talents.love + player.talents.friend))
    expect(game.options(player)).toContain('p:p_affection')
    expect(game.options(player)).not.toContain(`p:${PET_MEMORY}`)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeDefined()
  })

  test.each(parents)('%s leaves the hand and every active attack, with no reward below max', (parent) => {
    const game = new Game(1)
    const player = game.addPlayer('a', parent)!
    game.addPlayer('b', 'p_gone')!.pending = 0
    player.weapons[0].lv = MAX_WEAPON_LEVEL - 1
    game.spawnEnemy('germ', player.x + 200, player.y)
    player.weapons[0].cd = 0
    game.tick(0.001)
    expect(game.state.shots.some((shot) => shot.owner === player.id && shot.weapon === parent)).toBe(true)
    const slots = weaponSlots(player)
    const stats = playerStats(player)
    player.choices = [`w:${parent}`, 'p:p_lucky']
    const seq = player.choiceSeq
    runCare(game)
    expect(player.parentDeath?.reward).toBe('none')
    expect(player.weapons.some((weapon) => weapon.id === parent)).toBe(false)
    expect(game.state.shots.some((shot) => shot.weapon === parent)).toBe(false)
    expect(player.choices).toEqual(['p:p_lucky'])
    expect(game.options(player)).not.toContain(`w:${parent}`)
    expect(player.choiceSeq).toBeGreaterThan(seq)
    game.setInput(player.id, { pick: 0, pickSeq: seq })
    expect(player.passives).toEqual([])
    expect(weaponSlots(player)).toBe(slots)
    expect(playerStats(player)).toEqual(stats)
    expect(historyOk(player.history, game.state.time)).toBe(true)
    expect(player.history.at(-1)?.outcome).toContain('最大レベル未満')
    expect(game.state.fx.some((event) => event.type === FX.PARENT_DEATH)).toBe(true)
    for (let count = 0; count < 10; count++) game.tick(0.1)
    expect(game.state.shots.some((shot) => shot.weapon === parent)).toBe(false)
  })

  test.each(parents)('%s grants its real passive even with all normal passive slots filled', (parent) => {
    const game = new Game(2)
    const player = game.addPlayer('a', parent)!
    const legacy = PARENT_LEGACIES[parent]
    player.weapons[0].lv = MAX_WEAPON_LEVEL
    player.passives = PASSIVES.filter((passive) => passive.id !== legacy)
      .slice(0, PASSIVE_SLOTS)
      .map(({ id }) => ({ id, lv: 1 }))
    const before = playerStats(player)
    runCare(game)
    expect(player.parentDeath?.reward).toBe('passive')
    expect(passiveLevel(player, legacy)).toBe(1)
    expect(player.passives).toHaveLength(PASSIVE_SLOTS + 1)
    expect(playerStats(player)).not.toEqual(before)
    expect(game.options(player)).toContain(`p:${legacy}`)
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView(view)?.players[0].parentDeath).toEqual(player.parentDeath)
    expect(view.players[0].history).toBeUndefined()
    game.state.phase = 'lost'
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))?.players[0].history).toEqual(player.history)
    game.state.phase = 'playing'
    runCare(game)
    expect(passiveLevel(player, legacy)).toBe(1)
    expect(player.history).toHaveLength(1)
  })

  test.each(parents)('%s strengthens existing inheritance, or awards a usable choice at max', (parent) => {
    for (const level of [2, MAX_PASSIVE_LEVEL - 1, MAX_PASSIVE_LEVEL]) {
      const game = new Game(3)
      const player = game.addPlayer('a', parent)!
      const legacy = PARENT_LEGACIES[parent]
      player.weapons[0].lv = MAX_WEAPON_LEVEL
      player.passives = [{ id: legacy, lv: level }]
      runCare(game)
      expect(player.passives).toEqual([{ id: legacy, lv: Math.min(level + 1, MAX_PASSIVE_LEVEL) }])
      if (level === MAX_PASSIVE_LEVEL) {
        expect(player.parentDeath?.reward).toBe('choice')
        expect(player.pending).toBe(0)
        expect(player.parentRewardPending).toBe(1)
        game.tick(0.01)
        expect(player.choices.length).toBeGreaterThan(0)
      }
    }
  })

  test('saved family choices cannot resurrect a dead parent or upgrade a capped passive', () => {
    const game = new Game(4)
    const player = game.addPlayer('a', 'p_free')!
    game.addPlayer('b', 'p_gone')!.pending = 0
    player.married = true
    player.weapons[0].lv = MAX_WEAPON_LEVEL
    player.passives = [{ id: 'p_courage', lv: MAX_PASSIVE_LEVEL - 1 }]
    player.choices = ['w:p_free', 'p:p_courage']
    const birth = EVENTS.findIndex((event) => event.swarm === 'nightcry')
    game.state.time = EVENTS[birth].at - 0.001
    game.state.eventIndex = birth
    game.tick(0.001)
    expect(player.choices).toEqual(['f:yes', 'f:no'])
    const seq = player.choiceSeq
    runCare(game)
    expect(player.choices).toEqual(['f:yes', 'f:no'])
    expect(player.choiceSeq).toBe(seq)
    game.setInput(player.id, { pick: 1, pickSeq: seq })
    expect(player.hasChild).toBe(false)
    expect(player.choices).toEqual([])
    expect(player.pending).toBe(0)
    expect(player.parentRewardPending).toBe(1)
    game.tick(0.01)
    expect(player.choices).not.toContain('w:p_free')
    expect(player.choices).not.toContain('p:p_courage')
  })

  test('a completely capped build still receives a usable reward instead of consuming it silently', () => {
    const { game, player } = cappedBuild()
    expect(game.options(player)).toEqual([])
    runCare(game)
    game.tick(0.01)
    expect(player.parentDeath?.reward).toBe('choice')
    expect(player.choices.sort()).toEqual(['x:coin', 'x:meal'])
    const xp = game.state.xp
    game.choose(player, player.choices.indexOf('x:coin'))
    expect(game.state.xp).toBeGreaterThan(xp)
    expect(player.pending).toBe(0)
    expect(player.parentRewardPending).toBe(0)
    game.gainXp(game.state.xpNext)
    game.tick(0.01)
    expect(player.choices).toEqual([])
    expect(player.pending).toBe(0)
  })

  test.each([false, true])(
    'refunds an expired hand separately from normal and farewell rewards (saved: %s)',
    (saved) => {
      for (const legacyLevel of [MAX_PASSIVE_LEVEL - 1, MAX_PASSIVE_LEVEL]) {
        const { game, player } = cappedBuild()
        game.addPlayer('b', 'p_gone')!.pending = 0
        player.passives[0].lv = legacyLevel
        player.choices = ['w:p_over', 'p:p_affection']
        if (saved) {
          player.married = true
          const birth = EVENTS.findIndex((event) => event.swarm === 'nightcry')
          game.state.time = EVENTS[birth].at - 0.001
          game.state.eventIndex = birth
          game.tick(0.001)
        }
        player.pending = 1
        const seq = player.choiceSeq
        runCare(game)
        const rewards = legacyLevel === MAX_PASSIVE_LEVEL ? 2 : 1
        expect(player.parentRewardPending).toBe(rewards)
        expect(player.pending).toBe(1)
        expect(player.choiceSeq).toBe(seq + (saved ? 0 : 1))
        if (saved) {
          expect(player.choices).toEqual(['f:yes', 'f:no'])
          game.setInput(player.id, { pick: 1, pickSeq: seq })
        } else {
          game.setInput(player.id, { pick: 0, pickSeq: seq })
        }
        expect(player.choices).toEqual([])
        game.tick(0.01)
        expect(player.pending).toBe(0)
        expect(player.choices).toEqual([])
        expect(player.parentRewardPending).toBe(rewards)
        for (let count = rewards; count > 0; count--) {
          game.tick(0.01)
          expect(player.choices.toSorted()).toEqual(['x:coin', 'x:meal'])
          expect(player.parentRewardPending).toBe(count - 1)
          game.choose(player, player.choices.indexOf('x:meal'))
        }
        game.gainXp(game.state.xpNext)
        game.tick(0.01)
        expect(player.pending).toBe(0)
        expect(player.choices).toEqual([])
      }
    }
  )

  test('an unchanged visible hand accepts its in-flight choice after farewell', () => {
    const game = new Game(10)
    const player = game.addPlayer('a', 'p_over')!
    game.addPlayer('b', 'p_gone')!.pending = 0
    player.choices = ['p:p_lucky']
    const seq = player.choiceSeq
    runCare(game)
    expect(player.parentDeath?.reward).toBe('none')
    expect(player.choiceSeq).toBe(seq)
    game.setInput(player.id, { pick: 0, pickSeq: seq })
    expect(passiveLevel(player, 'p_lucky')).toBe(1)
    expect(player.choices).toEqual([])
  })

  test.each(['none', 'passive'] as const)(
    'normal empty hands receive no filler after a %s farewell reward',
    (reward) => {
      const { game, player } = cappedBuild()
      if (reward === 'none') player.weapons[0].lv = 1
      else player.passives[0].lv = MAX_PASSIVE_LEVEL - 1
      runCare(game)
      expect(player.parentDeath?.reward).toBe(reward)
      expect(player.parentRewardPending).toBe(0)
      game.gainXp(game.state.xpNext)
      game.tick(0.01)
      expect(player.pending).toBe(0)
      expect(player.choices).toEqual([])
    }
  )

  test('eight players resolve individually, including downed players; absent and late parents are untouched', () => {
    const game = new Game(5)
    const players = parents.slice(0, 7).map((parent, index) => game.addPlayer(String(index), parent)!)
    const absent = game.addPlayer('gone', 'p_gone')!
    absent.pending = 0
    players.forEach((player, index) => {
      player.weapons[0].lv = index % 2 ? MAX_WEAPON_LEVEL : 1
    })
    players[1].downed = true
    players[1].hp = 0
    runCare(game)
    expect(players.map((player) => player.parentDeath?.reward)).toEqual([
      'none',
      'passive',
      'none',
      'passive',
      'none',
      'passive',
      'none'
    ])
    expect(players[1].hp).toBe(0)
    expect(absent.parentDeath).toBeUndefined()
    expect(absent.history).toEqual([])
    expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_care')).toHaveLength(1)
    game.removePlayer(players[0].id)
    const late = game.addPlayer(players[0].id, 'p_over')!
    game.tick(0.01)
    expect(late.parentDeath).toBeUndefined()
    expect(late.weapons[0].id).toBe('p_over')
    expect(late.history).toEqual([])
    const boundary = new Game(6)
    boundary.state.time = at
    boundary.state.eventIndex = care
    const joined = boundary.addPlayer('boundary', 'p_over')!
    boundary.tick(0.01)
    expect(joined.parentDeath).toBeUndefined()
  })

  test('wire rejects impossible death state and animation survives missing transient FX', () => {
    const game = new Game(7)
    const player = game.addPlayer('a', 'p_over')!
    runCare(game)
    const view = toView(game.state)
    view.fx = []
    expect(readView(view)).toBeDefined()
    const visible = view.players[0]
    expect(parentMemorialAt(visible, at - 1)).toBeUndefined()
    expect(parentMemorialAt(visible, at)?.alpha).toBe(1)
    expect(parentMemorialAt(visible, at + 3)?.rise).toBeGreaterThan(0)
    expect(parentMemorialAt(visible, at + 3)?.rewardAlpha).toBe(1)
    expect(parentMemorialAt(visible, at + 5.5)?.alpha).toBeLessThan(1)
    expect(parentMemorialAt(visible, at + 6)).toBeUndefined()
    for (const change of [{ at: at + 1 }, { at: -1 }, { x: Infinity }, { reward: 'invalid' }, { extra: 1 }]) {
      const bad = structuredClone(view)
      Object.assign(bad.players[0].parentDeath!, change)
      expect(readView(bad)).toBeUndefined()
    }
    const resurrected = structuredClone(view)
    resurrected.players[0].weapons.push(['p_over', 1, 0])
    expect(readView(resurrected)).toBeUndefined()
    const absent = structuredClone(view)
    absent.players[0].parent = 'p_gone'
    expect(readView(absent)).toBeUndefined()
    for (const legacy of Object.values(PARENT_LEGACIES))
      expect(sheet('icons')[legacy].frames[0].data.some((pixel) => pixel !== 0)).toBe(true)
    const effects = new Effects()
    effects.consume([1, FX.PARENT_DEATH, player.x, player.y, WEAPON_INDEX.get('p_over')!, 0], at, {
      local: 0,
      px: 0,
      py: 0,
      cx: 0,
      cy: 0,
      hw: 640,
      hh: 360
    })
    expect(effects.pool.items.length).toBeGreaterThan(0)
    const count = effects.pool.items.length
    effects.consume([1, FX.PARENT_DEATH, player.x, player.y, WEAPON_INDEX.get('p_over')!, 0], at, {
      local: 0,
      px: 0,
      py: 0,
      cx: 0,
      cy: 0,
      hw: 640,
      hh: 360
    })
    expect(effects.pool.items).toHaveLength(count)
  })
})
