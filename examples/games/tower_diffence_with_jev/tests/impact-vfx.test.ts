import { describe, expect, it } from 'vitest'
import { impactFrame, impactStyle, impactDuration } from '../src/rendering/ImpactVfx'
import { specialVfxMotion } from '../src/rendering/SpecialVfxMotion'
import { ALLY_TYPES } from '../src/game/model'

describe('simulation-owned VFX clocks', () => {
  it('never displays contact before damage or for missed/cancelled hits', () => {
    for (const age of [-10, -0.000001, 0, 0.08, 1]) expect(impactFrame(age, false)).toBeNull()
    expect(impactFrame(-0.000001, true)).toBeNull()
    expect(impactFrame(0, true)).toBe(0)
    expect(impactFrame(impactDuration('cut') - 0.000001, true)).toBe(7)
    expect(impactFrame(impactDuration('cut'), true)).toBeNull()
    expect(impactFrame(20, true)).toBeNull()
  })
  it('keeps healing and damage families distinct', () => {
    expect(impactStyle('soldier')).toBe('cut')
    expect(impactStyle('archer')).toBe('pierce')
    expect(impactStyle('mage')).toBe('arcane')
    expect(impactStyle('frost')).toBe('ice')
    expect(impactStyle('cannon')).toBe('fire')
    expect(impactStyle('shaman')).toBe('spore')
    expect(impactStyle('paladin', true)).toBe('heal')
    expect(impactFrame(0.13, true, 'pierce')).toBeNull()
    expect(impactFrame(0.13, true, 'fire')).not.toBeNull()
  })
  it('has deterministic release, bounded opacity and an exact end for all ultimates', () => {
    for (const role of ALLY_TYPES) {
      expect(specialVfxMotion(role, -0.01, 1).opacity).toBe(0)
      expect(specialVfxMotion(role, 0, 1).opacity).toBeGreaterThan(0)
      expect(specialVfxMotion(role, 1, 1).opacity).toBe(0)
      for (let age = 0; age < 1; age += 0.01) {
        const frame = specialVfxMotion(role, age, 1)
        expect(frame.opacity).toBeGreaterThanOrEqual(0)
        expect(frame.opacity).toBeLessThanOrEqual(0.8)
        expect(specialVfxMotion(role, age, 1)).toEqual(frame)
      }
    }
    expect(specialVfxMotion('paladin', 0, 1).height).toBeGreaterThan(0)
    expect(specialVfxMotion('archer', 0.21, 1).lift).toBe(0)
  })
})

// A renderer must also reject stale state snapshots and dispose only instance materials.
import * as THREE from 'three'
import { SpecialAbilityVisual } from '../src/rendering/SpecialAbilityVisual'
import { vi } from 'vitest'
it('caps simultaneous fields, prunes expired snapshots, and releases reset instances', () => {
  const scene = new THREE.Scene(),
    visual = new SpecialAbilityVisual(scene)
  const source = new THREE.Group()
  const geometry = new THREE.PlaneGeometry(1, 1),
    material = new THREE.MeshBasicMaterial()
  source.add(new THREE.Mesh(geometry, material))
  ;(visual as any).sources.set('frost', source)
  const state: any = { phase: 'assault', time: 1, battleId: 1, units: [], specialEffects: [] }
  state.specialEffects = Array.from({ length: 40 }, (_, i) => ({
    id: `${i}`,
    type: 'frost',
    releaseAt: 1,
    endsAt: 3,
    x: 0,
    y: 0
  }))
  const geometryDispose = vi.spyOn(geometry, 'dispose')
  visual.render(state)
  expect(visual.diagnostics().active).toBe(16)
  const instances = [...(visual as any).active.values()] as THREE.Group[]
  expect(((instances[0].children[0] as THREE.Mesh).material as THREE.Material).opacity).toBeLessThan(0.05)
  const instanceDispose = vi.spyOn((instances[0].children[0] as THREE.Mesh).material as THREE.Material, 'dispose')
  state.time = 3
  visual.render(state)
  expect(visual.diagnostics().active).toBe(0)
  expect(instanceDispose).toHaveBeenCalledTimes(1)
  expect(geometryDispose).not.toHaveBeenCalled()
  state.time = 1
  visual.render(state)
  expect(visual.diagnostics().active).toBe(16)
  state.phase = 'preparation'
  visual.render(state)
  expect(visual.diagnostics().active).toBe(0)
  visual.dispose()
  expect(geometryDispose).toHaveBeenCalledTimes(1)
})
