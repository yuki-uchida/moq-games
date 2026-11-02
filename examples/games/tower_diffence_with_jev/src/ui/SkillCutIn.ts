import type { Point } from '../game/model'
import { FREEZE_MS, bandSide } from './SpecialFeel'

export interface CutInInfo { portrait?: string; skill: string; unit: string; type: string }
/** Where the special will land: world point, radius in world px. */
export interface CutInAim { point: Point; radius: number }
export const CUT_IN_MS = FREEZE_MS

/**
 * Cast banner shown while the simulation is frozen. It sits in the screen half opposite the target,
 * and a pulsing ring marks the landing spot inside #field. Purely visual: pointer-events none.
 */
export class SkillCutIn {
  readonly element = document.createElement('div')
  private readonly portrait = document.createElement('img')
  private readonly skill = document.createElement('b')
  private readonly unit = document.createElement('small')
  private readonly ring = document.createElement('div')
  private timer = 0
  constructor(parent: HTMLElement, private readonly field: HTMLElement) {
    this.element.id = 'skill-cutin'
    this.element.className = 'skill-cutin'
    this.element.setAttribute('aria-hidden', 'true')
    this.element.hidden = true
    this.portrait.alt = ''
    this.portrait.draggable = false
    const text = document.createElement('span')
    text.className = 'skill-cutin-text'
    text.append(this.unit, this.skill)
    const band = document.createElement('div')
    band.className = 'skill-cutin-band'
    band.append(this.portrait, text)
    this.element.append(band)
    this.ring.className = 'skill-target-ring'
    this.ring.setAttribute('aria-hidden', 'true')
    this.ring.hidden = true
    this.ring.innerHTML = '<i></i>'
    field.append(this.ring)
    parent.append(this.element)
  }
  get playing() { return !this.element.hidden }
  /** Returns false (and shows nothing) when another cut-in is still on screen. */
  play(info: CutInInfo, aim?: CutInAim): boolean {
    if (this.playing) return false
    this.element.dataset.type = info.type
    if (info.portrait) this.portrait.src = info.portrait
    this.portrait.hidden = !info.portrait
    this.skill.textContent = info.skill
    this.unit.textContent = info.unit
    let side = 'top'
    this.ring.hidden = !aim
    if (aim) {
      const rect = this.field.getBoundingClientRect(),
        worldH = Number(this.field.dataset.worldHeight) || 920,
        scale = Math.max(0.05, rect.height / worldH) || 1,
        // A constant on-screen stroke whatever the field scale is.
        stroke = Math.round(4 / scale)
      side = bandSide(rect.top + (aim.point.y / worldH) * rect.height, innerHeight)
      this.ring.style.cssText = `left:${aim.point.x}px;top:${aim.point.y}px;width:${aim.radius * 2}px;height:${aim.radius * 2}px;border-width:${stroke}px`
    }
    this.element.dataset.side = side
    this.element.hidden = false
    this.element.classList.remove('playing')
    void this.element.offsetWidth
    this.element.classList.add('playing')
    this.timer = window.setTimeout(() => this.stop(), CUT_IN_MS)
    return true
  }
  stop() {
    clearTimeout(this.timer)
    this.element.hidden = true
    this.ring.hidden = true
    this.element.classList.remove('playing')
  }
}
