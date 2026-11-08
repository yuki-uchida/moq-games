/** The title screen: logo, emblem, main menu and its sub-panels (create/join room, how to play, settings). */
import { cleanRoom, randomRoom, validRoom } from '../net/validate'
import { el, focusables, menuKeys, show } from './dom'
import { emblem, howToPlay, settingsForm, type SettingsHandlers } from './panels'

export interface TitleActions {
  solo(): void
  host(room: string): void
  join(room: string): void
  sound(name: 'menuMove' | 'menuSelect' | 'menuBack'): void
  settings: SettingsHandlers
}

type Panel = 'main' | 'host' | 'join' | 'howto' | 'settings'

export class TitleScreen {
  readonly root: HTMLElement
  private readonly panels: Record<Panel, HTMLElement>
  private panel: Panel = 'main'
  private readonly hostInput: HTMLInputElement
  private readonly joinInput: HTMLInputElement
  private readonly joinError: HTMLElement
  private readonly hostError: HTMLElement
  private readonly busy: HTMLElement

  constructor(private readonly a: TitleActions) {
    const room = randomRoom()
    const button = (text: string, sub: string, onclick: () => void, cls = '') =>
      el(
        `button.menu-item${cls}`,
        { type: 'button', onclick: () => (a.sound('menuSelect'), onclick()) },
        el('span.mi-main', { text }),
        el('span.mi-sub', { text: sub })
      )
    const back = () => el('button.btn.back', { type: 'button', onclick: () => this.open('main', true) }, '← もどる')

    const main = el(
      'nav.title-menu',
      { 'data-menu': true, 'aria-label': 'メインメニュー' },
      button('ひとりで遊ぶ', '4匹をひとりで指揮', () => a.solo(), '.primary'),
      button('ルームを作る', 'ともだちを招待（最大4人）', () => this.open('host')),
      button('ルームに参加', 'ルームコードで参加', () => this.open('join')),
      button('遊び方', '操作と陣形のひみつ', () => this.open('howto')),
      button('設定', '音量・画面のゆれ・なまえ', () => this.open('settings'))
    )

    this.hostInput = el('input.room-input', {
      type: 'text',
      value: room,
      maxlength: 64,
      'aria-label': 'ルームコード',
      spellcheck: 'false',
      autocomplete: 'off'
    })
    this.hostError = el('p.form-error', { role: 'alert' })
    const host = el(
      'form.title-panel.parchment',
      { 'data-menu': true, 'aria-label': 'ルームを作る' },
      el('h2', { text: 'ルームを作る' }),
      el('p', { text: 'このコードをともだちに伝えてね。英数字と - _ が使えます。' }),
      el(
        'div.room-row',
        {},
        this.hostInput,
        el(
          'button.btn.dice',
          {
            type: 'button',
            title: '別のコード',
            'aria-label': '別のコードにする',
            onclick: () => ((this.hostInput.value = randomRoom()), a.sound('menuMove'))
          },
          '🎲'
        )
      ),
      this.hostError,
      el('div.panel-actions', {}, back(), el('button.btn.primary', { type: 'submit' }, 'ルームを作る'))
    )
    host.addEventListener('submit', (e) => {
      e.preventDefault()
      const code = cleanRoom(this.hostInput.value)
      if (!validRoom(code)) return this.fail(this.hostError, 'ルームコードは英数字と - _ で1〜64文字です。')
      a.sound('menuSelect')
      a.host(code)
    })

    this.joinInput = el('input.room-input', {
      type: 'text',
      value: room,
      maxlength: 64,
      'aria-label': 'ルームコード',
      spellcheck: 'false',
      autocomplete: 'off'
    })
    this.joinError = el('p.form-error', { role: 'alert' })
    const join = el(
      'form.title-panel.parchment',
      { 'data-menu': true, 'aria-label': 'ルームに参加' },
      el('h2', { text: 'ルームに参加' }),
      el('p', { text: 'ホストから聞いたルームコードを入力してください。' }),
      el('div.room-row', {}, this.joinInput),
      this.joinError,
      el('div.panel-actions', {}, back(), el('button.btn.primary', { type: 'submit' }, '参加する'))
    )
    join.addEventListener('submit', (e) => {
      e.preventDefault()
      const code = cleanRoom(this.joinInput.value)
      if (!validRoom(code)) return this.fail(this.joinError, 'ルームコードは英数字と - _ で1〜64文字です。')
      a.sound('menuSelect')
      a.join(code)
    })

    const howto = el(
      'div.title-panel.parchment.wide',
      { 'data-menu': true },
      el('h2', { text: '遊び方' }),
      howToPlay(),
      el('div.panel-actions', {}, back())
    )
    const settings = el(
      'div.title-panel.parchment',
      { 'data-menu': true },
      el('h2', { text: '設定' }),
      settingsForm(a.settings),
      el('div.panel-actions', {}, back())
    )
    this.panels = { main, host, join, howto, settings }
    this.busy = el(
      'div.busy',
      { role: 'status', hidden: true },
      el('span.spinner', { 'aria-hidden': 'true' }),
      el('span.busy-text', { text: '接続中…' })
    )
    const touch = el('p.touch-note', {
      hidden: !matchMedia('(hover: none) and (pointer: coarse)').matches,
      text: 'このゲームはキーボードとマウスで遊びます。パソコンでひらいてね。（メニューはタップで操作できます）'
    })
    this.root = el(
      'section.screen.title-screen',
      { 'aria-label': 'タイトル' },
      el(
        'div.title-col',
        {},
        el(
          'div.title-head',
          {},
          emblem('emblem title-emblem'),
          el(
            'h1.logo',
            { 'aria-label': 'マモノ陣形' },
            el('span.logo-a', { text: 'マモノ' }),
            el('span.logo-b', { text: '陣形' })
          ),
          el('p.subtitle', { text: '4匹のマモノが陣形を組んで、冒険者ギルドにいどむ協力アクション' })
        ),
        el('div.title-body', {}, main, host, join, howto, settings, this.busy),
        touch,
        el('p.title-foot', { text: '最大4人協力 ・ キーボード＋マウス ・ ゲームパッド対応' })
      )
    )
    for (const p of Object.values(this.panels)) menuKeys(p, () => a.sound('menuMove'))
    this.open('main', false, false)
  }

  private fail(node: HTMLElement, text: string) {
    node.textContent = text
    this.a.sound('menuBack')
  }

  open(panel: Panel, backSound = false, focus = true) {
    if (backSound) this.a.sound('menuBack')
    this.panel = panel
    for (const [k, p] of Object.entries(this.panels)) show(p, k === panel)
    this.hostError.textContent = ''
    this.joinError.textContent = ''
    if (focus) requestAnimationFrame(() => focusables(this.panels[panel])[panel === 'main' ? 0 : 0]?.focus())
  }

  /** Esc on the title: back to the main menu. Returns true when handled. */
  escape(): boolean {
    if (this.panel === 'main') return false
    this.open('main', true)
    return true
  }

  setBusy(text: string | undefined) {
    show(this.busy, !!text)
    if (text) this.busy.querySelector('.busy-text')!.textContent = text
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('.title-body button'))) b.disabled = !!text
  }

  showError(text: string) {
    const target = this.panel === 'host' ? this.hostError : this.panel === 'join' ? this.joinError : undefined
    if (target) target.textContent = text
  }

  focus() {
    focusables(this.panels[this.panel])[0]?.focus()
  }
}
