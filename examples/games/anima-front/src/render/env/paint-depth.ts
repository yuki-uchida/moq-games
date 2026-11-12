/**
 * Relief (depth) painters for the facade and ground-floor tiles: the same window/door layout as
 * paint-facades.ts, painted as grey levels (white = wall plane, darker = deeper). The atlas material marches this
 * map (parallax occlusion) on facade quads so windows sit in real-looking recesses with frames and sills.
 * DOM only.
 */
import type { Brush } from './paint-kit'

/** Deepest recess the shader can show (m); keep in sync with materials.ts RELIEF_DEPTH. */
export const RELIEF_DEPTH = 0.42

export type DepthPainter = (d: Brush) => void

/** Fills a rect at `metres` below the wall plane. */
function dep(d: Brush, x: number, y: number, w: number, h: number, metres: number) {
  const v = Math.round(255 * (1 - Math.min(1, metres / RELIEF_DEPTH)))
  d.c.fillStyle = `rgb(${v},${v},${v})`
  d.c.fillRect(x, y, w, h)
}

/** Same 2 bays × 2 floors cells as paint-facades.ts. */
function cells(S: number, fn: (x: number, y: number, w: number, h: number) => void) {
  const w = S / 2
  const h = S / 2
  for (let fy = 0; fy < 2; fy++) for (let bx = 0; bx < 2; bx++) fn(bx * w, fy * h, w, h)
}

export const DEPTHS: Record<string, DepthPainter> = {
  fOffice(d) {
    cells(d.S, (x, y, w, h) => {
      dep(d, x + w - 2, y, 2, h, 0.04)
      const ww = w * 0.6
      const wh = h * 0.48
      const wx = x + (w - ww) / 2
      const wy = y + h * 0.18
      dep(d, wx - 3, wy - 3, ww + 6, wh + 6, 0.1)
      dep(d, wx, wy, ww / 2 - 1, wh, 0.3)
      dep(d, wx + ww / 2 + 1, wy, ww / 2 - 1, wh, 0.3)
    })
  },
  fBrick(d) {
    cells(d.S, (x, y, w, h) => {
      const ww = w * 0.38
      const wh = h * 0.48
      const wx = x + (w - ww) / 2
      const wy = y + h * 0.2
      dep(d, wx - 5, wy - 5, ww + 10, wh + 10, 0.06)
      dep(d, wx, wy, ww, wh, 0.32)
      dep(d, wx - 3, wy + wh / 2 - 1.5, ww + 6, 3, 0.2)
    })
  },
  fApartment(d) {
    cells(d.S, (x, y, w, h) => {
      const dw = w * 0.42
      const dh = h * 0.64
      const dx = x + w * 0.14
      const dy = y + h * 0.2
      dep(d, dx - 3, dy - 3, dw + 6, dh + 3, 0.08)
      dep(d, dx, dy, dw / 2 - 1, dh, 0.3)
      dep(d, dx + dw / 2 + 1, dy, dw / 2 - 1, dh, 0.3)
      dep(d, x + w * 0.7, y + h * 0.18, w * 0.2, h * 0.3, 0.26)
    })
  },
  fWood(d) {
    const S = d.S
    for (let x = 0; x < S; x += 12) dep(d, x, 0, 1.5, S, 0.03)
    cells(S, (x, y, w, h) => {
      const ww = w * 0.66
      const wh = h * 0.5
      const wx = x + (w - ww) / 2
      const wy = y + h * 0.2
      dep(d, wx, wy, ww, wh, 0.14)
      for (let k = 1; k < 4; k++) dep(d, wx + (ww * k) / 4 - 1.5, wy, 3, wh, 0.08)
      for (let k = 1; k < 3; k++) dep(d, wx, wy + (wh * k) / 3 - 1.5, ww, 3, 0.08)
    })
  },
  fStation(d) {
    const S = d.S
    dep(d, 0, 0, S, S, 0.14)
    for (let x = 0; x < S; x += S / 6) dep(d, x - 2, 0, 4, S, 0)
    for (let y = 0; y < S; y += S / 4) dep(d, 0, y - 3, S, 6, 0)
  },
  fWarehouse(d) {
    const S = d.S
    for (let x = 0; x < S; x++) dep(d, x, 0, 1, S, 0.025 + 0.025 * Math.sin((x / 10) * Math.PI * 2))
    for (let x = 12; x < S; x += S / 4) dep(d, x, S * 0.3, S / 6, S * 0.08, 0.14)
  },
  fOutpost(d) {
    const S = d.S
    for (let y = 0; y < S; y += 16) dep(d, 0, y + 14, S, 2, 0.04)
    for (const [r, m] of [
      [26, 0.04],
      [21, 0.18]
    ] as const) {
      const v = Math.round(255 * (1 - m / RELIEF_DEPTH))
      d.c.fillStyle = `rgb(${v},${v},${v})`
      d.c.beginPath()
      d.c.arc(S * 0.28, S * 0.62, r, 0, Math.PI * 2)
      d.c.fill()
    }
  },
  fVirtual(d) {
    const S = d.S
    for (let y = 0; y < S; y += S / 2) dep(d, 0, y, S, 2, 0.03)
    for (let x = 0; x < S; x += S / 4) dep(d, x, 0, 2, S, 0.03)
    cells(S, (x, y, w, h) => dep(d, x + 8, y + h * 0.2, w - 16, h * 0.4, 0.12))
  },
  fRuin(d) {
    cells(d.S, (x, y, w, h) => {
      const ww = w * 0.6
      const wh = h * 0.55
      dep(d, x + (w - ww) / 2 + 3, y + h * 0.15 + 3, ww - 6, wh - 4, RELIEF_DEPTH)
    })
  },
  fBlight(d) {
    cells(d.S, (x, y, w, h) => dep(d, x + w * 0.22, y + h * 0.18, w * 0.56, h * 0.5, 0.34))
  },
  gShop(d) {
    const S = d.S
    for (let k = 0; k < 2; k++) {
      const x = k * (S / 2)
      const w = S / 2
      dep(d, x + 10, S * 0.24, w - 20, S - 8 - S * 0.24, 0.22)
    }
  },
  gGlass(d) {
    const S = d.S
    dep(d, 6, 10, S - 12, S - 16, 0.16)
    for (let x = 6; x < S; x += (S - 12) / 4) dep(d, x - 2, 10, 4, S - 16, 0.04)
    dep(d, 0, S * 0.18, S, 4, 0.04)
    dep(d, S * 0.42, S * 0.3, S * 0.16, S * 0.7, 0.3)
  },
  gGarage(d) {
    const S = d.S
    dep(d, S * 0.08, S * 0.15, S * 0.6, S * 0.85, 0.2)
    dep(d, S * 0.76, S * 0.35, S * 0.16, S * 0.65, 0.16)
  },
  gSliding(d) {
    const S = d.S
    for (let k = 0; k < 4; k++) {
      const x = k * (S / 4) + 4
      const w = S / 4 - 8
      dep(d, x, S * 0.12, w, S * 0.82, 0.14)
      for (let j = 1; j < 3; j++) dep(d, x + (w * j) / 3 - 1, S * 0.12, 2.5, S * 0.82, 0.09)
    }
  },
  gPlain(d) {
    const S = d.S
    dep(d, S * 0.15, S * 0.32, S * 0.18, S * 0.68, 0.26)
    dep(d, S * 0.5, S * 0.32, S * 0.32, S * 0.3, 0.26)
  }
}
