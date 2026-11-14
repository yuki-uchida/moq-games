import { describe, expect, it, vi } from 'vitest'
import { STAGED_LINES } from '../src/view/overlay'
import { primeStagingPictures } from '../src/view/prime'
import type { Renderer } from '../src/view/renderer'

// The goal arrow is a sprite; sprites are baked on a real canvas, which these tests do not have.
vi.mock('../src/view/bake', () => ({ blit: () => {}, brush: () => ({}), clip: () => null }))

/** A renderer whose context records the calls made on it. */
function fakeRenderer(options: { roundRect?: boolean; failOn?: string } = {}) {
  const calls: { name: string; args: unknown[] }[] = []
  const state: Record<string, unknown> = { fillStyle: '', globalAlpha: 1, font: '' }
  const has = (key: string) => key !== 'roundRect' || options.roundRect !== false
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (!has(key)) return undefined
      if (key === 'measureText') return (text: string) => ({ width: text.length * 10 })
      if (key === 'getTransform') return () => ({ a: 3 })
      if (key === 'createRadialGradient') return () => ({ addColorStop: () => {} })
      return (...args: unknown[]) => {
        if (key === options.failOn) throw new Error(`no ${key} here`)
        calls.push({ name: key, args })
      }
    },
    set(target, key: string, value) {
      target[key] = value
      return true
    }
  }) as unknown as CanvasRenderingContext2D
  const canvas = { width: 1440, height: 810 } as HTMLCanvasElement
  let screens = 0
  const renderer = { ctx, canvas, k: 3, screen: () => void screens++ } as unknown as Renderer
  return { renderer, calls, canvas, screens: () => screens }
}

describe('the rehearsal of the staging pictures', () => {
  it('draws the bubbles with their words, the spotlight and the iris, then hands the canvas to the GPU', () => {
    const fake = fakeRenderer()
    const copied: HTMLCanvasElement[] = []
    expect(primeStagingPictures(fake.renderer, (canvas) => void copied.push(canvas))).toBe(true)
    const names = fake.calls.map((call) => call.name)
    // A rounded box for each of the four bubbles, in each of the two passes.
    expect(names.filter((name) => name === 'roundRect')).toHaveLength(8)
    const texts = fake.calls.filter((call) => call.name === 'fillText').map((call) => call.args[0])
    expect(texts).toContain(STAGED_LINES[0])
    expect(texts).toContain(STAGED_LINES[1])
    // The spotlight's two rings in both passes, and the iris in the second: holes cut with the even-odd rule.
    const holes = fake.calls.filter((call) => call.name === 'fill' && call.args[0] === 'evenodd')
    expect(holes).toHaveLength(5)
    expect(fake.screens()).toBe(2)
    // The copy comes last: everything drawn before it is what the browser must send to the GPU.
    expect(copied).toEqual([fake.canvas])
  })

  it('draws nothing where the page cannot copy from a canvas', () => {
    const fake = fakeRenderer()
    expect(primeStagingPictures(fake.renderer, null)).toBe(false)
    expect(fake.calls).toHaveLength(0)
  })

  it('draws nothing on a context without rounded rectangles', () => {
    const fake = fakeRenderer({ roundRect: false })
    let copies = 0
    expect(primeStagingPictures(fake.renderer, () => void copies++)).toBe(false)
    expect(fake.calls).toHaveLength(0)
    expect(copies).toBe(0)
  })

  it('never stops the game when a drawing call fails', () => {
    const fake = fakeRenderer({ failOn: 'stroke' })
    let copies = 0
    expect(primeStagingPictures(fake.renderer, () => void copies++)).toBe(false)
    expect(copies).toBe(0)
  })
})
