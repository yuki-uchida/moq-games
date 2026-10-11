import * as THREE from 'three'
import { FORTIFICATIONS, gateMuzzle, roadItems, type RoadItemPlacement } from '../game/Fortifications'
import { nearestRoadEdge } from '../game/BattlefieldRoutes'
import { fieldFor, isAirborneEnemy, pointOnPath, type GameState, type Point, type RoadItemKind } from '../game/model'
import { projectilePose } from './ProjectileMotion'
import { environmentDirection, type EnvironmentArt, type EnvironmentSprite } from './EnvironmentArt'

type PixelMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
interface RoadVisual {
  mesh: PixelMesh
  label: HTMLDivElement
  button: HTMLButtonElement
  kind: RoadItemKind
  entry?: PixelMesh
}
const impactLifetime = 0.15

function painted(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = true
  paint(context)
  return canvas
}
function ellipse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
): void {
  context.fillStyle = color
  context.beginPath()
  context.ellipse(x, y, width, height, 0, 0, Math.PI * 2)
  context.fill()
}
function polygon(context: CanvasRenderingContext2D, points: number[][], color: string): void {
  context.fillStyle = color
  context.beginPath()
  context.moveTo(points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) context.lineTo(x, y)
  context.closePath()
  context.fill()
}
export function createRoadItemArt(kind: RoadItemKind): HTMLCanvasElement {
  return painted(64, 48, (context) => {
    if (kind === 'mud') {
      ellipse(context, 32, 25, 24, 17, '#51352280')
      ellipse(context, 29, 25, 21, 13, '#755038')
      ellipse(context, 39, 22, 16, 11, '#69442f')
      ellipse(context, 29, 27, 17, 8, '#967052')
      ellipse(context, 25, 23, 9, 2, '#b3976e80')
      ellipse(context, 42, 28, 7, 2, '#452e2355')
      for (const [x, y] of [
        [13, 16],
        [48, 34],
        [22, 37],
        [53, 21]
      ])
        ellipse(context, x, y, 2, 1, '#765139a0')
      return
    }
    ellipse(context, 32, 33, 28, 7, '#23352c50')
    polygon(
      context,
      [
        [5, 21],
        [56, 21],
        [60, 34],
        [8, 35]
      ],
      '#513b2b'
    )
    polygon(
      context,
      [
        [6, 19],
        [55, 19],
        [59, 29],
        [9, 30]
      ],
      '#a17a4f'
    )
    context.fillStyle = '#6d4d32'
    context.fillRect(11, 25, 41, 2)
    for (const [x, y] of [
      [16, 26],
      [29, 25],
      [42, 26],
      [51, 23]
    ]) {
      polygon(
        context,
        [
          [x - 5, y],
          [x - 1, y - 19],
          [x + 5, y]
        ],
        '#3e4c4f'
      )
      polygon(
        context,
        [
          [x - 4, y - 2],
          [x - 1, y - 19],
          [x + 1, y - 2]
        ],
        '#c9d4ce'
      )
      polygon(
        context,
        [
          [x + 1, y - 2],
          [x - 1, y - 19],
          [x + 4, y - 1]
        ],
        '#7e9599'
      )
    }
    for (const x of [10, 54]) ellipse(context, x, 24, 1.4, 1.4, '#d5d2af')
  })
}
function createGateTrimArt(level: number): HTMLCanvasElement {
  return painted(192, 256, (context) => {
    context.translate(96, 184)
    context.scale(1, 1.12)
    for (const y of [-8, 3]) {
      context.fillStyle = '#4d6067'
      context.fillRect(-13, y - 2, 26, 4)
      for (const x of [-10, 10]) ellipse(context, x, y, 1.2, 1.2, '#e2d9b3')
    }
    if (level >= 2)
      for (const side of [-1, 1]) {
        const x = side * 30
        polygon(
          context,
          [
            [x - 9, -48],
            [x + 9, -48],
            [x + 9, -36],
            [x, -31],
            [x - 9, -36]
          ],
          '#526973'
        )
        polygon(
          context,
          [
            [x - 6, -45],
            [x + 6, -45],
            [x + 6, -37],
            [x, -34],
            [x - 6, -37]
          ],
          '#a6b6b4'
        )
        ellipse(context, x, -41, 2, 2, '#e1cb83')
      }
    if (level >= 3) {
      context.strokeStyle = '#aabbb9'
      context.lineWidth = 3
      context.beginPath()
      context.moveTo(-18, 8)
      context.lineTo(-18, -18)
      context.arc(0, -18, 18, Math.PI, Math.PI * 2)
      context.lineTo(18, 8)
      context.stroke()
      for (const x of [-18, 18]) for (const y of [-10, 4]) ellipse(context, x, y, 1.4, 1.4, '#eadba7')
    }
  })
}
function createCannonArt(level: number): HTMLCanvasElement {
  return painted(48, 32, (context) => {
    polygon(
      context,
      [
        [3, 10],
        [22, 9],
        [24, 11],
        [24, 21],
        [22, 23],
        [3, 22]
      ],
      '#293b43'
    )
    polygon(
      context,
      [
        [4, 11],
        [24, 11],
        [24, 14],
        [5, 15]
      ],
      '#8b9c9e'
    )
    context.fillStyle = '#526b72'
    context.fillRect(5, 16, 18, 4)
    for (let index = 0; index < level; index++) {
      context.fillStyle = '#c8aa66'
      context.fillRect(7 + index * 5, 9, 2, 14)
    }
    context.fillStyle = '#172a32'
    context.fillRect(22, 12, 3, 8)
  })
}
function createMudSlowArt(): HTMLCanvasElement {
  return painted(64, 32, (context) => {
    ellipse(context, 32, 19, 19, 6, '#72513b50')
    for (const [x, y, radius] of [
      [17, 17, 3],
      [23, 23, 2],
      [40, 21, 3],
      [47, 15, 2]
    ])
      ellipse(context, x, y, radius, radius / 2, '#b48b586b')
    context.strokeStyle = '#9c754955'
    context.lineWidth = 1.5
    context.beginPath()
    context.ellipse(32, 18, 23, 9, 0, 0, Math.PI * 1.6)
    context.stroke()
  })
}
function createShotArt(impact: boolean): HTMLCanvasElement {
  return painted(32, 32, (context) => {
    if (impact) {
      for (let index = 0; index < 8; index++) {
        const angle = (index * Math.PI) / 4
        polygon(
          context,
          [
            [16 + Math.cos(angle - 0.2) * 5, 16 + Math.sin(angle - 0.2) * 5],
            [16 + Math.cos(angle) * 15, 16 + Math.sin(angle) * 15],
            [16 + Math.cos(angle + 0.2) * 5, 16 + Math.sin(angle + 0.2) * 5]
          ],
          '#f1cf8e'
        )
      }
      ellipse(context, 16, 16, 6, 6, '#ffedba')
    } else {
      ellipse(context, 16, 16, 7, 7, '#1e3038')
      ellipse(context, 15, 14, 5, 5, '#5b7077')
      ellipse(context, 13, 12, 2, 2, '#b5c5c3')
    }
  })
}

export class FortificationVisual {
  private environment?: EnvironmentArt
  private shotLaunches = new Map<string, { origin: Point; angle: number }>()
  private items = new Map<number, RoadVisual>()
  private textures = new Map<string, THREE.CanvasTexture>()
  private shots = new Map<string, PixelMesh>()
  private mudMarks = new Map<number, PixelMesh>()
  private badges = new Map<number, HTMLDivElement>()
  private preview: RoadItemPlacement | null = null
  private previewKind: RoadItemKind = 'spike'
  private selectedId: number | null = null
  private gateSelected = false
  private ghost?: PixelMesh
  private trim?: PixelMesh
  private cannon?: PixelMesh
  private mount?: PixelMesh
  private muzzle?: PixelMesh
  private gateRange?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  private previewLabel = document.createElement('div')
  private gateHandle = document.createElement('button')

  constructor(
    private scene: THREE.Scene,
    private host: HTMLElement
  ) {
    this.previewLabel.className = 'sandbag-preview road-item-preview'
    this.previewLabel.hidden = true
    this.gateHandle.id = 'gate-handle'
    this.gateHandle.dataset.gate = 'true'
    this.gateHandle.type = 'button'
    this.gateHandle.className = 'gate-handle'
    this.gateHandle.hidden = true
    Object.assign(this.gateHandle.style, {
      position: 'absolute',
      width: '82px',
      height: '90px',
      minHeight: '0',
      padding: '0',
      border: '0',
      borderRadius: '18px',
      background: 'transparent',
      boxShadow: 'none',
      transform: 'translate(-50%, -100%)',
      zIndex: '2'
    })
    this.host.append(this.previewLabel, this.gateHandle)
  }

  setPreview(preview: RoadItemPlacement | null, label = '', kind: RoadItemKind = 'spike'): void {
    if (!preview && !this.preview && this.previewLabel.textContent === label && this.previewKind === kind) return
    this.preview = preview ? { ...preview, point: { ...preview.point } } : null
    this.previewKind = kind
    this.previewLabel.textContent = label
    if (!preview) {
      if (this.ghost) this.ghost.visible = false
      this.previewLabel.hidden = true
    }
  }
  setEnvironmentArt(art: EnvironmentArt | undefined): void {
    this.environment = art
    this.shotLaunches.clear()
  }
  private turretPose(gate: Point, angle: number) {
    const sprite = this.environment?.props[`gate-turret-${environmentDirection(angle)}`]
    if (!sprite?.emitter) return undefined
    const anchor = { x: gate.x, y: gate.y - 100 }
    return {
      sprite,
      anchor,
      muzzle: { x: anchor.x + sprite.emitter.x - sprite.pivot.x, y: anchor.y + sprite.emitter.y - sprite.pivot.y }
    }
  }
  private resize(mesh: PixelMesh, width: number, height: number): void {
    if (mesh.geometry.parameters.width === width && mesh.geometry.parameters.height === height) return
    mesh.geometry.dispose()
    mesh.geometry = new THREE.PlaneGeometry(width, height)
  }
  private paintEnvironment(mesh: PixelMesh, sprite: EnvironmentSprite, anchor: Point, pivot = sprite.pivot): void {
    this.resize(mesh, sprite.width, sprite.height)
    mesh.material.map = sprite.texture
    mesh.rotation.z = 0
    mesh.position.x = anchor.x + sprite.width / 2 - pivot.x
    mesh.position.y = anchor.y + sprite.height / 2 - pivot.y
    mesh.userData.environment = sprite.texture.name
  }
  setSelection(id: number | null): void {
    this.selectedId = id
  }
  setGateSelected(selected: boolean): void {
    this.gateSelected = selected
  }
  get placementActive(): boolean {
    return this.preview !== null
  }

  private texture(key: string, paint: () => HTMLCanvasElement): THREE.CanvasTexture {
    let texture = this.textures.get(key)
    if (!texture) {
      texture = new THREE.CanvasTexture(paint())
      texture.name = key
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.colorSpace = THREE.SRGBColorSpace
      this.textures.set(key, texture)
    }
    return texture
  }
  private mesh(name: string, width: number, height: number, texture: THREE.CanvasTexture): PixelMesh {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    )
    mesh.name = name
    mesh.scale.y = -1
    this.scene.add(mesh)
    return mesh
  }
  private remove(mesh: THREE.Mesh): void {
    this.scene.remove(mesh)
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) material.dispose()
  }
  private roadTexture(kind: RoadItemKind): THREE.CanvasTexture {
    return this.texture(`road-${kind}`, () => createRoadItemArt(kind))
  }
  private positionItem(
    mesh: PixelMesh,
    state: Readonly<GameState>,
    point: Point,
    anchor: Pick<RoadItemPlacement, 'progress' | 'edgeId' | 'offset'>,
    kind: RoadItemKind,
    healthRatio = 1
  ): void {
    const field = fieldFor(state),
      projection = field.version === 2 ? nearestRoadEdge(field, point) : undefined,
      edge = field.edges.find((value) => value.id === (anchor.edgeId ?? projection?.edgeId)),
      path = edge?.points ?? field.path,
      offset = edge ? (anchor.offset ?? projection?.offset ?? anchor.progress) : anchor.progress,
      before = pointOnPath(path, offset - 1),
      after = pointOnPath(path, offset + 1)
    mesh.position.set(point.x, point.y, point.y / 10)
    const angle = kind === 'spike' ? Math.atan2(after.y - before.y, after.x - before.x) + Math.PI / 2 : 0,
      sprite =
        this.environment?.props[
          kind === 'mud' ? 'mud' : `spike-${healthRatio < 0.5 ? 'damaged' : 'intact'}-${environmentDirection(angle)}`
        ]
    if (sprite) this.paintEnvironment(mesh, sprite, point)
    else {
      this.resize(mesh, 64, 48)
      mesh.material.map = this.roadTexture(kind)
      mesh.rotation.z = angle
      delete mesh.userData.environment
    }
    mesh.renderOrder = -1
  }
  private renderItems(state: Readonly<GameState>, interactive: boolean): void {
    const field = fieldFor(state),
      items = roadItems(state).filter((item) => (item.kind === 'spike' ? item.hp > 0 : item.charges > 0))
    for (const [id, visual] of this.items)
      if (!items.some((item) => item.id === id && item.kind === visual.kind)) {
        this.remove(visual.mesh)
        if (visual.entry) this.remove(visual.entry)
        visual.label.remove()
        visual.button.remove()
        this.items.delete(id)
      }
    if (!items.some((item) => item.id === this.selectedId)) this.selectedId = null
    for (const item of items) {
      let visual = this.items.get(item.id)
      if (!visual) {
        const mesh = this.mesh(`road-${item.kind}:${item.id}`, 64, 48, this.roadTexture(item.kind)),
          label = document.createElement('div'),
          button = document.createElement('button')
        label.className = item.kind === 'spike' ? 'sandbag-health road-item-health' : 'road-item-charges'
        label.dataset.roadItemId = String(item.id)
        if (item.kind === 'spike') {
          label.innerHTML = '<i aria-hidden="true"><b></b></i>'
          label.setAttribute('role', 'progressbar')
          label.setAttribute('aria-label', 'スパイクの耐久')
          label.setAttribute('aria-valuemin', '0')
        } else
          Object.assign(label.style, {
            position: 'absolute',
            transform: 'translate(-50%, 0)',
            pointerEvents: 'none',
            userSelect: 'none',
            color: '#f3dfba',
            background: '#4e3525ba',
            borderRadius: '6px',
            padding: '1px 4px',
            font: 'bold 9px/11px monospace',
            zIndex: '1'
          })
        button.type = 'button'
        button.className = 'sandbag-handle road-item-handle'
        button.dataset.roadItemId = String(item.id)
        button.dataset.roadItemKind = item.kind
        this.host.append(label, button)
        visual = { mesh, label, button, kind: item.kind }
        this.items.set(item.id, visual)
      }
      this.positionItem(visual.mesh, state, item, item, item.kind, item.kind === 'spike' ? item.hp / item.maxHp : 1)
      const detail =
        item.kind === 'spike' ? `スパイク ${Math.ceil(item.hp)} / ${item.maxHp} HP` : `泥 残り ${item.charges} 回`
      visual.label.title = detail
      if (item.kind === 'spike') {
        visual.label.setAttribute('aria-valuenow', String(item.hp))
        visual.label.setAttribute('aria-valuemax', String(item.maxHp))
        visual.label.style.setProperty('--sandbag-hp', `${100 * Math.max(0, Math.min(1, item.hp / item.maxHp))}%`)
        visual.label.dataset.health = item.hp / item.maxHp <= 0.25 ? 'low' : 'normal'
        visual.label.dataset.hp = String(item.hp)
      } else {
        visual.label.textContent = String(item.charges)
        visual.label.setAttribute('aria-label', detail)
        visual.label.dataset.charges = String(item.charges)
        visual.mesh.material.opacity = item.insideIds.length ? 0.88 : 1
        if (item.insideIds.length) {
          visual.entry ??= this.mesh(`road-mud-entry:${item.id}`, 64, 32, this.texture('mud-slow', createMudSlowArt))
          visual.entry.position.set(item.x, item.y, item.y / 10 + 0.1)
          visual.entry.renderOrder = -1
          visual.entry.material.opacity = 0.28 + Math.sin(state.time * 4) * 0.06
        } else if (visual.entry) {
          this.remove(visual.entry)
          visual.entry = undefined
        }
      }
      visual.label.style.left = `${Math.max(30, Math.min(field.width - 30, item.x))}px`
      visual.label.style.top = `${Math.min(field.height - 14, item.y + (item.kind === 'mud' ? 19 : 27))}px`
      visual.button.style.left = `${item.x}px`
      visual.button.style.top = `${item.y}px`
      visual.button.hidden = !interactive || state.phase !== 'preparation'
      visual.button.disabled = state.phase !== 'preparation'
      visual.button.setAttribute('aria-pressed', String(this.selectedId === item.id))
      visual.button.setAttribute('aria-label', `${detail} を選択`)
    }
    const preview = state.economyVersion === 2 && interactive && state.phase === 'preparation' ? this.preview : null,
      finite = preview && Number.isFinite(preview.point.x) && Number.isFinite(preview.point.y)
    this.previewLabel.hidden = !finite
    if (this.ghost) this.ghost.visible = !!finite
    if (!preview || !finite) return
    this.ghost ??= this.mesh('road-item-preview', 64, 48, this.roadTexture(this.previewKind))
    this.ghost.visible = true
    this.ghost.material.map = this.roadTexture(this.previewKind)
    this.ghost.material.opacity = 0.65
    this.ghost.material.color.setHex(preview.valid ? 0x82ffae : 0xff766b)
    this.ghost.userData.kind = this.previewKind
    this.ghost.userData.valid = preview.valid
    this.ghost.userData.reason = preview.reason
    this.positionItem(this.ghost, state, preview.point, preview, this.previewKind)
    this.previewLabel.dataset.valid = String(preview.valid)
    this.previewLabel.style.left = `${Math.max(116, Math.min(field.width - 116, preview.point.x))}px`
    this.previewLabel.style.top = `${Math.min(field.height - 62, preview.point.y + 32)}px`
  }

  private renderGate(state: Readonly<GameState>, interactive: boolean): void {
    const enabled = state.economyVersion === 2,
      gate = enabled ? state.fortifications?.gate : undefined,
      point = fieldFor(state).gate,
      origin = gateMuzzle(state),
      cannonLevel = Math.min(3, Math.max(0, gate?.cannonLevel ?? 0)),
      armorLevel = Math.min(3, Math.max(0, gate?.armorLevel ?? 0)),
      depth = point.y / 10 - 1
    this.gateHandle.hidden = !enabled || !interactive || state.phase !== 'preparation'
    this.gateHandle.disabled = state.phase !== 'preparation'
    this.gateHandle.style.left = `${point.x}px`
    this.gateHandle.style.top = `${point.y + 12}px`
    this.gateHandle.setAttribute('aria-label', `門を強化。門砲 Lv.${cannonLevel}、装甲 Lv.${armorLevel}`)
    this.gateHandle.setAttribute('aria-pressed', String(enabled && this.gateSelected))
    if (armorLevel) {
      this.trim ??= this.mesh(
        'gate-armor',
        192,
        256,
        this.texture(`gate-armor:${armorLevel}`, () => createGateTrimArt(armorLevel))
      )
      this.trim.material.map = this.texture(`gate-armor:${armorLevel}`, () => createGateTrimArt(armorLevel))
      this.trim.position.set(point.x, point.y - 56, depth + 0.1)
      if (this.environment)
        this.paintEnvironment(this.trim, this.environment.props['gate-armor'], { x: point.x, y: point.y - 14 })
      else {
        this.resize(this.trim, 192, 256)
        delete this.trim.userData.environment
      }
      this.trim.userData.level = armorLevel
    }
    if (this.trim) this.trim.visible = armorLevel > 0
    const activeShots = state.phase === 'assault' && cannonLevel > 0 ? (gate?.shots ?? []) : []
    for (const id of this.shotLaunches.keys())
      if (!activeShots.some((shot) => shot.id === id)) this.shotLaunches.delete(id)
    for (const shot of activeShots) {
      if (this.shotLaunches.has(shot.id) || state.time < shot.releaseAt || !['released', 'hit'].includes(shot.status))
        continue
      const angle = Math.atan2(shot.target.y - 18 - shot.origin.y, shot.target.x - shot.origin.x),
        pose = this.turretPose(point, angle)
      if (pose) this.shotLaunches.set(shot.id, { origin: pose.muzzle, angle })
    }
    const aiming = activeShots.findLast(
        (shot) =>
          shot.status !== 'cancelled' &&
          shot.status !== 'missed' &&
          state.time >= shot.startedAt &&
          state.time < shot.impactAt + impactLifetime
      ),
      angle = aiming
        ? (this.shotLaunches.get(aiming.id)?.angle ??
          Math.atan2(aiming.target.y - 18 - aiming.origin.y, aiming.target.x - aiming.origin.x))
        : -Math.PI / 2,
      releaseAge = aiming ? state.time - aiming.releaseAt : -Infinity,
      recoil = releaseAge >= 0 && releaseAge < 0.16 ? Math.sin((releaseAge / 0.16) * Math.PI) * 3 : 0,
      windup = aiming?.status === 'windup' && state.time < aiming.releaseAt
    if (cannonLevel) {
      this.mount ??= this.mesh(
        'gate-cannon-mount',
        40,
        24,
        this.texture('gate-mount', () =>
          painted(40, 24, (context) => {
            ellipse(context, 20, 17, 17, 6, '#243a4050')
            polygon(
              context,
              [
                [6, 18],
                [11, 5],
                [29, 5],
                [34, 18]
              ],
              '#657b7b'
            )
            polygon(
              context,
              [
                [11, 5],
                [29, 5],
                [26, 10],
                [14, 10]
              ],
              '#b0bcb0'
            )
            ellipse(context, 20, 10, 8, 6, '#3f555c')
          })
        )
      )
      this.cannon ??= this.mesh(
        'gate-cannon',
        48,
        32,
        this.texture(`gate-cannon:${cannonLevel}`, () => createCannonArt(cannonLevel))
      )
      this.cannon.material.map = this.texture(`gate-cannon:${cannonLevel}`, () => createCannonArt(cannonLevel))
      this.mount.position.set(origin.x, origin.y + 8, depth + 0.2)
      this.cannon.position.set(origin.x - Math.cos(angle) * recoil, origin.y - Math.sin(angle) * recoil, depth + 0.3)
      this.cannon.rotation.z = angle
      const cannonPose = this.turretPose(point, angle)
      if (cannonPose) {
        this.paintEnvironment(this.cannon, cannonPose.sprite, cannonPose.anchor)
      } else {
        this.resize(this.cannon, 48, 32)
        delete this.cannon.userData.environment
      }
      this.cannon.userData.level = cannonLevel
      this.cannon.userData.phase = windup ? 'windup' : recoil ? 'recoil' : 'idle'
      this.cannon.userData.muzzle = { ...origin }
      this.cannon.userData.visualMuzzle = cannonPose?.muzzle ?? { ...origin }
      this.cannon.userData.mount = cannonPose?.anchor ?? { x: origin.x, y: origin.y + 8 }
      this.cannon.material.color.setHex(windup ? 0xffe6ae : 0xffffff)
      this.muzzle ??= this.mesh(
        'gate-muzzle',
        24,
        24,
        this.texture('gate-impact', () => createShotArt(true))
      )
      this.muzzle.visible = !!aiming && releaseAge >= 0 && releaseAge < 0.1
      this.muzzle.material.opacity = 1 - Math.max(0, releaseAge) / 0.1
      const flash = cannonPose?.muzzle ?? aiming?.origin ?? origin
      this.muzzle.position.set(flash.x, flash.y, depth + 0.4)
      this.muzzle.rotation.z = angle
    }
    for (const mesh of [this.mount, this.cannon]) if (mesh) mesh.visible = cannonLevel > 0
    if (this.mount && this.environment) this.mount.visible = false
    if (!cannonLevel && this.muzzle) this.muzzle.visible = false
    if (enabled && this.gateSelected && cannonLevel) {
      if (!this.gateRange) {
        this.gateRange = new THREE.Mesh(
          new THREE.RingGeometry(FORTIFICATIONS.cannon.range - 2, FORTIFICATIONS.cannon.range, 96),
          new THREE.MeshBasicMaterial({
            color: 0xeacb82,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        )
        this.gateRange.name = 'gate-cannon-range'
        this.scene.add(this.gateRange)
      }
      this.gateRange.position.set(point.x, point.y, -8)
    }
    if (this.gateRange) this.gateRange.visible = enabled && this.gateSelected && cannonLevel > 0
    const active = new Set<string>()
    for (const shot of activeShots) {
      const age = state.time - shot.impactAt,
        targetUnit = state.units.find((unit) => unit.id === shot.targetId),
        flight = shot.status === 'released' && state.time >= shot.releaseAt && age < 0,
        hit = shot.status === 'hit' && age >= 0 && age < impactLifetime
      if (!flight && !hit) continue
      active.add(shot.id)
      let mesh = this.shots.get(shot.id)
      if (!mesh) {
        mesh = this.mesh(
          `gate-shot:${shot.id}`,
          32,
          32,
          this.texture('gate-ball', () => createShotArt(false))
        )
        this.shots.set(shot.id, mesh)
      }
      const target = { x: shot.target.x, y: shot.target.y - 18 * (targetUnit?.boss ? 1.35 : 1) }
      mesh.userData.phase = flight ? 'flight' : 'impact'
      mesh.material.map = this.texture(hit ? 'gate-impact' : 'gate-ball', () => createShotArt(hit))
      if (flight) {
        const visualOrigin = this.shotLaunches.get(shot.id)?.origin ?? shot.origin,
          progress = Math.max(0, Math.min(1, (state.time - shot.releaseAt) / (shot.impactAt - shot.releaseAt))),
          pose = projectilePose(visualOrigin, target, progress, shot.impactAt - shot.releaseAt),
          groundY = point.y + (shot.target.y - point.y) * progress,
          projectedY = visualOrigin.y + (target.y - visualOrigin.y) * progress
        mesh.position.set(pose.position.x, pose.position.y, (groundY + pose.position.y - projectedY - 24) / 10)
        mesh.rotation.z = pose.angle
        mesh.scale.set(0.8, -0.8, 1)
        mesh.material.opacity = 1
      } else {
        mesh.position.set(target.x, target.y, (shot.target.y - 24) / 10 + 0.1)
        mesh.rotation.z = 0
        mesh.scale.set(0.65 + age * 3, -(0.65 + age * 3), 1)
        mesh.material.opacity = 1 - age / impactLifetime
      }
    }
    for (const [id, mesh] of this.shots)
      if (!active.has(id)) {
        this.remove(mesh)
        this.shots.delete(id)
      }
  }

  private renderUnitCues(state: Readonly<GameState>, visibleUnitIds: ReadonlySet<number>): void {
    const activeMud = new Set<number>(),
      activeGear = new Set<number>()
    if (state.economyVersion === 2)
      for (const unit of state.units) {
        if (unit.hp <= 0 || !visibleUnitIds.has(unit.id)) continue
        if (unit.owner === 'ai' && !isAirborneEnemy(unit.type) && (unit.mudSlowUntil ?? 0) > state.time) {
          activeMud.add(unit.id)
          let mesh = this.mudMarks.get(unit.id)
          if (!mesh) {
            mesh = this.mesh(`mud-slow:${unit.id}`, 64, 32, this.texture('mud-slow', createMudSlowArt))
            this.mudMarks.set(unit.id, mesh)
          }
          mesh.position.set(unit.x, unit.y, unit.y / 10)
          mesh.renderOrder = -1
          mesh.material.opacity = 0.6 + Math.sin(state.time * 4 + unit.id) * 0.1
        }
        if (unit.owner === 'player' && unit.equipment) {
          activeGear.add(unit.id)
          let badge = this.badges.get(unit.id)
          if (!badge) {
            badge = document.createElement('div')
            badge.className = 'unit-equipment'
            badge.dataset.unitId = String(unit.id)
            Object.assign(badge.style, {
              position: 'absolute',
              width: '12px',
              height: '12px',
              lineHeight: '12px',
              textAlign: 'center',
              fontSize: '11px',
              color: '#f0d89b',
              background: '#263f39c9',
              borderRadius: '3px',
              pointerEvents: 'none',
              zIndex: '1'
            })
            this.host.append(badge)
            this.badges.set(unit.id, badge)
          }
          badge.dataset.equipment = unit.equipment
          badge.textContent = unit.equipment === 'weapon' ? '⚔' : '⛨'
          badge.title = unit.equipment === 'weapon' ? '武器: 攻撃力 +20%' : '鎧: 最大HP +30%'
          badge.setAttribute('aria-label', badge.title)
          badge.style.left = `${unit.x + 18}px`
          badge.style.top = `${unit.y + 14}px`
        }
      }
    for (const [id, mesh] of this.mudMarks)
      if (!activeMud.has(id)) {
        this.remove(mesh)
        this.mudMarks.delete(id)
      }
    for (const [id, badge] of this.badges)
      if (!activeGear.has(id)) {
        badge.remove()
        this.badges.delete(id)
      }
  }

  render(state: Readonly<GameState>, interactive: boolean, visibleUnitIds: ReadonlySet<number>): void {
    this.renderItems(state, interactive)
    this.renderGate(state, interactive)
    this.renderUnitCues(state, visibleUnitIds)
  }
  diagnostics() {
    return {
      items: [...this.items].map(([id, visual]) => ({
        id,
        kind: visual.kind,
        position: visual.mesh.position.toArray(),
        rotation: visual.mesh.rotation.z,
        environment: visual.mesh.userData.environment ?? null,
        hp: visual.label.dataset.hp,
        charges: visual.label.dataset.charges,
        handleVisible: !visual.button.hidden
      })),
      preview: this.ghost?.visible
        ? {
            ...this.ghost.userData,
            point: { x: this.ghost.position.x, y: this.ghost.position.y },
            label: this.previewLabel.textContent
          }
        : null,
      gate: {
        cannonLevel: this.cannon?.visible ? this.cannon.userData.level : 0,
        armorLevel: this.trim?.visible ? this.trim.userData.level : 0,
        phase: this.cannon?.visible ? this.cannon.userData.phase : null,
        cannonArt: this.cannon?.material.map?.name,
        armorArt: this.trim?.material.map?.name,
        mount: this.cannon?.userData.mount,
        visualMuzzle: this.cannon?.userData.visualMuzzle,
        rangeVisible: this.gateRange?.visible ?? false
      },
      shots: [...this.shots].map(([id, mesh]) => ({
        id,
        phase: mesh.userData.phase,
        position: mesh.position.toArray()
      })),
      slowedUnitIds: [...this.mudMarks.keys()],
      equippedUnitIds: [...this.badges.keys()]
    }
  }
  dispose(): void {
    this.shotLaunches.clear()
    for (const visual of this.items.values()) {
      this.remove(visual.mesh)
      if (visual.entry) this.remove(visual.entry)
      visual.label.remove()
      visual.button.remove()
    }
    for (const mesh of [...this.shots.values(), ...this.mudMarks.values()]) this.remove(mesh)
    for (const badge of this.badges.values()) badge.remove()
    for (const mesh of [this.ghost, this.trim, this.cannon, this.mount, this.muzzle, this.gateRange])
      if (mesh) this.remove(mesh)
    for (const texture of this.textures.values()) texture.dispose()
    this.previewLabel.remove()
    this.gateHandle.remove()
    this.items.clear()
    this.shots.clear()
    this.mudMarks.clear()
    this.badges.clear()
    this.textures.clear()
  }
}
