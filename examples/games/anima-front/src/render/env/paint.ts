/**
 * Paints the environment atlas (albedo with alpha + emissive) into canvases and returns three.js textures.
 * Cutout tiles get their transparent texels' colour dilated from the opaque ones so mipmaps never fringe.
 * DOM only.
 */
import * as THREE from 'three'
import {
  ATLAS_CELL,
  ATLAS_HEIGHT,
  ATLAS_PAD,
  ATLAS_WIDTH,
  TILE_INNER,
  TILE_NAMES,
  tileOrigin,
  type TileName
} from './atlas'
import { FACADES, GROUND_FLOORS, ROOFS, type Painter } from './paint-facades'
import { Brush } from './paint-kit'
import { SURFACES } from './paint-surfaces'

const PAINTERS: Record<string, Painter> = { ...FACADES, ...GROUND_FLOORS, ...ROOFS, ...SURFACES }

export interface AtlasTextures {
  albedo: THREE.DataTexture
  emissive: THREE.CanvasTexture
  dispose(): void
}

let cache: { albedo: Uint8Array; emissive: HTMLCanvasElement } | null = null

/** Paints (once per page) and wraps the atlas into textures. */
export function paintAtlas(anisotropy = 4): AtlasTextures {
  if (!cache) cache = paint()
  const albedo = new THREE.DataTexture(cache.albedo, ATLAS_WIDTH, ATLAS_HEIGHT, THREE.RGBAFormat)
  albedo.colorSpace = THREE.SRGBColorSpace
  albedo.generateMipmaps = true
  albedo.minFilter = THREE.LinearMipmapLinearFilter
  albedo.magFilter = THREE.LinearFilter
  albedo.anisotropy = anisotropy
  albedo.needsUpdate = true
  const emissive = new THREE.CanvasTexture(cache.emissive)
  emissive.colorSpace = THREE.SRGBColorSpace
  emissive.anisotropy = anisotropy
  emissive.needsUpdate = true
  return {
    albedo,
    emissive,
    dispose() {
      albedo.dispose()
      emissive.dispose()
    }
  }
}

function paint(): { albedo: Uint8Array; emissive: HTMLCanvasElement } {
  const atlas = canvas(ATLAS_WIDTH, ATLAS_HEIGHT)
  const glow = canvas(ATLAS_WIDTH, ATLAS_HEIGHT)
  const a = atlas.getContext('2d')!
  const g = glow.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT)
  const tileA = canvas(TILE_INNER, TILE_INNER)
  const tileE = canvas(TILE_INNER, TILE_INNER)
  const ta = tileA.getContext('2d')!
  const te = tileE.getContext('2d')!
  TILE_NAMES.forEach((name, i) => {
    ta.clearRect(0, 0, TILE_INNER, TILE_INNER)
    te.globalAlpha = 1
    te.fillStyle = '#000'
    te.fillRect(0, 0, TILE_INNER, TILE_INNER)
    const painter = PAINTERS[name]
    const seed = 1000 + i * 7919
    if (painter) painter(new Brush(ta, TILE_INNER, seed), new Brush(te, TILE_INNER, seed + 1))
    else {
      ta.fillStyle = '#ff00ff'
      ta.fillRect(0, 0, TILE_INNER, TILE_INNER)
    }
    blit(a, tileA, name)
    blit(g, tileE, name)
  })
  const data = a.getImageData(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT).data
  dilate(data)
  // DataTexture rows start at the bottom (v = 0); flip so tile rects (computed for a flipped canvas) match.
  const out = new Uint8Array(data.length)
  const row = ATLAS_WIDTH * 4
  for (let y = 0; y < ATLAS_HEIGHT; y++) out.set(data.subarray(y * row, (y + 1) * row), (ATLAS_HEIGHT - 1 - y) * row)
  return { albedo: out, emissive: glow }
}

/** Copies a tile into its cell with wrapped padding on every side (seamless mip levels). */
function blit(dst: CanvasRenderingContext2D, tile: HTMLCanvasElement, name: TileName) {
  const [ox, oy] = tileOrigin(name)
  dst.save()
  dst.beginPath()
  dst.rect(ox - ATLAS_PAD, oy - ATLAS_PAD, ATLAS_CELL, ATLAS_CELL)
  dst.clip()
  dst.clearRect(ox - ATLAS_PAD, oy - ATLAS_PAD, ATLAS_CELL, ATLAS_CELL)
  for (const dx of [-TILE_INNER, 0, TILE_INNER])
    for (const dy of [-TILE_INNER, 0, TILE_INNER]) dst.drawImage(tile, ox + dx, oy + dy)
  dst.restore()
}

/** Replaces the colour of transparent texels with the average opaque colour of their cell. */
function dilate(data: Uint8ClampedArray) {
  const cols = ATLAS_WIDTH / ATLAS_CELL
  const rows = ATLAS_HEIGHT / ATLAS_CELL
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let sr = 0
      let sg = 0
      let sb = 0
      let n = 0
      let holes = 0
      for (let y = r * ATLAS_CELL; y < (r + 1) * ATLAS_CELL; y++)
        for (let x = c * ATLAS_CELL; x < (c + 1) * ATLAS_CELL; x++) {
          const i = (y * ATLAS_WIDTH + x) * 4
          if (data[i + 3] > 200) {
            sr += data[i]
            sg += data[i + 1]
            sb += data[i + 2]
            n++
          } else holes++
        }
      if (!holes || !n) continue
      const ar = sr / n
      const ag = sg / n
      const ab = sb / n
      for (let y = r * ATLAS_CELL; y < (r + 1) * ATLAS_CELL; y++)
        for (let x = c * ATLAS_CELL; x < (c + 1) * ATLAS_CELL; x++) {
          const i = (y * ATLAS_WIDTH + x) * 4
          const al = data[i + 3] / 255
          if (al > 0.78) continue
          // Blend toward the average so partially covered texels keep some of their own colour.
          const k = al / 0.78
          data[i] = data[i] * k + ar * (1 - k)
          data[i + 1] = data[i + 1] * k + ag * (1 - k)
          data[i + 2] = data[i + 2] * k + ab * (1 - k)
        }
    }
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
