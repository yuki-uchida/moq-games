/**
 * Projectiles (ModelKit.shotLook, one InstancedMesh per ShotKind, stretched along velocity, with an additive glow
 * and trails) and anima shards (glowing motes that fly to their collector). No per-frame allocation.
 */
import * as THREE from 'three'
import type { ModelKit, ShotLook } from '../../models/api'
import type { ShotKind, View } from '../../sim/types'
import { Particle, SHAPE, type ParticleSystem } from '../fx/particles'
import { shotColor } from '../fx/tables'

const CAPACITY = 300
/** Speed (m/s) at which a shot reaches its full stretch. */
const FULL_STRETCH_SPEED = 90

interface ShotBatch {
  look: ShotLook
  mesh: THREE.InstancedMesh
  count: number
}

/** Shots that leave a smoke or spark trail. */
const TRAILS: Partial<Record<ShotKind, 'smoke' | 'spark' | 'acid'>> = {
  missile: 'smoke',
  hippo: 'smoke',
  pillbug: 'spark',
  swallow: 'spark',
  plasma: 'spark',
  acid: 'acid',
  acidRain: 'acid',
  octopus: 'acid'
}

export class Shots {
  readonly group = new THREE.Group()
  private readonly batches = new Map<ShotKind, ShotBatch>()
  private readonly shards: THREE.InstancedMesh
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly pos = new THREE.Vector3()
  private readonly scl = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly fwd = new THREE.Vector3(0, 0, 1)
  private readonly p = new Particle()
  private time = 0

  constructor(private readonly kit: ModelKit) {
    const geo = new THREE.OctahedronGeometry(0.11, 0)
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb45c).multiplyScalar(3) })
    this.shards = new THREE.InstancedMesh(geo, mat, 400)
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.shards.count = 0
    this.shards.frustumCulled = false
    this.group.add(this.shards)
  }

  private batch(kind: ShotKind): ShotBatch {
    let b = this.batches.get(kind)
    if (b) return b
    const look = this.kit.shotLook(kind)
    const mesh = new THREE.InstancedMesh(look.geometry, look.material, CAPACITY)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.name = `shot:${kind}`
    this.group.add(mesh)
    b = { look, mesh, count: 0 }
    this.batches.set(kind, b)
    return b
  }

  update(view: View, add: ParticleSystem, alpha: ParticleSystem, dt: number) {
    this.time += dt
    for (const b of this.batches.values()) b.count = 0
    for (const s of view.shots) {
      const b = this.batch(s.kind)
      if (b.count >= CAPACITY) continue
      const speed = Math.hypot(s.v[0], s.v[1], s.v[2])
      this.pos.set(s.p[0], s.p[1], s.p[2])
      if (speed > 1e-3)
        this.q.setFromUnitVectors(this.fwd, this.dir.set(s.v[0] / speed, s.v[1] / speed, s.v[2] / speed))
      else this.q.identity()
      const k = Math.min(1, speed / FULL_STRETCH_SPEED)
      this.scl.set(1, 1, 1 + (b.look.stretch - 1) * k)
      this.m.compose(this.pos, this.q, this.scl)
      b.mesh.setMatrixAt(b.count++, this.m)
      // Glow around every projectile (team colour for foes reads as hostile).
      const color = shotColor(s.kind)
      const g = this.p
        .reset()
        .at(s.p[0], s.p[1], s.p[2])
        .color(color, s.team === 'foe' ? 3 : 2.5)
      g.size =
        s.kind === 'hippo' || s.kind === 'plasma' || s.kind === 'missile'
          ? 0.55
          : s.kind === 'acid' || s.kind === 'acidRain'
            ? 0.4
            : 0.2
      g.shape = SHAPE.dot
      g.alpha = 0.9
      add.draw(g)
      const trail = TRAILS[s.kind]
      if (trail && Math.random() < dt * 40) {
        const t = this.p.reset().at(s.p[0], s.p[1], s.p[2])
        if (trail === 'smoke') {
          t.color(0xb8b0a8, 1).vel((Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4)
          t.size = 0.18
          t.sizeEnd = 0.6
          t.life = 0.8
          t.alpha = 0.55
          t.shape = SHAPE.smoke
          t.rot = Math.random() * 6
          alpha.add(t)
          const f = this.p.reset().at(s.p[0], s.p[1], s.p[2]).color(0xffa040, 4)
          f.size = 0.2
          f.sizeEnd = 0.05
          f.life = 0.12
          f.shape = SHAPE.dot
          add.add(f)
        } else if (trail === 'acid') {
          t.color(color, 1.6).vel(0, -0.5, 0)
          t.size = 0.12
          t.sizeEnd = 0.04
          t.life = 0.4
          t.shape = SHAPE.dot
          add.add(t)
        } else {
          t.color(color, 3).vel((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)
          t.size = 0.08
          t.sizeEnd = 0.01
          t.life = 0.3
          t.shape = SHAPE.star
          add.add(t)
        }
      }
    }
    for (const b of this.batches.values()) {
      b.mesh.count = b.count
      b.mesh.visible = b.count > 0
      if (b.count) {
        b.mesh.instanceMatrix.clearUpdateRanges()
        b.mesh.instanceMatrix.addUpdateRange(0, b.count * 16)
        b.mesh.instanceMatrix.needsUpdate = true
      }
    }
    // Shards: spinning motes with a glow; flying ones leave sparkles.
    let n = 0
    for (const sh of view.shards) {
      if (n >= 400) break
      const bob = sh.to ? 0 : Math.sin(this.time * 3 + sh.id) * 0.08
      this.pos.set(sh.p[0], sh.p[1] + 0.25 + bob, sh.p[2])
      this.q.setFromAxisAngle(this.fwd.set(0, 1, 0), this.time * 3 + sh.id)
      this.fwd.set(0, 0, 1)
      this.scl.setScalar(0.8 + Math.min(1, sh.amount / 6) * 0.6)
      this.m.compose(this.pos, this.q, this.scl)
      this.shards.setMatrixAt(n++, this.m)
      const g = this.p.reset().at(this.pos.x, this.pos.y, this.pos.z).color(0xffa040, 2.2)
      g.size = 0.35
      g.shape = SHAPE.dot
      g.alpha = 0.8
      add.draw(g)
      if (sh.to && Math.random() < dt * 30) {
        const t = this.p.reset().at(this.pos.x, this.pos.y, this.pos.z).color(0xffd27a, 3)
        t.size = 0.08
        t.sizeEnd = 0.01
        t.life = 0.3
        t.shape = SHAPE.star
        add.add(t)
      }
    }
    this.shards.count = n
    this.shards.visible = n > 0
    if (n) this.shards.instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const b of this.batches.values()) {
      this.group.remove(b.mesh)
      b.mesh.dispose()
    }
    this.batches.clear()
    this.shards.geometry.dispose()
    ;(this.shards.material as THREE.Material).dispose()
    this.shards.dispose()
  }
}
