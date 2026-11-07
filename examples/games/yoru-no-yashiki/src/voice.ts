export interface VoiceAssessment {
  rms: number
  voiced: boolean
  confidence: number
}

export interface VoiceHealth {
  mic: boolean
  rms: number
  voiced: boolean
  threshold: number
  challenge: number
  phase: string
  playing: boolean
}

export function parseVoiceHealth(value: Record<string, unknown>): VoiceHealth | undefined {
  if (
    typeof value.mic !== 'boolean' ||
    typeof value.voiced !== 'boolean' ||
    typeof value.rms !== 'number' ||
    !Number.isFinite(value.rms) ||
    value.rms < 0 ||
    value.rms > 1 ||
    typeof value.threshold !== 'number' ||
    !Number.isFinite(value.threshold) ||
    value.threshold < 0.02 ||
    value.threshold > 0.5 ||
    typeof value.challenge !== 'number' ||
    !Number.isSafeInteger(value.challenge) ||
    value.challenge < 0 ||
    typeof value.phase !== 'string' ||
    !['lobby', 'round1', 'intermission', 'round2', 'finished'].includes(value.phase) ||
    typeof value.playing !== 'boolean'
  )
    return undefined
  return {
    mic: value.mic,
    rms: value.rms,
    voiced: value.voiced,
    threshold: value.threshold,
    challenge: value.challenge,
    phase: value.phase,
    playing: value.playing
  }
}

export function isFreshVoiceHealth(
  health: VoiceHealth,
  role: 'host' | 'guest',
  lastChallenge: number,
  sent: number | undefined,
  now: number,
  lockedThreshold: number | undefined
): boolean {
  if (lockedThreshold !== undefined && health.threshold !== lockedThreshold) return false
  if (role === 'guest') return health.challenge > lastChallenge
  return sent !== undefined && now >= sent && now - sent <= 500
}

export function isCurrentVoice(health: VoiceHealth, phase: string, minimumChallenge: number): boolean {
  return health.mic && health.voiced && health.playing && health.phase === phase && health.challenge >= minimumChallenge
}

const MAX_SAMPLES = 2048
const HOLD_SECONDS = 0.12

export interface VoiceFrameAnalysis {
  readonly rms: number
  readonly confidence: number
  readonly deltaSeconds: number
}

export function analyzeVoiceFrame(
  samples: Float32Array,
  sampleRate: number,
  deltaSeconds: number
): VoiceFrameAnalysis | undefined {
  const math = Math
  const number = Number
  if (
    !(samples instanceof Float32Array) ||
    !number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    !number.isFinite(deltaSeconds) ||
    deltaSeconds < 0 ||
    deltaSeconds > 1 ||
    samples.length === 0
  ) {
    return undefined
  }
  const stride = math.ceil(sampleRate / 16000)
  const count = math.min(MAX_SAMPLES, math.floor(samples.length / stride))
  if (count < math.ceil((sampleRate / stride) * 0.02)) {
    return undefined
  }
  const start = samples.length - count * stride
  const window = new Float64Array(count)
  let sum = 0
  for (let index = 0; index < count; index++) {
    const sample = samples[start + index * stride]
    if (!number.isFinite(sample)) {
      return undefined
    }
    window[index] = math.max(-1, math.min(1, sample))
    sum += window[index]
  }
  const mean = sum / count
  let energy = 0
  for (let index = 0; index < count; index++) {
    window[index] -= mean
    energy += window[index] * window[index]
  }
  const rms = math.sqrt(energy / count)
  if (rms < 0.005) {
    return { rms, confidence: 0, deltaSeconds }
  }
  const effectiveRate = sampleRate / stride
  const minLag = math.max(1, math.floor(effectiveRate / 1000))
  const maxLag = math.min(math.ceil(effectiveRate / 70), math.floor(count / 2))
  let confidence = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let cross = 0
    let leftEnergy = 0
    let rightEnergy = 0
    for (let index = lag; index < count; index++) {
      const left = window[index]
      const right = window[index - lag]
      cross += left * right
      leftEnergy += left * left
      rightEnergy += right * right
    }
    const normalization = math.sqrt(leftEnergy * rightEnergy)
    if (normalization > 0) confidence = math.max(confidence, cross / normalization)
  }
  confidence = math.min(1, math.max(0, confidence))
  return { rms, confidence, deltaSeconds }
}

export class VoiceGate {
  private holdRemaining = 0

  analyze(samples: Float32Array, sampleRate: number, deltaSeconds: number): VoiceAssessment {
    return this.applyAnalysis(analyzeVoiceFrame(samples, sampleRate, deltaSeconds))
  }

  applyAnalysis(analysis: VoiceFrameAnalysis | undefined): VoiceAssessment {
    if (!analysis) {
      this.reset()
      return { rms: 0, voiced: false, confidence: 0 }
    }
    const { rms, confidence, deltaSeconds } = analysis
    if (rms < 0.005) {
      this.holdRemaining = Math.max(0, this.holdRemaining - deltaSeconds)
      return { rms, voiced: false, confidence: 0 }
    }
    if (confidence >= 0.65) {
      this.holdRemaining = HOLD_SECONDS
      return { rms, voiced: true, confidence }
    }
    this.holdRemaining = Math.max(0, this.holdRemaining - deltaSeconds)
    return { rms, voiced: this.holdRemaining > 0, confidence }
  }

  reset(): void {
    this.holdRemaining = 0
  }
}
