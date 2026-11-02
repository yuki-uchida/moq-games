// Small three.js helpers for chapter scenery: a ground mesh from the active map's height grid (walls and
// furniture baked into it show up as blocks), a water plane, and the prop kit the house and town build with.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { CELL, TERRAIN, WATER_LEVEL, WORLD } from '../map'
import type { Rect } from './kit'
import type { Scenery, SceneryState, SceneryView } from '../story'

type V3 = [number, number, number]

/**
 * Builds static scenery for the active map: the height grid coloured by `colorAt` (y is the vertex height) and
 * optional water planes at WATER_LEVEL. `update` is called every frame for any animation the stage adds.
 */
export function buildScenery(
  scene: THREE.Scene,
  options: {
    colorAt(x: number, z: number, y: number): string
    water?: Rect[]
    update?(state: SceneryState, view: SceneryView): void
  }
): Scenery & { root: THREE.Group } {
  const root = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const materials = new Map<string, THREE.Material>()
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

/**
 * Prop kit: builders add shared unit shapes to a group, then `bake` merges every static mesh into one vertex-coloured
 * mesh per finish (roughness, metalness, opacity, tag), so a whole chapter's furniture costs a handful of draw calls
 * however many colours it uses. `soft` boxes have bevelled edges at their true size.
 */
export class Kit {
  readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  readonly geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    sphere: new THREE.SphereGeometry(1, 10, 8),
    /** Fruit, pebbles, leaves: 36 triangles. */
    pebble: new THREE.SphereGeometry(1, 6, 4),
    lump: new THREE.IcosahedronGeometry(1, 1),
    cone: new THREE.ConeGeometry(1, 1, 8),
    pyramid: new THREE.ConeGeometry(1, 1, 4),
    frustum: new THREE.CylinderGeometry(0.55, 1, 1, 12),
    torus: new THREE.TorusGeometry(1, 0.3, 6, 16),
    /** Thin hoops: wheels, rims. */
    ring: new THREE.TorusGeometry(1, 0.08, 4, 20),
    /** A gable: a triangular prism along z, base 1 wide at y = 0 and the ridge at y = 1. */
    gable: new THREE.CylinderGeometry(1, 1, 1, 3)
      .rotateX(-Math.PI / 2)
      .translate(0, 0.5, 0)
      .scale(1 / Math.sqrt(3), 2 / 3, 1)
  }
  private readonly softBoxes = new Map<string, THREE.BufferGeometry>()

  material(
    color: string,
    options: { roughness?: number; metal?: number; opacity?: number; tag?: string; side?: THREE.Side } = {}
  ) {
    const { roughness = 0.85, metal = 0, opacity = 1, tag = '', side = THREE.FrontSide } = options
    const key = `${color}:${roughness}:${metal}:${opacity}:${tag}:${side}`
    let material = this.materials.get(key)
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: metal,
        flatShading: true,
        transparent: opacity < 1,
        opacity,
        side
      })
      material.name = tag
      this.materials.set(key, material)
    }
    return material
  }

  add(
    parent: THREE.Object3D,
    shape: keyof Kit['geometry'] | 'soft',
    color: string | THREE.Material,
    [x, y, z]: V3,
    [sx, sy, sz]: V3,
    [rx, ry, rz]: V3 = [0, 0, 0]
  ) {
    const soft = shape === 'soft'
    const mesh = new THREE.Mesh(
      soft ? this.softBox(sx, sy, sz) : this.geometry[shape],
      typeof color === 'string' ? this.material(color) : color
    )
    mesh.position.set(x, y, z)
    if (!soft) mesh.scale.set(sx, sy, sz)
    mesh.rotation.set(rx, ry, rz)
    // Small parts (fruit, cans, knobs) skip the shadow pass: their shadows barely show and cost a second draw.
    mesh.castShadow = Math.max(sx, sy, sz) >= 0.6
    parent.add(mesh)
    return mesh
  }

  /** A box by its floor rect and height range (walls, floors, furniture blocks). */
  block(
    parent: THREE.Object3D,
    color: string | THREE.Material,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    y0: number,
    y1: number,
    shape: 'box' | 'soft' = 'box'
  ) {
    return this.add(
      parent,
      shape,
      color,
      [(minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2],
      [maxX - minX, y1 - y0, maxZ - minZ]
    )
  }

  /** A box with bevelled edges (two facets each), built at its size: a scaled unit box would stretch the bevels. */
  private softBox(w: number, h: number, d: number) {
    const key = `${w}:${h}:${d}`
    let geometry = this.softBoxes.get(key)
    if (!geometry)
      this.softBoxes.set(
        key,
        (geometry = mergeVertices(new RoundedBoxGeometry(w, h, d, 1, Math.min(0.2, Math.min(w, h, d) * 0.3))))
      )
    return geometry
  }

  /**
   * Merges every mesh under `root` (world transforms baked in) into one mesh per finish and shadow casting, each
   * part's colour baked into its vertices. Parts that already carry vertex colours (models built elsewhere, like
   * cars) keep them.
   */
  bake(root: THREE.Object3D): THREE.Group {
    root.updateMatrixWorld(true)
    const byFinish = new Map<string, { material: THREE.MeshStandardMaterial; parts: THREE.BufferGeometry[] }>()
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const source = object.material as THREE.MeshStandardMaterial
      const { roughness, metalness, opacity, flatShading, side, name } = source
      const key = `baked:${roughness}:${metalness}:${opacity}:${flatShading}:${side}:${name}`
      let finish = this.materials.get(key)
      if (!finish) {
        finish = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness,
          metalness,
          flatShading,
          side,
          transparent: opacity < 1,
          opacity
        })
        finish.name = name
        this.materials.set(key, finish)
      }
      // Indexed, so shared vertices are shaded once (a sphere has a quarter of the vertices it would have unrolled).
      const geometry = (object.geometry as THREE.BufferGeometry).clone().applyMatrix4(object.matrixWorld)
      if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()])
      if (!geometry.attributes.color) {
        const colors = new Float32Array(geometry.attributes.position.count * 3)
        for (let index = 0; index < colors.length; index += 3) source.color.toArray(colors, index)
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      }
      const group = `${key}:${object.castShadow}`
      const entry = byFinish.get(group)
      if (entry) entry.parts.push(geometry)
      else byFinish.set(group, { material: finish, parts: [geometry] })
    })
    const baked = new THREE.Group()
    for (const [group, { material, parts }] of byFinish) {
      const merged = mergeGeometries(parts)
      parts.forEach((part) => part.dispose())
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = group.endsWith('true') && !material.transparent
      mesh.receiveShadow = true
      baked.add(mesh)
    }
    return baked
  }

  dispose() {
    Object.values(this.geometry).forEach((geometry) => geometry.dispose())
    this.softBoxes.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
  }
}

/** Two roof boards meeting at a ridge along z, `rise` above the eaves at `y` and `half` either side of x. */
export function gableRoof(
  kit: Kit,
  parent: THREE.Object3D,
  color: string | THREE.Material,
  [x, y, z]: V3,
  half: number,
  rise: number,
  length: number,
  overhang = 0.4,
  thick = 0.25
) {
  const slope = Math.atan2(rise, half)
  const run = Math.hypot(half, rise) + overhang
  for (const side of [-1, 1]) {
    // From just past the ridge down past the eave, lifted by half the board's thickness.
    const along = (run - 0.05) / 2
    kit.add(
      parent,
      'box',
      color,
      [
        x + side * (Math.cos(slope) * along + (Math.sin(slope) * thick) / 2),
        y + rise - Math.sin(slope) * along + (Math.cos(slope) * thick) / 2,
        z
      ],
      [run + 0.05, thick, length + overhang * 2],
      [0, 0, -side * slope]
    )
  }
}
