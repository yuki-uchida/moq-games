import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { separateFeet } from '../src/rendering/ModelAssetCache'

/** Two boots joined like the Archer/Frost exports: a welded sole strip and a stray cap skinned to the other foot. */
function boots() {
  const pelvis = new THREE.Bone(),
    footL = new THREE.Bone(),
    footR = new THREE.Bone()
  pelvis.name = 'pelvis'
  footL.name = 'footL'
  footR.name = 'footR'
  footL.position.x = 1
  footR.position.x = -1
  pelvis.add(footL, footR)
  // Vertex 0 is the pelvis. Each boot is a fan of 12 vertices attached to the pelvis.
  const positions = [0, 2, 0],
    joints = [0],
    indices: number[] = []
  const boot = (x: number, joint: number) => {
    const first = joints.length
    for (let i = 0; i < 12; i++) {
      positions.push(x + 0.4 * Math.cos(i / 2), 0, 0.4 * Math.sin(i / 2))
      joints.push(joint)
      if (i) indices.push(first, first + i - 1, first + i)
    }
    indices.push(0, first, first + 1)
    return first
  }
  const left = boot(1, 1),
    right = boot(-1, 2)
  // A sole strip welded across both boots (2 left corners, 1 right).
  indices.push(left + 2, left + 3, right + 2)
  // A stray two-vertex cap on the left boot, skinned to the right foot.
  positions.push(1.2, 0, 0.6, 1.5, 0, 0.5)
  joints.push(2, 2)
  indices.push(left + 4, joints.length - 2, joints.length - 1)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints.flatMap((j) => [j, 0, 0, 0]), 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(joints.flatMap(() => [1, 0, 0, 0]), 4))
  geometry.setIndex(indices)
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial())
  mesh.add(pelvis)
  mesh.bind(new THREE.Skeleton([pelvis, footL, footR]))
  const scene = new THREE.Group()
  scene.add(mesh)
  return { scene, mesh }
}
const side = (mesh: THREE.SkinnedMesh, v: number) => mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getX(v)].name

describe('separateFeet', () => {
  it('re-skins a stray cap to its boot and unwelds triangles spanning both feet', () => {
    const { scene, mesh } = boots()
    const indexCount = mesh.geometry.index!.count
    expect(separateFeet(scene)).toEqual({ resided: 2, split: 1, collapsed: 0 })
    // The cap now follows the left foot it sits on.
    expect([side(mesh, 25), side(mesh, 26)]).toEqual(['footL', 'footL'])
    // No triangle spans both feet; the strip's right corner became a left-skinned copy.
    const index = mesh.geometry.index!
    expect(index.count).toBe(indexCount)
    for (let f = 0; f < index.count; f += 3) {
      const feet = new Set([0, 1, 2].map((c) => side(mesh, index.getX(f + c))).filter((n) => n !== 'pelvis'))
      expect(feet.size).toBeLessThanOrEqual(1)
    }
    expect(mesh.geometry.attributes.position.count).toBe(28)
    expect(side(mesh, index.getX(index.count - 4))).toBe('footL')
    // Boots that only touch through the pelvis are untouched; a second pass is a no-op.
    expect(separateFeet(scene)).toEqual({ resided: 0, split: 0, collapsed: 0 })
  })
})
