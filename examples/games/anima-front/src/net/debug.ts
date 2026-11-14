/**
 * A read-only window hook for browser tests and diagnostics: `window.__animaNet` holds the role, the local player
 * id and the newest view a match session handed to the game screen, plus the lobby's room code.
 * Vite dev server only: production builds never define the global nor keep views anywhere.
 */
import type { View } from '../sim/types'

export interface NetDebug {
  role?: 'host' | 'guest'
  me?: string
  code?: string
  view?: View
  /** Guest prediction numbers (corrections, largest error in metres). */
  prediction?: unknown
  /** Host: world ticks stepped so far. */
  steps?: number
  /** Recent connection events (status reports, reconnections), newest last. */
  log?: string[]
}

/** The hook exists only on the Vite dev server (pure so the gate is unit-testable). */
export function netDebugEnabled(isDev: boolean, hasWindow: boolean): boolean {
  return isDev && hasWindow
}

const IS_DEV = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

export function netDebug(patch: Partial<NetDebug>) {
  if (!netDebugEnabled(IS_DEV, typeof window !== 'undefined')) return
  const w = window as unknown as { __animaNet?: NetDebug }
  w.__animaNet = Object.assign(w.__animaNet ?? {}, patch)
}

/** Appends a connection event to `__animaNet.log` (at most 60 kept). */
export function netLog(text: string) {
  if (!netDebugEnabled(IS_DEV, typeof window !== 'undefined')) return
  const w = window as unknown as { __animaNet?: NetDebug }
  const log = (w.__animaNet?.log ?? []).concat(`${(performance.now() / 1000).toFixed(1)} ${text}`).slice(-60)
  netDebug({ log })
}
