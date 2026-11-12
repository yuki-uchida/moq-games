/**
 * Alpha-cut foliage and ground-decal tiles: leaf clusters, cherry blossom clusters and pine needle sprays for the
 * soft tree canopies (trees.ts), plus ground decals (cracks, stains, wear, drains in a 2×2 grid) and fallen petals.
 * Leaves are painted light so the per-vertex tint sets the hue. DOM only.
 */
import type { Brush } from './paint-kit'
import type { Painter } from './paint-facades'

/** A rounded cluster of small leaf shapes, lighter towards the top-left (sun side). */
function cluster(b: Brush, colors: readonly string[], count: number, leaf: [number, number], petals = 0) {
  const S = b.S
  const c = b.c
  c.clearRect(0, 0, S, S)
  for (let i = 0; i < count; i++) {
    // Denser in the middle, ragged at the rim.
    const a = b.r() * Math.PI * 2
    const d = Math.sqrt(b.r()) * S * 0.44
    const x = S / 2 + Math.cos(a) * d
    const y = S / 2 + Math.sin(a) * d * 0.92
    const t = (i / count) * 0.7 + 0.3 * b.r()
    const light = 1 - Math.min(1, Math.max(0, (x + y) / (2 * S)))
    c.fillStyle = colors[Math.min(colors.length - 1, Math.floor((1 - light * 0.8 - t * 0.2) * colors.length))]
    const len = b.range(leaf[0], leaf[1])
    const ang = Math.atan2(y - S / 2, x - S / 2) + b.range(-0.9, 0.9)
    if (petals) {
      // Five-petal blossom.
      for (let k = 0; k < petals; k++) {
        const pa = ang + (k / petals) * Math.PI * 2
        c.beginPath()
        c.ellipse(
          x + Math.cos(pa) * len * 0.45,
          y + Math.sin(pa) * len * 0.45,
          len * 0.5,
          len * 0.32,
          pa,
          0,
          Math.PI * 2
        )
        c.fill()
      }
      c.fillStyle = 'rgba(200,70,110,0.85)'
      c.beginPath()
      c.arc(x, y, len * 0.16, 0, Math.PI * 2)
      c.fill()
      continue
    }
    c.beginPath()
    c.ellipse(x, y, len, len * 0.42, ang, 0, Math.PI * 2)
    c.fill()
    // Midrib.
    c.strokeStyle = 'rgba(40,70,20,0.25)'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(x - Math.cos(ang) * len * 0.8, y - Math.sin(ang) * len * 0.8)
    c.lineTo(x + Math.cos(ang) * len * 0.8, y + Math.sin(ang) * len * 0.8)
    c.stroke()
  }
}

export const FOLIAGE: Record<string, Painter> = {
  mLeafCard(b) {
    cluster(b, ['#f4ffd8', '#e2f5bc', '#cfe8a4', '#b8d98e', '#9cc47a', '#84ad66'], 260, [9, 17])
  },
  mBlossom(b) {
    cluster(b, ['#ffffff', '#fff2f6', '#ffe0ea', '#ffcadb', '#f9b4c9', '#ee9db6'], 120, [9, 14], 5)
  },
  mNeedles(b) {
    const S = b.S
    const c = b.c
    c.clearRect(0, 0, S, S)
    c.lineCap = 'round'
    // Drooping sprays radiating from the top centre.
    for (let i = 0; i < 34; i++) {
      const x0 = S * b.range(0.2, 0.8)
      const y0 = S * b.range(0.12, 0.5)
      const ang = Math.PI / 2 + b.range(-1.1, 1.1)
      const len = S * b.range(0.18, 0.4)
      const x1 = x0 + Math.cos(ang) * len
      const y1 = y0 + Math.sin(ang) * len
      c.strokeStyle = '#4a6a38'
      c.lineWidth = 2
      c.beginPath()
      c.moveTo(x0, y0)
      c.lineTo(x1, y1)
      c.stroke()
      for (let k = 0; k < 14; k++) {
        const t = k / 14
        const px = x0 + (x1 - x0) * t
        const py = y0 + (y1 - y0) * t
        c.strokeStyle = b.pick(['#e6f2d0', '#cfe2b2', '#b5d194', '#9dbd80'])
        c.lineWidth = 2.2
        for (const s of [-1, 1]) {
          c.beginPath()
          c.moveTo(px, py)
          c.lineTo(px + Math.cos(ang + s * 1.1) * 12, py + Math.sin(ang + s * 1.1) * 12 + 4)
          c.stroke()
        }
      }
    }
  },
  /** 2×2 decals: crack web, oil/damp stain, worn patch with exposed aggregate, drain grate with rust bleed. */
  mDecal(b) {
    const S = b.S
    const H = S / 2
    const c = b.c
    c.clearRect(0, 0, S, S)
    // Crack web (top left).
    c.save()
    c.beginPath()
    c.rect(0, 0, H, H)
    c.clip()
    c.strokeStyle = 'rgba(28,26,24,0.85)'
    c.lineCap = 'round'
    for (let k = 0; k < 5; k++) {
      let x = H / 2
      let y = H / 2
      let a = (k / 5) * Math.PI * 2 + b.range(-0.3, 0.3)
      for (let i = 0; i < 9; i++) {
        a += b.range(-0.5, 0.5)
        const nx = x + Math.cos(a) * 7
        const ny = y + Math.sin(a) * 7
        c.lineWidth = 2.6 * (1 - i / 10)
        c.beginPath()
        c.moveTo(x, y)
        c.lineTo(nx, ny)
        c.stroke()
        x = nx
        y = ny
      }
    }
    c.restore()
    // Damp stain (top right).
    for (let i = 0; i < 8; i++) {
      const x = H + H / 2 + b.range(-20, 20)
      const y = H / 2 + b.range(-20, 20)
      const r = b.range(18, 38)
      const g = c.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(30,32,30,0.5)')
      g.addColorStop(1, 'rgba(30,32,30,0)')
      c.fillStyle = g
      c.fillRect(H, 0, H, H)
    }
    // Worn patch (bottom left): irregular lighter patch with grit.
    c.fillStyle = 'rgba(132,128,120,0.62)'
    c.beginPath()
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      const r = H * b.range(0.28, 0.42)
      c.lineTo(H / 2 + Math.cos(a) * r, H + H / 2 + Math.sin(a) * r)
    }
    c.closePath()
    c.fill()
    for (let i = 0; i < 160; i++) {
      const a = b.r() * Math.PI * 2
      const r = Math.sqrt(b.r()) * H * 0.36
      c.fillStyle = b.pick(['rgba(90,84,76,0.9)', 'rgba(150,140,126,0.9)', 'rgba(60,58,54,0.9)'])
      c.fillRect(H / 2 + Math.cos(a) * r, H + H / 2 + Math.sin(a) * r, 2.5, 2.5)
    }
    // Drain grate (bottom right) with a rust bleed.
    const gx = H + H / 2
    const gy = H + H / 2
    const g = c.createRadialGradient(gx, gy, 10, gx, gy, H * 0.46)
    g.addColorStop(0, 'rgba(110,60,30,0.6)')
    g.addColorStop(1, 'rgba(110,60,30,0)')
    c.fillStyle = g
    c.fillRect(H, H, H, H)
    c.fillStyle = '#3a3c3e'
    c.fillRect(gx - 26, gy - 18, 52, 36)
    c.fillStyle = '#151618'
    for (let k = 0; k < 6; k++) c.fillRect(gx - 22 + k * 8, gy - 14, 4, 28)
  },
  mPetalScatter(b) {
    const S = b.S
    const c = b.c
    c.clearRect(0, 0, S, S)
    for (let i = 0; i < 260; i++) {
      const a = b.r() * Math.PI * 2
      const d = Math.sqrt(b.r()) * S * 0.47
      c.fillStyle = b.pick(['#ffe4ec', '#ffd0de', '#f7b8cb', '#fff4f7'])
      c.beginPath()
      c.ellipse(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 4.5, 2.6, b.r() * 3, 0, Math.PI * 2)
      c.fill()
    }
  }
}
