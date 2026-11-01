import * as THREE from 'three'
import { pose } from './animation.js'

// Model units: a character is ~0.9 tall with its base at y=0 and its face toward +Z.
const FACE = 0.6 // Turned from the lane toward the viewer so faces stay readable.
const FALL_SECONDS = 0.42

/** Stacked soft tiers, revolved: the classic swirl silhouette. */
function poopGeometry() {
  const tiers = [
    [0.12, 0.2, 0.48],
    [0.38, 0.15, 0.36],
    [0.58, 0.13, 0.25],
    [0.75, 0.13, 0.13]
  ]
  const points = [new THREE.Vector2(0, 0)]
  for (let i = 0; i <= 48; i++) {
    const y = (i / 48) * 0.88
    let r = 0
    for (const [c, h, R] of tiers) if (Math.abs(y - c) < h) r = Math.max(r, R * Math.sqrt(1 - ((y - c) / h) ** 2))
    points.push(new THREE.Vector2(Math.max(r, 0.001), y))
  }
  points.push(new THREE.Vector2(0, 0.88))
  return new THREE.LatheGeometry(points, 28)
}
const lathe = (points) =>
  new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    28
  )
const GEO = {
  poop: poopGeometry(),
  bottle: lathe([
    [0, 0],
    [0.22, 0],
    [0.23, 0.05],
    [0.23, 0.5],
    [0.17, 0.62],
    [0.09, 0.72],
    [0.08, 0.9],
    [0, 0.9]
  ]),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  hemi: new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  bowl: new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  tapered: new THREE.CylinderGeometry(1, 0.78, 1, 24),
  cone: new THREE.ConeGeometry(1, 1, 20),
  ring: new THREE.TorusGeometry(1, 0.13, 8, 28),
  arc: new THREE.TorusGeometry(1, 0.26, 6, 14, Math.PI),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 16),
  disc: new THREE.CircleGeometry(1, 16)
}
const DOUBLE = { side: THREE.DoubleSide }
const GLOW = (color, intensity = 0.6) => ({ emissive: color, emissiveIntensity: intensity })
const CLEAR = (opacity) => ({ opacity, base: opacity })

/** Part builder handed to each character recipe. */
class Kit {
  constructor() {
    this.parts = []
    this.materials = []
    this.refs = {}
  }
  mat(color, extra = {}) {
    const { base = 1, ...rest } = extra
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true, ...rest })
    m.userData.base = base
    this.materials.push(m)
    return m
  }
  add(geometry, color, at = [0, 0, 0], scale = 1, rotation = [0, 0, 0], extra = {}) {
    const m = new THREE.Mesh(geometry, color instanceof THREE.Material ? color : this.mat(color, extra))
    m.position.set(...at)
    if (Array.isArray(scale)) m.scale.set(...scale)
    else m.scale.setScalar(scale)
    m.rotation.set(...rotation)
    this.parts.push(m)
    return m
  }
  /** Eyes and mouth. mood: happy | angry | sleepy | drunk | cool | hyper. */
  face({ y, z, spread = 0.12, size = 1, mood = 'happy' }) {
    const s = size
    for (const side of [-1, 1]) {
      const x = side * spread
      this.add(GEO.sphere, '#fffaf0', [x, y, z], 0.085 * s)
      this.add(GEO.sphere, '#2a170a', [x, y + 0.01 * s, z + 0.07 * s], (mood === 'hyper' ? 0.028 : 0.045) * s)
      if (mood === 'angry')
        this.add(
          GEO.box,
          '#2a170a',
          [x, y + 0.11 * s, z + 0.03 * s],
          [0.12 * s, 0.025 * s, 0.03 * s],
          [0, 0, side * -0.45]
        )
      if (mood === 'sleepy') {
        this.add(GEO.hemi, '#6b6f88', [x, y + 0.005 * s, z + 0.005 * s], 0.09 * s, [0.35, 0, 0])
        this.add(GEO.box, '#7a5a9a', [x, y - 0.1 * s, z + 0.02 * s], [0.1 * s, 0.02 * s, 0.02 * s])
      }
      if (mood === 'drunk' || mood === 'cool')
        this.add(
          GEO.sphere,
          mood === 'drunk' ? '#ff6b6b' : '#8fd3ff',
          [x * 1.6, y - 0.1 * s, z - 0.01],
          [0.05 * s, 0.03 * s, 0.02 * s],
          undefined,
          CLEAR(0.8)
        )
    }
    const mouth = this.add(GEO.arc, '#2a170a', [0, y - 0.15 * s, z + 0.05 * s], 0.07 * s)
    mouth.rotation.z = mood === 'angry' ? 0 : Math.PI
    if (mood === 'sleepy') mouth.scale.set(0.05 * s, 0.03 * s, 0.07 * s)
  }
}

const BROWN = '#7a4722'
function poop(k, color = BROWN, squash = [1, 1, 1], faceAt = { y: 0.4, z: 0.31 }) {
  k.add(GEO.poop, color, [0, 0, 0], squash, undefined, { roughness: 0.42 })
  k.add(GEO.cone, color, [0.04, 0.9 * squash[1], 0], [0.07, 0.18, 0.07], [0, 0, -0.7], { roughness: 0.42 })
  k.face({ ...faceAt, mood: 'happy' })
}
function person(k, uniform, faceMood = 'angry') {
  for (const s of [-1, 1]) k.add(GEO.cyl, '#2c3344', [s * 0.08, 0.15, 0], [0.06, 0.3, 0.06])
  k.add(GEO.tapered, uniform, [0, 0.45, 0], [0.2, 0.34, 0.16])
  for (const s of [-1, 1]) k.add(GEO.cyl, uniform, [s * 0.24, 0.46, 0], [0.05, 0.3, 0.05], [0, 0, s * 0.35])
  k.add(GEO.sphere, '#f0c7a0', [0, 0.78, 0], 0.17)
  k.face({ y: 0.78, z: 0.15, spread: 0.065, size: 0.55, mood: faceMood })
}

/** Character recipes by unit key. Size scales the whole figure. */
const MODELS = {
  // ── Poop army ──
  katachi: {
    size: 1,
    build(k) {
      poop(k)
      k.add(GEO.hemi, '#c9a46a', [0, 0.6, 0], 0.28, undefined, { metalness: 0.2, roughness: 0.35 })
      k.add(GEO.cyl, '#c9a46a', [-0.3, 0.24, 0.32], [0.24, 0.05, 0.24], [Math.PI / 2, -0.5, 0.25], { metalness: 0.2 })
    }
  },
  korokoro: {
    size: 0.86,
    build(k) {
      poop(k, '#8a5229')
      k.add(GEO.ring, '#d64a3a', [0, 0.57, 0], 0.27, [Math.PI / 2, 0, 0])
      k.refs.pellet = k.add(GEO.sphere, '#8a5229', [0.36, 0.42, 0.18], 0.075)
    }
  },
  geri: {
    size: 1.14,
    build(k) {
      poop(k, '#9a5d2e')
      k.add(GEO.ring, '#3f8f4a', [0, 0.56, 0], 0.27, [Math.PI / 2, 0, 0])
      for (const s of [-1, 1]) k.add(GEO.box, '#3f8f4a', [s * 0.06, 0.5, -0.27], [0.05, 0.16, 0.03], [0, 0, s * 0.6])
      const fly = new THREE.Group()
      fly.add(k.add(GEO.sphere, '#1c1c1c', [0, 0, 0], 0.04))
      for (const s of [-1, 1])
        fly.add(k.add(GEO.disc, '#ffffff', [s * 0.04, 0.04, 0], 0.05, undefined, { ...DOUBLE, ...CLEAR(0.6) }))
      k.parts = k.parts.filter((p) => p.parent !== fly)
      k.refs.orbit = fly
      k.parts.push(fly)
    }
  },
  bichi: {
    size: 1,
    build(k) {
      poop(k, '#a0703e', [1.18, 0.72, 1.18], { y: 0.3, z: 0.38 })
      for (const [x, y, z, r] of [
        [0.44, 0.52, 0.05, 0.06],
        [-0.42, 0.42, 0.12, 0.05],
        [0.3, 0.68, -0.1, 0.04]
      ])
        k.add(GEO.sphere, '#9fd8ff', [x, y, z], [r, r * 1.4, r], undefined, CLEAR(0.85))
      for (const [x, z] of [
        [0.55, 0.2],
        [-0.5, -0.25],
        [0.1, 0.55]
      ])
        k.add(GEO.sphere, '#a0703e', [x, 0.01, z], [0.09, 0.02, 0.07])
    }
  },
  dodeka: {
    size: 1.35,
    build(k) {
      poop(k, '#5e3518')
      k.add(GEO.ring, '#d64a3a', [0, 0.15, 0], [0.47, 0.47, 0.7], [Math.PI / 2, 0, 0])
      k.add(GEO.box, '#f2e6c9', [0.2, 0.68, 0.2], [0.14, 0.04, 0.02], [0, 0, 0.6])
      k.add(GEO.box, '#f2e6c9', [0.2, 0.68, 0.2], [0.14, 0.04, 0.02], [0, 0, -0.6])
    }
  },
  daiou: {
    size: 1.25,
    build(k) {
      poop(k, '#4a2a12')
      k.add(GEO.box, '#b3202a', [0, 0.42, -0.34], [0.62, 0.62, 0.04], [0.2, 0, 0])
      k.add(GEO.cyl, '#f2c14e', [0.04, 0.95, 0], [0.15, 0.08, 0.15], undefined, { metalness: 0.6, roughness: 0.3 })
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        k.add(
          GEO.cone,
          '#f2c14e',
          [0.04 + Math.cos(a) * 0.13, 1.04, Math.sin(a) * 0.13],
          [0.035, 0.1, 0.035],
          undefined,
          { metalness: 0.6 }
        )
      }
      k.add(GEO.sphere, '#d64a3a', [0.04, 0.95, 0.15], 0.03)
    }
  },
  // ── Specials: things that upset the stomach ──
  aircon: {
    size: 1,
    build(k) {
      k.add(GEO.box, '#f3f5f7', [0, 0.52, 0], [0.84, 0.42, 0.34])
      k.add(GEO.box, '#bcc5cd', [0, 0.34, 0.12], [0.76, 0.06, 0.12])
      k.add(GEO.box, '#9aa4ad', [0, 0.32, 0.18], [0.7, 0.02, 0.05], [0.5, 0, 0])
      k.add(GEO.box, '#5ad1ff', [0.34, 0.66, 0.171], [0.05, 0.025, 0.01], undefined, GLOW('#5ad1ff', 1))
      for (let i = 0; i < 3; i++)
        k.add(
          GEO.ring,
          '#bfe6ff',
          [-0.22 + i * 0.22, 0.16 - (i % 2) * 0.05, 0.12],
          0.06,
          [Math.PI / 2, 0, 0],
          CLEAR(0.75)
        )
      k.face({ y: 0.55, z: 0.17, spread: 0.16, mood: 'cool' })
    }
  },
  ramen: {
    size: 1,
    build(k) {
      k.add(GEO.bowl, '#c8302c', [0, 0.4, 0], [0.46, 0.4, 0.46], undefined, DOUBLE)
      k.add(GEO.ring, '#f6f0e4', [0, 0.4, 0], 0.46, [Math.PI / 2, 0, 0])
      k.add(GEO.cyl, '#e2a64a', [0, 0.38, 0], [0.43, 0.02, 0.43])
      for (const [x, z] of [
        [-0.1, 0.08],
        [0.08, -0.12],
        [0.15, 0.12],
        [-0.18, -0.1]
      ])
        k.add(GEO.ring, '#f3d36b', [x, 0.395, z], 0.08, [Math.PI / 2, 0, 0])
      k.add(GEO.cyl, '#fbf3ee', [0.18, 0.41, 0.06], [0.09, 0.02, 0.09], [0.2, 0, 0])
      k.add(GEO.ring, '#e86a9a', [0.18, 0.423, 0.06], 0.045, [Math.PI / 2 + 0.2, 0, 0])
      k.add(GEO.cyl, '#9a5a32', [-0.16, 0.42, -0.04], [0.13, 0.025, 0.13], [0.3, 0, 0.2])
      k.add(GEO.box, '#1f3b22', [0.04, 0.52, -0.3], [0.2, 0.26, 0.01], [-0.2, 0, 0])
      for (const s of [0, 0.05]) k.add(GEO.cyl, '#d9b277', [0.26 + s, 0.62, -0.02], [0.012, 0.7, 0.012], [0, 0, -0.5])
      k.face({ y: 0.22, z: 0.4, spread: 0.13 })
    }
  },
  yofukashi: {
    size: 0.95,
    build(k) {
      k.add(GEO.box, '#22252e', [0, 0.47, 0], [0.46, 0.82, 0.08])
      k.add(GEO.box, '#3b6fd8', [0, 0.47, 0.041], [0.4, 0.68, 0.01], undefined, GLOW('#3b6fd8', 0.7))
      k.add(GEO.cone, '#2c3e8f', [0.04, 0.98, 0], [0.2, 0.3, 0.2], [0, 0, -0.3])
      k.add(GEO.sphere, '#ffffff', [0.13, 1.11, 0], 0.06)
      k.add(GEO.sphere, '#ffe28a', [-0.3, 0.88, -0.1], 0.07, undefined, GLOW('#ffe28a', 0.8))
      k.face({ y: 0.56, z: 0.05, spread: 0.1, size: 0.9, mood: 'sleepy' })
    }
  },
  sake: {
    size: 1,
    build(k) {
      k.add(GEO.bottle, '#2f6b45', [0, 0, 0], 1, undefined, { roughness: 0.15, ...CLEAR(0.92) })
      k.add(GEO.box, '#fbf6e9', [0, 0.3, 0.225], [0.3, 0.3, 0.02])
      k.add(GEO.cyl, '#d33a2c', [0, 0.93, 0], [0.085, 0.06, 0.085])
      k.face({ y: 0.32, z: 0.24, spread: 0.08, size: 0.8, mood: 'drunk' })
    }
  },
  jiro: {
    size: 1.25,
    build(k) {
      k.add(GEO.bowl, '#f2efe6', [0, 0.36, 0], [0.5, 0.36, 0.5], undefined, DOUBLE)
      k.add(GEO.ring, '#2d4f8a', [0, 0.36, 0], 0.5, [Math.PI / 2, 0, 0])
      k.add(GEO.cyl, '#b07a3c', [0, 0.34, 0], [0.47, 0.02, 0.47])
      k.add(GEO.cone, '#eef2c8', [0, 0.62, 0], [0.34, 0.52, 0.34])
      for (const [x, y, z] of [
        [0.12, 0.6, 0.18],
        [-0.15, 0.5, 0.2],
        [0.05, 0.78, 0.08]
      ])
        k.add(GEO.sphere, '#7fb24a', [x, y, z], [0.06, 0.03, 0.05])
      for (const s of [-1, 1]) k.add(GEO.box, '#8a4b2a', [s * 0.3, 0.46, 0.05], [0.24, 0.08, 0.2], [0, 0, s * 0.7])
      for (const [x, z] of [
        [0.05, 0.25],
        [-0.08, 0.28]
      ])
        k.add(GEO.sphere, '#fffef6', [x, 0.42, z], 0.045)
      k.add(GEO.sphere, '#f4e3b0', [0.02, 0.9, 0], [0.08, 0.04, 0.08])
      k.face({ y: 0.18, z: 0.44, spread: 0.14 })
    }
  },
  yakiniku: {
    size: 1,
    build(k) {
      k.add(GEO.tapered, '#c9a27a', [0, 0.2, 0], [0.36, 0.4, 0.36])
      k.add(GEO.ring, '#3a3a3a', [0, 0.41, 0], 0.37, [Math.PI / 2, 0, 0], { metalness: 0.5 })
      for (const x of [-0.2, 0, 0.2])
        k.add(GEO.box, '#3a3a3a', [x, 0.41, 0], [0.015, 0.015, 0.68], undefined, { metalness: 0.5 })
      for (const [x, z, r] of [
        [-0.13, 0.05, 0.3],
        [0.12, -0.08, -0.4],
        [0.02, 0.15, 0.1]
      ]) {
        k.add(GEO.box, '#8b3a2a', [x, 0.44, z], [0.22, 0.03, 0.14], [0, r, 0])
        k.add(GEO.box, '#f1d6c4', [x, 0.456, z], [0.22, 0.005, 0.03], [0, r, 0])
      }
      for (const [x, z] of [
        [-0.05, -0.15],
        [0.2, 0.1]
      ])
        k.add(GEO.cone, '#ff9a3c', [x, 0.52, z], [0.04, 0.12, 0.04], undefined, GLOW('#ff7a1c', 0.8))
      k.add(GEO.box, '#2a2a2a', [0, 0.12, 0.33], [0.16, 0.08, 0.02])
      k.face({ y: 0.27, z: 0.36, spread: 0.11, size: 0.85 })
    }
  },
  garlic: {
    size: 0.95,
    build(k) {
      k.add(GEO.sphere, '#f4ede0', [0, 0.36, 0], [0.4, 0.36, 0.4])
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3
        k.add(GEO.sphere, i % 2 ? '#efe2d6' : '#e8d4e4', [Math.cos(a) * 0.2, 0.38, Math.sin(a) * 0.2], [0.2, 0.33, 0.2])
      }
      k.add(GEO.cone, '#e8dcc6', [0, 0.8, 0], [0.08, 0.24, 0.08])
      for (const x of [-0.08, 0, 0.08]) k.add(GEO.cyl, '#bfa47a', [x, 0.02, 0], [0.01, 0.06, 0.01])
      k.face({ y: 0.4, z: 0.4, spread: 0.12 })
    }
  },
  curry: {
    size: 1,
    build(k) {
      k.add(GEO.cyl, '#f8f6f0', [0, 0.02, 0], [0.5, 0.04, 0.5])
      k.add(GEO.hemi, '#fbfbf5', [-0.04, 0.04, 0], [0.36, 0.52, 0.36])
      k.add(GEO.sphere, '#a8541a', [0.17, 0.14, 0.04], [0.32, 0.28, 0.32])
      for (const [x, z] of [
        [0.24, 0.24],
        [0.3, -0.05]
      ])
        k.add(GEO.box, '#e0902a', [x, 0.36, z], 0.06)
      k.add(GEO.cone, '#d62a1c', [0, 0.64, 0], [0.05, 0.2, 0.05], [0, 0, 0.5])
      for (const s of [-1, 1])
        k.add(GEO.cone, '#ff5a1c', [s * 0.3, 0.62, -0.05], [0.05, 0.16, 0.05], [0, 0, -s * 0.3], GLOW('#ff3a0c', 0.9))
      k.face({ y: 0.3, z: 0.32, spread: 0.11, size: 0.9 })
    }
  },
  milk: {
    size: 0.95,
    build(k) {
      k.add(GEO.box, '#f7f7f2', [0, 0.3, 0], [0.42, 0.56, 0.42])
      k.add(GEO.box, '#3d7fd0', [0, 0.16, 0], [0.43, 0.14, 0.43])
      for (const s of [-1, 1]) k.add(GEO.box, '#f7f7f2', [0, 0.65, s * 0.1], [0.42, 0.02, 0.26], [s * 0.75, 0, 0])
      k.add(GEO.box, '#e6e6e0', [0, 0.77, 0], [0.42, 0.07, 0.02])
      k.face({ y: 0.38, z: 0.22, spread: 0.1, size: 0.9 })
    }
  },
  oyster: {
    size: 1,
    build(k) {
      k.add(GEO.sphere, '#8d918b', [0, 0.14, 0], [0.44, 0.14, 0.36])
      k.add(GEO.sphere, '#efe4cf', [0, 0.24, 0.02], [0.34, 0.1, 0.27], undefined, { roughness: 0.15 })
      k.add(GEO.sphere, '#a3a69f', [0, 0.5, -0.22], [0.44, 0.1, 0.34], [-1.1, 0, 0])
      k.add(GEO.sphere, '#f4e04a', [0.32, 0.3, 0.12], [0.08, 0.06, 0.04])
      k.face({ y: 0.33, z: 0.24, spread: 0.11, size: 0.85 })
    }
  },
  ice: {
    size: 0.95,
    build(k) {
      k.add(GEO.cone, '#d9a35a', [0, 0.25, 0], [0.2, 0.5, 0.2], [Math.PI, 0, 0])
      k.add(GEO.sphere, '#f6b6c8', [0, 0.56, 0], 0.23)
      k.add(GEO.sphere, '#bff0d4', [0, 0.8, 0], 0.18)
      k.add(GEO.sphere, '#f6b6c8', [0.12, 0.4, 0.14], [0.04, 0.07, 0.04])
      k.add(GEO.sphere, '#d62a3c', [0.02, 0.98, 0], 0.05)
      k.face({ y: 0.56, z: 0.2, spread: 0.08, size: 0.75, mood: 'cool' })
    }
  },
  energy: {
    size: 0.95,
    build(k) {
      k.add(GEO.cyl, '#1f3a26', [0, 0.38, 0], [0.2, 0.72, 0.2], undefined, { metalness: 0.5, roughness: 0.3 })
      k.add(GEO.cyl, '#c9cdd2', [0, 0.755, 0], [0.18, 0.03, 0.18], undefined, { metalness: 0.8 })
      k.add(GEO.box, '#c8f04a', [0.02, 0.22, 0.2], [0.05, 0.18, 0.01], [0, 0, 0.5], GLOW('#c8f04a', 0.5))
      k.add(GEO.box, '#c8f04a', [-0.02, 0.1, 0.2], [0.05, 0.14, 0.01], [0, 0, 0.5], GLOW('#c8f04a', 0.5))
      k.face({ y: 0.5, z: 0.2, spread: 0.08, size: 0.8, mood: 'hyper' })
    }
  },
  // ── Enemies: the cleanup crew ──
  cleaner: {
    size: 1,
    build(k) {
      person(k, '#3d6fb6')
      k.add(GEO.hemi, '#2e5f9e', [0, 0.82, 0], 0.175)
      k.add(GEO.box, '#2e5f9e', [0, 0.83, 0.14], [0.16, 0.02, 0.12])
      k.add(GEO.cyl, '#c9a46a', [0.32, 0.42, 0.12], [0.015, 0.8, 0.015], [0, 0, 0.2])
      k.add(GEO.box, '#3a7bd5', [0.4, 0.04, 0.12], [0.24, 0.06, 0.08])
      k.add(GEO.box, '#f4f4f4', [0.4, 0.0, 0.12], [0.22, 0.03, 0.07])
    }
  },
  mop: {
    size: 1,
    build(k) {
      person(k, '#7b5aa6')
      k.add(GEO.hemi, '#d04a8a', [0, 0.8, -0.01], 0.185)
      k.add(GEO.sphere, '#d04a8a', [0, 0.84, -0.18], 0.05)
      k.add(GEO.box, '#f39ac4', [0, 0.4, 0.17], [0.28, 0.32, 0.02])
      k.add(GEO.cyl, '#c9a46a', [0.33, 0.45, 0.14], [0.015, 0.85, 0.015], [0, 0, 0.18])
      k.add(GEO.cone, '#e8e8e2', [0.41, 0.06, 0.14], [0.13, 0.16, 0.13])
    }
  },
  yogurt: {
    size: 0.9,
    build(k) {
      k.add(GEO.tapered, '#fbfbf7', [0, 0.3, 0], [0.3, 0.6, 0.3])
      k.add(GEO.cyl, '#4a7fd0', [0, 0.3, 0], [0.276, 0.26, 0.276])
      k.add(GEO.cyl, '#d8dde3', [0, 0.61, 0], [0.31, 0.02, 0.31], undefined, { metalness: 0.7, roughness: 0.25 })
      k.add(GEO.box, '#d8dde3', [0.26, 0.66, 0.1], [0.14, 0.01, 0.12], [0, 0, 0.6], { metalness: 0.7 })
      k.add(GEO.sphere, '#e2334a', [-0.06, 0.66, 0], [0.07, 0.08, 0.07])
      k.face({ y: 0.32, z: 0.28, spread: 0.09, size: 0.85, mood: 'angry' })
    }
  },
  sayu: {
    size: 0.85,
    build(k) {
      k.add(GEO.cyl, '#e7dcc4', [0, 0.23, 0], [0.26, 0.46, 0.26])
      k.add(GEO.ring, '#5a7fb5', [0, 0.36, 0], 0.262, [Math.PI / 2, 0, 0])
      k.add(GEO.cyl, '#f6f3ea', [0, 0.455, 0], [0.235, 0.01, 0.235])
      for (const [x, y, r] of [
        [-0.08, 0.62, 0.07],
        [0.05, 0.76, 0.09],
        [-0.04, 0.92, 0.06]
      ])
        k.add(GEO.sphere, '#ffffff', [x, y, 0], r, undefined, CLEAR(0.45))
      k.face({ y: 0.23, z: 0.26, spread: 0.08, size: 0.8, mood: 'angry' })
    }
  },
  washiki: {
    size: 1.2,
    build(k) {
      k.add(GEO.sphere, '#f7f9fa', [0, 0.1, 0], [0.48, 0.12, 0.3])
      k.add(GEO.sphere, '#bfe2f2', [-0.05, 0.2, 0], [0.34, 0.025, 0.2])
      k.add(GEO.ring, '#ffffff', [0, 0.2, 0], [0.44, 0.28, 0.25], [Math.PI / 2, 0, 0])
      k.add(GEO.hemi, '#ffffff', [0, 0.12, 0.18], [0.26, 0.38, 0.2])
      k.add(GEO.cyl, '#a9b4bb', [-0.38, 0.32, -0.2], [0.035, 0.5, 0.035], undefined, { metalness: 0.6 })
      k.face({ y: 0.32, z: 0.34, spread: 0.1, size: 0.85, mood: 'angry' })
    }
  },
  yoshiki: {
    size: 1.1,
    build(k) {
      k.add(GEO.tapered, '#fbfcfd', [0, 0.2, 0.06], [0.3, 0.4, 0.34])
      k.add(GEO.ring, '#eef1f3', [0, 0.41, 0.06], [0.3, 0.36, 0.4], [Math.PI / 2, 0, 0])
      k.add(GEO.cyl, '#f4f6f7', [0, 0.62, -0.26], [0.3, 0.03, 0.34], [Math.PI / 2 - 0.2, 0, 0])
      k.add(GEO.box, '#fbfcfd', [0, 0.86, -0.38], [0.48, 0.24, 0.16])
      k.add(GEO.box, '#b9c3ca', [0.2, 0.92, -0.29], [0.08, 0.02, 0.03], undefined, { metalness: 0.7 })
      k.face({ y: 0.6, z: -0.2, spread: 0.1, size: 0.9, mood: 'angry' })
    }
  },
  seichou: {
    size: 0.9,
    build(k) {
      k.add(GEO.capsule, '#f07aa0', [0, 0.44, 0], [0.44, 0.42, 0.44])
      k.add(GEO.capsule, '#fbfbfb', [0, 0.24, 0], [0.45, 0.22, 0.45])
      k.face({ y: 0.6, z: 0.2, spread: 0.08, size: 0.8, mood: 'angry' })
    }
  },
  geridome: {
    size: 1.35,
    build(k) {
      k.add(GEO.bottle, '#7a3f16', [0, 0, 0], [1.3, 1, 1.3], undefined, { roughness: 0.2 })
      k.add(GEO.box, '#fbf6e9', [0, 0.3, 0.29], [0.4, 0.3, 0.02])
      k.add(GEO.box, '#c62f2f', [0, 0.41, 0.3], [0.4, 0.05, 0.01])
      k.add(GEO.cyl, '#fbfbfb', [0, 0.94, 0], [0.12, 0.1, 0.12])
      const pills = new THREE.Group()
      for (const s of [-1, 1]) pills.add(k.add(GEO.sphere, '#ffffff', [s * 0.07, 0, 0], [0.06, 0.03, 0.06]))
      k.parts = k.parts.filter((p) => p.parent !== pills)
      k.refs.orbit = pills
      k.parts.push(pills)
      k.face({ y: 0.28, z: 0.3, spread: 0.1, size: 0.9, mood: 'angry' })
    }
  }
}
export const modelSize = (key) => MODELS[key]?.size ?? 1

/** One procedural character. */
class Actor {
  constructor(key) {
    const recipe = MODELS[key] ?? MODELS.katachi
    const kit = new Kit()
    recipe.build(kit)
    this.materials = kit.materials
    this.refs = kit.refs
    this.size = recipe.size
    this.root = new THREE.Group()
    this.body = new THREE.Group()
    this.root.add(this.body)
    this.body.rotation.y = FACE
    this.pose = new THREE.Group()
    this.body.add(this.pose)
    for (const part of kit.parts) this.pose.add(part)
    this.pelletY = this.refs.pellet?.position.y
  }

  /** k: lane-x units per model unit; aspect: x-to-y pixel ratio. The player (side 1) faces left. */
  place(x, y, side, k, aspect) {
    this.root.position.set(x, 450 - y, (y - 361) * 12)
    this.root.scale.set(-k * side, k * aspect, k)
  }

  animate({ shift, hop, lean, squash }, time) {
    this.pose.position.set(0, hop, shift)
    this.pose.rotation.x = lean
    const wide = this.size / Math.sqrt(squash)
    this.pose.scale.set(wide, this.size * squash, wide)
    if (this.refs.pellet) this.refs.pellet.position.y = this.pelletY + Math.max(0, shift) * 0.6
    if (this.refs.orbit)
      this.refs.orbit.position.set(
        Math.cos(time * 7) * 0.42,
        0.95 + Math.sin(time * 13) * 0.05,
        Math.sin(time * 7) * 0.42
      )
  }

  setOpacity(opacity) {
    for (const m of this.materials) m.opacity = m.userData.base * opacity
  }

  dispose() {
    for (const m of this.materials) m.dispose()
  }
}

/** Procedural three.js characters, rendered into an offscreen WebGL canvas in the 1000×450 lane space. */
export class LaneModels {
  canvas = document.createElement('canvas')
  renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1000, 450, 0, -2000, 2000)
  actors = new Map()
  presentation = [1, 1]
  portraits = new Map()

  constructor() {
    this.renderer.setClearColor(0, 0)
    this.scene.add(new THREE.HemisphereLight(0xfffbf0, 0x6b4a2f, 2.2))
    const key = new THREE.DirectionalLight(0xfff4db, 2.6)
    key.position.set(-300, 600, 800)
    this.scene.add(key)
  }

  actor(id, key) {
    let actor = this.actors.get(id)
    if (!actor) {
      actor = new Actor(key)
      this.scene.add(actor.root)
      this.actors.set(id, actor)
    }
    actor.seen = true
    return actor
  }

  /** size: the lane's unit width; aspect: x-to-y pixel ratio of the stretched lane canvas. */
  setPresentation(size, aspect) {
    this.presentation = [size * 0.62, aspect]
  }

  unit(u, x, y, time) {
    const actor = this.actor(u.id, u.key)
    actor.place(x, y, u.side, ...this.presentation)
    actor.animate(pose(u.motion, u.phase, u.period, u.walkDistance), time)
    actor.setOpacity(1)
  }

  fallen(ghost, x, y, age, opacity) {
    const actor = this.actor(ghost.id, ghost.key)
    actor.place(x, y, ghost.side, ...this.presentation)
    const s = Math.min(1, age / FALL_SECONDS)
    actor.animate({ shift: 0, hop: 0, lean: 0, squash: 1 - 0.85 * s }, 0)
    actor.setOpacity(Math.max(0, opacity))
  }

  /** Renders this frame's actors at width×height pixels; actors not touched since the last render are released. */
  render(width, height) {
    for (const [id, actor] of this.actors)
      if (!actor.seen) {
        this.scene.remove(actor.root)
        actor.dispose()
        this.actors.delete(id)
      } else actor.seen = false
    if (this.canvas.width !== width || this.canvas.height !== height) this.renderer.setSize(width, height, false)
    this.renderer.render(this.scene, this.camera)
    return this.canvas
  }

  /** One standing pose of a character, centered in a 128×112 portrait, facing the poop army's direction. */
  portrait(key, target) {
    const camera = new THREE.OrthographicCamera(0, 128, 112, 0, -2000, 2000)
    const scene = new THREE.Scene()
    for (const light of this.scene.children) scene.add(light.clone())
    const actor = new Actor(key)
    actor.root.position.set(64, 8, 0)
    const k = 88 / actor.size ** 0.6
    actor.root.scale.set(-k, k, k)
    actor.animate({ shift: 0, hop: 0, lean: 0, squash: 1 }, 0.3)
    scene.add(actor.root)
    this.renderer.setSize(128, 112, false)
    this.renderer.render(scene, camera)
    const context = target.getContext('2d')
    context.clearRect(0, 0, target.width, target.height)
    context.drawImage(this.canvas, 0, 0, target.width, target.height)
    actor.dispose()
  }

  /** Cached data URL portrait for menus. */
  portraitURL(key) {
    if (!this.portraits.has(key)) {
      const c = document.createElement('canvas')
      c.width = 128
      c.height = 112
      this.portrait(key, c)
      this.portraits.set(key, c.toDataURL())
    }
    return this.portraits.get(key)
  }
}
