/**
 * Review cells for props and projectile looks.
 *
 *   ?prop=lighthouse&state=0.5&life=10&t=3&health=0.4&angle=30     ?sheet=props (state, life, health apply to all)
 *   ?sheet=propviews&prop=hermit   one prop from 0°, 45°, 90°, 180° and 270°
 *   ?sheet=propstates   frog life ending, hermit / lighthouse damage, node closed / exposed, cart progress,
 *                       target still / moving, honey / leaf / decoy
 *   ?shot=pillbug&speed=90&angle=70                                ?sheet=shots (bg=dark recommended)
 *   ?sheet=shotrow      every shot in flight seen from 20 m (readability), bg=dark recommended
 */
import * as THREE from 'three'
import { ITEM_IDS } from '../data/items'
import type { ModelKit } from '../models/api'
import type { PropModelExt } from '../models/props'
import type { PropKind, ShotKind } from '../sim/types'
import { fitCamera, num, params, stage, view, type Cell } from './stage'

/** Prop kinds the renderer asks the kit for (zone/base/ink/puddle are drawn by the renderer itself). */
export const PROP_KINDS: PropKind[] = [
  'frog',
  'pad',
  'hermit',
  'honey',
  'leafDecoy',
  'decoy',
  'lighthouse',
  'cart',
  'node',
  'target',
  'tutorial'
]

export const SHOT_KINDS: ShotKind[] = [...ITEM_IDS, 'acid', 'laser', 'plasma', 'missile', 'acidRain']

export interface PropCellOpts {
  state?: number
  life?: number
  t?: number
  health?: number
  angle?: number
  live?: boolean
  label?: string
  sub?: string
}

/** Bounds of the solid meshes (render-side light cards and beams excluded). */
function solidBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  root.updateMatrixWorld(true)
  const visit = (o: THREE.Object3D) => {
    if (o.userData.extra) return
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.geometry.computeBoundingBox()
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld))
    }
    for (const c of o.children) visit(c)
  }
  visit(root)
  return box
}

export function propCell(kit: ModelKit, kind: PropKind, o: PropCellOpts = {}): Cell {
  const prop = kit.createProp(kind) as PropModelExt
  const box = solidBox(prop.root)
  const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3())
  const radius = Math.max(size.x, size.z, 0.6) * 0.75
  const scene = stage(Math.max(1.5, radius * 1.4))
  prop.root.traverse((obj) => {
    obj.castShadow = true
    obj.receiveShadow = true
  })
  const holder = new THREE.Group()
  holder.rotation.y = ((o.angle ?? num('angle', 30)) * Math.PI) / 180
  holder.add(prop.root)
  scene.add(holder)
  if (o.health !== undefined) prop.setHealth?.(o.health)
  // The cell starts a little before the requested time so the static draw (stepped by main.ts) lands near it.
  let t = Math.max(0, (o.t ?? num('t', 2)) - 1.2)
  const state = o.state ?? 0
  const lifeAt = (tt: number) => (o.life === undefined ? undefined : Math.max(0, o.life - (tt - (o.t ?? num('t', 2)))))
  prop.update(1 / 60, t, state, lifeAt(t))
  const h = Math.max(size.y, 0.5)
  const camera = fitCamera(Math.max(h, Math.max(size.x, size.z) * 0.9) * 1.25, h * 0.5, 1.05, 0.2)
  return {
    scene,
    camera,
    label: o.label ?? kind,
    sub: o.sub ?? `state ${state}${o.life !== undefined ? ` · life ${o.life}` : ''}`,
    step(dt) {
      t += dt
      prop.update(dt, t, state, lifeAt(t))
    }
  }
}

export function shotCell(kit: ModelKit, kind: ShotKind, o: { speed?: number; angle?: number } = {}): Cell {
  const look = kit.shotLook(kind)
  const scene = stage(0.6, { floor: false })
  const mesh = new THREE.InstancedMesh(look.geometry, look.material, 1)
  const holder = new THREE.Group()
  holder.rotation.y = ((o.angle ?? num('angle', 70)) * Math.PI) / 180
  holder.add(mesh)
  scene.add(holder)
  const k = Math.min(1, (o.speed ?? 90) / 90)
  mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(1, 1, 1 + (look.stretch - 1) * k))
  mesh.instanceMatrix.needsUpdate = true
  look.geometry.computeBoundingSphere()
  const r = Math.max(look.geometry.boundingSphere?.radius ?? 0.1, 0.05) * Math.max(1, 1 + (look.stretch - 1) * k)
  const camera = fitCamera(r * 2.4, 0, 1.0, 0.25)
  const tri = (look.geometry.index?.count ?? look.geometry.getAttribute('position').count) / 3
  return { scene, camera, label: kind, sub: `${tri} tris · stretch ${look.stretch}`, step() {} }
}

/** Every shot kind flying across the view, seen from 20 m (with the renderer's stretch at each kind's speed). */
function shotRowCell(kit: ModelKit): Cell {
  const scene = stage(30, { floor: false })
  const cols = 10
  const speedOf = (k: ShotKind) =>
    k === 'owl' ? 400 : k === 'bee' ? 140 : k === 'pillbug' || k === 'octopus' || k === 'acid' ? 20 : 90
  SHOT_KINDS.forEach((kind, i) => {
    const look = kit.shotLook(kind)
    const mesh = new THREE.InstancedMesh(look.geometry, look.material, 1)
    const x = ((i % cols) - (cols - 1) / 2) * 1.2
    const y = (Math.floor(SHOT_KINDS.length / cols) / 2 - Math.floor(i / cols)) * 1.1
    const k = Math.min(1, speedOf(kind) / 90)
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - 0.35),
      new THREE.Vector3(1, 1, 1 + (look.stretch - 1) * k)
    )
    mesh.setMatrixAt(0, m)
    mesh.instanceMatrix.needsUpdate = true
    scene.add(mesh)
  })
  const camera = new THREE.PerspectiveCamera(60, view.cellW / view.cellH, 0.1, 100)
  camera.position.set(0, 0, 20)
  camera.lookAt(0, 0, 0)
  return { scene, camera, label: 'shots @ 20 m', sub: 'FOV 60°', step() {} }
}

function propStateCells(kit: ModelKit): Cell[] {
  const c = (kind: PropKind, label: string, o: PropCellOpts) => propCell(kit, kind, { ...o, label, sub: o.sub ?? '' })
  return [
    c('frog', 'frog 出現直後', { t: 0.2, life: 19.8, sub: 't 0.2' }),
    c('frog', 'frog しゃがみ', { t: 3.42, life: 16, sub: 'squash-ready' }),
    c('frog', 'frog 残り1.5秒', { t: 18.5, life: 1.5, sub: 'blink' }),
    c('frog', 'frog 消える直前', { t: 19.85, life: 0.15, sub: 'shrink' }),
    c('hermit', 'hermit 健在', { life: 20 }),
    c('hermit', 'hermit 損傷 40%', { life: 20, health: 0.4 }),
    c('hermit', 'hermit 残り2秒', { life: 2, t: 23 }),
    c('honey', 'honey 残り1秒', { life: 1, t: 7 }),
    c('lighthouse', 'lighthouse 健在', { health: 1 }),
    c('lighthouse', 'lighthouse 50%', { health: 0.5 }),
    c('lighthouse', 'lighthouse 15%', { health: 0.15 }),
    c('node', 'node 閉じた', { state: 0, t: 3 }),
    c('node', 'node 露出', { state: 1, t: 3 }),
    c('cart', 'cart 出発', { state: 0 }),
    c('cart', 'cart 進行 0.37', { state: 0.37 }),
    c('target', 'target 固定', { state: 0 }),
    c('target', 'target 移動', { state: 1, t: 2.3 }),
    c('tutorial', 'tutorial', { state: 2 }),
    c('leafDecoy', 'leafDecoy', { life: 3 }),
    c('decoy', 'decoy', { life: 4 })
  ]
}

export function propCells(kit: ModelKit, sheet: string | null): { cells: Cell[]; cols: number } | null {
  const health = params.has('health') ? num('health', 1) : undefined
  if (sheet === 'props')
    return {
      cells: PROP_KINDS.map((k) =>
        propCell(kit, k, {
          state: num('state', 0),
          life: params.has('life') ? num('life', 10) : undefined,
          health
        })
      ),
      cols: 4
    }
  if (sheet === 'propstates') return { cells: propStateCells(kit), cols: 5 }
  const prop = params.get('prop') as PropKind | null
  if (sheet === 'propviews' && prop)
    return {
      cells: [0, 45, 90, 180, 270].map((angle) =>
        propCell(kit, prop, {
          state: num('state', 0),
          life: params.has('life') ? num('life', 0) : undefined,
          health,
          angle,
          sub: `${angle}°`
        })
      ),
      cols: 5
    }
  if (sheet === 'shots') return { cells: SHOT_KINDS.map((k) => shotCell(kit, k, { speed: num('speed', 90) })), cols: 8 }
  if (sheet === 'shotrow') return { cells: [shotRowCell(kit)], cols: 1 }
  if (!sheet && prop)
    return {
      cells: [
        propCell(kit, prop, {
          state: num('state', 0),
          life: params.has('life') ? num('life', 0) : undefined,
          health,
          live: true
        })
      ],
      cols: 1
    }
  const shot = params.get('shot') as ShotKind | null
  if (!sheet && shot) return { cells: [shotCell(kit, shot, { speed: num('speed', 90) })], cols: 1 }
  return null
}
