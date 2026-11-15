/** One tick of a living body's controls: look/edges, both paws, movement and the cloak (players and avatars). */
import { cloakTick } from './items/gadgets'
import { handsTick } from './items/hands'
import { movePlayer, readInput, updateShoulder } from './player'
import type { Player, Sim } from './state'

export function stepBody(sim: Sim, p: Player) {
  const { dash } = readInput(p)
  // The pivot the paws aim from this tick: the free shoulder for the new yaw / side.
  updateShoulder(sim, p, 0)
  handsTick(sim, p)
  movePlayer(sim, p, dash)
  cloakTick(sim, p)
}
