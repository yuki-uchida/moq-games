import { damage, distance, key, reachable, type Game, type Unit } from '../src/game'
import { campaign } from '../src/campaign'
/** A reproducible player policy: exploit matchups, finish weakened foes, avoid adjacent threats. */
export function plan(game: Game, unit: Unit) {
  const enemies = game.units.filter((e) => e.side === 'enemy' && e.hp > 0)
  const allies = game.units.filter(
    (ally) => ally.side === 'ally' && ally.hp > 0 && ally.hp < ally.max && ally.id !== unit.id
  )
  const objective = campaign[game.stage].objective
  const options = [...reachable(game, unit).keys()].map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x, y }
  })
  const targetScore = (e: Unit) => damage(unit, e, game) * 3 + (damage(unit, e, game) >= e.hp ? 30 : 0) - e.hp / 5
  const rank = (p: { x: number; y: number }) => {
    if (unit.heal) {
      const wounded = allies.filter((ally) => distance(p, ally) >= 1 && distance(p, ally) <= 2)
      const threat = enemies.reduce((sum, enemy) => sum + (distance(p, enemy) <= enemy.move + enemy.range ? 5 : 0), 0)
      return (
        (wounded.length ? 50 + Math.max(...wounded.map((ally) => ally.max - ally.hp)) : 0) -
        threat +
        (game.groves.has(key(p.x, p.y)) ? 3 : 0)
      )
    }
    const inRange = enemies.filter((e) => distance(p, e) <= unit.range)
    const attack = inRange.length ? Math.max(...inRange.map(targetScore)) + 40 : 0
    const approach = Math.min(...enemies.map((e) => Math.max(0, distance(p, e) - unit.range)))
    const threat = enemies.reduce(
      (sum, e) => sum + (distance(p, e) <= e.range + (e.ai === 'hold' ? 0 : e.move) ? damage(e, unit, game) * 2 : 0),
      0
    )
    const seize = objective.type === 'seize' ? Math.max(0, 20 - distance(p, objective) * 2) : 0
    const defend = objective.type === 'survive' && game.groves.has(key(p.x, p.y)) ? 5 : 0
    return attack - approach * 8 - threat + seize + defend + (game.groves.has(key(p.x, p.y)) ? 3 : 0)
  }
  options.sort((a, b) => rank(b) - rank(a))
  const position = options[0]
  const target = enemies
    .filter((e) => distance(position, e) <= unit.range)
    .sort((a, b) => targetScore(b) - targetScore(a))[0]
  const healing = unit.heal
    ? allies
        .filter((ally) => distance(position, ally) >= 1 && distance(position, ally) <= 2)
        .sort((a, b) => b.max - b.hp - (a.max - a.hp))[0]
    : undefined
  return { position, target: unit.heal ? undefined : target, healing }
}
