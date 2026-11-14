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

/**
 * The most a chasing boss's bar drains by itself, as a share of the bar per second (her stamina falls 4 a second out
 * of 100, 7 when the hero is close).
 */
export const BOSS_DRAIN_PER_SECOND = 0.07

/**
 * How far the target must fall in one step, beyond the slow drain, to count as a hit. A bite takes 9 % of a stamina
 * bar or more at once and a point of a boss's hit points is 1/18 of the bar at the least (5.5 %), so a drop of 3 %
 * is a hit and the drain, which is well under 1 % in a frame, never is.
 */
export const BOSS_HIT_DROP = 0.03

/** Advances the boss bar by `dt` seconds toward `target`. Returns true on the step the target dropped suddenly (a hit). */
export function stepBossBar(bar: BossBarState, target: number, dt: number): boolean {
  const hit = bar.target - target > BOSS_DRAIN_PER_SECOND * dt + BOSS_HIT_DROP
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

/** The continuous meters (markers, fills, the clock) are written together this often (seconds). */
export const METER_TICK = 1 / 15

/**
 * Counts display frames toward the next write of the meters. Returns the time still waited and whether this frame
 * is the one that writes them; a frame longer than a tick still writes only once.
 */
export function stepMeterClock(waited: number, dt: number): { waited: number; due: boolean } {
  const total = waited + dt
  if (total < METER_TICK - 1e-9) return { waited: total, due: false }
  return { waited: Math.min(total - METER_TICK, METER_TICK / 2), due: true }
}

/** How many steps the bite gauge fills in: one per art row of the tooth, so the fill climbs row by row. */
export const BITE_ROWS = 16

/** The rows of the gauge that are lit with `cooldown` seconds left out of `total` (all of them once it is over). */
export function biteRow(cooldown: number, total: number): number {
  if (cooldown <= 0) return BITE_ROWS
  return Math.min(BITE_ROWS - 1, Math.max(0, Math.floor((1 - cooldown / total) * BITE_ROWS)))
}

/**
 * The deck's ambient motion as functions of a clock, so the page runs no CSS animation while nothing else moves
 * (a running animation makes the browser recalculate style in every frame, whatever it animates).
 */
const cycle = (t: number, period: number) => (((t % period) + period) % period) / period

/** The twinkling stars: 0 full, 1 dim, 2 half, over a 2.4 s cycle. */
export function twinkleStep(t: number): 0 | 1 | 2 {
  const p = cycle(t, 2.4)
  return p < 0.4 ? 0 : p < 0.7 ? 1 : 2
}

/**
 * The shooting star crosses the sky for 0.9 s of each 9 s, the first time 3 s after the start: null while it is away,
 * else how far along its path it is (px) and how bright (0..1). It fades in, flies, and fades out at the far end.
 */
export function shootingStar(t: number): { x: number; opacity: number } | null {
  if (t < 3) return null
  const p = (cycle(t - 3, 9) - 0.86) / 0.1
  if (p < 0 || p >= 1) return null
  const x = p < 0.8 ? (p / 0.8) * 120 : 120 + ((p - 0.8) / 0.2) * 30
  const opacity = p < 0.2 ? p / 0.2 : p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2
  return { x, opacity }
}

/** How far along the hint line's swap is after `age` seconds (0..1; it takes 0.42 s and eases out). */
export const SWAP_SECONDS = 0.42
export const swapProgress = (age: number) => {
  const x = Math.max(0, Math.min(1, age / SWAP_SECONDS))
  return 1 - (1 - x) * (1 - x)
}

/** How high the open goal's star is lifted, in quarter steps of 0.3 s over a 1.2 s cycle: 0, 1, 2, 1 px. */
export function goalBob(t: number): 0 | 1 | 2 {
  const step = Math.floor(cycle(t, 1.2) * 4)
  return step === 0 ? 0 : step === 2 ? 2 : 1
}

/** The low-health hearts swell for 0.24 s of each 0.8 s. */
export function heartBeat(t: number): boolean {
  const p = cycle(t, 0.8)
  return p >= 0.15 && p < 0.45
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

/**
 * A hint as the player's input needs it: hints are written for the keyboard (「Z / X でかじる」), and a player
 * on the touch controls has buttons instead of keys.
 */
export const hintForInput = (text: string, touch: boolean) =>
  touch ? text.replace(/Z\s*\/\s*X\s*で/g, '「かじる」ボタンで') : text

/** The collect counter's text (`3/8`). */
export const collectText = (count: number, need: number) => `${Math.max(0, count)}/${need}`

/** Whole-number art scale of the HUD for a stage `cssWidth` px wide (a 640-px-wide stage is 1). */
export const hudScale = (cssWidth: number) => Math.max(1, Math.round(cssWidth / 640))

/**
 * Where the HUD's staging pieces sit, as fractions of the stage height. One set of rules for the HUD (CSS custom
 * properties set from here) and for the staging that feeds it:
 *  - the upper third holds exactly one thing at a time: the stage card or a call (「スタート！」「クリア！」「ファイト！」),
 *    both anchored at `cardTop`; the director never shows a call before the card has gone;
 *  - speech bubbles stay out of that slot (`cardTop`..`cardBottom`, see the overlay);
 *  - the boss nameplate sits in the lower third, its bottom edge `plateBottom` above the stage bottom, i.e. just
 *    above the letterbox bar (`barHeight`, the share of the view the cinematic bars cover), and the camera keeps
 *    the boss above it;
 *  - the toast sits `toastBottom` above the bottom edge, under the nameplate.
 */
export const ZONES = {
  cardTop: 0.18,
  cardBottom: 0.36,
  plateBottom: 0.13,
  /** The lowest the boss's feet may be on screen while his nameplate is up (the plate's top is below this). */
  bossFeet: 0.66,
  toastBottom: 0.04,
  barHeight: 34 / 360
} as const

// ---------------------------------------------------------------------------------------------- control deck

/** What the deck's aim line says, and how it is coloured. */
export type AimTone = 'go' | 'collect' | 'boss' | 'open' | 'clear'

export interface AimLine {
  text: string
  tone: AimTone
}

/** The parts of the world the aim line follows. */
export interface AimState {
  objective: 'reach' | 'collect' | 'boss'
  collected: number
  /** Materials needed on a `collect` stage. */
  need: number
  goalOpen: boolean
  state: 'play' | 'clear' | 'dead'
  boss: { name: string; active: boolean; dead: boolean; stamina: boolean } | null
}

/** The current aim of the stage, in one short line for the deck under a portrait stage. */
export function aimLine(s: AimState): AimLine {
  if (s.state === 'clear') return { text: 'ステージクリア！', tone: 'clear' }
  const boss = s.boss
  if (boss && boss.active && !boss.dead)
    return boss.stamina
      ? { text: `${boss.name}から にげきれ！`, tone: 'boss' }
      : { text: `${boss.name}を たおせ！`, tone: 'boss' }
  if (s.objective === 'collect' && !s.goalOpen)
    return { text: `ざいりょう ${collectText(s.collected, s.need)}`, tone: 'collect' }
  if (s.objective !== 'reach' && s.goalOpen) return { text: 'ゴールがひらいた！', tone: 'open' }
  if (boss && boss.dead) return { text: 'ボスをやっつけた！', tone: 'open' }
  if (s.objective === 'boss') return { text: 'おくの ボスを めざせ！', tone: 'go' }
  return { text: 'ゴールをめざせ！', tone: 'go' }
}

/** Seconds each stage hint stays on the deck's hint line. */
export const HINT_SECONDS = 4.5

/** Seconds a toast holds the hint line before the hints come back. */
export const DECK_TOAST_SECONDS = 2.8

/** Which of `count` hints shows `t` seconds into the cycle (it wraps around); -1 when there are none. */
export const hintIndex = (t: number, count: number, period = HINT_SECONDS) =>
  count > 0 ? Math.floor(Math.max(0, t) / period) % count : -1

/** The hint line `t` seconds into the cycle, worded for the player's input. */
export function hintLine(hints: readonly string[], t: number, touch: boolean, period = HINT_SECONDS): string {
  const i = hintIndex(t, hints.length, period)
  return i < 0 ? '' : hintForInput(hints[i], touch)
}

/** Where `x` (world px) lies along a stage `width` px wide, as 0..1 for the deck's progress track. */
export const trackRatio = (x: number, width: number) => (width > 0 ? Math.max(0, Math.min(1, x / width)) : 0)

// ---------------------------------------------------------------------------------------------- deck line

/**
 * What holds the deck's line for a moment instead of the cycling hints: a toast (a notice) or a speech line (a
 * character's words, shown with their face). Only one shows at a time.
 */
export interface DeckHold {
  kind: 'toast' | 'speech'
  text: string
  /** Seconds it still shows. */
  left: number
}

/**
 * Which hold shows after `incoming` arrives while `current` shows. The newer one wins, with one exception: a toast
 * that only repeats one of the stage's hints is a hint, and hints wait for a speech line (they come back after it).
 */
export function arriveHold(current: DeckHold | null, incoming: DeckHold, hints: readonly string[]): DeckHold {
  if (current?.kind === 'speech' && current.left > 0 && incoming.kind === 'toast' && hints.includes(incoming.text))
    return current
  return incoming
}

/** Advances a hold by `dt` seconds; null once it is over (the hints come back). */
export function stepHold(hold: DeckHold | null, dt: number): DeckHold | null {
  if (!hold) return null
  const left = hold.left - dt
  return left > 0 ? { ...hold, left } : null
}
