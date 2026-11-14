/**
 * Lays a hidden part of the page out once before it is first shown. The first layout of a screen costs far more
 * than any later one: the browser meets its fonts, glyphs and styles for the first time (a quarter of a second on a
 * slow phone for the help screen, about 20 ms once they are known). Done in the task of the tap that opens the
 * screen, that is a pause the player feels; done here it is spread over idle slices.
 *
 * The part is shown with `visibility: hidden` (laid out, never painted, takes no input and no focus) with all its
 * pieces folded away, then the pieces are unfolded one at a time, each followed by a layout, a turn for the browser
 * whenever a slice has used its budget. `stop` puts everything back at once, so a screen that opens meanwhile is
 * shown exactly as it was built.
 */

/** Pieces are subtrees of at most this many elements (a list row, a card, a heading). */
const PIECE = 12
/** Layout time per slice before the browser gets a turn (ms). */
const BUDGET_MS = 8

const clock = () => performance.now()

/** A macrotask after the next frame, so every slice is a task of its own and the page keeps drawing. */
const nextSlice = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

/** Disjoint subtrees of `root` of at most `max` elements each, in document order. */
export function piecesOf(root: Element, max = PIECE): HTMLElement[] {
  const out: HTMLElement[] = []
  const visit = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child.getElementsByTagName('*').length < max) out.push(child)
      else visit(child)
    }
  }
  visit(root)
  return out
}

interface Run {
  root: HTMLElement
  pieces: HTMLElement[]
  displays: string[]
  visibility: string
  stopped: boolean
}

export class LayoutAhead {
  private run: Run | null = null

  /** True while `root` is being laid out ahead. */
  busy(root?: HTMLElement) {
    return Boolean(this.run && (!root || this.run.root === root))
  }

  /**
   * Lays out `root`, which must be hidden (with the `hidden` attribute), a piece per slice. Resolves when it is done
   * or stopped; true when it ran to the end. One part at a time: a new call stops the one before.
   */
  async layOut(root: HTMLElement, budgetMs = BUDGET_MS): Promise<boolean> {
    this.stop()
    if (!root.hidden || !root.isConnected) return false
    const pieces = piecesOf(root)
    const run: Run = {
      root,
      pieces,
      displays: pieces.map((piece) => piece.style.display),
      visibility: root.style.visibility,
      stopped: false
    }
    this.run = run
    for (const piece of pieces) piece.style.display = 'none'
    root.style.visibility = 'hidden'
    root.hidden = false
    try {
      // The frame of the part itself, every piece folded away.
      void root.offsetWidth
      await nextSlice()
      let start = clock()
      for (let i = 0; i < pieces.length; i++) {
        if (run.stopped) return false
        restoreDisplay(pieces[i], run.displays[i])
        void root.offsetWidth
        if (clock() - start >= budgetMs) {
          await nextSlice()
          start = clock()
        }
      }
      return !run.stopped
    } finally {
      this.finish(run)
    }
  }

  /** Puts the part being laid out back as it was (hidden), at once. */
  stop() {
    const run = this.run
    if (run) this.finish(run)
  }

  private finish(run: Run) {
    if (run.stopped) return
    run.stopped = true
    if (this.run === run) this.run = null
    run.pieces.forEach((piece, i) => restoreDisplay(piece, run.displays[i]))
    run.root.hidden = true
    if (run.visibility) run.root.style.visibility = run.visibility
    else run.root.style.removeProperty('visibility')
  }
}

function restoreDisplay(piece: HTMLElement, display: string) {
  if (display) piece.style.display = display
  else piece.style.removeProperty('display')
}
