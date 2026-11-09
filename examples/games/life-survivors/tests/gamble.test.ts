import { expect, test } from 'vitest'
import { sheet } from '../src/art/index'
import { ENEMY_BY_ID, EVENTS, TALENT_CATEGORIES, WEAPONS, WEAPON_BY_ID, WEAPON_INDEX, timeAtAge } from '../src/data'
import { Effects, PK, type FxView } from '../src/effects'
import { FX } from '../src/fx'
import { Game, playerStats, weaponStats } from '../src/game'
import { badgeBoxAt } from '../src/render'
import { SHOT_GAMBLE, readView, toView } from '../src/view'
import { GAMBLE_FORMS, gambleForm, weaponAppearance } from '../src/weapon-life'

const copiedWeapons = WEAPONS.filter(
  (def) => def.id !== 'w_gamble' && def.behavior !== 'none' && def.behavior !== 'food'
)
const fxView: FxView = { local: 0, px: 0, py: 0, cx: 0, cy: 0, hw: 640, hh: 360 }

function setup() {
  const game = new Game(17)
  const player = game.addPlayer('player', 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = [{ id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0 }]
  for (const category of TALENT_CATEGORIES) player.talents[category] = 1
  game.targetPopulation = () => 0
  game.state.eventIndex = EVENTS.length
  return { game, player, weapon: player.weapons[0] }
}

function choose(game: Game, id: string) {
  const player = game.state.players[0]
  if (!player.weapons.some((weapon) => weapon.id === id))
    player.weapons.push({ id, lv: 1, cd: 100, held: 0, damage: 0 })
  const candidates = player.weapons.filter((weapon) => copiedWeapons.some((def) => def.id === weapon.id))
  const index = candidates.findIndex((weapon) => weapon.id === id)
  expect(index).toBeGreaterThanOrEqual(0)
  Object.defineProperty(game, 'rng', { value: () => (index + 0.5) / candidates.length, configurable: true })
}

test('gambling waits for an owned attack weapon and redraws when it is lost', () => {
  const { game, player, weapon } = setup()
  game['fire'](player, weapon, weaponStats(player, weapon))
  expect(weapon.gambleWeapon).toBeUndefined()
  expect(game.state.fx.some((event) => event.type === FX.GAMBLE)).toBe(false)
  choose(game, 'w_pet')
  game['fire'](player, weapon, weaponStats(player, weapon))
  expect(weapon.gambleWeapon).toBe('w_pet')
  player.weapons = player.weapons.filter((owned) => owned.id !== 'w_pet')
  choose(game, 'w_love')
  game['fire'](player, weapon, weaponStats(player, weapon))
  expect(weapon.gambleWeapon).toBe('w_love')
})

test('gambling repeats the selected weapon before drawing again', () => {
  const { game, weapon } = setup()
  choose(game, 'w_love')
  game['fireWeapons'](0)
  expect(weapon.gambleWeapon).toBe('w_love')
  expect(game.state.fx.find((event) => event.type === FX.GAMBLE)?.b).toBe(WEAPON_INDEX.get('w_love'))
  choose(game, 'w_sns')
  game['fireWeapons'](2)
  game['fireWeapons'](2)
  expect(weapon.gambleWeapon).toBe('w_love')
  expect(game.state.fx.filter((event) => event.type === FX.GAMBLE)).toHaveLength(1)
  game['fireWeapons'](8)
  expect(weapon.gambleWeapon).toBe('w_sns')
  expect(game.state.fx.filter((event) => event.type === FX.GAMBLE)).toHaveLength(2)
})

test('snapshots carry only the currently owned gambling selection', () => {
  const { game, player, weapon } = setup()
  expect(toView(game.state).players[0].gambleWeapon).toBeUndefined()
  choose(game, 'w_love')
  game['fire'](player, weapon, weaponStats(player, weapon))
  const view = toView(game.state)
  expect(view.players[0].gambleWeapon).toBe('w_love')
  expect(readView(JSON.parse(JSON.stringify(view)))?.players[0].gambleWeapon).toBe('w_love')
  expect(readView({ ...view, players: [{ ...view.players[0], gambleWeapon: 'invalid' }] })).toBeUndefined()
  player.weapons = player.weapons.filter((owned) => owned.id !== 'w_love')
  expect(toView(game.state).players[0].gambleWeapon).toBeUndefined()
})

test.each(copiedWeapons)('gambling can activate $id with its own behavior and statistics', (def) => {
  const { game, player, weapon } = setup()
  player.still = 2
  const enemy = game.spawnEnemy('germ', player.x + 10, player.y)!
  enemy.hp = enemy.maxHp = 1_000_000
  game['buildGrid']()
  choose(game, def.id)
  game['fire'](player, weapon, weaponStats(player, weapon))
  const shot = game.state.shots.find((entry) => entry.weapon === def.id)!
  expect(shot).toBeDefined()
  expect(shot).toMatchObject({ weapon: def.id, sourceWeapon: 'w_gamble', kind: def.behavior })
  const stats = weaponStats(player, weapon, playerStats(player), def)
  expect(shot.damage).toBeCloseTo(stats.damage)
  expect(shot.maxLife).toBeCloseTo(stats.duration)
})

test('copied immediate damage belongs to gambling, including when the copied weapon is owned', () => {
  const { game, player, weapon } = setup()
  const actual = { id: 'w_sns', lv: 1, cd: 100, held: 0, damage: 0 }
  player.weapons.push(actual)
  player.talents.invest = 1.5
  player.talents.friend = 0.55
  const enemy = game.spawnEnemy('germ', player.x + 10, player.y)!
  enemy.hp = enemy.maxHp = 10_000
  game['buildGrid']()
  choose(game, 'w_sns')
  game['fire'](player, weapon, weaponStats(player, weapon))
  expect(weapon.damage).toBeGreaterThan(0)
  expect(weapon.damage).toBeCloseTo(enemy.maxHp - enemy.hp)
  expect(actual.damage).toBe(0)
  expect(game.state.shots[0].damage).toBeCloseTo(WEAPON_BY_ID.get('w_sns')!.damage * 1.5 * 0.5)
  expect(ENEMY_BY_ID.get(enemy.kind)).toBeDefined()
})

test('a real pet leaving does not remove a copied pet', () => {
  const { game, player, weapon } = setup()
  const pet = { id: 'w_pet', lv: 1, cd: 0, held: 0, damage: 0, acquiredAge: 0 }
  player.weapons.push(pet)
  choose(game, 'w_pet')
  game['fire'](player, weapon, weaponStats(player, weapon))
  game['fire'](player, pet, weaponStats(player, pet))
  expect(game.state.shots.map((shot) => shot.sourceWeapon)).toEqual(['w_gamble', 'w_pet'])
  game.state.time = timeAtAge(20) + 0.01
  game['ageWeapons']()
  expect(game.state.shots.map((shot) => shot.sourceWeapon)).toEqual(['w_gamble'])
})

test.each(GAMBLE_FORMS)('gambling becomes $name at age $age', (form) => {
  expect(gambleForm(form.age)).toBe(form)
  if (form.age > 15) expect(gambleForm(form.age - 1).key).not.toBe(form.key)
  expect(weaponAppearance('w_gamble', form.age)).toMatchObject({
    name: `ギャンブル（${form.name}）`,
    art: `w_gamble_${form.key}`
  })
  expect(sheet('icons')[`w_gamble_${form.key}`].frames[0].data.some(Boolean)).toBe(true)
  const frames = sheet('fx')[`gamble_${form.key}`].frames
  expect(frames).toHaveLength(6)
  expect(new Set(frames.map((frame) => Array.from(frame.data).join(','))).size).toBeGreaterThan(2)
  const effects = new Effects()
  const event = [1, FX.GAMBLE, 0, 0, GAMBLE_FORMS.indexOf(form), 0]
  effects.consume(event, timeAtAge(form.age) + 0.01, fxView)
  expect(effects.pool.items).toEqual([
    expect.objectContaining({ kind: PK.sprite, spr: `gamble_${form.key}`, life: 1.6 }),
    expect.objectContaining({ kind: PK.gambleResult, x: 60, y: 55, n: 0, life: 3.8 })
  ])
  effects.update(0.6)
  expect(effects.pool.items[0].age).toBeGreaterThan(0)
  effects.update(1)
  expect(effects.pool.items).toEqual([expect.objectContaining({ kind: PK.gambleResult, n: 0 })])
  effects.consume(event, timeAtAge(form.age) + 1.6, fxView)
  expect(effects.pool.items).toHaveLength(1)
  effects.update(2.3)
  expect(effects.pool.items).toHaveLength(0)
})

test('a delayed snapshot preserves the age of the gambling activation', () => {
  const { game } = setup()
  game.state.time = timeAtAge(18) - 0.01
  choose(game, 'w_love')
  game['fireWeapons'](0)
  const view = toView(game.state)
  const effects = new Effects()
  effects.consume(view.fx, timeAtAge(18) + 0.01, fxView)
  expect(effects.pool.items.some((particle) => particle.spr === 'gamble_gacha')).toBe(true)
})

test('copied shots and gambling fire events survive a multiplayer snapshot', () => {
  const { game, player } = setup()
  game.state.time = timeAtAge(18) + 0.01
  choose(game, 'w_love')
  game['fireWeapons'](0)
  const view = toView(game.state)
  expect(readView(JSON.parse(JSON.stringify(view)))).toBeDefined()
  expect(view.shots[0]).toBe(WEAPON_INDEX.get('w_love'))
  expect(view.shots[7]).toBeGreaterThanOrEqual(SHOT_GAMBLE)
  expect(view.fx).toContain(WEAPON_INDEX.get('w_gamble'))
  expect(view.fx).toContain(FX.GAMBLE)
  expect(game.state.shots.every((shot) => shot.owner === player.id && shot.sourceWeapon === 'w_gamble')).toBe(true)
})

/** 過保護親 of one source: her own skill or gambling's copy. */
const guardiansFrom = (game: Game, source: string) =>
  game.state.shots.filter((shot) => shot.weapon === 'p_over' && shot.sourceWeapon === source)

test('gambling never stacks more copied 過保護親 than its amount, however often it fires', () => {
  for (const [gambleLv, overLv] of [
    [1, 1],
    [4, 4],
    [7, 8]
  ]) {
    const { game, player, weapon } = setup()
    weapon.lv = gambleLv
    choose(game, 'p_over')
    player.weapons.find((owned) => owned.id === 'p_over')!.lv = overLv
    const ws = weaponStats(player, weapon, playerStats(player), WEAPON_BY_ID.get('p_over'))
    for (let k = 0; k < 8; k++) game['fire'](player, weapon, weaponStats(player, weapon))
    expect(guardiansFrom(game, 'w_gamble')).toHaveLength(ws.amount)
  }
})

test("copied 過保護親 stand one slot further out than the player's own, never on them", () => {
  for (const overLv of [1, 4, 8]) {
    const { game, player, weapon } = setup()
    weapon.lv = 4
    choose(game, 'p_over')
    const own = player.weapons.find((owned) => owned.id === 'p_over')!
    own.lv = overLv
    own.cd = 0
    game['fireWeapons'](0)
    game['fire'](player, weapon, weaponStats(player, weapon))
    const mine = guardiansFrom(game, 'p_over').map((shot) => shot.h)
    const copies = guardiansFrom(game, 'w_gamble').map((shot) => shot.h)
    expect(mine).toEqual(overLv >= 4 ? [-0.5, 0.5] : [0])
    expect(copies.length).toBeGreaterThan(0)
    for (const h of copies) {
      expect(Math.abs(h)).toBeGreaterThanOrEqual(1)
      for (const m of mine) expect(Math.abs(h - m)).toBeGreaterThanOrEqual(1)
    }
    if (copies.length === 2) expect(copies).toEqual([-1.5, 1.5])
  }
})

test('copied 過保護親 keep 20 px clear of her own whatever the levels, walking any way, standing or turning', () => {
  const step = 1 / 60
  const directions = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4)
  // Each motion: seconds to run and the stick at time t (undefined: standing still).
  const motions: [string, number, (t: number) => { x: number; y: number }][] = [
    ...directions.map((angle): [string, number, (t: number) => { x: number; y: number }] => [
      `walk ${Math.round((angle * 180) / Math.PI)}°`,
      2,
      () => ({ x: Math.cos(angle), y: Math.sin(angle) })
    ]),
    ['still', 2, () => ({ x: 0, y: 0 })],
    // A full turn of the stick at 90°/s.
    [
      'turn',
      4,
      (t) => ({ x: Math.cos(-Math.PI / 2 + (t * Math.PI) / 2), y: Math.sin(-Math.PI / 2 + (t * Math.PI) / 2) })
    ]
  ]
  let worst = Infinity
  for (let overLv = 1; overLv <= 8; overLv++)
    for (let gambleLv = 1; gambleLv <= 8; gambleLv++) {
      const { game, player, weapon } = setup()
      weapon.lv = gambleLv
      const random = game['rng']
      choose(game, 'p_over')
      const own = player.weapons.find((owned) => owned.id === 'p_over')!
      own.lv = overLv
      // The copies come first in the list, so they keep clear of parents not yet moved this step.
      game['fire'](player, weapon, weaponStats(player, weapon))
      Object.defineProperty(game, 'rng', { value: random, configurable: true })
      weapon.cd = Infinity
      own.cd = 0
      game['fireWeapons'](0)
      const mine = guardiansFrom(game, 'p_over')
      const copies = guardiansFrom(game, 'w_gamble')
      expect(mine.length).toBeGreaterThan(0)
      expect(copies.length).toBeGreaterThan(0)
      for (const copy of copies) copy.life = copy.maxLife = Infinity
      for (const [name, seconds, stick] of motions) {
        const frames = Math.round(seconds / step)
        for (let frame = 0; frame < frames; frame++) {
          game.setInput(player.id, stick(frame * step))
          game.tick(step)
          if (frame < frames - 30) continue
          expect(game.state.shots).toEqual(expect.arrayContaining([...mine, ...copies]))
          for (const copy of copies)
            for (const parent of [...mine, ...copies.filter((other) => other !== copy)]) {
              const distance = Math.hypot(copy.x - parent.x, copy.y - parent.y)
              worst = Math.min(worst, distance)
              expect(distance, `過保護 Lv${overLv} × gamble Lv${gambleLv}, ${name}`).toBeGreaterThanOrEqual(20)
            }
        }
      }
    }
  expect(worst).toBeLessThan(23)
})

test('the one copy beside a lone 過保護親 walking up stands further out on her side, the other shoulder left free', () => {
  const step = 1 / 60
  for (let overLv = 1; overLv <= 3; overLv++)
    for (let gambleLv = 1; gambleLv <= 3; gambleLv++)
      for (const from of [1, -1]) {
        const { game, player, weapon } = setup()
        weapon.lv = gambleLv
        const random = game['rng']
        choose(game, 'p_over')
        const own = player.weapons.find((owned) => owned.id === 'p_over')!
        own.lv = overLv
        game['fire'](player, weapon, weaponStats(player, weapon))
        Object.defineProperty(game, 'rng', { value: random, configurable: true })
        weapon.cd = Infinity
        own.cd = 0
        game['fireWeapons'](0)
        const [mine] = guardiansFrom(game, 'p_over')
        const copies = guardiansFrom(game, 'w_gamble')
        expect(guardiansFrom(game, 'p_over')).toHaveLength(1)
        expect(copies).toHaveLength(1)
        const [copy] = copies
        copy.life = copy.maxLife = Infinity
        const label = `過保護 Lv${overLv} × gamble Lv${gambleLv}, up after facing ${from > 0 ? 'right' : 'left'}`
        game.setInput(player.id, { x: from, y: 0 })
        for (let frame = 0; frame < 60; frame++) game.tick(step)
        game.setInput(player.id, { x: 0, y: -1 })
        for (let frame = 0; frame < 120; frame++) {
          game.tick(step)
          if (frame < 90) continue
          const parent = { x: mine.x - player.x, y: mine.y - player.y }
          const twin = { x: copy.x - player.x, y: copy.y - player.y }
          // Both on the side she last faced, the copy further out.
          expect(Math.sign(parent.x), label).toBe(from)
          expect(twin.x * from, label).toBeGreaterThan(parent.x * from)
          expect(Math.hypot(twin.x - parent.x, twin.y - parent.y), label).toBeGreaterThanOrEqual(20)
          // The badge box over the other shoulder is clear of both.
          const free = badgeBoxAt(-from, 1)
          for (const at of [parent, twin]) {
            const clear =
              at.x + 12 <= free.left || at.x - 12 >= free.right || at.y + 12 <= free.top || at.y - 12 >= free.bottom
            expect(clear, `${label}: ${at.x.toFixed(0)},${at.y.toFixed(0)}`).toBe(true)
          }
        }
        // Crossing over to the other shoulder (and on round to walking the other way) she moves without a jump.
        let last = { x: copy.x - player.x, y: copy.y - player.y }
        for (const stick of [
          { x: -from * 0.5, y: -1 },
          { x: -from, y: 0 }
        ]) {
          game.setInput(player.id, stick)
          for (let frame = 0; frame < 60; frame++) {
            game.tick(step)
            const at = { x: copy.x - player.x, y: copy.y - player.y }
            expect(Math.hypot(at.x - last.x, at.y - last.y), label).toBeLessThanOrEqual(15.01)
            last = at
          }
        }
      }
})
