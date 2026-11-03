import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FX_CAPACITY, WorldFx } from '../src/fx'
import { flashFor, hapticFor, popupFor } from '../src/hud-fx'
import type { JuiceEvent } from '../src/juice-events'

const at = { x: 1, y: 0, z: 2 }

const ALL_EVENTS: JuiceEvent[] = [
  { type: 'step', at, sprint: true, crouch: false },
  { type: 'step', at, sprint: false, crouch: false },
  { type: 'step', at, sprint: false, crouch: true },
  { type: 'jump', at },
  { type: 'land', at, impact: 0.2 },
  { type: 'land', at, impact: 1 },
  { type: 'hide', at },
  { type: 'unhide', at },
  { type: 'eat', at, streak: 1 },
  { type: 'eat', at, kind: 'clover', streak: 5 },
  { type: 'pickup', at },
  { type: 'drop', at },
  { type: 'taskTick', at, progress: 0.3 },
  { type: 'taskDone', at },
  { type: 'hurt', at, amount: 12 },
  { type: 'downed', at },
  { type: 'revived', at },
  { type: 'grown', at },
  { type: 'pregnant', at },
  { type: 'suspicious', at },
  { type: 'spotted', at, you: true },
  { type: 'spotted', at, you: false },
  { type: 'escaped', at },
  { type: 'talk' },
  { type: 'talk', at },
  { type: 'nestBroken', at },
  { type: 'bedding', at },
  { type: 'bedding' },
  { type: 'kitSafe', at },
  { type: 'kitLost' },
  { type: 'objective', at },
  { type: 'objective' },
  { type: 'chapter' },
  { type: 'won' },
  { type: 'lost' }
]

function advance(fx: WorldFx, camera: THREE.Camera, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.05) fx.update(0.05, camera)
}

describe('WorldFx', () => {
  it('emits every event type without throwing; particles rise then drain', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 100)
    const fx = new WorldFx(scene)
    for (const event of ALL_EVENTS) fx.emit(event)
    expect(fx.aliveCount).toBeGreaterThan(0)
    expect(fx.aliveCount).toBeLessThanOrEqual(FX_CAPACITY)
    advance(fx, camera, 5)
    expect(fx.aliveCount).toBe(0)
    fx.dispose()
  })

  it('never exceeds pool capacity under many emits', () => {
    const fx = new WorldFx(new THREE.Scene())
    const camera = new THREE.PerspectiveCamera()
    for (let i = 0; i < 1000; i += 1) {
      fx.emit(ALL_EVENTS[i % ALL_EVENTS.length])
      expect(fx.aliveCount).toBeLessThanOrEqual(FX_CAPACITY)
      if (i % 50 === 0) fx.update(0.016, camera)
    }
    fx.update(0.016, camera)
    expect(fx.aliveCount).toBeLessThanOrEqual(FX_CAPACITY)
    advance(fx, camera, 5)
    expect(fx.aliveCount).toBe(0)
  })

  it('trauma shakes the camera smoothly then decays to zero', () => {
    const fx = new WorldFx(new THREE.Scene())
    const camera = new THREE.PerspectiveCamera()
    const out = new THREE.Vector3()
    expect(fx.shakeOffset(out).length()).toBe(0)
    fx.addTrauma(1)
    fx.update(0.016, camera)
    expect(fx.shakeOffset(out).length()).toBeGreaterThan(0)
    expect(out.length()).toBeLessThan(0.3)
    advance(fx, camera, 0.3)
    expect(fx.currentTrauma).toBeGreaterThan(0)
    advance(fx, camera, 1)
    expect(fx.currentTrauma).toBe(0)
    expect(fx.shakeOffset(out).length()).toBe(0)
  })

  it('adds trauma for hard landings and hurt but not soft landings', () => {
    const fx = new WorldFx(new THREE.Scene())
    fx.emit({ type: 'land', at, impact: 0.2 })
    expect(fx.currentTrauma).toBe(0)
    fx.emit({ type: 'land', at, impact: 1 })
    expect(fx.currentTrauma).toBeCloseTo(0.25)
    fx.emit({ type: 'hurt', at, amount: 5 })
    expect(fx.currentTrauma).toBeCloseTo(0.7)
  })

  it('removes its points from the scene on dispose and ignores later emits', () => {
    const scene = new THREE.Scene()
    const fx = new WorldFx(scene)
    expect(scene.children.length).toBe(1)
    fx.dispose()
    expect(scene.children.length).toBe(0)
    fx.emit({ type: 'taskDone', at })
    expect(fx.aliveCount).toBe(0)
  })
})

describe('HudFx pure helpers', () => {
  it('builds popups with combo scaling', () => {
    expect(popupFor({ type: 'eat', at, streak: 1 })).toMatchObject({ text: '+1', size: 'md' })
    const combo = popupFor({ type: 'eat', at, streak: 3 })
    expect(combo?.text).toContain('3')
    expect(combo?.text).toContain('コンボ')
    expect(popupFor({ type: 'eat', at, streak: 6 })?.size).toBe('xl')
    expect(popupFor({ type: 'hurt', at, amount: 12.4 })?.text).toBe('-12')
    expect(popupFor({ type: 'taskDone', at })?.text).toBe('できた!')
    expect(popupFor({ type: 'spotted', at, you: true })).toMatchObject({ text: '!', anchor: 'top' })
    expect(popupFor({ type: 'spotted', at, you: false })).toBeNull()
    expect(popupFor({ type: 'step', at, sprint: true, crouch: false })).toBeNull()
    expect(popupFor({ type: 'won' })).toBeNull()
  })

  it('maps haptics and flashes', () => {
    expect(hapticFor({ type: 'hurt', at, amount: 1 })).toEqual([40])
    expect(hapticFor({ type: 'spotted', at, you: true })).toEqual([25, 40, 25])
    expect(hapticFor({ type: 'spotted', at, you: false })).toBeNull()
    expect(hapticFor({ type: 'won' })).toEqual([20, 40, 60])
    expect(hapticFor({ type: 'jump', at })).toBeNull()
    expect(flashFor({ type: 'hurt', at, amount: 1 })).toBe('hurt')
    expect(flashFor({ type: 'objective' })).toBe('gold')
    expect(flashFor({ type: 'chapter' })).toBe('sweep')
    expect(flashFor({ type: 'lost' })).toBe('lost')
    expect(flashFor({ type: 'eat', at, streak: 1 })).toBeNull()
  })
})
