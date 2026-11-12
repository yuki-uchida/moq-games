/**
 * クロヅメ animals (DESIGN §11): a Player avatar on the foe side driven by the bot AI (or a neutral input for
 * training dummies), stepped with the shared body code; the foe mirrors its position and facing.
 */
import { animaTick } from '../anima'
import { stepBody } from '../body'
import { botThink } from '../bots/index'
import type { Foe, Sim } from '../state'
import { setState } from './common'

export function kurozume(sim: Sim, f: Foe) {
  const av = f.avatar
  if (!av) return
  if (f.passive) {
    av.input.mx = 0
    av.input.mz = 0
    av.input.held = 0
  } else botThink(sim, av)
  stepBody(sim, av)
  // The avatar pays its antiques from its own anima pool (regenerating normally); damage goes to f.hp.
  animaTick(sim, av)
  f.p[0] = av.p[0]
  f.p[1] = av.p[1]
  f.p[2] = av.p[2]
  f.v[0] = av.v[0]
  f.v[1] = av.v[1]
  f.v[2] = av.v[2]
  f.yaw = av.yaw
  f.grounded = av.grounded
  const busy = av.hands.some((h) => h.act !== 'idle')
  const want = busy ? 'attack' : 'move'
  if (f.state !== want) setState(f, want)
}
