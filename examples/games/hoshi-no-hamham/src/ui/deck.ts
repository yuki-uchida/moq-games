/**
 * The control deck: in portrait the area under the stage is the body of a handheld whose screen is the stage. It
 * holds what does not fit on the small stage (world emblem, stage name, the current aim, a cycling hint line that
 * also carries the HUD's toasts, a progress track) and, in its lower part, the touch controls (`#touch-controls`)
 * or, without touch, a key legend. In landscape the deck is `display: contents` and only the touch controls show,
 * in the stage's lower corners as before. Pure rules live in `hud-model.ts`; `deck.css` styles it.
 */
import './deck.css'
import { sheet } from '../art'
import { TILE } from '../game/types'
import type { World } from '../game/sim'
import type { StageDef } from '../game/types'
import {
  aimLine,
  arriveHold,
  DECK_TOAST_SECONDS,
  stepHold,
  type DeckHold,
  HINT_SECONDS,
  goalBob,
  hintIndex,
  starFlying,
  twinkleStep,
  hintForInput,
  hintLine,
  trackRatio,
  type AimTone
} from './hud-model'
import { clipRaster, drawRaster, makeSprite, rasterUrl, type Tone } from './hud-sprites'
import { replay } from './replay'
import { formatClock } from './rules'
import { TextFace } from './text-face'
import type { Raster } from '../art/raster'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const AIM_ICONS: Record<AimTone, string> = {
  go: 'next',
  collect: 'paw',
  boss: 'tooth',
  open: 'starOn',
  clear: 'check'
}

/** The deck body's surface: an 8×8 tile of the night plate with two quiet studs, drawn at 2×. */
function surfaceUrl(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#2c1b56'
  ctx.fillRect(0, 0, 8, 8)
  ctx.fillStyle = '#33215f'
  ctx.fillRect(1, 1, 1, 1)
  ctx.fillRect(5, 5, 1, 1)
  ctx.fillStyle = '#251648'
  ctx.fillRect(2, 2, 1, 1)
  ctx.fillRect(6, 6, 1, 1)
  return `url(${canvas.toDataURL()})`
}

/** The window's night sky: a 48×40 tile of scattered stars, drawn at 2×. Layer 1 holds the stars that twinkle. */
function skyUrl(layer: 0 | 1): string {
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 40
  const ctx = canvas.getContext('2d')!
  const dot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 1, 1)
  }
  if (layer === 0) {
    for (const [x, y, c] of [
      [3, 4, 0],
      [17, 2, 1],
      [29, 9, 0],
      [11, 15, 1],
      [41, 5, 1],
      [36, 19, 0],
      [22, 24, 1],
      [6, 29, 0],
      [44, 31, 1],
      [15, 36, 1],
      [31, 34, 0]
    ] as const)
      dot(x, y, c ? '#5d4aa8' : '#8a7ad8')
  } else {
    // One four-point sparkle and two bright dots.
    for (const [x, y] of [
      [26, 13],
      [25, 13],
      [27, 13],
      [26, 12],
      [26, 14]
    ])
      dot(x, y, x === 26 && y === 13 ? '#fff6b0' : '#ffd45e')
    dot(8, 21, '#ffffff')
    dot(40, 26, '#fff6b0')
  }
  return `url(${canvas.toDataURL()})`
}

/** Rolling hills along the bottom of the window (one 64-px-wide tile, repeated sideways, drawn at 2×). */
function hillsUrl(): string {
  const w = 64
  const h = 14
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  for (let x = 0; x < w; x++) {
    const a = (x / w) * Math.PI * 2
    const top = Math.round(6 - 3 * Math.sin(a * 2) - 2 * Math.sin(a * 3 + 1))
    ctx.fillStyle = '#4b3590'
    ctx.fillRect(x, top, 1, 1)
    ctx.fillStyle = '#2c1b56'
    ctx.fillRect(x, top + 1, 1, h - top - 1)
  }
  return `url(${canvas.toDataURL()})`
}

/** A crescent moon, 14 art px, lit from the top left like every other sprite. */
function drawMoon(canvas: HTMLCanvasElement) {
  const n = 14
  canvas.width = n
  canvas.height = n
  const ctx = canvas.getContext('2d')!
  const c = (n - 1) / 2
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - c, y - c)
      if (d > n / 2 - 0.2) continue
      // The bite of the crescent: a second disc offset to the lower right.
      if (Math.hypot(x - c - 4, y - c + 2) < n / 2 - 1.5) continue
      const rim = d > n / 2 - 1.3
      ctx.fillStyle = rim ? '#e0a428' : x + y < n - 2 ? '#fff6b0' : '#ffd45e'
      ctx.fillRect(x, y, 1, 1)
    }
  canvas.style.setProperty('--w', String(n * 2))
  canvas.style.setProperty('--h', String(n * 2))
}

/** The boss's face on the track while it sleeps: darker and greyer. */
const ASLEEP_TONE: Tone = { brightness: 0.55, saturate: 0.6 }

/**
 * How many frames after the stage's state has changed (the boss woke or fell, the goal opened, a material was
 * collected) the deck words its aim line again and changes the track's pictures of the goal and of the boss. The
 * frame of such a change is the fullest of a stage (a boss's fall is four events at once, each with its particles,
 * its sound and its staging); the deck's part of it comes a twentieth of a second later at 60 frames a second.
 */
export const STATE_DELAY_FRAMES = 3

/** The reduced-motion preference: asked on every tick, so the query is made once and read after that. */
let motionQuery: MediaQueryList | null = null
const reducedMotion = () => {
  if (typeof matchMedia !== 'function') return false
  motionQuery ??= matchMedia('(prefers-reduced-motion: reduce)')
  return motionQuery.matches
}

const portrait = () => typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches

/** A clock text with every digit the font's widest: at least as wide as any time of as many digits. */
const clockShape = (text: string, digit = '0') => text.replace(/[0-9]/g, digit)

function cap(content: string | Raster, wide = false): HTMLElement {
  const node = el('kbd', wide ? 'hudd-cap is-wide' : 'hudd-cap')
  if (typeof content === 'string') node.textContent = content
  else {
    const icon = makeSprite('hudd-cap-icon')
    drawRaster(icon, content)
    node.append(icon)
  }
  return node
}

interface AimSeen {
  collected: number
  goalOpen: boolean
  state: string
  boss: unknown
  active: boolean
  dead: boolean
}

export class Deck {
  /** The deck element; in landscape it is `display: contents`. */
  readonly root: HTMLElement
  private emblem: HTMLCanvasElement
  private stageNo: HTMLElement
  private stageName: HTMLElement
  private aim: HTMLElement
  private aimIcon: HTMLCanvasElement
  private aimText: HTMLElement
  private hint: HTMLElement
  private hintText: HTMLElement
  private hero: HTMLCanvasElement
  private bossFace: HTMLCanvasElement
  private goal: HTMLCanvasElement
  private trackFill: HTMLElement
  /**
   * The run's clock. It changes ten times a second, so it is drawn on a canvas (`clock`) that lies over an unseen
   * copy of its text (`clockSize`, which keeps the box `clockBox` as wide as the text): the page's own text does
   * not change while the clock runs. `clockLine` stands on the baseline of the copy and `clockDigits` are two
   * digits set as the page sets them, from which the canvas learns where to put the text.
   */
  private clock: TextFace
  private clockBox: HTMLElement
  private clockSize: HTMLElement
  private clockLine: HTMLElement
  private clockDigits: [HTMLElement, HTMLElement]
  private clockShape = ''
  private kills: HTMLElement
  private clockTenths = -1
  private killCount = -1
  /** The progress track and its width in CSS px, for placing the markers on it. */
  private track: HTMLElement
  private trackWidth = 0
  /** Where the markers are along the track (0..1; NaN: not known yet) and where they were last written (px). */
  private heroAt = Number.NaN
  private goalAt = Number.NaN
  private bossAt = Number.NaN
  private heroPx = Number.NaN
  private goalPx = Number.NaN
  private bossPx = Number.NaN
  private bossHidden: boolean | null = null
  private bossAsleep: boolean | null = null
  /** The sky's window and what moves in it by the clock (see `hud-model.ts`). */
  private sky: HTMLElement
  private ambient = 0
  private twinkle = 0
  private shooting = false
  private bob = 0
  /** The star that crosses the sky. */
  private star: HTMLElement
  /** What the aim line was last worked out from; it is worked out again only when one of these changes. */
  private aimSeen: AimSeen | null = null
  /** Frames until the deck shows the state it has seen (see `STATE_DELAY_FRAMES`); 0 when it shows it. */
  private stateWait = 0

  private stage: StageDef | null = null
  private aimKey = ''
  private hintTime = 0
  private hintShown = -1
  private hintTouch = false
  /** A toast or a speech line holding the line instead of the hints. */
  private hold: DeckHold | null = null
  private say: HTMLElement
  private sayFace: HTMLCanvasElement
  private sayWho: HTMLElement
  private sayText: HTMLElement
  /** The slot in the lower-left block where the HUD puts its sound and pause buttons in portrait. */
  readonly keys: HTMLElement
  private bossArt = ''
  private goalOpen: boolean | null = null

  constructor(private touch: HTMLElement) {
    const root = el('div', 'hudd')
    this.root = root
    root.style.setProperty('--surface', surfaceUrl())
    root.style.setProperty('--panel', rasterUrl(clipRaster('ui', 'panel')))
    root.style.setProperty('--paper', rasterUrl(clipRaster('ui', 'paper')))

    // Information, directly under the stage.
    const info = el('div', 'hudd-info')
    this.emblem = makeSprite('hudd-emblem')
    const text = el('div', 'hudd-text')
    const name = el('div', 'hudd-name')
    this.stageNo = el('b', '', '1')
    this.stageName = el('span', '')
    name.append(this.stageNo, this.stageName)
    this.aim = el('div', 'hudd-aim')
    this.aim.dataset.hudbox = ''
    this.aim.setAttribute('role', 'status')
    this.aimIcon = makeSprite('hudd-aim-icon')
    this.aimText = el('span', '')
    this.aim.append(this.aimIcon, this.aimText)
    text.append(name, this.aim)
    this.hint = el('div', 'hudd-hint')
    this.hint.dataset.hudbox = ''
    this.hint.setAttribute('aria-live', 'polite')
    const mark = makeSprite('hudd-hint-mark')
    drawRaster(mark, clipRaster('ui', 'paw'))
    this.hintText = el('span', '')
    this.hint.append(mark, this.hintText)
    // A speech line: the speaker's face and their words in a balloon, over the information panel for a moment.
    this.say = el('div', 'hudd-say')
    this.say.setAttribute('role', 'status')
    this.say.setAttribute('aria-live', 'polite')
    this.say.hidden = true
    const faceBox = el('div', 'hudd-say-face')
    this.sayFace = makeSprite('')
    faceBox.append(this.sayFace)
    const balloon = el('div', 'hudd-say-balloon')
    this.sayWho = el('small', '')
    this.sayText = el('b', '')
    balloon.append(this.sayWho, this.sayText)
    this.say.append(faceBox, balloon)
    info.append(this.emblem, text, this.hint, this.say)

    // The middle of the body: a night-sky window with the run's clock, the defeated count and the progress track.
    const mid = el('div', 'hudd-mid')
    mid.setAttribute('aria-hidden', 'true')
    const sky = el('div', 'hudd-window')
    this.sky = sky
    sky.style.setProperty('--sky', skyUrl(0))
    sky.style.setProperty('--sky-2', skyUrl(1))
    sky.style.setProperty('--hills', hillsUrl())
    const moon = makeSprite('hudd-moon')
    drawMoon(moon)
    const stats = el('div', 'hudd-stats')
    const stat = (icon: string, value: HTMLElement, label?: string) => {
      const box = el('span', 'hudd-stat')
      const sprite = makeSprite('hudd-stat-icon')
      drawRaster(sprite, clipRaster('ui', icon))
      box.append(sprite)
      if (label) box.append(el('small', '', label))
      box.append(value)
      return box
    }
    this.clockBox = el('b', 'hudd-clock')
    this.clockShape = clockShape(formatClock(0))
    this.clockSize = el('span', 'hudd-clock-size', this.clockShape)
    const face = makeSprite('hudd-clock-face')
    this.clock = new TextFace(face)
    this.clock.set(formatClock(0))
    this.clockLine = el('span', 'hudd-clock-line')
    this.clockDigits = [el('span', 'hudd-clock-digit', '0'), el('span', 'hudd-clock-digit', '1')]
    this.clockBox.append(this.clockSize, this.clockLine, ...this.clockDigits, face)
    this.kills = el('b', '', '0')
    stats.append(stat('clock', this.clockBox), stat('tooth', this.kills, 'たおした'))
    const track = el('div', 'hudd-track')
    this.track = track
    const groove = el('div', 'hudd-groove')
    this.trackFill = el('i', 'hudd-groove-fill')
    groove.append(this.trackFill)
    const start = makeSprite('hudd-start')
    drawRaster(start, clipRaster('ui', 'home'))
    this.goal = makeSprite('hudd-goal')
    this.bossFace = makeSprite('hudd-boss')
    this.hero = makeSprite('hudd-hero')
    drawRaster(this.hero, sheet('ui').face_hero.frames[0])
    track.append(groove, start, this.goal, this.bossFace, this.hero)
    this.star = el('i', 'hudd-shoot')
    sky.append(moon, this.star, stats, track)
    mid.append(sky)

    // The lower part: speaker grille, and the key legend for players without touch.
    const base = el('div', 'hudd-base')
    const brand = el('div', 'hudd-brand')
    brand.setAttribute('aria-hidden', 'true')
    const starL = makeSprite('hudd-brand-star')
    const starR = makeSprite('hudd-brand-star')
    drawRaster(starL, clipRaster('ui', 'starOn'))
    drawRaster(starR, clipRaster('ui', 'starOn'))
    brand.append(starL, el('span', '', 'ほしのハムハム'), starR)
    const grille = el('div', 'hudd-grille')
    grille.setAttribute('aria-hidden', 'true')
    const legend = el('div', 'hudd-legend')
    legend.setAttribute('aria-hidden', 'true')
    const walk = el('div', 'hudd-legend-l')
    walk.append(cap(clipRaster('ui', 'arrowLeft')), cap(clipRaster('ui', 'arrowRight')), el('span', '', 'あるく'))
    const acts = el('div', 'hudd-legend-r')
    const row = (key: HTMLElement, label: string) => {
      const line = el('div', 'hudd-legend-row')
      line.append(key, el('span', '', label))
      return line
    }
    acts.append(
      row(cap(clipRaster('ui', 'arrowUp')), 'ジャンプ'),
      row(cap('Z'), 'かじる'),
      row(cap('Esc', true), 'ポーズ')
    )
    legend.append(walk, acts)
    // The lower-left block: the engraved name, the START / SELECT style pills (sound, pause) and the grille.
    const block = el('div', 'hudd-block')
    this.keys = el('div', 'hudd-keys')
    block.append(brand, this.keys, grille)
    base.append(block, legend)

    const screws = ['tl', 'tr', 'bl', 'br'].map((corner) => el('i', `hudd-screw is-${corner}`))
    root.append(info, mid, base, touch, ...screws)

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.measure()).observe(track)
      new ResizeObserver((entries) => {
        const entry = entries[0]
        const device = entry.devicePixelContentBoxSize?.[0]
        this.fitClock(entry.contentRect, device && { width: device.inlineSize, height: device.blockSize })
      }).observe(this.clockBox)
    }
  }

  /** Makes the unseen copy as wide as the widest time of as many digits as the clock shows. */
  private shapeClock() {
    const shape = clockShape(this.clock.shown, this.clock.wide)
    if (shape === this.clockShape) return
    this.clockShape = shape
    this.clockSize.textContent = shape
  }

  /**
   * The clock's box has a size (or a new one): the canvas takes it, with the font, the colour, the baseline and the
   * width of a digit that the unseen copy has in the page. Called when the box changes (the deck comes on screen,
   * the phone is turned) and the page has just been laid out, never while a frame is made.
   */
  private fitClock(box: { width: number; height: number }, device?: { width: number; height: number }) {
    if (box.width <= 0 || box.height <= 0) {
      this.clock.fit(0, 0, null, 1)
      return
    }
    const style = getComputedStyle(this.clockBox)
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const baseline = this.clockLine.getBoundingClientRect().bottom - this.clockBox.getBoundingClientRect().top
    const [zero, one] = this.clockDigits.map((digit) => digit.getBoundingClientRect().width)
    // A font whose 0 and 1 are as wide as each other in the page has all its digits at one width there.
    const digit = Math.abs(zero - one) < 0.01 ? zero : null
    this.clock.fit(
      box.width,
      box.height,
      { font, color: style.color, baseline, digit },
      window.devicePixelRatio || 1,
      device
    )
    // The font is known now: the copy takes its widest digit. (A copy that changes is laid out and comes back here.)
    this.shapeClock()
  }

  /**
   * Reads the track's width (it changes with the stage's size and orientation, never while a stage is played) and
   * puts the markers on it again.
   */
  private measure() {
    this.trackWidth = this.track.clientWidth
    this.heroPx = this.goalPx = this.bossPx = Number.NaN
    this.place()
  }

  /**
   * Moves the markers and the groove's fill to where the hero, the goal and the boss are. A marker is moved by
   * `translate` (its share of the track's width), never by `left`, so a moving marker costs no layout. It stands on
   * a whole pixel of the deck's art (a CSS pixel here, where the sprites are drawn at their own size) and is written
   * only when it has moved by one: a few times a second while the hero runs, whatever the display's density.
   */
  private place() {
    const px = (at: number) => Math.round(at * this.trackWidth)
    if (!Number.isNaN(this.heroAt)) {
      const hero = px(this.heroAt)
      if (hero !== this.heroPx) {
        this.heroPx = hero
        this.hero.style.translate = `${hero}px`
        this.trackFill.style.transform = `scaleX(${this.trackWidth > 0 ? (hero / this.trackWidth).toFixed(4) : '0'})`
      }
    }
    if (!Number.isNaN(this.goalAt)) {
      const goal = px(this.goalAt)
      if (goal !== this.goalPx) {
        this.goalPx = goal
        this.goal.style.translate = `${goal}px`
      }
    }
    if (!Number.isNaN(this.bossAt)) {
      const boss = px(this.bossAt)
      if (boss !== this.bossPx) {
        this.bossPx = boss
        this.bossFace.style.translate = `${boss}px`
      }
    }
  }

  /**
   * The elements whose text changes while a stage is played, by what they show: any text (the hint line with its
   * toasts, the aim, a speech line), the stage's name, who speaks, and a count.
   */
  get textHosts(): { free: HTMLElement[]; name: HTMLElement; who: HTMLElement; count: HTMLElement } {
    return {
      free: [this.hintText, this.aimText, this.sayText],
      name: this.stageName,
      who: this.sayWho,
      count: this.kills
    }
  }

  /** True while the deck is on screen (portrait). */
  get active(): boolean {
    return portrait()
  }

  setStage(stage: StageDef) {
    this.stage = stage
    this.stageNo.textContent = String(stage.no)
    this.stageName.textContent = stage.name
    const art = sheet('ui')[`theme_${stage.theme}`]
    this.emblem.style.visibility = art ? 'visible' : 'hidden'
    if (art) drawRaster(this.emblem, art.frames[0])
    this.aimKey = ''
    this.hintTime = 0
    this.hintShown = -1
    this.setHold(null)
    this.bossArt = ''
    this.goalOpen = null
    this.clockTenths = -1
    this.killCount = -1
    this.aimSeen = null
    this.stateWait = 0
    this.heroAt = this.goalAt = this.bossAt = Number.NaN
    this.bossHidden = null
    this.bossAsleep = null
    this.ambient = 0
    this.showHint(0)
  }

  /** Puts a toast in the hint line; the hints come back after a moment. */
  toast(text: string) {
    const hold = arriveHold(this.hold, { kind: 'toast', text, left: DECK_TOAST_SECONDS }, this.stage?.hints ?? [])
    if (hold.kind !== 'toast') return
    this.setHold(hold)
    this.hint.classList.add('is-toast')
    this.hintText.textContent = hintForInput(text, this.touchShown())
    replay(this.hint, 'is-swap')
  }

  /** A character's line on the deck: `face` is a `face_*` name of the `ui` sheet, `who` the speaker's name. */
  speak(text: string, who: string, face: string, seconds: number, tone: 'say' | 'yell' = 'say') {
    this.setHold(arriveHold(this.hold, { kind: 'speech', text, left: seconds }, this.stage?.hints ?? []))
    const art = face ? sheet('ui')[face] : undefined
    this.sayFace.style.visibility = art ? 'visible' : 'hidden'
    if (art) drawRaster(this.sayFace, art.frames[0])
    this.sayWho.textContent = who
    this.sayWho.hidden = !who
    this.sayText.textContent = text
    this.say.dataset.tone = tone
    this.say.hidden = false
    replay(this.say, 'is-in')
  }

  /** The line on show now: the speech line's text, a toast's text or the hint (for tests and tools). */
  get line(): { kind: 'speech' | 'toast' | 'hint'; text: string } {
    if (this.hold?.kind === 'speech') return { kind: 'speech', text: this.sayText.textContent ?? '' }
    return { kind: this.hold ? 'toast' : 'hint', text: this.hintText.textContent ?? '' }
  }

  /** Changes what holds the line; with null (or a speech line) the hint line shows the stage's hints again. */
  private setHold(hold: DeckHold | null) {
    const was = this.hold
    this.hold = hold
    if (hold?.kind !== 'speech') this.say.hidden = true
    this.root.classList.toggle('is-speaking', hold?.kind === 'speech')
    if (hold?.kind !== 'toast' && was?.kind === 'toast') {
      this.hint.classList.remove('is-toast')
      this.hintTime = 0
      this.hintShown = -1
      this.showHint(0)
    }
  }

  /** `tick`: this frame also writes the meters (the clock, the markers and the groove's fill). */
  update(world: World, dt: number, tick = true) {
    const stage = this.stage
    if (!stage) return

    const boss = world.boss
    const seen = this.aimSeen
    const active = Boolean(boss?.active)
    const dead = Boolean(boss?.dead)
    if (
      !seen ||
      seen.collected !== world.collected ||
      seen.goalOpen !== world.goalOpen ||
      seen.state !== world.state ||
      seen.boss !== boss?.def ||
      seen.active !== active ||
      seen.dead !== dead
    ) {
      this.aimSeen = {
        collected: world.collected,
        goalOpen: world.goalOpen,
        state: world.state,
        boss: boss?.def,
        active,
        dead
      }
      // A stage that starts is written at once (the tap that starts it writes its first frame ahead); a change
      // while it is played waits its few frames, and a change during the wait starts the wait again.
      if (seen) this.stateWait = STATE_DELAY_FRAMES
      else this.updateAim(world, stage)
    } else if (this.stateWait > 0 && --this.stateWait === 0) this.updateAim(world, stage)
    /** The deck shows the state it has seen: the track's pictures of the goal and of the boss may follow it. */
    const settled = this.stateWait === 0

    // The hint line: a toast or a speech line holds it for a moment, then the stage's hints cycle.
    if (this.hold) {
      const next = stepHold(this.hold, dt)
      if (next) this.hold = next
      else {
        const speech = this.hold.kind === 'speech'
        this.setHold(null)
        if (speech) {
          this.hintTime = 0
          this.hintShown = -1
          this.showHint(0)
        }
      }
    } else {
      this.hintTime += dt
      this.showHint(this.hintTime)
    }

    // The run's clock and the defeated count.
    const tenths = Math.floor(world.time * 10)
    if (tick && tenths !== this.clockTenths) {
      this.clockTenths = tenths
      const text = formatClock(tenths / 10)
      this.clock.set(text)
      // The box grows only when the clock gains a digit (at ten minutes): then the unseen copy is written.
      if (text.length !== this.clockShape.length) this.shapeClock()
    }
    if (world.kills !== this.killCount) {
      if (this.killCount >= 0) replay(this.kills, 'is-pop')
      this.killCount = world.kills
      this.kills.textContent = String(world.kills)
    }

    // The progress track.
    const width = world.w * TILE
    this.heroAt = trackRatio(world.player.x + world.player.w / 2, width)
    if (settled && world.goalOpen !== this.goalOpen) {
      this.goalOpen = world.goalOpen
      drawRaster(this.goal, clipRaster('ui', world.goalOpen ? 'starOn' : 'lock'))
      this.goal.classList.toggle('is-open', world.goalOpen)
    }
    this.goalAt = trackRatio(world.goalX + TILE / 2, width)
    const hideBoss = !boss || boss.dead
    if (settled && hideBoss !== this.bossHidden) {
      this.bossHidden = hideBoss
      this.bossFace.hidden = hideBoss
    }
    if (boss && !hideBoss) {
      if (settled && (boss.def.art !== this.bossArt || !boss.active !== this.bossAsleep)) {
        this.bossArt = boss.def.art
        this.bossAsleep = !boss.active
        const face = sheet('ui')[`face_${boss.def.art}`]
        if (face) drawRaster(this.bossFace, face.frames[0], boss.active ? undefined : ASLEEP_TONE)
      }
      this.bossAt = trackRatio(boss.x + boss.w / 2, width)
    }
    this.ambient += dt
    if (!tick) return
    this.place()
    this.moveAmbient()
  }

  /**
   * The sky's twinkle and the open goal's bob follow the clock, a step at a time; the shooting star is sent off by
   * the clock and flies by itself (one CSS animation on its own layer, which the page does not paint for).
   */
  private moveAmbient() {
    if (reducedMotion()) return
    const twinkle = twinkleStep(this.ambient)
    if (twinkle !== this.twinkle) {
      this.twinkle = twinkle
      this.sky.dataset.sky = String(twinkle)
    }
    const flying = starFlying(this.ambient)
    if (flying !== this.shooting) {
      this.shooting = flying
      this.star.classList.toggle('is-flying', flying)
    }
    const bob = this.goalOpen ? goalBob(this.ambient) : 0
    if (bob !== this.bob) {
      this.bob = bob
      this.goal.dataset.bob = String(bob)
    }
  }

  /** Words the aim line again and, if it now says something else, shows it. */
  private updateAim(world: World, stage: StageDef) {
    const boss = world.boss
    const line = aimLine({
      objective: stage.objective,
      collected: world.collected,
      need: stage.collect ?? 0,
      goalOpen: world.goalOpen,
      state: world.state,
      boss: boss
        ? { name: boss.def.name, active: boss.active, dead: boss.dead, stamina: Boolean(boss.def.stamina) }
        : null
    })
    const key = `${line.tone}|${line.text}`
    if (key === this.aimKey) return
    const toneChanged = !this.aimKey.startsWith(`${line.tone}|`)
    this.aimKey = key
    this.aimText.textContent = line.text
    this.aim.dataset.tone = line.tone
    if (toneChanged) drawRaster(this.aimIcon, clipRaster('ui', AIM_ICONS[line.tone]))
    replay(this.aim, 'is-pop')
  }

  private touchShown() {
    return !this.touch.hidden
  }

  private showHint(t: number) {
    const hints = this.stage?.hints ?? []
    const i = hintIndex(t, hints.length, HINT_SECONDS)
    const touch = this.touchShown()
    if (i === this.hintShown && touch === this.hintTouch) return
    const changed = i !== this.hintShown
    this.hintShown = i
    this.hintTouch = touch
    this.hintText.textContent = hintLine(hints, t, touch, HINT_SECONDS)
    if (changed) replay(this.hint, 'is-swap')
  }
}
