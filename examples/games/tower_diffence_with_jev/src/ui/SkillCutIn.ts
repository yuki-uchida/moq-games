import type { Point } from '../game/model'
import { FREEZE_MS, bandSide, chainCutIn, type BandSide } from './SpecialFeel'

export interface CutInInfo { portrait?: string; skill: string; unit: string; type: string }
/** Where the special will land: world point, radius in world px. */
export interface CutInAim { point: Point; radius: number }
export const CUT_IN_MS = FREEZE_MS

interface Band { info: CutInInfo; side: BandSide; end: number; ring: HTMLElement | null }

/**
 * Cast banners shown while the simulation is frozen. Each accepted cast gets its own band, played one after
 * another (at most MAX_CUT_IN_CHAIN), in the screen half opposite its target, and its own ground ring inside
 * #field from the moment it is cast until its band ends. Purely visual: pointer-events none.
 */
export class SkillCutIn {
  readonly element = document.createElement('div')
  private readonly portrait = document.createElement('img')
  private readonly skill = document.createElement('b')
  private readonly unit = document.createElement('small')
  private readonly bands: Band[] = []
  private readonly rings = new Set<HTMLElement>()
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
    parent.append(this.element)
  }
  get playing() { return !this.element.hidden }
  /** Queues this cast's band (when the chain has room) and shows its ring. Returns the real time (ms) the simulation stays stopped until. */
  play(info: CutInInfo, aim?: CutInAim, now = performance.now()): number {
    const slot = chainCutIn(now, this.bands.map((band) => band.end)),
      lastEnd = Math.max(now, ...this.bands.map((band) => band.end)),
      side = this.ringSide(aim),
      ring = aim ? this.makeRing(aim) : null
    if (!slot) {
      // The chain is full: ring and readout only, gone when the last band ends.
      if (ring) window.setTimeout(() => this.dropRing(ring), lastEnd - now)
      return lastEnd
    }
    this.bands.push({ info, side, end: slot.end, ring })
    if (this.bands.length === 1) this.show(this.bands[0])
    this.arm()
    return slot.end
  }
  stop() {
    clearTimeout(this.timer)
    this.bands.length = 0
    for (const ring of this.rings) ring.remove()
    this.rings.clear()
    this.element.hidden = true
    this.element.classList.remove('playing')
  }
  private arm() {
    clearTimeout(this.timer)
    if (this.bands.length) this.timer = window.setTimeout(() => this.next(), Math.max(0, this.bands[0].end - performance.now()))
  }
  private next() {
    const done = this.bands.shift()
    if (done?.ring) this.dropRing(done.ring)
    if (this.bands.length) {
      this.show(this.bands[0])
      this.arm()
    } else {
      this.element.hidden = true
      this.element.classList.remove('playing')
    }
  }
  private show({ info, side }: Band) {
    this.element.dataset.type = info.type
    if (info.portrait) this.portrait.src = info.portrait
    this.portrait.hidden = !info.portrait
    this.skill.textContent = info.skill
    this.unit.textContent = info.unit
    this.element.dataset.side = side
    this.element.hidden = false
    this.element.classList.remove('playing')
    void this.element.offsetWidth
    this.element.classList.add('playing')
  }
  private dropRing(ring: HTMLElement) {
    ring.remove()
    this.rings.delete(ring)
  }
  private fieldScale() {
    const rect = this.field.getBoundingClientRect(),
      worldH = Number(this.field.dataset.worldHeight) || 920
    return { rect, worldH, scale: Math.max(0.05, rect.height / worldH) || 1 }
  }
  private ringSide(aim?: CutInAim): BandSide {
    if (!aim) return 'top'
    const { rect, worldH } = this.fieldScale()
    return bandSide(rect.top + (aim.point.y / worldH) * rect.height, innerHeight)
  }
  private makeRing(aim: CutInAim): HTMLElement {
    // A constant on-screen stroke whatever the field scale is.
    const stroke = Math.round(4 / this.fieldScale().scale),
      ring = document.createElement('div')
    ring.className = 'skill-target-ring'
    ring.setAttribute('aria-hidden', 'true')
    ring.innerHTML = '<i></i>'
    ring.style.cssText = `left:${aim.point.x}px;top:${aim.point.y}px;width:${aim.radius * 2}px;height:${aim.radius * 2}px;border-width:${stroke}px`
    this.field.append(ring)
    this.rings.add(ring)
    return ring
  }
}
