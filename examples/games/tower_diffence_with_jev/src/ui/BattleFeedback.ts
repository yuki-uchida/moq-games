import type { FeelSound } from '../audio/FeelSounds'
import { DEFINITIONS, type GameState, type Owner, type UnitType } from '../game/model'
import {
  AmountAggregator,
  ComboTracker,
  HEAL_WINDOW_MS,
  comboLabel,
  HIT_WINDOW_MS,
  bountyFor,
  isHeavyHit,
  shakeAmplitude
} from './BattleFeelLogic'

/** Live floating DOM nodes (damage numbers, bursts, chips, coins). Banners and the fixed overlays are extra. */
const MAX_NODES = 48

export interface BattleFeedbackOptions {
  /** World-space host (#field). */
  field: HTMLElement
  /** Where the fixed screen-space overlay is mounted (.battle-panel). */
  overlayParent: HTMLElement
  /** Element translated by the shake (.map-shell). */
  shakeTarget: HTMLElement
  /** #base-health; its left/top already sit at the castle in world px. */
  baseLabel: HTMLElement
  /** Where flying coins land (the HUD coin counter). */
  coinTarget: () => HTMLElement | null
  play: (kind: FeelSound, param?: number) => void
  announce?: (message: string) => void
}

interface Tracked {
  hp: number
  maxHp: number
  owner: Owner
  boss: boolean
  x: number
  y: number
  homeX: number
  homeY: number
  stamp: number
}

const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const angle = i * 45
  return `<path transform="rotate(${angle}) translate(34 0) scale(${i % 2 ? 5 : 7})" d="M-1 0 -.25 -.25 0 -1 .25 -.25 1 0 .25 .25 0 1 -.25 .25Z"/>`
}).join('')
const BURST_SVG = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="26" fill="none" stroke-width="5"/><g>${SPARKS}</g></svg>`
const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
const prefersReducedMotion = () => !!reduced?.matches

export class BattleFeedback {
  private key = ''
  private frame = 0
  private units = new Map<number, Tracked>()
  private corpseIds = new Set<number>()
  private bossSeen = new Set<number>()
  private readonly specialHits = new Set<string>()
  private readonly killed = new Set<number>()
  private readonly gone = new Set<number>()
  private readonly force = new Set<number>()
  private prevBaseHp = 0
  private prevPhase: GameState['phase'] = 'preparation'
  private prevResult: GameState['result'] = null
  private hits = new AmountAggregator(HIT_WINDOW_MS)
  private heals = new AmountAggregator(HEAL_WINDOW_MS)
  private combo = new ComboTracker()
  private live: Array<{ el: HTMLElement; until: number }> = []
  private comboEl: HTMLElement | null = null
  private bannerEl: HTMLElement | null = null
  private shakeAnimation: Animation | null = null
  private fieldRect: { left: number; top: number; width: number; height: number; at: number } | null = null
  private readonly overlay: HTMLElement
  private readonly vignette: HTMLElement
  private readonly flashLayer: HTMLElement
  private killCount = 0
  private bountyTotal = 0
  private bountyLanded = 0

  constructor(private readonly options: BattleFeedbackOptions) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'fx-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.vignette = document.createElement('div')
    this.vignette.className = 'fx-vignette'
    this.flashLayer = document.createElement('div')
    this.flashLayer.className = 'fx-flash'
    this.overlay.append(this.vignette, this.flashLayer)
    options.overlayParent.append(this.overlay)
  }

  get kills(): number {
    return this.killCount
  }
  /** Coin bounty earned by kills in this battle (the later stage-clear bonus reads this). */
  get bounty(): number {
    return this.bountyTotal
  }
  /** Bounty whose coin chip has reached the HUD counter. */
  get bountyArrived(): number {
    return this.bountyLanded
  }

  /** Forget the previous battle; the next update only records a baseline. */
  reset(): void {
    this.key = ''
    this.units.clear()
    this.corpseIds.clear()
    this.bossSeen.clear()
    this.specialHits.clear()
    this.hits.clear()
    this.heals.clear()
    this.combo.reset()
    this.killCount = this.bountyTotal = this.bountyLanded = 0
    for (const { el } of this.live) el.remove()
    this.live.length = 0
    this.comboEl = null
    this.bannerEl?.remove()
    this.bannerEl = null
  }

  /** Shake the map; `power` is the amplitude in px (capped at 8). */
  shake(power: number): void {
    if (prefersReducedMotion() || !(power > 0)) return
    const p = Math.min(8, power),
      s = Math.random() < 0.5 ? -1 : 1
    this.shakeAnimation?.cancel()
    this.shakeAnimation = this.options.shakeTarget.animate(
      [
        { translate: '0 0' },
        { translate: `${s * p}px ${-p * 0.4}px`, offset: 0.2 },
        { translate: `${-s * p * 0.8}px ${p * 0.3}px`, offset: 0.45 },
        { translate: `${s * p * 0.4}px 0`, offset: 0.7 },
        { translate: '0 0' }
      ],
      { duration: 250, easing: 'ease-out' }
    )
  }

  /** Brief full-screen colour flash. */
  flash(color = '#ffffff'): void {
    this.flashLayer.style.background = color
    this.flashLayer.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.2 }, { opacity: 0 }], { duration: 320 })
  }

  update(state: Readonly<GameState>, now = performance.now()): void {
    const key = `${state.battleId}:${state.stage}`
    const baseline = key !== this.key
    if (baseline) {
      this.reset()
      this.key = key
    }
    const combat = state.phase !== 'preparation' && !baseline
    this.frame++
    this.sweep(now)

    // Units: hp diffs, deployments, boss arrival.
    for (const unit of state.units) {
      const hp = Math.max(0, unit.hp)
      let seen = this.units.get(unit.id)
      if (!seen) {
        seen = {
          hp,
          maxHp: unit.maxHp,
          owner: unit.owner,
          boss: unit.boss,
          x: unit.x,
          y: unit.y,
          homeX: unit.homeX,
          homeY: unit.homeY,
          stamp: this.frame
        }
        this.units.set(unit.id, seen)
        if (!baseline && unit.owner === 'player' && state.phase === 'preparation') this.deploy(unit.homeX, unit.homeY)
        if (combat && unit.boss && unit.owner === 'ai' && !this.bossSeen.has(unit.id)) this.bossWarning(unit.type)
        if (unit.boss) this.bossSeen.add(unit.id)
        continue
      }
      if (combat) {
        if (hp < seen.hp) this.hits.add(unit.id, seen.hp - hp, now)
        else if (hp > seen.hp) this.heals.add(unit.id, hp - seen.hp, now)
      }
      if (
        !baseline &&
        unit.owner === 'player' &&
        Math.hypot(unit.homeX - seen.homeX, unit.homeY - seen.homeY) > 1
      )
        this.deploy(unit.homeX, unit.homeY)
      seen.hp = hp
      seen.maxHp = unit.maxHp
      seen.x = unit.x
      seen.y = unit.y
      seen.homeX = unit.homeX
      seen.homeY = unit.homeY
      seen.stamp = this.frame
    }

    // Corpses: the only reliable death signal (enemies leave state.units in the same step).
    const killed = this.killed
    killed.clear()
    let chipBounty = 0,
      chipX = 0,
      chipY = 0
    for (const corpse of state.corpses) {
      if (this.corpseIds.has(corpse.id)) continue
      this.corpseIds.add(corpse.id)
      if (baseline) {
        // A resumed battle: count what was already won, silently, and show it as already collected.
        if (corpse.owner === 'ai') {
          const bounty = bountyFor(corpse.type, corpse.boss)
          this.killCount++
          this.bountyTotal += bounty
          this.bountyLanded += bounty
        }
        continue
      }
      killed.add(corpse.id)
      if (corpse.owner === 'player') {
        this.allyDown(corpse.x, corpse.y)
        continue
      }
      const bounty = bountyFor(corpse.type, corpse.boss)
      this.killCount++
      this.bountyTotal += bounty
      chipBounty += bounty
      chipX = corpse.x
      chipY = corpse.y
      this.burst(corpse.x, corpse.y - 22, corpse.boss ? 'boss' : 'kill')
      this.options.play('kill')
      if (corpse.boss) {
        this.flash('#ffffff')
        this.shake(6)
        this.options.play('hit-heavy')
      }
      // Chained on simulation time, so ×2 speed or a slow frame doesn't change what counts as a combo.
      const chain = this.combo.hit(corpse.diedAt * 1000)
      if (chain >= 2) {
        this.comboCallout(chain, corpse.x, corpse.y - 52)
        this.options.play('combo', chain)
      }
    }
    if (chipBounty > 0) this.coinChip(chipBounty, chipX, chipY - 30)

    // Units that vanished: a corpse means a kill (show the final blow), otherwise they left through the gate.
    const gone = this.gone
    gone.clear()
    for (const [id, seen] of this.units)
      if (seen.stamp !== this.frame) {
        gone.add(id)
        if (killed.has(id) && seen.hp > 0 && combat) this.hits.add(id, seen.hp, now)
      }
    const force = this.force
    force.clear()
    for (const id of gone) force.add(id)
    for (const id of killed) force.add(id)
    for (const { id, amount } of this.hits.flush(now, force)) this.damageNumber(id, amount)
    for (const { id, amount } of this.heals.flush(now, force)) if (Math.round(amount) >= 2) this.healNumber(id, amount)
    for (const id of gone) this.units.delete(id)

    // Special impacts: the moment a damaging special lands, kick the camera (fields like frost don't).
    for (const effect of state.specialEffects ?? []) {
      if (!effect.applied || this.specialHits.has(effect.id)) continue
      this.specialHits.add(effect.id)
      if (baseline || !(effect.power > 0)) continue
      this.shake(4)
      this.burst(effect.x, effect.y - 10, 'boss')
      this.options.play('hit-heavy')
    }

    // Castle.
    if (combat && state.playerBaseHp < this.prevBaseHp) this.baseHit(this.prevBaseHp - state.playerBaseHp)
    this.prevBaseHp = state.playerBaseHp

    // Banners.
    if (!baseline) {
      if (this.prevPhase === 'preparation' && state.phase === 'assault') {
        this.banner('assault', '襲撃開始！', `STAGE ${String(state.stage).padStart(2, '0')}`)
        this.options.play('assault')
        this.options.announce?.('襲撃開始')
      }
      if (!this.prevResult && state.result) {
        if (state.result === 'win') {
          this.banner('win', 'STAGE CLEAR!', '', 6)
          this.flash('#ffe9a8')
          this.options.play('clear')
        } else {
          this.banner('lose', '防衛失敗…', '')
          this.options.play('defeat')
        }
      }
    }
    this.prevPhase = state.phase
    this.prevResult = state.result
  }

  // --- helpers -----------------------------------------------------------

  private sweep(now: number): void {
    if (!this.live.length) return
    this.live = this.live.filter((item) => {
      if (item.until > now && item.el.isConnected) return true
      item.el.remove()
      return false
    })
  }

  /** Adds a world/screen effect node. Returns null (and adds nothing) when the cap is reached. */
  private spawn(host: HTMLElement, el: HTMLElement, lifetime: number, force = false): boolean {
    if (this.live.length >= MAX_NODES && !force) return false
    host.append(el)
    this.live.push({ el, until: performance.now() + lifetime })
    el.addEventListener('animationend', (event) => event.target === el && el.remove(), { once: false })
    return true
  }

  private make(className: string, x?: number, y?: number, text?: string): HTMLElement {
    const el = document.createElement('div')
    el.className = className
    if (x !== undefined) el.style.left = `${x}px`
    if (y !== undefined) el.style.top = `${y}px`
    if (text !== undefined) el.textContent = text
    return el
  }

  private damageNumber(id: number, amount: number): void {
    const unit = this.units.get(id)
    if (!unit) return
    const value = Math.max(1, Math.round(amount))
    const heavy = unit.owner === 'ai' && isHeavyHit(amount, unit.maxHp)
    const x = unit.x + (Math.random() - 0.5) * 26
    const y = unit.y - (unit.boss ? 112 : 82) + (Math.random() - 0.5) * 8
    const el = this.make(`fx-num ${unit.owner === 'ai' ? 'enemy' : 'ally'}${heavy ? ' heavy' : ''}`, x, y, String(value))
    if (!this.spawn(this.options.field, el, 1000)) return
    if (heavy) {
      this.burst(unit.x, unit.y - 36, 'small')
      this.options.play('hit-heavy')
    }
  }

  private healNumber(id: number, amount: number): void {
    const unit = this.units.get(id)
    if (!unit) return
    this.spawn(
      this.options.field,
      this.make('fx-num heal', unit.x + (Math.random() - 0.5) * 16, unit.y - 86, `+${Math.round(amount)}`),
      1100
    )
  }

  private burst(x: number, y: number, size: 'kill' | 'boss' | 'small'): void {
    const el = this.make(`fx-burst ${size}`, x, y)
    el.innerHTML = BURST_SVG
    this.spawn(this.options.field, el, 900)
  }

  private allyDown(x: number, y: number): void {
    this.spawn(this.options.field, this.make('fx-puff', x, y - 20), 900)
    this.spawn(this.options.field, this.make('fx-chip', x, y - 62, '戦闘不能'), 1500)
  }

  private deploy(x: number, y: number): void {
    this.spawn(this.options.field, this.make('fx-landing', x, y), 800)
    this.options.play('deploy')
  }

  private comboCallout(count: number, x: number, y: number): void {
    this.comboEl?.remove()
    const el = this.make('fx-combo', x, y, comboLabel(count))
    el.style.setProperty('--grow', String(Math.min(2, 0.9 + (count - 2) * 0.14)))
    if (this.spawn(this.options.field, el, 1300)) this.comboEl = el
  }

  private baseHit(damage: number): void {
    this.shake(shakeAmplitude(damage))
    this.vignette.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 550 })
    const left = parseFloat(this.options.baseLabel.style.left),
      top = parseFloat(this.options.baseLabel.style.top)
    if (Number.isFinite(left) && Number.isFinite(top))
      this.spawn(
        this.options.field,
        this.make('fx-num base', left, top - 100, `-${Math.max(1, Math.round(damage))}`),
        1200,
        true
      )
    this.options.play('base-hit')
  }

  private bossWarning(type: UnitType): void {
    this.banner('boss', 'BOSS 出現！', DEFINITIONS[type].name)
    this.options.play('boss')
    this.options.announce?.(`ボス出現 ${DEFINITIONS[type].name}`)
  }

  private banner(kind: 'assault' | 'boss' | 'win' | 'lose', title: string, small: string, sparkles = 0): void {
    this.bannerEl?.remove()
    const el = document.createElement('div')
    el.className = `fx-banner ${kind}`
    const text = document.createElement('b')
    text.textContent = title
    if (small) {
      const label = document.createElement('small')
      label.textContent = small
      el.append(label)
    }
    el.append(text)
    for (let i = 0; i < sparkles; i++) {
      const spark = document.createElement('i')
      spark.style.setProperty('--i', String(i))
      el.append(spark)
    }
    el.addEventListener('animationend', (event) => {
      if (event.target === el) el.remove()
    })
    this.overlay.append(el)
    this.bannerEl = el
  }

  // --- coins ---------------------------------------------------------------

  private screenPoint(x: number, y: number): { x: number; y: number } {
    const now = performance.now()
    if (!this.fieldRect || now - this.fieldRect.at > 250) {
      const r = this.options.field.getBoundingClientRect()
      this.fieldRect = { left: r.left, top: r.top, width: r.width, height: r.height, at: now }
    }
    const f = this.fieldRect,
      worldWidth = Number(this.options.field.dataset.worldWidth) || 1280,
      worldHeight = Number(this.options.field.dataset.worldHeight) || 920
    return { x: f.left + (x / worldWidth) * f.width, y: f.top + (y / worldHeight) * f.height }
  }

  private land(amount: number): void {
    this.bountyLanded += amount
    this.options.play('coin')
  }

  private coinChip(amount: number, worldX: number, worldY: number): void {
    const from = this.screenPoint(worldX, worldY)
    const el = this.make('fx-coin', 0, 0)
    el.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#f4c542" stroke="#8a5a14" stroke-width="2"/><circle cx="10" cy="10" r="4.6" fill="none" stroke="#c98d22" stroke-width="1.6"/></svg><span>+${amount}</span>`
    if (this.live.length >= MAX_NODES) {
      this.land(amount)
      return
    }
    this.overlay.append(el)
    this.live.push({ el, until: performance.now() + 3000 })
    const target = this.options.coinTarget()?.getBoundingClientRect()
    const to =
      target && target.width > 0
        ? { x: target.left + target.width / 2, y: target.top + target.height / 2 }
        : { x: window.innerWidth / 2, y: 28 }
    const key = this.key
    let landed = false
    const done = () => {
      if (landed) return
      landed = true
      el.remove()
      if (key === this.key) this.land(amount)
    }
    if (typeof el.animate !== 'function' || prefersReducedMotion()) {
      el.style.transform = `translate(${from.x}px, ${from.y}px)`
      const fade = el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' })
      if (fade) fade.onfinish = done
      else done()
      return
    }
    const at = (px: number, py: number, scale: number) =>
      `translate(${px}px, ${py}px) translate(-50%, -50%) scale(${scale})`
    const animation = el.animate(
      [
        { transform: at(from.x, from.y, 0.4), opacity: 0, easing: 'ease-out' },
        { transform: at(from.x, from.y - 18, 1.2), opacity: 1, offset: 0.22, easing: 'ease-out' },
        { transform: at(from.x, from.y - 14, 1), opacity: 1, offset: 0.32, easing: 'ease-in' },
        { transform: at(to.x, to.y, 0.55), opacity: 1 }
      ],
      { duration: 800, fill: 'forwards' }
    )
    animation.onfinish = done
    animation.oncancel = done
  }
}
