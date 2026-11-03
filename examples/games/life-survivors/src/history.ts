import { EVENTS } from './data'

export interface LifeDecision {
  event: number
  outcome: string
}

export const LIFE_OUTCOMES: Record<string, readonly string[]> = {
  b_univ: ['勉強が実り、専門課程へ進学。転機を1回獲得。', '実践から学ぶ進路を選んだ。'],
  b_shukatsu: [
    '学びと仕事がつながり、専門職に就職。転機を2回獲得。',
    '実務を磨き、現場で就職。転機を1回獲得。',
    '就職を急がず、自分の道を探す。'
  ],
  b_layoff: [
    '職歴と磨いた仕事で、リストラ期に再就職。転機を2回獲得。',
    '過去の職歴を頼りに、次の仕事へ。転機を1回獲得。',
    '職歴に頼らず、新しい生き方を探す。'
  ],
  b_wedding: ['結婚した！配偶者が毎秒HPを2回復。', '独身の人生を歩む。'],
  nightcry: ['子どもが生まれた！家族の回復が毎秒HP3に。', '子どもを持たない人生を歩む。']
}

export const LIFE_HISTORY_CAP = EVENTS.filter((event) => LIFE_OUTCOMES[event.boss ?? event.swarm ?? '']).length

export function historyOk(value: unknown, time: number): value is LifeDecision[] {
  if (!Array.isArray(value) || value.length > LIFE_HISTORY_CAP) return false
  let previous = -1
  return value.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false
    const decision = entry as LifeDecision
    if (!Number.isInteger(decision.event) || decision.event <= previous) return false
    const event = EVENTS[decision.event]
    if (
      !event ||
      Math.round(event.at * 100) / 100 > time ||
      !LIFE_OUTCOMES[event.boss ?? event.swarm ?? '']?.includes(decision.outcome)
    )
      return false
    if (Object.keys(entry).some((key) => key !== 'event' && key !== 'outcome')) return false
    previous = decision.event
    return true
  })
}
