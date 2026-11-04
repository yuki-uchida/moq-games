import { EVENTS } from './data'

export interface LifeDecision {
  event: number
  outcome: string
  at?: number
}

export const LIFE_OUTCOMES: Record<string, readonly string[]> = {
  b_univ: ['勉強が実り、専門課程へ進学。転機を1回獲得。', '実践から学ぶ進路を選んだ。'],
  b_shukatsu: [
    '学びと仕事がつながり、専門職に就職。転機を2回獲得。',
    '実務を磨き、現場で就職。転機を1回獲得。',
    '就職を急がず、自分の道を探す。',
    '運動を磨き、スポーツの道へ。転機を1回獲得。',
    '資産を育て、資産を活かす道へ。転機を1回獲得。',
    '好きなことを磨き、創作の道へ。転機を1回獲得。',
    '人とのつながりを育て、人とのつながりを活かす道へ。転機を1回獲得。'
  ],
  b_layoff: [
    '職歴と磨いた仕事で、リストラ期に再就職。転機を2回獲得。',
    '過去の職歴を頼りに、次の仕事へ。転機を1回獲得。',
    '職歴に頼らず、新しい生き方を探す。',
    '磨き続けた運動で、スポーツの道を広げる。転機を2回獲得。',
    '過去の運動経験を活かし、次の道へ。転機を1回獲得。',
    '育て続けた資産で、資産を活かす道を広げる。転機を2回獲得。',
    '過去の資産経験を活かし、次の道へ。転機を1回獲得。',
    '磨き続けた表現で、創作の道を広げる。転機を2回獲得。',
    '過去の創作経験を活かし、次の表現へ。転機を1回獲得。',
    '後年に磨いた仕事で、新たな仕事に挑戦。転機を2回獲得。',
    '後年に磨いた運動で、新たにスポーツの道に挑戦。転機を2回獲得。',
    '後年に育てた資産で、新たに資産を活かす道に挑戦。転機を2回獲得。',
    '後年に磨いた表現で、新たに創作の道に挑戦。転機を2回獲得。',
    '後年に磨いた仕事で、初めて就職。転機を2回獲得。',
    '後年に磨いた仕事で、別分野から仕事の道へ転向。転機を2回獲得。',
    '育て続けたつながりで、人とのつながりを活かす道を広げる。転機を2回獲得。',
    '過去の対人経験を活かし、次の道へ。転機を1回獲得。',
    '後年に育てたつながりで、新たに人とのつながりを活かす道に挑戦。転機を2回獲得。'
  ],
  b_wedding: ['結婚した！配偶者が毎秒HPを2回復。', '独身の人生を歩む。'],
  nightcry: [
    '子どもを迎えた！本人の回復が毎秒HP3に。',
    '子どもを迎えないと決めた。本人の回復は毎秒HP2。',
    '未婚のため、子どもを迎える選択は提示されなかった。',
    '子どもを迎えるかは未選択。'
  ]
}

export const LIFE_HISTORY_CAP = EVENTS.filter((event) => LIFE_OUTCOMES[event.boss ?? event.swarm ?? '']).length

export function historyOk(value: unknown, time: number): value is LifeDecision[] {
  if (!Array.isArray(value) || value.length > LIFE_HISTORY_CAP) return false
  let previous = -1
  const seen = new Set<number>()
  let earlyCareer: string | undefined
  return value.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false
    const decision = entry as LifeDecision
    if (decision.at !== undefined && typeof decision.at !== 'number') return false
    if (!Number.isInteger(decision.event) || seen.has(decision.event)) return false
    const event = EVENTS[decision.event]
    if (
      !event ||
      Math.round(event.at * 100) / 100 > time ||
      !LIFE_OUTCOMES[event.boss ?? event.swarm ?? '']?.includes(decision.outcome)
    )
      return false
    const at = decision.at ?? event.at
    if (!Number.isFinite(at) || Math.round(at * 100) / 100 > time || at < event.at || at < previous) return false
    if (
      decision.at !== undefined &&
      (event.swarm !== 'nightcry' || !LIFE_OUTCOMES.nightcry.slice(0, 2).includes(decision.outcome))
    )
      return false
    if (
      event.swarm === 'nightcry' &&
      LIFE_OUTCOMES.nightcry.slice(0, 2).includes(decision.outcome) &&
      decision.at === undefined
    )
      return false
    if (Object.keys(entry).some((key) => key !== 'event' && key !== 'outcome' && key !== 'at')) return false
    if (event.boss === 'b_shukatsu') earlyCareer = decision.outcome
    if (event.boss === 'b_layoff') {
      if (
        LIFE_OUTCOMES.b_layoff.slice(15, 17).includes(decision.outcome) &&
        earlyCareer !== LIFE_OUTCOMES.b_shukatsu[6]
      )
        return false
      if (decision.outcome === LIFE_OUTCOMES.b_layoff[17] && earlyCareer === LIFE_OUTCOMES.b_shukatsu[6]) return false
      if (decision.outcome === LIFE_OUTCOMES.b_layoff[9] && earlyCareer !== undefined) return false
      if (decision.outcome === LIFE_OUTCOMES.b_layoff[13] && earlyCareer !== LIFE_OUTCOMES.b_shukatsu[2]) return false
      if (
        decision.outcome === LIFE_OUTCOMES.b_layoff[14] &&
        !LIFE_OUTCOMES.b_shukatsu.slice(3).includes(earlyCareer ?? '')
      )
        return false
    }
    previous = at
    seen.add(decision.event)
    return true
  })
}
