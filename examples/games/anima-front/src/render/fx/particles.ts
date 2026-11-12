/**
 * Pooled GPU-friendly particles: one instanced quad per particle, procedural shapes in the fragment shader (no
 * textures), billboards, velocity-stretched sparks and ground-flat decals. CPU integration in typed arrays; no
 * allocation per frame. One draw call per system (additive and alpha variants).
 */
import * as THREE from 'three'

export const SHAPE = {
  dot: 0,
  ring: 1,
  spark: 2,
  smoke: 3,
  star: 4,
  shard: 5,
  crack: 6,
  petal: 7,
  square: 8,
  splat: 9,
  hex: 10,
  disc: 11,
  flame: 12
} as const
export type ShapeName = keyof typeof SHAPE

/** Scratch spawn description: fill the fields and call `ParticleSystem.add`. */
export class Particle {
  x = 0
  y = 0
  z = 0
  vx = 0
  vy = 0
  vz = 0
  life = 1
  size = 0.2
  sizeEnd = 0.2
  r = 1
  g = 1
  b = 1
  alpha = 1
  /** Fraction of life spent fading in. */
  fadeIn = 0.05
  gravity = 0
  drag = 0
  shape: number = SHAPE.dot
  /** Length factor along velocity for sparks/tracers (0 = billboard). */
  stretch = 0
  /** Ground-flat decal. */
  flat = false
  rot = 0
  spin = 0
  /** Colour shifts toward this tint over life (rgb multipliers). */
  endR = 1
  endG = 1
  endB = 1

  reset(): this {
    this.vx = this.vy = this.vz = 0
    this.life = 1
    this.size = this.sizeEnd = 0.2
    this.r = this.g = this.b = 1
    this.endR = this.endG = this.endB = 1
    this.alpha = 1
    this.fadeIn = 0.05
    this.gravity = 0
    this.drag = 0
    this.shape = SHAPE.dot
    this.stretch = 0
    this.flat = false
    this.rot = 0
    this.spin = 0
    return this
  }

  at(x: number, y: number, z: number): this {
    this.x = x
    this.y = y
    this.z = z
    return this
  }

  vel(x: number, y: number, z: number): this {
    this.vx = x
    this.vy = y
    this.vz = z
    return this
  }

  /** Linear RGB from an sRGB hex colour times an intensity (HDR > 1 blooms). */
  color(hex: number, intensity = 1): this {
    _c.setHex(hex)
    this.r = _c.r * intensity
    this.g = _c.g * intensity
    this.b = _c.b * intensity
    return this
  }
}

const _c = new THREE.Color()

const vertex = /* glsl */ `
attribute vec4 iA; // pos, size
attribute vec4 iB; // vel, rot
attribute vec4 iC; // colour rgba
attribute vec4 iD; // shape, stretch, flat, age 0..1
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vAge;
void main() {
  vUv = position.xy;
  vColor = iC;
  vShape = iD.x;
  vAge = iD.w;
  float s = iA.w;
  float c = cos(iB.w);
  float sn = sin(iB.w);
  vec2 q = vec2(position.x * c - position.y * sn, position.x * sn + position.y * c);
  if (iD.z > 0.5) {
    vec3 w = iA.xyz + vec3(q.x * s, 0.0, q.y * s);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    return;
  }
  vec4 mv = viewMatrix * vec4(iA.xyz, 1.0);
  if (iD.y > 0.0) {
    vec3 vv = (viewMatrix * vec4(iB.xyz, 0.0)).xyz;
    vec2 axis = vv.xy;
    float speed = length(axis);
    if (speed > 1e-4) {
      axis /= speed;
      vec2 perp = vec2(-axis.y, axis.x);
      float len = s + iD.y * length(iB.xyz);
      mv.xy += perp * position.x * s + axis * (position.y * len * 0.5 - len * 0.5 + s * 0.5);
      gl_Position = projectionMatrix * mv;
      return;
    }
  }
  mv.xy += q * s;
  gl_Position = projectionMatrix * mv;
}
`

const fragment = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vAge;
uniform float uAdditive;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vUv;
  float r = length(p);
  float m = 0.0;
  int shape = int(vShape + 0.5);
  if (shape == 0) m = exp(-r * r * 3.5) * (1.0 - smoothstep(0.85, 1.0, r));
  else if (shape == 1) m = smoothstep(0.62, 0.86, r) * (1.0 - smoothstep(0.86, 1.0, r)) + 0.08 * (1.0 - smoothstep(0.0, 0.86, r));
  else if (shape == 2) m = (1.0 - smoothstep(0.0, 1.0, abs(p.x) * 2.2)) * (1.0 - smoothstep(0.55, 1.0, abs(p.y)));
  else if (shape == 3) {
    float a = atan(p.y, p.x);
    float edge = 0.78 + 0.1 * sin(a * 5.0 + vShape * 3.0) + 0.06 * sin(a * 9.0);
    m = (1.0 - smoothstep(edge - 0.25, edge, r)) * (0.75 + 0.25 * (1.0 - r));
  } else if (shape == 4) {
    float star = max(1.0 - abs(p.x) * 6.0 - abs(p.y) * 0.9, 1.0 - abs(p.y) * 6.0 - abs(p.x) * 0.9);
    m = clamp(star, 0.0, 1.0) + exp(-r * r * 12.0);
  } else if (shape == 5) {
    vec2 q = p * vec2(1.0, 0.8);
    m = step(abs(q.x) * 1.6 + q.y * 0.9, 0.85) * step(-0.75, q.y);
  } else if (shape == 6) {
    float a = atan(p.y, p.x);
    float spokes = pow(abs(sin(a * 3.5 + hash(vec2(floor(vShape))) * 6.0)), 18.0);
    m = spokes * (1.0 - smoothstep(0.2, 1.0, r)) + (1.0 - smoothstep(0.0, 0.25, r));
  } else if (shape == 7) {
    vec2 q = p * vec2(1.0, 1.9);
    m = 1.0 - smoothstep(0.75, 0.95, length(q + vec2(0.0, q.x * q.x * 0.3)));
  } else if (shape == 8) m = step(max(abs(p.x), abs(p.y)), 0.7);
  else if (shape == 9) {
    float a = atan(p.y, p.x);
    float edge = 0.55 + 0.25 * pow(abs(sin(a * 4.0 + 1.3)), 3.0) + 0.1 * sin(a * 11.0);
    m = 1.0 - smoothstep(edge - 0.06, edge, r);
  } else if (shape == 10) {
    vec2 q = abs(p);
    float hx = max(q.x * 0.866 + q.y * 0.5, q.y);
    m = smoothstep(0.7, 0.86, hx) * (1.0 - smoothstep(0.86, 0.95, hx)) + 0.12 * (1.0 - smoothstep(0.0, 0.86, hx));
  } else if (shape == 11) m = 1.0 - smoothstep(0.9, 1.0, r);
  else {
    vec2 q = vec2(p.x * (1.3 + p.y * 0.6), p.y);
    m = (1.0 - smoothstep(0.55, 1.0, length(q + vec2(0.0, 0.15)))) * smoothstep(-1.0, -0.4, p.y);
  }
  float a = vColor.a * m;
  if (a < 0.003) discard;
  if (uAdditive > 0.5) gl_FragColor = vec4(vColor.rgb * a * 0.55, 1.0);
  else gl_FragColor = vec4(vColor.rgb, a);
}
`

export class ParticleSystem {
  readonly mesh: THREE.Mesh
  private readonly geometry: THREE.InstancedBufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly cap: number
  private count = 0
  /** Instances written this frame (simulated + immediate). */
  private drawn = 0
  private readonly attrs: THREE.InstancedBufferAttribute[]
  // Simulation state (structure of arrays).
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly col: Float32Array
  private readonly endCol: Float32Array
  private readonly t: Float32Array
  private readonly life: Float32Array
  private readonly size: Float32Array
  private readonly sizeEnd: Float32Array
  private readonly alpha: Float32Array
  private readonly fadeIn: Float32Array
  private readonly grav: Float32Array
  private readonly drag: Float32Array
  private readonly shape: Float32Array
  private readonly stretch: Float32Array
  private readonly flat: Uint8Array
  private readonly rot: Float32Array
  private readonly spin: Float32Array
  // GPU attributes.
  private readonly aA: THREE.InstancedBufferAttribute
  private readonly aB: THREE.InstancedBufferAttribute
  private readonly aC: THREE.InstancedBufferAttribute
  private readonly aD: THREE.InstancedBufferAttribute

  constructor(
    capacity: number,
    readonly additive: boolean
  ) {
    this.cap = capacity
    const n = capacity
    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.col = new Float32Array(n * 3)
    this.endCol = new Float32Array(n * 3)
    this.t = new Float32Array(n)
    this.life = new Float32Array(n)
    this.size = new Float32Array(n)
    this.sizeEnd = new Float32Array(n)
    this.alpha = new Float32Array(n)
    this.fadeIn = new Float32Array(n)
    this.grav = new Float32Array(n)
    this.drag = new Float32Array(n)
    this.shape = new Float32Array(n)
    this.stretch = new Float32Array(n)
    this.flat = new Uint8Array(n)
    this.rot = new Float32Array(n)
    this.spin = new Float32Array(n)
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    const attr = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    this.aA = attr()
    this.aB = attr()
    this.aC = attr()
    this.aD = attr()
    this.attrs = [this.aA, this.aB, this.aC, this.aD]
    g.setAttribute('iA', this.aA)
    g.setAttribute('iB', this.aB)
    g.setAttribute('iC', this.aC)
    g.setAttribute('iD', this.aD)
    g.instanceCount = 0
    this.geometry = g
    this.material = new THREE.ShaderMaterial({
      uniforms: { uAdditive: { value: additive ? 1 : 0 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide
    })
    this.mesh = new THREE.Mesh(g, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = additive ? 20 : 10
  }

  get alive() {
    return this.count
  }

  get capacity() {
    return this.cap
  }

  /** Adds a particle (drops it when the pool is full). */
  add(p: Particle) {
    if (this.count >= this.cap) return
    const i = this.count++
    const i3 = i * 3
    this.pos[i3] = p.x
    this.pos[i3 + 1] = p.y
    this.pos[i3 + 2] = p.z
    this.vel[i3] = p.vx
    this.vel[i3 + 1] = p.vy
    this.vel[i3 + 2] = p.vz
    this.col[i3] = p.r
    this.col[i3 + 1] = p.g
    this.col[i3 + 2] = p.b
    this.endCol[i3] = p.endR
    this.endCol[i3 + 1] = p.endG
    this.endCol[i3 + 2] = p.endB
    this.t[i] = 0
    this.life[i] = Math.max(0.01, p.life)
    this.size[i] = p.size
    this.sizeEnd[i] = p.sizeEnd
    this.alpha[i] = p.alpha
    this.fadeIn[i] = p.fadeIn
    this.grav[i] = p.gravity
    this.drag[i] = p.drag
    this.shape[i] = p.shape
    this.stretch[i] = p.stretch
    this.flat[i] = p.flat ? 1 : 0
    this.rot[i] = p.rot
    this.spin[i] = p.spin
  }

  update(dt: number) {
    let i = 0
    const A = this.aA.array as Float32Array
    const B = this.aB.array as Float32Array
    const C = this.aC.array as Float32Array
    const D = this.aD.array as Float32Array
    while (i < this.count) {
      const age = this.t[i] + dt
      if (age >= this.life[i]) {
        this.swapRemove(i)
        continue
      }
      this.t[i] = age
      const i3 = i * 3
      const k = Math.max(0, 1 - this.drag[i] * dt)
      this.vel[i3] *= k
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt
      this.vel[i3 + 2] *= k
      this.pos[i3] += this.vel[i3] * dt
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      this.rot[i] += this.spin[i] * dt
      const u = age / this.life[i]
      const fi = this.fadeIn[i]
      const fade = u < fi ? u / fi : 1 - (u - fi) / (1 - fi)
      const i4 = i * 4
      A[i4] = this.pos[i3]
      A[i4 + 1] = this.pos[i3 + 1]
      A[i4 + 2] = this.pos[i3 + 2]
      A[i4 + 3] = this.size[i] + (this.sizeEnd[i] - this.size[i]) * u
      B[i4] = this.vel[i3]
      B[i4 + 1] = this.vel[i3 + 1]
      B[i4 + 2] = this.vel[i3 + 2]
      B[i4 + 3] = this.rot[i]
      C[i4] = this.col[i3] * (1 + (this.endCol[i3] - 1) * u)
      C[i4 + 1] = this.col[i3 + 1] * (1 + (this.endCol[i3 + 1] - 1) * u)
      C[i4 + 2] = this.col[i3 + 2] * (1 + (this.endCol[i3 + 2] - 1) * u)
      C[i4 + 3] = this.alpha[i] * Math.max(0, fade)
      D[i4] = this.shape[i]
      D[i4 + 1] = this.stretch[i]
      D[i4 + 2] = this.flat[i]
      D[i4 + 3] = u
      i++
    }
    this.drawn = this.count
  }

  /** Draws a particle for this frame only (telegraphs, rings with progress); call between update and flush. */
  draw(p: Particle, age = 0.5) {
    if (this.drawn >= this.cap) return
    const i4 = this.drawn++ * 4
    const A = this.aA.array as Float32Array
    const B = this.aB.array as Float32Array
    const C = this.aC.array as Float32Array
    const D = this.aD.array as Float32Array
    A[i4] = p.x
    A[i4 + 1] = p.y
    A[i4 + 2] = p.z
    A[i4 + 3] = p.size
    B[i4] = p.vx
    B[i4 + 1] = p.vy
    B[i4 + 2] = p.vz
    B[i4 + 3] = p.rot
    C[i4] = p.r
    C[i4 + 1] = p.g
    C[i4 + 2] = p.b
    C[i4 + 3] = p.alpha
    D[i4] = p.shape
    D[i4 + 1] = p.stretch
    D[i4 + 2] = p.flat ? 1 : 0
    D[i4 + 3] = age
  }

  /** Uploads this frame's instances. */
  flush() {
    const n = this.drawn
    this.geometry.instanceCount = n
    for (const a of this.attrs) {
      a.clearUpdateRanges()
      if (n > 0) {
        a.addUpdateRange(0, n * 4)
        a.needsUpdate = true
      }
    }
  }

  private swapRemove(i: number) {
    const last = --this.count
    if (i === last) return
    const i3 = i * 3
    const l3 = last * 3
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[l3 + k]
      this.vel[i3 + k] = this.vel[l3 + k]
      this.col[i3 + k] = this.col[l3 + k]
      this.endCol[i3 + k] = this.endCol[l3 + k]
    }
    this.t[i] = this.t[last]
    this.life[i] = this.life[last]
    this.size[i] = this.size[last]
    this.sizeEnd[i] = this.sizeEnd[last]
    this.alpha[i] = this.alpha[last]
    this.fadeIn[i] = this.fadeIn[last]
    this.grav[i] = this.grav[last]
    this.drag[i] = this.drag[last]
    this.shape[i] = this.shape[last]
    this.stretch[i] = this.stretch[last]
    this.flat[i] = this.flat[last]
    this.rot[i] = this.rot[last]
    this.spin[i] = this.spin[last]
  }

  clear() {
    this.count = 0
    this.drawn = 0
    this.geometry.instanceCount = 0
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
