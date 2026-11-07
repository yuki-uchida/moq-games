import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import type * as Three from 'three'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = Object.assign(new EventTarget(), { remove: vi.fn() })
      context = { isContextLost: vi.fn(() => false) }
      getContext = () => this.context
      info = { render: { calls: 1 } }
      setPixelRatio = vi.fn()
      setClearColor = vi.fn()
      setSize = vi.fn()
      render = vi.fn(() => {
        this.info.render.calls = 1
      })
      dispose = vi.fn()
      outputColorSpace = ''
    }
  }
})

import { HAUNTER_START, HorrorWorld, HUMAN_START, clampPitch, movePose, type Pose, type WorldFrame } from '../src/world'
import { RITUAL_STEPS } from '../src/ritual'
import { footstepSurface } from '../src/footsteps'
import { Box3, Color, FrontSide, Material, MathUtils, Matrix4, Raycaster, ShaderLib, Vector3 } from 'three'

describe('world disposal fault isolation', () => {
  type Internals = {
    renderer: Three.WebGLRenderer
    staticMeshes: Three.InstancedMesh[]
    geometries: Set<Three.BufferGeometry>
    materials: Set<Three.Material>
    textures: Set<Three.Texture>
    disposed: boolean
    contextLost: boolean
    restorePending: boolean
    onContextLost: (event: Event) => void
    onContextRestored: () => void
  }
  const values = [
    { name: 'undefined', value: undefined },
    { name: 'null', value: null },
    { name: 'false', value: false },
    { name: '0', value: 0 },
    { name: 'Error', value: new Error('injected cleanup failure') }
  ]
  const stages = [
    'listener:lost',
    'listener:restored',
    'mesh:first',
    'mesh:last',
    'geometry:first',
    'geometry:last',
    'material:first',
    'material:last',
    'texture:first',
    'texture:last',
    'renderer',
    'canvas'
  ]
  const capture = (operation: () => void) => {
    try {
      operation()
      return { threw: false, value: undefined as unknown }
    } catch (value) {
      return { threw: true, value }
    }
  }
  const create = () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const lost = vi.fn()
    const world = new HorrorWorld(container, lost)
    const internals = world as unknown as Internals
    const { renderer } = internals
    const frame: WorldFrame = { role: 'human', human: HUMAN_START, haunter: HAUNTER_START, effect: null, time: 0 }
    expect(world.isHealthy).toBe(true)
    world.render(frame)
    expect(renderer.render).toHaveBeenCalledOnce()
    renderer.domElement.dispatchEvent(new Event('webglcontextlost'))
    expect(lost).toHaveBeenCalledOnce()
    lost.mockClear()
    vi.mocked(renderer.render).mockClear()
    vi.mocked(renderer.setSize).mockClear()
    const getContext = vi.spyOn(renderer, 'getContext')
    const attempts: string[] = []
    const returned: string[] = []
    const reentries: string[] = []
    const disposedAtAttempt: boolean[] = []
    const faults = new Map<string, unknown>()
    const reenter = new Set<string>()
    const actions = new Map<string, ReturnType<typeof vi.fn>>()
    const instrument = (label: string, operation: () => void) => {
      const spy = vi.fn(() => {
        attempts.push(label)
        disposedAtAttempt.push(internals.disposed)
        if (reenter.has(label)) {
          reentries.push(label)
          world.dispose()
          world.render(frame)
          world.resize()
          internals.onContextLost(new Event('webglcontextlost'))
          internals.onContextRestored()
        }
        if (faults.has(label)) throw faults.get(label)
        operation()
        returned.push(label)
      })
      actions.set(label, spy)
      return spy
    }
    const removeListener = renderer.domElement.removeEventListener.bind(renderer.domElement)
    const removers = new Map([
      [
        'webglcontextlost',
        instrument('listener:lost', () => removeListener('webglcontextlost', internals.onContextLost))
      ],
      [
        'webglcontextrestored',
        instrument('listener:restored', () => removeListener('webglcontextrestored', internals.onContextRestored))
      ]
    ])
    vi.spyOn(renderer.domElement, 'removeEventListener').mockImplementation((type, listener, options) => {
      expect(listener).toBe(type === 'webglcontextlost' ? internals.onContextLost : internals.onContextRestored)
      expect(options).toBeUndefined()
      removers.get(type)!()
    })
    for (const [kind, resources] of [
      ['mesh', internals.staticMeshes],
      ['geometry', [...internals.geometries]],
      ['material', [...internals.materials]],
      ['texture', [...internals.textures]]
    ] as const) {
      expect(resources.length).toBeGreaterThan(1)
      resources.forEach((resource, index) => {
        const original = resource.dispose.bind(resource)
        vi.spyOn(resource, 'dispose').mockImplementation(instrument(`${kind}:${index}`, original))
      })
    }
    const disposeRenderer = vi.mocked(renderer.dispose).getMockImplementation()
    vi.mocked(renderer.dispose).mockImplementation(instrument('renderer', () => disposeRenderer?.()))
    const removeCanvas = vi.mocked(renderer.domElement.remove).getMockImplementation()
    vi.mocked(renderer.domElement.remove).mockImplementation(instrument('canvas', () => removeCanvas?.()))
    const labels = [...actions.keys()]
    const resolve = (stage: string) => {
      if (!stage.endsWith(':first') && !stage.endsWith(':last')) return stage
      const matches = labels.filter((label) => label.startsWith(stage.split(':')[0] + ':'))
      return stage.endsWith(':first') ? matches[0] : matches[matches.length - 1]
    }
    const verify = () => {
      const outcome = capture(() => world.dispose())
      const afterFirst = [...attempts]
      const repeated = capture(() => {
        world.dispose()
        world.dispose()
      })
      world.render(frame)
      world.resize()
      const oldLost = new Event('webglcontextlost', { cancelable: true })
      internals.onContextLost(oldLost)
      internals.onContextRestored()
      const dispatchedLost = new Event('webglcontextlost', { cancelable: true })
      renderer.domElement.dispatchEvent(dispatchedLost)
      renderer.domElement.dispatchEvent(new Event('webglcontextrestored'))
      const first = labels.find((label) => faults.has(label))
      expect(outcome.threw).toBe(first !== undefined)
      if (first !== undefined) expect(Object.is(outcome.value, faults.get(first))).toBe(true)
      expect(attempts).toEqual(labels)
      expect(returned).toEqual(labels.filter((label) => !faults.has(label)))
      expect(reentries).toEqual(labels.filter((label) => reenter.has(label)))
      expect(disposedAtAttempt.every(Boolean)).toBe(true)
      for (const action of actions.values()) expect(action).toHaveBeenCalledOnce()
      expect(repeated.threw).toBe(false)
      expect(attempts).toEqual(afterFirst)
      expect(internals.disposed).toBe(true)
      expect(world.isHealthy).toBe(false)
      expect(renderer.render).not.toHaveBeenCalled()
      expect(renderer.setSize).not.toHaveBeenCalled()
      expect(getContext).not.toHaveBeenCalled()
      expect(lost).not.toHaveBeenCalled()
      expect(internals.contextLost).toBe(true)
      expect(internals.restorePending).toBe(false)
      expect(oldLost.defaultPrevented).toBe(true)
      expect(dispatchedLost.defaultPrevented).toBe(faults.has('listener:lost'))
    }
    return { faults, reenter, labels, resolve, verify }
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('keeps every normal cleanup exactly once in its existing order', () => {
    create().verify()
  })

  for (const stage of stages) {
    test.each(values)(`continues after ${stage} throws $name`, ({ value }) => {
      const fixture = create()
      fixture.faults.set(fixture.resolve(stage), value)
      fixture.verify()
    })
    test(`does not repeat any cleanup during synchronous reentry at ${stage}`, () => {
      const fixture = create()
      fixture.reenter.add(fixture.resolve(stage))
      fixture.verify()
    })
  }

  test.each(values)(
    'preserves earliest $name over failures at every later action with synchronous reentry',
    ({ value }) => {
      const fixture = create()
      for (const label of [...fixture.labels].reverse()) {
        fixture.faults.set(label, new Error(`later ${label}`))
        fixture.reenter.add(label)
      }
      fixture.faults.set(fixture.labels[0], value)
      fixture.verify()
    }
  )

  test.each(['mesh', 'geometry', 'material', 'texture'])(
    'keeps the first %s failure ahead of its last and later stages',
    (kind) => {
      const fixture = create()
      fixture.faults.set('canvas', new Error('last canvas failure'))
      fixture.faults.set('renderer', false)
      fixture.faults.set(fixture.resolve(`${kind}:last`), new Error('later same collection failure'))
      fixture.faults.set(fixture.resolve(`${kind}:first`), 0)
      fixture.verify()
    }
  )
})

describe('world WebGL availability', () => {
  const create = () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const lost = vi.fn()
    const world = new HorrorWorld(container, lost)
    const renderer = (world as unknown as { renderer: Three.WebGLRenderer }).renderer
    const context = vi.spyOn(renderer.getContext(), 'isContextLost')
    const frame: WorldFrame = { role: 'human', human: HUMAN_START, haunter: HAUNTER_START, effect: null, time: 0 }
    return { world, renderer, context, frame, lost }
  }

  test('requires a restored event, real live context and a nonempty redraw after loss', () => {
    const { world, renderer, context, frame, lost } = create()
    expect(world.isHealthy).toBe(true)
    context.mockReturnValue(true)
    expect(world.isHealthy).toBe(false)
    world.render(frame)
    expect(renderer.render).not.toHaveBeenCalled()
    const event = new Event('webglcontextlost', { cancelable: true })
    renderer.domElement.dispatchEvent(event)
    renderer.domElement.dispatchEvent(new Event('webglcontextlost'))
    expect(event.defaultPrevented).toBe(true)
    expect(lost).toHaveBeenCalledOnce()
    context.mockReturnValue(false)
    world.render(frame)
    expect(renderer.render).not.toHaveBeenCalled()
    renderer.domElement.dispatchEvent(new Event('webglcontextrestored'))
    expect(world.isHealthy).toBe(false)
    vi.mocked(renderer.render).mockImplementationOnce(() => {})
    world.render(frame)
    expect(world.isHealthy).toBe(false)
    world.render(frame)
    expect(world.isHealthy).toBe(true)
    world.dispose()
  })

  test('does not qualify a context lost again during redraw or before its restored event', () => {
    const { world, renderer, context, frame, lost } = create()
    renderer.domElement.dispatchEvent(new Event('webglcontextlost'))
    renderer.domElement.dispatchEvent(new Event('webglcontextrestored'))
    context.mockReturnValue(true)
    world.render(frame)
    context.mockReturnValue(false)
    world.render(frame)
    expect(world.isHealthy).toBe(false)
    renderer.domElement.dispatchEvent(new Event('webglcontextrestored'))
    vi.mocked(renderer.render).mockImplementationOnce(() => context.mockReturnValue(true))
    world.render(frame)
    expect(world.isHealthy).toBe(false)
    expect(lost).toHaveBeenCalledOnce()
    world.dispose()
  })

  test('fails closed on render exceptions and releases listeners and resources exactly once', () => {
    const { world, renderer, frame, lost } = create()
    const removed = vi.spyOn(renderer.domElement, 'removeEventListener')
    vi.mocked(renderer.render).mockImplementationOnce(() => {
      throw new Error('GPU unavailable')
    })
    expect(() => world.render(frame)).not.toThrow()
    expect(world.isHealthy).toBe(false)
    expect(lost).toHaveBeenCalledOnce()
    world.dispose()
    world.dispose()
    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect(renderer.domElement.remove).toHaveBeenCalledOnce()
    expect(removed.mock.calls.map(([type]) => type)).toEqual(['webglcontextlost', 'webglcontextrestored'])
    lost.mockClear()
    renderer.domElement.dispatchEvent(new Event('webglcontextlost'))
    renderer.domElement.dispatchEvent(new Event('webglcontextrestored'))
    world.render(frame)
    world.resize()
    expect(lost).not.toHaveBeenCalled()
    expect(world.isHealthy).toBe(false)
  })
})

test('clamps local pitch without flipping either camera and keeps its original direction', () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
  const world = new HorrorWorld(container)
  const camera = (world as unknown as { camera: Three.PerspectiveCamera }).camera
  const frame: WorldFrame = { role: 'human', human: HUMAN_START, haunter: HAUNTER_START, effect: null, time: 0 }
  for (const role of ['human', 'haunter'] as const) {
    const base = role === 'human' ? 0 : Math.atan2(-2.1, 3.5)
    expect(clampPitch(NaN, role)).toBe(0)
    expect(clampPitch(Infinity, role)).toBe(0)
    for (const pitch of [0, -0.3, 0.3, -100, 100, NaN]) {
      world.render({ ...frame, role, pitch })
      const direction = camera.getWorldDirection(new Vector3())
      const angle = Math.asin(direction.y)
      expect(angle).toBeCloseTo(base + clampPitch(pitch, role))
      expect(Math.abs(angle)).toBeLessThan(Math.PI / 2)
    }
    world.render({ ...frame, role, pitch: 0 })
    expect(camera.getWorldDirection(new Vector3()).y).toBeCloseTo(Math.sin(base))
  }
  world.dispose()
  vi.unstubAllGlobals()
})

describe('movePose', () => {
  test.each([-2 * Math.PI, -Math.PI, -0.1, -0, 0, 0.1, Math.PI, 2 * Math.PI])(
    'preserves ordinary yaw %s exactly',
    (yaw) => {
      expect(movePose({ ...HUMAN_START, yaw }, 0, 0, 0).yaw).toBe(yaw)
    }
  )

  test.each(
    [2 * Math.PI + Number.EPSILON * 4, 9999.5, 10000, 10000.5, 1e20, 1e100, Number.MAX_VALUE].flatMap((yaw) => [
      yaw,
      -yaw
    ])
  )('bounds accumulated yaw %s without changing heading or movement', (yaw) => {
    for (const [forward, strafe] of [
      [1, 0],
      [0, 1],
      [1, 1]
    ]) {
      const moved = movePose({ ...HUMAN_START, yaw }, forward, strafe, 0.01)
      const distance = 0.03 / Math.max(1, Math.hypot(forward, strafe))
      expect(Math.abs(moved.yaw)).toBeLessThanOrEqual(Math.PI)
      expect(Math.sin(moved.yaw)).toBeCloseTo(Math.sin(yaw), 14)
      expect(Math.cos(moved.yaw)).toBeCloseTo(Math.cos(yaw), 14)
      expect(moved.x).toBe(HUMAN_START.x + (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * distance)
      expect(moved.z).toBe(HUMAN_START.z + (-Math.cos(yaw) * forward + Math.sin(yaw) * strafe) * distance)
    }
  })

  test.each([
    {
      name: 'wall correction and accumulated yaw',
      pose: { x: 0, z: 5, yaw: 9 * Math.PI },
      input: [0, 0, 0.25],
      expected: { ...HUMAN_START, yaw: Math.atan2(Math.sin(9 * Math.PI), Math.cos(9 * Math.PI)) }
    },
    {
      name: 'invalid coordinates and yaw',
      pose: { x: NaN, z: Infinity, yaw: NaN },
      input: [Infinity, NaN, Infinity],
      expected: HUMAN_START
    },
    {
      name: 'finite coordinate retained after partial fallback',
      pose: { x: NaN, z: -0, yaw: Infinity },
      input: [NaN, Infinity, 0.25],
      expected: { x: HUMAN_START.x, z: 0, yaw: 0 }
    },
    {
      name: 'zero duration with clamped movement and accumulated yaw',
      pose: { ...HUMAN_START, yaw: Number.MAX_VALUE },
      input: [Number.MAX_VALUE, -Number.MAX_VALUE, -1],
      expected: {
        ...HUMAN_START,
        yaw: Math.atan2(Math.sin(Number.MAX_VALUE), Math.cos(Number.MAX_VALUE))
      }
    },
    {
      name: 'positive zero additions replace negative coordinates',
      pose: { x: -0, z: -0, yaw: 0 },
      input: [0, 0, 0.1],
      expected: { x: 0, z: 0, yaw: 0 }
    },
    {
      name: 'negative yaw zero retains negative z zero',
      pose: { x: -0, z: -0, yaw: -0 },
      input: [0, 0, 0.1],
      expected: { x: 0, z: -0, yaw: -0 }
    },
    {
      name: 'negative input zeros retain negative x zero',
      pose: { x: -0, z: -0, yaw: 0 },
      input: [-0, -0, 0.1],
      expected: { x: -0, z: 0, yaw: 0 }
    }
  ])('preserves stationary normalization: $name', ({ pose, input, expected }) => {
    const moved = movePose(pose, input[0], input[1], input[2])
    expect(moved.x).toBe(expected.x)
    expect(moved.z).toBe(expected.z)
    expect(moved.yaw).toBe(expected.yaw)
  })

  test('starts in valid space and moves in camera direction', () => {
    expect(movePose(HUMAN_START, 0, 0, 0)).toEqual(HUMAN_START)
    expect(movePose(HAUNTER_START, 0, 0, 0)).toEqual(HAUNTER_START)
    expect(movePose(HUMAN_START, 1, 0, 0.1).z).toBeLessThan(HUMAN_START.z)
    expect(movePose(HAUNTER_START, 1, 0, 0.1).z).toBeGreaterThan(HAUNTER_START.z)
    expect(movePose(HUMAN_START, 0, 1, 0.1).x).toBeGreaterThan(HUMAN_START.x)
  })

  test('blocks outside and inside walls, including large timesteps', () => {
    let outside: Pose = { x: -5, z: 5, yaw: Math.PI / 2 }
    let inside: Pose = { x: -2, z: 5, yaw: Math.PI / 2 }
    for (let step = 0; step < 100; step++) {
      outside = movePose(outside, -1, 0, 10)
      inside = movePose(inside, 1, 0, 10)
    }
    expect(outside.x).toBeGreaterThanOrEqual(-8.5)
    expect(outside.x).toBeLessThan(-8)
    expect(inside.x).toBeLessThanOrEqual(-0.43)
    expect(inside.x).toBeGreaterThan(-0.6)
  })

  test('allows doorways and slides along walls', () => {
    let through: Pose = { x: -1, z: 0, yaw: Math.PI / 2 }
    for (let step = 0; step < 8; step++) through = movePose(through, 1, 0, 0.1)
    expect(through.x).toBeGreaterThan(0.5)
    let slide: Pose = { x: -0.5, z: 5, yaw: 0 }
    for (let step = 0; step < 5; step++) slide = movePose(slide, 1, 1, 0.1)
    expect(slide.x).toBeLessThanOrEqual(-0.43)
    expect(slide.z).toBeLessThan(4.5)
  })

  test('normalizes diagonal input and contains invalid numbers', () => {
    const straight = movePose(HUMAN_START, 1, 0, 0.2)
    const diagonal = movePose(HUMAN_START, 1, 1, 0.2)
    expect(Math.hypot(diagonal.x - HUMAN_START.x, diagonal.z - HUMAN_START.z)).toBeCloseTo(HUMAN_START.z - straight.z)
    const result = movePose({ x: NaN, z: Infinity, yaw: NaN }, Infinity, NaN, Infinity)
    expect(result).toEqual(HUMAN_START)
    expect(movePose(HUMAN_START, 1, 0, -1)).toEqual(HUMAN_START)
    expect(movePose({ x: 999, z: 999, yaw: 0 }, 0, 0, 0)).toEqual(HUMAN_START)
  })
})

describe('HorrorWorld', () => {
  test('matches footstep surfaces to the rendered tatami instances', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const meshes = (world as unknown as { staticMeshes: Three.InstancedMesh[] }).staticMeshes
    const tatami = meshes.find((mesh) => (mesh.material as Three.MeshStandardMaterial).color.getHex() === 0x858562)!
    const matrix = new Matrix4()
    const bounds: Three.Box3[] = []
    for (let index = 0; index < tatami.count; index++) {
      tatami.getMatrixAt(index, matrix)
      bounds.push(new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)).applyMatrix4(matrix))
    }
    const differences: { x: number; z: number }[] = []
    const margin = 0.0001
    for (let column = 0; column < 99; column++) {
      for (let row = 0; row < 95; row++) {
        const x = -8.487 + column * 0.173
        const z = -8.461 + row * 0.179
        const inside = bounds.some(
          (bound) =>
            x > bound.min.x + margin && x < bound.max.x - margin && z > bound.min.z + margin && z < bound.max.z - margin
        )
        const outside = bounds.every(
          (bound) =>
            x < bound.min.x - margin || x > bound.max.x + margin || z < bound.min.z - margin || z > bound.max.z + margin
        )
        if ((inside && footstepSurface({ x, z }) !== 'tatami') || (outside && footstepSurface({ x, z }) !== 'wood'))
          differences.push({ x, z })
      }
    }
    expect(differences).toEqual([])
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('uses deterministic rectangular tatami and keeps architecture within a fixed instance budget', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const worlds = [new HorrorWorld(container), new HorrorWorld(container)]
    const internals = worlds.map(
      (world) =>
        world as unknown as {
          staticMeshes: Three.InstancedMesh[]
          textures: Set<Three.DataTexture>
        }
    )
    const meshes = internals[0].staticMeshes
    expect(meshes.reduce((count, mesh) => count + mesh.count, 0)).toBeLessThanOrEqual(482)
    const tatami = meshes.find((mesh) => (mesh.material as Three.MeshStandardMaterial).color.getHex() === 0x858562)!
    expect(tatami.count).toBe(96)
    const matrix = new Matrix4()
    let turned = 0
    const rooms = [0, 0, 0, 0]
    for (let index = 0; index < tatami.count; index++) {
      tatami.getMatrixAt(index, matrix)
      const width = new Vector3().setFromMatrixColumn(matrix, 0).length()
      const depth = new Vector3().setFromMatrixColumn(matrix, 2).length()
      expect(width / depth).toBeCloseTo(2.13 / 1.075)
      expect(matrix.elements[13]).toBeCloseTo(0.01)
      if (Math.abs(matrix.elements[2]) > 1) turned++
      rooms[(matrix.elements[12] > 0 ? 2 : 0) + (matrix.elements[14] > 0 ? 1 : 0)]++
    }
    expect(turned).toBe(48)
    expect(rooms).toEqual([24, 24, 24, 24])
    expect(internals[0].textures.size).toBe(3)
    const wear = internals.map(({ staticMeshes }) =>
      Array.from(
        staticMeshes.find((mesh) => mesh.geometry.hasAttribute('paperWear'))!.geometry.getAttribute('paperWear').array
      )
    )
    expect(wear[0]).toEqual(wear[1])
    expect(meshes.map((mesh) => Array.from(mesh.instanceMatrix.array))).toEqual(
      internals[1].staticMeshes.map((mesh) => Array.from(mesh.instanceMatrix.array))
    )
    expect([...internals[0].textures].map((texture) => Array.from(texture.image.data))).toEqual(
      [...internals[1].textures].map((texture) => Array.from(texture.image.data))
    )
    for (const world of worlds) world.dispose()
    vi.unstubAllGlobals()
  })

  test('limits deterministic static paper wear to three bodies without adding materials, textures or batches', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as {
      staticMeshes: Three.InstancedMesh[]
      boxGeometry: Three.BufferGeometry
      geometries: Set<Three.BufferGeometry>
      materials: Set<Three.Material>
      textures: Set<Three.DataTexture>
      renderer: Three.WebGLRenderer
      mirrorChild: Three.Mesh<Three.BufferGeometry, Three.MeshStandardMaterial>
    }
    try {
      const textures = [...internals.textures]
      expect(textures).toHaveLength(3)
      const fingerprints = textures.map((texture) => createHash('sha256').update(texture.image.data).digest('hex'))
      expect(fingerprints).toEqual([
        '82dbc12b3428837709d081ace14d5aa3ae7c062af5fc398c78fad5b4a4e8f49d',
        '933f80e018ba54f137dce0cffcc2fbaabefedcab4654f2453c07f6db8948e101',
        '9d84e64b61b1bc74acca1b636a32764aa0bf186bbd3cbcb4fb847d1f3e34e96c'
      ])
      for (const texture of textures) {
        expect(texture.image.width).toBe(128)
        expect(texture.image.height).toBe(128)
        expect(texture.generateMipmaps).toBe(true)
        expect(texture.flipY).toBe(false)
      }
      const legacyMaterials = [...internals.materials].filter((material) => material !== internals.mirrorChild.material)
      const materialProperties = legacyMaterials.map((material) => {
        const properties = material.toJSON() as unknown as Record<string, unknown>
        for (const key of ['metadata', 'uuid', 'textures', 'images']) delete properties[key]
        const map = (material as Three.MeshStandardMaterial).map
        if (map) properties.map = textures.indexOf(map as Three.DataTexture)
        return properties
      })
      expect(legacyMaterials).toHaveLength(46)
      expect(internals.materials.size).toBe(47)
      expect(internals.materials.has(internals.mirrorChild.material)).toBe(true)
      expect(createHash('sha256').update(JSON.stringify(materialProperties)).digest('hex')).toBe(
        '0f9b4b38cdf1079e03740e55e001f3cfa755cf358e4f23c73b884421cf68e7ce'
      )
      const paperMeshes = internals.staticMeshes.filter(
        (mesh) =>
          (mesh.material as Three.MeshStandardMaterial).map === textures[1] &&
          (mesh.material as Three.MeshStandardMaterial).color.getHex() === 0xb8ab8c
      )
      expect(paperMeshes).toHaveLength(1)
      const mesh = paperMeshes[0]
      const material = mesh.material as Three.MeshStandardMaterial
      expect(material.color.getHex()).toBe(0xb8ab8c)
      expect(material.opacity).toBe(1)
      expect(material.transparent).toBe(false)
      expect(mesh.geometry).not.toBe(internals.boxGeometry)
      expect(internals.geometries.has(mesh.geometry)).toBe(true)
      for (const [name, attribute] of Object.entries(internals.boxGeometry.attributes)) {
        expect(Array.from(mesh.geometry.getAttribute(name).array)).toEqual(Array.from(attribute.array))
      }
      expect(Array.from(mesh.geometry.index!.array)).toEqual(Array.from(internals.boxGeometry.index!.array))
      const wear = mesh.geometry.getAttribute('paperWear') as Three.InstancedBufferAttribute
      expect(wear.isInstancedBufferAttribute).toBe(true)
      expect(wear.count).toBe(mesh.count)
      expect(wear.meshPerAttribute).toBe(1)
      const matrix = new Matrix4()
      const targets: number[][] = []
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix)
        const [positionX, positionY, positionZ] = matrix.elements.slice(12, 15)
        const shoji =
          Math.abs(positionZ + 3) < 1e-5 && (Math.abs(positionX + 8) < 1e-5 || Math.abs(positionX + 1.5) < 1e-5)
        const fusuma = Math.abs(positionX - 8.74) < 1e-5 && Math.abs(positionZ - 6.1) < 1e-5
        expect(wear.getX(index)).toBe(shoji ? 1 : fusuma ? 2 : 0)
        if (wear.getX(index)) targets.push([positionX, positionY, positionZ])
      }
      expect(targets).toHaveLength(3)
      for (const other of internals.materials) {
        if (other !== material) expect(other.onBeforeCompile).toBe(Material.prototype.onBeforeCompile)
      }
      for (const other of internals.staticMeshes) {
        if (other !== mesh) expect(other.geometry).toBe(internals.boxGeometry)
      }
      const shader = { ...ShaderLib.standard, uniforms: {} }
      material.onBeforeCompile(shader, internals.renderer)
      expect(shader.vertexShader).toContain('attribute float paperWear;')
      expect(shader.vertexShader).toContain('vPaperWear = vec3(uv, paperWear);')
      expect(shader.fragmentShader).toContain('if (vPaperWear.z > 0.5)')
      expect(shader.fragmentShader).toContain('#include <map_fragment>')
      expect(shader.fragmentShader).toContain('diffuseColor.rgb *=')
      expect(shader.uniforms).toEqual({})
      expect(material.customProgramCacheKey()).toBe('static-paper-wear-v1')
      expect(internals.staticMeshes).toHaveLength(11)
      expect(internals.staticMeshes.reduce((sum, batch) => sum + batch.count, 0)).toBe(458)
      const materials = [...internals.materials]
      const wearValues = Array.from(wear.array)
      for (const time of [0, 1, 5]) {
        world.render({ role: 'human', human: HUMAN_START, haunter: HAUNTER_START, effect: null, time })
      }
      expect([...internals.textures]).toEqual(textures)
      expect(textures.map((texture) => createHash('sha256').update(texture.image.data).digest('hex'))).toEqual(
        fingerprints
      )
      expect([...internals.materials]).toEqual(materials)
      expect(Array.from(wear.array)).toEqual(wearValues)
    } finally {
      world.dispose()
      vi.unstubAllGlobals()
    }
  })

  test('keeps both camera heights clear through every doorway and toward every clue', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as { scene: Three.Scene; staticMeshes: Three.InstancedMesh[] }
    internals.scene.updateMatrixWorld(true)
    for (const height of [1.6, 3.1]) {
      for (const [x, z, dx, dz] of [
        [-5, -2, 0, -1],
        [5, 2, 0, 1],
        [-1, 0, 1, 0]
      ]) {
        const ray = new Raycaster(new Vector3(x, height, z), new Vector3(dx, 0, dz), 0, 2)
        expect(ray.intersectObjects(internals.staticMeshes)).toHaveLength(0)
      }
      for (const step of RITUAL_STEPS) {
        const origin = new Vector3(step.x, height, step.z + 0.95)
        const target = new Vector3(step.x, 0.95, step.z)
        const ray = new Raycaster(origin, target.clone().sub(origin).normalize(), 0, origin.distanceTo(target) - 0.08)
        expect(ray.intersectObjects(internals.staticMeshes)).toHaveLength(0)
      }
    }
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('keeps walkable body and camera positions clear apart from the existing hanging lanterns', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const meshes = (world as unknown as { staticMeshes: Three.InstancedMesh[] }).staticMeshes
    const bounds: Three.Box3[] = []
    const matrix = new Matrix4()
    for (const mesh of meshes) {
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix)
        bounds.push(new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)).applyMatrix4(matrix))
      }
    }
    for (let column = -21; column <= 21; column++) {
      for (let row = -21; row <= 21; row++) {
        const pose = { x: column * 0.4, z: row * 0.4, yaw: 0 }
        const moved = movePose(pose, 0, 0, 0)
        if (moved.x !== pose.x || moved.z !== pose.z) continue
        for (const height of [0.28, 1.6, 3.1]) {
          if (
            height === 3.1 &&
            [
              [-6, 5.5],
              [5.8, -5.5],
              [5.8, 5.5]
            ].some(([x, z]) => Math.abs(pose.x - x) <= 0.26 && Math.abs(pose.z - z) <= 0.26)
          )
            continue
          const point = new Vector3(pose.x, height, pose.z)
          expect(
            bounds.some((bound) => bound.containsPoint(point)),
            JSON.stringify({ ...pose, height })
          ).toBe(false)
        }
      }
    }
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('batches static architecture and disposes instance buffers with shared resources', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as {
      staticBoxes: Map<Three.Material, Three.Matrix4[]>
      staticMeshes: Three.InstancedMesh[]
      boxGeometry: Three.BufferGeometry
      geometries: Set<Three.BufferGeometry>
      materials: Set<Three.Material>
    }
    expect(internals.staticBoxes.size).toBe(0)
    expect(internals.staticMeshes.length).toBeLessThan(20)
    expect(internals.staticMeshes.reduce((sum, mesh) => sum + mesh.count, 0)).toBeGreaterThan(300)
    for (const mesh of internals.staticMeshes) {
      expect(internals.geometries.has(mesh.geometry)).toBe(true)
      expect(internals.materials.has(mesh.material as Three.Material)).toBe(true)
      expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(true)
      expect(mesh.boundingSphere).not.toBeNull()
    }
    expect(internals.geometries.has(internals.boxGeometry)).toBe(true)
    const disposals = internals.staticMeshes.map((mesh) => vi.spyOn(mesh, 'dispose'))
    const geometryDisposal = vi.spyOn(internals.boxGeometry, 'dispose')
    world.dispose()
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce()
    expect(geometryDisposal).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  test('places distinct non-colliding clue geometry at the ritual coordinates and disposes it', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as {
      clues: { group: Three.Group; materials: Three.MeshStandardMaterial[] }[]
      geometries: Set<Three.BufferGeometry>
      materials: Set<Three.Material>
    }
    expect(internals.clues).toHaveLength(RITUAL_STEPS.length)
    const geometries = new Set<Three.BufferGeometry>()
    for (const [index, clue] of internals.clues.entries()) {
      const step = RITUAL_STEPS[index]
      expect(clue.group.name).toBe(`ritual-${step.id}`)
      expect([clue.group.position.x, clue.group.position.z]).toEqual([step.x, step.z])
      expect(clue.group.children[0].children.length).toBeGreaterThanOrEqual(5)
      const bounds = new Box3().setFromObject(clue.group)
      expect(bounds.min.x).toBeGreaterThan(step.x - 0.5)
      expect(bounds.max.x).toBeLessThan(step.x + 0.5)
      expect(bounds.min.z).toBeGreaterThan(step.z - 0.5)
      expect(bounds.max.z).toBeLessThan(step.z + 0.5)
      expect(bounds.min.y).toBeGreaterThan(0.04)
      expect(bounds.max.y).toBeLessThan(1.4)
      for (const dx of [-0.5, 0, 0.5])
        for (const dz of [-0.5, 0, 0.5]) {
          const pose = { x: step.x + dx, z: step.z + dz, yaw: 0 }
          expect(movePose(pose, 0, 0, 0)).toEqual(pose)
        }
      clue.group.traverse((object) => {
        if ('geometry' in object) {
          const mesh = object as Three.Mesh
          expect(internals.geometries.has(mesh.geometry)).toBe(true)
          geometries.add(mesh.geometry)
        }
      })
      for (const material of clue.materials) expect(internals.materials.has(material)).toBe(true)
    }
    expect(geometries.size).toBeGreaterThanOrEqual(4)
    const disposals = [...geometries, ...internals.clues.flatMap((clue) => clue.materials)].map((resource) =>
      vi.spyOn(resource, 'dispose')
    )
    world.dispose()
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  test('keeps clues visible below the horizon at interaction distance', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as { camera: Three.PerspectiveCamera; clues: { group: Three.Group }[] }
    for (const [index, clue] of internals.clues.entries()) {
      const step = RITUAL_STEPS[index]
      world.render({
        role: 'human',
        human: { x: step.x, z: step.z + 0.95, yaw: 0 },
        haunter: HAUNTER_START,
        effect: null,
        time: 0,
        ritual: { completed: index, elapsedMs: step.availableMs }
      })
      internals.camera.updateMatrixWorld()
      const bounds = new Box3().setFromObject(clue.group)
      const top = new Vector3((bounds.min.x + bounds.max.x) / 2, bounds.max.y, bounds.max.z).project(internals.camera)
      expect(top.y).toBeGreaterThan(-1)
      expect(top.y).toBeLessThan(0)
    }
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('shows only valid ritual progress and updates both roles without blinking', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const clues = (world as unknown as { clues: { group: Three.Group; materials: Three.MeshStandardMaterial[] }[] })
      .clues
    const frame: WorldFrame = { role: 'human', human: HUMAN_START, haunter: HAUNTER_START, effect: null, time: 0 }
    world.render(frame)
    expect(clues.every((clue) => !clue.group.visible)).toBe(true)
    for (const role of ['human', 'haunter'] as const) {
      world.render({ ...frame, role, ritual: { completed: 1, elapsedMs: RITUAL_STEPS[1].availableMs - 1 } })
      expect(clues.every((clue) => clue.group.visible)).toBe(true)
      expect(clues.map((clue) => clue.materials[0].opacity)).toEqual([0.35, 0.7, 0.7, 0.7])
      world.render({ ...frame, role, ritual: { completed: 1, elapsedMs: RITUAL_STEPS[1].availableMs } })
      expect(clues.map((clue) => clue.materials[0].opacity)).toEqual([0.35, 1, 0.7, 0.7])
      expect(clues[1].materials[0].emissiveIntensity).toBeGreaterThan(clues[2].materials[0].emissiveIntensity)
      world.render({ ...frame, role, time: 100, ritual: { completed: 1, elapsedMs: RITUAL_STEPS[1].availableMs } })
      expect(clues[1].materials[0].opacity).toBe(1)
      world.render({ ...frame, role, ritual: { completed: 4, elapsedMs: 720_000 } })
      expect(clues.every((clue) => clue.materials[0].opacity === 0.35)).toBe(true)
    }
    for (const ritual of [
      null,
      { completed: -1, elapsedMs: 0 },
      { completed: 5, elapsedMs: 0 },
      { completed: 0.5, elapsedMs: 0 },
      { completed: NaN, elapsedMs: 0 },
      { completed: 0, elapsedMs: -1 },
      { completed: 0, elapsedMs: Infinity }
    ]) {
      world.render({ ...frame, ritual })
      expect(clues.every((clue) => !clue.group.visible)).toBe(true)
    }
    world.render({ ...frame, ritual: { completed: 0, elapsedMs: 0 } })
    expect(clues[0].materials[0].opacity).toBe(1)
    world.render(frame)
    expect(clues.every((clue) => !clue.group.visible)).toBe(true)
    world.dispose()
    vi.unstubAllGlobals()
  })

  describe('persistent mirror child', () => {
    let world: HorrorWorld
    let internals: {
      scene: Three.Scene
      camera: Three.PerspectiveCamera
      human: Three.Group
      haunter: Three.Group
      apparition: Three.Group
      aim: Three.Mesh
      ambient: Three.AmbientLight
      lantern: Three.PointLight
      fill: Three.HemisphereLight
      roomLights: Three.PointLight[]
      clues: { group: Three.Group; materials: Three.MeshStandardMaterial[] }[]
      mirrorChild: Three.Mesh<Three.BufferGeometry, Three.MeshStandardMaterial>
      geometries: Set<Three.BufferGeometry>
      materials: Set<Three.Material>
      textures: Set<Three.Texture>
      renderer: Three.WebGLRenderer
    }
    const frame: WorldFrame = { role: 'human', human: HUMAN_START, haunter: HAUNTER_START, effect: null, time: 0 }
    const acquired = { completed: 3, elapsedMs: RITUAL_STEPS[2].availableMs }

    beforeEach(() => {
      vi.stubGlobal('window', { devicePixelRatio: 1 })
      const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
      world = new HorrorWorld(container)
      internals = world as unknown as typeof internals
    })
    afterEach(() => {
      const disposals = [...internals.geometries, ...internals.materials, ...internals.textures].map((resource) =>
        vi.spyOn(resource, 'dispose')
      )
      world.dispose()
      for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce()
      vi.unstubAllGlobals()
    })

    test.each(['human', 'haunter'] as const)('hides invalid or uncollected progress immediately for %s', (role) => {
      const child = internals.mirrorChild
      expect(child.visible).toBe(false)
      expect(child.material.opacity).toBe(0)
      const hidden: unknown[] = [
        undefined,
        null,
        {},
        [],
        false,
        3,
        { completed: '3', elapsedMs: acquired.elapsedMs },
        ...[-Infinity, -1, 0.5, 2.5, 3.5, 5, NaN, Infinity].map((completed) => ({ ...acquired, completed })),
        ...[undefined, '540000', -Infinity, -1, NaN, Infinity].map((elapsedMs) => ({ ...acquired, elapsedMs })),
        { completed: 0, elapsedMs: 0 },
        { completed: 1, elapsedMs: acquired.elapsedMs },
        { completed: 2, elapsedMs: 899_999 },
        { completed: 3, elapsedMs: 540 },
        { completed: 3, elapsedMs: acquired.elapsedMs - 1 },
        { completed: 4, elapsedMs: RITUAL_STEPS[3].availableMs - 1 }
      ]
      for (const ritual of hidden) {
        world.render({ ...frame, role, ritual: acquired })
        expect(child.visible).toBe(true)
        world.render({ ...frame, role, ritual: ritual as WorldFrame['ritual'] })
        expect(child.visible).toBe(false)
        expect(child.material.opacity).toBe(0)
      }
    })

    test.each(['human', 'haunter'] as const)(
      'persists through clocks, views, later clues and round resets for %s',
      (role) => {
        const child = internals.mirrorChild
        for (const ritual of [acquired, { completed: 3, elapsedMs: 899_999 }, { completed: 4, elapsedMs: 720_000 }]) {
          for (const time of [0, 540, 540_000, 1_700_000_000, 1_700_000_000_000, NaN, Infinity]) {
            world.render({ ...frame, role, ritual, time })
            expect(child.visible).toBe(true)
            expect(child.material.opacity).toBe(0.28)
            expect(internals.clues[2].group.visible).toBe(true)
            expect(internals.clues[2].materials.every((material) => material.opacity === 0.35)).toBe(true)
          }
        }
        for (const yaw of [Math.PI, 0]) {
          world.render({ ...frame, role, human: { x: 5, z: -4.25, yaw }, pitch: -0.6, ritual: acquired, time: 899 })
          expect(child.visible).toBe(true)
          expect(child.material.opacity).toBe(0.28)
        }
        for (const ritual of [null, { completed: 0, elapsedMs: 0 }, { completed: 2, elapsedMs: acquired.elapsedMs }]) {
          world.render({ ...frame, role, ritual })
          expect(child.visible).toBe(false)
          expect(child.material.opacity).toBe(0)
        }
        world.render({ ...frame, role, ritual: acquired })
        expect(child.visible).toBe(true)
        world.render({ ...frame, role, ritual: { completed: 0, elapsedMs: 0 } })
        expect(child.visible).toBe(false)
      }
    )

    test('fits every front-facing triangle inside the actual mirror cap with one lit material', () => {
      const child = internals.mirrorChild
      const display = internals.clues[2].group.children[0]
      const mirror = display.children.find(
        (object) => 'geometry' in object && (object as Three.Mesh).geometry.type === 'CylinderGeometry'
      ) as Three.Mesh
      expect(child.parent).toBe(display)
      expect(child.name).toBe('mirror-child')
      expect(display.getObjectsByProperty('name', 'mirror-child')).toEqual([child])
      expect(child.geometry.groups).toEqual([])
      expect(child.geometry.index).toBeNull()
      const positions = child.geometry.getAttribute('position')
      const normals = child.geometry.getAttribute('normal')
      const colors = child.geometry.getAttribute('color')
      expect(positions.count).toBe(19 * 3)
      expect(colors.count).toBe(positions.count)
      expect(
        new Set(
          Array.from({ length: colors.count }, (_, index) =>
            [colors.getX(index), colors.getY(index), colors.getZ(index)].join(',')
          )
        ).size
      ).toBe(3)
      internals.scene.updateMatrixWorld(true)
      for (let index = 0; index < positions.count; index++) {
        const point = new Vector3().fromBufferAttribute(positions, index)
        expect(point.z).toBe(0)
        expect(normals.getZ(index)).toBeCloseTo(1)
        const onCap = mirror.worldToLocal(child.localToWorld(point))
        expect(onCap.y).toBeCloseTo(0.5, 10)
        expect(onCap.x ** 2 + onCap.z ** 2).toBeLessThanOrEqual(0.64)
      }
      for (let index = 0; index < positions.count; index += 3) {
        const first = new Vector3().fromBufferAttribute(positions, index)
        const second = new Vector3().fromBufferAttribute(positions, index + 1)
        const third = new Vector3().fromBufferAttribute(positions, index + 2)
        expect(second.sub(first).cross(third.sub(first)).z).toBeGreaterThan(0)
      }
      const { material } = child
      expect(Array.isArray(material)).toBe(false)
      expect(material.type).toBe('MeshStandardMaterial')
      expect(material.vertexColors).toBe(true)
      expect(material.transparent).toBe(true)
      expect(material.forceSinglePass).toBe(true)
      expect(material.side).toBe(FrontSide)
      expect(material.depthTest).toBe(true)
      expect(material.depthWrite).toBe(false)
      expect(material.fog).toBe(true)
      expect(material.map).toBeNull()
      expect(material.emissive.getHex()).toBe(0)
      expect(child.castShadow).toBe(false)
      expect(child.receiveShadow).toBe(false)
      expect(child.renderOrder).toBeGreaterThan(mirror.renderOrder)
      expect(child.renderOrder).toBeLessThan(internals.apparition.getObjectByName('ghost-face')!.renderOrder)
      for (const [side, hits] of [
        [1, true],
        [-1, false]
      ] as const) {
        const origin = child.localToWorld(new Vector3(0.025, 0.828, side * 0.3))
        const ray = new Raycaster(origin, new Vector3(0, 0, -side))
        expect(ray.intersectObject(child).length > 0).toBe(hits)
      }
    })

    test('keeps the bob, robe and narrow eyes in the original planar vertex budget', () => {
      const { geometry } = internals.mirrorChild
      const positions = geometry.getAttribute('position')
      const colors = geometry.getAttribute('color')
      const features = [
        { start: 0, count: 15, corners: 7, color: 0x26302d },
        { start: 15, count: 18, corners: 8, color: 0x1d2524 },
        { start: 33, count: 12, corners: 6, color: 0xb5b7a1 },
        { start: 45, count: 6, corners: 4, color: 0x1d2524 },
        { start: 51, count: 6, corners: 4, color: 0x1d2524 }
      ]
      for (const feature of features) {
        const points = Array.from({ length: feature.count }, (_, index) => {
          const vertex = feature.start + index
          expect(new Color().fromBufferAttribute(colors, vertex).getHex()).toBe(feature.color)
          return new Vector3().fromBufferAttribute(positions, vertex)
        })
        expect(new Set(points.map((point) => point.toArray().join(','))).size).toBe(feature.corners)
        if (feature.start >= 45) {
          const bounds = new Box3().setFromPoints(points).getSize(new Vector3())
          expect(bounds.x).toBeGreaterThan(bounds.y * 2)
          expect(Math.max(...points.map((point) => point.y))).toBeLessThan(0.836)
        }
      }
      const bytes = Object.values(geometry.attributes).reduce(
        (total, attribute) => total + attribute.array.byteLength,
        0
      )
      expect(bytes).toBe(2052)
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
    })

    test.each(['human', 'haunter'] as const)(
      'can project the whole child after looking back toward the mirror for %s',
      (role) => {
        const child = internals.mirrorChild
        const viewer = { x: 5, z: -4.05, yaw: 0 }
        const base = role === 'human' ? 0 : Math.atan2(-2.1, 3.5)
        const height = role === 'human' ? 1.6 : 3.1
        world.render({
          ...frame,
          role,
          human: role === 'human' ? viewer : HUMAN_START,
          haunter: role === 'haunter' ? viewer : { x: -5, z: -5, yaw: 0 },
          pitch: Math.atan2(1.03 - height, 0.95) - base,
          ritual: { completed: 3, elapsedMs: 899_999 },
          time: 899
        })
        internals.scene.updateMatrixWorld(true)
        const positions = child.geometry.getAttribute('position')
        for (let index = 0; index < positions.count; index++) {
          const projected = child
            .localToWorld(new Vector3().fromBufferAttribute(positions, index))
            .project(internals.camera)
          expect(Math.abs(projected.x)).toBeLessThan(1)
          expect(Math.abs(projected.y)).toBeLessThan(1)
          expect(Math.abs(projected.z)).toBeLessThan(1)
        }
        world.render({ ...frame, human: { x: 5, z: -4.25, yaw: 0 }, pitch: 0, ritual: acquired })
        internals.scene.updateMatrixWorld(true)
        const center = child.localToWorld(new Vector3(0, 0.76, 0)).project(internals.camera)
        expect(center.y).toBeLessThan(-1)
        expect(child.visible).toBe(true)
      }
    )

    test('reuses one managed mesh, geometry and material deterministically across worlds and repeated frames', () => {
      const child = internals.mirrorChild
      const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
      const other = new HorrorWorld(container)
      const otherChild = (other as unknown as typeof internals).mirrorChild
      const disposals = [otherChild.geometry, otherChild.material].map((resource) => vi.spyOn(resource, 'dispose'))
      try {
        for (const attribute of ['position', 'color', 'normal']) {
          expect(Array.from(child.geometry.getAttribute(attribute).array)).toEqual(
            Array.from(otherChild.geometry.getAttribute(attribute).array)
          )
        }
        expect(otherChild.geometry).not.toBe(child.geometry)
        expect(otherChild.material).not.toBe(child.material)
        const resources = [internals.geometries, internals.materials, internals.textures].map((set) => [...set])
        expect(internals.materials.size).toBe(47)
        expect(internals.textures.size).toBe(3)
        expect(internals.geometries.has(child.geometry)).toBe(true)
        expect(internals.materials.has(child.material)).toBe(true)
        expect(internals.clues.flatMap((clue) => clue.materials)).not.toContain(child.material)
        const objects: Three.Object3D[] = []
        internals.scene.traverse((object) => objects.push(object))
        const legacyGeometries = new Set(
          objects
            .filter((object) => object !== child && 'geometry' in object)
            .map((object) => (object as Three.Mesh).geometry)
        )
        expect([...internals.geometries].filter((geometry) => !legacyGeometries.has(geometry))).toEqual([
          child.geometry
        ])
        expect(
          objects.filter((object) => 'geometry' in object && (object as Three.Mesh).geometry === child.geometry)
        ).toEqual([child])
        for (let index = 0; index < 80; index++) {
          const current: WorldFrame = {
            ...frame,
            role: index % 2 ? 'human' : 'haunter',
            time: index / 10,
            ritual: index % 4 ? acquired : null
          }
          world.render(current)
          other.render(current)
          expect(child.visible).toBe(otherChild.visible)
          expect(child.material.opacity).toBe(otherChild.material.opacity)
          expect(child.position.toArray()).toEqual(otherChild.position.toArray())
          expect(child.quaternion.toArray()).toEqual(otherChild.quaternion.toArray())
        }
        expect(internals.renderer.render).toHaveBeenCalledTimes(80)
        expect(internals.geometries.has(child.geometry)).toBe(true)
        expect([internals.geometries, internals.materials, internals.textures].map((set) => [...set])).toEqual(
          resources
        )
        const after: Three.Object3D[] = []
        internals.scene.traverse((object) => after.push(object))
        expect(after).toEqual(objects)
      } finally {
        other.dispose()
        for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce()
      }
    })

    test.each(['human', 'haunter'] as const)(
      'does not change avatars, camera, lighting or other effects for %s',
      (role) => {
        const state = () => {
          const objects: Three.Object3D[] = []
          for (const root of [internals.camera, internals.human, internals.haunter, internals.aim]) {
            root.traverse((object) => objects.push(object))
          }
          return {
            objects: objects.map((object) => [
              object.visible,
              ...object.position.toArray(),
              ...object.quaternion.toArray(),
              ...object.scale.toArray()
            ]),
            opacity: objects
              .filter((object) => 'material' in object)
              .map((object) => ((object as Three.Mesh).material as Three.Material).opacity),
            lighting: [internals.ambient, internals.lantern, internals.fill, ...internals.roomLights].map(
              (light) => light.intensity
            )
          }
        }
        for (const kind of [null, 'apparition', 'blackout', 'rattle'] as const) {
          for (const [startedAt, unit] of [
            [10, 1],
            [1_700_000_000_000, 1000]
          ]) {
            for (const age of [0, 1.75, 3.5]) {
              const current: WorldFrame = {
                ...frame,
                role,
                effect: kind ? { kind, startedAt, id: 2 } : null,
                time: startedAt + age * unit
              }
              world.render(current)
              const without = state()
              world.render({ ...current, ritual: acquired })
              expect(internals.mirrorChild.visible).toBe(true)
              expect(internals.mirrorChild.material.opacity).toBe(0.28)
              expect(state()).toEqual(without)
              expect(internals.human.visible).toBe(role !== 'human')
              expect(internals.haunter.visible).toBe(role === 'human' && kind === 'apparition' && age >= 0 && age < 3.5)
            }
          }
        }
      }
    )
  })

  test('keeps the apparition in front of either camera even against a wall', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as { apparition: Three.Group; haunter: Three.Group; camera: Three.Camera }
    const startedAt = 1_700_000_000_000
    const frame: WorldFrame = {
      role: 'human',
      human: { x: -0.44, z: 5, yaw: Math.PI / 2 },
      haunter: HAUNTER_START,
      effect: { kind: 'apparition', startedAt },
      time: startedAt + 1750
    }
    for (const [role, pitch] of (['human', 'haunter'] as const).flatMap((role) =>
      [-100, 0, 100].map((pitch) => [role, pitch] as const)
    )) {
      world.render({ ...frame, role, pitch })
      expect(internals.haunter.visible).toBe(role === 'human')
      expect(internals.apparition.visible).toBe(true)
      expect(internals.apparition.parent).toBe(internals.camera)
      expect(internals.apparition.position.z).toBeLessThan(0)
      internals.apparition.traverse((object) => {
        if ('material' in object) {
          const material = (object as Three.Mesh).material as Three.Material
          expect(material.depthTest).toBe(false)
          expect(object.renderOrder).toBeGreaterThan(0)
        }
      })
    }
    world.render({ ...frame, time: startedAt + 3500 })
    expect(internals.apparition.visible).toBe(false)
    world.render({ ...frame, time: NaN })
    expect(internals.apparition.visible).toBe(false)
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('fades the apparition in and out without changing its size or allocating materials', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as {
      apparition: Three.Group
      apparitionMaterials: { material: Three.MeshStandardMaterial; opacity: number }[]
      materials: Set<Three.Material>
    }
    const count = internals.materials.size
    for (const [startedAt, unit] of [
      [10, 1],
      [1_700_000_000_000, 1000]
    ]) {
      for (const role of ['human', 'haunter'] as const) {
        const frame: WorldFrame = {
          role,
          human: HUMAN_START,
          haunter: HAUNTER_START,
          effect: { kind: 'apparition', startedAt },
          time: startedAt
        }
        const values = [0, 0.4, 0.8, 2.7, 3.1, 3.5].map((elapsed) => {
          world.render({ ...frame, time: startedAt + elapsed * unit })
          return internals.apparitionMaterials[0].material.opacity
        })
        const fullOpacity = internals.apparitionMaterials[0].opacity
        expect(values[0]).toBe(0)
        expect(values[1]).toBeCloseTo(fullOpacity / 2)
        expect(values[2]).toBeCloseTo(fullOpacity)
        expect(values[3]).toBeCloseTo(fullOpacity)
        expect(values[4]).toBeCloseTo(fullOpacity / 2)
        expect(internals.apparition.visible).toBe(false)
        expect(internals.apparition.scale.x).toBeCloseTo(0.85)
      }
    }
    expect(internals.materials.size).toBe(count)
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('places each of three apparition events in a distinct lane, size and facing', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const apparition = (world as unknown as { apparition: Three.Group }).apparition
    const frame: WorldFrame = {
      role: 'human',
      human: HUMAN_START,
      haunter: HAUNTER_START,
      effect: null,
      time: 11.75
    }
    const placements = [1, 2, 3].map((id) => {
      world.render({ ...frame, effect: { kind: 'apparition', startedAt: 10, id } })
      return [apparition.position.x, apparition.position.z, apparition.scale.x, apparition.rotation.y]
    })
    expect(new Set(placements.map((placement) => JSON.stringify(placement))).size).toBe(3)
    expect(placements.map((placement) => placement[0])).toEqual([-0.7, 0.7, 0])
    for (const placement of placements) expect(placement.every(Number.isFinite)).toBe(true)
    world.dispose()
    vi.unstubAllGlobals()
  })

  describe('apparition motion', () => {
    let world: HorrorWorld
    let internals: {
      human: Three.Group
      haunter: Three.Group
      apparition: Three.Group
      aim: Three.Mesh
      camera: Three.PerspectiveCamera
      scene: Three.Scene
      ambient: Three.AmbientLight
      lantern: Three.PointLight
      fill: Three.HemisphereLight
      roomLights: Three.PointLight[]
      geometries: Set<Three.BufferGeometry>
      materials: Set<Three.Material>
      textures: Set<Three.Texture>
      staticMeshes: Three.InstancedMesh[]
      apparitionMaterials: { material: Three.MeshStandardMaterial; opacity: number }[]
    }
    const rest = [0, 0, -0.09, -0.16, -0.12, 0.22]
    const frame: WorldFrame = {
      role: 'human',
      human: HUMAN_START,
      haunter: HAUNTER_START,
      effect: { kind: 'apparition', startedAt: 10 },
      time: 10
    }
    const rotations = (apparition = internals.apparition) =>
      ['torso', 'head'].flatMap((name) => {
        const rotation = apparition.getObjectByName(name)!.rotation
        return [rotation.x, rotation.y, rotation.z]
      })
    const sample = (elapsed: number, role: WorldFrame['role'], startedAt = 10, unit = 1, id?: number) => {
      world.render({ ...frame, role, effect: { kind: 'apparition', startedAt, id }, time: startedAt + elapsed * unit })
      return rotations()
    }
    beforeEach(() => {
      vi.stubGlobal('window', { devicePixelRatio: 1 })
      const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
      world = new HorrorWorld(container)
      internals = world as unknown as typeof internals
    })
    afterEach(() => {
      world.dispose()
      vi.unstubAllGlobals()
    })

    test.each(['human', 'haunter'] as const)(
      'matches event-ID poses on independent worlds, clocks and frame orders for %s',
      (role) => {
        const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
        const peer = new HorrorWorld(container)
        const apparition = (peer as unknown as { apparition: Three.Group }).apparition
        try {
          const times = [0, 0.75, 1.5, 2, 2.5, 3.25, 3.5]
          for (const id of [1, 2, 3, 4, 5, 6, Number.MAX_SAFE_INTEGER]) {
            const expected = times.map((elapsed) => sample(elapsed, 'human', 10, 1, id))
            for (const [startedAt, unit] of [
              [0, 1],
              [900, 1],
              [1_700_000_000, 1],
              [1_700_000_000_000, 1000]
            ]) {
              for (const index of [4, 1, 6, 2, 0, 5, 3, 4]) {
                peer.render({
                  ...frame,
                  role,
                  effect: { kind: 'apparition', startedAt, id },
                  time: startedAt + times[index] * unit
                })
                expect(rotations(apparition)).toEqual(expected[index])
                expect(sample(times[index], role, startedAt, unit, id)).toEqual(expected[index])
              }
            }
          }
        } finally {
          peer.dispose()
        }
      }
    )

    test.each(['human', 'haunter'] as const)('keeps three bounded profiles and the legacy fallback for %s', (role) => {
      const profiles = [1, 2, 3].map((id) => sample(1.75, role, 10, 1, id))
      expect(new Set(profiles.map((pose) => JSON.stringify(pose))).size).toBe(3)
      expect(profiles[0][4]).toBeLessThan(rest[4])
      expect(profiles[1][4]).toBe(rest[4])
      expect(profiles[1][3]).toBeGreaterThan(profiles[2][3])
      expect(profiles[2][4]).toBeGreaterThan(rest[4])
      for (const elapsed of [0, 0.75, 1.5, 2, 2.5, 3.25, 3.5]) {
        const notice = MathUtils.smoothstep(elapsed, 0.55, 1.35) * (1 - MathUtils.smoothstep(elapsed, 2.45, 3.5))
        const follow = MathUtils.smoothstep(elapsed, 1.25, 2.25) * (1 - MathUtils.smoothstep(elapsed, 2.65, 3.5))
        const legacy = [
          0,
          0,
          -0.09 - follow * 0.025,
          -0.16 + notice * 0.03,
          -0.12 + notice * 0.065,
          0.22 + notice * 0.055 - follow * 0.025
        ]
        for (const id of [
          undefined,
          3,
          6,
          0,
          -1,
          1.5,
          NaN,
          Infinity,
          -Infinity,
          Number.MAX_SAFE_INTEGER + 1,
          '1',
          null,
          true
        ]) {
          expect(sample(elapsed, role, 10, 1, id as number | undefined)).toEqual(legacy)
        }
        for (const id of [1, 2, 3])
          expect(sample(elapsed, role, 10, 1, id + 3)).toEqual(sample(elapsed, role, 10, 1, id))
      }
    })

    test.each(['human', 'haunter'] as const)(
      'keeps every profile continuous through holds and consecutive event boundaries for %s',
      (role) => {
        for (const id of [1, 2, 3]) {
          let previous = rest
          const limits = [0, 0, 0.025, 0.065, 0.065, 0.055]
          for (let step = 0; step <= 420; step++) {
            const current = sample(step / 120, role, 10, 1, id)
            expect(current.every(Number.isFinite)).toBe(true)
            for (const [index, value] of current.entries()) {
              expect(Math.abs(value - rest[index])).toBeLessThanOrEqual(limits[index] + 1e-12)
              expect(Math.abs(value - previous[index])).toBeLessThan(0.002)
            }
            previous = current
          }
          const epsilon = 0.0001
          for (const boundary of [0, 0.55, 1.25, 1.35, 2.25, 2.45, 2.65, 3.5]) {
            const before = sample(boundary - epsilon, role, 10, 1, id)
            const center = sample(boundary, role, 10, 1, id)
            const after = sample(boundary + epsilon, role, 10, 1, id)
            for (const [index, value] of center.entries()) {
              expect(Math.abs(after[index] - before[index])).toBeLessThan(0.0001)
              expect(Math.abs((after[index] - value) / epsilon - (value - before[index]) / epsilon)).toBeLessThan(
                0.0002
              )
            }
          }
          expect(sample(3.5, role, 10, 1, id)).toEqual(rest)
          expect(sample(0, role, 13.5, 1, id + 1)).toEqual(rest)
          expect(sample(epsilon, role, 13.5, 1, id + 1)).toEqual(rest)
          expect(sample(1.75, role, 13.5, 1, id + 1)).toEqual(sample(1.75, role, 10, 1, id + 1))
        }
      }
    )

    test.each(['human', 'haunter'] as const)(
      'depends only on elapsed time, not frame order or clock origin for %s',
      (role) => {
        const times = [0, 0.75, 1.5, 2, 2.5, 3.25, 3.5]
        const expected = times.map((elapsed) => sample(elapsed, 'human'))
        for (const [startedAt, unit] of [
          [0, 1],
          [10, 1],
          [1_700_000_000, 1],
          [1_700_000_000_000, 1000]
        ]) {
          for (const index of [4, 1, 6, 2, 0, 5, 3, 4]) {
            expect(sample(times[index], role, startedAt, unit)).toEqual(expected[index])
          }
        }
      }
    )

    test.each(['human', 'haunter'] as const)(
      'eases the head before the torso, holds once and returns continuously for %s',
      (role) => {
        expect(sample(0, role)).toEqual(rest)
        const notice = sample(1, role)
        expect(notice[4]).toBeGreaterThan(rest[4])
        expect(notice[2]).toBe(rest[2])
        expect(sample(2, role)[2]).toBeLessThan(rest[2])
        expect(sample(2.25, role)).toEqual(sample(2.4, role))
        const early = sample(0.65, role)[4] - sample(0.55, role)[4]
        const middle = sample(1, role)[4] - sample(0.9, role)[4]
        expect(middle).toBeGreaterThan(early * 3)
        let previous = rest
        const limits = [0, 0, 0.025, 0.03, 0.065, 0.055]
        for (let step = 0; step <= 420; step++) {
          const current = sample(step / 120, role)
          expect(current.every(Number.isFinite)).toBe(true)
          for (const [index, value] of current.entries()) {
            expect(Math.abs(value - rest[index])).toBeLessThanOrEqual(limits[index] + 1e-12)
            expect(Math.abs(value - previous[index])).toBeLessThan(0.002)
          }
          previous = current
        }
        const epsilon = 0.0001
        for (const boundary of [0, 0.55, 1.25, 1.35, 2.25, 2.45, 2.65, 3.5]) {
          const before = sample(boundary - epsilon, role)
          const center = sample(boundary, role)
          const after = sample(boundary + epsilon, role)
          for (const [index, value] of center.entries()) {
            expect(Math.abs(after[index] - before[index])).toBeLessThan(0.0001)
            expect(Math.abs((after[index] - value) / epsilon - (value - before[index]) / epsilon)).toBeLessThan(0.0002)
          }
        }
        expect(sample(3.5, role)).toEqual(rest)
      }
    )

    test.each((['human', 'haunter'] as const).flatMap((role) => [undefined, 1, 2, 3].map((id) => ({ role, id }))))(
      'clears motion on expiry, interruption and nonfinite clocks for $role (id=$id)',
      ({ role, id }) => {
        for (const [startedAt, unit] of [
          [10, 1],
          [1_700_000_000_000, 1000]
        ]) {
          const base: WorldFrame = {
            ...frame,
            role,
            time: startedAt + unit,
            effect: { kind: 'apparition', startedAt, id }
          }
          const invalidFrames: WorldFrame[] = [
            { ...base, time: startedAt - unit / 4 },
            { ...base, time: startedAt + 3.5 * unit },
            { ...base, time: startedAt + 4 * unit },
            { ...base, effect: null },
            { ...base, effect: { kind: 'blackout', startedAt } },
            { ...base, effect: { kind: 'rattle', startedAt } },
            { ...base, time: Number.MAX_VALUE, effect: { kind: 'apparition', startedAt: -Number.MAX_VALUE } },
            { ...base, time: -Number.MAX_VALUE, effect: { kind: 'apparition', startedAt: Number.MAX_VALUE } }
          ]
          for (const invalid of [NaN, Infinity, -Infinity]) {
            invalidFrames.push(
              { ...base, time: invalid },
              { ...base, effect: { kind: 'apparition', startedAt: invalid, id } }
            )
          }
          for (const invalid of invalidFrames) {
            const expected = sample(1.75, role, startedAt, unit, id)
            expect(expected).not.toEqual(rest)
            world.render(invalid)
            expect(internals.apparition.visible).toBe(false)
            expect(rotations()).toEqual(rest)
            for (const figure of [internals.human, internals.haunter, internals.apparition, internals.camera]) {
              expect(
                [...figure.position.toArray(), ...figure.quaternion.toArray(), ...figure.scale.toArray()].every(
                  Number.isFinite
                )
              ).toBe(true)
            }
            expect(sample(0, role, startedAt, unit, id)).toEqual(rest)
            expect(sample(1.75, role, startedAt, unit, id)).toEqual(expected)
          }
        }
      }
    )

    test.each((['human', 'haunter'] as const).flatMap((role) => [undefined, 1, 2, 3].map((id) => ({ role, id }))))(
      'preserves resources, placement, fade, normal figures and other effects for $role (id=$id)',
      ({ role, id }) => {
        const resources = [internals.geometries, internals.materials, internals.textures].map((set) => [...set])
        const objects: Three.Object3D[] = []
        internals.scene.traverse((object) => objects.push(object))
        const meshes = [...internals.staticMeshes]
        const children: Three.Object3D[] = []
        internals.apparition.traverse((object) => {
          if (object !== internals.apparition) children.push(object)
        })
        const childPlacement = children.map((object) => [...object.position.toArray(), ...object.scale.toArray()])
        const humanRotations: Three.EulerTuple[] = []
        internals.human.traverse((object) => {
          if (object !== internals.human) humanRotations.push(object.rotation.toArray())
        })
        const variant = Number.isSafeInteger(id) && (id as number) > 0 ? (id as number) % 3 : 0
        const lane = variant === 1 ? -0.7 : variant === 2 ? 0.7 : 0
        const approach = variant === 1 ? -0.25 : variant === 2 ? 0.1 : 0
        const facing = variant === 2 ? Math.PI - 0.4 : variant === 1 ? Math.PI + 0.4 : Math.PI
        const size = variant === 1 ? 0.98 : variant === 2 ? 0.78 : 0.85
        for (const [startedAt, unit] of [
          [10, 1],
          [1_700_000_000_000, 1000]
        ]) {
          for (const elapsed of [-0.25, 0, 0.4, 0.8, 1.75, 2.7, 3.1, 3.5, 4]) {
            const time = startedAt + elapsed * unit
            const active = elapsed >= 0 && elapsed < 3.5
            const envelope = active ? Math.sin((Math.PI * elapsed) / 3.5) : 0
            for (const kind of [null, 'apparition', 'blackout', 'rattle'] as const) {
              world.render({ ...frame, role, time, effect: null })
              const camera = internals.camera.clone(false)
              const figures = [internals.human, internals.haunter, internals.aim].map((object) => [
                ...object.position.toArray(),
                ...object.quaternion.toArray(),
                ...object.scale.toArray(),
                object.visible
              ])
              sample(1.75, role, startedAt, unit, id)
              world.render({ ...frame, role, time, effect: kind ? { kind, startedAt, id } : null })
              if (kind === 'rattle' && active) camera.rotateZ(Math.sin(elapsed * 18) * envelope * 0.045)
              expect(internals.camera.position.toArray()).toEqual(camera.position.toArray())
              expect(internals.camera.quaternion.angleTo(camera.quaternion)).toBeCloseTo(0, 7)
              expect(
                [internals.human, internals.haunter, internals.aim].map((object) => [
                  ...object.position.toArray(),
                  ...object.quaternion.toArray(),
                  ...object.scale.toArray(),
                  object === internals.haunter
                    ? role === 'human' && kind === 'apparition' && active
                      ? false
                      : object.visible
                    : object.visible
                ])
              ).toEqual(figures)
              const animationTime = time / (Math.abs(time) >= 1e11 ? 1000 : 1)
              expect(internals.haunter.getObjectByName('torso')!.rotation.z).toBe(
                -0.09 + Math.sin(animationTime * 0.7) * 0.035
              )
              expect(internals.haunter.getObjectByName('head')!.rotation.z).toBe(
                0.22 + Math.sin(animationTime * 0.53) * 0.04
              )
              const currentHumanRotations: Three.EulerTuple[] = []
              internals.human.traverse((object) => {
                if (object !== internals.human) currentHumanRotations.push(object.rotation.toArray())
              })
              expect(currentHumanRotations).toEqual(humanRotations)
              expect(internals.apparition.visible).toBe(kind === 'apparition' && active)
              expect(internals.ambient.intensity).toBeCloseTo(kind === 'blackout' ? 0.65 - envelope * 0.61 : 0.65)
              expect(internals.lantern.intensity).toBeCloseTo(kind === 'blackout' ? 18 - envelope * 17.5 : 18)
              const brightness = kind === 'blackout' ? 1 - envelope * 0.94 : 1
              expect(internals.fill.intensity).toBeCloseTo(0.8 * brightness)
              for (const light of internals.roomLights) expect(light.intensity).toBeCloseTo(11 * brightness)
              if (kind === 'apparition' && active) {
                expect(internals.apparition.position.x).toBe(lane)
                expect(internals.apparition.position.y).toBe(-1.05)
                expect(internals.apparition.position.z).toBeCloseTo(-2.25 + envelope * 0.9 + approach, 12)
                expect(internals.apparition.rotation.toArray()).toEqual([0, facing, 0, 'XYZ'])
                expect(internals.apparition.scale.toArray()).toEqual([size, size, size])
                const fade = MathUtils.smoothstep(elapsed, 0, 0.8) * (1 - MathUtils.smoothstep(elapsed, 2.7, 3.5))
                for (const { material, opacity } of internals.apparitionMaterials) {
                  expect(material.opacity).toBeCloseTo(opacity * fade, 5)
                }
              } else {
                expect(rotations()).toEqual(rest)
              }
              expect(children.map((object) => [...object.position.toArray(), ...object.scale.toArray()])).toEqual(
                childPlacement
              )
            }
          }
        }
        expect([internals.geometries, internals.materials, internals.textures].map((set) => [...set])).toEqual(
          resources
        )
        const currentObjects: Three.Object3D[] = []
        internals.scene.traverse((object) => currentObjects.push(object))
        expect(currentObjects).toEqual(objects)
        expect(internals.staticMeshes).toEqual(meshes)
      }
    )
  })

  test('releases generated textures and shared geometry on disposal', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as {
      textures: Set<Three.Texture>
      geometries: Set<Three.BufferGeometry>
      materials: Set<Three.Material>
    }
    const textures = [...internals.textures].map((texture) => vi.spyOn(texture, 'dispose'))
    const geometries = [...internals.geometries].map((geometry) => vi.spyOn(geometry, 'dispose'))
    const materials = [...internals.materials].map((material) => vi.spyOn(material, 'dispose'))
    expect(textures.length).toBeGreaterThan(0)
    world.dispose()
    for (const dispose of [...textures, ...geometries, ...materials]) expect(dispose).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  test('expires effects and restores lighting without requiring effect removal', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as {
      ambient: Three.AmbientLight
      fill: Three.HemisphereLight
      moon: Three.DirectionalLight
      fog: Three.FogExp2
      roomLights: Three.PointLight[]
      apparition: Three.Group
      camera: Three.Camera
    }
    const frame: WorldFrame = {
      role: 'human',
      human: HUMAN_START,
      haunter: HAUNTER_START,
      effect: { kind: 'blackout', startedAt: 10 },
      time: 11.75
    }
    world.render(frame)
    expect(internals.ambient.intensity).toBeLessThan(0.3)
    expect(internals.fill.intensity).toBeLessThan(0.3)
    expect(internals.moon.intensity).toBeLessThan(0.3)
    expect(internals.fog.density).toBeGreaterThan(0.1)
    expect(internals.roomLights.every((light) => light.intensity < 4)).toBe(true)
    world.render({ ...frame, time: 14 })
    expect(internals.ambient.intensity).toBeCloseTo(0.65)
    expect(internals.fill.intensity).toBeCloseTo(0.8)
    expect(internals.moon.intensity).toBeCloseTo(1.05)
    expect(internals.fog.density).toBeCloseTo(0.045)
    expect(internals.fog.color.getHex()).toBe(0x1d272c)
    expect(internals.roomLights.every((light) => light.intensity === 11)).toBe(true)
    world.render({ ...frame, effect: { kind: 'apparition', startedAt: 10 }, time: 11 })
    expect(internals.apparition.visible).toBe(true)
    world.render({ ...frame, effect: { kind: 'apparition', startedAt: 10 }, time: 14 })
    expect(internals.apparition.visible).toBe(false)
    world.render({ ...frame, effect: { kind: 'rattle', startedAt: 10 }, time: 11 })
    world.render({ ...frame, effect: { kind: 'rattle', startedAt: 10 }, time: 14 })
    const afterRattle = internals.camera.quaternion.clone()
    world.render({ ...frame, effect: null, time: 14 })
    expect(internals.camera.quaternion.angleTo(afterRattle)).toBeCloseTo(0)
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('animates the layered figures gently and contains invalid frame times', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as { human: Three.Group; haunter: Three.Group; apparition: Three.Group }
    const frame: WorldFrame = { role: 'human', human: HUMAN_START, haunter: HAUNTER_START, effect: null, time: 0 }
    const torso = internals.haunter.getObjectByName('torso')!
    const head = internals.haunter.getObjectByName('head')!
    expect(head.children.length).toBeGreaterThanOrEqual(3)
    expect(internals.human.getObjectByName('head')!.children.length).toBeGreaterThan(3)
    world.render(frame)
    const initial = torso.rotation.z
    world.render({ ...frame, time: 2 })
    expect(Math.abs(torso.rotation.z - initial)).toBeGreaterThan(0.01)
    expect(Math.abs(torso.rotation.z - initial)).toBeLessThan(0.07)
    world.render({ ...frame, time: NaN })
    for (const figure of [internals.haunter, internals.apparition]) {
      figure.traverse((object) => {
        expect(
          [
            object.position.x,
            object.position.y,
            object.position.z,
            object.rotation.x,
            object.rotation.y,
            object.rotation.z
          ].every(Number.isFinite)
        ).toBe(true)
      })
    }
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('preserves the human garment buffers while isolating the ghost silhouette', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as { human: Three.Group; haunter: Three.Group }
    const human = internals.human.getObjectByName('torso')!.children.slice(0, 3) as Three.Mesh[]
    const ghost = internals.haunter.getObjectByName('torso')!.children.slice(0, 3) as Three.Mesh[]
    const fingerprints = human.map((mesh, index) => {
      expect(mesh.geometry).not.toBe(ghost[index].geometry)
      const hash = createHash('sha256')
      for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
        hash.update(name)
        hash.update(Buffer.from(attribute.array.buffer))
      }
      hash.update(Buffer.from(mesh.geometry.getIndex()!.array.buffer))
      return hash.digest('hex')
    })
    expect(fingerprints).toEqual([
      'fefbb3dd73ebf9a8854ff40a5f929cf992a75f0fec6aded670000eec15a3eb1e',
      'de8651427b8a9a89fa8a6e9fc43b5b382b78a9351b90da38589cfaf3b24609b2',
      'c68511e697c32b07fc5154fb4b23ea56501c3c5a03ec0d8bb1f90a3a4d8fbca3'
    ])
    world.dispose()
    vi.unstubAllGlobals()
  })

  test('shares ghost geometry, isolates materials, and disposes each shared resource once', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() } as unknown as HTMLElement
    const world = new HorrorWorld(container)
    const internals = world as unknown as {
      haunter: Three.Group
      apparition: Three.Group
      geometries: Set<Three.BufferGeometry>
      materials: Set<Three.Material>
    }
    const meshes = (group: Three.Group): Three.Mesh[] => {
      const result: Three.Mesh[] = []
      group.traverse((object) => {
        if ((object as Three.Mesh).isMesh) result.push(object as Three.Mesh)
      })
      return result
    }
    const haunter = meshes(internals.haunter)
    const apparition = meshes(internals.apparition)
    expect(haunter).toHaveLength(apparition.length)
    expect(haunter).toHaveLength(6)
    let triangles = 0
    for (const [index, mesh] of haunter.entries()) {
      expect(mesh.geometry).toBe(apparition[index].geometry)
      expect(mesh.material).not.toBe(apparition[index].material)
      expect(internals.geometries.has(mesh.geometry)).toBe(true)
      expect(internals.materials.has(mesh.material as Three.Material)).toBe(true)
      expect(internals.materials.has(apparition[index].material as Three.Material)).toBe(true)
      const positions = mesh.geometry.getAttribute('position')
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true)
      }
      const indices = mesh.geometry.getIndex()!
      expect(
        Array.from(indices.array).every((vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < positions.count)
      ).toBe(true)
      expect(indices.count % 3).toBe(0)
      const normals = mesh.geometry.getAttribute('normal')
      expect(normals.count).toBe(positions.count)
      for (let vertex = 0; vertex < normals.count; vertex++) {
        expect(Math.hypot(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex))).toBeCloseTo(1, 5)
      }
      const first = new Vector3()
      const second = new Vector3()
      const third = new Vector3()
      const average = new Vector3()
      const normal = new Vector3()
      for (let triangle = 0; triangle < indices.count; triangle += 3) {
        first.fromBufferAttribute(positions, indices.getX(triangle))
        second.fromBufferAttribute(positions, indices.getX(triangle + 1)).sub(first)
        third.fromBufferAttribute(positions, indices.getX(triangle + 2)).sub(first)
        second.cross(third)
        expect(second.lengthSq()).toBeGreaterThan(1e-16)
        average.set(0, 0, 0)
        for (let corner = 0; corner < 3; corner++) {
          average.add(normal.fromBufferAttribute(normals, indices.getX(triangle + corner)))
        }
        expect(second.dot(average)).toBeGreaterThan(0)
      }
      triangles += indices.count / 3
      mesh.geometry.computeBoundingSphere()
      expect(Number.isFinite(mesh.geometry.boundingSphere!.radius)).toBe(true)
    }
    expect(triangles).toBeLessThanOrEqual(3048)
    const face = internals.apparition.getObjectByName('ghost-face')!
    const hair = internals.apparition.getObjectByName('ghost-hair')!
    const fringe = internals.apparition.getObjectByName('ghost-fringe')!
    expect(face.renderOrder).toBeGreaterThan(hair.renderOrder)
    expect(fringe.renderOrder).toBeGreaterThan(face.renderOrder)
    const cloth = haunter[0].material as Three.MeshStandardMaterial
    expect(cloth.vertexColors).toBe(true)
    const colors = haunter[0].geometry.getAttribute('color')
    expect(colors.count).toBe(haunter[0].geometry.getAttribute('position').count)
    expect(Array.from(colors.array).every((value) => value >= 0 && value <= 1)).toBe(true)
    const shared = [...new Set(haunter.map((mesh) => mesh.geometry))]
    const disposals = shared.map((geometry) => vi.spyOn(geometry, 'dispose'))
    const count = internals.geometries.size
    world.render({
      role: 'human',
      human: HUMAN_START,
      haunter: HAUNTER_START,
      effect: { kind: 'apparition', startedAt: 0 },
      time: 1
    })
    expect(internals.geometries.size).toBe(count)
    world.dispose()
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
