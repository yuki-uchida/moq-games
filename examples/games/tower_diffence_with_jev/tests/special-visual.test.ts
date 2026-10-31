import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { SpecialAbilityVisual } from '../src/rendering/SpecialAbilityVisual'
import { ALLY_TYPES, initialState } from '../src/game/model'
import { SPECIALS } from '../src/game/SpecialAbilities'

it('matches every authored special clip, cue and published runtime hash', () => {
  const base = 'public/tower-defense-art/effects/special/motions/'
  const manifest = JSON.parse(readFileSync(`${base}manifest.json`, 'utf8'))
  for (const role of ALLY_TYPES) {
    const record = manifest.roles[role]
    const bytes = readFileSync(base + record.file)
    const clip = THREE.AnimationClip.parse(JSON.parse(bytes.toString('utf8')))
    expect(clip.name).toBe(`ultimate_${role}`)
    expect(clip.duration).toBe(SPECIALS[role].motionDuration)
    expect(record.impacts).toEqual([...SPECIALS[role].impacts])
    expect(SPECIALS[role].release).toBe(record.impacts[0])
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.runtimeSha256[record.file])
  }
})

describe('special effect resource ownership', () => {
  it('loads once per role, bounds instances, and disposes unique materials without invalidating shared geometry', async () => {
    const sources = ALLY_TYPES.map(() => {
      const scene = new THREE.Group()
      scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()))
      return scene
    })
    let next = 0
    const load = vi
      .spyOn(GLTFLoader.prototype, 'loadAsync')
      .mockImplementation(async () => ({ scene: sources[next++] }) as any)
    const scene = new THREE.Scene(),
      visual = new SpecialAbilityVisual(scene)
    await visual.preload(new URL('https://example.test/'))
    await visual.preload(new URL('https://example.test/'))
    expect(load).toHaveBeenCalledTimes(10)
    const source = sources[0].children[0] as THREE.Mesh
    const geometryDispose = vi.spyOn(source.geometry, 'dispose'),
      materialDispose = vi.spyOn(source.material as THREE.Material, 'dispose')
    const state = initialState()
    state.phase = 'assault'
    for (let index = 0; index < 100; index++) {
      state.time = SPECIALS.soldier.release + 0.1
      state.specialEffects = [
        {
          id: `special-${index}`,
          sourceId: 1,
          type: 'soldier',
          x: 300,
          y: 300,
          startedAt: 0,
          releaseAt: SPECIALS.soldier.release,
          endsAt: SPECIALS.soldier.release + SPECIALS.soldier.duration,
          power: 10,
          applied: true
        }
      ]
      visual.render(state)
      expect(visual.diagnostics().active).toBe(1)
      expect(scene.children).toHaveLength(4)
      if (index === 0) {
        const previous = scene.children[3] as THREE.Group
        const previousMaterial = (previous.children[0] as THREE.Mesh).material as THREE.Material
        const dispose = vi.spyOn(previousMaterial, 'dispose')
        visual.render({
          ...state,
          battleId: state.battleId + 1,
          specialEffects: state.specialEffects.map((effect) => ({ ...effect, type: 'archer' as const }))
        })
        expect(previous.parent).toBeNull()
        expect(dispose).toHaveBeenCalledTimes(1)
        expect(((scene.children[3] as THREE.Group).children[0] as THREE.Mesh).geometry).toBe(
          (sources[1].children[0] as THREE.Mesh).geometry
        )
        expect(visual.diagnostics().active).toBe(1)
      }

      state.specialEffects = []
      visual.render(state)
      expect(visual.diagnostics().active).toBe(0)
      expect(scene.children).toHaveLength(3)
    }
    expect(geometryDispose).not.toHaveBeenCalled()
    expect(materialDispose).not.toHaveBeenCalled()
    visual.dispose()
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(scene.children).toHaveLength(0)
    load.mockRestore()
  })
})

it('draws every released effect after campaign warmup hides its source template', async () => {
  const sources = ALLY_TYPES.map(() => {
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()))
    return scene
  })
  let next = 0
  const load = vi
    .spyOn(GLTFLoader.prototype, 'loadAsync')
    .mockImplementation(async () => ({ scene: sources[next++] }) as any)
  const scene = new THREE.Scene(),
    visual = new SpecialAbilityVisual(scene)
  try {
    await visual.preload(new URL('https://example.test/'))
    // The shared campaign draw hides and detaches its temporary root afterwards.
    await visual.prepare(async (root) => {
      root.visible = false
      root.removeFromParent()
    })
    for (const type of ALLY_TYPES) {
      const state = initialState(),
        releaseAt = SPECIALS[type].release
      state.phase = 'assault'
      state.specialEffects = [
        {
          id: type,
          sourceId: 1,
          type,
          x: 300,
          y: 300,
          startedAt: 0,
          releaseAt,
          endsAt: releaseAt + SPECIALS[type].duration,
          power: 10,
          applied: false
        }
      ]
      state.time = releaseAt - 0.02
      visual.render(state)
      expect(visual.diagnostics().active).toBe(0)
      state.time = releaseAt + 0.1
      visual.render(state)
      const instance = scene.children[3] as THREE.Group
      expect(instance.visible, `${type} must be visible after warmup`).toBe(true)
      expect(instance.parent).toBe(scene)
      expect((instance.children[0] as THREE.Mesh).material).not.toBe(
        (sources[ALLY_TYPES.indexOf(type)].children[0] as THREE.Mesh).material
      )
      expect(((instance.children[0] as THREE.Mesh).material as THREE.Material).opacity).toBeGreaterThan(0)
      expect(instance.position.toArray().slice(0, 2)).toEqual([300, 300])
      visual.render({ ...state, specialEffects: [] })
      expect(visual.diagnostics().active).toBe(0)
    }
  } finally {
    visual.dispose()
    load.mockRestore()
  }
})
