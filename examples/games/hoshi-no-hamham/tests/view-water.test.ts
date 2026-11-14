import { describe, expect, it } from 'vitest'
import { VIEW_H, VIEW_W } from '../src/art/contract'
import { TILE } from '../src/game/types'
import { FILL_FADE, WaterView, type WaterGrid } from '../src/view/water'
import { cellHash } from '../src/view/terrain'

interface Rect {
  style: string
  alpha: number
  x: number
  y: number
  w: number
  h: number
}

/** A context that records every fillRect with the fill style and alpha in force, and counts style changes. */
function recorder() {
  const rects: Rect[] = []
  let fillStyle = '#000'
  let globalAlpha = 1
  let styleChanges = 0
  let alphaChanges = 0
  const ctx = {
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(v: string) {
      styleChanges += 1
      fillStyle = v
    },
    get globalAlpha() {
      return globalAlpha
    },
    set globalAlpha(v: number) {
      alphaChanges += 1
      globalAlpha = v
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ style: fillStyle, alpha: globalAlpha, x, y, w, h })
    }
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    rects,
    get styleChanges() {
      return styleChanges
    },
    get alphaChanges() {
      return alphaChanges
    }
  }
}

const BODY = ['rgba(86,170,232,0.50)', 'rgba(60,128,206,0.58)', 'rgba(44,92,176,0.64)', 'rgba(34,66,140,0.70)']
const SURFACE = '#bfeaff'
const SURFACE_DARK = 'rgba(40,96,170,0.8)'

/** The drawing as it was before the passes: cell by cell, the fill style set again for every rectangle. */
function oldDraw(
  grid: WaterGrid,
  age: ArrayLike<number>,
  t: number,
  ctx: CanvasRenderingContext2D,
  viewX: number,
  viewY: number
) {
  const wet = (tx: number, ty: number) => {
    if (tx < 0 || tx >= grid.w || ty < 0 || ty >= grid.h) return false
    return grid.water[ty * grid.w + tx] === 1
  }
  const x0 = Math.max(0, Math.floor(viewX / TILE))
  const x1 = Math.min(grid.w - 1, Math.floor((viewX + VIEW_W) / TILE))
  const y0 = Math.max(0, Math.floor(viewY / TILE))
  const y1 = Math.min(grid.h - 1, Math.floor((viewY + VIEW_H) / TILE))
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (!wet(tx, ty)) continue
      const i = ty * grid.w + tx
      const fade = Math.min(1, age[i] / FILL_FADE)
      let depth = 0
      while (depth < 3 && wet(tx, ty - depth - 1)) depth++
      const x = tx * TILE
      const y = ty * TILE
      ctx.globalAlpha = fade
      if (wet(tx, ty - 1)) {
        ctx.fillStyle = BODY[depth]
        ctx.fillRect(x, y, TILE, TILE)
      } else {
        ctx.fillStyle = BODY[0]
        for (let px = 0; px < TILE; px += 2) {
          const wx = x + px
          const wave = Math.round(Math.sin(wx * 0.07 + t * 2.6) * 1.6 + Math.sin(wx * 0.19 - t * 1.7) * 1.1) + 5
          ctx.fillRect(wx, y + wave, 2, TILE - wave)
          ctx.fillStyle = SURFACE
          ctx.fillRect(wx, y + wave, 2, 2)
          ctx.fillStyle = SURFACE_DARK
          ctx.fillRect(wx, y + wave + 2, 2, 1)
          ctx.fillStyle = BODY[0]
        }
      }
      const h = cellHash(tx, ty, 11)
      if (h % 2 === 0) {
        const gx = x + ((h >>> 3) % 48) + ((t * 6 + (h % 17)) % 12)
        const gy = y + 14 + ((h >>> 9) % 40)
        ctx.globalAlpha = fade * (0.35 + 0.35 * Math.sin(t * 3 + (h % 13)))
        ctx.fillStyle = SURFACE
        ctx.fillRect(Math.round(gx), gy, 4, 1)
      }
    }
  ctx.globalAlpha = 1
}

/** A pond and a deep pool, a ledge with a lone cell, and some freshly filled cells. */
function makeGrid() {
  const rows = [
    '..........................',
    '..~~~~~...........~.......',
    '..~~~~~..~~~~~....~~......',
    '..~~~~~..~~~~~....~~......',
    '..~~~~~..~~~~~..~~~~~.....',
    '..~~~~~..~~~~~..~~~~~.....',
    '..~~~~~..~~~~~..~~~~~.....',
    '..........................'
  ]
  const w = rows[0].length
  const h = rows.length
  const water = new Uint8Array(w * h)
  rows.forEach((row, y) => [...row].forEach((c, x) => (water[y * w + x] = c === '~' ? 1 : 0)))
  return { w, h, water } as WaterGrid
}

// ---- a tiny software canvas, to compare the pictures the two drawings make

function colour(style: string): [number, number, number, number] {
  if (style.startsWith('#')) {
    const n = parseInt(style.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(style)!
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
}

function composite(rects: Rect[], width: number, height: number, viewX: number, viewY: number) {
  const px = new Float64Array(width * height * 4)
  for (const r of rects) {
    const [cr, cg, cb, ca] = colour(r.style)
    const a = ca * r.alpha
    for (let y = r.y - viewY; y < r.y - viewY + r.h; y++)
      for (let x = r.x - viewX; x < r.x - viewX + r.w; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        const i = (y * width + x) * 4
        const outA = a + px[i + 3] * (1 - a)
        for (let c = 0; c < 3; c++) {
          const src = [cr, cg, cb][c]
          px[i + c] = outA === 0 ? 0 : (src * a + px[i + c] * px[i + 3] * (1 - a)) / outA
        }
        px[i + 3] = outA
      }
  }
  return px
}

describe('WaterView.draw', () => {
  function views(grid: WaterGrid) {
    const view = new WaterView(grid)
    // Fill a few cells so some are still fading in (alpha below 1) and the rest are settled.
    const fresh = [2 * grid.w + 3, 4 * grid.w + 10, 5 * grid.w + 17]
    for (const i of fresh) view['seen'][i] = 0
    view.update(0.05)
    view.update(0.04)
    return view
  }

  for (const [viewX, viewY] of [
    [0, 0],
    [64, 32],
    [400, 120]
  ]) {
    it(`draws the same rectangles per colour as before (view ${viewX}, ${viewY})`, () => {
      const grid = makeGrid()
      const view = views(grid)
      const now = recorder()
      view.draw(now.ctx, viewX, viewY)
      const before = recorder()
      oldDraw(grid, view['age'], view['time'], before.ctx, viewX, viewY)

      const key = (r: Rect) => `${r.style}|${r.alpha.toFixed(9)}|${r.x},${r.y},${r.w},${r.h}`
      expect(before.rects.length).toBeGreaterThan(100)
      expect(now.rects.map(key).sort()).toEqual(before.rects.map(key).sort())
      // Some of the cells are still fading in, so the alphas are not all 1.
      expect(new Set(now.rects.map((r) => r.alpha.toFixed(3))).size).toBeGreaterThan(2)
    })

    it(`makes the same picture as before (view ${viewX}, ${viewY})`, () => {
      const grid = makeGrid()
      const view = views(grid)
      const now = recorder()
      view.draw(now.ctx, viewX, viewY)
      const before = recorder()
      oldDraw(grid, view['age'], view['time'], before.ctx, viewX, viewY)
      const a = composite(now.rects, VIEW_W, VIEW_H, viewX, viewY)
      const b = composite(before.rects, VIEW_W, VIEW_H, viewX, viewY)
      let worst = 0
      for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]))
      expect(worst).toBeLessThan(1e-9)
    })
  }

  it('changes the fill style a handful of times per frame instead of several times per column', () => {
    const grid = makeGrid()
    const view = views(grid)
    const now = recorder()
    view.draw(now.ctx, 0, 0)
    const before = recorder()
    oldDraw(grid, view['age'], view['time'], before.ctx, 0, 0)
    expect(now.styleChanges).toBeLessThanOrEqual(8)
    expect(before.styleChanges).toBeGreaterThan(200)
    // Alphas change per cell only where they differ, and the draw ends at full alpha.
    expect(now.alphaChanges).toBeLessThan(before.alphaChanges)
    expect(now.ctx.globalAlpha).toBe(1)
  })

  it('draws nothing for a view with no water, and keeps drawing correctly frame after frame', () => {
    const empty = recorder()
    new WaterView({ w: 4, h: 4, water: new Uint8Array(16) }).draw(empty.ctx, 0, 0)
    expect(empty.rects).toHaveLength(0)
    const grid = makeGrid()
    const view = views(grid)
    const first = recorder()
    view.draw(first.ctx, 0, 0)
    const second = recorder()
    view.draw(second.ctx, 0, 0)
    expect(second.rects).toEqual(first.rects)
  })
})
