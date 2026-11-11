/**
 * The DOM screens around play: title, stage select, story, result, game over, ending, pause and help.
 * `Screens` is the seam the app talks to; `DomScreens` implements it over the markup in index.html. A later task
 * redesigns the screens by replacing this file and the HTML/CSS without touching the app or the view.
 */
import type { SaveData, StageDef, VolumeKind, Volumes } from '../game/types'

/** What the screens report back to the app. */
export interface ScreenActions {
  /** はじめから: the opening story, then the stage select. */
  newGame(): void
  /** つづきから. */
  openSelect(): void
  openTitle(): void
  /** A stage card was chosen. */
  pickStage(stage: StageDef): void
  /** The last page of a story was confirmed. */
  storyDone(): void
  /** Result screen: the next stage (or the ending after the last one). */
  next(): void
  retry(): void
  resume(): void
  togglePause(): void
  toggleMute(): void
  /** Any menu button was pressed (sound and audio unlock). */
  menuSound(): void
  /** A volume slider moved (0..1); the app applies and saves it. */
  setVolume(kind: VolumeKind, value: number): void
}

/** A paged story and which one it is, so the screen can illustrate it. */
export interface StoryInfo {
  /** The small line above the title, e.g. 「第3話」. */
  kicker: string
  title: string
  pages: readonly string[]
  /** The opening, or the number of the stage this story introduces. */
  scene: 'opening' | number
}

export interface ResultInfo {
  stage: StageDef
  last: boolean
  time: string
  /** The clear time in seconds. */
  seconds: number
  /** The best time before this run, in seconds (null on a first clear). */
  previousBest: number | null
  newRecord: boolean
  kills: number
  /** How many hits the hero took. */
  damage: number
  collected: number | null
}

export interface Screens {
  bind(actions: ScreenActions): void
  showTitle(hasSave: boolean, cleared: number, total: number): void
  showSelect(stages: readonly StageDef[], save: SaveData): void
  /** A paged story; `storyDone` fires after the last page. */
  showStory(story: StoryInfo): void
  /** Hides every screen (play). */
  showPlay(): void
  showResult(info: ResultInfo): void
  showDead(): void
  /** The paged ending, then the statistics and the way back. */
  showEnding(pages: readonly string[], stats: readonly string[]): void
  setPaused(paused: boolean): void
  setMuted(muted: boolean): void
  /** The saved volumes, for the sliders. */
  setVolumes(volumes: Volumes): void
  setTouch(visible: boolean): void
  /** Enter/Space on a screen: next story or ending page, or closes the help. */
  confirm(): void
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!

type PagedMode = 'story' | 'ending' | null

export class DomScreens implements Screens {
  private actions: ScreenActions | null = null
  private pages: readonly string[] = []
  private page = 0
  private mode: PagedMode = null
  private helpOpen = false

  bind(actions: ScreenActions) {
    this.actions = actions
    const on = (selector: string, handler: () => void) =>
      $(selector).addEventListener('click', () => {
        actions.menuSound()
        handler()
      })
    on('#start', () => actions.newGame())
    on('#continue', () => actions.openSelect())
    on('#help-open', () => this.openHelp())
    on('#help-close', () => this.closeHelp())
    on('#help-done', () => this.closeHelp())
    on('#select-back', () => actions.openTitle())
    on('#story-next', () => this.advanceStory())
    on('#result-next', () => actions.next())
    on('#result-retry', () => actions.retry())
    on('#result-select', () => actions.openSelect())
    on('#dead-retry', () => actions.retry())
    on('#dead-select', () => actions.openSelect())
    on('#ending-select', () => actions.openSelect())
    on('#ending-title-button', () => actions.openTitle())
    on('#ending-next', () => this.advanceEnding())
    on('#pause-resume', () => actions.resume())
    on('#pause-retry', () => actions.retry())
    on('#pause-select', () => actions.openSelect())
    $('#mute').addEventListener('click', () => actions.toggleMute())
    $('#pause').addEventListener('click', () => actions.togglePause())
  }

  private only(id: string | null) {
    for (const screen of Array.from(document.querySelectorAll<HTMLElement>('.screen'))) screen.hidden = true
    if (id) $(`#${id}`).hidden = false
    this.helpOpen = false
    if (id !== 'story-screen' && id !== 'ending-screen') this.mode = null
  }

  showTitle(hasSave: boolean, cleared: number, total: number) {
    this.only('title-screen')
    $<HTMLButtonElement>('#continue').hidden = !hasSave
    $('#save-note').textContent = hasSave ? `クリア ${cleared}/${total} ステージ` : 'からだを動かして、はじめよう！'
  }

  showSelect(stages: readonly StageDef[], save: SaveData) {
    this.only('select-screen')
    const grid = $('#stage-grid')
    grid.replaceChildren()
    for (const stage of stages) {
      const unlocked = stage.no <= save.unlocked
      const cleared = save.cleared.includes(stage.no)
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'stage-card' + (unlocked ? '' : ' is-locked') + (cleared ? ' is-cleared' : '')
      card.disabled = !unlocked
      card.innerHTML = `
        <span class="stage-no">${unlocked ? String(stage.no).padStart(2, '0') : '🔒'}</span>
        <span class="stage-body">
          <b>${stage.name}</b>
          <small>${unlocked ? stage.subtitle : '？？？'}</small>
          <em>${unlocked ? `ボス：${stage.boss.name}` : 'まだ開かない'}</em>
        </span>
        <span class="stage-mark">${cleared ? '★' : unlocked ? '▶' : ''}</span>`
      if (unlocked)
        card.addEventListener('click', () => {
          this.actions?.menuSound()
          this.actions?.pickStage(stage)
        })
      grid.appendChild(card)
    }
  }

  showStory(story: StoryInfo) {
    this.only('story-screen')
    this.mode = 'story'
    this.pages = story.pages
    this.page = 0
    $('#story-kicker').textContent = story.kicker
    $('#story-title').textContent = story.title
    this.renderStory()
  }

  private renderStory() {
    const box = $('#story-pages')
    box.replaceChildren()
    const p = document.createElement('p')
    p.textContent = this.pages[this.page]
    box.appendChild(p)
    const dots = document.createElement('div')
    dots.className = 'story-dots'
    this.pages.forEach((_, index) => {
      const dot = document.createElement('i')
      if (index === this.page) dot.className = 'is-active'
      dots.appendChild(dot)
    })
    box.appendChild(dots)
    $('#story-next').textContent = this.page >= this.pages.length - 1 ? 'はじめる' : 'つぎへ'
  }

  private advanceStory() {
    if (this.mode !== 'story') return
    if (this.page < this.pages.length - 1) {
      this.page += 1
      this.renderStory()
      return
    }
    this.mode = null
    this.actions?.storyDone()
  }

  showPlay() {
    this.only(null)
  }

  showResult(info: ResultInfo) {
    const { stage } = info
    $('#result-kicker').textContent = `STAGE ${stage.no} CLEAR`
    $('#result-title').textContent = `${stage.name} クリア！`
    $('#result-text').textContent = stage.clear.join(' ')
    $('#result-stats').innerHTML =
      `<span>タイム ${info.time}</span><span>たおした数 ${info.kills}</span>` +
      (info.collected !== null ? `<span>集めた材料 ${info.collected}</span>` : '')
    $('#result-next').textContent = info.last ? 'エンディングへ' : '次のステージへ'
    this.only('result-screen')
  }

  showDead() {
    this.only('dead-screen')
  }

  showEnding(pages: readonly string[], stats: readonly string[]) {
    this.only('ending-screen')
    this.mode = 'ending'
    this.pages = pages
    this.page = 0
    const box = $('#ending-stats')
    box.replaceChildren(
      ...stats.map((text) => {
        const span = document.createElement('span')
        span.textContent = text
        return span
      })
    )
    box.hidden = true
    $('#ending-select').hidden = true
    $('#ending-title-button').hidden = true
    $('#ending-next').hidden = false
    this.renderEnding()
  }

  private renderEnding() {
    const box = $('#ending-pages')
    box.replaceChildren()
    const p = document.createElement('p')
    p.textContent = this.pages[this.page]
    box.appendChild(p)
    const dots = $('#ending-dots')
    dots.replaceChildren()
    this.pages.forEach((_, index) => {
      const dot = document.createElement('i')
      if (index === this.page) dot.className = 'is-active'
      dots.appendChild(dot)
    })
    $('#ending-next').textContent = this.page >= this.pages.length - 1 ? 'おしまい' : 'つぎへ'
  }

  private advanceEnding() {
    if (this.mode !== 'ending') return
    if (this.page < this.pages.length - 1) {
      this.page += 1
      this.renderEnding()
      return
    }
    this.mode = null
    $('#ending-stats').hidden = false
    $('#ending-next').hidden = true
    $('#ending-select').hidden = false
    $('#ending-title-button').hidden = false
  }

  setPaused(paused: boolean) {
    $('#pause-screen').hidden = !paused
  }

  setMuted(muted: boolean) {
    const button = $<HTMLButtonElement>('#mute')
    button.textContent = muted ? '🔇' : '🔊'
    button.setAttribute('aria-pressed', String(muted))
  }

  setVolumes(_volumes: Volumes) {
    // The first version has no sliders.
  }

  setTouch(visible: boolean) {
    $('#touch-controls').hidden = !visible
  }

  private openHelp() {
    this.helpOpen = true
    $('#help-screen').hidden = false
  }

  private closeHelp() {
    this.helpOpen = false
    $('#help-screen').hidden = true
  }

  confirm() {
    if (this.helpOpen) this.closeHelp()
    else if (this.mode === 'story') this.advanceStory()
    else if (this.mode === 'ending') this.advanceEnding()
  }
}
