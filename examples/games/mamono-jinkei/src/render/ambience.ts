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
    if (info.id !== 'sewer') {
      this.water = 0
      return
    }
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
}
