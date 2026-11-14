/**
 * Drawing the staging's pictures ahead of their first use. The browser compiles a shader program the first time a
 * kind of drawing is asked of the GPU (a rounded speech bubble with its outline and its text, the spotlight's ring,
 * the iris, a turned sprite), and nothing new is shown until it has: the first speech bubble of a stage held the
 * picture for about 50 ms on a desktop GPU, right as the stage opened. Here one of each is drawn on the game's own
 * canvas, at the size the game draws them, and handed to the GPU at once. The caller clears the canvas next, in the
 * same frame, so none of it is ever shown.
 */
import { VIEW_H, VIEW_W } from '../art/contract'
import { Overlay, POPUP_TEXTS, STAGED_LINES } from './overlay'
import type { Renderer } from './renderer'

/** What the rehearsal needs of the page: a copy of one pixel of a canvas (the browser's `createImageBitmap`). */
export type Snapshot = (canvas: HTMLCanvasElement) => unknown

const pageSnapshot: Snapshot | null =
  typeof createImageBitmap === 'function'
    ? (canvas) =>
        createImageBitmap(canvas, 0, 0, 1, 1).then(
          (bitmap) => bitmap.close(),
          () => {}
        )
    : null

/**
 * Draws one of each staging picture on the renderer's canvas and hands them to the GPU. Returns false, having drawn
 * nothing, where that cannot be done (no way to copy from a canvas, or a context without rounded rectangles).
 * The canvas is left with the rehearsal on it: clear it before the frame is shown.
 */
export function primeStagingPictures(renderer: Renderer, snapshot: Snapshot | null = pageSnapshot): boolean {
  const ctx = renderer.ctx
  if (!snapshot || typeof ctx.roundRect !== 'function') return false
  try {
    const overlay = new Overlay(false)
    // Speech in both tones with their words, and the wordless balloons a portrait stage shows instead.
    overlay.bubble(STAGED_LINES[0], { x: VIEW_W * 0.3, y: VIEW_H * 0.75 }, 2, 'yell')
    overlay.bubble(STAGED_LINES[1], { x: VIEW_W * 0.7, y: VIEW_H * 0.75 }, 2, 'say')
    overlay.bubble('', { x: VIEW_W * 0.3, y: VIEW_H * 0.95 }, 2, 'yell', true)
    overlay.bubble('', { x: VIEW_W * 0.7, y: VIEW_H * 0.95 }, 2, 'say', true)
    // The texts that rise from a hit, the red pulse, a flash, the spotlight and the arrow toward the goal.
    overlay.popup(POPUP_TEXTS[2], VIEW_W * 0.4, VIEW_H * 0.5, '#ffd45e')
    overlay.popup(POPUP_TEXTS[0], VIEW_W * 0.6, VIEW_H * 0.5)
    overlay.hurt()
    overlay.flash('#ffffff', 0.5, 1)
    overlay.spotlight(true)
    overlay.pointer = { x: VIEW_W - 28, y: VIEW_H / 2, angle: 0.4 }
    // Twice: early, while the bubbles pop in at a smaller size, and settled, under the letterbox and a closing iris.
    overlay.update(0.03)
    renderer.screen()
    overlay.drawPopups(ctx, 0, 0, renderer.k)
    overlay.drawScreen(ctx)
    overlay.letterbox(true, 0.01)
    overlay.irisSnap(0.5)
    overlay.update(0.3)
    renderer.screen()
    overlay.drawPopups(ctx, 0, 0, renderer.k)
    overlay.drawScreen(ctx)
    // To copy a pixel the browser has to send the drawing above to the GPU now; without this, the clear that
    // follows would let it drop what it has not sent yet.
    snapshot(renderer.canvas)
    return true
  } catch {
    // A browser that cannot draw one of these says so again when a stage asks; the rehearsal must not stop the game.
    return false
  }
}
