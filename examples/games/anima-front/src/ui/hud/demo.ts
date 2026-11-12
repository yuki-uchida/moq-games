/**
 * HUD demo session (dev only, `?hud-demo[=pve|pvp|training][&end=seconds]`): a Session that animates the fake
 * View from demo-view.ts so the game screen and HUD can be checked and screenshotted without the sim.
 */
import type { Session } from '../../app/session'
import { getMap } from '../../sim/api'
import type { MatchConfig, ModeId, View } from '../../sim/types'
import { demoEvents, demoView } from './demo-view'

export function createDemoSession(config: MatchConfig, me: string, endAfter = Infinity): Session {
  const mode: ModeId = config.mode
  let t = 0
  let paused = false
  let last: View | null = null
  return {
    kind: 'demo',
    me,
    config,
    map: getMap(config.map, config.variant),
    canPause: true,
    get over() {
      return t >= endAfter + 1.5
    },
    setInput() {},
    update(dt) {
      if (paused) return last ? { ...last, events: [] } : null
      const t0 = t
      t += dt
      const v = demoView(mode, t)
      v.events = demoEvents(mode, t0, t, v)
      if (t >= endAfter) {
        v.phase = 'victory'
        if (v.pve) v.pve.result = { score: 864, rank: 'A', time: t, mvp: 'p1' }
        if (v.pvp) v.pvp.winner = 0
      }
      last = v
      return v
    },
    setPaused(p) {
      paused = p
    },
    dispose() {}
  }
}
