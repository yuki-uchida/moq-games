/** Phase overlays (intro card, wipe, results, ending) and the pause menu. */
import type { StageResults, View } from '../sim/types'
import { JOBS, JOB_COLORS, JOB_NAMES, SPECIES_NAMES, STAGES, STAGE_NAMES, STAGE_SPECIES } from '../vocab'
import { clearChildren, clock, el, focusables, icon, menuKeys, setText, show } from './dom'
import { howToPlay, settingsForm, type SettingsHandlers } from './panels'

export interface OverlayActions {
  next(): void
  lobby(): void
  title(): void
  sound(name: 'menuMove' | 'menuSelect' | 'menuBack'): void
}

export class PhaseOverlays {
  readonly root: HTMLElement
  private readonly intro: HTMLElement
  private readonly introNo: HTMLElement
  private readonly introName: HTMLElement
  private readonly introSpecies: HTMLElement
  private readonly wipe: HTMLElement
  private readonly results: HTMLElement
  private readonly resultsBody: HTMLElement
  private readonly resultsActions: HTMLElement
  private readonly resultsWait: HTMLElement
  private readonly ending: HTMLElement
  private readonly endingActions: HTMLElement
  private readonly endingWait: HTMLElement
  private phase = ''
  private resultsKey = ''

  constructor(private readonly a: OverlayActions) {
    this.introNo = el('span.intro-no')
    this.introName = el('span.intro-name')
    this.introSpecies = el('span.intro-species')
    this.intro = el(
      'div.intro-card',
      { hidden: true },
      el('div.intro-inner', {}, this.introNo, this.introName, this.introSpecies)
    )
    this.wipe = el(
      'div.wipe',
      { hidden: true },
      el('span.wipe-title', { text: '全滅…' }),
      el('span.wipe-sub', { text: 'チェックポイントからやりなおし' })
    )
    this.resultsBody = el('div.results-body')
    this.resultsActions = el(
      'div.results-actions',
      { 'data-menu': true },
      el(
        'button.btn.primary.big',
        { type: 'button', onclick: () => (a.sound('menuSelect'), a.next()) },
        '次のステージへ'
      ),
      el('button.btn', { type: 'button', onclick: () => (a.sound('menuSelect'), a.lobby()) }, 'ロビーへ')
    )
    this.resultsWait = el('p.waiting', { text: 'ホストの選択を待っています…' })
    this.results = el(
      'div.results',
      { hidden: true },
      el(
        'div.results-card.parchment',
        {},
        el('h2.results-title', { text: 'ステージクリア！' }),
        this.resultsBody,
        this.resultsActions,
        this.resultsWait
      )
    )
    menuKeys(this.resultsActions, () => a.sound('menuMove'))
    this.endingActions = el(
      'div.results-actions',
      { 'data-menu': true },
      el('button.btn.primary', { type: 'button', onclick: () => (a.sound('menuSelect'), a.lobby()) }, 'ロビーへ'),
      el('button.btn', { type: 'button', onclick: () => (a.sound('menuSelect'), a.title()) }, 'タイトルへ')
    )
    this.endingWait = el('p.waiting', { text: 'ホストの選択を待っています…' })
    const roll = el(
      'div.roll',
      {},
      el('h2', { text: 'マモノ陣形' }),
      el('p.roll-lead', { text: '4匹のマモノは、陣形のちからで冒険者ギルドとわかりあえた。' }),
      ...[
        ['ゲームデザイン', 'マモノ陣形 制作チーム'],
        ['ドット絵', 'コードで描かれたピクセルたち'],
        ['音楽・効果音', 'Web Audio シンセサイザー楽団'],
        ['通信', 'MoQ リレー'],
        ['主演', 'スライム ・ ネズミ ・ カラス ・ ウルフ'],
        ['友情出演', '冒険者ギルドのみなさん'],
        ['スペシャルサンクス', 'いっしょに陣形を組んだ、あなた']
      ].map(([k, v]) => el('div.credit', {}, el('span.credit-role', { text: k }), el('span.credit-name', { text: v }))),
      el('p.roll-end', { text: 'おしまい ― ありがとう！' })
    )
    const party = el('div.ending-party', {}, ...JOBS.map((j) => icon(`hero:slime:${j}`, 'victory', 64, 'px-icon', 2)))
    this.ending = el(
      'div.ending',
      { hidden: true },
      el('div.roll-wrap', {}, roll),
      party,
      el('div.ending-foot', {}, this.endingActions, this.endingWait)
    )
    menuKeys(this.endingActions, () => a.sound('menuMove'))
    this.root = el('div.overlays', {}, this.intro, this.wipe, this.results, this.ending)
  }

  update(view: View | undefined, host: boolean) {
    const phase = view?.phase ?? ''
    const changed = phase !== this.phase
    this.phase = phase
    show(this.intro, phase === 'intro')
    show(this.wipe, phase === 'wipe')
    show(this.results, phase === 'clear')
    show(this.ending, phase === 'ending')
    if (!view) return
    if (phase === 'intro' && changed) {
      const i = STAGES.indexOf(view.stage)
      setText(this.introNo, `ステージ ${i + 1}`)
      setText(this.introName, STAGE_NAMES[view.stage])
      clearChildren(this.introSpecies)
      this.introSpecies.append(
        icon('ui', `species_${STAGE_SPECIES[view.stage]}`, 24),
        el('span', { text: `${SPECIES_NAMES[STAGE_SPECIES[view.stage]]}に変身！` })
      )
      this.intro.classList.remove('play')
      void this.intro.offsetWidth
      this.intro.classList.add('play')
    }
    if (phase === 'clear') {
      show(this.resultsActions, host)
      show(this.resultsWait, !host)
      const key = JSON.stringify(view.results ?? null)
      if (key !== this.resultsKey) {
        this.resultsKey = key
        this.fillResults(view.results, view)
        if (host) requestAnimationFrame(() => focusables(this.resultsActions)[0]?.focus())
      }
    } else this.resultsKey = ''
    if (phase === 'ending') {
      show(this.endingActions, host)
      show(this.endingWait, !host)
      if (changed && host) requestAnimationFrame(() => focusables(this.endingActions)[0]?.focus())
    }
  }

  private fillResults(r: StageResults | undefined, view: View) {
    clearChildren(this.resultsBody)
    if (!r) return
    const last = STAGES.indexOf(r.stage) === STAGES.length - 1
    this.resultsActions.querySelector('button')!.textContent = last ? 'エンディングへ' : '次のステージへ'
    const stat = (label: string, value: string, delay: number) =>
      el(
        'div.stat',
        { style: `--d:${delay}ms` },
        el('span.stat-label', { text: label }),
        el('span.stat-value', { text: value })
      )
    const badges = el(
      'ul.badges',
      {},
      ...r.badges.map((b, i) => {
        const job = JOBS[b.slot]
        const owner = view.players.find((p) => p.slots.includes(b.slot))
        return el(
          'li.badge',
          { style: `--job:${JOB_COLORS[job]}; --d:${900 + i * 140}ms` },
          icon('ui', `job_${job}`, 24),
          el('span.badge-who', { text: owner && view.players.length > 1 ? owner.name : JOB_NAMES[job] }),
          el('span.badge-title', { text: b.title })
        )
      })
    )
    this.resultsBody.append(
      el('div.results-stage', { text: STAGE_NAMES[r.stage] }),
      el(
        'div.results-grid',
        {},
        el(
          'div.stats',
          {},
          stat('クリアタイム', clock(r.time), 150),
          stat('ジェム', String(r.gems), 270),
          stat('協力技', `${r.techs} 回`, 390),
          stat('たおした敵', String(r.kos), 510),
          stat('全滅', `${r.wipes} 回`, 630)
        ),
        el(
          'div.rank-box',
          {},
          el('span.rank-label', { text: 'ランク' }),
          el(`span.rank-stamp.rank-${r.rank}`, { text: r.rank })
        )
      ),
      el('h3', { text: 'かつやくしたマモノ', hidden: !r.badges.length }),
      badges
    )
  }
}

export interface PauseActions extends SettingsHandlers {
  resume(): void
  title(): void
  sound(name: 'menuMove' | 'menuSelect' | 'menuBack'): void
}

export class PauseMenu {
  readonly root: HTMLElement
  private readonly main: HTMLElement
  private readonly howto: HTMLElement
  private readonly note: HTMLElement
  open = false

  constructor(private readonly a: PauseActions) {
    const item = (text: string, onclick: () => void, cls = '') =>
      el(
        `button.menu-item${cls}`,
        { type: 'button', onclick: () => (a.sound('menuSelect'), onclick()) },
        el('span.mi-main', { text })
      )
    this.note = el('p.pause-note')
    this.main = el(
      'div.pause-main',
      { 'data-menu': true },
      el('h2', { text: 'メニュー' }),
      this.note,
      item('ゲームにもどる', () => a.resume(), '.primary'),
      item('遊び方', () => this.view('howto')),
      settingsForm(a, false),
      item('タイトルへ', () => a.title())
    )
    this.howto = el(
      'div.pause-howto',
      { 'data-menu': true, hidden: true },
      el('h2', { text: '遊び方' }),
      howToPlay(),
      el('button.btn.back', { type: 'button', onclick: () => this.view('main', true) }, '← もどる')
    )
    menuKeys(this.main, () => a.sound('menuMove'))
    menuKeys(this.howto, () => a.sound('menuMove'))
    this.root = el(
      'div.pause',
      { hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'メニュー' },
      el('div.pause-card.parchment', {}, this.main, this.howto)
    )
  }

  private view(which: 'main' | 'howto', back = false) {
    if (back) this.a.sound('menuBack')
    show(this.main, which === 'main')
    show(this.howto, which === 'howto')
    requestAnimationFrame(() => focusables(which === 'main' ? this.main : this.howto)[0]?.focus())
  }

  show(solo: boolean) {
    this.open = true
    setText(this.note, solo ? 'ゲームは一時停止中です。' : 'マルチプレイ中はゲームは止まりません。')
    show(this.root, true)
    this.view('main')
  }

  hide() {
    this.open = false
    show(this.root, false)
  }

  /** Esc inside the menu: back from a sub-view, else close. Returns true when it closed the menu. */
  escape(): boolean {
    if (!this.howto.hidden) {
      this.view('main', true)
      return false
    }
    return true
  }
}
