import {
  ENEMY_BY_ID,
  LEVEL_TEXT,
  EVENTS,
  MAX_GAME_PLAYERS,
  MAX_PASSIVE_LEVEL,
  MAX_WEAPON_LEVEL,
  PARENTS,
  PASSIVES,
  PASSIVE_BY_ID,
  PASSIVE_SLOTS,
  PLAYER_COLORS,
  POOLS,
  RUN_SECONDS,
  TALENT_CATEGORIES,
  TALENT_WEAPONS,
  WEAPON_BY_ID,
  WEAPON_SLOTS,
  ageAt,
  type EnemyDef,
  type TalentCategory,
  type Tag,
  type WeaponDef
} from './data'

export const STRONG_MULTIPLIER = 2.5
export const GIFTED = 1.7
export const POOR = 0.55
export const SPAWN_RADIUS = 780
export const VIEW_HALF = { x: 640, y: 360 }
export const REAPER_SECONDS = 4
const PLAYER_RADIUS = 14
const BASE_SPEED = 135
const STEP = 1 / 60
const MAX_ENEMIES = 560
const MAX_GEMS = 320
const MAX_SHOTS = 420
const CELL = 80

export interface Input {
  x: number
  y: number
  /** Index of the chosen level-up card, valid only for the matching choiceSeq. */
  pick: number
  pickSeq: number
}

export interface OwnedWeapon {
  id: string
  lv: number
  cd: number
  /** Seconds held; investments compound with it. */
  held: number
  damage: number
}

export interface Player {
  id: string
  name: string
  color: string
  x: number
  y: number
  fx: number
  fy: number
  hp: number
  maxHp: number
  downed: boolean
  revive: number
  parent: string
  talents: Record<TalentCategory, number>
  weapons: OwnedWeapon[]
  passives: { id: string; lv: number }[]
  choices: string[]
  choiceSeq: number
  pending: number
  hurt: number
  /** Enemy id that dealt the final blow while downed (picks the death animation and the result text). */
  killer?: string
}

export interface Enemy {
  id: number
  kind: string
  x: number
  y: number
  hp: number
  maxHp: number
  kx: number
  ky: number
  vx: number
  vy: number
  slow: number
  life: number
  flash: number
}

export interface Shot {
  id: number
  owner: string
  weapon: string
  kind: WeaponDef['behavior']
  x: number
  y: number
  vx: number
  vy: number
  r: number
  angle: number
  orbit: number
  spin: number
  life: number
  maxLife: number
  damage: number
  pierce: number
  tick: number
  knockback: number
  strong: Tag[]
  hits: Map<number, number>
  /** Whip half-extents (x along facing). */
  w: number
  h: number
}

export interface Gem {
  x: number
  y: number
  v: number
  pull: boolean
}

export interface Item {
  kind: 'meal' | 'chest' | 'magnet'
  x: number
  y: number
}

export interface Popup {
  x: number
  y: number
  v: number
  strong: boolean
  owner: string
  life: number
}

export interface LogEntry {
  t: number
  text: string
  to?: string
}

export interface GameState {
  time: number
  phase: 'playing' | 'reaper' | 'won' | 'lost'
  level: number
  xp: number
  xpNext: number
  kills: number
  players: Player[]
  enemies: Enemy[]
  shots: Shot[]
  gems: Gem[]
  items: Item[]
  popups: Popup[]
  log: LogEntry[]
  eventIndex: number
  reaper?: { x: number; y: number }
  nextId: number
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const xpForLevel = (level: number) => Math.round(5 + level * 6 + level * level * 0.3)

export const passiveLevel = (player: Player, id: string) => player.passives.find((p) => p.id === id)?.lv ?? 0
export const weaponSlots = (player: Player) => WEAPON_SLOTS + (player.parent === 'p_free' ? 1 : 0)
const talentWeaponCount = (player: Player) => player.weapons.filter((w) => !WEAPON_BY_ID.get(w.id)?.parent).length

export function isEvolved(player: Player, weapon: OwnedWeapon) {
  const def = WEAPON_BY_ID.get(weapon.id)
  return Boolean(def?.evolve && weapon.lv >= MAX_WEAPON_LEVEL && passiveLevel(player, def.evolve.passive) > 0)
}

export function weaponName(player: Player, weapon: OwnedWeapon) {
  const def = WEAPON_BY_ID.get(weapon.id)!
  return isEvolved(player, weapon) ? def.evolve!.name : def.name
}

export interface PlayerStats {
  maxHp: number
  armor: number
  regen: number
  speed: number
  magnet: number
  xpGain: number
  might: number
  cooldown: number
  area: number
}

export function playerStats(player: Player): PlayerStats {
  const p = (id: string) => passiveLevel(player, id)
  return {
    maxHp: 100 + p('p_bold') * 20 + (player.parent === 'p_gone' ? 60 : 0) + (player.parent === 'p_toxic' ? -10 : 0),
    armor: p('p_stubborn') + (player.parent === 'p_over' ? 1 : 0),
    regen: p('p_optimist') * 0.4 + p('p_kind') * 0.2 + (player.parent === 'p_gone' ? 1 : 0),
    speed: BASE_SPEED * (1 + p('p_healthy') * 0.08),
    magnet: 64 * (1 + p('p_greedy') * 0.25),
    xpGain: (1 + p('p_greedy') * 0.1) * (player.parent === 'p_weak' ? 1.25 : 1),
    might: 1 + p('p_hot') * 0.1,
    cooldown: Math.max(0.5, 1 - p('p_diligent') * 0.07),
    area: 1 + p('p_kind') * 0.08
  }
}

export interface WeaponStats {
  damage: number
  cooldown: number
  amount: number
  area: number
  duration: number
}

/** Everything that multiplies a weapon, including the hidden talent. */
export function weaponStats(player: Player, weapon: OwnedWeapon, stats = playerStats(player)): WeaponStats {
  const def = WEAPON_BY_ID.get(weapon.id)!
  const lv = weapon.lv
  const evolved = isEvolved(player, weapon)
  let damage = def.damage * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.3 : 1) * (lv >= 8 ? 1.4 : 1) * stats.might
  if (def.category) damage *= player.talents[def.category]
  if (evolved) damage *= 1.6
  if (weapon.id === 'w_study' && player.parent === 'p_edu') damage *= 1.3
  if (weapon.id === 'w_invest') {
    if (player.parent === 'p_rich') damage *= 1.3
    damage *= 1 + passiveLevel(player, 'p_greedy') * 0.15
    damage *= 1 + weapon.held / 150
  }
  return {
    damage,
    cooldown: def.cooldown * (lv >= 7 ? 0.85 : 1) * stats.cooldown * (evolved ? 0.8 : 1),
    amount: def.amount + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0) + (lv >= 8 ? 1 : 0) + (evolved ? 1 : 0),
    area: (lv >= 4 ? 1.25 : 1) * stats.area * (evolved ? 1.2 : 1),
    duration: def.duration * (evolved ? 1.3 : 1)
  }
}

export function choiceText(player: Player, choice: string): { icon: string; name: string; text: string; tag: string } {
  const [kind, id] = choice.split(':')
  if (kind === 'w') {
    const def = WEAPON_BY_ID.get(id)!
    const owned = player.weapons.find((w) => w.id === id)
    if (!owned) return { icon: def.icon, name: def.name, text: def.desc, tag: 'NEW' }
    const next = owned.lv + 1
    const evolves =
      next === MAX_WEAPON_LEVEL && def.evolve && passiveLevel(player, def.evolve.passive)
        ? `・${def.evolve.name}に進化！`
        : ''
    return {
      icon: def.icon,
      name: def.name,
      text: `${LEVEL_TEXT[next]}${evolves}`,
      tag: `Lv ${next}`
    }
  }
  if (kind === 'p') {
    const def = PASSIVE_BY_ID.get(id)!
    const lv = passiveLevel(player, id)
    return { icon: def.icon, name: def.name, text: def.desc, tag: lv ? `Lv ${lv + 1}` : '性格' }
  }
  return choice === 'x:meal'
    ? { icon: '🍙', name: 'ごはん', text: '精神力を 40 回復', tag: '' }
    : { icon: '💴', name: 'お小遣い', text: '経験値を少しもらう', tag: '' }
}

export class Game {
  state: GameState
  private readonly rng: () => number
  private grid = new Map<number, Enemy[]>()
  private spawnDebt = 0
  private inputs = new Map<string, Input>()
  private accumulator = 0

  constructor(seed = Date.now()) {
    this.rng = mulberry32(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b))
    this.state = {
      time: 0,
      phase: 'playing',
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      kills: 0,
      players: [],
      enemies: [],
      shots: [],
      gems: [],
      items: [],
      popups: [],
      log: [],
      eventIndex: 0,
      nextId: 1
    }
  }

  random() {
    return this.rng()
  }

  addPlayer(id: string, parentId?: string): Player | undefined {
    const state = this.state
    const existing = state.players.find((player) => player.id === id)
    if (existing) return existing
    if (state.players.length >= MAX_GAME_PLAYERS) return undefined
    const index = state.players.length
    const parent = parentId ?? PARENTS[Math.floor(this.rng() * PARENTS.length)].id
    // Hidden talents: two gifts, one or two weaknesses, the rest ordinary.
    const order = [...TALENT_CATEGORIES].sort(() => this.rng() - 0.5)
    const talents = Object.fromEntries(TALENT_CATEGORIES.map((c) => [c, 1])) as Record<TalentCategory, number>
    talents[order[0]] = GIFTED
    talents[order[1]] = GIFTED
    talents[order[2]] = POOR
    if (this.rng() < 0.5) talents[order[3]] = POOR
    const anchor = state.players.find((p) => !p.downed)
    const player: Player = {
      id,
      name: `P${index + 1}`,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      x: (anchor?.x ?? 0) + (index ? Math.cos(index) * 40 : 0),
      y: (anchor?.y ?? 0) + (index ? Math.sin(index) * 40 : 0),
      fx: 1,
      fy: 0,
      hp: 0,
      maxHp: 0,
      downed: false,
      revive: 0,
      parent,
      talents,
      weapons: parent === 'p_gone' ? [] : [{ id: parent, lv: 1, cd: 0.5, held: 0, damage: 0 }],
      passives: [],
      choices: [],
      choiceSeq: 0,
      pending: 0,
      hurt: 0
    }
    player.maxHp = player.hp = playerStats(player).maxHp
    state.players.push(player)
    const parentDef = WEAPON_BY_ID.get(parent)!
    this.log(`${player.name}が生まれた。親は「${parentDef.name}」。`)
    return player
  }

  removePlayer(id: string) {
    this.state.players = this.state.players.filter((player) => player.id !== id)
    this.inputs.delete(id)
    this.state.shots = this.state.shots.filter((shot) => shot.owner !== id)
  }

  setInput(id: string, raw: unknown) {
    if (!raw || typeof raw !== 'object') return
    const value = raw as Record<string, unknown>
    const num = (v: unknown, lo: number, hi: number, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
    let x = num(value.x, -1, 1, 0)
    let y = num(value.y, -1, 1, 0)
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    const pick = Math.trunc(num(value.pick, -1, 3, -1))
    const pickSeq = Math.trunc(num(value.pickSeq, -1, Number.MAX_SAFE_INTEGER, -1))
    this.inputs.set(id, { x, y, pick, pickSeq })
    const player = this.state.players.find((p) => p.id === id)
    if (player && pick >= 0 && pickSeq === player.choiceSeq && pick < player.choices.length) this.choose(player, pick)
  }

  /** Solo play pauses on a level-up, like a board game turn; co-op keeps running. */
  get paused() {
    const players = this.state.players
    return players.length === 1 && players[0].choices.length > 0
  }

  step(dt: number) {
    this.accumulator = Math.min(this.accumulator + dt, 0.25)
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP
      this.tick(STEP)
    }
  }

  private log(text: string, to?: string) {
    this.state.log.push({ t: this.state.time, text, to })
    if (this.state.log.length > 8) this.state.log.shift()
  }

  tick(dt: number) {
    const state = this.state
    for (const popup of state.popups) popup.life -= dt
    state.popups = state.popups.filter((popup) => popup.life > 0)
    if (state.phase === 'won' || state.phase === 'lost' || this.paused || !state.players.length) return
    if (state.phase === 'reaper') return this.reaperTick(dt)
    state.time += dt
    if (state.time >= RUN_SECONDS) return this.summonReaper()
    this.movePlayers(dt)
    this.runEvents()
    this.spawn(dt)
    this.buildGrid()
    this.moveEnemies(dt)
    this.fireWeapons(dt)
    this.moveShots(dt)
    this.collectGems(dt)
    this.revivePlayers(dt)
    if (state.players.every((player) => player.downed)) {
      state.phase = 'lost'
      this.log(`心が折れた… 享年${ageAt(state.time)}歳`)
    }
  }

  private summonReaper() {
    const state = this.state
    state.time = RUN_SECONDS
    state.phase = 'reaper'
    state.enemies = []
    state.shots = []
    const anchor = state.players[0]
    state.reaper = { x: anchor.x + 420, y: anchor.y - 260 }
    this.log('死神が迎えに来た。寿命が尽きる——')
  }

  private reaperTick(dt: number) {
    const state = this.state
    state.time = Math.min(RUN_SECONDS + REAPER_SECONDS, state.time + dt)
    const target = state.players[0]
    const reaper = state.reaper!
    reaper.x += (target.x + 40 - reaper.x) * Math.min(1, dt * 1.2)
    reaper.y += (target.y - 30 - reaper.y) * Math.min(1, dt * 1.2)
    if (state.time >= RUN_SECONDS + REAPER_SECONDS) {
      state.phase = 'won'
      this.log(`大往生。享年${ageAt(RUN_SECONDS)}歳、人生をまっとうした。`)
    }
  }

  private movePlayers(dt: number) {
    for (const player of this.state.players) {
      const stats = playerStats(player)
      player.maxHp = stats.maxHp
      player.hurt = Math.max(0, player.hurt - dt)
      if (player.downed) continue
      const input = this.inputs.get(player.id) ?? { x: 0, y: 0, pick: -1, pickSeq: -1 }
      // Level-up choices slow you down in co-op so picking is not a death sentence.
      const speed = stats.speed * (player.choices.length ? 0.6 : 1)
      player.x += input.x * speed * dt
      player.y += input.y * speed * dt
      if (input.x || input.y) {
        const l = Math.hypot(input.x, input.y)
        player.fx = input.x / l
        player.fy = input.y / l
      }
      player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt)
      const kind = passiveLevel(player, 'p_kind')
      if (kind)
        for (const friend of this.state.players)
          if (friend !== player && !friend.downed && Math.hypot(friend.x - player.x, friend.y - player.y) < 140)
            friend.hp = Math.min(friend.maxHp, friend.hp + kind * 0.5 * dt)
      if (!player.choices.length && player.pending > 0) this.offer(player)
    }
  }

  private runEvents() {
    const state = this.state
    while (state.eventIndex < EVENTS.length && state.time >= EVENTS[state.eventIndex].at) {
      const event = EVENTS[state.eventIndex++]
      this.log(event.text)
      if (event.boss) this.spawnEnemy(event.boss)
      if (event.swarm) {
        const count = Math.round((event.count ?? 20) * this.playerFactor())
        const anchor = this.randomAlive()
        if (!anchor) continue
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2
          this.spawnEnemy(
            event.swarm,
            anchor.x + Math.cos(angle) * SPAWN_RADIUS,
            anchor.y + Math.sin(angle) * SPAWN_RADIUS
          )
        }
      }
    }
  }

  playerFactor() {
    return 1 + (this.state.players.length - 1) * 0.6
  }

  hpScale() {
    const minutes = this.state.time / 60
    return (1 + minutes * 0.14 + minutes * minutes * 0.004) * (1 + (this.state.players.length - 1) * 0.45)
  }

  targetPopulation() {
    const progress = this.state.time / RUN_SECONDS
    return Math.min(MAX_ENEMIES, Math.round((14 + progress * 300) * this.playerFactor()))
  }

  private randomAlive() {
    const alive = this.state.players.filter((player) => !player.downed)
    return alive[Math.floor(this.rng() * alive.length)]
  }

  private spawn(dt: number) {
    const state = this.state
    const deficit = this.targetPopulation() - state.enemies.length
    if (deficit <= 0) return
    this.spawnDebt += Math.min(deficit, 6 + state.time / 30) * dt * 2
    const age = ageAt(state.time)
    const pool = POOLS.find((entry) => age < entry.untilAge)!.enemies
    const total = pool.reduce((sum, [, weight]) => sum + weight, 0)
    while (this.spawnDebt >= 1) {
      this.spawnDebt--
      let roll = this.rng() * total
      let kind = pool[0][0]
      for (const [id, weight] of pool) {
        roll -= weight
        if (roll <= 0) {
          kind = id
          break
        }
      }
      this.spawnEnemy(kind)
    }
  }

  spawnEnemy(kind: string, x?: number, y?: number) {
    const state = this.state
    const def = ENEMY_BY_ID.get(kind)!
    const anchor = this.randomAlive()
    if (!anchor || state.enemies.length >= MAX_ENEMIES + 20) return
    if (x === undefined || y === undefined) {
      const angle = this.rng() * Math.PI * 2
      x = anchor.x + Math.cos(angle) * SPAWN_RADIUS
      y = anchor.y + Math.sin(angle) * SPAWN_RADIUS
    }
    const hp = def.behavior === 'boss' ? def.hp * (1 + (state.players.length - 1) * 0.6) : def.hp * this.hpScale()
    let vx = 0
    let vy = 0
    if (def.behavior === 'dash') {
      const l = Math.hypot(anchor.x - x, anchor.y - y) || 1
      vx = ((anchor.x - x) / l) * def.speed
      vy = ((anchor.y - y) / l) * def.speed
    }
    const enemy: Enemy = {
      id: state.nextId++,
      kind,
      x,
      y,
      hp,
      maxHp: hp,
      kx: 0,
      ky: 0,
      vx,
      vy,
      slow: 0,
      life: 0,
      flash: 0
    }
    state.enemies.push(enemy)
    return enemy
  }

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768)
  }

  private buildGrid() {
    this.grid.clear()
    for (const enemy of this.state.enemies) {
      const k = this.key(Math.floor(enemy.x / CELL), Math.floor(enemy.y / CELL))
      const cell = this.grid.get(k)
      if (cell) cell.push(enemy)
      else this.grid.set(k, [enemy])
    }
  }

  /** Enemies whose cell overlaps the circle; callers do the exact test. */
  private near(x: number, y: number, r: number, visit: (enemy: Enemy) => boolean | void) {
    const x0 = Math.floor((x - r - 50) / CELL)
    const x1 = Math.floor((x + r + 50) / CELL)
    const y0 = Math.floor((y - r - 50) / CELL)
    const y1 = Math.floor((y + r + 50) / CELL)
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.grid.get(this.key(cx, cy))
        if (cell) for (const enemy of cell) if (enemy.hp > 0 && visit(enemy) === false) return
      }
  }

  private nearestPlayer(x: number, y: number) {
    let best: Player | undefined
    let distance = Infinity
    for (const player of this.state.players) {
      if (player.downed) continue
      const d = (player.x - x) ** 2 + (player.y - y) ** 2
      if (d < distance) {
        distance = d
        best = player
      }
    }
    return best ? { player: best, distance: Math.sqrt(distance) } : undefined
  }

  private moveEnemies(dt: number) {
    const state = this.state
    const remaining: Enemy[] = []
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue
      const def = ENEMY_BY_ID.get(enemy.kind)!
      enemy.life += dt
      enemy.flash = Math.max(0, enemy.flash - dt)
      enemy.slow = Math.max(0, enemy.slow - dt)
      const target = this.nearestPlayer(enemy.x, enemy.y)
      if (!target) {
        remaining.push(enemy)
        continue
      }
      // Life speeds up as you age.
      const speed = def.speed * (enemy.slow > 0 ? 0.45 : 1) * (1 + (state.time / RUN_SECONDS) * 0.35)
      if (def.behavior === 'dash') {
        if (enemy.life > 5) continue
        enemy.x += enemy.vx * dt
        enemy.y += enemy.vy * dt
      } else {
        const dx = target.player.x - enemy.x
        const dy = target.player.y - enemy.y
        const l = target.distance || 1
        enemy.x += (dx / l) * speed * dt
        enemy.y += (dy / l) * speed * dt
        // Light separation so crowds read as a crowd, not a single blob.
        this.near(enemy.x, enemy.y, def.radius, (other) => {
          if (other === enemy) return
          const ox = enemy.x - other.x
          const oy = enemy.y - other.y
          const min = def.radius + ENEMY_BY_ID.get(other.kind)!.radius * 0.8
          const d2 = ox * ox + oy * oy
          if (d2 > 0.01 && d2 < min * min) {
            const d = Math.sqrt(d2)
            const push = Math.min(((min - d) / d) * 0.35, 3)
            enemy.x += ox * push
            enemy.y += oy * push
          }
        })
        // Too far from everyone: re-enter from the edge instead of trailing forever.
        if (target.distance > SPAWN_RADIUS * 1.45 && def.behavior !== 'boss') {
          const angle = this.rng() * Math.PI * 2
          enemy.x = target.player.x + Math.cos(angle) * SPAWN_RADIUS
          enemy.y = target.player.y + Math.sin(angle) * SPAWN_RADIUS
        }
      }
      enemy.x += enemy.kx * dt
      enemy.y += enemy.ky * dt
      enemy.kx *= Math.exp(-dt * 8)
      enemy.ky *= Math.exp(-dt * 8)
      for (const player of state.players) {
        if (player.downed) continue
        const reach = def.radius + PLAYER_RADIUS
        if ((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2 < reach * reach) this.hurt(player, def, dt)
      }
      remaining.push(enemy)
    }
    state.enemies = remaining
  }

  private hurt(player: Player, def: EnemyDef, dt: number) {
    const armor = playerStats(player).armor
    const damage = Math.max(def.damage * 0.25, def.damage - armor) * dt * 2.2
    player.hp -= damage
    player.hurt = 0.2
    if (player.hp <= 0) {
      player.hp = 0
      player.downed = true
      player.revive = 0
      player.killer = def.id
      this.log(`${player.name}の心が折れた…（仲間がそばにいると立ち直る）`)
    }
  }

  private revivePlayers(dt: number) {
    for (const player of this.state.players) {
      if (!player.downed) continue
      const helper = this.state.players.some(
        (other) => !other.downed && Math.hypot(other.x - player.x, other.y - player.y) < 70
      )
      player.revive = helper ? player.revive + dt / 3 : Math.max(0, player.revive - dt / 6)
      if (player.revive >= 1) {
        player.downed = false
        player.revive = 0
        player.killer = undefined
        player.hp = player.maxHp * 0.5
        this.log(`${player.name}が立ち直った！`)
      }
    }
  }

  private fireWeapons(dt: number) {
    for (const player of this.state.players) {
      if (player.downed) continue
      const stats = playerStats(player)
      for (const weapon of player.weapons) {
        weapon.held += dt
        weapon.cd -= dt
        if (weapon.cd > 0) continue
        const ws = weaponStats(player, weapon, stats)
        weapon.cd += ws.cooldown
        if (weapon.cd < 0) weapon.cd = ws.cooldown
        this.fire(player, weapon, ws)
      }
    }
  }

  private targets(player: Player, count: number, range: number) {
    const found: { enemy: Enemy; d: number }[] = []
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue
      const d = Math.hypot(enemy.x - player.x, enemy.y - player.y)
      if (d <= range) found.push({ enemy, d })
    }
    found.sort((a, b) => a.d - b.d)
    return found.slice(0, count).map((entry) => entry.enemy)
  }

  private shot(player: Player, def: WeaponDef, ws: WeaponStats, extra: Partial<Shot>) {
    if (this.state.shots.length >= MAX_SHOTS) return
    const life = extra.life ?? ws.duration
    this.state.shots.push({
      id: this.state.nextId++,
      owner: player.id,
      weapon: def.id,
      kind: def.behavior,
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      r: def.area * ws.area,
      angle: 0,
      orbit: 0,
      spin: 0,
      maxLife: life,
      damage: ws.damage,
      pierce: def.pierce,
      tick: def.pierce === Infinity ? 0.5 : Infinity,
      knockback: def.knockback,
      strong: def.strong,
      hits: new Map(),
      w: 0,
      h: 0,
      ...extra,
      life
    })
  }

  private fire(player: Player, weapon: OwnedWeapon, ws: WeaponStats) {
    const def = WEAPON_BY_ID.get(weapon.id)!
    const n = ws.amount
    const rng = this.rng
    switch (def.behavior) {
      case 'orbit':
        for (let i = 0; i < n; i++)
          this.shot(player, def, ws, {
            angle: (i / n) * Math.PI * 2,
            orbit: def.area * ws.area,
            spin: def.speed,
            r: 20 * Math.sqrt(ws.area),
            tick: 0.45
          })
        break
      case 'aura':
        this.shot(player, def, ws, { r: def.area * ws.area * (1 + (n - 1) * 0.12), tick: 0.45 })
        break
      case 'aim':
      case 'homing':
      case 'bounce': {
        const found = this.targets(player, n, 700)
        for (let i = 0; i < n; i++) {
          const target = found[i % Math.max(1, found.length)]
          let angle = target
            ? Math.atan2(target.y - player.y, target.x - player.x)
            : Math.atan2(player.fy, player.fx) + (i - (n - 1) / 2) * 0.25
          if (def.behavior === 'bounce') angle += (rng() - 0.5) * 0.6
          this.shot(player, def, ws, {
            vx: Math.cos(angle) * def.speed,
            vy: Math.sin(angle) * def.speed,
            angle,
            pierce: def.pierce + (weapon.lv >= 4 ? 1 : 0)
          })
        }
        break
      }
      case 'wander':
        for (let i = 0; i < n; i++) {
          const angle = rng() * Math.PI * 2
          this.shot(player, def, ws, { vx: Math.cos(angle) * def.speed, vy: Math.sin(angle) * def.speed, angle })
        }
        break
      case 'arc':
        for (let i = 0; i < n; i++) {
          const side = (i % 2 ? -1 : 1) * (player.fx < 0 ? -1 : 1)
          this.shot(player, def, ws, { vx: side * (90 + rng() * 140 + i * 30), vy: -def.speed - rng() * 80 })
        }
        break
      case 'zone':
        for (let i = 0; i < n; i++) {
          const found = this.targets(player, 8, 360)
          const target = found[Math.floor(rng() * found.length)]
          const angle = rng() * Math.PI * 2
          this.shot(player, def, ws, {
            x: target?.x ?? player.x + Math.cos(angle) * 120,
            y: target?.y ?? player.y + Math.sin(angle) * 120,
            tick: 0.5
          })
        }
        break
      case 'strike':
      case 'rain': {
        const found = this.targets(player, 24, 520)
        for (let i = 0; i < n; i++) {
          const target = found.splice(Math.floor(rng() * found.length), 1)[0]
          if (!target) break
          this.shot(player, def, ws, { x: target.x, y: target.y, tick: Infinity })
        }
        break
      }
      case 'whip':
      case 'flail':
        for (let i = 0; i < n; i++) {
          let angle =
            def.behavior === 'flail' ? rng() * Math.PI * 2 : Math.atan2(player.fy, player.fx) + (i % 2 ? Math.PI : 0)
          if (def.behavior === 'whip' && i >= 2) angle += (i % 2 ? -1 : 1) * 0.6
          const length = def.area * ws.area
          this.shot(player, def, ws, {
            angle,
            w: length / 2,
            h: 22 * ws.area,
            r: length / 2,
            x: player.x + Math.cos(angle) * length * 0.5,
            y: player.y + Math.sin(angle) * length * 0.5,
            tick: Infinity
          })
        }
        break
    }
  }

  private moveShots(dt: number) {
    const state = this.state
    const players = new Map(state.players.map((player) => [player.id, player]))
    const kept: Shot[] = []
    for (const shot of state.shots) {
      shot.life -= dt
      const owner = players.get(shot.owner)
      if (shot.life <= 0 || !owner) continue
      switch (shot.kind) {
        case 'orbit':
          shot.angle += shot.spin * dt
          shot.x = owner.x + Math.cos(shot.angle) * shot.orbit
          shot.y = owner.y + Math.sin(shot.angle) * shot.orbit
          break
        case 'aura':
          shot.x = owner.x
          shot.y = owner.y
          break
        case 'homing': {
          const target = this.targets({ ...owner, x: shot.x, y: shot.y } as Player, 1, 260)[0]
          if (target) {
            const want = Math.atan2(target.y - shot.y, target.x - shot.x)
            let diff = want - shot.angle
            diff = Math.atan2(Math.sin(diff), Math.cos(diff))
            shot.angle += Math.max(-4 * dt, Math.min(4 * dt, diff))
            const speed = Math.hypot(shot.vx, shot.vy)
            shot.vx = Math.cos(shot.angle) * speed
            shot.vy = Math.sin(shot.angle) * speed
          }
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          break
        }
        case 'bounce':
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          if (Math.abs(shot.x - owner.x) > VIEW_HALF.x - 20) {
            shot.vx = -Math.sign(shot.x - owner.x) * Math.abs(shot.vx)
            shot.x = owner.x + Math.sign(shot.x - owner.x) * (VIEW_HALF.x - 20)
          }
          if (Math.abs(shot.y - owner.y) > VIEW_HALF.y - 20) {
            shot.vy = -Math.sign(shot.y - owner.y) * Math.abs(shot.vy)
            shot.y = owner.y + Math.sign(shot.y - owner.y) * (VIEW_HALF.y - 20)
          }
          shot.angle += dt * 10
          break
        case 'arc':
          shot.vy += 900 * dt
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          shot.angle += dt * 9
          break
        case 'whip':
        case 'flail':
        case 'zone':
        case 'strike':
        case 'rain':
          break
        default:
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
      }
      if (this.collide(shot, owner)) kept.push(shot)
    }
    state.shots = kept
  }

  /** Applies hits; returns false once the shot is used up. */
  private collide(shot: Shot, owner: Player) {
    const time = this.state.time
    // Rain falls first and lands at the end of its life; strikes land immediately.
    if (shot.kind === 'rain' && shot.life > shot.maxLife * 0.35) return true
    let alive = true
    const rect = shot.kind === 'whip' || shot.kind === 'flail'
    const cos = Math.cos(shot.angle)
    const sin = Math.sin(shot.angle)
    this.near(shot.x, shot.y, shot.r, (enemy) => {
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const dx = enemy.x - shot.x
      const dy = enemy.y - shot.y
      if (rect) {
        const along = dx * cos + dy * sin
        const across = -dx * sin + dy * cos
        if (Math.abs(along) > shot.w + def.radius || Math.abs(across) > shot.h + def.radius) return
      } else if (dx * dx + dy * dy > (shot.r + def.radius) ** 2) return
      if ((shot.hits.get(enemy.id) ?? -1) > time) return
      shot.hits.set(enemy.id, time + shot.tick)
      this.damage(enemy, def, shot, owner)
      if (--shot.pierce <= 0) {
        alive = false
        return false
      }
    })
    return alive
  }

  private damage(enemy: Enemy, def: EnemyDef, shot: Shot, owner: Player) {
    const strong = shot.strong.includes(def.tag)
    const amount = shot.damage * (strong ? STRONG_MULTIPLIER : 1) * (0.9 + this.rng() * 0.2)
    enemy.hp -= amount
    enemy.flash = 0.12
    if (shot.weapon === 'w_love') enemy.slow = 1.2
    if (shot.knockback && def.behavior !== 'boss') {
      const dx = enemy.x - owner.x
      const dy = enemy.y - owner.y
      const l = Math.hypot(dx, dy) || 1
      enemy.kx += (dx / l) * shot.knockback
      enemy.ky += (dy / l) * shot.knockback
    }
    const weapon = owner.weapons.find((w) => w.id === shot.weapon)
    if (weapon) weapon.damage += Math.min(amount, Math.max(0, enemy.hp + amount))
    if (this.state.popups.length < 80)
      this.state.popups.push({
        x: enemy.x,
        y: enemy.y - def.radius,
        v: Math.round(amount),
        strong,
        owner: owner.id,
        life: 0.6
      })
    if (enemy.hp <= 0) this.kill(enemy, def)
  }

  private kill(enemy: Enemy, def: EnemyDef) {
    const state = this.state
    state.kills++
    if (state.gems.length < MAX_GEMS) state.gems.push({ x: enemy.x, y: enemy.y, v: def.xp, pull: false })
    else state.gems[Math.floor(this.rng() * state.gems.length)].v += def.xp
    if (def.behavior === 'boss') {
      state.items.push({ kind: 'chest', x: enemy.x, y: enemy.y })
      this.log(`「${def.name}」を乗り越えた！ 転機が訪れる。`)
    } else if (this.rng() < 0.006 && state.items.length < 20) state.items.push({ kind: 'meal', x: enemy.x, y: enemy.y })
    else if (this.rng() < 0.0012 && state.items.length < 20)
      state.items.push({ kind: 'magnet', x: enemy.x, y: enemy.y })
  }

  private collectGems(dt: number) {
    const state = this.state
    const alive = state.players.filter((player) => !player.downed)
    if (!alive.length) return
    const stats = new Map(alive.map((player) => [player.id, playerStats(player)]))
    const kept: Gem[] = []
    for (const gem of state.gems) {
      let best: Player | undefined
      let distance = Infinity
      for (const player of alive) {
        const d = Math.hypot(player.x - gem.x, player.y - gem.y)
        if (d < distance) {
          distance = d
          best = player
        }
      }
      if (!best) continue
      const s = stats.get(best.id)!
      if (distance < s.magnet) gem.pull = true
      if (gem.pull) {
        const speed = 420 * dt
        gem.x += ((best.x - gem.x) / (distance || 1)) * speed
        gem.y += ((best.y - gem.y) / (distance || 1)) * speed
      }
      if (distance < PLAYER_RADIUS + 8) this.gainXp(gem.v * s.xpGain)
      else kept.push(gem)
    }
    state.gems = kept
    state.items = state.items.filter((item) => {
      const taker = alive.find((player) => Math.hypot(player.x - item.x, player.y - item.y) < PLAYER_RADIUS + 16)
      if (!taker) return true
      if (item.kind === 'meal') taker.hp = Math.min(taker.maxHp, taker.hp + 40)
      else if (item.kind === 'magnet') for (const gem of state.gems) gem.pull = true
      else for (const player of alive) player.pending++
      return false
    })
  }

  gainXp(amount: number) {
    const state = this.state
    state.xp += amount
    while (state.xp >= state.xpNext) {
      state.xp -= state.xpNext
      state.level++
      state.xpNext = Math.round(xpForLevel(state.level) * (1 + (state.players.length - 1) * 0.5))
      for (const player of state.players) if (!player.downed) player.pending++
    }
  }

  /** Builds the level-up hand for a player from what their age and slots allow. */
  options(player: Player): string[] {
    const age = ageAt(this.state.time)
    const result: string[] = []
    for (const weapon of player.weapons) if (weapon.lv < MAX_WEAPON_LEVEL) result.push(`w:${weapon.id}`)
    if (talentWeaponCount(player) < weaponSlots(player))
      for (const def of TALENT_WEAPONS)
        if (age >= def.minAge && !player.weapons.some((w) => w.id === def.id)) result.push(`w:${def.id}`)
    for (const passive of player.passives) if (passive.lv < MAX_PASSIVE_LEVEL) result.push(`p:${passive.id}`)
    if (player.passives.length < PASSIVE_SLOTS)
      for (const def of PASSIVES) if (!player.passives.some((p) => p.id === def.id)) result.push(`p:${def.id}`)
    return result
  }

  private offer(player: Player) {
    const pool = this.options(player)
    const hand: string[] = []
    while (hand.length < 3 && pool.length) hand.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0])
    if (!hand.length) hand.push('x:meal', 'x:coin')
    player.choices = hand
    player.pending--
  }

  choose(player: Player, index: number) {
    const choice = player.choices[index]
    if (!choice) return
    const [kind, id] = choice.split(':')
    player.choices = []
    player.choiceSeq++
    if (kind === 'w') {
      const owned = player.weapons.find((w) => w.id === id)
      if (owned) {
        const before = isEvolved(player, owned)
        owned.lv = Math.min(MAX_WEAPON_LEVEL, owned.lv + 1)
        if (!before && isEvolved(player, owned))
          this.log(`${player.name}の「${WEAPON_BY_ID.get(id)!.name}」が「${weaponName(player, owned)}」に進化！`)
      } else {
        player.weapons.push({ id, lv: 1, cd: 0.2, held: 0, damage: 0 })
        this.feel(player, WEAPON_BY_ID.get(id)!)
      }
    } else if (kind === 'p') {
      const owned = player.passives.find((p) => p.id === id)
      const evolvedBefore = player.weapons.filter((w) => isEvolved(player, w)).length
      if (owned) owned.lv = Math.min(MAX_PASSIVE_LEVEL, owned.lv + 1)
      else player.passives.push({ id, lv: 1 })
      if (player.weapons.filter((w) => isEvolved(player, w)).length > evolvedBefore)
        this.log(`${player.name}の手札が進化した！`)
      const stats = playerStats(player)
      if (stats.maxHp > player.maxHp) player.hp += stats.maxHp - player.maxHp
      player.maxHp = stats.maxHp
    } else if (choice === 'x:meal') player.hp = Math.min(player.maxHp, player.hp + 40)
    else this.gainXp(this.state.xpNext * 0.25)
  }

  /** A hunch about the hidden talent — right three times out of four. */
  private feel(player: Player, def: WeaponDef) {
    if (!def.category) return
    const actual = player.talents[def.category]
    const truthful = this.rng() < 0.75
    const values = [GIFTED, 1, POOR]
    const sensed = truthful ? actual : values.filter((v) => v !== actual)[Math.floor(this.rng() * 2)]
    const text =
      sensed === GIFTED
        ? 'なんだか、しっくりくる…！'
        : sensed === POOR
          ? 'どうも向いていない気がする…'
          : 'まあ、ふつうかな。'
    this.log(`${def.icon} ${def.name}：${text}`, player.id)
  }
}
