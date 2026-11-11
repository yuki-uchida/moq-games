/** The HUD's pure parts: no DOM, so Node tests can check them. */

export type HeartState = 'full' | 'empty' | 'gain' | 'lose'

/**
 * The state of every heart slot. A heart that was lost since `prevHp` is `lose`, a healed one `gain`; the view
 * plays those clips once and then settles on `full` / `empty` (see `settleHeart`).
 */
export function heartStates(hp: number, maxHp: number, prevHp: number): HeartState[] {
  const out: HeartState[] = []
  for (let i = 0; i < maxHp; i++) {
    if (i < hp) out.push(prevHp >= 0 && i >= prevHp ? 'gain' : 'full')
    else out.push(prevHp >= 0 && i < prevHp ? 'lose' : 'empty')
  }
  return out
}

/** What a heart looks like once its one-shot clip is over. */
export const settleHeart = (state: HeartState): 'full' | 'empty' =>
  state === 'full' || state === 'gain' ? 'full' : 'empty'

/** True while the remaining hearts should pulse (two hearts or fewer, and still alive). */
export const isLowHealth = (hp: number) => hp > 0 && hp <= 2

export interface BossBarState {
  /** Where the bright fill is drawn (0..1). */
  fill: number
  /** The lighter trail behind a draining fill (0..1, never below `fill`). */
  trail: number
  /** Seconds the trail still waits before it follows. */
  hold: number
  /** The target of the previous step, to spot a hit. */
  target: number
}

export const newBossBar = (ratio: number): BossBarState => ({ fill: ratio, trail: ratio, hold: 0, target: ratio })

export const bossRatio = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, value / max)) : 0)

const FILL_RATE = 12
const TRAIL_HOLD = 0.45
const TRAIL_SPEED = 0.7

/** Advances the boss bar by `dt` seconds toward `target`. Returns true on the step the target dropped (a hit). */
export function stepBossBar(bar: BossBarState, target: number, dt: number): boolean {
  const hit = target < bar.target - 1e-6
  if (hit) bar.hold = TRAIL_HOLD
  bar.target = target
  // The fill eases toward the target (exponential, frame-rate independent); it never overshoots.
  const k = 1 - Math.exp(-FILL_RATE * dt)
  bar.fill += (target - bar.fill) * k
  if (Math.abs(target - bar.fill) < 0.0015) bar.fill = target
  if (bar.hold > 0) bar.hold = Math.max(0, bar.hold - dt)
  else if (bar.trail > bar.fill) bar.trail = Math.max(bar.fill, bar.trail - TRAIL_SPEED * dt)
  if (bar.fill > bar.trail) bar.trail = bar.fill
  return hit
}

export type PadSide = 'left' | 'right' | null

/** Fraction of the pad's width (centred) where neither side is pressed. */
export const PAD_DEAD_ZONE = 0.08

/**
 * Which key a touch at `x` presses on a pad spanning [`left`, `left + width`]. A touch past either end (the thumb
 * slid off while captured) still presses that end's side, so sliding never lets go.
 */
export function padSide(x: number, left: number, width: number, dead = PAD_DEAD_ZONE): PadSide {
  if (width <= 0) return null
  const r = (x - left) / width
  if (r < 0.5 - dead / 2) return 'left'
  if (r > 0.5 + dead / 2) return 'right'
  return null
}

/** The collect counter's text (`3/8`). */
export const collectText = (count: number, need: number) => `${Math.max(0, count)}/${need}`

/** Whole-number art scale of the HUD for a stage `cssWidth` px wide (a 640-px-wide stage is 1). */
export const hudScale = (cssWidth: number) => Math.max(1, Math.round(cssWidth / 640))
