/**
 * A readout for checking the game on the device in hand: open the game with `?perf` in the address and play. In a
 * corner it shows what a person feels as a freeze while a stage is played: how many frames a second the page was
 * given, the longest wait between two of them, how often the wait was long, and how often the page itself was busy
 * for long. A hit-stop (the short hold the game stages when a bite lands or the hero is hurt) keeps drawing frames
 * on time, so it is not counted: long waits at a hit are the page's doing, not the staging's.
 *
 * The times are those at which the browser asks the page for a frame. A page cannot see the display's own rate or
 * the moment a picture reaches the glass, so the readout names neither: it counts waits in milliseconds, which mean
 * the same on any display.
 *
 * Nothing here is loaded unless the address asks for it.
 */

/** A wait this long between two frames is at least one frame left out at 60 frames a second (ms). */
export const SLOW_MS = 25
/** A wait this long between two frames is a freeze anyone feels (ms). */
export const FREEZE_MS = 50
/** The rate is shown once this many frames have been counted. */
const RATE_FRAMES = 8

/** Counts the waits between the frames the page is given. No DOM: the unit tests drive it. */
export class FrameTally {
  frames = 0
  /** The time counted (ms): the waits added up. */
  time = 0
  slow = 0
  freezes = 0
  longest = 0
  private last: number | null = null

  /** Frames a second over the time counted (0 until there are a few). */
  get rate(): number {
    return this.frames >= RATE_FRAMES && this.time > 0 ? (this.frames * 1000) / this.time : 0
  }

  /** A frame arrived at `time` (ms). */
  frame(time: number) {
    const last = this.last
    this.last = time
    if (last === null) return
    const waited = time - last
    this.frames += 1
    this.time += waited
    if (waited > this.longest) this.longest = waited
    if (waited >= SLOW_MS) this.slow += 1
    if (waited >= FREEZE_MS) this.freezes += 1
  }

  /** The next frame starts a new count of waiting (play was left, paused or the page was hidden). */
  gap() {
    this.last = null
  }

  /** A new stage: every count starts over. */
  reset() {
    this.frames = 0
    this.time = 0
    this.slow = 0
    this.freezes = 0
    this.longest = 0
    this.last = null
  }
}

/** The lines of the readout. */
export function readoutText(tally: FrameTally, busy: { count: number; longest: number } | null): string {
  const rate = tally.rate
  const lines = [
    `${rate ? Math.round(rate) : '--'}コマ/秒  ${tally.frames}コマ  最長 ${Math.round(tally.longest)}ms`,
    `${SLOW_MS}ms以上 ${tally.slow}回  ${FREEZE_MS}ms以上 ${tally.freezes}回`
  ]
  if (busy) lines.push(`長い処理 ${busy.count}回 最長 ${Math.round(busy.longest)}ms`)
  return lines.join('\n')
}

/** True when the address asks for the readout. */
export function perfRequested(search: string): boolean {
  return new URLSearchParams(search).has('perf')
}

/** What the readout needs of the app. */
export interface PerfHost {
  /** True while a stage is played (not paused, not in a menu). */
  readonly inPlay: boolean
  /** A number that changes whenever a stage is started or left. */
  readonly playRun: number
}

/** The readout's box: CSS pixels, and the lines it has room for. */
const BOX = { width: 228, line: 16, pad: 4, lines: 3 }

/** The readout's element: a canvas, with the text it shows kept on it for the tests. */
export type ReadoutBox = HTMLCanvasElement & { shown?: string }

/**
 * Puts the readout on the page and keeps it up to date, once a second. It is drawn on a small canvas: a change of
 * text in the page would cost a style, layout and paint pass of its own, and the readout must not make the waits
 * it counts.
 */
export function startPerfReadout(host: PerfHost) {
  const box: ReadoutBox = document.createElement('canvas')
  box.id = 'perf-readout'
  box.setAttribute('aria-hidden', 'true')
  const ratio = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)))
  const height = BOX.lines * BOX.line + BOX.pad * 2
  box.width = BOX.width * ratio
  box.height = height * ratio
  // Top centre: the hearts are on the left and the buttons on the right in every layout.
  box.style.cssText =
    `position:fixed;left:50%;top:2px;transform:translateX(-50%);z-index:9999;width:${BOX.width}px;height:${height}px;` +
    'background:rgba(0,0,0,.66);border-radius:4px;pointer-events:none'
  document.body.append(box)
  const ctx = box.getContext('2d')
  const draw = (text: string) => {
    box.shown = text
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, BOX.width, height)
    ctx.font = '12px ui-monospace, monospace'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 6, BOX.pad + BOX.line * (i + 0.5), BOX.width - 12)
  }

  const tally = new FrameTally()
  // Tasks of 50 ms and more, where the browser reports them (Chromium does; Safari and Firefox do not).
  let busy: { count: number; longest: number } | null = null
  let playing = false
  let run = -1
  try {
    // A browser that does not report them only warns when asked, so ask what it supports first.
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        if (!playing || !busy) return
        for (const entry of list.getEntries()) {
          busy.count += 1
          busy.longest = Math.max(busy.longest, entry.duration)
        }
      })
      observer.observe({ type: 'longtask' })
      busy = { count: 0, longest: 0 }
    }
  } catch {
    busy = null
  }

  let shown = ''
  let nextWrite = 0
  const tick = (time: number) => {
    requestAnimationFrame(tick)
    const now = host.inPlay && !document.hidden
    // A new stage starts the counts over; a pause only stops them, and the last stage's stay up in the menus.
    if (now && host.playRun !== run) {
      run = host.playRun
      tally.reset()
      if (busy) busy = { count: 0, longest: 0 }
    }
    if (now) tally.frame(time)
    else tally.gap()
    playing = now
    if (time < nextWrite) return
    nextWrite = time + 1000
    const text = readoutText(tally, busy)
    if (text !== shown) {
      shown = text
      draw(text)
    }
  }
  requestAnimationFrame(tick)
}
