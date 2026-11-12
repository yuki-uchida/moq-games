/**
 * The first match's 「操作説明」 card: the essential controls for the device in hand (keyboard + mouse,
 * gamepad or touch), switchable, dismissed with a button / Enter / A and remembered afterwards.
 */
import { readJson, writeJson, type KeyValueStore } from '../../app/storage'
import { h, setClass } from '../dom'

export type GuideDevice = 'kbm' | 'pad' | 'touch'

export const GUIDE_KEY = 'guide'

export const GUIDE_DEVICES: { id: GuideDevice; label: string }[] = [
  { id: 'kbm', label: 'キーボード・マウス' },
  { id: 'pad', label: 'ゲームパッド' },
  { id: 'touch', label: 'タッチ' }
]

/** The essentials only (the full table stays in the pause menu): [action, key]. */
export const GUIDE_ROWS: Record<GuideDevice, [string, string][]> = {
  kbm: [
    ['移動', 'W A S D'],
    ['視点', 'マウス'],
    ['右手のアンティーク', '左クリック'],
    ['左手のアンティーク', '右クリック'],
    ['持ち替え（右 / 左）', 'Q・ホイール / E'],
    ['ジャンプ', 'Space'],
    ['ダッシュ', 'Shift'],
    ['救助・調べる', 'F 長押し'],
    ['スコア / メニュー', 'Tab / Esc']
  ],
  pad: [
    ['移動', '左スティック'],
    ['視点', '右スティック'],
    ['右手のアンティーク', 'RT'],
    ['左手のアンティーク', 'LT'],
    ['持ち替え（右 / 左）', 'RB / LB'],
    ['ジャンプ', 'A'],
    ['ダッシュ', 'B'],
    ['救助・調べる', 'X 長押し'],
    ['メニュー', 'メニューボタン']
  ],
  touch: [
    ['移動', '画面の左半分をドラッグ'],
    ['視点', '画面の右半分をドラッグ'],
    ['右手 / 左手', '右・左の大きなボタン'],
    ['持ち替え', 'ボタン上の ↻'],
    ['ジャンプ / ダッシュ', '右下のボタン'],
    ['救助・調べる', '表示されたボタン'],
    ['スコア / メニュー', '右上の ≣ / ≡']
  ]
}

export const GUIDE_TIP =
  'アニマは命であり弾薬。撃つ・斬る・守る・装備の維持、すべてで減ります。尽きる前に下がって回復しましょう。'

export function guideSeen(store: KeyValueStore | null): boolean {
  const v = readJson(store, GUIDE_KEY)
  return typeof v === 'object' && v !== null && (v as { seen?: unknown }).seen === true
}

export function markGuideSeen(store: KeyValueStore | null): void {
  writeJson(store, GUIDE_KEY, { seen: true })
}

export interface GuideCard {
  readonly el: HTMLElement
  readonly open: boolean
  show(device: GuideDevice): void
  hide(): void
}

export function createGuideCard(onDone: () => void): GuideCard {
  const rows = h('dl', 'guide-rows')
  const tabs = GUIDE_DEVICES.map((d) =>
    h(
      'button',
      {
        class: 'guide-tab',
        attrs: { type: 'button', 'data-guide-device': d.id, role: 'tab' },
        on: { click: () => paint(d.id) }
      },
      d.label
    )
  )
  const ok = h(
    'button',
    {
      class: 'btn btn-primary guide-ok',
      attrs: { type: 'button', 'data-guide-ok': '', 'data-sfx': 'uiStart' },
      on: { click: () => onDone() }
    },
    'わかった',
    h('span', 'key', 'Enter')
  )
  const el = h(
    'div',
    {
      class: 'game-card game-guide',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-title' }
    },
    h(
      'div',
      'panel guide-panel',
      h('div', 'guide-head', h('small', null, 'CONTROLS'), h('b', { attrs: { id: 'guide-title' } }, '操作説明')),
      h('div', { class: 'guide-tabs', attrs: { role: 'tablist' } }, tabs),
      rows,
      h('p', 'guide-tip', GUIDE_TIP),
      h('div', 'guide-foot', h('small', null, 'ポーズメニューの「操作説明」でいつでも確認できます'), ok)
    )
  )
  let open = false
  function paint(device: GuideDevice) {
    tabs.forEach((t, i) => {
      const on = GUIDE_DEVICES[i].id === device
      setClass(t, 'is-on', on)
      t.setAttribute('aria-selected', String(on))
    })
    rows.replaceChildren(...GUIDE_ROWS[device].flatMap(([a, k]) => [h('dt', null, a), h('dd', null, k)]))
  }
  return {
    el,
    get open() {
      return open
    },
    show(device) {
      paint(device)
      open = true
      setClass(el, 'is-on', true)
      requestAnimationFrame(() => ok.focus({ preventScroll: true }))
    },
    hide() {
      open = false
      setClass(el, 'is-on', false)
    }
  }
}
