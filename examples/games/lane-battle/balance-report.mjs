import { POOPS, SPECIALS, ENEMIES, card, createGame, summon, step } from './simulation.js'

function measure(type, side) {
  const deck = side === 1 ? [card({ uid: 1, key: type.key })] : [card({ uid: 1, key: 'katachi' })]
  const game = createGame(0, deck, 42)
  game.gold = 999
  game.spawn = 999
  game.opened = true
  game.rushes = 4
  game.turret = 999
  if (side === 1) summon(game, 0)
  else summon(game, ENEMIES.indexOf(type), -1)
  const attacker = game.units[0]
  attacker.x = side === 1 ? 540 : 460
  for (let index = 0; index < 4; index++) {
    game.cooldowns[0] = 0
    summon(game, 0, -side)
    game.units.at(-1).x = side === 1 ? 460 - index * 12 : 540 + index * 12
  }
  const targets = game.units.filter((unit) => unit.side !== side)
  while (game.time < 60 && attacker.hp > 0 && targets.some((unit) => unit.hp > 0) && !game.result) step(game, 0.05)
  const damage = targets.reduce((sum, target) => sum + target.maxHp - Math.max(0, target.hp), 0)
  return {
    damage: Math.round(damage),
    survival: `${game.time.toFixed(1)}${attacker.hp > 0 ? '+' : ''}`,
    perCost: side === 1 ? (damage / type.cost).toFixed(2) : '—'
  }
}

console.log(
  '固定シード42、Lv1単騎対標準4体、範囲・状態異常あり、最大60秒（敵はカチカチ4体、味方は清掃員4体。生存打切りは+）'
)
console.log('unit\tside\tdamage\tdamage/cost\tsurvival(s)')
for (const [side, types] of [
  [1, [...POOPS, ...SPECIALS]],
  [-1, ENEMIES]
]) {
  for (const type of types) {
    const result = measure(type, side)
    console.log(`${type.name}\t${side === 1 ? '味方' : '敵'}\t${result.damage}\t${result.perCost}\t${result.survival}`)
  }
}

function measureSquad(type, side) {
  const playerKeys = side === 1 ? [type.key, 'katachi', 'katachi'] : ['katachi', 'katachi', 'korokoro', 'geri', 'bichi']
  const enemyKeys = side === 1 ? ['cleaner', 'sayu', 'washiki', 'mop', 'yoshiki'] : [type.key]
  const game = createGame(
    14,
    playerKeys.map((key, index) => card({ uid: index + 1, key })),
    42
  )
  game.gold = 9999
  game.spawn = 999
  game.opened = true
  game.rushes = 4
  game.turret = 999
  for (const [index] of playerKeys.entries()) {
    summon(game, index)
    game.units.at(-1).x = side === 1 ? (index === 0 ? 585 : 538 + index * 12) : 550 + index * 12
  }
  for (const [index, key] of enemyKeys.entries()) {
    summon(
      game,
      ENEMIES.findIndex((enemy) => enemy.key === key),
      -1
    )
    game.units.at(-1).x = 450 - index * 12
  }
  const attacker = game.units[side === 1 ? 0 : playerKeys.length]
  const targets = game.units.filter((unit) => unit.side !== side)
  while (game.time < 60 && attacker.hp > 0 && targets.some((unit) => unit.hp > 0) && !game.result) step(game, 0.05)
  const damage = targets.reduce((sum, target) => sum + target.maxHp - Math.max(0, target.hp), 0)
  return {
    damage: Math.round(damage),
    perCost: side === 1 ? (damage / (type.cost + 2 * POOPS[0].cost)).toFixed(2) : '—',
    kills: targets.filter((target) => target.hp <= 0).length,
    survival: `${game.time.toFixed(1)}${attacker.hp > 0 ? '+' : ''}`
  }
}

console.log('\n第15面の敵倍率、Lv1、固定シード42、最大60秒（+は生存打切り）')
console.log('味方: 各1体＋カチカチ2体 対 清掃員・白湯・和式・モップ・洋式。ダメージとコストは隊全体')
console.log('敵: 各1体 対 カチカチ2体・コロコロ・ゲリラ・ビチビチ')
console.log('unit\tside\tdamage\tdamage/cost\tkills\tsurvival(s)')
for (const [side, types] of [
  [1, [...POOPS, ...SPECIALS]],
  [-1, ENEMIES]
]) {
  for (const type of types) {
    const result = measureSquad(type, side)
    console.log(
      `${type.name}\t${side === 1 ? '味方' : '敵'}\t${result.damage}\t${result.perCost}\t${result.kills}\t${result.survival}`
    )
  }
}
