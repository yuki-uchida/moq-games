import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadGLTF } from '../src/rendering/ModelAssetCache'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameRenderer, campaignRequiredTypes } from '../src/rendering/GameRenderer'
import { ALLY_TYPES, ENEMY_TYPES, stageRules } from '../src/game/model'
import { preparationPause, preparationWait, preparationGpu } from '../src/rendering/CampaignPreparation'

const stage = { stage: 1, waveBossPolicy: 2 as const, units: [], pendingSpawns: [] }

function gpu() {
  return { isContextLost: () => false, fenceSync: vi.fn(() => ({})), flush: vi.fn(),
    clientWaitSync: vi.fn(() => 1), deleteSync: vi.fn(), getError: () => 0,
    ALREADY_SIGNALED: 1, CONDITION_SATISFIED: 2, TIMEOUT_EXPIRED: 3, WAIT_FAILED: 4, NO_ERROR: 0 }
}

afterEach(() => vi.useRealTimers())

describe('campaign loading completion', () => {
  it('counts completion only after effects finish, and reuses successful preparation', async () => {
    let finish!: () => void
    const effect = new Promise<void>((resolve) => {
      finish = resolve
    })
    const subject = Object.assign(Object.create(GameRenderer.prototype), {
      assetErrors: {},
      campaignPrepared: false,
      campaignPreparing: false,
      campaignContext: 0,
      campaignJobs: new Set(),
      preparedDefenders: new Set(),
      renderer: { getContext: () => gpu() },
      specialAbilities: { preload: vi.fn(async () => {}), prepare: vi.fn(() => effect) }
    })
    const progress = vi.fn()
    const pending = subject.prepareCampaign(new URL('https://example.test/'), stage, new AbortController().signal, progress)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(subject.campaignPrepared).toBe(false)
    expect(progress).toHaveBeenLastCalledWith(0, 1)
    finish()
    await pending
    expect(subject.campaignPrepared).toBe(true)
    expect(progress).toHaveBeenLastCalledWith(1, 1)
    await subject.prepareCampaign(new URL('https://example.test/'), stage, new AbortController().signal, progress)
    expect(subject.specialAbilities.prepare).toHaveBeenCalledTimes(1)
  })
  it('does not count a failed asset as complete and permits retry', async () => {
    const subject = Object.assign(Object.create(GameRenderer.prototype), {
      assetErrors: {},
      campaignPrepared: false,
      campaignPreparing: false,
      campaignContext: 0,
      campaignJobs: new Set(),
      preparedDefenders: new Set(),
      renderer: { getContext: () => gpu() },
      specialAbilities: {
        preload: vi.fn(async () => {}),
        prepare: vi.fn().mockRejectedValueOnce(new Error('missing')).mockResolvedValue(undefined)
      }
    })
    const progress = vi.fn()
    await expect(
      subject.prepareCampaign(new URL('https://example.test/'), stage, new AbortController().signal, progress)
    ).rejects.toThrow('missing')
    expect(subject.campaignPrepared).toBe(false)
    expect(progress).toHaveBeenLastCalledWith(0, 1)
    await subject.prepareCampaign(new URL('https://example.test/'), stage, new AbortController().signal, progress)
    expect(subject.campaignPrepared).toBe(true)
  })
  it('cancels waits and yields, with a finite timeout for a stuck operation', async () => {
    vi.useFakeTimers()
    await expect(preparationWait(Promise.reject(undefined), new AbortController().signal)).rejects.toBeUndefined()
    const request = new AbortController()
    const pending = preparationWait(new Promise(() => {}), request.signal)
    request.abort(new Error('cancelled'))
    await expect(pending).rejects.toThrow('cancelled')
    await expect(preparationPause(request.signal)).rejects.toThrow('cancelled')
    const timeout = preparationWait(new Promise(() => {}), new AbortController().signal)
    const rejected = expect(timeout).rejects.toThrow('タイムアウト')
    await vi.advanceTimersByTimeAsync(90_000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
})

it('aborts a timed-out real loader so Retry does not accumulate stalled transfers', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(function (this: GLTFLoader) {
    signal = this.manager.abortController.signal
    return new Promise(() => {})
  })
  try {
    const rejected = expect(loadGLTF('https://example.test/stuck.glb')).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(60_000)
    await rejected
    expect(signal?.aborted).toBe(true)
  } finally { load.mockRestore() }
})

it('does not clear a failed cached shader and falsely report a successful retry', async () => {
  const subject = Object.assign(Object.create(GameRenderer.prototype), {
    assetErrors: { 'model:shader': 'driver rejected shader' }, campaignPrepared: false,
    campaignPreparing: false, campaignContext: 0, campaignJobs: new Set(), preparedDefenders: new Set(),
    renderer: { getContext: () => gpu() },
    specialAbilities: { preload: async () => {}, prepare: async () => {} }
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(subject.prepareCampaign(new URL('https://example.test/'), stage, new AbortController().signal, () => {})).rejects.toThrow('driver rejected shader')
    expect(subject.campaignPrepared).toBe(false)
  }
})

it('waits for the GPU fence and rejects interrupted or failed GPU work', async () => {
  const gl = gpu(), request = new AbortController()
  gl.clientWaitSync.mockReturnValueOnce(gl.TIMEOUT_EXPIRED)
  await preparationGpu(gl as unknown as WebGL2RenderingContext, request.signal)
  expect(gl.clientWaitSync).toHaveBeenCalledTimes(2)
  expect(gl.deleteSync).toHaveBeenCalledTimes(1)
  gl.clientWaitSync.mockImplementationOnce(() => { request.abort(new Error('left')); return gl.TIMEOUT_EXPIRED })
  await expect(preparationGpu(gl as unknown as WebGL2RenderingContext, request.signal)).rejects.toThrow('left')
  expect(gl.deleteSync).toHaveBeenCalledTimes(2)
  gl.clientWaitSync.mockReturnValue(gl.WAIT_FAILED)
  await expect(preparationGpu(gl as unknown as WebGL2RenderingContext, new AbortController().signal)).rejects.toThrow('GPU')
  expect(gl.deleteSync).toHaveBeenCalledTimes(3)
})

it('does not accept a consumed GPU upload error on Retry without a restored context', async () => {
  const gl = { ...gpu(), getError: vi.fn().mockReturnValueOnce(1).mockReturnValue(0) }
  const subject = Object.assign(Object.create(GameRenderer.prototype), {
    assetErrors: {}, campaignPrepared: false, campaignPreparing: false, campaignContext: 0,
    campaignJobs: new Set(), preparedDefenders: new Set(), renderer: { getContext: () => gl },
    specialAbilities: { preload: async () => {}, prepare: async () => {} }
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(subject.prepareCampaign(new URL('https://example.test/'), stage, new AbortController().signal, () => {})).rejects.toThrow('GPU')
    expect(subject.campaignPrepared).toBe(false)
  }
})


it('prepares exactly the allies and legal stage enemies, including bosses and restored deployments', () => {
  for (const waveBossPolicy of [1, 2, 3] as const) {
    for (let level = 1; level <= 10; level++) {
      const wave = stageRules(level, waveBossPolicy)
      const actual = campaignRequiredTypes({ ...stage, stage: level, waveBossPolicy })
      expect(actual).toEqual(new Set([...ALLY_TYPES, ...wave.enemyTypes, ...(wave.bossType ? [wave.bossType] : [])]))
      for (const type of ENEMY_TYPES.filter((type) => !wave.enemyTypes.includes(type) && type !== wave.bossType))
        expect(actual.has(type)).toBe(false)
    }
  }
  const restored = campaignRequiredTypes({ ...stage, units: [{ type: 'dragon' }] as never, pendingSpawns: [{ unitType: 'ogre' }] as never })
  expect(restored.has('dragon')).toBe(true)
  expect(restored.has('ogre')).toBe(true)
})

it('does not reuse a previously ready stage after a later stage preparation fails', async () => {
  const subject = Object.assign(Object.create(GameRenderer.prototype), {
    assetErrors: { 'model:shader': 'driver rejected shader' }, campaignPrepared: true,
    campaignPreparing: false, campaignContext: 0, campaignJobs: new Set(), preparedDefenders: new Set(),
    effectClips: {}, models: { roster: { slime: { clips: { idle: { url: 'slime.glb' } } } }, cache: { retryFailed() {} }, errors: {} },
    renderer: { getContext: () => gpu() },
    specialAbilities: { preload: async () => {}, prepare: async () => {} }
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(subject.prepareCampaign(new URL('https://example.test/'), stage, new AbortController().signal, () => {})).rejects.toThrow('driver rejected shader')
    expect(subject.campaignPrepared).toBe(false)
  }
})
