import { constants, closeSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ScreamMeter } from '../src/match.ts'
import { VoiceGate } from '../src/voice.ts'

const LABELS = ['scream', 'speech', 'noise', 'silence'] as const
const WINDOW_SIZE = 8192
const FRAME_HZ = 60
const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_WAV_BYTES = 4 * 1024 * 1024
const MAX_CLIPS = 100
const MAX_CLIP_SECONDS = 10
const MAX_TOTAL_SECONDS = 60
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const ERROR = 'voice-eval: invalid or unavailable local input\n'

type Label = (typeof LABELS)[number]
interface Manifest {
  version: 1
  consentConfirmed: true
  usageRightsConfirmed: true
  validFrom: string
  expiresAt: string
  threshold: number
  clips: { path: string; label: Label }[]
}

function invalid(): never {
  throw new Error('Invalid evaluation input')
}

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string') invalid()
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) invalid()
  return time
}

function checkThreshold(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.02 || value > 0.5) invalid()
}

function checkPath(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    /[\x00-\x1f\x7f]/.test(value) ||
    /^[\\/]{2}/.test(value) ||
    (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value))
  )
    invalid()
}

export function parseManifest(text: string, now = Date.now()): Manifest {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_MANIFEST_BYTES || !Number.isSafeInteger(now)) invalid()
  const value: unknown = JSON.parse(text)
  if (
    !exactKeys(value, [
      'version',
      'consentConfirmed',
      'usageRightsConfirmed',
      'validFrom',
      'expiresAt',
      'threshold',
      'clips'
    ]) ||
    value.version !== 1 ||
    value.consentConfirmed !== true ||
    value.usageRightsConfirmed !== true ||
    timestamp(value.validFrom) > now ||
    timestamp(value.expiresAt) <= now ||
    !Array.isArray(value.clips) ||
    value.clips.length > MAX_CLIPS
  )
    invalid()
  checkThreshold(value.threshold)
  for (const clip of value.clips) {
    if (!exactKeys(clip, ['path', 'label']) || !LABELS.includes(clip.label as Label)) invalid()
    checkPath(clip.path)
  }
  return value as unknown as Manifest
}

function localFile(path: string, base: string): string {
  checkPath(path)
  const absolute = resolve(base, path)
  checkPath(absolute)
  const actual = realpathSync(absolute)
  checkPath(actual)
  const within = relative(realpathSync(repositoryRoot), actual)
  if (within === '' || (!isAbsolute(within) && within !== '..' && !within.startsWith(`..${sep}`))) invalid()
  return actual
}

function readLimited(path: string, limit: number, check = () => {}): Buffer {
  check()
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
  try {
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0 || stat.size > limit) invalid()
    const bytes = Buffer.alloc(stat.size + 1)
    let used = 0
    while (used < bytes.length) {
      check()
      const count = readSync(descriptor, bytes, used, bytes.length - used, null)
      if (count === 0) break
      used += count
    }
    if (used !== stat.size || fstatSync(descriptor).size !== stat.size) invalid()
    return bytes.subarray(0, used)
  } finally {
    closeSync(descriptor)
  }
}

function checkSampleRate(value: number): void {
  if (!Number.isInteger(value) || value < 8000 || value > 192000) invalid()
}

export function decodeWav(bytes: Buffer): { samples: Float32Array; sampleRate: number } {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 44 ||
    bytes.length > MAX_WAV_BYTES ||
    bytes.toString('latin1', 0, 4) !== 'RIFF' ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    bytes.toString('latin1', 8, 12) !== 'WAVE'
  )
    invalid()
  let sampleRate = 0
  let data: Buffer | undefined
  let offset = 12
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalid()
    const tag = bytes.toString('latin1', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + size
    const paddedEnd = end + (size % 2)
    if (paddedEnd > bytes.length || (size % 2 && bytes[end] !== 0)) invalid()
    if (tag === 'fmt ') {
      if (
        sampleRate !== 0 ||
        size !== 16 ||
        bytes.readUInt16LE(start) !== 1 ||
        bytes.readUInt16LE(start + 2) !== 1 ||
        bytes.readUInt16LE(start + 12) !== 2 ||
        bytes.readUInt16LE(start + 14) !== 16
      )
        invalid()
      sampleRate = bytes.readUInt32LE(start + 4)
      checkSampleRate(sampleRate)
      if (bytes.readUInt32LE(start + 8) !== sampleRate * 2) invalid()
    } else if (tag === 'data') {
      if (sampleRate === 0 || data !== undefined || size === 0 || size % 2 !== 0) invalid()
      data = bytes.subarray(start, end)
    }
    offset = paddedEnd
  }
  if (sampleRate === 0 || data === undefined) invalid()
  const count = data.length / 2
  if (count < Math.ceil(sampleRate * 0.02) || count > sampleRate * MAX_CLIP_SECONDS) invalid()
  const samples = new Float32Array(count)
  for (let index = 0; index < count; index++) samples[index] = data.readInt16LE(index * 2) / 32768
  return { samples, sampleRate }
}

export function evaluatePcm(samples: Float32Array, sampleRate: number, threshold: number): boolean {
  return evaluatePcmWithCheck(samples, sampleRate, threshold)
}

function evaluatePcmWithCheck(samples: Float32Array, sampleRate: number, threshold: number, check = () => {}): boolean {
  check()
  checkSampleRate(sampleRate)
  checkThreshold(threshold)
  if (
    !(samples instanceof Float32Array) ||
    samples.length < Math.ceil(sampleRate * 0.02) ||
    samples.length > sampleRate * MAX_CLIP_SECONDS ||
    samples.some((sample) => !Number.isFinite(sample) || sample < -1 || sample > 1)
  )
    invalid()
  const gate = new VoiceGate()
  const meter = new ScreamMeter(threshold)
  const window = new Float32Array(WINDOW_SIZE)
  const frames = Math.floor((samples.length * FRAME_HZ) / sampleRate)
  let penalized = false
  for (let frame = 1; frame <= frames; frame++) {
    check()
    const end = Math.floor((frame * sampleRate) / FRAME_HZ)
    const start = Math.max(0, end - WINDOW_SIZE)
    window.fill(0)
    window.set(samples.subarray(start, end), WINDOW_SIZE - (end - start))
    const assessment = gate.analyze(window, sampleRate, 1 / FRAME_HZ)
    const points = meter.sample(assessment.voiced ? assessment.rms : 0, 1 / FRAME_HZ)
    if (!Number.isFinite(points) || points < 0) invalid()
    penalized ||= points > 0
  }
  check()
  return penalized
}

export function evaluateManifest(path: string, now?: number) {
  return evaluateLocal(path, now, false)
}

function evaluateLocal(path: string, now: number | undefined, output: boolean) {
  let lastNow = now === undefined ? Date.now() : now
  const manifestPath = localFile(path, process.cwd())
  const manifest = parseManifest(
    new TextDecoder('utf-8', { fatal: true }).decode(readLimited(manifestPath, MAX_MANIFEST_BYTES)),
    lastNow
  )
  const validFrom = timestamp(manifest.validFrom)
  const expiresAt = timestamp(manifest.expiresAt)
  const check = () => {
    const current = now === undefined ? Date.now() : now
    if (!Number.isSafeInteger(current) || current < lastNow || current < validFrom || current >= expiresAt) invalid()
    lastNow = current
  }
  check()
  const labels = Object.fromEntries(
    LABELS.map((label) => [label, { clips: 0, penalized: 0, notPenalized: 0, penaltyRate: null as number | null }])
  ) as Record<Label, { clips: number; penalized: number; notPenalized: number; penaltyRate: number | null }>
  const seen = new Set<string>()
  let seconds = 0
  for (const clip of manifest.clips) {
    check()
    const audioPath = localFile(clip.path, dirname(manifestPath))
    if (seen.has(audioPath)) invalid()
    seen.add(audioPath)
    const bytes = readLimited(audioPath, MAX_WAV_BYTES, check)
    check()
    const { samples, sampleRate } = decodeWav(bytes)
    seconds += samples.length / sampleRate
    if (seconds > MAX_TOTAL_SECONDS) invalid()
    const penalized = evaluatePcmWithCheck(samples, sampleRate, manifest.threshold, check)
    const group = labels[clip.label]
    group.clips++
    if (penalized) group.penalized++
    else group.notPenalized++
    group.penaltyRate = group.penalized / group.clips
  }
  const result = {
    approximation: true,
    windowSamples: WINDOW_SIZE,
    frameHz: FRAME_HZ,
    threshold: manifest.threshold,
    clips: manifest.clips.length,
    labels
  }
  check()
  if (output) {
    const text = `${JSON.stringify(result, null, 2)}\n`
    check()
    process.stdout.write(text)
  }
  return result
}

export function runCli(args: string[]): number {
  try {
    if (args.length !== 1) invalid()
    evaluateLocal(args[0], undefined, true)
    return 0
  } catch {
    process.stderr.write(ERROR)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2))
}
