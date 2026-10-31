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
}
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
}
export const size = 7
export const rocks = new Set(['3,1', '3,2', '3,4', '3,5'])
export const groves = new Set(['1,2', '2,4', '4,2', '5,4'])
export const key = (x: number, y: number) => `${x},${y}`
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
export const missions = [
  {
    name: '01 峡谷の燈',
    hint: '狭い峠。木立を利用し、狼を弓で迎え撃つ。',
    rocks: ['3,1', '3,2', '3,4', '3,5'],
    groves: ['1,2', '2,4', '4,2', '5,4']
  },
  {
    name: '02 風抜けの水路',
    hint: '二つの迂回路。射程を保ち、装甲兵を魔法で崩す。',
    rocks: ['2,1', '2,2', '4,4', '4,5'],
    groves: ['1,3', '3,2', '3,4', '5,3']
  },
  {
    name: '03 灰の環城',
    hint: '群れとの最終戦。回復薬を温存し、包囲を避ける。',
    rocks: ['2,2', '4,2', '3,4'],
    groves: ['1,1', '1,5', '4,1', '4,5', '3,4']
  }
]
export function createGame(stage = 0, formation: Formation = 'balanced'): Game {
  stage = Math.max(0, Math.min(2, stage))
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
    move = 3
  ): Unit => ({ id, name, role, side, x, y, hp, max: hp, power, range, move, moved: false, done: false })
  const game: Game = {
    stage,
    formation,
    potions: 2,
    rocks: new Set(missions[stage].rocks),
    groves: new Set(missions[stage].groves),
    turn: 1,
    phase: 'ally',
    log: '味方を選択 → 青いマスへ移動 → 敵を攻撃',
    units: [
      unit('a', '燈守リオ', 'soldier', 'ally', 0, 3, 16, 6, 1),
      unit('b', '風読みネリ', 'archer', 'ally', 0, 2, 11, 5, 3),
      unit('c', '星織ミナ', 'mage', 'ally', 0, 4, 10, 7, 2),
      unit('d', '灰牙', 'wolf', 'enemy', 5, 2, 10, 4, 1, 3),
      unit('e', '煤の斥候', 'goblin', 'enemy', 5, 4, 10, 4, 1),
      { ...unit('f', '霧番', 'goblin', 'enemy', 6, 3, 14, 5, 1), armor: 2 }
    ]
  }
  if (stage === 1) game.units.push(unit('g', '風牙', 'wolf', 'enemy', 6, 1, 11, 4, 1))
  if (stage === 2) {
    game.units.push(
      unit('g', '風牙', 'wolf', 'enemy', 5, 0, 8, 3, 1),
      unit('h', '灰の射手', 'archer', 'enemy', 6, 6, 8, 3, 2)
    )
    game.units[3].power = 3
    game.units[4].power = 3
    game.units[3].y = 1
    game.units[4].y = 5
    game.units[5].x = 6
    game.units[5].y = 3
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
export function reachable(game: Game, unit: Unit): Map<string, number> {
  const result = new Map([[key(unit.x, unit.y), 0]])
  const queue = [{ x: unit.x, y: unit.y }]
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
        cost = result.get(key(p.x, p.y))! + 1
      if (
        x < 0 ||
        y < 0 ||
        x >= size ||
        y >= size ||
        game.rocks.has(k) ||
        result.has(k) ||
        cost > unit.move ||
        game.units.some((u) => u.hp > 0 && u.id !== unit.id && u.x === x && u.y === y)
      )
        continue
      result.set(k, cost)
      queue.push({ x, y })
    }
  return result
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
    attacker.power + advantage - armor - ((game?.groves ?? groves).has(key(target.x, target.y)) ? 2 : 0)
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
  return true
}
export function settle(game: Game) {
  if (!game.units.some((u) => u.side === 'enemy' && u.hp > 0)) game.phase = 'won'
  else if (!game.units.some((u) => u.side === 'ally' && u.hp > 0)) game.phase = 'lost'
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
    target.hp <= 0 ||
    target.side === unit.side ||
    distance(unit, target) > unit.range
  )
    return false
  const hit = damage(unit, target, game)
  target.hp = Math.max(0, target.hp - hit)
  unit.done = true
  game.log = `${unit.name} → ${target.name} −${hit}${target.hp === 0 ? ' 撃破' : ''}`
  settle(game)
  return true
}
export function enemyStep(game: Game, unit: Unit) {
  if (game.phase !== 'enemy' || unit.hp <= 0) return
  const targets = game.units.filter((u) => u.side === 'ally' && u.hp > 0)
  const options = [...reachable(game, unit).keys()].map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x, y }
  })
  options.sort((a, b) => {
    const score = (p: typeof a) =>
      Math.min(...targets.map((t) => (distance(p, t) <= unit.range ? 0 : distance(p, t) - unit.range))) * 10 +
      (game.groves.has(key(p.x, p.y)) ? -1 : 0)
    return score(a) - score(b)
  })
  const p = options[0]
  unit.x = p.x
  unit.y = p.y
  const target = targets.filter((t) => distance(unit, t) <= unit.range).sort((a, b) => a.hp - b.hp)[0]
  if (target) attack(game, unit, target)
  else game.log = `${unit.name} 接近`
  unit.done = true
}
export function beginEnemy(game: Game) {
  if (game.phase !== 'ally') return false
  game.phase = 'enemy'
  game.units.forEach((u) => {
    u.done = false
    u.moved = false
  })
  return true
}
export function beginAlly(game: Game) {
  if (game.phase !== 'enemy') return
  game.turn++
  game.phase = 'ally'
  game.units.forEach((u) => {
    u.done = false
    u.moved = false
  })
  game.log = '味方のターン · 木立 ♣ は被ダメージ −2'
}
