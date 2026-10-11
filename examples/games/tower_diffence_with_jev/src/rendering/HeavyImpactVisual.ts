import * as THREE from 'three'
import { heavyImpactGeometry, type HeavyImpactShape } from '../game/HeavyImpact'
import type { GameState } from '../game/model'

type AreaMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
interface AreaVisual {
  group: THREE.Group
  fill: AreaMesh
  edge: AreaMesh
  wave: AreaMesh
  sides: AreaMesh[]
  radius: number
}
const impactLifetime = 0.28

function material(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({ color, opacity, transparent: true, side: THREE.DoubleSide, depthWrite: false })
}
function createArea(shape: HeavyImpactShape): AreaVisual {
  const group = new THREE.Group(),
    angle = shape.kind === 'sector' ? shape.halfAngle : Math.PI,
    start = -angle,
    arc = 2 * angle,
    radius = shape.radius,
    fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 64, start, arc), material(0xdf7543, 0.12)),
    edge = new THREE.Mesh(new THREE.RingGeometry(radius - 2, radius, 64, 1, start, arc), material(0xffc782, 0.75)),
    wave = new THREE.Mesh(new THREE.RingGeometry(radius - 3, radius, 64, 1, start, arc), material(0xffedb5, 0.85)),
    sides: AreaMesh[] = []
  fill.name = 'heavy-impact-fill'
  edge.name = 'heavy-impact-edge'
  wave.name = 'heavy-impact-wave'
  edge.position.z = 0.01
  wave.position.z = 0.02
  group.add(fill, edge, wave)
  if (shape.kind === 'sector')
    for (const direction of [-angle, angle]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(radius, 1.5), material(0xffc782, 0.7))
      side.position.set((Math.cos(direction) * radius) / 2, (Math.sin(direction) * radius) / 2, 0.01)
      side.rotation.z = direction
      sides.push(side)
      group.add(side)
    }
  return { group, fill, edge, wave, sides, radius }
}

export class HeavyImpactVisual {
  private areas = new Map<string, AreaVisual>()
  constructor(private scene: THREE.Scene) {}

  render(state: Readonly<GameState>): void {
    const active = new Set<string>()
    if (state.phase === 'assault')
      for (const attack of state.attacks) {
        const shape = heavyImpactGeometry(attack),
          age = state.time - attack.impactAt,
          warning = attack.status === 'windup' && age < 0,
          impact = attack.status === 'hit' && attack.damageHit && age >= 0 && age < impactLifetime
        if (!shape || state.time < attack.startedAt || (!warning && !impact)) continue
        active.add(attack.id)
        let visual = this.areas.get(attack.id)
        if (!visual) {
          visual = createArea(shape)
          visual.group.name = `heavy-impact:${attack.id}`
          this.areas.set(attack.id, visual)
          this.scene.add(visual.group)
        }
        const { group, fill, edge, wave, sides } = visual,
          progress = Math.max(0, Math.min(1, (state.time - attack.startedAt) / (attack.impactAt - attack.startedAt))),
          fade = warning ? 1 : 1 - age / impactLifetime
        group.position.set(shape.origin.x, shape.origin.y, -7)
        group.rotation.z = shape.kind === 'sector' ? Math.atan2(shape.direction.y, shape.direction.x) : 0
        group.scale.setScalar(shape.radius / visual.radius)
        group.userData.shape = structuredClone(shape)
        group.userData.phase = warning ? 'warning' : 'impact'
        fill.material.color.setHex(warning ? 0xdf7543 : 0xffc778)
        fill.material.opacity = warning ? 0.08 + 0.08 * progress : 0.2 * fade
        edge.material.opacity = (warning ? 0.6 + 0.2 * progress : 0.85) * fade
        for (const side of sides) side.material.opacity = edge.material.opacity
        wave.visible = impact
        wave.scale.setScalar(0.3 + (age / impactLifetime) * 0.7)
        wave.material.opacity = 0.8 * fade
      }
    for (const [id, visual] of this.areas)
      if (!active.has(id)) {
        this.scene.remove(visual.group)
        visual.group.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            ;(object.material as THREE.Material).dispose()
          }
        })
        this.areas.delete(id)
      }
  }
}
