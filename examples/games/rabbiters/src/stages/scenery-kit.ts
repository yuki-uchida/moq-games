// Small three.js helpers for chapter scenery: a ground mesh from the active map's height grid (walls and
// furniture baked into it show up as blocks), merged boxes per colour, and a water plane.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CELL, TERRAIN, WATER_LEVEL, WORLD } from '../map'
import type { Rect } from './kit'
import type { Scenery, SceneryState, SceneryView } from '../story'

export type Box = { x: number; y: number; z: number; w: number; h: number; d: number; color: string; turn?: number }

const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/**
 * Builds static scenery for the active map: the height grid coloured by `colorAt` (y is the vertex height),
 * boxes merged into one mesh per colour (y is the box bottom), and optional water planes at WATER_LEVEL.
 * `update` is called every frame for any animation the stage adds.
 */
export function buildScenery(
  scene: THREE.Scene,
  options: {
    colorAt(x: number, z: number, y: number): string
    boxes?: Box[]
    water?: Rect[]
    update?(state: SceneryState, view: SceneryView): void
  }
): Scenery & { root: THREE.Group } {
  const root = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const materials = new Map<string, THREE.Material>()
  const material = (color: string) => {
    let found = materials.get(color)
    if (!found)
      materials.set(color, (found = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })))
    return found
  }
  const { nx, nz, heights } = TERRAIN
  const positions = new Float32Array(nx * nz * 3)
  const colors = new Float32Array(nx * nz * 3)
  const color = new THREE.Color()
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const index = j * nx + i
      const x = WORLD.minX + i * CELL
      const z = WORLD.minZ + j * CELL
      positions.set([x, heights[index], z], index * 3)
      color.set(options.colorAt(x, z, heights[index]))
      colors.set([color.r, color.g, color.b], index * 3)
    }
  const indices: number[] = []
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      // Same split as map.heightAt: (i, j)–(i+1, j+1) diagonal, wound to face up.
      indices.push(a, a + nx + 1, a + 1, a, a + nx, a + nx + 1)
    }
  const ground = new THREE.BufferGeometry()
  ground.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  ground.setIndex(indices)
  ground.computeVertexNormals()
  geometries.push(ground)
  const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })
  materials.set('ground', groundMaterial)
  const groundMesh = new THREE.Mesh(ground, groundMaterial)
  groundMesh.receiveShadow = true
  groundMesh.name = 'terrain'
  root.add(groundMesh)

  const byColor = new Map<string, THREE.BufferGeometry[]>()
  for (const box of options.boxes ?? []) {
    const part = unitBox
      .clone()
      .applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(box.x, box.y, box.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), box.turn ?? 0),
          new THREE.Vector3(box.w, box.h, box.d)
        )
      )
    const list = byColor.get(box.color)
    if (list) list.push(part)
    else byColor.set(box.color, [part])
  }
  for (const [key, parts] of byColor) {
    const merged = mergeGeometries(parts)
    parts.forEach((part) => part.dispose())
    geometries.push(merged)
    const mesh = new THREE.Mesh(merged, material(key))
    mesh.castShadow = mesh.receiveShadow = true
    root.add(mesh)
  }
  for (const rect of options.water ?? []) {
    const plane = new THREE.PlaneGeometry(rect.maxX - rect.minX, rect.maxZ - rect.minZ).rotateX(-Math.PI / 2)
    geometries.push(plane)
    if (!materials.has('water'))
      materials.set(
        'water',
        new THREE.MeshStandardMaterial({ color: '#4f8fa0', roughness: 0.3, transparent: true, opacity: 0.75 })
      )
    const mesh = new THREE.Mesh(plane, materials.get('water'))
    mesh.position.set((rect.minX + rect.maxX) / 2, WATER_LEVEL, (rect.minZ + rect.maxZ) / 2)
    root.add(mesh)
  }
  scene.add(root)
  return {
    root,
    update: (state, view) => options.update?.(state, view),
    dispose() {
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((entry) => entry.dispose())
      root.removeFromParent()
    }
  }
}
