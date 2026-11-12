/** Boot / loading: the logo and the progress of the model kit (DESIGN §17.1). */
import type { Screen } from '../../app/context'
import { h, setStyle, setText } from '../dom'
import { logo } from '../widgets'

const TIPS = [
  'アニマは命であり弾薬。撃つたび、斬るたびに減っていく。',
  '安いアンティークを混ぜると、長く戦い続けられる。',
  'アニマが尽きるとアーマーが崩壊する。仲間に救助してもらおう。',
  '左クリックは右手、右クリックは左手。Q / E で持ち替え。'
]

export function createBootScreen(): Screen & { setProgress(f: number): void } {
  const fill = h('div', 'boot-fill')
  const pct = h('div', 'boot-pct', '0%')
  const el = h(
    'div',
    'screen boot',
    h(
      'div',
      'boot-center',
      logo('large'),
      h('div', 'boot-bar', fill),
      h('div', 'boot-row', h('span', 'boot-label', 'アニマ兵装を展開中…'), pct),
      h('p', 'boot-tip', TIPS[Math.floor(Math.random() * TIPS.length)])
    )
  )
  el.setAttribute('aria-busy', 'true')
  return {
    id: 'boot',
    el,
    backdrop: 'off',
    music: null,
    setProgress(f) {
      const v = Math.max(0, Math.min(1, f))
      setStyle(fill, 'transform', `scaleX(${v})`)
      setText(pct, `${Math.round(v * 100)}%`)
      if (v >= 1) el.setAttribute('aria-busy', 'false')
    }
  }
}
