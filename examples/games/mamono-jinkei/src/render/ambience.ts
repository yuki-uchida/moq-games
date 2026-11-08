/**
 * Per-stage ambient life: meadow petals and pollen; sewer dust motes in lamp light, debris drifting along the
 * currents and drips from wall pipes. Also measures how close the camera is to running water (audio loop level).
 */
import type { Anim } from '../art/index'
import type { StageInfo, View } from '../sim/types'
import { TILE } from '../vocab'
import type { FxAnims, Particles } from './effects'
import { findAnim } from './sprites'

interface Channel {
  id: string
  dx: number
  dy: number
  speed: number
  /** Tile centres. */
  xs: Float32Array
  ys: Float32Array
}

export class Ambience {
  /** 0..1: running water near the view centre (for the 'water' loop). */
  water = 0
  /** 0..1: wind zones under the view (for the 'wind' loop). */
  wind = 0
  private winds: NonNullable<StageInfo['winds']> = []
  private sky: number[] = []
  private info?: StageInfo
  private channels: Channel[] = []
  private pipes: { x: number; y: number; next: number }[] = []
  private lamps: { x: number; y: number }[] = []
  private timer = 0
  private readonly scratch: number[] = []
  private drip?: Anim

  constructor(
    private readonly particles: Particles,
    private readonly fx: FxAnims
  ) {}

  setStage(info: StageInfo) {
    this.info = info
    this.channels = (info.currents ?? []).map((c) => ({
      id: c.channel,
      dx: c.dx,
      dy: c.dy,
      speed: c.speed,
      xs: Float32Array.from(c.tiles, (i) => (i % info.w) * TILE + TILE / 2),
      ys: Float32Array.from(c.tiles, (i) => Math.floor(i / info.w) * TILE + TILE / 2)
    }))
    this.pipes = info.decor.filter((d) => d.kind === 'pipe').map((d) => ({ x: d.x, y: d.y, next: Math.random() * 3 }))
    this.lamps = info.decor.filter((d) => d.kind === 'lamp' || d.kind === 'torch' || d.kind === 'brazier')
    this.drip = findAnim('fx', 'drip')
    this.winds = info.winds ?? []
    this.sky = []
    info.tiles.forEach((k, i) => {
      if (k === 'sky') this.sky.push(i)
    })
  }

  update(dt: number, t: number, view: View, ox: number, oy: number, w: number, h: number) {
    const info = this.info
    if (!info || dt <= 0) return
    const inView = (x: number, y: number, m = 0) => x > ox - m && x < ox + w + m && y > oy - m && y < oy + h + m
    this.timer += dt
    if (info.id === 'meadow') {
      while (this.timer > 0.12) {
        this.timer -= 0.12
        const x = ox + Math.random() * (w + 200) - 100
        const y = oy + Math.random() * h
        if (Math.random() < 0.4)
          this.particles.spawn('petal', x, y, 60 + Math.random() * 60, 18 + Math.random() * 14, 6, -6, 5)
        else this.particles.spawn('pollen', x, y, 10 + Math.random() * 30, 6 + Math.random() * 6, -2, 2, 4)
      }
      this.water = 0
      return
    }
    this.water = 0
    this.wind = 0
    if (info.id === 'tower') return this.tower(dt, view, ox, oy, w, h)
    if (info.id !== 'sewer') return
    // Dust motes drifting in the light around lamps and heroes.
    while (this.timer > 0.09) {
      this.timer -= 0.09
      const src =
        Math.random() < 0.55 && this.lamps.length
          ? this.lamps[(Math.random() * this.lamps.length) | 0]
          : view.heroes[(Math.random() * view.heroes.length) | 0]
      if (!src || !inView(src.x, src.y, 80)) continue
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * 90
      this.particles.spawn(
        'mote',
        src.x + Math.cos(a) * d,
        src.y - 20 + Math.sin(a) * d * 0.6,
        10 + Math.random() * 50,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 3,
        2 + Math.random() * 4,
        4 + Math.random() * 3
      )
    }
    // Debris riding the currents (stopped channels stay still).
    const cx = ox + w / 2
    const cy = oy + h / 2
    let near = Infinity
    for (const c of this.channels) {
      const off = view.currentsOff?.includes(c.id) ?? false
      const vis = this.scratch
      vis.length = 0
      for (let i = 0; i < c.xs.length; i++) {
        if (!inView(c.xs[i], c.ys[i], 32)) continue
        vis.push(i)
        if (!off) near = Math.min(near, Math.hypot(c.xs[i] - cx, c.ys[i] - cy))
      }
      if (off || !vis.length) continue
      const rate = Math.min(40, vis.length * 0.7) * dt
      let spawns = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0)
      while (spawns-- > 0) {
        const i = vis[(Math.random() * vis.length) | 0]
        const sp = c.speed * (0.55 + Math.random() * 0.35)
        const jx = (Math.random() - 0.5) * TILE
        const jy = (Math.random() - 0.5) * TILE
        this.particles.spawn(
          'debris',
          c.xs[i] + jx,
          c.ys[i] + jy,
          0,
          c.dx * sp + (Math.random() - 0.5) * 8,
          c.dy * sp + (Math.random() - 0.5) * 8,
          0,
          1.4 + Math.random() * 1.4
        )
      }
    }
    this.water = near === Infinity ? 0 : Math.max(0, Math.min(1, 1 - near / (w * 0.7)))
    // Drips from the wall pipes into the channel below.
    for (const p of this.pipes) {
      p.next -= dt
      if (p.next > 0) continue
      p.next = 1.4 + Math.random() * 2.6
      if (this.drip && inView(p.x, p.y, 40)) this.fx.add(this.drip, p.x + (Math.random() - 0.5) * 4, p.y + 26, t)
    }
  }

  /** Cliffs over the cloud sea: wind streaks in wind zones, cloud wisps over the sky, updrafts over vents. */
  private tower(dt: number, view: View, ox: number, oy: number, w: number, h: number) {
    const info = this.info!
    let wind = 0
    for (const z of this.winds) {
      const x0 = Math.max(z.x * TILE, ox - 64)
      const x1 = Math.min((z.x + z.w) * TILE, ox + w + 64)
      const y0 = Math.max(z.y * TILE, oy - 64)
      const y1 = Math.min((z.y + z.h) * TILE, oy + h + 64)
      if (x1 <= x0 || y1 <= y0) continue
      const area = ((x1 - x0) * (y1 - y0)) / (TILE * TILE)
      wind = Math.max(wind, Math.min(1, (z.strength / 110) * Math.min(1, area / 30)))
      const rate = Math.min(60, area * (z.strength / 110) * 1.5) * dt
      let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0)
      while (n-- > 0) {
        const sp = z.strength * (1.6 + Math.random() * 0.8)
        this.particles.spawn(
          'gale',
          x0 + Math.random() * (x1 - x0),
          y0 + Math.random() * (y1 - y0),
          0,
          z.dx * sp,
          z.dy * sp,
          0,
          0.7 + Math.random() * 0.5
        )
      }
    }
    this.wind = wind
    // Wisps of cloud drift over the sky tiles in view (they move slower than the ground: depth).
    while (this.timer > 0.05) {
      this.timer -= 0.05
      const i = this.sky[(Math.random() * this.sky.length) | 0]
      if (i === undefined) break
      const x = (i % info.w) * TILE + Math.random() * TILE
      const y = Math.floor(i / info.w) * TILE + Math.random() * TILE
      if (x < ox - 40 || x > ox + w + 40 || y < oy - 20 || y > oy + h + 20) continue
      this.particles.spawn(
        'wisp',
        x,
        y,
        0,
        -10 - Math.random() * 10,
        (Math.random() - 0.5) * 2,
        0,
        5 + Math.random() * 4
      )
    }
    // Updrafts rise over the vents.
    for (const p of view.props) {
      if (p.kind !== 'vent' || p.x < ox - 64 || p.x > ox + w + 64 || p.y < oy - 64 || p.y > oy + h + 96) continue
      if (Math.random() < dt * 14)
        this.particles.spawn(
          'updraft',
          p.x + (Math.random() - 0.5) * 44,
          p.y + 8,
          4,
          (Math.random() - 0.5) * 6,
          0,
          70 + Math.random() * 50,
          0.8 + Math.random() * 0.4
        )
    }
  }
}
