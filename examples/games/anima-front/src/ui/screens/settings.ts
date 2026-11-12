/** 設定 (DESIGN §17.12) and 操作説明. Changes persist immediately and apply live. */
import type { AppContext, RouteRef, Screen } from '../../app/context'
import { SETTING_GROUPS, defaultSettings, type SettingSpec } from '../../app/settings'
import { h, setText } from '../dom'
import { hintBar, screenHead } from '../widgets'

function control(ctx: AppContext, spec: SettingSpec): HTMLElement {
  const value = () => ctx.settings[spec.key]
  if (spec.kind === 'range') {
    const out = h('output', 'set-value', spec.format(value() as number))
    const input = h('input', {
      class: 'range',
      attrs: {
        type: 'range',
        min: spec.min,
        max: spec.max,
        step: spec.step,
        value: String(value()),
        'aria-label': spec.label,
        'data-setting': spec.key
      }
    })
    const paint = () => {
      const v = Number(input.value)
      setText(out, spec.format(v))
      input.style.setProperty('--fill', `${((v - spec.min) / (spec.max - spec.min)) * 100}%`)
    }
    input.addEventListener('input', () => {
      ctx.updateSetting(spec.key, Number(input.value))
      paint()
    })
    input.addEventListener('change', () => ctx.sfx('uiMove'))
    paint()
    return h('div', 'set-row', h('label', 'set-label', spec.label), h('div', 'set-control', input, out))
  }
  if (spec.kind === 'toggle') {
    const btn = h(
      'button',
      {
        class: 'switch-btn',
        attrs: {
          type: 'button',
          role: 'switch',
          'aria-label': spec.label,
          'data-setting': spec.key,
          'data-sfx': 'uiTab'
        },
        on: {
          click: () => {
            ctx.updateSetting(spec.key, !value())
            paint()
          }
        }
      },
      h('span', 'switch', h('i')),
      h('span', 'switch-text')
    )
    const paint = () => {
      btn.setAttribute('aria-checked', String(!!value()))
      setText(btn.querySelector('.switch-text')!, value() ? 'オン' : 'オフ')
    }
    paint()
    return h('div', 'set-row', h('span', 'set-label', spec.label), h('div', 'set-control', btn))
  }
  const buttons = spec.options.map((o) =>
    h(
      'button',
      {
        class: 'seg-btn',
        attrs: { type: 'button', role: 'radio', 'data-setting': spec.key, 'data-value': o.value, 'data-sfx': 'uiTab' },
        on: {
          click: () => {
            ctx.updateSetting(spec.key, o.value)
            paint()
          }
        }
      },
      o.label
    )
  )
  const paint = () => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === value())))
  paint()
  return h(
    'div',
    'set-row',
    h('span', 'set-label', spec.label),
    h(
      'div',
      'set-control',
      h('div', { class: 'seg', attrs: { role: 'radiogroup', 'aria-label': spec.label } }, buttons)
    )
  )
}

/** The settings form (used by the 設定 screen and the pause menu). */
export function createSettingsPanel(ctx: AppContext, onReset?: () => void): HTMLElement {
  const body = h('div', 'settings-groups')
  const paint = () =>
    body.replaceChildren(
      ...SETTING_GROUPS.map((g) =>
        h(
          'section',
          'panel set-group',
          h('h2', 'panel-title', g.label),
          g.items.map((spec) => control(ctx, spec))
        )
      ),
      h(
        'div',
        'set-reset',
        h(
          'button',
          {
            class: 'btn btn-ghost',
            attrs: { type: 'button', 'data-reset': '' },
            on: {
              click: async () => {
                const r = await ctx.confirm({
                  title: '初期設定にもどしますか？',
                  text: 'すべての設定が最初の状態になります。',
                  buttons: [
                    { value: 'no', label: 'やめる' },
                    { value: 'yes', label: 'もどす', primary: true }
                  ]
                })
                if (r !== 'yes') return
                const d = defaultSettings(matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
                for (const g of SETTING_GROUPS) for (const s of g.items) ctx.updateSetting(s.key, d[s.key])
                paint()
                onReset?.()
              }
            }
          },
          '初期設定にもどす'
        )
      )
    )
  paint()
  return body
}

export const CONTROL_ROWS: [string, string, string, string][] = [
  ['移動', 'W A S D', '左スティック', '左半分をドラッグ'],
  ['視点', 'マウス', '右スティック', '右半分をドラッグ'],
  ['右手のアンティーク', '左クリック（長押し）', 'RT', '右ボタン'],
  ['左手のアンティーク', '右クリック（長押し）', 'LT', '左ボタン'],
  ['右手 / 左手を持ち替え', 'Q（ホイール） / E', 'RB / LB', '↻ボタン'],
  ['右手を直接選ぶ', '1〜8', '—', '—'],
  ['ジャンプ（長押しで滑空）', 'Space', 'A', 'ジャンプ'],
  ['ダッシュ', 'Shift', 'B', 'ダッシュ'],
  ['救助・調べる', 'F（長押し）', 'X（長押し）', '表示されたボタン'],
  ['肩の切り替え', 'V', 'R3', '—'],
  ['スコア', 'Tab', 'ビュー', '≣'],
  ['メニュー', 'Esc', 'メニュー', '≡']
]

export function controlsHelp(): HTMLElement {
  return h(
    'div',
    'controls-help',
    h(
      'table',
      'controls-table',
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, '操作'),
          h('th', null, 'キーボード・マウス'),
          h('th', null, 'ゲームパッド'),
          h('th', null, 'タッチ')
        )
      ),
      h(
        'tbody',
        null,
        CONTROL_ROWS.map((r) =>
          h('tr', null, h('th', null, r[0]), h('td', null, r[1]), h('td', null, r[2]), h('td', null, r[3]))
        )
      )
    ),
    h(
      'p',
      'controls-note',
      'アニマは命であり弾薬です。撃つ・斬る・守る・装備の維持、すべてにアニマを使います。尽きるとアーマーが崩壊して動けなくなります。'
    )
  )
}

export function createSettingsScreen(ctx: AppContext, args?: { back?: RouteRef }): Screen {
  const back = () => (args?.back ? ctx.open(args.back.name, args.back.args as never) : ctx.open('title'))
  let showHelp = false
  const panel = h('div', 'settings-panel')
  const tabSettings = h(
    'button',
    { class: 'lo-tab', attrs: { type: 'button', role: 'tab', 'data-sfx': 'uiTab' }, on: { click: () => set(false) } },
    '設定'
  )
  const tabHelp = h(
    'button',
    {
      class: 'lo-tab',
      attrs: { type: 'button', role: 'tab', 'data-sfx': 'uiTab', 'data-help': '' },
      on: { click: () => set(true) }
    },
    '操作説明'
  )
  const set = (help: boolean) => {
    showHelp = help
    tabSettings.setAttribute('aria-selected', String(!help))
    tabHelp.setAttribute('aria-selected', String(help))
    panel.replaceChildren(help ? h('section', 'panel', controlsHelp()) : createSettingsPanel(ctx))
  }
  set(false)
  tabSettings.setAttribute('data-autofocus', '')
  const el = h(
    'div',
    'screen settings',
    screenHead({ title: '設定', en: 'SETTINGS', onBack: back }),
    h('div', { class: 'lo-tabs settings-tabs', attrs: { role: 'tablist' } }, tabSettings, tabHelp),
    h('div', 'screen-scroll', panel),
    hintBar([
      ['↑↓', '項目'],
      ['←→', '調整'],
      ['Q / E', 'タブ'],
      ['Esc', 'もどる']
    ])
  )
  return {
    id: 'settings',
    el,
    music: 'menu',
    back,
    tab() {
      set(!showHelp)
    }
  }
}
