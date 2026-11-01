import * as THREE from 'three'
import { FIELD_PROPS, GRASS_PATCHES, SAND_PATCHES } from './game'
import { buildFood, isFoodKind, type FoodKind } from './food'
import { STEALTH } from './stealth'

export interface RabbitersSceneState {
  time: number
  players: {
    id: string
    name: string
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
  }[]
  droppings?: { id: string; x: number; y: number; z: number; t: number }[]
  foods: { id: string; kind?: FoodKind; x: number; y: number; z: number; active: boolean }[]
  nests: { id: string; x: number; y: number; z: number; health: number; active: boolean }[]
  delivered: number
  goal: number
  phase: string
}

type Actor = {
  root: THREE.Group
  body: THREE.Group
  limbs: THREE.Group[]
  ears: THREE.Group[]
  tail?: THREE.Group
  belly?: THREE.Mesh
  dust?: THREE.Mesh
  marker?: { symbol: THREE.Sprite; meter: THREE.Sprite; fill: THREE.Sprite }
  lastState?: string
  alertAt: number
  kind: string
  x: number
  z: number
  moving: number
}

export class RabbitersScene {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180)
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
    arm: new THREE.CapsuleGeometry(0.075, 0.2, 4, 10)
  }
  private readonly target = new THREE.Vector3(-37, 0, 0)
  private readonly cameraObstacles: THREE.Object3D[] = []
  private readonly cameraRay = new THREE.Raycaster()
  private readonly water: THREE.Mesh
  private readonly reeds: THREE.Group[] = []
  private readonly droppings = new Map<string, THREE.Group>()
  private readonly pellet = new THREE.SphereGeometry(0.075, 8, 6)
  private readonly textures = new Map<string, THREE.Texture>()
  private clock = 0
  private yaw = 0
  private disposed = false

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
    this.renderer.domElement.setAttribute('aria-label', 'Rabbiters woodland and desert playing field')
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;'
    container.appendChild(this.renderer.domElement)
    this.scene.background = new THREE.Color('#b8d9d2')
    this.scene.fog = new THREE.Fog('#b8d9d2', 48, 115)
    this.scene.add(new THREE.HemisphereLight('#e8f7f2', '#726442', 2.5))
    const sun = new THREE.DirectionalLight('#ffe8bc', 3.2)
    sun.position.set(-18, 35, 12)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 45, bottom: -45, near: 1, far: 100 })
    sun.shadow.normalBias = 0.05
    this.scene.add(sun)
    this.landscape()
    this.water = this.mesh(this.scene, new THREE.PlaneGeometry(90, 3.8), '#6eb9ba', 0, 0.035, 10)
    this.water.rotation.x = -Math.PI / 2
    this.water.material = this.material('#6eb9ba', 0.45, true)
    for (let index = 0; index < 35; index++) {
      const ripple = this.mesh(
        this.scene,
        new THREE.BoxGeometry(0.6 + this.random(index) * 1.2, 0.012, 0.04),
        '#d5ece0',
        -44 + index * 2.6,
        0.06,
        8.6 + this.random(index + 70) * 2.8
      )
      ripple.castShadow = false
    }
    this.camera.position.set(-37, 3.6, 8)
    this.resize()
  }

  private random(seed: number): number {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return value - Math.floor(value)
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

  private rabbit(): Actor {
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
      alertAt: -Infinity
    }
    const fur = this.smooth('#f4ece0')
    const cream = this.smooth('#fffaf2')
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

  private landscape(): void {
    const backdrop = this.mesh(this.scene, new THREE.PlaneGeometry(400, 400), '#83a172', 0, -0.06, 0)
    backdrop.rotation.x = -Math.PI / 2
    const ground = this.mesh(this.scene, new THREE.PlaneGeometry(90, 64), '#91ac69', 0, -0.025, 0)
    ground.rotation.x = -Math.PI / 2
    const desert = this.mesh(this.scene, new THREE.PlaneGeometry(43, 64), '#e4c58c', 23.5, -0.012, 0)
    desert.rotation.x = -Math.PI / 2
    this.mesh(this.scene, new THREE.BoxGeometry(90, 1.8, 64), '#9a8861', 0, -0.95, 0)
    for (const { index, x, z, skip, tree: isTree } of FIELD_PROPS) {
      if (skip) continue
      if (isTree) {
        const tree = new THREE.Group()
        tree.position.set(x, 0, z)
        this.scene.add(tree)
        this.cameraObstacles.push(tree)
        const height = 3.5 + this.random(index + 800) * 2
        this.mesh(tree, new THREE.CylinderGeometry(0.18, 0.35, height, 7), '#80664b', 0, height / 2, 0)
        for (let crown = 0; crown < 3; crown++)
          this.oval(
            tree,
            ['#527f59', '#6c9861', '#82a76b'][crown],
            (crown - 1) * 0.8,
            height + crown * 0.35,
            (crown % 2) * 0.5,
            1.7,
            1.6,
            1.5
          )
      } else {
        const rock = this.mesh(
          this.scene,
          new THREE.DodecahedronGeometry(0.2 + this.random(index + 81) * 0.35),
          x > 2 ? '#c3a778' : '#a3ac91',
          x,
          0.12,
          z
        )
        rock.scale.y = 0.6
      }
      for (let tuft = 0; tuft < 3; tuft++) {
        const stem = this.mesh(
          this.scene,
          new THREE.ConeGeometry(0.08, 0.35, 3),
          x < 2 ? '#789852' : '#bba369',
          x + tuft * 0.16,
          0.15,
          z + 0.6
        )
        stem.rotation.z = (tuft - 1) * 0.3
      }
      if (x < 0 && index % 3 === 0) {
        this.oval(this.scene, '#e8c59d', x + 0.7, 0.35, z, 0.22, 0.12, 0.22)
        this.mesh(this.scene, new THREE.CylinderGeometry(0.04, 0.06, 0.3, 6), '#eee0ba', x + 0.7, 0.15, z)
      }
    }
    for (const [x, z] of GRASS_PATCHES) {
      const patch = this.mesh(this.scene, new THREE.CircleGeometry(3.2, 40), '#698747', x, 0.02, z)
      patch.rotation.x = -Math.PI / 2
      for (let index = 0; index < 26; index++) {
        const angle = index * 2.399
        const radius = Math.sqrt(this.random(index + x)) * 2.9
        const reed = new THREE.Group()
        reed.position.set(x + Math.cos(angle) * radius, 0, z + Math.sin(angle) * radius)
        this.scene.add(reed)
        for (let blade = 0; blade < 3; blade++) {
          const leaf = this.mesh(
            reed,
            new THREE.ConeGeometry(0.09, 0.85 + this.random(index) * 0.4, 3),
            ['#749a51', '#93b966', '#b6c979'][blade],
            blade * 0.09,
            0.45,
            0
          )
          leaf.rotation.z = (blade - 1) * 0.3
        }
        this.reeds.push(reed)
      }
    }
    for (const [x, z] of SAND_PATCHES) {
      const pit = this.mesh(this.scene, new THREE.CircleGeometry(2.4, 32), '#e2c48e', x, 0.024, z)
      pit.rotation.x = -Math.PI / 2
      for (let index = 0; index < 6; index++)
        this.mesh(
          this.scene,
          new THREE.DodecahedronGeometry(0.08 + this.random(index + x) * 0.08),
          '#c9a874',
          x + Math.cos(index * 1.7) * 2.1,
          0.05,
          z + Math.sin(index * 1.7) * 2.1
        )
    }
    const burrow = new THREE.Group()
    burrow.position.set(-37, 0, -3)
    this.scene.add(burrow)
    this.cameraObstacles.push(burrow)
    this.oval(burrow, '#9ba66c', 0, 0, -0.65, 3, 1.65, 2.4)
    this.oval(burrow, '#463e35', 0, 0.52, 1.35, 1.1, 0.8, 0.12)
    const arch = this.mesh(burrow, new THREE.TorusGeometry(1.08, 0.16, 6, 18, Math.PI), '#bca579', 0, 0.45, 1.5)
    arch.rotation.z = 0
    for (const side of [-1, 1]) {
      this.mesh(burrow, new THREE.CylinderGeometry(0.06, 0.08, 2, 6), '#82634a', side * 1.8, 1, 1.4)
      this.oval(burrow, '#f3cd72', side * 1.8, 1.8, 1.4, 0.22, 0.3, 0.22)
    }
    const cave = new THREE.Group()
    cave.position.set(27, 0, -20)
    this.scene.add(cave)
    this.cameraObstacles.push(cave)
    this.oval(cave, '#514e50', 0, 1.2, -0.6, 3.8, 2.8, 1.7)
    this.oval(cave, '#292d36', 0, 1.1, 1.08, 1.85, 1.55, 0.08)
    for (let index = 0; index < 9; index++) {
      const angle = (index / 8) * Math.PI
      const rock = this.mesh(
        cave,
        new THREE.DodecahedronGeometry(0.9),
        '#9a9180',
        Math.cos(angle) * 2.5,
        Math.sin(angle) * 2.8,
        1
      )
      rock.rotation.z = angle
    }
    for (let index = 0; index < 8; index++) {
      const crystal = this.mesh(cave, new THREE.ConeGeometry(0.16, 0.8, 5), '#a7ccbf', -2.3 + index * 0.66, 0.3, 1.8)
      crystal.rotation.z = (this.random(index) - 0.5) * 0.8
    }
  }

  private character(kind: string): Actor {
    if (kind === 'rabbit') return this.rabbit()
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    const actor: Actor = {
      root,
      body,
      limbs: [],
      ears: [],
      kind,
      x: NaN,
      z: NaN,
      moving: 0,
      alertAt: -Infinity
    }
    const color =
      (
        {
          fox: '#d77a3e',
          wolf: '#7f94a4',
          hawk: '#987052',
          snake: '#8baf57',
          crocodile: '#668c70'
        } as Record<string, string>
      )[kind] || '#987052'
    if (kind === 'snake') {
      let parent = body
      for (let index = 0; index < 10; index++) {
        const joint = new THREE.Group()
        joint.position.z = index === 0 ? 0 : -0.25
        parent.add(joint)
        this.oval(joint, color, 0, 0.23, 0, 0.24 * (1 - index * 0.05), 0.2, 0.25)
        actor.limbs.push(joint)
        parent = joint
      }
    } else {
      this.oval(body, color, 0, kind === 'hawk' ? 0.6 : 0.65, 0, 0.52, kind === 'crocodile' ? 0.3 : 0.5, 0.95)
      if (kind === 'hawk') {
        for (const side of [-1, 1]) {
          const wing = new THREE.Group()
          wing.position.set(side * 0.32, 0.7, 0)
          body.add(wing)
          for (let feather = 0; feather < 5; feather++)
            this.oval(
              wing,
              feather % 2 ? '#654f45' : color,
              side * (0.3 + feather * 0.2),
              0,
              -feather * 0.1,
              0.4,
              0.09,
              0.65
            )
          actor.limbs.push(wing)
        }
      } else {
        for (const side of [-1, 1])
          for (const end of [-1, 1]) {
            const leg = new THREE.Group()
            leg.position.set(side * 0.34, 0.48, end * 0.55)
            body.add(leg)
            this.oval(leg, color, 0, -0.2, 0.08, 0.16, 0.28, 0.23)
            actor.limbs.push(leg)
          }
      }
      const tail = new THREE.Group()
      tail.position.set(0, 0.6, -0.6)
      body.add(tail)
      this.oval(tail, kind === 'fox' ? '#f4e8d1' : color, 0, 0, -0.5, 0.25, 0.23, 0.8)
      actor.tail = tail
    }
    const headHeight = kind === 'hawk' ? 1 : kind === 'snake' ? 0.27 : kind === 'crocodile' ? 0.45 : 0.95
    const headZ = kind === 'snake' ? 0.2 : 0.75
    this.oval(body, color, 0, headHeight, headZ, 0.36, 0.35, 0.39)
    if (kind === 'crocodile') this.oval(body, '#99ab76', 0, headHeight - 0.1, 1.2, 0.33, 0.18, 0.65)
    if (kind === 'fox' || kind === 'wolf') this.oval(body, '#e6ddc6', 0, headHeight - 0.12, 1.04, 0.23, 0.19, 0.36)
    for (const side of [-1, 1]) {
      this.oval(body, '#23353b', side * 0.23, headHeight + 0.08, headZ + 0.27, 0.065, 0.08, 0.045)
      this.oval(body, '#ffffff', side * 0.23 - 0.012, headHeight + 0.105, headZ + 0.31, 0.018, 0.023, 0.012)
      if (kind === 'fox' || kind === 'wolf') {
        const ear = new THREE.Group()
        ear.position.set(side * 0.2, headHeight + 0.23, headZ - 0.05)
        ear.rotation.z = -side * 0.18
        body.add(ear)
        this.oval(ear, color, 0, 0.2, 0, 0.13, 0.25, 0.12)
        this.oval(ear, '#d89d9b', 0, 0.21, 0.09, 0.065, 0.13, 0.035)
        actor.ears.push(ear)
      }
    }
    if (kind === 'hawk') {
      const beak = this.mesh(body, new THREE.ConeGeometry(0.15, 0.4, 5), '#e6b553', 0, headHeight - 0.05, 1.1)
      beak.rotation.x = Math.PI / 2
    } else
      this.oval(
        body,
        '#344342',
        0,
        headHeight - 0.05,
        kind === 'fox' || kind === 'wolf' ? 1.35 : headZ + 0.36,
        0.08,
        0.055,
        0.06
      )
    if (kind !== 'rabbit') {
      const sprite = (texture: THREE.Texture | null, color: string) => {
        const material = new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthTest: false })
        const result = new THREE.Sprite(material)
        result.renderOrder = 10
        result.visible = false
        root.add(result)
        return result
      }
      actor.marker = {
        symbol: sprite(this.markerTexture('?', '#e0a020'), '#ffffff'),
        meter: sprite(null, '#3b3326'),
        fill: sprite(null, '#f2b531')
      }
    }
    this.scene.add(root)
    return actor
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
      scale = since < 0.15 ? 0.3 + (since / 0.15) * 1.3 : since < 0.4 ? 1.6 - ((since - 0.15) / 0.25) * 0.5 : 1.1
      if (since > 1.6) scale = 0.8
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
    actor.body.position.y =
      actor.kind === 'hawk'
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
      if (actor.kind === 'hawk') limb.rotation.z = Math.sin(time * 7) * 0.55 * (index === 0 ? -1 : 1)
      else if (actor.kind === 'snake') limb.rotation.y = Math.sin(time * 5 - index * 0.65) * 0.24
      else if (jumping) limb.rotation.x = index % 2 === 0 ? 0.85 : -0.65
      else limb.rotation.x = Math.sin(cycle + (index === 0 || index === 3 ? 0 : Math.PI)) * moving * 0.55
    })
    actor.ears.forEach((ear, index) => {
      ear.rotation.x = jumping ? -0.55 : Math.sin(time * 3 + index) * 0.06 - moving * 0.25
    })
    if (actor.tail) actor.tail.rotation.y = jumping ? 0 : Math.sin(time * 5) * 0.2
  }

  private item(key: string, nest: boolean, kind: FoodKind = 'carrot'): THREE.Group {
    let item = this.items.get(key)
    if (item) return item
    item = new THREE.Group()
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

  render(state: RabbitersSceneState, localPlayerId: string, dt: number): void {
    if (this.disposed) return
    const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0
    this.clock += elapsed
    // Guests get rolling droppings at ~10 Hz, so they glide between snapshots.
    const follow = 1 - Math.exp(-elapsed * 12)
    const liveActors = new Set<string>()
    for (const entity of [
      ...state.players.map((player) => ({ ...player, kind: 'rabbit', key: `player:${player.id}` })),
      ...state.predators.map((predator) => ({
        ...predator,
        hidden: false,
        downed: false,
        pregnant: false,
        key: `predator:${predator.id}`
      }))
    ]) {
      liveActors.add(entity.key)
      let actor = this.actors.get(entity.key)
      if (!actor) {
        actor = this.character(entity.kind)
        this.actors.set(entity.key, actor)
      }
      const distance = Math.hypot(entity.x - actor.x, entity.z - actor.z)
      actor.moving = elapsed > 0 && Number.isFinite(distance) ? Math.min(1, distance / elapsed / 3) : 0
      actor.x = entity.x
      actor.z = entity.z
      actor.root.position.set(entity.x, entity.y, entity.z)
      actor.root.rotation.y = entity.angle
      actor.root.scale.setScalar(entity.hidden ? 0.8 : 1)
      if (actor.belly) actor.belly.visible = entity.pregnant === true
      this.animate(
        actor,
        state.time,
        actor.moving,
        entity.downed,
        entity.y > 0.06,
        'bath' in entity ? (entity.bath ?? 0) : 0
      )
      if ('suspicion' in entity)
        this.updateMarker(actor, entity.state, entity.suspicion ?? 0, entity.kind === 'snake' ? 1.4 : 2.3)
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
      item.visible = food.active
      item.position.set(food.x, food.y + Math.sin(state.time * 2 + food.x) * 0.035, food.z)
    }
    for (const nest of state.nests) {
      const key = `nest:${nest.id}`
      liveItems.add(key)
      const item = this.item(key, true)
      item.visible = nest.active
      item.position.set(nest.x, nest.y, nest.z)
    }
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
    if (local) this.target.lerp(new THREE.Vector3(local.x, Math.max(0, local.y), local.z), smoothing)
    const narrow = this.camera.aspect < 0.8
    const distance = narrow ? 8.5 : 7.5
    const desired = new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * distance,
      this.target.y + (narrow ? 4 : 3.4),
      this.target.z + Math.cos(this.yaw) * distance
    )
    const focus = this.target.clone().add(new THREE.Vector3(0, 1, 0))
    const ray = desired.clone().sub(focus)
    this.cameraRay.set(focus, ray.clone().normalize())
    this.cameraRay.far = ray.length()
    const obstruction = this.cameraRay.intersectObjects(this.cameraObstacles, true)[0]
    if (obstruction) desired.copy(focus).addScaledVector(ray.normalize(), Math.max(1.5, obstruction.distance - 0.35))
    this.camera.position.lerp(desired, smoothing)
    this.camera.lookAt(focus)
    this.reeds.forEach((reed, index) => {
      reed.rotation.z = Math.sin(state.time * 1.5 + index) * 0.07
    })
    this.water.position.y = 0.035 + Math.sin(state.time * 1.3) * 0.008
    this.renderer.render(this.scene, this.camera)
  }

  orbit(deltaRadians: number): void {
    if (Number.isFinite(deltaRadians)) this.yaw += deltaRadians
  }

  resize(): void {
    if (this.disposed) return
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private release(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && this.geometries.delete(object.geometry)) object.geometry.dispose()
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
    this.materials.forEach((material) => material.dispose())
    this.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose()
    })
    this.geometries.clear()
    this.materials.clear()
    this.actors.clear()
    this.items.clear()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.scene.clear()
  }
}
