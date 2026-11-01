import * as THREE from 'three'
import {
  CAVES,
  SPAWN,
  TUNNEL_DEPTH,
  blockersNear,
  caveAt,
  clampToTunnel,
  tunnelNearest,
  floorAt,
  heightAt,
  isUnderground,
  logOver,
  logTop
} from './map'
import { WorldView } from './world'
import { buildFood, isFoodKind, type FoodKind } from './food'
import { STEALTH } from './stealth'
import { playerColor } from './game'

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

const UP = new THREE.Vector3(0, 1, 0)

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
  private readonly world: WorldView
  private readonly sun = new THREE.DirectionalLight('#ffe8bc', 3.2)
  private readonly lantern = new THREE.PointLight('#ffd9a0', 0, 9, 1.4)
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
    // The field is 288 × 200 m: fog hides the far edge while hills and landmarks stay readable.
    this.scene.fog = new THREE.Fog('#b8d9d2', 50, 230)
    this.scene.add(new THREE.HemisphereLight('#e8f7f2', '#726442', 2.5))
    const sun = this.sun
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 })
    sun.shadow.normalBias = 0.05
    this.scene.add(sun, sun.target, this.lantern)
    this.world = new WorldView(this.scene)
    this.camera.position.set(SPAWN.x, 3.6, SPAWN.z + 8)
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

  /** White rabbit wearing a collar and bell in the player's colour, so teammates can tell each other apart. */
  private rabbit(color: string): Actor {
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
    const collar = new THREE.Mesh(this.rabbitGeometry.collar, this.smooth(color, 0.6))
    collar.position.set(0, 0.9, 0.34)
    collar.rotation.x = Math.PI / 2 - 0.5
    collar.castShadow = true
    body.add(collar)
    this.part(body, this.smooth(color, 0.25), [0, 0.75, 0.69], [0.095, 0.095, 0.095])
    this.part(body, this.smooth('#fff4c8', 0.3, true), [0.028, 0.78, 0.765], [0.026, 0.026, 0.014])
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

  private character(kind: string, tint = '#ffffff'): Actor {
    if (kind === 'rabbit') return this.rabbit(tint)
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
      }))
    ]) {
      liveActors.add(entity.key)
      let actor = this.actors.get(entity.key)
      if (!actor) {
        actor = this.character(entity.kind, entity.tint)
        this.actors.set(entity.key, actor)
      }
      const distance = Math.hypot(entity.x - actor.x, entity.z - actor.z)
      actor.moving = elapsed > 0 && Number.isFinite(distance) ? Math.min(1, distance / elapsed / 3) : 0
      actor.x = entity.x
      actor.z = entity.z
      actor.root.position.set(entity.x, entity.y, entity.z)
      actor.root.rotation.y = entity.angle
      actor.root.scale.setScalar(entity.hidden ? 0.8 : 1)
      // Far creatures are lost in the fog anyway; skipping them keeps draw calls flat on the big map.
      actor.root.visible = Math.hypot(entity.x - this.target.x, entity.z - this.target.z) < 120
      if (actor.belly) actor.belly.visible = entity.pregnant === true
      this.animate(
        actor,
        state.time,
        actor.moving,
        entity.downed,
        entity.y - floorAt(entity.x, entity.y, entity.z) > 0.06,
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
    const distance = underground ? 2.6 : cave ? 5 : narrow ? 8.5 : 7.5
    const height = underground ? 0.8 : cave ? 2 : narrow ? 4 : 3.4
    const focus = this.target.clone().add(new THREE.Vector3(0, underground ? 0.55 : 1, 0))
    // The boom pivots on the rabbit; underground it runs down the corridor's centreline instead, since a free
    // orbit (or a rabbit brushing the wall) would start the boom inside the earth and collapse it.
    const pivot = focus.clone()
    let backX = Math.sin(this.yaw)
    let backZ = Math.cos(this.yaw)
    if (underground) {
      const lane = tunnelNearest(this.target.x, this.target.z)
      const side = lane.ux * backX + lane.uz * backZ < 0 ? -1 : 1
      pivot.set(lane.x, focus.y, lane.z)
      backX = lane.ux * side
      backZ = lane.uz * side
    }
    const desired = new THREE.Vector3(pivot.x + backX * distance, this.target.y + height, pivot.z + backZ * distance)
    if (underground) desired.y = heightAt(desired.x, desired.z) - TUNNEL_DEPTH + height
    else desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 1)
    // If a trunk, rock or tunnel end blocks the boom, swing it around the rabbit before giving up.
    const full = desired.distanceTo(pivot)
    let reach = pivot.clone()
    for (const swing of underground ? [0, Math.PI] : [0, 0.5, -0.5, 1, -1]) {
      const swung = desired.clone().sub(pivot).applyAxisAngle(UP, swing).add(pivot)
      const candidate = this.boom(pivot, swung, underground, cave, underLog)
      if (candidate.distanceTo(pivot) > reach.distanceTo(pivot)) reach = candidate
      if (reach.distanceTo(pivot) >= full * 0.7) break
    }
    if (reach.distanceTo(focus) < 1.2 && !underground && !cave) reach = desired // a thin post; look through it
    this.camera.position.lerp(reach, smoothing)
    this.keepCameraClear(this.camera.position, underground, cave)
    if (underground || cave) this.camera.lookAt(focus)
    else {
      // Aim a little past the rabbit so the horizon, and landmarks for finding the way, stay in frame.
      const ahead = focus.clone().sub(this.camera.position).setY(0)
      if (ahead.lengthSq() > 0.01) ahead.setLength(6)
      this.camera.lookAt(
        focus
          .clone()
          .add(ahead)
          .add(new THREE.Vector3(0, 0.4, 0))
      )
    }
    this.sun.position.set(this.target.x - 18, this.target.y + 35, this.target.z + 12)
    this.sun.target.position.copy(this.target)
    this.lantern.intensity = underground || cave ? 2.2 : 0
    this.lantern.position.copy(this.target).add(new THREE.Vector3(0, 1.1, 0))
    this.world.update(state.time, underground, underLog)
    this.renderer.render(this.scene, this.camera)
  }

  /** Walks the camera boom out from the rabbit and stops before terrain, rocks, cave or tunnel walls. */
  private boom(
    focus: THREE.Vector3,
    desired: THREE.Vector3,
    underground: boolean,
    cave: (typeof CAVES)[number] | undefined,
    underLog: boolean
  ) {
    const step = desired.clone().sub(focus)
    const steps = Math.ceil(step.length() / 0.2)
    const probe = focus.clone()
    const reach = focus.clone()
    for (let index = 1; index <= steps; index++) {
      probe.copy(focus).addScaledVector(step, index / steps)
      if (this.blocksCamera(probe, underground, cave, underLog)) break
      reach.copy(probe)
    }
    return reach
  }

  private blocksCamera(
    point: THREE.Vector3,
    underground: boolean,
    cave: (typeof CAVES)[number] | undefined,
    underLog: boolean
  ) {
    if (underground) {
      const inside = clampToTunnel(point.x, point.z, 0.35)
      const floor = heightAt(point.x, point.z) - TUNNEL_DEPTH
      return inside.x !== point.x || inside.z !== point.z || point.y < floor + 0.25 || point.y > floor + 1.45
    }
    if (point.y < heightAt(point.x, point.z) + 0.35) return true
    for (const blocker of blockersNear(point.x, point.z))
      if (point.y < blocker.top && Math.hypot(point.x - blocker.x, point.z - blocker.z) < blocker.r + 0.3) return true
    if (cave)
      return Math.hypot(point.x - cave.x, point.z - cave.z) > cave.r - 1 || point.y > cave.floor + cave.roof - 0.8
    for (const dome of CAVES)
      if (
        Math.hypot(point.x - dome.x, point.z - dome.z) < dome.r + dome.wall + 0.4 &&
        point.y < dome.floor + dome.roof + 0.5
      )
        return true
    const log = underLog ? undefined : logOver(point.x, point.z, 0.25)
    return !!log && point.y > log.bottom - 0.2 && point.y < logTop(log) + 0.25
  }

  /** Final guard after smoothing so the camera never sits inside the ground or outside a tunnel/cave. */
  private keepCameraClear(point: THREE.Vector3, underground: boolean, cave: (typeof CAVES)[number] | undefined) {
    if (underground) {
      const inside = clampToTunnel(point.x, point.z, 0.35)
      const floor = heightAt(inside.x, inside.z) - TUNNEL_DEPTH
      point.set(inside.x, Math.min(Math.max(point.y, floor + 0.25), floor + 1.45), inside.z)
      return
    }
    point.y = Math.max(point.y, heightAt(point.x, point.z) + 0.3)
    if (!cave) return
    const dx = point.x - cave.x
    const dz = point.z - cave.z
    const limit = cave.r - 1
    const length = Math.hypot(dx, dz)
    if (length > limit) point.set(cave.x + (dx / length) * limit, point.y, cave.z + (dz / length) * limit)
    point.y = Math.min(point.y, cave.floor + cave.roof - 0.8)
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
    this.world.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.scene.clear()
  }
}
