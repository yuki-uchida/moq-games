import * as THREE from 'three'
import { pose } from './animation.js'

// Model units: a body is ~0.9 tall with its base at y=0 and its face toward +Z.
const FACE = 0.6 // Turned from the lane toward the viewer so faces stay readable.
const FALL_SECONDS = 0.42
const PALETTES = {
  1: {
    body: '#7a4722',
    dark: '#4b2810',
    gear: '#c9a46a',
    band: '#d64a3a',
    scarf: '#3f8f4a',
    eye: '#fffaf0',
    rough: 0.42
  },
  [-1]: {
    body: '#e9f5fb',
    dark: '#9cc7dd',
    gear: '#4c9ad0',
    band: '#e0607a',
    scarf: '#2c5aa0',
    eye: '#ffffff',
    rough: 0.22
  }
}
const ROLES = {
  soldier: { size: 1, tint: 1 },
  archer: { size: 0.86, tint: 1.12 },
  wolf: { size: 1.14, tint: 1.3 }
}

/** Stacked soft tiers, revolved: the classic swirl silhouette. */
function bodyGeometry() {
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
const GEO = {
  body: bodyGeometry(),
  tip: new THREE.ConeGeometry(0.07, 0.18, 12),
  eye: new THREE.SphereGeometry(0.085, 14, 10),
  pupil: new THREE.SphereGeometry(0.045, 10, 8),
  smile: new THREE.TorusGeometry(0.07, 0.018, 6, 14, Math.PI),
  brow: new THREE.BoxGeometry(0.12, 0.025, 0.03),
  shield: new THREE.CylinderGeometry(0.24, 0.24, 0.05, 22),
  helmet: new THREE.SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  band: new THREE.TorusGeometry(0.27, 0.035, 8, 26),
  knot: new THREE.BoxGeometry(0.05, 0.16, 0.03),
  pellet: new THREE.SphereGeometry(0.075, 12, 10),
  fly: new THREE.SphereGeometry(0.04, 8, 6),
  wing: new THREE.CircleGeometry(0.05, 10)
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  return m
}

/** One procedural character; side 1 is the poop army, side -1 the foam garrison of the toilet castle. */
class PoopActor {
  constructor(role, side) {
    const p = PALETTES[side]
    const tint = (hex) => new THREE.Color(hex).multiplyScalar(side === 1 ? ROLES[role].tint : 1)
    const mat = (color, roughness = 0.6, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness, transparent: true, ...extra })
    this.materials = {
      body: mat(tint(p.body), p.rough, side === 1 ? {} : { emissive: '#3b6f8f', emissiveIntensity: 0.12 }),
      dark: mat(p.dark),
      eye: mat(p.eye, 0.3),
      gear: mat(p.gear, 0.35, { metalness: role === 'soldier' ? 0.2 : 0 }),
      band: mat(p.band),
      scarf: mat(p.scarf),
      fly: mat('#1c1c1c', 0.4),
      wing: mat('#ffffff', 0.2, { opacity: 0.6, side: THREE.DoubleSide })
    }
    const m = this.materials
    this.root = new THREE.Group()
    this.body = new THREE.Group()
    this.root.add(this.body)
    this.body.rotation.y = FACE
    this.pose = new THREE.Group()
    this.body.add(this.pose)
    this.size = ROLES[role].size
    const parts = [mesh(GEO.body, m.body)]
    const tip = mesh(GEO.tip, m.body, 0.04, 0.9, 0)
    tip.rotation.z = -0.7
    parts.push(tip)
    for (const s of [-1, 1]) {
      parts.push(mesh(GEO.eye, m.eye, s * 0.12, 0.4, 0.31), mesh(GEO.pupil, m.dark, s * 0.12, 0.41, 0.38))
      if (side === -1) {
        const brow = mesh(GEO.brow, m.dark, s * 0.12, 0.51, 0.33)
        brow.rotation.z = s * -0.45
        parts.push(brow)
      }
    }
    const mouth = mesh(GEO.smile, m.dark, 0, 0.25, 0.38)
    mouth.rotation.z = side === 1 ? Math.PI : 0
    parts.push(mouth)
    const band = (material, y) => {
      const b = mesh(GEO.band, material, 0, y, 0)
      b.rotation.x = Math.PI / 2
      return b
    }
    if (role === 'soldier') {
      const shield = mesh(GEO.shield, m.gear, -0.3, 0.24, 0.32)
      shield.rotation.set(Math.PI / 2, -0.5, 0.25)
      parts.push(shield, mesh(GEO.helmet, m.gear, 0, 0.6, 0))
    } else if (role === 'archer') {
      this.pellet = mesh(GEO.pellet, side === 1 ? m.body : m.eye, 0.36, 0.42, 0.18)
      parts.push(band(m.band, 0.57), this.pellet)
    } else {
      parts.push(band(m.scarf, 0.56))
      for (const s of [-1, 1]) {
        const knot = mesh(GEO.knot, m.scarf, s * 0.06, 0.5, -0.27)
        knot.rotation.z = s * 0.6
        parts.push(knot)
      }
      // A fly (or a soap bubble for the foam side) circles the head.
      this.fly = new THREE.Group()
      this.fly.add(mesh(GEO.fly, side === 1 ? m.fly : m.wing))
      if (side === 1) for (const s of [-1, 1]) this.fly.add(mesh(GEO.wing, m.wing, s * 0.04, 0.04, 0))
      parts.push(this.fly)
    }
    for (const part of parts) this.pose.add(part)
  }

  /** k: lane-x units per model unit; aspect: x-to-y pixel ratio of the stretched lane canvas. */
  place(x, y, side, k, aspect) {
    this.root.position.set(x, 450 - y, (y - 361) * 12)
    this.root.scale.set(k * side, k * aspect, k)
  }

  animate({ shift, hop, lean, squash }, time) {
    this.pose.position.set(0, hop, shift)
    this.pose.rotation.x = lean
    const wide = this.size / Math.sqrt(squash)
    this.pose.scale.set(wide, this.size * squash, wide)
    if (this.pellet) this.pellet.position.y = 0.42 + Math.max(0, shift) * 0.6
    if (this.fly)
      this.fly.position.set(Math.cos(time * 7) * 0.42, 0.95 + Math.sin(time * 13) * 0.05, Math.sin(time * 7) * 0.42)
  }

  setOpacity(opacity) {
    for (const [name, m] of Object.entries(this.materials)) m.opacity = name === 'wing' ? 0.6 * opacity : opacity
  }

  dispose() {
    for (const m of Object.values(this.materials)) m.dispose()
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

  constructor() {
    this.renderer.setClearColor(0, 0)
    this.scene.add(new THREE.HemisphereLight(0xfffbf0, 0x6b4a2f, 2.2))
    const key = new THREE.DirectionalLight(0xfff4db, 2.6)
    key.position.set(-300, 600, 800)
    this.scene.add(key)
  }

  actor(key, role, side) {
    let actor = this.actors.get(key)
    if (!actor) {
      actor = new PoopActor(role, side)
      this.scene.add(actor.root)
      this.actors.set(key, actor)
    }
    actor.seen = true
    return actor
  }

  /** size: the lane's unit width; aspect: x-to-y pixel ratio of the stretched lane canvas. */
  setPresentation(size, aspect) {
    this.presentation = [size * 0.62, aspect]
  }

  unit(u, x, y, time) {
    const actor = this.actor(u.id, u.role, u.side)
    actor.place(x, y, u.side, ...this.presentation)
    actor.animate(pose(u.motion, u.phase, u.period, u.walkDistance), time)
    actor.setOpacity(1)
  }

  fallen(ghost, x, y, age, opacity) {
    const actor = this.actor(ghost.id, ghost.role, ghost.side)
    actor.place(x, y, ghost.side, ...this.presentation)
    const s = Math.min(1, age / FALL_SECONDS)
    actor.animate({ shift: 0, hop: 0, lean: 0, squash: 1 - 0.85 * s }, 0)
    actor.setOpacity(Math.max(0, opacity))
  }

  /** Renders this frame's actors at width×height pixels; actors not touched since the last render are released. */
  render(width, height) {
    for (const [key, actor] of this.actors)
      if (!actor.seen) {
        this.scene.remove(actor.root)
        actor.dispose()
        this.actors.delete(key)
      } else actor.seen = false
    if (this.canvas.width !== width || this.canvas.height !== height) this.renderer.setSize(width, height, false)
    this.renderer.render(this.scene, this.camera)
    return this.canvas
  }

  /** One standing pose for a summon card, centered in a 128×112 portrait. */
  portrait(role, target) {
    const camera = new THREE.OrthographicCamera(0, 128, 112, 0, -2000, 2000)
    const scene = new THREE.Scene()
    for (const light of this.scene.children) scene.add(light.clone())
    const actor = new PoopActor(role, 1)
    actor.root.position.set(64, 6, 0)
    actor.root.scale.setScalar(92 / ROLES[role].size ** 0.6)
    actor.animate({ shift: 0, hop: 0, lean: 0, squash: 1 }, 0.3)
    scene.add(actor.root)
    this.renderer.setSize(128, 112, false)
    this.renderer.render(scene, camera)
    const context = target.getContext('2d')
    context.clearRect(0, 0, target.width, target.height)
    context.drawImage(this.canvas, 0, 0, target.width, target.height)
    actor.dispose()
  }
}
