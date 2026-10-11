import * as THREE from 'three'
import { activeSupportBuff, type SupportCast, type SupportEffect, type SupportEvent } from '../game/CommanderSupport'
import { fieldFor, type GameState, type Point, type Unit } from '../game/model'
import { commanderAnchor } from './CommanderVisual'
import { currentSupportCast, SUPPORT_LABELS } from './CommanderPresentation'

type SupportMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
interface EffectVisual {
  group: THREE.Group
  ring: SupportMesh
  pulse: SupportMesh
  symbol: THREE.Group
  label?: HTMLDivElement
}
const HEAL_SECONDS = 1.15
const COLORS: Record<SupportEffect, number> = { heal: 0x8deda0, speed: 0x79e0f2, armor: 0xa9bbff, attack: 0xffb179 }

function mesh(geometry: THREE.BufferGeometry, color: number, opacity = 1): SupportMesh {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, opacity, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  )
}
function segment(group: THREE.Group, start: Point, end: Point, color: number, width = 2): void {
  const line = mesh(new THREE.PlaneGeometry(Math.hypot(end.x - start.x, end.y - start.y), width), color)
  line.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, 0.01)
  line.rotation.z = Math.atan2(end.y - start.y, end.x - start.x)
  group.add(line)
}
function symbol(effect: SupportEffect): THREE.Group {
  const group = new THREE.Group(),
    color = COLORS[effect]
  group.name = `support-symbol:${effect}`
  if (effect === 'heal') {
    group.add(mesh(new THREE.PlaneGeometry(14, 4), color), mesh(new THREE.PlaneGeometry(4, 14), color))
  } else if (effect === 'speed') {
    for (const x of [-5, 2]) {
      segment(group, { x: x - 4, y: -6 }, { x: x + 3, y: 0 }, color, 3)
      segment(group, { x: x + 3, y: 0 }, { x: x - 4, y: 6 }, color, 3)
    }
  } else if (effect === 'armor') {
    const points = [
      { x: -7, y: -7 },
      { x: 7, y: -7 },
      { x: 7, y: 1 },
      { x: 0, y: 9 },
      { x: -7, y: 1 },
      { x: -7, y: -7 }
    ]
    for (let i = 1; i < points.length; i++) segment(group, points[i - 1], points[i], color)
    segment(group, { x: 0, y: -4 }, { x: 0, y: 4 }, color)
  } else {
    for (const direction of [-1, 1]) {
      segment(group, { x: -6 * direction, y: 7 }, { x: 6 * direction, y: -7 }, color, 3)
      segment(group, { x: -7 * direction, y: 1 }, { x: -1 * direction, y: 7 }, color, 2)
      segment(group, { x: 3 * direction, y: -7 }, { x: 7 * direction, y: -8 }, color)
    }
  }
  return group
}
function createEffect(effect: SupportEffect, casting: boolean): EffectVisual {
  const group = new THREE.Group(),
    ring = mesh(new THREE.RingGeometry(casting ? 16 : 22, casting ? 18 : 24, 48), COLORS[effect], 0.8),
    pulse = mesh(new THREE.RingGeometry(casting ? 21 : 28, casting ? 22 : 29, 48), COLORS[effect], 0.5),
    icon = symbol(effect)
  ring.name = 'support-ring'
  pulse.name = 'support-pulse'
  if (!casting) {
    ring.scale.y = pulse.scale.y = 0.36
    icon.position.set(35, -20, 2)
    const backing = mesh(new THREE.CircleGeometry(12, 24), 0x193d38, 0.92)
    backing.position.z = -0.01
    icon.add(backing)
  }
  group.add(ring, pulse, icon)
  group.userData.presentationOnly = true
  return { group, ring, pulse, symbol: icon }
}
function validTarget(state: Readonly<GameState>, cast: SupportCast): Unit | undefined {
  return state.units.find(
    (unit) =>
      unit.id === cast.target.id &&
      unit.id === cast.action.targetId &&
      unit.type === cast.target.type &&
      unit.owner === 'ai' &&
      unit.hp > 0 &&
      !unit.gateExit
  )
}
function effectLabel(event: SupportEvent, remaining: number): string {
  if (event.action.effect === 'heal') return `HP +${Math.round(event.amount)}`
  const value = Math.round(event.amount * 100),
    unit = event.action.effect === 'armor' ? 'pt' : '%'
  return `${SUPPORT_LABELS[event.action.effect]} +${value}${unit} · ${Math.ceil(remaining)}秒`
}

export class CommanderSupportVisual {
  private effects = new Map<string, EffectVisual>()
  private frame = { cast: null as Record<string, unknown> | null, targets: [] as Record<string, unknown>[] }
  private scope = ''
  private lastTime = -Infinity
  private disposed = false

  constructor(
    private scene: THREE.Scene,
    private host: HTMLElement
  ) {}

  diagnostics() {
    return structuredClone(this.frame)
  }

  render(state: Readonly<GameState>, jevMode: boolean): void {
    if (this.disposed) return
    const scope = `${state.battleId}:${state.fieldId}:${state.stage}`
    if (scope !== this.scope || state.time < this.lastTime) this.clear()
    this.scope = scope
    this.lastTime = state.time
    this.frame = { cast: null, targets: [] }
    const active = new Set<string>(),
      support = state.commanderSupport
    if (state.commanderSupportVersion === 1 && support && state.phase === 'assault') {
      const cast = support.cast
      if (jevMode && cast && currentSupportCast(state, cast) && state.time < cast.applyAt && validTarget(state, cast)) {
        const key = `cast:${cast.id}`,
          visual = this.get(key, cast.action.effect, true),
          anchor = commanderAnchor(state.fieldId, state.battlefieldVersion, state.layoutRevision),
          elapsedMs = (state.time - cast.startedAt) * 1000,
          progress = Math.min(1, (state.time - cast.startedAt) / (cast.applyAt - cast.startedAt))
        active.add(key)
        visual.group.position.set(anchor.x + 39, anchor.y - 42, (anchor.y - 24) / 10 + 2)
        visual.ring.rotation.z = progress * Math.PI
        visual.ring.scale.setScalar(0.65 + 0.35 * progress)
        visual.pulse.scale.setScalar(0.85 + 0.25 * progress)
        visual.pulse.material.opacity = 0.4 + progress * 0.4
        visual.symbol.scale.setScalar(0.7 + progress * 0.3)
        this.frame.cast = {
          id: cast.id,
          effect: cast.action.effect,
          targetId: cast.target.id,
          elapsedMs,
          progress,
          source: cast.source,
          visible: true,
          position: visual.group.position.toArray()
        }
      }
      for (const event of support.history) {
        if (
          !currentSupportCast(state, event) ||
          event.outcome !== 'applied' ||
          !(event.amount > 0) ||
          state.time < event.resolvedAt
        )
          continue
        const unit = validTarget(state, event)
        if (!unit) continue
        const buff = activeSupportBuff(unit, state.time),
          effect = event.action.effect,
          remaining =
            effect === 'heal'
              ? HEAL_SECONDS - (state.time - event.resolvedAt)
              : buff?.expiresAt
                ? buff.expiresAt - state.time
                : 0
        if (remaining <= 1e-9 || (effect !== 'heal' && (buff?.sequence !== event.sequence || buff.effect !== effect)))
          continue
        const key = `target:${event.id}`,
          visual = this.get(key, effect, false),
          age = state.time - event.resolvedAt,
          scale = unit.boss ? 1.2 : 1,
          label = visual.label!,
          text = effectLabel(event, remaining)
        active.add(key)
        visual.group.position.set(unit.x, unit.y, (unit.y - 24) / 10 - 0.25)
        visual.group.scale.setScalar(scale)
        visual.pulse.scale.set(1 + Math.min(age, 1) * 0.25, (1 + Math.min(age, 1) * 0.25) * 0.36, 1)
        visual.pulse.material.opacity =
          effect === 'heal' ? Math.min(0.65, remaining / HEAL_SECONDS) : 0.35 + Math.sin(age * 4) * 0.1
        visual.ring.material.opacity = effect === 'heal' ? Math.min(0.85, remaining * 1.5) : 0.75
        visual.symbol.position.set(35 * scale, -20, 2)
        label.style.left = `${Math.max(72, Math.min(fieldFor(state).width - 72, unit.x))}px`
        label.style.top = `${unit.y + 13}px`
        if (label.textContent !== text) label.textContent = text
        Object.assign(label.dataset, {
          effect,
          targetId: String(unit.id),
          source: 'jev',
          supportId: event.id,
          remaining: String(remaining)
        })
        this.frame.targets.push({
          id: event.id,
          targetId: unit.id,
          effect,
          source: event.source,
          amount: event.amount,
          remaining,
          expiresAt: effect === 'heal' ? event.resolvedAt + HEAL_SECONDS : buff!.expiresAt,
          visible: true,
          text,
          position: visual.group.position.toArray(),
          symbol: visual.symbol.name
        })
      }
    }
    for (const key of this.effects.keys()) if (!active.has(key)) this.remove(key)
  }

  private get(key: string, effect: SupportEffect, casting: boolean): EffectVisual {
    const existing = this.effects.get(key)
    if (existing) return existing
    const visual = createEffect(effect, casting)
    visual.group.name = `commander-support:${key}`
    visual.group.userData.effect = effect
    if (!casting) {
      const label = document.createElement('div')
      label.className = 'commander-support-badge'
      Object.assign(label.style, {
        position: 'absolute',
        zIndex: '2',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        borderRadius: '7px',
        background: '#193d38ef',
        padding: '2px 6px',
        color: `#${COLORS[effect].toString(16)}`,
        fontSize: '11px',
        fontWeight: '700',
        lineHeight: '1.35'
      })
      this.host.append(label)
      visual.label = label
    }
    this.scene.add(visual.group)
    this.effects.set(key, visual)
    return visual
  }

  private remove(key: string): void {
    const visual = this.effects.get(key)
    if (!visual) return
    this.scene.remove(visual.group)
    visual.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        ;(object.material as THREE.Material).dispose()
      }
    })
    visual.label?.remove()
    this.effects.delete(key)
  }

  private clear(): void {
    for (const key of this.effects.keys()) this.remove(key)
  }

  dispose(): void {
    if (this.disposed) return
    this.clear()
    this.frame = { cast: null, targets: [] }
    this.disposed = true
  }
}
