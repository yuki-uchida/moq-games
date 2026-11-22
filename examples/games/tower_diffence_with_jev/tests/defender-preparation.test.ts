import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameRenderer } from '../src/rendering/GameRenderer'

function fixture(compileAsync: ReturnType<typeof vi.fn>) {
  const subject = Object.create(GameRenderer.prototype) as any
  const roots: { removeFromParent: ReturnType<typeof vi.fn> }[] = []
  Object.assign(subject, {
    modelsActive: true,
    disposed: false,
    preparedDefenders: new Set(),
    compilingDefenders: new Set(),
    defenderRetryAt: 0,
    assetErrors: {},
    models: {
      warmVisual: vi.fn(() => {
        const root = { removeFromParent: vi.fn() }
        roots.push(root)
        return { root, sample: vi.fn(() => true) }
      })
    },
    renderer: { compileAsync, render: vi.fn() },
    scene: { add: vi.fn() },
    camera: {}
  })
  return { subject, roots }
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
afterEach(() => vi.useRealTimers())

describe('defender preparation of the shared sprite-stack program', () => {
  for (const failure of ['throw', 'reject'] as const) {
    it(`retries a transient ${failure} without a frame-by-frame retry storm`, async () => {
      vi.useFakeTimers({ toFake: ['performance'] })
      const compile = vi
        .fn()
        .mockImplementationOnce(() => {
          if (failure === 'throw') throw new Error('transient shader failure')
          return Promise.reject(new Error('transient shader failure'))
        })
        .mockResolvedValue({})
      const { subject, roots } = fixture(compile)
      subject.prepareDefenders(['soldier'])
      await settle()
      expect(subject.defenderReady('soldier')).toBe(false)
      expect(subject.compilingDefenders.size).toBe(0)
      expect(Object.values(subject.assetErrors)).toEqual(['Error: transient shader failure'])
      subject.prepareDefenders(['soldier'])
      await settle()
      expect(compile).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1001)
      subject.prepareDefenders(['soldier'])
      await settle()
      expect(compile).toHaveBeenCalledTimes(2)
      expect(subject.defenderReady('soldier')).toBe(true)
      expect(subject.assetErrors).toEqual({})
      // Warm figures never stay on the board.
      for (const root of roots) expect(root.removeFromParent).toHaveBeenCalled()
    })
  }
  it('keeps a defender unavailable until its compile finishes', async () => {
    let resolve!: () => void
    const { subject } = fixture(vi.fn(() => new Promise<void>((done) => (resolve = done))))
    subject.prepareDefenders(['archer'])
    await settle()
    expect(subject.defenderReady('archer')).toBe(false)
    resolve()
    await settle()
    expect(subject.defenderReady('archer')).toBe(true)
  })
  it('ignores a late failure after disposal', async () => {
    let reject!: (error: Error) => void
    const { subject } = fixture(vi.fn(() => new Promise((_, fail) => (reject = fail))))
    subject.prepareDefenders(['soldier'])
    await settle()
    subject.disposed = true
    reject(new Error('late failure'))
    await settle()
    expect(subject.assetErrors).toEqual({})
    expect(subject.preparedDefenders.size).toBe(0)
  })
})
