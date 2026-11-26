import { describe, it, expect } from 'vitest'
import { SPECIALS, specialReady } from '../src/game/SpecialAbilities'
import {
  BOSS_KILL_GOLD,
  CONFIG,
  CURRENT_WAVE_BOSS_POLICY,
  ENEMY_TYPES,
  MAX_WAVE_GOLD,
  WAVE_BREAK_SECONDS,
  deploymentBlockReasons,
  getLegalAIActions,
  killGold,
  serializeStateForAI,
  stageRules,
  waveStatus,
  type AllyType,
  type GameState
} from '../src/game/model'
import { DRAGON_BREATH_MOUTHS } from '../src/rendering/DragonBreathArt'
import { GameEngine } from '../src/game/GameEngine'
import { RuleBasedAI } from '../src/ai/AIController'
import { validateCampaignCheckpoint, type CampaignCheckpoint } from '../src/game/CampaignCheckpoint'
import { MAX_RUN_GOLD } from '../src/progression/ProgressionData'
import { stageStartGold } from '../src/progression/StageProgress'
import {
  availableAllies,
  freshProfile,
  freshRunFromProfile,
  resumeProgress,
  scout,
  upgradeCost
} from '../src/progression/UpgradeSystem'
import { DEPLOYMENT_COST } from '../src/game/DefenderRoster'

const OFFSETS: Record<AllyType, [number, number]> = {
  tank: [0, 0],
  soldier: [-42, 0],
  runner: [42, 0],
  archer: [-145, 0],
  mage: [145, 0],
  healer: [0, 170],
  frost: [-140, 120],
  ranger: [140, 120],
  cannon: [-145, 60],
  paladin: [0, -60]
}
const ORDER: AllyType[] = [
  'tank',
  'soldier',
  'runner',
  'archer',
  'mage',
  'cannon',
  'frost',
  'ranger',
  'paladin',
  'healer'
]
const ANCHOR = 180

interface StageLog {
  stage: number
  result: GameState['phase']
  seconds: number
  hp: number
  waves: number
  enemies: number
  goldEarned: number
  earlyCalls: number
  midBattleSpend: number
}

function deployMissing(e: GameEngine, save: ReturnType<typeof freshRunFromProfile>, stage: number): number {
  let spent = 0
  for (const type of ORDER) {
    if (!availableAllies(save, stage).includes(type)) continue
    if (e.state.units.some((u) => u.owner === 'player' && u.type === type)) continue
    const [dx, dy] = OFFSETS[type],
      p = { x: 640 + dx, y: ANCHOR + dy }
    if (e.previewPlacement(type, p).valid && e.place(type, p)) spent += DEPLOYMENT_COST
  }
  return spent
}

/** Upgrade the cheapest-to-raise damage dealers first (casters, then archers), keeping a 40 G deploy reserve. */
function upgradeRoster(e: GameEngine, save: ReturnType<typeof freshRunFromProfile>): number {
  let spent = 0
  const priority: AllyType[] = ['cannon', 'mage', 'archer', 'ranger', 'frost', 'tank', 'soldier', 'runner', 'paladin']
  for (let pass = 0; pass < 3; pass++)
    for (const type of priority) {
      const unit = e.state.units.find((u) => u.owner === 'player' && u.type === type && u.hp > 0)
      if (!unit) continue
      const cost = upgradeCost(unit.level ?? 1)
      if (!Number.isFinite(cost) || save.gold < cost) continue
      if (e.upgradeDefender(unit.id)) spent += cost
    }
  return spent
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

async function playCampaign(mode: 'competent' | 'lazy', seed = 42): Promise<StageLog[]> {
  let clock = 0
  const save = freshRunFromProfile(freshProfile(), 2, 1),
    e = new GameEngine(new RuleBasedAI(), save, 'meadow', seed, () => clock, DRAGON_BREATH_MOUTHS, 2, 1),
    logs: StageLog[] = []
  expect(e.state.waveBossPolicy).toBe(CURRENT_WAVE_BOSS_POLICY)
  for (let stage = 1; stage <= 10; stage++) {
    if (mode === 'competent') {
      if (stage > 1 && save.gold >= 120) scout(save, () => 0, e.state)
      deployMissing(e, save, stage)
      upgradeRoster(e, save)
    } else if (stage === 1) {
      for (const type of ['tank', 'soldier'] as AllyType[]) {
        const [dx, dy] = OFFSETS[type]
        e.place(type, { x: 640 + dx, y: ANCHOR + dy })
      }
    }
    const before = e.state.waveGold ?? 0
    let earlyCalls = 0,
      midBattleSpend = 0,
      handledBreak = -1
    expect(e.startAssault()).toBe(true)
    for (let i = 0; i < 20000 && e.state.phase === 'assault'; i++) {
      clock += 50
      e.update(0.05)
      if (mode === 'competent') {
        const wave = waveStatus(e.state)!
        if (wave.inBreak && e.buildWindowOpen && handledBreak !== wave.wave) {
          handledBreak = wave.wave
          midBattleSpend += deployMissing(e, save, stage) + upgradeRoster(e, save)
          // Confident with a healthy castle: skip the second wave's break for the bonus.
          if (e.state.playerBaseHp >= 90 && wave.wave === 2 && stage >= 3 && e.callNextWave() > 0) earlyCalls++
        }
        if (i % 20 === 0) castSpecials(e)
      }
      for (let j = 0; j < 12; j++) await Promise.resolve()
    }
    const rules = stageRules(stage, e.state.waveBossPolicy)
    logs.push({
      stage,
      result: e.state.phase,
      seconds: Math.round(e.state.time),
      hp: Math.round(e.state.playerBaseHp),
      waves: rules.waves!.length,
      enemies: rules.enemyCount,
      goldEarned: (e.state.waveGold ?? 0) - before,
      earlyCalls,
      midBattleSpend
    })
    if (!e.nextStage()) break
  }
  return logs
}

function table(title: string, logs: StageLog[]): string {
  return [
    title,
    'stage | result  | sec | baseHP | waves | enemies | waveG | early | midSpend',
    ...logs.map(
      (l) =>
        `${String(l.stage).padStart(5)} | ${l.result.padEnd(7)} | ${String(l.seconds).padStart(3)} | ${String(l.hp).padStart(6)} | ${String(l.waves).padStart(5)} | ${String(l.enemies).padStart(7)} | ${String(l.goldEarned).padStart(5)} | ${String(l.earlyCalls).padStart(5)} | ${String(l.midBattleSpend).padStart(8)}`
    )
  ].join('\n')
}

describe('wave campaign (policy 5)', () => {
  it('plans 3 to 7 waves per stage with the boss closing the final wave', () => {
    for (let stage = 1; stage <= 10; stage++) {
      const rules = stageRules(stage, 5)
      expect(rules.waves!.reduce((a, b) => a + b, 0)).toBe(rules.enemyCount)
      expect(rules.enemyCount).toBeLessThanOrEqual(70)
      expect(rules.spawnInterval).toBeGreaterThanOrEqual(1)
      expect(rules.spawnInterval).toBeLessThanOrEqual(1.8)
    }
    expect(stageRules(1, 5).waves).toHaveLength(3)
    expect(stageRules(10, 5).waves).toHaveLength(7)
    expect(stageRules(1, 5).enemyCount).toBe(24)
    expect(stageRules(10, 5).enemyCount).toBe(67)
    for (const policy of [1, 2, 3, 4] as const)
      for (let stage = 1; stage <= 10; stage++) expect(stageRules(stage, policy).waves).toBeUndefined()
  })

  it('a competent player who spends kill gold between waves clears all ten stages', async () => {
    const logs = await playCampaign('competent')
    console.log(table('competent player (seed 42)', logs))
    expect(logs).toHaveLength(10)
    expect(logs.at(-1)!.result).toBe('victory')
    for (const log of logs.slice(0, -1)) expect(log.result, `stage ${log.stage}`).toBe('cleared')
    expect(logs[0].seconds).toBeGreaterThanOrEqual(60)
    expect(logs[0].seconds).toBeLessThanOrEqual(90)
    for (const log of logs.slice(1, 4)) {
      expect(log.seconds, `stage ${log.stage}`).toBeGreaterThanOrEqual(60)
      expect(log.seconds, `stage ${log.stage}`).toBeLessThanOrEqual(300)
    }
    for (const log of logs.slice(4)) {
      expect(log.seconds, `stage ${log.stage}`).toBeGreaterThanOrEqual(120)
      expect(log.seconds, `stage ${log.stage}`).toBeLessThanOrEqual(300)
    }
    // The castle is threatened somewhere in the middle or late campaign.
    expect(logs.slice(3).some((log) => log.hp < 100)).toBe(true)
    expect(logs.every((log) => log.goldEarned > 0)).toBe(true)
    expect(logs.some((log) => log.earlyCalls > 0)).toBe(true)
    expect(logs.some((log) => log.midBattleSpend > 0)).toBe(true)
  }, 600000)

  it('a lazy player with two cheap allies who never spends falls by stage 4', async () => {
    const logs = await playCampaign('lazy')
    console.log(table('lazy player (seed 42)', logs))
    const lost = logs.find((log) => log.result === 'defeat')
    expect(lost).toBeDefined()
    expect(lost!.stage).toBeLessThanOrEqual(4)
  }, 600000)
})

const idle = { decide: async () => null }
/** A policy-5 stage-1 assault on the classic layout with two allies and a scripted enemy commander. */
function waveBattle() {
  const save = freshRunFromProfile(freshProfile(), 2, 1),
    engine = new GameEngine(idle, save, 'meadow', 42, () => 0, DRAGON_BREATH_MOUTHS, 2, 1)
  for (const type of ['tank', 'archer'] as AllyType[]) {
    const [dx, dy] = OFFSETS[type]
    expect(engine.place(type, { x: 640 + dx, y: ANCHOR + dy })).toBe(true)
  }
  expect(engine.startAssault()).toBe(true)
  return { engine, save }
}
/** Spawn one legal slime (ignoring cadence and cooldowns, as the director tests do). */
function spawnSlime(engine: GameEngine): boolean {
  const s = engine.state
  s.nextSpawnAt = 0
  for (const type of ENEMY_TYPES) s.cooldowns[type] = 0
  const action = getLegalAIActions(s).find((candidate) => candidate.type === 'spawn' && candidate.unitType === 'slime')
  return !!action && engine.applyAIAction(action)
}
function killAll(engine: GameEngine) {
  for (const unit of engine.state.units) if (unit.owner === 'ai') unit.hp = 0
  engine.update(1 / 60)
}
function roundTrip(checkpoint: CampaignCheckpoint) {
  const raw = JSON.parse(JSON.stringify(checkpoint))
  return GameEngine.fromCheckpoint(raw, idle, resumeProgress(raw.profile, raw.progress), () => 0, DRAGON_BREATH_MOUTHS)
}

describe('wave gating, breaks and battle gold', () => {
  it('opens a wave only after the previous one is resolved and its break has elapsed', () => {
    const { engine } = waveBattle(),
      s = engine.state,
      [first] = stageRules(1, 5).waves!
    for (let i = 0; i < first - 1; i++) expect(spawnSlime(engine)).toBe(true)
    // One slot left in wave 1: a two-member formation would spill into wave 2.
    s.nextSpawnAt = 0
    for (const type of ENEMY_TYPES) s.cooldowns[type] = 0
    const skirmish = { type: 'formation', formationId: 'skirmish', routeId: 'left' } as const
    expect(deploymentBlockReasons(s, skirmish)).toContainEqual({
      code: 'wave-count',
      wave: 1,
      required: 2,
      available: 1
    })
    expect(spawnSlime(engine)).toBe(true)
    expect(waveStatus(s)).toMatchObject({ wave: 1, nextWave: 2, inBreak: false })
    // Wave 1 is still on the field: wave 2 waits.
    s.nextSpawnAt = 0
    expect(deploymentBlockReasons(s, { type: 'spawn', unitType: 'slime', routeId: 'left' })).toContainEqual({
      code: 'wave-break',
      wave: 2,
      remaining: null
    })
    expect(getLegalAIActions(s)).toEqual([])
    killAll(engine)
    expect(s.waveBreak?.wave).toBe(2)
    expect(s.waveBreak!.until).toBeCloseTo(s.time + WAVE_BREAK_SECONDS, 6)
    expect(waveStatus(s)).toMatchObject({ wave: 2, nextWave: 2, inBreak: true })
    expect(getLegalAIActions(s)).toEqual([])
    expect(serializeStateForAI(s).wave).toMatchObject({ waves: stageRules(1, 5).waves, currentWave: 2 })
    // The break elapses by itself.
    for (let i = 0; i < WAVE_BREAK_SECONDS * 60 + 2; i++) engine.update(1 / 60)
    s.nextSpawnAt = 0
    expect(getLegalAIActions(s).length).toBeGreaterThan(0)
    expect(spawnSlime(engine)).toBe(true)
    expect(s.waveBreak).toBeUndefined()
    expect(waveStatus(s)).toMatchObject({ wave: 2, inBreak: false })
  })

  it('pays kill gold (not for leaks), regroups allies and lets the player build or call the next wave early', () => {
    const { engine, save } = waveBattle(),
      s = engine.state,
      [first] = stageRules(1, 5).waves!
    for (let i = 0; i < first; i++) expect(spawnSlime(engine)).toBe(true)
    const goldBefore = save.gold,
      archer = s.units.find((unit) => unit.owner === 'player' && unit.type === 'archer')!,
      tank = s.units.find((unit) => unit.owner === 'player' && unit.type === 'tank')!
    archer.hp = 0
    tank.hp = tank.maxHp / 3
    engine.update(1 / 60)
    expect(s.corpses.some((corpse) => corpse.id === archer.id)).toBe(true)
    expect(engine.buildWindowOpen).toBe(false)
    expect(engine.place('runner', { x: 640 + 42, y: ANCHOR })).toBe(false)
    killAll(engine)
    expect(save.gold - goldBefore).toBe(first * killGold('slime', false))
    expect(s.waveGold).toBe(first * killGold('slime', false))
    const gains = engine.takeGoldGains()
    expect(gains).toHaveLength(first)
    expect(gains.every((gain) => gain.kind === 'kill' && gain.amount === killGold('slime', false))).toBe(true)
    expect(engine.takeGoldGains()).toEqual([])
    // Every ally, fallen ones included, regroups at full health for the next wave.
    expect(archer.hp).toBe(archer.maxHp)
    expect(tank.hp).toBe(tank.maxHp)
    expect(s.corpses.some((corpse) => corpse.id === archer.id)).toBe(false)
    // Build between waves.
    expect(engine.buildWindowOpen).toBe(true)
    const beforeBuild = save.gold
    expect(engine.place('runner', { x: 640 + 42, y: ANCHOR })).toBe(true)
    expect(save.gold).toBe(beforeBuild - DEPLOYMENT_COST)
    const runner = s.units.find((unit) => unit.owner === 'player' && unit.type === 'runner')!
    expect(runner.hasFought).toBe(true)
    expect(runner.battleRelocation?.anchor).toEqual({ x: runner.homeX, y: runner.homeY })
    save.gold += upgradeCost(1)
    s.waveGold = (s.waveGold ?? 0) + upgradeCost(1)
    expect(engine.upgradeDefender(runner.id)).toBe(true)
    expect(runner.level).toBe(2)
    // Call the next wave early for a bonus that shrinks with the remaining break.
    for (let i = 0; i < 120; i++) engine.update(1 / 60)
    const remaining = s.waveBreak!.until - s.time,
      gold = save.gold,
      bonus = engine.callNextWave()
    expect(bonus).toBe(Math.ceil(remaining * 2 - 1e-9))
    expect(bonus).toBeGreaterThan(0)
    expect(save.gold).toBe(gold + bonus)
    expect(engine.takeGoldGains()).toMatchObject([{ kind: 'early-call', amount: bonus }])
    expect(engine.callNextWave()).toBe(0)
    expect(engine.buildWindowOpen).toBe(false)
    expect(engine.place('soldier', { x: 640 - 42, y: ANCHOR })).toBe(false)
    expect(spawnSlime(engine)).toBe(true)
    // A leak resolves the enemy without paying gold.
    const leak = s.units.find((unit) => unit.owner === 'ai')!
    leak.gateExit = { attackId: 'leak', exitAt: s.time }
    const leakGold = save.gold
    engine.update(1 / 60)
    expect(s.units).not.toContain(leak)
    expect(save.gold).toBe(leakGold)
    expect(engine.takeGoldGains()).toEqual([])
  })

  it('pays the boss bounty and lets the director spend every wave within its budget', () => {
    const { engine, save } = waveBattle(),
      s = engine.state
    s.stage = s.stageSummary.stage = 3
    const rules = stageRules(3, 5)
    let guard = 0
    while (s.enemiesSpawned < rules.enemyCount && guard++ < 500) {
      s.time += 20
      s.nextSpawnAt = 0
      for (const type of ENEMY_TYPES) s.cooldowns[type] = 0
      if (s.waveBreak) engine.callNextWave()
      const legal = getLegalAIActions(s).filter((action) => action.type !== 'wait')
      if (!legal.length) {
        killAll(engine)
        continue
      }
      expect(engine.applyAIAction(legal.at(-1))).toBe(true)
    }
    expect(s.enemiesSpawned).toBe(rules.enemyCount)
    expect(s.budgetSpent).toBeLessThanOrEqual(rules.spawnBudget)
    const boss = s.units.find((unit) => unit.boss)!
    expect(boss.type).toBe(rules.bossType)
    const gold = save.gold
    killAll(engine)
    expect(save.gold - gold).toBeGreaterThanOrEqual(BOSS_KILL_GOLD)
    expect(s.result).toBe('win')
  })

  it('keeps every checkpoint of a long wave stage valid, resumable and bounded', async () => {
    let clock = 0
    const stage = 6,
      save = freshRunFromProfile(freshProfile(), 2, 1)
    save.gold = stageStartGold(stage)
    const engine = new GameEngine(new RuleBasedAI(), save, 'meadow', 7, () => clock, DRAGON_BREATH_MOUTHS, 2, 1),
      s = engine.state
    expect(engine.startAtStage(stage)).toBe(true)
    deployMissing(engine, save, stage)
    upgradeRoster(engine, save)
    expect(engine.startAssault()).toBe(true)
    let breakCheckpoint: CampaignCheckpoint | null = null,
      exports = 0
    for (let i = 0; i < 12000 && s.phase === 'assault'; i++) {
      clock += 50
      engine.update(0.05)
      // Keep the castle standing (and its damage record consistent) so the run reaches the last wave.
      s.playerBaseHp = CONFIG.baseHp
      s.stageSummary.baseDamage = 0
      for (let j = 0; j < 12; j++) await Promise.resolve()
      if (i % 40 === 0) {
        expect(engine.exportCheckpoint(), `t=${s.time.toFixed(1)}`).not.toBeNull()
        exports++
      }
      if (!breakCheckpoint && s.waveBreak && engine.buildWindowOpen && s.enemiesSpawned > 20) {
        deployMissing(engine, save, stage)
        upgradeRoster(engine, save)
        breakCheckpoint = engine.exportCheckpoint()
        expect(breakCheckpoint).not.toBeNull()
      }
    }
    expect(s.result).toBe('win')
    expect(s.enemiesSpawned).toBe(stageRules(stage, 5).enemyCount)
    expect(exports).toBeGreaterThan(10)
    expect(engine.exportCheckpoint()).not.toBeNull()
    const saved = breakCheckpoint!,
      resumed = roundTrip(saved)!
    expect(resumed).not.toBeNull()
    expect(resumed.state.waveBreak).toEqual(saved.state.waveBreak)
    expect(resumed.state.waveGold).toBe(saved.state.waveGold)
    expect(resumed.buildWindowOpen).toBe(true)
    expect(resumed.exportCheckpoint()).toEqual(saved)
    const validate = (value: any) => validateCampaignCheckpoint(value, value.progress, value.profile)
    const late = structuredClone(saved) as any
    late.state.waveBreak.until = late.state.time + WAVE_BREAK_SECONDS + 1
    expect(validate(late)).toBeNull()
    const wrongWave = structuredClone(saved) as any
    wrongWave.state.waveBreak.wave++
    expect(validate(wrongWave)).toBeNull()
    const legacy = structuredClone(saved) as any
    legacy.state.waveBossPolicy = 4
    expect(validate(legacy)).toBeNull()
    const v20 = structuredClone(saved) as any
    v20.version = 20
    expect(validate(v20)).toBeNull()
    const rich = structuredClone(saved) as any
    rich.progress.gold += saved.state.waveGold! + 1000
    expect(validate(rich)).toBeNull()
    expect(MAX_RUN_GOLD).toBeGreaterThan(MAX_WAVE_GOLD)
  }, 120000)
})
