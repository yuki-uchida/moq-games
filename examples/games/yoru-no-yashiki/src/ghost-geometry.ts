import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

type Point = [number, number, number]

function withGeometries<Result>(create: (geometries: Set<THREE.BufferGeometry>) => Result): Result {
  const geometries = new Set<THREE.BufferGeometry>()
  try {
    return create(geometries)
  } catch (error) {
    for (const geometry of geometries) {
      try {
        geometry.dispose()
      } catch {}
    }
    throw error
  }
}

function finishGeometry(geometry: THREE.BufferGeometry, geometries: Set<THREE.BufferGeometry>): THREE.BufferGeometry {
  const positions = geometry.getAttribute('position')
  const indices = geometry.getIndex()!
  const triangles: number[] = []
  const first = new THREE.Vector3()
  const second = new THREE.Vector3()
  const third = new THREE.Vector3()
  for (let triangle = 0; triangle < indices.count; triangle += 3) {
    first.fromBufferAttribute(positions, indices.getX(triangle))
    second.fromBufferAttribute(positions, indices.getX(triangle + 1)).sub(first)
    third.fromBufferAttribute(positions, indices.getX(triangle + 2)).sub(first)
    if (second.cross(third).lengthSq() > 1e-16) {
      triangles.push(indices.getX(triangle), indices.getX(triangle + 1), indices.getX(triangle + 2))
    }
  }
  geometry.setIndex(triangles)
  geometry.deleteAttribute('normal')
  const finished = mergeVertices(geometry, 1e-6)
  geometries.add(finished)
  geometries.delete(geometry)
  geometry.dispose()
  finished.computeVertexNormals()
  return finished
}

class Surface {
  constructor(private readonly geometries: Set<THREE.BufferGeometry>) {}
  private readonly positions: number[] = []
  private readonly indices: number[] = []

  grid(columns: number, rows: number, point: (u: number, v: number) => Point): void {
    const start = this.positions.length / 3
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        this.positions.push(...point(column / columns, row / rows))
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const corner = start + row * (columns + 1) + column
        this.indices.push(
          corner,
          corner + columns + 1,
          corner + 1,
          corner + 1,
          corner + columns + 1,
          corner + columns + 2
        )
      }
    }
  }

  geometry(clean = true): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()
    this.geometries.add(geometry)
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    geometry.setIndex(this.indices)
    if (clean) return finishGeometry(geometry, this.geometries)
    geometry.computeVertexNormals()
    return geometry
  }
}

export function createGarmentGeometry(ghost: boolean): {
  robe: THREE.BufferGeometry
  trim: THREE.BufferGeometry
  hands: THREE.BufferGeometry
} {
  return withGeometries((geometries) => {
    const robe = new Surface(geometries)
    const trim = new Surface(geometries)
    const hands = new Surface(geometries)

    const robePoint = (angle: number, v: number): Point => {
      const width =
        0.105 +
        0.13 * Math.sin(Math.min(v / 0.2, 1) * Math.PI * 0.5) -
        0.07 * Math.exp(-Math.pow((v - 0.4) / 0.18, 2)) +
        (ghost ? 0.055 : 0.14) * v * v
      const fold = 1 + 0.085 * Math.sin(angle * 7 + v * 2.7) + 0.04 * Math.sin(angle * 11 - v * 3)
      return [
        Math.sin(angle) * width * fold - 0.035 * Math.sin(v * Math.PI) + 0.07 * v * v,
        0.7 - v * 1.41 + 0.04 * v * Math.cos(angle * 3 + 0.4) - (ghost ? 0.045 * v ** 3 * Math.sin(angle + 0.7) : 0),
        Math.cos(angle) * (0.1 + 0.065 * Math.sin(v * Math.PI) + 0.06 * v) * fold + 0.075 * v * v
      ]
    }
    robe.grid(32, 10, (u, v) => robePoint(u * Math.PI * 2, v))
    if (ghost) {
      robe.grid(6, 8, (u, v) => {
        const edge = 0.3 - 0.6 * (1 - v) ** 2
        const point = robePoint(Math.PI - 0.85 + (edge + 0.85) * u, 0.4 + v * 0.6)
        point[2] -= 0.012 + 0.012 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI)
        return point
      })
    }

    for (const side of [-1, 1]) {
      robe.grid(12, 6, (u, v) => {
        const angle = u * Math.PI * 2
        const width = (ghost ? 0.05 : 0.045) + (ghost ? 0.055 : 0.12) * Math.sin(v * Math.PI * 0.65)
        const fold = 1 + 0.12 * Math.sin(angle * 4 + v * 3 + side)
        return [
          side * (0.19 + 0.15 * Math.sin(v * Math.PI * 0.65)) + Math.sin(angle) * width * fold + 0.02 * v,
          0.43 - (side < 0 ? 0.82 : 0.65) * v + 0.055 * Math.cos(angle + side) * v,
          Math.cos(angle) * (0.055 + (ghost ? 0.06 : 0.085) * v) * fold + 0.055 * v + side * 0.025
        ]
      })
      trim.grid(1, 8, (u, v) => {
        const point = robePoint(Math.PI + side * (0.65 - v * 0.95) + (u - 0.5) * 0.13, 0.02 + v * 0.38)
        point[2] -= 0.006
        return point
      })
      if (!ghost || side > 0) {
        trim.grid(1, 12, (u, v) => {
          const edge = ghost ? 0.3 - 0.6 * (1 - v) ** 2 : side * 0.3
          const point = robePoint(Math.PI + edge + side * (u - 0.5) * 0.055, 0.4 + v * 0.6)
          point[2] -= ghost ? 0.018 : 0.005
          return point
        })
      }
      const wrist = side < 0 ? -0.28 : -0.16
      for (let finger = 0; finger < 5; finger++) {
        const thumb = finger === 4
        hands.grid(5, 3, (u, v) => {
          const angle = u * Math.PI * 2
          const radius = Math.sin(v * Math.PI)
          const length = thumb ? 0.08 : 0.15 - Math.abs(finger - 1.4) * 0.022
          return [
            side * (0.33 + (finger - 1.5) * 0.019 + (thumb ? 0.025 * v : 0.008 * v * v)) +
              0.025 +
              Math.cos(angle) * 0.009 * radius,
            wrist - (thumb ? 0.035 : 0.085) - v * length,
            -0.055 - 0.025 * Math.sin(v * Math.PI) + 0.045 * v * v + Math.sin(angle) * 0.009 * radius
          ]
        })
      }
      hands.grid(8, 4, (u, v) => {
        const angle = u * Math.PI * 2
        const radius = Math.sin(v * Math.PI)
        return [
          side * 0.33 + 0.025 + Math.cos(angle) * 0.04 * radius,
          wrist - v * 0.11,
          -0.055 + Math.sin(angle) * 0.018 * radius
        ]
      })
    }

    const robeGeometry = robe.geometry(ghost)
    const clothPositions = robeGeometry.getAttribute('position')
    const colors = new THREE.Float32BufferAttribute(new Float32Array(clothPositions.count * 3), 3)
    for (let vertex = 0; vertex < clothPositions.count; vertex++) {
      const horizontal = clothPositions.getX(vertex)
      const vertical = clothPositions.getY(vertex)
      const depth = clothPositions.getZ(vertex)
      const wear = Math.pow(THREE.MathUtils.clamp(0.45 - vertical, 0, 1), 2)
      const shade = 0.88 - 0.3 * wear + 0.07 * Math.sin(horizontal * 31 + depth * 19 + vertical * 7) * (0.3 + wear)
      colors.setXYZ(vertex, shade * 0.97, shade, shade * 0.98)
    }
    robeGeometry.setAttribute('color', colors)
    return { robe: robeGeometry, trim: trim.geometry(ghost), hands: hands.geometry(ghost) }
  })
}

export function createGhostGeometry(): {
  robe: THREE.BufferGeometry
  trim: THREE.BufferGeometry
  hands: THREE.BufferGeometry
  hair: THREE.BufferGeometry
  fringe: THREE.BufferGeometry
  face: THREE.BufferGeometry
} {
  return withGeometries((geometries) => {
    const garment = createGarmentGeometry(true)
    for (const geometry of Object.values(garment)) geometries.add(geometry)
    const hair = new Surface(geometries)
    const fringe = new Surface(geometries)
    hair.grid(16, 4, (u, v) => {
      const angle = u * Math.PI * 2
      const latitude = v * Math.PI * 0.52
      return [
        Math.sin(angle) * Math.sin(latitude) * 0.197,
        0.08 + Math.cos(latitude) * 0.19,
        Math.cos(angle) * Math.sin(latitude) * 0.174
      ]
    })
    for (let strand = 0; strand < 16; strand++) {
      const angle = (strand / 16) * Math.PI * 2
      const front = Math.cos(angle) < 0
      const length = (front ? 0.52 : 0.76) + 0.12 * Math.sin(strand * 2.4)
      hair.grid(5, 5, (u, v) => {
        const around = u * Math.PI * 2
        const taper = 0.06 + 0.94 * Math.pow(1 - v, 0.8)
        const spread = Math.cos(around) * (0.035 + 0.009 * Math.sin(strand * 2)) * taper
        const radius = 0.16 + 0.025 * Math.sin(v * Math.PI) + 0.012 * v
        const depth = Math.sin(around) * 0.022 * taper
        const drift =
          0.065 * Math.sin(strand * 1.7) * v * v + 0.04 * Math.sin(v * Math.PI) * Math.sin(strand * 1.3 + v * 3)
        return [
          Math.sin(angle) * (radius + depth) + Math.cos(angle) * spread + drift,
          0.16 - length * v,
          Math.cos(angle) * (radius + depth) -
            Math.sin(angle) * spread +
            0.07 * v * v +
            0.035 * Math.sin(strand * 1.9 + v * 4) * v
        ]
      })
    }
    for (const [offsetX, offsetY, width] of [
      [0.045, 0.012, 0.018],
      [0.012, -0.102, 0.022]
    ])
      fringe.grid(4, 2, (u, v) => [
        offsetX + (u - 0.5) * width * 2,
        offsetY + Math.sin(u * Math.PI) * (v - 0.5) * 0.012 - u * 0.008,
        -0.139 + Math.abs(u - 0.5) * 0.008
      ])
    for (let strand = 0; strand < 6; strand++) {
      const x = -0.145 + strand * 0.047
      const length = 0.4 + 0.065 * (strand % 3) + 0.045 * Math.sin(strand * 2)
      fringe.grid(5, 5, (u, v) => {
        const angle = u * Math.PI * 2
        const taper = 0.1 + 0.9 * Math.pow(1 - v, 0.55)
        return [
          x +
            Math.cos(angle) * (strand < 3 ? 0.037 : 0.021) * taper +
            0.06 * Math.sin(strand * 1.8) * v * v +
            0.03 * Math.sin(strand + v * 4) * Math.sin(v * Math.PI),
          0.2 - length * v,
          -0.145 -
            0.035 * Math.sin(v * Math.PI) +
            Math.sin(angle) * 0.018 * taper -
            0.025 * v +
            0.025 * Math.sin(strand * 1.5 + v * 5) * v * v
        ]
      })
    }

    const face = new THREE.SphereGeometry(1, 16, 12)
    geometries.add(face)
    const positions = face.getAttribute('position')
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const horizontal = positions.getX(vertex)
      const vertical = positions.getY(vertex)
      const depth = positions.getZ(vertex)
      const nose = depth < 0 ? 0.18 * Math.exp(-horizontal * horizontal * 45 - Math.pow(vertical + 0.08, 2) * 18) : 0
      positions.setXYZ(vertex, horizontal * (0.84 + vertical * 0.16), vertical, depth - nose)
    }

    return {
      ...garment,
      hair: hair.geometry(),
      fringe: fringe.geometry(),
      face: finishGeometry(face, geometries)
    }
  })
}
