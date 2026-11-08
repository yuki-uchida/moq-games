/**
 * Camera and scaling math (DESIGN §3), pure so it can be unit tested.
 *
 * Sharp-bilinear scaling: the world is drawn at 1 art px per pixel into an offscreen canvas of `artW × artH`,
 * upscaled by the integer `up = ceil(scale)` with nearest-neighbour, then drawn smoothly onto the screen canvas at
 * `artW·scale × artH·scale` device pixels.
 */

export const BASE_VIEW_H = 576

export interface Scaling {
  /** Device pixels per art pixel. */
  scale: number
  /** Integer upscale factor used for the intermediate canvas. */
  up: number
  /** Offscreen canvas size in art pixels (covers the whole screen). */
  artW: number
  artH: number
}

/** Scaling for a screen of `screenW × screenH` device pixels showing `viewH` art pixels vertically. */
export function scalingFor(screenW: number, screenH: number, viewH: number): Scaling {
  const w = Math.max(1, screenW)
  const h = Math.max(1, screenH)
  const scale = h / Math.max(16, viewH)
  const up = Math.max(1, Math.ceil(scale - 1e-6))
  return { scale, up, artW: Math.ceil(w / scale), artH: Math.ceil(h / scale) }
}

/** Clamps a camera centre so the view stays inside the map; a map smaller than the view is centred. */
export function clampCamera(cx: number, cy: number, viewW: number, viewH: number, mapW: number, mapH: number) {
  const x = mapW <= viewW ? mapW / 2 : Math.min(mapW - viewW / 2, Math.max(viewW / 2, cx))
  const y = mapH <= viewH ? mapH / 2 : Math.min(mapH - viewH / 2, Math.max(viewH / 2, cy))
  return { x, y }
}

/** Frame-rate independent exponential smoothing factor for a rate in 1/s. */
export const smoothing = (rate: number, dt: number) => 1 - Math.exp(-rate * Math.max(0, dt))

/** Lead toward the cursor: a fraction of the cursor's offset from the screen centre (art px), capped. */
export function cursorLead(dx: number, dy: number, fraction = 0.18, cap = 56) {
  let x = dx * fraction
  let y = dy * fraction
  const d = Math.hypot(x, y)
  if (d > cap) (x *= cap / d), (y *= cap / d)
  return { x, y }
}

/** Ease-in-out for zoom changes. */
export const easeInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

/** Top-left art pixel of the view for a camera centre, rounded to whole pixels. */
export const viewOrigin = (cx: number, cy: number, viewW: number, viewH: number) => ({
  x: Math.round(cx - viewW / 2),
  y: Math.round(cy - viewH / 2)
})

/** Turn index (0..15, 22.5° steps, 0 = right, clockwise on screen) of an angle. */
export function turnOf(angle: number): number {
  const t = Math.round(angle / (Math.PI / 8))
  return ((t % 16) + 16) % 16
}
