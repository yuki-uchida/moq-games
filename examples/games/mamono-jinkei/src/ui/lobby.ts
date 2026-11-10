/** The lobby: room code, players, job cards (taken jobs disabled), stage select and the start button. */
import type { View } from '../sim/types'
import {
  JOBS,
  JOB_COLORS,
  JOB_NAMES,
  SPECIES_NAMES,
  STAGES,
  STAGE_NAMES,
  STAGE_SPECIES,
  type Job,
  type StageId
} from '../vocab'
import { iconUrl } from '../render/sprites'
import { clearChildren, el, icon, menuKeys, scrollArea, setText, show } from './dom'

export interface LobbyActions {
  pickJob(job: Job): void
  pickStage(stage: StageId): void
  start(): void
  back(): void
  sound(name: 'menuMove' | 'menuSelect' | 'menuBack'): void
}

const JOB_TEXT: Record<Job, [string, string]> = {
  sword: ['近くの敵を\u200bなぎはらう', 'ため：回転斬り'],
  mage: ['魔弾で\u200bとおくからうつ', 'ため：大魔弾'],
  archer: ['矢で\u200b2体までつらぬく', 'ため：三連矢'],
  cleric: ['杖でたたいて\u200b仲間を\u200b回復', 'ため：聖なる輪']
}

/** The stage the lobby pre-selects: the newest unlocked one (the next stage to play), else the first. */
export function defaultLobbyStage(unlocked: readonly StageId[]): StageId {
  return [...STAGES].reverse().find((s) => unlocked.includes(s)) ?? STAGES[0]
}

export class LobbyScreen {
  readonly root: HTMLElement
  private readonly roomBox: HTMLElement
  private readonly roomCode: HTMLElement
  private readonly players: HTMLElement
  private readonly jobs: HTMLElement
  private readonly stages: HTMLElement
  private readonly start: HTMLButtonElement
  private readonly waiting: HTMLElement
  private readonly heading: HTMLElement
  private readonly note: HTMLElement
  private key = ''
  private jobButtons = new Map<Job, HTMLButtonElement>()
  private jobSprites = new Map<Job, HTMLImageElement>()
  private spriteSpecies = 'slime'
  private stageButtons = new Map<StageId, HTMLButtonElement>()

  constructor(private readonly a: LobbyActions) {
    this.heading = el('h2.lobby-title', { text: 'ロビー' })
    this.roomCode = el('strong.room-code', { text: '' })
    const copy = el(
      'button.btn.small',
      {
        type: 'button',
        onclick: () => {
          void navigator.clipboard?.writeText(this.roomCode.textContent ?? '').catch(() => undefined)
          copy.textContent = 'コピーしました'
          a.sound('menuSelect')
          setTimeout(() => (copy.textContent = 'コピー'), 1400)
        }
      },
      'コピー'
    )
    this.roomBox = el('div.room-box', {}, el('span', { text: 'ルームコード' }), this.roomCode, copy)
    this.players = el('ul.player-list', { 'aria-label': 'プレイヤー' })
    this.jobs = el('div.job-grid', { 'data-grid': true, role: 'radiogroup', 'aria-label': 'あなたのマモノ' })
    for (const job of JOBS) {
      const b = el(
        'button.job-card',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': 'false',
          style: `--job:${JOB_COLORS[job]}`,
          onclick: () => (a.sound('menuSelect'), a.pickJob(job))
        },
        el('span.job-sprite', {}, this.sprite(job)),
        el('span.job-name', {}, icon('ui', `job_${job}`, 24), el('span', { text: JOB_NAMES[job] })),
        el('span.job-desc', { text: JOB_TEXT[job][0] }),
        el('span.job-skill', { text: JOB_TEXT[job][1] }),
        el('span.job-taken', { text: '' })
      )
      this.jobButtons.set(job, b)
      this.jobs.append(b)
    }
    this.stages = el('div.stage-list', { 'data-grid': true, role: 'radiogroup', 'aria-label': 'ステージ' })
    STAGES.forEach((stage, i) => {
      const b = el(
        'button.stage-card',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': 'false',
          onclick: () => (a.sound('menuSelect'), a.pickStage(stage))
        },
        el('span.stage-no', { text: `ステージ ${i + 1}` }),
        el('span.stage-name', { text: STAGE_NAMES[stage] }),
        el(
          'span.stage-species',
          {},
          icon('ui', `species_${STAGE_SPECIES[stage]}`, 24),
          el('span', { text: SPECIES_NAMES[STAGE_SPECIES[stage]] })
        ),
        el('span.stage-lock', { text: '🔒 まだ遊べません' })
      )
      this.stageButtons.set(stage, b)
      this.stages.append(b)
    })
    this.start = el(
      'button.btn.primary.big.start',
      { type: 'button', onclick: () => (a.sound('menuSelect'), a.start()) },
      '出発！'
    )
    this.waiting = el('p.waiting', { text: 'ホストの開始を待っています…' })
    this.note = el('p.lobby-note', { text: '' })
    const back = el(
      'button.btn.back',
      { type: 'button', onclick: () => (a.sound('menuBack'), a.back()) },
      '← タイトルへ'
    )
    this.root = el(
      'section.screen.lobby-screen',
      { 'aria-label': 'ロビー' },
      el(
        'div.lobby-card.parchment',
        { 'data-menu': true },
        el('header.lobby-head', {}, this.heading, this.roomBox),
        scrollArea(
          el(
            'div.lobby-cols',
            {},
            el('section.lobby-col', {}, el('h3', { text: 'あなたのマモノをえらぶ' }), this.jobs, this.note),
            el(
              'section.lobby-col.side',
              {},
              el('div.players-block', {}, el('h3', { text: 'なかま' }), this.players),
              el('h3', { text: 'ステージ' }),
              this.stages
            )
          ),
          'lobby-scroll'
        ),
        el('footer.lobby-foot', {}, back, this.waiting, this.start)
      )
    )
    menuKeys(this.root, () => a.sound('menuMove'))
  }

  /** Refreshes from the lobby view. */
  update(view: View | undefined, o: { myId: string; role: string; room?: string; job?: Job; status: string }) {
    const host = o.role === 'host' || o.role === 'solo'
    this.root.classList.toggle('solo', o.role === 'solo')
    setText(this.heading, o.role === 'solo' ? 'ひとりで遊ぶ' : 'ロビー')
    show(this.roomBox, o.role === 'host' || o.role === 'guest')
    setText(this.roomCode, o.room ?? '')
    show(this.start, host)
    show(this.waiting, !host)
    if (!view) {
      setText(this.waiting, o.status || 'ホストをさがしています…')
      return
    }
    const players = view.players
    const myIndex = players.findIndex((p) => p.id === o.myId)
    const spectating = myIndex >= 4
    setText(
      this.waiting,
      spectating ? '満員のため観戦します。ホストの開始を待っています…' : 'ホストの開始を待っています…'
    )
    setText(
      this.note,
      o.role === 'solo'
        ? 'えらばなかった3匹は仲間としてついてきます。Tabでいつでも交代できます。'
        : 'だれもえらばなかったマモノは仲間（コンピューター）が動かします。'
    )
    // The job cards show the heroes in the selected stage's body.
    const species = STAGE_SPECIES[view.lobby?.stage ?? 'meadow']
    if (species !== this.spriteSpecies) {
      this.spriteSpecies = species
      for (const [job, img] of this.jobSprites) img.src = iconUrl(`hero:${species}:${job}`, 'idle_down') || img.src
    }
    const key = JSON.stringify([players.map((p) => [p.id, p.name, p.job]), view.lobby, o.job, o.role])
    if (key === this.key) return
    this.key = key
    clearChildren(this.players)
    players.forEach((p, i) => {
      const li = el(
        'li.player' + (p.id === o.myId ? '.me' : '') + (i >= 4 ? '.spectator' : ''),
        { style: p.job ? `--job:${JOB_COLORS[p.job]}` : '' },
        p.job ? icon('ui', `job_${p.job}`, 24) : el('span.no-job', { text: '？' }),
        el('span.player-name', { text: p.name || 'なかま' }),
        i === 0 ? el('span.tag.host', { text: 'ホスト' }) : undefined,
        p.id === o.myId ? el('span.tag.you', { text: 'あなた' }) : undefined,
        i >= 4 ? el('span.tag', { text: '観戦' }) : undefined
      )
      this.players.append(li)
    })
    for (const [job, b] of this.jobButtons) {
      const taker = players.find((p) => p.job === job && p.id !== o.myId)
      const mine = o.job === job
      b.disabled = !!taker || spectating
      b.classList.toggle('selected', mine)
      b.setAttribute('aria-checked', String(mine))
      setText(b.querySelector('.job-taken')!, taker ? `${taker.name || 'なかま'}がえらんだ` : '')
    }
    const unlocked = view.lobby?.unlocked ?? ['meadow']
    for (const [stage, b] of this.stageButtons) {
      const open = unlocked.includes(stage)
      const selected = view.lobby?.stage === stage
      b.disabled = !open || !host
      b.classList.toggle('locked', !open)
      b.classList.toggle('selected', selected)
      b.setAttribute('aria-checked', String(selected))
    }
  }

  private sprite(job: Job): HTMLImageElement {
    const img = icon(`hero:slime:${job}`, 'idle_down', 64, 'px-icon hero')
    this.jobSprites.set(job, img)
    return img
  }

  focus() {
    const b = [...this.jobButtons.values()].find((x) => !x.disabled)
    b?.focus()
  }
}
