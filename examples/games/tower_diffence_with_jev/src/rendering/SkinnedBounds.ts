import * as THREE from 'three'

const components = ['getX', 'getY', 'getZ', 'getW'] as const
function standard(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): boolean {
  const prototype =
    attribute instanceof THREE.InterleavedBufferAttribute
      ? THREE.InterleavedBufferAttribute.prototype
      : attribute instanceof THREE.BufferAttribute
        ? THREE.BufferAttribute.prototype
        : undefined
  return !!prototype && components.every((key) => attribute![key] === prototype[key])
}

/** Keep Three's first posed sphere and arithmetic order; reuse only its bone matrix products. */
export function reuseSkinnedBoundsMatrices(mesh: THREE.SkinnedMesh): void {
  const original = mesh.computeBoundingSphere
  if (original !== THREE.SkinnedMesh.prototype.computeBoundingSphere) return
  mesh.computeBoundingSphere = function () {
    const { geometry, skeleton } = this
    if (
      this.getVertexPosition !== THREE.SkinnedMesh.prototype.getVertexPosition ||
      this.applyBoneTransform !== THREE.SkinnedMesh.prototype.applyBoneTransform ||
      !standard(geometry.attributes.position) ||
      !standard(geometry.attributes.skinIndex) ||
      !standard(geometry.attributes.skinWeight) ||
      !(geometry.morphAttributes.position ?? []).every(standard)
    ) {
      original.call(this)
      return
    }
    const palette: THREE.Matrix4[] = []
    const vertex = new THREE.Vector3(),
      base = new THREE.Vector3(),
      transformed = new THREE.Vector3()
    const indices = new THREE.Vector4(),
      weights = new THREE.Vector4()
    this.boundingSphere ??= new THREE.Sphere()
    this.boundingSphere.makeEmpty()
    for (let index = 0; index < geometry.attributes.position.count; index++) {
      // The base Mesh method includes authored relative/absolute morph targets.
      THREE.Mesh.prototype.getVertexPosition.call(this, index, vertex)
      indices.fromBufferAttribute(geometry.attributes.skinIndex as THREE.BufferAttribute, index)
      weights.fromBufferAttribute(geometry.attributes.skinWeight as THREE.BufferAttribute, index)
      base.copy(vertex).applyMatrix4(this.bindMatrix)
      vertex.set(0, 0, 0)
      for (let influence = 0; influence < 4; influence++) {
        const weight = weights.getComponent(influence)
        if (weight !== 0) {
          const bone = indices.getComponent(influence)
          const matrix = (palette[bone] ??= new THREE.Matrix4().multiplyMatrices(
            skeleton.bones[bone].matrixWorld,
            skeleton.boneInverses[bone]
          ))
          vertex.addScaledVector(transformed.copy(base).applyMatrix4(matrix), weight)
        }
      }
      vertex.applyMatrix4(this.bindMatrixInverse)
      this.boundingSphere.expandByPoint(vertex)
    }
  }
}
