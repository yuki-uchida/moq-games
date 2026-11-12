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
