import * as THREE from 'three'
import {
  FOREST,
  NPCS,
  SPAWN,
  caveAt,
  floorAt,
  heightAt,
  inZone,
  isUnderground,
  logOver,
  logTop,
  overhangAt,
  setStage,
  vehiclesAt
} from './map'
import { buildFood, isFoodKind, type FoodKind } from './food'
import { SEE_THROUGH, cutAway } from './see-through'
import { STEALTH, flies } from './stealth'
import { playerColor } from './game'
import { BURROW, CAMPAIGN, HAVEN } from './campaign'
import { STAGES, fillNames, spokenLine } from './stages'
import { type Bark, type Scenery } from './story'
import { buildCar, buildItem, buildModel, type Actor, type ModelOptions } from './models'
import { WorldFx } from './fx'

export interface RabbitersSceneState {
  time: number
  players: {
    id: string
    name: string
    color?: number
    x: number
    y: number
    z: number
    angle: number
    hunger: number
    health: number
    hidden: boolean
    downed: boolean
    score: number
    pregnant?: boolean
    pregnancy?: number
    age?: number
    foodEaten?: number
    bath?: number
    carrying?: string | null
  }[]
  predators: {
    id: string
    kind: string
    x: number
    y: number
    z: number
    angle: number
    state: string
    suspicion?: number
    targetId?: string | null
  }[]
  droppings?: { id: string; x: number; y: number; z: number; t: number }[]
  foods: { id: string; kind?: FoodKind; x: number; y: number; z: number; active: boolean }[]
  nests: { id: string; x: number; y: number; z: number; health: number; active: boolean }[]
  delivered: number
  goal: number
  phase: string
  chapter?: number
  bedding?: number
  straws?: { id: string; x: number; y: number; z: number; active: boolean }[]
  kits?: { id: string; x: number; y: number; z: number; angle: number; hidden: boolean; status: string }[]
  stage?: number
  step?: number
  items?: { id: string; kind: string; x: number; y: number; z: number; active: boolean }[]
  talk?: { id: string; at: number; by?: string } | null
}

/** Default enemy barks when a predator turns suspicious or gives chase; stages override by id or kind. */
const BARKS: Record<string, Bark> = {
  human: { suspicious: 'ん？', chase: 'あっ、ウサギ！', search: 'どこ行った？' },
  child: { suspicious: 'あれ？', chase: 'まてー！', search: 'どこー？' },
  cat: { suspicious: 'ニャ？', chase: 'フーッ！' },
  dog: { suspicious: 'クン？', chase: 'ワン！ワン！' },
  rat: { suspicious: 'チ？', chase: 'チュー！' },
  crow: { suspicious: 'カァ？', chase: 'カァー！' }
}
const PALETTE = {
  shirt: ['#5b7fb0', '#c0504d', '#6a9a5b', '#d9a441', '#8a6bb8', '#e7e2d6'],
  pants: ['#3c4250', '#5a4632', '#2f3a4f', '#6b6b6b'],
  hair: ['#2e2420', '#5a3a22', '#1b1b1b', '#8a6a4a'],
  fur: ['#d59a52', '#5a5a5a', '#e8e2d6', '#2b2b2b', '#b07a4a']
}
/** Stable per-id look for people and animals, so the same predator looks the same on every client. */
function variant(id: string): ModelOptions {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const pick = <T>(list: T[], salt: number) => list[(hash >>> salt) % list.length]
  return {
    color: pick(PALETTE.shirt, 0),
    pants: pick(PALETTE.pants, 3),
    hair: pick(PALETTE.hair, 6),
    long: !!(hash & 512)
  }
}

export class RabbitersScene {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 240)
  private readonly renderer: THREE.WebGLRenderer
  private readonly actors = new Map<string, Actor>()
  private readonly items = new Map<string, THREE.Group>()
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  // Shared by every rabbit; never released per actor, only in dispose().
  private readonly rabbitGeometry = {
    large: new THREE.SphereGeometry(1, 24, 16),
    medium: new THREE.SphereGeometry(1, 14, 10),
    small: new THREE.SphereGeometry(1, 8, 6),
    arm: new THREE.CapsuleGeometry(0.075, 0.2, 4, 10),
    collar: new THREE.TorusGeometry(0.31, 0.075, 8, 28)
  }
  private readonly target = new THREE.Vector3(SPAWN.x, 0, SPAWN.z)
  private scenery?: Scenery
  private stage = -1
  private readonly vehicles = new Map<string, THREE.Group>()
  private readonly beacons: THREE.Group[] = []
  private readonly sun = new THREE.DirectionalLight('#ffe8bc', 3.2)
  private readonly lantern = new THREE.PointLight('#ffd9a0', 0, 9, 1.4)
  private readonly propGeometry = {
    stalk: new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5),
    band: new THREE.TorusGeometry(0.13, 0.03, 4, 10)
  }
  private readonly droppings = new Map<string, THREE.Group>()
  private readonly pellet = new THREE.SphereGeometry(0.075, 8, 6)
  private readonly textures = new Map<string, THREE.Texture>()
  private clock = 0
  private readonly sky = new THREE.HemisphereLight('#e8f7f2', '#726442', 2.5)
  private readonly day = new THREE.Color('#b8d9d2')
  private readonly night = new THREE.Color('#1c2a40')
  private readonly haven = new THREE.Group()
  private readonly havenRing: THREE.Mesh
  private readonly beddingPile = new THREE.Group()
  /** Whether the conversation's current line shows in a speaker's bubble (the HUD subtitle then stays hidden). */
  voiced = false
  private viewCenter = { x: 0.5, y: 0.5 }
  private yaw = 0
  private arm = Infinity // current camera arm length (see render)
  private pitch = 0
  private disposed = false
  /** Game-feel particles and camera shake (see fx.ts). */
  readonly fx = new WorldFx(this.scene)
  private readonly shake = new THREE.Vector3()
  private readonly projected = new THREE.Vector3()

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
    this.renderer.domElement.setAttribute('aria-label', 'Rabbiters playing field')
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;'
    container.appendChild(this.renderer.domElement)
    this.scene.background = new THREE.Color('#b8d9d2')
    this.scene.fog = new THREE.Fog('#b8d9d2', 50, 230)
    this.scene.add(this.sky)
    const sun = this.sun
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 })
    sun.shadow.normalBias = 0.05
    this.scene.add(sun, sun.target, this.lantern)
    this.camera.position.set(SPAWN.x, 3.6, SPAWN.z + 8)
    // Winter destination: flowers around the Big Oak hollow; the ring glows once the kits are born.
    this.haven.position.set(HAVEN.x, heightAt(HAVEN.x, HAVEN.z), HAVEN.z)
    this.scene.add(this.haven)
    this.havenRing = this.mesh(
      this.haven,
      new THREE.RingGeometry(HAVEN.radius - 0.25, HAVEN.radius, 48),
      '#ffe9a8',
      0,
      0.05,
      0
    )
    this.havenRing.rotation.x = -Math.PI / 2
    this.havenRing.material = this.smooth('#ffe9a8', 0.5, true)
    this.havenRing.castShadow = false
    for (let index = 0; index < 18; index++) {
      const angle = index * 2.399
      const radius = Math.sqrt((index * 0.618) % 1) * (HAVEN.radius - 0.4)
      const flower = new THREE.Mesh(
        this.rabbitGeometry.small,
        this.material(['#f6c1d0', '#fff3b0', '#c9b8f2', '#ffffff'][index % 4])
      )
      flower.position.set(Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius)
      flower.scale.set(0.16, 0.1, 0.16)
      this.haven.add(flower)
    }
    // Bedding pile beside the burrow mouth (the mound opens to the south) grows with each delivered bundle.
    this.beddingPile.position.set(BURROW.x + 1.8, heightAt(BURROW.x + 1.8, BURROW.z + 2.6), BURROW.z + 2.6)
    this.scene.add(this.beddingPile)
    for (let index = 0; index < CAMPAIGN.beddingGoal; index++) {
      const bundle = this.straw(this.beddingPile)
      bundle.position.set((index % 3) * 0.55 - 0.55, Math.floor(index / 3) * 0.25, (index % 2) * 0.3)
      bundle.rotation.y = index * 1.1
      bundle.visible = false
    }
    this.resize()
  }

  private material(color: string, opacity = 1, transparent = false): THREE.MeshStandardMaterial {
    const key = `${color}:${opacity}:${transparent}`
    let material = this.materials.get(key)
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.88,
        transparent,
        opacity,
        flatShading: true,
        depthWrite: !transparent
      })
      this.materials.set(key, material)
    }
    return material
  }

  private smooth(color: string, roughness = 0.92, emissive = false): THREE.MeshStandardMaterial {
    const key = `smooth:${color}:${roughness}:${emissive}`
    let material = this.materials.get(key)
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness, emissive: emissive ? color : '#000000' })
      this.materials.set(key, material)
    }
    return material
  }

  private part(
    parent: THREE.Object3D,
    material: THREE.Material,
    [x, y, z]: number[],
    [width, height, depth]: number[],
    arm = false
  ): THREE.Mesh {
    // Tessellation and shadow casting scale with part size to keep software/low-end GPUs at full frame rate.
    const size = Math.max(width, height, depth)
    const { large, medium, small } = this.rabbitGeometry
    const geometry = arm ? this.rabbitGeometry.arm : size >= 0.15 ? large : size >= 0.06 ? medium : small
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.scale.set(width, height, depth)
    mesh.castShadow = arm || size >= 0.15
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  /** A bundle of dry grass tied with a band. */
  private straw(parent: THREE.Object3D): THREE.Group {
    const bundle = new THREE.Group()
    parent.add(bundle)
    // Shared geometry, no shadows: bundles appear on the field, the burrow pile and every rabbit's back.
    for (let stalk = 0; stalk < 3; stalk++) {
      const piece = new THREE.Mesh(this.propGeometry.stalk, this.material(stalk % 2 ? '#e8cf7a' : '#d6b45d'))
      piece.position.set(0, 0.1 + (stalk === 2 ? 0.08 : 0), (stalk - 1) * 0.07)
      piece.rotation.z = Math.PI / 2 + (stalk - 1) * 0.08
      bundle.add(piece)
    }
    const band = new THREE.Mesh(this.propGeometry.band, this.material('#9b6b3d'))
    band.position.y = 0.12
    band.rotation.y = Math.PI / 2
    bundle.add(band)
    return bundle
  }

  /**
   * White rabbit wearing a collar and bell in the player's colour, so teammates can tell each other apart.
   * `wild` makes a brown, collarless wild rabbit (the forest elder).
   */
  private rabbit(color: string, wild = false): Actor {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    const actor: Actor = {
      root,
      body,
      limbs: [],
      ears: [],
      kind: 'rabbit',
      x: NaN,
      z: NaN,
      moving: 0,
      alertAt: -Infinity,
      top: 1.9
    }
    const fur = this.smooth(wild ? '#9a7656' : '#f4ece0')
    const cream = this.smooth(wild ? '#e3d2b4' : '#fffaf2')
    const pink = this.smooth('#f1a3aa', 0.7)
    this.part(body, fur, [0, 0.6, -0.04], [0.46, 0.45, 0.56])
    this.part(body, cream, [0, 0.66, 0.24], [0.33, 0.36, 0.3])
    actor.belly = this.part(body, cream, [0, 0.5, 0.2], [0.4, 0.34, 0.42])
    actor.belly.visible = false
    actor.dust = this.oval(root, '#e8d2a0', 0, 0.15, 0, 0.9, 0.25, 0.9)
    actor.dust.material = this.material('#e8d2a0', 0.55, true)
    actor.dust.castShadow = false
    actor.dust.visible = false
    // Limb order is fixed by animate(): back/front per side, indices 0 and 3 in phase.
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const leg = new THREE.Group()
        body.add(leg)
        if (end < 0) {
          leg.position.set(side * 0.3, 0.45, -0.22)
          this.part(leg, fur, [0, -0.06, -0.02], [0.18, 0.26, 0.28])
          this.part(leg, fur, [0, -0.37, 0.12], [0.1, 0.075, 0.24])
        } else {
          leg.position.set(side * 0.16, 0.5, 0.3)
          this.part(leg, fur, [0, -0.2, 0], [1, 1, 1], true)
          this.part(leg, fur, [0, -0.43, 0.04], [0.085, 0.065, 0.11])
        }
        actor.limbs.push(leg)
      }
    const tail = new THREE.Group()
    tail.position.set(0, 0.62, -0.58)
    body.add(tail)
    this.part(tail, cream, [0, 0, -0.05], [0.15, 0.15, 0.14])
    for (let puff = 0; puff < 4; puff++) {
      const angle = (puff / 4) * Math.PI * 2
      this.part(tail, cream, [Math.cos(angle) * 0.09, Math.sin(angle) * 0.09, -0.08], [0.09, 0.09, 0.09])
    }
    actor.tail = tail
    const head = new THREE.Group()
    head.position.set(0, 1.08, 0.42)
    body.add(head)
    this.part(head, fur, [0, 0, 0], [0.37, 0.33, 0.35])
    this.part(head, cream, [0, -0.13, 0.2], [0.2, 0.13, 0.16])
    for (const side of [-1, 1]) {
      this.part(head, cream, [side * 0.085, -0.1, 0.27], [0.11, 0.09, 0.09])
      this.part(head, this.smooth('#f6b8bb', 0.95), [side * 0.25, -0.1, 0.19], [0.07, 0.04, 0.03]).rotation.y =
        side * 0.9
      this.part(head, this.smooth('#1d2629', 0.22), [side * 0.225, 0.045, 0.265], [0.07, 0.08, 0.055])
      const white = this.smooth('#ffffff', 0.5, true)
      this.part(head, white, [side * 0.235 - 0.012, 0.075, 0.31], [0.022, 0.024, 0.012])
      const ear = new THREE.Group()
      ear.position.set(side * 0.13, 1.33, 0.36)
      ear.rotation.z = -side * 0.2
      body.add(ear)
      this.part(ear, fur, [0, 0.38, 0], [0.11, 0.42, 0.055])
      this.part(ear, pink, [0, 0.37, 0.035], [0.065, 0.32, 0.025])
      actor.ears.push(ear)
    }
    this.part(head, this.smooth('#e9848f', 0.55), [0, -0.035, 0.335], [0.05, 0.035, 0.035])
    if (wild) {
      this.scene.add(root)
      return actor
    }
    const collar = new THREE.Mesh(this.rabbitGeometry.collar, this.smooth(color, 0.6))
    collar.position.set(0, 0.9, 0.34)
    collar.rotation.x = Math.PI / 2 - 0.5
    collar.castShadow = true
    body.add(collar)
    this.part(body, this.smooth(color, 0.25), [0, 0.75, 0.69], [0.095, 0.095, 0.095])
    this.part(body, this.smooth('#fff4c8', 0.3, true), [0.028, 0.78, 0.765], [0.026, 0.026, 0.014])
    actor.pack = this.straw(body)
    actor.pack.position.set(0, 0.82, 0.66)
    actor.pack.scale.setScalar(1.4)
    actor.pack.visible = false
    this.scene.add(root)
    return actor
  }

  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
    this.geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, this.material(color))
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  private oval(
    parent: THREE.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number
  ): THREE.Mesh {
    const mesh = this.mesh(parent, new THREE.SphereGeometry(1, 12, 8), color, x, y, z)
    mesh.scale.set(width, height, depth)
    return mesh
  }

  private character(kind: string, tint = '#ffffff', id = '', marked = true): Actor {
    if (kind === 'rabbit') return this.rabbit(tint)
    if (kind === 'wildRabbit') return this.rabbit(tint, true)
    // Ids pick named looks and extras: a `worker` carries a torch, a `walkdog-*` wears a lead. A kind this client
    // does not know yet (a newer host's) borrows the fox's body.
    const options = { ...variant(id), id, flashlight: id === 'worker', leash: id.startsWith('walkdog') }
    const model = buildModel(kind, options) ?? buildModel('fox', options)!
    if (marked) this.addMarker(model)
    this.scene.add(model.root)
    return model
  }

  /** "?" / "!" sprites and the suspicion meter over a predator. */
  private addMarker(actor: Actor) {
    const sprite = (texture: THREE.Texture | null, color: string) => {
      const material = new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthTest: false })
      const result = new THREE.Sprite(material)
      result.renderOrder = 10
      result.visible = false
      actor.root.add(result)
      return result
    }
    actor.marker = {
      symbol: sprite(this.markerTexture('?', '#e0a020'), '#ffffff'),
      meter: sprite(null, '#3b3326'),
      fill: sprite(null, '#f2b531')
    }
  }

  /** Speech-bubble texture with a line of text, drawn once per text. */
  private speechTexture(text: string): { texture: THREE.Texture; aspect: number } {
    const key = `speech:${text}`
    const cached = this.textures.get(key)
    const width = Math.min(1024, 48 + [...text].length * 34)
    if (cached) return { texture: cached, aspect: width / 96 }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = 96
    const draw = canvas.getContext('2d')
    if (draw) {
      draw.fillStyle = '#fffdf6'
      draw.strokeStyle = '#3b3326'
      draw.lineWidth = 5
      draw.beginPath()
      draw.roundRect(4, 4, width - 8, 68, 22)
      draw.moveTo(width / 2 - 12, 70)
      draw.lineTo(width / 2, 92)
      draw.lineTo(width / 2 + 12, 70)
      draw.fill()
      draw.stroke()
      draw.fillRect(width / 2 - 10, 66, 20, 6)
      draw.fillStyle = '#2b2620'
      draw.font = 'bold 32px system-ui, sans-serif'
      draw.textAlign = 'center'
      draw.textBaseline = 'middle'
      draw.fillText(text, width / 2, 40, width - 24)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.textures.set(key, texture)
    return { texture, aspect: width / 96 }
  }

  /** Shows `text` in a bubble over the actor, or hides the bubble. */
  private speak(actor: Actor, text: string | undefined) {
    if (!text) {
      if (actor.bubble) actor.bubble.visible = false
      return
    }
    if (!actor.bubble) {
      actor.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }))
      actor.bubble.renderOrder = 11
      actor.root.add(actor.bubble)
    }
    const { texture, aspect } = this.speechTexture(text)
    if (actor.bubble.material.map !== texture) {
      // Only on a new line: flagging the material every frame would re-validate its shader each frame.
      actor.bubble.material.map = texture
      actor.bubble.material.needsUpdate = true
    }
    const height = Math.max(0.55, actor.top * 0.22)
    actor.bubble.scale.set(height * aspect, height, 1)
    actor.bubble.position.set(0, actor.top + height * 0.9 + (actor.marker?.symbol.visible ? 1.1 : 0), 0)
    actor.bubble.visible = true
  }

  /** "?" / "!" speech-bubble texture drawn once per symbol. */
  private markerTexture(symbol: string, color: string): THREE.Texture {
    const key = `${symbol}${color}`
    let texture = this.textures.get(key)
    if (texture) return texture
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const draw = canvas.getContext('2d')
    if (draw) {
      draw.fillStyle = '#fffaf0'
      draw.strokeStyle = color
      draw.lineWidth = 9
      draw.beginPath()
      draw.arc(64, 56, 44, 0, Math.PI * 2)
      draw.moveTo(50, 94)
      draw.lineTo(64, 122)
      draw.lineTo(78, 94)
      draw.fill()
      draw.stroke()
      draw.beginPath()
      draw.arc(64, 56, 39, 0, Math.PI * 2)
      draw.fill()
      draw.fillStyle = color
      draw.font = 'bold 70px system-ui, sans-serif'
      draw.textAlign = 'center'
      draw.textBaseline = 'middle'
      draw.fillText(symbol, 64, 60)
    }
    texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.textures.set(key, texture)
    return texture
  }

  /** Pops "!" when spotting, shows "?" with a meter while suspicious and a faint "?" while searching. */
  private updateMarker(actor: Actor, state: string, suspicion: number, height: number): void {
    const marker = actor.marker
    if (!marker) return
    if (state === 'chase' && actor.lastState !== 'chase') actor.alertAt = this.clock
    actor.lastState = state
    const since = this.clock - actor.alertAt
    const material = marker.symbol.material
    let scale = 0
    if (state === 'chase') {
      material.map = this.markerTexture('!', '#d8342c')
      if (this.fx.prefersReducedMotion || since > 1.6) scale = 0.8
      else scale = since < 0.15 ? 0.3 + (since / 0.15) * 1.3 : since < 0.4 ? 1.6 - ((since - 0.15) / 0.25) * 0.5 : 1.1
      material.opacity = 1
    } else if (state === 'suspicious' || state === 'search') {
      const active = state === 'suspicious'
      material.map = this.markerTexture('?', active ? '#e0a020' : '#8a8f98')
      scale = active ? 0.75 + suspicion * 0.4 : 0.55
      material.opacity = active ? 0.7 + suspicion * 0.3 : 0.6
    }
    marker.symbol.visible = scale > 0
    marker.symbol.scale.set(scale, scale, 1)
    marker.symbol.position.set(0, height + scale * 0.4, 0)
    const showMeter = state !== 'chase' && suspicion > 0.01
    marker.meter.visible = marker.fill.visible = showMeter
    marker.meter.scale.set(0.95, 0.12, 1)
    marker.meter.position.set(0, height - 0.2, 0)
    marker.fill.scale.set(0.85 * suspicion, 0.07, 1)
    marker.fill.position.set(0, height - 0.2, 0)
  }

  private dropping(id: string): THREE.Group {
    let group = this.droppings.get(id)
    if (group) return group
    group = new THREE.Group()
    for (const [x, z] of [
      [0, 0],
      [0.11, 0.05],
      [-0.04, 0.12]
    ]) {
      const pellet = new THREE.Mesh(this.pellet, this.material('#5a3a22'))
      pellet.position.set(x, 0.07, z)
      pellet.castShadow = true
      group.add(pellet)
    }
    this.scene.add(group)
    this.droppings.set(id, group)
    return group
  }

  private animate(actor: Actor, time: number, moving: number, downed: boolean, airborne: boolean, bath = 0): void {
    const cycle = time * (actor.kind === 'rabbit' ? 11 : 8)
    const jumping = actor.kind === 'rabbit' && airborne && !downed
    actor.body.position.y = flies(actor.kind)
      ? 0.2 + Math.sin(time * 3) * 0.15
      : jumping
        ? 0
        : Math.abs(Math.sin(cycle)) * moving * (actor.kind === 'rabbit' ? 0.18 : 0.06)
    actor.body.rotation.z = downed ? Math.PI / 2 : bath > 0 && bath < 1 ? Math.sin(time * 18) * 0.45 : 0
    if (actor.dust) {
      actor.dust.visible = bath > 0 && !downed
      actor.dust.scale.set(0.6 + bath * 0.5 + Math.sin(time * 9) * 0.08, 0.2, 0.6 + bath * 0.5)
    }
    actor.body.rotation.x = jumping ? -0.22 : actor.kind === 'rabbit' ? Math.sin(cycle) * moving * 0.1 : 0
    actor.limbs.forEach((limb, index) => {
      if (flies(actor.kind)) limb.rotation.z = Math.sin(time * 7) * 0.55 * (index === 0 ? -1 : 1)
      else if (actor.kind === 'snake') limb.rotation.y = Math.sin(time * 5 - index * 0.65) * 0.24
      else if (jumping) limb.rotation.x = index % 2 === 0 ? 0.85 : -0.65
      else limb.rotation.x = Math.sin(cycle + (index === 0 || index === 3 ? 0 : Math.PI)) * moving * 0.55
    })
    actor.ears.forEach((ear, index) => {
      ear.rotation.x = jumping ? -0.55 : Math.sin(time * 3 + index) * 0.06 - moving * 0.25
    })
    if (actor.tail) actor.tail.rotation.y = jumping ? 0 : Math.sin(time * 5) * 0.2
  }

  private item(key: string, nest: boolean | 'straw', kind: FoodKind = 'carrot'): THREE.Group {
    let item = this.items.get(key)
    if (item) return item
    item = new THREE.Group()
    if (nest === 'straw') {
      this.straw(item)
      const halo = this.mesh(item, new THREE.RingGeometry(0.5, 0.56, 28), '#f3d599', 0, 0.045, 0)
      halo.rotation.x = -Math.PI / 2
      halo.castShadow = false
      this.scene.add(item)
      this.items.set(key, item)
      return item
    }
    if (nest) {
      const rim = this.mesh(item, new THREE.TorusGeometry(0.65, 0.18, 6, 16), '#a57c4f', 0, 0.22, 0)
      rim.rotation.x = Math.PI / 2
      for (let index = 0; index < 3; index++)
        this.oval(item, '#f9e6bb', (index - 1) * 0.3, 0.35, (index % 2) * 0.22, 0.19, 0.28, 0.19)
    } else {
      item = buildFood(kind)
      this.scene.add(item)
      this.items.set(key, item)
      return item
    }
    const halo = this.mesh(
      item,
      new THREE.RingGeometry(nest ? 0.88 : 0.37, nest ? 0.94 : 0.42, 28),
      nest ? '#bf8c69' : '#f3d599',
      0,
      0.045,
      0
    )
    halo.rotation.x = -Math.PI / 2
    this.scene.add(item)
    this.items.set(key, item)
    return item
  }

  /** Builds the stage's scenery, lighting and friendly NPCs (the map is already switched to it). */
  private enterStage(stage: number) {
    this.stage = stage
    this.scenery?.dispose()
    const def = STAGES[stage]
    const existing = new Set(this.scene.children)
    this.scenery = def.scenery(this.scene)
    // Every chapter's solid scenery turns see-through between the camera and the rabbit (water stays as it is).
    for (const child of this.scene.children)
      if (!existing.has(child))
        child.traverse((node) => {
          const mesh = node as THREE.Mesh
          for (const entry of mesh.isMesh ? [mesh.material].flat() : []) if (!entry.transparent) cutAway(entry)
        })
    const { look } = def
    const fog = this.scene.fog as THREE.Fog
    fog.near = look.fog[0]
    fog.far = look.fog[1]
    this.camera.far = Math.max(240, look.fog[1] + 20)
    this.camera.updateProjectionMatrix()
    this.day.set(look.sky)
    this.night.set(look.nightSky ?? look.sky)
    this.sky.color.set(look.hemi[0])
    this.sky.groundColor.set(look.hemi[1])
    this.sun.color.set(look.sun[0])
    for (const [key, actor] of this.actors)
      if (key.startsWith('npc:')) {
        this.release(actor.root)
        this.actors.delete(key)
      }
    for (const npc of NPCS) {
      const actor = this.character(npc.kind, '#ffffff', npc.id, false)
      actor.root.position.set(npc.x, heightAt(npc.x, npc.z), npc.z)
      actor.root.rotation.y = npc.angle
      this.actors.set(`npc:${npc.id}`, actor)
    }
    for (const car of this.vehicles.values()) this.release(car)
    this.vehicles.clear()
    // Forest-only campaign props.
    this.haven.visible = this.beddingPile.visible = stage === FOREST
    this.target.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z)
    this.camera.position.set(SPAWN.x, this.target.y + 3.6, SPAWN.z + 8)
    this.arm = Infinity
  }

  /** Ring-and-diamond beacons over the stage script's markers (where to go, whom to talk to). */
  private updateBeacons(state: RabbitersSceneState) {
    const markers = STAGES[this.stage].script.markers?.(state as never) ?? []
    markers.forEach((marker, index) => {
      let beacon = this.beacons[index]
      if (!beacon) {
        beacon = new THREE.Group()
        const ring = this.mesh(beacon, new THREE.RingGeometry(0.9, 1.15, 32), '#ffe9a8')
        ring.rotation.x = -Math.PI / 2
        ring.material = this.smooth('#ffe9a8', 0.5, true)
        ring.castShadow = false
        const gem = this.mesh(beacon, new THREE.OctahedronGeometry(0.35), '#ffd25a')
        gem.material = this.smooth('#ffd25a', 0.4, true)
        gem.castShadow = false
        this.scene.add(beacon)
        this.beacons.push(beacon)
      }
      const lift = marker.kind === 'npc' ? 2.6 : 1.4
      beacon.position.set(marker.x, heightAt(marker.x, marker.z) + 0.06, marker.z)
      beacon.children[1].position.y = lift + Math.sin(this.clock * 2.4 + index) * 0.2
      beacon.children[1].rotation.y = this.clock * 1.5
      beacon.children[0].visible = marker.kind === 'goal'
      beacon.visible = true
    })
    for (let index = markers.length; index < this.beacons.length; index++) this.beacons[index].visible = false
  }

  render(state: RabbitersSceneState, localPlayerId: string, dt: number): void {
    if (this.disposed) return
    const stage = state.stage ?? FOREST
    setStage(stage) // the host's game and a guest's snapshot already chose it; keeps preview and play in step
    if (stage !== this.stage) this.enterStage(stage)
    const def = STAGES[stage]
    const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0
    this.clock += elapsed
    // Guests get rolling droppings at ~10 Hz, so they glide between snapshots.
    const follow = 1 - Math.exp(-elapsed * 12)
    const liveActors = new Set<string>()
    for (const entity of [
      ...state.players.map((player) => {
        const tint = playerColor(player)
        return { ...player, kind: 'rabbit', tint, key: `player:${player.id}` }
      }),
      ...state.predators.map((predator) => ({
        ...predator,
        hidden: false,
        downed: false,
        pregnant: false,
        tint: undefined,
        key: `predator:${predator.id}`
      })),
      ...NPCS.map((npc) => ({
        ...npc,
        y: heightAt(npc.x, npc.z),
        hidden: false,
        downed: false,
        pregnant: false,
        tint: undefined,
        key: `npc:${npc.id}`
      })),
      ...(state.kits ?? [])
        .filter((kit) => kit.status !== 'lost')
        .map((kit) => ({
          ...kit,
          kind: 'rabbit',
          tint: '#ffffff',
          downed: false,
          pregnant: false,
          key: `kit:${kit.id}`
        }))
    ]) {
      liveActors.add(entity.key)
      let actor = this.actors.get(entity.key)
      if (!actor) {
        actor = this.character(entity.kind, entity.tint, entity.id)
        this.actors.set(entity.key, actor)
      }
      const distance = Math.hypot(entity.x - actor.x, entity.z - actor.z)
      actor.moving = elapsed > 0 && Number.isFinite(distance) ? Math.min(1, distance / elapsed / 3) : 0
      actor.x = entity.x
      actor.z = entity.z
      actor.root.position.set(entity.x, entity.y, entity.z)
      actor.root.rotation.y = entity.angle
      actor.root.scale.setScalar((entity.hidden ? 0.8 : 1) * (entity.key.startsWith('kit:') ? 0.5 : 1))
      // Far creatures are lost in the fog anyway; skipping them keeps draw calls flat on the big map.
      actor.root.visible = Math.hypot(entity.x - this.target.x, entity.z - this.target.z) < 120
      if (actor.belly) actor.belly.visible = entity.pregnant === true
      const carrying = 'carrying' in entity ? (entity.carrying ?? null) : null
      if (actor.pack) actor.pack.visible = !!carrying && carrying.startsWith('straw-')
      if (actor.carried?.id !== (carrying?.startsWith('straw-') ? null : carrying)) {
        actor.carried?.object.removeFromParent()
        actor.carried = undefined
        const item = carrying && state.items?.find((entry) => entry.id === carrying)
        if (item) {
          const object = def.itemModel?.(item.kind) ?? buildItem(item.kind)
          object.position.set(0, 0.62, 0.72)
          actor.body.add(object)
          actor.carried = { id: item.id, object }
        }
      }
      this.animate(
        actor,
        state.time,
        actor.moving,
        entity.downed,
        entity.y - floorAt(entity.x, entity.y, entity.z) > 0.06,
        'bath' in entity ? (entity.bath ?? 0) : 0
      )
      if (entity.key.startsWith('predator:')) {
        const {
          state: mood,
          suspicion,
          targetId
        } = entity as unknown as {
          state: string
          suspicion?: number
          targetId?: string | null
        }
        // Client-only barks on a change of mind; they never cross the relay.
        if (mood !== actor.lastState && actor.lastState !== undefined) {
          const text = (def.barks?.[entity.id] ?? def.barks?.[entity.kind] ?? BARKS[entity.kind])?.[mood as keyof Bark]
          const target = state.players.find((player) => player.id === targetId)
          if (text)
            actor.bark = {
              text: fillNames(text, target?.name ?? 'モチ', state.players.length),
              until: this.clock + 1.8
            }
        }
        this.updateMarker(actor, mood, suspicion ?? 0, actor.top)
      }
      if (entity.key.startsWith('npc:'))
        actor.root.rotation.y = entity.angle + Math.sin(state.time * 0.7 + entity.x) * 0.25
    }
    // Speech: the conversation's current speaker, else any fresh bark.
    const line = spokenLine(stage, state)
    const speaker =
      line?.speaker &&
      (this.actors.get(line.speaker) ??
        this.actors.get(`npc:${line.speaker}`) ??
        this.actors.get(`predator:${line.speaker}`))
    this.voiced = !!speaker
    for (const actor of this.actors.values()) {
      const bark = actor.bark && actor.bark.until > this.clock ? actor.bark.text : undefined
      this.speak(actor, line && actor === speaker ? line.text : bark)
    }
    for (const [key, actor] of this.actors)
      if (!liveActors.has(key)) {
        this.release(actor.root)
        this.actors.delete(key)
      }
    const liveItems = new Set<string>()
    for (const food of state.foods) {
      const key = `food:${food.id}`
      liveItems.add(key)
      const item = this.item(key, false, isFoodKind(food.kind) ? food.kind : 'carrot')
      item.visible = food.active && Math.hypot(food.x - this.target.x, food.z - this.target.z) < 110
      item.position.set(food.x, food.y + Math.sin(state.time * 2 + food.x) * 0.035, food.z)
    }
    for (const nest of state.nests) {
      const key = `nest:${nest.id}`
      liveItems.add(key)
      const item = this.item(key, true)
      item.visible = nest.active && Math.hypot(nest.x - this.target.x, nest.z - this.target.z) < 130
      item.position.set(nest.x, nest.y, nest.z)
    }
    for (const straw of state.straws ?? []) {
      const key = `straw:${straw.id}`
      liveItems.add(key)
      const item = this.item(key, 'straw')
      item.visible = straw.active
      item.position.set(straw.x, straw.y + Math.sin(state.time * 2 + straw.z) * 0.035, straw.z)
    }
    this.beddingPile.children.forEach((bundle, index) => (bundle.visible = index < (state.bedding ?? 0)))
    this.havenRing.visible = state.chapter === 3
    if (this.havenRing.visible) this.havenRing.scale.setScalar(1 + Math.sin(state.time * 2.5) * 0.03)
    const liveCars = new Set<string>()
    for (const vehicle of vehiclesAt(state.time)) {
      liveCars.add(vehicle.id)
      let car = this.vehicles.get(vehicle.id)
      if (!car) {
        car = buildCar(vehicle.color, vehicle.length, vehicle.width, vehicle.height)
        this.scene.add(car)
        this.vehicles.set(vehicle.id, car)
      }
      car.position.set(vehicle.x, heightAt(vehicle.x, vehicle.z), vehicle.z)
      car.rotation.y = vehicle.angle
      // Like far creatures, far cars are lost in the fog: skip drawing them.
      car.visible = Math.hypot(vehicle.x - this.target.x, vehicle.z - this.target.z) < 130
    }
    for (const [id, car] of this.vehicles)
      if (!liveCars.has(id)) {
        this.release(car)
        this.vehicles.delete(id)
      }
    for (const entry of state.items ?? []) {
      const key = `item:${entry.id}`
      liveItems.add(key)
      let item = this.items.get(key)
      if (!item) {
        item = new THREE.Group()
        item.add(def.itemModel?.(entry.kind) ?? buildItem(entry.kind))
        this.scene.add(item)
        this.items.set(key, item)
      }
      item.visible = entry.active
      item.position.set(entry.x, entry.y + Math.sin(state.time * 2 + entry.x) * 0.035, entry.z)
    }
    this.updateBeacons(state)
    const { look } = def
    const dark = look.night?.(state) ?? 0
    this.sun.intensity = look.sun[1] * (1 - 0.8 * dark)
    this.sky.intensity = look.hemi[2] * (1 - 0.7 * dark)
    ;(this.scene.background as THREE.Color).lerpColors(this.day, this.night, dark)
    ;(this.scene.fog as THREE.Fog).color.lerpColors(this.day, this.night, dark)
    for (const [key, item] of this.items)
      if (!liveItems.has(key)) {
        this.release(item)
        this.items.delete(key)
      }
    const liveDroppings = new Set<string>()
    for (const dropping of state.droppings ?? []) {
      liveDroppings.add(dropping.id)
      const group = this.dropping(dropping.id)
      const fresh = group.userData.placed !== true
      const dx = fresh ? 0 : (dropping.x - group.position.x) * follow
      const dz = fresh ? 0 : (dropping.z - group.position.z) * follow
      if (fresh) group.position.set(dropping.x, dropping.y, dropping.z)
      else group.position.set(group.position.x + dx, dropping.y, group.position.z + dz)
      group.userData.placed = true
      // Roll the pellets with their motion, and fade them as the scent goes stale.
      group.rotation.x += dz / 0.075
      group.rotation.z -= dx / 0.075
      const age = Math.min(3, Math.floor(((state.time - dropping.t) / STEALTH.scentLifetime) * 3))
      const material = this.material(['#5a3a22', '#6e4f35', '#8a7254', '#a89a80'][age])
      for (const pellet of group.children) (pellet as THREE.Mesh).material = material
    }
    for (const [id, group] of this.droppings)
      if (!liveDroppings.has(id)) {
        group.removeFromParent()
        this.droppings.delete(id)
      }
    const local = state.players.find((player) => player.id === localPlayerId) || state.players[0]
    const smoothing = 1 - Math.exp(-elapsed * 7)
    if (local) this.target.lerp(new THREE.Vector3(local.x, local.y, local.z), smoothing)
    const underground = !!local && isUnderground(local.x, local.y, local.z)
    const cave = local && !underground ? caveAt(local.x, local.z) : undefined
    const log = local && !underground ? logOver(local.x, local.z) : undefined
    const underLog = !!log && !!local && local.y < logTop(log)
    const narrow = this.camera.aspect < 0.8
    const distance = underground ? 3 : cave ? 5 : narrow ? 8.5 : 7.5
    // In Mochi's cage the camera starts below the bars' top (3.2) and looks through them.
    const caged = !!local && inZone('cage', local.x, local.z)
    const height = underground ? 1.3 : cave ? 2 : caged ? 2.6 : narrow ? 4 : 3.4
    const lift = underground ? 0.55 : 1
    const focus = this.target.clone().add(new THREE.Vector3(0, lift, 0))
    // The boom: its usual angle for the place, tilted by the player (from just under level to almost top-down).
    const boom = Math.hypot(distance, height - lift)
    const pitch = THREE.MathUtils.clamp(Math.atan2(height - lift, distance) + this.pitch, -0.15, 1.35)
    // Spring arm: walls (more than 4 m over the rabbit) and a cave's own walls stop it just in front of them, so
    // the camera never looks from behind one. It shortens at once and eases back out. Smaller things (cage bars,
    // furniture, trees, rocks) don't stop it: between the camera and the rabbit they turn see-through.
    const direction = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(this.yaw) * Math.cos(pitch)
    )
    const reach = underground ? boom : this.armReach(focus, direction, boom, cave)
    this.arm = this.arm > reach ? reach : this.arm + (reach - this.arm) * (1 - Math.exp(-elapsed * 2.5))
    this.camera.position.copy(focus).addScaledVector(direction, this.arm)
    // Pressed short against a wall, the camera rises (rooms have no ceiling) to look down at the rabbit rather
    // than fill the screen with it.
    if (!underground) {
      const lifted = this.camera.position.y + Math.max(0, 4.5 - this.arm) * 1.2
      this.camera.position.y = cave
        ? Math.min(lifted, Math.max(this.camera.position.y, cave.floor + cave.roof - 0.8))
        : lifted
    }
    // The forest's hills lift the camera so it never ends up inside the ground.
    if (this.stage === FOREST && !underground)
      this.camera.position.y = Math.max(
        this.camera.position.y,
        heightAt(this.camera.position.x, this.camera.position.z) + 1
      )
    this.keepCameraClear(this.camera.position, underground)
    if (underground || cave) this.camera.lookAt(focus)
    else {
      // Aim a little past the rabbit so the horizon, and landmarks for finding the way, stay in frame (less so
      // when looking down from high up, where it would push the rabbit off the bottom of the screen).
      const ahead = focus.clone().sub(this.camera.position).setY(0)
      const level = ahead.length()
      const steep = Math.atan2(this.camera.position.y - focus.y, level)
      if (level > 0.01) ahead.setLength(6 * Math.cos(Math.max(0, steep)) ** 2 * Math.min(1, level / 6))
      this.camera.lookAt(
        focus
          .clone()
          .add(ahead)
          .add(new THREE.Vector3(0, 0.4, 0))
      )
    }
    this.sun.position.set(this.target.x - 18, this.target.y + 35, this.target.z + 12)
    this.sun.target.position.copy(this.target)
    this.lantern.intensity = underground || cave || look.dark ? 2.2 : 0
    this.lantern.position.copy(this.target).add(new THREE.Vector3(0, 1.1, 0))
    const roof = local && !underground ? overhangAt(local.x, local.z) : undefined
    this.scenery?.update(state, {
      underground,
      underLog,
      under: roof && local && local.y - heightAt(local.x, local.z) < roof.bottom ? roof : undefined
    })
    // Cut a see-through cone from the camera to the rabbit.
    SEE_THROUGH.radius.value = local ? (underground ? 1 : 1.5) : 0
    // Past the cut-open tunnel walls lies earth, not sky.
    if (underground) (this.scene.background as THREE.Color).set('#2a1f18')
    SEE_THROUGH.focus.value = { x: this.target.x, y: this.target.y + 0.7, z: this.target.z }
    this.fx.update(elapsed, this.camera)
    // The shake rides on top of the camera placed above; next frame places it afresh.
    this.camera.position.add(this.fx.shakeOffset(this.shake))
    this.renderer.render(this.scene, this.camera)
  }

  /** A world point in CSS pixels relative to the field, or null when it is behind the camera or off screen. */
  screenPoint(point: { x: number; y: number; z: number }): { x: number; y: number } | null {
    if (this.disposed) return null
    const ndc = this.projected.set(point.x, point.y + 0.6, point.z).project(this.camera)
    if (ndc.z > 1 || Math.abs(ndc.x) > 1.1 || Math.abs(ndc.y) > 1.1) return null
    const box = this.renderer.domElement.getBoundingClientRect()
    return { x: box.left + ((ndc.x + 1) / 2) * box.width, y: box.top + ((1 - ndc.y) / 2) * box.height }
  }

  /** How far the camera arm reaches from `focus` along `direction` before a wall or a cave's edge. */
  private armReach(focus: THREE.Vector3, direction: THREE.Vector3, length: number, cave: ReturnType<typeof caveAt>) {
    const point = new THREE.Vector3()
    for (let along = 0.3; along < length; along += 0.1) {
      point.copy(focus).addScaledVector(direction, along)
      const ground = heightAt(point.x, point.z)
      const blocked = cave
        ? Math.hypot(point.x - cave.x, point.z - cave.z) > cave.r - 1 || point.y > cave.floor + cave.roof - 0.8
        : this.stage !== FOREST && ground > point.y - 0.2 && ground > this.target.y + 4
      if (blocked) return Math.max(0.8, along - 0.4)
    }
    return length
  }

  /** Final guard: never under the ground; underground, never up in the open. */
  private keepCameraClear(point: THREE.Vector3, underground: boolean) {
    const ground = heightAt(point.x, point.z)
    if (underground) point.y = Math.max(Math.min(point.y, ground - 0.4), this.target.y + 0.3)
    // The forest's hills lift the camera; in the built chapters walls and furniture never do (it looks through
    // them), it only stays above the floor the rabbit is on.
    else if (this.stage === FOREST) point.y = Math.max(point.y, ground + 0.3)
    else point.y = Math.max(point.y, Math.min(ground, this.target.y) + 0.3)
  }

  /** Tilts the camera up or down around the rabbit (positive looks from higher up). */
  tilt(deltaRadians: number): void {
    if (Number.isFinite(deltaRadians)) this.pitch = THREE.MathUtils.clamp(this.pitch + deltaRadians, -0.6, 1.1)
  }

  orbit(deltaRadians: number): void {
    if (Number.isFinite(deltaRadians)) this.yaw += deltaRadians
  }

  resize(): void {
    if (this.disposed) return
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.camera.aspect = width / height
    this.applyView(width, height)
    this.renderer.setSize(width, height, false)
  }

  /** Where on the canvas (0..1) the followed rabbit appears; (0.5, 0.5) is the usual centre. */
  setViewCenter(x: number, y: number): void {
    if (this.disposed) return
    this.viewCenter = { x, y }
    this.applyView(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight))
  }

  private applyView(width: number, height: number): void {
    const { x, y } = this.viewCenter
    if (x === 0.5 && y === 0.5) this.camera.clearViewOffset()
    else this.camera.setViewOffset(width, height, (0.5 - x) * width, (0.5 - y) * height, width, height)
    this.camera.updateProjectionMatrix()
  }

  private release(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && (this.geometries.delete(object.geometry) || object.userData.owned))
        object.geometry.dispose()
      if (object instanceof THREE.Sprite) object.material.dispose()
    })
    root.removeFromParent()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.geometries.forEach((geometry) => geometry.dispose())
    Object.values(this.rabbitGeometry).forEach((geometry) => geometry.dispose())
    this.pellet.dispose()
    this.textures.forEach((texture) => texture.dispose())
    this.scene.traverse((object) => {
      if (object instanceof THREE.Sprite) object.material.dispose()
    })
    Object.values(this.propGeometry).forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
    this.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose()
    })
    this.geometries.clear()
    this.materials.clear()
    this.actors.clear()
    this.items.clear()
    this.scenery?.dispose()
    this.fx.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.scene.clear()
  }
}
