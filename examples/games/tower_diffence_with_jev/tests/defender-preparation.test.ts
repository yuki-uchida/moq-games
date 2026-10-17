import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameRenderer } from '../src/rendering/GameRenderer'

function fixture(compileAsync: ReturnType<typeof vi.fn>) {
  const subject = Object.create(GameRenderer.prototype) as any
  Object.assign(subject, {
    modelsActive: true,
    disposed: false,
    preparedDefenders: new Set(),
    compilingDefenders: new Set(),
    defenderRetryAt: 0,
    assetErrors: {},
    models: {
      prepareDefender: vi.fn(() => true),
      setDefenderPreparationVisible: vi.fn()
    },
    renderer: { compileAsync, render: vi.fn() },
    scene: {},
    camera: {}
  })
  return subject
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
afterEach(() => vi.useRealTimers())

describe('defender GPU preparation recovery', () => {
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
      const subject = fixture(compile)
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
      expect(subject.compilingDefenders.size).toBe(0)
      expect(subject.assetErrors).toEqual({})
      expect(subject.models.setDefenderPreparationVisible).toHaveBeenLastCalledWith(['soldier'], false)
    })
  }
  it('hides pending rigs and ignores a late failure after disposal', async () => {
    let reject!: (error: Error) => void
    const subject = fixture(
      vi.fn(
        () =>
          new Promise((_, fail) => {
            reject = fail
          })
      )
    )
    subject.prepareDefenders(['soldier'])
    await settle()
    expect(subject.models.setDefenderPreparationVisible).toHaveBeenLastCalledWith(['soldier'], false)
    subject.disposed = true
    subject.compilingDefenders.clear()
    reject(new Error('late failure'))
    await settle()
    expect(subject.assetErrors).toEqual({})
    expect(subject.renderer.render).not.toHaveBeenCalled()
    expect(subject.preparedDefenders.size).toBe(0)
  })
})
