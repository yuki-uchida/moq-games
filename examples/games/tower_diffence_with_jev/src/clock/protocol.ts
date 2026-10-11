export const CLOCK_PULSE_MS = 20
export const CLOCK_STEP_SECONDS = 1 / 60
export const CLOCK_BACKLOG_LIMIT_MS = 2000

export type ClockCommand =
  | { type: 'start'; generation: number }
  | { type: 'stop'; generation: number }
  | { type: 'ack'; generation: number; sequence: number }

export interface ClockPulse {
  type: 'tick'
  generation: number
  sequence: number
  nowMs: number
}

export function monotonicTimeMs(): number {
  return performance.timeOrigin + performance.now()
}
