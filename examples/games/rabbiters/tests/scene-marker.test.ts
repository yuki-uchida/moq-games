import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { WorldFx } from '../src/fx'
import { RabbitersScene } from '../src/scene'

describe('predator discovery marker', () => {
  it('remains visible without scaling in reduced motion and restores normal motion', () => {
    const preference = { matches: true }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(preference))
    try {
      const fx = new WorldFx(new THREE.Scene())
      const marker = { symbol: new THREE.Sprite(), meter: new THREE.Sprite(), fill: new THREE.Sprite() }
      const actor = { marker, lastState: 'patrol', alertAt: -Infinity }
      const scene = Object.assign(Object.create(RabbitersScene.prototype), {
        clock: 0,
        fx,
        markerTexture: () => new THREE.Texture()
      }) as {
        clock: number
        updateMarker: (target: typeof actor, state: string, suspicion: number, height: number) => void
      }
      scene.updateMarker(actor, 'chase', 1, 2)
      const scale = marker.symbol.scale.x
      expect(marker.symbol.visible).toBe(true)
      expect(scale).toBeGreaterThan(0)
      expect(marker.meter.visible).toBe(false)
      for (const time of [0.1, 0.2, 0.4, 1.7]) {
        scene.clock = time
        scene.updateMarker(actor, 'chase', 1, 2)
        expect(marker.symbol.scale.x).toBe(scale)
      }
      preference.matches = false
      scene.updateMarker(actor, 'patrol', 0, 2)
      scene.clock = 2
      scene.updateMarker(actor, 'chase', 1, 2)
      expect(marker.symbol.scale.x).toBeCloseTo(0.3)
      scene.clock = 2.15
      scene.updateMarker(actor, 'chase', 1, 2)
      expect(marker.symbol.scale.x).toBeCloseTo(1.6)
      preference.matches = true
      scene.updateMarker(actor, 'chase', 1, 2)
      expect(marker.symbol.scale.x).toBe(scale)
      fx.dispose()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
