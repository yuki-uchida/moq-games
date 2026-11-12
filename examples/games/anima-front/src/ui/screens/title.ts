/** Title: logo, press-any-key (unlocks audio), the main menu over the 3D backdrop (DESIGN §17.2). */
import type { AppContext, Screen } from '../../app/context'
import { resolveLoadout } from '../../app/saves'
import { SPECIES } from '../../data/species'
import { h } from '../dom'
import { focusInitial } from '../focus'
import { logo, speciesBadge } from '../widgets'

let pressed = false

const MENU: { id: string; label: string; en: string; text: string }[] = [
  { id: 'sortie', label: '出撃', en: 'SORTIE', text: '防衛任務・三つ巴演習・訓練場' },
  { id: 'loadout', label: '部隊編成', en: 'LOADOUT', text: '動物とアンティークを選ぶ' },
  { id: 'codex', label: '図鑑', en: 'CODEX', text: '動物・アンティーク・敵・世界' },
  { id: 'settings', label: '設定', en: 'SETTINGS', text: '操作・画面・音量' },
  { id: 'credits', label: 'クレジット', en: 'CREDITS', text: '' }
]

export function createTitleScreen(ctx: AppContext): Screen {
  const species = ctx.armory.species
  const def = SPECIES[species]
  const { name: loadoutName } = resolveLoadout(ctx.armory, species)

  const menu = h(
    'nav',
    { class: 'title-menu', attrs: { 'aria-label': 'メインメニュー' } },
    MENU.map((m, i) =>
      h(
        'button',
        {
          class: `title-item ${i === 0 ? 'is-main' : ''}`,
          attrs: { type: 'button', 'data-autofocus': i === 0 ? true : undefined, 'data-menu': m.id },
          style: { '--i': String(i) },
          on: {
            click: () => {
              if (m.id === 'sortie') ctx.open('sortie')
              else if (m.id === 'loadout') ctx.open('loadout', { back: { name: 'title' } })
              else if (m.id === 'codex') ctx.open('codex')
              else if (m.id === 'settings') ctx.open('settings', { back: { name: 'title' } })
              else ctx.open('credits')
            }
          }
        },
        h('span', 'title-item-label', m.label),
        h('span', 'title-item-en', m.en),
        m.text ? h('span', 'title-item-text', m.text) : null
      )
    )
  )

  const member = h(
    'button',
    {
      class: 'title-member panel',
      attrs: { type: 'button', 'aria-label': '部隊編成を開く' },
      on: { click: () => ctx.open('loadout', { back: { name: 'title' } }) }
    },
    speciesBadge(species, 46),
    h(
      'span',
      'title-member-text',
      h('small', null, '出撃する隊員'),
      h('b', null, `${def.name}`, h('em', null, `（${def.kind}）`)),
      h('span', null, `編成：${loadoutName}`)
    )
  )

  const press = h(
    'button',
    { class: 'title-press', attrs: { type: 'button', 'data-sfx': 'none' } },
    h('span', 'title-press-key', 'PRESS ANY KEY'),
    h('span', 'title-press-ja', ctx.touch ? '画面をタップしてはじめる' : 'キーを押すか、クリックしてはじめる')
  )

  const el = h(
    'div',
    `screen title ${pressed ? 'is-ready' : 'is-waiting'}`,
    h('div', 'title-logo', logo('large')),
    h('div', 'title-body', menu, member),
    press,
    h('footer', 'title-foot', h('span', null, '方舟防衛隊〈ARK〉 第七小隊'), h('span', null, 'v1.0'))
  )

  const reveal = () => {
    if (pressed && el.classList.contains('is-ready')) return
    pressed = true
    ctx.sfx('titleHit')
    el.classList.remove('is-waiting')
    el.classList.add('is-ready')
    window.removeEventListener('keydown', onAny, true)
    requestAnimationFrame(() => focusInitial(menu))
  }
  const onAny = (e: KeyboardEvent) => {
    if (e.key === 'Tab') return
    e.preventDefault()
    e.stopPropagation()
    reveal()
  }
  press.addEventListener('click', reveal)
  el.addEventListener('pointerdown', (e) => {
    if (!pressed) {
      e.preventDefault()
      reveal()
    }
  })

  return {
    id: 'title',
    el,
    music: 'title',
    backdrop: 'title',
    enter() {
      ctx.backdrop?.setSquad(
        [species, ...(['cat', 'bear', 'rabbit', 'hamster'] as const).filter((s) => s !== species)].slice(0, 4)
      )
      if (!pressed) {
        window.addEventListener('keydown', onAny, true)
        requestAnimationFrame(() => press.focus({ preventScroll: true }))
      }
    },
    leave() {
      window.removeEventListener('keydown', onAny, true)
    },
    frame() {
      // gamepad: any button reveals the menu
      if (!pressed) {
        const pads = navigator.getGamepads?.() ?? []
        for (const p of pads) if (p?.buttons.some((b) => b.pressed)) reveal()
      }
    }
  }
}
