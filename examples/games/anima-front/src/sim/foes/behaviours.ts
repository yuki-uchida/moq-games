/** Per-kind behaviour dispatch and death side effects. */
import type { Foe, Sim } from '../state'
import type { ActorRef } from '../types'
import { goutetsu, kuitsukushi } from './bosses'
import { harigane, kagerou, oagos, tsubute } from './creatures'
import { kurozume } from './kurozume'
import { ashinaga, korogashi, korogashiBurst, mitsume, tategami } from './machines'

export function foeBehaviour(sim: Sim, f: Foe) {
  if (f.passive && f.kind !== 'kurozume') return
  switch (f.kind) {
    case 'tsubute':
      return tsubute(sim, f)
    case 'harigane':
      return harigane(sim, f)
    case 'oagos':
      return oagos(sim, f)
    case 'kagerou':
      return kagerou(sim, f)
    case 'mitsume':
      return mitsume(sim, f)
    case 'ashinaga':
      return ashinaga(sim, f)
    case 'korogashi':
      return korogashi(sim, f)
    case 'tategami':
      return tategami(sim, f)
    case 'kurozume':
      return kurozume(sim, f)
    case 'kuitsukushi':
      return kuitsukushi(sim, f)
    case 'goutetsu':
      return goutetsu(sim, f)
  }
}

export function foeDied(sim: Sim, f: Foe, _killer: ActorRef | undefined) {
  // A destroyed コロガシ still bursts at half power (and sets off its neighbours).
  if (f.kind === 'korogashi') korogashiBurst(sim, f, 0.5)
  if (f.avatar) {
    f.avatar.state = 'down'
    for (const h of f.avatar.hands) {
      h.mode = 'idle'
      h.act = 'idle'
    }
  }
}
