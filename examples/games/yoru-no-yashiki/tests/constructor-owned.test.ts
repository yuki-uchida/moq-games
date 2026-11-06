import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import type * as Three from 'three'
import * as StudyThree from 'three'
const ownership = vi.hoisted(() => ({ returned: undefined as undefined | ((geometry: Three.BufferGeometry) => void) }))
vi.mock('three/addons/utils/BufferGeometryUtils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/addons/utils/BufferGeometryUtils.js')>()
  return {
    ...actual,
    mergeVertices: (...args: Parameters<typeof actual.mergeVertices>) => {
      const result = actual.mergeVertices(...args)
      ownership.returned?.(result)
      return result
    }
  }
})
import { createGarmentGeometry, createGhostGeometry } from '../src/ghost-geometry'

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
import { Box3, FrontSide, Material, MathUtils, Matrix4, Raycaster, ShaderLib, Vector3 } from 'three'

describe('returned owner resource rollback study', () => {
  const values = [undefined, null, false, 0, new Error('construction sentinel')]
  const capture = (operation: () => unknown) => {
    try {
      operation()
      return { threw: false, value: undefined as unknown }
    } catch (value) {
      return { threw: true, value }
    }
  }
  const setup = (stage: string, failure: unknown, cleanupFailure = false) => {
    const Geometry = StudyThree.BufferGeometry
    const Instanced = StudyThree.InstancedMesh
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const resources: { kind: string; object: { dispose: () => void }; calls: number }[] = []
    const attempts: string[] = []
    let renderer: Three.WebGLRenderer | undefined
    let world: HorrorWorld | undefined
    const lost = vi.fn()
    let detached = false
    let attached = false
    let faulted = false
    const listeners = new Map<string, EventListenerOrEventListenerObject>()
    const counts = new Map<string, number>()
    const hit = (name: string) => {
      const count = (counts.get(name) ?? 0) + 1
      counts.set(name, count)
      if (stage === name || stage === `${name}:${count}`) {
        faulted = true
        throw failure
      }
    }
    const track = (object: { dispose: () => void }, kind: string) => {
      if (resources.some((entry) => entry.object === object)) return
      const entry = { kind, object, calls: 0 }
      resources.push(entry)
      const original = vi.isMockFunction(object.dispose)
        ? (object.dispose.getMockImplementation()?.bind(object) ?? (() => undefined))
        : object.dispose.bind(object)
      vi.spyOn(object, 'dispose').mockImplementation(() => {
        entry.calls++
        attempts.push(kind)
        world?.dispose()
        original()
        hit(`dispose:${kind}`)
        if (cleanupFailure && faulted) throw new Error('secondary cleanup sentinel')
      })
    }
    for (const name of [
      'BoxGeometry',
      'BufferGeometry',
      'SphereGeometry',
      'CylinderGeometry',
      'TorusGeometry',
      'RingGeometry',
      'DataTexture',
      'MeshStandardMaterial',
      'PointsMaterial',
      'InstancedMesh'
    ] as const) {
      const Original = StudyThree[name]
      const constructor = vi.spyOn(StudyThree, name).mockImplementation(function (...args: unknown[]) {
        hit(`new:${name}`)
        const object = Reflect.construct(Original, args)
        track(
          object,
          name === 'InstancedMesh'
            ? 'mesh'
            : name === 'DataTexture'
              ? 'texture'
              : name.endsWith('Material')
                ? 'material'
                : 'geometry'
        )
        if (name === 'DataTexture')
          Object.defineProperty(object, 'needsUpdate', {
            set() {
              hit('texture:needsUpdate')
            }
          })
        return object
      } as never)
      constructor.prototype = Original.prototype
    }
    ownership.returned = (geometry) => track(geometry, 'geometry')
    const clone = Geometry.prototype.clone
    vi.spyOn(Geometry.prototype, 'clone').mockImplementation(function (this: Three.BufferGeometry) {
      const object = clone.call(this)
      if (this instanceof StudyThree.BoxGeometry) track(object, 'geometry')
      return object
    })
    const setAttribute = Geometry.prototype.setAttribute
    vi.spyOn(Geometry.prototype, 'setAttribute').mockImplementation(function (
      this: Three.BufferGeometry,
      name,
      attribute
    ) {
      if (resources.some((entry) => entry.object === this)) hit(`attribute:${String(name)}`)
      return setAttribute.call(this, name, attribute)
    })
    for (const name of ['setMatrixAt', 'computeBoundingSphere'] as const) {
      const original = Instanced.prototype[name]
      vi.spyOn(Instanced.prototype, name).mockImplementation(function (this: Three.InstancedMesh, ...args: unknown[]) {
        hit(`mesh:${name}`)
        return Reflect.apply(original, this, args)
      } as never)
    }
    const sceneAdd = StudyThree.Scene.prototype.add
    vi.spyOn(StudyThree.Scene.prototype, 'add').mockImplementation(function (
      this: Three.Scene,
      ...objects: Three.Object3D[]
    ) {
      const result = sceneAdd.apply(this, objects)
      hit('scene:add')
      return result
    })
    const projection = StudyThree.PerspectiveCamera.prototype.updateProjectionMatrix
    vi.spyOn(StudyThree.PerspectiveCamera.prototype, 'updateProjectionMatrix').mockImplementation(function (
      this: Three.PerspectiveCamera
    ) {
      if (renderer) hit('resize:projection')
      return projection.call(this)
    })
    const OriginalRenderer = StudyThree.WebGLRenderer
    const disposeWorld = HorrorWorld.prototype.dispose
    vi.spyOn(HorrorWorld.prototype, 'dispose').mockImplementation(function (this: HorrorWorld) {
      world ??= this
      return disposeWorld.call(this)
    })
    const normals = Geometry.prototype.computeVertexNormals
    vi.spyOn(Geometry.prototype, 'computeVertexNormals').mockImplementation(function (this: Three.BufferGeometry) {
      if (resources.some((entry) => entry.object === this)) hit('normal')
      return normals.call(this)
    })
    for (const name of [
      'Scene',
      'PerspectiveCamera',
      'Group',
      'AmbientLight',
      'PointLight',
      'HemisphereLight',
      'FogExp2',
      'DirectionalLight',
      'Mesh',
      'Points'
    ] as const) {
      const Original = StudyThree[name]
      const constructor = vi.spyOn(StudyThree, name).mockImplementation(function (...args: unknown[]) {
        hit(`new:${name}`)
        return Reflect.construct(Original, args)
      } as never)
      constructor.prototype = Original.prototype
    }
    vi.spyOn(StudyThree, 'WebGLRenderer').mockImplementation(function () {
      hit('renderer:new')
      renderer = new OriginalRenderer()
      const canvas = renderer.domElement
      const add = canvas.addEventListener.bind(canvas)
      const remove = canvas.removeEventListener.bind(canvas)
      vi.spyOn(canvas, 'addEventListener').mockImplementation((name, callback) => {
        add(name, callback!)
        listeners.set(name, callback!)
        hit(`listener:add:${name}`)
      })
      vi.spyOn(canvas, 'removeEventListener').mockImplementation((name, callback) => {
        attempts.push(`listener:${name}`)
        remove(name, callback!)
        listeners.delete(name)
        world?.dispose()
        if (cleanupFailure && faulted) throw null
      })
      vi.mocked(canvas.remove).mockImplementation(() => {
        attempts.push('canvas')
        detached = true
        attached = false
        world?.dispose()
        if (cleanupFailure && faulted) throw false
      })
      vi.mocked(renderer.setPixelRatio).mockImplementation(() => hit('renderer:setPixelRatio'))
      vi.mocked(renderer.setSize).mockImplementation(() => hit('renderer:setSize'))
      vi.mocked(renderer.setClearColor).mockImplementation(() => hit('renderer:setClearColor'))
      Object.defineProperty(renderer, 'outputColorSpace', {
        set() {
          hit('renderer:outputColorSpace')
        }
      })
      track(renderer, 'renderer')
      return renderer
    } as never)
    const container = {
      get clientWidth() {
        hit('container:width')
        return 800
      },
      get clientHeight() {
        hit('container:height')
        return 600
      },
      appendChild: vi.fn(() => {
        attached = true
        hit('canvas:append')
      })
    } as unknown as HTMLElement
    return {
      resources,
      attempts,
      listeners,
      lost,
      get detached() {
        return detached
      },
      get attached() {
        return attached
      },
      get renderer() {
        return renderer
      },
      get world() {
        return world
      },
      create: () => {
        world = new HorrorWorld(container, lost)
        return world
      }
    }
  }
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  test('normal control retains all resources until disposal and keeps cleanup order under synchronous reentry', () => {
    const study = setup('none', undefined)
    const world = study.create()
    expect(study.attached).toBe(true)
    expect(study.listeners.size).toBe(2)
    const active = study.resources.filter((entry) => entry.calls === 0)
    expect(active.length).toBeGreaterThan(50)
    study.attempts.length = 0
    world.dispose()
    expect(study.attempts).toEqual([
      'listener:webglcontextlost',
      'listener:webglcontextrestored',
      ...active.filter((entry) => entry.kind === 'mesh').map(() => 'mesh'),
      ...active.filter((entry) => entry.kind === 'geometry').map(() => 'geometry'),
      ...active.filter((entry) => entry.kind === 'material').map(() => 'material'),
      ...active.filter((entry) => entry.kind === 'texture').map(() => 'texture'),
      'renderer',
      'canvas'
    ])
    expect(study.resources.every((entry) => entry.calls === 1)).toBe(true)
    expect(study.listeners.size).toBe(0)
    expect(study.detached).toBe(true)
    const attempts = [...study.attempts]
    world.dispose()
    expect(study.attempts).toEqual(attempts)
  })
  for (const stage of [
    'renderer:setSize',
    'container:width',
    'container:height',
    'resize:projection',
    'scene:add:1',
    'scene:add:12',
    'new:DataTexture:1',
    'new:DataTexture:3',
    'new:MeshStandardMaterial:1',
    'new:PointsMaterial:1',
    'new:InstancedMesh:1',
    'renderer:new',
    'listener:add:webglcontextlost',
    'listener:add:webglcontextrestored',
    'renderer:setPixelRatio',
    'renderer:outputColorSpace',
    'renderer:setClearColor',
    'canvas:append',
    'texture:needsUpdate:1',
    'texture:needsUpdate:3',
    'attribute:position:1',
    'attribute:position:2',
    'mesh:setMatrixAt:1',
    'mesh:computeBoundingSphere:1',
    'new:TorusGeometry:1',
    'new:CylinderGeometry:2',
    'attribute:color:1',
    'new:SphereGeometry:1',
    'new:CylinderGeometry:3',
    'attribute:color:2',
    'attribute:color:3',
    'new:RingGeometry:1',
    'normal:1',
    'normal:2',
    'normal:3',
    'normal:4',
    'normal:5',
    'normal:6',
    'normal:7',
    'normal:8',
    'normal:9',
    'new:Mesh:1',
    'new:Points:1',
    'new:FogExp2:1',
    'new:DirectionalLight:1',
    'new:PointLight:2',
    'dispose:geometry:1'
  ]) {
    for (const [index, failure] of values.entries()) {
      test(`rolls back ${stage} preserving throw value ${index}`, () => {
        const study = setup(stage, failure, true)
        const outcome = capture(study.create)
        expect(outcome.threw).toBe(true)
        expect(outcome.value).toBe(failure)
        expect(study.resources.length).toBeGreaterThan(0)
        expect(study.resources.map((entry) => entry.calls)).toEqual(study.resources.map(() => 1))
        expect(study.listeners.size).toBe(0)
        expect(study.attached).toBe(false)
        if (study.renderer) {
          expect(study.detached).toBe(true)
          expect(study.renderer.render).not.toHaveBeenCalled()
        }
        const attempts = [...study.attempts]
        study.world?.dispose()
        study.world?.dispose()
        study.renderer?.domElement.dispatchEvent(new Event('webglcontextlost'))
        study.renderer?.domElement.dispatchEvent(new Event('webglcontextrestored'))
        expect(study.attempts).toEqual(attempts)
        expect(study.lost).not.toHaveBeenCalled()
      })
    }
  }
  for (const stage of [
    'new:Scene:1',
    'new:PerspectiveCamera:1',
    'new:Group:1',
    'new:AmbientLight:1',
    'new:PointLight:1',
    'new:HemisphereLight:1',
    'new:BoxGeometry:1'
  ]) {
    for (const [index, failure] of values.entries()) {
      test(`field initializer ${stage} preserves throw value ${index} before owned resource return`, () => {
        const study = setup(stage, failure)
        const outcome = capture(study.create)
        expect(outcome.threw).toBe(true)
        expect(outcome.value).toBe(failure)
        expect(study.resources).toEqual([])
        expect(study.renderer).toBeUndefined()
        expect(study.attached).toBe(false)
      })
    }
  }
  for (const [name, create] of [
    ['garment-human', () => createGarmentGeometry(false)],
    ['garment-ghost', () => createGarmentGeometry(true)],
    ['ghost', createGhostGeometry]
  ] as const) {
    for (const stage of [
      'attribute:position:2',
      'attribute:color:1',
      'new:BufferGeometry:3',
      'normal:1',
      'normal:2',
      'normal:3',
      ...(name === 'garment-human' ? [] : ['dispose:geometry:1']),
      ...(name === 'ghost'
        ? ['new:SphereGeometry:1', 'new:BufferGeometry:4', 'new:BufferGeometry:5', 'normal:4', 'normal:5', 'normal:6']
        : [])
    ]) {
      for (const [index, failure] of values.entries()) {
        test(`direct ${name} rolls back ${stage} preserving throw value ${index}`, () => {
          const study = setup(stage, failure, true)
          const outcome = capture(create)
          expect(outcome.threw).toBe(true)
          expect(outcome.value).toBe(failure)
          expect(study.resources.length).toBeGreaterThan(0)
          expect(study.resources.map((entry) => entry.calls)).toEqual(study.resources.map(() => 1))
        })
      }
    }
    test(`direct ${name} normal control`, () => {
      const study = setup('none', undefined)
      const result = create()
      const returned = Object.values(result)
      expect(returned.length).toBe(name === 'ghost' ? 6 : 3)
      expect(returned.every((object) => study.resources.find((entry) => entry.object === object)?.calls === 0)).toBe(
        true
      )
      for (const geometry of returned) geometry.dispose()
      expect(study.resources.every((entry) => entry.calls === 1)).toBe(true)
    })
  }
})
