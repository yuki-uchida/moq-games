import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { VoiceGate } from '../src/voice'
import { ScreamMeter } from '../src/match'
import { decodeWav, evaluateManifest, evaluatePcm, parseManifest, runCli } from '../tools/voice-eval'

const io = vi.hoisted(() => ({
  open: vi.fn(),
  stat: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
  realpath: vi.fn()
}))
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  openSync: io.open,
  fstatSync: io.stat,
  readSync: io.read,
  closeSync: io.close,
  realpathSync: io.realpath
}))

const now = Date.parse('2026-11-04T00:00:00.000Z')
const external = resolve(tmpdir(), 'yoru-voice-eval-memory-only')
const manifestPath = join(external, 'PRIVATE-person-manifest.json')
const cliPath = fileURLToPath(new URL('../tools/voice-eval.ts', import.meta.url))
const files = new Map<string, Buffer>()
const handles = new Map<number, { bytes: Buffer; position: number }>()
const rate = 16000

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    consentConfirmed: true,
    usageRightsConfirmed: true,
    validFrom: '2026-11-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    threshold: 0.1,
    clips: [],
    ...overrides
  }
}

function tone(seconds = 0.4, sampleRate = rate): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * sampleRate) },
    (_, index) => 0.8 * Math.sin((2 * Math.PI * 440 * index) / sampleRate)
  )
}

function noise(): Float32Array {
  let seed = 1
  return Float32Array.from({ length: rate * 0.4 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return (seed / 0x100000000 - 0.5) * 0.8
  })
}

function wav(samples = tone(), sampleRate = rate): Buffer {
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, index) =>
    bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32768))), 44 + index * 2)
  )
  return bytes
}

function riff(chunks: Buffer[]): Buffer {
  const header = Buffer.alloc(12)
  header.write('RIFF')
  header.write('WAVE', 8)
  const bytes = Buffer.concat([header, ...chunks])
  bytes.writeUInt32LE(bytes.length - 8, 4)
  return bytes
}

function install(clips: { path: string; label: string; samples: Float32Array }[] = [], overrides = {}) {
  files.set(
    manifestPath,
    Buffer.from(JSON.stringify(manifest({ clips: clips.map(({ path, label }) => ({ path, label })), ...overrides })))
  )
  for (const clip of clips) files.set(resolve(external, clip.path), wav(clip.samples))
}

describe('manifest policy and privacy-preserving aggregation', () => {
  test('aggregates all four labels using clips, not frames, without writing source data', () => {
    install([
      { path: 'PRIVATE-scream.wav', label: 'scream', samples: tone() },
      { path: 'PRIVATE-short.wav', label: 'scream', samples: tone(0.15) },
      { path: 'PRIVATE-speech.wav', label: 'speech', samples: tone() },
      { path: 'PRIVATE-noise.wav', label: 'noise', samples: noise() },
      { path: 'PRIVATE-silence.wav', label: 'silence', samples: new Float32Array(6400) }
    ])
    const originals = [...files].map(([path, bytes]) => [path, Buffer.from(bytes)] as const)
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    expect(runCli([manifestPath])).toBe(0)
    expect(stdout).toHaveBeenCalledTimes(1)
    expect(stderr).not.toHaveBeenCalled()
    const output = String(stdout.mock.calls[0][0])
    expect(output).not.toContain('PRIVATE')
    expect(output).not.toContain(manifestPath)
    expect(JSON.parse(output)).toEqual({
      approximation: true,
      windowSamples: 8192,
      frameHz: 60,
      threshold: 0.1,
      clips: 5,
      labels: {
        scream: { clips: 2, penalized: 1, notPenalized: 1, penaltyRate: 0.5 },
        speech: { clips: 1, penalized: 1, notPenalized: 0, penaltyRate: 1 },
        noise: { clips: 1, penalized: 0, notPenalized: 1, penaltyRate: 0 },
        silence: { clips: 1, penalized: 0, notPenalized: 1, penaltyRate: 0 }
      }
    })
    expect([...files]).toEqual(originals)
    expect(io.close).toHaveBeenCalledTimes(6)
  })

  test('zero clips and absent labels have undefined rates, not zero', () => {
    install()
    const result = evaluateManifest(manifestPath, now)
    expect(result.clips).toBe(0)
    for (const counts of Object.values(result.labels))
      expect(counts).toEqual({ clips: 0, penalized: 0, notPenalized: 0, penaltyRate: null })
    expect(io.open).toHaveBeenCalledTimes(1)
  })

  test('strictly validates structure, consent, rights, labels, numeric limits and local paths', () => {
    const variants: unknown[] = [
      null,
      [],
      {},
      { ...manifest(), version: 2 },
      ...[false, null, 1, 'true'].flatMap((value) => [
        manifest({ consentConfirmed: value }),
        manifest({ usageRightsConfirmed: value })
      ]),
      ...[null, '0.1', -1, 0.019, 0.501].map((threshold) => manifest({ threshold })),
      manifest({ clips: {} }),
      manifest({ clips: [null] }),
      manifest({ person: 'PRIVATE' }),
      manifest({ clips: [{ path: 'ok.wav', label: 'PRIVATE' }] }),
      manifest({ clips: [{ path: 'ok.wav', label: 'speech', person: 'PRIVATE' }] }),
      manifest({ clips: Array.from({ length: 101 }, () => ({ path: 'ok.wav', label: 'speech' })) }),
      ...[
        '',
        'https://private.invalid/audio.wav',
        'file:///private.wav',
        '//private/audio.wav',
        '\\\\private\\audio.wav',
        '\\\\?\\C:\\private.wav',
        'C:relative.wav',
        'a\u0000.wav'
      ].map((path) => manifest({ clips: [{ path, label: 'speech' }] }))
    ]
    for (const value of variants) expect(() => parseManifest(JSON.stringify(value), now)).toThrow()
    for (const text of ['{', JSON.stringify(manifest()).replace('0.1', '1e999'), ' '.repeat(65537)])
      expect(() => parseManifest(text, now)).toThrow()
    for (const time of [NaN, Infinity, 1.5]) expect(() => parseManifest(JSON.stringify(manifest()), time)).toThrow()
    expect(parseManifest(JSON.stringify(manifest({ threshold: 0.02 })), now).threshold).toBe(0.02)
    expect(parseManifest(JSON.stringify(manifest({ threshold: 0.5 })), now).threshold).toBe(0.5)
  })

  test('validity includes its start but excludes expiry; invalid or normalized dates fail', () => {
    const text = JSON.stringify(manifest())
    const start = Date.parse(manifest().validFrom)
    const end = Date.parse(manifest().expiresAt)
    expect(() => parseManifest(text, start - 1)).toThrow()
    expect(() => parseManifest(text, start)).not.toThrow()
    expect(() => parseManifest(text, end - 1)).not.toThrow()
    expect(() => parseManifest(text, end)).toThrow()
    for (const date of ['2026-02-30T00:00:00.000Z', '2026-11-01', 'invalid', null]) {
      expect(() => parseManifest(JSON.stringify(manifest({ validFrom: date })), now)).toThrow()
    }
    install([{ path: 'must-not-read.wav', label: 'scream', samples: tone() }], {
      expiresAt: '2026-11-04T00:00:00.000Z'
    })
    expect(() => evaluateManifest(manifestPath, now)).toThrow()
    expect(io.open).toHaveBeenCalledTimes(1)
  })

  test('rejects duplicate resolved paths and any file inside the checkout', () => {
    install([{ path: 'same.wav', label: 'scream', samples: tone() }])
    files.set(
      manifestPath,
      Buffer.from(
        JSON.stringify(
          manifest({
            clips: [
              { path: 'same.wav', label: 'scream' },
              { path: './same.wav', label: 'speech' }
            ]
          })
        )
      )
    )
    expect(() => evaluateManifest(manifestPath, now)).toThrow()
    expect(() => evaluateManifest(cliPath, now)).toThrow()
    io.realpath.mockImplementation((path: string) =>
      resolve(path) === join(external, 'same.wav') ? cliPath : resolve(path)
    )
    expect(() => evaluateManifest(manifestPath, now)).toThrow()
    expect(() => evaluateManifest('https://private.invalid/manifest.json', now)).toThrow()
  })

  test('rejects empty, oversized, nonregular, truncated or growing files and invalid UTF-8', () => {
    for (const bytes of [Buffer.alloc(0), Buffer.alloc(65537), Buffer.from([0xc3, 0x28])]) {
      files.set(manifestPath, bytes)
      expect(() => evaluateManifest(manifestPath, now)).toThrow()
    }
    install()
    io.stat.mockReturnValueOnce({ size: files.get(manifestPath)!.length, isFile: () => false })
    expect(() => evaluateManifest(manifestPath, now)).toThrow()
    for (const change of [-1, 1]) {
      io.stat.mockReturnValueOnce({ size: files.get(manifestPath)!.length + change, isFile: () => true })
      expect(() => evaluateManifest(manifestPath, now)).toThrow()
    }
    install([{ path: 'huge.wav', label: 'noise', samples: noise() }])
    files.set(join(external, 'huge.wav'), Buffer.alloc(4 * 1024 * 1024 + 1))
    expect(() => evaluateManifest(manifestPath, now)).toThrow()
    expect(io.close).toHaveBeenCalledTimes(io.open.mock.calls.length)
  })

  test('enforces total duration before evaluating an excess clip', () => {
    install(
      Array.from({ length: 7 }, (_, index) => ({
        path: String(index) + '.wav',
        label: 'silence',
        samples: new Float32Array(rate * 10)
      }))
    )
    expect(() => evaluateManifest(manifestPath, now)).toThrow()
  })

  test('a bad later clip produces only a fixed error, never a partial report or private exception', () => {
    install([
      { path: 'valid.wav', label: 'scream', samples: tone() },
      { path: 'PRIVATE-person.wav', label: 'speech', samples: tone() }
    ])
    files.set(join(external, 'PRIVATE-person.wav'), Buffer.from('PRIVATE corrupted audio'))
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    for (const args of [
      [manifestPath],
      [join(external, 'PRIVATE-missing.json')],
      [],
      [manifestPath, '--output', 'PRIVATE.json']
    ]) {
      expect(runCli(args)).toBe(1)
    }
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr.mock.calls.map(([text]) => text)).toEqual(
      Array(4).fill('voice-eval: invalid or unavailable local input\n')
    )
  })

  test('native Node can load the real TS entry point; missing explicit input fails privately', () => {
    const result = spawnSync(process.execPath, [cliPath], { encoding: 'utf8', timeout: 10000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('voice-eval: invalid or unavailable local input\n')
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  io.close.mockReset()
  files.clear()
  handles.clear()
  io.realpath.mockImplementation((path: string) => resolve(path))
  io.open.mockImplementation((path: string) => {
    const bytes = files.get(path)
    if (!bytes) throw new Error('PRIVATE-person missing: ' + path)
    const descriptor = handles.size + 1
    handles.set(descriptor, { bytes, position: 0 })
    return descriptor
  })
  io.stat.mockImplementation((descriptor: number) => ({
    size: handles.get(descriptor)!.bytes.length,
    isFile: () => true
  }))
  io.read.mockImplementation((descriptor: number, target: Buffer, offset: number, length: number) => {
    const handle = handles.get(descriptor)!
    const count = handle.bytes.copy(target, offset, handle.position, handle.position + Math.min(length, 127))
    handle.position += count
    return count
  })
  vi.spyOn(Date, 'now').mockReturnValue(now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('live validity boundaries', () => {
  test.each(['resolve', 'open', 'read', 'decode', 'frame', 'later clip', 'serialize', 'serialize empty'])(
    'rejects expiry during %s without partial output or input changes',
    (boundary) => {
      install(
        boundary === 'serialize empty'
          ? []
          : ['PRIVATE-first.wav', 'PRIVATE-second.wav'].map((path) => ({
              path,
              label: 'silence',
              samples: new Float32Array(6400)
            }))
      )
      const originals = [...files].map(([path, bytes]) => [path, Buffer.from(bytes)] as const)
      const expires = Date.parse(manifest().expiresAt)
      const expire = () => vi.mocked(Date.now).mockReturnValue(expires + 1)
      if (boundary === 'resolve' || boundary === 'later clip') {
        const original = io.realpath.getMockImplementation()!
        io.realpath.mockImplementation((path: string) => {
          if (path === join(external, boundary === 'resolve' ? 'PRIVATE-first.wav' : 'PRIVATE-second.wav')) expire()
          return original(path)
        })
      } else if (boundary === 'open' || boundary === 'read') {
        const operation = boundary === 'open' ? io.open : io.read
        const original = operation.getMockImplementation()!
        operation.mockImplementation((...args: unknown[]) => {
          if (boundary === 'open' ? args[0] === join(external, 'PRIVATE-first.wav') : args[0] === 2) expire()
          return original(...args)
        })
      } else if (boundary === 'decode') {
        const original = Buffer.prototype.readInt16LE
        vi.spyOn(Buffer.prototype, 'readInt16LE').mockImplementation(function (this: Buffer, offset) {
          expire()
          return original.call(this, offset)
        })
      } else if (boundary === 'frame') {
        const original = VoiceGate.prototype.analyze
        vi.spyOn(VoiceGate.prototype, 'analyze').mockImplementation(function (this: VoiceGate, ...args) {
          expire()
          return original.apply(this, args)
        })
      } else {
        const original = JSON.stringify
        vi.spyOn(JSON, 'stringify').mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
          expire()
          return original(...args)
        })
      }
      const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      expect(runCli([manifestPath])).toBe(1)
      expect(stdout).not.toHaveBeenCalled()
      expect(stderr).toHaveBeenCalledExactlyOnceWith('voice-eval: invalid or unavailable local input\n')
      expect([...files]).toEqual(originals)
      expect(io.close).toHaveBeenCalledTimes(io.open.mock.calls.length)
      if (boundary === 'resolve') expect(io.open).toHaveBeenCalledTimes(1)
      if (boundary === 'frame') expect(VoiceGate.prototype.analyze).toHaveBeenCalledTimes(1)
    }
  )

  test.each([-1, 0, 1])('checks live expiry offset %s after reading even with no clips', (offset) => {
    install()
    const expires = Date.parse(manifest().expiresAt)
    const original = io.close.getMockImplementation()
    io.close.mockImplementation((...args: unknown[]) => {
      vi.mocked(Date.now).mockReturnValue(expires + offset)
      return original?.(...args)
    })
    if (offset < 0) expect(evaluateManifest(manifestPath).clips).toBe(0)
    else expect(() => evaluateManifest(manifestPath)).toThrow('Invalid evaluation input')
  })

  test.each([
    now - 1,
    -Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    -Infinity,
    1.5
  ])('fails closed on a backward or invalid live clock %s', (time) => {
    install()
    vi.mocked(Date.now).mockReturnValueOnce(now).mockReturnValue(time)
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    expect(runCli([manifestPath])).toBe(1)
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).toHaveBeenCalledExactlyOnceWith('voice-eval: invalid or unavailable local input\n')
  })

  test('keeps explicit numeric time deterministic without consulting the live clock', () => {
    install([{ path: 'PRIVATE-synthetic.wav', label: 'silence', samples: new Float32Array(6400) }])
    vi.mocked(Date.now).mockImplementation(() => {
      throw new Error('PRIVATE clock unavailable')
    })
    expect(evaluateManifest(manifestPath, now).clips).toBe(1)
    expect(Date.now).not.toHaveBeenCalled()
    expect(() => evaluateManifest(manifestPath)).toThrow('PRIVATE clock unavailable')
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    expect(runCli([manifestPath])).toBe(1)
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).toHaveBeenCalledExactlyOnceWith('voice-eval: invalid or unavailable local input\n')
  })

  test('rechecks the live API after opening a WAV while keeping the numeric API frozen', () => {
    install([{ path: 'PRIVATE-synthetic.wav', label: 'silence', samples: new Float32Array(6400) }])
    const original = io.open.getMockImplementation()!
    io.open.mockImplementation((path: string) => {
      if (path.endsWith('.wav')) vi.mocked(Date.now).mockReturnValue(Date.parse(manifest().expiresAt) + 1)
      return original(path)
    })
    expect(() => evaluateManifest(manifestPath)).toThrow('Invalid evaluation input')
    expect(vi.mocked(Date.now).mock.calls.length).toBeGreaterThan(1)
    expect(evaluateManifest(manifestPath, now).clips).toBe(1)
    expect(io.close).toHaveBeenCalledTimes(io.open.mock.calls.length)
  })
})

describe('real Node process and synthetic temporary files', () => {
  test('aggregates privately, rejects invalid inputs without partial output and preserves every input byte', async () => {
    vi.mocked(Date.now).mockRestore()
    const current = Date.now()
    const temporaryRoot = await realpath(tmpdir())
    const directory = await mkdtemp(join(temporaryRoot, 'yoru-voice-eval-real-'))
    try {
      const clips = [
        { path: 'PRIVATE-scream.wav', label: 'scream', samples: tone() },
        { path: 'PRIVATE-short.wav', label: 'scream', samples: tone(0.15) },
        { path: 'PRIVATE-speech.wav', label: 'speech', samples: tone() },
        { path: 'PRIVATE-noise.wav', label: 'noise', samples: noise() },
        { path: 'PRIVATE-silence.wav', label: 'silence', samples: new Float32Array(6400) }
      ]
      const valid = manifest({
        validFrom: new Date(current - 86400000).toISOString(),
        expiresAt: new Date(current + 86400000).toISOString(),
        clips: clips.map(({ path, label }) => ({ path, label }))
      })
      const fixtures = new Map(clips.map(({ path, samples }) => [path, wav(samples)]))
      fixtures.set('PRIVATE-manifest.json', Buffer.from(JSON.stringify(valid)))
      fixtures.set('PRIVATE-corrupt.wav', Buffer.from('PRIVATE invalid synthetic WAV'))
      fixtures.set(
        'PRIVATE-later-invalid.json',
        Buffer.from(
          JSON.stringify({
            ...valid,
            clips: [valid.clips[0], { path: 'PRIVATE-corrupt.wav', label: 'speech' }]
          })
        )
      )
      fixtures.set(
        'PRIVATE-expired.json',
        Buffer.from(JSON.stringify({ ...valid, expiresAt: new Date(current - 60000).toISOString() }))
      )
      for (const [name, bytes] of fixtures) await writeFile(join(directory, name), bytes, { flag: 'wx' })

      for (const name of [
        'PRIVATE-manifest.json',
        'PRIVATE-later-invalid.json',
        'PRIVATE-expired.json',
        'PRIVATE-missing.json'
      ]) {
        const result = spawnSync(process.execPath, [cliPath, join(directory, name)], {
          encoding: 'utf8',
          timeout: 10000
        })
        expect(result.error).toBeUndefined()
        expect(result.signal).toBeNull()
        if (name === 'PRIVATE-manifest.json') {
          expect(result.status).toBe(0)
          expect(result.stderr).toBe('')
          expect(result.stdout).not.toContain('PRIVATE')
          expect(result.stdout).not.toContain(directory)
          expect(JSON.parse(result.stdout)).toEqual({
            approximation: true,
            windowSamples: 8192,
            frameHz: 60,
            threshold: 0.1,
            clips: 5,
            labels: {
              scream: { clips: 2, penalized: 1, notPenalized: 1, penaltyRate: 0.5 },
              speech: { clips: 1, penalized: 1, notPenalized: 0, penaltyRate: 1 },
              noise: { clips: 1, penalized: 0, notPenalized: 1, penaltyRate: 0 },
              silence: { clips: 1, penalized: 0, notPenalized: 1, penaltyRate: 0 }
            }
          })
        } else {
          expect(result.status).toBe(1)
          expect(result.stdout).toBe('')
          expect(result.stderr).toBe('voice-eval: invalid or unavailable local input\n')
        }
        expect((await readdir(directory)).sort()).toEqual([...fixtures.keys()].sort())
        for (const [name, bytes] of fixtures) expect(await readFile(join(directory, name))).toEqual(bytes)
      }
      for (const boundary of ['open', 'serialize', 'clock throws']) {
        const result = spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `
              import fs from 'node:fs'
              import { syncBuiltinESMExports } from 'node:module'
              import { pathToFileURL } from 'node:url'
              const [cli, input, boundary] = process.argv.slice(1)
              process.argv[1] = 'voice-eval-synthetic-harness'
              const manifest = JSON.parse(fs.readFileSync(input, 'utf8'))
              let now = Date.parse(manifest.validFrom)
              let calls = 0
              Date.now = () => {
                if (boundary === 'clock throws' && calls++ > 0) throw new Error('PRIVATE clock failure')
                return now
              }
              const open = fs.openSync
              fs.openSync = (path, ...args) => {
                const descriptor = open(path, ...args)
                if (boundary === 'open' && String(path).endsWith('.wav')) now = Date.parse(manifest.expiresAt) + 1
                return descriptor
              }
              const stringify = JSON.stringify
              JSON.stringify = (...args) => {
                const text = stringify(...args)
                if (boundary === 'serialize') now = Date.parse(manifest.expiresAt)
                return text
              }
              syncBuiltinESMExports()
              const { runCli } = await import(pathToFileURL(cli).href)
              process.exitCode = runCli([input])
            `,
            cliPath,
            join(directory, 'PRIVATE-manifest.json'),
            boundary
          ],
          { encoding: 'utf8', timeout: 10000 }
        )
        expect(result.error).toBeUndefined()
        expect(result.signal).toBeNull()
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe('voice-eval: invalid or unavailable local input\n')
        expect((await readdir(directory)).sort()).toEqual([...fixtures.keys()].sort())
        for (const [name, bytes] of fixtures) expect(await readFile(join(directory, name))).toEqual(bytes)
      }
    } finally {
      expect(await realpath(directory)).toBe(resolve(directory))
      expect(dirname(directory)).toBe(temporaryRoot)
      expect(basename(directory)).toMatch(/^yoru-voice-eval-real-[a-zA-Z0-9]{6}$/)
      await rm(directory, { recursive: true })
    }
  })
})

describe('actual game gate and meter at a declared 60 Hz', () => {
  test.each([0.28, 0.2999375, 0.3, 0.32])('0.3 second boundary, duration %s', (seconds) => {
    expect(evaluatePcm(tone(seconds), rate, 0.1)).toBe(seconds >= 0.3)
  })

  test('uses real APIs with 8192 trailing samples and 1/60 deltas, without changing the input', () => {
    const samples = tone(0.4, 44100)
    const original = samples.slice()
    const analyze = vi.spyOn(VoiceGate.prototype, 'analyze')
    const sample = vi.spyOn(ScreamMeter.prototype, 'sample')
    evaluatePcm(samples, 44100, 0.1)
    expect(analyze).toHaveBeenCalledTimes(24)
    expect(sample).toHaveBeenCalledTimes(24)
    for (const [window, sampleRate, delta] of analyze.mock.calls) {
      expect(window).toHaveLength(8192)
      expect(sampleRate).toBe(44100)
      expect(delta).toBe(1 / 60)
    }
    expect(sample.mock.calls.every(([, delta]) => delta === 1 / 60)).toBe(true)
    expect(samples).toEqual(original)
    const end = Math.floor((24 * 44100) / 60)
    expect(analyze.mock.calls.at(-1)![0]).toEqual(samples.slice(end - 8192, end))
  })

  test('honors the explicit threshold and resets states for every clip', () => {
    expect(evaluatePcm(tone(), rate, 0.1)).toBe(true)
    expect(evaluatePcm(tone(0.15), rate, 0.1)).toBe(false)
    expect(evaluatePcm(tone(0.15), rate, 0.1)).toBe(false)
    const quiet = tone().map((sample) => sample * 0.2)
    expect(evaluatePcm(quiet, rate, 0.02)).toBe(true)
    expect(evaluatePcm(quiet, rate, 0.5)).toBe(false)
    expect(evaluatePcm(noise(), rate, 0.1)).toBe(false)
    expect(evaluatePcm(new Float32Array(rate * 0.4), rate, 0.1)).toBe(false)
  })

  test.each([NaN, Infinity, -Infinity, 1.01, -1.01])(
    'rejects invalid PCM samples even outside the sampled tail: %s',
    (value) => {
      const samples = tone()
      samples[0] = value
      expect(() => evaluatePcm(samples, rate, 0.1)).toThrow()
    }
  )

  test('rejects invalid rates, thresholds, lengths and array types', () => {
    for (const invalid of [NaN, Infinity, 7999, 192001, 16000.5])
      expect(() => evaluatePcm(tone(), invalid, 0.1)).toThrow()
    for (const invalid of [NaN, Infinity, -1, 0, 0.019, 0.501])
      expect(() => evaluatePcm(tone(), rate, invalid)).toThrow()
    for (const invalid of [
      new Float32Array(),
      new Float32Array(319),
      new Float32Array(160001),
      new Float64Array(6400)
    ]) {
      expect(() => evaluatePcm(invalid as Float32Array, rate, 0.1)).toThrow()
    }
  })
})

describe('strict RIFF / mono PCM16 decoding', () => {
  test.each([8000, 16000, 44100, 48000, 96000, 192000])(
    'decodes supported rate %s without modifying bytes',
    (sampleRate) => {
      const bytes = wav(tone(0.02, sampleRate), sampleRate)
      const before = Buffer.from(bytes)
      const decoded = decodeWav(bytes)
      expect(decoded.sampleRate).toBe(sampleRate)
      expect(decoded.samples.length).toBe(Math.round(sampleRate * 0.02))
      expect(bytes).toEqual(before)
    }
  )

  test('decodes signed endpoints and bounded ancillary chunks', () => {
    const samples = tone()
    samples.set([-1, 0, 1])
    const base = wav(samples)
    const metadata = Buffer.alloc(10)
    metadata.write('JUNK')
    metadata.writeUInt32LE(1, 4)
    metadata[8] = 99
    expect(decodeWav(riff([base.subarray(12, 36), metadata, base.subarray(36)])).samples.slice(0, 3)).toEqual(
      new Float32Array([-1, 0, 32767 / 32768])
    )
    metadata[9] = 1
    expect(() => decodeWav(riff([base.subarray(12, 36), metadata, base.subarray(36)]))).toThrow()
  })

  test('rejects malformed headers, unsupported formats and inconsistent lengths', () => {
    const mutations: ((bytes: Buffer) => void)[] = [
      (bytes) => {
        bytes[0] |= 0x80
      },
      (bytes) => {
        bytes.write('RF64')
      },
      (bytes) => {
        bytes.write('RIFX')
      },
      (bytes) => {
        bytes.write('AVI ', 8)
      },
      (bytes) => {
        bytes.writeUInt32LE(0, 4)
      },
      (bytes) => {
        bytes.writeUInt32LE(18, 16)
      },
      (bytes) => {
        bytes.writeUInt16LE(3, 20)
      },
      (bytes) => {
        bytes.writeUInt16LE(0xfffe, 20)
      },
      (bytes) => {
        bytes.writeUInt16LE(2, 22)
      },
      (bytes) => {
        bytes.writeUInt32LE(7999, 24)
      },
      (bytes) => {
        bytes.writeUInt32LE(192001, 24)
      },
      (bytes) => {
        bytes.writeUInt32LE(1, 28)
      },
      (bytes) => {
        bytes.writeUInt16LE(4, 32)
      },
      (bytes) => {
        bytes.writeUInt16LE(32, 34)
      },
      (bytes) => {
        bytes.writeUInt32LE(0xffffffff, 40)
      },
      (bytes) => {
        bytes.writeUInt32LE(0, 40)
      },
      (bytes) => {
        bytes.writeUInt32LE(bytes.length - 45, 40)
      }
    ]
    for (const mutate of mutations) {
      const bytes = wav()
      mutate(bytes)
      expect(() => decodeWav(bytes)).toThrow()
    }
    for (const bytes of [
      Buffer.alloc(0),
      wav().subarray(0, 43),
      wav(new Float32Array(319)),
      wav(new Float32Array(160001)),
      Buffer.alloc(4 * 1024 * 1024 + 1)
    ]) {
      expect(() => decodeWav(bytes)).toThrow()
    }
  })

  test('rejects missing, reordered or duplicate chunks and unaccounted trailing bytes', () => {
    const base = wav()
    const format = base.subarray(12, 36)
    const data = base.subarray(36)
    for (const chunks of [
      [format],
      [data],
      [data, format],
      [format, format, data],
      [format, data, data],
      [format, data, Buffer.alloc(1)]
    ]) {
      expect(() => decodeWav(riff(chunks))).toThrow()
    }
    const oddWithoutPadding = Buffer.alloc(9)
    oddWithoutPadding.write('JUNK')
    oddWithoutPadding.writeUInt32LE(1, 4)
    expect(() => decodeWav(riff([format, data, oddWithoutPadding]))).toThrow()
  })
})
