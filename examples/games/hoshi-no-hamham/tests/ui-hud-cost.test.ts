import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOSS_DRAIN_PER_SECOND, BOSS_HIT_DROP, newBossBar, stepBossBar } from '../src/ui/hud-model'
import { cancelReplay, removeClass, replay } from '../src/ui/replay'

describe('boss bar hits', () => {
  it('never reports a hit for the slow drain of a chase, at any frame rate', () => {
    for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.1]) {
      const bar = newBossBar(1)
      let target = 1
      for (let t = 0; t < 14; t += dt) {
        target = Math.max(0, target - BOSS_DRAIN_PER_SECOND * dt)
        expect(stepBossBar(bar, target, dt)).toBe(false)
      }
      expect(target).toBeLessThan(0.05)
    }
  })

  it('reports exactly one hit for a bite that lands during the drain', () => {
    const dt = 1 / 60
    const bar = newBossBar(1)
    let target = 1
    const hits: number[] = []
    for (let i = 0; i < 240; i++) {
      target -= BOSS_DRAIN_PER_SECOND * dt
      if (i === 120) target -= 0.09
      if (stepBossBar(bar, target, dt)) hits.push(i)
    }
    expect(hits).toEqual([120])
  })

  it('counts a point of a boss with hit points as a hit, the smallest one included', () => {
    const bar = newBossBar(1)
    expect(stepBossBar(bar, 1 - 1 / 18, 1 / 60)).toBe(true)
    expect(BOSS_HIT_DROP).toBeLessThan(1 / 18)
  })

  it('holds the trail only for a hit, so a draining fill drags its trail along', () => {
    const bar = newBossBar(1)
    for (let i = 0; i < 120; i++) stepBossBar(bar, 1 - i * 0.0012, 1 / 60)
    expect(bar.hold).toBe(0)
    expect(bar.trail).toBeLessThan(1)
  })
})

describe('replay', () => {
  /** An element with just the class list the helper uses. */
  const fakeNode = (initial: string[] = []) => {
    const classes = new Set(initial)
    const calls: string[] = []
    const node = {
      classList: {
        contains: (name: string) => classes.has(name),
        add: (...names: string[]) => {
          for (const name of names) classes.add(name)
          calls.push(`add ${names.join(' ')}`)
        },
        remove: (...names: string[]) => {
          for (const name of names) classes.delete(name)
          calls.push(`remove ${names.join(' ')}`)
        }
      }
    }
    return { node: node as unknown as HTMLElement, classes, calls }
  }

  afterEach(() => vi.unstubAllGlobals())

  /** Stands in for the browser's frames: the returned function runs the callbacks queued so far. */
  const frames = () => {
    let queue: (() => void)[] = []
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => queue.push(run))
    return () => {
      const run = queue
      queue = []
      for (const callback of run) callback()
    }
  }

  it('adds the class at once when the node does not have it', () => {
    const frame = frames()
    const { node, classes } = fakeNode()
    replay(node, 'is-hit')
    expect(classes.has('is-hit')).toBe(true)
    frame()
    frame()
    expect(classes.has('is-hit')).toBe(true)
  })

  it('takes the class off and puts it back two frames later, once, however often it is asked', () => {
    const frame = frames()
    const { node, classes, calls } = fakeNode(['is-hit'])
    replay(node, 'is-hit')
    replay(node, 'is-hit')
    expect(classes.has('is-hit')).toBe(false)
    frame()
    expect(classes.has('is-hit')).toBe(false)
    frame()
    expect(classes.has('is-hit')).toBe(true)
    expect(calls).toEqual(['remove is-hit', 'add is-hit'])
  })

  it('does not bring back a class that was taken off for good in the meantime', () => {
    const frame = frames()
    const { node, classes } = fakeNode(['is-show'])
    replay(node, 'is-show')
    removeClass(node, 'is-show')
    frame()
    frame()
    expect(classes.has('is-show')).toBe(false)
    const other = fakeNode(['is-in'])
    replay(other.node, 'is-in')
    cancelReplay(other.node, 'is-in')
    frame()
    frame()
    expect(other.classes.has('is-in')).toBe(false)
  })

  it('does not read style or layout', () => {
    const frame = frames()
    const read = vi.fn()
    vi.stubGlobal('getComputedStyle', read)
    const { node } = fakeNode(['is-pop'])
    replay(node, 'is-pop')
    frame()
    frame()
    expect(read).not.toHaveBeenCalled()
  })
})
