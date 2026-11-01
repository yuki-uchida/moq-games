import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  BUSHES,
  CAVES,
  CHAMBER_RADIUS,
  FOODS,
  GRASS,
  LOGS,
  ROCKS,
  SHELTERS,
  SPAWN,
  TERRAIN,
  TREES,
  TUNNEL_DEPTH,
  TUNNEL_EDGES,
  TUNNEL_NODES,
  TUNNEL_RADIUS,
  WATER_LEVEL,
  WORLD,
  heightAt,
  slopeAt,
  smoothstep
} from './map'

/** Render-only randomness for decoration; gameplay never depends on it. */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

const CHUNK = 64 // instanced scenery and terrain are split into tiles so off-screen tiles are culled
const blade = new THREE.BufferGeometry().setAttribute(
  'position',
  new THREE.Float32BufferAttribute([-0.07, 0, 0, 0.07, 0, 0, 0, 1, 0], 3)
)
blade.computeVertexNormals()
const UNIT = {
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 9).translate(0, 0.5, 0),
  taper: new THREE.CylinderGeometry(0.6, 1, 1, 7).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  blade, // a single triangle: thousands of these stay cheap even on software WebGL
  bud: new THREE.OctahedronGeometry(1),
  lump: new THREE.IcosahedronGeometry(1, 0),
  rock: new THREE.DodecahedronGeometry(1, 0),
  sphere: new THREE.SphereGeometry(1, 14, 9),
  disc: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
  ring: new THREE.TorusGeometry(1, 0.28, 6, 18).rotateX(Math.PI / 2)
}

/**
 * Static scenery built once from the shared map: one terrain mesh from the exact height grid,
 * instanced vegetation and rocks, merged landmark/cave/log batches and the mole tunnels.
 */
export class WorldView {
  private readonly root = new THREE.Group()
  private readonly tunnels = new THREE.Group()
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly batches = new Map<string, THREE.BufferGeometry[]>()
  private readonly sway = { value: 0 }
  private readonly logMaterials: THREE.MeshStandardMaterial[] = []

  constructor(scene: THREE.Scene) {
    scene.add(this.root, this.tunnels)
    this.terrain()
    this.water()
    this.vegetation()
    this.stones()
    this.logs()
    this.caves()
    this.holes()
    this.landmarks()
    for (const [key, parts] of this.batches) {
      const geometry = this.keep(mergeGeometries(parts))
      parts.forEach((part) => part.dispose())
      const material = key.startsWith('log:')
        ? this.fading(key.slice(4))
        : key === 'dome'
          ? this.material('#857a6c', THREE.DoubleSide)
          : this.material(key)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = mesh.receiveShadow = true
      this.root.add(mesh)
    }
    this.batches.clear()
    this.tunnelInterior()
    this.tunnels.visible = false
  }

  private keep<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry)
    return geometry
  }

  private material(color: string, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
    const key = `${color}:${side}`
    let material = this.materials.get(key)
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, side })
      this.materials.set(key, material)
    }
    return material
  }

  /** Log parts fade out while the local rabbit hides underneath, so the camera can still see it. */
  private fading(color: string) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, transparent: true })
    this.materials.set(`log:${color}`, material)
    this.logMaterials.push(material)
    return material
  }

  /** Adds a transformed copy of a unit shape to the merged batch for `key` (a colour, 'dome' or 'log:colour'). */
  private part(
    key: string,
    shape: THREE.BufferGeometry,
    position: THREE.Vector3Like,
    scale: THREE.Vector3Like = { x: 1, y: 1, z: 1 },
    rotation: THREE.Euler | THREE.Quaternion = new THREE.Euler()
  ) {
    const quaternion = rotation instanceof THREE.Quaternion ? rotation : new THREE.Quaternion().setFromEuler(rotation)
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3().copy(position),
      quaternion,
      new THREE.Vector3().copy(scale)
    )
    const geometry = (shape.index ? shape.toNonIndexed() : shape.clone()).applyMatrix4(matrix)
    const list = this.batches.get(key)
    if (list) list.push(geometry)
    else this.batches.set(key, [geometry])
  }

  /** One InstancedMesh per 64 m tile, so the camera and the sun's shadow frustum skip far tiles. */
  private instanced(
    shape: THREE.BufferGeometry,
    material: THREE.Material,
    matrices: THREE.Matrix4[],
    colors?: THREE.Color[],
    castShadow = true
  ) {
    const tiles = new Map<number, number[]>()
    matrices.forEach((matrix, index) => {
      const key =
        Math.floor((matrix.elements[12] - WORLD.minX) / CHUNK) * 64 +
        Math.floor((matrix.elements[14] - WORLD.minZ) / CHUNK)
      const list = tiles.get(key)
      if (list) list.push(index)
      else tiles.set(key, [index])
    })
    for (const indices of tiles.values()) {
      const mesh = new THREE.InstancedMesh(shape, material, indices.length)
      indices.forEach((source, index) => {
        mesh.setMatrixAt(index, matrices[source])
        if (colors) mesh.setColorAt(index, colors[source])
      })
      mesh.castShadow = castShadow
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      this.root.add(mesh)
    }
  }

  private terrain() {
    const { nx, nz, heights } = TERRAIN
    const positions = new Float32Array(nx * nz * 3)
    const colors = new Float32Array(nx * nz * 3)
    const meadow = new THREE.Color('#8fae66')
    const lush = new THREE.Color('#79a05a')
    const forest = new THREE.Color('#6a8a4a')
    const sand = new THREE.Color('#dcc089')
    const plateau = new THREE.Color('#a9b56f')
    const rock = new THREE.Color('#8d7d68')
    const bank = new THREE.Color('#b2a57a')
    const bed = new THREE.Color('#7c7658')
    const caveFloor = new THREE.Color('#5d564e')
    const color = new THREE.Color()
    const jitter = random(7)
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const index = j * nx + i
        const x = WORLD.minX + i
        const z = WORLD.minZ + j
        const y = heights[index]
        positions.set([x, y, z], index * 3)
        color.copy(meadow).lerp(lush, (Math.sin(x * 0.07) * Math.cos(z * 0.06) + 1) * 0.3)
        color.lerp(forest, smoothstep(34, 46, z) * smoothstep(64, 52, x) * smoothstep(-52, -44, x))
        color.lerp(plateau, smoothstep(7, 8.5, y) * smoothstep(-100, -60, z) * 0.8)
        color.lerp(sand, smoothstep(46, 62, x + Math.sin(z * 0.08) * 6))
        if (y < WATER_LEVEL + 0.35) color.lerp(bank, smoothstep(WATER_LEVEL + 0.35, WATER_LEVEL, y))
        if (y < WATER_LEVEL - 0.2) color.lerp(bed, 0.8)
        color.lerp(rock, smoothstep(0.75, 1.4, slopeAt(x, z)))
        for (const cave of CAVES)
          if (Math.hypot(x - cave.x, z - cave.z) < cave.r)
            color.lerp(caveFloor, smoothstep(cave.r, cave.r - 2, Math.hypot(x - cave.x, z - cave.z)))
        const shade = 0.94 + jitter() * 0.1
        colors.set([color.r * shade, color.g * shade, color.b * shade], index * 3)
      }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })
    this.materials.set('terrain', material)
    for (let j0 = 0; j0 < nz - 1; j0 += CHUNK)
      for (let i0 = 0; i0 < nx - 1; i0 += CHUNK) {
        const columns = Math.min(CHUNK, nx - 1 - i0) + 1
        const rows = Math.min(CHUNK, nz - 1 - j0) + 1
        const tilePositions = new Float32Array(columns * rows * 3)
        const tileColors = new Float32Array(columns * rows * 3)
        for (let j = 0; j < rows; j++) {
          const from = ((j0 + j) * nx + i0) * 3
          tilePositions.set(positions.subarray(from, from + columns * 3), j * columns * 3)
          tileColors.set(colors.subarray(from, from + columns * 3), j * columns * 3)
        }
        const indices: number[] = []
        for (let j = 0; j < rows - 1; j++)
          for (let i = 0; i < columns - 1; i++) {
            const a = j * columns + i
            // Same split as map.heightAt: (i, j)–(i+1, j+1) diagonal, wound to face up.
            indices.push(a, a + columns + 1, a + 1, a, a + columns, a + columns + 1)
          }
        const geometry = this.keep(new THREE.BufferGeometry())
        geometry.setAttribute('position', new THREE.BufferAttribute(tilePositions, 3))
        geometry.setAttribute('color', new THREE.BufferAttribute(tileColors, 3))
        geometry.setIndex(indices)
        geometry.computeVertexNormals()
        geometry.computeBoundingSphere()
        const mesh = new THREE.Mesh(geometry, material)
        mesh.receiveShadow = true
        mesh.name = 'terrain'
        this.root.add(mesh)
      }
  }

  private water() {
    const geometry = this.keep(
      new THREE.PlaneGeometry(WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ).rotateX(-Math.PI / 2)
    )
    const material = new THREE.MeshStandardMaterial({
      color: '#5fb3b8',
      roughness: 0.35,
      transparent: true,
      opacity: 0.74,
      depthWrite: false
    })
    this.materials.set('water', material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = WATER_LEVEL
    mesh.receiveShadow = true
    this.root.add(mesh)
  }

  private vegetation() {
    const next = random(11)
    const matrix = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(sx, sy, sz)
      )
    const pick = (palette: string[]) => new THREE.Color(palette[Math.floor(next() * palette.length)])

    const trunks: THREE.Matrix4[] = []
    const crowns: THREE.Matrix4[] = []
    const crownColors: THREE.Color[] = []
    for (const tree of TREES) {
      if (tree.r > 0.4) continue // landmark trees are modelled separately
      const ground = heightAt(tree.x, tree.z)
      const height = tree.top - ground
      trunks.push(matrix(tree.x, ground - 0.2, tree.z, 0.3, height * 0.7, 0.3))
      const pine = next() < 0.35 && tree.z > 30
      for (let layer = 0; layer < (pine ? 3 : 2); layer++) {
        const size = pine ? 1.7 - layer * 0.45 : 1.9 - layer * 0.5
        crowns.push(
          pine
            ? matrix(tree.x, ground + height * 0.6 + layer * 1.1, tree.z, size, 1.6, size, next() * 3)
            : matrix(
                tree.x + (next() - 0.5) * 0.8,
                ground + height - 1.4 + layer * 0.9,
                tree.z + (next() - 0.5) * 0.8,
                size,
                size * 0.85,
                size,
                next() * 3
              )
        )
        crownColors.push(pick(pine ? ['#3f6b4a', '#4a7650', '#3a5f45'] : ['#527f59', '#6c9861', '#82a76b', '#5f8a55']))
      }
    }
    this.instanced(UNIT.taper, this.material('#80664b'), trunks)
    this.instanced(UNIT.lump, this.material('#ffffff'), crowns, crownColors)

    const bushes: THREE.Matrix4[] = []
    const bushColors: THREE.Color[] = []
    for (const bush of BUSHES) {
      const ground = heightAt(bush.x, bush.z)
      for (let lobe = 0; lobe < 3; lobe++) {
        const angle = lobe * 2.1 + next()
        const size = bush.r * (0.62 - lobe * 0.08)
        bushes.push(
          matrix(
            bush.x + Math.cos(angle) * bush.r * 0.35,
            ground + size * 0.55,
            bush.z + Math.sin(angle) * bush.r * 0.35,
            size,
            size * 0.8,
            size,
            next() * 3
          )
        )
        bushColors.push(pick(['#4f7d45', '#5c8a4c', '#466f40', '#6a9152']))
      }
    }
    this.instanced(UNIT.lump, this.material('#ffffff'), bushes, bushColors)

    // Tall grass: blades sway in the vertex shader, so the thousands of instances never touch the CPU.
    const blades: THREE.Matrix4[] = []
    const bladeColors: THREE.Color[] = []
    for (const patch of GRASS) {
      const length = Math.hypot(patch.bx - patch.ax, patch.bz - patch.az)
      const count = Math.min(140, Math.round(patch.r * patch.r * 3 + length * patch.r * 1.6))
      for (let blade = 0; blade < count; blade++) {
        const t = next()
        const angle = next() * Math.PI * 2
        const radius = Math.sqrt(next()) * patch.r * 0.95
        const x = patch.ax + (patch.bx - patch.ax) * t + Math.cos(angle) * radius
        const z = patch.az + (patch.bz - patch.az) * t + Math.sin(angle) * radius
        const ground = heightAt(x, z)
        blades.push(
          matrix(
            x,
            Math.max(ground, WATER_LEVEL - 0.2) - 0.05,
            z,
            1,
            0.9 + next() * 0.6,
            1,
            next() * 3,
            (next() - 0.5) * 0.4,
            (next() - 0.5) * 0.4
          )
        )
        bladeColors.push(pick(['#749a51', '#93b966', '#b6c979', '#86a85a']))
      }
    }
    const grass = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.9,
      flatShading: true,
      side: THREE.DoubleSide
    })
    grass.onBeforeCompile = (shader) => {
      shader.uniforms.uSway = this.sway
      shader.vertexShader = `uniform float uSway;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          transformed.x += sin(uSway * 1.6 + instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23) * 0.1 * position.y;
        #endif`
      )
    }
    this.materials.set('grass', grass)
    this.instanced(UNIT.blade, grass, blades, bladeColors, false)

    // Short tufts and wildflowers scattered over dry, gentle ground.
    const tufts: THREE.Matrix4[] = []
    const tuftColors: THREE.Color[] = []
    const flowers: THREE.Matrix4[] = []
    const flowerColors: THREE.Color[] = []
    for (let attempt = 0; attempt < 6000; attempt++) {
      const x = WORLD.minX + 4 + next() * (WORLD.maxX - WORLD.minX - 8)
      const z = WORLD.minZ + 4 + next() * (WORLD.maxZ - WORLD.minZ - 8)
      const ground = heightAt(x, z)
      if (ground < WATER_LEVEL + 0.1 || slopeAt(x, z) > 0.8) continue
      const desert = x > 55
      if (next() < 0.8) {
        for (let blade = 0; blade < 3; blade++) {
          tufts.push(
            matrix(x + blade * 0.12, ground - 0.02, z, 1.1, 0.3 + next() * 0.15, 1.1, next() * 3, 0, (blade - 1) * 0.35)
          )
          tuftColors.push(pick(desert ? ['#bba369', '#c9b27a'] : ['#789852', '#8aab5c']))
        }
      } else if (!desert) {
        flowers.push(matrix(x, ground + 0.22, z, 0.08, 0.06, 0.08))
        flowerColors.push(pick(['#f3d36b', '#f2f0e6', '#e9a6c1', '#b9a6ec']))
      }
    }
    this.instanced(UNIT.blade, this.material('#ffffff', THREE.DoubleSide), tufts, tuftColors, false)
    this.instanced(UNIT.bud, this.material('#ffffff'), flowers, flowerColors, false)
  }

  private stones() {
    const next = random(23)
    const matrices: THREE.Matrix4[] = []
    const colors: THREE.Color[] = []
    const add = (x: number, z: number, radius: number, top: number, color: string) => {
      const ground = heightAt(x, z)
      const half = Math.max(0.3, (top - ground) / 2)
      matrices.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, ground + half - 0.15, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(next() * 0.4, next() * 6, next() * 0.4)),
          new THREE.Vector3(radius * 1.05, half + 0.15, radius * 1.05)
        )
      )
      colors.push(new THREE.Color(color).multiplyScalar(0.9 + next() * 0.2))
    }
    for (const rock of ROCKS) {
      if (rock.r > 3) continue // the spire is a landmark
      add(rock.x, rock.z, rock.r, rock.top, rock.x > 50 ? '#c4a173' : '#a3a593')
    }
    for (const cave of CAVES) {
      // Boulder walls around each cave, leaving the entrances open.
      const step = 1.1 / cave.r
      for (let angle = 0; angle < Math.PI * 2; angle += step) {
        const dx = Math.cos(angle)
        const dz = Math.sin(angle)
        const open = cave.entrances.some(
          (entrance) =>
            dx * entrance.dx + dz * entrance.dz > 0 &&
            Math.abs(dx * entrance.dz - dz * entrance.dx) * cave.r < entrance.width / 2 + cave.wall * 0.45
        )
        if (!open) add(cave.x + dx * cave.r, cave.z + dz * cave.r, cave.wall * 0.8, cave.floor + 2.9, '#9a9180')
      }
    }
    this.instanced(UNIT.rock, this.material('#ffffff'), matrices, colors)
  }

  private logs() {
    for (const log of LOGS) {
      const start = new THREE.Vector3(log.ax, log.bottom + log.r, log.az)
      const end = new THREE.Vector3(log.bx, log.bottom + log.r, log.bz)
      const direction = end.clone().sub(start)
      const length = direction.length()
      const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
      this.part('log:#7a5a3e', UNIT.cylinder, start, { x: log.r, y: length, z: log.r }, along)
      this.part('log:#c8a273', UNIT.disc, end, { x: log.r * 0.9, y: 1, z: log.r * 0.9 }, along)
      this.part(
        'log:#6f9b52',
        UNIT.sphere,
        start
          .clone()
          .lerp(end, 0.5)
          .add(new THREE.Vector3(0, log.r * 0.75, 0)),
        {
          x: log.r * 0.8,
          y: log.r * 0.35,
          z: length * 0.3
        },
        new THREE.Euler(0, Math.atan2(direction.x, direction.z), 0)
      )
      // Root plate at one end and broken branches propping the trunk up off the ground.
      this.part(
        'log:#6b5038',
        UNIT.sphere,
        start.clone().add(direction.clone().multiplyScalar(-0.02)),
        { x: 1.15, y: 1.15, z: 0.3 },
        new THREE.Euler(0, Math.atan2(direction.x, direction.z), 0)
      )
      for (const t of [0.2, 0.8]) {
        const at = start.clone().lerp(end, t)
        for (const side of [-1, 1]) {
          const ground = heightAt(at.x + side * 0.5, at.z)
          this.part(
            'log:#6b5038',
            UNIT.cylinder,
            { x: at.x + side * 0.45, y: ground - 0.1, z: at.z },
            { x: 0.09, y: at.y - ground, z: 0.09 },
            new THREE.Euler(0, 0, side * 0.25)
          )
        }
      }
    }
  }

  private caves() {
    for (const cave of CAVES) {
      const radius = cave.r + cave.wall * 0.6
      // The dome sits on the boulder ring; entrances read as arches under its rim.
      this.part(
        'dome', // double-sided: from inside it is the cave ceiling
        new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        { x: cave.x, y: cave.floor + 2.4, z: cave.z },
        { x: radius, y: cave.roof - 2.4, z: radius }
      )
      this.part(
        '#3f3a35',
        UNIT.disc,
        { x: cave.x, y: cave.floor + 0.03, z: cave.z },
        { x: cave.r - 0.6, y: 1, z: cave.r - 0.6 }
      )
      for (let crystal = 0; crystal < 7; crystal++) {
        const angle = crystal * 0.9 + 0.3
        this.part(
          '#a7ccbf',
          UNIT.cone,
          { x: cave.x + Math.cos(angle) * (cave.r - 1.6), y: cave.floor, z: cave.z + Math.sin(angle) * (cave.r - 1.6) },
          { x: 0.18, y: 0.9, z: 0.18 },
          new THREE.Euler(0.2, angle, 0.15)
        )
      }
    }
  }

  private holes() {
    for (const node of TUNNEL_NODES) {
      if (!node.exit) continue
      const ground = heightAt(node.x, node.z)
      this.part('#1d1712', UNIT.disc, { x: node.x, y: ground + 0.06, z: node.z }, { x: 0.95, y: 1, z: 0.95 })
      this.part('#8a6a4a', UNIT.ring, { x: node.x, y: ground + 0.05, z: node.z }, { x: 1.15, y: 0.9, z: 1.15 })
    }
    for (const spot of FOODS) {
      if (spot.place !== 'raised') continue
      // Apples rest on old stumps: hop up to reach them.
      const ground = heightAt(spot.x, spot.z)
      this.part(
        '#8a6a4a',
        UNIT.taper,
        { x: spot.x, y: ground - 0.1, z: spot.z },
        { x: 0.45, y: spot.y - ground + 0.05, z: 0.45 }
      )
      this.part('#6f9b52', UNIT.disc, { x: spot.x, y: spot.y - 0.04, z: spot.z }, { x: 0.32, y: 1, z: 0.32 })
    }
  }

  private landmarks() {
    // Big Oak: a hollow trunk (rabbit shelter) under a huge crown, visible from most of the map.
    const oak = { x: 0, z: -8, y: heightAt(0, -8) }
    this.part('#6e5640', UNIT.taper, { x: oak.x, y: oak.y - 0.5, z: oak.z }, { x: 2.6, y: 10, z: 2.6 })
    this.part('#1f1813', UNIT.sphere, { x: oak.x, y: oak.y + 0.9, z: oak.z + 2.2 }, { x: 1.1, y: 1.3, z: 0.6 })
    for (let root = 0; root < 6; root++) {
      const angle = root * 1.05 + 0.4
      this.part(
        '#6e5640',
        UNIT.sphere,
        { x: oak.x + Math.cos(angle) * 2.6, y: oak.y + 0.1, z: oak.z + Math.sin(angle) * 2.6 },
        { x: 1.4, y: 0.5, z: 0.6 },
        new THREE.Euler(0, -angle, 0)
      )
    }
    for (let crown = 0; crown < 8; crown++) {
      const angle = crown * 0.8
      const spread = crown === 0 ? 0 : 4.5
      this.part(
        ['#4f7b49', '#5f8c50', '#6c9858'][crown % 3],
        UNIT.lump,
        { x: oak.x + Math.cos(angle) * spread, y: oak.y + 11 + (crown % 3) * 1.4, z: oak.z + Math.sin(angle) * spread },
        { x: 4.6, y: 3.6, z: 4.6 }
      )
    }
    // Old hollow trees in the woods: rabbits shelter inside, bigger hunters cannot squeeze in.
    for (const shelter of SHELTERS.slice(2)) {
      const ground = heightAt(shelter.x, shelter.z)
      this.part('#5f4a37', UNIT.taper, { x: shelter.x, y: ground - 0.4, z: shelter.z }, { x: 2, y: 6.5, z: 2 })
      this.part(
        '#1f1813',
        UNIT.sphere,
        { x: shelter.x, y: ground + 0.8, z: shelter.z + 1.7 },
        { x: 0.9, y: 1.1, z: 0.5 }
      )
      for (let crown = 0; crown < 4; crown++) {
        const angle = crown * 1.6
        this.part(
          '#4a7650',
          UNIT.lump,
          { x: shelter.x + Math.cos(angle) * 1.8, y: ground + 7.4 + (crown % 2), z: shelter.z + Math.sin(angle) * 1.8 },
          { x: 2.8, y: 2.2, z: 2.8 }
        )
      }
    }
    // Red Rock Spire in the east sand.
    const spire = { x: 118, z: 32, y: heightAt(118, 32) }
    for (let band = 0; band < 6; band++) {
      const radius = 3.4 - band * 0.35
      this.part(
        band % 2 ? '#b8613f' : '#c97a50',
        UNIT.taper,
        { x: spire.x, y: spire.y + band * 3.6 - 0.5, z: spire.z },
        { x: radius, y: 3.8, z: radius },
        new THREE.Euler(0, band * 0.5, 0)
      )
    }
    this.part('#d08a5c', UNIT.rock, { x: spire.x, y: spire.y + 22, z: spire.z }, { x: 1.8, y: 1.2, z: 1.8 })
    // Twin pines on the plateau and the white birch that marks home.
    for (const tree of TREES.filter((entry) => entry.r > 0.4)) {
      const ground = heightAt(tree.x, tree.z)
      const height = tree.top - ground
      const birch = tree.x < -100
      this.part(
        birch ? '#ece8dc' : '#6b5038',
        UNIT.taper,
        { x: tree.x, y: ground - 0.2, z: tree.z },
        { x: tree.r, y: height * 0.75, z: tree.r }
      )
      for (let layer = 0; layer < (birch ? 4 : 5); layer++) {
        if (birch)
          this.part(
            ['#e7c34a', '#f0d36a', '#d9b23d'][layer % 3],
            UNIT.lump,
            {
              x: tree.x + (layer % 2 ? 1 : -1),
              y: ground + height * 0.6 + layer * 1.2,
              z: tree.z + (layer - 1.5) * 0.6
            },
            { x: 2.4 - layer * 0.3, y: 2, z: 2.4 - layer * 0.3 }
          )
        else
          this.part(
            '#365c42',
            UNIT.cone,
            { x: tree.x, y: ground + height * 0.3 + layer * 2.2, z: tree.z },
            { x: 3.4 - layer * 0.55, y: 3.6, z: 3.4 - layer * 0.55 }
          )
      }
    }
    // Home burrow (spawn shelter).
    const home = { x: SPAWN.x, y: 0, z: SPAWN.z - 3 }
    this.part('#9ba66c', UNIT.sphere, { x: home.x, y: home.y, z: home.z - 0.65 }, { x: 3, y: 1.65, z: 2.4 })
    this.part('#463e35', UNIT.sphere, { x: home.x, y: home.y + 0.52, z: home.z + 1.35 }, { x: 1.1, y: 0.8, z: 0.12 })
    this.part('#bca579', new THREE.TorusGeometry(1.08, 0.16, 6, 18, Math.PI), {
      x: home.x,
      y: home.y + 0.45,
      z: home.z + 1.5
    })
    for (const side of [-1, 1]) {
      this.part(
        '#82634a',
        UNIT.cylinder,
        { x: home.x + side * 1.8, y: home.y, z: home.z + 1.4 },
        { x: 0.07, y: 2, z: 0.07 }
      )
      this.part(
        '#f3cd72',
        UNIT.sphere,
        { x: home.x + side * 1.8, y: home.y + 1.8, z: home.z + 1.4 },
        { x: 0.22, y: 0.3, z: 0.22 }
      )
    }
  }

  private tunnelInterior() {
    const earth = this.material('#5b4636', THREE.BackSide)
    const glow = new THREE.MeshStandardMaterial({ color: '#d9f0a3', emissive: '#b6e07a', emissiveIntensity: 1.4 })
    this.materials.set('glow', glow)
    const lights: THREE.Matrix4[] = []
    const centre = (x: number, z: number) => heightAt(x, z) - TUNNEL_DEPTH + TUNNEL_RADIUS * 0.85
    for (const [first, second] of TUNNEL_EDGES) {
      const a = TUNNEL_NODES[first]
      const b = TUNNEL_NODES[second]
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      const points: THREE.Vector3[] = []
      const samples = Math.max(2, Math.ceil(length / 1.5))
      for (let sample = 0; sample <= samples; sample++) {
        const x = a.x + ((b.x - a.x) * sample) / samples
        const z = a.z + ((b.z - a.z) * sample) / samples
        points.push(new THREE.Vector3(x, centre(x, z), z))
        if (sample % 4 === 2)
          lights.push(
            new THREE.Matrix4()
              .makeTranslation(x, centre(x, z) + TUNNEL_RADIUS * 0.9, z)
              .scale(new THREE.Vector3(0.06, 0.06, 0.06))
          )
      }
      const tube = this.keep(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), samples * 2, TUNNEL_RADIUS + 0.15, 10)
      )
      this.tunnels.add(new THREE.Mesh(tube, earth))
    }
    for (const node of TUNNEL_NODES) {
      const y = centre(node.x, node.z)
      const ball = this.keep(
        node.exit
          ? new THREE.SphereGeometry(TUNNEL_RADIUS + 0.2, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
          : new THREE.SphereGeometry(CHAMBER_RADIUS + 0.2, 16, 10)
      )
      const chamber = new THREE.Mesh(ball, earth)
      chamber.position.set(node.x, y, node.z)
      this.tunnels.add(chamber)
      if (!node.exit) continue
      // Light falls down the shaft from the hole above.
      const shaft = this.keep(
        new THREE.CylinderGeometry(TUNNEL_RADIUS + 0.15, TUNNEL_RADIUS + 0.15, TUNNEL_DEPTH + 0.6, 12, 1, true)
      )
      const mesh = new THREE.Mesh(shaft, earth)
      mesh.position.set(node.x, y + (TUNNEL_DEPTH + 0.6) / 2 - 0.2, node.z)
      this.tunnels.add(mesh)
    }
    const worms = new THREE.InstancedMesh(this.keep(new THREE.SphereGeometry(1, 6, 4)), glow, lights.length)
    lights.forEach((matrix, index) => worms.setMatrixAt(index, matrix))
    this.tunnels.add(worms)
  }

  /** Per-frame: animates grass and shows the tunnels or see-through logs when the camera needs them. */
  update(time: number, underground: boolean, underLog: boolean) {
    this.sway.value = time
    this.tunnels.visible = underground
    for (const material of this.logMaterials) {
      material.opacity = underLog ? 0.35 : 1
      material.depthWrite = !underLog
    }
  }

  dispose() {
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
    this.root.removeFromParent()
    this.tunnels.removeFromParent()
  }
}
