/**
 * 3D thumbnails of every antique, rendered once from the model kit after it has generated the models, so the
 * loadout board, the catalogue, the codex, the HUD and the touch buttons show the actual cute animal-shaped
 * antiques. Until a picture is ready the vector glyph stands in; glyphs already on the page are swapped in place
 * when their picture arrives.
 */
import * as THREE from 'three'
import { ITEMS, type ItemId } from '../data/items'
import type { ModelKit } from '../models/api'
import { itemIconSvg } from './art'

const pictures = new Map<ItemId, string>()
const ATTR = 'data-thumb'

/** The rendered picture of an antique (data URL), once ready. */
export const itemThumb = (id: ItemId): string | undefined => pictures.get(id)

function img(id: ItemId, src: string): HTMLImageElement {
  const el = document.createElement('img')
  el.className = 'item-thumb'
  el.src = src
  el.alt = ''
  el.draggable = false
  el.decoding = 'async'
  el.setAttribute(ATTR, id)
  return el
}

/** Markup for an icon (innerHTML users): the picture when ready, else the tagged vector glyph. */
export function itemIconMarkup(id: ItemId): string {
  const pic = pictures.get(id)
  if (pic) return `<img class="item-thumb" src="${pic}" alt="" draggable="false" decoding="async" ${ATTR}="${id}">`
  return itemIconSvg(id).replace('<svg ', `<svg ${ATTR}="${id}" `)
}

/** An icon element: the picture when ready, else the tagged vector glyph. */
export function itemIconNode(id: ItemId): Element {
  const pic = pictures.get(id)
  if (pic) return img(id, pic)
  const tpl = document.createElement('template')
  tpl.innerHTML = itemIconMarkup(id).trim()
  return tpl.content.firstElementChild as Element
}

/** Replaces every glyph of `id` on the page with its picture. */
function swap(id: ItemId, src: string): void {
  document.querySelectorAll(`svg[${ATTR}="${id}"]`).forEach((el) => el.replaceWith(img(id, src)))
}

/**
 * Renders the missing thumbnails with a short-lived WebGL context (one picture per task so menus stay
 * responsive), then releases the context. Failures leave the vector glyphs in place.
 */
export async function renderItemThumbs(kit: ModelKit, ids: readonly ItemId[], size = 128): Promise<void> {
  const todo = ids.filter((id) => !pictures.has(id))
  if (!todo.length || typeof document === 'undefined') return
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    })
  } catch {
    return
  }
  renderer.setPixelRatio(1)
  renderer.setSize(size, size, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xe2ecff, 0x4a3a52, 1.7))
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6)
  key.position.set(3, 5, 6)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9cc4ff, 1.8)
  rim.position.set(-4, 3, -5)
  scene.add(rim)
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100)
  const box = new THREE.Box3()
  const centre = new THREE.Vector3()
  const extent = new THREE.Vector3()
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(14))
  try {
    for (const id of todo) {
      const model = kit.createItem(id)
      const holder = new THREE.Group()
      holder.add(model.root)
      // Weapons and gadgets in a lively three-quarter profile (muzzle to the right), emblems nearly face-on.
      const def = ITEMS[id]
      const profile = def.category === 'melee' || def.category === 'ranged' || def.active
      model.root.rotation.set(profile ? 0.3 : 0.15, profile ? -1.15 : -0.45, profile ? 0.1 : 0)
      model.update(0, 'idle', 0)
      scene.add(holder)
      holder.updateMatrixWorld(true)
      box.setFromObject(holder)
      box.getSize(extent)
      // Long antiques (blades, lances, rifles) lie diagonally so they fill the square.
      if (extent.x > extent.y * 1.8) {
        holder.rotation.z = 0.6
        holder.updateMatrixWorld(true)
        box.setFromObject(holder)
        box.getSize(extent)
      } else if (extent.y > extent.x * 1.8) {
        holder.rotation.z = -0.6
        holder.updateMatrixWorld(true)
        box.setFromObject(holder)
        box.getSize(extent)
      }
      if (!box.isEmpty()) {
        box.getCenter(centre)
        holder.position.set(-centre.x, -centre.y, -centre.z)
        // Frame the visible extent (x/y) with a small margin; depth only moves the camera back.
        const half = Math.max(0.03, extent.x, extent.y) / 2
        camera.position.set(0, 0, (half / tanHalf) * 1.12 + extent.z / 2)
        camera.lookAt(0, 0, 0)
        renderer.render(scene, camera)
        const src = canvas.toDataURL('image/png')
        pictures.set(id, src)
        swap(id, src)
      }
      scene.remove(holder)
      model.dispose()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } catch (err) {
    console.warn('[anima-front] antique thumbnails unavailable', err)
  } finally {
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
