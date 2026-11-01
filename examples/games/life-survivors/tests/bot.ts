import { toView } from '../src/view'
import { Game, GIFTED, POOR, type Player } from '../src/game'
import { WEAPON_BY_ID } from '../src/data'

/** A simple kiting autopilot used by tests to play whole lives headlessly. */
export function botInput(game: Game, player: Player, strategy: 'smart' | 'random' | 'bad') {
  // Farm like a person: dodge what is close, pick up experience, otherwise approach the crowd.
  let x = 0
  let y = 0
  let nearestEnemy: { dx: number; dy: number; d: number } | undefined
  for (const enemy of game.state.enemies) {
    const dx = player.x - enemy.x
    const dy = player.y - enemy.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 85) {
      x += (dx / d) * ((85 - d) / 85) * 3
      y += (dy / d) * ((85 - d) / 85) * 3
    }
    if (!nearestEnemy || d < nearestEnemy.d) nearestEnemy = { dx, dy, d }
  }
  let gem: { dx: number; dy: number; d: number } | undefined
  for (const g of game.state.gems) {
    const dx = g.x - player.x
    const dy = g.y - player.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 400 && (!gem || d < gem.d)) gem = { dx, dy, d }
  }
  const fallen = game.state.players.find((p) => p.downed && Math.hypot(p.x - player.x, p.y - player.y) < 600)
  if (fallen) {
    const d = Math.hypot(fallen.x - player.x, fallen.y - player.y) || 1
    x += ((fallen.x - player.x) / d) * 2
    y += ((fallen.y - player.y) / d) * 2
  } else if (gem) {
    x += gem.dx / gem.d
    y += gem.dy / gem.d
  } else if (nearestEnemy && nearestEnemy.d > 110) {
    x -= (nearestEnemy.dx / nearestEnemy.d) * 0.7
    y -= (nearestEnemy.dy / nearestEnemy.d) * 0.7
  }
  const l = Math.hypot(x, y)
  let pick = -1
  if (player.choices.length) {
    const score = (choice: string) => {
      const [kind, id] = choice.split(':')
      if (strategy === 'random') return game.random()
      if (kind !== 'w') return 1.5
      const def = WEAPON_BY_ID.get(id)!
      const talent = def.category ? player.talents[def.category] : 1
      const owned = player.weapons.some((w) => w.id === id)
      const [good, worse] = strategy === 'smart' ? [GIFTED, POOR] : [POOR, GIFTED]
      return talent === good ? 5 : talent === worse ? 0.1 : owned ? 2 : 1.6
    }
    const scores = player.choices.map(score)
    pick = scores.indexOf(Math.max(...scores))
  }
  return { x: l > 0 ? x / l : 0, y: l > 0 ? y / l : 0, pick, pickSeq: player.choiceSeq }
}

export function playLife(seed: number, strategy: 'smart' | 'random' | 'bad', players = 1, maxSeconds = 1810) {
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
