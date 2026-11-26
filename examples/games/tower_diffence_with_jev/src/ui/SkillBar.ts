import { ALLY_TYPES, type AllyType, type GameState, type Unit } from '../game/model'
import { SPECIALS, SPECIAL_COOLDOWN } from '../game/SpecialAbilities'
import { bestSpecialTarget, specialTargetCount } from '../game/SpecialTargeting'

export const AUTO_SKILL_KEY = 'tower-jev-auto-skill-v1'
export const LONG_PRESS_MS = 350
/** How often a ready button re-checks whether the auto-aim would hit anything. */
export const TARGET_SCAN_MS = 220
const CROSSHAIR =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 .8v3.6M8 11.6v3.6M.8 8h3.6M11.6 8h3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
export function loadAutoSkill(): boolean {
  try { return localStorage.getItem(AUTO_SKILL_KEY) === '1' } catch { return false }
}
function saveAutoSkill(on: boolean) {
  try { localStorage.setItem(AUTO_SKILL_KEY, on ? '1' : '0') } catch { /* private mode: keep it for this session only */ }
}

interface Entry { button: HTMLButtonElement; ring: HTMLElement; count: HTMLElement; mark: HTMLElement; badge: HTMLElement; name: HTMLElement; placeHint(): void; tip: string; hintTimer: number; mode: string; charge: number; label: string; targets: number; scanAt: number }
export interface SkillBarOptions {
  portrait(type: AllyType): string | undefined
  /** Fired on tap/Enter (manual=false) or long-press/Shift+click (manual=true). */
  onActivate(unitId: number, manual: boolean): void
  onAutoChange?(on: boolean): void
}

/** Portrait buttons with a charge ring, one per deployed ally, shown only while the assault runs. */
export class SkillBar {
  readonly element = document.createElement('div')
  private readonly skills = document.createElement('div')
  private readonly auto = document.createElement('button')
  private readonly entries = new Map<number, Entry>()
  private order = ''
  private shown = false
  private autoOn = loadAutoSkill()
  private upgrades: ReadonlyMap<number, number> = new Map()
  constructor(parent: HTMLElement, private readonly options: SkillBarOptions) {
    this.element.id = 'skill-bar'
    this.element.className = 'skill-bar'
    this.element.setAttribute('role', 'group')
    this.element.setAttribute('aria-label', '必殺技')
    // First-play coach marks point here ("スキルをタップ！").
    this.element.dataset.coach = 'skills'
    this.element.hidden = true
    this.auto.type = 'button'
    this.auto.className = 'skill-auto'
    this.auto.id = 'skill-auto'
    this.auto.textContent = 'AUTO'
    this.auto.onclick = () => this.setAuto(!this.autoOn)
    this.syncAuto()
    this.skills.className = 'skill-scroll'
    this.element.append(this.skills, this.auto)
    parent.append(this.element)
  }
  get autoEnabled() { return this.autoOn }
  setAuto(on: boolean) {
    this.autoOn = on
    saveAutoSkill(on)
    this.syncAuto()
    this.options.onAutoChange?.(on)
  }
  private syncAuto() {
    this.auto.setAttribute('aria-pressed', String(this.autoOn))
    this.auto.setAttribute('aria-label', `AUTO 必殺技 ${this.autoOn ? 'オン' : 'オフ'}`)
  }
  private create(unit: Unit): Entry {
    const type = unit.type as AllyType,
      button = document.createElement('button')
    button.type = 'button'
    button.className = 'skill-btn'
    button.dataset.skillUnit = String(unit.id)
    button.dataset.skillType = type
    button.innerHTML =
      `<img alt="" draggable="false" src="${this.options.portrait(type) ?? ''}"><span class="skill-ring" aria-hidden="true"></span>` +
      `<span class="skill-count" aria-hidden="true"></span><span class="skill-mark" aria-hidden="true"></span>` +
      `<span class="skill-badge" aria-hidden="true"></span><span class="skill-aim" aria-hidden="true">${CROSSHAIR}</span>` +
      `<span class="skill-name" aria-hidden="true">${SPECIALS[type].name}</span><span class="skill-upgrade" aria-hidden="true" hidden>↑</span>`
    let timer = 0,
      longPressed = false,
      startX = 0,
      startY = 0
    const clear = () => { clearTimeout(timer); timer = 0 }
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      longPressed = false
      startX = event.clientX
      startY = event.clientY
      clear()
      timer = window.setTimeout(() => { timer = 0; longPressed = true; this.options.onActivate(unit.id, true) }, LONG_PRESS_MS)
    })
    button.addEventListener('pointermove', (event) => {
      if (timer && event.pointerType === 'touch' && Math.hypot(event.clientX - startX, event.clientY - startY) > 8) {
        clear()
        longPressed = true
      }
    })
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(name, clear)
    button.addEventListener('contextmenu', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      // Suppress only the pointer click that closes the long-press gesture. Keyboard
      // activation (detail === 0) must still aim even when the previous gesture was a
      // long press that never produced its own follow-up click.
      if (longPressed) {
        longPressed = false
        if (event.detail > 0) return
      }
      this.options.onActivate(unit.id, event.shiftKey)
    })
    const name = button.querySelector<HTMLElement>('.skill-name')!
    const placeHint = () => {
      const buttonBox = button.getBoundingClientRect()
      const scrollBox = this.skills.getBoundingClientRect()
      const center = Math.min(scrollBox.right, Math.max(scrollBox.left, buttonBox.left + buttonBox.width / 2))
      const half = name.offsetWidth / 2
      name.style.left = `${Math.max(half + 8, Math.min(innerWidth - half - 8, center))}px`
    }
    button.addEventListener('pointerenter', placeHint)
    button.addEventListener('focus', placeHint)
    return {
      button,
      ring: button.querySelector('.skill-ring')!,
      count: button.querySelector('.skill-count')!,
      mark: button.querySelector('.skill-mark')!,
      badge: button.querySelector('.skill-badge')!,
      name,
      placeHint,
      tip: SPECIALS[type].name,
      hintTimer: 0,
      mode: '',
      charge: -1,
      label: '',
      targets: -2,
      scanAt: -Infinity
    }
  }
  /** Brief bubble over one skill button (e.g. no target in range), with a small shake. */
  hint(unitId: number, text: string) {
    const entry = this.entries.get(unitId)
    if (!entry) return
    clearTimeout(entry.hintTimer)
    entry.name.textContent = text
    entry.placeHint()
    entry.button.dataset.hint = 'true'
    entry.button.querySelector('img')?.animate?.(
      [{ translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '-2px 0' }, { translate: '0 0' }],
      { duration: 260 }
    )
    entry.hintTimer = window.setTimeout(() => {
      delete entry.button.dataset.hint
      entry.name.textContent = entry.tip
    }, 1500)
  }
  /** Allies whose next level is affordable now: their portrait shows a small gold arrow (the field badge buys it). */
  setUpgradeOffers(offers: ReadonlyMap<number, number>) {
    this.upgrades = offers
  }
  buttonFor(unitId: number): HTMLButtonElement | undefined {
    return this.entries.get(unitId)?.button
  }
  /** Cheap per-frame sync: DOM is only touched when a value actually changed. */
  update(state: Readonly<GameState>, visible: boolean) {
    const show = visible && state.phase === 'assault',
      allies = show
        ? state.units
            .filter((u) => u.owner === 'player' && ALLY_TYPES.includes(u.type as AllyType))
            .sort((a, b) => ALLY_TYPES.indexOf(a.type as AllyType) - ALLY_TYPES.indexOf(b.type as AllyType) || a.id - b.id)
        : []
    if (show !== this.shown) { this.shown = show; this.element.hidden = !show || !allies.length }
    if (!show) return
    const order = allies.map((u) => `${u.id}:${u.type}`).join(',')
    if (order !== this.order) {
      this.order = order
      const keep = new Map<number, Entry>()
      for (const unit of allies) keep.set(unit.id, this.entries.get(unit.id) ?? this.create(unit))
      this.entries.clear()
      for (const [id, entry] of keep) this.entries.set(id, entry)
      this.skills.replaceChildren(...[...this.entries.values()].map((e) => e.button))
      this.element.hidden = !allies.length
    }
    const now = performance.now()
    for (const unit of allies) {
      const entry = this.entries.get(unit.id)!,
        type = unit.type as AllyType,
        spec = SPECIALS[type],
        remaining = Math.max(0, unit.specialCooldown ?? 0),
        down = unit.hp <= 0,
        ready = !down && remaining <= 1e-9,
        mode = down ? 'down' : ready ? 'ready' : 'charging',
        seconds = Math.ceil(remaining - 1e-9),
        charge = ready ? 1 : Math.round(Math.min(1, Math.max(0, 1 - remaining / SPECIAL_COOLDOWN)) * 200) / 200
      // Ready buttons tell the truth about the auto-aim: how many it would hit, or that nothing is in range.
      let targets = -1
      if (ready) {
        if (now - entry.scanAt >= TARGET_SCAN_MS || entry.targets < 0) {
          entry.scanAt = now
          const aim = bestSpecialTarget(state, unit.id)
          targets = aim ? Math.max(1, specialTargetCount(state, type, aim.point)) : 0
        } else targets = entry.targets
      }
      const label = down
        ? `${spec.name} 戦闘不能`
        : !ready
          ? `${spec.name} あと${seconds}秒`
          : targets > 0
            ? type === 'healer'
              ? `${spec.name} 発動可能 回復対象${targets}体`
              : `${spec.name} 発動可能 ${targets}体`
            : `${spec.name} 発動可能 · ${type === 'healer' ? '回復が必要な味方なし' : '範囲内に敵なし'} · 長押しで場所を指定`
      if (entry.mode !== mode || entry.targets !== targets) {
        entry.mode = mode
        entry.targets = targets
        entry.button.dataset.state = mode
        entry.button.disabled = down
        entry.button.setAttribute('aria-disabled', String(down || !ready))
        if (targets < 0) delete entry.button.dataset.targetCount
        else entry.button.dataset.targetCount = String(targets)
        entry.mark.textContent = down ? '✕' : targets > 0 ? '✦' : ''
        entry.badge.textContent = targets <= 0 ? '' : type === 'healer' ? '回復' : `×${targets}`
        entry.tip = ready ? `${spec.name} · 長押しで場所を指定` : spec.name
        if (!entry.button.dataset.hint) entry.name.textContent = entry.tip
      }
      const upgrade = !down && this.upgrades.has(unit.id)
      if ((entry.button.dataset.upgrade === 'true') !== upgrade) {
        entry.button.dataset.upgrade = String(upgrade)
        entry.button.querySelector<HTMLElement>('.skill-upgrade')!.hidden = !upgrade
      }
      if (entry.charge !== charge) {
        entry.charge = charge
        entry.ring.style.setProperty('--charge', String(charge))
      }
      if (entry.label !== label) {
        entry.label = label
        entry.button.setAttribute('aria-label', label)
        entry.count.textContent = mode === 'charging' ? String(seconds) : ''
      }
    }
  }
}
