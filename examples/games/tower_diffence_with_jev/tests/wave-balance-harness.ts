/**
 * Headless policy-5 balance harness on the configuration real players get: layout revision 4 (the long
 * meadow road), the stage-select start (a fresh engine per stage, stageStartGold battle G, a formation of
 * up to five ally types) and the Rule commander. Scripted players place along the actual road.
 */
import { SPECIALS, specialReady } from '../src/game/SpecialAbilities'
import {
  CURRENT_WAVE_BOSS_POLICY,
  DEFINITIONS,
  fieldFor,
  pathLength,
  pointOnPath,
  stageRules,
  waveStatus,
  type AllyType,
  type GameState,
  type Point
} from '../src/game/model'
import { GameEngine } from '../src/game/GameEngine'
import { RuleBasedAI } from '../src/ai/AIController'
import { DRAGON_BREATH_MOUTHS } from '../src/rendering/DragonBreathArt'
import { freshRunFromProfile, upgradeCost } from '../src/progression/UpgradeSystem'
import { DEPLOYMENT_COST } from '../src/game/DefenderRoster'
import {
  awardBounty,
  awardStageClear,
  battleFormation,
  freshStageProgress,
  owned,
  recruit,
  stageStartGold,
  FORMATION_SLOTS,
  type StageProgress
} from '../src/progression/StageProgress'
import { bountyFor } from '../src/ui/BattleFeelLogic'

/** The layout new campaigns use (main.ts FRESH_CAMPAIGN_LAYOUT). */
export const REAL_LAYOUT = 4

export interface StageLog {
  stage: number
  result: GameState['phase']
  seconds: number
  hp: number
  minHp: number
  waves: number
  enemies: number
  defenders: number
  goldEarned: number
  earlyCalls: number
  midBattleSpend: number
  /** Seconds from each wave's first spawn until its last member spawned. */
  waveSpawnSeconds: number[]
  /** Seconds from each wave's first spawn until it was cleared (the last one: until the battle ended). */
  waveSeconds: number[]
  /** Longest stretch inside a wave with no spawn, kill or leak. */
  longestQuiet: number
  /** Most enemies alive at once. */
  peakEnemies: number
  /** Castle HP when each wave was cleared (the last one: at the end). */
  waveHp: number[]
}

export type PlayerKind = 'competent' | 'weak'

interface Plan {
  /** Ally types the player fields, most wanted first. */
  types: AllyType[]
  /** Never spends beyond the opening deployment. */
  frugal: boolean
  /** How many allies the opening deploys (frugal players). */
  opening?: number
}

const RECRUIT_ORDER: AllyType[] = ['ranger', 'mage', 'cannon', 'frost', 'healer', 'paladin']
const FORMATION_PREFERENCE: AllyType[] = [
  'archer',
  'soldier',
  'cannon',
  'mage',
  'ranger',
  'tank',
  'frost',
  'paladin',
  'healer',
  'runner'
]
const MELEE: readonly AllyType[] = ['soldier', 'runner', 'tank', 'paladin']

/** Road samples every 16 px with their progress share (0 at the entrance, 1 at the castle). */
function roadSamples(state: GameState): (Point & { share: number })[] {
  const path = fieldFor(state).path,
    length = pathLength(path),
    samples: (Point & { share: number })[] = []
  for (let d = 0; d <= length; d += 16) samples.push({ ...pointOnPath(path, d), share: d / length })
  return samples
}

/** Best valid spot for `type`: covers the most road (later road weighs more), close to the allies already placed. */
function bestSpot(
  e: GameEngine,
  type: AllyType,
  samples: (Point & { share: number })[],
  rearGuard = false
): Point | null {
  const definition = DEFINITIONS[type],
    melee = MELEE.includes(type),
    reach = melee ? definition.range + Math.min(definition.leash, 80) : definition.range * 0.95,
    allies = e.state.units.filter((u) => u.owner === 'player')
  let best: { p: Point; score: number } | null = null
  for (let x = 56; x <= 1224; x += 16)
    for (let y = 100; y <= 900; y += 16) {
      let nearest = Infinity,
        coverage = 0
      for (const sample of samples) {
        const d = Math.hypot(sample.x - x, sample.y - y)
        if (d < nearest) nearest = d
        // The middle and late road give allies time to work; the very end is the castle's doorstep.
        if (d <= reach) coverage += rearGuard ? (sample.share >= 0.85 ? 1 : 0) : 0.6 + Math.min(sample.share, 0.85)
      }
      if (melee && (nearest < 34 || nearest > 60)) continue
      if (!melee && nearest < 40) continue
      const cohesion = allies.length ? Math.min(...allies.map((u) => Math.hypot(u.homeX - x, u.homeY - y))) : 0,
        score = coverage - (rearGuard ? 0 : Math.max(0, cohesion - 220) * 0.05)
      if (best && score <= best.score) continue
      const p = { x, y }
      if (!e.previewPlacement(type, p).valid) continue
      best = { p, score }
    }
  return best?.p ?? null
}

/** With a big roster (総力戦) the longest bows guard the castle against whatever slips through. */
const REAR_GUARD: readonly AllyType[] = ['ranger', 'frost']
function deploy(e: GameEngine, type: AllyType, samples: (Point & { share: number })[], roster = 0): boolean {
  const spot = bestSpot(e, type, samples, roster >= 8 && REAR_GUARD.includes(type))
  return !!spot && e.place(type, spot)
}

/**
 * Buy in a fixed order, saving for the next item rather than skipping it: every planned ally, then levels
 * 2, a weapon for the ranged damage dealers, level 3, the gate, the remaining gear and level 4.
 */
function spend(
  e: GameEngine,
  save: ReturnType<typeof freshRunFromProfile>,
  plan: Plan,
  samples: (Point & { share: number })[]
): number {
  const before = save.gold,
    allies = () =>
      e.state.units
        .filter((u) => u.owner === 'player' && u.hp > 0)
        .sort((a, b) => plan.types.indexOf(a.type as AllyType) - plan.types.indexOf(b.type as AllyType)),
    ranged = (u: { type: string }) => !MELEE.includes(u.type as AllyType) && u.type !== 'healer'
  for (const type of plan.types) {
    if (e.state.units.some((u) => u.owner === 'player' && u.type === type)) continue
    if (save.gold < DEPLOYMENT_COST) return before - save.gold
    deploy(e, type, samples, plan.types.length)
  }
  const level = (to: number) => () => {
    for (const u of allies()) {
      while ((u.level ?? 1) < to) {
        if (save.gold < upgradeCost(u.level ?? 1) || !e.upgradeDefender(u.id)) return false
      }
    }
    return true
  }
  const gear = (filter: (u: { type: string }) => boolean) => () => {
    for (const u of allies().filter(filter)) {
      if (u.equipment) continue
      if (!e.equipDefender(u.id, ranged(u) ? 'weapon' : 'armor')) return false
    }
    return true
  }
  const gate = (kind: 'cannon' | 'armor', to: number) => () => {
    const g = e.state.fortifications!.gate
    while ((kind === 'cannon' ? g.cannonLevel : g.armorLevel) < to) if (!e.upgradeGate(kind)) return false
    return true
  }
  for (const tier of [
    level(2),
    gear(ranged),
    level(3),
    gate('cannon', 1),
    gate('armor', 1),
    gear(() => true),
    level(4),
    gate('cannon', 3),
    gate('armor', 3)
  ])
    if (!tier()) break
  return before - save.gold
}

function castSpecials(e: GameEngine): void {
  const foes = e.state.units.filter((u) => u.owner === 'ai' && u.hp > 0)
  for (const u of e.state.units.filter((u) => u.owner === 'player' && u.hp > 0)) {
    if (!specialReady(e.state, u.id)) continue
    const spec = SPECIALS[u.type as keyof typeof SPECIALS]
    if (u.type === 'healer') {
      const hurt = e.state.units.find(
        (v) => v.owner === 'player' && v.hp > 0 && v.maxHp - v.hp > 25 && Math.hypot(v.x - u.x, v.y - u.y) <= spec.range
      )
      if (hurt) e.castSpecial(u.id, hurt)
      continue
    }
    const inRange = foes.filter((v) => Math.hypot(v.x - u.x, v.y - u.y) <= spec.range)
    const crowd = (t: (typeof foes)[number]) =>
      (t.boss ? 1000 : 0) + foes.filter((v) => Math.hypot(v.x - t.x, v.y - t.y) < spec.radius).length * 100
    inRange.sort((a, b) => crowd(b) - crowd(a))
    const t = inRange[0]
    if (t && (t.boss || inRange.length >= 2)) if (e.castSpecial(u.id, t)) break
  }
}

/** Coins and recruits between stages, then the five ally types to field. */
function prepareFormation(progress: StageProgress, kind: PlayerKind): void {
  if (kind !== 'competent') return
  for (const type of RECRUIT_ORDER) recruit(progress, type)
  const have = owned(progress)
  progress.formation = FORMATION_PREFERENCE.filter((t) => have.includes(t)).slice(0, FORMATION_SLOTS)
}

export async function playStage(
  stage: number,
  progress: StageProgress,
  kind: PlayerKind,
  options: { seed?: number; weakUnits?: number } = {}
): Promise<StageLog> {
  let clock = 0
  prepareFormation(progress, kind)
  const save = freshRunFromProfile({ version: 1, purchased: [...progress.recruited] }, 2, 1)
  save.gold = stageStartGold(stage)
  save.formation = battleFormation(progress, stage)
  const e = new GameEngine(
    new RuleBasedAI(),
    save,
    'meadow',
    options.seed ?? 20261003 + stage,
    () => clock,
    DRAGON_BREATH_MOUTHS,
    2,
    REAL_LAYOUT
  )
  if (!e.startAtStage(stage)) throw new Error(`startAtStage(${stage}) refused`)
  if (e.state.waveBossPolicy !== CURRENT_WAVE_BOSS_POLICY) throw new Error('unexpected wave policy')
  const samples = roadSamples(e.state),
    fielded = save.formation!.filter((t) => FORMATION_PREFERENCE.includes(t))
  const plan: Plan =
    kind === 'competent'
      ? { types: FORMATION_PREFERENCE.filter((t) => fielded.includes(t)), frugal: false }
      : { types: ['soldier', 'archer', 'tank'], frugal: true, opening: options.weakUnits ?? 2 }
  if (plan.frugal) {
    for (let i = 0; i < plan.opening!; i++) deploy(e, plan.types[i % plan.types.length], samples)
  } else spend(e, save, plan, samples)
  const rules = stageRules(stage, e.state.waveBossPolicy),
    waves = rules.waves!
  let earlyCalls = 0,
    midBattleSpend = 0,
    goldEarned = 0,
    bounty = 0,
    handledBreak = -1,
    minHp = e.state.playerBaseHp,
    peakEnemies = 0,
    lastEvent = 0,
    longestQuiet = 0,
    seenSpawned = 0,
    seenResolved = 0
  const waveFirstSpawn: number[] = [],
    waveLastSpawn: number[] = [],
    waveCleared: number[] = [],
    waveHp: number[] = []
  if (!e.startAssault()) throw new Error('startAssault refused')
  for (let i = 0; i < 40000 && e.state.phase === 'assault'; i++) {
    clock += 50
    e.update(0.05)
    const s = e.state
    for (const gain of e.takeGoldGains()) {
      goldEarned += gain.amount
      if (gain.kind === 'kill') bounty += gain.boss ? bountyFor(rules.bossType!, true) : (gain.amount - 2) / 2
    }
    minHp = Math.min(minHp, s.playerBaseHp)
    peakEnemies = Math.max(peakEnemies, s.units.filter((u) => u.owner === 'ai' && u.hp > 0).length)
    const wave = waveStatus(s)!
    if (s.enemiesSpawned !== seenSpawned || s.enemiesResolved !== seenResolved) {
      let boundary = 0
      for (let w = 0; w < waves.length; w++) {
        boundary += waves[w]
        if (seenSpawned < boundary - waves[w] + 1 && s.enemiesSpawned >= boundary - waves[w] + 1)
          waveFirstSpawn[w] = s.time
        if (seenSpawned < boundary && s.enemiesSpawned >= boundary) waveLastSpawn[w] = s.time
        if (seenResolved < boundary && s.enemiesResolved >= boundary) {
          waveCleared[w] = s.time
          waveHp[w] = Math.round(s.playerBaseHp)
        }
      }
      seenSpawned = s.enemiesSpawned
      seenResolved = s.enemiesResolved
      lastEvent = s.time
    } else if (!wave.inBreak) longestQuiet = Math.max(longestQuiet, s.time - lastEvent)
    else lastEvent = s.time
    if (!plan.frugal) {
      if (wave.inBreak && e.buildWindowOpen && handledBreak !== wave.wave) {
        handledBreak = wave.wave
        midBattleSpend += spend(e, save, plan, samples)
        // Confident with a healthy castle: skip every other break for the bonus.
        if (s.playerBaseHp >= 85 && wave.wave % 2 === 0 && e.callNextWave() > 0) earlyCalls++
      }
      if (i % 10 === 0) castSpecials(e)
    }
    for (let j = 0; j < 12; j++) await Promise.resolve()
  }
  const s = e.state
  if (s.result === 'win') awardStageClear(progress, stage, bounty)
  else awardBounty(progress, bounty)
  return {
    stage,
    result: s.phase,
    seconds: Math.round(s.time),
    hp: Math.round(s.playerBaseHp),
    minHp: Math.round(minHp),
    waves: waves.length,
    enemies: rules.enemyCount,
    defenders: s.units.filter((u) => u.owner === 'player').length,
    goldEarned,
    earlyCalls,
    midBattleSpend,
    waveSpawnSeconds: waves.map((_, w) =>
      waveLastSpawn[w] === undefined ? NaN : Math.round(waveLastSpawn[w] - waveFirstSpawn[w])
    ),
    waveSeconds: waves.map((_, w) =>
      waveFirstSpawn[w] === undefined ? NaN : Math.round((waveCleared[w] ?? s.time) - waveFirstSpawn[w])
    ),
    longestQuiet: Math.round(longestQuiet),
    peakEnemies,
    waveHp: waves.map((_, w) => waveHp[w] ?? Math.round(s.playerBaseHp))
  }
}

/** Stage progress a competent player would have before `stage` (coin bounty estimated at two per enemy). */
export function progressBefore(stage: number): StageProgress {
  const progress = freshStageProgress()
  for (let k = 1; k < stage; k++) {
    prepareFormation(progress, 'competent')
    awardStageClear(progress, k, stageRules(k, CURRENT_WAVE_BOSS_POLICY).enemyCount * 2)
  }
  return progress
}

/** Stage select in order 1..`last`, each stage a fresh battle; stops at the first defeat. */
export async function playCampaign(kind: PlayerKind, last = 10, options: { weakUnits?: number } = {}) {
  const progress = freshStageProgress(),
    logs: StageLog[] = []
  for (let stage = 1; stage <= last; stage++) {
    const log = await playStage(stage, progress, kind, options)
    logs.push(log)
    if (log.result === 'defeat') break
  }
  return logs
}

export function table(title: string, logs: StageLog[]): string {
  const pad = (v: unknown, n: number) => String(v).padStart(n)
  return [
    title,
    'stage | result  | sec | HP  | minHP | waves | foes | allies | waveG | early | mid | peak | quiet | spawn s / wave s',
    ...logs.map(
      (l) =>
        `${pad(l.stage, 5)} | ${l.result.padEnd(7)} | ${pad(l.seconds, 3)} | ${pad(l.hp, 3)} | ${pad(l.minHp, 5)} | ${pad(l.waves, 5)} | ${pad(l.enemies, 4)} | ${pad(l.defenders, 6)} | ${pad(l.goldEarned, 5)} | ${pad(l.earlyCalls, 5)} | ${pad(l.midBattleSpend, 3)} | ${pad(l.peakEnemies, 4)} | ${pad(l.longestQuiet, 5)} | ${l.waveSpawnSeconds.join(',')} / ${l.waveSeconds.join(',')} / hp ${l.waveHp.join(',')}`
    )
  ].join('\n')
}
