/**
 * The pure parts of the screens: time formatting, the star rating, count-up easing, whole-number sprite scales
 * and the nine-slice numbers. No DOM, so the Node tests cover them directly.
 */

/** A clear time as `m:ss.t` (tenths), e.g. 83.4 → `1:23.4`. */
export function formatClock(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10))
  const m = Math.floor(tenths / 600)
  const s = Math.floor((tenths % 600) / 10)
  const t = tenths % 10
  return `${m}:${String(s).padStart(2, '0')}.${t}`
}

/** A total time as `h:mm:ss` or `m:ss`. */
export function formatTotal(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/** The three stars of a clear and what each one asks for (shown under the stars on the result card). */
export const STAR_RULES: readonly { label: string; maxHits: number }[] = [
  { label: 'クリア', maxHits: Infinity },
  { label: 'ダメージ2回まで', maxHits: 2 },
  { label: 'ノーダメージ', maxHits: 0 }
]

/** Stars for a cleared stage: one for the clear, two with at most two hits taken, three with none. */
export function starRating(damage: number): 1 | 2 | 3 {
  const hits = Math.max(0, Math.floor(damage))
  return STAR_RULES.filter((rule) => hits <= rule.maxHits).length as 1 | 2 | 3
}

/** Ease-out for count-ups: fast at first, settling on the value. */
export function countValue(target: number, progress: number): number {
  const p = Math.max(0, Math.min(1, progress))
  return target * (1 - Math.pow(1 - p, 3))
}

/**
 * The largest whole-number scale at which a `w`×`h` sprite fits in `maxW`×`maxH` CSS pixels on a screen with
 * `dpr` device pixels per CSS pixel: the scale is counted in device pixels so every art pixel stays a square
 * block. Returns the device scale and the resulting CSS size (at least scale 1).
 */
export function fitScale(w: number, h: number, maxW: number, maxH: number, dpr = 1) {
  const device = Math.max(1, Math.floor(Math.min((maxW * dpr) / w, (maxH * dpr) / h)))
  return { scale: device, cssW: (w * device) / dpr, cssH: (h * device) / dpr }
}

/** Backing-store factor of a pixel canvas shown `cssW` wide (as the game canvas: 1..4, CSS only scales down). */
export function backingScale(logicalW: number, cssW: number, dpr = 1): number {
  return Math.max(1, Math.min(4, Math.ceil((cssW * dpr) / logicalW)))
}

/** The `ui` sheet's nine-slice sources are 24×24 with 8 px corners. */
export const NINE_SLICE = { size: 24, corner: 8 } as const

/**
 * CSS numbers for a nine-slice drawn at a whole-number `scale`: the slice in source pixels, the border width in
 * CSS pixels and the smallest box that shows the corners without overlap.
 */
export function nineSlice(scale: number, size: number = NINE_SLICE.size, corner: number = NINE_SLICE.corner) {
  const s = Math.max(1, Math.round(scale))
  if (corner * 2 >= size) throw new Error('nine-slice corners must leave a middle')
  return {
    slice: corner,
    border: corner * s,
    middle: size - corner * 2,
    minBox: corner * 2 * s
  }
}

/** One star of the title's star trail: a cleared stage, the next stage to play, or one still ahead. */
export type TrailStar = 'lit' | 'next' | 'dim'

/**
 * The title's star trail: one star per stage, lit for the stages cleared so far (stages open one after another,
 * so the cleared ones are the first `cleared`), the next one to play marked, the visible line and the line a
 * screen reader hears.
 */
export function starTrail(cleared: number, total: number): { stars: TrailStar[]; text: string; label: string } {
  const n = Math.max(0, Math.min(total, Math.floor(cleared)))
  // A fresh player sees the whole way ahead, all dim; the pulse starts once there is a trail to follow.
  const stars = Array.from({ length: total }, (_, i): TrailStar => (i < n ? 'lit' : i === n && n > 0 ? 'next' : 'dim'))
  if (n === 0) return { stars, text: `ぜんぶで ${total}ステージ`, label: `ぜんぶで ${total}ステージ、まだ クリアなし` }
  return { stars, text: `クリア ${n}/${total}`, label: `クリア ${n}/${total}` }
}

/**
 * How far the hero got on the way to the goal, from the deck's track ratios (`trackRatio` of the hero and of the
 * goal): 0 at the start, 1 at the goal, and the rest as a whole percentage for 「ゴールまで あと N%」.
 */
export function goalProgress(hero: number, goal: number): { progress: number; left: number } {
  const progress = goal > 0 ? Math.max(0, Math.min(1, hero / goal)) : 0
  return { progress, left: Math.max(0, Math.min(100, Math.round((1 - progress) * 100))) }
}
