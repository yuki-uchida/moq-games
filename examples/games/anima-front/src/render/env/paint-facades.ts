/**
 * Facade, ground-floor and roof tile painters (2 bays × 2 floors per facade tile). Albedo goes to `b`, light
 * (lit windows, neon, seams) to `e`. DOM only.
 */
import { Brush, withAlpha } from './paint-kit'

export type Painter = (b: Brush, e: Brush) => void

type WindowState = 'dark' | 'lit' | 'broken' | 'boarded'

function windowState(b: Brush, litChance = 0.22, brokenChance = 0.16): WindowState {
  const r = b.r()
  if (r < brokenChance) return 'broken'
  if (r < brokenChance + 0.06) return 'boarded'
  if (r < brokenChance + 0.06 + litChance) return 'lit'
  return 'dark'
}

/** A window pane: glass with sky reflection, or lit, broken or boarded; light goes to the emissive brush. */
function pane(
  b: Brush,
  e: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  state: WindowState,
  glass = '#33506e',
  warm = '#ffd38a'
) {
  const c = b.c
  if (state === 'boarded') {
    c.fillStyle = '#2a2420'
    c.fillRect(x, y, w, h)
    c.fillStyle = '#8a6a4a'
    for (let i = 0; i < 3; i++) {
      c.save()
      c.translate(x + w / 2, y + h * (0.25 + i * 0.25))
      c.rotate(b.range(-0.2, 0.2))
      c.fillRect(-w * 0.55, -h * 0.07, w * 1.1, h * 0.14)
      c.restore()
    }
    return
  }
  if (state === 'lit') {
    // By day a lit room just reads as warm curtains behind glass; the light is in the emissive map.
    b.vgrad(x, y, w, h, '#b9a58c', '#8f7a66')
    c.fillStyle = 'rgba(255,255,255,0.12)'
    c.fillRect(x + w * 0.1, y, w * 0.12, h)
    c.fillStyle = 'rgba(120,70,50,0.35)'
    c.fillRect(x, y, w * 0.22, h)
    c.fillRect(x + w * 0.78, y, w * 0.22, h)
    const g = e.c.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, warm)
    g.addColorStop(1, '#ff9a4a')
    e.c.fillStyle = g
    e.c.fillRect(x, y, w, h)
    e.c.fillStyle = 'rgba(0,0,0,0.55)'
    e.c.fillRect(x, y, w * 0.22, h)
    e.c.fillRect(x + w * 0.78, y, w * 0.22, h)
    return
  }
  b.vgrad(x, y, w, h, shadeHex(glass, 1.45), glass)
  // Diagonal sky reflection.
  c.save()
  c.beginPath()
  c.rect(x, y, w, h)
  c.clip()
  c.fillStyle = 'rgba(255,255,255,0.16)'
  c.beginPath()
  c.moveTo(x + w * 0.15, y + h)
  c.lineTo(x + w * 0.55, y)
  c.lineTo(x + w * 0.8, y)
  c.lineTo(x + w * 0.4, y + h)
  c.fill()
  if (state === 'broken') {
    // Dark room behind, a few glass shards left in the frame corners.
    c.fillStyle = '#1b1f27'
    c.fillRect(x, y, w, h)
    c.fillStyle = shadeHex(glass, 1.25)
    const corners: [number, number, number, number][] = [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1]
    ]
    for (const [px, py, sx, sy] of corners) {
      if (b.r() < 0.35) continue
      c.beginPath()
      c.moveTo(px, py)
      c.lineTo(px + sx * w * b.range(0.25, 0.7), py)
      c.lineTo(px + sx * w * b.range(0.05, 0.2), py + sy * h * b.range(0.2, 0.45))
      c.lineTo(px, py + sy * h * b.range(0.3, 0.6))
      c.closePath()
      c.fill()
    }
  }
  c.restore()
}

function frame(b: Brush, x: number, y: number, w: number, h: number, color: string, t = 3) {
  const c = b.c
  c.strokeStyle = color
  c.lineWidth = t
  c.strokeRect(x + t / 2, y + t / 2, w - t, h - t)
}

export function shadeHex(color: string, k: number): string {
  const n = parseInt(color.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`
}

const FLOORS = 2
const BAYS = 2

/** Iterates the 2×2 window cells of a facade tile. */
function cells(S: number, fn: (x: number, y: number, w: number, h: number, i: number) => void) {
  const w = S / BAYS
  const h = S / FLOORS
  let i = 0
  for (let fy = 0; fy < FLOORS; fy++) for (let bx = 0; bx < BAYS; bx++) fn(bx * w, fy * h, w, h, i++)
}

export const FACADES: Record<string, Painter> = {
  fOffice(b, e) {
    const S = b.S
    b.fill('#c9c6bf')
    b.blotch(10, ['#b5b0a6', '#dcd8d0'], [20, 60], 0.25)
    cells(S, (x, y, w, h) => {
      // Spandrel band and panel joints.
      b.c.fillStyle = '#b7b3ab'
      b.c.fillRect(x, y + h * 0.78, w, h * 0.22)
      b.c.fillStyle = 'rgba(0,0,0,0.12)'
      b.c.fillRect(x, y + h * 0.78, w, 2)
      b.c.fillRect(x + w - 2, y, 2, h)
      const ww = w * 0.6
      const wh = h * 0.48
      const wx = x + (w - ww) / 2
      const wy = y + h * 0.18
      b.c.fillStyle = '#5d6670'
      b.c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6)
      // Two panes per window.
      pane(b, e, wx, wy, ww / 2 - 1, wh, windowState(b), '#3a5878')
      pane(b, e, wx + ww / 2 + 1, wy, ww / 2 - 1, wh, windowState(b), '#3a5878')
      b.streaks(wx, wx + ww, wy + wh + 3, h * 0.35, '#5a5248', 0.22, 3)
    })
    b.speckle(500, ['#8a857c', '#e8e4dc'], [1, 2], 0.3)
  },
  fBrick(b, e) {
    const S = b.S
    b.fill('#a5543e')
    bricks(b, 0, 0, S, S, ['#a85a42', '#9a4c38', '#b46448', '#8e4434'], 14, 7)
    cells(S, (x, y, w, h) => {
      const ww = w * 0.38
      const wh = h * 0.48
      const wx = x + (w - ww) / 2
      const wy = y + h * 0.2
      b.c.fillStyle = '#e8e0d0'
      b.c.fillRect(wx - 5, wy - 5, ww + 10, wh + 10)
      pane(b, e, wx, wy, ww, wh, windowState(b), '#34485e')
      frame(b, wx, wy, ww, wh, '#efe8da', 3)
      b.c.fillStyle = '#efe8da'
      b.c.fillRect(wx - 3, wy + wh / 2 - 1.5, ww + 6, 3)
      // Stone sill and lintel.
      b.c.fillStyle = '#d8ccb8'
      b.c.fillRect(wx - 8, wy + wh + 5, ww + 16, 6)
      b.c.fillRect(wx - 8, wy - 11, ww + 16, 6)
      b.streaks(wx, wx + ww, wy + wh + 11, h * 0.3, '#3a2a22', 0.25, 2)
    })
  },
  fApartment(b, e) {
    const S = b.S
    b.fill('#efe4cf')
    // Small cream tiles.
    b.c.strokeStyle = 'rgba(160,140,110,0.25)'
    b.c.lineWidth = 1
    for (let y = 0; y <= S; y += 8) {
      b.c.beginPath()
      b.c.moveTo(0, y)
      b.c.lineTo(S, y)
      b.c.stroke()
    }
    for (let x = 0; x <= S; x += 16) {
      b.c.beginPath()
      b.c.moveTo(x, 0)
      b.c.lineTo(x, S)
      b.c.stroke()
    }
    b.blotch(8, ['#d8c8a8', '#fff6e4'], [20, 50], 0.3)
    cells(S, (x, y, w, h, i) => {
      // Tall balcony door + a small window.
      const dw = w * 0.42
      const dh = h * 0.64
      const dx = x + w * 0.14
      const dy = y + h * 0.2
      b.c.fillStyle = '#8a8c88'
      b.c.fillRect(dx - 3, dy - 3, dw + 6, dh + 3)
      pane(b, e, dx, dy, dw / 2 - 1, dh, windowState(b, 0.4), '#41607c', '#ffe2a8')
      pane(b, e, dx + dw / 2 + 1, dy, dw / 2 - 1, dh, windowState(b, 0.4), '#41607c', '#ffe2a8')
      const sx = x + w * 0.7
      pane(b, e, sx, y + h * 0.18, w * 0.2, h * 0.3, windowState(b), '#41607c')
      frame(b, sx, y + h * 0.18, w * 0.2, h * 0.3, '#d6d0c4', 2)
      // Laundry pole hint.
      if (i % 2 === 0) {
        b.c.fillStyle = '#7a7a7a'
        b.c.fillRect(x + 4, y + h * 0.05, w - 8, 2)
      }
      b.streaks(x, x + w, y + h * 0.88, h * 0.2, '#8a7a60', 0.2, 2)
    })
  },
  fWood(b, e) {
    const S = b.S
    b.fill('#5a3e2c')
    for (let x = 0; x < S; x += 12) {
      b.c.fillStyle = b.pick(['#5e412e', '#553a29', '#64462f', '#4e3626'])
      b.c.fillRect(x, 0, 12, S)
      b.c.fillStyle = 'rgba(0,0,0,0.25)'
      b.c.fillRect(x, 0, 1.5, S)
    }
    b.speckle(400, ['#3a281c', '#7a5a40'], [1, 3], 0.35)
    cells(S, (x, y, w, h) => {
      // Horizontal beam.
      b.c.fillStyle = '#3e2a1e'
      b.c.fillRect(x, y + h * 0.86, w, h * 0.1)
      // Paper-screen window with lattice.
      const ww = w * 0.66
      const wh = h * 0.5
      const wx = x + (w - ww) / 2
      const wy = y + h * 0.2
      const lit = b.r() < 0.55
      b.c.fillStyle = lit ? '#f4e2c0' : '#d8ccb4'
      b.c.fillRect(wx, wy, ww, wh)
      if (lit) {
        e.c.fillStyle = '#ffc070'
        e.c.fillRect(wx, wy, ww, wh)
      }
      for (const brush of [b, e]) {
        brush.c.fillStyle = brush === b ? '#3a281c' : '#000'
        for (let k = 1; k < 4; k++) brush.c.fillRect(wx + (ww * k) / 4 - 1.5, wy, 3, wh)
        for (let k = 1; k < 3; k++) brush.c.fillRect(wx, wy + (wh * k) / 3 - 1.5, ww, 3)
      }
      frame(b, wx, wy, ww, wh, '#2e2016', 4)
    })
  },
  fStation(b, e) {
    const S = b.S
    b.fill('#6f8496')
    // Curtain wall: mullion grid over sky-reflecting glass.
    b.vgrad(0, 0, S, S, '#9fbad0', '#56708a')
    b.c.fillStyle = 'rgba(255,255,255,0.14)'
    for (let i = 0; i < 3; i++) {
      b.c.beginPath()
      const x = b.r() * S
      b.c.moveTo(x, S)
      b.c.lineTo(x + 60, 0)
      b.c.lineTo(x + 90, 0)
      b.c.lineTo(x + 30, S)
      b.c.fill()
    }
    for (let y = 0; y < S; y += S / 4) {
      for (let x = 0; x < S; x += S / 6) {
        if (b.r() < 0.3) {
          e.c.fillStyle = withAlpha('#ffe6b0', b.range(0.5, 0.9))
          e.c.fillRect(x + 3, y + 3, S / 6 - 6, S / 4 - 6)
        }
        if (b.r() < 0.1) {
          b.c.fillStyle = '#1a222c'
          b.c.fillRect(x + 3, y + 3, S / 6 - 6, S / 4 - 6)
        }
      }
    }
    b.c.fillStyle = '#d8dde0'
    for (let x = 0; x < S; x += S / 6) b.c.fillRect(x - 2, 0, 4, S)
    for (let y = 0; y < S; y += S / 4) b.c.fillRect(0, y - 3, S, 6)
  },
  fWarehouse(b, e) {
    const S = b.S
    corrugated(b, '#a9b7b0', 10)
    b.blotch(10, ['#8a6a4a', '#c0c8c0'], [15, 50], 0.35)
    // Painted band with a number.
    b.c.fillStyle = 'rgba(40,70,110,0.85)'
    b.c.fillRect(0, S * 0.14, S, S * 0.1)
    b.c.fillStyle = 'rgba(255,255,255,0.85)'
    b.c.font = `900 ${S * 0.3}px sans-serif`
    b.c.textAlign = 'center'
    b.c.textBaseline = 'middle'
    b.c.fillText(String(1 + Math.floor(b.r() * 8)), S * 0.75, S * 0.55)
    // Small high windows.
    for (let x = 12; x < S; x += S / 4) {
      const lit = b.r() < 0.3
      b.c.fillStyle = lit ? '#e8d8a0' : '#3a4a58'
      b.c.fillRect(x, S * 0.3, S / 6, S * 0.08)
      if (lit) {
        e.c.fillStyle = '#ffd890'
        e.c.fillRect(x, S * 0.3, S / 6, S * 0.08)
      }
    }
    b.streaks(0, S, S * 0.4, S * 0.5, '#6a4a30', 0.25, 10)
  },
  fOutpost(b, e) {
    const S = b.S
    b.fill('#7a5a40')
    // Patched planks of different woods.
    for (let y = 0; y < S; y += 16) {
      let x = -b.range(0, 40)
      while (x < S) {
        const w = b.range(30, 80)
        b.c.fillStyle = b.pick(['#8a6444', '#6e4e36', '#9a7450', '#7c5a3c', '#a0805a'])
        b.c.fillRect(x, y, w, 15)
        b.c.fillStyle = 'rgba(0,0,0,0.3)'
        b.c.fillRect(x, y + 14, w, 2)
        b.c.fillRect(x + w - 1, y, 2, 15)
        b.c.fillStyle = '#3a3030'
        b.c.fillRect(x + 4, y + 6, 2, 2)
        x += w
      }
    }
    // Cloth patches and a painted paw.
    for (let i = 0; i < 3; i++) {
      const x = b.r() * S * 0.8
      const y = b.r() * S * 0.8
      b.c.fillStyle = b.pick(['#c84a3a', '#3a7aa8', '#e0b040', '#5a9a5a'])
      b.c.save()
      b.c.translate(x, y)
      b.c.rotate(b.range(-0.2, 0.2))
      b.c.fillRect(0, 0, b.range(30, 50), b.range(24, 40))
      b.c.strokeStyle = 'rgba(255,255,255,0.5)'
      b.c.setLineDash([3, 3])
      b.c.strokeRect(2, 2, 26, 20)
      b.c.restore()
    }
    b.paw(S * 0.7, S * 0.35, 34, 'rgba(255,240,220,0.75)')
    // Round window with warm light.
    const cx = S * 0.28
    const cy = S * 0.62
    b.c.fillStyle = '#2a1e16'
    b.c.beginPath()
    b.c.arc(cx, cy, 26, 0, Math.PI * 2)
    b.c.fill()
    b.c.fillStyle = '#f2c890'
    b.c.beginPath()
    b.c.arc(cx, cy, 21, 0, Math.PI * 2)
    b.c.fill()
    e.c.fillStyle = '#ffb060'
    e.c.beginPath()
    e.c.arc(cx, cy, 21, 0, Math.PI * 2)
    e.c.fill()
  },
  fVirtual(b, e) {
    const S = b.S
    b.fill('#f4f8fb')
    b.vgrad(0, 0, S, S, '#fbfdff', '#e6eef4')
    // Panel seams; seams glow cyan in the emissive map.
    for (const brush of [b, e]) {
      brush.c.fillStyle = brush === b ? '#bfe4ee' : '#2ad8ff'
      for (let y = 0; y < S; y += S / 2) brush.c.fillRect(0, y, S, 2)
      for (let x = 0; x < S; x += S / 4) brush.c.fillRect(x, 0, 2, S)
    }
    // Window bands of light blue glass with soft glowing squares.
    cells(S, (x, y, w, h) => {
      b.vgrad(x + 8, y + h * 0.2, w - 16, h * 0.4, '#cfe8f4', '#9ec8dc')
      for (let k = 0; k < 4; k++) {
        if (b.r() < 0.5) {
          e.c.fillStyle = withAlpha('#7ff0ff', b.range(0.35, 0.8))
          e.c.fillRect(x + 12 + k * ((w - 24) / 4), y + h * 0.24, (w - 24) / 4 - 4, h * 0.32)
        }
      }
    })
  },
  fRuin(b, e) {
    const S = b.S
    b.fill('#b9b3a8')
    b.blotch(16, ['#8a8478', '#d0cabe', '#6a6a58'], [15, 50], 0.35)
    cells(S, (x, y, w, h) => {
      // Empty window holes with jagged edges.
      const ww = w * 0.6
      const wh = h * 0.55
      const wx = x + (w - ww) / 2
      const wy = y + h * 0.15
      b.c.fillStyle = '#26221e'
      b.c.beginPath()
      b.c.moveTo(wx, wy)
      for (let k = 0; k <= 6; k++) b.c.lineTo(wx + (ww * k) / 6, wy + b.range(-4, 4))
      for (let k = 0; k <= 6; k++) b.c.lineTo(wx + ww + b.range(-4, 4), wy + (wh * k) / 6)
      for (let k = 6; k >= 0; k--) b.c.lineTo(wx + (ww * k) / 6, wy + wh + b.range(-4, 6))
      for (let k = 6; k >= 0; k--) b.c.lineTo(wx + b.range(-4, 4), wy + (wh * k) / 6)
      b.c.fill()
      // Faint fire inside some.
      if (b.r() < 0.12) {
        e.c.fillStyle = 'rgba(255,150,70,0.6)'
        e.c.fillRect(wx + ww * 0.2, wy + wh * 0.6, ww * 0.6, wh * 0.4)
      }
      b.streaks(wx, wx + ww, wy + wh, h * 0.4, '#3a3428', 0.3, 3)
    })
    // Exposed brick patch and cracks.
    bricks(b, S * 0.55, S * 0.55, S * 0.3, S * 0.2, ['#9a5a44', '#8a4a38'], 12, 6)
    for (let i = 0; i < 5; i++) b.crack(b.r() * S, b.r() * S, 8)
    b.speckle(500, ['#6a6458', '#e0dace'], [1, 3], 0.35)
  },
  fBlight(b, e) {
    const S = b.S
    b.fill('#3a3040')
    b.blotch(14, ['#4a3a58', '#2a2232', '#5a4068'], [15, 60], 0.45)
    cells(S, (x, y, w, h) => {
      b.c.fillStyle = '#16121c'
      b.c.fillRect(x + w * 0.22, y + h * 0.18, w * 0.56, h * 0.5)
    })
    // Violet crystal veins (glow).
    for (let i = 0; i < 6; i++) {
      const x = b.r() * S
      const y = b.r() * S
      b.crack(x, y, 14, '#b67cff', 3)
      e.crack(x, y, 14, '#c78aff', 3)
    }
    // Crystal crust blobs.
    for (let i = 0; i < 6; i++) {
      const x = b.r() * S
      const y = b.r() * S
      const r = b.range(8, 20)
      b.wrap(x, y, r, (px, py) => {
        b.c.fillStyle = '#7a4ab0'
        b.c.beginPath()
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2
          b.c.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r)
        }
        b.c.fill()
        e.c.fillStyle = 'rgba(200,120,255,0.7)'
        e.c.beginPath()
        e.c.arc(px, py, r * 0.5, 0, Math.PI * 2)
        e.c.fill()
      })
    }
  }
}

export function bricks(
  b: Brush,
  x0: number,
  y0: number,
  w: number,
  h: number,
  colors: string[],
  bw: number,
  bh: number
) {
  const c = b.c
  c.save()
  c.beginPath()
  c.rect(x0, y0, w, h)
  c.clip()
  c.fillStyle = '#d8ccb8'
  c.fillRect(x0, y0, w, h)
  for (let y = y0, row = 0; y < y0 + h; y += bh, row++) {
    for (let x = x0 - (row % 2) * (bw / 2); x < x0 + w; x += bw) {
      c.fillStyle = b.pick(colors)
      c.fillRect(x + 0.8, y + 0.8, bw - 1.6, bh - 1.6)
    }
  }
  c.restore()
}

export function corrugated(b: Brush, color: string, pitch: number) {
  const S = b.S
  b.fill(color)
  for (let x = 0; x < S; x += pitch) {
    const g = b.c.createLinearGradient(x, 0, x + pitch, 0)
    g.addColorStop(0, 'rgba(255,255,255,0.18)')
    g.addColorStop(0.5, 'rgba(0,0,0,0.12)')
    g.addColorStop(1, 'rgba(255,255,255,0.18)')
    b.c.fillStyle = g
    b.c.fillRect(x, 0, pitch, S)
  }
}

export const GROUND_FLOORS: Record<string, Painter> = {
  gShop(b, e) {
    const S = b.S
    b.fill('#c8beb0')
    for (let k = 0; k < 2; k++) {
      const x = k * (S / 2)
      const w = S / 2
      // Fascia band.
      b.c.fillStyle = b.pick(['#3f6f9a', '#c0503c', '#3f8a6a', '#d89a3a'])
      b.c.fillRect(x + 4, 6, w - 8, S * 0.14)
      // Roll shutter, half down; lit shop below or dark.
      const sx = x + 10
      const sw = w - 20
      const down = b.range(0.35, 1)
      const top = S * 0.24
      const bottom = S - 8
      const sh = (bottom - top) * down
      const lit = b.r() < 0.5
      b.vgrad(sx, top, sw, bottom - top, lit ? '#f4dcaa' : '#3a3a40', lit ? '#c89a60' : '#24242a')
      if (lit) {
        e.c.fillStyle = '#ffc878'
        e.c.fillRect(sx, top + sh, sw, bottom - top - sh)
      }
      b.c.fillStyle = '#9aa0a4'
      b.c.fillRect(sx, top, sw, sh)
      b.c.fillStyle = 'rgba(0,0,0,0.18)'
      for (let y = top; y < top + sh; y += 5) b.c.fillRect(sx, y, sw, 1.5)
      // Graffiti-ish paw scribble.
      if (b.r() < 0.4) b.paw(sx + sw * 0.6, top + sh * 0.5, 16, 'rgba(240,120,90,0.6)')
      b.streaks(sx, sx + sw, top, sh, '#6a5a48', 0.2, 3)
    }
  },
  gGlass(b, e) {
    const S = b.S
    b.fill('#9aa4aa')
    b.vgrad(6, 10, S - 12, S - 16, '#a8c4d8', '#4a6478')
    for (let x = 6; x < S; x += (S - 12) / 4) {
      b.c.fillStyle = '#5a646a'
      b.c.fillRect(x - 2, 10, 4, S - 16)
      if (b.r() < 0.35) {
        e.c.fillStyle = 'rgba(255,224,170,0.75)'
        e.c.fillRect(x + 3, 14, (S - 12) / 4 - 6, S - 24)
      }
    }
    b.c.fillStyle = '#5a646a'
    b.c.fillRect(0, S * 0.18, S, 4)
    // Door.
    b.c.fillStyle = '#2a3440'
    b.c.fillRect(S * 0.42, S * 0.3, S * 0.16, S * 0.7)
    b.c.fillStyle = 'rgba(255,255,255,0.15)'
    b.c.fillRect(S * 0.44, S * 0.32, S * 0.05, S * 0.66)
  },
  gGarage(b, e) {
    const S = b.S
    corrugated(b, '#9aaaa4', 10)
    b.c.fillStyle = '#5a6468'
    b.c.fillRect(S * 0.08, S * 0.15, S * 0.6, S * 0.85)
    for (let y = S * 0.15; y < S; y += 8) {
      b.c.fillStyle = 'rgba(255,255,255,0.12)'
      b.c.fillRect(S * 0.08, y, S * 0.6, 3)
    }
    b.c.fillStyle = '#e0b030'
    for (let x = S * 0.08; x < S * 0.68; x += 16) b.c.fillRect(x, S * 0.92, 8, S * 0.08)
    b.c.fillStyle = '#3a4248'
    b.c.fillRect(S * 0.76, S * 0.35, S * 0.16, S * 0.65)
    e.c.fillStyle = 'rgba(255,200,120,0.6)'
    e.c.fillRect(S * 0.8, S * 0.2, S * 0.08, S * 0.06)
    b.c.fillStyle = '#ffe8b0'
    b.c.fillRect(S * 0.8, S * 0.2, S * 0.08, S * 0.06)
    b.blotch(6, ['#7a5a3a'], [20, 40], 0.3)
  },
  gSliding(b, e) {
    const S = b.S
    b.fill('#4e3626')
    for (let k = 0; k < 4; k++) {
      const x = k * (S / 4) + 4
      const w = S / 4 - 8
      const lit = b.r() < 0.6
      b.c.fillStyle = lit ? '#f2dfba' : '#cfc2a8'
      b.c.fillRect(x, S * 0.12, w, S * 0.82)
      if (lit) {
        e.c.fillStyle = '#ffbc6a'
        e.c.fillRect(x, S * 0.12, w, S * 0.82)
      }
      for (const brush of [b, e]) {
        brush.c.fillStyle = brush === b ? '#3a281c' : '#000'
        for (let j = 1; j < 3; j++) brush.c.fillRect(x + (w * j) / 3 - 1, S * 0.12, 2.5, S * 0.82)
        for (let j = 1; j < 5; j++) brush.c.fillRect(x, S * 0.12 + (S * 0.82 * j) / 5, w, 2.5)
      }
    }
    b.c.fillStyle = '#2e2016'
    b.c.fillRect(0, S * 0.06, S, S * 0.06)
  },
  gPlain(b, e) {
    const S = b.S
    b.fill('#bdb6aa')
    b.blotch(10, ['#9a9488', '#d4cec2'], [15, 45], 0.35)
    // Door with a small lamp.
    b.c.fillStyle = '#5a4a3e'
    b.c.fillRect(S * 0.15, S * 0.32, S * 0.18, S * 0.68)
    b.c.fillStyle = '#ffe2a8'
    b.c.fillRect(S * 0.21, S * 0.2, S * 0.06, S * 0.05)
    e.c.fillStyle = '#ffcc80'
    e.c.fillRect(S * 0.21, S * 0.2, S * 0.06, S * 0.05)
    pane(b, e, S * 0.5, S * 0.32, S * 0.32, S * 0.3, windowState(b, 0.3), '#3a4e64')
    frame(b, S * 0.5, S * 0.32, S * 0.32, S * 0.3, '#8a8478', 3)
    // Torn posters.
    for (let i = 0; i < 2; i++) {
      b.c.fillStyle = b.pick(['#e8d8b0', '#d8e0e8', '#f0c0b0'])
      b.c.fillRect(S * (0.38 + i * 0.07), S * (0.68 + i * 0.04), S * 0.08, S * 0.12)
    }
    b.streaks(0, S, S * 0.66, S * 0.3, '#5a5040', 0.2, 6)
  }
}

export const ROOFS: Record<string, Painter> = {
  rConcrete(b) {
    const S = b.S
    b.fill('#a8a49c')
    b.speckle(2500, ['#8a867e', '#c4c0b8', '#7a766e'], [1, 2.5], 0.45)
    b.blotch(10, ['#6a6a5a', '#8a8a70'], [20, 60], 0.3)
    b.c.fillStyle = 'rgba(0,0,0,0.12)'
    b.c.fillRect(0, 0, S, 2)
    b.c.fillRect(0, 0, 2, S)
    for (let i = 0; i < 3; i++) b.crack(b.r() * S, b.r() * S, 6, 'rgba(40,40,40,0.4)')
  },
  rTile(b) {
    const S = b.S
    b.fill('#5a6a78')
    const rows = 10
    const rh = S / rows
    for (let r = 0; r < rows; r++) {
      for (let x = -(r % 2) * 12; x < S; x += 24) {
        const g = b.c.createLinearGradient(0, r * rh, 0, (r + 1) * rh)
        const base = b.pick(['#6a7c8c', '#5e6f80', '#72849a'])
        g.addColorStop(0, base)
        g.addColorStop(1, '#3a4652')
        b.c.fillStyle = g
        b.rr(x + 1, r * rh + 1, 22, rh - 1, 6)
        b.c.fill()
      }
    }
    b.blotch(6, ['#7a8a5a'], [15, 40], 0.3)
  },
  rMetal(b) {
    corrugated(b, '#8c989e', 16)
    b.blotch(10, ['#8a5a3a', '#a06a40'], [10, 40], 0.4)
  },
  rVirtual(b, e) {
    const S = b.S
    b.fill('#eef4f8')
    for (const brush of [b, e]) {
      brush.c.fillStyle = brush === b ? '#bfe4ee' : 'rgba(42,216,255,0.8)'
      for (let k = 0; k < S; k += S / 4) {
        brush.c.fillRect(k, 0, 2, S)
        brush.c.fillRect(0, k, S, 2)
      }
    }
  }
}
