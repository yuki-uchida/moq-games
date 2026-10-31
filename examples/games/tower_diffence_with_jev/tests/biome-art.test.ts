import { describe, expect, it, vi } from 'vitest'
import { createFieldArt } from '../src/rendering/WorldArt'
import type { FieldId } from '../src/game/model'

describe('revision 4 biome backgrounds', () => {
  it('draws the same aligned source with a distinct grade and resets it before overlays', () => {
    const filters = new Map<FieldId, string>()
    for (const id of ['meadow', 'desert', 'frost', 'volcanic'] as const) {
      let filter = 'none',
        drawnWith = '',
        overlayWith = ''
      const context = new Proxy({} as CanvasRenderingContext2D, {
        get: (_target, name) => {
          if (name === 'filter') return filter
          if (name === 'createLinearGradient') return () => ({ addColorStop() {} })
          if (name === 'drawImage')
            return () => {
              drawnWith = filter
            }
          if (name === 'fillText')
            return () => {
              overlayWith = filter
            }
          return () => {}
        },
        set: (_target, name, value) => {
          if (name === 'filter') filter = value
          return true
        }
      })
      vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })
      try {
        createFieldArt(id, false, 2, {} as CanvasImageSource, 4)
        filters.set(id, drawnWith)
        expect(overlayWith).toBe('none')
      } finally {
        vi.unstubAllGlobals()
      }
    }
    expect(filters.get('meadow')).toBe('none')
    expect(new Set(filters.values()).size).toBe(4)
  })
})
