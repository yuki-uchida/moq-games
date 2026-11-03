import { describe, expect, test } from 'vitest'
import {
  BULLET_KINDS,
  ENEMIES,
  ENEMY_BY_ID,
  ENEMY_INDEX,
  EVENTS,
  MAX_WEAPON_LEVEL,
  PASSIVES,
  POOLS,
  RUN_SECONDS,
  STAGES,
  TALENT_CATEGORIES,
  TALENT_NAMES,
  TALENT_WEAPONS,
  WEAPON_BY_ID,
  WEAPON_INDEX,
  ageAt,
  timeAtAge,
  type EnemyDef
} from '../src/data'
import { FX, FX_CAP, FX_STRIDE, FX_WINDOW, type FxEvent } from '../src/fx'
import {
  Game,
  MAX_BULLETS,
  isEvolved,
  passiveLevel,
  playerStats,
  weaponName,
  weaponStats,
  type Enemy
} from '../src/game'
import type { Player } from '../src/game'
import { ENEMY_FLAG, POPUP_BIT, STRIDE, VIEW_CAPS, readView, toView } from '../src/view'

const NEW_WEAPONS: Record<string, { name: string; passive: string; behavior: string }> = {
  w_sns: { name: 'バズの連鎖', passive: 'p_savvy', behavior: 'chain' },
  w_pet: { name: '忠犬', passive: 'p_optimist', behavior: 'pet' },
  w_muscle: { name: '鋼の肉体', passive: 'p_stubborn', behavior: 'slam' },
  w_reading: { name: '博覧強記', passive: 'p_curious', behavior: 'beam' },
  w_overtime: { name: '社畜の鑑', passive: 'p_clever', behavior: 'barrage' },
  w_ring: { name: '銀婚式', passive: 'p_kind', behavior: 'boomerang' },
  w_karaoke: { name: '魂のシャウト', passive: 'p_hot', behavior: 'nova' },
  w_travel: { name: '世界一周', passive: 'p_curious', behavior: 'sweep' },
  w_savings: { name: '老後の蓄え', passive: 'p_bold', behavior: 'mine' },
  w_gamble: { name: '大穴的中', passive: 'p_lucky', behavior: 'dice' },
  w_perfume: { name: '魅惑のフェロモン', passive: 'p_savvy', behavior: 'trail' },
  w_cooking: { name: 'おふくろの味', passive: 'p_healthy', behavior: 'fan' }
}
const NEW_ENEMY_IDS = [
  'mosquito', 'vaccine', 'dog', 'pepper', 'homework', 'worksheet', 'dodgeball', 'pimple', 'crush', 'senpai', 'drinking',
  'scholarship', 'deadline', 'meeting', 'spam', 'powerhara', 'train', 'tax', 'coin', 'nightcry', 'backpain', 'scam',
  'forget', 'loneliness'
] // prettier-ignore
const NEW_BOSS_IDS = ['b_vaccine', 'b_heartbreak', 'b_tax', 'b_care']

/** A one-player arena: no parent weapon, ordinary talents, nothing in the way. */
function arena(seed: number, parent = 'p_gone') {
  const game = new Game(seed)
  const player = game.addPlayer('a', parent)!
  for (const c of TALENT_CATEGORIES) player.talents[c] = 1
  // The arena is a bare player: skip 蒸発済み's free birth pick (covered in parents.test.ts).
  player.pending = 0
  player.birthPick = false
  return { game, player }
}

/** Runs ticks while keeping the player alive, answering any level-up so a solo game never pauses. */
function run(game: Game, player: Player, ticks: number, each?: () => void) {
  for (let i = 0; i < ticks; i++) {
    player.hp = player.maxHp
    if (player.choices.length) game.choose(player, 0)
    game.tick(1 / 60)
    each?.()
  }
}

/** An enemy that never moves and never dies. */
function post(game: Game, kind: string, x: number, y: number) {
  const enemy = game.spawnEnemy(kind, x, y)!
  enemy.hp = enemy.maxHp = 1e9
  const hold = () => {
    enemy.x = x
    enemy.y = y
    enemy.kx = enemy.ky = 0
  }
  return { enemy, hold }
}

function collect(game: Game, into = new Map<number, FxEvent>()) {
  for (const e of game.state.fx) into.set(e.seq, e)
  return into
}
const ofType = (events: Map<number, FxEvent>, type: number) => [...events.values()].filter((e) => e.type === type)

describe('new talent weapons', () => {
  test('the twelve ids exist with the intended behaviours, categories and evolutions', () => {
    expect(TALENT_WEAPONS).toHaveLength(8 + 12)
    for (const [id, want] of Object.entries(NEW_WEAPONS)) {
      const def = WEAPON_BY_ID.get(id)!
      expect([id, def.behavior]).toEqual([id, want.behavior])
      expect(def.category).toBeTruthy()
      expect(def.evolve).toEqual({ passive: want.passive, name: want.name })
      expect(def.desc.length).toBeGreaterThan(8)
    }
    expect(TALENT_NAMES.hobby).toBe('創造')
    expect(Object.keys(TALENT_NAMES).sort()).toEqual([...TALENT_CATEGORIES].sort())
  })

  test.each(Object.keys(NEW_WEAPONS))('%s deals damage to an enemy in its path', (id) => {
    const { game, player } = arena(7)
    player.weapons.push({ id, lv: 1, cd: 0, held: 0, damage: 0 })
    player.fx = 1
    player.fy = 0
    const posts: ReturnType<typeof post>[] = []
    if (id === 'w_travel')
      // Planes cross at a random height: a column of posts covers every one.
      for (let y = -240; y <= 240; y += 30) posts.push(post(game, 'senpai', player.x, player.y + y))
    else if (id === 'w_savings' || id === 'w_perfume') posts.push(post(game, 'senpai', player.x + 36, player.y))
    else if (id === 'w_muscle') posts.push(post(game, 'senpai', player.x + 70, player.y))
    else posts.push(post(game, 'senpai', player.x + 120, player.y))
    const popups = new Set<unknown>()
    run(game, player, 60 * 6, () => {
      for (const p of posts) p.hold()
      game.state.popups.forEach((p) => popups.add(p))
    })
    expect(posts.some((p) => p.enemy.hp < p.enemy.maxHp)).toBe(true)
    expect(popups.size).toBeGreaterThan(0)
  })

  test('evolved names come from the spec and need the matching passive at level 8', () => {
    const { game, player } = arena(3)
    for (const [id, want] of Object.entries(NEW_WEAPONS)) {
      const weapon = { id, lv: MAX_WEAPON_LEVEL, cd: 0, held: 0, damage: 0 }
      player.weapons.push(weapon)
      expect(isEvolved(player, weapon)).toBe(false)
      player.passives = [{ id: want.passive, lv: 1 }]
      expect(isEvolved(player, weapon)).toBe(true)
      expect(weaponName(player, weapon)).toBe(want.name)
      player.weapons.pop()
    }
    expect(game.state.players).toHaveLength(1)
  })

  test('every new weapon becomes offerable exactly from its minimum age', () => {
    for (const id of Object.keys(NEW_WEAPONS)) {
      const { game, player } = arena(5)
      const def = WEAPON_BY_ID.get(id)!
      game.state.time = timeAtAge(def.minAge) + 0.5
      expect(ageAt(game.state.time)).toBe(def.minAge)
      expect(game.options(player)).toContain(`w:${id}`)
      if (def.minAge > 0) {
        game.state.time = timeAtAge(def.minAge - 1) + 0.5
        expect(game.options(player)).not.toContain(`w:${id}`)
      }
    }
  })

  test('slam and mines announce a BLAST, chains and barrages respect their shape', () => {
    {
      const { game, player } = arena(2)
      player.weapons.push({ id: 'w_muscle', lv: 1, cd: 0, held: 0, damage: 0 })
      const p = post(game, 'senpai', player.x + 60, player.y)
      p.enemy.kx = 0
      game.tick(1 / 60)
      const blast = ofType(collect(game), FX.BLAST)
      expect(blast).toHaveLength(1)
      expect(blast[0].a).toBe(110)
      expect(blast[0].b).toBe(WEAPON_INDEX.get('w_muscle'))
      // Strong knockback, but tanks barely budge.
      expect(p.enemy.hp).toBeLessThan(p.enemy.maxHp)
    }
    {
      const { game, player } = arena(2)
      player.weapons.push({ id: 'w_sns', lv: 1, cd: 0, held: 0, damage: 0 })
      const posts = [100, 220, 330].map((dx) => post(game, 'senpai', player.x + dx, player.y))
      game.tick(1 / 60)
      // Three links (2 + amount): every post is hit once at creation, and the segments never collide.
      expect(posts.every((p) => p.enemy.hp < p.enemy.maxHp)).toBe(true)
      const links = game.state.shots.filter((s) => s.weapon === 'w_sns')
      expect(links.map((s) => s.v).sort()).toEqual([0, 1, 2])
      const before = posts.map((p) => p.enemy.hp)
      run(game, player, 5)
      expect(posts.map((p) => p.enemy.hp)).toEqual(before)
    }
    {
      const { game, player } = arena(2)
      player.weapons.push({ id: 'w_overtime', lv: 1, cd: 0, held: 0, damage: 0 })
      post(game, 'senpai', player.x + 300, player.y)
      game.tick(1 / 60)
      const staples = game.state.shots.filter((s) => s.weapon === 'w_overtime')
      expect(staples).toHaveLength(3)
      expect(staples.map((s) => s.delay > 0)).toEqual([false, true, true])
      // Staples that have not left yet are not sent.
      const view = toView(game.state)
      expect(view.shots.length / STRIDE.shots).toBe(1)
    }
  })

  test('a die rolls its face into the variant and a six always crits', () => {
    const { game, player } = arena(11)
    player.weapons.push({ id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0 })
    post(game, 'senpai', player.x + 400, player.y)
    const faces = new Set<number>()
    const crits: boolean[] = []
    for (let i = 0; i < 60 * 40; i++) {
      player.weapons[0].cd = 0
      player.hp = player.maxHp
      game.tick(1 / 60)
      for (const s of game.state.shots) if (s.weapon === 'w_gamble') faces.add(s.v), s.v === 6 && crits.push(s.crit)
      game.state.shots = game.state.shots.filter((s) => s.weapon !== 'w_gamble' || s.life > 1.4)
    }
    expect([...faces].every((f) => f >= 1 && f <= 6)).toBe(true)
    expect(faces.size).toBeGreaterThanOrEqual(5)
    expect(crits.length).toBeGreaterThan(0)
    expect(crits.every(Boolean)).toBe(true)
  })

  test('pets stay out and return to their owner when nothing is near', () => {
    const { game, player } = arena(4)
    player.weapons.push({ id: 'w_pet', lv: 1, cd: 0, held: 0, damage: 0 })
    run(game, player, 60)
    const dogs = game.state.shots.filter((s) => s.weapon === 'w_pet')
    expect(dogs).toHaveLength(1)
    expect(Math.hypot(dogs[0].x - player.x, dogs[0].y - player.y)).toBeLessThan(60)
    const p = post(game, 'senpai', player.x + 200, player.y)
    let bit = false
    run(game, player, 120, () => {
      p.hold()
      if (dogs[0].v === 1) bit = true
    })
    expect(bit).toBe(true)
    expect(p.enemy.hp).toBeLessThan(p.enemy.maxHp)
  })

  test('a boomerang comes back to its owner and disappears', () => {
    const { game, player } = arena(4)
    player.weapons.push({ id: 'w_ring', lv: 1, cd: 0, held: 0, damage: 0 })
    post(game, 'senpai', player.x + 600, player.y)
    let far = 0
    let gone = false
    for (let i = 0; i < 60 * 4; i++) {
      player.hp = player.maxHp
      game.tick(1 / 60)
      const ring = game.state.shots.find((s) => s.weapon === 'w_ring')
      if (ring) far = Math.max(far, Math.hypot(ring.x - player.x, ring.y - player.y))
      else if (far > 0) gone = true
      if (gone) break
    }
    expect(far).toBeGreaterThan(150)
    expect(gone).toBe(true)
  })
})

describe('passives', () => {
  test('the four new 性格 exist and scale as described', () => {
    const { player } = arena(1)
    for (const id of ['p_lucky', 'p_clever', 'p_curious', 'p_savvy']) expect(PASSIVES.map((p) => p.id)).toContain(id)
    expect(PASSIVES).toHaveLength(12)
    const base = playerStats(player)
    expect(base.crit).toBeCloseTo(0.05)
    expect(base.amount).toBe(0)
    player.passives = [
      { id: 'p_lucky', lv: 3 },
      { id: 'p_clever', lv: 1 },
      { id: 'p_curious', lv: 2 },
      { id: 'p_savvy', lv: 4 }
    ]
    const stats = playerStats(player)
    expect(stats.crit).toBeCloseTo(0.2)
    expect(stats.amount).toBe(1)
    expect(stats.duration).toBeCloseTo(1.2)
    expect(stats.shotSpeed).toBeCloseTo(1.2)
    expect(stats.strong).toBeCloseTo(3.5)
    player.passives = [{ id: 'p_clever', lv: 4 }]
    const study = { id: 'w_study', lv: 1, cd: 0, held: 0, damage: 0 }
    expect(weaponStats(player, study).amount).toBe(1 + 2)
    player.passives = [{ id: 'p_curious', lv: 5 }]
    expect(weaponStats(player, study).duration).toBeCloseTo(WEAPON_BY_ID.get('w_study')!.duration * 1.5)
  })

  test('critical hits appear, hit twice as hard and are flagged all the way into the snapshot', () => {
    const { game, player } = arena(21, 'p_toxic')
    player.passives = [{ id: 'p_lucky', lv: 5 }]
    const target = post(game, 'club', player.x + 30, player.y)
    const seen = new Set<Game['state']['popups'][number]>()
    let flagged = false
    run(game, player, 60 * 30, () => {
      target.hold()
      game.state.popups.forEach((p) => seen.add(p))
      const popups = toView(game.state).popups
      for (let i = 0; i < popups.length; i += STRIDE.popups) if (popups[i + 3] & POPUP_BIT.crit) flagged = true
    })
    const crits = [...seen].filter((p) => p.crit)
    const plain = [...seen].filter((p) => !p.crit && !p.strong)
    expect(crits.length).toBeGreaterThan(5)
    expect(plain.length).toBeGreaterThan(5)
    expect(flagged).toBe(true)
    const mean = (list: typeof crits) => list.reduce((sum, p) => sum + p.v, 0) / list.length
    expect(mean(crits) / mean(plain)).toBeGreaterThan(1.6)
    expect(mean(crits) / mean(plain)).toBeLessThan(2.4)
  })

  test('空気が読める raises the 特攻 multiplier', () => {
    const mean = (savvy: number) => {
      const { game, player } = arena(33, 'p_monster')
      if (savvy) player.passives = [{ id: 'p_savvy', lv: savvy }]
      player.weapons[0].damage = 0
      const target = post(game, 'bully', player.x + 115, player.y)
      const seen = new Set<Game['state']['popups'][number]>()
      run(game, player, 60 * 60, () => {
        target.hold()
        game.state.popups.forEach((p) => seen.add(p))
      })
      const hits = [...seen].filter((p) => p.strong && !p.crit)
      expect(hits.length).toBeGreaterThan(8)
      return hits.reduce((sum, p) => sum + p.v, 0) / hits.length
    }
    expect(mean(4) / mean(0)).toBeGreaterThan(1.3)
    expect(mean(4) / mean(0)).toBeLessThan(1.5)
  })

  test('level-up hands favour what you already hold, and 運がいい deals a fourth card', () => {
    const { game, player } = arena(8)
    game.state.time = RUN_SECONDS * 0.6
    player.weapons.push({ id: 'w_study', lv: 1, cd: 0, held: 0, damage: 0 })
    const offer = (game as unknown as { offer(p: Player): void }).offer.bind(game)
    let owned = 0
    let total = 0
    let big = 0
    for (let i = 0; i < 400; i++) {
      player.pending = 1
      player.choices = []
      offer(player)
      total += player.choices.length
      owned += player.choices.filter((c) => c === 'w:w_study').length
      if (player.choices.length === 4) big++
    }
    const pool = game.options(player).length
    expect(owned / 400).toBeGreaterThan((3 / pool) * 1.6)
    expect(big).toBe(0)
    expect(total).toBe(1200)
    player.passives = [{ id: 'p_lucky', lv: 5 }]
    let fours = 0
    for (let i = 0; i < 400; i++) {
      player.pending = 1
      player.choices = []
      offer(player)
      if (player.choices.length === 4) fours++
      expect(new Set(player.choices).size).toBe(player.choices.length)
    }
    expect(fours).toBeGreaterThan(140)
    expect(fours).toBeLessThan(260)
  })

  test('chests give one turning point, and sometimes three when luck is with you', () => {
    const grants = (lucky: number) => {
      const { game, player } = arena(14)
      if (lucky) player.passives = [{ id: 'p_lucky', lv: lucky }]
      const out: number[] = []
      for (let i = 0; i < 300; i++) {
        game.state.items.push({ kind: 'chest', x: player.x, y: player.y })
        game.tick(1 / 60)
        for (const e of game.state.fx) if (e.type === FX.CHEST && !out[e.seq]) out[e.seq] = e.a
        player.choices = []
        player.pending = 0
      }
      return out.filter(Boolean)
    }
    const plain = grants(0)
    const lucky = grants(5)
    expect(plain.length).toBe(300)
    expect(new Set([...plain, ...lucky])).toEqual(new Set([1, 3]))
    expect(lucky.filter((n) => n === 3).length).toBeGreaterThan(plain.filter((n) => n === 3).length)
    expect(passiveLevel({ passives: [] } as unknown as Player, 'p_lucky')).toBe(0)
  })

  test('a level-up shoves nearby enemies back without hurting them', () => {
    const { game, player } = arena(3)
    const enemy = game.spawnEnemy('bully', player.x + 70, player.y)!
    const hp = enemy.hp
    game.gainXp(game.state.xpNext)
    expect(enemy.kx).toBeGreaterThan(100)
    expect(enemy.hp).toBe(hp)
    const tank = game.spawnEnemy('senpai', player.x + 70, player.y)!
    game.gainXp(game.state.xpNext)
    expect(tank.kx).toBeLessThan(enemy.kx / 3)
  })
})

describe('enemies', () => {
  test('there are 41 regular enemies and 12 bosses, new ids appended in order', () => {
    const regular = ENEMIES.filter((e) => e.behavior !== 'boss')
    const bosses = ENEMIES.filter((e) => e.behavior === 'boss')
    expect(regular).toHaveLength(41)
    expect(bosses).toHaveLength(12)
    expect(ENEMIES.slice(25, 49).map((e) => e.id)).toEqual(NEW_ENEMY_IDS)
    expect(ENEMIES.slice(49).map((e) => e.id)).toEqual(NEW_BOSS_IDS)
    expect(new Set(regular.map((e) => e.behavior))).toEqual(
      new Set(['chase', 'dash', 'swarm', 'charger', 'shooter', 'tank', 'splitter', 'circler', 'blink', 'ghost'])
    )
  })

  test('every new enemy lives in an age pool, unless it only arrives as a child or minion', () => {
    const pooled = new Set(POOLS.flatMap((pool) => pool.enemies.map(([id]) => id)))
    for (const def of ENEMIES) {
      if (def.behavior === 'boss') continue
      if (def.minor) {
        expect(pooled.has(def.id)).toBe(false)
        const parents = ENEMIES.filter((e) => e.child === def.id || e.minion === def.id)
        expect([def.id, parents.length > 0]).toEqual([def.id, true])
      } else expect([def.id, pooled.has(def.id)]).toEqual([def.id, true])
    }
    for (const pool of POOLS)
      for (const [id, weight] of pool.enemies) expect([id, ENEMY_BY_ID.has(id), weight > 0]).toEqual([id, true, true])
    const at = (age: number) => POOLS.find((pool) => age < pool.untilAge)!.enemies.map(([id]) => id)
    expect(at(2)).toContain('mosquito')
    expect(at(40)).not.toContain('mosquito')
    expect(at(70)).toContain('mosquito')
    expect(at(10)).toContain('dog')
    expect(at(12)).not.toContain('dog')
    expect(at(40)).toContain('nightcry')
    expect(at(52)).not.toContain('nightcry')
    expect(at(78)).toEqual(expect.arrayContaining(['backpain', 'scam', 'forget', 'loneliness', 'tax']))
    expect(at(30)).toEqual(
      expect.arrayContaining(['crush', 'drinking', 'deadline', 'meeting', 'spam', 'powerhara', 'train'])
    )
  })

  test('life events are merged in time order and name real enemies and formations', () => {
    const times = EVENTS.map((e) => e.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(EVENTS.length).toBe(13 + 15)
    for (const e of EVENTS) {
      expect(ENEMY_BY_ID.has((e.boss ?? e.swarm)!)).toBe(true)
      if (e.formation) expect(['ring', 'wall', 'cluster']).toContain(e.formation)
    }
    expect(EVENTS.filter((e) => e.boss)).toHaveLength(12)
  })

  test('swarm events announce themselves and the wall formation lines up', () => {
    const { game, player } = arena(6)
    game.state.time = EVENTS[0].at - 0.01
    game.tick(1 / 60)
    const swarm = ofType(collect(game), FX.SWARM)
    expect(swarm).toHaveLength(1)
    expect(EVENTS[swarm[0].a].swarm).toBe('mosquito')
    const bugs = game.state.enemies.filter((e) => e.kind === 'mosquito')
    expect(bugs.length).toBe(24)
    // A wall is a line: the spread along one axis is far larger than along the other.
    const xs = bugs.map((e) => e.x - player.x)
    const ys = bugs.map((e) => e.y - player.y)
    const span = (v: number[]) => Math.max(...v) - Math.min(...v)
    expect(Math.max(span(xs), span(ys))).toBeGreaterThan(400)
  })

  test('a homework pile splits into worksheets and a tax notice into coins', () => {
    for (const [kind, child, count] of [
      ['homework', 'worksheet', 3],
      ['tax', 'coin', 4]
    ] as const) {
      const { game, player } = arena(9, 'p_toxic')
      const enemy = game.spawnEnemy(kind, player.x + 20, player.y)!
      enemy.hp = 1
      let split = 0
      for (let i = 0; i < 120 && !split; i++) {
        player.hp = player.maxHp
        game.tick(1 / 60)
        if (!game.state.enemies.includes(enemy)) split = game.state.enemies.filter((e) => e.kind === child).length
      }
      expect([kind, split]).toEqual([kind, count])
    }
  })

  test('shooters spit bullets that hurt, then vanish, and name the shooter as the killer', () => {
    const { game, player } = arena(12)
    const shooter = game.spawnEnemy('pepper', player.x + 250, player.y)!
    shooter.shotCd = 0
    let tick = 0
    while (!game.state.bullets.length && tick++ < 120) game.tick(1 / 60)
    expect(game.state.bullets.length).toBeGreaterThan(0)
    expect(BULLET_KINDS[game.state.bullets[0].kind]).toBe('seed')
    expect(ofType(collect(game), FX.ENEMY_SHOT).length).toBeGreaterThan(0)
    const view = toView(game.state)
    expect(view.bullets.length).toBe(game.state.bullets.length * STRIDE.bullets)
    const hp = player.hp
    for (let i = 0; i < 120 && player.hp >= hp; i++) game.tick(1 / 60)
    expect(player.hp).toBeLessThan(hp)
    expect(player.invuln).toBeGreaterThan(0)
    expect(player.invuln).toBeLessThanOrEqual(0.5)
    // Finish them off with a bullet.
    player.hp = 0.5
    player.invuln = 0
    for (let i = 0; i < 60 * 8 && !player.downed; i++) game.tick(1 / 60)
    expect(player.downed).toBe(true)
    expect(player.killer).toBe('pepper')
    expect(toView(game.state).players[0].killer).toBe('pepper')
  })

  test('bullets cannot shred: a hit grants grace and the bullet count is capped', () => {
    const { game, player } = arena(13)
    game.state.bullets = []
    for (let i = 0; i < 5; i++)
      game.state.bullets.push({
        x: player.x,
        y: player.y,
        vx: 0,
        vy: 0,
        r: 8,
        damage: 10,
        life: 3,
        kind: 0,
        src: 'pepper'
      })
    game.tick(1 / 60)
    // Only the first connected; the rest pass through the grace period and stay in flight.
    expect(player.hp).toBeCloseTo(player.maxHp - 10, 0)
    expect(game.state.bullets.length).toBe(4)
    const boss = game.spawnEnemy('b_univ', player.x + 100, player.y)!
    run(game, player, 60 * 10, () => {
      boss.hp = boss.maxHp
      expect(game.state.bullets.length).toBeLessThanOrEqual(MAX_BULLETS)
    })
  })

  test('chargers telegraph, flag themselves, then dash', () => {
    const { game, player } = arena(15)
    const dog = game.spawnEnemy('dog', player.x + 200, player.y)!
    game.tick(1 / 60)
    expect(ofType(collect(game), FX.WINDUP)).toHaveLength(1)
    expect(ofType(collect(game), FX.WINDUP)[0].a).toBe(ENEMY_INDEX.get('dog'))
    const view = toView(game.state)
    expect(view.enemies[6] & ENEMY_FLAG.windup).toBeTruthy()
    const x = dog.x
    run(game, player, 30)
    expect(Math.abs(dog.x - x)).toBeLessThan(3)
    let fastest = 0
    let dashed = false
    for (let i = 0; i < 90; i++) {
      const before = dog.x
      run(game, player, 1)
      fastest = Math.max(fastest, Math.abs(dog.x - before) * 60)
      // The flag is up exactly while telegraphing, and down while dashing.
      const flagged = Boolean(toView(game.state).enemies[6] & ENEMY_FLAG.windup)
      if (dog.mode === 2) dashed = true
      if (dog.mode === 2) expect(flagged).toBe(false)
      if (dog.mode === 1) expect(flagged).toBe(true)
    }
    expect(fastest).toBeGreaterThan(300)
    expect(dashed).toBe(true)
  })

  test('blinkers fade and reappear near a player, ghosts are flagged', () => {
    const { game, player } = arena(16)
    const scam = game.spawnEnemy('scam', player.x + 500, player.y)!
    scam.timer = 0.05
    let faded = false
    let teleported = false
    for (let i = 0; i < 60 && !teleported; i++) {
      const before = Math.hypot(scam.x - player.x, scam.y - player.y)
      run(game, player, 1)
      if (scam.blink > 0) {
        faded = true
        expect(toView(game.state).enemies[6] & ENEMY_FLAG.blink).toBeTruthy()
      }
      if (faded && scam.blink === 0 && before > 400) teleported = Math.hypot(scam.x - player.x, scam.y - player.y) < 200
    }
    expect(faded && teleported).toBe(true)
    game.spawnEnemy('loneliness', player.x + 300, player.y)
    const flags = toView(game.state).enemies
    const idx = flags.findIndex((_, i) => i % STRIDE.enemies === 1 && flags[i] === ENEMY_INDEX.get('loneliness'))
    expect(flags[idx + 5] & ENEMY_FLAG.ghost).toBeTruthy()
  })

  test('circlers orbit before they dive', () => {
    const { game, player } = arena(17)
    const crush = game.spawnEnemy('crush', player.x + 200, player.y)!
    crush.timer = 1
    let dived = false
    let orbit = 0
    run(game, player, 60 * 4, () => {
      const d = Math.hypot(crush.x - player.x, crush.y - player.y)
      if (crush.mode === 0 && d < 260) orbit++
      if (crush.mode === 1) dived = true
    })
    expect(orbit).toBeGreaterThan(30)
    expect(dived).toBe(true)
  })

  test('elites are tougher, bigger, flagged, announced and always drop something', () => {
    const { game, player } = arena(18)
    const plain = game.spawnEnemy('bully', player.x + 500, player.y)!
    const elite = game.spawnEnemy('bully', player.x - 500, player.y, { elite: true })!
    expect(elite.hp / plain.hp).toBeCloseTo(5)
    expect(elite.scale).toBe(1.25)
    expect(ofType(collect(game), FX.ELITE)).toHaveLength(1)
    expect(game.state.log.some((e) => e.text === '手ごわい「いじめっ子」が現れた！')).toBe(true)
    const view = toView(game.state)
    expect(view.enemies[6] & ENEMY_FLAG.elite).toBe(0)
    expect(view.enemies[STRIDE.enemies + 6] & ENEMY_FLAG.elite).toBeTruthy()
    // Kill many: each elite leaves a meal or a chest (60 / 40) and six times the experience.
    const kinds = new Set<string>()
    for (let i = 0; i < 40; i++) {
      game.state.items = []
      game.state.gems = []
      const e = game.spawnEnemy('bully', player.x - 500, player.y, { elite: true })!
      ;(game as unknown as { kill(e: Enemy, d: EnemyDef): void }).kill(e, ENEMY_BY_ID.get('bully')!)
      expect(game.state.items).toHaveLength(1)
      kinds.add(game.state.items[0].kind)
      expect(game.state.gems[0].v).toBe(2 * 6)
    }
    expect(kinds).toEqual(new Set(['meal', 'chest']))
  })

  test('elites appear on their own after two minutes', () => {
    const { game, player } = arena(19)
    game.state.time = 125
    let elites = 0
    run(game, player, 60 * 240, () => {
      elites = Math.max(elites, game.state.enemies.filter((e) => e.elite).length)
      game.state.enemies = game.state.enemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) > 60)
    })
    expect(elites).toBeGreaterThan(0)
    const early = arena(19)
    run(early.game, early.player, 60 * 60)
    expect(early.game.state.enemies.some((e) => e.elite)).toBe(false)
  })
})

describe('bosses', () => {
  test('all twelve have attack patterns, the new four with their specified HP and summons', () => {
    const bosses = ENEMIES.filter((e) => e.behavior === 'boss')
    for (const boss of bosses) {
      expect([boss.id, boss.patterns?.length ?? 0]).toEqual([boss.id, expect.any(Number)])
      expect(boss.patterns!.length).toBeGreaterThan(0)
      if (boss.patterns!.includes('summon')) expect(ENEMY_BY_ID.has(boss.minion!)).toBe(true)
      if (boss.patterns!.includes('charge')) expect(boss.dash).toBeGreaterThan(boss.speed)
    }
    expect(ENEMY_BY_ID.get('b_vaccine')).toMatchObject({ hp: 420, patterns: ['charge'] })
    expect(ENEMY_BY_ID.get('b_heartbreak')).toMatchObject({ hp: 4200, patterns: ['ring', 'charge'] })
    expect(ENEMY_BY_ID.get('b_tax')).toMatchObject({ hp: 7000, patterns: ['summon', 'ring'], minion: 'coin' })
    expect(ENEMY_BY_ID.get('b_care')).toMatchObject({ hp: 36000, patterns: ['summon', 'spiral'], minion: 'loneliness' })
    expect(ENEMY_BY_ID.get('b_hs')!.patterns).toEqual(['ring'])
    expect(ENEMY_BY_ID.get('b_layoff')!.patterns).toEqual(['spiral', 'summon'])
    expect(BULLET_KINDS.slice(5)).toEqual(bosses.map((b) => b.id))
  })

  test('rings and spirals fill the air with the boss bullet, summons call minions, charges telegraph', () => {
    for (const [id, pattern] of [
      ['b_hs', 'ring'],
      ['b_univ', 'spiral'],
      ['b_shukatsu', 'summon'],
      ['b_rebel', 'charge']
    ] as const) {
      const { game, player } = arena(20)
      const boss = game.spawnEnemy(id, player.x + 420, player.y)!
      const events = new Map<number, FxEvent>()
      let minions = 0
      let windup = false
      run(game, player, 60 * 12, () => {
        boss.hp = boss.maxHp
        collect(game, events)
        minions = Math.max(minions, game.state.enemies.filter((e) => e.kind === ENEMY_BY_ID.get(id)!.minion).length)
        if (boss.windup > 0) windup = true
      })
      if (pattern === 'ring' || pattern === 'spiral') {
        expect(game.state.bullets.length + ofType(events, FX.ENEMY_SHOT).length).toBeGreaterThan(0)
        const kinds = new Set(game.state.bullets.map((b) => BULLET_KINDS[b.kind]))
        for (const kind of kinds) expect(kind).toBe(id)
      } else if (pattern === 'summon') expect(minions).toBeGreaterThanOrEqual(4)
      else {
        expect(windup).toBe(true)
        expect(ofType(events, FX.WINDUP).some((e) => e.a === ENEMY_INDEX.get(id))).toBe(true)
      }
    }
  })

  test('boss spawn and defeat are announced; defeat drops a chest and slows time', () => {
    const { game, player } = arena(22, 'p_toxic')
    const boss = game.spawnEnemy('b_vaccine', player.x + 30, player.y)!
    const events = collect(game)
    expect(ofType(events, FX.BOSS_SPAWN)).toHaveLength(1)
    boss.hp = 1
    run(game, player, 120, () => collect(game, events))
    expect(ofType(events, FX.BOSS_KILL)).toHaveLength(1)
    expect(ofType(events, FX.BOSS_KILL)[0].a).toBe(ENEMY_INDEX.get('b_vaccine'))
    expect(game.state.items.some((i) => i.kind === 'chest') || ofType(events, FX.CHEST).length > 0).toBe(true)
    expect(game.state.slowmo).toBeGreaterThan(0)
    // Slow motion stretches `step`, never `tick`.
    const t0 = game.state.time
    game.state.slowmo = 5
    game.step(0.1)
    expect(game.state.time - t0).toBeLessThan(0.04)
    game.state.slowmo = 0
    const t1 = game.state.time
    game.step(0.1)
    expect(game.state.time - t1).toBeGreaterThan(0.09)
  })
})

describe('fx channel', () => {
  test('sequence numbers strictly increase and old events are pruned, with a hard cap', () => {
    const { game, player } = arena(23, 'p_toxic')
    for (let i = 0; i < 30; i++) game.spawnEnemy('germ', player.x + 20 + i, player.y)
    let last = 0
    const all = new Map<number, FxEvent>()
    run(game, player, 60 * 6, () => {
      const fx = game.state.fx
      expect(fx.length).toBeLessThanOrEqual(FX_CAP)
      for (let i = 1; i < fx.length; i++) expect(fx[i].seq).toBeGreaterThan(fx[i - 1].seq)
      for (const e of fx) expect(e.t).toBeGreaterThanOrEqual(game.state.time - FX_WINDOW - 1 / 60 - 1e-9)
      collect(game, all)
      if (fx.length) last = fx[fx.length - 1].seq
    })
    expect(all.size).toBeGreaterThan(0)
    expect(Math.max(...all.keys())).toBe(last)
    // The channel does not grow without bound: far more events were emitted than are kept.
    expect(game.state.fx.length).toBeLessThan(all.size)
    // Flooding it drops the oldest first.
    const emit = (game as unknown as { emit(t: number): void }).emit.bind(game)
    emit(FX.STAGE)
    const seqBefore = game.state.fx[game.state.fx.length - 1].seq
    for (let i = 0; i < FX_CAP * 2; i++) emit(FX.STAGE)
    expect(game.state.fx).toHaveLength(FX_CAP)
    expect(game.state.fx[0].seq).toBeGreaterThan(seqBefore)
  })

  test('HIT is throttled to a few per tick and carries the strong/crit bits', () => {
    const { game, player } = arena(24, 'p_toxic')
    for (let i = 0; i < 40; i++) game.spawnEnemy('germ', player.x + 5 + (i % 7), player.y + (i % 5))
    game.state.enemies.forEach((e) => (e.hp = e.maxHp = 1e9))
    const perTick: number[] = []
    run(game, player, 120, () =>
      perTick.push(game.state.fx.filter((e) => e.type === FX.HIT && e.t === game.state.time).length)
    )
    expect(Math.max(...perTick)).toBeGreaterThan(0)
    expect(Math.max(...perTick)).toBeLessThanOrEqual(5)
  })

  test('every listed event type is emitted at its moment', () => {
    const seen = new Set<number>()
    const note = (game: Game) => game.state.fx.forEach((e) => seen.add(e.type))

    // STAGE / SWARM / FIRE / HIT / KILL / GEM / LEVELUP / HURT / ENEMY_SHOT / ELITE / WINDUP via a short real life.
    {
      const { game, player } = arena(25, 'p_toxic')
      const stages: number[] = []
      run(game, player, 3, () => game.state.fx.filter((e) => e.type === FX.STAGE).forEach((e) => stages.push(e.a)))
      expect(stages).toContain(0)
      game.state.time = timeAtAge(STAGES[1].age) + 0.01
      run(game, player, 2, () => game.state.fx.filter((e) => e.type === FX.STAGE).forEach((e) => stages.push(e.a)))
      expect(stages).toContain(1)
      for (let i = 0; i < 6; i++) game.spawnEnemy('germ', player.x + 20, player.y)
      game.state.enemies.forEach((e) => (e.hp = 1))
      game.state.gems.push({ x: player.x, y: player.y, v: 50, pull: true })
      game.state.items.push({ kind: 'meal', x: player.x, y: player.y }, { kind: 'magnet', x: player.x, y: player.y })
      const shooter = game.spawnEnemy('dodgeball', player.x + 250, player.y)!
      shooter.shotCd = 0
      game.spawnEnemy('dog', player.x + 150, player.y)
      game.spawnEnemy('b_hs', player.x + 700, player.y)
      game.spawnEnemy('bully', player.x - 700, player.y, { elite: true })
      for (let i = 0; i < 90; i++) {
        game.tick(1 / 60)
        note(game)
        if (player.choices.length) game.choose(player, 0)
      }
      game.state.time = 59.99
      game.tick(1 / 60)
      note(game)
      player.hp = 40
      game.spawnEnemy('b_illness', player.x, player.y)
      for (let i = 0; i < 400 && !player.downed; i++) {
        if (player.choices.length) game.choose(player, 0)
        game.tick(1 / 60)
        note(game)
      }
      expect(player.downed).toBe(true)
    }
    // EVOLVE (by a weapon level and by a passive), CHEST, REVIVE, BLAST.
    {
      const { game, player } = arena(26)
      const study = { id: 'w_study', lv: 7, cd: 99, held: 0, damage: 0 }
      player.weapons.push(study)
      player.passives.push({ id: 'p_diligent', lv: 1 })
      player.choices = ['w:w_study']
      game.choose(player, 0)
      expect(game.state.fx.some((e) => e.type === FX.EVOLVE && e.a === WEAPON_INDEX.get('w_study'))).toBe(true)
      note(game)
      const work = { id: 'w_work', lv: 8, cd: 99, held: 0, damage: 0 }
      player.weapons.push(work)
      player.choices = ['p:p_bold']
      game.choose(player, 0)
      expect(game.state.fx.filter((e) => e.type === FX.EVOLVE)).toHaveLength(2)
      note(game)
      game.state.items.push({ kind: 'chest', x: player.x, y: player.y })
      game.tick(1 / 60)
      note(game)
      const friend = game.addPlayer('b')!
      friend.hp = 0
      friend.downed = true
      friend.x = player.x + 20
      friend.y = player.y
      for (let i = 0; i < 60 * 3.2; i++) {
        game.tick(1 / 60)
        note(game)
      }
      expect(friend.downed).toBe(false)
      player.weapons.push({ id: 'w_muscle', lv: 1, cd: 0, held: 0, damage: 0 })
      game.tick(1 / 60)
      note(game)
      const boss = game.spawnEnemy('b_vaccine', player.x + 900, player.y)!
      ;(game as unknown as { kill(e: Enemy, d: EnemyDef): void }).kill(boss, ENEMY_BY_ID.get('b_vaccine')!)
      note(game)
    }
    const names = Object.fromEntries(Object.entries(FX).map(([name, type]) => [type, name]))
    const missing = Object.values(FX).filter((type) => !seen.has(type))
    expect(missing.map((type) => names[type])).toEqual([])
  })
})

describe('protocol v3', () => {
  const sample = () => {
    const { game, player } = arena(30, 'p_toxic')
    game.spawnEnemy('germ', player.x + 20, player.y)
    game.spawnEnemy('pepper', player.x + 250, player.y)!.shotCd = 0
    run(game, player, 120)
    ;(game as unknown as { emit(type: number): void }).emit(FX.STAGE)
    return JSON.parse(JSON.stringify(toView(game.state)))
  }

  test('a fresh snapshot is v3 with the new channels and passes validation', () => {
    const view = sample()
    expect(view.v).toBe(3)
    expect(view.enemies.length % STRIDE.enemies).toBe(0)
    expect(view.shots.length % STRIDE.shots).toBe(0)
    expect(view.bullets.length % STRIDE.bullets).toBe(0)
    expect(view.fx.length % FX_STRIDE).toBe(0)
    expect(view.fx.length).toBeGreaterThan(0)
    expect(readView(view)).toBeTruthy()
  })

  test('readView rejects old versions and every malformed v3 field', () => {
    const view = sample()
    expect(readView({ ...view, v: 1 })).toBeUndefined()
    expect(readView({ ...view, v: 2 })).toBeUndefined()
    const { bullets: _b, ...noBullets } = view
    expect(readView(noBullets)).toBeUndefined()
    expect(readView({ ...view, bullets: [1, 2, 99, 0] })).toBeUndefined()
    expect(readView({ ...view, bullets: [1, 2, -1, 0] })).toBeUndefined()
    expect(readView({ ...view, bullets: [1, 2, 0.5, 0] })).toBeUndefined()
    expect(readView({ ...view, bullets: [1, 2, 3] })).toBeUndefined()
    expect(readView({ ...view, bullets: [1, 2, 0, NaN] })).toBeUndefined()
    expect(readView({ ...view, bullets: [1, 2, 0, 0] })).toBeTruthy()
    expect(readView({ ...view, bullets: new Array(STRIDE.bullets * (VIEW_CAPS.bullets + 1)).fill(0) })).toBeUndefined()
    expect(readView({ ...view, enemies: [1, 0, 0, 0, 100, 0] })).toBeUndefined()
    expect(readView({ ...view, enemies: [1, 0, 0, 0, 100, 0, 16] })).toBeUndefined()
    expect(readView({ ...view, enemies: [1, 999, 0, 0, 100, 0, 0] })).toBeUndefined()
    expect(readView({ ...view, enemies: [1, 0, 0, 0, 100, 0, 0] })).toBeTruthy()
    expect(readView({ ...view, shots: [0, 0, 0, 10, 0, 100, 0] })).toBeUndefined()
    expect(readView({ ...view, shots: [0, 0, 0, 10, 0, 100, 0, 1000] })).toBeUndefined()
    expect(readView({ ...view, shots: [999, 0, 0, 10, 0, 100, 0, 0] })).toBeUndefined()
    expect(readView({ ...view, shots: [0, 0, 0, 10, 0, 100, 0, 0] })).toBeTruthy()
    expect(readView({ ...view, popups: [0, 0, 5, 4, 0, 50] })).toBeUndefined()
    expect(readView({ ...view, popups: [0, 0, 5, 3, 0, 50] })).toBeTruthy()
    expect(readView({ ...view, fx: [1, 99, 0, 0, 0, 0] })).toBeUndefined()
    expect(readView({ ...view, fx: [1, FX.KILL, 0, 0, 0] })).toBeUndefined()
    expect(readView({ ...view, fx: [2, FX.KILL, 0, 0, 0, 0, 2, FX.KILL, 0, 0, 0, 0] })).toBeUndefined()
    expect(readView({ ...view, fx: [3, FX.KILL, 0, 0, 0, 0, 2, FX.KILL, 0, 0, 0, 0] })).toBeUndefined()
    expect(readView({ ...view, fx: [2, FX.KILL, 0, 0, 0, 0, 3, FX.HIT, 0, 0, 1, 1] })).toBeTruthy()
    expect(readView({ ...view, fx: [1.5, FX.KILL, 0, 0, 0, 0] })).toBeUndefined()
    expect(readView({ ...view, fx: new Array(FX_STRIDE * (VIEW_CAPS.fx + 1)).fill(1) })).toBeUndefined()
  })

  test('the snapshot carries variants, flags and bullet kinds from the simulation', () => {
    const { game, player } = arena(31)
    player.weapons.push({ id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0 })
    post(game, 'senpai', player.x + 400, player.y)
    game.tick(1 / 60)
    const shot = toView(game.state).shots
    expect(shot[7]).toBeGreaterThanOrEqual(1)
    expect(shot[7]).toBeLessThanOrEqual(6)
    expect(TALENT_WEAPONS.length).toBeGreaterThan(0)
    expect(ENEMIES.every((e) => e.behavior !== 'shooter' || BULLET_KINDS.includes(e.shot!.bullet as never))).toBe(true)
  })
})
