/**
 * Quality presets (DESIGN §15, §19) and the 自動 controller. Pure: no DOM, no WebGL.
 */
import type { Quality } from '../../models/api'

export interface QualityPreset {
  /** Post-processing chain (bloom, AA, grading). Skipped entirely at low. */
  post: boolean
  /** Anti-aliasing pass used when post is on. */
  aa: 'none' | 'fxaa' | 'smaa'
  /** MSAA samples of the HDR scene target. */
  msaa: number
  shadows: boolean
  shadowMapSize: number
  /** Half-extent of the sun's shadow box around the local player (m). */
  shadowRange: number
  /** Bloom render scale relative to the canvas. */
  bloomScale: number
  /** Upper bound for the device pixel ratio. */
  maxPixelRatio: number
  /** Live particles. */
  particles: number
  /** Multiplier for scattered decor (grass tufts, petals, debris). */
  decorDensity: number
  /** Environment chunk size (m): smaller chunks cull better but cost draw calls. */
  chunk: number
  /** Camera far plane (m). */
  far: number
  /** Character outlines (ModelKit option). */
  outlines: boolean
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: {
    post: false,
    aa: 'none',
    msaa: 0,
    shadows: false,
    shadowMapSize: 512,
    shadowRange: 40,
    bloomScale: 0.5,
    maxPixelRatio: 1,
    particles: 700,
    decorDensity: 0.45,
    chunk: 80,
    far: 260,
    outlines: false
  },
  medium: {
    post: true,
    aa: 'fxaa',
    msaa: 0,
    shadows: true,
    shadowMapSize: 2048,
    shadowRange: 60,
    bloomScale: 0.5,
    maxPixelRatio: 1.25,
    particles: 1500,
    decorDensity: 0.8,
    chunk: 64,
    far: 420,
    outlines: true
  },
  high: {
    post: true,
    aa: 'smaa',
    msaa: 4,
    shadows: true,
    shadowMapSize: 4096,
    shadowRange: 60,
    bloomScale: 0.5,
    maxPixelRatio: 2,
    particles: 2000,
    decorDensity: 1,
    chunk: 56,
    far: 520,
    outlines: true
  }
}

export const QUALITY_ORDER: readonly Quality[] = ['low', 'medium', 'high']

/** Japanese labels for settings screens. */
export const QUALITY_LABELS: Record<Quality | 'auto', string> = {
  low: '低',
  medium: '中',
  high: '高',
  auto: '自動'
}

/**
 * 自動: drops one level once frames have exceeded `slowMs` continuously for `holdSeconds`, and climbs back one level
 * after a long stretch of fast frames (never back to a level it had to leave).
 */
export class AutoQuality {
  level: Quality
  private slowFor = 0
  private fastFor = 0
  private readonly ceiling: Set<Quality> = new Set()

  constructor(
    start: Quality = 'medium',
    readonly slowMs = 22,
    readonly holdSeconds = 3,
    readonly fastMs = 12,
    readonly climbSeconds = 10
  ) {
    this.level = start
  }

  /** Feed one frame; returns the new level when it changed, otherwise null. */
  sample(frameMs: number, dt: number): Quality | null {
    if (frameMs > this.slowMs) {
      this.slowFor += dt
      this.fastFor = 0
    } else {
      this.slowFor = 0
      this.fastFor = frameMs < this.fastMs ? this.fastFor + dt : 0
    }
    const i = QUALITY_ORDER.indexOf(this.level)
    if (this.slowFor >= this.holdSeconds && i > 0) {
      this.ceiling.add(this.level)
      this.level = QUALITY_ORDER[i - 1]
      this.slowFor = 0
      this.fastFor = 0
      return this.level
    }
    if (this.fastFor >= this.climbSeconds && i < QUALITY_ORDER.length - 1) {
      const next = QUALITY_ORDER[i + 1]
      this.fastFor = 0
      if (!this.ceiling.has(next)) {
        this.level = next
        return next
      }
    }
    return null
  }
}

/** Rolling fps / frame time meter (no allocations per sample). */
export class FrameMeter {
  private readonly samples: Float32Array
  private index = 0
  private count = 0
  private sum = 0

  constructor(size = 60) {
    this.samples = new Float32Array(size)
  }

  push(ms: number) {
    const n = this.samples.length
    if (this.count === n) this.sum -= this.samples[this.index]
    else this.count++
    this.samples[this.index] = ms
    this.sum += ms
    this.index = (this.index + 1) % n
  }

  get frameMs() {
    return this.count ? this.sum / this.count : 0
  }

  get fps() {
    const ms = this.frameMs
    return ms > 0 ? 1000 / ms : 0
  }
}
