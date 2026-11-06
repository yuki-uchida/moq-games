import { readFileSync } from 'node:fs'
import { ScriptTarget, transpileModule } from 'typescript'
import { describe, expect, test, vi } from 'vitest'
import { ScreamMeter } from '../src/match'
import {
  VoiceGate,
  analyzeVoiceFrame,
  isCurrentVoice,
  isFreshVoiceHealth,
  parseVoiceHealth,
  type VoiceAssessment
} from '../src/voice'
import { previewStatus } from '../src/preview'

const rate = 16000
const frameSize = 1024

function harmonics(offset = 0): Float32Array {
  return Float32Array.from({ length: frameSize }, (_, index) => {
    const phase = (2 * Math.PI * 200 * index) / rate
    return offset + 0.4 * Math.sin(phase) + 0.15 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase)
  })
}

function noise(seed = 1): Float32Array {
  return Float32Array.from({ length: frameSize }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return (seed / 0x100000000 - 0.5) * 0.8
  })
}

class LegacyVoiceGate {
  private holdRemaining = 0

  analyze(samples: Float32Array, sampleRate: number, deltaSeconds: number): VoiceAssessment {
    const silent = { rms: 0, voiced: false, confidence: 0 }
    if (
      !(samples instanceof Float32Array) ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds < 0 ||
      deltaSeconds > 1 ||
      samples.length === 0
    ) {
      this.reset()
      return silent
    }
    const stride = Math.ceil(sampleRate / 16000)
    const count = Math.min(2048, Math.floor(samples.length / stride))
    if (count < Math.ceil((sampleRate / stride) * 0.02)) {
      this.reset()
      return silent
    }
    const start = samples.length - count * stride
    const window = new Float64Array(count)
    let sum = 0
    for (let index = 0; index < count; index++) {
      const sample = samples[start + index * stride]
      if (!Number.isFinite(sample)) {
        this.reset()
        return silent
      }
      window[index] = Math.max(-1, Math.min(1, sample))
      sum += window[index]
    }
    const mean = sum / count
    let energy = 0
    for (let index = 0; index < count; index++) {
      window[index] -= mean
      energy += window[index] * window[index]
    }
    const rms = Math.sqrt(energy / count)
    if (rms < 0.005) {
      this.holdRemaining = Math.max(0, this.holdRemaining - deltaSeconds)
      return { rms, voiced: false, confidence: 0 }
    }
    const effectiveRate = sampleRate / stride
    const minLag = Math.max(1, Math.floor(effectiveRate / 1000))
    const maxLag = Math.min(Math.ceil(effectiveRate / 70), Math.floor(count / 2))
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
      const normalization = Math.sqrt(leftEnergy * rightEnergy)
      if (normalization > 0) confidence = Math.max(confidence, cross / normalization)
    }
    confidence = Math.min(1, Math.max(0, confidence))
    if (confidence >= 0.65) {
      this.holdRemaining = 0.12
      return { rms, voiced: true, confidence }
    }
    this.holdRemaining = Math.max(0, this.holdRemaining - deltaSeconds)
    return { rms, voiced: this.holdRemaining > 0, confidence }
  }

  reset(): void {
    this.holdRemaining = 0
  }
}

describe('shared waveform equivalence to the original gates', () => {
  function expectSame(actual: VoiceAssessment, expected: VoiceAssessment) {
    expect(actual.rms).toBe(expected.rms)
    expect(actual.confidence).toBe(expected.confidence)
    expect(actual.voiced).toBe(expected.voiced)
  }

  function frames(sampleRate: number) {
    let seed = 147
    const periodic = Float32Array.from({ length: 8192 }, (_, index) => {
      const phase = (2 * Math.PI * 200 * index) / sampleRate
      return 0.2 + 0.4 * Math.sin(phase) + 0.15 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase)
    })
    const nonperiodic = Float32Array.from({ length: 8192 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return (seed / 0x100000000 - 0.5) * 0.8
    })
    return { periodic, nonperiodic, low: periodic.map((sample) => sample * 0.001) }
  }

  test.each([8000, 16000, 22050, 44100, 48000, 96000, 192000])(
    'matches exact RMS, confidence, voiced and hold for different prior states at %i Hz',
    (sampleRate) => {
      const { periodic, nonperiodic, low } = frames(sampleRate)
      const histories: [Float32Array, number][][] = [
        [],
        [[periodic, 0.04]],
        [
          [periodic, 0.04],
          [nonperiodic, 0.04]
        ],
        [
          [periodic, 0.04],
          [low, 0.119999]
        ]
      ]
      const sequence: [Float32Array, number, number][] = [
        [nonperiodic, 0, 0],
        [periodic, 0.04, 0],
        [nonperiodic, 0.04, 0],
        [low, 0.04, 0],
        [nonperiodic, 0.04, 0],
        [periodic, 0.04, 0],
        [nonperiodic, 0.12 - Number.EPSILON, 0],
        [nonperiodic, Number.EPSILON, 0],
        [periodic, 0.04, 0],
        [nonperiodic, 0.12, 0],
        [periodic, 0.04, 0],
        [nonperiodic, 0.12 + Number.EPSILON, 0],
        [periodic, 0.04, 1],
        [nonperiodic, 0.04, 2],
        [periodic, 0.04, 0],
        [low, 0.02, 3],
        [nonperiodic, -0, 0],
        [periodic, 1, 0],
        [nonperiodic, 1, 0]
      ]
      for (const voiceHistory of histories) {
        for (const previewHistory of histories) {
          const shared = [new VoiceGate(), new VoiceGate()]
          const standalone = [new VoiceGate(), new VoiceGate()]
          const original = [new LegacyVoiceGate(), new LegacyVoiceGate()]
          for (const [index, history] of [voiceHistory, previewHistory].entries()) {
            for (const [samples, delta] of history) {
              const expected = original[index].analyze(samples, sampleRate, delta)
              expectSame(shared[index].analyze(samples, sampleRate, delta), expected)
              expectSame(standalone[index].analyze(samples, sampleRate, delta), expected)
            }
          }
          for (const [samples, delta, resets] of sequence) {
            const analysis = analyzeVoiceFrame(samples, sampleRate, delta)
            if (analysis) Object.freeze(analysis)
            for (let index = 0; index < 2; index++) {
              if (resets & (1 << index)) {
                shared[index].reset()
                standalone[index].reset()
                original[index].reset()
              }
              const expected = original[index].analyze(samples, sampleRate, delta)
              expectSame(shared[index].applyAnalysis(analysis), expected)
              expectSame(standalone[index].analyze(samples, sampleRate, delta), expected)
              expect(Reflect.get(shared[index], 'holdRemaining')).toBe(Reflect.get(original[index], 'holdRemaining'))
              expect(Reflect.get(standalone[index], 'holdRemaining')).toBe(
                Reflect.get(original[index], 'holdRemaining')
              )
            }
          }
        }
      }
    }
  )

  test('low RMS decays hold without reporting voiced, and 120ms expires at the exact boundary', () => {
    const { periodic, nonperiodic, low } = frames(rate)
    const voice = new VoiceGate()
    const preview = new VoiceGate()
    preview.analyze(periodic, rate, 0.04)
    const held = analyzeVoiceFrame(nonperiodic, rate, 0.04)
    expect(voice.applyAnalysis(held).voiced).toBe(false)
    expect(preview.applyAnalysis(held).voiced).toBe(true)
    const quiet = analyzeVoiceFrame(low, rate, 0.04)
    expect(preview.applyAnalysis(quiet).voiced).toBe(false)
    expect(preview.analyze(nonperiodic, rate, 0).voiced).toBe(true)
    expect(preview.analyze(nonperiodic, rate, 0.04).voiced).toBe(false)
    for (const delta of [0.12 - Number.EPSILON, 0.12, 0.12 + Number.EPSILON]) {
      voice.analyze(periodic, rate, 0)
      expect(voice.analyze(nonperiodic, rate, delta).voiced).toBe(delta < 0.12)
    }
  })

  test('invalid samples, rates and deltas reset both independent states exactly as before', () => {
    const { periodic, nonperiodic } = frames(rate)
    const invalid: [unknown, number, number][] = [
      [undefined, rate, 0.04],
      [null, rate, 0.04],
      [[], rate, 0.04],
      [new Float64Array(8192), rate, 0.04],
      [new Float32Array(0), rate, 0.04],
      [new Float32Array(8), rate, 0.04]
    ]
    for (const value of [NaN, Infinity, -Infinity]) {
      const samples = periodic.slice()
      samples[7000] = value
      invalid.push([samples, rate, 0.04])
    }
    for (const sampleRate of [NaN, Infinity, -Infinity, 0, -1, 7999, 192001]) invalid.push([periodic, sampleRate, 0.04])
    for (const delta of [NaN, Infinity, -Infinity, -0.001, 1.0001]) invalid.push([periodic, rate, delta])
    for (const [input, sampleRate, delta] of invalid) {
      const samples = input as Float32Array
      const analysis = analyzeVoiceFrame(samples, sampleRate, delta)
      expect(analysis).toBeUndefined()
      for (const priorDelta of [0, 0.05]) {
        const gate = new VoiceGate()
        const original = new LegacyVoiceGate()
        const standalone = new VoiceGate()
        for (const target of [gate, original, standalone]) {
          target.analyze(periodic, rate, 0)
          target.analyze(nonperiodic, rate, priorDelta)
        }
        const expected = original.analyze(samples, sampleRate, delta)
        expectSame(gate.applyAnalysis(analysis), expected)
        expectSame(standalone.analyze(samples, sampleRate, delta), expected)
        expect(expected).toStrictEqual({ rms: 0, voiced: false, confidence: 0 })
        expect(gate.analyze(nonperiodic, rate, 0).voiced).toBe(false)
        expect(standalone.analyze(nonperiodic, rate, 0).voiced).toBe(false)
      }
    }
  })

  test('preserves clipping, decimation, ignored samples and minimum window validation', () => {
    for (const sampleRate of [8000, 16000, 44100, 48000, 96000, 192000]) {
      const { periodic } = frames(sampleRate)
      const stride = Math.ceil(sampleRate / 16000)
      const minimum = Math.ceil((sampleRate / stride) * 0.02) * stride
      const ignored = periodic.slice()
      ignored[0] = NaN
      ignored[ignored.length - 2] = Infinity
      for (const samples of [
        periodic,
        periodic.map((sample) => sample * 8),
        periodic.map(() => 3e38),
        periodic.slice(-minimum + 1),
        periodic.slice(-minimum),
        periodic.slice(-minimum - 1),
        ignored
      ]) {
        const before = samples.slice()
        const expected = new LegacyVoiceGate().analyze(samples, sampleRate, 0.04)
        expectSame(new VoiceGate().applyAnalysis(analyzeVoiceFrame(samples, sampleRate, 0.04)), expected)
        expectSame(new VoiceGate().analyze(samples, sampleRate, 0.04), expected)
        expect(samples).toStrictEqual(before)
      }
    }
  })
})

const legacyMicrophoneBranch = `  if (analyser && samples && micHealthy()) {
    analyser.getFloatTimeDomainData(samples)
    const active = (snapshot.phase === 'round1' || snapshot.phase === 'round2') && !snapshot.paused && elapsed <= 0.5
    if (!active) voiceGate.reset()
    const assessment = voiceGate.analyze(samples, audio!.sampleRate, Math.min(delta, 0.5))
    localRms = assessment.rms
    localVoiced = active && assessment.voiced
    if (!active && elapsed <= 0.5 && !finished) {
      const preview = previewGate.analyze(samples, audio!.sampleRate, Math.min(delta, 0.5))
      const penalty = previewMeter.sample(preview.voiced ? preview.rms : 0, Math.min(delta, 0.5))
      text('preview-status', previewStatus(preview, previewThreshold, penalty))
    } else {
      resetPreview()
      text('preview-status', '試合中はプレビューを停止しています')
    }
  } else {
    voiceGate.reset()
    resetPreview()
    text('preview-status', 'マイクを接続してください')
    localRms = 0
    localVoiced = false
  }`

describe('main microphone frame equivalence without a browser', () => {
  function compileFrame(branch: string) {
    return new Function(
      'state',
      'analyzeVoiceFrame',
      'previewStatus',
      transpileModule(
        'const { analyser, samples, micHealthy, snapshot, elapsed, finished, audio, voiceGate, previewGate, previewMeter, previewThreshold, resetPreview, text } = state; ' +
          'const delta = Math.min(elapsed, 3); let { localRms, localVoiced } = state;\n' +
          branch +
          '\nreturn { localRms, localVoiced };',
        { compilerOptions: { target: ScriptTarget.ES2022 } }
      ).outputText
    )
  }

  function context(Gate: typeof VoiceGate | typeof LegacyVoiceGate) {
    const state = {
      voiceGate: new Gate(),
      previewGate: new Gate(),
      previewMeter: new ScreamMeter(0.1),
      previewThreshold: 0.1,
      snapshot: { phase: 'lobby', paused: false },
      elapsed: 0.04,
      finished: false,
      healthy: true,
      audio: { sampleRate: rate },
      analyser: { getFloatTimeDomainData: vi.fn() },
      samples: harmonics() as Float32Array | undefined,
      localRms: 0,
      localVoiced: false,
      micHealthy: () => state.healthy,
      text: vi.fn(),
      resetPreview: () => {
        state.previewGate.reset()
        state.previewMeter.reset()
      }
    }
    return state
  }

  test('shares one calculation only within a frame and preserves ready, active, pause, resume and reset behavior', () => {
    const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
    const start = source.indexOf('  if (analyser && samples && micHealthy()) {')
    const end = source.indexOf("  el<HTMLMeterElement>('level').value", start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const currentFrame = compileFrame(source.slice(start, end))
    const oldFrame = compileFrame(legacyMicrophoneBranch)
    const current = context(VoiceGate)
    const original = context(LegacyVoiceGate)
    const analyzeFrame = vi.fn(analyzeVoiceFrame)
    const voiceApply = vi.spyOn(current.voiceGate as VoiceGate, 'applyAnalysis')
    const previewApply = vi.spyOn(current.previewGate as VoiceGate, 'applyAnalysis')
    const tick = (samples = noise(), elapsed = 0.04) => {
      analyzeFrame.mockClear()
      voiceApply.mockClear()
      previewApply.mockClear()
      for (const state of [current, original]) {
        state.samples = samples
        state.elapsed = elapsed
      }
      const expected = oldFrame(original, analyzeFrame, previewStatus)
      const actual = currentFrame(current, analyzeFrame, previewStatus)
      Object.assign(current, actual)
      Object.assign(original, expected)
      expect(actual).toStrictEqual(expected)
      expect(current.text.mock.calls).toStrictEqual(original.text.mock.calls)
      expect(current.previewMeter).toEqual(original.previewMeter)
      for (const key of ['voiceGate', 'previewGate'] as const)
        expect(Reflect.get(current[key], 'holdRemaining')).toBe(Reflect.get(original[key], 'holdRemaining'))
      expect(analyzeFrame).toHaveBeenCalledTimes(current.healthy ? 1 : 0)
      if (previewApply.mock.calls.length) {
        expect(previewApply).toHaveBeenCalledTimes(1)
        expect(previewApply.mock.calls[0][0]).toBe(voiceApply.mock.calls[0][0])
      }
      return actual
    }
    const phase = (value: string, paused = false) => {
      for (const state of [current, original]) state.snapshot = { phase: value, paused }
    }
    const reset = () => {
      for (const state of [current, original]) {
        state.voiceGate.reset()
        state.resetPreview()
      }
    }
    expect(tick(harmonics()).localVoiced).toBe(false)
    expect(tick().localVoiced).toBe(false)
    expect(Reflect.get(current.previewGate, 'holdRemaining')).toBeGreaterThan(0)
    tick(harmonics())
    for (const state of [current, original]) {
      state.previewThreshold = 0.5
      state.previewGate.reset()
      state.previewMeter = new ScreamMeter(0.5)
    }
    phase('round1')
    expect(tick().localVoiced).toBe(true)
    expect(tick(new Float32Array(frameSize).fill(0.001)).localVoiced).toBe(false)
    expect(tick(noise(), 0.02).localVoiced).toBe(true)
    phase('round1', true)
    tick(harmonics())
    expect(tick().localVoiced).toBe(false)
    tick(harmonics())
    phase('round1')
    expect(tick().localVoiced).toBe(true)
    reset()
    expect(tick().localVoiced).toBe(false)
    tick(harmonics())
    for (const state of [current, original]) state.healthy = false
    expect(tick().localRms).toBe(0)
    for (const state of [current, original]) state.healthy = true
    expect(tick().localVoiced).toBe(false)
    phase('intermission')
    tick(harmonics())
    tick()
    phase('round2')
    tick()
    tick(harmonics(), 0.5)
    expect(tick(harmonics(), 0.500001).localVoiced).toBe(false)
    expect(previewApply).not.toHaveBeenCalled()
    phase('round2', true)
    tick(harmonics(), 0.5)
    expect(previewApply).toHaveBeenCalledTimes(1)
    tick(harmonics(), 0.500001)
    expect(previewApply).not.toHaveBeenCalled()
    reset()
    phase('round2')
    tick()
    for (const state of [current, original]) state.finished = true
    phase('finished')
    tick(harmonics())
    expect(previewApply).not.toHaveBeenCalled()
  })
})

describe('VoiceGate', () => {
  test('rejects silence and removes DC before measuring RMS', () => {
    const gate = new VoiceGate()
    expect(gate.analyze(new Float32Array(frameSize), rate, 0.05)).toEqual({ rms: 0, voiced: false, confidence: 0 })
    expect(gate.analyze(new Float32Array(frameSize).fill(0.4), rate, 0.05).rms).toBeCloseTo(0)
    const centered = gate.analyze(harmonics(), rate, 0.05)
    const offset = gate.analyze(harmonics(0.2), rate, 0.05)
    expect(centered.voiced).toBe(true)
    expect(centered.confidence).toBeGreaterThan(0.9)
    expect(offset.rms).toBeCloseTo(centered.rms, 5)
  })

  test('rejects sustained deterministic nonperiodic noise', () => {
    const gate = new VoiceGate()
    for (let seed = 1; seed <= 20; seed++) {
      const result = gate.analyze(noise(seed), rate, 0.05)
      expect(result.rms).toBeGreaterThan(0.1)
      expect(result.voiced).toBe(false)
    }
  })

  test('handles common microphone sample rates and bounded long buffers', () => {
    for (const sampleRate of [8000, 44100, 48000, 96000, 192000]) {
      const samples = Float32Array.from(
        { length: Math.ceil(sampleRate * 0.08) },
        (_, index) => 0.4 * Math.sin((2 * Math.PI * 200 * index) / sampleRate)
      )
      const result = new VoiceGate().analyze(samples, sampleRate, 0.05)
      expect(result.voiced).toBe(true)
      expect(result.rms).toBeGreaterThan(0.2)
    }
    expect(new VoiceGate().analyze(new Float32Array(1000000), rate, 0.05).voiced).toBe(false)
  })

  test('invalid input is safe and clears the hold', () => {
    const gate = new VoiceGate()
    for (const invalid of [NaN, Infinity, -Infinity]) {
      const samples = harmonics()
      samples[20] = invalid
      gate.analyze(harmonics(), rate, 0.05)
      expect(gate.analyze(samples, rate, 0.05)).toEqual({ rms: 0, voiced: false, confidence: 0 })
      expect(gate.analyze(noise(), rate, 0.05).voiced).toBe(false)
    }
    for (const [sampleRate, delta] of [
      [0, 0.1],
      [NaN, 0.1],
      [Infinity, 0.1],
      [rate, -1],
      [rate, NaN],
      [rate, Infinity],
      [rate, 2]
    ]) {
      expect(gate.analyze(harmonics(), sampleRate, delta)).toEqual({ rms: 0, voiced: false, confidence: 0 })
    }
    expect(gate.analyze(new Float32Array(0), rate, 0.1).voiced).toBe(false)
    expect(gate.analyze(new Float32Array(8), rate, 0.1).voiced).toBe(false)
    const huge = new Float32Array(frameSize).fill(3e38)
    expect(Number.isFinite(gate.analyze(huge, rate, 0.1).rms)).toBe(true)
  })

  test('holds short unvoiced sounds, expires, resumes, and resets', () => {
    const gate = new VoiceGate()
    expect(gate.analyze(harmonics(), rate, 0.04).voiced).toBe(true)
    expect(gate.analyze(noise(), rate, 0.04).voiced).toBe(true)
    expect(gate.analyze(harmonics(), rate, 0.04).voiced).toBe(true)
    expect(gate.analyze(noise(), rate, 0.05).voiced).toBe(true)
    expect(gate.analyze(noise(2), rate, 0.08).voiced).toBe(false)
    expect(gate.analyze(harmonics(), rate, 0.04).voiced).toBe(true)
    gate.reset()
    expect(gate.analyze(noise(), rate, 0.04).voiced).toBe(false)
  })

  test('meter rejects a short impact but scores sustained voiced sound', () => {
    const gate = new VoiceGate()
    const meter = new ScreamMeter(0.1)
    const sample = (frame: Float32Array, delta: number) => {
      const result = gate.analyze(frame, rate, delta)
      return meter.sample(result.voiced ? result.rms : 0, delta)
    }
    const impact = new Float32Array(frameSize)
    impact[300] = 1
    expect(sample(impact, 0.05)).toBe(0)
    expect(sample(new Float32Array(frameSize), 0.05)).toBe(0)
    let score = 0
    for (let index = 0; index < 10; index++) score += sample(harmonics(), 0.05)
    expect(score).toBeGreaterThan(0.1)
  })
})

describe('local preview', () => {
  test('uses the real gate and meter for silence, noise, sustained voice and resets', () => {
    const gate = new VoiceGate()
    let meter = new ScreamMeter(0.1)
    let threshold = 0.1
    const sample = (frame: Float32Array, delta: number) => {
      const result = gate.analyze(frame, rate, delta)
      return previewStatus(result, threshold, meter.sample(result.voiced ? result.rms : 0, delta))
    }
    expect(sample(new Float32Array(frameSize), 0.1)).toBe('音量不足')
    expect(sample(noise(), 0.1)).toBe('声候補なし')
    expect(sample(harmonics(), 0.1)).toBe('声候補あり・0.3秒待ち')
    expect(sample(harmonics(), 0.1)).toBe('声候補あり・0.3秒待ち')
    expect(sample(harmonics(), 0.1)).toBe('減点候補')
    expect(sample(new Float32Array(frameSize), 0.1)).toBe('音量不足')
    expect(sample(harmonics(), 0.1)).toBe('声候補あり・0.3秒待ち')
    threshold = 0.5
    gate.reset()
    meter = new ScreamMeter(threshold)
    expect(sample(harmonics(), 0.3)).toBe('音量不足')
    threshold = 0.1
    gate.reset()
    meter = new ScreamMeter(threshold)
    expect(sample(harmonics(), 0.2)).toBe('声候補あり・0.3秒待ち')
    gate.reset()
    meter.reset()
    expect(sample(harmonics(), 0.1)).toBe('声候補あり・0.3秒待ち')
  })
})

describe('voice health synchronization', () => {
  const valid = { mic: true, rms: 0.3, voiced: true, threshold: 0.2, challenge: 5, phase: 'round1', playing: true }

  test('rejects malformed or out-of-range values', () => {
    for (const changes of [
      { rms: NaN },
      { rms: -0.1 },
      { rms: 1.1 },
      { voiced: 1 },
      { mic: 'true' },
      { threshold: Infinity },
      { threshold: 0.01 },
      { threshold: 0.51 },
      { challenge: -1 },
      { challenge: 1.5 },
      { challenge: Number.MAX_SAFE_INTEGER + 1 },
      { phase: 'wrong' },
      { playing: 1 }
    ])
      expect(parseVoiceHealth({ ...valid, ...changes })).toBeUndefined()
    expect(parseVoiceHealth(valid)).toEqual(valid)
  })

  test('rejects old challenges and changed locked thresholds', () => {
    const health = parseVoiceHealth(valid)!
    expect(isFreshVoiceHealth(health, 'host', 0, 1000, 1500, 0.2)).toBe(true)
    expect(isFreshVoiceHealth(health, 'host', 0, 1000, 1501, 0.2)).toBe(false)
    expect(isFreshVoiceHealth(health, 'host', 0, undefined, 1000, 0.2)).toBe(false)
    expect(isFreshVoiceHealth(health, 'host', 0, 1000, 999, 0.2)).toBe(false)
    expect(isFreshVoiceHealth(health, 'guest', 4, undefined, 1000, undefined)).toBe(true)
    expect(isFreshVoiceHealth(health, 'guest', 5, undefined, 1000, 0.2)).toBe(false)
    expect(isFreshVoiceHealth(health, 'guest', 4, undefined, 1000, 0.1)).toBe(false)
  })

  test('does not carry voice across rounds, pauses, microphone loss, or a new challenge', () => {
    expect(isCurrentVoice(valid, 'round1', 5)).toBe(true)
    expect(isCurrentVoice(valid, 'round2', 5)).toBe(false)
    expect(isCurrentVoice({ ...valid, playing: false }, 'round1', 5)).toBe(false)
    expect(isCurrentVoice({ ...valid, mic: false }, 'round1', 5)).toBe(false)
    expect(isCurrentVoice(valid, 'round1', 6)).toBe(false)
  })

  test('voice gate and each survivor threshold determine penalties after reset', () => {
    const gate = new VoiceGate()
    const voice = gate.analyze(harmonics(), rate, 0.05)
    expect(voice.rms).toBeGreaterThan(0.2)
    const host = new ScreamMeter(0.2)
    const guest = new ScreamMeter(0.4)
    expect(host.sample(voice.voiced ? voice.rms : 0, 0.3)).toBeGreaterThan(0)
    expect(guest.sample(voice.voiced ? voice.rms : 0, 0.3)).toBe(0)
    host.reset()
    gate.reset()
    const unvoiced = gate.analyze(noise(), rate, 0.2)
    expect(host.sample(unvoiced.voiced ? unvoiced.rms : 0, 0.2)).toBe(0)
    expect(host.sample(voice.rms, 0.1)).toBe(0)
  })
})
