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
      setDefenderPreparationVisible: vi.fn(),
      setDefenderPreparationOpacity: vi.fn()
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
      expect(compile).toHaveBeenCalledTimes(3)
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

describe('first transparent preview preparation', () => {
  it('keeps a defender unavailable until its preview program finishes compiling', async () => {
    let finish!: () => void
    const compile = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          })
      )
    const subject = fixture(compile)
    subject.prepareDefenders(['archer'])
    await settle()
    expect(subject.defenderReady('archer')).toBe(false)
    expect(subject.compilingDefenders.has('archer')).toBe(true)
    expect(subject.models.setDefenderPreparationVisible).toHaveBeenLastCalledWith(['archer'], false)
    finish()
    await settle()
    expect(subject.defenderReady('archer')).toBe(true)
    expect(subject.models.setDefenderPreparationOpacity).toHaveBeenLastCalledWith(['archer'], 1)
    expect(subject.renderer.render).toHaveBeenCalledTimes(1)
  })
  for (const failure of ['throw', 'reject'] as const) {
    it(`restores opaque presentation and retries a preview ${failure}`, async () => {
      vi.useFakeTimers({ toFake: ['performance'] })
      const compile = vi
        .fn()
        .mockResolvedValueOnce({})
        .mockImplementationOnce(() => {
          if (failure === 'throw') throw new Error('preview shader failure')
          return Promise.reject(new Error('preview shader failure'))
        })
        .mockResolvedValue({})
      const subject = fixture(compile)
      subject.prepareDefenders(['tank'])
      await settle()
      expect(subject.defenderReady('tank')).toBe(false)
      expect(subject.models.setDefenderPreparationOpacity).toHaveBeenLastCalledWith(['tank'], 1)
      expect(subject.models.setDefenderPreparationVisible).toHaveBeenLastCalledWith(['tank'], false)
      expect(Object.values(subject.assetErrors)).toEqual(['Error: preview shader failure'])
      subject.prepareDefenders(['tank'])
      await settle()
      expect(compile).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(1001)
      subject.prepareDefenders(['tank'])
      await settle()
      expect(compile).toHaveBeenCalledTimes(4)
      expect(subject.defenderReady('tank')).toBe(true)
      expect(subject.assetErrors).toEqual({})
    })
  }
  it('ignores a late preview failure after disposal', async () => {
    let reject!: (error: Error) => void
    const compile = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail
          })
      )
    const subject = fixture(compile)
    subject.prepareDefenders(['soldier'])
    await settle()
    expect(subject.defenderReady('soldier')).toBe(false)
    subject.disposed = true
    subject.compilingDefenders.clear()
    reject(new Error('late preview failure'))
    await settle()
    expect(subject.assetErrors).toEqual({})
    expect(subject.preparedDefenders.size).toBe(0)
    expect(subject.models.setDefenderPreparationOpacity).toHaveBeenLastCalledWith(['soldier'], 1)
  })
})
