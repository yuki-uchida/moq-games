import * as THREE from 'three'
import { ModelAssetCache } from '../../tower_diffence_with_jev/src/rendering/ModelAssetCache'
import { ModelUnitVisual, type UnitModelDefinition } from '../../tower_diffence_with_jev/src/rendering/ModelUnitVisual'
import { ModelEnvironmentLighting } from '../../tower_diffence_with_jev/src/rendering/ModelEnvironmentLighting'
import { UNIT_MODEL_CATALOG } from '../../tower_diffence_with_jev/src/rendering/models/catalog'
import type { UnitType } from '../../tower_diffence_with_jev/src/game/model'
import { finished, size, type Game, type Unit } from './game'
import { reducedMotion } from './settings'

export type Point = { x: number; y: number }
export type Track =
  | { motion: 'walk'; start: number; ms: number; from: Point; to: Point; cycle: number }
  | { motion: 'attack' | 'heal'; start: number; ms: number; clipMs: number }
  | { motion: 'hit' | 'death'; start: number; ms: number; push: Point }
type Actor = {
  id: string
  role: string
  visual: ModelUnitVisual
  ring: THREE.Mesh
  aura: THREE.Mesh
  shadow: THREE.Mesh
  at: Point
  facing: Point
  phase: number
  track?: Track
  dim: boolean
  boss: boolean
}

export const ROLES = ['soldier', 'archer', 'mage', 'goblin', 'wolf'] as const
export const chapterRoles = (game: Game) => [...new Set(game.units.map((unit) => unit.role))]
/** Model gameplay pixels (≈128 per figure) → tiles. */
const MODEL_SIZE = 2.3 / 128
const roleScales: Record<string, number> = {
  soldier: 1,
  archer: 1,
  mage: 1,
  healer: 1,
  goblin: 1,
  wolf: 0.85,
  slime: 0.45,
  bat: 0.7,
  beetle: 0.75,
  wraith: 1,
  shaman: 0.7,
  ogre: 0.8,
  dragon: 1
}
export const roleScale = (role: string) => roleScales[role] ?? 1
const FALL_SECONDS = 0.82
const definitions = new Map<string, UnitModelDefinition>()
/** Upright in the board's own Y-up world (the catalog tilts models into a flat 2D board view), and only
 * the motions this game plays, so background rig preparation never requests other clips. */
function definition(role: string) {
  let value = definitions.get(role)
  if (!value) {
    const { clips, ...base } = UNIT_MODEL_CATALOG[role as UnitType]!
    value = {
      ...base,
      viewElevation: Math.PI / 2,
      clips: {
        idle: clips.idle,
        walk: clips.walk,
        ...(role === 'healer' ? { heal: clips.heal } : { attack: clips.attack })
      }
    }
    definitions.set(role, value)
  }
  return value
}
/** Resting units face across the field, three-quarters toward the camera (as the former portraits did). */
const rest = (u: Pick<Unit, 'side'>): Point => (u.side === 'ally' ? { x: -0.5, y: 1 } : { x: -1, y: 0.5 })
/** Grid cell → world: X along grid x, Z along grid y, one unit per tile, origin at the board centre. */
export const world = (p: Point, height = 0) => new THREE.Vector3(p.x - (size - 1) / 2, height, p.y - (size - 1) / 2)

function blob() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, '#000000b0')
  gradient.addColorStop(0.55, '#00000060')
  gradient.addColorStop(1, '#00000000')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

/**
 * Everything that stands on the field — units, groves, rocks, contact shadows, selection rings and
 * projectiles — in one depth-tested WebGL layer. Its orthographic camera reproduces the CSS floor
 * projection (rotate −45°, squash by --tilt) exactly, so the DOM floor and tile buttons below stay
 * the source of terrain texture, lighting, range tints and all input.
 */
export class Stage {
  readonly canvas = document.createElement('canvas')
  readonly renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50)
  readonly cache = new ModelAssetCache(undefined, Infinity)
  private actors = new Map<string, Actor>()
  /** The catalog's tilted 2D-board basis (x, y-down, z) re-mapped to Y-up world (x, z, y). */
  private units = new THREE.Group()
  private terrain = new THREE.Group()
  private terrainKey = ''
  private shared = {
    shadow: new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false }),
    plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    ring: new THREE.RingGeometry(0.27, 0.31, 48).rotateX(-Math.PI / 2),
    rings: {
      ally: new THREE.MeshBasicMaterial({ color: 0x82d1ed, transparent: true, opacity: 0.7, depthWrite: false }),
      enemy: new THREE.MeshBasicMaterial({ color: 0xe0957b, transparent: true, opacity: 0.7, depthWrite: false }),
      boss: new THREE.MeshBasicMaterial({ color: 0xffbc48, transparent: true, opacity: 0.9, depthWrite: false }),
      selected: new THREE.MeshBasicMaterial({ color: 0xffdf7d, depthWrite: false })
    }
  }
  private last?: { game: Game; selected?: string }
  private layout = { width: 1, height: 1, tile: 1 }
  /** Narrow screens draw figures relatively larger (as the former sprites did) so they stay readable. */
  figure = 1
  private frame = 0
  projectiles = new Set<THREE.Object3D>()

  constructor(
    private field: HTMLElement,
    private board: HTMLElement
  ) {
    // Reachable from the page for browser verification (`document.querySelector('.stage').stage`).
    Object.assign(this.canvas, { stage: this })
    this.canvas.className = 'stage'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.canvas.dataset.motion = ''
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setClearColor(0, 0)
    new ModelEnvironmentLighting(this.scene, 0.7).ensure(this.renderer)
    // Moonlit sky over dark moss, a cool key from the far-left (as the tile bevels) and the lantern glow on the ally flank.
    this.scene.add(new THREE.HemisphereLight(0xc4dcff, 0x3a4a30, 2.2))
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6)
    key.position.copy(world({ x: -3, y: -1 }, 7))
    this.scene.add(key)
    const lantern = new THREE.PointLight(0xffa04a, 9, 7, 1.4)
    lantern.position.copy(world({ x: 1.5, y: 5 }, 1.6))
    this.scene.add(lantern)
    this.units.matrixAutoUpdate = false
    this.units.matrix.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1)
    this.terrain.name = 'terrain'
    this.scene.add(this.units, this.terrain)
    field.append(this.canvas)
    new ResizeObserver(() => this.resize()).observe(field)
    this.resize()
    const loop = () => {
      requestAnimationFrame(loop)
      this.draw()
    }
    requestAnimationFrame(loop)
  }

  /** Match the CSS floor: elevation asin(--tilt), 45° azimuth, 1 world unit = one unprojected tile. */
  resize() {
    const field = this.field.getBoundingClientRect(),
      board = this.board.getBoundingClientRect(),
      tilt = Number.parseFloat(getComputedStyle(this.field).getPropertyValue('--tilt')) || 0.6,
      tile = this.board.offsetWidth / size
    if (!field.width || !tile) return
    const cx = board.left - field.left + board.width / 2,
      cy = board.top - field.top + board.height / 2,
      elevation = Math.asin(tilt)
    this.layout = { width: field.width, height: field.height, tile }
    const figure = Math.min(1.35, Math.max(1, 60 / tile))
    if (figure !== this.figure) {
      this.figure = figure
      for (const actor of this.actors.values())
        actor.visual.setPresentation(MODEL_SIZE * figure * roleScale(actor.role) * (actor.boss ? 1.25 : 1), 1)
    }
    this.field.style.setProperty('--figure', String(figure))
    this.renderer.setSize(field.width, field.height)
    Object.assign(this.camera, {
      left: -cx / tile,
      right: (field.width - cx) / tile,
      top: cy / tile,
      bottom: -(field.height - cy) / tile
    })
    this.camera.position.set(-Math.cos(elevation) / Math.SQRT2, Math.sin(elevation), Math.cos(elevation) / Math.SQRT2)
    this.camera.position.multiplyScalar(20)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.draw(true)
  }

  /** Field-pixel position of a world point, for DOM overlays (damage numbers, contact sparks). */
  screen(point: THREE.Vector3) {
    const v = point.clone().project(this.camera)
    return { x: ((v.x + 1) / 2) * this.layout.width, y: ((1 - v.y) / 2) * this.layout.height }
  }

  /** Required sources for every role: resolves once decoded, rejects if any failed (retry re-requests only those). */
  load(roles: string[], progress: (done: number, total: number) => void) {
    this.cache.retryFailed()
    const specs = roles.flatMap((role) => Object.values(definition(role).clips).filter((clip) => clip !== undefined))
    return new Promise<void>((resolve, reject) => {
      const poll = () => {
        const states = specs.map((spec) => this.cache.requestSource(spec))
        const settled = states.filter((s) => s === 'ready' || s === 'error').length
        progress(states.filter((s) => s === 'ready').length, specs.length)
        if (settled < specs.length) setTimeout(poll, 50)
        else if (states.includes('error')) reject(new Error('3D model load failed'))
        else resolve()
      }
      poll()
    })
  }

  /** Rocks and groves for the current mission; shared geometry/materials, rebuilt only on a layout change. */
  private build(game: Game) {
    const key = game.stage + '|' + [...game.rocks].join(';') + '|' + [...game.groves].join(';')
    if (key === this.terrainKey) return
    this.terrainKey = key
    this.terrain.clear()
    for (const k of game.rocks) {
      const obstacle = this.place(Props.rock(game.stage, k), k)
      obstacle.name = 'impassable-prop'
      obstacle.userData.cell = k
      this.terrain.add(obstacle)
    }
    for (const k of game.groves) if (!game.rocks.has(k)) this.terrain.add(this.place(Props.grove(), k))
  }
  private place(object: THREE.Object3D, k: string) {
    const [x, y] = k.split(',').map(Number)
    object.position.copy(world({ x, y }))
    // Contact shadow, offset away from the far-left key light.
    const shadow = new THREE.Mesh(this.shared.plane, this.shared.shadow)
    shadow.scale.set(1.05, 1, 0.95)
    shadow.position.set(0.08, 0.003, 0.08)
    shadow.renderOrder = -1
    object.add(shadow)
    return object
  }

  private actor(u: Unit) {
    let actor = this.actors.get(u.id)
    if (actor && actor.visual.definition !== definition(u.role)) {
      this.remove(actor)
      actor = undefined
    }
    if (!actor) {
      const visual = new ModelUnitVisual(definition(u.role), this.cache)
      visual.setPresentation(MODEL_SIZE * this.figure * roleScale(u.role) * (u.boss ? 1.25 : 1), 1)
      const shadow = new THREE.Mesh(this.shared.plane, this.shared.shadow)
      shadow.scale.setScalar(0.62)
      const ring = new THREE.Mesh(this.shared.ring, this.shared.rings[u.side])
      const aura = new THREE.Mesh(this.shared.ring, this.shared.rings.boss)
      aura.name = 'boss-aura'
      aura.scale.setScalar(1.65)
      shadow.renderOrder = ring.renderOrder = aura.renderOrder = -1
      this.units.add(visual.root)
      this.scene.add(shadow, ring, aura)
      actor = {
        id: u.id,
        role: u.role,
        visual,
        ring,
        aura,
        shadow,
        at: { x: u.x, y: u.y },
        facing: rest(u),
        phase: Math.random() * 4,
        dim: false,
        boss: !!u.boss
      }
      this.actors.set(u.id, actor)
      void this.warm(visual)
    }
    return actor
  }
  /** Acquire and compile the walk/attack rigs ahead of the first action. */
  private async warm(visual: ModelUnitVisual) {
    const compile = (scene: THREE.Object3D) => this.renderer.compileAsync(scene, this.camera, this.scene)
    for (let job = visual.prepareNextMotion(compile); job; job = visual.prepareNextMotion(compile)) await job
  }
  private remove(actor: Actor) {
    actor.visual.dispose()
    actor.ring.removeFromParent()
    actor.aura.removeFromParent()
    actor.shadow.removeFromParent()
    this.actors.delete(actor.id)
  }

  /** Mirror the logical state; actors in a presentation keep their animated pose until it releases them. */
  sync(game: Game, selected?: string) {
    this.last = { game, selected }
    this.build(game)
    const alive = new Set<string>()
    for (const u of game.units) {
      if (u.hp <= 0) continue
      alive.add(u.id)
      const actor = this.actor(u)
      if (actor.boss !== !!u.boss) {
        actor.boss = !!u.boss
        actor.visual.setPresentation(MODEL_SIZE * this.figure * roleScale(actor.role) * (actor.boss ? 1.25 : 1), 1)
      }
      actor.ring.material = u.id === selected ? this.shared.rings.selected : this.shared.rings[u.side]
      actor.dim = finished(game, u)
      if (!actor.track) {
        actor.at = { x: u.x, y: u.y }
        actor.facing = rest(u)
      }
    }
    for (const actor of [...this.actors.values()]) if (!alive.has(actor.id) && !actor.track) this.remove(actor)
  }
  /** End every presentation track and return to the logical state. */
  release() {
    for (const actor of this.actors.values()) actor.track = undefined
    for (const p of this.projectiles) p.removeFromParent()
    this.projectiles.clear()
    if (this.last) this.sync(this.last.game, this.last.selected)
  }
  get(id: string) {
    return this.actors.get(id)
  }

  /** Authored release point (bow string, staff tip) at the attack's contact frame, if the model has one. */
  emitter(id: string, contactMs: number) {
    const actor = this.actors.get(id)!
    return actor.visual.emitterAt({
      motion: 'attack',
      seconds: contactMs / 1000,
      loop: false,
      facingX: actor.facing.x,
      facingY: actor.facing.y,
      boss: false
    })
  }

  /** Small active-motion summary for tests and diagnostics. */
  diagnostics() {
    return [...this.actors.values()].map((a) => ({
      id: a.id,
      role: a.role,
      at: a.at,
      track: a.track?.motion ?? 'idle',
      ...a.visual.diagnostics()
    }))
  }

  draw(force = false) {
    const busy = [...this.actors.values()].some((a) => a.track) || this.projectiles.size > 0
    // Idle breathing renders at half rate; presentations at full rate.
    if (!force && !busy && this.frame++ % 2) return
    const now = performance.now(),
      reduced = reducedMotion()
    const motions = new Set<string>()
    for (const actor of this.actors.values()) {
      const track = actor.track,
        t = track ? Math.max(0, Math.min(1, (now - track.start) / track.ms)) : 0
      let at = actor.at,
        opacity = 1,
        tint = actor.role === 'slime' ? (actor.dim ? 0x575039 : 0xb8aa78) : actor.dim ? 0x777777 : 0xffffff
      const pose = { facingX: actor.facing.x, facingY: actor.facing.y, boss: false, time: now / 1000 }
      if (track) motions.add(track.motion)
      if (track?.motion === 'walk') {
        at = { x: track.from.x + (track.to.x - track.from.x) * t, y: track.from.y + (track.to.y - track.from.y) * t }
        actor.visual.sample({ ...pose, motion: 'walk', seconds: 0, cycle: track.cycle + t, loop: true })
      } else if (track?.motion === 'attack' || track?.motion === 'heal') {
        actor.visual.sample({ ...pose, motion: track.motion, seconds: (t * track.clipMs) / 1000, loop: false })
      } else if (track?.motion === 'death') {
        actor.visual.sampleAllyDeath(t * FALL_SECONDS, pose)
        opacity = 1 - t * t
        if (t < 0.3) tint = 0xffc8b8
      } else {
        // Hit: hold the struck pose, then recoil back through the cell (anatomy unchanged).
        const k =
          track?.motion === 'hit'
            ? t < 0.4
              ? 1
              : t < 0.65
                ? 1 - ((t - 0.4) / 0.25) * 1.4
                : -0.4 * (1 - (t - 0.65) / 0.35)
            : 0
        if (track?.motion === 'hit') {
          at = { x: at.x + track.push.x * 0.08 * k, y: at.y + track.push.y * 0.08 * k }
          if (t < 0.4) tint = 0xffc8b8
        }
        actor.visual.sample({ ...pose, motion: 'idle', seconds: reduced ? 0 : now / 1000 + actor.phase, loop: true })
      }
      const position = world(at)
      actor.visual.root.matrix.setPosition(position.x, position.z, 0)
      actor.visual.root.matrixWorldNeedsUpdate = true
      actor.visual.setAppearance(opacity, tint)
      actor.shadow.position.set(position.x, 0.002, position.z)
      actor.ring.position.set(position.x, 0.004, position.z)
      actor.aura.position.set(position.x, 0.006, position.z)
      actor.aura.visible = actor.boss && opacity > 0.5
      actor.ring.visible = actor.shadow.visible = opacity > 0.5
    }
    for (const p of this.projectiles) p.userData.update?.(now)
    this.canvas.dataset.motion = [...motions].sort().join(' ')
    this.canvas.dataset.projectile = [...this.projectiles].map((p) => p.name).join(' ')
    this.renderer.render(this.scene, this.camera)
  }

  /** Arrow or spell flying from `from` to `to` over ms (positions are time-based; rAF only renders). */
  shoot(kind: 'arrow' | 'spell' | 'fireball', from: THREE.Vector3, to: THREE.Vector3, ms: number) {
    const object = kind === 'arrow' ? Props.arrow() : Props.spell(kind === 'fireball')
    object.name = kind
    const start = performance.now()
    object.userData.update = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      object.position.lerpVectors(from, to, t)
      // A shallow arc for arrows; spells fly straight.
      if (kind === 'arrow') object.position.y += Math.sin(Math.PI * t) * 0.12 * from.distanceTo(to)
      object.lookAt(to)
      if (kind !== 'arrow') object.rotation.z = now / 90
    }
    object.userData.update(start)
    this.scene.add(object)
    this.projectiles.add(object)
    return () => {
      object.removeFromParent()
      this.projectiles.delete(object)
    }
  }

  /** One idle pose for the chapter report, rendered at 128×112 and cached as an image URL. */
  private portraits = new Map<string, string>()
  portrait(role: string) {
    let url = this.portraits.get(role)
    if (url) return url
    const camera = new THREE.OrthographicCamera(-0.62, 0.62, 1.0, -0.08, -50, 50)
    camera.position.set(-0.8 / Math.SQRT2, 0.6, 0.8 / Math.SQRT2).multiplyScalar(20)
    camera.lookAt(0, 0, 0)
    const scene = new THREE.Scene()
    scene.environment = this.scene.environment
    scene.environmentIntensity = this.scene.environmentIntensity
    for (const light of this.scene.children) if (light instanceof THREE.Light) scene.add(light.clone())
    const basis = this.units.clone(false)
    const visual = new ModelUnitVisual(definition(role), this.cache)
    visual.setPresentation(MODEL_SIZE, 1)
    visual.root.matrix.setPosition(0, 0, 0)
    basis.add(visual.root)
    scene.add(basis)
    if (!visual.sample({ motion: 'idle', seconds: 0, loop: true, facingX: -1, facingY: 1, boss: false })) return ''
    const target = new THREE.WebGLRenderTarget(256, 224, { colorSpace: THREE.SRGBColorSpace })
    this.renderer.setRenderTarget(target)
    this.renderer.setClearColor(0, 0)
    this.renderer.clear()
    this.renderer.render(scene, camera)
    const pixels = new Uint8Array(256 * 224 * 4)
    this.renderer.readRenderTargetPixels(target, 0, 0, 256, 224, pixels)
    this.renderer.setRenderTarget(null)
    target.dispose()
    visual.dispose()
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 224
    const image = new ImageData(256, 224)
    // Render targets are bottom-up.
    for (let row = 0; row < 224; row++)
      image.data.set(pixels.subarray((223 - row) * 256 * 4, (224 - row) * 256 * 4), row * 256 * 4)
    canvas.getContext('2d')!.putImageData(image, 0, 0)
    url = canvas.toDataURL()
    this.portraits.set(role, url)
    return url
  }
}

/** Procedural low-poly props; geometry and materials are shared by every instance. */
const Props = (() => {
  const flat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra })
  const m = {
    trunk: flat(0x3a2618),
    needles: [flat(0x2f5f3d), flat(0x3f7a4b), flat(0x58925a)],
    bush: [flat(0x24452f), flat(0x3d6e45)],
    rock: [flat(0x66544b), flat(0x495d65), flat(0x65615d), flat(0x4c6961), flat(0x88847b), flat(0x302a30)],
    ruin: flat(0x65615d),
    ruinTop: flat(0x817971),
    moss: flat(0x6d7d5a),
    ember: new THREE.MeshBasicMaterial({ color: 0xff9a4a }),
    shaft: new THREE.MeshBasicMaterial({ color: 0xfff2bd }),
    tip: new THREE.MeshBasicMaterial({ color: 0x8a6a40 }),
    spell: new THREE.MeshBasicMaterial({ color: 0xe8d4ff }),
    glow: new THREE.MeshBasicMaterial({
      color: 0xc58fff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff6b19 })
  }
  const g = {
    trunk: new THREE.CylinderGeometry(0.025, 0.035, 0.14, 6).translate(0, 0.07, 0),
    tiers: [
      new THREE.ConeGeometry(0.2, 0.34, 7).translate(0, 0.27, 0),
      new THREE.ConeGeometry(0.15, 0.3, 7).translate(0, 0.45, 0),
      new THREE.ConeGeometry(0.09, 0.22, 7).translate(0, 0.62, 0)
    ],
    bush: new THREE.IcosahedronGeometry(0.075, 0),
    reed: new THREE.CylinderGeometry(0.012, 0.016, 0.48, 5).translate(0, 0.24, 0),
    pillar: new THREE.CylinderGeometry(0.12, 0.15, 0.7, 6).translate(0, 0.35, 0),
    gravestone: new THREE.BoxGeometry(0.38, 0.55, 0.13).translate(0, 0.275, 0),
    capital: new THREE.BoxGeometry(0.35, 0.1, 0.35).translate(0, 0.73, 0),
    flame: new THREE.ConeGeometry(0.12, 0.28, 5).translate(0, 0.68, 0),
    rock: (() => {
      // Deterministic faceted boulder: an icosahedron with a few pulled vertices, flat-shaded.
      const rock = new THREE.IcosahedronGeometry(0.3, 0)
      const p = rock.getAttribute('position')
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i),
          n = 1 + 0.16 * Math.sin(x * 9.1 + z * 5.3) + 0.1 * Math.cos(y * 7.7)
        p.setXYZ(i, x * n, Math.max(-0.05, y * 0.95 * n) + 0.2, z * n * 0.92)
      }
      rock.computeVertexNormals()
      return rock
    })(),
    wall: new THREE.BoxGeometry(0.72, 0.31, 0.62).translate(0, 0.155, 0),
    wallTop: new THREE.BoxGeometry(0.42, 0.17, 0.45).translate(0.1, 0.395, -0.05),
    crack: new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.1, 0.36, 0.2),
        new THREE.Vector3(-0.04, 0.25, 0.25),
        new THREE.Vector3(-0.07, 0.12, 0.24)
      ]),
      12,
      0.009,
      4
    ),
    shaft: new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4).rotateX(Math.PI / 2),
    tip: new THREE.ConeGeometry(0.022, 0.06, 4).rotateX(Math.PI / 2).translate(0, 0, 0.17),
    orb: new THREE.IcosahedronGeometry(0.06, 1),
    halo: new THREE.IcosahedronGeometry(0.12, 1)
  }
  const tree = (x: number, z: number, s: number) => {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(g.trunk, m.trunk))
    g.tiers.forEach((tier, i) => group.add(new THREE.Mesh(tier, m.needles[i])))
    group.position.set(x, 0, z)
    group.scale.setScalar(s)
    group.rotation.y = x * 7
    return group
  }
  const bush = (x: number, z: number) => {
    const group = new THREE.Group()
    ;[
      [-0.05, 0.05, 0, 1],
      [0.05, 0.06, 0.01, 1.15],
      [0, 0.1, -0.02, 0.8]
    ].forEach(([bx, by, bz, s], i) => {
      const mesh = new THREE.Mesh(g.bush, m.bush[i % 2])
      mesh.position.set(bx, by, bz)
      mesh.scale.setScalar(s)
      group.add(mesh)
    })
    group.position.set(x, 0, z)
    return group
  }
  return {
    grove() {
      const group = new THREE.Group()
      group.add(tree(0.24, -0.25, 1.15), tree(-0.2, -0.22, 0.9), tree(0.26, 0.14, 0.85), bush(-0.25, -0.2))
      return group
    },
    rock(stage: number, cell: string) {
      const group = new THREE.Group()
      if (stage === 2) {
        const [x, y] = cell.split(',').map(Number)
        const top = new THREE.Mesh(g.wallTop, m.ruinTop)
        top.rotation.y = (((x + y) % 3) - 1) * 0.15
        if ((x + y) % 2) top.scale.x = 0.7
        group.add(new THREE.Mesh(g.wall, m.ruin), top)
        return group
      }
      if (stage >= 3) {
        const [x, y] = cell.split(',').map(Number)
        if (stage === 4) {
          const pillar = (x + y) % 2 === 0
          group.add(new THREE.Mesh(pillar ? g.pillar : g.gravestone, m.ruinTop))
          if (pillar) group.add(new THREE.Mesh(g.capital, m.ruin))
          group.add(new THREE.Mesh(g.wallTop, m.ruin))
          return group
        }
        const mesh = new THREE.Mesh(g.rock, m.rock[stage])
        mesh.scale.set(1.4, 1, 1.4)
        group.add(mesh)
        if (stage === 3) {
          for (const [x, z, tilt] of [
            [-0.28, 0.12, -0.2],
            [0.25, -0.12, 0.15],
            [0.24, 0.2, -0.1]
          ]) {
            const reed = new THREE.Mesh(g.reed, m.moss)
            reed.position.set(x, 0, z)
            reed.rotation.z = tilt
            group.add(reed)
          }
        } else if (stage === 5) {
          const brazier = new THREE.Mesh(g.pillar, m.rock[stage])
          const flame = new THREE.Mesh(g.flame, m.fire)
          brazier.position.set(0.18, 0, -0.12)
          flame.position.copy(brazier.position)
          group.add(brazier, flame)
        }
        return group
      }
      const mesh = new THREE.Mesh(g.rock, m.rock[stage])
      group.scale.setScalar(1.6)
      // The crack faces the camera (toward −X, +Z).
      const crack = new THREE.Mesh(g.crack, m.ember)
      crack.rotation.y = -Math.PI / 4
      group.add(mesh, crack)
      return group
    },
    arrow() {
      const group = new THREE.Group()
      group.add(new THREE.Mesh(g.shaft, m.shaft), new THREE.Mesh(g.tip, m.tip))
      return group
    },
    spell(fire = false) {
      const group = new THREE.Group()
      group.add(new THREE.Mesh(g.orb, fire ? m.fire : m.spell), new THREE.Mesh(g.halo, m.glow))
      return group
    }
  }
})()
