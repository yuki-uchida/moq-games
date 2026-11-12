/**
 * Placeholder foes, bosses, props and shot looks (primitive stand-ins) until they are sculpted with the SDF kit
 * (see README.md). They implement the full contract so the renderer can run.
 */
import * as THREE from 'three'
import { FOES, type FoeKind } from '../data/enemies'
import { ITEMS, type ItemId } from '../data/items'
import type { PropKind, ShotKind } from '../sim/types'
import type { BossModel, FoeAnim, FoeRig, PropModel, ShotLook } from './api'

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 })

export function placeholderRig(kind: FoeKind): FoeRig {
  const def = FOES[kind]
  const geometry = new THREE.SphereGeometry(1, 12, 8)
  const material = mat(def.faction === 'machine' ? 0xe8edf2 : 0x2a2340)
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  return {
    kind,
    parts: [{ name: 'body', geometry, material }],
    pose(anim: FoeAnim, out: THREE.Matrix4[]) {
      const r = def.radius
      const bob = Math.sin(anim.time * 6 + anim.seed * 10) * 0.05
      out[0].compose(p.set(0, def.height * 0.5 + bob, 0), q.identity(), s.set(r, def.height * 0.5, r))
    }
  }
}

export function placeholderBoss(kind: 'kuitsukushi' | 'goutetsu'): BossModel {
  const def = FOES[kind]
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(def.radius, def.radius, def.height, 16), mat(0x553366))
  mesh.position.y = def.height / 2
  root.add(mesh)
  return {
    root,
    kind,
    update() {},
    weakPoint: (out) => root.localToWorld(out.set(0, def.height * 0.6, def.radius)),
    dispose: () => mesh.geometry.dispose()
  }
}

export function placeholderProp(kind: PropKind): PropModel {
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat(0x88aacc))
  mesh.position.y = 0.4
  root.add(mesh)
  return { root, kind, update() {}, dispose: () => mesh.geometry.dispose() }
}

export function placeholderShot(kind: ShotKind): ShotLook {
  const color = kind in ITEMS ? ITEMS[kind as ItemId].color : 0xb388ff
  return {
    geometry: new THREE.SphereGeometry(0.08, 8, 6),
    material: new THREE.MeshBasicMaterial({ color }),
    stretch: 4
  }
}
