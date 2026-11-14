/**
 * Laying text out ahead of the moment it is shown. The first time a character is laid out in a font at a size, the
 * browser has to find its glyph and measure it, and that takes far longer than laying out text whose characters it
 * has seen: a hint line of new characters can take most of a frame on a phone, the same line a moment later almost
 * nothing. So the characters the HUD is going to show are laid out once, a few per frame, in the font they will be
 * shown in, in a box that is never seen; when a line then changes in the middle of play its characters are known.
 *
 * Two kinds of wishes: what the stage being started will show (its hints, its names) is laid out first, also while
 * the stage is played; what any stage may show (every kana) is laid out only where there is time for it, in the
 * menus.
 */

/** Characters laid out in one frame where there is time (the menus), and while a stage is played. */
export const AHEAD_CHUNK = 8
export const AHEAD_CHUNK_IN_PLAY = 3

/** Every kana, with the marks that go with them. */
export const KANA = (() => {
  let text = ''
  for (let code = 0x3041; code <= 0x3096; code++) text += String.fromCharCode(code)
  for (let code = 0x30a1; code <= 0x30fa; code++) text += String.fromCharCode(code)
  return `${text}ー・、。！？…「」～`
})()

/** What the box needs of a line of the page (the unit tests hand in a stand-in). */
export interface AheadLine {
  textContent: string | null
  style: { font: string }
}

interface Font {
  line: AheadLine
  /** Characters wanted in this font, laid out or waiting. */
  known: Set<string>
  first: string[]
  later: string[]
}

export class TextAhead {
  private fonts = new Map<string, Font>()

  /** `line()` makes an unseen line; the HUD puts it in a box that is laid out and never painted. */
  constructor(private readonly line: () => AheadLine) {}

  /**
   * The characters of `text` are going to be shown in `font` (a CSS `font` shorthand). With `first` they are laid
   * out before everything else and also while a stage is played; without, when there is time.
   */
  want(font: string, text: string, first = false) {
    if (!font) return
    let entry = this.fonts.get(font)
    if (!entry) {
      entry = { line: this.line(), known: new Set(), first: [], later: [] }
      entry.line.style.font = font
      this.fonts.set(font, entry)
    }
    for (const char of text) {
      if (char <= ' ') continue
      if (entry.known.has(char)) {
        // Wanted before for later, wanted first now: it moves up.
        if (first) {
          const at = entry.later.indexOf(char)
          if (at >= 0) {
            entry.later.splice(at, 1)
            entry.first.push(char)
          }
        }
        continue
      }
      entry.known.add(char)
      ;(first ? entry.first : entry.later).push(char)
    }
  }

  /** True when nothing wanted first is waiting (`all`: nothing at all). */
  idle(all = false): boolean {
    for (const entry of this.fonts.values()) if (entry.first.length || (all && entry.later.length)) return false
    return true
  }

  /**
   * Lays out the next characters of one font: of those wanted first, or with `all` of any (call it once a frame
   * while the HUD is laid out). Returns true while there is more of that kind to do.
   */
  step(chunk = AHEAD_CHUNK, all = false): boolean {
    for (const queue of all ? (['first', 'later'] as const) : (['first'] as const))
      for (const entry of this.fonts.values()) {
        const list = entry[queue]
        if (!list.length) continue
        // The line holds only the newest characters: the ones before are known, and a short line is quick to lay out.
        entry.line.textContent = list.splice(0, chunk).join('')
        return !this.idle(all)
      }
    return false
  }
}
