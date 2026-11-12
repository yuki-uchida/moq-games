/**
 * Camera-facing ribbons rebuilt every frame from polylines: the eel beam and its chain arcs, hook lines, laser
 * sight and charge telegraph lines, swing trails, dash streaks and glide trails. Additive, one draw call,
 * preallocated buffers (no per-frame allocation).
 */
import * as THREE from 'three'

const vertex = /* glsl */ `
attribute vec4 color;
attribute float edge;
varying vec4 vColor;
varying float vEdge;
void main() {
  vColor = color;
  vEdge = edge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragment = /* glsl */ `
varying vec4 vColor;
varying float vEdge;
void main() {
  float core = 1.0 - abs(vEdge);
  float a = vColor.a * (core * core * 0.7 + smoothstep(0.55, 1.0, core) * 0.8);
  gl_FragColor = vec4(vColor.rgb * a, 1.0);
}
`

export class LineFx {
  readonly mesh: THREE.Mesh
  private readonly geometry: THREE.BufferGeometry
  private readonly pos: Float32Array
  private readonly col: Float32Array
  private readonly edge: Float32Array
  private readonly maxVerts: number
  private verts = 0
  private indexCount = 0
  private readonly camPos = new THREE.Vector3()
  private readonly c = new THREE.Color()

  constructor(maxSegments = 3000) {
    this.maxVerts = maxSegments * 4
    this.pos = new Float32Array(this.maxVerts * 3)
    this.col = new Float32Array(this.maxVerts * 4)
    this.edge = new Float32Array(this.maxVerts)
    const index = new Uint32Array(maxSegments * 6)
    for (let s = 0; s < maxSegments; s++) {
      const v = s * 4
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], s * 6)
    }
    const g = new THREE.BufferGeometry()
    const pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    const ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage)
    const ea = new THREE.BufferAttribute(this.edge, 1).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', pa)
    g.setAttribute('color', ca)
    g.setAttribute('edge', ea)
    g.setIndex(new THREE.BufferAttribute(index, 1))
    g.setDrawRange(0, 0)
    this.geometry = g
    const m = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
    this.mesh = new THREE.Mesh(g, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 25
  }

  begin(camera: THREE.Camera) {
    this.verts = 0
    this.indexCount = 0
    this.camPos.setFromMatrixPosition(camera.matrixWorld)
  }

  /**
   * One segment a→b, width w0→w1, colour (sRGB hex × intensity) and alpha a0→a1.
   */
  segment(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    w0: number,
    w1: number,
    hex: number,
    intensity: number,
    a0: number,
    a1: number
  ) {
    if (this.verts + 4 > this.maxVerts) return
    // Side vector = segment dir × view dir.
    const dx = bx - ax
    const dy = by - ay
    const dz = bz - az
    const mx = (ax + bx) * 0.5 - this.camPos.x
    const my = (ay + by) * 0.5 - this.camPos.y
    const mz = (az + bz) * 0.5 - this.camPos.z
    let sx = dy * mz - dz * my
    let sy = dz * mx - dx * mz
    let sz = dx * my - dy * mx
    const l = Math.hypot(sx, sy, sz)
    if (l < 1e-6) return
    sx /= l
    sy /= l
    sz /= l
    this.c.setHex(hex)
    const r = this.c.r * intensity
    const g = this.c.g * intensity
    const b = this.c.b * intensity
    const v = this.verts
    this.put(v, ax - sx * w0, ay - sy * w0, az - sz * w0, r, g, b, a0, -1)
    this.put(v + 1, ax + sx * w0, ay + sy * w0, az + sz * w0, r, g, b, a0, 1)
    this.put(v + 2, bx - sx * w1, by - sy * w1, bz - sz * w1, r, g, b, a1, -1)
    this.put(v + 3, bx + sx * w1, by + sy * w1, bz + sz * w1, r, g, b, a1, 1)
    this.verts += 4
    this.indexCount += 6
  }

  private put(i: number, x: number, y: number, z: number, r: number, g: number, b: number, a: number, e: number) {
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.col[i * 4] = r
    this.col[i * 4 + 1] = g
    this.col[i * 4 + 2] = b
    this.col[i * 4 + 3] = a
    this.edge[i] = e
  }

  /**
   * Jagged electric bolt a→b: `steps` kinks displaced by up to `amp`, re-randomised each call (flicker).
   */
  bolt(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    steps: number,
    amp: number,
    width: number,
    hex: number,
    intensity: number,
    alpha: number
  ) {
    let px = ax
    let py = ay
    let pz = az
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const env = i === steps ? 0 : Math.sin(t * Math.PI)
      const nx = ax + (bx - ax) * t + (Math.random() - 0.5) * amp * env
      const ny = ay + (by - ay) * t + (Math.random() - 0.5) * amp * env
      const nz = az + (bz - az) * t + (Math.random() - 0.5) * amp * env
      this.segment(px, py, pz, nx, ny, nz, width, width, hex, intensity, alpha, alpha)
      px = nx
      py = ny
      pz = nz
    }
  }

  end() {
    const g = this.geometry
    g.setDrawRange(0, this.indexCount)
    for (const name of ATTRS) {
      const a = g.getAttribute(name) as THREE.BufferAttribute
      a.clearUpdateRanges()
      if (this.verts > 0) {
        a.addUpdateRange(0, this.verts * a.itemSize)
        a.needsUpdate = true
      }
    }
  }

  dispose() {
    this.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}

const ATTRS = ['position', 'color', 'edge'] as const
