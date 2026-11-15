/**
 * A readout for checking the game on the device in hand: open the game with `?perf` in the address and play. In a
 * corner it shows what a person feels as a freeze while a stage is played: how many frames a second the page was
 * given, the longest wait between two of them, how often the wait was long, and how often the page itself was busy
 * for long. A hit-stop (the short hold the game stages when a bite lands or the hero is hurt) keeps drawing frames
 * on time, so it is not counted: long waits at a hit are the page's doing, not the staging's.
 *
 * The moments of damage have lines of their own: how many there were, how many of them were followed by a long
 * wait, and how many hit-stops the game staged (with their time in all). A stage that feels frozen at its hits
 * while no wait followed them was holding its picture on purpose, or the picture reached the glass late, which a
 * page cannot see. `?perf=nohold` plays the stages without their hit-stops, so that the two can be told apart by
 * feel.
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
/** A wait that begins within this long after a moment of damage is counted as that moment's (ms). */
export const AFTER_HIT_MS = 250
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

/**
 * Counts the moments of damage of a stage (the frames in which the hero was hurt or fell, a hit of his landed, a
 * boss crashed, a rock broke) and what a person may take for a freeze at them: the long waits that began within
 * `AFTER_HIT_MS` after such a frame, and the hit-stops the game staged. No DOM: the unit tests drive it.
 */
export class HitTally {
  /** Frames in which at least one judgement of damage was answered. */
  moments = 0
  /** Moments followed, within `AFTER_HIT_MS`, by a wait of `SLOW_MS` or more. */
  slow = 0
  /** Moments followed, within `AFTER_HIT_MS`, by a wait of `FREEZE_MS` or more. */
  freezes = 0
  /** Hit-stops begun, and the time their pictures stayed (ms). */
  holds = 0
  held = 0
  private seen = 0
  private last: number | null = null
  private holding = false
  /** The moments whose `AFTER_HIT_MS` are not over, oldest first, with what has been counted for each. */
  private open: { at: number; slow: boolean; freeze: boolean }[] = []

  /**
   * A frame arrived at `time` (ms). `judgements`: how many the stage has answered up to this frame (the session's
   * count: it only grows while one stage is played). `holding`: a hit-stop holds this frame's picture.
   */
  frame(time: number, judgements: number, holding: boolean) {
    const last = this.last
    this.last = time
    if (last !== null) {
      const waited = time - last
      // The wait that ends with this frame began when the frame before it arrived: it is a moment's own when that
      // frame is the moment's or came within the window after it. A moment counts once, however many waits follow.
      for (const moment of this.open) {
        if (last - moment.at > AFTER_HIT_MS) continue
        if (waited >= SLOW_MS && !moment.slow) {
          moment.slow = true
          this.slow += 1
        }
        if (waited >= FREEZE_MS && !moment.freeze) {
          moment.freeze = true
          this.freezes += 1
        }
      }
      // The picture of the frame before stayed until this one.
      if (this.holding) this.held += waited
    }
    while (this.open.length && time - this.open[0].at > AFTER_HIT_MS) this.open.shift()
    if (judgements > this.seen) {
      this.moments += 1
      this.open.push({ at: time, slow: false, freeze: false })
    }
    this.seen = judgements
    if (holding && !this.holding) this.holds += 1
    this.holding = holding
  }

  /** Play was left, paused or the page was hidden: no wait is counted across it, for any moment. */
  gap() {
    this.last = null
    this.holding = false
    this.open.length = 0
  }

  /** A new stage: every count starts over. */
  reset() {
    this.moments = 0
    this.slow = 0
    this.freezes = 0
    this.holds = 0
    this.held = 0
    this.seen = 0
    this.gap()
  }
}

/** The lines of the readout. `noHold`: the stages are played without their hit-stops (`?perf=nohold`). */
export function readoutText(
  tally: FrameTally,
  busy: { count: number; longest: number } | null,
  hits: HitTally | null = null,
  noHold = false
): string {
  const rate = tally.rate
  const lines = [
    `${rate ? Math.round(rate) : '--'}コマ/秒  ${tally.frames}コマ  最長 ${Math.round(tally.longest)}ms`,
    `${SLOW_MS}ms以上 ${tally.slow}回  ${FREEZE_MS}ms以上 ${tally.freezes}回`
  ]
  if (busy) lines.push(`長い処理 ${busy.count}回 最長 ${Math.round(busy.longest)}ms`)
  if (hits) {
    lines.push(`ダメージ判定 ${hits.moments}回`)
    lines.push(`直後 ${SLOW_MS}ms以上 ${hits.slow}回 ${FREEZE_MS}ms以上 ${hits.freezes}回`)
    lines.push(noHold ? 'ため(演出)なしで再生中' : `ため(演出) ${hits.holds}回 計${(hits.held / 1000).toFixed(1)}秒`)
  }
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
  /** The judgements of damage answered so far in the stage being played. */
  readonly judgements: number
  /** True while the stage being played holds its picture for a hit-stop. */
  readonly holding: boolean
}

/** The readout's box: CSS pixels, and the lines it has room for. */
const BOX = { width: 228, line: 16, pad: 4, lines: 6 }

/** The readout's element: a canvas, with the text it shows kept on it for the tests. */
export type ReadoutBox = HTMLCanvasElement & { shown?: string }

/**
 * Puts the readout on the page and keeps it up to date, once a second. It is drawn on a small canvas: a change of
 * text in the page would cost a style, layout and paint pass of its own, and the readout must not make the waits
 * it counts. `noHold`: the stages are played without their hit-stops, and the readout says so.
 */
export function startPerfReadout(host: PerfHost, noHold = false) {
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
  const hits = new HitTally()
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
      hits.reset()
      if (busy) busy = { count: 0, longest: 0 }
    }
    if (now) {
      tally.frame(time)
      // (The game's own frame ran before this one in the same frame of the page: what it answered is counted here.)
      hits.frame(time, host.judgements, host.holding)
    } else {
      tally.gap()
      hits.gap()
    }
    playing = now
    if (time < nextWrite) return
    nextWrite = time + 1000
    const text = readoutText(tally, busy, hits, noHold)
    if (text !== shown) {
      shown = text
      draw(text)
    }
  }
  requestAnimationFrame(tick)
}
