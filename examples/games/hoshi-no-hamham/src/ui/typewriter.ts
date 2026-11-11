/**
 * Typewriter text: the page is laid out in full from the start (no reflow while it types) and revealed one
 * character at a time. `finish()` completes it at once.
 */
export class Typewriter {
  private shown: HTMLSpanElement
  private rest: HTMLSpanElement
  private chars: string[]
  private count = 0
  private start = 0
  private frame = 0
  done = false

  constructor(
    readonly element: HTMLElement,
    text: string,
    /** Characters per second. */
    private cps = 30,
    instant = false,
    private onDone?: () => void
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
      while (this.count < target && this.count < this.chars.length) {
        this.count += 1
        if ('。！？…、'.includes(this.chars[this.count - 1] ?? '')) {
          this.start += 120
          break
        }
      }
      this.render()
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
