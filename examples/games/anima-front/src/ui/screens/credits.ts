/** クレジット (DESIGN §17.13): a slow staff roll over the backdrop. */
import type { AppContext, Screen } from '../../app/context'
import { SPECIES, SPECIES_IDS } from '../../data/species'
import { h, setStyle } from '../dom'
import { logo, portrait, speciesBadge } from '../widgets'

const ROLL: { title: string; lines: string[] }[] = [
  { title: 'ゲームデザイン', lines: ['moq-games 開発チーム'] },
  { title: 'プログラム', lines: ['シミュレーション・ボット', 'レンダリング', 'インターフェース', 'ネットワーク'] },
  { title: 'モデル', lines: ['すべてのキャラクターとアンティークは', 'コードで造形しています'] },
  { title: '音楽・効果音', lines: ['Web Audio によるリアルタイム合成'] },
  { title: '使用技術', lines: ['three.js', 'Web Audio API', 'Media over QUIC'] },
  { title: '出演', lines: ['ゲンブ司令', 'オペレーター ルリ', '第七小隊のみんな'] }
]

export function createCreditsScreen(ctx: AppContext): Screen {
  const roll = h(
    'div',
    'credits-roll',
    logo('small'),
    ...ROLL.map((s) =>
      h(
        'section',
        'credits-sec',
        h('h3', null, s.title),
        s.lines.map((l) => h('p', null, l))
      )
    ),
    h('div', 'credits-cast', portrait('genbu'), portrait('ruri')),
    h(
      'div',
      'credits-squad',
      SPECIES_IDS.map((id) => h('span', null, speciesBadge(id, 48), h('small', null, SPECIES[id].name)))
    ),
    h('p', 'credits-end', 'そして、ここまで遊んでくれたあなたへ。'),
    h('p', 'credits-thanks', 'ありがとう。')
  )
  const viewport = h('div', { class: 'credits-viewport', attrs: { tabindex: '-1' } }, roll)
  const back = () => ctx.open('title')
  const el = h(
    'div',
    'screen credits',
    viewport,
    h(
      'button',
      {
        class: 'btn btn-back credits-back',
        attrs: { type: 'button', 'data-autofocus': true, 'data-sfx': 'uiBack' },
        on: { click: back }
      },
      'タイトルへ'
    )
  )
  let y = 0
  let started = false
  return {
    id: 'credits',
    el,
    music: 'credits',
    back,
    frame(dt) {
      const vh = viewport.clientHeight
      if (!started) {
        y = vh * 0.85
        started = true
      }
      const reduced = document.documentElement.classList.contains('reduced-motion')
      y -= dt * (reduced ? 18 : 34)
      if (y < -roll.scrollHeight - 40) y = vh
      setStyle(roll, 'transform', `translateY(${y.toFixed(1)}px)`)
    }
  }
}
