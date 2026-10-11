import * as THREE from 'three'
import {
  CONFIG,
  getField,
  fieldFor,
  type BattlefieldVersion,
  type LayoutRevision,
  type FieldId,
  type GameState,
  type Point
} from '../game/model'
import { distanceToRoadUnion } from '../game/BattlefieldRoutes'
import { overlapsScenery } from '../game/FieldScenery'
import { CommanderPresentation, type CommanderView } from './CommanderPresentation'
import { RuntimeAtlasCache } from './RuntimeAtlasCache'
import { loadRuntimeWholeFrameAtlas, type WholeFrameAtlas } from './WholeFrameAtlas'

export function commanderAnchor(
  fieldId: FieldId,
  version: BattlefieldVersion = 1,
  layoutRevision: LayoutRevision = 1
): Point {
  const field = getField(fieldId, version, layoutRevision),
    entry = field.path[0]
  const candidates = [
    { x: entry.x + 64, y: entry.y + 104 },
    { x: entry.x + 136, y: entry.y + 88 },
    { x: entry.x + 128, y: entry.y - 88 },
    ...(version === 2 ? [{ x: entry.x + 136, y: entry.y + 40 }] : [])
  ]
  return (
    candidates.find(
      (point) =>
        point.x >= 64 &&
        point.x <= field.width - 64 &&
        point.y >= 100 &&
        point.y <= field.height - 40 &&
        distanceToRoadUnion(field, point) >= CONFIG.roadWidth / 2 + 24 &&
        !overlapsScenery(fieldId, point, 22, version, layoutRevision)
    ) ?? candidates[0]
  )
}

export class CommanderVisual {
  private readonly group = new THREE.Group()
  private readonly body = new THREE.Mesh(
    new THREE.PlaneGeometry(128, 112),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
  )
  private readonly shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({
      color: 0x17291e,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  )
  private readonly bubble = document.createElement('div')
  private readonly nameLabel = document.createElement('div')
  private readonly presentation = new CommanderPresentation()
  private readonly clips: { idle: string; order: string }
  private disposed = false
  private lastView?: CommanderView
  private renderedMotion: 'idle' | 'attack' | null = null
  private renderedFrameIndex: number | null = null
  private clipReadiness = { idle: false, order: false }

  diagnostics() {
    return {
      ...this.lastView,
      visible: this.group.visible,
      nameVisible: !this.nameLabel.hidden,
      nameZIndex: this.nameLabel.style.zIndex,
      bodyPosition: this.body.position.toArray(),
      bodyScale: this.body.scale.toArray(),
      bodyRotation: this.body.rotation.toArray(),
      renderedMotion: this.renderedMotion,
      renderedFrameIndex: this.renderedFrameIndex,
      clipReadiness: { ...this.clipReadiness },
      clipsReady: this.clipReadiness.idle && this.clipReadiness.order,
      asset: this.bubble.dataset.asset ?? null
    }
  }

  constructor(
    private readonly host: HTMLElement,
    private readonly scene: THREE.Scene,
    base: URL,
    private readonly cache = new RuntimeAtlasCache(loadRuntimeWholeFrameAtlas, 4 * 1024 * 1024)
  ) {
    this.clips = {
      idle: new URL('commander/monster_commander-idle-e.json', base).href,
      order: new URL('commander/monster_commander-order-e.json', base).href
    }
    this.group.name = 'jev-commander'
    this.group.visible = false
    this.bubble.hidden = true
    this.group.userData.presentationOnly = true
    this.body.name = 'jev-commander-body'
    this.body.scale.y = -1
    this.shadow.scale.set(18, 7, 1)
    this.shadow.position.z = -0.1
    this.group.add(this.shadow, this.body)
    scene.add(this.group)
    this.bubble.className = 'commander-order'
    this.bubble.setAttribute('aria-live', 'polite')
    this.bubble.setAttribute('aria-label', 'Jev指揮官の直近の指示')
    Object.assign(this.bubble.style, {
      position: 'absolute',
      zIndex: '4',
      width: '204px',
      boxSizing: 'border-box',
      padding: '8px 10px',
      border: '1px solid #dfc78d',
      borderRadius: '12px',
      background: '#193d38ef',
      color: '#fff3cf',
      fontSize: '12px',
      lineHeight: '1.45',
      pointerEvents: 'none'
    })
    this.nameLabel.className = 'commander-name'
    this.nameLabel.textContent = 'Jev指揮官'
    this.nameLabel.hidden = true
    Object.assign(this.nameLabel.style, {
      position: 'absolute',
      zIndex: '4',
      transform: 'translateX(-50%)',
      padding: '2px 7px',
      borderRadius: '7px',
      background: '#193d38df',
      color: '#fff3cf',
      fontSize: '12px',
      fontWeight: '700',
      lineHeight: '1.4',
      whiteSpace: 'nowrap',
      pointerEvents: 'none'
    })
    host.append(this.bubble, this.nameLabel)
  }

  render(state: Readonly<GameState>, jevMode: boolean): void {
    if (this.disposed) return
    this.cache.beginFrame()
    const idle = jevMode ? this.validAtlas(this.clips.idle, 'idle') : undefined
    const order = jevMode ? this.validAtlas(this.clips.order, 'attack') : undefined
    if (jevMode) this.clipReadiness = { idle: !!idle, order: !!order }
    this.renderedMotion = null
    this.renderedFrameIndex = null
    const view = this.presentation.view(state, jevMode, state.commanderOrder)
    this.lastView = view
    const adjusted = view.attribution === 'game-adjustment'
    this.bubble.dataset.attribution = view.attribution
    this.bubble.style.color = adjusted ? '#ffc078' : '#fff3cf'
    this.bubble.setAttribute('aria-label', adjusted ? 'Jevの選択と異なる出撃指示' : 'Jev指揮官の直近の指示')
    this.group.visible = false
    this.nameLabel.hidden = true
    this.bubble.hidden = false
    if (!view.visible) {
      this.bubble.hidden = true
      this.cache.endFrame()
      return
    }
    const anchor = commanderAnchor(state.fieldId, state.battlefieldVersion, state.layoutRevision)
    const atlas = view.motion === 'order' ? (order ?? idle) : idle
    this.group.position.set(anchor.x, anchor.y, (anchor.y - 24) / 10)
    this.group.visible = !!atlas
    this.nameLabel.hidden = !atlas
    this.nameLabel.style.left = `${anchor.x}px`
    this.nameLabel.style.top = `${anchor.y + 10}px`
    if (atlas) {
      this.body.position.set(atlas.anchorOffset.x, atlas.anchorOffset.y, 0)
      const sample = atlas.sample(view.motion === 'order' && order ? view.elapsedMs : state.time * 1000)
      this.body.material.map = sample.texture
      this.renderedMotion = atlas === order ? 'attack' : 'idle'
      this.renderedFrameIndex = sample.frame.index
    }
    const failed = this.cache.error(this.clips.idle) || this.cache.error(this.clips.order)
    this.bubble.dataset.gestureSource = view.gestureSource ?? ''
    this.bubble.dataset.supportStatus = view.support?.status ?? ''
    this.bubble.dataset.supportTargetId = String(view.support?.targetId ?? '')
    this.bubble.dataset.supportEffect = view.support?.effect ?? ''
    this.bubble.dataset.asset = failed ? 'error' : atlas ? 'ready' : 'loading'
    this.bubble.style.left = `${Math.min(fieldFor(state).width - 214, anchor.x + 28)}px`
    this.bubble.style.top = `${Math.max(8, anchor.y - (view.gestureSource === 'support' ? 136 : 84))}px`
    const text = view.text
    this.bubble.hidden = !text
    if (this.bubble.textContent !== text) this.bubble.textContent = text
    this.bubble.title = failed ? '指揮官画像の読み込みに失敗しました' : atlas ? '' : '指揮官画像を読み込み中'
    this.cache.endFrame()
  }

  private validAtlas(url: string, motion: 'idle' | 'attack'): WholeFrameAtlas | undefined {
    const atlas = this.cache.get(url)
    return atlas?.manifest.character === 'monster_commander' &&
      atlas.manifest.direction === 'e' &&
      atlas.manifest.motion === motion &&
      atlas.manifest.events.length === 0 &&
      atlas.manifest.loop === (motion === 'idle')
      ? atlas
      : undefined
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.renderedMotion = null
    this.renderedFrameIndex = null
    this.clipReadiness = { idle: false, order: false }
    this.cache.dispose()
    this.scene.remove(this.group)
    this.body.geometry.dispose()
    this.body.material.dispose()
    this.shadow.geometry.dispose()
    this.shadow.material.dispose()
    this.bubble.remove()
    this.nameLabel.remove()
  }
}
