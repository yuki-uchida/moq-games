/**
 * A readout for checking the game on the device in hand: open the game with `?perf` in the address and play. In a
 * corner it shows what a person feels as a freeze: display frames that came late while a stage was played, the
 * longest wait between two frames, and how often the page itself was busy for long. A hit-stop (the short hold the
 * game stages when a bite lands or the hero is hurt) keeps drawing frames on time, so it is not counted: late
 * frames at a hit are the page's doing, not the staging's.
 *
 * Nothing here is loaded unless the address asks for it.
 */

/** A frame counts as late when it took this many display intervals or more. */
export const LATE_FACTOR = 1.5
/** A wait this long between two frames is a freeze anyone feels (ms). */
export const FREEZE_MS = 50
/** How many recent intervals the display's own interval is read from. */
const WINDOW = 120

/** Counts late frames from the times the display frames arrive. No DOM: the unit tests drive it. */
export class FrameTally {
  frames = 0
  late = 0
  freezes = 0
  longest = 0
  private recent: number[] = []
  private last: number | null = null

  /** The display's interval as the recent frames show it: their median (0 until there are a few). */
  get interval(): number {
    if (this.recent.length < 8) return 0
    const sorted = [...this.recent].sort((a, b) => a - b)
    return sorted[sorted.length >> 1]
  }

  /** A frame arrived at `time` (ms). */
  frame(time: number) {
    const last = this.last
    this.last = time
    if (last === null) return
    const waited = time - last
    const usual = this.interval
    this.frames += 1
    if (waited > this.longest) this.longest = waited
    if (usual > 0 && waited >= usual * LATE_FACTOR) this.late += 1
    if (waited >= FREEZE_MS) this.freezes += 1
    this.recent.push(waited)
    if (this.recent.length > WINDOW) this.recent.shift()
  }

  /** The next frame starts a new count of waiting (play was left, paused or the page was hidden). */
  gap() {
    this.last = null
  }

  /** A new stage: every count starts over; what is known of the display stays. */
  reset() {
    this.frames = 0
    this.late = 0
    this.freezes = 0
    this.longest = 0
    this.last = null
  }
}

/** The two lines of the readout. */
export function readoutText(tally: FrameTally, busy: { count: number; longest: number } | null): string {
  const hz = tally.interval > 0 ? Math.round(1000 / tally.interval) : 0
  const lines = [
    `${hz || '--'}Hz  おくれ ${tally.late}/${tally.frames}  最長 ${Math.round(tally.longest)}ms`,
    `${FREEZE_MS}ms以上 ${tally.freezes}回` +
      (busy ? `  長い処理 ${busy.count}回 最長 ${Math.round(busy.longest)}ms` : '')
  ]
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

/** Puts the readout on the page and keeps it up to date, once a second. */
export function startPerfReadout(host: PerfHost) {
  const box = document.createElement('pre')
  box.id = 'perf-readout'
  box.setAttribute('aria-hidden', 'true')
  // Top centre: the hearts are on the left and the buttons on the right in every layout.
  box.style.cssText =
    'position:fixed;left:50%;top:2px;transform:translateX(-50%);z-index:9999;margin:0;padding:3px 6px;' +
    'font:12px/1.35 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.66);border-radius:4px;' +
    'pointer-events:none;white-space:pre'
  document.body.append(box)

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
      box.textContent = text
    }
  }
  requestAnimationFrame(tick)
}
