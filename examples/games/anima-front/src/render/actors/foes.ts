/**
 * Crowd foes: one InstancedMesh per rig part per kind (ModelKit.foeRig), posed every frame with smoothed facing;
 * dying foes play out, sink and shrink; hit flash and sonar tint through instance colours; revealed foes get an
 * additive silhouette drawn through walls. Bosses are full models (createBoss). No per-frame allocation.
 */
import * as THREE from 'three'
import { FOES, FOE_KINDS, type FoeKind } from '../../data/enemies'
import type { BossModel, FoeAnim, FoeRig, ModelKit } from '../../models/api'
import type { FoeView, View } from '../../sim/types'
import { angleDelta } from '../camera'

const CAPACITY = 160

interface KindBatch {
  rig: FoeRig
  meshes: THREE.InstancedMesh[]
  locals: THREE.Matrix4[]
  ghost: THREE.InstancedMesh
  count: number
  ghosts: number
}

interface FoeVis {
  yaw: number
  flash: number
  seen: number
  seed: number
  lastX: number
  lastZ: number
  speed: number
}

export class Foes {
  readonly group = new THREE.Group()
  private readonly batches = new Map<FoeKind, KindBatch>()
  private readonly vis = new Map<number, FoeVis>()
  private readonly bosses = new Map<number, BossModel>()
  private readonly anim: FoeAnim = { state: 'idle', st: 0, time: 0, speed: 0, seed: 0, hpFrac: 1 }
  private readonly root = new THREE.Matrix4()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly pos = new THREE.Vector3()
  private readonly scl = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly color = new THREE.Color()
  private readonly ghostGeo = new THREE.IcosahedronGeometry(1, 1)
  private readonly ghostMat = new THREE.MeshBasicMaterial({
    color: 0xc98aff,
    transparent: true,
    opacity: 0.38,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  })
  private frameId = 0

  constructor(private readonly kit: ModelKit) {}

  private batch(kind: FoeKind): KindBatch {
    let b = this.batches.get(kind)
    if (b) return b
    const rig = this.kit.foeRig(kind)
    const meshes = rig.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, CAPACITY)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.setColorAt(0, this.color.setRGB(1, 1, 1))
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage)
      mesh.count = 0
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.name = `foe:${kind}:${part.name}`
      this.group.add(mesh)
      return mesh
    })
    const ghost = new THREE.InstancedMesh(this.ghostGeo, this.ghostMat, CAPACITY)
    ghost.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    ghost.count = 0
    ghost.frustumCulled = false
    ghost.renderOrder = 30
    this.group.add(ghost)
    b = { rig, meshes, locals: rig.parts.map(() => new THREE.Matrix4()), ghost, count: 0, ghosts: 0 }
    this.batches.set(kind, b)
    return b
  }

  hit(id: number, amount: number) {
    const v = this.vis.get(id)
    if (v) v.flash = Math.max(v.flash, amount)
  }

  /** Weak point of a boss (world) for markers; false when the id is not a boss. */
  bossWeakPoint(id: number, out: THREE.Vector3): boolean {
    const b = this.bosses.get(id)
    if (!b) return false
    b.weakPoint(out)
    return true
  }

  update(view: View, dt: number) {
    this.frameId++
    for (const b of this.batches.values()) {
      b.count = 0
      b.ghosts = 0
    }
    const time = view.time
    for (const f of view.foes) {
      if (f.animal) continue
      const def = FOES[f.kind]
      let v = this.vis.get(f.id)
      if (!v) {
        v = {
          yaw: f.yaw,
          flash: 0,
          seen: 0,
          seed: ((f.id * 2654435761) >>> 0) / 4294967296,
          lastX: f.p[0],
          lastZ: f.p[2],
          speed: 0
        }
        this.vis.set(f.id, v)
      }
      v.seen = this.frameId
      if (dt > 0) {
        const s = Math.hypot(f.p[0] - v.lastX, f.p[2] - v.lastZ) / dt
        v.speed += (Math.min(30, s) - v.speed) * (1 - Math.exp(-10 * dt))
      }
      v.lastX = f.p[0]
      v.lastZ = f.p[2]
      if (f.state !== 'dying') v.yaw += angleDelta(v.yaw, f.yaw) * (1 - Math.exp(-(def.boss ? 3 : 12) * dt))
      v.flash = Math.max(0, v.flash - dt * 6)
      const a = this.anim
      a.state = f.state
      a.st = f.st
      a.time = time
      a.speed = v.speed
      a.seed = v.seed
      a.hpFrac = f.hp / Math.max(1, f.maxHp)
      a.attack = f.attack
      a.parts = f.parts
      if (def.boss) {
        this.boss(f, v, dt)
        continue
      }
      this.crowd(f, v)
    }
    for (const [kind, b] of this.batches) {
      for (const mesh of b.meshes) {
        mesh.count = b.count
        mesh.visible = b.count > 0
        if (b.count) {
          mesh.instanceMatrix.clearUpdateRanges()
          mesh.instanceMatrix.addUpdateRange(0, b.count * 16)
          mesh.instanceMatrix.needsUpdate = true
          mesh.instanceColor!.clearUpdateRanges()
          mesh.instanceColor!.addUpdateRange(0, b.count * 3)
          mesh.instanceColor!.needsUpdate = true
        }
      }
      b.ghost.count = b.ghosts
      b.ghost.visible = b.ghosts > 0
      if (b.ghosts) b.ghost.instanceMatrix.needsUpdate = true
      void kind
    }
    for (const [id, v] of this.vis) {
      if (v.seen === this.frameId) continue
      this.vis.delete(id)
      const boss = this.bosses.get(id)
      if (boss) {
        this.group.remove(boss.root)
        boss.dispose()
        this.bosses.delete(id)
      }
    }
  }

  private crowd(f: FoeView, v: FoeVis) {
    const b = this.batch(f.kind)
    if (b.count >= CAPACITY) return
    const def = FOES[f.kind]
    // Spawn: rise out of the ground (creatures) or drop in (machines); dying: sink and shrink.
    let sink = 0
    let scale = 1
    if (f.state === 'spawn') {
      const u = Math.min(1, f.st / 0.6)
      if (def.faction === 'creature') sink = -(1 - u) * def.height
      else sink = (1 - u) * (1 - u) * 8
      scale = 0.6 + 0.4 * u
    } else if (f.state === 'dying') {
      const u = Math.min(1, Math.max(0, (f.st - 0.25) / 0.5))
      scale = 1 - u * 0.85
      sink = -u * def.height * 0.4
      if (u >= 1) return
    }
    this.pos.set(f.p[0], f.p[1] + sink, f.p[2])
    this.q.setFromAxisAngle(this.up, v.yaw)
    this.scl.setScalar(scale)
    this.root.compose(this.pos, this.q, this.scl)
    b.rig.pose(this.anim, b.locals)
    const i = b.count++
    // Instance colour: flash white, revealed violet tint, shielded cyan.
    const fl = v.flash
    if (fl > 0) this.color.setRGB(1 + fl * 4, 1 + fl * 4, 1 + fl * 4)
    else if (f.shielded) this.color.setRGB(0.85, 1.15, 1.35)
    else this.color.setRGB(1, 1, 1)
    for (let k = 0; k < b.meshes.length; k++) {
      this.m.multiplyMatrices(this.root, b.locals[k])
      b.meshes[k].setMatrixAt(i, this.m)
      b.meshes[k].setColorAt(i, this.color)
    }
    if (f.revealed && b.ghosts < CAPACITY && f.state !== 'dying') {
      this.pos.set(f.p[0], f.p[1] + def.height * 0.5 + sink, f.p[2])
      this.scl.set(def.radius * 1.1, def.height * 0.55, def.radius * 1.1)
      this.m.compose(this.pos, this.q, this.scl)
      b.ghost.setMatrixAt(b.ghosts++, this.m)
    }
  }

  private boss(f: FoeView, v: FoeVis, dt: number) {
    let model = this.bosses.get(f.id)
    if (!model) {
      model = this.kit.createBoss(f.kind as 'kuitsukushi' | 'goutetsu')
      model.root.traverse((o) => {
        o.castShadow = true
        o.receiveShadow = true
      })
      this.bosses.set(f.id, model)
      this.group.add(model.root)
    }
    model.root.position.set(f.p[0], f.p[1], f.p[2])
    model.root.rotation.y = v.yaw
    model.update(dt, this.anim)
  }

  /** Kinds currently drawn (for stats/tests). */
  get activeKinds(): FoeKind[] {
    return FOE_KINDS.filter((k) => (this.batches.get(k)?.count ?? 0) > 0)
  }

  dispose() {
    for (const b of this.batches.values()) {
      for (const mesh of b.meshes) {
        this.group.remove(mesh)
        mesh.dispose()
      }
      this.group.remove(b.ghost)
      b.ghost.dispose()
    }
    this.batches.clear()
    for (const boss of this.bosses.values()) {
      this.group.remove(boss.root)
      boss.dispose()
    }
    this.bosses.clear()
    this.vis.clear()
    this.ghostGeo.dispose()
    this.ghostMat.dispose()
  }
}
