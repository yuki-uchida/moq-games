import { toView } from '../src/view'
import { Game, playerStats, type Player } from '../src/game'
import { ENEMY_BY_ID, RUN_SECONDS, WEAPON_BY_ID } from '../src/data'

const INPUT_FRAMES = 6
const FRAME_SECONDS = 1 / 60

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
  x = l > 0 ? x / l : 0
  y = l > 0 ? y / l : 0
  if (strategy === 'smart') {
    const speed = playerStats(player).speed
    const hazards = game.state.enemies
      .filter((enemy) => enemy.hp > 0 && Math.hypot(player.x - enemy.x, player.y - enemy.y) < 300)
      .map((enemy) => {
        const def = ENEMY_BY_ID.get(enemy.kind)!
        const dx = player.x - enemy.x
        const dy = player.y - enemy.y
        const distance = Math.hypot(dx, dy) || 1
        const enemySpeed = def.speed * (enemy.slow > 0 ? 0.45 : 1) * (1 + (game.state.time / RUN_SECONDS) * 0.35)
        const dash =
          def.behavior === 'dash' || (enemy.mode === 2 && (def.behavior === 'charger' || def.behavior === 'boss'))
        return {
          dx,
          dy,
          vx: dash ? enemy.vx : (dx / distance) * enemySpeed,
          vy: dash ? enemy.vy : (dy / distance) * enemySpeed,
          radius: def.radius * enemy.scale + 14,
          damage: def.damage
        }
      })
    for (const bullet of game.state.bullets) {
      if (Math.hypot(player.x - bullet.x, player.y - bullet.y) > 300) continue
      hazards.push({
        dx: player.x - bullet.x,
        dy: player.y - bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        radius: bullet.r + 11,
        damage: bullet.damage
      })
    }
    const risk = (moveX: number, moveY: number) => {
      let damage = 0
      for (const hazard of hazards) {
        for (let step = 1; step <= INPUT_FRAMES; step++) {
          const time = step * FRAME_SECONDS
          const distance = Math.hypot(
            hazard.dx + (moveX * speed - hazard.vx) * time,
            hazard.dy + (moveY * speed - hazard.vy) * time
          )
          damage += Math.max(0, 1 - distance / hazard.radius) * hazard.damage
        }
      }
      return damage
    }
    let bestRisk = risk(x, y)
    if (bestRisk > 0) {
      const desiredX = x
      const desiredY = y
      let bestAlignment = 1
      for (let direction = 0; direction < 8; direction++) {
        const angle = (direction * Math.PI) / 4
        const moveX = Math.cos(angle)
        const moveY = Math.sin(angle)
        const damage = risk(moveX, moveY)
        const alignment = moveX * desiredX + moveY * desiredY
        if (damage < bestRisk || (damage === bestRisk && alignment > bestAlignment)) {
          bestRisk = damage
          bestAlignment = alignment
          x = moveX
          y = moveY
        }
      }
    }
  }
  let pick = -1
  if (player.choices.length) {
    const score = (choice: string) => {
      if (choice === 'f:yes') return 100
      if (choice === 'f:no') return -100
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
  return { x, y, pick, pickSeq: player.choiceSeq }
}

export function playLife(
  seed: number,
  strategy: 'smart' | 'random' | 'bad',
  players = 1,
  maxSeconds = RUN_SECONDS + 10,
  invulnerable = false
) {
  const game = new Game(seed)
  for (let i = 0; i < players; i++) game.addPlayer(`p${i}`)
  if (invulnerable) game['damagePlayer'] = () => {}
  let peak = 0
  let bytes = 0
  while (game.state.phase === 'playing' && game.state.time < maxSeconds) {
    for (const player of game.state.players) game.setInput(player.id, botInput(game, player, strategy))
    for (let i = 0; i < INPUT_FRAMES; i++) game.tick(FRAME_SECONDS)
    peak = Math.max(peak, game.state.enemies.length)
    if (game.state.enemies.length >= peak) bytes = Math.max(bytes, JSON.stringify(toView(game.state)).length)
  }
  return { game, peak, bytes }
}
