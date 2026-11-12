/**
 * Renders and measures every sound of ANIMA FRONT offline, so the numbers can do the listening.
 *
 * Usage: node scripts/anima-front-audio.mjs [--write] [--songs] [--loops] [--only name,name]
 *   (no flag)  render every effect through the real AudioEngine with the current trims; write the WAVs and the
 *              report under .build/anima-front-audio/ (sfx/<name>.wav, report.md)
 *   --write    also fit the loudness trims (src/audio/sfx-trim.ts) and write src/audio/sfx-metrics.json
 *   --songs    also render the first 40 s of every theme at layers 0-2 (music/<theme>-<layer>.wav) and report them
 *   --loops    also render 6 s of every sustained loop (loops/<name>.wav) and report level, steadiness and peak
 *              Effects without a stored trim are fitted in memory (never written) so the numbers are comparable.
 *   --only     restrict the effect pass to the listed names (never combine with --write)
 *
 * Environment: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH selects the Chromium binary. Exits non-zero on any page error.
 *
 * Method. A Vite dev server serves the game's audio modules to headless Chromium. Each effect is rendered alone in
 * a stereo 44.1 kHz OfflineAudioContext through `AudioEngine(ctx, false)` (mixer, reverb, limiter and soft clipper
 * included) with Math.random pinned to 0.5, which switches the pitch variation off. Measures, per effect:
 *   seconds    end of the last 10 ms block whose peak is above -60 dBFS (0.001)
 *   peak       largest absolute sample of either channel
 *   rmsDb      RMS over the active part (first sample above -60 dBFS .. seconds), dBFS
 *   loudness   K-weighting-like loudness in dB: each channel goes through a 2nd-order high-pass (100 Hz, Q 0.707)
 *              and an RBJ high shelf (+4 dB at 1.5 kHz, Q 0.707); e[n] = kL[n]^2 + kR[n]^2;
 *              loudness = 10*log10( max over 100 ms windows (10 ms hop) of mean(e) ). The window maximum, not
 *              the whole-clip mean, so short and long effects are comparable.
 *   loudnessNorm  the same with the definition's own gain `g` set to 1; this is what the trim equalises to
 *              REFERENCE_DB, so the hierarchy of the mix comes from `g` alone.
 *   centroid   spectral centroid (Hz) of the active part (FFT, last 10 % faded out)
 *   bands      energy shares of <200, 200-1000, 1000-4000, 4000-8000 and >8000 Hz
 *   attack     seconds from the onset to the first sample at 90 % of the peak
 *   fingerprint 8 equal time slices of the active part x 6 bands (edges 150, 400, 1000, 2500, 6000 Hz); each
 *              value is sqrt(share of the whole energy), so the vector has unit length and the Euclidean distance
 *              between two fingerprints lies in 0..sqrt(2).
 */
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { createServer as createNetServer } from 'node:net'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gameDir = join(root, 'examples/games/anima-front')
const outDir = join(root, '.build/anima-front/audio')

const SAMPLE_RATE = 44100
const SFX_SECONDS = 4
const FIT_SECONDS = 2
const SONG_SECONDS = 40
const REFERENCE_DB = -17
const BAND_EDGES = [200, 1000, 4000, 8000]
const FP_EDGES = [150, 400, 1000, 2500, 6000]
const FP_SLICES = 8
const FLOOR = 0.001
/** General limits flagged in the report (the per-effect limits live in tests/audio-sfx.test.ts). */
const LIMITS = { peak: 0.95, highShare: 0.6, normTolerance: 1.5, minFingerprintDistance: 0.2, maxSeconds: 1.8 }

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const write = flag('--write')
const songs = flag('--songs')
const loopsFlag = flag('--loops') || flag('--write')
const onlyArg = args.indexOf('--only')
const only = onlyArg >= 0 ? new Set(args[onlyArg + 1].split(',')) : null
if (write && only) {
  console.error('--only cannot be combined with --write')
  process.exit(2)
}

/* ------------------------------------------------------------------------------------------ analysis */

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9))

function biquad(b0, b1, b2, a0, a1, a2) {
  const nb0 = b0 / a0
  const nb1 = b1 / a0
  const nb2 = b2 / a0
  const na1 = a1 / a0
  const na2 = a2 / a0
  return (x) => {
    const y = new Float64Array(x.length)
    let x1 = 0
    let x2 = 0
    let y1 = 0
    let y2 = 0
    for (let i = 0; i < x.length; i++) {
      const v = nb0 * x[i] + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2
      x2 = x1
      x1 = x[i]
      y2 = y1
      y1 = v
      y[i] = v
    }
    return y
  }
}

function highpass(f0, q) {
  const w = (2 * Math.PI * f0) / SAMPLE_RATE
  const c = Math.cos(w)
  const al = Math.sin(w) / (2 * q)
  return biquad((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al)
}

function highshelf(f0, q, gainDb) {
  const A = Math.pow(10, gainDb / 40)
  const w = (2 * Math.PI * f0) / SAMPLE_RATE
  const c = Math.cos(w)
  const s = Math.sin(w)
  const al = s / (2 * q)
  const k = 2 * Math.sqrt(A) * al
  return biquad(
    A * (A + 1 + (A - 1) * c + k),
    -2 * A * (A - 1 + (A + 1) * c),
    A * (A + 1 + (A - 1) * c - k),
    A + 1 - (A - 1) * c + k,
    2 * (A - 1 - (A + 1) * c),
    A + 1 - (A - 1) * c - k
  )
}

function kWeight(x) {
  return highshelf(1500, 0.707, 4)(highpass(100, 0.707)(x))
}

/** Loudness (dB) of a stereo clip: window maximum and whole-clip mean of the K-weighted energy. */
function loudness(l, r) {
  const kl = kWeight(l)
  const kr = kWeight(r)
  const n = l.length
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + kl[i] * kl[i] + kr[i] * kr[i]
  const win = Math.min(n, Math.round(SAMPLE_RATE * 0.1))
  const hop = Math.round(SAMPLE_RATE * 0.01)
  let best = 0
  for (let s = 0; s + win <= n; s += hop) best = Math.max(best, (prefix[s + win] - prefix[s]) / win)
  if (n < win) best = prefix[n] / Math.max(1, n)
  return { max: 10 * Math.log10(best + 1e-12), mean: 10 * Math.log10(prefix[n] / Math.max(1, n) + 1e-12) }
}

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

/** Power per bin of a mono segment (last 10 % faded out), zero-padded to a power of two of at least `min`. */
function powerSpectrum(seg, min) {
  let size = Math.max(min, 2)
  while (size < seg.length) size <<= 1
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  const fade = Math.max(1, Math.floor(seg.length * 0.1))
  for (let i = 0; i < seg.length; i++) {
    const rem = seg.length - 1 - i
    re[i] = seg[i] * (rem < fade ? 0.5 - 0.5 * Math.cos((Math.PI * rem) / fade) : 1)
  }
  fft(re, im)
  const p = new Float64Array(size / 2)
  for (let i = 0; i < p.length; i++) p[i] = re[i] * re[i] + im[i] * im[i]
  return { p, hz: SAMPLE_RATE / size }
}

function bandShares(p, hz, edges) {
  const e = new Float64Array(edges.length + 1)
  for (let i = 1; i < p.length; i++) {
    const f = i * hz
    let b = 0
    while (b < edges.length && f >= edges[b]) b++
    e[b] += p[i]
  }
  const total = e.reduce((a, b) => a + b, 0) || 1
  return Array.from(e, (x) => x / total)
}

function analyse(l, r) {
  const n = l.length
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]))
  let onset = -1
  let last = -1
  const block = Math.round(SAMPLE_RATE * 0.01)
  for (let s = 0; s < n; s += block) {
    let m = 0
    for (let i = s; i < Math.min(n, s + block); i++) m = Math.max(m, Math.abs(l[i]), Math.abs(r[i]))
    if (m > FLOOR) {
      if (onset < 0) {
        onset = s
        for (let i = s; i < Math.min(n, s + block); i++)
          if (Math.max(Math.abs(l[i]), Math.abs(r[i])) > FLOOR) {
            onset = i
            break
          }
      }
      last = Math.min(n, s + block)
    }
  }
  if (onset < 0) return { silent: true, peak, seconds: 0 }
  const cut = last >= n - block // still audible when the render ended
  const seconds = last / SAMPLE_RATE
  const len = Math.max(64, last - onset)
  const mono = new Float64Array(len)
  let sq = 0
  for (let i = 0; i < len; i++) {
    const a = l[onset + i] ?? 0
    const b = r[onset + i] ?? 0
    mono[i] = (a + b) / 2
    sq += a * a + b * b
  }
  const rmsDb = db(Math.sqrt(sq / (2 * len)))
  let attackAt = onset
  for (let i = onset; i < n; i++)
    if (Math.max(Math.abs(l[i]), Math.abs(r[i])) >= 0.9 * peak) {
      attackAt = i
      break
    }
  const { p, hz } = powerSpectrum(mono, 1024)
  let num = 0
  let den = 0
  for (let i = 1; i < p.length; i++) {
    num += i * hz * p[i]
    den += p[i]
  }
  const bands = bandShares(p, hz, BAND_EDGES)
  const fp = []
  const sliceLen = Math.max(1, Math.floor(len / FP_SLICES))
  for (let s = 0; s < FP_SLICES; s++) {
    const seg = mono.subarray(s * sliceLen, Math.min(len, (s + 1) * sliceLen))
    const sp = powerSpectrum(seg, 512)
    const e = new Float64Array(FP_EDGES.length + 1)
    for (let i = 1; i < sp.p.length; i++) {
      let b = 0
      while (b < FP_EDGES.length && i * sp.hz >= FP_EDGES[b]) b++
      e[b] += sp.p[i]
    }
    fp.push(...e)
  }
  // Slices are weighted by their true energy, so compare on the energy of the time-domain slice, not the padded FFT.
  const weights = []
  for (let s = 0; s < FP_SLICES; s++) {
    let en = 0
    for (let i = s * sliceLen; i < Math.min(len, (s + 1) * sliceLen); i++) en += mono[i] * mono[i]
    weights.push(en)
  }
  const fpOut = []
  for (let s = 0; s < FP_SLICES; s++) {
    const row = fp.slice(s * 6, s * 6 + 6)
    const rs = row.reduce((a, b) => a + b, 0) || 1
    for (const v of row) fpOut.push((v / rs) * weights[s])
  }
  const total = fpOut.reduce((a, b) => a + b, 0) || 1
  const fingerprint = fpOut.map((v) => Math.sqrt(v / total))
  return {
    silent: false,
    cut,
    peak,
    seconds,
    rmsDb,
    centroid: num / (den || 1),
    bands,
    attack: Math.max(0, (attackAt - onset) / SAMPLE_RATE),
    fingerprint
  }
}

const distance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0))
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d

/* ---------------------------------------------------------------------------------------------- wav */

function decodePcm(base64) {
  const bytes = Buffer.from(base64, 'base64')
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2)
  const frames = pcm.length / 2
  const l = new Float32Array(frames)
  const r = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    l[i] = pcm[i * 2] / 32768
    r[i] = pcm[i * 2 + 1] / 32768
  }
  return { l, r, bytes }
}

function wavFile(bytes) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + bytes.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(bytes.length, 40)
  return Buffer.concat([header, bytes])
}

/* ------------------------------------------------------------------------------------------- browser */

/** Runs in the page: loads the audio modules and exposes the renderers. */
async function pageSetup() {
  Math.random = () => 0.5
  const [api, engine, sfx, trim, hash, songMod, loopMod] = await Promise.all([
    import('/src/audio/api.ts'),
    import('/src/audio/engine.ts'),
    import('/src/audio/sfx.ts'),
    import('/src/audio/sfx-trim.ts'),
    import('/src/audio/sfx-hash.ts'),
    import('/src/audio/songs/index.ts'),
    import('/src/audio/sfx/loops.ts')
  ])
  const toBase64 = (buf) => {
    const l = buf.getChannelData(0)
    const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l
    const pcm = new Int16Array(l.length * 2)
    const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32768)))
    for (let i = 0; i < l.length; i++) {
      pcm[i * 2] = q(l[i])
      pcm[i * 2 + 1] = q(r[i])
    }
    const u8 = new Uint8Array(pcm.buffer)
    let s = ''
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
    return btoa(s)
  }
  window.__audio = {
    names: [...api.SFX],
    themes: [...api.THEMES],
    layered: api.THEMES.filter((t) => songMod.SONGS[t].parts.some((p) => (p.layer ?? 0) > 0)),
    pending: sfx.pendingSfx(),
    info: Object.fromEntries(
      api.SFX.map((n) => {
        const d = sfx.SFX_DEFS[n]
        return [n, { g: d.g, limit: d.limit, cd: d.cd, hash: hash.sfxHash(d) }]
      })
    ),
    trims: { ...trim.SFX_TRIM },
    async renderSfx(name, o) {
      const def = sfx.SFX_DEFS[name]
      const oldG = def.g
      const had = Object.prototype.hasOwnProperty.call(trim.SFX_TRIM, name)
      const oldTrim = trim.SFX_TRIM[name]
      if (o.unit) def.g = 1
      if (o.trim === null) delete trim.SFX_TRIM[name]
      else if (o.trim !== undefined) trim.SFX_TRIM[name] = o.trim
      try {
        const ctx = new OfflineAudioContext(2, Math.round(o.seconds * 44100), 44100)
        const eng = new engine.AudioEngine(ctx, false)
        eng.sfx(name, {}, 0)
        return toBase64(await ctx.startRendering())
      } finally {
        def.g = oldG
        if (had) trim.SFX_TRIM[name] = oldTrim
        else delete trim.SFX_TRIM[name]
      }
    },
    loopNames: [...api.LOOPS],
    loopHashes: Object.fromEntries(
      api.LOOPS.map((n) => [n, loopMod.LOOP_DEFS[n] ? hash.loopHash(loopMod.LOOP_DEFS[n]) : null])
    ),
    songInfo: Object.fromEntries(
      api.THEMES.map((t) => [
        t,
        { once: !!songMod.SONGS[t].once, bpm: songMod.SONGS[t].bpm, gain: songMod.SONGS[t].gain }
      ])
    ),
    async renderLoop(name, seconds, progress) {
      const ctx = new OfflineAudioContext(2, Math.round(seconds * 44100), 44100)
      const eng = new engine.AudioEngine(ctx, false)
      eng.loop('probe', name, { progress })
      return toBase64(await ctx.startRendering())
    },
    async renderSong(theme, layer, seconds) {
      const ctx = new OfflineAudioContext(2, Math.round(seconds * 44100), 44100)
      const eng = new engine.AudioEngine(ctx, false)
      eng.setMusic(theme, layer, 0)
      eng.pumpMusic(seconds)
      return toBase64(await ctx.startRendering())
    }
  }
}

async function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer()
    s.once('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
  })
}

/* --------------------------------------------------------------------------------------------- main */

async function main() {
  let server
  let browser
  const errors = []
  try {
    const port = await freePort()
    server = await createServer({
      configFile: join(root, 'vite.config.anima-front.mjs'),
      logLevel: 'error',
      appType: 'custom',
      server: { host: '127.0.0.1', port, strictPort: true },
      plugins: [
        {
          name: 'anima-audio-blank-page',
          configureServer(s) {
            s.middlewares.use('/__audio', (_req, res) => {
              res.setHeader('content-type', 'text/html')
              res.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
            })
          }
        }
      ]
    })
    await server.listen()
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--autoplay-policy=no-user-gesture-required']
    })
    const page = await browser.newPage()
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
    })
    await page.goto(`http://127.0.0.1:${port}/__audio`)
    await page.evaluate(pageSetup)

    const meta = await page.evaluate(() => ({
      names: window.__audio.names,
      themes: window.__audio.themes,
      pending: window.__audio.pending,
      info: window.__audio.info,
      trims: window.__audio.trims,
      layered: window.__audio.layered
    }))
    const pending = new Set(meta.pending)
    const names = meta.names.filter((n) => !only || only.has(n))
    const render = (name, o) => page.evaluate(([n, opt]) => window.__audio.renderSfx(n, opt), [name, o])
    const measure = async (name, o) => decodePcm(await render(name, o))
    const unitLoudness = async (name, trim, seconds) => {
      const { l, r } = await measure(name, { unit: true, trim, seconds })
      return loudness(l, r).max
    }

    const songReport = {}
    await rm(join(outDir, 'sfx'), { recursive: true, force: true })
    await mkdir(join(outDir, 'sfx'), { recursive: true })
    const results = {}
    const trims = {}
    for (const name of names) {
      const isPending = pending.has(name)
      let trim = meta.trims[name]
      if (write && !isPending) {
        trim = 1
        for (let i = 0; i < 4; i++) {
          const L = await unitLoudness(name, trim, FIT_SECONDS)
          trim *= Math.pow(10, (REFERENCE_DB - L) / 20)
          trim = round(trim, 3)
        }
        trims[name] = trim
      } else if (trim !== undefined && !isPending) trims[name] = trim
      else if (!isPending) {
        // No stored trim yet: fit one in memory so the figures are comparable (never written without --write).
        trim = 1
        for (let i = 0; i < 4; i++) {
          const L = await unitLoudness(name, trim, FIT_SECONDS)
          trim *= Math.pow(10, (REFERENCE_DB - L) / 20)
          trim = round(trim, 3)
        }
        trims[name] = trim
      }
      const o = { trim: isPending ? null : (trim ?? null), seconds: SFX_SECONDS }
      const { l, r, bytes } = await measure(name, o)
      await writeFile(join(outDir, 'sfx', `${name}.wav`), wavFile(bytes))
      const m = analyse(l, r)
      const u = await measure(name, { ...o, unit: true })
      const loud = loudness(l, r).max
      const loudNorm = loudness(u.l, u.r).max
      results[name] = { name, pending: isPending, ...meta.info[name], m, loud, loudNorm, trim: trims[name] }
    }

    // Similarity between measured effects.
    const measured = Object.values(results).filter((x) => !x.pending && !x.m.silent)
    for (const a of measured) {
      let best = { d: Infinity, name: '' }
      for (const b of measured) {
        if (a === b) continue
        const d = distance(a.m.fingerprint, b.m.fingerprint)
        if (d < best.d) best = { d, name: b.name }
      }
      a.nearest = best
    }

    const flags = (x) => {
      const out = []
      if (x.pending) return out
      if (x.m.silent) return ['silent']
      if (x.m.peak > LIMITS.peak) out.push('peak')
      if (x.m.cut) out.push('tail cut')
      if (x.m.seconds > LIMITS.maxSeconds) out.push('long')
      if (x.m.bands[3] + x.m.bands[4] > LIMITS.highShare) out.push('bright')
      if (Math.abs(x.loudNorm - REFERENCE_DB) > LIMITS.normTolerance) out.push('loudness')
      if (x.nearest && x.nearest.d < LIMITS.minFingerprintDistance) out.push(`like ${x.nearest.name}`)
      return out
    }

    const lines = [
      '# ANIMA FRONT sound-effect report',
      '',
      `Reference loudness ${REFERENCE_DB} dB (g removed). Flags: peak > ${LIMITS.peak}, tail cut, seconds > ${LIMITS.maxSeconds}, share above 4 kHz > ${LIMITS.highShare}, loudness off by > ${LIMITS.normTolerance} dB, fingerprint distance < ${LIMITS.minFingerprintDistance}.`,
      '',
      '| effect | sec | peak | rms dB | loud dB | norm dB | centroid | <200 | 200-1k | 1-4k | 4-8k | >8k | attack ms | trim | g | nearest | flags |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |'
    ]
    let flagged = 0
    for (const name of names) {
      const x = results[name]
      if (x.pending) {
        lines.push(`| ${name} | pending |  |  |  |  |  |  |  |  |  |  |  |  | ${x.g} |  |  |`)
        continue
      }
      if (x.m.silent) {
        lines.push(`| ${name} | silent |  |  |  |  |  |  |  |  |  |  |  |  | ${x.g} |  | silent |`)
        flagged++
        continue
      }
      const f = flags(x)
      if (f.length) flagged++
      lines.push(
        `| ${name} | ${x.m.seconds.toFixed(2)} | ${x.m.peak.toFixed(2)} | ${x.m.rmsDb.toFixed(1)} | ${x.loud.toFixed(1)} | ${x.loudNorm.toFixed(1)} | ${Math.round(x.m.centroid)} | ${x.m.bands.map((v) => v.toFixed(2)).join(' | ')} | ${Math.round(x.m.attack * 1000)} | ${x.trim ?? ''} | ${x.g} | ${x.nearest ? `${x.nearest.name} ${x.nearest.d.toFixed(2)}` : ''} | ${f.join(', ')} |`
      )
    }

    const loopReport = {}
    if (loopsFlag) {
      await rm(join(outDir, 'loops'), { recursive: true, force: true })
      await mkdir(join(outDir, 'loops'), { recursive: true })
      lines.push(
        '',
        '## Loops (6 s at progress 0.5)',
        '',
        '| loop | peak | loud dB | steadiness dB | centroid | <200 | 200-1k | 1-4k | 4-8k | >8k |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
      )
      const loopNames = await page.evaluate(() => window.__audio.loopNames)
      const loopHashes = await page.evaluate(() => window.__audio.loopHashes)
      for (const name of loopNames) {
        const b64 = await page.evaluate(([n, s]) => window.__audio.renderLoop(n, s, 0.5), [name, 6])
        const { l, r, bytes } = decodePcm(b64)
        await writeFile(join(outDir, 'loops', `${name}.wav`), wavFile(bytes))
        // Steadiness: spread (max - min) of the 0.5 s window loudness after the first second.
        const win = SAMPLE_RATE / 2
        const levels = []
        for (let s0 = SAMPLE_RATE; s0 + win <= l.length; s0 += win)
          levels.push(loudness(l.subarray(s0, s0 + win), r.subarray(s0, s0 + win)).mean)
        const spread = levels.length ? Math.max(...levels) - Math.min(...levels) : 0
        const a = analyse(l.subarray(SAMPLE_RATE), r.subarray(SAMPLE_RATE))
        const ld = loudness(l.subarray(SAMPLE_RATE), r.subarray(SAMPLE_RATE))
        let nan = false
        let peakAll = 0
        for (let i = 0; i < l.length; i++) {
          if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) nan = true
          peakAll = Math.max(peakAll, Math.abs(l[i]), Math.abs(r[i]))
        }
        loopReport[name] = {
          hash: loopHashes[name],
          silent: !!a.silent,
          nan,
          peak: round(peakAll, 3),
          loud: round(ld.mean, 1),
          spread: round(spread, 1),
          centroid: a.silent ? 0 : Math.round(a.centroid),
          bands: a.silent ? [] : a.bands.map((v) => round(v, 3))
        }
        lines.push(
          a.silent
            ? `| ${name} | silent |  |  |  |  |  |  |  |  |`
            : `| ${name} | ${peakAll.toFixed(2)} | ${ld.mean.toFixed(1)} | ${spread.toFixed(1)} | ${Math.round(a.centroid)} | ${a.bands.map((v) => v.toFixed(2)).join(' | ')} |`
        )
      }
    }

    if (write) {
      const order = meta.names.filter((n) => trims[n] !== undefined)
      await writeFile(
        join(gameDir, 'src/audio/sfx-trim.ts'),
        `/** Per-effect loudness trims measured by the offline render check. Regenerated, do not hand-edit. */\nimport type { SfxName } from './api'\n\nexport const SFX_TRIM: Partial<Record<SfxName, number>> = {\n${order.map((n) => `  ${n}: ${trims[n]}`).join(',\n')}\n}\n`
      )
      const effects = {}
      for (const name of meta.names) {
        const x = results[name]
        if (x.pending) {
          effects[name] = { pending: true }
          continue
        }
        effects[name] = {
          hash: x.hash,
          g: x.g,
          trim: x.trim,
          seconds: round(x.m.seconds, 2),
          peak: round(x.m.peak, 3),
          rmsDb: round(x.m.rmsDb, 1),
          loudness: round(x.loud, 1),
          loudnessNorm: round(x.loudNorm, 1),
          centroid: Math.round(x.m.centroid),
          bands: x.m.bands.map((v) => round(v, 3)),
          attack: round(x.m.attack, 3),
          fingerprint: x.m.fingerprint.map((v) => round(v, 3))
        }
      }
      await writeFile(
        join(gameDir, 'src/audio/sfx-metrics.json'),
        JSON.stringify(
          {
            referenceDb: REFERENCE_DB,
            bandEdgesHz: BAND_EDGES,
            loops: loopReport,
            note: 'Generated by scripts/anima-front-audio.mjs --write. bands = energy shares below 200 Hz, 200-1000, 1000-4000, 4000-8000, above 8000.',
            effects
          },
          null,
          1
        ) + '\n'
      )
    }

    if (songs) {
      await rm(join(outDir, 'music'), { recursive: true, force: true })
      await mkdir(join(outDir, 'music'), { recursive: true })
      lines.push(
        '',
        '## Music (first 40 s)',
        '',
        '| theme | layer | mean loud dB | max loud dB | peak |',
        '| --- | ---: | ---: | ---: | ---: |'
      )
      for (const theme of meta.themes)
        for (let layer = 0; layer < 3; layer++) {
          if (layer > 0 && !meta.layered.includes(theme)) continue
          const b64 = await page.evaluate(
            ([t, ly, s]) => window.__audio.renderSong(t, ly, s),
            [theme, layer, SONG_SECONDS]
          )
          const { l, r, bytes } = decodePcm(b64)
          await writeFile(join(outDir, 'music', `${theme}-${layer}.wav`), wavFile(bytes))
          const ld = loudness(l, r)
          let peak = 0
          for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]))
          songReport[`${theme}-${layer}`] = { mean: round(ld.mean, 1), max: round(ld.max, 1), peak: round(peak, 3) }
          lines.push(`| ${theme} | ${layer} | ${ld.mean.toFixed(1)} | ${ld.max.toFixed(1)} | ${peak.toFixed(2)} |`)
        }
    }

    await writeFile(join(outDir, 'report.md'), lines.join('\n') + '\n')
    await writeFile(
      join(outDir, 'metrics.json'),
      JSON.stringify(
        {
          effects: Object.fromEntries(
            Object.values(results).map((x) => [
              x.name,
              x.pending || x.m.silent
                ? { pending: x.pending, silent: !!x.m?.silent }
                : {
                    seconds: round(x.m.seconds, 2),
                    peak: round(x.m.peak, 3),
                    loudnessNorm: round(x.loudNorm, 1),
                    trim: x.trim,
                    flags: flags(x)
                  }
            ])
          ),
          loops: loopReport,
          songs: songReport
        },
        null,
        1
      )
    )
    const done = Object.values(results).filter((x) => !x.pending).length
    console.log(
      `rendered ${names.length} effects (${done} measured, ${names.length - done} pending), ${flagged} flagged${write ? ', trims and metrics written' : ''}`
    )
    for (const name of names) {
      const f = flags(results[name])
      if (f.length) console.log(`  ${name}: ${f.join(', ')}`)
    }
    console.log(`report: ${join(outDir, 'report.md')}`)
  } catch (e) {
    errors.push(`script: ${e?.stack ?? e}`)
  } finally {
    await browser?.close().catch(() => {})
    await server?.close().catch(() => {})
  }
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  }
}

await main()
