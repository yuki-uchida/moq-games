/**
 * A rotating 3D preview on a plinth: an animal holding antiques, a single antique, or a foe. Drag to rotate.
 * Falls back to nothing (the caller keeps its SVG badge) when WebGL is unavailable.
 */
import * as THREE from 'three'
import type { FoeKind } from '../data/enemies'
import { FOES } from '../data/enemies'
import type { ItemId } from '../data/items'
import { SPECIES, type SpeciesId } from '../data/species'
import type { BossModel, CharacterModel, FoeRig, ItemModel, ModelKit } from '../models/api'
import { createPlinth, createStage, idlePose, type Stage } from './stage3d'

export interface Turntable {
  readonly canvas: HTMLCanvasElement
  readonly ok: boolean
  showCharacter(species: SpeciesId, r: ItemId | null, l: ItemId | null): void
  showItem(id: ItemId): void
  showFoe(kind: FoeKind): void
  /** Advances rotation/animation and draws (call from the screen's frame). */
  frame(dt: number): void
  dispose(): void
}

export function createTurntable(kit: ModelKit, o: { className?: string; distance?: number } = {}): Turntable {
  const canvas = document.createElement('canvas')
  canvas.className = o.className ?? 'turntable'
  canvas.setAttribute('aria-hidden', 'true')
  let stage: Stage | null = null
  try {
    stage = createStage(canvas, { fov: 30, alpha: true })
  } catch (err) {
    console.warn('[anima-front] turntable unavailable', err)
  }
  const pivot = new THREE.Group()
  const plinth = createPlinth(0.9)
  if (stage) {
    stage.scene.add(plinth, pivot)
  }
  let character: { model: CharacterModel; pose: ReturnType<typeof idlePose> } | null = null
  let item: ItemModel | null = null
  let foe: { rig: FoeRig; meshes: THREE.Object3D[]; mats: THREE.Matrix4[]; kind: FoeKind; boss?: BossModel } | null =
    null
  let angle = 0.4
  let spin = 0.45
  let dragging = false
  let lastX = 0
  let time = 0
  let target = new THREE.Vector3(0, 0.6, 0)
  let dist = o.distance ?? 4

  const clearContent = () => {
    if (character) {
      pivot.remove(character.model.root)
      character.model.dispose()
      character = null
    }
    if (item) {
      pivot.remove(item.root)
      item.dispose()
      item = null
    }
    if (foe) {
      for (const m of foe.meshes) pivot.remove(m)
      foe.boss?.dispose()
      foe = null
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true
    lastX = e.clientX
    canvas.setPointerCapture?.(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return
    angle += (e.clientX - lastX) * 0.012
    lastX = e.clientX
  })
  const end = () => (dragging = false)
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', end)

  return {
    canvas,
    ok: !!stage,
    showCharacter(species, r, l) {
      if (!stage) return
      if (character && character.model.species === species) {
        character.pose = idlePose(r, l)
        return
      }
      clearContent()
      try {
        const model = kit.createCharacter(species, { outline: true })
        pivot.add(model.root)
        character = { model, pose: idlePose(r, l) }
        const hgt = SPECIES[species].height
        target = new THREE.Vector3(0, hgt * 0.55, 0)
        dist = (o.distance ?? 4) * Math.max(0.8, hgt / 1.2)
        plinth.scale.setScalar(1)
        plinth.visible = true
      } catch (err) {
        console.warn('[anima-front] character preview failed', err)
      }
    },
    showItem(id) {
      if (!stage) return
      clearContent()
      try {
        item = kit.createItem(id)
        const box = new THREE.Box3().setFromObject(item.root)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const s = 0.9 / Math.max(0.2, size.length())
        item.root.scale.setScalar(s)
        item.root.position.set(-center.x * s, 0.45 - center.y * s, -center.z * s)
        pivot.add(item.root)
        target = new THREE.Vector3(0, 0.45, 0)
        dist = 1.9
        plinth.scale.setScalar(0.62)
        plinth.visible = true
      } catch (err) {
        console.warn('[anima-front] item preview failed', err)
      }
    },
    showFoe(kind) {
      if (!stage) return
      clearContent()
      const def = FOES[kind]
      try {
        if (def.boss) {
          // Bosses are large: show the crowd-rig stand-in scaled down (the boss model is huge).
          const boss = kit.createBoss(kind as 'kuitsukushi' | 'goutetsu')
          const s = 1.6 / def.height
          boss.root.scale.setScalar(s)
          pivot.add(boss.root)
          foe = { rig: { kind, parts: [], pose() {} }, meshes: [boss.root], mats: [], kind, boss }
          target = new THREE.Vector3(0, 0.8, 0)
          dist = 4.2
        } else {
          const rig = kit.foeRig(kind)
          const meshes = rig.parts.map((p) => {
            const m = new THREE.Mesh(p.geometry, p.material)
            m.matrixAutoUpdate = false
            pivot.add(m)
            return m
          })
          const s = 1.2 / Math.max(def.height, def.radius * 2)
          pivot.scale.setScalar(1)
          foe = { rig, meshes, mats: rig.parts.map(() => new THREE.Matrix4()), kind }
          for (const m of meshes) m.userData.scale = s
          target = new THREE.Vector3(0, (def.height * s) / 2 + (def.flying ? 0.4 : 0), 0)
          dist = 4.6
          plinth.scale.setScalar(1)
        }
        plinth.visible = true
      } catch (err) {
        console.warn('[anima-front] foe preview failed', err)
      }
    },
    frame(dt) {
      if (!stage) return
      time += dt
      const reduced = document.documentElement.classList.contains('reduced-motion')
      if (!dragging) angle += dt * spin * (reduced ? 0.3 : 1)
      pivot.rotation.y = angle
      if (character) character.model.update(dt, character.pose)
      if (item) item.update(dt, 'idle', 0)
      foe?.boss?.update(dt, { state: 'idle', st: time, time, speed: 0, seed: 0.3, hpFrac: 1 })
      if (foe && foe.rig.parts.length) {
        const def = FOES[foe.kind]
        foe.rig.pose({ state: 'idle', st: time, time, speed: 0, seed: 0.3, hpFrac: 1 }, foe.mats)
        ;(foe.meshes as THREE.Mesh[]).forEach((m, i) => {
          const s = m.userData.scale as number
          m.matrix.makeScale(s, s, s).multiply(foe!.mats[i])
          if (def.flying) m.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, 0.4, 0))
          m.matrixWorldNeedsUpdate = true
        })
      }
      // narrow canvases need more distance so the subject still fits horizontally
      const d = dist / Math.min(1, Math.max(0.35, stage.camera.aspect))
      stage.camera.position.set(0, target.y + d * 0.18, d)
      stage.camera.lookAt(target)
      stage.render()
    },
    dispose() {
      clearContent()
      stage?.dispose()
      canvas.remove()
    }
  }
}
