import { describe, it, expect } from 'vitest'
import {
  BOSS_KILL_GOLD,
  CONFIG,
  DEFINITIONS,
  WAVE_ROAD_SPEED_FACTOR,
  baseDamageFactor,
  combatStats,
  enemyWalkSpeed,
  getField,
  ENEMY_TYPES,
  MAX_WAVE_GOLD,
  WAVE_BREAK_SECONDS,
  deploymentBlockReasons,
  getLegalAIActions,
  killGold,
  serializeStateForAI,
  stageRules,
  waveClearGold,
  waveStatus,
  WAVE_BOSS_BREACH,
  type AllyType
} from '../src/game/model'
import { DRAGON_BREATH_MOUTHS } from '../src/rendering/DragonBreathArt'
import { playCampaign, playStage, progressBefore, table, type StageLog } from './wave-balance-harness'
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
  upgradeCost
} from '../src/progression/UpgradeSystem'
import { DEPLOYMENT_COST } from '../src/game/DefenderRoster'
import { COMMANDER_SUPPORT } from '../src/game/CommanderSupport'

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

describe('wave campaign (policy 5)', () => {
  it('plans 3 to 6 waves per stage with the boss closing the final wave', () => {
    for (let stage = 1; stage <= 10; stage++) {
      const rules = stageRules(stage, 5)
      expect(rules.waves!.reduce((a, b) => a + b, 0)).toBe(rules.enemyCount)
      expect(rules.enemyCount).toBeLessThanOrEqual(70)
      // Below the one-second decision cadence: per-type cooldowns pace a wave, not a global gap.
      expect(rules.spawnInterval).toBeLessThan(CONFIG.decisionInterval)
    }
    expect(stageRules(1, 5).waves).toHaveLength(3)
    expect(stageRules(10, 5).waves).toHaveLength(6)
    expect(stageRules(1, 5).enemyCount).toBe(24)
    expect(stageRules(10, 5).enemyCount).toBe(55)
    for (const policy of [1, 2, 3, 4] as const)
      for (let stage = 1; stage <= 10; stage++) expect(stageRules(stage, policy).waves).toBeUndefined()
  })

  it('a competent stage-select player clears all ten stages on the real road with a paced, threatening curve', async () => {
    /** Pacing targets every stage meets, on any seed. */
    const checkPacing = (log: StageLog, label: string) => {
      // Every wave pours onto the field within 20 s, resolves within about a minute and a half,
      // and nothing stalls for half a minute while a wave is on.
      for (const seconds of log.waveSpawnSeconds) expect(seconds, `${label} spawn`).toBeLessThanOrEqual(20)
      for (const seconds of log.waveSeconds) expect(seconds, `${label} wave`).toBeLessThanOrEqual(90)
      expect(log.longestQuiet, `${label} quiet`).toBeLessThan(30)
      expect(log.peakEnemies, `${label} swarm`).toBeGreaterThanOrEqual(6)
      expect(log.goldEarned, `${label} gold`).toBeGreaterThan(0)
    }
    const logs = await playCampaign('competent')
    console.log(table('competent player, layout 4, stage select', logs))
    expect(logs).toHaveLength(10)
    expect(logs.at(-1)!.result).toBe('victory')
    for (const log of logs.slice(0, -1)) expect(log.result, `stage ${log.stage}`).toBe('cleared')
    // Stage 1 is a short tutorial; the finale runs three to about five and a half minutes.
    expect(logs[0].seconds).toBeGreaterThanOrEqual(90)
    expect(logs[0].seconds).toBeLessThanOrEqual(150)
    expect(logs[9].seconds).toBeGreaterThanOrEqual(180)
    expect(logs[9].seconds).toBeLessThanOrEqual(330)
    for (const log of logs) checkPacing(log, `stage ${log.stage}`)
    for (const seconds of logs[0].waveSeconds) expect(seconds).toBeLessThanOrEqual(60)
    // Even optimized play is threatened somewhere from stage 4 on (the medium player carries the tension target).
    expect(logs.slice(3).filter((log) => log.minHp < 80).length).toBeGreaterThanOrEqual(1)
    expect(logs.some((log) => log.earlyCalls > 0)).toBe(true)
    expect(logs.some((log) => log.midBattleSpend > 0)).toBe(true)
    // One seed can hinge on a single moment, so the three hardest stages also have to hold on two more seeds.
    for (const offset of [1000, 2000]) {
      const late = []
      for (const stage of [8, 9, 10])
        late.push(await playStage(stage, progressBefore(stage), 'competent', { seed: 20261003 + stage + offset }))
      console.log(table(`competent player, stages 8-10, seed offset ${offset}`, late))
      for (const log of late) {
        expect(log.result, `stage ${log.stage} +${offset}`).toBe(log.stage === 10 ? 'victory' : 'cleared')
        checkPacing(log, `stage ${log.stage} +${offset}`)
      }
      expect(late[2].seconds).toBeGreaterThanOrEqual(180)
      expect(late[2].seconds).toBeLessThanOrEqual(330)
    }
  }, 1800000)

  it('a medium (reasonable human) player clears every stage on two of three seeds while the castle is threatened', async () => {
    const seeds = [0, 1000, 2000],
      byStage = new Map<number, StageLog[]>()
    let tenseSeeds = 0
    for (const offset of seeds) {
      const logs: StageLog[] = []
      // Stages 1-4 are the tutorial stretch: one seed is enough there; the extra seeds play 5-10.
      for (let stage = offset ? 5 : 1; stage <= 10; stage++) {
        const log = await playStage(stage, progressBefore(stage, 'medium'), 'medium', {
          seed: 20261003 + stage + offset
        })
        logs.push(log)
        byStage.set(stage, [...(byStage.get(stage) ?? []), log])
      }
      console.log(table(`medium player, seed offset ${offset}`, logs))
      if (logs.filter((log) => log.stage >= 5 && log.minHp < 70).length >= 3) tenseSeeds++
      for (const log of logs) expect(log.earlyCalls + log.midBattleSpend, `stage ${log.stage}`).toBeGreaterThan(0)
    }
    for (const [stage, logs] of byStage) {
      const wins = logs.filter((log) => log.result !== 'defeat').length
      expect(wins, `stage ${stage}`).toBeGreaterThanOrEqual(stage <= 4 ? 1 : 2)
    }
    // Tension: on at least two seeds the castle dips below 70 HP in three or more of stages 5-10.
    expect(tenseSeeds).toBeGreaterThanOrEqual(2)
  }, 1800000)

  it('a weak player with two cheap allies who never spends falls on stage 2 or 3; three allies clear the tutorial', async () => {
    const weak = await playCampaign('weak', 4, { weakUnits: 2 })
    console.log(table('weak player, two allies', weak))
    expect(weak.at(-1)!.result).toBe('defeat')
    expect(weak.at(-1)!.stage).toBeGreaterThanOrEqual(2)
    expect(weak.at(-1)!.stage).toBeLessThanOrEqual(3)
    const tutorial = await playCampaign('weak', 1, { weakUnits: 3 })
    console.log(table('weak player, three allies', tutorial))
    expect(tutorial[0].result).toBe('cleared')
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

describe('wave road pacing and scaling (policy 5 only)', () => {
  it('speeds up walkers only on the policy-5 winding road and keeps their relative speeds', () => {
    for (const type of ENEMY_TYPES) {
      const base = DEFINITIONS[type].speed
      expect(enemyWalkSpeed(type, false, 5, 4)).toBeCloseTo(base * WAVE_ROAD_SPEED_FACTOR, 9)
      expect(enemyWalkSpeed(type, true, 5, 4)).toBeCloseTo(base * 0.8 * WAVE_ROAD_SPEED_FACTOR, 9)
      for (const policy of [1, 2, 3, 4] as const)
        for (const revision of [1, 2, 3, 4] as const) expect(enemyWalkSpeed(type, false, policy, revision)).toBe(base)
      expect(enemyWalkSpeed(type, false, 5, 1)).toBe(base)
    }
  })

  it('scales horde HP fully, attacks by half, keeps bosses on the classic scale and prices leaks by type', () => {
    for (let stage = 1; stage <= CONFIG.stages; stage++) {
      const rules = stageRules(stage, 5),
        classic = 1 + (stage - 1) * 0.1
      expect(rules.bossStrength).toBeCloseTo(classic, 9)
      expect(rules.attackStrength).toBeCloseTo(1 + (rules.strength - 1) * 0.5, 9)
      const goblin = combatStats({ owner: 'ai', type: 'goblin', boss: false }, stage, 1, 5)
      expect(goblin.maxHp).toBeCloseTo(DEFINITIONS.goblin.hp * rules.strength, 9)
      expect(goblin.attack).toBeCloseTo(DEFINITIONS.goblin.attack * rules.attackStrength! * 1.3, 9)
      // A leak costs the same share of a goblin hit on every stage.
      expect(goblin.attack * baseDamageFactor(stage, 5)).toBeCloseTo(DEFINITIONS.goblin.attack * 1.3 * 0.5, 9)
      if (rules.bossType) {
        const boss = combatStats({ owner: 'ai', type: rules.bossType, boss: true }, stage, 1, 5)
        expect(boss.maxHp).toBeCloseTo((DEFINITIONS[rules.bossType].hp * classic * 2.6) / 3, 9)
      }
      // Policies 1-4 keep one stage strength for HP, attacks and the castle.
      for (const policy of [1, 2, 3, 4] as const) {
        const legacy = stageRules(stage, policy)
        expect(legacy.attackStrength).toBeUndefined()
        expect(legacy.bossStrength).toBeUndefined()
        expect(baseDamageFactor(stage, policy)).toBe(1)
        expect(combatStats({ owner: 'ai', type: 'goblin', boss: false }, stage, 1, policy).attack).toBeCloseTo(
          DEFINITIONS.goblin.attack * legacy.strength * 1.3,
          9
        )
      }
    }
  })

  it('keeps a running policy-5 battle on the winding road checkpoint-valid and resumable', async () => {
    let clock = 0
    const save = freshRunFromProfile(freshProfile(), 2, 1)
    save.gold = stageStartGold(2)
    const engine = new GameEngine(new RuleBasedAI(), save, 'meadow', 11, () => clock, DRAGON_BREATH_MOUTHS, 2, 4),
      s = engine.state,
      slots = getField('meadow', 2, 4).slots
    expect(engine.startAtStage(2)).toBe(true)
    for (const [type, slot] of [
      ['soldier', 3],
      ['archer', 4],
      ['tank', 10]
    ] as const)
      expect(engine.place(type, slots[slot])).toBe(true)
    expect(engine.startAssault()).toBe(true)
    let checked = 0
    for (let i = 0; i < 900 && s.phase === 'assault'; i++) {
      clock += 50
      engine.update(0.05)
      for (let j = 0; j < 12; j++) await Promise.resolve()
      if (i % 60 === 59) {
        const checkpoint = engine.exportCheckpoint()
        expect(checkpoint, `t=${s.time.toFixed(1)}`).not.toBeNull()
        if (s.units.some((unit) => unit.owner === 'ai')) {
          expect(roundTrip(checkpoint!)!.exportCheckpoint()).toEqual(checkpoint)
          checked++
        }
      }
    }
    expect(
      s.units.filter((unit) => unit.owner === 'ai').every((unit) => unit.speed > DEFINITIONS[unit.type].speed)
    ).toBe(true)
    expect(checked).toBeGreaterThan(3)
  }, 120000)
})

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
    // Kill gold plus the wave-clear bonus paid when the break opens.
    expect(save.gold - goldBefore).toBe(first * killGold('slime', false) + waveClearGold(1))
    expect(s.waveGold).toBe(first * killGold('slime', false) + waveClearGold(1))
    const gains = engine.takeGoldGains()
    expect(gains).toHaveLength(first + 1)
    expect(
      gains.slice(0, first).every((gain) => gain.kind === 'kill' && gain.amount === killGold('slime', false))
    ).toBe(true)
    expect(gains.at(-1)).toMatchObject({ kind: 'wave-clear', amount: waveClearGold(1) })
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

describe('mid-wave upgrades and wave-clear gold (policy 5 only)', () => {
  it('upgrades and equips a living ally while a wave is on, keeps other build actions closed and stays checkpoint-valid', async () => {
    let clock = 0
    const save = freshRunFromProfile(freshProfile(), 2, 1)
    save.gold = stageStartGold(2)
    const engine = new GameEngine(new RuleBasedAI(), save, 'meadow', 11, () => clock, DRAGON_BREATH_MOUTHS, 2, 4),
      s = engine.state,
      slots = getField('meadow', 2, 4).slots
    expect(engine.startAtStage(2)).toBe(true)
    for (const [type, slot] of [
      ['soldier', 3],
      ['archer', 4],
      ['tank', 10]
    ] as const)
      expect(engine.place(type, slots[slot])).toBe(true)
    expect(engine.startAssault()).toBe(true)
    const attacking = (type: AllyType) =>
      s.attacks.some(
        (attack) =>
          attack.owner === 'player' &&
          attack.type === type &&
          attack.power > 0 &&
          (attack.status === 'windup' || attack.status === 'released')
      )
    // Wait until the archer and the tank both have an attack under way, so the upgrade has to carry over to them.
    for (let i = 0; i < 4000 && !(attacking('archer') && attacking('tank') && !s.waveBreak); i++) {
      clock += 50
      engine.update(0.05)
      for (let j = 0; j < 12; j++) await Promise.resolve()
    }
    expect(attacking('archer') && attacking('tank')).toBe(true)
    expect(engine.buildWindowOpen).toBe(false)
    const archer = s.units.find((unit) => unit.owner === 'player' && unit.type === 'archer')!,
      tank = s.units.find((unit) => unit.owner === 'player' && unit.type === 'tank')!
    // Deployment, road items and the gate keep their preparation/break rules.
    expect(engine.place('runner', slots[5])).toBe(false)
    expect(engine.upgradeGate('cannon')).toBe(false)
    // A policy-4 battle keeps upgrades to preparation.
    s.waveBossPolicy = 4
    expect(engine.upgradeOffer(archer.id)).toBeNull()
    expect(engine.upgradeDefender(archer.id)).toBe(false)
    s.waveBossPolicy = 5
    expect(save.gold).toBeGreaterThanOrEqual(upgradeCost(1) + 60)
    expect(engine.upgradeOffer(archer.id)).toBe(upgradeCost(1))
    const gold = save.gold,
      attack = archer.attack
    expect(engine.upgradeDefender(archer.id)).toBe(true)
    expect(archer.level).toBe(2)
    expect(archer.attack).toBeGreaterThan(attack)
    for (const pending of s.attacks.filter((value) => value.attackerId === archer.id && value.power > 0))
      expect(pending.power / archer.attack).toBeCloseTo(
        pending.supportAttack ? COMMANDER_SUPPORT.attackMultiplier : 1,
        6
      )
    expect(save.gold).toBe(gold - upgradeCost(1))
    expect(engine.equipDefender(tank.id, 'armor')).toBe(true)
    expect(tank.equipment).toBe('armor')
    const checkpoint = engine.exportCheckpoint()
    expect(checkpoint).not.toBeNull()
    expect(roundTrip(checkpoint!)!.exportCheckpoint()).toEqual(checkpoint)
    for (let i = 0; i < 200 && s.phase === 'assault'; i++) {
      clock += 50
      engine.update(0.05)
      for (let j = 0; j < 12; j++) await Promise.resolve()
    }
    expect(engine.exportCheckpoint()).not.toBeNull()
    // A fallen ally cannot be improved until it regroups.
    const fallen = s.units.find((unit) => unit.owner === 'player' && unit.hp > 0)!
    fallen.hp = 0
    expect(engine.upgradeOffer(fallen.id)).toBeNull()
    expect(engine.upgradeDefender(fallen.id)).toBe(false)
  }, 120000)

  it('pays a growing bonus for each cleared wave but none for the last', () => {
    expect([1, 2, 3, 4, 5].map(waveClearGold)).toEqual([15, 20, 25, 30, 35])
    const { engine, save } = waveBattle(),
      s = engine.state,
      waves = stageRules(1, 5).waves!
    let paid = 0
    for (let wave = 1; wave <= waves.length; wave++) {
      if (s.waveBreak) engine.callNextWave()
      for (let i = 0; i < waves[wave - 1]; i++) {
        s.time += 2
        expect(spawnSlime(engine)).toBe(true)
      }
      const gold = save.gold
      killAll(engine)
      const gains = engine.takeGoldGains().filter((gain) => gain.kind === 'wave-clear')
      if (wave < waves.length) {
        expect(gains).toMatchObject([{ kind: 'wave-clear', amount: waveClearGold(wave) }])
        paid += waveClearGold(wave)
      } else expect(gains).toEqual([])
      expect(save.gold).toBeGreaterThan(gold)
    }
    expect(s.result).toBe('win')
    expect(paid).toBe(waveClearGold(1) + waveClearGold(2))
    expect(MAX_WAVE_GOLD).toBeGreaterThanOrEqual(s.waveGold!)
  })
})

describe('boss breach at the castle (policy 5 only)', () => {
  it('a boss that reaches the castle lands one bounded blow and leaves through the gate', async () => {
    let clock = 0
    const save = freshRunFromProfile(freshProfile(), 2, 1)
    save.gold = stageStartGold(3)
    const engine = new GameEngine(new RuleBasedAI(), save, 'meadow', 42, () => clock, DRAGON_BREATH_MOUTHS, 2, 1),
      s = engine.state
    expect(engine.startAtStage(3)).toBe(true)
    for (const type of ['tank', 'archer'] as AllyType[]) {
      const [dx, dy] = OFFSETS[type]
      expect(engine.place(type, { x: 640 + dx, y: ANCHOR + dy })).toBe(true)
    }
    expect(engine.startAssault()).toBe(true)
    const step = async () => {
      clock += 50
      engine.update(0.05)
      for (let j = 0; j < 12; j++) await Promise.resolve()
    }
    // Fight the stage normally (the castle is kept standing) until the boss is on the road.
    for (let i = 0; i < 20000 && !s.units.some((unit) => unit.boss); i++) {
      await step()
      s.playerBaseHp = CONFIG.baseHp
      s.stageSummary.baseDamage = 0
      if (s.waveBreak) engine.callNextWave()
    }
    const boss = s.units.find((unit) => unit.boss)!
    expect(boss.type).toBe(stageRules(3, 5).bossType)
    // The allies fall, so nothing stands in the boss's way; the castle is kept full until its escorts are gone.
    for (const unit of s.units) if (unit.owner === 'player') unit.hp = 0
    let before = NaN,
      latched = false
    for (let i = 0; i < 12000 && s.units.includes(boss); i++) {
      await step()
      if (Number.isNaN(before)) {
        if (s.units.some((unit) => unit.owner === 'ai' && !unit.boss) || s.pendingSpawns.length) {
          s.playerBaseHp = CONFIG.baseHp
          s.stageSummary.baseDamage = 0
        } else before = s.playerBaseHp
      }
      if (boss.gateExit && !latched) {
        latched = true
        expect(engine.exportCheckpoint()).not.toBeNull()
      }
    }
    expect(latched).toBe(true)
    expect(s.units).not.toContain(boss)
    expect(s.corpses.some((corpse) => corpse.id === boss.id)).toBe(false)
    // One breach (gate armor 0), not the whole castle.
    expect(before - s.playerBaseHp).toBeCloseTo(WAVE_BOSS_BREACH, 6)
    expect(s.playerBaseHp).toBeGreaterThan(0)
    expect(s.result).toBe('win')
    expect(engine.exportCheckpoint()).not.toBeNull()
  }, 120000)
})
