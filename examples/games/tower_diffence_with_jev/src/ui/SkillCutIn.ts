export interface CutInInfo { portrait?: string; skill: string; unit: string; type: string }
export const CUT_IN_MS = 900

/** Full-screen cast banner. Purely visual: pointer-events none, never touches the simulation. */
export class SkillCutIn {
  readonly element = document.createElement('div')
  private readonly portrait = document.createElement('img')
  private readonly skill = document.createElement('b')
  private readonly unit = document.createElement('small')
  private timer = 0
  constructor(parent: HTMLElement) {
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
  /** Returns false (and shows nothing) when another cut-in is still on screen. */
  play(info: CutInInfo): boolean {
    if (this.playing) return false
    this.element.dataset.type = info.type
    if (info.portrait) this.portrait.src = info.portrait
    this.portrait.hidden = !info.portrait
    this.skill.textContent = info.skill
    this.unit.textContent = info.unit
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
    this.element.classList.remove('playing')
  }
}
