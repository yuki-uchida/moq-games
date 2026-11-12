/**
 * 部隊編成 (DESIGN §7, §17.6): animal select with a 3D turntable, the 4×4 board, the catalogue by category with
 * a rotating 3D preview, live sustain stats, presets and 3 saves per animal. Mouse (click / drag & drop),
 * touch (tap card → tap slot), keyboard and gamepad (spatial focus) all work.
 */
import type { AppContext, RouteRef, Screen } from '../../app/context'
import {
  CATEGORY_ORDER,
  cloneLoadout,
  costLines,
  emptyLoadout,
  itemsInCategory,
  pawLists,
  placementError
} from '../../app/loadouts'
import { CUSTOM_SLOTS, defaultChoice, resolveLoadout, storeCustom, type LoadoutChoice } from '../../app/saves'
import { CATEGORY_NAMES, ITEMS, type ItemCategory, type ItemId } from '../../data/items'
import { PRESETS, type Hand, type Loadout } from '../../data/loadout'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../../data/species'
import { categoryIconSvg } from '../art'
import { h, setText, svg } from '../dom'
import { createTurntable, type Turntable } from '../turntable'
import { hintBar, itemIcon, screenHead, speciesBadge } from '../widgets'
import { createStatsPanel, economyCard } from './loadout-stats'

const sameLoadout = (a: Loadout, b: Loadout) => JSON.stringify(a.slots) === JSON.stringify(b.slots)

export function createLoadoutScreen(ctx: AppContext, args?: { back?: RouteRef }): Screen {
  let species: SpeciesId = ctx.armory.species
  let choice: LoadoutChoice = ctx.armory.choice[species] ?? defaultChoice(species)
  let saved = resolveLoadout(ctx.armory, species)
  let working: Loadout = cloneLoadout(saved.loadout)
  let armed: ItemId | null = null
  let detailItem: ItemId = 'orca'
  let hand: Hand = 'R'
  let selectedSlot: number | null = null
  let tab: ItemCategory = 'melee'

  const turntable: Turntable = createTurntable(ctx.kit, { className: 'turntable lo-turntable', distance: 4.2 })
  const preview: Turntable = createTurntable(ctx.kit, { className: 'turntable lo-preview' })
  const stats = createStatsPanel()

  const dirty = () => !sameLoadout(working, saved.loadout)

  // ---------------------------------------------------------------- species
  const speciesName = h('b', 'lo-sp-name')
  const speciesKind = h('small', 'lo-sp-kind')
  const traitName = h('span', 'chip chip-anima')
  const traitText = h('p', 'lo-sp-trait')
  const animaChip = h('span', 'chip')
  const speciesButtons = SPECIES_IDS.map((id) =>
    h(
      'button',
      {
        class: 'lo-sp-btn',
        attrs: {
          type: 'button',
          'data-species': id,
          'aria-label': `${SPECIES[id].name}（${SPECIES[id].kind}）`,
          'data-sfx': 'uiTab'
        },
        on: { click: () => void pickSpecies(id) }
      },
      speciesBadge(id, 40)
    )
  )
  const fallbackBadge = h('div', 'lo-fallback')
  const speciesPanel = h(
    'section',
    'panel lo-species',
    h('div', { class: 'lo-sp-grid', attrs: { role: 'radiogroup', 'aria-label': '動物' } }, speciesButtons),
    h('div', 'lo-stage', turntable.ok ? turntable.canvas : fallbackBadge),
    h(
      'div',
      'lo-sp-info',
      h('div', 'lo-sp-title', speciesName, speciesKind),
      h('div', 'lo-sp-tags', traitName, animaChip),
      traitText
    )
  )

  async function pickSpecies(id: SpeciesId) {
    if (id === species) return
    if (dirty() && !(await confirmDiscard())) return
    species = id
    ctx.setArmory({ ...ctx.armory, species: id })
    choice = ctx.armory.choice[id] ?? defaultChoice(id)
    saved = resolveLoadout(ctx.armory, id)
    working = cloneLoadout(saved.loadout)
    selectedSlot = null
    paintAll()
  }

  // ---------------------------------------------------------------- saves / presets
  const presetRow = h('div', 'lo-presets')
  const customRow = h('div', 'lo-customs')
  const nameLabel = h('span', 'lo-current-name')
  const dirtyChip = h('span', 'chip chip-danger lo-dirty', '未保存')
  const saveBtn = h(
    'button',
    {
      class: 'btn btn-primary lo-save',
      attrs: { type: 'button', 'data-sfx': 'none' },
      on: { click: () => void saveFlow() }
    },
    '保存'
  )
  const clearBtn = h(
    'button',
    {
      class: 'btn btn-ghost',
      attrs: { type: 'button', 'data-sfx': 'uiUnequip' },
      on: {
        click: () => {
          working = emptyLoadout()
          selectedSlot = null
          paintBoard()
        }
      }
    },
    '全部外す'
  )

  function paintSaves() {
    presetRow.replaceChildren(
      ...PRESETS.map((p) =>
        h(
          'button',
          {
            class: `lo-chip ${choice.kind === 'preset' && choice.id === p.id ? 'is-on' : ''}`,
            attrs: { type: 'button', 'data-preset': p.id, title: p.text, 'data-sfx': 'uiTab' },
            on: { click: () => void loadChoice({ kind: 'preset', id: p.id }) }
          },
          p.name
        )
      )
    )
    const customs = ctx.armory.custom[species]
    customRow.replaceChildren(
      ...Array.from({ length: CUSTOM_SLOTS }, (_, i) => {
        const entry = customs[i]
        return h(
          'button',
          {
            class: `lo-chip lo-custom ${entry ? '' : 'is-empty'} ${choice.kind === 'custom' && choice.index === i ? 'is-on' : ''}`,
            attrs: { type: 'button', 'data-custom': String(i), 'data-sfx': entry ? 'uiTab' : 'uiError' },
            on: {
              click: () => {
                if (entry) void loadChoice({ kind: 'custom', index: i })
                else ctx.toast('空きスロットです。「保存」で今の編成を保存できます')
              }
            }
          },
          h('small', null, `枠${i + 1}`),
          entry ? entry.name : '空き'
        )
      })
    )
    setText(nameLabel, saved.name)
    dirtyChip.hidden = !dirty()
  }

  async function loadChoice(next: LoadoutChoice) {
    if (dirty() && !(await confirmDiscard())) return
    choice = next
    const armory = { ...ctx.armory, choice: { ...ctx.armory.choice, [species]: next } }
    ctx.setArmory(armory)
    saved = resolveLoadout(armory, species)
    working = cloneLoadout(saved.loadout)
    selectedSlot = null
    paintAll()
  }

  async function confirmDiscard(): Promise<boolean> {
    const r = await ctx.confirm({
      title: '変更を破棄しますか？',
      text: '保存していない編成の変更は失われます。',
      buttons: [
        { value: 'keep', label: '編集にもどる' },
        { value: 'discard', label: '破棄する', primary: true }
      ]
    })
    return r === 'discard'
  }

  async function saveFlow(): Promise<boolean> {
    const customs = ctx.armory.custom[species]
    const nameInput = h('input', {
      class: 'text-input',
      attrs: {
        type: 'text',
        maxlength: 16,
        'aria-label': '編成の名前',
        value: choice.kind === 'custom' ? saved.name : `${saved.name}改`
      }
    })
    return new Promise((resolve) => {
      const close = (ok: boolean) => {
        veil.remove()
        resolve(ok)
      }
      const slotButtons = Array.from({ length: CUSTOM_SLOTS }, (_, i) =>
        h(
          'button',
          {
            class: `btn ${choice.kind === 'custom' && choice.index === i ? 'btn-primary' : ''}`,
            attrs: { type: 'button', 'data-save-slot': String(i), 'data-sfx': 'uiEquip' },
            on: {
              click: () => {
                const name = nameInput.value.trim() || `カスタム${i + 1}`
                const armory = storeCustom(ctx.armory, species, i, { name, loadout: working, savedAt: Date.now() })
                ctx.setArmory(armory)
                choice = { kind: 'custom', index: i }
                saved = resolveLoadout(armory, species)
                working = cloneLoadout(saved.loadout)
                paintAll()
                ctx.toast(`「${name}」を枠${i + 1}に保存しました`, 'ok')
                close(true)
              }
            }
          },
          h('small', null, `枠${i + 1}`),
          customs[i] ? `${customs[i]!.name}に上書き` : '空き'
        )
      )
      const veil = h(
        'div',
        { class: 'modal-veil', attrs: { role: 'dialog', 'aria-modal': 'true' } },
        h(
          'div',
          'panel modal lo-save-modal',
          h('h2', null, '編成を保存'),
          h('label', 'field', h('span', null, '名前'), nameInput),
          h('div', 'lo-save-slots', slotButtons),
          h(
            'div',
            'row',
            h(
              'button',
              {
                class: 'btn btn-ghost',
                attrs: { type: 'button', 'data-sfx': 'uiBack' },
                on: { click: () => close(false) }
              },
              'キャンセル'
            )
          )
        )
      )
      ;(veil as HTMLElement & { __close?: () => void }).__close = () => close(false)
      el.append(veil)
      ;(
        slotButtons[
          choice.kind === 'custom' ? choice.index : customs.findIndex((c) => !c) >= 0 ? customs.findIndex((c) => !c) : 0
        ] ?? slotButtons[0]
      ).focus()
    })
  }

  // ---------------------------------------------------------------- board
  const board = h('div', { class: 'lo-board', attrs: { role: 'grid', 'aria-label': '16スロット' } })
  const slotEls: HTMLButtonElement[] = []
  for (let i = 0; i < 16; i++) {
    const b = h('button', {
      class: 'lo-slot',
      attrs: { type: 'button', 'data-slot': String(i), draggable: 'true', 'data-sfx': 'none' },
      on: {
        click: () => onSlot(i),
        contextmenu: (e) => {
          e.preventDefault()
          removeSlot(i)
        },
        keydown: (e) => {
          if (e.key === 'Delete' || e.key === 'x' || e.key === 'X') {
            e.preventDefault()
            removeSlot(i)
          }
        },
        dragstart: (e) => {
          if (!working.slots[i]) {
            e.preventDefault()
            return
          }
          e.dataTransfer?.setData('text/plain', `slot:${i}`)
        },
        dragover: (e) => {
          e.preventDefault()
          b.classList.add('is-drop')
        },
        dragleave: () => b.classList.remove('is-drop'),
        drop: (e) => {
          e.preventDefault()
          b.classList.remove('is-drop')
          const data = e.dataTransfer?.getData('text/plain') ?? ''
          if (data.startsWith('item:')) place(i, data.slice(5) as ItemId)
          else if (data.startsWith('slot:')) swapSlots(Number(data.slice(5)), i)
        }
      }
    })
    slotEls.push(b)
    board.append(b)
  }
  board.addEventListener('dragover', (e) => e.preventDefault())

  function paintBoard() {
    const lists = pawLists(working)
    working.slots.forEach((s, i) => {
      const b = slotEls[i]
      b.replaceChildren()
      b.className = `lo-slot ${s ? `cat-${ITEMS[s.item].category}` : 'is-empty'} ${selectedSlot === i ? 'is-selected' : ''} ${armed ? 'is-armed' : ''}`
      if (s) {
        const def = ITEMS[s.item]
        b.append(
          itemIcon(s.item, 34),
          h('span', 'lo-slot-name', def.name),
          def.active
            ? h('span', `lo-hand hand-${s.hand}`, s.hand === 'L' ? '左' : '右')
            : h('span', 'lo-hand is-passive', '常時')
        )
        b.setAttribute(
          'aria-label',
          `スロット${i + 1}：${def.name}${def.active ? `（${s.hand === 'L' ? '左手' : '右手'}）` : ''}`
        )
      } else {
        b.append(h('span', 'lo-slot-plus', '+'))
        b.setAttribute('aria-label', `スロット${i + 1}：空き`)
      }
    })
    setText(countR, String(lists.R.length))
    setText(countL, String(lists.L.length))
    setText(countP, String(lists.passive.length))
    setText(countAll, `${working.slots.filter(Boolean).length} / 16`)
    stats.update(species, working)
    paintSaves()
    // the turntable holds the first antique of each paw, or the selected slot's antique in its paw
    let r = lists.R[0] ?? null
    let l = lists.L[0] ?? null
    const sel = selectedSlot != null ? working.slots[selectedSlot] : null
    if (sel && ITEMS[sel.item].active) {
      if (sel.hand === 'L') l = sel.item
      else r = sel.item
    }
    turntable.showCharacter(species, r, l)
  }

  function onSlot(i: number) {
    if (armed) {
      place(i, armed)
      return
    }
    if (working.slots[i]) {
      selectedSlot = selectedSlot === i ? null : i
      if (selectedSlot != null) {
        detailItem = working.slots[i]!.item
        hand = working.slots[i]!.hand ?? hand
        ctx.sfx('uiTab')
      }
      paintBoard()
      paintDetail()
    } else {
      ctx.sfx('uiError')
      ctx.toast(
        ctx.touch
          ? '先に右のカタログでアンティークを選んでください'
          : 'カタログでアンティークを選んでから、スロットを選んでください'
      )
    }
  }

  function place(i: number, item: ItemId) {
    const def = ITEMS[item]
    const slot = def.active ? { item, hand } : { item }
    const err = placementError(working, i, slot)
    if (err) {
      ctx.sfx('uiError')
      ctx.toast(err, 'error')
      return
    }
    working = cloneLoadout(working)
    working.slots[i] = slot
    selectedSlot = i
    ctx.sfx('uiEquip')
    slotEls[i].classList.add('is-pop')
    setTimeout(() => slotEls[i].classList.remove('is-pop'), 300)
    paintBoard()
    paintDetail()
  }

  function removeSlot(i: number) {
    if (!working.slots[i]) return
    working = cloneLoadout(working)
    working.slots[i] = null
    if (selectedSlot === i) selectedSlot = null
    ctx.sfx('uiUnequip')
    paintBoard()
    paintDetail()
  }

  function swapSlots(a: number, b: number) {
    if (a === b || a < 0 || a > 15) return
    working = cloneLoadout(working)
    const t = working.slots[a]
    working.slots[a] = working.slots[b]
    working.slots[b] = t
    selectedSlot = b
    ctx.sfx('uiEquip')
    paintBoard()
  }

  // ---------------------------------------------------------------- catalogue
  const tabs = h('div', { class: 'lo-tabs', attrs: { role: 'tablist' } })
  const tabButtons = CATEGORY_ORDER.map((c) =>
    h(
      'button',
      {
        class: `lo-tab cat-${c}`,
        attrs: { type: 'button', role: 'tab', 'data-tab': c, 'data-sfx': 'uiTab' },
        on: { click: () => setTab(c) }
      },
      h('span', 'icon', svg(categoryIconSvg(c))),
      CATEGORY_NAMES[c]
    )
  )
  tabs.append(...tabButtons)
  const catalogue = h('div', 'lo-catalogue')

  function setTab(c: ItemCategory) {
    tab = c
    for (const b of tabButtons) b.setAttribute('aria-selected', String(b.dataset.tab === c))
    paintCatalogue()
  }

  function paintCatalogue() {
    const used = new Map<ItemId, number>()
    for (const s of working.slots) if (s) used.set(s.item, (used.get(s.item) ?? 0) + 1)
    catalogue.replaceChildren(
      ...itemsInCategory(tab).map((id) => {
        const def = ITEMS[id]
        const n = used.get(id) ?? 0
        return h(
          'button',
          {
            class: `lo-card ${armed === id ? 'is-armed' : ''} ${detailItem === id ? 'is-detail' : ''}`,
            attrs: { type: 'button', draggable: 'true', 'data-item': id, 'data-sfx': 'uiTab' },
            on: {
              click: () => arm(id),
              focus: () => showDetail(id),
              dragstart: (e) => {
                e.dataTransfer?.setData('text/plain', `item:${id}`)
                showDetail(id)
              }
            }
          },
          itemIcon(id, 38),
          h(
            'span',
            'lo-card-text',
            h('b', null, def.name),
            h('small', null, `${def.motif}・${def.active ? '使用' : '装備'}`)
          ),
          h('span', 'lo-card-cost', costLines(id)[0]?.value ?? '0'),
          n ? h('span', 'lo-card-used', `×${n}`) : null
        )
      })
    )
  }

  function arm(id: ItemId) {
    armed = armed === id ? null : id
    selectedSlot = null
    showDetail(id)
    paintCatalogue()
    paintBoard()
    if (armed) {
      const empty = working.slots.findIndex((s) => !s)
      if (document.documentElement.classList.contains('nav-keys') && empty >= 0) slotEls[empty].focus()
    }
  }

  // ---------------------------------------------------------------- detail
  const dName = h('h3', 'lo-d-name')
  const dMotif = h('span', 'chip')
  const dCat = h('span', 'chip')
  const dText = h('p', 'lo-d-text')
  const dLines = h('dl', 'lo-d-lines')
  const handR = h(
    'button',
    {
      class: 'seg-btn',
      attrs: { type: 'button', role: 'radio', 'data-hand': 'R', 'data-sfx': 'uiTab' },
      on: { click: () => setHand('R') }
    },
    h('b', null, '右手'),
    h('small', null, '左クリック')
  )
  const handL = h(
    'button',
    {
      class: 'seg-btn',
      attrs: { type: 'button', role: 'radio', 'data-hand': 'L', 'data-sfx': 'uiTab' },
      on: { click: () => setHand('L') }
    },
    h('b', null, '左手'),
    h('small', null, '右クリック')
  )
  const handRow = h(
    'div',
    'lo-d-hands',
    h('span', 'lo-d-label', '持つ手'),
    h('div', { class: 'seg', attrs: { role: 'radiogroup' } }, handR, handL)
  )
  const removeBtn = h(
    'button',
    {
      class: 'btn btn-ghost lo-remove',
      attrs: { type: 'button', 'data-sfx': 'none' },
      on: { click: () => selectedSlot != null && removeSlot(selectedSlot) }
    },
    'スロットから外す'
  )
  const armBtn = h(
    'button',
    { class: 'btn lo-arm', attrs: { type: 'button', 'data-sfx': 'uiTab' }, on: { click: () => arm(detailItem) } },
    'スロットに入れる'
  )
  const detail = h(
    'section',
    'panel lo-detail',
    h('div', 'lo-d-stage', preview.ok ? preview.canvas : null),
    h(
      'div',
      'lo-d-body',
      h('div', 'lo-d-tags', dCat, dMotif),
      dName,
      dText,
      dLines,
      handRow,
      h('div', 'lo-d-actions', armBtn, removeBtn)
    )
  )

  function setHand(next: Hand) {
    hand = next
    // with an antique armed the toggle picks the paw for the next placement; otherwise it edits the selected slot
    if (!armed && selectedSlot != null) {
      const s = working.slots[selectedSlot]
      if (s && ITEMS[s.item].active && s.hand !== next) {
        const err = placementError(working, selectedSlot, { item: s.item, hand: next })
        if (err) {
          ctx.sfx('uiError')
          ctx.toast(err, 'error')
        } else {
          working = cloneLoadout(working)
          working.slots[selectedSlot] = { item: s.item, hand: next }
          paintBoard()
        }
      }
    }
    paintDetail()
  }

  function showDetail(id: ItemId) {
    if (detailItem === id) return
    detailItem = id
    paintDetail()
    for (const c of Array.from(catalogue.querySelectorAll<HTMLElement>('.lo-card')))
      c.classList.toggle('is-detail', c.dataset.item === id)
  }

  function paintDetail() {
    const def = ITEMS[detailItem]
    setText(dName, def.name)
    setText(dMotif, `モチーフ：${def.motif}`)
    setText(dCat, `${CATEGORY_NAMES[def.category]}・${def.active ? '使用' : '装備'}`)
    setText(dText, def.text)
    dLines.replaceChildren(...costLines(detailItem).flatMap((l) => [h('dt', null, l.label), h('dd', null, l.value)]))
    handRow.hidden = !def.active
    handR.setAttribute('aria-checked', String(hand === 'R'))
    handL.setAttribute('aria-checked', String(hand === 'L'))
    removeBtn.hidden = selectedSlot == null || !working.slots[selectedSlot]
    setText(armBtn, armed === detailItem ? '選択を解除' : 'スロットに入れる')
    preview.showItem(detailItem)
  }

  // ---------------------------------------------------------------- layout
  const countR = h('b')
  const countL = h('b')
  const countP = h('b')
  const countAll = h('span', 'lo-count')
  const boardPanel = h(
    'section',
    'panel lo-board-panel',
    h('div', 'lo-board-head', h('div', 'lo-current', h('small', null, '編成'), nameLabel, dirtyChip), countAll),
    board,
    h(
      'div',
      'lo-board-legend',
      h('span', 'hand-R', '右手 ', countR),
      h('span', 'hand-L', '左手 ', countL),
      h('span', 'is-passive', '常時 ', countP),
      h('div', 'grow'),
      clearBtn,
      saveBtn
    ),
    h('div', 'lo-saves', h('small', null, 'プリセット'), presetRow, h('small', null, 'マイ編成'), customRow)
  )

  const done = h(
    'button',
    {
      class: 'btn btn-primary lo-done',
      attrs: { type: 'button', 'data-sfx': 'uiSelect' },
      on: { click: () => void leaveScreen() }
    },
    args?.back?.name === 'lobby' ? 'ロビーへ戻る' : '決定'
  )

  const el = h(
    'div',
    'screen loadout',
    screenHead({ title: '部隊編成', en: 'LOADOUT', onBack: () => void leaveScreen(), extra: done }),
    h(
      'div',
      'lo-body',
      h('div', 'lo-col lo-col-a', speciesPanel, stats.el),
      h('div', 'lo-col lo-col-b', boardPanel, economyCard()),
      h('div', 'lo-col lo-col-c', h('section', 'panel lo-cat-panel', tabs, catalogue), detail)
    ),
    hintBar([
      ['Q / E', '分類'],
      ['Enter', '選ぶ・入れる'],
      ['Del', '外す'],
      ['Esc', 'もどる']
    ])
  )

  async function leaveScreen() {
    if (dirty()) {
      const r = await ctx.confirm({
        title: '編成が保存されていません',
        text: '保存すると、この編成で出撃します。破棄すると元の編成にもどります。',
        buttons: [
          { value: 'discard', label: '破棄する' },
          { value: 'save', label: '保存する', primary: true }
        ]
      })
      if (r === null) return
      if (r === 'save' && !(await saveFlow())) return
    }
    const back = args?.back
    if (back) ctx.open(back.name, back.args as never)
    else ctx.open('title')
  }

  function paintAll() {
    for (const b of speciesButtons) b.setAttribute('aria-checked', String(b.dataset.species === species))
    const def = SPECIES[species]
    setText(speciesName, def.name)
    setText(speciesKind, def.kind)
    setText(traitName, def.traitName)
    setText(animaChip, `アニマ ${def.anima}`)
    setText(traitText, def.traitText)
    fallbackBadge.replaceChildren(speciesBadge(species, 120))
    paintBoard()
    paintCatalogue()
    paintDetail()
  }

  speciesButtons.find((b) => b.dataset.species === species)?.setAttribute('data-autofocus', '')
  setTab(tab)
  paintAll()

  return {
    id: 'loadout',
    el,
    music: 'menu',
    backdrop: 'off',
    back: () => {
      if (armed) {
        armed = null
        paintCatalogue()
        paintBoard()
        paintDetail()
        return
      }
      void leaveScreen()
    },
    tab(dir) {
      const i = CATEGORY_ORDER.indexOf(tab)
      setTab(CATEGORY_ORDER[(i + dir + CATEGORY_ORDER.length) % CATEGORY_ORDER.length])
      ctx.sfx('uiTab')
    },
    frame(dt) {
      turntable.frame(dt)
      preview.frame(dt)
    },
    leave() {
      turntable.dispose()
      preview.dispose()
    }
  }
}
