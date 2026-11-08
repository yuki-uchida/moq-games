import { Game, coverAt, progress, retryState, type GameState, type Player } from '../src/game'
import { TUNNEL_NODES, isUnderground, lineOfSight, underWheels, vehiclesAt, type Point } from '../src/map'
import { STAGES } from '../src/stages'
import { STEP } from '../src/stages/town/script'
import { KINDS, flies } from '../src/stealth'
import { CautiousBot, idle, reachable, steer } from './bot'

const TOWN = 1
const town = STAGES[TOWN]
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)

/**
 * Plays chapter 2 like a careful player who knows the way: follows the script's markers, taps E at NPCs and holds
 * it at the net and the grate, eats when hungry (where nobody watches over the food), and crawls on through a
 * storm drain if it ducks into one. With `threats` it uses the shared CautiousBot (hide and wait while suspected
 * or chased) plus a player's habits: while hidden and someone close looks its way it keeps still, it dashes
 * rather than creeps when chased, and it judges traffic at its real pace. A lost run retries from the last
 * checkpoint as the game does, and people carry it back to the step checkpoint.
 */
export function playTown(seed: number, threats: boolean, limitMinutes: number) {
  let game = new Game(seed, undefined, TOWN)
  game.addPlayer('rabbit', 'Rabbit')
  game.state.players[0].hunger = 60 // arriving from chapter 1: each chapter starts at hunger ≥ 60
  const id = game.state.players[0].id
  const policy = () => new CautiousBot(game, id, { calmSeconds: 20, threatRange: 12 })
  let bot = policy()
  let checkpoint: GameState = structuredClone(game.state)
  let pulse = false
  const log = { minutes: Infinity, retries: 0, carriedBack: 0, downed: 0, stepAt: [] as number[] }
  const delay = threats ? (seed * 11) % 30 : 0 // seeds also start out of step with the patrols and the traffic
  for (let frame = 0; frame < limitMinutes * 3600; frame++) {
    const { state } = game
    if (state.stage !== TOWN) return { ...log, minutes: Math.round((state.time / 60) * 10) / 10 }
    if (!threats) state.predators = []
    if (state.phase === 'lost') {
      log.retries++
      game = Game.resume(retryState(checkpoint, state), seed + log.retries)
      bot = policy()
      continue
    }
    if (log.stepAt.length <= state.step) log.stepAt[state.step] = Math.round(state.time)
    if (state.time < delay) {
      game.step(1 / 60)
      continue
    }
    const player = state.players[0] as Player
    const marker = town.script.markers!(state)[0]
    const food =
      player.hunger < 45
        ? state.foods
            .filter(
              (entry) =>
                entry.active &&
                reachable(player, entry) &&
                (player.hunger < 12 ||
                  !state.predators.some(
                    (predator) =>
                      distance(predator, entry) < 12 ||
                      (!flies(predator.kind) && predator.route?.some((point) => distance(point, entry) < 6))
                  ))
            )
            .sort((a, b) => distance(a, player) - distance(b, player))[0]
        : undefined
    const goal: Point =
      food ??
      (player.carrying === 'bread' && player.x < 40
        ? { x: 41, z: 7.8 }
        : player.carrying === 'bread' && player.x < 80
          ? { x: 81, z: -12 }
          : marker)
    if (isUnderground(player.x, player.y, player.z)) {
      // In a drain pipe: crawl to the grate on the goal's side and hop out.
      const exits = TUNNEL_NODES.filter((node) => Math.abs(node.z - player.z) < 2)
      const out = exits.sort((a, b) => Math.abs(a.x - goal.x) - Math.abs(b.x - goal.x))[0]
      const dx = out.x - player.x
      game.setInput(id, { ...idle, moveX: Math.sign(dx), jump: Math.abs(dx) < 1 && frame % 2 === 0 })
      game.step(1 / 60)
      continue
    }
    const cover = coverAt(player.x, player.y, player.z, false)
    const watched =
      cover !== 'open' &&
      cover !== 'canopy' &&
      state.predators.some((predator) => {
        const range = distance(predator, player)
        if (flies(predator.kind) || range > KINDS[predator.kind].sight * 0.9) return false
        const facing = Math.cos(Math.atan2(player.x - predator.x, player.z - predator.z) - predator.angle)
        const eye = predator.y + KINDS[predator.kind].eye
        return (facing > 0 || range < 5) && lineOfSight(predator.x, eye, predator.z, player.x, player.y + 0.4, player.z)
      })
    const { left, ...input } =
      food && player.hunger < 12
        ? { ...idle, ...steer(player, goal), sprint: true } // starving: eat now
        : watched && !food
          ? { ...idle, left: distance(goal, player) }
          : bot.input(goal, { crouch: false })
    const pace = (input.sprint && !player.carrying ? 9 : 5.2) * (player.carrying ? 0.8 : 1)
    const hit = (t: number, moving: boolean) =>
      vehiclesAt(state.time + t).some((car) =>
        underWheels(
          car,
          player.x + (moving ? input.moveX * pace * t : 0),
          player.z + (moving ? input.moveZ * pace * t : 0),
          1.2
        )
      )
    const soon = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5]
    if (soon.some((t) => hit(t, true)) && !soon.some((t) => hit(t, false))) Object.assign(input, { moveX: 0, moveZ: 0 })
    const moving = input.moveX !== 0 || input.moveZ !== 0
    if (moving && state.predators.some((predator) => predator.targetId === id && predator.state === 'chase'))
      Object.assign(input, { crouch: false, sprint: !player.carrying })
    pulse = !pulse
    const talk = marker.kind === 'npc' && distance(marker, player) < 2.2 && !food
    const hold =
      marker.kind === 'goal' &&
      (state.step === STEP.net || (state.step === STEP.bank && !state.open)) &&
      left < 1.6 &&
      !food
    const [x, z, downed] = [player.x, player.z, player.downed]
    game.setInput(id, {
      ...input,
      ...(hold ? { moveX: 0, moveZ: 0, crouch: false } : {}),
      interact: hold || (talk && pulse)
    })
    game.step(1 / 60)
    if (!downed && player.downed) log.downed++
    else if (distance(player, { x, z }) > 5 && game.state.stage === TOWN) log.carriedBack++
    if (game.state.phase === 'playing' && progress(game.state) > progress(checkpoint))
      checkpoint = structuredClone(game.state)
  }
  return log
}
