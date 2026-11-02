const KEY = 'tower-jev-coach-v1'
const AIM_KEY = 'tower-jev-coach-aim-v1'
const POINTER =
  '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M5 2.5 19 11l-6.2 1.6 3.6 7-3.2 1.6-3.6-7L5 19.5Z" fill="#fffdf2" stroke="#304c3e" stroke-width="2" stroke-linejoin="round"/></svg>'

type Step = 'deck' | 'drag' | 'assault' | 'skills' | 'aim'
const TEXT: Record<Step, string> = {
  deck: '仲間をえらぶ',
  drag: 'ドラッグで道のそばへ',
  assault: '準備OKなら出撃！',
  skills: 'スキルをタップ！',
  aim: '長押しで場所を選べる'
}
const SKILLS_MS = 4000
const AIM_MS = 3500
/** The skill button that is ready and would hit the most enemies, or null when none would hit. */
const bestSkillButton = (): Element | null => {
  let best: Element | null = null,
    bestCount = 0
  for (const button of Array.from(document.querySelectorAll('#skill-bar .skill-btn[data-state="ready"]'))) {
    const count = Number((button as HTMLElement).dataset.targetCount)
    if (count > bestCount) { best = button; bestCount = count }
  }
  return best
}

export interface CoachContext {
  started: boolean
  phase: string
  defenders: number
  dragging: boolean
  /** A modal dialog is open, so the board is not reachable. */
  modal: boolean
}

/** First-play guidance that never intercepts input: a ring, a pointer and a short bubble. */
export class CoachMarks {
  private done: boolean
  private readonly root = document.createElement('div')
  private readonly ring = document.createElement('i')
  private readonly pointer = document.createElement('i')
  private readonly ghost = document.createElement('i')
  private readonly bubble = document.createElement('div')
  private readonly label = document.createElement('span')
  private step: Step | null = null
  private skillsSince = 0
  private dragAnimation: Animation | undefined
  private skillsDone = false
  private aimTarget: Element | null = null
  private aimUntil = 0
  private lastUpdate = 0

  constructor(
    parent: HTMLElement,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
    firstStageCleared: boolean
  ) {
    this.done = firstStageCleared || this.read() === '1'
    if (this.done && firstStageCleared) this.finish()
    this.root.className = 'coach'
    this.root.hidden = true
    this.ring.className = 'coach-ring'
    this.pointer.className = 'coach-pointer'
    this.ghost.className = 'coach-ghost'
    for (const el of [this.pointer, this.ghost]) el.innerHTML = POINTER
    const skip = document.createElement('button')
    skip.className = 'coach-skip'
    skip.type = 'button'
    skip.textContent = '×'
    skip.setAttribute('aria-label', 'ヒントを閉じる')
    skip.onclick = () => this.finish()
    this.bubble.className = 'coach-bubble'
    this.bubble.append(this.label, skip)
    this.root.append(this.ring, this.pointer, this.ghost, this.bubble)
    parent.append(this.root)
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(KEY) ?? null
    } catch {
      return null
    }
  }

  /** Stop for good (first clear or the player skipped). */
  finish(): void {
    this.done = true
    this.root.hidden = true
    try {
      this.storage?.setItem(KEY, '1')
    } catch {
      /* private mode: the hints just return next visit */
    }
  }

  /**
   * After the first tap on a ready skill with nothing in range, point at that button and say how to aim by hand.
   * Shown once ever (its own key), also for players who already finished the first-play hints.
   */
  noteNoTarget(button: Element): void {
    try {
      if (this.storage?.getItem(AIM_KEY) === '1') return
      this.storage?.setItem(AIM_KEY, '1')
    } catch {
      if (this.aimUntil) return
    }
    this.aimTarget = button
    this.aimUntil = performance.now() + AIM_MS
    this.lastUpdate = 0
  }

  get active(): boolean {
    return !this.done
  }

  /** Cheap enough for frame(); real work runs at most every 100 ms. */
  update(ctx: CoachContext, now: number): void {
    if (now - this.lastUpdate < 100) return
    this.lastUpdate = now
    if (this.aimUntil) {
      const rect = this.aimTarget?.isConnected && now < this.aimUntil && !ctx.modal ? this.aimTarget.getBoundingClientRect() : null
      if (rect?.width) return this.show('aim', rect)
      this.aimUntil = 0
      this.hide()
    }
    if (this.done) return
    const step = this.pick(ctx, now)
    if (!step) return this.hide()
    const target = this.targetFor(step)
    if (!target) return this.hide()
    const rect = target.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return this.hide()
    this.show(step, rect)
  }

  private pick(ctx: CoachContext, now: number): Step | null {
    if (!ctx.started || ctx.dragging || ctx.modal) return null
    if (ctx.phase === 'preparation') {
      this.skillsSince = 0
      if (ctx.defenders > 0) return 'assault'
      return document.getElementById('unit-tray')?.hidden === false ? 'drag' : 'deck'
    }
    if (ctx.phase === 'assault' && !this.skillsDone) {
      // Using any skill ends the first-skill hint for good (its button is recharging now).
      if (this.skillsSince && document.querySelector('#skill-bar .skill-btn[data-state="charging"]')) {
        this.skillsDone = true
        return null
      }
      // Only point at a button that will actually hit something right now.
      if (!bestSkillButton()) return null
      this.skillsSince ||= now
      if (now - this.skillsSince > SKILLS_MS) {
        this.skillsDone = true
        return null
      }
      return 'skills'
    }
    return null
  }

  private targetFor(step: Step): Element | null {
    if (step === 'deck') return document.getElementById('deck-toggle')
    if (step === 'assault') return document.getElementById('assault')
    if (step === 'skills') return bestSkillButton()
    return document.querySelector('#unit-tray .cards .unit:not([hidden])')
  }

  private hide(): void {
    this.root.hidden = true
    this.step = null
  }

  private show(step: Step, rect: DOMRect): void {
    const cx = rect.left + rect.width / 2,
      cy = rect.top + rect.height / 2,
      below = cy < innerHeight * 0.5,
      size = Math.max(rect.width, rect.height) + 18
    if (this.step !== step) {
      this.step = step
      this.label.textContent = TEXT[step]
    }
    this.root.hidden = false
    this.root.dataset.step = step
    const px = (n: number) => `${Math.round(n)}px`
    // Skip identical writes: touching `style` every tick would be wasted work (and can restart animations).
    const set = (el: HTMLElement, css: string, changed?: () => void) => {
      if (el.dataset.css !== css) {
        el.dataset.css = css
        el.style.cssText = css
        changed?.()
      }
    }
    set(this.ring, `left:${px(cx)};top:${px(cy)};width:${px(size)};height:${px(size)}`)
    this.ring.hidden = step === 'drag'
    this.pointer.hidden = step === 'drag'
    set(this.pointer, `left:${px(cx)};top:${px(below ? rect.bottom + 6 : rect.top - 38)};rotate:${below ? '-20deg' : '160deg'}`)
    const bubbleTop = step === 'drag' ? rect.top - 54 : below ? rect.bottom + 44 : rect.top - 84
    set(this.bubble, `left:clamp(110px, ${px(cx)}, calc(100vw - 110px));top:${px(bubbleTop)}`)
    this.ghost.hidden = step !== 'drag'
    if (step !== 'drag') {
      this.dragAnimation?.cancel()
      this.dragAnimation = undefined
      delete this.ghost.dataset.css
    }
    if (step === 'drag') {
      const map = document.getElementById('map-scroll')?.getBoundingClientRect(),
        gx = (map ? map.left + map.width * 0.5 : innerWidth / 2) - cx,
        gy = (map ? map.top + map.height * 0.55 : innerHeight / 2) - cy
      set(this.ghost, `left:${px(cx)};top:${px(cy)}`, () => {
        this.dragAnimation?.cancel()
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return void (this.ghost.style.opacity = '1')
        const at = (x: number, y: number, scale: number, opacity: number) => ({
          transform: `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${scale})`,
          opacity
        })
        this.dragAnimation = this.ghost.animate(
          [{ ...at(0, 0, 1.2, 0), offset: 0 }, { ...at(0, 0, 0.95, 1), offset: 0.12 }, { ...at(gx, gy, 0.95, 1), offset: 0.7 }, { ...at(gx, gy, 1.1, 0), offset: 0.9 }, { ...at(gx, gy, 1.1, 0), offset: 1 }],
          { duration: 2400, iterations: Infinity, easing: 'ease-in-out' }
        )
      })
    }
  }
}
