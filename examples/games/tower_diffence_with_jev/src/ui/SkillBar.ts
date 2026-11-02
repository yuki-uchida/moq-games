import { ALLY_TYPES, type AllyType, type GameState, type Unit } from '../game/model'
import { SPECIALS, SPECIAL_COOLDOWN } from '../game/SpecialAbilities'

export const AUTO_SKILL_KEY = 'tower-jev-auto-skill-v1'
export const LONG_PRESS_MS = 350
export function loadAutoSkill(): boolean {
  try { return localStorage.getItem(AUTO_SKILL_KEY) === '1' } catch { return false }
}
function saveAutoSkill(on: boolean) {
  try { localStorage.setItem(AUTO_SKILL_KEY, on ? '1' : '0') } catch { /* private mode: keep it for this session only */ }
}

interface Entry { button: HTMLButtonElement; ring: HTMLElement; count: HTMLElement; mark: HTMLElement; name: HTMLElement; skill: string; hintTimer: number; mode: string; charge: number; label: string }
export interface SkillBarOptions {
  portrait(type: AllyType): string | undefined
  /** Fired on tap/Enter (manual=false) or long-press/Shift+click (manual=true). */
  onActivate(unitId: number, manual: boolean): void
  onAutoChange?(on: boolean): void
}

/** Portrait buttons with a charge ring, one per deployed ally, shown only while the assault runs. */
export class SkillBar {
  readonly element = document.createElement('div')
  private readonly auto = document.createElement('button')
  private readonly entries = new Map<number, Entry>()
  private order = ''
  private shown = false
  private autoOn = loadAutoSkill()
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
    this.element.append(this.auto)
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
      `<span class="skill-name" aria-hidden="true">${SPECIALS[type].name}</span>`
    let timer = 0,
      longPressed = false
    const clear = () => { clearTimeout(timer); timer = 0 }
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      longPressed = false
      clear()
      timer = window.setTimeout(() => { timer = 0; longPressed = true; this.options.onActivate(unit.id, true) }, LONG_PRESS_MS)
    })
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(name, clear)
    button.addEventListener('contextmenu', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      if (longPressed) { longPressed = false; return }
      this.options.onActivate(unit.id, event.shiftKey)
    })
    return {
      button,
      ring: button.querySelector('.skill-ring')!,
      count: button.querySelector('.skill-count')!,
      mark: button.querySelector('.skill-mark')!,
      name: button.querySelector('.skill-name')!,
      skill: SPECIALS[type].name,
      hintTimer: 0,
      mode: '',
      charge: -1,
      label: ''
    }
  }
  /** Brief bubble over one skill button (e.g. no target in range), with a small shake. */
  hint(unitId: number, text: string) {
    const entry = this.entries.get(unitId)
    if (!entry) return
    clearTimeout(entry.hintTimer)
    entry.name.textContent = text
    entry.button.dataset.hint = 'true'
    entry.button.animate?.(
      [{ translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '-2px 0' }, { translate: '0 0' }],
      { duration: 260 }
    )
    entry.hintTimer = window.setTimeout(() => {
      delete entry.button.dataset.hint
      entry.name.textContent = entry.skill
    }, 1500)
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
      this.element.replaceChildren(...[...this.entries.values()].map((e) => e.button), this.auto)
      this.element.hidden = !allies.length
    }
    for (const unit of allies) {
      const entry = this.entries.get(unit.id)!,
        spec = SPECIALS[unit.type as AllyType],
        remaining = Math.max(0, unit.specialCooldown ?? 0),
        down = unit.hp <= 0,
        ready = !down && remaining <= 1e-9,
        mode = down ? 'down' : ready ? 'ready' : 'charging',
        seconds = Math.ceil(remaining - 1e-9),
        charge = ready ? 1 : Math.round(Math.min(1, Math.max(0, 1 - remaining / SPECIAL_COOLDOWN)) * 200) / 200,
        label = down ? `${spec.name} 戦闘不能` : ready ? `${spec.name} 発動可能` : `${spec.name} あと${seconds}秒`
      if (entry.mode !== mode) {
        entry.mode = mode
        entry.button.dataset.state = mode
        entry.button.disabled = down
        entry.button.setAttribute('aria-disabled', String(down || !ready))
        entry.mark.textContent = down ? '✕' : ready ? '✦' : ''
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
