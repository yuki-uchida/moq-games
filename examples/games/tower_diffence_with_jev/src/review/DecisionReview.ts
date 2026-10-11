import { JevAI } from '../ai/AIController'
import { GameEngine } from '../game/GameEngine'
import {
  CONFIG,
  ALLY_TYPES,
  DEFINITIONS,
  RANGED_ALLY_TYPES,
  stageRules,
  getField,
  type BattlefieldVersion,
  getLegalAIActions,
  type AIResult,
  type AIAction,
  type GameState
} from '../game/model'
import { freshSave } from '../progression/UpgradeSystem'
import { GameRenderer } from '../rendering/GameRenderer'
import { authoredPortrait, authoredRosterClips } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { dragonBreathBodyClips } from '../rendering/DragonBreathArt'
import { DecisionPanel } from '../ui/DecisionPanel'

type Scenario =
  | 'complete'
  | 'partial'
  | 'missing'
  | 'zero'
  | 'wait'
  | 'backoff'
  | 'guard'
  | 'wait-only'
  | 'empty'
  | 'direct'
const base = new URL('../../../tower-defense-art/', document.baseURI)
const renderer = new GameRenderer(document.getElementById('field')!, {
  clips: { ...authoredRosterClips(base), ...dragonBreathBodyClips(base) },
  effectClips: authoredEffectClips(base)
})
const panel = new DecisionPanel(document.getElementById('app')!, (type) => authoredPortrait(type, base))
let engine: GameEngine,
  now = 10000,
  jev = true,
  calls = 0
let failDeployment = false

function response(s: Readonly<GameState>, scenario: Scenario): AIResult {
  calls++
  if (failDeployment) return { type: 'unavailable', reason: 'timeout', source: 'jev-timeout' }
  if (scenario === 'backoff') return { type: 'unavailable', reason: 'backoff', source: 'jev-backoff' }
  const legal = getLegalAIActions(s),
    offered = scenario === 'guard' ? legal.filter((action) => action.type !== 'wait') : legal
  const action: AIAction | undefined =
    scenario === 'direct'
      ? offered.find((candidate) => candidate.type === 'spawn' && candidate.targetId !== undefined)
      : scenario === 'wait' || scenario === 'wait-only'
        ? (offered.find((candidate) => candidate.type === 'wait' && candidate.unitType === 'goblin') ?? offered[0])
        : (offered[1] ?? offered[0])
  if (!action)
    return {
      type: 'unavailable',
      reason: 'no-legal-actions',
      source: 'review'
    }
  const provided =
    scenario === 'missing'
      ? []
      : offered.flatMap((candidate) => {
          if (scenario === 'partial' && candidate !== action) return []
          return [
            {
              action: candidate,
              probability: scenario === 'zero' ? 0 : candidate === action ? 0.7 : 0.3 / (offered.length - 1)
            }
          ]
        })
  return {
    action,
    source: 'jev',
    scores: provided.some((entry) => entry.probability > 0)
      ? provided.map(({ action, probability }) => ({
          action,
          score: probability
        }))
      : [{ action, score: 1 }],
    scoreSource: provided.some((entry) => entry.probability > 0) ? 'provided-scores' : 'selected-action-fallback',
    probabilityEvidence:
      scenario === 'missing'
        ? undefined
        : {
            offeredActions: offered,
            provided,
            status: scenario === 'zero' ? 'unavailable' : scenario === 'partial' ? 'partial' : 'complete'
          }
  }
}
function draw() {
  if (!engine) return
  const field = getField(engine.state.fieldId, engine.state.battlefieldVersion, engine.state.layoutRevision)
  for (const id of ['field', 'map-world']) {
    const element = document.getElementById(id)!
    element.style.width = `${field.width}px`
    element.style.height = `${field.height}px`
    element.dataset.worldWidth = String(field.width)
    element.dataset.worldHeight = String(field.height)
  }
  renderer.render(engine.state)
  renderer.assetsReady(engine.state)
  panel.render(engine.state, jev)
  document.getElementById('stage')!.textContent = String(engine.state.stage).padStart(2, '0')
}
async function ready() {
  const deadline = performance.now() + 30000
  while (!renderer.assetsReady(engine.state)) {
    if (performance.now() > deadline || renderer.assetStatus === 'error') throw new Error('Review atlases unavailable')
    draw()
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  draw()
}
function snapshot() {
  return {
    trace: structuredClone(engine.state.decisionTrace),
    cooldownHold: structuredClone(engine.state.cooldownHold),
    status: engine.state.decisionStatus,
    strategy: engine.state.strategy,
    time: engine.state.time,
    stage: engine.state.stage,
    battlefieldVersion: engine.state.battlefieldVersion,
    unitCount: engine.state.units.length,
    enemiesSpawned: engine.state.enemiesSpawned,
    budgetSpent: engine.state.budgetSpent,
    pendingCount: engine.state.pendingSpawns.length,
    cooldowns: { ...engine.state.cooldowns },
    legalActions: getLegalAIActions(engine.state),
    calls
  }
}
async function prepare(scenario: Scenario = 'complete', stage = 1, version: BattlefieldVersion = 1, targetCount = 3) {
  if (
    !['complete', 'partial', 'missing', 'zero', 'wait', 'backoff', 'guard', 'wait-only', 'empty', 'direct'].includes(
      scenario
    ) ||
    !Number.isInteger(stage) ||
    stage < 1 ||
    stage > 10 ||
    ![1, 2].includes(version) ||
    ![3, 6, 10].includes(targetCount) ||
    (targetCount !== 3 && (version !== 2 || stage !== 10))
  )
    throw new Error('Invalid review scenario')
  engine?.invalidateAI()
  now = 10000
  calls = 0
  failDeployment = false
  jev = true
  const save = freshSave()
  if (targetCount !== 3) save.purchased = ALLY_TYPES.filter((type) => DEFINITIONS[type].purchaseCost > 0)
  engine = new GameEngine(
    new JevAI(
      async (s) => {
        if (scenario === 'wait-only' && calls) failDeployment = true
        return response(s, scenario)
      },
      undefined,
      undefined,
      undefined,
      () => now
    ),
    save,
    'meadow',
    2000,
    () => now,
    undefined,
    version
  )
  engine.state.stage = engine.state.stageSummary.stage = stage
  engine.state.sandbagStock = stage
  const slots = getField('meadow', version).slots
  if (targetCount !== 3) {
    for (let index = 0; index < targetCount; index++) {
      const type = RANGED_ALLY_TYPES[index % RANGED_ALLY_TYPES.length]
      const slot = slots.find((point) => engine.previewPlacement(type, point).valid)
      if (!slot || !engine.place(type, slot)) throw new Error('Invalid complete flight-target fixture')
    }
  } else {
    if (!engine.place('archer', version === 1 ? { x: 300, y: 220 } : slots[0])) throw new Error('Invalid review setup')
    if (version === 2 && stage >= 3) {
      if (!engine.place('archer', slots[1]) || !engine.place('archer', slots[10]))
        throw new Error('Invalid route targets')
      engine.state.units[0].hp /= 2
    }
  }
  if (!engine.startAssault()) throw new Error('Invalid review start')
  if (scenario === 'wait' || scenario === 'guard') engine.state.cooldowns.goblin = 3
  if (scenario === 'wait-only') {
    engine.state.cooldowns.slime = 0.6
    engine.state.cooldowns.goblin = 0.6
    engine.state.cooldowns.shaman = 0.6
  }
  if (scenario === 'empty') engine.state.nextSpawnAt = 0.8
  engine.update(CONFIG.step)
  for (let index = 0; index < 8; index++) await Promise.resolve()
  await ready()
  return snapshot()
}
async function prepareBoss(stage: number) {
  const rules = stageRules(stage)
  if (!Number.isInteger(stage) || !rules.bossType) throw new Error('No boss at this review stage')
  engine?.invalidateAI()
  now = 10000
  calls = 0
  jev = false
  engine = new GameEngine({ decide: async () => null }, freshSave(), 'meadow', 2000, () => now)
  engine.state.stage = engine.state.stageSummary.stage = stage
  engine.state.sandbagStock = stage
  engine.place('archer', { x: 300, y: 220 })
  engine.startAssault()
  engine.state.enemiesSpawned = engine.state.enemiesResolved = rules.enemyCount - 1
  engine.state.stageSummary.spawned = engine.state.stageSummary.resolved = rules.enemyCount - 1
  engine.state.budgetSpent = rules.enemyCount - 1
  if (
    !engine.applyAIAction({
      type: 'spawn',
      unitType: rules.bossType,
      boss: true
    })
  )
    throw new Error('Boss fixture is not legal')
  await ready()
  const unit = engine.state.units.find((unit) => unit.boss)!
  return {
    ...snapshot(),
    boss: {
      type: unit.type,
      hp: unit.hp,
      maxHp: unit.maxHp,
      attack: unit.attack,
      range: unit.attackRange,
      speed: unit.speed
    },
    diagnostics: renderer.diagnostics()
  }
}

async function advance(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 5) throw new Error('Invalid review duration')
  for (let index = 0; index < Math.round(seconds / CONFIG.step); index++) {
    now += CONFIG.step * 1000
    engine.update(CONFIG.step, (state) => renderer.assetsReady(state))
    for (let microtask = 0; microtask < 5; microtask++) await Promise.resolve()
  }
  await ready()
  return snapshot()
}
// Offline-only cadence fixture. No connection or provider request is constructed.
let hybridStart = 0
let hybridReplies: ((result: AIResult) => void)[] = []
async function prepareHybrid(mode: 'success' | 'stall' | 'failure' = 'success') {
  engine?.invalidateAI()
  now = hybridStart = 10000
  calls = 0
  failDeployment = false
  jev = true
  hybridReplies = []
  const ai = new JevAI(
    async () => {
      calls++
      if (mode === 'failure')
        return {
          type: 'unavailable',
          reason: 'backoff',
          source: 'jev-backoff'
        }
      if (mode === 'stall') return new Promise<AIResult>((resolve) => hybridReplies.push(resolve))
      return { action: { type: 'spawn', unitType: 'slime' }, source: 'jev' }
    },
    undefined,
    undefined,
    undefined,
    () => now
  )
  engine = new GameEngine(ai, freshSave(), 'meadow', 2000, () => now)
  ;(engine as any).random.next = () => 0
  engine.place('archer', { x: 300, y: 220 })
  engine.startAssault()
  return hybridTick(0)
}
async function hybridTick(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60000) throw new Error('Invalid slot')
  now = hybridStart + milliseconds
  engine.state.nextSpawnAt = engine.state.time
  for (const type of Object.keys(engine.state.cooldowns))
    engine.state.cooldowns[type as keyof typeof engine.state.cooldowns] = 20
  engine.state.cooldowns.slime = 0
  engine.state.enemiesSpawned = 0
  engine.state.budgetSpent = 0
  engine.update(CONFIG.step)
  for (let index = 0; index < 12; index++) await Promise.resolve()
  await ready()
  return snapshot()
}
async function releaseHybridReply() {
  hybridReplies.shift()?.({
    action: { type: 'wait', unitType: 'goblin' },
    source: 'jev'
  })
  for (let index = 0; index < 12; index++) await Promise.resolve()
  draw()
  return snapshot()
}
document.getElementById('deck-toggle')!.onclick = () => {
  const body = document.getElementById('deck-body')!,
    collapsed = !body.hidden
  body.hidden = collapsed
  document.getElementById('deck-toggle')!.setAttribute('aria-expanded', String(!collapsed))
}
document.getElementById('review-rule')!.onclick = () => {
  jev = false
  draw()
}
document.getElementById('review-jev')!.onclick = () => {
  jev = true
  draw()
}
Object.assign(window, {
  decisionReview: {
    prepare,
    prepareHybrid,
    hybridTick,
    releaseHybridReply,
    prepareBoss,
    failDeployment: () => {
      failDeployment = true
      return snapshot()
    },
    setWaitCooldown: (seconds: number) => {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 14 || !engine.state.cooldownHold)
        throw new Error('Invalid wait cooldown')
      engine.state.cooldowns[engine.state.cooldownHold.action.unitType] = seconds
      draw()
      return snapshot()
    },
    advance,
    snapshot,
    removeRequestedTarget: () => {
      const action = engine.state.decisionTrace?.requested
      if (action?.type === 'spawn' && action.targetId !== undefined) {
        const target = engine.state.units.find((unit) => unit.id === action.targetId)
        if (target) target.hp = 0
      }
      draw()
      return snapshot()
    },
    waiting: () => {
      engine.state.decisionStatus = '判断中'
      draw()
      return snapshot()
    },
    nextStage: () => {
      engine.state.phase = 'cleared'
      engine.state.result = 'win'
      engine.nextStage()
      draw()
      return snapshot()
    }
  }
})
function frame() {
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
void prepare()
