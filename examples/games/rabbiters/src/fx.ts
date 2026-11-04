import * as THREE from 'three'
import type { JuiceEvent, JuicePoint } from './juice-events'

/** Maximum simultaneously alive particles; older ones are recycled when the pool is full. */
export const FX_CAPACITY = 600

const MAX_SHAKE = 0.18
const TRAUMA_DECAY = 1.6

const VERTEX = `
attribute float size;
attribute float alpha;
attribute vec3 tint;
uniform float uScale;
varying float vAlpha;
varying vec3 vTint;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = `
varying float vAlpha;
varying vec3 vTint;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float a = smoothstep(1.0, 0.55, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vTint, a);
  #include <colorspace_fragment>
}
`

const DUST = [0xe8dcc0, 0xd9c9a3, 0xf2ead6]
const GOLD = [0xffd75e, 0xfff2a8, 0xffffff, 0xffc233]
const GREEN = [0xb6f06a, 0x8fe36b, 0xf4ff9a]
const LEAF = [0x5aa84a, 0x7cc55a, 0x3f8a3a, 0xa6d36a]
const RED = [0xff5a4a, 0xffd0c8, 0xff8a70]
const GREY = [0xb7b7b0, 0x8e8e88, 0xd2d2cc]
const PINK = [0xff9ec4, 0xffd0e2, 0xffd75e, 0xff7fb0]
const BROWN = [0x8b5e3c, 0xa87850, 0x6b4428]
const CONFETTI = [0xffd75e, 0xff8fa8, 0x8fe3b0, 0x8fc8ff, 0xffffff]

interface BurstOptions {
  colors: number[]
  count: number
  speed: number
  /** Extra upward velocity (m/s). */
  up?: number
  /** 0 = flat ring on the ground, 1 = full sphere. */
  spread?: number
  size: number
  life: number
  gravity?: number
  drag?: number
  /** Spawn jitter radius (m). */
  radius?: number
  /** Initial Y offset above the event point. */
  lift?: number
}

export class WorldFx {
  private readonly scene: THREE.Scene
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material: THREE.ShaderMaterial
  private readonly points: THREE.Points
  private readonly pos = new Float32Array(FX_CAPACITY * 3)
  private readonly tint = new Float32Array(FX_CAPACITY * 3)
  private readonly sizeAttr = new Float32Array(FX_CAPACITY)
  private readonly alphaAttr = new Float32Array(FX_CAPACITY)
  private readonly vel = new Float32Array(FX_CAPACITY * 3)
  private readonly age = new Float32Array(FX_CAPACITY)
  private readonly life = new Float32Array(FX_CAPACITY) // 0 = dead
  private readonly size0 = new Float32Array(FX_CAPACITY)
  private readonly gravity = new Float32Array(FX_CAPACITY)
  private readonly drag = new Float32Array(FX_CAPACITY)
  private readonly color = new THREE.Color()
  private readonly reducedMotion =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  private cursor = 0
  private alive = 0
  private trauma = 0
  private time = 0
  private disposed = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizeAttr, 1).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphaAttr, 1).setUsage(THREE.DynamicDrawUsage))
    // Particles move all over the level; skip frustum culling instead of maintaining a bounding sphere.
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 700 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 20
    scene.add(this.points)
    for (let i = 0; i < FX_CAPACITY; i += 1) this.pos[i * 3 + 1] = -1000
  }

  /** Number of currently alive particles. */
  get aliveCount(): number {
    return this.alive
  }

  get currentTrauma(): number {
    return this.trauma
  }

  get prefersReducedMotion(): boolean {
    return this.reducedMotion?.matches ?? false
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, Math.max(0, this.trauma + amount))
  }

  shakeOffset(out: THREE.Vector3): THREE.Vector3 {
    if (this.prefersReducedMotion || this.trauma <= 0.0001) return out.set(0, 0, 0)
    const amp = this.trauma * this.trauma * MAX_SHAKE
    const t = this.time
    const nx = Math.sin(t * 31.7) * 0.6 + Math.sin(t * 17.3 + 1.3) * 0.4
    const ny = Math.sin(t * 27.1 + 2.1) * 0.6 + Math.sin(t * 13.9 + 0.4) * 0.4
    const nz = Math.sin(t * 23.3 + 4.2) * 0.5
    return out.set(nx * amp, ny * amp * 0.8, nz * amp * 0.4)
  }

  emit(event: JuiceEvent): void {
    if (this.disposed) return
    switch (event.type) {
      case 'step':
        if (event.sprint) {
          this.burst(event.at, {
            colors: DUST,
            count: 3,
            speed: 0.5,
            up: 0.3,
            spread: 0.4,
            size: 0.16,
            life: 0.45,
            gravity: -0.4,
            drag: 2,
            radius: 0.12
          })
        } else if (!event.crouch) {
          this.burst(event.at, {
            colors: DUST,
            count: 1,
            speed: 0.2,
            up: 0.15,
            spread: 0.3,
            size: 0.09,
            life: 0.3,
            gravity: -0.2,
            drag: 2,
            radius: 0.1
          })
        }
        break
      case 'jump':
        this.ring(event.at, 8, 1.2, 0.2, 0.5)
        break
      case 'land': {
        const i = Math.min(1, Math.max(0, event.impact))
        this.ring(event.at, 6 + Math.round(i * 12), 1 + i * 2.2, 0.18 + i * 0.12, 0.5 + i * 0.3)
        if (i > 0.4) this.addTrauma(i * 0.25)
        break
      }
      case 'eat': {
        const streak = Math.max(1, event.streak)
        this.burst(event.at, {
          colors: [...GREEN, ...GOLD],
          count: 18 + Math.min(streak, 6) * 4,
          speed: 3.2,
          up: 2.4,
          size: 0.2 + Math.min(streak, 6) * 0.01,
          life: 0.8,
          gravity: 5,
          drag: 1.2,
          lift: 0.6
        })
        this.burst(event.at, {
          colors: LEAF,
          count: 5 + Math.min(streak, 5),
          speed: 2,
          up: 2,
          size: 0.18,
          life: 0.9,
          gravity: 6,
          drag: 0.8,
          lift: 0.3
        })
        break
      }
      case 'pickup':
        this.burst(event.at, {
          colors: GOLD,
          count: 12,
          speed: 0.9,
          up: 2.2,
          spread: 0.5,
          size: 0.13,
          life: 0.8,
          gravity: -1,
          drag: 1.5,
          radius: 0.25,
          lift: 0.2
        })
        break
      case 'drop':
        this.burst(event.at, {
          colors: DUST,
          count: 5,
          speed: 0.8,
          up: 0.4,
          spread: 0.4,
          size: 0.15,
          life: 0.4,
          gravity: 0,
          drag: 2.5,
          radius: 0.15
        })
        break
      case 'taskTick':
        this.burst(event.at, {
          colors: GOLD,
          count: 3,
          speed: 1.6,
          up: 1.2,
          size: 0.1,
          life: 0.45,
          gravity: 5,
          drag: 0.5,
          lift: 0.5
        })
        break
      case 'taskDone':
        this.burst(event.at, {
          colors: GOLD,
          count: 40,
          speed: 5,
          up: 1,
          size: 0.2,
          life: 0.9,
          gravity: 3,
          drag: 1.6,
          lift: 0.8
        })
        this.addTrauma(0.15)
        break
      case 'hurt':
        this.burst(event.at, {
          colors: RED,
          count: 16,
          speed: 3.5,
          up: 1.2,
          size: 0.17,
          life: 0.55,
          gravity: 5,
          drag: 1.5,
          lift: 0.4
        })
        this.addTrauma(0.45)
        break
      case 'downed':
        this.burst(event.at, {
          colors: GREY,
          count: 14,
          speed: 1.2,
          up: 0.8,
          spread: 0.6,
          size: 0.3,
          life: 0.9,
          gravity: -0.5,
          drag: 1.8,
          radius: 0.3,
          lift: 0.2
        })
        this.addTrauma(0.6)
        break
      case 'revived':
        this.burst(event.at, {
          colors: GREEN,
          count: 22,
          speed: 0.7,
          up: 2.4,
          spread: 0.5,
          size: 0.14,
          life: 1.2,
          gravity: -1.2,
          drag: 1,
          radius: 0.5,
          lift: 0.1
        })
        break
      case 'grown':
      case 'pregnant':
        this.burst(event.at, {
          colors: PINK,
          count: 30,
          speed: 1.4,
          up: 4,
          spread: 0.55,
          size: 0.19,
          life: 1.3,
          gravity: 4.5,
          drag: 0.6,
          radius: 0.2,
          lift: 0.4
        })
        break
      case 'hide':
        this.burst(event.at, {
          colors: LEAF,
          count: 14,
          speed: 1.2,
          up: 1.2,
          size: 0.17,
          life: 1.2,
          gravity: 1.2,
          drag: 2,
          radius: 0.4,
          lift: 0.5
        })
        break
      case 'unhide':
        this.burst(event.at, {
          colors: LEAF,
          count: 6,
          speed: 0.9,
          up: 0.9,
          size: 0.14,
          life: 0.9,
          gravity: 1.2,
          drag: 2,
          radius: 0.3,
          lift: 0.4
        })
        break
      case 'spotted':
        if (event.you) this.addTrauma(0.35)
        break
      case 'nestBroken':
        this.burst(event.at, {
          colors: BROWN,
          count: 22,
          speed: 3.2,
          up: 2.4,
          size: 0.22,
          life: 0.9,
          gravity: 9,
          drag: 0.6,
          lift: 0.3
        })
        this.addTrauma(0.3)
        break
      case 'objective':
      case 'bedding':
      case 'kitSafe':
        if (event.at) {
          this.burst(event.at, {
            colors: CONFETTI,
            count: 36,
            speed: 3.6,
            up: 3,
            size: 0.17,
            life: 1.2,
            gravity: 6,
            drag: 1,
            radius: 0.4,
            lift: 0.8
          })
        }
        break
      default:
        break
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    if (this.disposed) return
    const step = Math.min(Math.max(dt, 0), 0.1)
    // Shake time always advances by the real step so the noise stays smooth regardless of frame spikes.
    this.time += step
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * step)

    const cam = camera as THREE.PerspectiveCamera
    if (cam.isPerspectiveCamera) {
      this.material.uniforms.uScale.value = (cam.fov > 0 ? 0.5 / Math.tan((cam.fov * Math.PI) / 360) : 1) * 900
    }

    let alive = 0
    for (let i = 0; i < FX_CAPACITY; i += 1) {
      const maxLife = this.life[i]
      if (maxLife <= 0) continue
      const age = this.age[i] + step
      if (age >= maxLife) {
        this.kill(i)
        continue
      }
      this.age[i] = age
      const i3 = i * 3
      const damp = Math.exp(-this.drag[i] * step)
      this.vel[i3] *= damp
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp - this.gravity[i] * step
      this.vel[i3 + 2] *= damp
      this.pos[i3] += this.vel[i3] * step
      this.pos[i3 + 1] += this.vel[i3 + 1] * step
      this.pos[i3 + 2] += this.vel[i3 + 2] * step
      const t = age / maxLife
      this.alphaAttr[i] = Math.min(1, (1 - t) * 2.2)
      this.sizeAttr[i] = this.size0[i] * (1 - t * 0.6)
      alive += 1
    }
    this.alive = alive
    this.markDirty()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.scene.remove(this.points)
    this.geometry.dispose()
    this.material.dispose()
    this.life.fill(0)
    this.alive = 0
    this.trauma = 0
  }

  private markDirty(): void {
    for (const name of ['position', 'tint', 'size', 'alpha']) {
      this.geometry.getAttribute(name).needsUpdate = true
    }
  }

  private kill(i: number): void {
    this.life[i] = 0
    this.sizeAttr[i] = 0
    this.alphaAttr[i] = 0
    this.pos[i * 3 + 1] = -1000
  }

  private ring(at: JuicePoint, count: number, speed: number, size: number, life: number): void {
    this.burst(at, {
      colors: DUST,
      count,
      speed,
      up: 0.15,
      spread: 0,
      size,
      life,
      gravity: -0.2,
      drag: 3,
      radius: 0.1,
      lift: 0.05
    })
  }

  private slot(): number {
    for (let n = 0; n < FX_CAPACITY; n += 1) {
      const i = (this.cursor + n) % FX_CAPACITY
      if (this.life[i] <= 0) {
        this.cursor = (i + 1) % FX_CAPACITY
        this.alive += 1
        return i
      }
    }
    // Pool full: recycle the slot at the cursor (alive count unchanged).
    const i = this.cursor
    this.cursor = (i + 1) % FX_CAPACITY
    return i
  }

  private burst(at: JuicePoint, o: BurstOptions): void {
    const spread = o.spread ?? 1
    const radius = o.radius ?? 0.1
    for (let n = 0; n < o.count; n += 1) {
      const i = this.slot()
      const i3 = i * 3
      const a = Math.random() * Math.PI * 2
      // Direction: horizontal angle `a`, vertical component scaled by spread.
      const v = (Math.random() * 2 - 1) * spread
      const h = Math.sqrt(Math.max(0, 1 - v * v))
      const sp = o.speed * (0.6 + Math.random() * 0.6)
      const dx = Math.cos(a)
      const dz = Math.sin(a)
      this.pos[i3] = at.x + dx * radius * Math.random()
      this.pos[i3 + 1] = at.y + (o.lift ?? 0)
      this.pos[i3 + 2] = at.z + dz * radius * Math.random()
      this.vel[i3] = dx * h * sp
      this.vel[i3 + 1] = v * sp + (o.up ?? 0) * (0.7 + Math.random() * 0.6)
      this.vel[i3 + 2] = dz * h * sp
      this.age[i] = 0
      this.life[i] = o.life * (0.75 + Math.random() * 0.5)
      this.size0[i] = o.size * (0.7 + Math.random() * 0.6)
      this.gravity[i] = o.gravity ?? 0
      this.drag[i] = o.drag ?? 0
      this.sizeAttr[i] = this.size0[i]
      this.alphaAttr[i] = 1
      this.color.setHex(o.colors[Math.floor(Math.random() * o.colors.length)])
      this.tint[i3] = this.color.r
      this.tint[i3 + 1] = this.color.g
      this.tint[i3 + 2] = this.color.b
    }
    this.markDirty()
  }
}
