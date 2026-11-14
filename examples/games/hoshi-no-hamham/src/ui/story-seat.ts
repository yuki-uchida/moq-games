/**
 * Where a rider's feet go on her mount: the height of the mount's back under her in the frame it shows now. Pixel
 * work on one raster, with no DOM, so the Node tests run it on the real art.
 */
import type { Raster } from '../art/raster'

/** Half the width (px) of the stretch of the mount's back a rider sits on. */
export const SEAT_HALF = 6

const cache = new WeakMap<Raster, Map<string, number | null>>()

/**
 * The height above the frame's anchor row of the back under the columns `anchor.x + dx ± halfWidth`: the median over
 * those columns of the topmost opaque pixel (so a stray ear or scarf end does not lift a rider), or null when no
 * column holds a pixel. `dx` is in the frame's own, unmirrored pixels: mirror it before the call for a flipped mount.
 */
export function seatHeight(
  frame: Raster,
  anchor: readonly [number, number],
  dx: number,
  halfWidth: number
): number | null {
  const key = `${anchor[0]},${anchor[1]},${dx},${halfWidth}`
  let byKey = cache.get(frame)
  if (!byKey) cache.set(frame, (byKey = new Map()))
  if (byKey.has(key)) return byKey.get(key)!
  const tops: number[] = []
  const from = Math.round(anchor[0] + dx - halfWidth)
  const to = Math.round(anchor[0] + dx + halfWidth)
  for (let x = Math.max(0, from); x <= Math.min(frame.w - 1, to); x++)
    for (let y = 0; y < frame.h; y++)
      if (frame.data[y * frame.w + x]) {
        tops.push(anchor[1] - y)
        break
      }
  tops.sort((a, b) => a - b)
  const middle = tops.length >> 1
  const height = tops.length ? (tops.length % 2 ? tops[middle] : (tops[middle - 1] + tops[middle]) / 2) : null
  byKey.set(key, height === null ? null : Math.round(height))
  return byKey.get(key)!
}
