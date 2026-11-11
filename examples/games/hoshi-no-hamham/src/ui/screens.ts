/**
 * The DOM screens around play: title, stage select, story, result, game over, ending, pause and help.
 * `Screens` is the seam the app talks to; `DomScreens` implements it over the markup in index.html, drawn with
 * the game's own sprites (pixel.ts), illustrated story panels (diorama.ts) and keyboard, mouse and touch input.
 */
import { tile } from '../art'
import type { SaveData, StageDef, VolumeKind, Volumes } from '../game/types'
import { Diorama } from './diorama'
import { anim, icon, installPixelStyles, rasterImg, restartPlayers, spriteImg, spritePlayer, spriteUrl } from './pixel'
import { countValue, fitScale, formatClock, starRating, STAR_RULES } from './rules'
import type { SoundCue } from '../view/cues'
import { moveFocus, focusables, type Direction } from './spatial'
import { CREDITS_SHOT, endingShot, resultShot, shotFor } from './story-scenes'
import { Typewriter } from './typewriter'

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
  /** Any menu button was pressed (unlocks the audio; the sound itself is a `cue`). */
  menuSound(): void
  /** A screen sound: the interface cue to play now. */
  cue(cue: SoundCue): void
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

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Typewriter speed (characters per second). */
const TYPE_CPS = 32
/** How long a leaving screen stays on as a fading copy. */
const LEAVE_MS = 240
/** The app's confirm() for a key press the screens already handled arrives within a frame or two. */
const CONFIRM_GUARD_MS = 250
/** The title logo's drop lands at 27% of its 900 ms animation. */
const LOGO_LAND_MS = 245
/** The unlock chime waits until the card that opened the select has finished its own sound. */
const UNLOCK_DELAY_MS = 360
/** Count-up ticks are never closer than this (ms). */
const TICK_MIN_GAP_MS = 45

const DEAD_LINES = [
  'だいじょうぶ、ハム彦ならきっとできる！',
  'ひと休みしたら、もういっかい！',
  'ギミックをうまく使えば、ぐっと楽になるよ。',
  'こまったら、まわりをよーくかじってみよう。',
  'ママもきっと応援してる…かも？'
]

const VOLUME_ROWS: { kind: VolumeKind; label: string; icon: string }[] = [
  { kind: 'music', label: 'おんがく', icon: 'soundOn' },
  { kind: 'sfx', label: 'こうかおん', icon: 'paw' },
  { kind: 'master', label: 'ぜんたい', icon: 'soundOn' }
]

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right'
}

type Mode = 'story' | 'ending' | 'credits' | null

/** Builds an element with a class and optional text. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Gives a pixel button its icon and a label span (the label stays the accessible name). */
function decorate(button: HTMLElement, iconName: string | null, after = false) {
  const text = button.textContent?.trim() ?? ''
  const label = el('span', 'label', text)
  button.replaceChildren(label)
  if (iconName) {
    const image = icon(iconName)
    if (after) button.append(image)
    else button.prepend(image)
  }
}

const setLabel = (button: HTMLElement, text: string) => {
  const label = button.querySelector('.label')
  if (label) label.textContent = text
  else button.textContent = text
}

/** Restarts a CSS enter animation. */
function replay(node: HTMLElement, className = 'is-entering') {
  node.classList.remove(className)
  void node.offsetWidth
  node.classList.add(className)
}

/** Count-up tally on the result card. */
interface TallyLine {
  row: HTMLElement
  value: HTMLElement
  target: number
  format: (v: number) => string
  after?: () => void
}

export class DomScreens implements Screens {
  private actions: ScreenActions | null = null
  private current: string | null = null
  private pages: readonly string[] = []
  private page = 0
  private mode: Mode = null
  private story: StoryInfo | null = null
  private typer: Typewriter | null = null
  private helpOpen = false
  private helpBuilt = false
  private paused = false
  private lastKeyAt = -Infinity
  private tallyFrame = 0
  private tallyDone = true
  private finishTally: (() => void) | null = null
  /** The new-record fanfare has just played in this tally run (so the closing chime holds back on a skip). */
  private recordSounded = false
  private storyArt: Diorama | null = null
  private endingArt: Diorama | null = null
  private resultArt: Diorama | null = null
  /** A delayed cue (the title logo landing, the unlock chime), dropped when the screen changes. */
  private cueTimer = 0
  /** The stage whose unlock chime has already played, so reopening the select stays quiet. */
  private announcedUnlock = 0
  private sliders = new Map<VolumeKind, HTMLInputElement>()
  private returnFocus: HTMLElement | null = null

  bind(actions: ScreenActions) {
    this.actions = actions
    installPixelStyles()
    this.storyArt = new Diorama($<HTMLCanvasElement>('#story-art'), reducedMotion)
    this.endingArt = new Diorama($<HTMLCanvasElement>('#ending-art'), reducedMotion)
    this.resultArt = new Diorama($<HTMLCanvasElement>('#result-art'), reducedMotion)

    // One click is one sound: `sound` is what it plays (null: the handler or the app plays its own).
    const on = (selector: string, handler: () => void, sound: SoundCue | null = 'menu-select') =>
      $(selector).addEventListener('click', () => {
        actions.menuSound()
        if (sound) actions.cue(sound)
        handler()
      })
    on('#start', () => actions.newGame())
    on('#continue', () => actions.openSelect())
    on('#help-open', () => this.openHelp())
    on('#help-close', () => this.closeHelp(), 'menu-back')
    on('#help-done', () => this.closeHelp(), 'menu-back')
    on('#select-back', () => actions.openTitle(), 'menu-back')
    on('#story-next', () => this.advanceStory(), null)
    on('#story-skip', () => this.skipStory())
    on('#result-next', () => actions.next())
    on('#result-retry', () => actions.retry())
    on('#result-select', () => actions.openSelect())
    on('#dead-retry', () => actions.retry())
    on('#dead-select', () => actions.openSelect())
    on('#ending-select', () => actions.openSelect())
    on('#ending-title-button', () => actions.openTitle(), 'menu-back')
    on('#ending-next', () => this.advanceEnding(), null)
    // The app plays the pause and resume sounds itself.
    on('#pause-resume', () => actions.resume(), null)
    on('#pause-retry', () => actions.retry())
    on('#pause-select', () => actions.openSelect())
    // A click on the story text (not on its buttons) works like Enter: complete the page, then turn it.
    for (const [box, confirm] of [
      ['#story-box', () => this.confirmStory()],
      ['#story-art', () => this.confirmStory()],
      ['#ending-box', () => this.confirmEnding()],
      ['#ending-art', () => this.confirmEnding()]
    ] as const)
      $(box).addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return
        confirm()
      })
    // The HUD's buttons belong to the HUD; these stay wired while its markup has them.
    document.querySelector('#mute')?.addEventListener('click', () => actions.toggleMute())
    document.querySelector('#pause')?.addEventListener('click', () => actions.togglePause())

    decorate($('#continue'), 'play')
    decorate($('#start'), 'paw')
    decorate($('#help-open'), 'tooth')
    decorate($('#select-back'), 'arrowLeft')
    decorate($('#story-skip'), 'next')
    decorate($('#story-next'), 'play', true)
    decorate($('#result-next'), 'next', true)
    decorate($('#result-retry'), 'retry')
    decorate($('#result-select'), 'home')
    decorate($('#dead-retry'), 'retry')
    decorate($('#dead-select'), 'home')
    decorate($('#ending-next'), 'play', true)
    decorate($('#ending-select'), 'home')
    decorate($('#ending-title-button'), 'arrowLeft')
    decorate($('#pause-resume'), 'play')
    decorate($('#pause-retry'), 'retry')
    decorate($('#pause-select'), 'home')
    decorate($('#help-close'), 'arrowLeft')
    decorate($('#help-done'), 'check')
    $('#home-link').prepend(icon('home'))
    $<HTMLImageElement>('#logo-img').src = spriteUrl('ui', 'logo')
    $('.logo-shine').style.setProperty('mask-image', `url("${spriteUrl('ui', 'logo')}")`)
    $('.logo-shine').style.setProperty('-webkit-mask-image', `url("${spriteUrl('ui', 'logo')}")`)
    this.buildPause()

    window.addEventListener('keydown', this.onKey, true)
    window.addEventListener('resize', () => this.fitLogo())
    this.fitLogo()
  }

  // ------------------------------------------------------------------------------------------ keyboard

  /** The screen that takes keys now, or null during play. */
  private activeRoot(): HTMLElement | null {
    if (this.helpOpen) return $('#help-screen')
    if (this.paused) return $('#pause-screen')
    if (!this.current) return null
    const root = $(`#${this.current}`)
    return root.hidden ? null : root
  }

  private onKey = (event: KeyboardEvent) => {
    const root = this.activeRoot()
    if (!root || event.altKey || event.ctrlKey || event.metaKey) return
    const code = event.code
    const handled = () => {
      event.preventDefault()
      event.stopPropagation()
    }
    const dir = ARROWS[code]
    if (dir) {
      handled()
      const focused = document.activeElement
      if (focused instanceof HTMLInputElement && focused.type === 'range' && (dir === 'left' || dir === 'right')) {
        this.nudge(focused, dir === 'right' ? 1 : -1)
        return
      }
      if (moveFocus(root, dir)) this.actions?.cue('menu-move')
      return
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      // Tab and the native button keys stay with the browser only for links.
      if (document.activeElement instanceof HTMLAnchorElement && code !== 'Space') return
      handled()
      if (event.repeat) return
      this.lastKeyAt = performance.now()
      this.activate(root)
      return
    }
    if (code === 'Escape' || code === 'Backspace' || (code === 'KeyP' && this.paused)) {
      if (event.repeat) {
        if (this.paused) handled()
        return
      }
      if (this.back(root) || this.paused) handled()
    }
  }

  /** Enter/Space on the active screen. */
  private activate(root: HTMLElement) {
    const focused = document.activeElement as HTMLElement | null
    const inside = focused && root.contains(focused) && focused !== root ? focused : null
    const id = root.id
    if (id === 'story-screen' && this.mode === 'story') {
      if (inside?.id === 'story-skip') inside.click()
      else this.confirmStory()
      return
    }
    if (id === 'ending-screen' && this.mode === 'ending') {
      this.confirmEnding()
      return
    }
    if (id === 'result-screen' && !this.tallyDone) {
      this.finishTally?.()
      return
    }
    if (inside instanceof HTMLInputElement) return
    if (inside) inside.click()
    else focusables(root)[0]?.focus()
  }

  /** Esc: one step back. */
  private back(root: HTMLElement): boolean {
    switch (root.id) {
      case 'help-screen':
        this.actions?.menuSound()
        this.actions?.cue('menu-back')
        this.closeHelp()
        return true
      case 'pause-screen':
        // The app plays the resume sound.
        this.actions?.resume()
        return true
      case 'select-screen':
        this.actions?.menuSound()
        this.actions?.cue('menu-back')
        this.actions?.openTitle()
        return true
      case 'story-screen':
        if (this.mode !== 'story') return false
        this.actions?.cue('menu-back')
        this.skipStory()
        return true
      default:
        return false
    }
  }

  confirm() {
    // The screens handle Enter/Space themselves; this only acts on presses they did not see.
    if (performance.now() - this.lastKeyAt < CONFIRM_GUARD_MS) return
    if (this.helpOpen) {
      this.actions?.cue('menu-back')
      this.closeHelp()
    } else if (this.mode === 'story') this.confirmStory()
    else if (this.mode === 'ending') this.confirmEnding()
    else if (this.current === 'result-screen' && !this.tallyDone) this.finishTally?.()
  }

  // ----------------------------------------------------------------------------------- screen changes

  /** Leaves the current screen with a short fade of a frozen copy, then shows `id` with its enter animation. */
  private show(id: string | null, focus?: HTMLElement | null) {
    this.helpOpen = false
    $('#help-screen').hidden = true
    if (this.paused) this.hidePause(false)
    for (const screen of Array.from(document.querySelectorAll<HTMLElement>('.screen'))) {
      if (screen.hidden || screen.id === id) continue
      this.leave(screen)
    }
    if (this.current !== 'story-screen' || id !== 'story-screen') this.storyArt?.stop()
    if (id !== 'ending-screen') this.endingArt?.stop()
    if (id !== 'story-screen' && id !== 'ending-screen') {
      this.typer?.cancel()
      this.mode = null
    }
    if (id !== 'result-screen') {
      this.stopTally()
      this.resultArt?.stop()
    }
    window.clearTimeout(this.cueTimer)
    this.current = id
    if (!id) {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      return
    }
    const screen = $(`#${id}`)
    screen.hidden = false
    replay(screen)
    if (focus) focus.focus({ preventScroll: true })
  }

  /** A fading, inert copy of a screen that is leaving (the real one is hidden at once). */
  private leave(screen: HTMLElement) {
    screen.hidden = true
    screen.classList.remove('is-entering')
    if (typeof screen.cloneNode !== 'function') return
    const ghost = screen.cloneNode(true) as HTMLElement
    ghost.removeAttribute('id')
    for (const node of Array.from(ghost.querySelectorAll('[id]'))) node.removeAttribute('id')
    ghost.classList.remove('screen', 'is-entering')
    ghost.classList.add('screen-ghost')
    ghost.hidden = false
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    const from = screen.querySelectorAll('canvas')
    const to = ghost.querySelectorAll('canvas')
    from.forEach((canvas, i) => {
      const copy = to[i]
      copy.width = canvas.width
      copy.height = canvas.height
      try {
        copy.getContext('2d')?.drawImage(canvas, 0, 0)
      } catch {
        /* an empty canvas cannot be copied; the ghost shows it blank */
      }
    })
    screen.after(ghost)
    window.setTimeout(() => ghost.remove(), LEAVE_MS + 40)
  }

  // ------------------------------------------------------------------------------------------- title

  showTitle(hasSave: boolean, cleared: number, total: number) {
    const start = $<HTMLButtonElement>('#start')
    const cont = $<HTMLButtonElement>('#continue')
    cont.hidden = !hasSave
    cont.classList.toggle('pxbtn-gold', hasSave)
    start.classList.toggle('pxbtn-gold', !hasSave)
    const note = $('#save-note')
    note.replaceChildren()
    if (hasSave) {
      note.append(icon('starOn'), el('span', '', `クリア ${cleared}/${total}`))
    } else note.append(el('span', '', 'かじって、掘って、逃げきろう！'))
    this.show('title-screen', hasSave ? cont : start)
    this.fitLogo()
    // The logo's drop lands (at once under reduced motion, where it does not drop).
    this.cueLater('title-start', reducedMotion() ? 0 : LOGO_LAND_MS)
  }

  /** Plays a cue after a delay unless another screen opens first. */
  private cueLater(cue: SoundCue, ms: number) {
    window.clearTimeout(this.cueTimer)
    this.cueTimer = window.setTimeout(() => this.actions?.cue(cue), ms)
  }

  /** The logo at the largest whole-number device scale that fits the top of the stage. */
  private fitLogo() {
    const logo = document.querySelector<HTMLImageElement>('#logo-img')
    const stage = document.querySelector<HTMLElement>('#stage-wrap')
    if (!logo || !stage) return
    const rect = stage.getBoundingClientRect()
    if (!rect.width) return
    const dpr = window.devicePixelRatio || 1
    const portrait = window.innerHeight > window.innerWidth
    const maxW = rect.width * (portrait ? 0.86 : 0.62)
    const maxH = rect.height * (portrait ? 0.62 : 0.38)
    const fit = fitScale(384, 128, maxW, maxH, dpr)
    // Below one device pixel per art pixel (a narrow screen at 1×) the logo can only shrink to fit.
    const shrink = Math.min(1, maxW / fit.cssW, maxH / fit.cssH)
    const art = logo.parentElement!
    art.style.width = `${Math.floor(fit.cssW * shrink)}px`
    art.style.height = `${Math.floor(fit.cssH * shrink)}px`
  }

  // -------------------------------------------------------------------------------------- stage select

  showSelect(stages: readonly StageDef[], save: SaveData) {
    const grid = $('#stage-grid')
    grid.replaceChildren()
    const newest = Math.max(1, Math.min(stages.length, save.unlocked))
    let focus: HTMLButtonElement | null = null
    stages.forEach((stage, index) => {
      const unlocked = stage.no <= save.unlocked
      const cleared = save.cleared.includes(stage.no)
      const isNew = unlocked && stage.no === newest && !cleared
      const item = el('div', 'stage-item')
      item.setAttribute('role', 'listitem')
      const card = el('button', `stage-card theme-${stage.theme}`)
      card.type = 'button'
      if (!unlocked) card.classList.add('is-locked')
      if (cleared) card.classList.add('is-cleared')
      if (isNew) card.classList.add('is-new')
      card.disabled = !unlocked
      card.style.setProperty('--i', String(index))
      const best = save.best[stage.id]
      card.setAttribute(
        'aria-label',
        unlocked
          ? `ステージ${stage.no} ${stage.name}　ボス ${stage.boss.name}${cleared ? '　クリア済み' : ''}${best ? `　ベスト ${formatClock(best)}` : ''}`
          : `ステージ${stage.no} まだひらいていない`
      )

      const emblem = el('span', 'card-emblem')
      emblem.append(spriteImg('ui', `theme_${stage.theme}`, { className: 'emblem' }))
      if (!unlocked) emblem.append(icon('lock', { className: 'card-lock' }))
      const no = el('span', 'card-no', String(stage.no).padStart(2, '0'))
      const body = el('span', 'card-body')
      body.append(el('span', 'card-name', unlocked ? stage.name : '？？？'))
      const bossLine = el('span', 'card-boss')
      if (unlocked) {
        bossLine.append(spriteImg('ui', `face_${stage.boss.art}`, { className: 'face' }))
        bossLine.append(el('span', 'card-boss-name', stage.boss.name))
      } else bossLine.append(el('span', 'card-boss-name', 'まだひらかない'))
      body.append(bossLine)
      const foot = el('span', 'card-foot')
      const time = el('span', 'card-best')
      time.append(icon('clock'), el('span', 'num', best ? formatClock(best) : '-:--.-'))
      foot.append(time, icon(cleared ? 'starOn' : 'starOff', { className: 'card-star' }))
      card.append(emblem, no, body, foot)
      if (isNew) card.append(el('span', 'card-new', 'つぎはここ！'))
      if (unlocked)
        card.addEventListener('click', () => {
          this.actions?.menuSound()
          this.actions?.cue('menu-select')
          this.actions?.pickStage(stage)
        })
      if (unlocked && (stage.no === newest || !focus)) focus = card
      item.append(card)
      grid.append(item)
    })
    const progress = $('#select-progress')
    progress.replaceChildren(
      icon('starOn'),
      el('span', 'num', `${save.cleared.length}`),
      el('span', 'of', `/ ${stages.length}`),
      el('span', 'progress-label', 'クリア')
    )
    this.show('select-screen', focus)
    ;(focus as HTMLButtonElement | null)?.scrollIntoView?.({ block: 'nearest' })
    // A stage that has just opened (not the very first one) is highlighted: chime once for it.
    const fresh = stages.find((stage) => stage.no === newest && stage.no > 1 && !save.cleared.includes(stage.no))
    if (fresh && fresh.no !== this.announcedUnlock) {
      this.announcedUnlock = fresh.no
      this.cueLater('unlock', UNLOCK_DELAY_MS)
    }
  }

  // ------------------------------------------------------------------------------------------- story

  showStory(story: StoryInfo) {
    this.story = story
    this.pages = story.pages
    this.page = 0
    $('#story-kicker').textContent = story.kicker
    $('#story-title').textContent = story.title
    const art = this.storyArt!
    art.setShot(shotFor(story.scene, 0), false)
    this.show('story-screen', $('#story-next'))
    this.mode = 'story'
    art.start()
    this.renderStory()
  }

  private renderStory() {
    const story = this.story
    if (!story) return
    this.renderPage($('#story-pages'), $('#story-dots'), this.pages[this.page])
    setLabel($('#story-next'), this.page >= this.pages.length - 1 ? 'はじめる' : 'つぎへ')
    this.storyArt?.setShot(shotFor(story.scene, this.page))
  }

  /** One page of typewriter text and the page dots. */
  private renderPage(box: HTMLElement, dots: HTMLElement, text: string) {
    this.typer?.cancel()
    const p = el('p', 'page-text')
    box.replaceChildren(p)
    replay(p, 'is-turning')
    this.typer = new Typewriter(p, text, TYPE_CPS, reducedMotion(), undefined, () => this.actions?.cue('text-blip'))
    dots.replaceChildren(
      ...this.pages.map((_, index) => el('i', index === this.page ? 'is-active' : index < this.page ? 'is-read' : ''))
    )
  }

  /** Enter or a click on the text: complete the page, then turn it. */
  private confirmStory() {
    if (this.mode !== 'story') return
    if (this.typer && !this.typer.done) this.typer.finish()
    else {
      this.actions?.menuSound()
      this.advanceStory()
    }
  }

  private advanceStory() {
    if (this.mode !== 'story') return
    if (this.page < this.pages.length - 1) {
      this.actions?.cue('page-turn')
      this.page += 1
      this.renderStory()
      return
    }
    // The last page: the story is over, the stage (or the select) takes it from here.
    this.actions?.cue('menu-select')
    this.mode = null
    this.actions?.storyDone()
  }

  private skipStory() {
    if (this.mode !== 'story') return
    this.mode = null
    this.typer?.cancel()
    this.actions?.storyDone()
  }

  showPlay() {
    this.show(null)
  }

  // ------------------------------------------------------------------------------------------ result

  showResult(info: ResultInfo) {
    const { stage } = info
    $('#result-kicker').textContent = `ステージ ${stage.no}`
    $('#result-title').textContent = 'ステージクリア！'
    $('#result-stage').textContent = stage.name
    $('#result-text').textContent = stage.clear.join('')
    setLabel($('#result-next'), info.last ? 'エンディングへ' : 'つぎのステージへ')

    const list = $('#result-stats')
    list.replaceChildren()
    const lines: TallyLine[] = []
    const line = (
      iconNode: HTMLElement,
      label: string,
      target: number,
      format: (v: number) => string,
      after?: (row: HTMLElement) => void
    ) => {
      const row = el('li', 'tally-row')
      const value = el('b', 'tally-value num', format(0))
      row.append(iconNode, el('span', 'tally-label', label), el('i', 'tally-dots'), value)
      list.append(row)
      lines.push({ row, value, target, format, after: after ? () => after(row) : undefined })
    }
    line(icon('clock'), 'タイム', info.seconds, formatClock, (row) => {
      if (info.newRecord) {
        const badge = el('span', 'badge badge-pink', 'しんきろく！')
        row.append(badge)
        this.actions?.cue('new-record')
        this.recordSounded = true
        if (info.previousBest !== null)
          row.after(el('li', 'tally-sub', `まえのベスト ${formatClock(info.previousBest)}`))
      }
    })
    line(icon('tooth'), 'たおした敵', info.kills, (v) => String(Math.round(v)))
    line(
      icon('heartFull'),
      'うけたダメージ',
      info.damage,
      (v) => String(Math.round(v)),
      (row) => {
        if (info.damage === 0) row.append(el('span', 'badge badge-gold', 'ノーダメージ！'))
      }
    )
    if (info.collected !== null)
      line(
        spriteImg('prop:twig', 'idle', { className: 'icon', scale: 1 }),
        '巣のざいりょう',
        info.collected,
        (v) => `${Math.round(v)}${stage.collect ? ` / ${stage.collect}` : ''}`
      )

    const stars = $('#result-stars')
    stars.replaceChildren()
    const earned = starRating(info.damage)
    const starNodes = STAR_RULES.map((rule, index) => {
      const on = index < earned
      const cell = el('div', `star-cell${on ? ' is-on' : ''}`)
      cell.append(icon(on ? 'starOn' : 'starOff', { className: 'star-big' }), el('small', '', rule.label))
      stars.append(cell)
      return cell
    })
    stars.setAttribute('aria-label', `ほし ${earned} / 3`)
    stars.setAttribute('role', 'img')

    // A quiet backdrop of the stage's own world (dimmed by the stylesheet) instead of the black canvas behind.
    this.resultArt!.setShot(resultShot(stage.theme, stage.no), false)
    this.show('result-screen', $('#result-next'))
    this.resultArt!.start()
    this.runTally(lines, starNodes)
  }

  private runTally(lines: TallyLine[], stars: HTMLElement[]) {
    this.stopTally()
    const START = 320
    const GAP = 360
    const COUNT = 520
    const starsAt = START + lines.length * GAP + 120
    const card = $('.result-card')
    card.classList.remove('is-tallied')
    const finish = () => {
      cancelAnimationFrame(this.tallyFrame)
      this.recordSounded = false
      for (const l of lines) {
        l.row.classList.add('is-in')
        l.value.textContent = l.format(l.target)
        if (l.after && !l.row.dataset.after) {
          l.row.dataset.after = '1'
          l.after()
        }
      }
      for (const s of stars) s.classList.add('is-in')
      card.classList.add('is-tallied')
      this.tallyDone = true
      this.finishTally = null
      // The closing chime; a skip that just revealed a new record lets that fanfare stand alone.
      if (!this.recordSounded) this.actions?.cue('tally-done')
      this.recordSounded = false
    }
    this.tallyDone = false
    this.finishTally = finish
    if (reducedMotion()) {
      finish()
      return
    }
    const t0 = performance.now()
    let lastTick = -Infinity
    const step = (now: number) => {
      const t = now - t0
      lines.forEach((l, i) => {
        const at = START + i * GAP
        if (t < at) return
        l.row.classList.add('is-in')
        const p = Math.min(1, (t - at) / COUNT)
        const text = l.format(p >= 1 ? l.target : countValue(l.target, p))
        // A tick whenever a counting number changes, never closer together than the floor.
        if (text !== l.value.textContent && p < 1 && now - lastTick >= TICK_MIN_GAP_MS) {
          lastTick = now
          this.actions?.cue('tally-tick')
        }
        l.value.textContent = text
        if (p >= 1 && l.after && !l.row.dataset.after) {
          l.row.dataset.after = '1'
          l.after()
        }
      })
      stars.forEach((s, i) => {
        if (t >= starsAt + i * 220) s.classList.add('is-in')
      })
      if (t >= starsAt + stars.length * 220 + 200) finish()
      else this.tallyFrame = requestAnimationFrame(step)
    }
    this.tallyFrame = requestAnimationFrame(step)
  }

  private stopTally() {
    cancelAnimationFrame(this.tallyFrame)
    this.tallyDone = true
    this.finishTally = null
  }

  // --------------------------------------------------------------------------------------- game over

  showDead() {
    const art = $('#dead-art')
    // The hero lies dazed: the last two frames of the fall (flat on his back, then eyes swirling), swapping gently.
    const last = anim('hero', 'die').frames.length - 1
    art.replaceChildren(
      spritePlayer('hero', 'die', {
        className: 'dead-hero',
        stillFrame: last,
        cycle: { frames: [last - 1, last], every: 0.6 }
      })
    )
    $('#dead-text').textContent = DEAD_LINES[Math.floor(Math.random() * DEAD_LINES.length)]
    this.show('dead-screen', $('#dead-retry'))
    restartPlayers(art)
  }

  // ------------------------------------------------------------------------------------------ ending

  showEnding(pages: readonly string[], stats: readonly string[]) {
    this.pages = pages
    this.page = 0
    const box = $('#ending-stats')
    box.replaceChildren(
      ...stats.map((text, index) => {
        const row = el('li', 'tally-row is-in')
        row.style.setProperty('--i', String(index))
        const star = text.startsWith('★')
        const clean = text.replace(/^★\s*/, '')
        const match = /^(.*?)\s+([\d:/]+)$/.exec(clean)
        row.append(icon(star ? 'starOn' : index === 0 ? 'check' : 'clock'))
        if (match)
          row.append(el('span', 'tally-label', match[1]), el('i', 'tally-dots'), el('b', 'tally-value num', match[2]))
        else row.append(el('span', 'tally-label tally-wide', clean))
        return row
      })
    )
    box.hidden = true
    $('#ending-pages').hidden = false
    $('#ending-dots').hidden = false
    $('#ending-credits').hidden = true
    $('#ending-select').hidden = true
    $('#ending-title-button').hidden = true
    $('#ending-next').hidden = false
    this.endingArt!.setShot(endingShot(0), false)
    this.show('ending-screen', $('#ending-next'))
    this.mode = 'ending'
    this.endingArt!.start()
    this.renderEnding()
  }

  private renderEnding() {
    this.renderPage($('#ending-pages'), $('#ending-dots'), this.pages[this.page])
    setLabel($('#ending-next'), this.page >= this.pages.length - 1 ? 'おしまい' : 'つぎへ')
    this.endingArt?.setShot(endingShot(this.page))
  }

  private confirmEnding() {
    if (this.mode !== 'ending') return
    if (this.typer && !this.typer.done) this.typer.finish()
    else {
      this.actions?.menuSound()
      this.advanceEnding()
    }
  }

  private advanceEnding() {
    if (this.mode !== 'ending') return
    this.actions?.cue('page-turn')
    if (this.page < this.pages.length - 1) {
      this.page += 1
      this.renderEnding()
      return
    }
    this.mode = 'credits'
    this.typer?.finish()
    // The last page stays as the closing line above the statistics.
    $('#ending-dots').hidden = true
    const stats = $('#ending-stats')
    stats.hidden = false
    replay(stats)
    $('#ending-next').hidden = true
    $('#ending-select').hidden = false
    $('#ending-title-button').hidden = false
    $('#ending-select').focus({ preventScroll: true })
    this.endingArt?.setShot(CREDITS_SHOT)
    this.rollCredits()
  }

  private rollCredits() {
    const credits = $('#ending-credits')
    const roll = el('div', 'credits-roll')
    const block = (title: string, ...rows: (string | HTMLElement)[]) => {
      const section = el('div', 'credits-block')
      section.append(el('p', 'credits-title', title))
      for (const row of rows) section.append(typeof row === 'string' ? el('p', 'credits-line', row) : row)
      roll.append(section)
    }
    const cast = (face: string, name: string) => {
      const row = el('p', 'credits-line credits-cast')
      row.append(spriteImg('ui', face, { className: 'face' }), el('span', '', name))
      return row
    }
    roll.append(el('p', 'credits-name', '星のハムハム'))
    block(
      'キャスト',
      cast('face_hero', 'ハム彦'),
      cast('face_princess', 'ハム姫'),
      cast('face_mom', 'ママ・ハム代'),
      cast('face_king', '黒ハム王')
    )
    block(
      'ばくろ団',
      cast('face_crowBoss', 'カラス助'),
      cast('face_weaselBoss', 'いたち丞相'),
      cast('face_boarBoss', 'いのしし番長'),
      cast('face_wolfBoss', 'おおかみ檄'),
      cast('face_foxBoss', 'きつね旋風'),
      cast('face_apeBoss', 'ごりら警部'),
      cast('face_beeBoss', 'ハチ女王')
    )
    block('もりのぬし', cast('face_bearBoss', 'ヒョウタン熊'))
    block('つくったひと', 'moq-games', 'ドット絵・おんがく・こうかおんは ぜんぶプログラムでかきました')
    block('そして', 'あそんでくれた あなた')
    roll.append(el('p', 'credits-end', 'ありがとう！'))
    credits.replaceChildren(roll)
    credits.hidden = false
    replay(credits)
    // Roll from below the picture until the last line sits in the middle of it.
    requestAnimationFrame(() => {
      const box = credits.clientHeight
      const height = roll.scrollHeight
      const end = roll.lastElementChild as HTMLElement | null
      const endMiddle = end ? end.offsetTop + end.offsetHeight / 2 : height
      const to = box / 2 - endMiddle
      roll.style.setProperty('--from', `${box}px`)
      roll.style.setProperty('--to', `${to}px`)
      roll.style.setProperty('--roll', `${Math.max(8, (box - to) / 28)}s`)
    })
  }

  // ------------------------------------------------------------------------------------------- pause

  private buildPause() {
    const box = $('#volumes')
    box.replaceChildren()
    for (const row of VOLUME_ROWS) {
      const label = el('label', 'volume')
      const id = `volume-${row.kind}`
      label.htmlFor = id
      const input = el('input', 'pxrange')
      input.type = 'range'
      input.id = id
      input.min = '0'
      input.max = '100'
      input.step = '5'
      input.value = '80'
      input.setAttribute('aria-label', row.label)
      const out = el('output', 'volume-value num', '80')
      const sync = () => {
        out.textContent = input.value
        input.style.setProperty('--v', `${input.value}%`)
      }
      input.addEventListener('input', () => {
        sync()
        this.actions?.setVolume(row.kind, Number(input.value) / 100)
      })
      input.addEventListener('change', () => {
        this.actions?.menuSound()
        this.actions?.cue('menu-select')
      })
      label.append(icon(row.icon), el('span', 'volume-label', row.label), input, out)
      box.append(label)
      this.sliders.set(row.kind, input)
      sync()
    }
    const keys = $('#pause-keys')
    const key = (labels: (string | HTMLElement)[], text: string) => {
      const li = el('li')
      const caps = el('span', 'caps')
      for (const l of labels) {
        const cap = el('kbd', 'cap')
        if (typeof l === 'string') cap.textContent = l
        else cap.append(l)
        caps.append(cap)
      }
      li.append(caps, el('span', '', text))
      return li
    }
    keys.replaceChildren(
      key([icon('arrowLeft'), icon('arrowRight')], 'あるく'),
      key([icon('arrowUp'), 'スペース'], 'ジャンプ'),
      key(['Z', 'X'], 'かじる'),
      key(['M'], 'おと'),
      key(['Esc'], 'つづける')
    )
  }

  private nudge(input: HTMLInputElement, sign: number) {
    const value = Math.max(0, Math.min(100, Number(input.value) + sign * Number(input.step || 5)))
    if (String(value) === input.value) return
    input.value = String(value)
    this.actions?.cue('menu-move')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  setVolumes(volumes: Volumes) {
    for (const [kind, input] of this.sliders) {
      const value = Math.round((volumes[kind] ?? 0) * 100)
      input.value = String(value)
      input.style.setProperty('--v', `${value}%`)
      const out = input.parentElement?.querySelector('output')
      if (out) out.textContent = String(value)
    }
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return
    if (paused) {
      this.paused = true
      this.returnFocus = document.activeElement as HTMLElement | null
      const screen = $('#pause-screen')
      screen.hidden = false
      replay(screen)
      $('#pause-resume').focus({ preventScroll: true })
    } else this.hidePause(true)
  }

  private hidePause(animate: boolean) {
    this.paused = false
    const screen = $('#pause-screen')
    if (screen.hidden) return
    if (animate) this.leave(screen)
    else
      screen.hidden = true
      // Play has no focused control: Enter must not press a button left focused behind the game.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    this.returnFocus = null
  }

  setMuted(muted: boolean) {
    const button = document.querySelector<HTMLButtonElement>('#mute')
    if (!button) return
    // The HUD draws the speaker sprite from aria-pressed; the button carries no emoji of its own.
    button.setAttribute('aria-pressed', String(muted))
  }

  setTouch(visible: boolean) {
    const controls = document.querySelector<HTMLElement>('#touch-controls')
    if (controls) controls.hidden = !visible
  }

  // -------------------------------------------------------------------------------------------- help

  private buildHelp() {
    if (this.helpBuilt) return
    this.helpBuilt = true
    const moves = $('#help-moves')
    const caps = (...labels: (string | HTMLElement)[]) => {
      const box = el('span', 'caps')
      for (const l of labels) {
        const cap = el('kbd', 'cap')
        if (typeof l === 'string') cap.textContent = l
        else cap.append(l)
        box.append(cap)
      }
      return box
    }
    const move = (clip: string, title: string, keys: HTMLElement, touch: string, note: string) => {
      const li = el('li', 'move')
      const stage = el('span', 'move-sprite')
      stage.append(
        spritePlayer('hero', clip, { className: 'move-hero', repeatEvery: clip === 'run' ? undefined : 1.2 })
      )
      const body = el('span', 'move-body')
      const head = el('span', 'move-head')
      head.append(el('b', '', title), keys)
      body.append(head, el('span', 'move-note', note), el('span', 'move-touch', `タッチ：${touch}`))
      li.append(stage, body)
      return li
    }
    moves.replaceChildren(
      move(
        'run',
        'あるく',
        caps(icon('arrowLeft'), icon('arrowRight'), 'A', 'D'),
        '左右のボタン',
        '下で足場をすりぬける'
      ),
      move('jump', 'ジャンプ', caps(icon('arrowUp'), 'W', 'スペース'), 'ジャンプ', '2だんジャンプはできないよ'),
      move('bite', 'かじる', caps('Z', 'X', 'J'), 'かじる', '敵をたおし、ギミックを動かす')
    )
    const extra = el('li', 'move move-small')
    const extraBody = el('span', 'move-body')
    const row = (keys: HTMLElement, text: string) => {
      const line = el('span', 'move-head')
      line.append(keys, el('span', 'move-note', text))
      return line
    }
    extraBody.append(row(caps('Esc', 'P'), 'ポーズ'), row(caps('M'), '音のオン・オフ'))
    extra.append(extraBody)
    moves.append(extra)

    const gimmicks = $('#help-gimmicks')
    const gimmick = (art: HTMLElement[], name: string, text: string) => {
      const li = el('li', 'gimmick')
      const box = el('span', 'gimmick-art')
      box.append(...art)
      li.append(box, el('b', '', name), el('span', '', text))
      return li
    }
    const dirt = tile({
      theme: 'meadow',
      kind: 'dirt',
      around: ['solid', 'solid', 'solid', 'solid', 'solid', 'solid', 'solid', 'solid'],
      tx: 3,
      ty: 5
    })
    gimmicks.replaceChildren(
      gimmick(
        [spriteImg('prop:tree', 'idle', { crop: [16, 28, 96, 96], className: 'g-big' })],
        '木',
        '2かいかじるとたおれて、橋になる'
      ),
      gimmick([rasterImg('dirt-meadow', dirt)], '土', 'かじると穴があく。道がかわる'),
      gimmick([spritePlayer('prop:pipe', 'burst')], '配管', 'かじると水がふきだす'),
      gimmick([spritePlayer('prop:hive', 'idle')], '蜂の巣', '怒った蜂が、近くの敵をさしにいく'),
      gimmick([spritePlayer('prop:animal', 'sleep')], '眠る動物', '起こすと、まっすぐ突進する'),
      gimmick(
        [spritePlayer('prop:switch1', 'off'), spriteImg('prop:door1', 'mid')],
        'スイッチと門',
        '同じしるしの門がひらく'
      ),
      gimmick([spriteImg('prop:rock', 'idle')], '岩', 'かじってくだく')
    )
  }

  private openHelp() {
    this.buildHelp()
    this.helpOpen = true
    this.returnFocus = document.activeElement as HTMLElement | null
    const screen = $('#help-screen')
    screen.hidden = false
    replay(screen)
    restartPlayers(screen)
    $('#help-done').focus({ preventScroll: true })
  }

  private closeHelp() {
    if (!this.helpOpen) return
    this.helpOpen = false
    this.leave($('#help-screen'))
    const back = this.returnFocus
    this.returnFocus = null
    if (back && back.isConnected) back.focus({ preventScroll: true })
  }
}
