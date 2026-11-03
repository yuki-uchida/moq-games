import { toView } from '../src/view'
import { Game, type Player } from '../src/game'
import { ENEMY_BY_ID, RUN_SECONDS, WEAPON_BY_ID } from '../src/data'

/** A simple kiting autopilot used by tests to play whole lives headlessly. */
export function botInput(game: Game, player: Player, strategy: 'smart' | 'random' | 'bad') {
  // Farm like a person: dodge what is close, pick up experience, otherwise approach the crowd.
  let x = 0
  let y = 0
  let nearestEnemy: { dx: number; dy: number; d: number } | undefined
  let beamTarget: { dx: number; dy: number; d: number } | undefined
  for (const enemy of game.state.enemies) {
    const dx = player.x - enemy.x
    const dy = player.y - enemy.y
    const d = Math.hypot(dx, dy) || 1
    // Life events (bosses) get a much wider berth than the crowd.
    const room = ENEMY_BY_ID.get(enemy.kind)!.behavior === 'boss' ? 240 : 85
    if (d < room) {
      x += (dx / d) * ((room - d) / room) * 3
      y += (dy / d) * ((room - d) / room) * 3
    }
    if (!nearestEnemy || d < nearestEnemy.d) nearestEnemy = { dx, dy, d }
    if (d > 100 && d < 320 && (!beamTarget || d < beamTarget.d)) beamTarget = { dx, dy, d }
    if (strategy === 'smart' && enemy.windup > 0 && d < 420) {
      // A telegraphed charge: step off the line it is about to run along.
      const ax = enemy.tx - enemy.x
      const ay = enemy.ty - enemy.y
      const al = Math.hypot(ax, ay) || 1
      const nx = -ay / al
      const ny = ax / al
      const side = Math.sign(dx * nx + dy * ny) || 1
      x += nx * side * 2.5
      y += ny * side * 2.5
    }
  }
  if (strategy === 'smart')
    // Sidestep what is about to hit: dodge across the bullet's path, not away from where it is.
    for (const bullet of game.state.bullets) {
      const rx = player.x - bullet.x
      const ry = player.y - bullet.y
      if (Math.abs(rx) > 240 || Math.abs(ry) > 240) continue
      const speed2 = bullet.vx * bullet.vx + bullet.vy * bullet.vy || 1
      const t = Math.min(1.5, Math.max(0, (rx * bullet.vx + ry * bullet.vy) / speed2))
      const miss = Math.hypot(rx - bullet.vx * t, ry - bullet.vy * t)
      if (t <= 0 || miss > 58) continue
      const speed = Math.sqrt(speed2)
      const px = -bullet.vy / speed
      const py = bullet.vx / speed
      const side = Math.sign(rx * px + ry * py) || 1
      const weight = ((58 - miss) / 58) * 6
      x += px * side * weight
      y += py * side * weight
    }
  let gem: { dx: number; dy: number; d: number } | undefined
  for (const g of game.state.gems) {
    const dx = g.x - player.x
    const dy = g.y - player.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 400 && (!gem || d < gem.d)) gem = { dx, dy, d }
  }
  // Meals when hurt and chests (a turning point for everyone) are worth a detour.
  let prize: { dx: number; dy: number; d: number } | undefined
  if (strategy === 'smart')
    for (const item of game.state.items) {
      if (item.kind === 'meal' && player.hp > player.maxHp * 0.75) continue
      const dx = item.x - player.x
      const dy = item.y - player.y
      const d = Math.hypot(dx, dy) || 1
      if (d < 520 && (!prize || d < prize.d)) prize = { dx, dy, d }
    }
  const fallen = game.state.players.find((p) => p.downed && Math.hypot(p.x - player.x, p.y - player.y) < 600)
  if (fallen) {
    const d = Math.hypot(fallen.x - player.x, fallen.y - player.y) || 1
    x += ((fallen.x - player.x) / d) * 2
    y += ((fallen.y - player.y) / d) * 2
  } else if (prize) {
    x += (prize.dx / prize.d) * 2
    y += (prize.dy / prize.d) * 2
  } else if (gem) {
    x += gem.dx / gem.d
    y += gem.dy / gem.d
  } else if (nearestEnemy && nearestEnemy.d > 110) {
    x -= (nearestEnemy.dx / nearestEnemy.d) * 0.7
    y -= (nearestEnemy.dy / nearestEnemy.d) * 0.7
  }
  if (
    strategy === 'smart' &&
    beamTarget &&
    player.weapons.some((weapon) => WEAPON_BY_ID.get(weapon.id)?.behavior === 'beam' && weapon.cd <= 0.11)
  ) {
    x = -beamTarget.dx
    y = -beamTarget.dy
  }
  const l = Math.hypot(x, y)
  let pick = -1
  if (player.choices.length) {
    const score = (choice: string) => {
      const [kind, id] = choice.split(':')
      if (strategy === 'random') return game.random()
      if (kind !== 'w') {
        // A well-read life knows which temperament finishes a card that is nearly maxed out.
        const finishes = player.weapons.some((w) => {
          const evolve = WEAPON_BY_ID.get(w.id)?.evolve
          return evolve?.passive === id && w.lv >= 5 && !player.passives.some((s) => s.id === id)
        })
        return finishes ? 6 : 1.5
      }
      const def = WEAPON_BY_ID.get(id)!
      const talent = def.category ? player.talents[def.category] : 1
      const owned = player.weapons.some((w) => w.id === id)
      const fit = strategy === 'smart' ? talent ** 3 * 1.6 : 1.6 / talent ** 3
      // Depth beats breadth: a card you already hold keeps growing.
      return owned ? fit * 2 + 1 : fit
    }
    const scores = player.choices.map(score)
    pick = scores.indexOf(Math.max(...scores))
  }
  return { x: l > 0 ? x / l : 0, y: l > 0 ? y / l : 0, pick, pickSeq: player.choiceSeq }
}

export function playLife(
  seed: number,
  strategy: 'smart' | 'random' | 'bad',
  players = 1,
  maxSeconds = RUN_SECONDS + 10
) {
  const game = new Game(seed)
  for (let i = 0; i < players; i++) game.addPlayer(`p${i}`)
  let peak = 0
  let bytes = 0
  while (game.state.phase === 'playing' && game.state.time < maxSeconds) {
    for (const player of game.state.players) game.setInput(player.id, botInput(game, player, strategy))
    for (let i = 0; i < 6; i++) game.tick(1 / 60)
    peak = Math.max(peak, game.state.enemies.length)
    if (game.state.enemies.length >= peak) bytes = Math.max(bytes, JSON.stringify(toView(game.state)).length)
  }
  return { game, peak, bytes }
}
