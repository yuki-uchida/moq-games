import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { installOgreMaterialAdapter } from '../src/rendering/models/adapters/source/ogre-material-adapter.js'
function mesh(material: THREE.MeshStandardMaterial) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('_blinkrestposition', new THREE.Float32BufferAttribute([0, 0, 0], 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.75, 0.29, 0.15], 3))
  return new THREE.Mesh(geometry, material)
}
describe('Ogre authored skin color', () => {
  it('uses torso albedo without double tint and preserves arms and unrelated materials', () => {
    const source = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture(), vertexColors: true })
    source.name = 'Ogre_Blink_Surface'
    const armsSource = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })
    armsSource.name = 'Rebuilt Ogre skin from original albedo'
    const otherSource = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), vertexColors: true })
    otherSource.name = 'Soldier_Blink_Surface'
    const torso = mesh(source), arms = mesh(armsSource), other = mesh(otherSource)
    const root = new THREE.Group()
    root.add(torso, arms, other)
    const adapter = installOgreMaterialAdapter(root)
    expect(torso.material).not.toBe(source)
    expect(torso.material.vertexColors).toBe(false)
    expect(torso.material.map).toBe(source.map)
    expect(torso.material.normalMap).toBe(source.normalMap)
    expect(torso.material.roughnessMap).toBe(source.roughnessMap)
    expect(source.vertexColors).toBe(true)
    expect(arms.material).toBe(armsSource)
    expect(arms.material.vertexColors).toBe(true)
    expect(arms.material.roughness).toBe(0.55)
    expect(other.material).toBe(otherSource)
    expect(other.material.vertexColors).toBe(true)
    adapter.setBlinkAmount(0.5)
    adapter.dispose()
    expect(torso.material).toBe(source)
  })
  it('preserves untextured surfaces and isolates instances', () => {
    const source = new THREE.MeshStandardMaterial({ vertexColors: true })
    source.name = 'Ogre_Blink_Surface'
    const first = mesh(source), second = mesh(source)
    const a = installOgreMaterialAdapter(first), b = installOgreMaterialAdapter(second)
    expect(first.material.vertexColors).toBe(true)
    expect(second.material).not.toBe(first.material)
    a.dispose()
    expect(first.material).toBe(source)
    expect(second.material).not.toBe(source)
    b.dispose()
    expect(second.material).toBe(source)
  })
})
