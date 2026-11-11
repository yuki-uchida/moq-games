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
  bossRatio,
  collectText,
  heartStates,
  hintForInput,
  hudScale,
  isLowHealth,
  newBossBar,
  settleHeart,
  ZONES,
  stepBossBar,
  type BossBarState,
  type HeartState
} from './hud-model'
import { clipRaster, drawRaster, makeSprite, plateUrl, rasterUrl } from './hud-sprites'
import { buildTouchControls } from './touch'

/** What staging (the director) may show on the HUD. */
export interface HudApi {
  /** The stage title card, in the upper-third slot it shares with the calls; it slides out after `seconds`. */
  showBanner(title: string, sub?: string, seconds?: number): void
  /** A short hint or notice at the bottom. */
  showToast(text: string): void
  /** One big word in the upper-third slot (「スタート！」「クリア！」); it replaces the stage card if that is still there. */
  showCall(text: string, tone?: 'gold' | 'pink' | 'red'): void
  /** A boss's introduction in the lower third, above the letterbox bar: portrait (a `face_*` name of the `ui` sheet), name and title, for `seconds`. */
  showNameplate(name: string, title: string, face: string, seconds?: number): void
  showBoss(name: string, title: string): void
  hideBoss(): void
  /** Cut-scene mode: the bars, buttons and meters step aside while it is on. */
  cinematic(on: boolean): void
}

interface HeartSlot {
  el: HTMLCanvasElement
  state: HeartState
  t: number
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Restarts a CSS animation class on an element. */
function replay(node: HTMLElement, className: string) {
  node.classList.remove(className)
  void node.offsetWidth
  node.classList.add(className)
}

export class Hud implements HudApi {
  private root = document.querySelector<HTMLElement>('#hud')!
  private heartsEl: HTMLElement
  private heartSlots: HeartSlot[] = []
  private tagEmblem: HTMLCanvasElement
  private tagNo: HTMLElement
  private tagName: HTMLElement
  private collectEl: HTMLElement
  private collectText: HTMLElement
  private biteEl: HTMLElement
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

  private stage: StageDef | null = null
  private hp = -1
  private maxHp = -1
  private lastCollected = -1
  private bossArt = ''
  private bossBarState: BossBarState | null = null
  private bossShown = false
  private bossFaceArt = ''
  private biteReady = true
  private timers: { left: number; run: () => void }[] = []
  private observer: ResizeObserver | null = null

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
    const dim = makeSprite('is-dim')
    this.biteLit = makeSprite('is-lit')
    const toothRaster = clipRaster('ui', 'tooth')
    drawRaster(dim, toothRaster)
    drawRaster(this.biteLit, toothRaster)
    tooth.append(dim, this.biteLit)
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
    const mute = el('button', 'hudx-btn')
    mute.id = 'mute'
    mute.type = 'button'
    mute.setAttribute('aria-label', '音をミュート')
    mute.setAttribute('aria-pressed', 'false')
    const pause = el('button', 'hudx-btn')
    pause.id = 'pause'
    pause.type = 'button'
    pause.setAttribute('aria-label', '一時停止')
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

    root.replaceChildren(top, center, this.banner, this.call, this.plate, this.toast, touch)
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
  }

  show() {
    this.root.hidden = false
    this.measure()
  }

  hide() {
    this.root.hidden = true
    this.clearTransient()
  }

  private clearTransient() {
    this.timers = []
    this.bossShown = false
    this.bossBar.hidden = true
    this.bossBar.classList.remove('is-breaking', 'is-hit')
    for (const node of [this.banner, this.call, this.plate, this.toast]) node.classList.remove('is-show')
    this.root.classList.remove('is-cinematic')
  }

  // ------------------------------------------------------------------------------------------------ state

  setStage(stage: StageDef) {
    this.stage = stage
    this.hp = -1
    this.maxHp = -1
    this.lastCollected = -1
    this.bossBarState = null
    this.biteReady = true
    this.tagNo.textContent = String(stage.no)
    this.tagName.textContent = stage.name
    this.collectEl.hidden = stage.objective !== 'collect'
    this.drawEmblem(this.tagEmblem)
    this.drawEmblem(this.bannerEmblem)
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
      const slot: HeartSlot = { el: makeSprite('heart'), state: 'empty', t: 0 }
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
    const frame = anim.frames[slot.state === 'gain' || slot.state === 'lose' ? frameAt(anim, slot.t) : 0]
    drawRaster(slot.el, frame)
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
    const p = world.player
    this.updateHearts(p.hp, p.maxHp, dt)

    if (this.stage?.objective === 'collect' && world.collected !== this.lastCollected) {
      if (this.lastCollected >= 0) replay(this.collectEl, 'is-pop')
      this.lastCollected = world.collected
      this.collectText.textContent = collectText(world.collected, this.stage.collect ?? 0)
    }

    const bite = Math.max(0, Math.min(1, 1 - p.biteCooldown / BITE_COOLDOWN))
    this.biteLit.style.setProperty('--fill', bite.toFixed(3))
    const ready = bite >= 1
    if (ready !== this.biteReady) {
      this.biteEl.classList.toggle('is-ready', ready)
      if (ready) replay(this.biteEl, 'is-ready')
      this.biteReady = ready
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
        this.bossBar.classList.toggle('is-stamina', Boolean(boss.def.stamina))
        if (!this.bossBarState) this.bossBarState = newBossBar(target)
        else if (stepBossBar(this.bossBarState, target, dt) && !reducedMotion()) replay(this.bossBar, 'is-hit')
        this.bossFill.style.transform = `scaleX(${this.bossBarState.fill.toFixed(4)})`
        this.bossTrail.style.transform = `scaleX(${this.bossBarState.trail.toFixed(4)})`
      }
    }

    if (this.timers.length) {
      for (const timer of this.timers) timer.left -= dt
      const due = this.timers.filter((timer) => timer.left <= 0)
      this.timers = this.timers.filter((timer) => timer.left > 0)
      for (const timer of due) timer.run()
    }
  }

  // ------------------------------------------------------------------------------------------------ boss bar

  showBoss(name: string, title: string) {
    this.bossName.textContent = name
    this.bossTitle.textContent = title
    this.bossBarState = null
    this.bossShown = true
    this.timers = this.timers.filter((timer) => timer.run !== this.finishBreak)
    this.bossBar.classList.remove('is-breaking', 'is-hit')
    this.bossBar.hidden = false
    replay(this.bossBar, 'is-in')
    // A fresh bar must not flash a stale fill for one frame.
    this.bossFill.style.transform = 'scaleX(1)'
    this.bossTrail.style.transform = 'scaleX(1)'
  }

  private finishBreak = () => {
    this.bossBar.hidden = true
    this.bossBar.classList.remove('is-breaking')
  }

  hideBoss() {
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
    this.bannerTitle.textContent = title
    this.bannerSub.textContent = sub
    this.bannerSub.hidden = !sub
    this.drawEmblem(this.bannerEmblem)
    this.banner.style.setProperty('--dur', `${Math.max(0.6, seconds)}s`)
    this.call.classList.remove('is-show')
    replay(this.banner, 'is-show')
  }

  showToast(text: string) {
    const touch = !document.querySelector<HTMLElement>('#touch-controls')?.hidden
    this.toast.textContent = hintForInput(text, touch)
    replay(this.toast, 'is-show')
  }

  showCall(text: string, tone: 'gold' | 'pink' | 'red' = 'gold') {
    this.call.textContent = text
    this.call.dataset.tone = tone
    this.banner.classList.remove('is-show')
    replay(this.call, 'is-show')
  }

  showNameplate(name: string, title: string, face = '', seconds = 3) {
    this.plateName.textContent = name
    this.plateTitle.textContent = title
    const art = face ? sheet('ui')[face] : undefined
    this.plateFace.style.display = art ? '' : 'none'
    if (art) drawRaster(this.plateFace, art.frames[0])
    this.plate.style.setProperty('--dur', `${Math.max(1, seconds)}s`)
    replay(this.plate, 'is-show')
  }

  cinematic(on: boolean) {
    this.root.classList.toggle('is-cinematic', on)
  }
}
