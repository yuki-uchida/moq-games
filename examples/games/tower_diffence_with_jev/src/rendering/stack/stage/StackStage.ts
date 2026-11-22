import * as THREE from 'three'
import { CONFIG, pointOnPath, type FieldId, type Point } from '../../../game/model'
import { distanceToRoadUnion, type ResolvedBattlefield } from '../../../game/BattlefieldRoutes'
import { fieldScenery, type SceneryItem } from '../../../game/FieldScenery'
import { modelGroundDepth } from '../../BoardCamera'
import type { StackDesign } from '../StackDesign'
import { drawStackPixels, STACK_SPACING, STACK_SQUASH } from '../SliceSheet'
import { stackModel } from '../StackVisual'
import { paintGround, scenicPools } from './ground'
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
 * outlined + southeast-shadowed plain sprite, avoiding per-frame slice loops across dozens of props.
 */
function bakeStaticSprite(design: StackDesign, turn: number, shadowShift: readonly [number, number]): BakedStaticSprite {
  // Quantize static turn to 16 steps so identical prop orientations share one baked texture.
  const step = ((Math.round((turn / (Math.PI * 2)) * 16) % 16) + 16) % 16
  const key = `${design.blueprint.id}:${step}:${shadowShift[0]}x${shadowShift[1]}`
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
    shadowOffset: shadowShift
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
  readonly shadowShift: readonly [number, number]
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

/** Snap fortress orientation to clean cardinal/orthographic direction so castle walls stay razor-crisp. */
function snapCardinal(dir: Point): Point {
  if (Math.abs(dir.x) >= Math.abs(dir.y)) return { x: dir.x >= 0 ? 1 : -1, y: 0 }
  return { x: 0, y: dir.y >= 0 ? 1 : -1 }
}

/**
 * Where scenery goes:
 * - Fixed `scale: 1` for unified 1:1 art-pixel density (size variety comes from authored designs)
 * - Staggered perimeter framing kept strictly inside viewport (`y <= field.height - 26`) so bottom trees never clip
 * - Low non-blocking interior accents (stumps, mushrooms, bones, ice crystals, lava vents) in genuine dead zones
 *   strictly clear of roads, deployment slots, entrance, and gate.
 */
export function stageLayout(field: ResolvedBattlefield): { kind: PropKind; x: number; y: number; scale: number }[] {
  const scenery = fieldScenery(field.id, field.version, field.layoutRevision)
  const kindOf = (item: SceneryItem): PropKind =>
    item.kind === 'tree' || item.kind === 'cactus' ? 'tree' : item.kind === 'rock' ? 'rock' : 'small'
  if (scenery.length) return scenery.map((item) => ({ kind: kindOf(item), x: item.x, y: item.y, scale: 1 }))

  const placed: { kind: PropKind; x: number; y: number; scale: number }[] = []
  const seed = field.id.length * 977 + field.layoutRevision * 19 + field.id.charCodeAt(0) * 131
  const keep = [field.entrance, field.gate]
  const slowMid = pointOnPath(field.path, (field.slowSurface.startProgress + field.slowSurface.endProgress) / 2)
  const pools = scenicPools(field, 1)

  const clear = (point: Point, kind: PropKind, roadPad: number, slotPad: number, spacing: number) => {
    if (
      point.x < 24 ||
      point.x > field.width - 24 ||
      point.y < (kind === 'tree' ? 66 : 30) ||
      point.y > field.height - 26
    )
      return false
    // Check BOTH foot position AND projected canopy/body height rectangle against road, slow zone & pools!
    const canopyProbes: Point[] =
      kind === 'tree'
        ? [point, { x: point.x, y: point.y - 26 }, { x: point.x, y: point.y - 52 }]
        : [point, { x: point.x, y: point.y - 16 }]
    for (const probe of canopyProbes) {
      const pad = probe === point ? roadPad : Math.max(12, roadPad - 10)
      if (distanceToRoadUnion(field, probe) <= CONFIG.roadWidth / 2 + pad) return false
      if (Math.hypot(slowMid.x - probe.x, slowMid.y - probe.y) <= 72) return false
      if (pools.some((pool) => Math.hypot(pool.bx - probe.x, pool.by - probe.y) <= Math.max(pool.rx, pool.ry) + 18))
        return false
    }
    return (
      keep.every((k) => Math.hypot(k.x - point.x, k.y - point.y) > 158) &&
      field.slots.every((slot) => Math.hypot(slot.x - point.x, slot.y - point.y) > 42 + slotPad) &&
      placed.every((other) => Math.hypot(other.x - point.x, other.y - point.y) > spacing)
    )
  }

  let i = 0
  const band = (x: number, y: number, preferTree: boolean, allowClose = false) => {
    const roll = hash(i++, seed)
    const allowTree = preferTree && y >= 62
    const kind: PropKind = allowTree
      ? roll < 0.64
        ? 'tree'
        : roll < 0.84
          ? 'rock'
          : 'small'
      : roll < 0.24
        ? 'accent'
        : roll < 0.62
          ? 'small'
          : 'rock'
    const point = {
      x: x + (hash(i++, seed) - 0.5) * 24,
      y: y + (hash(i++, seed) - 0.5) * 16
    }
    const minSpace = allowClose ? 28 : kind === 'tree' ? 40 : 34
    if (clear(point, kind, kind === 'tree' ? 28 : 20, kind === 'tree' ? 22 : 12, minSpace)) {
      placed.push({ kind, ...point, scale: 1 })
    }
  }

  // Organic grove/cluster composition along the perimeter (clusters of 2-4 separated by open clearings!).
  for (let x = 28; x < field.width - 20; x += 34) {
    const topWave = Math.sin(x * 0.017 + seed * 0.13) + Math.cos(x * 0.008 + seed * 0.31) * 0.5
    if (topWave > -0.15) {
      band(x, 34, false, true)
      if (topWave > 0.35) band(x + 14, 68, true, true)
    }
    const botWave = Math.sin(x * 0.016 + seed * 0.47 + 1.9) + Math.cos(x * 0.009 + seed * 0.21) * 0.5
    if (botWave > -0.1) {
      band(x, field.height - 30, true, true)
      if (botWave > 0.5) band(x + 16, field.height - 48, false, true)
    }
  }
  for (let y = 78; y < field.height - 54; y += 38) {
    const leftWave = Math.sin(y * 0.022 + seed * 0.27)
    if (leftWave > -0.25) band(28, y, true, true)
    const rightWave = Math.sin(y * 0.021 + seed * 0.61 + 1.4)
    if (rightWave > -0.25) band(field.width - 28, y, true, true)
  }
  // Low non-blocking scenic accents in clustered interior dead-zone pockets.
  for (let y = 104; y < field.height - 76; y += 70) {
    for (let x = 96; x < field.width - 96; x += 92) {
      if (hash(i++, seed) > 0.44) continue
      band(x, y, false)
    }
  }
  return placed.sort((a, b) => a.y - b.y)
}

const PLAQUE_THEME: Record<FieldId, { bg: string; inner: string; border: string; text: string }> = {
  meadow: { bg: '#3b2919', inner: '#543c26', border: '#c4a46c', text: '#fff5d6' },
  desert: { bg: '#4a2e1a', inner: '#694326', border: '#e0b977', text: '#fff4d9' },
  frost: { bg: '#223547', inner: '#334d66', border: '#9dc9e0', text: '#eef9ff' },
  volcanic: { bg: '#261d29', inner: '#3b2d3e', border: '#d9814a', text: '#ffedd6' }
}

/** Sprite-stacked battlefield: crisp 1:1 pixel ground, hero-scale scenery, monster den and knights' castle. */
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
    name?: string,
    shadowShift: readonly [number, number] = [3, 3]
  ): PlacedStatic {
    const turn = Math.atan2(facing.y / STACK_SQUASH, facing.x * this.aspect) - Math.PI / 2
    const sprite = bakeStaticSprite(design, turn, shadowShift)
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

    const sways =
      design.blueprint.id === 'oak' ||
      design.blueprint.id === 'oak-young' ||
      design.blueprint.id === 'desert-palm' ||
      design.blueprint.id.includes('pine')
    return { design, root, body, shadow, x, y, scale, facing, shadowShift, seed: (seed * 0.137) % 1, sways, sprite }
  }

  private layoutPlaced(placed: PlacedStatic, xOffset = 0, swayX = 0): void {
    const turn = Math.atan2(placed.facing.y / STACK_SQUASH, placed.facing.x * this.aspect) - Math.PI / 2
    const sprite = bakeStaticSprite(placed.design, turn, placed.shadowShift)
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
      const shift: readonly [number, number] = spot.kind === 'tree' ? [4, 4] : [3, 3]
      this.props.push(
        this.createPlaced(
          design,
          spot.x,
          spot.y,
          { x: Math.sin(index * 2.3), y: Math.cos(index * 2.3) },
          index,
          1,
          undefined,
          shift
        )
      )
    })
    const entry = field.path[0],
      first = direction(entry, field.path[1] ?? entry)
    const inside = (p: Point, mx: number, my: number) => ({
      x: Math.max(mx, Math.min(field.width - mx, p.x)),
      y: Math.max(my, Math.min(field.height - 26, p.y))
    })
    const den = inside({ x: entry.x - first.x * 10, y: entry.y - first.y * 10 }, 56, 52)
    this.den = this.createPlaced(denDesign(field.id), den.x, den.y, snapCardinal(first), 0.5, 1, `stack-den:${field.id}`, [4, 4])

    const gate = field.gate,
      last = direction(field.path[field.path.length - 2] ?? gate, gate)
    this.castleAt = inside({ x: gate.x + last.x * 62, y: gate.y + last.y * 62 }, 76, 76)
    // Lock castle to clean cardinal orientation facing the incoming road (eliminates jagged diagonal edges).
    this.castleFacing = snapCardinal({ x: -last.x, y: -last.y })
    this.castles = ([0, 1, 2] as const).map((tier) =>
      this.createPlaced(
        castleDesign(field.id, tier),
        this.castleAt.x,
        this.castleAt.y,
        this.castleFacing,
        0.2,
        1,
        `stack-castle-${tier}`,
        [5, 5]
      )
    )
    this.applyPresentation()
  }

  /** Crisp pixel-art wooden/stone road signpost plaque beside the slow stretch (keeps speed info readable without modern UI pills). */
  private paintSlowLabel(field: ResolvedBattlefield): void {
    if (typeof document === 'undefined') return
    const surface = field.slowSurface
    const theme = PLAQUE_THEME[field.id]
    const canvas = document.createElement('canvas')
    canvas.width = 116
    canvas.height = 34
    const c = canvas.getContext('2d')
    if (!c) return
    c.imageSmoothingEnabled = false
    // Stepped pixel-art double frame with corner rivets (no smooth rounded vector corners).
    c.fillStyle = '#141012'
    c.fillRect(2, 0, 112, 34)
    c.fillRect(0, 2, 116, 30)
    c.fillStyle = theme.border
    c.fillRect(2, 2, 112, 30)
    c.fillStyle = theme.bg
    c.fillRect(4, 4, 108, 26)
    c.fillStyle = theme.inner
    c.fillRect(6, 6, 104, 22)
    // 4 pixel corner rivets.
    c.fillStyle = theme.border
    c.fillRect(6, 6, 3, 3)
    c.fillRect(107, 6, 3, 3)
    c.fillRect(6, 25, 3, 3)
    c.fillRect(107, 25, 3, 3)
    const pct = Math.max(5, Math.round((1 - surface.speedFactor) * 100))
    const labelText = `移動 -${pct}%`
    // Crisp high-contrast label.
    c.fillStyle = '#141012'
    c.font = 'bold 18px "Noto Sans CJK JP", "Hiragino Kaku Gothic ProN", sans-serif'
    c.textAlign = 'center'
    c.fillText(labelText, 59, 24)
    c.fillStyle = theme.text
    c.fillText(labelText, 58, 23)

    const texture = new THREE.CanvasTexture(canvas)
    texture.magFilter = texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.colorSpace = THREE.SRGBColorSpace
    texture.name = 'stack-stage:slow-label'
    this.label ??= new THREE.Mesh(
      new THREE.PlaneGeometry(58, 17),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })
    )
    this.label.material.map?.dispose()
    this.label.material.map = texture
    this.label.material.needsUpdate = true
    this.label.name = 'stack-stage-slow-label'
    const mid = (surface.startProgress + surface.endProgress) / 2
    const center = pointOnPath(field.path, mid)
    const ahead = pointOnPath(field.path, mid + 12)
    const dir = direction(center, ahead)
    // Place the roadside signpost plaque cleanly on the inward side of the slow zone (never jammed against the bottom border).
    let ox = -dir.y * 26
    let oy = dir.x * 26
    if (center.y > field.height - 90 && oy > 0) {
      ox = -ox
      oy = -oy
    }
    const lx = Math.max(48, Math.min(field.width - 48, center.x + ox))
    const ly = Math.max(24, Math.min(field.height - 24, center.y + oy))
    this.label.position.set(lx, ly, -18.5)
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
