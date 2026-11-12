/** 図鑑 (DESIGN §17.11): animals, antiques, foes (3D, rotatable) and world pages. */
import type { AppContext, Screen } from '../../app/context'
import { costLines } from '../../app/loadouts'
import { FOE_KINDS, FOES, type FoeKind } from '../../data/enemies'
import { CATEGORY_NAMES, ITEM_IDS, ITEMS, type ItemId } from '../../data/items'
import { presetById } from '../../data/loadout'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../../data/species'
import { h, nodes } from '../dom'
import { createTurntable } from '../turntable'
import { hintBar, itemIcon, portrait, screenHead, speciesBadge } from '../widgets'
import { pawLists } from '../../app/loadouts'

type Tab = 'animals' | 'antiques' | 'foes' | 'world'
const TABS: { id: Tab; label: string }[] = [
  { id: 'animals', label: '動物' },
  { id: 'antiques', label: 'アンティーク' },
  { id: 'foes', label: '敵' },
  { id: 'world', label: '世界' }
]

const FACTION: Record<string, string> = { creature: '蝕獣', machine: '蝕機', animal: 'クロヅメ連合' }

export const WORLD_PAGES: { id: string; title: string; body: string[] }[] = [
  {
    id: 'prologue',
    title: '獣暦102年',
    body: [
      '人類が姿を消してから、百年が過ぎた。',
      '最後の研究所に残された知能増強剤〈知恵の実〉。飼われていた動物たちはそれを口にし、言葉と知恵を得て、人の街を受け継いだ。',
      '彼らは人類が遺した謎のエネルギー〈アニマ〉と、それを操る兵装を掘り起こし、敬意を込めて〈アンティーク〉と呼んだ。'
    ]
  },
  {
    id: 'shoku',
    title: '〈蝕〉',
    body: [
      '——十年前。空が裂け、〈蝕（ショク）〉が降りてきた。',
      '星々のアニマを喰らい尽くしてきた侵略者は、生命体〈蝕獣〉と機械〈蝕機〉の群れで大地を覆い、いくつもの街が紫の結晶に呑まれて消えた。',
      'ARKは蝕の個体ごとにカタカナの識別名をつけている。'
    ]
  },
  {
    id: 'ark',
    title: '方舟防衛隊〈ARK〉',
    body: [
      '残された最後の砦、ヒナタ市の防衛隊。司令はアルダブラゾウガメのゲンブ。無線の向こうでは、若いセキセイインコのルリが隊員たちを見守っている。',
      '隊員たちは今日も、小さな体にアニマの鎧をまとい、終わりの見えない防衛線へ向かう。'
    ]
  },
  {
    id: 'armor',
    title: 'アニマ・アーマー',
    body: [
      '出撃中の隊員は、体を包むアニマの殻をまとう。受けたダメージも、アンティークの使用も、すべて同じアニマから引かれる。',
      'アニマが尽きると殻は砕け（アーマー崩壊）、生身になった隊員は緊急帰還装置〈帰巣〉で基地へ転送される。'
    ]
  },
  {
    id: 'kurozume',
    title: 'クロヅメ連合',
    body: ['北の国々の動物たちの同盟。アンティークを求めて他の街を襲う。相手も同じ獣で、同じアンティークを使う。']
  },
  {
    id: 'whale',
    title: 'ユメクジラ演習場',
    body: [
      '〈ユメクジラ〉と呼ばれるアンティークが映し出す仮想の街。ここで砕けた鎧は誰も傷つけない。',
      'だから隊員たちはここで、隊同士の三つ巴演習を行う。'
    ]
  }
]

export function createCodexScreen(ctx: AppContext): Screen {
  let tab: Tab = 'animals'
  const turntable = createTurntable(ctx.kit, { className: 'turntable cx-turntable' })
  const list = h('div', 'cx-list')
  const detail = h('div', 'cx-detail-body')
  const stage = h('div', 'cx-stage', turntable.ok ? turntable.canvas : null)
  const detailPanel = h('section', 'panel cx-detail', stage, detail)
  const tabButtons = TABS.map((t) =>
    h(
      'button',
      {
        class: 'lo-tab',
        attrs: { type: 'button', role: 'tab', 'data-tab': t.id, 'data-sfx': 'uiTab' },
        on: { click: () => setTab(t.id) }
      },
      t.label
    )
  )

  const entry = (key: string, icon: Node, title: string, sub: string, onPick: () => void) =>
    h(
      'button',
      {
        class: 'cx-entry',
        attrs: { type: 'button', 'data-entry': key, 'data-sfx': 'uiMove' },
        on: {
          click: () => {
            onPick()
            for (const e of Array.from(list.querySelectorAll('.cx-entry')))
              e.classList.toggle('is-on', (e as HTMLElement).dataset.entry === key)
          },
          focus: () => {
            onPick()
            for (const e of Array.from(list.querySelectorAll('.cx-entry')))
              e.classList.toggle('is-on', (e as HTMLElement).dataset.entry === key)
          }
        }
      },
      icon,
      h('span', null, h('b', null, title), h('small', null, sub))
    )

  function showAnimal(id: SpeciesId) {
    const d = SPECIES[id]
    const preset = presetById(d.preset)
    const lists = pawLists(preset.loadout)
    turntable.showCharacter(id, lists.R[0] ?? null, lists.L[0] ?? null)
    stage.hidden = false
    detail.replaceChildren(
      h('div', 'cx-title', h('small', null, d.kind), h('h2', null, d.name)),
      h('p', 'cx-text', d.profile),
      h('div', 'cx-trait', h('span', 'chip chip-anima', d.traitName), h('span', null, d.traitText)),
      h(
        'dl',
        'cx-stats',
        [
          ['アニマ', String(d.anima)],
          ['移動', `${Math.round(d.speed * 100)}%`],
          ['跳躍', `${Math.round(d.jump * 100)}%`],
          ['身長', `${d.height.toFixed(2)} m`],
          ['得意な編成', preset.name]
        ].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])
      )
    )
  }
  function showItem(id: ItemId) {
    const d = ITEMS[id]
    turntable.showItem(id)
    stage.hidden = false
    detail.replaceChildren(
      h(
        'div',
        'cx-title',
        h('small', null, `${CATEGORY_NAMES[d.category]}・モチーフ：${d.motif}`),
        h('h2', null, d.name)
      ),
      h('p', 'cx-text', d.text),
      h(
        'dl',
        'cx-stats',
        costLines(id).flatMap((l) => [h('dt', null, l.label), h('dd', null, l.value)])
      ),
      h(
        'dl',
        'cx-stats',
        itemNumbers(id).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])
      )
    )
  }
  function showFoe(kind: FoeKind) {
    const d = FOES[kind]
    turntable.showFoe(kind)
    stage.hidden = false
    detail.replaceChildren(
      h(
        'div',
        'cx-title',
        h('small', null, `${FACTION[d.faction]}${d.boss ? '・大型個体' : ''}`),
        h('h2', null, d.name)
      ),
      h('p', 'cx-text', d.text),
      h(
        'dl',
        'cx-stats',
        [
          ['体力', String(d.hp)],
          ['速さ', d.speed ? `${d.speed} m/秒` : '—'],
          ['大きさ', `${d.height} m`],
          ['攻撃', d.attacks.map((a) => ATTACK_NAMES[a.id] ?? a.id).join('・') || '—']
        ].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])
      )
    )
  }
  function showWorld(i: number) {
    const page = WORLD_PAGES[i]
    stage.hidden = true
    detail.replaceChildren(
      ...nodes(
        h('div', 'cx-title', h('small', null, '世界'), h('h2', null, page.title)),
        ...page.body.map((p) => h('p', 'cx-text cx-world', p)),
        page.id === 'ark' ? h('div', 'cx-portraits', portrait('genbu'), portrait('ruri')) : null
      )
    )
  }

  function setTab(next: Tab) {
    tab = next
    for (const b of tabButtons) b.setAttribute('aria-selected', String(b.dataset.tab === next))
    detailPanel.classList.toggle('is-world', next === 'world')
    if (next === 'animals') {
      list.replaceChildren(
        ...SPECIES_IDS.map((id) =>
          entry(id, speciesBadge(id, 40), SPECIES[id].name, SPECIES[id].kind, () => showAnimal(id))
        )
      )
      showAnimal(SPECIES_IDS[0])
    } else if (next === 'antiques') {
      list.replaceChildren(
        ...ITEM_IDS.map((id) =>
          entry(id, itemIcon(id, 36), ITEMS[id].name, `${CATEGORY_NAMES[ITEMS[id].category]}・${ITEMS[id].motif}`, () =>
            showItem(id)
          )
        )
      )
      showItem(ITEM_IDS[0])
    } else if (next === 'foes') {
      list.replaceChildren(
        ...FOE_KINDS.map((k) =>
          entry(
            k,
            h('span', `cx-foe-icon fac-${FOES[k].faction}`, FOES[k].name.slice(0, 1)),
            FOES[k].name,
            FACTION[FOES[k].faction],
            () => showFoe(k)
          )
        )
      )
      showFoe(FOE_KINDS[0])
    } else {
      list.replaceChildren(
        ...WORLD_PAGES.map((p, i) =>
          entry(p.id, h('span', 'cx-world-icon', String(i + 1)), p.title, '世界', () => showWorld(i))
        )
      )
      showWorld(0)
    }
    list.firstElementChild?.classList.add('is-on')
  }

  setTab('animals')
  tabButtons[0].setAttribute('data-autofocus', '')
  const el = h(
    'div',
    'screen codex',
    screenHead({ title: '図鑑', en: 'CODEX', onBack: () => ctx.open('title') }),
    h('div', { class: 'lo-tabs', attrs: { role: 'tablist' } }, tabButtons),
    h('div', 'cx-body', h('section', 'panel cx-list-panel', list), detailPanel),
    hintBar([
      ['Q / E', '分類'],
      ['↑↓', '項目'],
      ['ドラッグ', '回転'],
      ['Esc', 'もどる']
    ])
  )
  return {
    id: 'codex',
    el,
    music: 'menu',
    back: () => ctx.open('title'),
    tab(dir) {
      const i = TABS.findIndex((t) => t.id === tab)
      setTab(TABS[(i + dir + TABS.length) % TABS.length].id)
      ctx.sfx('uiTab')
    },
    frame(dt) {
      if (!stage.hidden) turntable.frame(dt)
    },
    leave() {
      turntable.dispose()
    }
  }
}

const ATTACK_NAMES: Record<string, string> = {
  bite: 'かみつき',
  leap: '跳びかかり',
  acid: '酸の塊',
  charge: '突進',
  dive: '急降下',
  laser: '光線',
  mortar: 'プラズマ砲',
  explode: '自爆',
  shieldDome: '防護ドーム',
  slam: '叩きつけ',
  acidRain: '酸の雨',
  summon: '呼び寄せ',
  missile: 'ミサイル',
  sweep: '薙ぎ払いレーザー',
  stomp: '踏みつけ'
}

/** Key numbers of an antique for the codex. */
export function itemNumbers(id: ItemId): [string, string][] {
  const u = ITEMS[id].use
  const p = ITEMS[id].passive
  const out: [string, string][] = []
  if (u) {
    if ('damage' in u) out.push(['威力', String(u.damage)])
    if (u.kind === 'beam') out.push(['威力', `${u.dps}/秒`])
    if ('reach' in u) out.push(['間合い', `${u.reach} m`])
    if ('range' in u && typeof u.range === 'number') out.push(['射程', `${u.range} m`])
    if ('radius' in u && typeof u.radius === 'number') out.push(['範囲', `半径 ${u.radius} m`])
    if (u.kind === 'auto') out.push(['連射', `${u.rate}発/秒`])
    if (u.kind === 'spread') out.push(['弾数', `${u.pellets}`])
    if (u.kind === 'lock') out.push(['ロック', `最大${u.maxLocks}体`])
  }
  if (p) {
    if (p.kind === 'armor') out.push(['被ダメージ', `-${Math.round(p.reduce * 100)}%`])
    if (p.kind === 'negate') out.push(['無効化', `${p.every}秒ごと`])
    if (p.kind === 'reflect') out.push(['反射', `${Math.round(p.melee * 100)}%`])
    if (p.kind === 'glide') out.push(['落下', `${p.fall} m/秒`])
  }
  return out
}
