import {
  actionKey,
  actionMembers,
  actionExplorationPrior,
  CONFIG,
  fieldFor,
  getLegalAIActions,
  isAction,
  type AIAction,
  type AIDecision,
  type DirectorSelection,
  type ModelProbabilityEvidence,
  type GameState
} from './model'
export class SeededRandom {
  constructor(private seed: number) {
    this.seed = seed >>> 0
  }
  snapshot(): number {
    return this.seed
  }
  next = (): number => {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }
}
function probabilitySnapshot(evidence?: ModelProbabilityEvidence): DirectorSelection['probabilityEvidence'] {
  const offered = new Map<string, Readonly<AIAction>>()
  for (const action of evidence?.offeredActions.slice(0, CONFIG.maxLegalActions) ?? [])
    if (isAction(action)) offered.set(actionKey(action), Object.freeze({ ...action }))
  const provided = new Map<string, { readonly action: Readonly<AIAction>; readonly probability: number }>()
  for (const entry of evidence?.provided.slice(0, CONFIG.maxLegalActions) ?? []) {
    if (
      !isAction(entry.action) ||
      !Number.isFinite(entry.probability) ||
      entry.probability < 0 ||
      entry.probability > 1
    )
      continue
    const key = actionKey(entry.action),
      action = offered.get(key)
    if (action && !provided.has(key)) provided.set(key, Object.freeze({ action, probability: entry.probability }))
  }
  return Object.freeze({
    offeredActions: Object.freeze([...offered.values()]),
    provided: Object.freeze([...provided.values()]),
    status: ![...provided.values()].some((entry) => entry.probability > 0)
      ? 'unavailable'
      : provided.size === offered.size
        ? 'complete'
        : 'partial'
  })
}
export function selectDirectorDecision(
  s: Readonly<GameState>,
  decision: AIAction | AIDecision,
  random: () => number,
  offeredActions?: readonly Readonly<AIAction>[]
): DirectorSelection | null {
  const response = 'action' in decision ? decision : { action: decision }
  if (!isAction(response.action)) return null
  const offered = offeredActions && new Set(offeredActions.filter(isAction).map(actionKey)),
    legal = getLegalAIActions(s).filter((action) => !offered || offered.has(actionKey(action))),
    selectedKey = actionKey(response.action)
  if (!legal.some((a) => actionKey(a) === selectedKey)) return null
  const scores = new Map<string, number>()
  for (const entry of response.scores?.slice(0, CONFIG.maxLegalActions) ?? []) {
    if (isAction(entry.action) && Number.isFinite(entry.score) && entry.score >= 0)
      scores.set(actionKey(entry.action), Math.min(1, entry.score))
  }
  const fallback = !legal.some((a) => (scores.get(actionKey(a)) ?? 0) > 0)
  if (fallback) scores.set(selectedKey, 1)
  const total = legal.reduce((n, a) => n + (scores.get(actionKey(a)) ?? 0), 0),
    selectionScores = Object.freeze(
      legal.map((action) =>
        Object.freeze({ action: Object.freeze({ ...action }), score: (scores.get(actionKey(action)) ?? 0) / total })
      )
    )
  const selectionMixture = Object.freeze(
    response.source === 'jev'
      ? { scoreWeight: 0.95, explorationWeight: 0.05 }
      : { scoreWeight: 0.82, explorationWeight: 0.18 }
  )
  const exploration = actionExplorationPrior(legal, s.battlefieldVersion),
    explorationByKey = new Map(exploration.map(({ action, probability }) => [actionKey(action), probability]))
  const weights = selectionScores.map(({ action, score }) => ({
    action,
    weight:
      (selectionMixture.scoreWeight * score +
        (s.battlefieldVersion === 2
          ? selectionMixture.explorationWeight * explorationByKey.get(actionKey(action))!
          : selectionMixture.explorationWeight / legal.length)) *
      (action.type === 'wait'
        ? 1
        : Math.pow(
            actionMembers(action).reduce((weight, member) => weight * fieldFor(s).weights[member.unitType], 1),
            1 / actionMembers(action).length
          ))
  }))
  const explicitWait = response.action.type === 'wait',
    weightTotal = weights.reduce((n, v) => n + v.weight, 0),
    finalDistribution = Object.freeze(
      weights.map(({ action, weight }) =>
        Object.freeze({
          action,
          probability: explicitWait ? (actionKey(action) === selectedKey ? 1 : 0) : weight / weightTotal
        })
      )
    )
  let applied: Readonly<AIAction> = explicitWait
    ? finalDistribution.find((choice) => actionKey(choice.action) === selectedKey)!.action
    : finalDistribution[finalDistribution.length - 1].action
  if (!explicitWait) {
    let draw = random()
    for (const choice of finalDistribution) {
      draw -= choice.probability
      if (draw <= 0) {
        applied = choice.action
        break
      }
    }
  }
  return Object.freeze({
    requested: Object.freeze({ ...response.action }),
    applied,
    probabilityEvidence: probabilitySnapshot(response.probabilityEvidence),
    scoreSource: fallback ? 'selected-action-fallback' : (response.scoreSource ?? 'provided-scores'),
    selectionMixture,
    ...(s.battlefieldVersion === 2
      ? {
          explorationMethod: 'deployment-route-mode-target' as const,
          explorationDistribution: Object.freeze(
            exploration.map(({ action, probability }) =>
              Object.freeze({ action: Object.freeze({ ...action }), probability })
            )
          )
        }
      : {}),
    selectionScores,
    finalDistribution,
    selectionReason: explicitWait ? 'explicit-wait' : 'weighted-draw'
  })
}
export function selectDirectorAction(
  s: Readonly<GameState>,
  decision: AIAction | AIDecision,
  random: () => number,
  offeredActions?: readonly Readonly<AIAction>[]
): AIAction | null {
  return selectDirectorDecision(s, decision, random, offeredActions)?.applied ?? null
}
