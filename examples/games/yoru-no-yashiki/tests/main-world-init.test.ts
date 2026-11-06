import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  peer: vi.fn(),
  send: vi.fn(() => true),
  preview: vi.fn(() => true)
}))

vi.mock('../src/world', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/world')>()),
  HorrorWorld: class {
    isHealthy = true
    constructor() {
      mocks.construct()
    }
    render = mocks.render
    dispose = mocks.dispose
    resize() {}
  }
}))

vi.mock('../src/peer', () => ({
  createRoomCode: () => 'a'.repeat(32),
  HorrorPeer: class {
    constructor(options: unknown) {
      mocks.peer(options)
    }
    connect = mocks.connect
    close = mocks.close
    send = mocks.send
  }
}))

vi.mock('../src/sound', () => ({
  YashikiSound: class {
    isPreviewing = false
    setVolume() {}
    setMuted() {}
    stopPreview() {}
    start() {}
    stop() {}
    dispose() {}
    previewBell = mocks.preview
  }
}))

class Events {
  callbacks: { type: string; callback: () => void; signal?: AbortSignal; once?: boolean }[] = []
  addEventListener(type: string, callback: () => void, options?: { signal?: AbortSignal; once?: boolean }) {
    this.callbacks.push({ type, callback, ...options })
  }
  emit(type: string) {
    for (const listener of [...this.callbacks]) {
      if (listener.type !== type || listener.signal?.aborted) continue
      if (listener.once) this.callbacks.splice(this.callbacks.indexOf(listener), 1)
      listener.callback()
    }
  }
}

class Element extends Events {
  value = ''
  textContent = ''
  disabled = false
  checked = false
  hidden = false
  readOnly = false
  parentElement = this
  onclick?: () => unknown
  insertAdjacentHTML() {}
  setAttribute() {}
  replaceChildren() {}
  focus() {}
  closest() {
    return this
  }
}

function fixture() {
  const elements = new Map<string, Element>()
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element())
    return elements.get(id)!
  }
  element('threshold').value = '0.1'
  element('volume').value = element('play-volume').value = '0.2'
  element('relay-url').value = 'https://relay.invalid:4433'
  element('room-code').value = 'a'.repeat(32)
  element('ready').disabled = element('sound-preview').disabled = element('copy').disabled = true
  const window = new Events()
  const document = Object.assign(new Events(), {
    hidden: false,
    fullscreenEnabled: false,
    fullscreenElement: null,
    pointerLockElement: null,
    querySelector: element,
    getElementById: element,
    createElement: () => new Element()
  })
  const tracks: { readyState: string; muted: boolean; enabled: boolean; stop: ReturnType<typeof vi.fn> }[] = []
  const getUserMedia = vi.fn(async () => {
    const track = {
      readyState: 'live',
      muted: false,
      enabled: true,
      stop: vi.fn(() => {
        track.readyState = 'ended'
      })
    }
    tracks.push(track)
    return { getTracks: () => [track], getAudioTracks: () => [track] }
  })
  const frames = new Map<number, FrameRequestCallback>()
  let sequence = 0
  const raf = vi.fn((callback: FrameRequestCallback) => {
    frames.set(++sequence, callback)
    return sequence
  })
  const cancel = vi.fn((id: number) => frames.delete(id))
  const disconnect = vi.fn()
  const reload = vi.fn()
  const createAudio = vi.fn()
  vi.stubGlobal('window', window)
  vi.stubGlobal('document', document)
  vi.stubGlobal('HTMLElement', Element)
  vi.stubGlobal('HTMLInputElement', Element)
  vi.stubGlobal('HTMLTextAreaElement', Element)
  vi.stubGlobal('HTMLButtonElement', Element)
  vi.stubGlobal('HTMLSelectElement', Element)
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect
    }
  )
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        createAudio()
      }
      state = 'running'
      sampleRate = 48000
      async resume() {}
      async close() {
        this.state = 'closed'
      }
      createMediaStreamSource() {
        return { connect() {} }
      }
      createAnalyser() {
        return { fftSize: 8192, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0) }
      }
    }
  )
  const click = async (id: string) => {
    await element(id).onclick?.()
    await Promise.resolve()
  }
  const frame = () => {
    const entry = frames.entries().next().value
    expect(entry).toBeDefined()
    if (!entry) return
    frames.delete(entry[0])
    entry[1](performance.now())
  }
  return {
    element,
    click,
    window,
    document,
    tracks,
    getUserMedia,
    createAudio,
    frames,
    raf,
    cancel,
    disconnect,
    reload,
    frame
  }
}

let game: ReturnType<typeof fixture>
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.send.mockReturnValue(true)
  mocks.preview.mockReturnValue(true)
  game = fixture()
})
afterEach(() => {
  try {
    game.window.emit('pagehide')
  } finally {
    vi.unstubAllGlobals()
  }
})

async function loadFailure(value: unknown, duringConstruction?: () => void) {
  mocks.construct.mockImplementationOnce(() => {
    duringConstruction?.()
    throw value
  })
  const result = await import('../src/main').then(
    () => ({ rejected: false, value: undefined }),
    (error: unknown) => ({ rejected: true, value: error })
  )
  expect(result.rejected).toBe(true)
  expect(result.value).toBe(value)
}

const failures = [
  ['Error', new Error('world construction failed')],
  ['undefined', undefined],
  ['null', null],
  ['false', false],
  ['zero', 0],
  ['empty string', '']
] as const

function expectBlocked() {
  expect(game.getUserMedia).not.toHaveBeenCalled()
  expect(game.createAudio).not.toHaveBeenCalled()
  expect(mocks.peer).not.toHaveBeenCalled()
  expect(mocks.connect).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
  expect(mocks.preview).not.toHaveBeenCalled()
  expect(game.raf).not.toHaveBeenCalled()
  expect(game.frames.size).toBe(0)
  expect(mocks.render).not.toHaveBeenCalled()
}

function reentry() {
  const pending: Promise<unknown>[] = []
  const errors: unknown[] = []
  const enter = () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const id of ['microphone', 'host', 'guest', 'ready', 'sound-preview']) {
        try {
          pending.push(Promise.resolve(game.element(id).onclick?.()).catch((error) => errors.push(error)))
        } catch (error) {
          errors.push(error)
        }
      }
    }
  }
  const settle = async () => {
    await Promise.all(pending)
    expect(errors).toEqual([])
  }
  return { enter, settle }
}

describe('world initialization failure', () => {
  for (const [name, value] of failures) {
    it(`blocks capture after ${name} without reserving a frame`, async () => {
      await loadFailure(value)
      for (let attempt = 0; attempt < 3; attempt++) await game.click('microphone')
      expect(game.getUserMedia).not.toHaveBeenCalled()
      expect(game.raf).not.toHaveBeenCalled()
      expect(game.frames.size).toBe(0)
      expect(mocks.render).not.toHaveBeenCalled()
      expect(mocks.dispose).not.toHaveBeenCalled()
      expectBlocked()
    })
  }

  for (const role of ['host', 'guest']) {
    it(`blocks repeated ${role} connect and game-start operations`, async () => {
      await loadFailure(new Error('world construction failed'))
      for (let attempt = 0; attempt < 3; attempt++) {
        await game.click(role)
        await game.click('ready')
      }
      expect(mocks.peer).not.toHaveBeenCalled()
      expect(mocks.connect).not.toHaveBeenCalled()
      expect(mocks.send).not.toHaveBeenCalled()
      expect(game.element('ready').disabled).toBe(true)
      expect(game.element('phase').textContent).not.toBe('第一夜')
    })
  }

  it('reports the drawing failure and disables unsafe controls', async () => {
    await loadFailure(new Error('world construction failed'))
    expect(game.element('notice').textContent).toContain('描画')
    expect(game.element('notice').textContent).toContain('再読み込み')
    for (const id of ['host', 'guest', 'microphone', 'ready']) expect(game.element(id).disabled).toBe(true)
    expect(game.disconnect).toHaveBeenCalledOnce()
    expect(game.window.callbacks.filter((listener) => listener.signal && !listener.signal.aborted)).toHaveLength(0)
    expect(game.document.callbacks.filter((listener) => listener.signal && !listener.signal.aborted)).toHaveLength(0)
  })

  for (const target of ['notice', 'host', 'microphone']) {
    it(`preserves the original exception when ${target} UI throws synchronously`, async () => {
      const error = new Error('original world failure')
      Object.defineProperty(game.element(target), target === 'notice' ? 'textContent' : 'disabled', {
        configurable: true,
        get: () => false,
        set() {
          throw new Error('secondary UI failure')
        }
      })
      await loadFailure(error)
      await game.click('microphone')
      await game.click('host')
      await game.click('guest')
      expect(game.getUserMedia).not.toHaveBeenCalled()
      expect(mocks.connect).not.toHaveBeenCalled()
      expect(game.raf).not.toHaveBeenCalled()
    })
  }

  for (const action of ['pagehide', 'reset']) {
    it(`tolerates ${action} reentry while reporting failure`, async () => {
      let entered = false
      Object.defineProperty(game.element('notice'), 'textContent', {
        configurable: true,
        get: () => '',
        set() {
          if (entered) return
          entered = true
          if (action === 'pagehide') game.window.emit('pagehide')
          else game.element('reset').onclick?.()
          void game.element('microphone').onclick?.()
          void game.element('host').onclick?.()
        }
      })
      await loadFailure(false)
      expect(entered).toBe(true)
      await game.click('microphone')
      await game.click('guest')
      expect(game.getUserMedia).not.toHaveBeenCalled()
      expect(mocks.connect).not.toHaveBeenCalled()
      expect(game.raf).not.toHaveBeenCalled()
    })
  }

  it('keeps cleanup and repeated end operations usable after failure', async () => {
    await loadFailure(new Error('world construction failed'))
    game.window.emit('pagehide')
    await game.click('reset')
    await game.click('reset')
    await game.click('microphone')
    await game.click('host')
    expect(game.reload).toHaveBeenCalledTimes(2)
    expect(game.frames.size).toBe(0)
    expect(game.getUserMedia).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
  })
})

describe('world initialization synchronous reentry', () => {
  for (const [name, value] of failures) {
    for (const stage of ['constructor', 'notice', 'disabled']) {
      for (const end of ['none', 'pagehide', 'reset']) {
        it(`blocks finite ${stage} reentry with ${end} and preserves ${name}`, async () => {
          const actions = reentry()
          let entered = false
          const enter = () => {
            if (entered) return
            entered = true
            actions.enter()
            if (end === 'pagehide') game.window.emit('pagehide')
            if (end === 'reset') game.element('reset').onclick?.()
            actions.enter()
          }
          if (stage !== 'constructor') {
            const target = game.element(stage === 'notice' ? 'notice' : 'host')
            const property = stage === 'notice' ? 'textContent' : 'disabled'
            let stored: unknown = stage === 'notice' ? '' : false
            Object.defineProperty(target, property, {
              configurable: true,
              get: () => stored,
              set(next) {
                stored = next
                enter()
              }
            })
          }
          await loadFailure(value, stage === 'constructor' ? enter : undefined)
          expect(entered).toBe(true)
          await actions.settle()
          actions.enter()
          await actions.settle()
          expectBlocked()
          expect(mocks.dispose).not.toHaveBeenCalled()
          await game.click('reset')
          expect(game.reload).toHaveBeenCalled()
        })
      }
    }
  }

  for (const target of ['guest', 'ready', 'sound-preview']) {
    it(`keeps programmatic actions blocked when ${target} remains enabled after a DOM exception`, async () => {
      Object.defineProperty(game.element(target), 'disabled', {
        configurable: true,
        get: () => false,
        set() {
          throw new Error('secondary disabled setter failure')
        }
      })
      await loadFailure(null)
      const actions = reentry()
      actions.enter()
      await actions.settle()
      expectBlocked()
      await game.click('reset')
      expect(game.reload).toHaveBeenCalledOnce()
    })
  }

  it('preserves the original throw and attempts other cleanup when observer disconnection throws', async () => {
    game.disconnect.mockImplementation(() => {
      throw new Error('observer cleanup failed')
    })
    await loadFailure(new Error('original construction failure'))
    expect(game.disconnect).toHaveBeenCalledOnce()
    expect(game.element('notice').textContent).toContain('描画')
    const actions = reentry()
    actions.enter()
    await actions.settle()
    expectBlocked()
    await game.click('reset')
    expect(game.reload).toHaveBeenCalledOnce()
    game.disconnect.mockReset()
  })

  for (const end of ['pagehide', 'reset']) {
    it(`blocks actions while constructing successfully and disposes the returned world after ${end}`, async () => {
      const actions = reentry()
      mocks.construct.mockImplementationOnce(() => {
        actions.enter()
        if (end === 'pagehide') game.window.emit('pagehide')
        else game.element('reset').onclick?.()
        actions.enter()
      })
      await import('../src/main')
      await actions.settle()
      expectBlocked()
      expect(mocks.dispose).toHaveBeenCalledOnce()
      await game.click('reset')
      expect(game.reload).toHaveBeenCalled()
      expect(mocks.dispose).toHaveBeenCalledOnce()
    })
  }
})

describe('normal initialization contrast', () => {
  it('blocks constructor-time actions but enables them after successful construction', async () => {
    const actions = reentry()
    mocks.construct.mockImplementationOnce(actions.enter)
    await import('../src/main')
    await actions.settle()
    expect(game.getUserMedia).not.toHaveBeenCalled()
    expect(game.createAudio).not.toHaveBeenCalled()
    expect(mocks.peer).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(game.raf).toHaveBeenCalledOnce()
    await game.click('microphone')
    expect(game.getUserMedia).toHaveBeenCalledOnce()
    expect(game.createAudio).toHaveBeenCalledOnce()
    await game.click('sound-preview')
    expect(mocks.preview).toHaveBeenCalledOnce()
    await game.click('host')
    expect(mocks.connect).toHaveBeenCalledOnce()
  })

  it('reserves and runs frames, obtains and reconnects a mocked microphone, and allows preview', async () => {
    await import('../src/main')
    expect(game.raf).toHaveBeenCalledOnce()
    game.frame()
    expect(mocks.render).toHaveBeenCalledOnce()
    expect(game.frames.size).toBe(1)
    await game.click('microphone')
    expect(game.getUserMedia).toHaveBeenCalledOnce()
    expect(game.tracks[0].readyState).toBe('live')
    await game.click('sound-preview')
    expect(mocks.preview).toHaveBeenCalledOnce()
    await game.click('microphone')
    expect(game.getUserMedia).toHaveBeenCalledTimes(2)
    expect(game.tracks[0].stop).toHaveBeenCalledOnce()
    expect(game.tracks[1].readyState).toBe('live')
    game.window.emit('pagehide')
    expect(game.tracks[1].stop).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(game.frames.size).toBe(0)
  })

  for (const role of ['host', 'guest']) {
    it(`allows normal ${role} connection and closes the mock peer on exit`, async () => {
      await import('../src/main')
      await game.click(role)
      expect(mocks.peer).toHaveBeenCalledWith(expect.objectContaining({ role }))
      expect(mocks.connect).toHaveBeenCalledOnce()
      game.window.emit('pagehide')
      expect(mocks.close).toHaveBeenCalledOnce()
      expect(game.frames.size).toBe(0)
    })
  }
})
