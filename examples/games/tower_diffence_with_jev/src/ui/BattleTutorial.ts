const KEY = 'tower-jev-tutorial-v1'
const POINTER =
  '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M5 2.5 19 11l-6.2 1.6 3.6 7-3.2 1.6-3.6-7L5 19.5Z" fill="#fffdf2" stroke="#304c3e" stroke-width="2" stroke-linejoin="round"/></svg>'

export type TutorialStep = 'gold' | 'upgrade' | 'wave' | 'skill'
const STEPS: readonly TutorialStep[] = ['gold', 'upgrade', 'wave', 'skill']
const TEXT = {
  gold: '敵を倒すとGが手に入る',
  upgrade: '↑をタップで強化！ 戦闘中でもOK',
  wave: '早く呼ぶほどボーナスG',
  skill: '✦で必殺技／AUTOで自動発動',
  after: '攻撃・体力アップ！'
} as const
const GOLD_MS = 4200
const AFTER_MS = 2600
const SKILL_MS = 8000

export interface TutorialContext {
  started: boolean
  phase: string
  stage: number
  /** Nothing has been cleared yet (a fresh campaign). */
  fresh: boolean
  /** A dialog is open or the battle is paused. */
  blocked: boolean
}

type Shown = TutorialStep | 'after'

/**
 * One-time guided tour of stage 1's core loop (kill, earn G, upgrade, call the wave early, use a special).
 * Callouts never intercept input except their own skip button; each step is remembered once it has done its job.
 */
export class BattleTutorial {
  private seen = new Set<string>()
  private readonly root = document.createElement('div')
  private readonly ring = document.createElement('i')
  private readonly pointer = document.createElement('i')
  private readonly bubble = document.createElement('div')
  private readonly label = document.createElement('span')
  private shown: Shown | null = null
  private lastUpdate = 0
  private goldAt = 0
  private afterAt = 0
  private afterUnit = 0
  private lastBadge: DOMRect | null = null
  private waveShown = false
  private skillSince = 0
  private upgradeShown = false

  constructor(
    parent: HTMLElement,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
    private readonly isCoachShowing: () => boolean = () => false
  ) {
    try {
      for (const part of (this.storage?.getItem(KEY) ?? '').split(',')) if (part) this.seen.add(part)
    } catch {
      /* private mode: the tour just returns next visit */
    }
    this.root.className = 'coach tut'
    this.root.hidden = true
    this.ring.className = 'coach-ring'
    this.pointer.className = 'coach-pointer'
    this.pointer.innerHTML = POINTER
    this.bubble.className = 'coach-bubble tut-bubble'
    this.bubble.setAttribute('role', 'status')
    const skip = document.createElement('button')
    skip.className = 'coach-skip'
    skip.type = 'button'
    skip.textContent = '×'
    skip.setAttribute('aria-label', 'ガイドを閉じる')
    skip.onclick = () => this.skip()
    this.bubble.append(this.label, skip)
    this.root.append(this.ring, this.pointer, this.bubble)
    parent.append(this.root)
  }

  get finished(): boolean {
    return this.seen.has('skip') || STEPS.every((step) => this.seen.has(step))
  }

  private mark(key: string): void {
    this.seen.add(key)
    try {
      this.storage?.setItem(KEY, [...this.seen].join(','))
    } catch {
      /* ignored */
    }
  }

  skip(): void {
    this.mark('skip')
    this.hide()
  }

  /** Kill gold has landed. */
  noteGold(now: number): void {
    if (this.finished || this.seen.has('gold') || this.goldAt) return
    this.goldAt = now
  }

  /** The player bought a level (badge tap, menu or key). */
  noteUpgrade(now: number, unitId: number): void {
    if (this.finished || this.seen.has('upgrade')) return
    this.mark('upgrade')
    if (this.upgradeShown) {
      this.afterAt = now
      this.afterUnit = unitId
    }
  }

  /** Cheap enough for frame(); real work runs about every 80 ms. */
  update(ctx: TutorialContext, now: number): void {
    if (now - this.lastUpdate < 80) return
    this.lastUpdate = now
    if (this.finished || !ctx.started || !ctx.fresh || ctx.stage !== 1 || ctx.phase !== 'assault') return this.hide()
    if (ctx.blocked || document.getElementById('skill-cutin')?.hidden === false || this.isCoachShowing()) return this.hide()
    const pick = this.pick(now)
    if (!pick) return this.hide()
    this.show(pick.step, pick.rect)
  }

  private pick(now: number): { step: Shown; rect: DOMRect } | null {
    const rectOf = (el: Element | null | undefined) => {
      const rect = el?.getBoundingClientRect()
      return rect && rect.width > 0 && rect.height > 0 ? rect : null
    }
    // 1. What the purchase changed, next to the ally that was bought.
    if (this.afterAt) {
      if (now - this.afterAt > AFTER_MS) this.afterAt = 0
      else {
        const rect =
          rectOf(document.querySelector(`.unit-health.player[data-unit-id="${this.afterUnit}"]`)) ?? this.lastBadge
        if (rect) return { step: 'after', rect }
      }
    }
    // 2. Kill gold: the G counter.
    if (this.goldAt && !this.seen.has('gold')) {
      if (now - this.goldAt > GOLD_MS) this.mark('gold')
      else {
        const rect = rectOf(document.querySelector('.gold-purse'))
        if (rect) return { step: 'gold', rect }
      }
    }
    // 3. The wave break button, until it is pressed or the break ends.
    if (!this.seen.has('wave')) {
      const rect = rectOf(document.querySelector('.wave-call:not([hidden])'))
      if (rect) {
        this.waveShown = true
        return { step: 'wave', rect }
      }
      if (this.waveShown) this.mark('wave')
    }
    // 4. The affordable upgrade badge, until the first purchase.
    if (!this.seen.has('upgrade')) {
      const rect = rectOf(document.querySelector('.unit-upgrade-badge:not([hidden])'))
      if (rect) {
        this.upgradeShown = true
        this.lastBadge = rect
        return { step: 'upgrade', rect }
      }
    }
    // 5. A ready special: its portrait on the skill bar, until one fires, AUTO is on, or the hint has had its time.
    if (!this.seen.has('skill')) {
      const ready = document.querySelector('#skill-bar .skill-btn[data-state="ready"]')
      if (
        (this.skillSince && document.querySelector('#skill-bar .skill-btn[data-state="charging"]')) ||
        document.querySelector('#skill-auto[aria-pressed="true"]') ||
        (this.skillSince && now - this.skillSince > SKILL_MS)
      ) {
        this.mark('skill')
        return null
      }
      const rect = rectOf(ready)
      if (rect) {
        this.skillSince ||= now
        return { step: 'skill', rect }
      }
    }
    return null
  }

  private hide(): void {
    this.root.hidden = true
    this.shown = null
  }

  private show(step: Shown, rect: DOMRect): void {
    const cx = rect.left + rect.width / 2,
      cy = rect.top + rect.height / 2,
      below = cy < innerHeight * 0.5,
      size = Math.max(rect.width, rect.height) + 14
    if (this.shown !== step) {
      this.shown = step
      this.label.textContent = TEXT[step]
      this.bubble.dataset.step = step
    }
    this.root.hidden = false
    this.root.dataset.step = step
    const px = (n: number) => `${Math.round(n)}px`
    const set = (el: HTMLElement, css: string) => {
      if (el.dataset.css !== css) {
        el.dataset.css = css
        el.style.cssText = css
      }
    }
    const half = Math.min(this.bubble.offsetWidth || 240, innerWidth - 16) / 2,
      left = Math.max(half + 8, Math.min(innerWidth - half - 8, cx))
    let top = below ? rect.bottom + 42 : rect.top - 82,
      clear = false
    // Never sit on the battle HUD's bars and buttons (the G counter hugs it on phones): drop below it instead.
    const hud = document.querySelector('.battle-hud')?.getBoundingClientRect()
    if (below && hud && hud.height > 0) {
      const bubbleHeight = this.bubble.offsetHeight || 40
      if (left - half < hud.right && left + half > hud.left && top < hud.bottom + 4 && top + bubbleHeight > hud.top) {
        top = hud.bottom + 8
        clear = true
      }
    }
    set(this.ring, `left:${px(cx)};top:${px(cy)};width:${px(size)};height:${px(size)}`)
    this.ring.hidden = step === 'after'
    // A bubble dropped below the HUD is too far from its target for the arrow; the ring alone points back.
    this.pointer.hidden = step === 'after' || clear
    set(this.pointer, `left:${px(cx)};top:${px(below ? rect.bottom + 4 : rect.top - 38)};rotate:${below ? '-20deg' : '160deg'}`)
    set(this.bubble, `left:${px(left)};top:${px(top)}`)
  }
}
