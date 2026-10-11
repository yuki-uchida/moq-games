import * as THREE from 'three'
import { attackSplash, type GameState } from '../game/model'

type SplashMesh = THREE.Mesh<THREE.CircleGeometry | THREE.RingGeometry, THREE.MeshBasicMaterial>
interface SplashVisual {
  group: THREE.Group
  fill: SplashMesh
  edge: SplashMesh
  radius: number
}
const impactLifetime = 0.28

function material(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false, side: THREE.DoubleSide })
}

export class DragonSplashVisual {
  private impacts = new Map<string, SplashVisual>()

  constructor(private scene: THREE.Scene) {}

  render(state: Readonly<GameState>): void {
    const active = new Set<string>()
    if (state.phase === 'assault')
      for (const attack of state.attacks) {
        const age = state.time - attack.impactAt
        if (
          (attack.battlefieldVersion !== 2 && attack.geometryScale !== 2) ||
          attack.type !== 'dragon' ||
          !attack.projectile ||
          attack.breath ||
          attack.base ||
          attack.barrierId !== undefined ||
          attack.targetId === undefined ||
          !attack.damageActive ||
          !attack.damageHit ||
          attack.status !== 'hit' ||
          age < 0 ||
          age >= impactLifetime - 1e-9
        )
          continue
        const radius = attackSplash(attack.type, !!attack.boss, attack.battlefieldVersion, attack.geometryScale ?? 1)
        active.add(attack.id)
        let visual = this.impacts.get(attack.id)
        if (!visual) {
          const group = new THREE.Group(),
            fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), material(0xfda95c, 0.12)),
            edge = new THREE.Mesh(new THREE.RingGeometry(radius - 2, radius, 64), material(0xffd49b, 0.65))
          group.name = `dragon-splash:${attack.id}`
          fill.name = 'dragon-splash-fill'
          edge.name = 'dragon-splash-edge'
          edge.position.z = 0.01
          group.add(fill, edge)
          visual = { group, fill, edge, radius }
          this.impacts.set(attack.id, visual)
          this.scene.add(group)
        }
        const fade = 1 - age / impactLifetime
        visual.group.position.set(attack.target.x, attack.target.y, -6.8)
        visual.group.scale.setScalar(radius / visual.radius)
        visual.group.userData.radius = radius
        visual.fill.material.opacity = 0.12 * fade
        visual.edge.material.opacity = 0.65 * fade
      }
    for (const id of this.impacts.keys()) if (!active.has(id)) this.remove(id)
  }

  private remove(id: string): void {
    const visual = this.impacts.get(id)
    if (!visual) return
    this.scene.remove(visual.group)
    for (const mesh of [visual.fill, visual.edge]) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    this.impacts.delete(id)
  }

  dispose(): void {
    for (const id of this.impacts.keys()) this.remove(id)
  }
}
