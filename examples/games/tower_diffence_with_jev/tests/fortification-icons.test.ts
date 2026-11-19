import { describe, expect, it, vi } from 'vitest'
import { fortificationIcon, roadItemControls } from '../src/fortification-ui'
import { environmentRoadProp, type EnvironmentArt } from '../src/rendering/EnvironmentArt'
import { paintFortificationIcons } from '../src/rendering/FortificationVisual'

describe('fortification tray icons', () => {
  it.each(['sandbag', 'spike', 'mud'] as const)('provides a renderer-owned canvas for %s', (kind) => {
    expect(fortificationIcon(kind)).toContain(`<canvas class="item-model" data-item-art="${kind}"`)
    expect(fortificationIcon(kind)).not.toMatch(/<svg|<img|\.png/)
  })

  it('shows the paid item names independently of the images', () => {
    expect(roadItemControls).toContain('>まきびし</span>')
    expect(roadItemControls).toContain('>ぬかるみ</span>')
  })

  it('cropped icons use the installed renderer sprite with the bitmap flip undone', () => {
    const image = {},
      sprite = { width: 4, height: 3, texture: { image } }
    const art = { props: { 'sandbag-intact-0': sprite } } as unknown as EnvironmentArt
    const data = new Uint8ClampedArray(4 * 3 * 4)
    data[(4 + 1) * 4 + 3] = data[(4 + 2) * 4 + 3] = 255
    const sourceContext = { translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), getImageData: () => ({ data }) }
    const source = { getContext: () => sourceContext }
    const drawImage = vi.fn()
    const icon = { width: 0, height: 0, getContext: () => ({ drawImage }) }
    const root = {
      querySelector: (selector: string) => (selector.includes('sandbag') ? icon : null)
    } as unknown as ParentNode
    vi.stubGlobal('document', { createElement: () => source })
    try {
      expect(environmentRoadProp(art, 'sandbag', 0)).toBe(sprite)
      paintFortificationIcons(root, art)
      expect(sourceContext.drawImage).toHaveBeenCalledWith(image, 0, 0)
      expect(sourceContext.translate).toHaveBeenCalledWith(0, 3)
      expect(sourceContext.scale).toHaveBeenCalledWith(1, -1)
      expect([icon.width, icon.height]).toEqual([2, 1])
      expect(drawImage).toHaveBeenCalledWith(source, -1, -1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
