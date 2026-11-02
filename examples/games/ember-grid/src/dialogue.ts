import { pause } from './animation'
import { availableLines, bosses, chapters, epilogue, intros, memorial, outros, prologue, type Line } from './story'
import type { Game } from './game'
import './dialogue.css'

type Character = { id: string; name: string; role: string; hp: number; side: string }
let enabled = true
export const setStoryEnabled = (value: boolean) => (enabled = value)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export class Dialogue {
  private cancelCurrent?: () => void
  constructor(
    private field: HTMLElement,
    private portrait: (role: string) => string
  ) {}
  cancel() {
    this.cancelCurrent?.()
  }
  async title(index: number, name: string, objective: string) {
    if (!enabled) return
    const card = document.createElement('div')
    card.className = 'story-title'
    card.innerHTML = `<small>CHAPTER ${index + 1}</small><strong></strong><span></span>`
    card.querySelector('strong')!.textContent = name
    card.querySelector('span')!.textContent = objective
    this.field.append(card)
    let cancelled = false
    this.cancelCurrent = () => {
      cancelled = true
      card.remove()
    }
    await pause(reduced() ? 900 : 1600)
    if (!cancelled) card.remove()
    this.cancelCurrent = undefined
  }
  async play(lines: Line[], units: Character[]) {
    if (!enabled) return
    const party = units.filter((unit) => unit.side === 'ally' && unit.hp > 0)
    const script = availableLines(
      lines,
      party.map((unit) => unit.id)
    )
    if (!script.length) return
    const previous = document.activeElement as HTMLElement | null
    const overlay = document.createElement('div')
    overlay.className = 'story-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', '物語')
    overlay.tabIndex = -1
    overlay.innerHTML =
      '<div class="story-box"><img alt=""><div class="story-copy"><strong></strong><p></p></div><button>スキップ</button></div>'
    const image = overlay.querySelector('img')!,
      name = overlay.querySelector('strong')!,
      text = overlay.querySelector('p')!,
      skip = overlay.querySelector('button')!
    this.field.append(overlay)
    overlay.focus()
    await new Promise<void>((resolve) => {
      let index = 0,
        count = 0,
        timer = 0
      const finish = () => {
        clearInterval(timer)
        document.removeEventListener('keydown', keydown, true)
        overlay.remove()
        this.cancelCurrent = undefined
        previous?.focus()
        resolve()
      }
      this.cancelCurrent = finish
      const show = () => {
        clearInterval(timer)
        const line = script[index],
          character = party.find((unit) => unit.id === line.speaker)
        const enemy =
          line.speaker === 'mist'
            ? { name: '霧番', role: 'goblin' }
            : line.speaker === 'dragon'
              ? { name: '灰竜', role: 'dragon' }
              : undefined
        const speaker = character ?? enemy
        name.textContent = speaker?.name ?? ''
        image.hidden = !speaker
        if (speaker) {
          try {
            image.src = this.portrait(speaker.role)
          } catch {
            image.hidden = true
          }
        }
        count = reduced() ? line.text.length : 0
        text.textContent = line.text.slice(0, count)
        if (count < line.text.length)
          timer = window.setInterval(() => {
            text.textContent = line.text.slice(0, ++count)
            if (count >= line.text.length) clearInterval(timer)
          }, 25)
      }
      const advance = () => {
        if (count < script[index].text.length) {
          count = script[index].text.length
          text.textContent = script[index].text
          clearInterval(timer)
        } else if (++index < script.length) show()
        else finish()
      }
      const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (event.key === 'Escape') finish()
          else if (document.activeElement === skip) finish()
          else advance()
        } else if (event.key === 'Tab') {
          event.preventDefault()
          skip.focus()
        }
      }
      document.addEventListener('keydown', keydown, true)
      overlay.addEventListener('click', (event) => {
        event.stopPropagation()
        if (event.target === skip) finish()
        else advance()
      })
      show()
    })
  }
  async credits() {
    if (!enabled) return
    const previous = document.activeElement as HTMLElement | null
    const overlay = document.createElement('div')
    overlay.className = 'story-credits'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', 'クレジット')
    overlay.innerHTML =
      '<div><h2>デスガイヤ · CREDITS</h2><p>ゲーム・物語 · Ember Grid</p><p>3Dモデル · オーナー提供素材 / Meshy Pro</p><p>音楽 · オーナー提供 / Suno Pro</p><p>効果音 · Stable Audio 3 Small-SFX</p><p>遊んでくれて、ありがとう。</p></div><button>スキップ</button>'
    this.field.append(overlay)
    const button = overlay.querySelector('button')!
    button.focus()
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        document.removeEventListener('keydown', keydown, true)
        overlay.remove()
        this.cancelCurrent = undefined
        previous?.focus()
        resolve()
      }
      const keydown = (event: KeyboardEvent) => {
        if (['Escape', 'Enter', ' '].includes(event.key)) {
          event.preventDefault()
          event.stopImmediatePropagation()
          finish()
        } else if (event.key === 'Tab') event.preventDefault()
      }
      const timer = window.setTimeout(finish, reduced() ? 12000 : 16000)
      this.cancelCurrent = finish
      document.addEventListener('keydown', keydown, true)
      button.onclick = finish
    })
  }
}

export class StoryFlow {
  private roster = new Map<string, string>()
  private checkpoints: Map<string, string>[] = []
  private dialogue: Dialogue
  constructor(
    field: HTMLElement,
    portrait: (role: string) => string,
    private game: () => Game,
    private generation: () => number,
    private lock: () => void,
    private unlock: () => void
  ) {
    this.dialogue = new Dialogue(field, portrait)
  }
  cancel() {
    this.dialogue.cancel()
  }
  private controls(locked: boolean) {
    document.querySelectorAll<HTMLElement>('header, .status, .console').forEach((element) => (element.inert = locked))
  }
  async start(fresh: boolean) {
    const game = this.game(),
      token = this.generation()
    if (fresh) {
      this.roster.clear()
      this.checkpoints = []
    } else if (this.checkpoints[game.stage]) {
      this.roster = new Map(this.checkpoints[game.stage])
    }
    game.units.filter((unit) => unit.side === 'ally').forEach((unit) => this.roster.set(unit.id, unit.name))
    this.checkpoints[game.stage] = new Map(this.roster)
    const focus = document.activeElement as HTMLElement | null
    this.controls(true)
    this.lock()
    if (fresh) await this.dialogue.play(prologue, game.units)
    if (token !== this.generation()) return
    const chapter = chapters[game.stage]
    if (chapter) {
      await this.dialogue.title(game.stage, chapter[0], chapter[1])
      if (token !== this.generation()) return
      await this.dialogue.play([...intros[game.stage], ...(bosses[game.stage] ?? [])], game.units)
    }
    if (token !== this.generation()) return
    this.controls(false)
    this.unlock()
    focus?.focus()
  }
  async victory(token: number) {
    const game = this.game()
    if (game.phase !== 'won') return
    this.controls(true)
    await this.dialogue.play(outros[game.stage] ?? [], game.units)
    if (token !== this.generation()) return
    if (game.stage === 5) {
      const survivors = new Set(game.units.filter((unit) => unit.side === 'ally' && unit.hp > 0).map((unit) => unit.id))
      const absent = [...this.roster].filter(([id]) => !survivors.has(id)).map(([, name]) => name)
      await this.dialogue.play([...epilogue, ...memorial(absent)], game.units)
      if (token === this.generation()) await this.dialogue.credits()
    }
    if (token === this.generation()) this.controls(false)
  }
}
