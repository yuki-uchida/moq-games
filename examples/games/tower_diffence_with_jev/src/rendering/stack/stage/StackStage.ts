import * as THREE from 'three'
import { CONFIG, pointOnPath, type Point } from '../../../game/model'
import { distanceToRoadUnion, type ResolvedBattlefield } from '../../../game/BattlefieldRoutes'
import { fieldScenery, type SceneryItem } from '../../../game/FieldScenery'
import { modelGroundDepth } from '../../BoardCamera'
import type { StackDesign } from '../StackDesign'
import { drawStackPixels, STACK_SPACING, STACK_SQUASH } from '../SliceSheet'
import { stackModel } from '../StackVisual'
import { paintGround } from './ground'
import { castleDesign, denDesign } from './landmarks'
import { BIOME_PROPS, type PropKind } from './props'

interface BakedStaticSprite {
  readonly body: THREE.DataTexture
  readonly shadow: THREE.DataTexture
  readonly width: number
  readonly height: number
  readonly originX: number
  readonly originY: number
}

const staticSpriteCache = new Map<string, BakedStaticSprite>()
const quadGeometry = new THREE.PlaneGeometry(1, 1)

function makeNearestTexture(pixels: Uint8ClampedArray, width: number, height: number, name: string): THREE.DataTexture {
  // Flip rows bottom-up for PlaneGeometry on the scaleY(-1) board canvas so row 0 is at the top.
  const rows = new Uint8Array(pixels.length)
  const stride = width * 4
  for (let j = 0; j < height; j++) {
    rows.set(pixels.subarray(j * stride, (j + 1) * stride), (height - 1 - j) * stride)
  }
  const texture = new THREE.DataTexture(rows, width, height, THREE.RGBAFormat)
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.name = name
  texture.needsUpdate = true
  return texture
}

/**
 * SpriteCook Pitfall #5:
 * Static stacks (trees, rocks, castle, monster den) are drawn ONCE at load time into a crisp
 * outlined + shadowed plain sprite, avoiding per-frame slice loops across dozens of props.
 */
function bakeStaticSprite(design: StackDesign, turn: number): BakedStaticSprite {
  // Quantize static turn to 16 steps so identical prop orientations share one baked texture.
  const step = ((Math.round((turn / (Math.PI * 2)) * 16) % 16) + 16) % 16
  const key = `${design.blueprint.id}:${step}`
  const cached = staticSpriteCache.get(key)
  if (cached) return cached

  const model = stackModel(design)
  const qTurn = (step / 16) * Math.PI * 2
  const rendered = drawStackPixels(model.restSheet, {
    turn: qTurn,
    squash: STACK_SQUASH,
    spacing: STACK_SPACING,
    outline: true,
    shadow: true,
    shadowOffset: [2, 2]
  })
  const entry: BakedStaticSprite = {
    body: makeNearestTexture(rendered.pixels, rendered.width, rendered.height, `static-stack:${key}`),
    shadow: makeNearestTexture(rendered.shadow, rendered.width, rendered.height, `static-shadow:${key}`),
    width: rendered.width,
    height: rendered.height,
    originX: rendered.originX,
    originY: rendered.originY
  }
  staticSpriteCache.set(key, entry)
  return entry
}

interface PlacedStatic {
  readonly design: StackDesign
  readonly root: THREE.Group
  readonly body: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly facing: Point
  readonly seed: number
  readonly sways: boolean
  sprite: BakedStaticSprite
}

function hash(i: number, seed: number): number {
  let h = Math.imul(i + 1, 2654435761) ^ seed
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295
}
const direction = (a: Point, b: Point): Point => {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
}

/** Where scenery goes: the field's own blockers, or a decorated rim around an open board. */
export function stageLayout(field: ResolvedBattlefield): { kind: PropKind; x: number; y: number; scale: number }[] {
  const scenery = fieldScenery(field.id, field.version, field.layoutRevision)
  const kindOf = (item: SceneryItem): PropKind =>
    item.kind === 'tree' || item.kind === 'cactus' ? 'tree' : item.kind === 'rock' ? 'rock' : 'small'
  if (scenery.length) return scenery.map((item) => ({ kind: kindOf(item), x: item.x, y: item.y, scale: item.scale }))
  const placed: { kind: PropKind; x: number; y: number; scale: number }[] = []
  const seed = field.id.length * 977 + field.layoutRevision
  const keep = [field.entrance, field.gate]
  const clear = (point: Point, radius: number) =>
    point.x > 6 &&
    point.x < field.width - 6 &&
    point.y > 10 &&
    point.y < field.height - 4 &&
    distanceToRoadUnion(field, point) > CONFIG.roadWidth / 2 + radius &&
    keep.every((k) => Math.hypot(k.x - point.x, k.y - point.y) > 150) &&
    field.slots.every((slot) => Math.hypot(slot.x - point.x, slot.y - point.y) > 40 + radius) &&
    placed.every((other) => Math.hypot(other.x - point.x, other.y - point.y) > 34)
  let i = 0
  const band = (x: number, y: number) => {
    const roll = hash(i++, seed)
    const kind: PropKind = roll < 0.55 ? 'tree' : roll < 0.78 ? 'rock' : 'small'
    const point = { x: x + (hash(i++, seed) - 0.5) * 24, y: y + (hash(i++, seed) - 0.5) * 18 }
    if (clear(point, kind === 'tree' ? 26 : 18)) placed.push({ kind, ...point, scale: 0.8 + hash(i++, seed) * 0.3 })
  }
  for (let x = 24; x < field.width; x += 38) {
    band(x, 26)
    band(x, field.height - 14)
  }
  for (let y = 70; y < field.height - 40; y += 40) {
    band(18, y)
    band(field.width - 18, y)
  }
  return placed.sort((a, b) => a.y - b.y)
}

/** Sprite-stacked battlefield: crisp pixel ground, pre-baked static scenery, monster den and knights' castle. */
export class StackStage {
  readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private props: PlacedStatic[] = []
  private den?: PlacedStatic
  private castles: PlacedStatic[] = []
  private castleFacing: Point = { x: 0, y: 1 }
  private castleAt: Point = { x: 0, y: 0 }
  private tier = 2
  private field?: ResolvedBattlefield
  private aspect = 1
  private presentation = 1
  private key = ''
  private repaint?: ReturnType<typeof setTimeout>
  private label?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>

  constructor(private readonly scene: THREE.Scene) {
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false })
    )
    this.ground.name = 'stack-stage-ground'
    this.ground.scale.y = -1
    scene.add(this.ground)
  }

  build(field: ResolvedBattlefield, aspect: number, presentation: number): void {
    const key = `${field.id}:${field.version}:${field.layoutRevision}`
    this.presentation = presentation
    if (key === this.key) {
      if (Math.abs(aspect - this.aspect) > 1e-5) {
        this.aspect = aspect
        if (this.label) this.label.scale.x = 1 / aspect
        if (this.repaint === undefined) {
          this.paint(field)
          this.repaint = setTimeout(() => (this.repaint = undefined), 160)
        } else {
          clearTimeout(this.repaint)
          const map = this.ground.material.map
          if (map && !map.name.endsWith(':stale')) map.name += ':stale'
          this.repaint = setTimeout(() => {
            this.repaint = undefined
            if (this.field === field && this.key === key) this.paint(field)
          }, 160)
        }
      }
      this.applyPresentation()
      return
    }
    clearTimeout(this.repaint)
    this.repaint = undefined
    this.key = key
    this.field = field
    this.aspect = aspect
    this.paint(field)
    this.clearFigures()
    this.paintSlowLabel(field)
    this.placeFigures(field)
  }

  private paint(field: ResolvedBattlefield): void {
    const pixels = paintGround(field, this.aspect)
    const rows = new Uint8Array(pixels.data.length)
    const stride = pixels.width * 4
    for (let j = 0; j < pixels.height; j++)
      rows.set(pixels.data.subarray(j * stride, (j + 1) * stride), (pixels.height - 1 - j) * stride)
    const texture = new THREE.DataTexture(rows, pixels.width, pixels.height, THREE.RGBAFormat)
    texture.magFilter = texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.flipY = false
    texture.colorSpace = THREE.SRGBColorSpace
    texture.name = `stack-stage:field:${field.id}:${field.version}:${field.layoutRevision}`
    texture.needsUpdate = true
    this.ground.material.map?.dispose()
    this.ground.material.map = texture
    this.ground.material.needsUpdate = true
    this.ground.geometry.dispose()
    this.ground.geometry = new THREE.PlaneGeometry(field.width, field.height)
    this.ground.position.set(field.width / 2, field.height / 2, -20)
  }

  private createPlaced(
    design: StackDesign,
    x: number,
    y: number,
    facing: Point,
    seed: number,
    scale = 1,
    name?: string
  ): PlacedStatic {
    const turn = Math.atan2(facing.y / STACK_SQUASH, facing.x * this.aspect) - Math.PI / 2
    const sprite = bakeStaticSprite(design, turn)
    const body = new THREE.Mesh(
      quadGeometry,
      new THREE.MeshBasicMaterial({
        map: sprite.body,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    )
    body.matrixAutoUpdate = false
    body.frustumCulled = false

    const shadow = new THREE.Mesh(
      quadGeometry,
      new THREE.MeshBasicMaterial({
        map: sprite.shadow,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    )
    shadow.matrixAutoUpdate = false
    shadow.frustumCulled = false
    shadow.renderOrder = -1

    const root = new THREE.Group()
    root.name = name ?? `stack-prop:${design.blueprint.id}`
    root.userData.presentationOnly = true
    root.add(shadow, body)
    this.scene.add(root)

    const sways = design.blueprint.id === 'oak' || design.blueprint.id.includes('pine')
    return { design, root, body, shadow, x, y, scale, facing, seed: (seed * 0.137) % 1, sways, sprite }
  }

  private layoutPlaced(placed: PlacedStatic, xOffset = 0, swayX = 0): void {
    const turn = Math.atan2(placed.facing.y / STACK_SQUASH, placed.facing.x * this.aspect) - Math.PI / 2
    const sprite = bakeStaticSprite(placed.design, turn)
    if (sprite !== placed.sprite) {
      placed.sprite = sprite
      placed.body.material.map = sprite.body
      placed.shadow.material.map = sprite.shadow
    }
    const artPxY = placed.design.voxel * placed.scale * this.presentation
    const artPxX = artPxY / this.aspect
    const snapX = Math.round((placed.x + xOffset) / artPxX) * artPxX + swayX
    const snapY = Math.round(placed.y / artPxY) * artPxY
    const w = sprite.width * artPxX
    const h = sprite.height * artPxY
    // PlaneGeometry is centered; align (originX, originY) to (snapX, snapY).
    // Remember scaleY(-1) on the board canvas means world +Y is down, while texture row 0 is at local +Y
    // (flipped bottom-up in makeNearestTexture), so local Y = -1 is flipped to match top-down pixel rows.
    const cx = (sprite.width * 0.5 - sprite.originX) * artPxX
    const cy = (sprite.height * 0.5 - sprite.originY) * artPxY

    placed.body.matrix.makeScale(w, -h, 1).setPosition(snapX + cx, snapY + cy, modelGroundDepth(placed.y))
    placed.body.matrixWorldNeedsUpdate = true

    placed.shadow.matrix.makeScale(w, -h, 1).setPosition(snapX + cx, snapY + cy, -17)
    placed.shadow.matrixWorldNeedsUpdate = true
  }

  private placeFigures(field: ResolvedBattlefield): void {
    const kinds = BIOME_PROPS[field.id]
    stageLayout(field).forEach((spot, index) => {
      const options = kinds[spot.kind]
      const design = options[index % options.length]
      this.props.push(
        this.createPlaced(
          design,
          spot.x,
          spot.y,
          { x: Math.sin(index * 2.3), y: Math.cos(index * 2.3) },
          index,
          spot.scale
        )
      )
    })
    const entry = field.path[0],
      first = direction(entry, field.path[1] ?? entry)
    const inside = (p: Point, mx: number, my: number) => ({
      x: Math.max(mx, Math.min(field.width - mx, p.x)),
      y: Math.max(my, Math.min(field.height - 12, p.y))
    })
    const den = inside({ x: entry.x - first.x * 10, y: entry.y - first.y * 10 }, 52, 46)
    this.den = this.createPlaced(denDesign(field.id), den.x, den.y, first, 0.5, 1, `stack-den:${field.id}`)
    const gate = field.gate,
      last = direction(field.path[field.path.length - 2] ?? gate, gate)
    this.castleAt = inside({ x: gate.x + last.x * 58, y: gate.y + last.y * 58 }, 70, 70)
    this.castleFacing = { x: -last.x, y: -last.y }
    this.castles = ([0, 1, 2] as const).map((tier) =>
      this.createPlaced(
        castleDesign(field.id, tier),
        this.castleAt.x,
        this.castleAt.y,
        this.castleFacing,
        0.2,
        1,
        `stack-castle-${tier}`
      )
    )
    this.applyPresentation()
  }

  /** The slow stretch keeps its readable speed label on the road. */
  private paintSlowLabel(field: ResolvedBattlefield): void {
    if (typeof document === 'undefined') return
    const surface = field.slowSurface
    const canvas = document.createElement('canvas')
    canvas.width = 124
    canvas.height = 36
    const c = canvas.getContext('2d')
    if (!c) return
    c.fillStyle = '#182420ee'
    c.strokeStyle = '#d7c08a'
    c.lineWidth = 2
    c.beginPath()
    c.roundRect(2, 2, 120, 32, 6)
    c.fill()
    c.stroke()
    c.fillStyle = '#fff4d0'
    c.font = 'bold 20px "Noto Sans CJK JP", "Hiragino Kaku Gothic ProN", sans-serif'
    c.textAlign = 'center'
    c.fillText(`地上 ${Math.round(surface.speedFactor * 100)}%`, 62, 26)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.name = 'stack-stage:slow-label'
    this.label ??= new THREE.Mesh(
      new THREE.PlaneGeometry(62, 18),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })
    )
    this.label.material.map?.dispose()
    this.label.material.map = texture
    this.label.material.needsUpdate = true
    this.label.name = 'stack-stage-slow-label'
    const center = pointOnPath(field.path, (surface.startProgress + surface.endProgress) / 2)
    this.label.position.set(center.x, center.y, -19)
    this.label.scale.set(1 / this.aspect, -1, 1)
    this.scene.add(this.label)
  }

  private applyPresentation(): void {
    for (const placed of this.props) this.layoutPlaced(placed)
    if (this.den) this.layoutPlaced(this.den)
    this.setBase(this.tier, 0)
  }

  /** Damage tier 0 (critical) to 2 (intact) and a horizontal hit shake in board units. */
  setBase(tier: number, shake: number): void {
    this.tier = tier
    this.castles.forEach((castle, index) => {
      this.layoutPlaced(castle, shake)
      castle.root.visible = index === tier
    })
  }

  /** Gentle pixel-snapped wind sway for trees; zero re-slicing cost. */
  update(time: number): void {
    for (const placed of this.props) {
      if (!placed.sways) continue
      const sway = Math.round(Math.sin(time * 1.4 + placed.seed * 19) * 0.65)
      if (sway !== 0 || placed.body.userData.lastSway) {
        placed.body.userData.lastSway = sway
        const artPxX = (placed.design.voxel * placed.scale * this.presentation) / this.aspect
        this.layoutPlaced(placed, 0, sway * artPxX * 0.5)
      }
    }
  }

  diagnostics() {
    return {
      renderer: 'sprite-stack',
      ground: this.ground.material.map?.name ?? null,
      props: this.props.length,
      den: !!this.den,
      castleTier: this.tier,
      field: this.field?.id ?? null
    }
  }

  private disposePlaced(placed: PlacedStatic): void {
    placed.root.removeFromParent()
    placed.body.material.dispose()
    placed.shadow.material.dispose()
  }

  private clearFigures(): void {
    for (const placed of this.props) this.disposePlaced(placed)
    this.props = []
    if (this.den) this.disposePlaced(this.den)
    this.den = undefined
    for (const castle of this.castles) this.disposePlaced(castle)
    this.castles = []
  }

  dispose(): void {
    clearTimeout(this.repaint)
    this.clearFigures()
    this.scene.remove(this.ground)
    if (this.label) {
      this.scene.remove(this.label)
      this.label.geometry.dispose()
      this.label.material.map?.dispose()
      this.label.material.dispose()
    }
    this.ground.geometry.dispose()
    this.ground.material.map?.dispose()
    this.ground.material.dispose()
    this.key = ''
  }
}
