import { damage, distance, key, reachable, type Game, type Unit } from '../src/game'
/** A reproducible player policy: exploit matchups, finish weakened foes, avoid adjacent threats. */
export function plan(game: Game, unit: Unit) {
  const enemies = game.units.filter((e) => e.side === 'enemy' && e.hp > 0)
  const options = [...reachable(game, unit).keys()].map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x, y }
  })
  const targetScore = (e: Unit) => damage(unit, e, game) * 3 + (damage(unit, e, game) >= e.hp ? 30 : 0) - e.hp / 5
  const rank = (p: { x: number; y: number }) => {
    const inRange = enemies.filter((e) => distance(p, e) <= unit.range)
    const attack = inRange.length ? Math.max(...inRange.map(targetScore)) + 40 : 0
    const approach = Math.min(...enemies.map((e) => Math.max(0, distance(p, e) - unit.range)))
    const threat = enemies.reduce((sum, e) => sum + (distance(p, e) <= e.range ? damage(e, unit, game) * 2 : 0), 0)
    return attack - approach * 8 - threat + (game.groves.has(key(p.x, p.y)) ? 3 : 0)
  }
  options.sort((a, b) => rank(b) - rank(a))
  const position = options[0]
  const target = enemies
    .filter((e) => distance(position, e) <= unit.range)
    .sort((a, b) => targetScore(b) - targetScore(a))[0]
  return { position, target }
}
