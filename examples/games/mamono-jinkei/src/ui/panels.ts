/** Shared panels: how to play, settings, the pixel emblem, and modal dialogs. */
import type { Settings } from '../client/save'
import { cleanName } from '../net/validate'
import { JOBS, JOB_COLORS, JOB_NAMES } from '../vocab'
import { el, icon } from './dom'

/** A 40×40 pixel crest: the four slimes in formation (job colours) on a gold-rimmed medallion, scaled crisp by CSS. */
export function emblem(className = 'emblem'): HTMLCanvasElement {
  const N = 40
  const c = el('canvas', { class: className, width: N, height: N, 'aria-hidden': 'true' })
  const g = c.getContext('2d')!
  const px = (x: number, y: number, color: string) => {
    g.fillStyle = color
    g.fillRect(x, y, 1, 1)
  }
  const cx = 19.5
  const cy = 19.5
  // Medallion: outline, gold rim with a highlight, deep night inside, faint formation ring.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d > 19.6) continue
      if (d > 18.4) px(x, y, '#2a1408')
      else if (d > 16.2) px(x, y, y < cy - 4 ? '#ffe28a' : y > cy + 6 ? '#b7791f' : '#e8b440')
      else if (d > 15.2) px(x, y, '#5a3214')
      else px(x, y, d > 9.5 && d < 10.6 ? '#4b3d78' : y < cy ? '#2b2350' : '#231c40')
    }
  // Rim studs.
  for (const [x, y] of [
    [19, 2],
    [20, 2],
    [19, 37],
    [20, 37],
    [2, 19],
    [2, 20],
    [37, 19],
    [37, 20]
  ])
    px(x, y, '#fff6d0')
  const slime = ['...###...', '..#####..', '.#######.', '.#w#####w', '##k###k##', '#########', '#########', '.#######.']
  const shade = (hex: string, k: number) => {
    const n = parseInt(hex.slice(1), 16)
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
    return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
  }
  const put = (ox: number, oy: number, color: string) => {
    const dark = shade(color, 0.55)
    const light = shade(color, 1.35)
    slime.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return
        // Outline where a neighbour is empty.
        const edge = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0]
        ].some(([dx, dy]) => (slime[y + dy]?.[x + dx] ?? '.') === '.')
        const col = ch === 'k' ? '#1a1020' : ch === 'w' ? '#ffffff' : edge ? dark : y < 3 && x < 5 ? light : color
        px(ox + x, oy + y, col)
      })
    )
  }
  put(15, 5, JOB_COLORS.mage)
  put(6, 15, JOB_COLORS.sword)
  put(24, 15, JOB_COLORS.archer)
  put(15, 25, JOB_COLORS.cleric)
  // The bond: a sparkle in the middle.
  for (const [x, y, col] of [
    [19, 18, '#fff6c8'],
    [20, 18, '#fff6c8'],
    [19, 21, '#fff6c8'],
    [20, 21, '#fff6c8'],
    [18, 19, '#fff6c8'],
    [18, 20, '#fff6c8'],
    [21, 19, '#fff6c8'],
    [21, 20, '#fff6c8'],
    [19, 19, '#ffffff'],
    [20, 19, '#ffffff'],
    [19, 20, '#ffffff'],
    [20, 20, '#ffffff']
  ] as const)
    px(x, y, col)
  return c
}

const KEYS: [string, string][] = [
  ['WASD / 矢印', '移動'],
  ['マウス', 'ねらう'],
  ['クリック', 'こうげき'],
  ['長押し', 'ためこうげき（陣形なら協力技！）'],
  ['Space', 'ジャンプ（スライム）'],
  ['E', '持ち上げる・つかむ・話す・レバー'],
  ['Q', '仲間に「待て」⇄「ついてこい」'],
  ['Tab', '操作するマモノを交代'],
  ['F', '「せーの！」の合図'],
  ['Esc', 'メニュー']
]

export function howToPlay(): HTMLElement {
  return el(
    'div.howto',
    {},
    el(
      'section.howto-block',
      {},
      el('h3', { text: '操作' }),
      el('dl.keys', {}, ...KEYS.flatMap(([k, v]) => [el('dt', {}, el('kbd', { text: k })), el('dd', { text: v })]))
    ),
    el(
      'section.howto-block',
      {},
      el('h3', { text: '陣形をくもう' }),
      el('p', {
        text: '仲間どうしが近くにいると陣形になります。2匹でペア陣、3匹で三角陣、4匹で四方陣。陣形中はこうげき力アップ・ダメージ軽減、重いものも動かせます。'
      }),
      el('p', {
        text: '陣形のままクリックを長押しして、光ったらはなすと協力技「ジャンボ・プレス」！ひび割れた岩や大きなスイッチ、ボスのガードをくだけます。'
      }),
      el(
        'ul.jobs-mini',
        {},
        ...JOBS.map((j) =>
          el('li', { style: `--job:${JOB_COLORS[j]}` }, icon('ui', `job_${j}`, 24), el('span', { text: JOB_NAMES[j] }))
        )
      ),
      el('p.small', {
        text: 'ひとりで遊ぶときは4匹ぜんぶがあなたのチーム。Qで待機させて、Tabで操作を交代すると、はなれたスイッチも同時に押せます。'
      })
    )
  )
}

export interface SettingsHandlers {
  get(): Settings & { name: string }
  change(patch: Partial<Settings> & { name?: string }): void
  preview(): void
}

export function settingsForm(h: SettingsHandlers, withName = true): HTMLElement {
  const s = h.get()
  const slider = (label: string, key: 'music' | 'sfx') => {
    const input = el('input', {
      type: 'range',
      min: 0,
      max: 100,
      step: 5,
      value: Math.round(s[key] * 100),
      'aria-label': label
    })
    const out = el('output', { text: `${Math.round(s[key] * 100)}` })
    input.addEventListener('input', () => {
      out.textContent = input.value
      h.change({ [key]: Number(input.value) / 100 })
    })
    if (key === 'sfx') input.addEventListener('change', () => h.preview())
    return el('label.setting', {}, el('span', { text: label }), input, out)
  }
  const toggle = (label: string, key: 'shake' | 'muted', invert = false) => {
    const input = el('input', { type: 'checkbox', role: 'switch' })
    input.checked = invert ? !s[key] : s[key]
    input.addEventListener('change', () => h.change({ [key]: invert ? !input.checked : input.checked }))
    return el('label.setting.toggle', {}, el('span', { text: label }), input, el('i.switch', { 'aria-hidden': 'true' }))
  }
  const form = el(
    'div.settings',
    {},
    slider('音楽', 'music'),
    slider('効果音', 'sfx'),
    toggle('画面のゆれ', 'shake'),
    toggle('サウンド', 'muted', true)
  )
  if (withName) {
    const name = el('input', {
      type: 'text',
      maxlength: 12,
      value: s.name,
      placeholder: 'なまえ（12文字まで）',
      'aria-label': 'プレイヤー名',
      autocomplete: 'nickname',
      spellcheck: 'false'
    })
    name.addEventListener('input', () => h.change({ name: cleanName(name.value) }))
    form.append(el('label.setting.name', {}, el('span', { text: 'なまえ' }), name))
  }
  return form
}

/** A modal dialog; resolves with the chosen button index (Esc = last). */
export function modal(
  host: HTMLElement,
  title: string,
  text: string,
  buttons: string[],
  onSound: () => void
): Promise<number> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null
    const done = (i: number) => {
      root.remove()
      prev?.focus?.()
      resolve(i)
    }
    const actions = el(
      'div.modal-actions',
      { 'data-menu': true },
      ...buttons.map((b, i) =>
        el('button.btn' + (i === 0 ? '.primary' : ''), { type: 'button', onclick: () => (onSound(), done(i)) }, b)
      )
    )
    const box = el(
      'div.modal-box.parchment',
      { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      el('h2#modal-title', { text: title }),
      el('p', { text }),
      actions
    )
    const root = el('div.modal', {}, box)
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        done(buttons.length - 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const list = Array.from(actions.querySelectorAll('button'))
        const i = list.indexOf(document.activeElement as HTMLButtonElement)
        list[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length]?.focus()
        e.preventDefault()
      }
    })
    host.append(root)
    actions.querySelector('button')?.focus()
  })
}
