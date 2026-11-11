/** A character the typewriter never blips on: spaces, punctuation and symbols. */
const SILENT_CHAR = /[\s\p{P}\p{S}]/u

/** Blips about every third printed character, never on a silent one. */
export const BLIP_EVERY = 3
/** No two blips closer than this (ms), however fast the text prints. */
export const BLIP_MIN_GAP_MS = 45

/**
 * Decides which printed characters blip: every third one that is not a space or punctuation, and never
 * closer than `BLIP_MIN_GAP_MS` to the previous blip. Pure: the caller passes the time.
 */
export class BlipGate {
  private since = 0
  private last = -Infinity

  /** Call once per printed character; returns true when this one should blip. */
  next(char: string, nowMs: number): boolean {
    this.since += 1
    if (this.since < BLIP_EVERY) return false
    if (SILENT_CHAR.test(char)) return false
    if (nowMs - this.last < BLIP_MIN_GAP_MS) return false
    this.since = 0
    this.last = nowMs
    return true
  }
}

/**
 * Typewriter text: the page is laid out in full from the start (no reflow while it types) and revealed one
 * character at a time. `finish()` completes it at once. `onBlip` is called for the characters that blip.
 */
export class Typewriter {
  private shown: HTMLSpanElement
  private rest: HTMLSpanElement
  private chars: string[]
  private count = 0
  private start = 0
  private frame = 0
  private gate = new BlipGate()
  done = false

  constructor(
    readonly element: HTMLElement,
    text: string,
    /** Characters per second. */
    private cps = 30,
    instant = false,
    private onDone?: () => void,
    private onBlip?: () => void
  ) {
    this.chars = Array.from(text)
    this.shown = document.createElement('span')
    this.rest = document.createElement('span')
    this.rest.className = 'tw-rest'
    this.rest.setAttribute('aria-hidden', 'true')
    element.replaceChildren(this.shown, this.rest)
    element.setAttribute('aria-label', text)
    if (instant) {
      this.finish()
      return
    }
    this.render()
    this.start = performance.now()
    const step = (now: number) => {
      if (this.done) return
      // Punctuation holds the beat a little longer.
      const target = Math.floor(((now - this.start) / 1000) * this.cps)
      let blip = false
      while (this.count < target && this.count < this.chars.length) {
        this.count += 1
        const char = this.chars[this.count - 1] ?? ''
        if (this.gate.next(char, now)) blip = true
        if ('。！？…、'.includes(char)) {
          this.start += 120
          break
        }
      }
      this.render()
      if (blip) this.onBlip?.()
      if (this.count >= this.chars.length) this.finish()
      else this.frame = requestAnimationFrame(step)
    }
    this.frame = requestAnimationFrame(step)
  }

  private render() {
    this.shown.textContent = this.chars.slice(0, this.count).join('')
    this.rest.textContent = this.chars.slice(this.count).join('')
  }

  finish() {
    cancelAnimationFrame(this.frame)
    this.count = this.chars.length
    this.render()
    if (this.done) return
    this.done = true
    this.element.classList.add('is-done')
    this.onDone?.()
  }

  cancel() {
    cancelAnimationFrame(this.frame)
    this.done = true
  }
}
