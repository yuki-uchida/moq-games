import { describe, expect, test } from 'vitest'
import { PARENTS, TALENT_CATEGORIES, TALENT_WEAPONS, WEAPONS } from '../src/data'
import { Game, RAID, playerStats, raidReach, weaponSlots, weaponStats } from '../src/game'
import { FX } from '../src/fx'
import { readView, toView } from '../src/view'
import { botInput } from './bot'

const early = new Set(TALENT_WEAPONS.filter((def) => def.minAge <= 6).map((def) => def.id))

describe('過保護: 攻撃と防御を兼ねる盾', () => {
  function guarded() {
    const game = new Game(71)
    const player = game.addPlayer('a', 'p_over')!
    game.targetPopulation = () => 0
    player.weapons[0].cd = 0
    game.tick(1 / 60)
    return { game, player }
  }

  test('each shield blocks one bullet; grace preserves the next shield, then damage resumes', () => {
    const { game, player } = guarded()
    const bullet = () =>
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
    expect(game.state.shots).toHaveLength(2)
    bullet()
    game.tick(1 / 60)
    expect(player.hp).toBe(player.maxHp)
    expect(player.invuln).toBe(0.5)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(1)
    expect(game.state.shots).toHaveLength(2)
    const view = toView(game.state)
    expect(view.v).toBe(11)
    expect(view.shots[7]).toBe(1)
    expect(readView(JSON.parse(JSON.stringify(view)))).toBeTruthy()
    expect(game.state.bullets).toEqual([])
    expect(game.state.fx.some((event) => event.type === FX.HURT || event.type === FX.DOWN)).toBe(false)
    bullet()
    game.tick(0.1)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(1)
    expect(player.hp).toBe(player.maxHp)
    game.tick(0.5)
    expect(player.hp).toBe(player.maxHp - 19)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(1)
    game.tick(0.91)
    bullet()
    game.tick(1 / 60)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(0)
    expect(player.hp).toBe(player.maxHp - 19)
    bullet()
    game.tick(0.51)
    expect(player.hp).toBe(player.maxHp - 38)
    expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeTruthy()
  })

  test.each(['germ', 'b_hs'])('blocks %s contact, including a lethal hit, without draining both shields', (kind) => {
    const { game, player } = guarded()
    player.hp = 0.01
    game.spawnEnemy(kind, player.x, player.y)
    game.tick(1 / 60)
    expect(player.hp).toBe(0.01)
    expect(player.downed).toBe(false)
    expect(player.invuln).toBe(0.5)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(1)
    game.tick(1 / 60)
    expect(game.state.shots.filter((shot) => shot.v === 0)).toHaveLength(1)
    expect(player.hp).toBe(0.01)
  })

  test('shields still damage enemies and orbit rather than chase them', () => {
    const { game, player } = guarded()
    game.state.bullets.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 7, damage: 20, life: 2, kind: 0, src: 'germ' })
    game.tick(1 / 60)
    const shield = game.state.shots.find((shot) => shot.v === 1)!
    const enemy = game.spawnEnemy('germ', shield.x, shield.y)!
    game.tick(1 / 60)
    expect(enemy.hp).toBeLessThan(enemy.maxHp)
    expect(player.weapons[0].damage).toBeGreaterThan(0)
    expect(Math.hypot(shield.x - player.x, shield.y - player.y)).toBeCloseTo(shield.orbit)
    expect(game.state.shots).toHaveLength(2)
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
    other.weapons[0].cd = 100
    game.spawnEnemy('germ', other.x, other.y)
    game.tick(1 / 60)
    expect(other.hp).toBeLessThan(other.maxHp)
    expect(player.hp).toBe(player.maxHp)
    expect(game.state.shots).toHaveLength(2)
    game.state.enemies = []
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
        } else game.spawnEnemy(attack, player.x, player.y)
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
    for (let index = 7; index < view.shots.length; index += 8) expect(view.shots[index]).toBe(1)
    game.tick(1.51)
    const ready = readView(JSON.parse(JSON.stringify(toView(game.state))))!
    for (const owner of [0, 1]) {
      const variants = []
      for (let index = 0; index < ready.shots.length; index += 8)
        if (ready.shots[index + 6] === owner) variants.push(ready.shots[index + 7])
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
      expect(player.shieldGrace).toBe(0)
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
  test.each(WEAPONS.filter(({ behavior }) => behavior !== 'none').map(({ id }) => id))(
    '%s gains exactly 25% damage without strengthening an ally',
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
      expect(boosted.damage).toBeCloseTo(base.damage * 1.25)
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
      const enemy = game.spawnEnemy('germ', player.x + 60, player.y)!
      enemy.hp = enemy.maxHp = 1000
      game.tick(1 / 60)
      return enemy.maxHp - enemy.hp
    }
    expect(damage(false)).toBeGreaterThan(0)
    expect(damage(true)).toBeCloseTo(damage(false) * 1.25)
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

  test('器用 sends one yankee parent at each of the nearest enemies', () => {
    const { player, watch } = raid(13, [
      [120, 0],
      [0, 150],
      [-300, 0]
    ])
    player.passives = [{ id: 'p_clever', lv: 1 }]
    const bearings = watch()
      .map((path) => path.bearing)
      .sort((a, b) => a - b)
    expect(bearings).toHaveLength(2)
    expect(bearings[0]).toBeCloseTo(0, 1)
    expect(bearings[1]).toBeCloseTo(Math.PI / 2, 1)
  })
})

describe('蒸発済み: 自立', () => {
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

  test('without injected experience a smart bot gets going within 180 s', () => {
    const report: string[] = []
    for (const seed of [39, 46, 50, 1, 2, 3, 4]) {
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
      expect(game.state.kills, `seed ${seed} kills`).toBeGreaterThan(0)
      expect(game.state.level, `seed ${seed} level`).toBeGreaterThan(1)
      expect(talents.length, `seed ${seed} weapons`).toBeGreaterThanOrEqual(1)
      expect(best, `seed ${seed} best lv`).toBeGreaterThanOrEqual(2)
    }
    process.stderr.write(report.join('\n'))
  }, 20_000)
})
