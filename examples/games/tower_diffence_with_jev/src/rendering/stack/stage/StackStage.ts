import * as THREE from 'three'
import { CONFIG, pointOnPath, type Point } from '../../../game/model'
import { distanceToRoadUnion, type ResolvedBattlefield } from '../../../game/BattlefieldRoutes'
import { fieldScenery, type SceneryItem } from '../../../game/FieldScenery'
import type { StackDesign } from '../StackDesign'
import { StackVisual } from '../StackVisual'
import { paintGround } from './ground'
import { castleDesign, denDesign } from './landmarks'
import { BIOME_PROPS, type PropKind } from './props'

interface Placed {
  visual: StackVisual
  x: number
  y: number
  facing: Point
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
  // An open interior: frame the board with a band of props that keeps clear of the road,
  // the entrance, the gate and every placement slot.
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
    if (clear(point, kind === 'tree' ? 26 : 18)) placed.push({ kind, ...point, scale: 0.75 + hash(i++, seed) * 0.4 })
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

/** Sprite-stacked battlefield: pixel ground, scenery, the monster den and the knights' castle. */
export class StackStage {
  readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private props: Placed[] = []
  private den?: Placed
  private castles: StackVisual[] = []
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
        // A resize only reflows the figures; the display-space ground repaints at most once per window.
        this.aspect = aspect
        if (this.label) this.label.scale.x = 1 / aspect
        if (this.repaint === undefined) {
          // A settled board repaints at once; further resizes inside the window coalesce.
          this.paint(field)
          this.repaint = setTimeout(() => (this.repaint = undefined), 160)
        } else {
          clearTimeout(this.repaint)
          // Diagnostics read the ground as stale until the repaint for this aspect lands.
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
    // Rows are stored bottom-up so the board plane shows row 0 at the top, like a canvas texture.
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

  private placeFigures(field: ResolvedBattlefield): void {
    const kinds = BIOME_PROPS[field.id]
    stageLayout(field).forEach((spot, index) => {
      const options = kinds[spot.kind]
      const design = options[index % options.length]
      this.props.push(this.place(design, spot.x, spot.y, { x: Math.sin(index * 2.3), y: Math.cos(index * 2.3) }, index))
    })
    const entry = field.path[0],
      first = direction(entry, field.path[1] ?? entry)
    const inside = (p: Point, mx: number, my: number) => ({
      x: Math.max(mx, Math.min(field.width - mx, p.x)),
      y: Math.max(my, Math.min(field.height - 12, p.y))
    })
    const den = inside({ x: entry.x - first.x * 10, y: entry.y - first.y * 10 }, 52, 46)
    this.den = this.place(denDesign(field.id), den.x, den.y, first, 0.5)
    const gate = field.gate,
      last = direction(field.path[field.path.length - 2] ?? gate, gate)
    this.castleAt = inside({ x: gate.x + last.x * 58, y: gate.y + last.y * 58 }, 70, 70)
    this.castleFacing = { x: -last.x, y: -last.y }
    this.castles = ([0, 1, 2] as const).map((tier) => {
      const visual = new StackVisual(castleDesign(field.id, tier), 0.2)
      visual.root.name = `stack-castle-${tier}`
      this.scene.add(visual.root)
      return visual
    })
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
    c.fillStyle = '#2f3f36e6'
    c.beginPath()
    c.roundRect(2, 2, 120, 32, 8)
    c.fill()
    c.fillStyle = '#fff2cc'
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

  private place(design: StackDesign, x: number, y: number, facing: Point, seed: number): Placed {
    const visual = new StackVisual(design, (seed * 0.137) % 1)
    visual.root.userData.presentationOnly = true
    this.scene.add(visual.root)
    return { visual, x, y, facing }
  }

  private applyPresentation(): void {
    for (const placed of [...this.props, ...(this.den ? [this.den] : [])]) {
      placed.visual.setPresentation(this.presentation, this.aspect)
      placed.visual.setPosition(placed.x, placed.y)
      placed.visual.sample({
        motion: 'idle',
        seconds: 0,
        time: 0,
        facingX: placed.facing.x,
        facingY: placed.facing.y,
        boss: false
      })
    }
    this.setBase(this.tier, 0)
  }

  /** Damage tier 0 (critical) to 2 (intact) and a horizontal hit shake in board units. */
  setBase(tier: number, shake: number): void {
    this.tier = tier
    this.castles.forEach((castle, index) => {
      castle.setPresentation(this.presentation, this.aspect)
      castle.setPosition(this.castleAt.x + shake, this.castleAt.y)
      castle.sample({
        motion: 'idle',
        seconds: 0,
        time: 0,
        facingX: this.castleFacing.x,
        facingY: this.castleFacing.y,
        boss: false
      })
      castle.root.visible = index === tier
    })
  }

  /** Gentle tree sway; static props skip resampling. */
  update(time: number): void {
    for (const placed of this.props)
      if (placed.visual.design.blueprint.id === 'oak' || placed.visual.design.blueprint.id.includes('pine'))
        placed.visual.sample({
          motion: 'idle',
          seconds: 0,
          time,
          facingX: placed.facing.x,
          facingY: placed.facing.y,
          boss: false
        })
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

  private clearFigures(): void {
    for (const placed of this.props) placed.visual.dispose()
    this.props = []
    this.den?.visual.dispose()
    this.den = undefined
    for (const castle of this.castles) castle.dispose()
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
