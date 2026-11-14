import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HudPrimer, type PrimeTarget } from '../src/ui/hud-prime'

/** A HUD that records what the walk asks of it. */
function fakeHud() {
  const calls: string[] = []
  const classes = new Set<string>()
  const attributes = new Map<string, string>()
  /** `ahead`: calls it still takes to lay the wanted characters out. */
  const state = { shown: false, ahead: 0 }
  const wanted: Array<{ name: string }> = []
  const note =
    (name: string, result?: unknown) =>
    (..._args: unknown[]) => {
      calls.push(name)
      return result
    }
  const hud = {
    root: {
      classList: { add: (c: string) => void classes.add(c), remove: (c: string) => void classes.delete(c) },
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name)
    },
    get shown() {
      return state.shown
    },
    wantStages: (stages: Array<{ name: string }>) => void wanted.push(...stages),
    layAhead: () => {
      calls.push('layAhead')
      if (state.ahead > 0) state.ahead -= 1
      return state.ahead > 0
    },
    setStage: note('setStage'),
    step: note('step'),
    reveal: () => {
      calls.push('reveal')
      state.shown = true
    },
    hide: () => {
      calls.push('hide')
      state.shown = false
    },
    show: note('show'),
    update: note('update'),
    showBoss: note('showBoss'),
    hideBoss: note('hideBoss'),
    showBanner: note('showBanner'),
    showToast: note('showToast'),
    showCall: note('showCall'),
    showNameplate: note('showNameplate'),
    cinematic: note('cinematic'),
    speak: note('speak', true),
    lights: note('lights')
  }
  return { hud: hud as unknown as PrimeTarget, calls, classes, attributes, state, wanted }
}

const count = (calls: string[], name: string) => calls.filter((c) => c === name).length

describe('the walk that rasters the HUD ahead', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('document', { hidden: false })
    vi.stubGlobal('requestAnimationFrame', (run: (time: number) => void) =>
      setTimeout(() => run(performance.now()), 16)
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('waits a moment, walks the HUD through its states out of sight and puts it away', async () => {
    const fake = fakeHud()
    const primer = new HudPrimer(fake.hud)
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fake.calls).toEqual([])
    await vi.advanceTimersByTimeAsync(400)
    // Under way: marked as out of sight for people, taps, the keyboard and screen readers.
    expect(primer.busy).toBe(true)
    expect(fake.classes.has('is-priming')).toBe(true)
    expect(fake.attributes.get('inert')).toBe('')
    expect(fake.attributes.get('aria-hidden')).toBe('true')
    await vi.advanceTimersByTimeAsync(6000)
    expect(primer.busy).toBe(false)
    expect(fake.classes.has('is-priming')).toBe(false)
    expect(fake.attributes.size).toBe(0)
    for (const name of ['setStage', 'reveal', 'showBoss', 'showBanner', 'showToast', 'showNameplate', 'showCall'])
      expect(count(fake.calls, name), name).toBeGreaterThan(0)
    // Both lights and the letterbox go on and off again.
    expect(count(fake.calls, 'lights')).toBe(2)
    expect(count(fake.calls, 'cinematic')).toBe(2)
    expect(fake.calls.at(-1)).toBe('hide')
    expect(fake.state.shown).toBe(false)
  })

  it('walks a layout once: asked again, it does nothing', async () => {
    const fake = fakeHud()
    const primer = new HudPrimer(fake.hud)
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(8000)
    const reveals = count(fake.calls, 'reveal')
    expect(reveals).toBe(1)
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(8000)
    expect(count(fake.calls, 'reveal')).toBe(1)
  })

  it('makes a walk that a stage cut short again when it is asked to, back in a menu', async () => {
    const fake = fakeHud()
    const primer = new HudPrimer(fake.hud)
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(2000)
    expect(primer.busy).toBe(true)
    // The stage's own HUD takes over.
    primer.interrupt()
    expect(primer.busy).toBe(false)
    expect(fake.classes.has('is-priming')).toBe(false)
    expect(fake.calls.at(-1)).toBe('hide')
    const steps = count(fake.calls, 'step')
    fake.state.shown = true
    await vi.advanceTimersByTimeAsync(8000)
    // Nothing of the walk goes on while the stage is played.
    expect(count(fake.calls, 'step')).toBe(steps)
    // Asked while the stage's HUD is on screen: no walk.
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(8000)
    expect(count(fake.calls, 'reveal')).toBe(1)
    // Back in a menu.
    fake.state.shown = false
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(8000)
    expect(count(fake.calls, 'reveal')).toBe(2)
    expect(primer.busy).toBe(false)
    // And that one counted: a third asking does nothing.
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(8000)
    expect(count(fake.calls, 'reveal')).toBe(2)
  })

  it('asks for the texts of every stage and stays on until their characters are laid out', async () => {
    const fake = fakeHud()
    // More frames than the walk through the states has: the walk goes on after its last state.
    fake.state.ahead = 300
    const primer = new HudPrimer(fake.hud)
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(1400)
    // Every stage is wished for.
    expect(fake.wanted.length).toBe(10)
    expect(new Set(fake.wanted.map((stage) => stage.name)).size).toBe(10)
    await vi.advanceTimersByTimeAsync(3000)
    expect(primer.busy).toBe(true)
    expect(fake.state.ahead).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(4000)
    expect(fake.state.ahead).toBe(0)
    expect(primer.busy).toBe(false)
    expect(fake.calls.at(-1)).toBe('hide')
    // Characters are laid out in the frames of the walk, one call a frame.
    expect(count(fake.calls, 'layAhead')).toBe(count(fake.calls, 'step'))
    // It was a walk like any other: not made again.
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(8000)
    expect(count(fake.calls, 'reveal')).toBe(1)
  })

  it('does not wait for the characters for ever', async () => {
    const fake = fakeHud()
    fake.state.ahead = 1e9
    const primer = new HudPrimer(fake.hud)
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(7000)
    expect(primer.busy).toBe(true)
    await vi.advanceTimersByTimeAsync(4000)
    expect(primer.busy).toBe(false)
    expect(fake.calls.at(-1)).toBe('hide')
  })

  it('does not start while the page is hidden', async () => {
    const fake = fakeHud()
    vi.stubGlobal('document', { hidden: true })
    const primer = new HudPrimer(fake.hud)
    primer.whenIdle()
    await vi.advanceTimersByTimeAsync(8000)
    expect(fake.calls).toEqual([])
  })
})
