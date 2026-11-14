/**
 * `window.__anima`: a read-mostly debug hook for E2E tests (Vite dev server only: production builds never install it, `?debug`
 * does not enable it). It lets a test assert that a match really runs: the sim time advances, foes exist,
 * holding W moves the player and shooting lowers a foe's hp.
 */
import type { RendererStats } from '../render/api'
import type { V3, View } from '../sim/types'
import type { Backdrop } from './context'

/** What the game screen exposes while a match is on. */
export interface MatchProbe {
  view(): View | null
  stats(): RendererStats | null
  /** Yaw the camera looks along now (null before the first frame). */
  cameraYaw(): number | null
  /** Local player id. */
  me: string
  /** Turns the camera (and aim) toward a world point, as if the player moved the mouse. */
  aimAt(p: V3): void
  /** Holds or releases a button the way a device would ('R' = right paw / left click). */
  hold(button: 'R' | 'L' | 'jump' | 'dash' | 'interact', on: boolean): void
}

export interface AnimaDebug {
  /** Id of the screen on top ('title', 'game', 'results'…). */
  readonly screen: string
  /** The current match's latest view (null outside a match). */
  view(): View | null
  /** Renderer stats of the current match. */
  stats(): RendererStats | null
  /** The backdrop: plaza or live attract demo (with its status). */
  backdrop(): ReturnType<Backdrop['status']> | null
  readonly match: MatchProbe | null
}

let probe: MatchProbe | null = null

/** The game screen registers itself while it runs (no-op unless the hook is installed). */
export function setMatchProbe(p: MatchProbe | null): void {
  probe = p
}

/** The hook (an aim / fire control API) exists only on the Vite dev server. */
export function debugEnabled(isDev: boolean): boolean {
  return isDev
}

export function installDebugHook(o: { screen: () => string; backdrop: () => Backdrop | null }): void {
  const hook: AnimaDebug = {
    get screen() {
      return o.screen()
    },
    view: () => probe?.view() ?? null,
    stats: () => probe?.stats() ?? null,
    backdrop: () => o.backdrop()?.status() ?? null,
    get match() {
      return probe
    }
  }
  Object.defineProperty(window, '__anima', { value: hook, configurable: true })
}
