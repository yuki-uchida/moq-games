import * as THREE from 'three'
import { impactCanvas, type ImpactStyle } from '../../../shared/ImpactArt'
export { impactFrame, impactStyle, impactDuration } from '../../../shared/ImpactArt'

/** GPU ownership is renderer-local; CPU pixel frames are shared and bounded. */
export class ImpactVfx {
  private textures = new Map<string, THREE.CanvasTexture>()
  texture(style: ImpactStyle, frame: number): THREE.CanvasTexture {
    const key = `${style}:${frame}`
    let texture = this.textures.get(key)
    if (!texture) {
      texture = new THREE.CanvasTexture(impactCanvas(style, frame))
      texture.magFilter = texture.minFilter = THREE.NearestFilter
      texture.colorSpace = THREE.SRGBColorSpace
      texture.generateMipmaps = false
      texture.name = `impact:${key}`
      this.textures.set(key, texture)
    }
    return texture
  }
  dispose(): void {
    for (const texture of this.textures.values()) texture.dispose()
    this.textures.clear()
  }
}
