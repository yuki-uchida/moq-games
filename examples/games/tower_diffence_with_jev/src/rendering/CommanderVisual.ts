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
import { StackVisual } from './stack/StackVisual'
import { commander } from './stack/designs/commander'

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
  private readonly figure = new StackVisual(commander, 0.4)
  private readonly bubble = document.createElement('div')
  private readonly nameLabel = document.createElement('div')
  private readonly presentation = new CommanderPresentation()
  private disposed = false
  private lastView?: CommanderView
  private renderedMotion: 'idle' | 'attack' | null = null
  private renderedFrameIndex: number | null = null
  private clipReadiness = { idle: false, order: false }

  diagnostics() {
    return {
      ...this.lastView,
      visible: this.figure.root.visible,
      nameVisible: !this.nameLabel.hidden,
      nameZIndex: this.nameLabel.style.zIndex,
      renderer: 'sprite-stack',
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
    _base?: URL
  ) {
    this.figure.root.name = 'jev-commander'
    this.figure.root.userData.presentationOnly = true
    this.figure.setPresentation(1.5, 1)
    this.bubble.hidden = true
    scene.add(this.figure.root)
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
    if (jevMode) this.clipReadiness = { idle: true, order: true }
    this.renderedMotion = null
    this.renderedFrameIndex = null
    const view = this.presentation.view(state, jevMode, state.commanderOrder)
    this.lastView = view
    const adjusted = view.attribution === 'game-adjustment'
    this.bubble.dataset.attribution = view.attribution
    this.bubble.style.color = adjusted ? '#ffc078' : '#fff3cf'
    this.bubble.setAttribute('aria-label', adjusted ? 'Jevの選択と異なる出撃指示' : 'Jev指揮官の直近の指示')
    this.figure.root.visible = false
    this.nameLabel.hidden = true
    this.bubble.hidden = false
    if (!view.visible) {
      this.bubble.hidden = true
      return
    }
    const anchor = commanderAnchor(state.fieldId, state.battlefieldVersion, state.layoutRevision)
    const ordering = view.motion === 'order'
    this.figure.setPosition(anchor.x, anchor.y)
    // The marshal watches the road from beside the enemy entrance, facing the battlefield.
    this.figure.sample({
      motion: ordering ? 'attack' : 'idle',
      seconds: ordering ? view.elapsedMs / 1000 : state.time,
      time: state.time,
      facingX: 1,
      facingY: 0.6,
      boss: false
    })
    this.nameLabel.hidden = false
    this.nameLabel.style.left = `${anchor.x}px`
    this.nameLabel.style.top = `${anchor.y + 10}px`
    this.renderedMotion = ordering ? 'attack' : 'idle'
    this.renderedFrameIndex = ordering ? Math.floor(view.elapsedMs / (1000 / 12)) : 0
    this.bubble.dataset.gestureSource = view.gestureSource ?? ''
    this.bubble.dataset.supportStatus = view.support?.status ?? ''
    this.bubble.dataset.supportTargetId = String(view.support?.targetId ?? '')
    this.bubble.dataset.supportEffect = view.support?.effect ?? ''
    this.bubble.dataset.asset = 'ready'
    this.bubble.style.left = `${Math.min(fieldFor(state).width - 214, anchor.x + 28)}px`
    this.bubble.style.top = `${Math.max(8, anchor.y - (view.gestureSource === 'support' ? 136 : 84))}px`
    const text = view.text
    this.bubble.hidden = !text
    if (this.bubble.textContent !== text) this.bubble.textContent = text
    this.bubble.title = ''
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.renderedMotion = null
    this.renderedFrameIndex = null
    this.clipReadiness = { idle: false, order: false }
    this.figure.dispose()
    this.bubble.remove()
    this.nameLabel.remove()
  }
}
