import { describe, expect, test } from 'vitest'
import {
  PARENTS,
  PASSIVES,
  PASSIVE_BY_ID,
  PASSIVE_SLOTS,
  PEOPLE_FEAR,
  TALENT_CATEGORIES,
  TALENT_WEAPONS,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_INDEX,
  WEAPON_LEVELS,
  WEAPON_SLOTS,
  ageAt,
  timeAtAge
} from '../src/data'
import { Game, RAID, choiceText, playerStats, raidReach, weaponSlots, weaponStats } from '../src/game'
import { FX } from '../src/fx'
import { GUARDIAN_BODY, boxAbout, boxesOverlap, overheadBoxes } from '../src/overhead'
import { readView, toView } from '../src/view'
import { botInput } from './bot'

const early = new Set(TALENT_WEAPONS.filter((def) => def.minAge <= 6).map((def) => def.id))

test.each([1, 2, 3, 4, 5, 6, 7, 8])('weak parent fires one hand per level at level %i', (lv) => {
  const game = new Game(1)
  const player = game.addPlayer('a', 'p_weak')!
  const weapon = player.weapons[0]
  weapon.lv = lv
  const stats = weaponStats(player, weapon)
  expect(stats.amount).toBe(lv)
  game['fire'](player, weapon, stats)
  expect(game.state.shots).toHaveLength(lv)
  if (lv < 8) expect(choiceText(player, 'w:p_weak').text).toContain('数 +1')
})

test('頼りない親 grants defense alongside its experience bonus', () => {
  const game = new Game(1)
  const player = game.addPlayer('a', 'p_weak')!
  expect(playerStats(player).armor).toBe(1)
  expect(playerStats(player).xpGain).toBe(1.25)
  player.talents.sports = 1
  player.passives.push({ id: 'p_stubborn', lv: 1 })
  expect(playerStats(player).armor).toBe(2)
})

test.each([1, 4, 8])('weak parent scales only attack length with area at level %i', (lv) => {
  const game = new Game(1)
  const player = game.addPlayer('a', 'p_weak')!
  const weapon = player.weapons[0]
  weapon.lv = lv
  const def = WEAPONS.find(({ id }) => id === weapon.id)!
  for (const passives of [
    [],
    [{ id: 'p_kind', lv: 5 }],
    [
      { id: 'p_kind', lv: 5 },
      { id: 'p_cautious', lv: 5 }
    ]
  ]) {
    player.passives = passives
    game.state.shots = []
    const stats = weaponStats(player, weapon)
    game['fire'](player, weapon, stats)
    expect(game.state.shots).toHaveLength(stats.amount)
    for (const shot of game.state.shots) {
      expect(shot.h).toBe(22)
      expect(shot.w).toBeCloseTo((def.area * stats.area) / 2)
      expect(shot.r).toBeCloseTo(shot.w)
      expect(shot.x - player.x).toBeCloseTo(Math.cos(shot.angle) * shot.w)
      expect(shot.y - player.y).toBeCloseTo(Math.sin(shot.angle) * shot.w)
    }
  }
})

test.each([
  ['w_study', 3],
  ['w_reading', 5],
  ['w_hobby', 8]
] as const)('%s becomes available at age %i', (id, age) => {
  const game = new Game(1)
  const player = game.addPlayer('a', 'p_edu')!
  game.state.time = timeAtAge(age - 0.01)
  expect(game.options(player)).not.toContain(`w:${id}`)
  game.state.time = timeAtAge(age + 0.01)
  expect(game.options(player)).toContain(`w:${id}`)
})

describe('毒親: 18歳まで親を含めて手札3枠', () => {
  test('two talents plus the parent block new weapons before 18 but still allow upgrades and passives', () => {
    const game = new Game(1)
    const player = game.addPlayer('a', 'p_toxic')!
    const talents = TALENT_WEAPONS.filter((def) => def.minAge <= 6).slice(0, 2)
    for (const def of talents) player.weapons.push({ id: def.id, lv: 1, cd: 0 })
    while (ageAt(game.state.time) < 18) game.state.time += 0.1
    game.state.time -= 0.1
    const options = game.options(player)
    expect(player.weapons).toHaveLength(3)
    expect(weaponSlots(player, 17)).toBe(2)
    expect(options.filter((choice) => choice.startsWith('w:')).sort()).toEqual(
      player.weapons.map((weapon) => `w:${weapon.id}`).sort()
    )
    expect(options.some((choice) => choice.startsWith('p:'))).toBe(true)
    player.weapons.pop()
    expect(game.options(player).some((choice) => choice.startsWith('w:') && !options.includes(choice))).toBe(true)
  })

  test('the normal six slots return at 18 and fill up normally', () => {
    const game = new Game(1)
    const player = game.addPlayer('a', 'p_toxic')!
    const talents = TALENT_WEAPONS.filter((def) => def.minAge <= 18)
    for (const def of talents.slice(0, 2)) player.weapons.push({ id: def.id, lv: 1, cd: 0 })
    while (ageAt(game.state.time) < 18) game.state.time += 0.1
    expect(weaponSlots(player, 18)).toBe(WEAPON_SLOTS)
    expect(game.options(player)).toContain(`w:${talents[2].id}`)
    for (const def of talents.slice(2, WEAPON_SLOTS)) player.weapons.push({ id: def.id, lv: 1, cd: 0 })
    expect(game.options(player)).not.toContain(`w:${talents[WEAPON_SLOTS].id}`)
  })

  test.each([
    [17, 1],
    [18, 0]
  ])('at age %i, two talents plus the parent grant %i level-five swaps', (age, swaps) => {
    const game = new Game(1)
    const player = game.addPlayer('a', 'p_toxic')!
    for (const def of TALENT_WEAPONS.filter((def) => def.minAge <= 6).slice(0, 2))
      player.weapons.push({ id: def.id, lv: 1, cd: 0 })
    while (ageAt(game.state.time) < age) game.state.time += 0.1
    game.state.level = 4
    game.gainXp(game.state.xpNext)
    expect(player.swapPending).toBe(swaps)
  })

  test('other parents keep their normal slots at every age', () => {
    for (const parent of PARENTS.filter((def) => def.id !== 'p_toxic')) {
      const game = new Game(1)
      const player = game.addPlayer('a', parent.id)!
      for (const age of [0, 17, 18, 80])
        expect(weaponSlots(player, age)).toBe(WEAPON_SLOTS + (parent.id === 'p_free' ? 1 : 0))
    }
  })
})

describe('過保護: 攻撃と防御を兼ねる盾', () => {
  /** A walking (→) owner with both guardians ahead; pass false for a child standing still. */
  function guarded(walking = true) {
    const game = new Game(71)
    const player = game.addPlayer('a', 'p_over')!
    game.targetPopulation = () => 0
    player.weapons[0].lv = 4
    player.weapons[0].cd = 0
    if (walking) game.setInput(player.id, { x: 1, y: 0 })
    game.tick(1 / 60)
    return { game, player }
  }

  test('guardians keep their distance and move smoothly around a turning player', () => {
    const { game, player } = guarded()
    const shield = game.state.shots[0]
    const heading = shield.guardianHeading!
    expect(Math.hypot(shield.x - player.x, shield.y - player.y)).toBeGreaterThan(shield.orbit * 0.65)
    player.fx = -Math.cos(heading)
    player.fy = -Math.sin(heading)
    const start = { x: shield.x, y: shield.y }
    game['moveGuardian'](shield, player, 1 / 60)
    expect(Math.hypot(shield.x - start.x, shield.y - start.y)).toBeLessThan(shield.orbit * 0.3)
    expect(Math.abs(shield.guardianHeading! - heading)).toBeGreaterThan(0)
    for (let step = 0; step < 120; step++) game['moveGuardian'](shield, player, 1 / 60)
    expect(Math.cos(shield.guardianHeading!)).toBeCloseTo(player.fx, 3)
    expect(Math.sin(shield.guardianHeading!)).toBeCloseTo(player.fy, 3)
  })

  test('guardians turn and attack enemies overlapping a nearby ally', () => {
    const { game, player } = guarded()
    const shield = game.state.shots[0]
    const ally = game.addPlayer('ally', 'p_edu')!
    ally.x = player.x - 10
    ally.y = player.y
    const enemy = game.spawnEnemy('germ', ally.x, ally.y)!
    enemy.hp = enemy.maxHp = 1000
    shield.aux = 0
    game['buildGrid']()
    game['moveGuardian'](shield, player, 0)
    expect(enemy.hp).toBeLessThan(1000)
    expect(Math.cos(shield.angle)).toBeCloseTo(
      (enemy.x - shield.x) / Math.hypot(enemy.x - shield.x, enemy.y - shield.y)
    )
  })

  test('walking guardians also bash an enemy right behind the child', () => {
    const { game, player } = guarded()
    const shield = game.state.shots[0]
    const enemy = game.spawnEnemy('germ', player.x - 30, player.y)!
    enemy.hp = enemy.maxHp = 1000
    shield.aux = 0
    game['buildGrid']()
    game['moveGuardian'](shield, player, 0)
    expect(enemy.hp).toBeLessThan(1000)
  })

  test('every level widens the guardian reach and speeds up its bash', () => {
    const { game, player } = guarded()
    const weapon = player.weapons[0]
    let previous: { area: number; tick: number } | undefined
    for (let level = 1; level <= 8; level++) {
      weapon.lv = level
      weapon.cd = 1
      game.tick(0)
      const shield = game.state.shots[0]
      const current = { area: weaponStats(player, weapon).area, tick: shield.tick }
      expect(shield.orbit).toBeCloseTo(WEAPON_BY_ID.get('p_over')!.area * current.area)
      if (previous) {
        expect(current.area, `Lv${level}`).toBeGreaterThan(previous.area)
        expect(current.tick, `Lv${level}`).toBeLessThan(previous.tick)
      }
      previous = current
    }
  })

  test.each([1, 2, 3, 4, 5, 8])('level %i controls guardian count independently of bonuses', (level) => {
    const { player } = guarded()
    player.weapons[0].lv = level
    player.passives = [{ id: 'p_curious', lv: 5 }]
    expect(weaponStats(player, player.weapons[0]).amount).toBe(level >= 4 ? 2 : 1)
  })

  test('a shield intercepts a projectile without granting invulnerability', () => {
    const { game, player } = guarded()
    const shield = game.state.shots[0]
    const bullet = (x: number, y: number) =>
      game.state.bullets.push({
        x,
        y,
        vx: 0,
        vy: 0,
        r: 7,
        damage: 20,
        life: 2,
        kind: 0,
        src: 'germ'
      })
    expect(game.state.shots).toHaveLength(2)
    bullet(shield.x + 7, shield.y + 3)
    game.tick(1 / 60)
    expect(player.hp).toBe(player.maxHp)
    expect(player.invuln).toBe(0)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(1)
    expect(game.state.shots).toHaveLength(2)
    const view = toView(game.state)
    expect(view.v).toBe(17)
    expect(view.shots[7]).toBe(1)
    expect(readView(JSON.parse(JSON.stringify(view)))).toBeTruthy()
    expect(game.state.bullets).toEqual([])
    expect(game.state.fx.some((event) => event.type === FX.HURT || event.type === FX.DOWN)).toBe(false)
    bullet(player.x, player.y)
    game.tick(1 / 60)
    expect(player.hp).toBe(player.maxHp - 19)
  })

  test('the enlarged shield intercepts projectiles at its thrust position', () => {
    const { game, player } = guarded()
    player.talents.friend = 1
    player.passives = [{ id: 'p_kind', lv: 5 }]
    game.tick(0)
    const shield = game.state.shots[0]
    shield.angle = 0
    shield.aux = shield.tick / 2
    game.state.bullets.push({
      x: shield.x + 14 * (shield.r / 20) + 14,
      y: shield.y + 3 * (shield.r / 20),
      vx: 0,
      vy: 0,
      r: 1,
      damage: 20,
      life: 2,
      kind: 0,
      src: 'germ'
    })
    game.tick(0)
    expect(game.state.bullets).toEqual([])
    expect(shield.v).toBe(1)
    expect(player.shieldRecovery).toBe(1.5)
  })

  test.each(['germ', 'b_hs'])('blocks %s contact, including a lethal hit, without draining both shields', (kind) => {
    const { game, player } = guarded()
    player.hp = 0.01
    game.spawnEnemy(kind, player.x, player.y)
    game.tick(1 / 60)
    expect(player.hp).toBe(0.01)
    expect(player.downed).toBe(false)
    expect(player.invuln).toBe(0)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(1)
    game.state.enemies = []
    game.spawnEnemy(kind, player.x, player.y)
    game.tick(1 / 60)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(1)
    expect(player.hp).toBeLessThan(0.01)
  })

  test('overprotective parents do not reduce movement speed', () => {
    const { player } = guarded()
    const other = new Game(71).addPlayer('b', 'p_edu')!
    expect(playerStats(player).speed).toBe(playerStats(other).speed)
    player.passives = other.passives = [
      { id: 'p_healthy', lv: 2 },
      { id: 'p_small', lv: 1 }
    ]
    expect(playerStats(player).speed).toBe(playerStats(other).speed)
  })

  test.each([1, -1])('only enemies overlapping the visible shield are hit (%i)', (side) => {
    const { game, player } = guarded()
    const shield = game.state.shots[0]
    game.setInput(player.id, { x: side, y: 0 })
    game.tick(0)
    const behind = game.spawnEnemy('germ', shield.x - side * 25, shield.y)!
    const inFront = game.spawnEnemy('germ', shield.x + side * 20, shield.y)!
    for (const enemy of [behind, inFront]) enemy.hp = enemy.maxHp = 1000
    game['buildGrid']()
    game['moveGuardian'](shield, player, 0)
    expect(behind.hp).toBe(1000)
    expect(inFront.hp).toBeLessThan(1000)
  })

  test.each([1, -1])('a spent shield damages and knocks away enemies on contact (%i)', (side) => {
    const { game, player } = guarded()
    const first = game.state.shots[0]
    game.state.bullets.push({
      x: first.x + 7,
      y: first.y + 3,
      vx: 0,
      vy: 0,
      r: 7,
      damage: 20,
      life: 2,
      kind: 0,
      src: 'germ'
    })
    game.tick(1 / 60)
    const shield = game.state.shots.find((shot) => shot.v === 1)!
    game.state.shots = [shield]
    game.setInput(player.id, { x: side, y: 0 })
    game.tick(0)
    shield.guardianHeading = Math.atan2(player.fy, player.fx)
    shield.aux = 0
    game.tick(0)
    for (const other of game.state.shots) if (other !== shield) other.aux = 100
    const enemy = game.spawnEnemy('germ', shield.x + side * 10, shield.y)!
    enemy.hp = enemy.maxHp = 1000
    enemy.elite = false
    for (let frame = 0; frame < 60 && enemy.hp === enemy.maxHp; frame++) game.tick(1 / 60)
    expect(enemy.kx * side).toBeGreaterThan(0)
    expect(enemy.hp).toBeLessThan(1000)
    expect(player.weapons[0].damage).toBeGreaterThan(0)
    expect(Math.cos(shield.angle) * side).toBeGreaterThan(0)
    expect(shield.v).toBe(1)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
  })

  test('a nearby enemy does not make a shield leave its position', () => {
    const { game, player } = guarded()
    const shield = game.state.shots[0]
    game.state.shots = [shield]
    const startX = shield.x - player.x
    const startY = shield.y - player.y
    const enemy = game.spawnEnemy('germ', player.x + 200, player.y)!
    enemy.hp = enemy.maxHp = 1000
    for (let frame = 0; frame < 10; frame++) game.tick(1 / 60)
    expect(shield.x - player.x).toBeCloseTo(startX)
    expect(shield.y - player.y).toBeCloseTo(startY)
    expect(enemy.hp).toBe(enemy.maxHp)
  })

  test('guards stay near their owner instead of pursuing distant enemies, then return to their posts', () => {
    const { game, player } = guarded()
    const shield = game.state.shots[0]
    game.state.shots = [shield]
    const distant = game.spawnEnemy('germ', player.x + 250, player.y)!
    shield.aux = 0
    game.tick(1 / 60)
    expect(shield.target).toBeUndefined()
    expect(distant.hp).toBe(distant.maxHp)
    game.state.enemies = []
    shield.x = player.x + 80
    shield.y = player.y + 30
    shield.aux = 0
    game.tick(1 / 60)
    expect(shield.x - player.x).toBeCloseTo(shield.orbit * 0.65)
    expect(shield.y - player.y).toBeCloseTo(shield.h * shield.r * 1.5)
  })

  test('each bash hits only one enemy until its motion finishes', () => {
    const { game, player } = guarded()
    const shield = game.state.shots[0]
    game.state.shots[1].aux = 100
    const first = game.spawnEnemy('germ', shield.x + 5, shield.y)!
    const second = game.spawnEnemy('germ', shield.x + 10, shield.y)!
    first.hp = first.maxHp = second.hp = second.maxHp = 1000
    first.elite = second.elite = false
    game.tick(0)
    expect(first.hp).toBeLessThan(first.maxHp)
    expect(second.hp).toBe(second.maxHp)
    expect(shield.aux).toBe(shield.tick)
    expect(
      game.state.fx.filter((event) => event.type === FX.FIRE && event.a === WEAPON_INDEX.get('p_over'))
    ).toHaveLength(1)
    const attacking = readView(JSON.parse(JSON.stringify(toView(game.state))))!
    expect(attacking.shots[7]).toBeGreaterThanOrEqual(2)
    game.state.enemies = [second]
    game.tick(shield.tick / 2)
    expect(second.hp).toBe(second.maxHp)
    game.tick(shield.tick)
    expect(second.hp).toBeLessThan(second.maxHp)
  })

  test('an enemy overlapping the owner is attacked even away from the shield', () => {
    const { game, player } = guarded()
    game.state.shots[1].aux = 100
    const enemy = game.spawnEnemy('germ', player.x, player.y)!
    enemy.hp = enemy.maxHp = 1000
    enemy.elite = false
    game.tick(0)
    expect(enemy.hp).toBeLessThan(enemy.maxHp)
  })

  test('guards keep formation around each moving owner, including after they stop', () => {
    const { game, player } = guarded()
    const other = game.addPlayer('b', 'p_over')!
    other.weapons[0].lv = 4
    other.x += 300
    for (const [x, y] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1]
    ]) {
      game.setInput(player.id, { x, y })
      game.setInput(other.id, { x: -x, y: -y })
      game.tick(1 / 60)
      for (const owner of [player, other]) {
        const guards = game.state.shots.filter((shot) => shot.owner === owner.id)
        expect(guards).toHaveLength(2)
        // Facing up the screen they go to the shoulder instead (see companion-overhead.test.ts): fully up, clear of
        // what is drawn over the child's head.
        const facing = Math.sin(guards[0].guardianHeading!)
        if (facing <= -0.65)
          for (const guard of guards)
            for (const box of overheadBoxes(1))
              expect(boxesOverlap(boxAbout(guard.x - owner.x, guard.y - owner.y, GUARDIAN_BODY), box)).toBe(false)
        if (facing < 0) continue
        for (const guard of guards)
          expect(
            (guard.x - owner.x) * Math.cos(guard.guardianHeading!) +
              (guard.y - owner.y) * Math.sin(guard.guardianHeading!)
          ).toBeCloseTo(guard.orbit * 0.65)
        const offsets = guards.map(
          (guard) =>
            -(guard.x - owner.x) * Math.sin(guard.guardianHeading!) +
            (guard.y - owner.y) * Math.cos(guard.guardianHeading!)
        )
        expect(offsets[0]).toBeLessThan(0)
        expect(offsets[1]).toBeGreaterThan(0)
      }
      expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
    }
    game.setInput(player.id, { x: 0, y: 0 })
    for (let frame = 0; frame < 120; frame++) game.tick(1 / 60)
    expect(player.fx).toBeCloseTo(-Math.SQRT1_2)
    expect(player.fy).toBeCloseTo(-Math.SQRT1_2)
    const stopped = game.state.shots.filter((shot) => shot.owner === player.id)
    for (const guard of stopped) {
      expect(guard.guardianStill).toBe(1)
      // Beside the child, not hidden behind her, and close by.
      expect(Math.abs(guard.x - player.x)).toBeGreaterThanOrEqual(20)
      expect(Math.hypot(guard.x - player.x, guard.y - player.y)).toBeLessThan(guard.orbit * 0.65)
    }
    // In a row on the shoulder (left) they walked up at, the first nearest the child, apart.
    expect(stopped[0].x).toBeGreaterThan(stopped[1].x)
    expect(stopped[0].x).toBeLessThan(player.x)
    expect(Math.hypot(stopped[0].x - stopped[1].x, stopped[0].y - stopped[1].y)).toBeGreaterThanOrEqual(20)
    for (const guard of game.state.shots.filter((shot) => shot.owner === other.id))
      expect((guard.x - other.x) * other.fx + (guard.y - other.y) * other.fy).toBeCloseTo(guard.orbit * 0.65)
  })

  test('a still child is guarded from every side, and the parents step ahead again once they walk', () => {
    const { game, player } = guarded(false)
    const guards = game.state.shots.filter((shot) => shot.owner === player.id)
    expect(guards).toHaveLength(2)
    for (const guard of guards) {
      expect(guard.guardianStill).toBe(1)
      expect(guard.y).toBeLessThan(player.y)
      expect(Math.hypot(guard.x - player.x, guard.y - player.y)).toBeLessThan(guard.orbit * 0.65)
    }
    const reach = guards[0].orbit * 0.65
    for (const [x, y] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [-Math.SQRT1_2, Math.SQRT1_2]
    ]) {
      game.state.enemies = []
      for (const guard of guards) guard.aux = 0
      const enemy = game.spawnEnemy('germ', player.x + x * reach, player.y + y * reach)!
      enemy.hp = enemy.maxHp = 1000
      enemy.elite = false
      game.tick(0)
      expect(enemy.hp).toBeLessThan(1000)
      expect(enemy.kx * x + enemy.ky * y).toBeGreaterThan(0)
    }
    game.state.enemies = []
    for (const guard of guards) guard.aux = 0
    const bullet = { x: player.x - reach, y: player.y, vx: 0, vy: 0, r: 4, damage: 20, life: 2, kind: 0, src: 'germ' }
    game.state.bullets.push(bullet)
    game.tick(0)
    expect(game.state.bullets).toEqual([])
    expect(player.hp).toBe(player.maxHp)
    const far = game.spawnEnemy('germ', player.x - reach * 2, player.y)!
    game.tick(0)
    expect(far.hp).toBe(far.maxHp)
    game.state.enemies = []
    game.setInput(player.id, { x: 0, y: -1 })
    for (let frame = 0; frame < 120; frame++) game.tick(1 / 60)
    // Walking up they go to her shoulder, clear of what is drawn over her head.
    for (const guard of guards) {
      expect(guard.guardianStill).toBe(0)
      expect(guard.y).toBeLessThan(player.y)
      for (const box of overheadBoxes(1))
        expect(boxesOverlap(boxAbout(guard.x - player.x, guard.y - player.y, GUARDIAN_BODY), box)).toBe(false)
    }
  })

  test('guards are permanent, replenish at a fixed interval and ignore cooldown reductions', () => {
    const { game, player } = guarded()
    const original = [...game.state.shots]
    player.passives = ['p_diligent', 'p_clever', 'p_curious'].map((id) => ({ id, lv: 5 }))
    for (let level = 1; level <= 8; level++) {
      player.weapons[0].lv = level
      expect(weaponStats(player, player.weapons[0]).cooldown).toBe(3.6)
    }
    player.weapons[0].lv = 4
    original[0].v = 1
    player.weapons[0].cd = 0.1
    game.tick(0.2)
    expect(original[0].v).toBe(0)
    for (let frame = 0; frame < 360; frame++) game.tick(1 / 60)
    expect(game.state.shots.slice(0, original.length)).toEqual(original)
    expect(game.state.shots).toHaveLength(weaponStats(player, player.weapons[0]).amount)
    expect(game.state.shots.every((shot) => shot.life === shot.maxLife)).toBe(true)
  })

  test('copied shields remain temporary and serialize their bash and spent state', () => {
    const { game, player } = guarded()
    const gamble = { id: 'w_gamble', lv: 1, cd: 100, held: 0, damage: 0 }
    player.weapons.push(gamble)
    const def = WEAPONS.find((weapon) => weapon.id === 'p_over')!
    game['fire'](player, gamble, weaponStats(player, gamble, playerStats(player), def), def)
    const copy = game.state.shots.find((shot) => shot.sourceWeapon === 'w_gamble')!
    copy.aux = copy.tick * 0.001
    copy.v = 1
    const view = readView(JSON.parse(JSON.stringify(toView(game.state))))!
    expect(view.shots[game.state.shots.indexOf(copy) * 8 + 7]).toBe(95)
    const life = copy.life
    game.tick(0.1)
    expect(copy.life).toBeLessThan(life)
  })

  test('each level speeds up bashes and the highest level hits more often', () => {
    const periods: number[] = []
    const attacks: number[] = []
    for (let level = 1; level <= 8; level++) {
      const { game, player } = guarded()
      player.weapons[0].lv = level
      game.tick(0)
      const [guard, ...others] = game.state.shots
      for (const other of others) other.aux = 100
      const enemy = game.spawnEnemy('germ', guard.x, guard.y)!
      enemy.hp = enemy.maxHp = 1e9
      enemy.elite = false
      let count = 0
      for (let frame = 0; frame < 120; frame++) {
        enemy.x = guard.x
        enemy.y = guard.y
        enemy.kx = enemy.ky = 0
        const before = guard.aux
        game.tick(1 / 60)
        if (guard.aux > before) count++
      }
      periods.push(guard.tick)
      attacks.push(count)
      if (level > 1) expect(periods[level - 1]).toBeLessThan(periods[level - 2])
    }
    expect(periods[0]).toBeCloseTo(0.35)
    expect(attacks[7]).toBeGreaterThan(attacks[0])
  })

  test('area upgrades expand vertical as well as horizontal shield reach', () => {
    function hit(withArea: boolean, vertical: boolean) {
      const { game, player } = guarded()
      player.talents.friend = 1
      if (withArea) player.passives = [{ id: 'p_kind', lv: 5 }]
      game.tick(0)
      const [guard, other] = [...game.state.shots].sort((a, b) => b.y - a.y)
      other.aux = 100
      // Lv2 and Lv3 already widen the shield before the Lv4 pair arrives.
      const grown = WEAPON_LEVELS.p_over.slice(0, 2).reduce((value, upgrade) => value * (upgrade.area ?? 1), 1)
      const enemy = game.spawnEnemy(
        'germ',
        guard.x + (vertical ? 0 : 33 * grown),
        guard.y + (vertical ? 30 * grown : 0)
      )!
      enemy.hp = enemy.maxHp = 1000
      enemy.elite = false
      game.tick(0)
      return enemy.hp < enemy.maxHp
    }
    for (const vertical of [false, true]) {
      expect(hit(false, vertical)).toBe(false)
      expect(hit(true, vertical)).toBe(true)
    }
  })

  test('an unguarded boss hit retains its existing 0.6 second grace', () => {
    const { game, player } = guarded()
    game.state.shots = []
    game.spawnEnemy('b_hs', player.x, player.y)
    game.tick(1 / 60)
    expect(player.hp).toBeLessThan(player.maxHp)
    expect(player.invuln).toBe(0.6)
  })

  test('another player cannot use these shields and expired shields cannot block', () => {
    const { game, player } = guarded()
    const other = game.addPlayer('b', 'p_over')!
    other.weapons = []
    game.spawnEnemy('germ', other.x, other.y)
    game.tick(1 / 60)
    expect(other.hp).toBeLessThan(other.maxHp)
    expect(player.hp).toBe(player.maxHp)
    expect(game.state.shots).toHaveLength(2)
    game.state.enemies = []
    player.weapons = []
    for (const shot of game.state.shots) shot.life = 0
    game.spawnEnemy('germ', player.x, player.y)
    game.tick(1 / 60)
    expect(player.hp).toBeLessThan(player.maxHp)
  })

  test.each(['bullet', 'germ', 'b_hs'])(
    'Lv8 with maximum defense passives cannot chain immunity against continuous %s attacks',
    (attack) => {
      const { game, player } = guarded()
      player.weapons[0].lv = 8
      player.weapons[0].cd = 0
      player.passives = ['p_diligent', 'p_clever', 'p_curious'].map((id) => ({ id, lv: 5 }))
      for (const category of TALENT_CATEGORIES) player.talents[category] = 1.7
      const damageWindows = Array(10).fill(0)
      const blocks: number[] = []
      for (let frame = 0; frame < 1800; frame++) {
        player.hp = player.maxHp
        game.state.enemies = []
        if (attack === 'bullet') {
          game.state.bullets = [
            { x: player.x, y: player.y, vx: 0, vy: 0, r: 7, damage: 20, life: 2, kind: 0, src: 'germ' }
          ]
          const shield = game.state.shots.find((shot) => shot.v === 0)
          if (shield)
            game.state.bullets.unshift({
              x: shield.x + (Math.cos(shield.angle) < 0 ? -7 : 7),
              y: shield.y + 3,
              vx: 0,
              vy: 0,
              r: 7,
              damage: 20,
              life: 2,
              kind: 0,
              src: 'germ'
            })
        } else {
          const enemy = game.spawnEnemy(attack, player.x, player.y)!
          enemy.hp = enemy.maxHp = 1e9
        }
        const recovery = player.shieldRecovery
        game.tick(1 / 60)
        damageWindows[Math.floor(frame / 180)] += player.maxHp - player.hp
        if (player.shieldRecovery > recovery) blocks.push(game.state.time)
      }
      expect(game.state.time).toBeGreaterThan(30)
      expect(damageWindows.every((damage) => damage > 0)).toBe(true)
      expect(blocks.length).toBeGreaterThan(10)
      expect(blocks.length).toBeLessThanOrEqual(20)
      for (let index = 1; index < blocks.length; index++)
        expect(blocks[index] - blocks[index - 1]).toBeGreaterThanOrEqual(1.5 - 1e-9)
      expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
    }
  )

  test('recovery is per owner and guests see every unavailable shield as thin until recovery', () => {
    const { game, player } = guarded()
    const other = game.addPlayer('b', 'p_over')!
    other.x = player.x + 300
    other.weapons[0].lv = 4
    other.weapons[0].cd = 0
    game.tick(1 / 60)
    for (const owner of [player, other]) {
      game.spawnEnemy('germ', owner.x, owner.y)
      game.tick(1 / 60)
      expect(owner.shieldRecovery).toBe(1.5)
      expect(owner.hp).toBe(owner.maxHp)
    }
    game.state.enemies = []
    const view = readView(JSON.parse(JSON.stringify(toView(game.state))))!
    for (let index = 7; index < view.shots.length; index += 8) expect(view.shots[index] % 2).toBe(1)
    game.tick(1.51)
    const ready = readView(JSON.parse(JSON.stringify(toView(game.state))))!
    for (const owner of [0, 1]) {
      const variants = []
      for (let index = 0; index < ready.shots.length; index += 8)
        if (ready.shots[index + 6] === owner) variants.push(ready.shots[index + 7] % 2)
      expect(variants).toContain(0)
      expect(variants).toContain(1)
    }
  })
})

describe('通常の被弾猶予は親にかかわらず継続接触を防がない', () => {
  test.each(PARENTS.map(({ id }) => id))('%s: bullet and boss grace do not become shield grace', (parent) => {
    for (const source of ['bullet', 'boss']) {
      const game = new Game(76)
      game.targetPopulation = () => 0
      const player = game.addPlayer('a', parent)!
      player.pending = 0
      player.weapons.forEach((weapon) => {
        weapon.cd = 100
      })
      if (parent === 'p_over') player.weapons = []
      if (source === 'bullet')
        game.state.bullets.push({
          x: player.x,
          y: player.y,
          vx: 0,
          vy: 0,
          r: 7,
          damage: 20,
          life: 2,
          kind: 0,
          src: 'germ'
        })
      else game.spawnEnemy('b_hs', player.x, player.y)
      game.tick(1 / 60)
      expect(player.invuln).toBe(source === 'bullet' ? 0.5 : 0.6)
      game.state.enemies = []
      game.spawnEnemy('germ', player.x, player.y)
      const hp = player.hp
      game.tick(1 / 60)
      expect(player.invuln).toBeGreaterThan(0)
      expect(player.hp).toBeLessThan(hp)
    }
  })
})

describe('毒親: 攻撃力と引き換えに自然回復なし', () => {
  test('base aura damage is reduced to 4', () => {
    expect(WEAPONS.find(({ id }) => id === 'p_toxic')!.damage).toBe(4)
  })

  test.each([1, 2, 4, 5, 8])('aura radius ignores weapon count at level %i', (lv) => {
    const game = new Game(72)
    const player = game.addPlayer('a', 'p_toxic')!
    const weapon = player.weapons[0]
    weapon.lv = lv
    const def = WEAPONS.find(({ id }) => id === weapon.id)!
    for (const passives of [
      [],
      [{ id: 'p_clever', lv: 5 }],
      [{ id: 'p_grand', lv: 5 }],
      [
        { id: 'p_clever', lv: 5 },
        { id: 'p_grand', lv: 5 },
        { id: 'p_kind', lv: 5 },
        { id: 'p_cautious', lv: 5 },
        { id: 'p_acceptance', lv: 1 }
      ]
    ]) {
      player.passives = passives
      game.state.shots = []
      const stats = weaponStats(player, weapon)
      game['fire'](player, weapon, stats)
      expect(game.state.shots).toHaveLength(1)
      expect(game.state.shots[0].r).toBeCloseTo(def.area * stats.area)
    }
  })

  test('base aura radius is 35', () => {
    expect(WEAPONS.find(({ id }) => id === 'p_toxic')!.area).toBe(35)
  })

  test('toxic aura stays active without additional projectiles', () => {
    const game = new Game(72)
    game.targetPopulation = () => 0
    const player = game.addPlayer('a', 'p_toxic')!
    player.weapons = [{ id: 'p_toxic', lv: 1, cd: 0, held: 0, damage: 0 }]
    player.passives = []
    expect(weaponStats(player, player.weapons[0]).cooldown).toBe(1)
    game.tick(1 / 60)
    expect(game.state.fx.some((event) => event.type === FX.FIRE)).toBe(true)
    const aura = game.state.shots[0]
    player.passives = [{ id: 'p_grand', lv: 5 }]
    expect(weaponStats(player, player.weapons[0]).amount).toBe(1)
    player.weapons[0].lv = 4
    game.tick(1 / 60)
    expect(aura.r).toBeGreaterThan(35)
    for (let frame = 0; frame < 180; frame++) {
      game.tick(1 / 60)
      expect(game.state.shots).toEqual([aura])
    }
    player.weapons = []
    game.tick(1)
    expect(game.state.shots).toHaveLength(0)
  })

  test.each(WEAPONS.filter(({ behavior }) => behavior !== 'none').map(({ id }) => id))(
    '%s gains exactly 5% damage without strengthening an ally',
    (id) => {
      const game = new Game(72)
      const player = game.addPlayer('a', 'p_toxic')!
      const ally = game.addPlayer('b', 'p_weak')!
      player.passives = [
        { id: 'p_hot', lv: 5 },
        { id: 'p_clever', lv: 5 }
      ]
      const weapon = { id, lv: 8, cd: 0, held: 0, damage: 0 }
      const boosted = weaponStats(player, weapon)
      const allyDamage = weaponStats(ally, weapon).damage
      player.parent = 'p_weak'
      const base = weaponStats(player, weapon)
      expect(boosted.damage).toBeCloseTo(base.damage * 1.05)
      expect({ ...boosted, damage: 0 }).toEqual({ ...base, damage: 0 })
      expect(weaponStats(ally, weapon).damage).toBe(allyDamage)
    }
  )

  test('the offensive perk reaches actual aura damage', () => {
    const damage = (toxic: boolean) => {
      const game = new Game(72)
      game.targetPopulation = () => 0
      const player = game.addPlayer('a', 'p_toxic')!
      if (!toxic) player.parent = 'p_weak'
      player.weapons[0].cd = 0
      const enemy = game.spawnEnemy('germ', player.x + 30, player.y)!
      enemy.hp = enemy.maxHp = 1000
      game.tick(1 / 60)
      return enemy.maxHp - enemy.hp
    }
    expect(damage(false)).toBeGreaterThan(0)
    expect(damage(true)).toBeCloseTo(damage(false) * 1.05)
  })

  test('personality, ally and family regeneration cannot heal toxic children; other parents still heal', () => {
    const game = new Game(72)
    game.targetPopulation = () => 0
    const toxic = game.addPlayer('a', 'p_toxic')!
    const other = game.addPlayer('b', 'p_edu')!
    other.x = toxic.x + 20
    other.y = toxic.y
    for (const player of [toxic, other]) {
      player.hp = 20
      player.married = player.hasChild = true
      player.passives = [
        { id: 'p_optimist', lv: 5 },
        { id: 'p_kind', lv: 5 }
      ]
    }
    expect(playerStats(toxic).maxHp).toBe(90)
    expect(playerStats(toxic).regen).toBe(0)
    expect(playerStats(other).regen).toBeGreaterThan(0)
    game.tick(1)
    expect(toxic.hp).toBe(20)
    expect(other.hp).toBeGreaterThan(25)
    expect(playerStats(game.addPlayer('c', 'p_gone')!).regen).toBe(1)
  })

  test('meals and level-ups remain usable healing sources', () => {
    const game = new Game(73)
    game.targetPopulation = () => 0
    const player = game.addPlayer('a', 'p_toxic')!
    player.hp = 10
    game.state.items.push({ kind: 'meal', x: player.x, y: player.y })
    game.tick(1 / 60)
    expect(player.hp).toBe(50)
    game.gainXp(game.state.xpNext)
    expect(player.hp).toBeCloseTo(50 + player.maxHp * 0.06)
    expect(playerStats(player).regen).toBe(0)
  })
})

describe('放任主義: 真上に飛んで割れる風船', () => {
  function balloons(level = 1) {
    const game = new Game(74)
    game.targetPopulation = () => 0
    const player = game.addPlayer('a', 'p_free')!
    player.weapons[0].lv = level
    player.weapons[0].cd = 0
    game.tick(1 / 60)
    player.weapons[0].cd = 100
    return { game, player }
  }

  test.each([1, 8])('level %i balloons rise vertically in separate columns', (level) => {
    const { game, player } = balloons(level)
    const shots = game.state.shots
    const positions = shots.map(({ x, y }) => ({ x, y }))
    expect(shots.length).toBeGreaterThanOrEqual(2)
    expect(new Set(shots.map((shot) => shot.x)).size).toBe(shots.length)
    expect(shots.every((shot) => shot.vx === 0 && shot.vy < 0)).toBe(true)
    player.x += 100
    player.y += 100
    game.tick(0.1)
    shots.forEach((shot, index) => {
      expect(shot.x).toBe(positions[index].x)
      expect(shot.y).toBeLessThan(positions[index].y)
    })
  })

  test('the third hit adds a radial blast and knockback to direct damage', () => {
    const { game, player } = balloons()
    const shot = game.state.shots[0]
    game.state.shots = [shot]
    Object.assign(shot, { x: player.x + 140, y: player.y - 140, vx: 0, vy: 0 })
    const enemyAt = (offset: number) => {
      const enemy = game.spawnEnemy('germ', shot.x + offset, shot.y)!
      enemy.hp = enemy.maxHp = 1000
      return enemy
    }
    for (let hit = 0; hit < 2; hit++) {
      const enemy = enemyAt(0)
      game.tick(1 / 60)
      expect(enemy.hp).toBeLessThan(enemy.maxHp)
      expect(enemy.kx).toBe(0)
      expect(enemy.ky).toBe(0)
      expect(shot.pierce).toBe(2 - hit)
      expect(game.state.fx.some((event) => event.type === FX.BLAST)).toBe(false)
      game.state.enemies = []
    }
    const target = enemyAt(0)
    const left = enemyAt(-50)
    const right = enemyAt(50)
    const outside = enemyAt(100)
    const previousDamage = player.weapons[0].damage
    game.tick(1 / 60)
    expect(game.state.shots).toHaveLength(0)
    expect(target.maxHp - target.hp).toBeGreaterThan(shot.damage * 1.79)
    expect(left.hp).toBeLessThan(left.maxHp)
    expect(right.hp).toBeLessThan(right.maxHp)
    expect(outside.hp).toBe(outside.maxHp)
    expect(left.kx).toBeLessThan(0)
    expect(right.kx).toBeGreaterThan(0)
    const total = [target, left, right].reduce((sum, enemy) => sum + enemy.maxHp - enemy.hp, 0)
    expect(player.weapons[0].damage - previousDamage).toBeCloseTo(total)
    const blasts = game.state.fx.filter((event) => event.type === FX.BLAST)
    expect(blasts).toHaveLength(1)
    expect(blasts[0]).toMatchObject({ x: shot.x, y: shot.y, a: shot.r * 4, b: WEAPON_INDEX.get('p_free') })
    const view = toView(game.state)
    expect(view.fx.some((value, index) => index % 6 === 1 && value === FX.BLAST)).toBe(true)
    expect(readView(JSON.parse(JSON.stringify(view)))).toBeTruthy()
  })

  test('an expired balloon bursts once and respects boss knockback immunity', () => {
    const { game, player } = balloons()
    const shot = game.state.shots[0]
    game.state.shots = [shot]
    Object.assign(shot, { x: player.x + 140, y: player.y - 140, life: 0 })
    const enemy = game.spawnEnemy('germ', shot.x, shot.y)!
    enemy.hp = enemy.maxHp = 1000
    const boss = game.spawnEnemy('b_hs', shot.x + 50, shot.y)!
    game.tick(0)
    expect(game.state.shots).toHaveLength(0)
    expect(enemy.hp).toBeLessThan(enemy.maxHp)
    expect(enemy.ky).toBeLessThan(0)
    expect(boss.hp).toBeLessThan(boss.maxHp)
    expect(boss.kx).toBe(0)
    expect(boss.ky).toBe(0)
    game.tick(0)
    expect(game.state.fx.filter((event) => event.type === FX.BLAST)).toHaveLength(1)
  })
})

describe('親ごとの役割', () => {
  test('birth weapons retain their distinct attack profiles and perks', () => {
    expect(PARENTS.map(({ id, behavior }) => [id, behavior])).toEqual([
      ['p_toxic', 'aura'],
      ['p_edu', 'aim'],
      ['p_free', 'wander'],
      ['p_weak', 'flail'],
      ['p_over', 'orbit'],
      ['p_monster', 'orbit'],
      ['p_rich', 'rain'],
      ['p_yankee', 'raid'],
      ['p_gone', 'none']
    ])
    const game = new Game(74)
    const free = game.addPlayer('a', 'p_free')!
    const weak = game.addPlayer('b', 'p_weak')!
    expect(weaponSlots(free)).toBe(weaponSlots(weak) + 1)
    expect(playerStats(weak).xpGain).toBe(1.25)
    for (const [parent, weapon] of [
      ['p_edu', 'w_study'],
      ['p_rich', 'w_invest']
    ]) {
      const player = new Game(74).addPlayer('a', parent)!
      const owned = { id: weapon, lv: 1, cd: 0, held: 0, damage: 0 }
      const damage = weaponStats(player, owned).damage
      player.parent = 'p_weak'
      expect(damage).toBeCloseTo(weaponStats(player, owned).damage * 1.3)
    }
  })

  test.each([1, 2, 3, 4, 5, 8])('monster parents stay capped at two with extra projectiles at level %i', (lv) => {
    const game = new Game(75)
    const player = game.addPlayer('a', 'p_monster')!
    const weapon = player.weapons[0]
    weapon.lv = lv
    const amount = lv < 4 ? 1 : 2
    expect(weaponStats(player, weapon).amount).toBe(amount)
    player.passives = [
      { id: 'p_clever', lv: 5 },
      { id: 'p_grand', lv: 5 }
    ]
    const stats = weaponStats(player, weapon)
    expect(stats.amount).toBe(amount)
    game['fire'](player, weapon, stats)
    game['fire'](player, weapon, stats)
    expect(game.state.shots).toHaveLength(amount)
    game.state.shots.pop()
    game['fire'](player, weapon, stats)
    expect(game.state.shots).toHaveLength(amount)
    const other = game.addPlayer('b', 'p_monster')!
    other.weapons[0].lv = 8
    game['fire'](other, other.weapons[0], weaponStats(other, other.weapons[0]))
    expect(game.state.shots.filter((shot) => shot.owner === other.id)).toHaveLength(2)
    const friend = { id: 'w_friend', lv: 8, cd: 0, held: 0, damage: 0 }
    expect(weaponStats(player, friend).amount).toBeGreaterThan(2)
  })

  test('monster parents chase nearby enemies rather than orbiting their child', () => {
    const game = new Game(75)
    game.targetPopulation = () => 0
    const player = game.addPlayer('a', 'p_monster')!
    player.weapons[0].cd = 0
    game.spawnEnemy('bully', player.x + 220, player.y)
    game.tick(1 / 60)
    const shot = game.state.shots[0]
    expect(shot.target).toBeDefined()
    expect(shot.x).toBeGreaterThan(player.x)
    expect(Math.hypot(shot.x - player.x, shot.y - player.y)).toBeLessThan(shot.orbit)
  })

  test('two monster parents chase different enemies when possible', () => {
    const game = new Game(75)
    game.targetPopulation = () => 0
    const player = game.addPlayer('a', 'p_monster')!
    player.weapons[0].lv = 4
    player.weapons[0].cd = 0
    game.spawnEnemy('bully', player.x + 200, player.y)
    game.spawnEnemy('bully', player.x - 200, player.y)
    game.tick(1 / 60)
    const parents = game.state.shots.filter((shot) => shot.weapon === 'p_monster')
    expect(parents).toHaveLength(2)
    expect(parents[0].target).toBeDefined()
    expect(parents[1].target).toBeDefined()
    expect(parents[0].target).not.toBe(parents[1].target)
    expect((parents[0].x - player.x) * (parents[1].x - player.x)).toBeLessThan(0)
  })
})

describe('ヤンキー親', () => {
  /** A yankee parent about to fire, with unkillable bullies held in place at the given offsets. */
  function raid(seed: number, offsets: [number, number][]) {
    const game = new Game(seed)
    const player = game.addPlayer('a', 'p_yankee')!
    for (const c of TALENT_CATEGORIES) player.talents[c] = 1
    const posts = offsets.map(([dx, dy]) => {
      const enemy = game.spawnEnemy('bully', player.x + dx, player.y + dy)!
      enemy.hp = enemy.maxHp = 1e9
      return { enemy, x: enemy.x, y: enemy.y }
    })
    /** Ticks until the first raid is over, returning each raid shot's path from the owner. */
    const watch = () => {
      const paths = new Map<number, { d: number; a: number }[]>()
      for (let i = 0; i < 60 * 3; i++) {
        player.hp = player.maxHp
        for (const p of posts) {
          p.enemy.x = p.x
          p.enemy.y = p.y
          p.enemy.kx = p.enemy.ky = 0
        }
        game.tick(1 / 60)
        const shots = game.state.shots.filter((s) => s.weapon === 'p_yankee')
        if (!shots.length && paths.size) break
        for (const s of shots) {
          const path = paths.get(s.id) ?? []
          path.push({ d: Math.hypot(s.x - player.x, s.y - player.y), a: Math.atan2(s.y - player.y, s.x - player.x) })
          paths.set(s.id, path)
        }
      }
      return [...paths.values()].map((path) => {
        const top = path.reduce((a, b) => (b.d > a.d ? b : a))
        return { farthest: top.d, bearing: top.a, last: path[path.length - 1].d }
      })
    }
    return { game, player, posts, watch }
  }

  test('a physical parent card, unlike 蒸発済み', () => {
    const parent = PARENTS.find((entry) => entry.id === 'p_yankee')!
    expect(parent.category).toBe('sports')
    expect(parent.behavior).toBe('raid')
    expect(new Game(1).addPlayer('a', parent.id)!.weapons.map((weapon) => weapon.id)).toEqual(['p_yankee'])
    expect(new Game(1).addPlayer('a', 'p_gone')!.weapons).toEqual([])
  })

  test('a raid runs out, kicks a little further and ends back at the owner without jumps', () => {
    expect(raidReach(0)).toBe(0)
    expect(raidReach(RAID.kick)).toBeCloseTo(0.8)
    expect(raidReach(RAID.back)).toBeCloseTo(1)
    expect(raidReach(1)).toBeCloseTo(0)
    for (let k = 1; k <= 100; k++) expect(Math.abs(raidReach(k / 100) - raidReach((k - 1) / 100))).toBeLessThan(0.05)
  })

  test('storms at the nearest enemy, kicks it and swaggers back to the owner', () => {
    const { posts, watch } = raid(11, [
      [130, 0],
      [-260, 0]
    ])
    const [only, ...more] = watch()
    expect(more).toEqual([])
    // A stride short of the enemy at 130, so the kicking sole lands on it.
    expect(only.bearing).toBeCloseTo(0, 1)
    expect(only.farthest).toBeGreaterThan(105)
    expect(only.farthest).toBeLessThan(125)
    expect(only.last).toBeLessThan(15)
    expect(posts[0].enemy.hp).toBeLessThan(1e9)
    expect(posts[1].enemy.hp).toBe(1e9)
  })

  test('with nobody near it swaggers out the way the owner faces and back', () => {
    const { player, watch } = raid(12, [])
    player.fx = 0
    player.fy = 1
    const [only] = watch()
    expect(only.bearing).toBeCloseTo(Math.PI / 2, 1)
    expect(only.farthest).toBeGreaterThan(90)
    expect(only.farthest).toBeLessThan(110)
    expect(only.last).toBeLessThan(15)
  })

  test('弾数 bonuses and weapon levels do not add parents, while level 4 expands their reach', () => {
    const { player, watch } = raid(13, [
      [120, 0],
      [0, 150],
      [-300, 0]
    ])
    const weapon = player.weapons[0]
    player.passives = [
      { id: 'p_clever', lv: 4 },
      { id: 'p_grand', lv: 3 }
    ]
    for (const lv of [1, 2, 4, 5, 8]) {
      weapon.lv = lv
      const stats = weaponStats(player, weapon)
      expect(stats.amount).toBe(1)
      expect(stats.area).toBeCloseTo(lv >= 4 ? 1.4 : 1)
    }
    const paths = watch()
    expect(paths).toHaveLength(1)
    expect(paths[0].bearing).toBeCloseTo(0, 1)
  })
})

describe('蒸発済み: 自立', () => {
  test('birth choices include study and reading, but not hobbies', () => {
    expect(early.has('w_study')).toBe(true)
    expect(early.has('w_reading')).toBe(true)
    expect(early.has('w_hobby')).toBe(false)
  })

  test('the first hand at birth is three early talents and picking one gives it at lv 1', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = new Game(seed)
      const player = game.addPlayer('a', 'p_gone')!
      expect(player.weapons).toEqual([])
      game.tick(1 / 60)
      expect(player.choices).toHaveLength(3)
      const ids = player.choices.map((choice) => {
        expect(choice.startsWith('w:')).toBe(true)
        return choice.slice(2)
      })
      expect(new Set(ids).size).toBe(3)
      for (const id of ids) expect(early.has(id)).toBe(true)
      const chosen = ids[1]
      game.choose(player, 1)
      expect(player.weapons.map((w) => [w.id, w.lv])).toEqual([[chosen, 1]])
      // Nothing more is owed afterwards.
      game.tick(1 / 60)
      expect(player.choices).toEqual([])
    }
  })

  test('other parents get no birth hand', () => {
    for (const parent of PARENTS.filter((p) => p.id !== 'p_gone')) {
      const game = new Game(7)
      const player = game.addPlayer('a', parent.id)!
      game.tick(1 / 60)
      expect(player.choices).toEqual([])
      expect(player.pending).toBe(0)
    }
  })

  test('the smart bot points a ready beam toward a safely distant enemy', () => {
    const game = new Game(39)
    const player = game.addPlayer('a', 'p_gone')!
    player.weapons.push({ id: 'w_reading', lv: 1, cd: 0.05, held: 0, damage: 0 })
    game.spawnEnemy('germ', player.x + 200, player.y)
    const input = botInput(game, player, 'smart')
    expect(input.x).toBeCloseTo(1)
    expect(input.y).toBeCloseTo(0)
  })

  test('the smart bot favors reading as a first weapon when talents are equal', () => {
    const game = new Game(4)
    const player = game.addPlayer('a', 'p_gone')!
    player.talents.friend = 1
    player.talents.study = 1
    player.choices = ['w:w_friend', 'w:w_reading']
    expect(botInput(game, player, 'smart').pick).toBe(1)
  })

  test('without injected experience a smart bot levels and builds weapons within 180 s', () => {
    const report: string[] = []
    let upgraded = false
    for (const seed of [39, 46, 50, 1, 11, 3, 4]) {
      const game = new Game(seed)
      const player = game.addPlayer('a', 'p_gone')!
      while (game.state.phase === 'playing' && game.state.time < 180) {
        game.setInput(player.id, botInput(game, player, 'smart'))
        for (let i = 0; i < 6; i++) game.tick(1 / 60)
      }
      const talents = player.weapons.filter((w) => w.id !== 'p_gone')
      const best = Math.max(0, ...player.weapons.map((w) => w.lv))
      report.push(
        `seed ${seed}: kills ${game.state.kills} level ${game.state.level} weapons ${player.weapons.length} best lv ${best}`
      )
      expect(game.state.phase, `seed ${seed}`).toBe('playing')
      expect(game.state.time, `seed ${seed} time`).toBeGreaterThanOrEqual(180)
      expect(game.state.kills, `seed ${seed} kills`).toBeGreaterThan(0)
      expect(game.state.level, `seed ${seed} level`).toBeGreaterThan(1)
      expect(talents.length, `seed ${seed} weapons`).toBeGreaterThanOrEqual(1)
      expect(best >= 2 || talents.length >= 2, `seed ${seed} weapon growth`).toBe(true)
      upgraded ||= best >= 2
    }
    expect(upgraded).toBe(true)
    process.stderr.write(report.join('\n'))
  }, 20_000)
})

describe('モンスターペアレントの対人の手札', () => {
  const friendCards = [...TALENT_WEAPONS, ...PASSIVES]
    .filter((def) => def.category === 'friend' && def.id !== 'p_petmemory')
    .map((def) => `${'behavior' in def ? 'w' : 'p'}:${def.id}`)

  test.each([
    [0, 0.5],
    [1, 0.525],
    [10, 0.75],
    [19, 0.975],
    [20, 1],
    [50, 1]
  ])('at age %i the 対人 draw weight is %f of normal', (age, rate) => {
    const monster = new Game(5)
    const child = monster.addPlayer('a', 'p_monster')!
    const normal = new Game(5)
    const other = normal.addPlayer('a', 'p_weak')!
    monster.state.time = normal.state.time = timeAtAge(age) + 0.001
    expect(ageAt(monster.state.time)).toBe(age)
    for (const card of friendCards)
      expect(monster['cardWeight'](child, card)).toBeCloseTo(normal['cardWeight'](other, card) * rate)
    expect(monster['cardWeight'](child, 'w:w_study')).toBe(normal['cardWeight'](other, 'w:w_study'))
    expect(monster['cardWeight'](child, 'w:p_monster')).toBe(2.5)
  })

  test('the flaw 人間への恐怖 fills a personality slot, never levels up and fades at 20', () => {
    const game = new Game(5)
    const child = game.addPlayer('a', 'p_monster')!
    expect(child.passives).toEqual([{ id: PEOPLE_FEAR, lv: 1 }])
    expect(PASSIVE_BY_ID.get(PEOPLE_FEAR)!.name).toBe('人間への恐怖')
    expect(game.options(child)).not.toContain(`p:${PEOPLE_FEAR}`)
    child.passives.push(...PASSIVES.slice(0, PASSIVE_SLOTS - 2).map(({ id }) => ({ id, lv: 1 })))
    expect(game.options(child).some((choice) => choice === `p:${PASSIVES[PASSIVE_SLOTS].id}`)).toBe(true)
    child.passives.push({ id: PASSIVES[PASSIVE_SLOTS - 2].id, lv: 1 })
    expect(game.options(child).some((choice) => choice === `p:${PASSIVES[PASSIVE_SLOTS].id}`)).toBe(false)
    game.state.time = timeAtAge(19) + 0.001
    game['ageWeapons']()
    expect(child.passives.some(({ id }) => id === PEOPLE_FEAR)).toBe(true)
    game.state.time = timeAtAge(20) + 0.001
    game['ageWeapons']()
    expect(child.passives.some(({ id }) => id === PEOPLE_FEAR)).toBe(false)
    expect(game['cardWeight'](child, 'p:p_kind')).toBe(game['cardWeight'](child, 'p:p_diligent'))
    expect(game.options(child).some((choice) => choice === `p:${PASSIVES[PASSIVE_SLOTS].id}`)).toBe(true)
    expect(game.state.log.some((entry) => entry.text.includes('「人間への恐怖」が消えた'))).toBe(true)
  })

  test('only a モンスターペアレント child born before 20 gets 人間への恐怖', () => {
    const game = new Game(5)
    for (const parent of PARENTS.filter(({ id }) => id !== 'p_monster'))
      expect(game.addPlayer(parent.id, parent.id)!.passives).toEqual([])
    const late = new Game(5)
    late.state.time = timeAtAge(20) + 0.001
    expect(late.addPlayer('late', 'p_monster')!.passives).toEqual([])
  })

  test('other parents keep the normal 対人 weight', () => {
    const game = new Game(5)
    const player = game.addPlayer('a', 'p_over')!
    player.weapons.push({ id: 'w_friend', lv: 1, cd: 0, held: 0, damage: 0 })
    expect(game['cardWeight'](player, 'w:w_friend')).toBe(2.5)
    expect(game['cardWeight'](player, 'p:p_kind')).toBe(game['cardWeight'](player, 'p:p_diligent'))
  })
})
