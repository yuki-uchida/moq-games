/**
 * The in-game HUD in pixel art: hearts, stage tag, collect counter, bite meter, boss bar, buttons, and the
 * staging pieces (stage banner, call, boss nameplate, toast). The DOM is built here, in the constructor, from
 * the art registry; `hud.css` styles it. Pure rules (heart states, boss-bar easing) live in `hud-model.ts`.
 */
import './hud.css'
import { frameAt, sheet } from '../art'
import { BITE_COOLDOWN, type World } from '../game/sim'
import type { StageDef } from '../game/types'
import {
  BAR_GLIDE_SECONDS,
  biteRow,
  BITE_ROWS,
  bossRatio,
  heartBeat,
  collectText,
  heartStates,
  hintForInput,
  hudScale,
  isLowHealth,
  newBossBar,
  settleHeart,
  ZONES,
  stepBossBar,
  stepMeterClock,
  type BossBarState,
  type HeartState
} from './hud-model'
import { clipRaster, drawRaster, makeSprite, plateUrl, rasterUrl, type Tone } from './hud-sprites'
import { Deck } from './deck'
import { HudPrimer, type PrimeTarget } from './hud-prime'
import { removeClass, replay } from './replay'
import { buildTouchControls } from './touch'

/** What staging (the director) may show on the HUD. */
export interface HudApi {
  /** The stage title card, in the upper-third slot it shares with the calls; it slides out after `seconds`. */
  showBanner(title: string, sub?: string, seconds?: number): void
  /** A short hint or notice at the bottom (in portrait: in the deck's hint line under the stage). */
  showToast(text: string): void
  /** One big word in the upper-third slot (「スタート！」「クリア！」); it replaces the stage card if that is still there. */
  showCall(text: string, tone?: 'gold' | 'pink' | 'red'): void
  /** A boss's introduction in the lower third, above the letterbox bar: portrait (a `face_*` name of the `ui` sheet), name and title, for `seconds`. */
  showNameplate(name: string, title: string, face: string, seconds?: number): void
  showBoss(name: string, title: string): void
  hideBoss(): void
  /** Cut-scene mode: the bars, buttons and meters step aside while it is on. */
  cinematic(on: boolean): void
  /**
   * A character's line (`face` is a `face_*` name of the `ui` sheet). Returns true when the HUD shows it itself (on
   * the deck under a portrait stage); then the stage draws only a wordless balloon over the speaker.
   */
  speak(text: string, who: string, face: string, seconds: number, tone?: 'say' | 'yell'): boolean
  /** The stage went black (an iris out) or came back: the deck's lit parts dim with it. */
  lights(on: boolean): void
}

interface HeartSlot {
  el: HTMLCanvasElement
  state: HeartState
  t: number
  /** The clip and frame on show, so a frame that looks the same is not drawn again. */
  shown: string
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** The boss bar's fill and trail are drawn in steps of this fraction of the bar (finer than a pixel of it). */
const BAR_STEPS = 512

/** The flash of the full gauge: this many steps, this long each. */
const FLASH_STEPS = 5
const FLASH_STEP_SECONDS = 0.07

/** The unlit tooth: the lit one, darker and greyer. */
const DIM_TONE: Tone = { brightness: 0.38, saturate: 0.6 }

/** The tooth's flash when the gauge is full again: the lit tooth at twice its brightness. */
const FLASH_TONE: Tone = { brightness: 2 }

/** `value` (0..1) on a grid of `steps`; 0 and 1 stay exactly 0 and 1. */
const snap = (value: number, steps: number) => Math.round(value * steps) / steps

export class Hud implements HudApi, PrimeTarget {
  readonly root = document.querySelector<HTMLElement>('#hud')!
  /** Rasters the HUD ahead of the first stage (hud-prime.ts). */
  private primer = new HudPrimer(this)
  private heartsEl: HTMLElement
  private heartSlots: HeartSlot[] = []
  private tagEmblem: HTMLCanvasElement
  private tagNo: HTMLElement
  private tagName: HTMLElement
  private collectEl: HTMLElement
  private collectText: HTMLElement
  private biteEl: HTMLElement
  private biteMask: HTMLElement
  private biteLit: HTMLCanvasElement
  private bossBar: HTMLElement
  private bossFace: HTMLCanvasElement
  private bossName: HTMLElement
  private bossTitle: HTMLElement
  private bossFill: HTMLElement
  private bossTrail: HTMLElement
  private banner: HTMLElement
  private bannerEmblem: HTMLCanvasElement
  private bannerTitle: HTMLElement
  private bannerSub: HTMLElement
  private call: HTMLElement
  private plate: HTMLElement
  private plateFace: HTMLCanvasElement
  private plateName: HTMLElement
  private plateTitle: HTMLElement
  private toast: HTMLElement
  /** The control deck under a portrait stage; it holds the touch controls. */
  readonly deck: Deck

  private stage: StageDef | null = null
  private hp = -1
  private maxHp = -1
  private lastCollected = -1
  private bossArt = ''
  private bossBarState: BossBarState | null = null
  private bossShown = false
  private bossFaceArt = ''
  private biteReady = true
  /** The cooldown of the previous update (a rise is a bite) and the rows of the gauge as last written. */
  private cooldownSeen = 0
  private biteRows: number = BITE_ROWS
  private tooth: HTMLElement
  /** Seconds since the gauge filled (the tooth's flash steps down while this runs) and the step on show (0: none). */
  private flashAge = Number.POSITIVE_INFINITY
  private flashStep = 0
  /** Seconds of low health, for the beat of the hearts, and whether they are swollen now. */
  private beatTime = 0
  private beating = false
  /** Seconds the meters have waited for their next write, and whether the next update writes them regardless. */
  private meterWait = 0
  private meterFresh = true
  /** Seconds since the previous tick. */
  private tickTime = 0
  /** Seconds the boss bar still glides between its ticks after a hit (0: it is written in steps). */
  private glideLeft = 0
  /** Last written bar fills, and whether the bar carries `is-stamina` (null: not set yet). */
  private fillShown = 1
  private trailShown = 1
  private staminaShown: boolean | null = null
  private timers: { left: number; run: () => void }[] = []
  private observer: ResizeObserver | null = null
  private right: HTMLElement
  private buttons: HTMLButtonElement[]

  constructor() {
    const root = this.root
    root.className = 'hudx'
    root.style.setProperty('--panel', rasterUrl(clipRaster('ui', 'panel')))
    root.style.setProperty('--paper', rasterUrl(clipRaster('ui', 'paper')))
    root.style.setProperty('--ico-on', rasterUrl(clipRaster('ui', 'soundOn')))
    root.style.setProperty('--ico-off', rasterUrl(clipRaster('ui', 'soundOff')))
    root.style.setProperty('--ico-pause', rasterUrl(clipRaster('ui', 'pause')))
    const pct = (v: number) => `${(v * 100).toFixed(2)}%`
    root.style.setProperty('--z-card', pct(ZONES.cardTop))
    root.style.setProperty('--z-plate', pct(ZONES.plateBottom))
    root.style.setProperty('--z-toast', pct(ZONES.toastBottom))
    root.style.setProperty('--plate', plateUrl('night', 22, 'square'))
    root.style.setProperty('--plate-down', plateUrl('nightDown', 22, 'square'))

    // Top row: [hearts, tag, counters] [buttons]; the boss bar has its own strip (top centre, bottom in narrow stages)
    const top = el('div', 'hudx-top')
    const left = el('div', 'hudx-left')
    this.heartsEl = el('div', 'hudx-hearts hudx-frame')
    this.heartsEl.id = 'hearts'
    this.heartsEl.dataset.hudbox = ''
    this.heartsEl.setAttribute('role', 'img')

    const tag = el('div', 'hudx-tag hudx-frame')
    tag.dataset.hudbox = ''
    this.tagEmblem = makeSprite('hudx-emblem')
    this.tagNo = el('b', '', '1')
    this.tagName = el('span', '')
    tag.append(this.tagEmblem, this.tagNo, this.tagName)

    const row = el('div', 'hudx-row')
    this.collectEl = el('div', 'hudx-collect hudx-frame')
    this.collectEl.dataset.hudbox = ''
    this.collectEl.hidden = true
    const twig = makeSprite('hudx-twig')
    drawRaster(twig, clipRaster('prop:twig', 'idle'))
    this.collectText = el('b', '', '0/0')
    this.collectEl.append(twig, this.collectText)

    this.biteEl = el('div', 'hudx-bite hudx-frame is-ready')
    this.biteEl.dataset.hudbox = ''
    this.biteEl.setAttribute('role', 'img')
    this.biteEl.setAttribute('aria-label', 'かじる準備')
    const tooth = el('div', 'hudx-tooth')
    this.tooth = tooth
    const dim = makeSprite('is-dim')
    this.biteLit = makeSprite('is-lit')
    const flash = makeSprite('is-flash')
    const toothRaster = clipRaster('ui', 'tooth')
    drawRaster(dim, toothRaster, DIM_TONE)
    drawRaster(this.biteLit, toothRaster)
    drawRaster(flash, toothRaster, FLASH_TONE)
    // The lit tooth shows through a window that rises row by row (`--bite` rows are lit): the window and the tooth
    // in it move by `transform`, so the page paints nothing when the gauge moves.
    this.biteMask = el('div', 'hudx-lit')
    this.biteMask.append(this.biteLit)
    tooth.append(dim, this.biteMask, flash)
    this.biteEl.append(tooth)
    row.append(this.collectEl, this.biteEl)
    left.append(this.heartsEl, tag, row)

    const center = el('div', 'hudx-center')
    this.bossBar = el('div', 'hudx-boss hudx-frame')
    this.bossBar.id = 'boss-bar'
    this.bossBar.dataset.hudbox = ''
    this.bossBar.hidden = true
    this.bossFace = makeSprite('hudx-boss-face')
    const body = el('div', 'hudx-boss-body')
    const head = el('div', 'hudx-boss-head')
    this.bossName = el('b', '')
    this.bossTitle = el('small', '')
    head.append(this.bossName, this.bossTitle)
    const track = el('div', 'hudx-track')
    this.bossTrail = el('i', 'hudx-trail')
    this.bossFill = el('i', 'hudx-fill')
    track.append(this.bossTrail, this.bossFill, el('i', 'hudx-ticks'))
    body.append(head, track)
    this.bossBar.append(this.bossFace, body)
    center.append(this.bossBar)

    const right = el('div', 'hudx-right')
    right.dataset.hudbox = ''
    this.right = right
    // The sound and pause buttons. In the stage's corner they are icon plates; on the deck (portrait) they are the
    // handheld's pills with an icon, a label and (sound) a lamp. They move between the two places, never cloned.
    const button = (id: string, label: string, text: string) => {
      const node = el('button', 'hudx-btn')
      node.id = id
      node.type = 'button'
      node.setAttribute('aria-label', label)
      const lamp = el('i', 'hudx-btn-lamp')
      const icon = el('i', 'hudx-btn-icon')
      const caption = el('span', 'hudx-btn-text', text)
      for (const part of [lamp, icon, caption]) part.setAttribute('aria-hidden', 'true')
      node.append(icon, caption, lamp)
      return node
    }
    const mute = button('mute', '音をミュート', 'おと')
    mute.setAttribute('aria-pressed', 'false')
    const pause = button('pause', '一時停止', 'ポーズ')
    this.buttons = [mute, pause]
    right.append(mute, pause)
    top.append(left, right)

    this.banner = el('div', 'hudx-banner')
    this.banner.setAttribute('aria-hidden', 'true')
    this.bannerEmblem = makeSprite('hudx-emblem')
    const bannerText = el('div', '')
    this.bannerTitle = el('b', '')
    this.bannerSub = el('span', '')
    bannerText.append(this.bannerTitle, this.bannerSub)
    this.banner.append(this.bannerEmblem, bannerText)

    this.call = el('div', 'hudx-call')
    this.call.setAttribute('aria-hidden', 'true')

    this.plate = el('div', 'hudx-plate')
    this.plate.setAttribute('aria-hidden', 'true')
    this.plateFace = makeSprite('hudx-plate-face')
    const plateText = el('div', '')
    this.plateName = el('b', '')
    this.plateTitle = el('span', '')
    plateText.append(this.plateName, this.plateTitle)
    this.plate.append(this.plateFace, plateText)

    this.toast = el('div', 'hudx-toast')
    this.toast.setAttribute('role', 'status')
    this.toast.setAttribute('aria-live', 'polite')

    const touch = el('div', 'hudt')
    touch.id = 'touch-controls'
    buildTouchControls(touch)
    this.deck = new Deck(touch)

    root.replaceChildren(top, center, this.banner, this.call, this.plate, this.toast, this.deck.root)
    for (const node of [this.banner, this.call, this.plate, this.toast])
      node.addEventListener('animationend', () => node.classList.remove('is-show'))
    this.bossBar.addEventListener('animationend', (event) => {
      if (event.animationName === 'hudx-boss-in' || event.animationName === 'hudx-fade')
        this.bossBar.classList.remove('is-in')
      else if (event.animationName === 'hudx-shake') this.bossBar.classList.remove('is-hit')
    })

    this.rebuildHearts(3)
    this.measure()
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.measure())
      this.observer.observe(root)
    }
    if (typeof matchMedia === 'function')
      matchMedia('(orientation: portrait)').addEventListener?.('change', () => {
        this.placeButtons()
        this.primer.layoutChanged()
      })
  }

  // ------------------------------------------------------------------------------------------------ layout

  /** Sets the art scale from the stage width (the HUD fills the stage). */
  private measure() {
    const width = this.root.getBoundingClientRect().width
    if (width <= 0) return
    const s = hudScale(width)
    this.root.style.setProperty('--u', String(Math.round((width / 640) * 1000) / 1000))
    this.root.style.setProperty('--s', String(s))
    this.root.style.setProperty('--bk', s >= 2 ? '3' : '2')
    this.root.classList.toggle('is-narrow', width < 520)
    this.placeButtons()
  }

  /** The buttons live on the deck while it is on screen (portrait), else in the stage's top-right corner. */
  private placeButtons() {
    const home = this.deck.active ? this.deck.keys : this.right
    this.root.classList.toggle('is-decked', home === this.deck.keys)
    if (this.buttons[0].parentElement === home) return
    const focused = this.buttons.find((b) => b === document.activeElement)
    home.append(...this.buttons)
    focused?.focus({ preventScroll: true })
  }

  /** Once the title is up: lets the page raster the HUD while nobody can see it, so a stage's first frame does not. */
  primeWhenIdle() {
    this.primer.whenIdle()
  }

  show() {
    this.primer.interrupt()
    this.reveal()
  }

  /** Puts the HUD on screen (what `show` does, without ending a walk of the priming). */
  reveal() {
    this.root.hidden = false
    this.measure()
  }

  /** True while the HUD is on screen. */
  get shown() {
    return !this.root.hidden
  }

  hide() {
    // The menus put the HUD away on their way; a walk of the priming is out of sight already and carries on.
    if (this.primer.busy) return
    this.root.hidden = true
    this.clearTransient()
    // Back in a menu: a layout whose walk a stage cut short, or that came with a turn of the phone during one, is
    // walked now (the primer does nothing for a layout it has finished).
    this.primer.whenIdle()
  }

  private clearTransient() {
    this.timers = []
    this.bossShown = false
    this.bossBar.hidden = true
    removeClass(this.bossBar, 'is-breaking', 'is-hit', 'is-stamina', 'is-gliding')
    this.glideLeft = 0
    this.staminaShown = null
    for (const node of [this.banner, this.call, this.plate, this.toast]) removeClass(node, 'is-show')
    this.root.classList.remove('is-cinematic', 'is-dark')
  }

  // ------------------------------------------------------------------------------------------------ state

  setStage(stage: StageDef) {
    this.primer.interrupt()
    this.stage = stage
    this.hp = -1
    this.maxHp = -1
    this.lastCollected = -1
    this.bossBarState = null
    this.biteReady = true
    this.cooldownSeen = 0
    this.setBiteRows(BITE_ROWS)
    // The tooth flashes as the stage opens, as it does whenever the gauge is full again.
    this.flashAge = 0
    this.setFlash(reducedMotion() ? 0 : 1)
    this.meterFresh = true
    this.root.classList.remove('is-dark')
    this.tagNo.textContent = String(stage.no)
    this.tagName.textContent = stage.name
    this.collectEl.hidden = stage.objective !== 'collect'
    this.drawEmblem(this.tagEmblem)
    this.drawEmblem(this.bannerEmblem)
    this.deck.setStage(stage)
  }

  private drawEmblem(canvas: HTMLCanvasElement) {
    const theme = this.stage?.theme
    const art = theme ? sheet('ui')[`theme_${theme}`] : undefined
    canvas.style.visibility = art ? 'visible' : 'hidden'
    if (art) drawRaster(canvas, art.frames[0])
  }

  private rebuildHearts(count: number) {
    this.heartSlots = []
    this.heartsEl.replaceChildren()
    for (let i = 0; i < count; i++) {
      const slot: HeartSlot = { el: makeSprite('heart'), state: 'empty', t: 0, shown: '' }
      this.heartSlots.push(slot)
      this.heartsEl.append(slot.el)
    }
  }

  private paintHeart(slot: HeartSlot) {
    const clipName =
      slot.state === 'full'
        ? 'heartFull'
        : slot.state === 'empty'
          ? 'heartEmpty'
          : slot.state === 'gain'
            ? 'heartGain'
            : 'heartLose'
    const anim = sheet('ui')[clipName]
    const index = slot.state === 'gain' || slot.state === 'lose' ? frameAt(anim, slot.t) : 0
    const shown = `${clipName}:${index}`
    if (shown === slot.shown) return
    slot.shown = shown
    drawRaster(slot.el, anim.frames[index])
    slot.el.dataset.sprite = clipName
    slot.el.classList.toggle('is-full', settleHeart(slot.state) === 'full')
  }

  private updateHearts(hp: number, maxHp: number, dt: number) {
    if (maxHp !== this.maxHp) {
      this.rebuildHearts(maxHp)
      this.maxHp = maxHp
      this.hp = -1
    }
    if (hp !== this.hp) {
      const reduced = reducedMotion()
      const states = heartStates(hp, maxHp, this.hp)
      states.forEach((state, i) => {
        const slot = this.heartSlots[i]
        slot.state = reduced ? settleHeart(state) : state
        slot.t = 0
        this.paintHeart(slot)
      })
      if (this.hp >= 0 && hp < this.hp) replay(this.heartsEl, 'is-hit')
      this.hp = hp
      this.heartsEl.setAttribute('aria-label', `たいりょく ${hp}/${maxHp}`)
      this.heartsEl.classList.toggle('is-low', isLowHealth(hp))
    }
    for (const slot of this.heartSlots) {
      if (slot.state !== 'gain' && slot.state !== 'lose') continue
      slot.t += dt
      const anim = sheet('ui')[slot.state === 'gain' ? 'heartGain' : 'heartLose']
      if (slot.t * anim.fps >= anim.frames.length) slot.state = settleHeart(slot.state)
      this.paintHeart(slot)
    }
  }

  update(world: World, dt: number) {
    this.primer.interrupt()
    this.step(world, dt)
  }

  /** What `update` does; the priming calls it so that whatever wraps `update` from outside does not see the walk. */
  step(world: World, dt: number) {
    const p = world.player
    this.updateHearts(p.hp, p.maxHp, dt)
    // The meters that move continuously are written together, a few times a second; events show in their own frame.
    const wait = stepMeterClock(this.meterWait, dt)
    this.tickTime += dt
    this.meterWait = wait.waited
    const tick = wait.due || this.meterFresh
    this.meterFresh = false
    const tickSeconds = this.tickTime
    if (tick) this.tickTime = 0
    this.deck.update(world, dt, tick)

    if (this.stage?.objective === 'collect' && world.collected !== this.lastCollected) {
      if (this.lastCollected >= 0) replay(this.collectEl, 'is-pop')
      this.lastCollected = world.collected
      this.collectText.textContent = collectText(world.collected, this.stage.collect ?? 0)
    }

    this.updateBite(p.biteCooldown, tick)
    if (tick) {
      this.updateBeat(tickSeconds)
      this.stepFlash(tickSeconds)
    }

    const boss = world.boss
    if (boss && !boss.dead) {
      if (boss.def.art !== this.bossFaceArt) {
        this.bossFaceArt = boss.def.art
        const face = sheet('ui')[`face_${boss.def.art}`]
        if (face) drawRaster(this.bossFace, face.frames[0])
      }
      if (this.bossShown) {
        const target = boss.def.stamina ? bossRatio(boss.stamina, boss.maxStamina) : bossRatio(boss.hp, boss.maxHp)
        const stamina = Boolean(boss.def.stamina)
        if (stamina !== this.staminaShown) {
          this.staminaShown = stamina
          this.bossBar.classList.toggle('is-stamina', stamina)
        }
        // A hit shows in its own frame (the flash and the fill's first drop together); the rest moves on the ticks.
        let hit = false
        if (!this.bossBarState) this.bossBarState = newBossBar(target)
        else hit = stepBossBar(this.bossBarState, target, dt)
        if (hit && !reducedMotion()) replay(this.bossBar, 'is-hit')
        this.glide(hit, dt)
        const fill = snap(this.bossBarState.fill, BAR_STEPS)
        const trail = snap(this.bossBarState.trail, BAR_STEPS)
        if ((tick || hit) && fill !== this.fillShown) {
          this.fillShown = fill
          this.bossFill.style.transform = `scaleX(${fill})`
        }
        if (tick && trail !== this.trailShown) {
          this.trailShown = trail
          this.bossTrail.style.transform = `scaleX(${trail})`
        }
      }
    }

    if (this.timers.length) {
      for (const timer of this.timers) timer.left -= dt
      const due = this.timers.filter((timer) => timer.left <= 0)
      this.timers = this.timers.filter((timer) => timer.left > 0)
      for (const timer of due) timer.run()
    }
  }

  /** A hit makes the boss bar glide between its ticks for a moment (see `is-gliding` in hud.css). */
  private glide(hit: boolean, dt: number) {
    if (hit) {
      if (this.glideLeft <= 0) this.bossBar.classList.add('is-gliding')
      this.glideLeft = BAR_GLIDE_SECONDS
    } else if (this.glideLeft > 0) {
      this.glideLeft -= dt
      if (this.glideLeft <= 0) this.bossBar.classList.remove('is-gliding')
    }
  }

  // ------------------------------------------------------------------------------------------------ hearts

  /** At low health the hearts swell and settle in turn; the swell is a class, not a CSS animation. */
  private updateBeat(dt: number) {
    const low = this.heartsEl.classList.contains('is-low') && !reducedMotion()
    this.beatTime = low ? this.beatTime + dt : 0
    const beating = low && heartBeat(this.beatTime)
    if (beating !== this.beating) {
      this.beating = beating
      this.heartsEl.classList.toggle('is-beat', beating)
    }
  }

  // ------------------------------------------------------------------------------------------------ bite gauge

  /**
   * The gauge shows the cooldown in rows. A bite and the end of the cooldown show at once; the rows in between are
   * written with the other meters, on the tick.
   */
  private updateBite(cooldown: number, tick: boolean) {
    const bitten = cooldown > this.cooldownSeen + 1e-6
    this.cooldownSeen = cooldown
    const ready = cooldown <= 0
    if (tick || bitten || ready) this.setBiteRows(biteRow(cooldown, BITE_COOLDOWN))
    if (ready !== this.biteReady) {
      this.biteEl.classList.toggle('is-ready', ready)
      this.biteReady = ready
      if (ready && !reducedMotion()) {
        this.flashAge = 0
        this.setFlash(1)
      } else this.setFlash(0)
    }
  }

  /** The tooth's flash when the gauge is full again: five steps of 70 ms, the tooth shrinking and the glow fading. */
  private stepFlash(dt: number) {
    if (!this.flashStep) return
    this.flashAge += dt
    const step = Math.floor(this.flashAge / FLASH_STEP_SECONDS) + 1
    this.setFlash(step > FLASH_STEPS ? 0 : step)
  }

  private setFlash(step: number) {
    if (step === this.flashStep) return
    this.flashStep = step
    if (step) this.tooth.dataset.flash = String(step)
    else delete this.tooth.dataset.flash
  }

  private setBiteRows(rows: number) {
    if (rows === this.biteRows) return
    this.biteRows = rows
    if (rows >= BITE_ROWS) this.tooth.style.removeProperty('--bite')
    else this.tooth.style.setProperty('--bite', String(rows))
  }

  // ------------------------------------------------------------------------------------------------ boss bar

  showBoss(name: string, title: string) {
    this.primer.interrupt()
    this.bossName.textContent = name
    this.bossTitle.textContent = title
    this.bossBarState = null
    this.bossShown = true
    this.timers = this.timers.filter((timer) => timer.run !== this.finishBreak)
    removeClass(this.bossBar, 'is-breaking', 'is-hit', 'is-gliding')
    this.glideLeft = 0
    this.bossBar.hidden = false
    replay(this.bossBar, 'is-in')
    // A fresh bar must not flash a stale fill for one frame.
    this.fillShown = 1
    this.trailShown = 1
    this.bossFill.style.transform = 'scaleX(1)'
    this.bossTrail.style.transform = 'scaleX(1)'
  }

  private finishBreak = () => {
    this.bossBar.hidden = true
    removeClass(this.bossBar, 'is-breaking')
  }

  hideBoss() {
    if (this.primer.busy) return
    this.bossShown = false
    if (this.bossBar.hidden) return
    if (this.root.hidden) {
      this.finishBreak()
      return
    }
    this.bossBar.classList.add('is-breaking')
    this.timers.push({ left: reducedMotion() ? 0.5 : 0.9, run: this.finishBreak })
  }

  // ------------------------------------------------------------------------------------------------ staging

  showBanner(title: string, sub = '', seconds = 1.1) {
    this.primer.interrupt()
    this.bannerTitle.textContent = title
    this.bannerSub.textContent = sub
    this.bannerSub.hidden = !sub
    this.drawEmblem(this.bannerEmblem)
    this.banner.style.setProperty('--dur', `${Math.max(0.6, seconds)}s`)
    removeClass(this.call, 'is-show')
    replay(this.banner, 'is-show')
  }

  showToast(text: string) {
    this.primer.interrupt()
    // In portrait the stage is small: the toast goes to the deck's hint line instead.
    if (this.deck.active) {
      removeClass(this.toast, 'is-show')
      this.deck.toast(text)
      return
    }
    const touch = !document.querySelector<HTMLElement>('#touch-controls')?.hidden
    this.toast.textContent = hintForInput(text, touch)
    replay(this.toast, 'is-show')
  }

  showCall(text: string, tone: 'gold' | 'pink' | 'red' = 'gold') {
    this.primer.interrupt()
    this.call.textContent = text
    this.call.dataset.tone = tone
    removeClass(this.banner, 'is-show')
    replay(this.call, 'is-show')
  }

  showNameplate(name: string, title: string, face = '', seconds = 3) {
    this.primer.interrupt()
    this.plateName.textContent = name
    this.plateTitle.textContent = title
    const art = face ? sheet('ui')[face] : undefined
    this.plateFace.style.display = art ? '' : 'none'
    if (art) drawRaster(this.plateFace, art.frames[0])
    this.plate.style.setProperty('--dur', `${Math.max(1, seconds)}s`)
    replay(this.plate, 'is-show')
  }

  cinematic(on: boolean) {
    this.primer.interrupt()
    this.root.classList.toggle('is-cinematic', on)
  }

  speak(text: string, who: string, face: string, seconds: number, tone: 'say' | 'yell' = 'say'): boolean {
    this.primer.interrupt()
    if (!this.deck.active || this.root.hidden) return false
    removeClass(this.toast, 'is-show')
    this.deck.speak(text, who, face, seconds, tone)
    return true
  }

  lights(on: boolean) {
    this.primer.interrupt()
    this.root.classList.toggle('is-dark', !on)
  }
}
