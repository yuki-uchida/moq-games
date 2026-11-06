import * as THREE from 'three'
import { RITUAL_STEPS } from './ritual'
import { createGarmentGeometry, createGhostGeometry } from './ghost-geometry'

export interface Pose {
  x: number
  z: number
  yaw: number
}
export interface WorldFrame {
  role: 'human' | 'haunter'
  human: Pose
  haunter: Pose
  effect: null | { kind: 'apparition' | 'blackout' | 'rattle'; startedAt: number; id?: number }
  time: number
  pitch?: number
  ritual?: { completed: number; elapsedMs: number } | null
}
export const HUMAN_START: Pose = { x: -5, z: 5, yaw: 0 }
export const HAUNTER_START: Pose = { x: 5, z: -5, yaw: Math.PI }

type Wall = { x: number; z: number; width: number; depth: number; shoji?: boolean }
const WALLS: Wall[] = [
  { x: 0, z: -9, width: 18.4, depth: 0.4 },
  { x: 0, z: 9, width: 18.4, depth: 0.4 },
  { x: -9, z: 0, width: 0.4, depth: 18 },
  { x: 9, z: 0, width: 0.4, depth: 18 },
  { x: 0, z: -5.5, width: 0.3, depth: 7, shoji: true },
  { x: 0, z: 5.5, width: 0.3, depth: 7, shoji: true },
  { x: -8, z: -3, width: 2, depth: 0.3, shoji: true },
  { x: -1.5, z: -3, width: 3, depth: 0.3, shoji: true },
  { x: 1.5, z: 3, width: 3, depth: 0.3, shoji: true },
  { x: 8, z: 3, width: 2, depth: 0.3, shoji: true }
]
const PLAYER_RADIUS = 0.28
const EFFECT_DURATION = 3.5
const MIRROR_STEP_INDEX = RITUAL_STEPS.findIndex((step) => step.id === 'mirror')
const OBSTACLES: Wall[] = [
  ...WALLS,
  { x: -5.8, z: -8.25, width: 3.1, depth: 1.1 },
  { x: 6.7, z: 7.8, width: 1.4, depth: 0.8 }
]

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

const PITCH_LIMIT = Math.PI / 2 - 0.05
const HAUNTER_PITCH = Math.atan2(-2.1, 3.5)

export function clampPitch(pitch: number, role: WorldFrame['role']): number {
  const base = role === 'haunter' ? HAUNTER_PITCH : 0
  return THREE.MathUtils.clamp(finite(pitch), -PITCH_LIMIT - base, PITCH_LIMIT - base)
}

function clearPosition(x: number, z: number): boolean {
  return (
    Math.abs(x) <= 8.5 &&
    Math.abs(z) <= 8.5 &&
    !OBSTACLES.some(
      (wall) =>
        Math.abs(x - wall.x) < wall.width / 2 + PLAYER_RADIUS && Math.abs(z - wall.z) < wall.depth / 2 + PLAYER_RADIUS
    )
  )
}

export function movePose(pose: Pose, forward: number, strafe: number, deltaSeconds: number): Pose {
  let x = finite(pose.x, HUMAN_START.x)
  let z = finite(pose.z, HUMAN_START.z)
  const yaw = finite(pose.yaw)
  if (Math.abs(x) > 8.5 || Math.abs(z) > 8.5 || !clearPosition(x, z)) {
    x = HUMAN_START.x
    z = HUMAN_START.z
  }
  const ahead = THREE.MathUtils.clamp(finite(forward), -1, 1)
  const sideways = THREE.MathUtils.clamp(finite(strafe), -1, 1)
  const length = Math.max(1, Math.hypot(ahead, sideways))
  const distance = (3 * THREE.MathUtils.clamp(finite(deltaSeconds), 0, 0.25)) / length
  const dx = (Math.sin(yaw) * ahead + Math.cos(yaw) * sideways) * distance
  const dz = (-Math.cos(yaw) * ahead + Math.sin(yaw) * sideways) * distance
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1))
  for (let step = 0; step < steps; step++) {
    if (clearPosition(x + dx / steps, z)) x += dx / steps
    if (clearPosition(x, z + dz / steps)) z += dz / steps
  }
  return { x, z, yaw: Math.abs(yaw) <= 2 * Math.PI ? yaw : Math.atan2(Math.sin(yaw), Math.cos(yaw)) }
}

export class HorrorWorld {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(65, 1, 0.05, 42)
  private readonly renderer: THREE.WebGLRenderer
  private readonly human = new THREE.Group()
  private readonly haunter = new THREE.Group()
  private readonly apparition = new THREE.Group()
  private readonly aim: THREE.Mesh
  private readonly ambient = new THREE.AmbientLight(0x9ba8ad, 0.65)
  private readonly lantern = new THREE.PointLight(0xffc67b, 18, 10, 2)
  private readonly fill = new THREE.HemisphereLight(0x879fa8, 0x51463b, 0.8)
  private readonly moon: THREE.DirectionalLight
  private readonly fog: THREE.FogExp2
  private readonly roomLights: THREE.PointLight[] = []
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly boxGeometry: THREE.BoxGeometry
  private readonly staticBoxes = new Map<THREE.Material, THREE.Matrix4[]>()
  private readonly staticMeshes: THREE.InstancedMesh[] = []
  private ghostGeometry: ReturnType<typeof createGhostGeometry> | null = null
  private readonly clues: { group: THREE.Group; materials: THREE.MeshStandardMaterial[] }[] = []
  private mirrorChild: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null
  private readonly apparitionMaterials: { material: THREE.MeshStandardMaterial; opacity: number }[] = []
  private contextLost = false
  private lossNotified = false
  private restorePending = false
  private disposed = false
  private readonly onContextLost = (event: Event) => {
    event.preventDefault()
    this.loseContext()
  }
  private readonly onContextRestored = () => {
    if (!this.disposed && this.contextLost) this.restorePending = true
  }

  constructor(
    private readonly container: HTMLElement,
    private readonly onLost?: () => void
  ) {
    try {
      this.boxGeometry = new THREE.BoxGeometry(1, 1, 1)
      this.geometries.add(this.boxGeometry)
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
      this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)
      this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored)
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.renderer.setClearColor(0x090e14)
      container.appendChild(this.renderer.domElement)
      this.scene.fog = new THREE.FogExp2(0x1d272c, 0.045)
      this.fog = this.scene.fog
      this.scene.add(this.ambient, this.camera)
      const moon = new THREE.DirectionalLight(0xa5bac2, 1.05)
      moon.position.set(-5, 10, -6)
      this.scene.add(moon)
      this.moon = moon
      this.lantern.position.set(-6, 2.2, -6)
      this.scene.add(this.lantern)
      this.scene.add(this.fill)
      for (const [x, z, color] of [
        [-6, 5.5, 0xd3aa78],
        [5.8, -5.5, 0xa7b8b2],
        [5.8, 5.5, 0xc4a08a]
      ]) {
        const light = new THREE.PointLight(color, 11, 9, 2)
        light.position.set(x, 2.7, z)
        this.scene.add(light)
        this.roomLights.push(light)
      }

      const woodTexture = this.surfaceTexture('wood')
      const paperTexture = this.surfaceTexture('paper')
      const tatamiTexture = this.surfaceTexture('tatami')
      const wood = this.material(0x554238, false, 1, woodTexture)
      const darkWood = this.material(0x29201c, false, 1, woodTexture)
      const paper = this.material(0xb8ab8c, false, 1, paperTexture)
      const tatami = this.material(0x858562, false, 1, tatamiTexture)
      const trim = this.material(0x34382c)
      const stone = this.material(0x55514c)
      this.box(0, -0.16, 0, 18, 0.3, 18, darkWood)
      this.box(0, 3.65, 0, 18, 0.2, 18, darkWood)
      for (let x = -8.5; x < 9; x += 0.5) this.box(x, 0.01, 0, 0.485, 0.06, 4, wood)
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          for (let column = 0; column < 4; column++) {
            for (let pair = 0; pair < 3; pair++) {
              const x = side * (1.15 + column * 2.16)
              const z = end * (3.2 + pair * 2.2)
              const turned = (column + pair + (side === end ? 1 : 0)) % 2 === 0
              for (const offset of [-0.55, 0.55]) {
                this.box(
                  x + (turned ? offset : 0),
                  0.01,
                  z + (turned ? 0 : offset),
                  2.13,
                  0.06,
                  1.075,
                  tatami,
                  this.scene,
                  turned ? Math.PI / 2 : 0
                )
              }
            }
          }
          this.box(side * 4.45, 0.015, end * 2.04, 8.6, 0.07, 0.09, darkWood)
        }
      }
      for (const wall of WALLS) {
        if (!wall.shoji) {
          this.box(wall.x, 1.8, wall.z, wall.width, 3.6, wall.depth, wood)
        } else {
          const alongX = wall.width > wall.depth
          const span = alongX ? wall.width : wall.depth
          this.box(wall.x, 1.58, wall.z, wall.width, 2.08, wall.depth, paper)
          this.box(wall.x, 0.29, wall.z, wall.width + 0.02, 0.5, wall.depth + 0.02, wood)
          this.box(wall.x, 3.13, wall.z, wall.width, 0.94, wall.depth, darkWood)
          for (let offset = -span / 2; offset <= span / 2; offset += span / Math.ceil(span / 1.4)) {
            this.box(
              wall.x + (alongX ? offset : 0),
              1.57,
              wall.z + (alongX ? 0 : offset),
              alongX ? 0.055 : 0.34,
              2.18,
              alongX ? 0.34 : 0.055,
              darkWood
            )
          }
          for (const height of [0.56, 1.32, 2.08, 2.65, 3.48])
            this.box(wall.x, height, wall.z, wall.width + 0.04, 0.045, wall.depth + 0.04, darkWood)
          for (let offset = -span / 2 + 0.22; offset < span / 2; offset += 0.42) {
            this.box(
              wall.x + (alongX ? offset : 0),
              2.96,
              wall.z + (alongX ? 0 : offset),
              alongX ? 0.025 : 0.325,
              0.4,
              alongX ? 0.325 : 0.025,
              wood
            )
          }
        }
      }
      for (const x of [-8.8, 0, 8.8]) {
        for (const z of [-8.8, -3, 3, 8.8]) this.box(x, 1.8, z, 0.25, 3.6, 0.25, darkWood)
      }
      for (const z of [-8.6, -3, 3, 8.6]) this.box(0, 3.45, z, 17.6, 0.22, 0.24, wood)
      for (const x of [-7, -3, 3, 7]) this.box(x, 3.52, 0, 0.1, 0.08, 17.6, wood)
      for (const [x, z] of [
        [-5, -3],
        [5, 3]
      ]) {
        this.box(x, 3.31, z, 4, 0.18, 0.3, darkWood)
        this.box(x, 3.44, z + 0.18, 4.2, 0.08, 0.12, wood)
      }
      for (const z of [-8.75, 8.75]) {
        this.box(0, 0.22, z, 17.6, 0.25, 0.12, darkWood)
        this.box(0, 2.85, z, 17.6, 0.13, 0.12, darkWood)
      }
      for (const x of [-8.75, 8.75]) {
        this.box(x, 0.22, 0, 0.12, 0.25, 17.6, darkWood)
        this.box(x, 2.85, 0, 0.12, 0.13, 17.6, darkWood)
      }
      const lampPaper = this.material(0xd3ba8b)
      for (const [x, z] of [
        [-6, 5.5],
        [5.8, -5.5],
        [5.8, 5.5]
      ]) {
        this.box(x, 3.23, z, 0.035, 0.55, 0.035, darkWood)
        this.box(x, 2.92, z, 0.48, 0.45, 0.48, lampPaper)
        for (const height of [2.69, 2.92, 3.15]) this.box(x, height, z, 0.51, 0.035, 0.51, darkWood)
        for (const dx of [-0.24, 0.24])
          for (const dz of [-0.24, 0.24]) this.box(x + dx, 2.92, z + dz, 0.035, 0.46, 0.035, darkWood)
      }
      this.box(-5.8, 0.4, -8.25, 3.1, 0.8, 1.1, wood)
      this.box(-5.8, 1.1, -8.35, 2.2, 0.65, 0.7, darkWood)
      this.box(-5.8, 1.65, -8.35, 0.55, 0.55, 0.22, paper)
      this.box(-6.65, 0.93, -7.95, 0.18, 0.25, 0.18, stone)
      this.box(-4.95, 0.93, -7.95, 0.18, 0.25, 0.18, stone)
      this.box(6.7, 0.18, 7.8, 1.4, 0.35, 0.8, wood)
      this.box(6.7, 0.42, 7.8, 0.8, 0.16, 0.55, paper)

      const stain = this.material(0x342e29)
      const oldRed = this.material(0x683b35)
      const pale = this.material(0xc0aa83)
      for (const [x, height, width] of [
        [-7.7, 1.2, 0.09],
        [-7.53, 0.8, 0.04],
        [2.8, 1.5, 0.08],
        [3.02, 0.65, 0.05]
      ]) {
        this.box(x, 2.9 - height / 2, -8.78, width, height, 0.015, stain)
      }
      for (const [z, height] of [
        [-7.2, 0.8],
        [-6.8, 1.3],
        [4.7, 1.0],
        [5.1, 0.55]
      ]) {
        this.box(0.162, 1.65, z, 0.014, height, 0.12, stain)
      }
      this.box(-5.8, 1.67, -8.21, 0.31, 0.36, 0.025, oldRed)
      this.box(-5.8, 1.67, -8.19, 0.04, 0.24, 0.025, pale)
      this.box(-5.8, 1.67, -8.18, 0.16, 0.035, 0.025, pale)
      for (const x of [-6.65, -4.95]) this.box(x, 1.09, -7.95, 0.045, 0.1, 0.045, pale)
      this.box(6.7, 0.515, 7.8, 0.65, 0.015, 0.42, oldRed)
      this.box(6.7, 0.525, 7.8, 0.035, 0.01, 0.4, pale)
      const plaster = this.material(0x8c8170, false, 1, paperTexture)
      const ink = stain
      const fadedRed = oldRed
      this.box(-5.8, 2.05, -8.76, 3.55, 2.2, 0.035, darkWood)
      this.box(-5.8, 2.05, -8.73, 3.28, 1.94, 0.025, plaster)
      this.box(-5.8, 2.05, -8.7, 0.68, 1.45, 0.025, paper)
      this.box(-5.8, 2.72, -8.68, 0.72, 0.045, 0.035, darkWood)
      this.box(-5.8, 1.38, -8.68, 0.72, 0.045, 0.035, darkWood)
      for (const [x, y, width, height] of [
        [-5.84, 2.4, 0.035, 0.28],
        [-5.73, 2.17, 0.025, 0.31],
        [-5.88, 1.93, 0.03, 0.21],
        [-5.71, 1.75, 0.055, 0.08]
      ])
        this.box(x, y, -8.675, width, height, 0.012, ink)
      this.box(-5.7, 1.56, -8.66, 0.09, 0.09, 0.012, fadedRed)
      for (const side of [-1, 1]) {
        for (const [z, y] of [
          [-4.65, 1.85],
          [6.3, 1.82]
        ]) {
          this.box(side * 0.184, y, z, 0.012, 0.48, 0.18, paper)
          this.box(side * 0.192, y + 0.02, z, 0.012, 0.29, 0.025, ink)
          this.box(side * 0.199, y - 0.12, z + 0.035, 0.012, 0.05, 0.045, fadedRed)
        }
      }
      this.addTornPaper(ink)
      for (const x of [-7.35, -4.25]) {
        this.box(x, 2.05, -8.64, 0.09, 2.12, 0.1, wood)
      }
      this.box(-5.8, 3.08, -8.64, 3.18, 0.12, 0.1, wood)
      for (const x of [-7.6, -4, -0.6]) {
        this.box(x, 1.5, -8.77, 0.09, 2.85, 0.06, darkWood)
      }
      this.box(-5.8, 3.22, -8.35, 3.55, 0.2, 0.78, darkWood)
      this.box(-4.75, 1.94, -8.28, 0.72, 0.065, 0.48, wood)
      this.box(-4.48, 2.31, -8.35, 0.45, 0.055, 0.35, wood)
      for (const x of [-6.65, -4.95]) {
        this.box(x, 1.24, -7.95, 0.07, 0.18, 0.07, paper)
        this.box(x, 1.35, -7.95, 0.025, 0.035, 0.025, pale)
      }
      for (const z of [3.4, 6.5, 8.2]) {
        this.box(-8.77, 1.76, z, 0.04, 2.6, 0.075, darkWood)
      }
      this.box(-8.76, 1.76, 5, 0.035, 2.5, 2.9, plaster)
      this.box(-8.73, 0.66, 5, 0.025, 0.22, 2.82, wood)
      for (const [y, length] of [
        [0.94, 0.13],
        [1.06, 0.2],
        [1.19, 0.1]
      ]) {
        this.box(-8.71, y, 4.42, 0.018, 0.018, length, ink)
      }
      this.box(-8.71, 1.28, 4.42, 0.018, 0.09, 0.07, fadedRed)
      this.box(-8.71, 1.91, 5.5, 0.018, 0.55, 0.34, paper)
      this.box(-8.69, 1.94, 5.5, 0.012, 0.27, 0.025, ink)
      for (const [z, width, material] of [
        [-6.9, 2.7, paper],
        [-4, 2.85, plaster],
        [6.1, 4.8, paper]
      ] as const) {
        this.box(8.77, 1.71, z, 0.035, 2.8, width, darkWood)
        this.box(8.74, 1.74, z, 0.025, 2.58, width - 0.12, material)
        this.box(8.71, 0.57, z, 0.035, 0.22, width - 0.15, wood)
      }
      this.box(8.72, 1.72, -5.47, 0.018, 2.65, 0.16, ink)
      for (const z of [-5.7, -5.23, 5.83, 6.37]) {
        this.box(8.69, 1.35, z, 0.025, 0.13, 0.065, darkWood)
      }
      this.box(8.71, 1.73, 6.1, 0.025, 2.6, 0.065, darkWood)
      this.box(8.69, 1.87, 6.1, 0.025, 0.025, 4.5, oldRed)
      for (const [z, y] of [
        [4.36, 1.67],
        [5.12, 1.73],
        [6.08, 1.62],
        [6.91, 1.71],
        [7.78, 1.65]
      ]) {
        this.box(8.66, y, z, 0.018, 0.47, 0.17, paper)
        this.box(8.64, y + 0.015, z, 0.012, 0.28, 0.02, ink)
        this.box(8.63, y - 0.13, z + 0.025, 0.012, 0.065, 0.06, fadedRed)
      }
      for (const [x, z, width, depth] of [
        [-5.8, -6.3, 5.3, 4.6],
        [5.1, -6.2, 6.1, 4.7],
        [5.2, 6, 6.3, 4.6]
      ]) {
        this.box(x, 3.53, z, width, 0.045, depth, trim)
        for (const edge of [-1, 1]) this.box(x + (edge * width) / 2, 3.48, z, 0.065, 0.055, depth, darkWood)
        for (let offset = -depth / 2 + 0.55; offset < depth / 2; offset += 0.75) {
          this.box(x, 3.49, z + offset, width, 0.04, 0.035, wood)
        }
      }
      this.flushStaticBoxes(paper)
      this.addDust()
      this.addClues()

      this.figure(
        this.human,
        [this.material(0x52616a), this.material(0x303d47), this.material(0xc7b49d), this.material(0x242429)],
        false
      )
      this.figure(
        this.haunter,
        [this.material(0x9eaaa2), this.material(0x667b79), this.material(0xc4c1aa), this.material(0x1d2729)],
        true
      )
      this.figure(
        this.apparition,
        [
          this.visionMaterial(0xaabbb3, 0.86),
          this.visionMaterial(0x718d89, 0.9),
          this.visionMaterial(0xd4d2bc, 0.95),
          this.visionMaterial(0x18282b, 0.97)
        ],
        true
      )
      this.apparition.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          this.apparitionMaterials.push({ material: object.material, opacity: object.material.opacity })
        }
      })
      this.apparition.traverse((object) => {
        object.renderOrder = object.name === 'ghost-fringe' ? 102 : object.name === 'ghost-face' ? 101 : 100
      })
      this.camera.add(this.apparition)
      this.scene.add(this.human, this.haunter)
      const ringGeometry = new THREE.RingGeometry(0.23, 0.29, 32)
      this.geometries.add(ringGeometry)
      this.aim = new THREE.Mesh(ringGeometry, this.material(0x9dbfc1, true, 0.7))
      this.aim.rotation.x = -Math.PI / 2
      this.scene.add(this.aim)
      this.resize()
    } catch (error) {
      try {
        this.dispose()
      } catch {}
      throw error
    }
  }

  private material(
    color: number,
    transparent = false,
    opacity = 1,
    map: THREE.Texture | null = null
  ): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      map,
      roughness: 0.95,
      transparent,
      opacity,
      depthWrite: !transparent,
      side: THREE.DoubleSide
    })
    this.materials.add(material)
    return material
  }

  private visionMaterial(color: number, opacity: number): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.16,
      roughness: 0.95,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide
    })
    this.materials.add(material)
    return material
  }

  private surfaceTexture(kind: 'wood' | 'paper' | 'tatami'): THREE.DataTexture {
    const size = 128
    const pixels = new Uint8Array(size * size * 4)
    let seed = kind === 'wood' ? 71 : kind === 'paper' ? 137 : 211
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const noise = (seed >>> 24) / 255
        const grain =
          kind === 'wood'
            ? 0.72 +
              0.08 * Math.sin(x * 0.19 + Math.sin(y * 0.035) * 1.4) +
              0.035 * Math.sin(x * 0.74 + y * 0.02) +
              noise * 0.1
            : kind === 'tatami'
              ? (y < 4 || y >= size - 4 ? 0.4 : 0.78 + (y % 4 < 2 ? 0.1 : 0) + (x % 16 < 8 ? 0.025 : 0)) + noise * 0.095
              : 0.8 +
                noise * 0.09 +
                0.035 * Math.sin(x * 0.07) * Math.sin(y * 0.08) +
                0.025 * Math.sin(y * 0.48 + x * 0.02)
        const index = (y * size + x) * 4
        pixels[index] = Math.round(255 * grain)
        pixels[index + 1] = Math.round(250 * grain)
        pixels[index + 2] = Math.round(237 * grain)
        pixels[index + 3] = 255
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
    this.textures.add(texture)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
  }

  private addTornPaper(material: THREE.Material): void {
    const positions: number[] = []
    const outline = [
      [-0.2, -0.5],
      [0.03, -0.39],
      [0.23, -0.43],
      [0.17, -0.22],
      [0.34, -0.12],
      [0.19, 0.02],
      [0.31, 0.14],
      [0.17, 0.22],
      [0.21, 0.42],
      [0.02, 0.34],
      [-0.1, 0.5],
      [-0.17, 0.3],
      [-0.33, 0.27],
      [-0.2, 0.09],
      [-0.4, -0.03],
      [-0.2, -0.16],
      [-0.3, -0.28]
    ]
    for (const side of [-1, 1]) {
      for (const [z, y, width, height] of [
        [-6.22, 1.43, 0.43, 0.58],
        [5.18, 2.3, 0.37, 0.43]
      ]) {
        for (let index = 0; index < outline.length; index++) {
          const next = outline[(index + 1) % outline.length]
          const current = outline[index]
          positions.push(side * 0.182, y, z)
          positions.push(side * 0.182, y + current[1] * height, z + current[0] * width)
          positions.push(side * 0.182, y + next[1] * height, z + next[0] * width)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    this.geometries.add(geometry)
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    this.scene.add(new THREE.Mesh(geometry, material))
  }

  private addDust(): void {
    const positions: number[] = []
    let seed = 31337
    for (let index = 0; index < 130; index++) {
      for (const [offset, span] of [
        [-8.6, 17.2],
        [0.25, 3],
        [-8.6, 17.2]
      ]) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        positions.push(offset + (seed / 4294967296) * span)
      }
    }
    const geometry = new THREE.BufferGeometry()
    this.geometries.add(geometry)
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: 0x9b9a7e,
      size: 0.025,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    })
    this.materials.add(material)
    this.scene.add(new THREE.Points(geometry, material))
  }

  private box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    parent: THREE.Object3D = this.scene,
    rotation = 0
  ): void {
    if (parent === this.scene) {
      const matrices = this.staticBoxes.get(material) ?? []
      const matrix = new THREE.Matrix4().makeRotationY(rotation).scale(new THREE.Vector3(width, height, depth))
      matrix.setPosition(x, y, z)
      matrices.push(matrix)
      this.staticBoxes.set(material, matrices)
      return
    }
    const mesh = new THREE.Mesh(this.boxGeometry, material)
    mesh.scale.set(width, height, depth)
    mesh.position.set(x, y, z)
    mesh.rotation.y = rotation
    parent.add(mesh)
  }

  private flushStaticBoxes(paper: THREE.MeshStandardMaterial): void {
    for (const [material, matrices] of this.staticBoxes) {
      let geometry = this.boxGeometry
      if (material === paper) {
        geometry = this.boxGeometry.clone()
        this.geometries.add(geometry)
        const wear = matrices.map((matrix) => {
          const positionX = matrix.elements[12]
          const positionZ = matrix.elements[14]
          return positionZ === -3 && (positionX === -8 || positionX === -1.5)
            ? 1
            : positionX === 8.74 && positionZ === 6.1
              ? 2
              : 0
        })
        geometry.setAttribute('paperWear', new THREE.InstancedBufferAttribute(new Float32Array(wear), 1))
        paper.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float paperWear;\nvarying vec3 vPaperWear;')
            .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPaperWear = vec3(uv, paperWear);')
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vPaperWear;')
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
              if (vPaperWear.z > 0.5) {
                float phase = (vPaperWear.z - 1.0) * 1.7;
                float boundary = 0.23 + 0.045 * sin(vPaperWear.x * 9.6 + phase)
                  + 0.025 * sin(vPaperWear.x * 23.0 + phase);
                float damp = 1.0 - smoothstep(boundary - 0.08, boundary + 0.06, vPaperWear.y);
                float tide = 1.0 - smoothstep(0.0, 0.025, abs(vPaperWear.y - boundary));
                float mottling = 0.82 + 0.18 * sin(vPaperWear.x * 13.0 + phase) * sin(vPaperWear.y * 11.0);
                diffuseColor.rgb *= vec3(1.0) - damp * mottling * vec3(0.32, 0.39, 0.44) - tide * 0.035;
              }`
            )
        }
        paper.customProgramCacheKey = () => 'static-paper-wear-v1'
      }
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
      this.staticMeshes.push(mesh)
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      this.scene.add(mesh)
    }
    this.staticBoxes.clear()
  }

  private addClues(): void {
    const bellGeometry = new THREE.CylinderGeometry(0.11, 0.22, 0.31, 16)
    this.geometries.add(bellGeometry)
    const loopGeometry = new THREE.TorusGeometry(1, 0.09, 6, 24)
    this.geometries.add(loopGeometry)
    const discGeometry = new THREE.CylinderGeometry(1, 1, 1, 24)
    this.geometries.add(discGeometry)
    for (const step of RITUAL_STEPS) {
      const group = new THREE.Group()
      group.name = `ritual-${step.id}`
      group.position.set(step.x, 0, step.z)
      group.visible = false
      this.scene.add(group)
      const materials: THREE.MeshStandardMaterial[] = []
      const pigment = (color: number): THREE.MeshStandardMaterial => {
        const material = this.material(color, true)
        material.emissive.setHex(color)
        material.forceSinglePass = true
        materials.push(material)
        return material
      }
      const wood = pigment(0x554137)
      const paper = pigment(0xd9cba4)
      const ink = pigment(0x49342c)
      const red = pigment(0x8d4034)
      const metal = pigment(0x9e895d)
      const display = new THREE.Group()
      display.position.x = step.id === 'letter' ? -0.18 : 0
      display.position.y = 0.27
      group.add(display)
      this.box(0, 0.4, 0, 0.58, 0.08, 0.42, wood, display)
      for (const x of [-0.23, 0.23])
        for (const z of [-0.15, 0.15]) this.box(x, 0.09, z, 0.055, 0.63, 0.055, wood, display)
      const form = (
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        x: number,
        y: number,
        z: number,
        scaleX: number,
        scaleY: number,
        scaleZ: number
      ): THREE.Mesh => {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(x, y, z)
        mesh.scale.set(scaleX, scaleY, scaleZ)
        display.add(mesh)
        return mesh
      }
      if (step.id === 'letter') {
        const letter = new THREE.Group()
        letter.position.set(0, 0.69, 0)
        letter.rotation.x = -0.3
        display.add(letter)
        this.box(0, 0, 0, 0.34, 0.46, 0.025, paper, letter)
        for (const x of [-0.1, -0.035, 0.03, 0.095]) this.box(x, 0.02, 0.016, 0.012, 0.3, 0.006, ink, letter)
        this.box(0.1, -0.15, 0.02, 0.05, 0.05, 0.008, red, letter)
        this.box(0, 0.48, -0.04, 0.22, 0.08, 0.12, wood, display)
      } else if (step.id === 'bell') {
        this.box(0, 0.52, 0, 0.32, 0.16, 0.3, wood, display)
        form(bellGeometry, metal, 0, 0.76, 0, 1, 1, 1)
        const rim = form(loopGeometry, ink, 0, 0.61, 0, 0.21, 0.21, 0.21)
        rim.rotation.x = Math.PI / 2
        form(loopGeometry, red, 0, 0.94, 0, 0.11, 0.12, 0.11)
        this.box(0, 0.6, 0, 0.055, 0.06, 0.055, ink, display)
      } else if (step.id === 'mirror') {
        const frame = form(loopGeometry, metal, 0, 0.76, 0, 0.22, 0.28, 0.22)
        frame.position.z = 0.025
        const mirror = form(discGeometry, pigment(0xa6b3aa), 0, 0.76, 0, 0.2, 0.025, 0.26)
        mirror.rotation.x = Math.PI / 2
        this.addMirrorChild(display)
        this.box(0, 0.49, 0, 0.075, 0.1, 0.07, wood, display)
      } else {
        this.box(0, 0.72, 0, 0.34, 0.52, 0.045, wood, display)
        for (const side of [-1, 1]) {
          this.box(0, 0.72, side * 0.028, 0.26, 0.44, 0.012, paper, display)
          this.box(0, 0.74, side * 0.037, 0.035, 0.3, 0.008, red, display)
          this.box(0, 0.77, side * 0.042, 0.16, 0.03, 0.008, red, display)
          this.box(0, 0.67, side * 0.042, 0.13, 0.03, 0.008, red, display)
        }
      }
      this.clues.push({ group, materials })
    }
  }

  private addMirrorChild(display: THREE.Group): void {
    const positions: number[] = []
    const colors: number[] = []
    const polygon = (points: [number, number][], color: number): void => {
      const tint = new THREE.Color(color)
      for (let index = 1; index < points.length - 1; index++) {
        for (const [x, y] of [points[0], points[index], points[index + 1]]) {
          positions.push(x, y, 0)
          colors.push(tint.r, tint.g, tint.b)
        }
      }
    }
    polygon(
      [
        [0.015, 0.654],
        [0.115, 0.654],
        [0.088, 0.771],
        [0.064, 0.797],
        [0.048, 0.787],
        [0.033, 0.799],
        [0.01, 0.771]
      ],
      0x26302d
    )
    polygon(
      [
        [-0.013, 0.79],
        [0.081, 0.789],
        [0.083, 0.849],
        [0.069, 0.884],
        [0.046, 0.902],
        [0.015, 0.899],
        [-0.004, 0.878],
        [-0.015, 0.844]
      ],
      0x1d2524
    )
    polygon(
      [
        [0.018, 0.798],
        [0.038, 0.798],
        [0.057, 0.816],
        [0.058, 0.843],
        [0.002, 0.844],
        [0, 0.817]
      ],
      0xb5b7a1
    )
    for (const x of [0.009, 0.041]) {
      polygon(
        [
          [x - 0.005, 0.83],
          [x + 0.005, 0.83],
          [x + 0.004, 0.834],
          [x - 0.004, 0.834]
        ],
        0x1d2524
      )
    }
    const geometry = new THREE.BufferGeometry()
    this.geometries.add(geometry)
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.FrontSide,
      forceSinglePass: true
    })
    this.materials.add(material)
    this.mirrorChild = new THREE.Mesh(geometry, material)
    this.mirrorChild.name = 'mirror-child'
    this.mirrorChild.position.z = 0.0125
    this.mirrorChild.renderOrder = 1
    this.mirrorChild.visible = false
    display.add(this.mirrorChild)
  }

  private figure(group: THREE.Group, palette: THREE.Material[], ghost: boolean): void {
    const [cloth, layer, skin, hair] = palette
    if (!this.ghostGeometry) {
      this.ghostGeometry = createGhostGeometry()
      for (const geometry of Object.values(this.ghostGeometry)) this.geometries.add(geometry)
    }
    if (ghost) {
      if (cloth instanceof THREE.MeshStandardMaterial) cloth.vertexColors = true
      if (hair instanceof THREE.MeshStandardMaterial) hair.roughness = 0.78
      const geometry = this.ghostGeometry
      const torso = new THREE.Group()
      torso.name = 'torso'
      torso.position.y = 0.8
      torso.rotation.z = -0.09
      group.add(torso)
      torso.add(
        new THREE.Mesh(geometry.robe, cloth),
        new THREE.Mesh(geometry.trim, layer),
        new THREE.Mesh(geometry.hands, skin)
      )
      const head = new THREE.Group()
      head.name = 'head'
      head.position.set(0.06, 0.91, -0.035)
      head.rotation.x = -0.16
      head.rotation.y = -0.12
      head.rotation.z = 0.22
      torso.add(head)
      const face = new THREE.Mesh(geometry.face, skin)
      face.name = 'ghost-face'
      face.scale.set(0.14, 0.2, 0.14)
      const hairMesh = new THREE.Mesh(geometry.hair, hair)
      hairMesh.name = 'ghost-hair'
      const fringe = new THREE.Mesh(geometry.fringe, hair)
      fringe.name = 'ghost-fringe'
      head.add(hairMesh, face, fringe)
      return
    }
    const sphere = new THREE.SphereGeometry(1, 12, 8)
    this.geometries.add(sphere)
    const taper = new THREE.CylinderGeometry(0.65, 1, 1, 10)
    this.geometries.add(taper)
    const form = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      parent: THREE.Object3D,
      position: [number, number, number],
      scale: [number, number, number],
      tilt = 0
    ): void => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(...position)
      mesh.scale.set(...scale)
      mesh.rotation.z = tilt
      parent.add(mesh)
    }
    const torso = new THREE.Group()
    torso.name = 'torso'
    torso.position.y = 0.8
    torso.rotation.z = 0.025
    group.add(torso)
    const garment = createGarmentGeometry(false)
    for (const geometry of Object.values(garment)) this.geometries.add(geometry)
    form(garment.robe, cloth, torso, [0, 0.04, 0], [1, 0.83, 1])
    form(garment.trim, layer, torso, [0, 0.04, 0], [1, 0.83, 1])
    form(garment.hands, skin, torso, [0, 0.04, 0], [1, 0.83, 1])
    form(taper, layer, torso, [0, 0.04, -0.01], [0.34, 0.16, 0.255])
    form(sphere, skin, torso, [0, 0.72, 0], [0.09, 0.15, 0.09])
    const head = new THREE.Group()
    head.name = 'head'
    head.position.set(0, 0.91, 0)
    head.rotation.z = -0.035
    torso.add(head)
    form(sphere, skin, head, [0, 0, 0], [0.19, 0.255, 0.17])
    form(sphere, hair, head, [0, 0.1, 0.045], [0.205, 0.18, 0.18])
    for (const side of [-1, 1]) {
      form(sphere, hair, head, [side * 0.07, -0.015, -0.166], [0.026, 0.015, 0.01])
      form(taper, layer, group, [side * 0.15, 0.27, 0], [0.13, 0.54, 0.14], side * 0.035)
      form(sphere, hair, group, [side * 0.15, 0.06, -0.07], [0.13, 0.07, 0.2])
    }
    for (const side of [-1, 1])
      form(this.boxGeometry, skin, torso, [side * 0.095, 0.45, -0.225], [0.055, 0.43, 0.012], side * 0.48)
  }

  private loseContext(notify = true): void {
    if (this.disposed) return
    this.contextLost = true
    this.restorePending = false
    if (notify && !this.lossNotified) {
      this.lossNotified = true
      this.onLost?.()
    }
  }

  get isHealthy(): boolean {
    if (this.disposed) return false
    if (this.renderer.getContext().isContextLost()) this.loseContext(false)
    return !this.contextLost
  }

  render(frame: WorldFrame): void {
    if (this.disposed) return
    if (this.renderer.getContext().isContextLost()) {
      this.loseContext()
      return
    }
    if (this.contextLost && !this.restorePending) return
    const ritual = frame.ritual
    const validRitual =
      ritual != null &&
      Number.isInteger(ritual.completed) &&
      ritual.completed >= 0 &&
      ritual.completed <= RITUAL_STEPS.length &&
      Number.isFinite(ritual.elapsedMs) &&
      ritual.elapsedMs >= 0
    if (this.mirrorChild) {
      this.mirrorChild.visible =
        validRitual &&
        ritual.completed > MIRROR_STEP_INDEX &&
        ritual.elapsedMs >= RITUAL_STEPS[ritual.completed - 1].availableMs
      this.mirrorChild.material.opacity = this.mirrorChild.visible ? 0.28 : 0
    }
    for (const [index, clue] of this.clues.entries()) {
      clue.group.visible = validRitual
      if (!validRitual) continue
      const collected = index < ritual.completed
      const current = index === ritual.completed && ritual.elapsedMs >= RITUAL_STEPS[index].availableMs
      for (const material of clue.materials) {
        material.opacity = collected ? 0.35 : current ? 1 : 0.7
        material.emissiveIntensity = current ? 0.28 : 0.02
      }
    }
    const human = movePose(frame.human, 0, 0, 0)
    const haunter = movePose(frame.haunter, 0, 0, 0)
    this.human.position.set(human.x, 0, human.z)
    this.human.rotation.y = -human.yaw
    this.haunter.position.set(haunter.x, 0.12, haunter.z)
    this.haunter.rotation.y = -haunter.yaw
    const animationTime = finite(frame.time) / (Math.abs(finite(frame.time)) >= 1e11 ? 1000 : 1)
    const haunterTorso = this.haunter.getObjectByName('torso')
    const haunterHead = this.haunter.getObjectByName('head')
    if (haunterTorso) haunterTorso.rotation.z = -0.09 + Math.sin(animationTime * 0.7) * 0.035
    if (haunterHead) haunterHead.rotation.z = 0.22 + Math.sin(animationTime * 0.53) * 0.04
    const elapsed =
      frame.effect && Number.isFinite(frame.time) && Number.isFinite(frame.effect.startedAt)
        ? (frame.time - frame.effect.startedAt) / (Math.abs(frame.effect.startedAt) >= 1e11 ? 1000 : 1)
        : -1
    const active = elapsed >= 0 && elapsed < EFFECT_DURATION
    this.human.visible = frame.role !== 'human'
    this.haunter.visible = frame.role === 'human' && active && frame.effect?.kind === 'apparition'
    const viewer = frame.role === 'human' ? human : haunter
    const direction = new THREE.Vector3(Math.sin(viewer.yaw), 0, -Math.cos(viewer.yaw))
    const height = frame.role === 'human' ? 1.6 : 3.1
    const pitch = (frame.role === 'human' ? 0 : HAUNTER_PITCH) + clampPitch(frame.pitch ?? 0, frame.role)
    this.camera.position.set(viewer.x, height, viewer.z)
    this.camera.lookAt(
      viewer.x + direction.x * Math.cos(pitch),
      height + Math.sin(pitch),
      viewer.z + direction.z * Math.cos(pitch)
    )
    this.aim.visible = frame.role === 'haunter'
    this.aim.position.set(viewer.x + direction.x * 2, 0.08, viewer.z + direction.z * 2)
    const envelope = active ? Math.sin((Math.PI * elapsed) / EFFECT_DURATION) : 0
    this.fog.color.setHex(frame.effect?.kind === 'blackout' && envelope > 0 ? 0x04060a : 0x1d272c)
    this.fog.density = frame.effect?.kind === 'blackout' ? 0.045 + envelope * 0.14 : 0.045
    this.moon.intensity = frame.effect?.kind === 'blackout' ? 1.05 - envelope * 1.02 : 1.05
    this.ambient.intensity = frame.effect?.kind === 'blackout' ? 0.65 - envelope * 0.61 : 0.65
    this.lantern.intensity = frame.effect?.kind === 'blackout' ? 18 - envelope * 17.5 : 18
    const roomBrightness = frame.effect?.kind === 'blackout' ? 1 - envelope * 0.94 : 1
    this.fill.intensity = 0.8 * roomBrightness
    for (const light of this.roomLights) light.intensity = 11 * roomBrightness
    this.apparition.visible = active && frame.effect?.kind === 'apparition'
    const notice = this.apparition.visible
      ? THREE.MathUtils.smoothstep(elapsed, 0.55, 1.35) *
        (1 - THREE.MathUtils.smoothstep(elapsed, 2.45, EFFECT_DURATION))
      : 0
    const follow = this.apparition.visible
      ? THREE.MathUtils.smoothstep(elapsed, 1.25, 2.25) *
        (1 - THREE.MathUtils.smoothstep(elapsed, 2.65, EFFECT_DURATION))
      : 0
    const eventId = frame.effect?.id ?? 0
    const variant = Number.isSafeInteger(eventId) && eventId > 0 ? eventId % 3 : 0
    const turn = variant === 1 ? -1 : variant === 2 ? 0 : 1
    const nod = variant === 2 ? 0.065 : 0.03
    const torso = this.apparition.getObjectByName('torso')
    const head = this.apparition.getObjectByName('head')
    if (torso) torso.rotation.z = -0.09 - follow * 0.025
    if (head)
      head.rotation.set(-0.16 + notice * nod, -0.12 + notice * 0.065 * turn, 0.22 + notice * 0.055 - follow * 0.025)
    if (this.apparition.visible) {
      const fade =
        THREE.MathUtils.smoothstep(elapsed, 0, 0.8) *
        (1 - THREE.MathUtils.smoothstep(elapsed, EFFECT_DURATION - 0.8, EFFECT_DURATION))
      for (const { material, opacity } of this.apparitionMaterials) material.opacity = opacity * fade
      const lane = variant === 1 ? -0.7 : variant === 2 ? 0.7 : 0
      const approach = variant === 1 ? -0.25 : variant === 2 ? 0.1 : 0
      this.apparition.position.set(lane, -1.05, -2.25 + envelope * 0.9 + approach)
      this.apparition.rotation.y = variant === 2 ? Math.PI - 0.4 : variant === 1 ? Math.PI + 0.4 : Math.PI
      this.apparition.scale.setScalar(variant === 1 ? 0.98 : variant === 2 ? 0.78 : 0.85)
    }
    if (active && frame.effect?.kind === 'rattle') this.camera.rotateZ(Math.sin(elapsed * 18) * envelope * 0.045)
    this.renderer.info.render.calls = 0
    try {
      this.renderer.render(this.scene, this.camera)
    } catch {
      this.loseContext()
      return
    }
    if (this.renderer.getContext().isContextLost()) this.loseContext()
    else if (this.renderer.info.render.calls > 0) {
      this.contextLost = false
      this.lossNotified = false
      this.restorePending = false
    } else if (!this.contextLost) this.loseContext()
  }

  resize(): void {
    if (this.disposed) return
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    let failure: { error: unknown } | undefined
    const cleanup = (action: () => void) => {
      try {
        action()
      } catch (error) {
        failure ??= { error }
      }
    }
    cleanup(() => this.renderer?.domElement.removeEventListener('webglcontextlost', this.onContextLost))
    cleanup(() => this.renderer?.domElement.removeEventListener('webglcontextrestored', this.onContextRestored))
    this.staticMeshes.forEach((mesh) => cleanup(() => mesh.dispose()))
    this.geometries.forEach((geometry) => cleanup(() => geometry.dispose()))
    this.materials.forEach((material) => cleanup(() => material.dispose()))
    this.textures.forEach((texture) => cleanup(() => texture.dispose()))
    cleanup(() => this.renderer?.dispose())
    cleanup(() => this.renderer?.domElement.remove())
    if (failure) throw failure.error
  }
}
