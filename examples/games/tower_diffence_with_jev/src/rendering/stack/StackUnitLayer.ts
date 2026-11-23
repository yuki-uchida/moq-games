import type * as THREE from 'three'
import { ANIMATION, type CombatAttack, type GameState, type Point, type Unit, type UnitType } from '../../game/model'
import { ATTACK_PROFILES, attackAssetElapsedMs } from '../../game/AttackProfiles'
import { specialMotionActive } from '../../game/SpecialAbilities'
import type { StackDesign, StackMotion } from './StackDesign'
import { StackVisual } from './StackVisual'

export type StackRoster = Readonly<Partial<Record<UnitType, StackDesign>>>

/**
 * Render-only lateral spread for queued monsters. Shared by the stack layer and the DOM health
 * labels so the visible body, its shadow and its bar always agree.
 */
export function unitDisplayOffset(
  unit: Pick<Unit, 'id' | 'owner' | 'facingX' | 'facingY'>,
  spread = 8
): Point {
  const sep = unit.owner === 'ai' ? ((unit.id % 3) - 1) * spread : 0
  return Math.abs(unit.facingX) + Math.abs(unit.facingY) > 0.1
    ? { x: -unit.facingY * sep, y: unit.facingX * sep }
    : { x: sep, y: 0 }
}

export interface StackUnitPose {
  readonly motion: StackMotion
  readonly seconds: number
  readonly loop: boolean
  readonly facingX: number
  readonly facingY: number
  readonly boss: boolean
  readonly cycle?: number
}

/** Animation sampling is simulation-owned: tab freezes, pause and save resume cannot drift hits. */
export function unitStackPose(unit: Unit, time: number, action?: CombatAttack): StackUnitPose {
  const special = specialMotionActive(unit, time)
  const active = !special && action && action.status !== 'cancelled' && time < action.endsAt
  const motion: StackMotion =
    unit.hp <= 0
      ? 'death'
      : special
        ? 'special'
        : active
          ? action.variant === 'breath' || !!action.breath
            ? 'breath'
            : action.kind === 'heal' || unit.type === 'healer'
              ? 'heal'
              : 'attack'
          : unit.moving
            ? 'walk'
            : 'idle'
  return {
    motion,
    seconds: special ? time - unit.specialCast!.startedAt : active ? attackAssetElapsedMs(action, time) / 1000 : time,
    loop: motion === 'idle' || motion === 'walk',
    facingX: active ? (action.aim?.x ?? unit.facingX) : unit.facingX,
    facingY: active ? (action.aim?.y ?? unit.facingY) : unit.facingY,
    boss: unit.boss
  }
}

/** Fast attack, fast decay over ANIMATION.hit; quantized to 10 steps. */
export function hitFlash(unit: Pick<Unit, 'hitAnimation' | 'owner'>): number {
  if (!(unit.hitAnimation > 0)) return 0
  const t = 1 - Math.min(1, unit.hitAnimation / ANIMATION.hit)
  const curve = t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : Math.max(0, 1 - (t - 0.15) / 0.85) ** 1.5
  return Math.round(curve * (unit.owner === 'player' ? 0.5 : 0.85) * 10) / 10
}

const seedOf = (id: number) => ((Math.imul(id + 1, 2654435761) >>> 0) % 1000) / 1000

interface Actor {
  type: UnitType
  visual: StackVisual
  last: Unit
  deadAt?: number
  stride?: { travelled: number; cycle: number }
}

/** Owns sprite-stacked figures independently of the simulation's short corpse retention. */
export class StackUnitLayer {
  readonly errors: Record<string, string> = {}
  private actors = new Map<number, Actor>()
  private preview?: { type: UnitType; visual: StackVisual }
  private warm = new Map<UnitType, StackVisual>()
  private previousState?: Readonly<GameState>
  private previousStage?: number
  private previousField?: string
  private presentationScale = 1
  private presentationAspect = 1

  constructor(
    private readonly scene: THREE.Scene,
    readonly roster: StackRoster
  ) {}

  /** An off-board figure used only to compile the shared program once per design. */
  warmVisual(type: UnitType): StackVisual | undefined {
    const design = this.roster[type]
    if (!design) return undefined
    let visual = this.warm.get(type)
    if (!visual) {
      visual = new StackVisual(design, 0)
      visual.setPresentation(this.presentationScale, this.presentationAspect)
      visual.setPosition(-10000, -10000)
      this.warm.set(type, visual)
    }
    return visual
  }
  setPresentation(scale: number, aspect: number): void {
    this.presentationScale = scale
    this.presentationAspect = aspect
    for (const actor of this.actors.values()) actor.visual.setPresentation(scale, aspect)
    this.preview?.visual.setPresentation(scale, aspect)
  }
  /** Every figure is procedural and built synchronously, so readiness only checks the roster. */
  ready(state: Readonly<GameState>, selected?: UnitType): boolean {
    for (const unit of state.units)
      if (!this.roster[unit.type]) this.errors[unit.type] = `No sprite stack for ${unit.type}`
    if (selected && !this.roster[selected]) this.errors[selected] = `No sprite stack for ${selected}`
    return !Object.keys(this.errors).length
  }
  private sample(actor: Actor, pose: StackUnitPose, time: number): void {
    const profile = ATTACK_PROFILES[actor.type]
    actor.visual.sample({
      ...pose,
      time,
      durationMs: profile?.durationMs ?? 900,
      cueMs: profile?.cueMs ?? 450
    })
  }
  render(state: Readonly<GameState>): void {
    if (this.previousState && (this.previousState !== state || this.previousField !== state.fieldId)) this.clearActors()
    if (this.previousStage !== undefined && this.previousStage !== state.stage) {
      const survivors = new Set(state.units.filter((unit) => unit.hp > 0).map((unit) => unit.id))
      for (const [id, actor] of this.actors) {
        if (survivors.has(id)) delete actor.deadAt
        else {
          actor.visual.dispose()
          this.actors.delete(id)
        }
      }
    }
    this.previousState = state
    this.previousStage = state.stage
    this.previousField = state.fieldId
    const living = new Set<number>()
    for (const unit of state.units) {
      if (unit.hp <= 0 && unit.owner !== 'player') continue
      if (unit.hp > 0) living.add(unit.id)
      let actor = this.actors.get(unit.id)
      if (actor?.type !== unit.type) {
        actor?.visual.dispose()
        this.actors.delete(unit.id)
        actor = undefined
      }
      if (!actor) {
        const design = this.roster[unit.type]
        if (!design) {
          this.errors[unit.type] = `Missing ${unit.type} sprite stack`
          continue
        }
        const visual = new StackVisual(design, seedOf(unit.id))
        visual.setPresentation(this.presentationScale, this.presentationAspect)
        this.scene.add(visual.root)
        actor = { type: unit.type, visual, last: { ...unit } }
        this.actors.set(unit.id, actor)
      }
      actor.last = { ...unit }
      actor.visual.setShadowVisible(unit.hp > 0)
      if (unit.hp <= 0) {
        actor.visual.setPosition(unit.x, unit.y)
        continue
      }
      delete actor.deadAt
      const action = state.attacks.find((a) => a.attackerId === unit.id && a.sequence === unit.attackSequence)
      let pose = unitStackPose(unit, state.time, action)
      if (pose.motion === 'special' && state.phase !== 'assault')
        pose = { ...pose, motion: 'idle', seconds: 0, loop: true }
      if (unit.type === 'paladin' && pose.motion === 'heal')
        pose = { ...pose, motion: 'idle', seconds: state.time, loop: true }
      if (state.phase === 'preparation' && unit.owner === 'player' && pose.motion === 'idle')
        pose = { ...pose, facingX: -1 / this.presentationAspect, facingY: 1 }
      if (pose.motion === 'walk') {
        const rate = actor.visual.walkRate(pose.facingX, pose.facingY, pose.boss) / actor.visual.design.walkDistance
        const step = unit.travelled - (actor.stride?.travelled ?? Infinity)
        const cycle = step >= 0 ? actor.stride!.cycle + step * rate : unit.travelled * rate
        actor.stride = { travelled: unit.travelled, cycle }
        pose = { ...pose, cycle }
      }
      const offset = unitDisplayOffset(unit)
      actor.visual.setPosition(unit.x + offset.x, unit.y + offset.y)
      actor.visual.setAppearance(1, 0xffffff, hitFlash(unit))
      this.sample(actor, pose, state.time)
    }
    for (const [id, actor] of this.actors) {
      if (living.has(id)) continue
      actor.visual.setShadowVisible(false)
      const corpse = state.corpses?.find((c) => c.id === id)
      const deadUnit = state.units.find((u) => u.id === id && u.hp <= 0)
      if ((!corpse && !deadUnit && actor.deadAt === undefined) || (actor.last.owner === 'player' && !deadUnit)) {
        actor.visual.dispose()
        this.actors.delete(id)
        continue
      }
      actor.deadAt ??= corpse?.diedAt ?? state.time
      const elapsed = Math.max(0, state.time - actor.deadAt)
      if (actor.last.owner === 'player') {
        // Allies fall sideways and stay down at full opacity until revived or removed.
        actor.visual.sampleFall(elapsed)
        actor.visual.setAppearance(1)
        continue
      }
      // Enemies sink, squash and dither out.
      const hold = 0.45
      const t = Math.min(1, elapsed / hold)
      actor.visual.sampleFall(elapsed * 0.6)
      actor.visual.setAppearance(Math.max(0, 1 - t), 0xffffff, t < 0.2 ? 0.6 * (1 - t / 0.2) : 0)
      if (elapsed > hold) {
        actor.visual.dispose()
        this.actors.delete(id)
      }
    }
  }
  setPreview(type?: UnitType, point?: Point, facing?: Point, valid = true, preparation = false): void {
    if (!type || !point || !facing) {
      if (this.preview) this.preview.visual.root.visible = false
      return
    }
    if (this.preview?.type !== type) {
      this.preview?.visual.dispose()
      const design = this.roster[type]
      if (!design) return
      const visual = new StackVisual(design, 0.5)
      visual.setPresentation(this.presentationScale, this.presentationAspect)
      this.scene.add(visual.root)
      this.preview = { type, visual }
    }
    const visual = this.preview!.visual
    visual.setPosition(point.x, point.y)
    visual.setAppearance(0.55, valid ? 0xffffff : 0xff9d92)
    visual.sample({
      motion: 'idle',
      seconds: 0,
      time: performance.now() / 1000,
      facingX: preparation ? -1 / this.presentationAspect : facing.x,
      facingY: preparation ? 1 : facing.y,
      boss: false
    })
  }
  visible(id: number): boolean {
    return this.actors.get(id)?.visual.root.visible ?? false
  }
  motion(id: number): StackMotion | undefined {
    return this.actors.get(id)?.visual.motion
  }
  /** Current sprite top above the unit's feet, for HUD label placement. */
  headroom(id: number): number | undefined {
    return this.actors.get(id)?.visual.headroom()
  }
  /** Projectile origin in board units from the caster's emitter part, also for a fallen caster. */
  emitter(attack: Readonly<CombatAttack>, at = attack.releaseAt): Point | undefined {
    const design = this.roster[attack.type]
    if (!design?.emitter) return undefined
    const candidate = this.actors.get(attack.attackerId)
    const live = candidate && candidate.deadAt === undefined ? candidate : undefined
    const visual = live?.visual ?? new StackVisual(design, 0)
    // Use the same render-only lane offset as the visible body so breaths and projectiles leave
    // the mouth of the sprite the player actually sees.
    const offset = live ? unitDisplayOffset(live.last) : { x: 0, y: 0 }
    try {
      visual.setPresentation(this.presentationScale, this.presentationAspect)
      visual.setPosition(attack.origin.x + offset.x, attack.origin.y + offset.y)
      const profile = ATTACK_PROFILES[attack.type]
      visual.sample({
        motion:
          attack.variant === 'breath' || attack.breath
            ? 'breath'
            : attack.kind === 'heal' || attack.type === 'healer'
              ? 'heal'
              : 'attack',
        seconds: attackAssetElapsedMs(attack, at) / 1000,
        boss: !!attack.boss,
        facingX: attack.aim?.x ?? attack.target.x - attack.origin.x,
        facingY: attack.aim?.y ?? attack.target.y - attack.origin.y,
        durationMs: profile?.durationMs,
        cueMs: profile?.cueMs
      })
      const point = visual.emitterPoint()
      return point ? { x: point.x, y: point.y } : undefined
    } finally {
      if (live) {
        // Restore the live figure's own pose on the next render; keep its offset position now.
        visual.setPosition(live.last.x + offset.x, live.last.y + offset.y)
      } else visual.dispose()
    }
  }
  diagnostics() {
    return {
      renderer: 'sprite-stack',
      presentation: { scale: this.presentationScale, aspect: this.presentationAspect },
      errors: { ...this.errors },
      units: [...this.actors].map(([id, actor]) => ({ id, type: actor.type, ...actor.visual.diagnostics() }))
    }
  }
  private clearActors(): void {
    for (const actor of this.actors.values()) actor.visual.dispose()
    this.actors.clear()
  }
  dispose(): void {
    this.clearActors()
    this.preview?.visual.dispose()
    this.preview = undefined
    for (const visual of this.warm.values()) visual.dispose()
    this.warm.clear()
  }
}
