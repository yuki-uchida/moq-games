/**
 * Placeholder model kit (primitive stand-ins) until the SDF model kit is implemented (owned by the models
 * workstream, which replaces this file). Implements the full ModelKit contract so other layers can run.
 */
import * as THREE from 'three'
import type { FoeKind } from '../data/enemies'
import { FOES } from '../data/enemies'
import { ITEMS, type ItemId } from '../data/items'
import { SPECIES, type SpeciesId } from '../data/species'
import type { PropKind, ShotKind } from '../sim/types'
import type {
  BossModel,
  CharacterModel,
  CharacterPose,
  FoeAnim,
  FoeRig,
  ItemModel,
  ModelKit,
  PropModel,
  Quality,
  ShotLook
} from './api'

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 })

function placeholderCharacter(species: SpeciesId): CharacterModel {
  const def = SPECIES[species]
  const root = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(def.radius * 0.8, def.height * 0.35, 6, 12), mat(def.color))
  body.position.y = def.height * 0.35
  const head = new THREE.Mesh(new THREE.SphereGeometry(def.headRadius * 1.25, 16, 12), mat(def.color))
  head.position.y = def.height - def.headRadius
  root.add(body, head)
  return {
    root,
    species,
    update(_dt: number, _pose: CharacterPose) {},
    muzzle(hand, out) {
      return root.localToWorld(out.set(hand === 0 ? -0.35 : 0.35, def.height * 0.55, 0.5))
    },
    headTop(out) {
      return root.localToWorld(out.set(0, def.height + 0.2, 0))
    },
    setTeam() {},
    setLook() {},
    setPassives() {},
    setCloak() {},
    setFlash() {},
    setAnima() {},
    setHologram() {},
    dispose() {
      body.geometry.dispose()
      head.geometry.dispose()
    }
  }
}

function placeholderItem(id: ItemId): ItemModel {
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), mat(ITEMS[id].color))
  mesh.position.z = 0.2
  root.add(mesh)
  return { root, id, muzzle: new THREE.Vector3(0, 0, 0.45), update() {}, dispose: () => mesh.geometry.dispose() }
}

function placeholderRig(kind: FoeKind): FoeRig {
  const def = FOES[kind]
  const geometry = new THREE.SphereGeometry(1, 12, 8)
  const material = mat(def.faction === 'machine' ? 0xe8edf2 : 0x2a2340)
  return {
    kind,
    parts: [{ name: 'body', geometry, material }],
    pose(anim: FoeAnim, out: THREE.Matrix4[]) {
      const r = def.radius
      const bob = Math.sin(anim.time * 6 + anim.seed * 10) * 0.05
      out[0].compose(
        new THREE.Vector3(0, def.height * 0.5 + bob, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(r, def.height * 0.5, r)
      )
    }
  }
}

export function createModelKit(_options: { quality: Quality } = { quality: 'medium' }): ModelKit {
  return {
    async prepare(_request, onProgress) {
      onProgress?.(1)
    },
    createCharacter: (species) => placeholderCharacter(species),
    createItem: (item) => placeholderItem(item),
    foeRig: (kind) => placeholderRig(kind),
    createBoss(kind: 'kuitsukushi' | 'goutetsu'): BossModel {
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
    },
    createProp(kind: PropKind): PropModel {
      const root = new THREE.Group()
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat(0x88aacc))
      mesh.position.y = 0.4
      root.add(mesh)
      return { root, kind, update() {}, dispose: () => mesh.geometry.dispose() }
    },
    shotLook(kind: ShotKind): ShotLook {
      const color = kind in ITEMS ? ITEMS[kind as ItemId].color : 0xb388ff
      return {
        geometry: new THREE.SphereGeometry(0.08, 8, 6),
        material: new THREE.MeshBasicMaterial({ color }),
        stretch: 4
      }
    },
    dispose() {}
  }
}
