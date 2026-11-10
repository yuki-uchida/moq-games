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

/** Share of the way toward a just-solved thing the camera glances, and the hero's margins from the view edges. */
export const GLANCE = { share: 0.45, marginX: 120, marginY: 140 }

/**
 * Camera offset of a glance toward a target `dx, dy` art px from the followed point: `GLANCE.share` of the way,
 * capped per axis so the followed hero stays on screen with a margin (room for the cursor lead too).
 */
export function glanceOffset(dx: number, dy: number, viewW: number, viewH: number) {
  const mx = Math.max(0, viewW / 2 - GLANCE.marginX)
  const my = Math.max(0, viewH / 2 - GLANCE.marginY)
  return {
    x: Math.max(-mx, Math.min(mx, dx * GLANCE.share)),
    y: Math.max(-my, Math.min(my, dy * GLANCE.share))
  }
}

/** Insets (art px) of the off-screen arrow from the view edges: clear of the HUD banners on top and the key hints below. */
export const MARKER_INSET = { left: 36, right: 36, top: 100, bottom: 76 }

/**
 * Where an on-screen arrow points at an off-screen target (view-relative art px `x, y` from the top-left): the point
 * on the inset box's edge on the line from the box centre toward the target, and its angle; undefined when the
 * target is inside the box.
 */
export function edgeMarker(x: number, y: number, viewW: number, viewH: number, inset = MARKER_INSET) {
  const x0 = inset.left
  const x1 = viewW - inset.right
  const y0 = inset.top
  const y1 = viewH - inset.bottom
  if (x1 <= x0 || y1 <= y0 || (x >= x0 && x <= x1 && y >= y0 && y <= y1)) return undefined
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const dx = x - cx
  const dy = y - cy
  const k = Math.min((x1 - x0) / 2 / Math.max(1e-6, Math.abs(dx)), (y1 - y0) / 2 / Math.max(1e-6, Math.abs(dy)))
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) }
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
