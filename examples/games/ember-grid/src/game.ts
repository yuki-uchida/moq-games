import { campaign } from './campaign'

export type Unit = {
  id: string
  name: string
  role: string
  side: 'ally' | 'enemy'
  x: number
  y: number
  hp: number
  max: number
  power: number
  range: number
  move: number
  moved: boolean
  done: boolean
  armor?: number
  ai?: 'charge' | 'guard' | 'hold'
  boss?: boolean
  alerted?: boolean
  heal?: number
  level: number
  exp: number
  def: number
  /** Mission tallies for the chapter report. */
  startLevel: number
  gained: number
  kills: number
  dealt: number
}
export type Gains = { max: number; power: number; def: number }
/** Latest ally EXP change, consumed by the presentation layer. */
export type Progress = { id: string; from: number; to: number; level: number; gains?: Gains }
/** Persistent ally growth carried between missions (max HP excludes the guard bonus); a missing ally is lost. */
export type Roster = Record<string, Pick<Unit, 'level' | 'exp' | 'max' | 'power' | 'def'>>
export type Formation = 'balanced' | 'guard'
export type Game = {
  units: Unit[]
  turn: number
  phase: 'ally' | 'enemy' | 'won' | 'lost'
  log: string
  stage: number
  formation: Formation
  potions: number
  rocks: Set<string>
  groves: Set<string>
  rng: () => number
  progress?: Progress
}
export const size = 10
export const rocks = new Set(['4,1', '4,2', '4,3', '4,5', '4,6', '4,7', '4,8', '5,2', '5,7'])
export const groves = new Set(['2,3', '3,5', '2,7', '5,1', '5,8', '6,7'])
export const key = (x: number, y: number) => `${x},${y}`
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
export const missions = campaign.map(({ name, hint, rocks, groves }) => ({ name, hint, rocks, groves }))
const healerJoin = campaign.findIndex((chapter) => chapter.recruits.includes('healer'))
/** Per-role chance for each stat to rise by one on level up. */
export const growth: Record<string, Gains> = {
  soldier: { max: 0.8, power: 0.45, def: 0.45 },
  archer: { max: 0.6, power: 0.55, def: 0.25 },
  mage: { max: 0.5, power: 0.65, def: 0.2 },
  healer: { max: 0.6, power: 0.4, def: 0.3 }
}
export const expPerLevel = 100
/** FE-style: base 10 per hit, scaled by the level gap; defeating adds a larger bonus. */
export function expFor(unit: Unit, target: Unit, defeated: boolean): number {
  const gap = target.level - unit.level
  return Math.max(1, 10 + gap * 2) + (defeated ? Math.max(5, 20 + gap * 5) : 0)
}
export const healExp = 10
/** Seedable PRNG (mulberry32) so growth rolls are reproducible. */
export function seeded(seed: number): (() => number) & { state: number } {
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    random.state = seed
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  random.state = seed | 0
  return random
}
/** Roll each stat against its growth rate; an empty level up raises the role's best stat. */
export function rollGrowth(role: string, rng: () => number): Gains {
  const rates = growth[role]
  const gains = { max: 0, power: 0, def: 0 }
  for (const stat of ['max', 'power', 'def'] as const) gains[stat] = rng() < rates[stat] ? 1 : 0
  if (!gains.max && !gains.power && !gains.def) {
    const best = (['max', 'power', 'def'] as const).reduce((a, b) => (rates[b] > rates[a] ? b : a))
    gains[best] = 1
  }
  return gains
}
export function grant(game: Game, unit: Unit, amount: number) {
  if (unit.side !== 'ally') return
  const from = unit.exp
  unit.exp += amount
  unit.gained += amount
  game.progress = { id: unit.id, from, to: unit.exp, level: unit.level }
  if (unit.exp < expPerLevel) return
  unit.exp -= expPerLevel
  unit.level++
  const gains = rollGrowth(unit.role, game.rng)
  unit.max += gains.max
  unit.hp += gains.max
  unit.power += gains.power
  unit.def += gains.def
  game.progress.gains = gains
}
/** Last words shown when an ally falls (FE-style permanent loss). */
export const farewell: Record<string, string> = {
  soldier: '「すまない…燈を、頼む…」',
  archer: '「風が…止んだ…」',
  mage: '「星が…見えない…」',
  healer: '「どうか…燈を絶やさないで…」'
}
/** Survivors only: an ally who fell in a won mission leaves the expedition for good. */
export function carry(game: Game): Roster {
  return Object.fromEntries(
    game.units
      .filter((u) => u.side === 'ally' && u.hp > 0)
      .map((u) => [
        u.id,
        { level: u.level, exp: u.exp, max: u.max - (game.formation === 'guard' ? 4 : 0), power: u.power, def: u.def }
      ])
  )
}
/** Most defeats, then most damage dealt; survivors are preferred over fallen allies. */
export const mvp = (game: Game) =>
  game.units
    .filter((u) => u.side === 'ally')
    .sort((a, b) => Number(b.hp > 0) - Number(a.hp > 0) || b.kills - a.kills || b.dealt - a.dealt)[0]
/** Allies of the fresh party absent from a recorded roster (lost in an earlier victory). */
export const lost = (roster?: Roster, stage = 0) =>
  roster
    ? createGame(stage).units.filter(
        (u) => u.side === 'ally' && !roster[u.id] && !(u.role === 'healer' && stage === healerJoin)
      )
    : []
export function createGame(
  stage = 0,
  formation: Formation = 'balanced',
  roster?: Roster,
  rng: () => number = Math.random
): Game {
  stage = Math.max(0, Math.min(campaign.length - 1, Math.trunc(stage) || 0))
  const unit = (
    id: string,
    name: string,
    role: string,
    side: Unit['side'],
    x: number,
    y: number,
    hp: number,
    power: number,
    range: number,
    move = 3,
    level = 1
  ): Unit => ({
    id,
    name,
    role,
    side,
    x,
    y,
    hp,
    max: hp,
    power,
    range,
    move,
    moved: false,
    done: false,
    level,
    exp: 0,
    def: 0,
    startLevel: level,
    gained: 0,
    kills: 0,
    dealt: 0
  })
  const game: Game = {
    stage,
    formation,
    potions: 2,
    rocks: new Set(missions[stage].rocks),
    groves: new Set(missions[stage].groves),
    rng,
    turn: 1,
    phase: 'ally',
    log: '味方を選択 → 青いマスへ移動 → 敵を攻撃',
    units: [
      unit('a', '燈守リオ', 'soldier', 'ally', 1, 4, 16, 6, 1),
      unit('b', '風読みネリ', 'archer', 'ally', 1, 3, 11, 5, 3),
      unit('c', '星織ミナ', 'mage', 'ally', 1, 5, 10, 7, 2),
      ...(healerJoin >= 0 && stage >= healerJoin
        ? [{ ...unit('i', '癒し手ルカ', 'healer', 'ally', 0, 4, 12, 0, 2), heal: 8 }]
        : []),
      ...campaign[stage].enemies.map((enemy) => ({
        ...unit(
          enemy.id,
          enemy.name,
          enemy.role,
          'enemy',
          enemy.x,
          enemy.y,
          enemy.hp,
          enemy.power,
          enemy.range,
          enemy.move,
          enemy.level
        ),
        ai: enemy.ai,
        armor: enemy.armor,
        boss: enemy.boss
      }))
    ]
  }
  game.units.filter((u) => u.side === 'ally').forEach((u, index) => Object.assign(u, campaign[stage].deployment[index]))
  // Allies missing from a recorded roster were lost and do not deploy.
  if (roster)
    game.units = game.units.filter(
      (u) => u.side !== 'ally' || roster[u.id] || (stage === healerJoin && u.role === 'healer')
    )
  for (const u of game.units) {
    const saved = roster?.[u.id]
    if (saved) Object.assign(u, saved, { hp: saved.max, startLevel: saved.level })
  }
  if (formation === 'guard')
    game.units
      .filter((u) => u.side === 'ally')
      .forEach((u) => {
        u.max += 4
        u.hp += 4
        u.move = 2
      })
  return game
}
type Point = { x: number; y: number }
/** Breadth-first movement: same-side units may be crossed, opposing units and rocks block. */
function search(game: Pick<Game, 'units' | 'rocks'>, unit: Unit) {
  const cost = new Map([[key(unit.x, unit.y), 0]]),
    parent = new Map<string, Point>()
  const queue: Point[] = [{ x: unit.x, y: unit.y }]
  for (const p of queue)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const x = p.x + dx,
        y = p.y + dy,
        k = key(x, y),
        c = cost.get(key(p.x, p.y))! + 1
      if (
        x < 0 ||
        y < 0 ||
        x >= size ||
        y >= size ||
        game.rocks.has(k) ||
        cost.has(k) ||
        c > unit.move ||
        game.units.some((u) => u.hp > 0 && u.side !== unit.side && u.x === x && u.y === y)
      )
        continue
      cost.set(k, c)
      parent.set(k, p)
      queue.push({ x, y })
    }
  return { cost, parent }
}
/** Legal destinations (including the current cell); crossed allies' cells cannot be stopped on. */
export function reachable(game: Pick<Game, 'units' | 'rocks'>, unit: Unit): Map<string, number> {
  const { cost } = search(game, unit)
  for (const u of game.units) if (u.hp > 0 && u.id !== unit.id) cost.delete(key(u.x, u.y))
  return cost
}
/** Shortest legal four-neighbour walk to a destination, or just the start when unreachable. */
export function path(game: Pick<Game, 'units' | 'rocks'>, unit: Unit, to: Point): Point[] {
  const { parent } = search(game, unit),
    result: Point[] = [{ x: to.x, y: to.y }]
  if (!reachable(game, unit).has(key(to.x, to.y))) return [{ x: unit.x, y: unit.y }]
  for (let p = parent.get(key(to.x, to.y)); p; p = parent.get(key(p.x, p.y))) result.unshift(p)
  return result
}
/** Cells an unspent unit could strike after moving, excluding move destinations and its own side's cells. */
export function attackRange(game: Game, unit: Unit): Set<string> {
  const result = new Set<string>()
  if (unit.done || unit.hp <= 0 || unit.heal) return result
  const moves = unit.moved ? new Map([[key(unit.x, unit.y), 0]]) : reachable(game, unit)
  for (const k of moves.keys()) {
    const [ox, oy] = k.split(',').map(Number)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (distance({ x: ox, y: oy }, { x, y }) <= unit.range && !moves.has(key(x, y))) result.add(key(x, y))
  }
  for (const u of game.units) if (u.hp > 0 && u.side === unit.side) result.delete(key(u.x, u.y))
  return result
}
export function enemyActionPositions(game: Game, enemy: Unit): Map<string, number> {
  return enemy.ai === 'hold' ? new Map([[key(enemy.x, enemy.y), 0]]) : reachable(game, enemy)
}
export function healRange(game: Game, unit: Unit): Set<string> {
  const result = new Set<string>()
  if (!unit.heal || unit.done || unit.hp <= 0) return result
  const positions = unit.moved ? [key(unit.x, unit.y)] : [...reachable(game, unit).keys()]
  for (const ally of game.units) {
    if (ally.side !== 'ally' || ally.hp <= 0 || ally.hp >= ally.max || ally.id === unit.id) continue
    if (
      positions.some((position) => {
        const [x, y] = position.split(',').map(Number)
        const d = distance({ x, y }, ally)
        return d >= 1 && d <= 2
      })
    )
      result.add(key(ally.x, ally.y))
  }
  return result
}
export const healForecast = (healer: Unit, target: Unit) => ({
  before: target.hp,
  after: Math.min(target.max, target.hp + (healer.heal ?? 0))
})
export function staffHeal(game: Game, healer: Unit, target: Unit): boolean {
  if (
    game.phase !== 'ally' ||
    healer.side !== 'ally' ||
    !healer.heal ||
    healer.done ||
    healer.hp <= 0 ||
    target.side !== 'ally' ||
    target.hp <= 0 ||
    target.hp >= target.max ||
    distance(healer, target) < 1 ||
    distance(healer, target) > 2
  )
    return false
  const { before, after } = healForecast(healer, target)
  target.hp = after
  healer.done = true
  game.log = `${healer.name} → ${target.name} 回復 +${after - before}`
  grant(game, healer, healExp)
  return true
}
/** Spent units, plus moved units with no target in range and no useful potion. */
export function finished(game: Game, unit: Unit): boolean {
  return (
    unit.done ||
    (unit.moved &&
      !(unit.heal
        ? healRange(game, unit).size
        : game.units.some((t) => t.hp > 0 && t.side !== unit.side && distance(unit, t) <= unit.range)) &&
      (unit.side !== 'ally' || unit.hp >= unit.max || game.potions <= 0))
  )
}
/** True when the ally phase should hand over to the enemy without pressing End Turn. */
export function allyTurnOver(game: Game): boolean {
  return game.phase === 'ally' && game.units.every((u) => u.side !== 'ally' || u.hp <= 0 || finished(game, u))
}
export function damage(attacker: Unit, target: Unit, game?: Game): number {
  const advantage =
    attacker.role === 'archer' && target.role === 'wolf'
      ? 3
      : attacker.role === 'soldier' && target.role === 'goblin'
        ? 1
        : 0
  const armor = attacker.role === 'mage' ? 0 : (target.armor ?? 0)
  return Math.max(
    1,
    attacker.power + advantage - armor - target.def - ((game?.groves ?? groves).has(key(target.x, target.y)) ? 2 : 0)
  )
}
export function recover(game: Game, unit: Unit): boolean {
  if (
    game.phase !== 'ally' ||
    unit.side !== 'ally' ||
    unit.done ||
    unit.hp <= 0 ||
    unit.hp >= unit.max ||
    game.potions <= 0
  )
    return false
  const amount = Math.min(8, unit.max - unit.hp)
  unit.hp += amount
  unit.done = true
  game.potions--
  game.log = `${unit.name} 回復 +${amount} · 残り薬 ${game.potions}`
  grant(game, unit, healExp)
  return true
}
export function settle(game: Game) {
  const objective = campaign[game.stage].objective
  if (!game.units.some((u) => u.side === 'ally' && u.hp > 0)) game.phase = 'lost'
  else if (
    !game.units.some((u) => u.side === 'enemy' && u.hp > 0) ||
    (objective.type === 'boss' && game.units.some((u) => u.side === 'enemy' && u.boss && u.hp <= 0))
  )
    game.phase = 'won'
}
export function objectiveLabel(game: Game): string {
  const objective = campaign[game.stage].objective
  if (game.phase === 'won') return objective.type === 'survive' ? '◎ 防衛達成' : '◎ 任務達成'
  return objective.type === 'survive'
    ? `◎ 残り${Math.max(0, objective.turns - game.turn + 1)}ターン`
    : objective.type === 'boss'
      ? '◎ ボス撃破'
      : objective.type === 'seize'
        ? '◎ 制圧'
        : '◎ 全滅'
}
export function move(game: Game, unit: Unit, x: number, y: number): boolean {
  if (
    game.phase !== unit.side ||
    unit.done ||
    unit.moved ||
    !reachable(game, unit).has(key(x, y)) ||
    key(x, y) === key(unit.x, unit.y)
  )
    return false
  unit.x = x
  unit.y = y
  unit.moved = true
  game.log = `${unit.name} 移動。攻撃、または ✓ 待機`
  return true
}
export function attack(game: Game, unit: Unit, target: Unit): boolean {
  if (
    game.phase !== unit.side ||
    unit.done ||
    unit.hp <= 0 ||
    !!unit.heal ||
    target.hp <= 0 ||
    target.side === unit.side ||
    distance(unit, target) > unit.range
  )
    return false
  const hit = damage(unit, target, game)
  unit.dealt += Math.min(hit, target.hp)
  target.hp = Math.max(0, target.hp - hit)
  unit.done = true
  if (target.hp === 0) unit.kills++
  game.log = `${unit.name} → ${target.name} −${hit}${target.hp === 0 ? (target.side === 'ally' ? ` · ${target.name}は倒れた…` : ' 撃破') : ''}`
  grant(game, unit, expFor(unit, target, target.hp === 0))
  settle(game)
  return true
}
export function enemyStep(game: Game, unit: Unit) {
  if (game.phase !== 'enemy' || unit.hp <= 0) return
  const targets = game.units.filter((u) => u.side === 'ally' && u.hp > 0)
  if (
    unit.ai === 'guard' &&
    !unit.alerted &&
    (unit.hp < unit.max || targets.some((target) => distance(unit, target) <= unit.move + unit.range))
  )
    unit.alerted = true
  const options = (
    unit.ai === 'guard' && !unit.alerted ? [key(unit.x, unit.y)] : [...enemyActionPositions(game, unit).keys()]
  ).map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x, y }
  })
  const best = (position: (typeof options)[number]) =>
    targets
      .filter((target) => distance(position, target) <= unit.range)
      .sort(
        (a, b) =>
          Number(damage(unit, b, game) >= b.hp) - Number(damage(unit, a, game) >= a.hp) ||
          damage(unit, b, game) - damage(unit, a, game) ||
          a.hp - b.hp
      )[0]
  options.sort((a, b) => {
    const ta = best(a),
      tb = best(b)
    if (ta && tb) {
      const priority =
        Number(damage(unit, tb, game) >= tb.hp) - Number(damage(unit, ta, game) >= ta.hp) ||
        damage(unit, tb, game) - damage(unit, ta, game) ||
        ta.hp - tb.hp
      if (priority) return priority
    } else if (ta || tb) return ta ? -1 : 1
    const score = (p: typeof a) =>
      Math.min(...targets.map((t) => (distance(p, t) <= unit.range ? 0 : distance(p, t) - unit.range))) * 10 +
      (game.groves.has(key(p.x, p.y)) ? -1 : 0)
    return score(a) - score(b)
  })
  const p = options[0]
  unit.x = p.x
  unit.y = p.y
  const target = best(p)
  if (target) attack(game, unit, target)
  else game.log = `${unit.name} 接近`
  unit.done = true
  return target
}
export function beginEnemy(game: Game) {
  if (game.phase !== 'ally') return false
  const objective = campaign[game.stage].objective
  if (
    objective.type === 'seize' &&
    game.units.some((unit) => unit.side === 'ally' && unit.hp > 0 && unit.x === objective.x && unit.y === objective.y)
  ) {
    game.phase = 'won'
    return false
  }
  game.phase = 'enemy'
  game.units.forEach((u) => {
    u.done = false
    u.moved = false
  })
  return true
}
export function beginAlly(game: Game) {
  if (game.phase !== 'enemy') return
  const objective = campaign[game.stage].objective
  if (objective.type === 'survive' && game.turn >= objective.turns) {
    game.phase = 'won'
    return
  }
  game.turn++
  game.phase = 'ally'
  game.units.forEach((u) => {
    u.done = false
    u.moved = false
  })
  game.log = '味方のターン · 木立 ♣ は被ダメージ −2'
}
