#!/usr/bin/env node
// アニマフロント balance harness: plays whole missions, PvP matches and economy drills headlessly on the real maps
// with all-bot squads (the sim is imported through vite's runnerImport) and prints tables.
//
//   node scripts/anima-front-balance.mjs [suite...] [options]
//
// Suites (default: pve pvp econ):
//   pve    missions × difficulty/skill cells × seeds → win rate, durations, downs, tickets, objective hp, phases
//   pvp    12-bot 三つ巴演習 matches → K/D per species and per preset, KOs per match, spawn deaths
//   econ   one bot per preset in a continuous fight → time to run dry, measured vs estimated burn
// Options:
//   --seeds N          seeds per cell (default 8)          --pvp-seeds N   PvP matches (default 14)
//   --econ-seeds N     economy missions per preset × species (default 8)
//   --missions a,b     subset of missions                  --cells d@s,..  e.g. normal@0.6,hard@0.8
//   --jobs N           worker threads (default cores − 2)  --json FILE     also write the raw results
//   --seed0 N          first seed (default 1)          --src DIR       game src tree (default the checkout's)
import { availableParallelism } from 'node:os'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
/** Game source tree (override with --src, e.g. an exported older revision for before/after tables). */
const GAME = process.env.ANIMA_FRONT_SRC || 'examples/games/anima-front/src'

/** The default cells: the balance targets (DESIGN §12). */
const DEFAULT_CELLS = ['easy@0.5', 'normal@0.6', 'normal@0.8', 'hard@0.6', 'hard@0.8']
/** Squads of four (species' default presets), rotated by seed so every species plays. */
const SQUADS = [
  ['shiba', 'cat', 'rabbit', 'bear'],
  ['fox', 'penguin', 'hamster', 'owl'],
  ['shiba', 'penguin', 'owl', 'bear'],
  ['cat', 'fox', 'hamster', 'rabbit']
]
const PVP_SPECIES = ['shiba', 'cat', 'rabbit', 'bear', 'fox', 'penguin', 'hamster', 'owl']
const PVP_PRESETS = ['attacker', 'gunner', 'sniper', 'tank', 'support', 'skirmisher', 'allout']
const ECON_PRESETS = ['allout', 'attacker', 'support', 'gunner', 'tank', 'sniper', 'skirmisher']

// ---------------------------------------------------------------------------------------------------------------
// Worker side

async function loadSim() {
  const { runnerImport } = await import('vite')
  const load = async (p) =>
    (await runnerImport(resolve(ROOT, GAME, p), { configFile: false, logLevel: 'error' })).module
  const world = await load('sim/world.ts')
  const foes = await load('sim/foes/index.ts')
  const loadout = await load('sim/loadout.ts')
  const presets = await load('data/loadout.ts')
  const species = await load('data/species.ts')
  const missions = await load('data/missions.ts')
  return { world, foes, loadout, presets, species, missions }
}

function botCfg(S, i, sp, team, skill, preset) {
  return {
    id: `b${i}`,
    name: `${sp}${i}`,
    species: sp,
    loadout: S.presets.presetById(preset ?? S.species.SPECIES[sp].preset).loadout,
    team,
    bot: skill
  }
}

/** Steps a world to the end, handing every tick's events to `onEvent`; returns timing. */
function play(S, w, maxSeconds, onTick, onEvent) {
  const sim = S.world.simOf(w)
  const inputs = new Map()
  const t0 = performance.now()
  let steps = 0
  let worst = 0
  while (!w.over && steps < maxSeconds * 60) {
    const a = performance.now()
    w.step(inputs)
    const dt = performance.now() - a
    if (dt > worst) worst = dt
    steps++
    if (onTick) onTick(sim)
    if (sim.events.length) {
      for (const e of sim.events) onEvent(e, sim)
      sim.events = []
    }
  }
  const ms = performance.now() - t0
  return { sim, steps, ms, perStep: ms / Math.max(1, steps), worst }
}

function runPve(S, job) {
  const { mission, difficulty, skill, seed } = job
  const m = S.missions.MISSIONS[mission]
  const squad = SQUADS[seed % SQUADS.length]
  const players = squad.map((sp, i) => botCfg(S, i, sp, 0, skill))
  const w = S.world.createWorld({ mode: 'pve', map: m.map, mission, difficulty, seed, players })
  let start = -1
  let bossAt = -1
  let bossDeadAt = -1
  const phaseAt = []
  let cause = ''
  const waveAt = []
  // Largest anima loss of any player within 1 s (burst check).
  const window = new Map()
  let burst = 0
  let burstWho = ''
  let objHurtWorst = 0
  const objHits = []
  const onTick = (sim) => {
    if (start < 0 && sim.phase === 'play') start = sim.time
    if (sim.tick % 6 === 0) {
      for (const p of sim.players) {
        let wnd = window.get(p.id)
        if (!wnd) window.set(p.id, (wnd = []))
        wnd.push(sim.time, p.stats.taken)
        while (wnd.length > 2 && wnd[0] < sim.time - 1) wnd.splice(0, 2)
        const lost = wnd[wnd.length - 1] - wnd[1]
        const frac = lost / p.maxAnima
        if (frac > burst) {
          burst = frac
          burstWho = `${p.species.id}@${Math.round(sim.time - start)}s`
        }
      }
    }
  }
  const onEvent = (e, sim) => {
    const t = sim.time - Math.max(0, start)
    if (e.type === 'wave') waveAt.push(Math.round(t))
    if (e.type === 'foeSpawn' && (e.kind === 'goutetsu' || e.kind === 'kuitsukushi') && bossAt < 0) bossAt = t
    if (e.type === 'bossPhase') phaseAt.push(Math.round(t))
    if (e.type === 'foeDie' && (e.kind === 'goutetsu' || e.kind === 'kuitsukushi')) bossDeadAt = t
    if (e.type === 'objective' && e.what === 'destroyed' && !cause) {
      const r = sim.props.find((x) => x.id === e.prop)
      if (r && (r.kind === 'lighthouse' || r.kind === 'cart')) cause = 'objective'
    }
    if (e.type === 'hit' && e.targetKind === 'prop') {
      objHits.push(t, e.amount)
    }
  }
  const r = play(S, w, 1200, onTick, onEvent)
  const v = w.view()
  // Worst 5 s of objective damage.
  for (let i = 0, j = 0, sum = 0; i < objHits.length; i += 2) {
    sum += objHits[i + 1]
    while (objHits[j] < objHits[i] - 5) {
      sum -= objHits[j + 1]
      j += 2
    }
    if (sum > objHurtWorst) objHurtWorst = sum
  }
  const win = v.phase === 'victory'
  const o = v.pve.objective
  if (!win && !cause) cause = o.maxHp !== undefined && o.hp <= 0 ? 'objective' : 'wipe'
  const time = v.pve.result?.time ?? r.sim.time - start
  const objShare =
    o.maxHp !== undefined
      ? o.hp / o.maxHp
      : o.steps
        ? (o.step ?? 0) / o.steps
        : v.pve.boss
          ? 1 - v.pve.boss.hp / v.pve.boss.maxHp
          : win
            ? 1
            : 0
  return {
    kind: 'pve',
    mission,
    difficulty,
    skill,
    seed,
    squad: squad.join('/'),
    win,
    cause: win ? '' : cause,
    time,
    downs: v.players.reduce((a, p) => a + p.stats.downs, 0),
    revives: v.players.reduce((a, p) => a + p.stats.revives, 0),
    tickets: v.pve.tickets,
    obj: o.maxHp !== undefined ? o.hp / o.maxHp : null,
    progress: objShare,
    escort: o.progress ?? null,
    wave: v.pve.wave,
    waves: v.pve.waves,
    bossAt: bossAt >= 0 ? bossAt : null,
    bossDur: bossAt >= 0 && bossDeadAt >= 0 ? bossDeadAt - bossAt : null,
    bossHpLeft: v.pve.boss ? v.pve.boss.hp / v.pve.boss.maxHp : bossDeadAt >= 0 ? 0 : null,
    phaseAt,
    waveAt,
    burst,
    burstWho,
    objHurt5s: objHurtWorst,
    rank: v.pve.result?.rank ?? '-',
    perStep: r.perStep,
    worst: r.worst
  }
}

function runPvp(S, job) {
  const { seed, skill } = job
  const players = []
  for (let t = 0; t < 3; t++)
    for (let i = 0; i < 4; i++) {
      const k = t * 4 + i
      const sp = PVP_SPECIES[(k + seed * 5) % PVP_SPECIES.length]
      const preset = PVP_PRESETS[(k * 3 + seed) % PVP_PRESETS.length]
      const c = botCfg(S, k, sp, t, skill, preset)
      c.preset = preset
      players.push(c)
    }
  const w = S.world.createWorld({ mode: 'pvp', map: 'arena', seed, players: players.map(({ preset, ...c }) => c) })
  const respawnAt = new Map()
  let kos = 0
  let spawnKos = 0
  let baseKos = 0
  const onEvent = (e, sim) => {
    if (e.type === 'respawn') respawnAt.set(e.who, sim.time)
    if (e.type === 'ko') {
      kos++
      if (sim.time - (respawnAt.get(e.who) ?? -100) < 7) spawnKos++
      const p = sim.players.find((q) => q.id === e.who)
      if (p && sim.map.bases.some((b) => b.team === p.team && Math.hypot(b.p[0] - p.p[0], b.p[2] - p.p[2]) < b.r + 8))
        baseKos++
    }
  }
  const r = play(S, w, 520, null, onEvent)
  const v = w.view()
  return {
    kind: 'pvp',
    seed,
    skill,
    kos,
    spawnKos,
    baseKos,
    scores: v.pvp.scores,
    players: v.players.map((p, i) => ({
      species: p.species,
      preset: players[i].preset,
      kos: p.stats.kos,
      deaths: p.stats.downs,
      assists: p.stats.assists,
      damage: p.stats.damage
    })),
    perStep: r.perStep,
    worst: r.worst
  }
}

/**
 * Economy drill: the tested preset rides with three default bots (ミケ 遊撃, ペンタ ガンナー, ユキ スナイパー) through
 * whole missions (サクラ通り and 侵蝕域 on 正規). Only its engaged seconds count as fighting (a perceived target within
 * the reaction window). A "run" starts whenever its anima is ≥ 95 % and ends when it drops below 20 % (dry) or
 * refills; the drill reports the engaged seconds of each dry run and the gross burn per engaged second.
 */
function runEcon(S, job) {
  const { preset, species, seed, skill, mission } = job
  const m = S.missions.MISSIONS[mission]
  const players = [
    botCfg(S, 0, species, 0, skill, preset),
    botCfg(S, 1, 'cat', 0, skill),
    botCfg(S, 2, 'penguin', 0, skill),
    botCfg(S, 3, 'rabbit', 0, skill)
  ]
  const w = S.world.createWorld({ mode: 'pve', map: m.map, mission, difficulty: 'normal', seed, players })
  const est = S.loadout.sustainEstimate(species, players[0].loadout)
  let engaged = 0
  let engagedFree = 0
  let grossFree = 0
  let gross = 0
  let gained = 0
  let spentE = 0
  let takenE = 0
  let run = null
  const dryRuns = []
  let full = 0
  let last = null
  let downs = 0
  const onTick = (sim) => {
    const me = sim.players[0]
    const b = me.brain
    const s = me.stats
    if (last && me.state === 'alive' && b && b.target && sim.time - b.lastSeen < 0.4) {
      engaged += 1 / 60
      spentE += s.spent - last.spent
      takenE += s.taken - last.taken
      gross += s.spent - last.spent + (s.taken - last.taken)
      gained += s.gathered - last.gathered
      if (run !== null) run += 1 / 60
      // Unconstrained burn: only while the pool is above the dry line (a dry animal cannot spend).
      if (last.anima > me.maxAnima * 0.2) {
        engagedFree += 1 / 60
        grossFree += s.spent - last.spent + (s.taken - last.taken)
      }
    }
    last = { spent: s.spent, taken: s.taken, gathered: s.gathered, anima: me.anima }
    if (me.state !== 'alive') run = null
    else if (me.anima >= me.maxAnima * 0.95) {
      if (run === null || run > 0) full++
      run = 0
    } else if (run !== null && me.anima < me.maxAnima * 0.2) {
      dryRuns.push(run)
      run = null
    }
  }
  const onEvent = (e) => {
    if (e.type === 'down' && e.who === 'b0') downs++
  }
  play(S, w, 900, onTick, onEvent)
  return {
    kind: 'econ',
    preset,
    species,
    seed,
    mission,
    engaged,
    dryRuns,
    downs,
    est: { burn: est.burn, sustain: est.sustain, damage: est.byCategory.damage },
    burn: engaged > 0 ? gross / engaged : null,
    burnFree: engagedFree > 0 ? grossFree / engagedFree : null,
    engagedFree,
    spent: engaged > 0 ? spentE / engaged : null,
    taken: engaged > 0 ? takenE / engaged : null,
    gained: engaged > 0 ? gained / engaged : null
  }
}

if (!isMainThread) {
  const S = await loadSim()
  parentPort.on('message', (job) => {
    if (!job) process.exit(0)
    try {
      const out = job.kind === 'pve' ? runPve(S, job) : job.kind === 'pvp' ? runPvp(S, job) : runEcon(S, job)
      parentPort.postMessage({ ok: true, out })
    } catch (err) {
      parentPort.postMessage({ ok: false, job, err: String(err?.stack ?? err) })
    }
  })
  parentPort.postMessage({ ready: true })
}

// ---------------------------------------------------------------------------------------------------------------
// Main side

function parseArgs(argv) {
  const o = {
    suites: [],
    seeds: 8,
    pvpSeeds: 14,
    econSeeds: 8,
    jobs: Math.max(1, availableParallelism() - 2),
    seed0: 1
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--seeds') o.seeds = Number(next())
    else if (a === '--pvp-seeds') o.pvpSeeds = Number(next())
    else if (a === '--econ-seeds') o.econSeeds = Number(next())
    else if (a === '--missions') o.missions = next().split(',')
    else if (a === '--cells') o.cells = next().split(',')
    else if (a === '--jobs') o.jobs = Number(next())
    else if (a === '--json') o.json = next()
    else if (a === '--seed0') o.seed0 = Number(next())
    else if (a === '--src') process.env.ANIMA_FRONT_SRC = next()
    else if (!a.startsWith('--')) o.suites.push(a)
  }
  if (!o.suites.length) o.suites = ['pve', 'pvp', 'econ']
  return o
}

async function runJobs(jobs, n) {
  const results = []
  let next = 0
  let done = 0
  const workers = []
  await new Promise((resolveAll, reject) => {
    const feed = (wk) => {
      if (next >= jobs.length) {
        wk.postMessage(null)
        return
      }
      wk.postMessage(jobs[next++])
    }
    for (let i = 0; i < Math.min(n, jobs.length); i++) {
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: {} })
      workers.push(wk)
      wk.on('message', (m) => {
        if (m.ready) return feed(wk)
        if (!m.ok) {
          console.error('job failed', JSON.stringify(m.job), m.err)
          results.push({ kind: 'error', job: m.job })
        } else results.push(m.out)
        done++
        if (process.stderr.isTTY) process.stderr.write(`\r${done}/${jobs.length}`)
        if (done >= jobs.length) resolveAll()
        else feed(wk)
      })
      wk.on('error', reject)
    }
  })
  for (const wk of workers) await wk.terminate()
  if (process.stderr.isTTY) process.stderr.write('\n')
  return results
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const fmt = (x, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? '-' : x.toFixed(d))
const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '-')

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)))
  const line = (r) => r.map((c, i) => String(c).padStart(w[i])).join('  ')
  console.log(line(head))
  for (const r of rows) console.log(line(r))
}

function reportPve(res, missions, cells) {
  console.log('\n## 防衛任務 (all-bot squads of 4, default presets)\n')
  const rows = []
  for (const m of missions)
    for (const c of cells) {
      const [d, s] = c.split('@')
      const rs = res.filter((r) => r.mission === m && r.difficulty === d && r.skill === Number(s))
      if (!rs.length) continue
      const wins = rs.filter((r) => r.win)
      const times = rs.map((r) => r.time)
      const causes = rs
        .filter((r) => !r.win)
        .map((r) => r.cause)
        .reduce((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {})
      const boss = rs.filter((r) => r.bossDur !== null).map((r) => r.bossDur)
      rows.push([
        m,
        c,
        `${wins.length}/${rs.length}`,
        `${Math.round((100 * wins.length) / rs.length)}%`,
        mmss(mean(times)),
        mmss(Math.min(...times)),
        mmss(Math.max(...times)),
        mmss(mean(wins.map((r) => r.time))),
        fmt(mean(rs.map((r) => r.downs)), 1),
        fmt(mean(rs.map((r) => r.tickets)), 1),
        fmt(mean(rs.filter((r) => r.obj !== null).map((r) => r.obj * 100))),
        fmt(mean(rs.map((r) => r.progress * 100))),
        boss.length ? `${mmss(mean(boss))} (${mmss(Math.min(...boss))}-${mmss(Math.max(...boss))})` : '-',
        fmt(Math.max(...rs.map((r) => r.burst * 100))),
        Object.entries(causes)
          .map(([k, n]) => `${k}:${n}`)
          .join(' ') || '-'
      ])
    }
  table(
    [
      'mission',
      'cell',
      'wins',
      'win%',
      'mean',
      'min',
      'max',
      'winMean',
      'downs',
      'tickets',
      'obj%',
      'prog%',
      'boss phase',
      'burst%',
      'defeats'
    ],
    rows
  )
  const ps = res.map((r) => r.perStep)
  console.log(
    `\nstep cost: mean ${fmt(mean(ps), 3)} ms, worst single step ${fmt(Math.max(...res.map((r) => r.worst)), 1)} ms`
  )
}

function reportPvp(res) {
  console.log(`\n## 三つ巴演習 (${res.length} matches, 12 bots, arena)\n`)
  const by = (key) => {
    const agg = new Map()
    for (const r of res)
      for (const p of r.players) {
        const a = agg.get(p[key]) ?? { k: 0, d: 0, n: 0, dmg: 0 }
        a.k += p.kos
        a.d += p.deaths
        a.n++
        a.dmg += p.damage
        agg.set(p[key], a)
      }
    const all = [...agg.values()]
    const avg =
      all.reduce((s, a) => s + a.k, 0) /
      Math.max(
        1,
        all.reduce((s, a) => s + a.d, 0)
      )
    const rows = [...agg.entries()].sort().map(([k, a]) => {
      const kd = a.k / Math.max(1, a.d)
      return [
        k,
        a.n,
        fmt(a.k / a.n, 1),
        fmt(a.d / a.n, 1),
        fmt(kd, 2),
        `${kd / avg >= 1 ? '+' : ''}${fmt((kd / avg - 1) * 100)}%`,
        fmt(a.dmg / a.n)
      ]
    })
    table([key, 'n', 'K/match', 'D/match', 'K/D', 'vs avg', 'dmg/match'], rows)
  }
  by('species')
  console.log('')
  by('preset')
  const kos = res.map((r) => r.kos)
  const spawn = res.reduce((a, r) => a + r.spawnKos, 0)
  const base = res.reduce((a, r) => a + r.baseKos, 0)
  const total = kos.reduce((a, b) => a + b, 0)
  console.log(
    `\nKOs per match: mean ${fmt(mean(kos), 1)}, min ${Math.min(...kos)}, max ${Math.max(...kos)}; ` +
      `KOs < 7 s after respawn ${spawn} (${fmt((100 * spawn) / Math.max(1, total), 1)}%), ` +
      `KOs within 8 m of own base ${base} (${fmt((100 * base) / Math.max(1, total), 1)}%)`
  )
  console.log(`scores: ${res.map((r) => r.scores.join('/')).join('  ')}`)
}

function reportEcon(res) {
  console.log('\n## アニマ経済 (tested preset + three default bots, whole missions on 正規; engaged seconds only)\n')
  const rows = []
  const keys = [...new Set(res.map((r) => `${r.preset}|${r.species}`))]
  for (const k of keys) {
    const rs = res.filter((r) => `${r.preset}|${r.species}` === k)
    const [preset, species] = k.split('|')
    const dry = rs.flatMap((r) => r.dryRuns)
    const engaged = rs.reduce((a, r) => a + r.engaged, 0)
    const burnAll = rs.reduce((a, r) => a + r.burn * r.engaged, 0) / engaged
    const free = rs.reduce((a, r) => a + r.engagedFree, 0)
    const burn = rs.reduce((a, r) => a + r.burnFree * r.engagedFree, 0) / free
    const est = rs[0].est.burn
    rows.push([
      preset,
      species,
      fmt(engaged / rs.length),
      `${dry.length}`,
      fmt((60 * dry.length) / engaged, 2),
      dry.length ? `${fmt(mean(dry))} (${fmt(Math.min(...dry))}-${fmt(Math.max(...dry))})` : '-',
      fmt(rs.reduce((a, r) => a + r.spent * r.engaged, 0) / engaged, 2),
      fmt(rs.reduce((a, r) => a + r.taken * r.engaged, 0) / engaged, 2),
      fmt(rs.reduce((a, r) => a + r.gained * r.engaged, 0) / engaged, 2),
      fmt(burnAll, 2),
      fmt(burn, 2),
      fmt(est, 2),
      `${est >= burn ? '+' : ''}${fmt((est / burn - 1) * 100)}%`,
      Number.isFinite(rs[0].est.sustain) ? fmt(rs[0].est.sustain) : '∞',
      fmt(mean(rs.map((r) => r.downs)), 1)
    ])
  }
  table(
    [
      'preset',
      'species',
      'fight s/run',
      'dry runs',
      'dry/min',
      'dry after (s)',
      'spent/s',
      'taken/s',
      'gained/s',
      'burn/s',
      'burn>20%',
      'est burn',
      'est err',
      'est sustain',
      'downs'
    ],
    rows
  )
}

if (isMainThread) {
  const o = parseArgs(process.argv.slice(2))
  const missionIds = o.missions ?? ['sakura', 'harbor', 'nightraid', 'blight', 'maw']
  const cells = o.cells ?? DEFAULT_CELLS
  const jobs = []
  if (o.suites.includes('pve'))
    for (const m of missionIds)
      for (const c of cells) {
        const [difficulty, s] = c.split('@')
        for (let k = 0; k < o.seeds; k++)
          jobs.push({ kind: 'pve', mission: m, difficulty, skill: Number(s), seed: o.seed0 + k })
      }
  if (o.suites.includes('pvp'))
    for (let k = 0; k < o.pvpSeeds; k++) jobs.push({ kind: 'pvp', seed: o.seed0 + k, skill: 0.6 })
  if (o.suites.includes('econ'))
    for (const preset of ECON_PRESETS)
      for (const species of ['shiba', 'bear'])
        for (let k = 0; k < o.econSeeds; k++)
          jobs.push({
            kind: 'econ',
            preset,
            species,
            seed: o.seed0 + k,
            skill: 0.7,
            mission: k % 2 ? 'blight' : 'sakura'
          })
  // Long jobs first.
  jobs.sort((a, b) => (b.kind === 'pvp') - (a.kind === 'pvp'))
  const t0 = Date.now()
  const res = await runJobs(jobs, o.jobs)
  if (o.suites.includes('pve'))
    reportPve(
      res.filter((r) => r.kind === 'pve'),
      missionIds,
      cells
    )
  if (o.suites.includes('pvp')) reportPvp(res.filter((r) => r.kind === 'pvp'))
  if (o.suites.includes('econ')) reportEcon(res.filter((r) => r.kind === 'econ'))
  console.log(`\n${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  if (o.json) writeFileSync(o.json, JSON.stringify(res, null, 1))
  void workerData
}
