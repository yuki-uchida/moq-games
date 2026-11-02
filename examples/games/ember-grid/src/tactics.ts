import { damage, distance, key, reachable, size, type Game, type Unit } from './game'

export function dangerZone(game: Game): Set<string> {
  const result = new Set<string>()
  for (const enemy of game.units.filter((unit) => unit.side === 'enemy' && unit.hp > 0)) {
    // Holding enemies never move, so only their own cell projects reach.
    const positions = enemy.ai === 'hold' ? [key(enemy.x, enemy.y)] : [...reachable(game, enemy).keys()]
    for (const position of positions) {
      const [x, y] = position.split(',').map(Number)
      for (let row = 0; row < size; row++)
        for (let column = 0; column < size; column++)
          if (distance({ x, y }, { x: column, y: row }) <= enemy.range) result.add(key(column, row))
    }
  }
  return result
}

export function forecast(game: Game, attacker: Unit, target: Unit) {
  const chips: string[] = []
  if (attacker.role === 'archer' && target.role === 'wolf') chips.push('相性 +3')
  if (attacker.role === 'soldier' && target.role === 'goblin') chips.push('相性 +1')
  if (target.armor) chips.push(attacker.role === 'mage' ? '魔法は盾無視' : `盾 −${target.armor}`)
  if (game.groves.has(key(target.x, target.y))) chips.push('木立 −2')
  if (target.def) chips.push(`防御 −${target.def}`)
  const amount = damage(attacker, target, game)
  return { amount, after: Math.max(0, target.hp - amount), chips }
}
