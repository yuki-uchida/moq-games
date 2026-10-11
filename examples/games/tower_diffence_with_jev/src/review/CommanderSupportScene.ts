import type { AIController } from '../ai/AIController'
import { GameEngine } from '../game/GameEngine'
import {
  effectiveArmor,
  effectiveAttack,
  effectiveSpeed,
  getLegalSupportActions,
  serializeSupportObservation,
  type SupportAIResult,
  type SupportEffect
} from '../game/CommanderSupport'
import { CONFIG, fieldFor, pointOnPath, stageRules } from '../game/model'
import { freshProfile, freshRunFromProfile, resumeProgress } from '../progression/ProgressionData'

export interface SupportReviewOptions {
  effect?: SupportEffect
  mode?: 'jev' | 'rule'
  legacy?: boolean
  response?: 'accepted' | 'error' | 'deferred'
}
export const SUPPORT_REVIEW_CONTRACT =
  'Scripted offline support review. Real engine and full-frame assets; Jev responses are local fixtures. Stage 4 reward ledger, time 9.5s, enemy progress 120 and 60% HP are controlled. No network model calls or browser campaign storage.'

export function createSupportReview(options: SupportReviewOptions = {}) {
  const effect = options.effect ?? 'heal',
    save = freshRunFromProfile(freshProfile(), 2, options.legacy ? undefined : 1),
    requests: { at: number; time: number; candidates: number; targetId: number | null }[] = [],
    clock = { now: 9500 },
    decisions: { finish?: (result: SupportAIResult) => void } = {},
    controller: AIController = {
      supportEnabled: true,
      decide: async () => ({ type: 'unavailable', reason: 'not-configured', source: 'offline-review' }),
      decideSupport: async (state) => {
        const legal = getLegalSupportActions(state),
          action = legal.find((candidate) => candidate.effect === effect)
        requests.push({ at: clock.now, time: state.time, candidates: legal.length, targetId: action?.targetId ?? null })
        if (options.response === 'deferred') return new Promise((finish) => (decisions.finish = finish))
        if (options.response === 'error') return { type: 'unavailable', reason: 'error', source: 'mock-jev' }
        return action ? { action, source: 'jev' } : null
      }
    },
    rule: AIController = {
      decide: async () => ({ type: 'unavailable', reason: 'not-configured', source: 'offline-review' })
    }
  save.gold += [1, 2, 3].reduce((sum, stage) => sum + stageRules(stage).reward, 0)
  save.highestStage = 3
  let engine = new GameEngine(
    options.mode === 'rule' ? rule : controller,
    save,
    'meadow',
    20261004,
    () => clock.now,
    undefined,
    2
  )
  engine.state.stage = engine.state.stageSummary.stage = 4
  engine.state.sandbagStock = 4
  engine.state.previousStageSummary = {
    stage: 3,
    spawned: 9,
    resolved: 9,
    maxProgress: 0.5,
    baseDamage: 0,
    defenderDamage: 0
  }
  const field = fieldFor(engine.state)
  const placement = [...field.slots].reverse().find((point) => engine.previewPlacement('soldier', point).valid)
  if (!placement || !engine.place('soldier', placement) || !engine.startAssault())
    throw new Error('Support fixture placement failed')
  if (!engine.applyAIAction({ type: 'spawn', unitType: 'slime', routeId: 'left' }))
    throw new Error('Support fixture spawn failed')
  const target = engine.state.units.at(-1)!
  Object.assign(target, pointOnPath(field.routes[0].path, 120), { progress: 120, hp: target.maxHp * 0.6 })
  engine.state.time = 9.5
  engine.setHistoryEnabled(false)
  let jevMode = options.mode !== 'rule'
  return {
    options,
    requests,
    clock,
    get engine() {
      return engine
    },
    get jevMode() {
      return jevMode
    },
    get target() {
      return engine.state.units.find((unit) => unit.id === target.id)
    },
    async advance(milliseconds: number) {
      const steps = Math.round(milliseconds / (CONFIG.step * 1000))
      for (let frame = 0; frame < steps; frame++) {
        clock.now += CONFIG.step * 1000
        engine.update(CONFIG.step)
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      }
    },
    mode(next: 'jev' | 'rule') {
      jevMode = next === 'jev'
      engine.ai = jevMode ? controller : rule
    },
    killTarget() {
      const unit = engine.state.units.find((candidate) => candidate.id === target.id)
      if (unit) unit.hp = 0
    },
    releaseDeferred() {
      const action = getLegalSupportActions(engine.state).find((candidate) => candidate.effect === effect)
      decisions.finish?.(action ? { action, source: 'jev' } : null)
    },
    checkpoint() {
      return engine.exportCheckpoint()
    },
    resume() {
      const checkpoint = engine.exportCheckpoint()
      if (!checkpoint) throw new Error('Support review checkpoint is invalid')
      const restored = GameEngine.fromCheckpoint(
        checkpoint,
        jevMode ? controller : rule,
        resumeProgress(checkpoint.profile, checkpoint.progress),
        () => clock.now
      )
      if (!restored) throw new Error('Support review checkpoint failed to restore')
      engine = restored
    },
    snapshot() {
      const state = engine.state,
        unit = state.units.find((candidate) => candidate.id === target.id)
      return {
        fixture: SUPPORT_REVIEW_CONTRACT,
        time: state.time,
        mode: jevMode ? 'mock-jev' : 'rule',
        version: state.commanderSupportVersion ?? null,
        state: structuredClone(state.commanderSupport ?? null),
        target: unit
          ? {
              ...unit,
              effectiveAttack: effectiveAttack(unit, state.time),
              effectiveSpeed: effectiveSpeed(unit, state.time),
              effectiveArmor: effectiveArmor(unit, state.time)
            }
          : null,
        requests: structuredClone(requests),
        observation: serializeSupportObservation(state),
        budgetSpent: state.budgetSpent,
        resolved: state.enemiesResolved,
        phase: state.phase
      }
    }
  }
}
export type SupportReviewScene = ReturnType<typeof createSupportReview>
