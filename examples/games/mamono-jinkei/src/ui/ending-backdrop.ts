/**
 * The finale's backdrop, drawn once in code: a 480x270 pixel canvas (night sky, warm horizon glow, distant silhouettes
 * of the four stages from meadow to snowy fort, a walking path), two star canvases that crossfade to twinkle, and a
 * few CSS-animated fireflies and petals. Nothing here runs per frame; the animation is plain CSS and is switched off
 * under prefers-reduced-motion.
 */
import { el } from './dom'

export const BACKDROP_W = 480
export const BACKDROP_H = 270
/** Canvas rows between the path's walking line and the bottom edge (the parade's feet stand here). */
export const WALK_FROM_BOTTOM = 30

/** Small deterministic generator so the backdrop is the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rgb = [number, number, number]
const hex = (c: string): Rgb => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
]
const css = (c: Rgb) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`

const HORIZON = 208
const GROUND = 220

function makeCanvas(cls: string): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = el(`canvas.${cls}`, {
    width: BACKDROP_W,
    height: BACKDROP_H,
    'aria-hidden': 'true'
  }) as HTMLCanvasElement
  const g = canvas.getContext('2d')!
  g.imageSmoothingEnabled = false
  return { canvas, g }
}

function sky(g: CanvasRenderingContext2D) {
  const stops: [number, Rgb][] = [
    [0, hex('#0b0717')],
    [0.4, hex('#1d1133')],
    [0.62, hex('#3a1d46')],
    [0.74, hex('#7d3c4c')],
    [0.78, hex('#d9824a')],
    [1, hex('#f0b86a')]
  ]
  // Banded, not smooth: each band is 3 rows tall and quantised to 5 bits per channel-ish steps.
  for (let y = 0; y < HORIZON + 6; y += 3) {
    const f = Math.min(1, (y + 1) / (HORIZON + 6))
    let i = 0
    while (i < stops.length - 2 && f > stops[i + 1][0]) i++
    const [f0, c0] = stops[i]
    const [f1, c1] = stops[i + 1]
    const c = mix(c0, c1, Math.min(1, Math.max(0, (f - f0) / (f1 - f0))))
    g.fillStyle = css(c.map((v) => Math.round(v / 3) * 3) as Rgb)
    g.fillRect(0, y, BACKDROP_W, 3)
  }
  g.fillStyle = '#0d0818'
  g.fillRect(0, HORIZON, BACKDROP_W, BACKDROP_H - HORIZON)
  // Warm glow under the moon (the moon sits near the right), plus a thin glow band along the whole horizon.
  const glow = g.createRadialGradient(404, HORIZON + 6, 4, 404, HORIZON + 6, 170)
  glow.addColorStop(0, 'rgba(255,196,110,0.55)')
  glow.addColorStop(0.45, 'rgba(236,128,92,0.22)')
  glow.addColorStop(1, 'rgba(236,128,92,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, BACKDROP_W, HORIZON)
}

/** A jagged ridge line: fills from `top(x)` down to `base`. */
function ridge(g: CanvasRenderingContext2D, color: string, base: number, top: (x: number) => number) {
  g.fillStyle = color
  for (let x = 0; x < BACKDROP_W; x++) {
    const y = Math.round(top(x))
    g.fillRect(x, y, 1, base - y)
  }
}

function mist(g: CanvasRenderingContext2D, y0: number, y1: number, color: string, a0: number, a1: number) {
  const grad = g.createLinearGradient(0, y0, 0, y1)
  grad.addColorStop(0, color.replace('A', String(a0)))
  grad.addColorStop(1, color.replace('A', String(a1)))
  g.fillStyle = grad
  g.fillRect(0, y0, BACKDROP_W, y1 - y0)
}

function windows(g: CanvasRenderingContext2D, spots: [number, number][], color = '#ffd36a') {
  g.fillStyle = color
  for (const [x, y] of spots) g.fillRect(x, y, 2, 2)
}

function pine(g: CanvasRenderingContext2D, x: number, base: number, h: number, color: string, snow?: string) {
  g.fillStyle = color
  const tiers = Math.max(3, Math.round(h / 7))
  for (let t = 0; t < tiers; t++) {
    const ty = base - h + Math.round((t * h) / tiers)
    const w = 2 + Math.round(((t + 1) * h) / tiers / 2.4)
    g.fillRect(x - w, ty + Math.round(h / tiers) - 1, w * 2 + 1, 2)
    g.fillRect(x - Math.max(1, w - 2), ty, Math.max(1, w - 2) * 2 + 1, Math.round(h / tiers))
  }
  g.fillRect(x, base - 2, 1, 2)
  if (snow) {
    g.fillStyle = snow
    for (let t = 0; t < tiers; t++) {
      const ty = base - h + Math.round((t * h) / tiers)
      g.fillRect(x - 1, ty, 3, 1)
    }
  }
}

function farRange(g: CanvasRenderingContext2D) {
  const r = rng(11)
  const ph = [r() * 6, r() * 6, r() * 6]
  ridge(
    g,
    '#4a2f5c',
    HORIZON,
    (x) => 168 + Math.sin(x / 31 + ph[0]) * 10 + Math.sin(x / 13 + ph[1]) * 5 + Math.sin(x / 70 + ph[2]) * 8
  )
  mist(g, 150, HORIZON, 'rgba(210,120,100,A)', 0, 0.35)
}

/** Stage 1: meadow hills with a windmill and a lone tree. */
function meadow(g: CanvasRenderingContext2D, x0: number) {
  const c = '#1f1534'
  ridge(g, c, GROUND, (x) => {
    if (x < x0 || x >= x0 + 120) return GROUND
    const u = (x - x0) / 120
    return 196 - Math.sin(u * Math.PI * 2.2 + 0.6) * 8 - Math.sin(u * Math.PI * 5) * 2
  })
  // Windmill
  const mx = x0 + 74
  g.fillStyle = c
  g.fillRect(mx - 5, 176, 10, 22)
  g.fillRect(mx - 3, 171, 6, 5)
  g.fillRect(mx - 1, 168, 2, 3)
  g.fillStyle = '#150d26'
  g.fillRect(mx - 16, 172, 32, 2)
  g.fillRect(mx - 1, 156, 2, 32)
  g.fillRect(mx - 12, 160, 3, 2)
  g.fillRect(mx + 9, 182, 3, 2)
  g.fillStyle = '#ffd36a'
  g.fillRect(mx - 1, 184, 2, 3)
  // Lone tree and fence
  g.fillStyle = c
  g.fillRect(x0 + 24, 180, 2, 14)
  g.fillRect(x0 + 19, 170, 12, 10)
  g.fillRect(x0 + 16, 174, 18, 5)
  for (let i = 0; i < 6; i++) g.fillRect(x0 + 36 + i * 5, 190 - Math.round(i * 0.2), 1, 5)
  g.fillRect(x0 + 36, 191, 26, 1)
}

/** Stage 2: the sewer / granary town with gable roofs, chimneys and granary silos. */
function town(g: CanvasRenderingContext2D, x0: number) {
  const c = '#1e1431'
  g.fillStyle = c
  const houses: [number, number, number][] = [
    [4, 18, 24],
    [24, 14, 30],
    [42, 20, 22],
    [66, 14, 28],
    [86, 18, 24],
    [104, 14, 20]
  ]
  for (const [dx, w, h] of houses) {
    const x = x0 + dx
    g.fillRect(x, GROUND - h, w, h)
    for (let i = 0; i < w / 2; i++)
      g.fillRect(x - 1 + i, GROUND - h - 1 - Math.min(i, w / 2 - i), 1, 1 + Math.min(i, w / 2 - i))
  }
  // Granary silos
  for (const sx of [x0 + 56, x0 + 60]) {
    g.fillRect(sx - 4, GROUND - 38, 9, 38)
    g.fillRect(sx - 3, GROUND - 41, 7, 3)
    g.fillRect(sx - 1, GROUND - 44, 3, 3)
  }
  // Chimneys with a little smoke
  g.fillRect(x0 + 10, GROUND - 32, 3, 8)
  g.fillRect(x0 + 74, GROUND - 38, 3, 10)
  g.fillStyle = 'rgba(120,96,140,0.5)'
  g.fillRect(x0 + 11, GROUND - 36, 2, 2)
  g.fillRect(x0 + 12, GROUND - 40, 2, 2)
  g.fillRect(x0 + 75, GROUND - 42, 2, 2)
  windows(g, [
    [x0 + 9, GROUND - 16],
    [x0 + 29, GROUND - 22],
    [x0 + 33, GROUND - 14],
    [x0 + 48, GROUND - 12],
    [x0 + 70, GROUND - 18],
    [x0 + 90, GROUND - 14],
    [x0 + 108, GROUND - 10]
  ])
}

/** Stage 3: a tall clock tower in the wind, with a lit clock and scudding clouds. */
function tower(g: CanvasRenderingContext2D, x0: number) {
  const c = '#211735'
  ridge(g, c, GROUND, (x) => (x < x0 || x >= x0 + 120 ? GROUND : 205 - Math.sin((x - x0) / 9) * 2))
  const tx = x0 + 62
  g.fillStyle = c
  g.fillRect(tx - 8, 118, 16, 96)
  g.fillRect(tx - 11, 112, 22, 7)
  g.fillRect(tx - 9, 104, 18, 8)
  for (let i = 0; i < 9; i++) g.fillRect(tx - 9 + i, 103 - Math.min(i, 8 - i) * 2, 1, Math.min(i, 8 - i) * 2 + 1)
  g.fillRect(tx - 1, 84, 2, 14)
  g.fillRect(tx - 5, 98, 10, 3)
  // Clock face
  g.fillStyle = '#ffe6a0'
  g.fillRect(tx - 5, 124, 10, 10)
  g.fillStyle = '#2c1f3f'
  g.fillRect(tx, 126, 1, 4)
  g.fillRect(tx, 129, 3, 1)
  g.fillStyle = 'rgba(255,214,120,0.25)'
  g.fillRect(tx - 7, 122, 14, 14)
  windows(g, [
    [tx - 1, 150],
    [tx - 1, 170],
    [tx - 5, 190],
    [tx + 3, 190]
  ])
  // Side walls and little roofs
  g.fillStyle = c
  g.fillRect(x0 + 14, 190, 30, 24)
  g.fillRect(x0 + 80, 186, 26, 28)
  for (let i = 0; i < 15; i++) g.fillRect(x0 + 14 + i, 188 - Math.min(i, 14 - i) / 2, 1, 2)
  windows(g, [
    [x0 + 22, 198],
    [x0 + 88, 196],
    [x0 + 96, 204]
  ])
  // Wind streaks
  g.fillStyle = 'rgba(190,170,220,0.22)'
  for (const [dx, y, w] of [
    [4, 140, 22],
    [86, 118, 26],
    [30, 160, 14],
    [92, 150, 18]
  ] as const)
    g.fillRect(x0 + dx, y, w, 1)
}

/** Stage 4: the snowy forest and fort (blue tinted, snow on the tops). */
function forest(g: CanvasRenderingContext2D, x0: number) {
  const r = rng(404)
  const c = '#1c1e40'
  const snow = '#aab8dc'
  ridge(g, c, GROUND, (x) => (x < x0 ? GROUND : 204 - Math.sin((x - x0) / 14) * 3))
  // Fort: wall, battlements, two towers with snow caps
  const fx = x0 + 52
  g.fillStyle = c
  g.fillRect(fx, 184, 54, 30)
  for (let i = 0; i < 9; i++) g.fillRect(fx + i * 6, 180, 4, 4)
  for (const tx of [fx - 4, fx + 46]) {
    g.fillRect(tx, 160, 12, 54)
    for (let i = 0; i < 3; i++) g.fillRect(tx + i * 5, 156, 3, 4)
  }
  g.fillStyle = snow
  for (let i = 0; i < 9; i++) g.fillRect(fx + i * 6, 180, 4, 1)
  for (const tx of [fx - 4, fx + 46]) for (let i = 0; i < 3; i++) g.fillRect(tx + i * 5, 156, 3, 1)
  g.fillStyle = '#1b1c36'
  g.fillRect(fx + 24, 196, 8, 18)
  windows(
    g,
    [
      [fx - 1, 170],
      [fx + 49, 170],
      [fx + 14, 192],
      [fx + 40, 192],
      [fx + 26, 198]
    ],
    '#ffcf7a'
  )
  // Pines, tall ones behind, small ones in front
  for (let i = 0; i < 20; i++) {
    const x = x0 + 2 + Math.round(i * 6 + r() * 4)
    if (x > fx - 8 && x < fx + 64) continue
    if (x >= BACKDROP_W - 1) continue
    pine(g, x, 214, 24 + Math.round(r() * 18), c, snow)
  }
}

function backHills(g: CanvasRenderingContext2D) {
  const r = rng(5)
  const ph = [r() * 6, r() * 6]
  ridge(g, '#171027', BACKDROP_H, (x) => GROUND + 2 + Math.sin(x / 17 + ph[0]) * 2 + Math.sin(x / 7 + ph[1]) * 1)
}

function ground(g: CanvasRenderingContext2D) {
  const r = rng(77)
  g.fillStyle = '#141024'
  g.fillRect(0, GROUND, BACKDROP_W, BACKDROP_H - GROUND)
  // Banded greens/blues for the lawn, getting darker towards the player.
  const bands = ['#1f1a34', '#1a1530', '#16122a', '#120e22']
  bands.forEach((c, i) => {
    g.fillStyle = c
    g.fillRect(0, GROUND + i * 4, BACKDROP_W, 4)
  })
  // The path the parade walks along.
  const top = BACKDROP_H - WALK_FROM_BOTTOM - 10
  g.fillStyle = '#3b2a3c'
  g.fillRect(0, top, BACKDROP_W, 22)
  g.fillStyle = '#4c3748'
  g.fillRect(0, top, BACKDROP_W, 2)
  g.fillStyle = '#2d2030'
  g.fillRect(0, top + 20, BACKDROP_W, 2)
  for (let i = 0; i < 130; i++) {
    const x = Math.floor(r() * BACKDROP_W)
    const y = top + 3 + Math.floor(r() * 16)
    g.fillStyle = r() < 0.5 ? '#2f2233' : '#51414f'
    g.fillRect(x, y, 1 + (r() < 0.3 ? 1 : 0), 1)
  }
  // Grass tufts and flowers; snow patches on the right (the forest side).
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(r() * BACKDROP_W)
    const above = r() < 0.7
    const y = above
      ? GROUND + 2 + Math.floor(r() * (top - GROUND - 3))
      : top + 24 + Math.floor(r() * (BACKDROP_H - top - 26))
    if (y >= BACKDROP_H - 1) continue
    const snowy = x > 380
    g.fillStyle = snowy ? '#8f9cc4' : r() < 0.08 ? '#e8a0c0' : '#2c3a3a'
    g.fillRect(x, y, 1, snowy ? 1 : 2)
    if (!snowy) g.fillRect(x + 2, y + 1, 1, 1)
  }
  for (let i = 0; i < 26; i++) {
    const x = 380 + Math.floor(r() * 100)
    const y = GROUND + 3 + Math.floor(r() * (top - GROUND - 4))
    g.fillStyle = '#7d8ab4'
    g.fillRect(x, y, 4 + Math.floor(r() * 4), 1)
  }
  // Soft darkening at the very bottom so the buttons and credits sit on a calm base.
  mist(g, BACKDROP_H - 40, BACKDROP_H, 'rgba(8,4,16,A)', 0, 0.6)
}

function stars(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, seed: number, n: number) {
  const r = rng(seed)
  const cols = ['#ffffff', '#ffe9b0', '#cfe0ff']
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * BACKDROP_W)
    const y = Math.floor(Math.pow(r(), 1.3) * 150)
    g.fillStyle = cols[Math.floor(r() * cols.length)]
    g.fillRect(x, y, 1, 1)
    if (r() < 0.2) {
      g.fillStyle = 'rgba(255,255,255,0.45)'
      g.fillRect(x - 1, y, 1, 1)
      g.fillRect(x + 1, y, 1, 1)
      g.fillRect(x, y - 1, 1, 1)
      g.fillRect(x, y + 1, 1, 1)
    }
  }
  return canvas
}

/** Fireflies and drifting petals: a handful of CSS-animated spans with per-element offsets. */
function drifters(): HTMLElement[] {
  const r = rng(909)
  const out: HTMLElement[] = []
  for (let i = 0; i < 16; i++) {
    out.push(
      el('span.firefly', {
        style: `--x:${Math.round(4 + r() * 92)}%;--y:${Math.round(8 + r() * 34)}%;--dx:${Math.round(-30 + r() * 60)}px;--dy:${Math.round(-26 + r() * 40)}px;--d:${(7 + r() * 7).toFixed(1)}s;--b:${(2 + r() * 3).toFixed(1)}s;--s:${(-r() * 12).toFixed(1)}s`
      })
    )
  }
  for (let i = 0; i < 9; i++) {
    out.push(
      el('span.petal', {
        style: `--x:${Math.round(r() * 100)}%;--dx:${Math.round(60 + r() * 140)}px;--d:${(14 + r() * 10).toFixed(1)}s;--s:${(-r() * 20).toFixed(1)}s;--c:${r() < 0.5 ? '#ffc4d8' : '#ffe8c0'}`
      })
    )
  }
  return out
}

/** Builds the whole backdrop element (call once). */
export function buildEndingBackdrop(): HTMLElement {
  const { canvas: scene, g } = makeCanvas('ending-layer.ending-scene')
  sky(g)
  farRange(g)
  meadow(g, 0)
  town(g, 120)
  tower(g, 240)
  forest(g, 360)
  mist(g, 160, GROUND, 'rgba(60,34,70,A)', 0, 0.35)
  backHills(g)
  ground(g)
  const a = makeCanvas('ending-layer.ending-stars.a')
  const b = makeCanvas('ending-layer.ending-stars.b')
  stars(a.canvas, a.g, 1, 70)
  stars(b.canvas, b.g, 2, 55)
  return el('div.ending-back', { 'aria-hidden': 'true' }, scene, a.canvas, b.canvas, ...drifters())
}
