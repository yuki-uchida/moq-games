/** Live stats of the loadout editor: sustain estimate, category breakdown, warnings (DESIGN §7). */
import { fmt, safeLoadoutErrors, safeSustain } from '../../app/loadouts'
import { CATEGORY_NAMES, ITEMS, type ItemCategory } from '../../data/items'
import type { Loadout } from '../../data/loadout'
import { SPECIES, type SpeciesId } from '../../data/species'
import { h, nodes, setStyle, setText } from '../dom'

const PARTS: (ItemCategory | 'damage')[] = ['melee', 'ranged', 'armor', 'enhance', 'gadget', 'damage']
const PART_NAMES: Record<ItemCategory | 'damage', string> = { ...CATEGORY_NAMES, damage: '被弾' }

/** Sustain seconds shown on the gauge: 0..180 s maps to 0..1 (∞ = full). */
export const sustainFraction = (s: number) => (!Number.isFinite(s) ? 1 : Math.max(0, Math.min(1, s / 180)))

export const formatSustain = (s: number) => {
  if (!Number.isFinite(s)) return '∞'
  if (s >= 600) return '10分以上'
  if (s >= 60) return `${Math.floor(s / 60)}分${String(Math.round(s % 60)).padStart(2, '0')}秒`
  return `${Math.round(s)}秒`
}

export const sustainGrade = (s: number): 'good' | 'ok' | 'bad' =>
  !Number.isFinite(s) || s >= 90 ? 'good' : s >= 45 ? 'ok' : 'bad'

export interface StatsPanel {
  readonly el: HTMLElement
  update(species: SpeciesId, loadout: Loadout): void
}

export function createStatsPanel(): StatsPanel {
  const num = (label: string, unit = '') => {
    const v = h('b', null, '—')
    return { el: h('div', 'stat', h('small', null, label), h('span', null, v, unit ? h('em', null, unit) : null)), v }
  }
  const max = num('最大')
  const upkeep = num('維持', '/秒')
  const regen = num('回復', '/秒')
  const burn = num('戦闘消費', '/秒')
  const gaugeFill = h('div', 'sustain-fill')
  const gaugeText = h('b', 'sustain-value', '計算中')
  const gauge = h(
    'div',
    'sustain',
    h('div', 'sustain-head', h('span', null, '推定継戦時間'), gaugeText),
    h(
      'div',
      'sustain-bar',
      gaugeFill,
      h('i', { class: 'tick', style: { left: '25%' } }),
      h('i', { class: 'tick', style: { left: '50%' } })
    )
  )
  const breakdown = h('div', 'breakdown')
  const legend = h('div', 'breakdown-legend')
  const segs = PARTS.map((p) => {
    const seg = h('i', `seg-${p}`)
    breakdown.append(seg)
    legend.append(h('span', `lg-${p}`, PART_NAMES[p]))
    return seg
  })
  const extremes = h('div', 'extremes')
  const notes = h('ul', 'notes')
  const el = h(
    'section',
    'panel stats-panel',
    h('h2', 'panel-title', '戦闘シミュレーション'),
    gauge,
    h('div', 'stat-grid', max.el, upkeep.el, regen.el, burn.el),
    h('div', 'breakdown-wrap', breakdown, legend),
    extremes,
    notes
  )
  el.setAttribute('aria-live', 'polite')

  return {
    el,
    update(species, loadout) {
      const report = safeSustain(species, loadout)
      const errors = safeLoadoutErrors(loadout)
      const items: HTMLElement[] = errors.map((e) => h('li', 'is-error', e))
      if (!report) {
        setText(max.v, String(SPECIES[species].anima))
        setText(upkeep.v, '—')
        setText(regen.v, '—')
        setText(burn.v, '—')
        setText(gaugeText, '計算中')
        el.dataset.grade = 'pending'
        setStyle(gaugeFill, 'transform', 'scaleX(0)')
        for (const s of segs) setStyle(s, 'flex-grow', '0')
        extremes.replaceChildren()
      } else {
        setText(max.v, String(Math.round(report.maxAnima)))
        setText(upkeep.v, fmt(round2(report.upkeep)))
        setText(regen.v, fmt(round2(report.regen)))
        setText(burn.v, fmt(round2(report.burn)))
        setText(gaugeText, formatSustain(report.sustain))
        el.dataset.grade = sustainGrade(report.sustain)
        setStyle(gaugeFill, 'transform', `scaleX(${sustainFraction(report.sustain)})`)
        const total = PARTS.reduce((a, p) => a + Math.max(0, report.byCategory[p] ?? 0), 0) || 1
        PARTS.forEach((p, i) => setStyle(segs[i], 'flex-grow', String(Math.max(0, report.byCategory[p] ?? 0) / total)))
        extremes.replaceChildren(
          ...nodes(
            report.cheapest
              ? h(
                  'span',
                  null,
                  '最安 ',
                  h('b', null, ITEMS[report.cheapest.item].name),
                  ` ${fmt(report.cheapest.cost)}`
                )
              : null,
            report.priciest
              ? h(
                  'span',
                  null,
                  '最高 ',
                  h('b', null, ITEMS[report.priciest.item].name),
                  ` ${fmt(report.priciest.cost)}`
                )
              : null
          )
        )
        for (const w of report.warnings) items.push(h('li', 'is-warn', w))
      }
      notes.replaceChildren(...items)
      notes.hidden = items.length === 0
    }
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The short explanation of the anima economy shown beside the board. */
export function economyCard(): HTMLElement {
  const row = (n: string, title: string, text: string) =>
    h('li', null, h('span', 'eco-n', n), h('span', null, h('b', null, title), h('small', null, text)))
  return h(
    'section',
    'panel eco-card',
    h('h2', 'panel-title', 'アニマのしくみ'),
    h(
      'ol',
      'eco-list',
      row('16', '16のスロット', 'どのアンティークを、どこに、いくつ入れても自由。'),
      row('◆', 'すべてアニマを使う', '撃つ・斬る・守る・装備の維持。被弾でも減る。'),
      row('0', '尽きればアーマー崩壊', '動けなくなり、帰巣で基地へ戻される。安い装備を混ぜて長く戦おう。')
    )
  )
}
