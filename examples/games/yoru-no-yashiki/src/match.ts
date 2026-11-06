export type PlayerId = 'host' | 'guest'
export type MatchPhase = 'lobby' | 'round1' | 'intermission' | 'round2' | 'finished'

export interface MatchSnapshot {
  phase: MatchPhase
  survivor: PlayerId
  elapsedMs: number
  scores: Record<PlayerId, number>
  paused: boolean
}

const ROUND_MS = 900_000
const NUMBER_SCALE = 1n << 1074n
const POINT_SCALE = 1000n * NUMBER_SCALE * NUMBER_SCALE
const ROUND_UNITS = BigInt(ROUND_MS) * NUMBER_SCALE
const bits = new DataView(new ArrayBuffer(8))

function numberUnits(value: number): bigint {
  bits.setFloat64(0, Math.abs(value))
  const encoded = bits.getBigUint64(0)
  const exponent = Number(encoded >> 52n)
  const fraction = encoded & ((1n << 52n) - 1n)
  const units = exponent === 0 ? fraction : (fraction | (1n << 52n)) << BigInt(exponent - 1)
  return value < 0 ? -units : units
}

function roundedNumber(numerator: bigint, denominator = POINT_SCALE): number {
  if (numerator === 0n) return 0
  let exponent = numerator.toString(2).length - denominator.toString(2).length
  if (exponent >= 0 ? numerator < denominator << BigInt(exponent) : numerator << BigInt(-exponent) < denominator)
    exponent--
  if (exponent > 1023) return Infinity
  const shift = Math.max(-1074, exponent - 52)
  const dividend = shift < 0 ? numerator << BigInt(-shift) : numerator
  const divisor = shift < 0 ? denominator : denominator << BigInt(shift)
  let significand = dividend / divisor
  const twiceRemainder = (dividend % divisor) * 2n
  if (twiceRemainder > divisor || (twiceRemainder === divisor && significand % 2n === 1n)) significand++
  return Number(significand) * 2 ** shift
}

export class HorrorMatch {
  private elapsedUnits = 0n
  private penalties = { host: 0n, guest: 0n }
  private state: MatchSnapshot = {
    phase: 'lobby',
    survivor: 'host',
    elapsedMs: 0,
    scores: { host: 0, guest: 0 },
    paused: false
  }

  getSnapshot(): MatchSnapshot {
    return {
      ...this.state,
      elapsedMs: Math.min(this.state.elapsedMs, this.elapsedUnits < ROUND_UNITS ? ROUND_MS - 2 ** -33 : ROUND_MS),
      scores: { ...this.state.scores }
    }
  }

  start(): void {
    if (this.state.phase === 'lobby') this.state.phase = 'round1'
  }

  tick(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0 || this.state.paused) return
    if (this.state.phase !== 'round1' && this.state.phase !== 'round2') return
    const difference = numberUnits(deltaMs)
    const remaining = ROUND_UNITS - this.elapsedUnits
    this.elapsedUnits += difference < remaining ? difference : remaining
    this.state.elapsedMs = roundedNumber(this.elapsedUnits, NUMBER_SCALE)
    if (this.elapsedUnits === ROUND_UNITS) {
      this.state.phase = this.state.phase === 'round1' ? 'intermission' : 'finished'
    }
  }

  startSecondRound(): void {
    if (this.state.phase !== 'intermission' || this.state.paused) return
    this.state.phase = 'round2'
    this.state.survivor = 'guest'
    this.state.elapsedMs = 0
    this.elapsedUnits = 0n
  }

  addPenalty(player: PlayerId, points: number): void {
    if (this.state.paused || (this.state.phase !== 'round1' && this.state.phase !== 'round2')) return
    if (player !== this.state.survivor || !Number.isFinite(points) || points < 0) return
    this.addExactPenalty(player, numberUnits(points) * NUMBER_SCALE * 1000n)
  }

  observe(meter: ScreamMeter, rms: number, startMs: number, endMs: number): void {
    if (this.state.paused || (this.state.phase !== 'round1' && this.state.phase !== 'round2')) return
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      meter.reset()
      return
    }
    const difference = numberUnits(endMs) - numberUnits(startMs)
    const remaining = ROUND_UNITS - this.elapsedUnits
    const duration = difference < remaining ? difference : remaining
    this.addExactPenalty(this.state.survivor, meter.sampleExact(rms, duration))
    this.elapsedUnits += duration
    this.state.elapsedMs = roundedNumber(this.elapsedUnits, NUMBER_SCALE)
    if (this.elapsedUnits === ROUND_UNITS)
      this.state.phase = this.state.phase === 'round1' ? 'intermission' : 'finished'
  }

  private addExactPenalty(player: PlayerId, points: bigint): void {
    const total = this.penalties[player] + points
    const score = roundedNumber(total)
    if (Number.isFinite(score)) {
      this.penalties[player] = total
      this.state.scores[player] = score === 0 ? 0 : -score
    }
  }

  pause(): void {
    if (this.state.phase === 'round1' || this.state.phase === 'round2') this.state.paused = true
  }

  resume(): void {
    this.state.paused = false
  }
}

export class ScreamMeter {
  private readonly threshold: number
  private duration = 0
  private durationCompensation = 0
  private pending = 0
  private pendingCompensation = 0
  private qualified = false
  private exactDuration = 0n
  private exactPending = 0n

  constructor(threshold = 0.1) {
    this.threshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 0.1
  }

  sample(rms: number, deltaSeconds: number): number {
    if (!Number.isFinite(rms) || rms < 0 || !Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      this.reset()
      return 0
    }
    if (deltaSeconds === 0) return 0
    if (rms < this.threshold) {
      this.reset()
      return 0
    }
    const points = rms * deltaSeconds
    const adjustedPoints = points - this.pendingCompensation
    const pending = this.pending + adjustedPoints
    if (!Number.isFinite(points) || !Number.isFinite(pending)) {
      this.reset()
      return 0
    }
    this.pendingCompensation = pending - this.pending - adjustedPoints
    this.pending = pending
    if (!this.qualified) {
      const adjustedDuration = deltaSeconds - this.durationCompensation
      const duration = this.duration + adjustedDuration
      this.durationCompensation = duration - this.duration - adjustedDuration
      this.duration = duration
      if (0.3 - this.duration > Number.EPSILON * 0.3) return 0
    }
    this.qualified = true
    const result = this.pending
    this.pending = 0
    this.pendingCompensation = 0
    return result
  }

  reset(): void {
    this.exactDuration = 0n
    this.exactPending = 0n
    this.duration = 0
    this.durationCompensation = 0
    this.pending = 0
    this.pendingCompensation = 0
    this.qualified = false
  }

  sampleExact(rms: number, duration: bigint): bigint {
    if (!Number.isFinite(rms) || rms < 0 || duration < 0n || duration > ROUND_UNITS) {
      this.reset()
      return 0n
    }
    if (duration === 0n) return 0n
    if (rms < this.threshold) {
      this.reset()
      return 0n
    }
    this.exactPending += numberUnits(rms) * duration
    this.pending = roundedNumber(this.exactPending)
    if (!Number.isFinite(this.pending)) {
      this.reset()
      return 0n
    }
    if (!this.qualified) {
      this.exactDuration += duration
      this.duration = roundedNumber(this.exactDuration, NUMBER_SCALE * 1000n)
      if (0.3 - this.duration > Number.EPSILON * 0.3) return 0n
    }
    this.qualified = true
    const result = this.exactPending
    this.exactPending = 0n
    this.pending = 0
    return result
  }
}
