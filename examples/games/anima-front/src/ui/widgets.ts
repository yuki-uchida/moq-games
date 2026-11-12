/** Reusable pieces shared by the menu screens. */
import type { ItemId } from '../data/items'
import type { SpeciesId } from '../data/species'
import type { Speaker } from '../data/missions'
import { emblemSvg, itemIconSvg, portraitSvg, speciesIconSvg } from './art'
import { h, svg } from './dom'

export function logo(size: 'large' | 'small' = 'large'): HTMLElement {
  return h(
    'div',
    {
      class: `logo logo-${size}`,
      attrs: { role: 'img', 'aria-label': 'アニマフロント ANIMA FRONT けものたちの防衛線' }
    },
    h('div', 'logo-emblem', svg(emblemSvg())),
    h(
      'div',
      'logo-text',
      h('div', 'logo-en', 'ANIMA FRONT'),
      h('div', 'logo-ja', h('span', 'logo-ja-a', 'アニマ'), h('span', 'logo-ja-b', 'フロント')),
      h('div', 'logo-sub', h('span', null, 'けものたちの防衛線'))
    )
  )
}

export function screenHead(o: { title: string; en: string; onBack?: () => void; extra?: Node | null }): HTMLElement {
  return h(
    'header',
    'screen-head',
    o.onBack
      ? h(
          'button',
          {
            class: 'btn btn-ghost btn-back',
            attrs: { type: 'button', 'data-sfx': 'uiBack', 'aria-label': 'もどる' },
            on: { click: () => o.onBack?.() }
          },
          'もどる'
        )
      : null,
    h('h1', null, o.title, h('small', null, o.en)),
    h('div', 'grow'),
    o.extra ?? null
  )
}

export function hintBar(items: [string, string][]): HTMLElement {
  return h(
    'div',
    'hint-bar',
    items.map(([k, label]) => h('span', null, h('b', null, k), label))
  )
}

export function speciesBadge(id: SpeciesId, size = 44): HTMLElement {
  return h('span', { class: 'badge', style: { width: `${size}px`, height: `${size}px` } }, svg(speciesIconSvg(id)))
}

export function itemIcon(id: ItemId, size = 36): HTMLElement {
  return h(
    'span',
    { class: 'icon item-icon', style: { width: `${size}px`, height: `${size}px` } },
    svg(itemIconSvg(id))
  )
}

export function portrait(who: Speaker, className = 'portrait'): HTMLElement {
  return h('span', className, svg(portraitSvg(who)))
}

/** A titled section of a panel. */
export function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', 'panel-section', h('h2', 'panel-title', title), ...children)
}
