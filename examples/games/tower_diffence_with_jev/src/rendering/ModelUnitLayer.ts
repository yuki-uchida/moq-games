import * as THREE from 'three'
import { stageRules, type GameState, type Unit, type UnitType, type Point, type CombatAttack } from '../game/model'
import { ModelAssetCache } from './ModelAssetCache'
import { attackAssetElapsedMs } from '../game/AttackProfiles'
import { ModelUnitVisual, unitModelPose, type UnitModelDefinition, type ModelMotion } from './ModelUnitVisual'

export type ModelRoster = Readonly<Partial<Record<UnitType, UnitModelDefinition>>>
interface Actor {
  type: UnitType
  visual: ModelUnitVisual
  last: Unit
  deadAt?: number
}

/** Owns mesh lifetimes independently of the simulation's short corpse retention. */
export class ModelUnitLayer {
  readonly errors: Record<string, string> = {}
  private actors = new Map<number, Actor>()
  private prepared = new Map<UnitType, ModelUnitVisual>()
  private preview?: { type: UnitType; visual: ModelUnitVisual }
  private previousState?: Readonly<GameState>
  private previousStage?: number
  private previousField?: string
  private presentationScale = 1
  private presentationAspect = 1
  constructor(
    private readonly scene: THREE.Scene,
    readonly roster: ModelRoster,
    // Retain decoded campaign assets until disposal; stage changes must not reload old clips.
    readonly cache = new ModelAssetCache(undefined, Infinity)
  ) {}

  private campaignVisuals = new Map<UnitType, ModelUnitVisual>()
  campaignVisual(type: UnitType): ModelUnitVisual {
    let visual = this.campaignVisuals.get(type)
    if (!visual) {
      visual = new ModelUnitVisual(this.roster[type]!, this.cache)
      visual.setPresentation(this.presentationScale, this.presentationAspect)
      visual.setPosition(-10000, -10000)
      this.campaignVisuals.set(type, visual)
    }
    return visual
  }
  setPresentation(scale: number, aspect: number): void {
    this.presentationScale = scale
    this.presentationAspect = aspect
    for (const actor of this.actors.values()) actor.visual.setPresentation(scale, aspect)
    this.preview?.visual.setPresentation(scale, aspect)
    for (const visual of this.prepared.values()) visual.setPresentation(scale, aspect)
  }

  private request(type: UnitType, motions: readonly ModelMotion[]): boolean {
    const definition = this.roster[type]
    if (!definition) {
      this.errors[type] = `No approved animated model for ${type}`
      return false
    }
    let ready = true
    for (const motion of motions) {
      const spec = definition.clips[motion]
      if (!spec) {
        this.errors[`${type}:${motion}`] = `Missing authored ${motion} model`
        ready = false
        continue
      }
      const status = this.cache.requestSource(spec)
      if (status !== 'ready') ready = false
      if (status === 'error') this.errors[spec.url] = this.cache.error(spec.url) ?? 'Model load failed'
    }
    return ready
  }
  /** Prepare only summonable defenders; keep their first rig off board for GPU warmup. */
  prepareDefender(type: UnitType): boolean {
    if (!this.request(type, ['idle'])) return false
    if (!this.prepared.has(type)) {
      const visual = new ModelUnitVisual(this.roster[type]!, this.cache)
      visual.setPresentation(this.presentationScale, this.presentationAspect)
      visual.setPosition(-10000, -10000)
      visual.sample({ motion: 'idle', seconds: 0, loop: true, facingX: 0, facingY: 1, boss: false })
      this.scene.add(visual.root)
      this.prepared.set(type, visual)
    }
    return true
  }
  setDefenderPreparationVisible(types: readonly UnitType[], visible: boolean): void {
    for (const type of types) {
      const visual = this.prepared.get(type)
      if (visual) {
        visual.root.visible = visible
        if (visible) this.scene.add(visual.root)
        else visual.root.removeFromParent()
      }
    }
  }
  setDefenderPreparationOpacity(types: readonly UnitType[], opacity: number): void {
    for (const type of types) this.prepared.get(type)?.setAppearance(opacity)
  }
  /** Prefetch only the current formation, selected defender and upcoming wave. */
  ready(state: Readonly<GameState>, selected?: UnitType): boolean {
    let ready = true
    const requiredUrls = new Set<string>()
    const types = new Set(state.units.filter((unit) => unit.hp > 0).map((unit) => unit.type))
    for (const attack of state.attacks)
      if (attack.status !== 'cancelled' && state.time < attack.endsAt) types.add(attack.type)
    if (selected) types.add(selected)
    if (state.phase === 'preparation') {
      const wave = stageRules(state.stage, state.waveBossPolicy)
      for (const type of wave.enemyTypes) types.add(type)
      if (wave.bossType) types.add(wave.bossType)
    }
    for (const type of types) {
      const motions: ModelMotion[] = ['idle', 'walk', type === 'healer' ? 'heal' : 'attack']
      if (this.roster[type]?.clips.special) motions.push('special')
      if (type === 'dragon') motions.push('breath')
      if (this.roster[type]?.clips.death) motions.push('death')
      for (const motion of motions) {
        const source = this.roster[type]?.clips[motion]
        if (source) requiredUrls.add(source.url)
      }
      if (!this.request(type, motions)) ready = false
    }
    // A soft cache budget must not evict a required-but-not-yet-played attack
    // and trap a large formation in alternating loading/eviction forever.
    this.cache.setRequiredUrls(requiredUrls)
    return ready && !Object.keys(this.errors).length
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
      if (unit.hp <= 0) continue
      living.add(unit.id)
      let actor = this.actors.get(unit.id)
      if (actor?.type !== unit.type) {
        actor?.visual.dispose()
        this.actors.delete(unit.id)
        actor = undefined
      }
      if (!actor) {
        const definition = this.roster[unit.type]
        if (!definition) {
          this.errors[unit.type] = `Missing ${unit.type} model`
          continue
        }
        const visual = new ModelUnitVisual(definition, this.cache)
        visual.setPresentation(this.presentationScale, this.presentationAspect)
        this.scene.add(visual.root)
        actor = { type: unit.type, visual, last: { ...unit } }
        this.actors.set(unit.id, actor)
      }
      actor.last = { ...unit }
      const action = state.attacks.find(
        (action) => action.attackerId === unit.id && action.sequence === unit.attackSequence
      )
      let pose = unitModelPose(unit, state.time, action)
      if (pose.motion === 'special' && state.phase !== 'assault') pose = { ...pose, motion: 'idle', seconds: 0, loop: true }
      if (unit.type === 'paladin' && pose.motion === 'heal' && !actor.visual.definition.clips.heal) {
        // Existing temporary Paladin healing has no dedicated authored animation.
        // Keep an explicitly neutral pose instead of showing a damaging sword swing.
        pose = { ...pose, motion: 'idle', seconds: 0, loop: false }
      }
      if (pose.motion === 'walk') {
        // Distance-driven stride remains synchronized when frost changes movement speed.
        pose = { ...pose, cycle: unit.travelled / actor.visual.definition.walkDistance }
      }
      actor.visual.setPosition(unit.x, unit.y)
      actor.visual.setAppearance(1, unit.hitAnimation > 0 ? 0xffc3b8 : 0xffffff)
      try {
        actor.visual.sample(pose)
      } catch (error) {
        this.errors[`${unit.type}:${pose.motion}`] = String(error)
        actor.visual.root.visible = false
      }
    }
    for (const [id, actor] of this.actors) {
      if (living.has(id)) continue
      const corpse = state.corpses?.find((corpse) => corpse.id === id)
      const deadUnit = state.units.find((unit) => unit.id === id && unit.hp <= 0)
      if (!corpse && !deadUnit && actor.deadAt === undefined) {
        actor.visual.dispose()
        this.actors.delete(id)
        continue
      }
      actor.deadAt ??= corpse?.diedAt ?? state.time
      const elapsed = Math.max(0, state.time - actor.deadAt)
      const hasDeath = !!actor.visual.definition.clips.death
      // Roles without an authored death deliberately retain their last real 3D pose.
      // This is the existing held-pose corpse policy, never an invented death clip.
      if (hasDeath) {
        try {
          actor.visual.sample({
            motion: 'death',
            seconds: elapsed,
            loop: false,
            facingX: actor.last.facingX,
            facingY: actor.last.facingY,
            boss: actor.last.boss
          })
        } catch (error) {
          this.errors[`${actor.type}:death`] = String(error)
        }
      }
      const hold = hasDeath ? 1.2 : 0.45
      actor.visual.setAppearance(
        hasDeath ? Math.min(1, Math.max(0, (hold - elapsed) / 0.3)) : Math.max(0, 1 - elapsed / hold)
      )
      if (elapsed > hold) {
        actor.visual.dispose()
        this.actors.delete(id)
      }
    }
    this.cache.evict()
  }
  /** At most one actor preparation job per frame; never prepare unused roster entries. */
  prepareNextMotion(
    compile: (scene: THREE.Object3D) => Promise<unknown>,
    prepareFade?: (scene: THREE.Object3D) => Promise<unknown>
  ): Promise<void> | undefined {
    for (const actor of this.actors.values()) {
      if (actor.last.hp <= 0 || actor.deadAt !== undefined) continue
      if (actor.visual.prepareInitialBounds()) return Promise.resolve()
      const pending = actor.visual.prepareNextMotion(compile, prepareFade)
      if (pending) return pending
    }
  }
  setPreview(type?: UnitType, point?: Point, facing?: Point, valid = true): void {
    if (!type || !point || !facing) {
      if (this.preview) this.preview.visual.root.visible = false
      return
    }
    if (this.preview?.type !== type) {
      this.preview?.visual.dispose()
      const definition = this.roster[type]
      if (!definition) return
      const visual = new ModelUnitVisual(definition, this.cache)
      visual.setPresentation(this.presentationScale, this.presentationAspect)
      this.scene.add(visual.root)
      this.preview = { type, visual }
    }
    this.preview!.visual.setPosition(point.x, point.y)
    this.preview!.visual.setAppearance(0.55, valid ? 0xffffff : 0xff9d92)
    try {
      this.preview!.visual.sample({
        motion: 'idle',
        seconds: 0,
        loop: true,
        facingX: facing.x,
        facingY: facing.y,
        boss: false
      })
    } catch (error) {
      this.errors[`${type}:preview`] = String(error)
    }
  }
  visible(id: number): boolean {
    return this.actors.get(id)?.visual.root.visible ?? false
  }
  motion(id: number): ModelMotion | undefined {
    return this.actors.get(id)?.visual.motion
  }
  emitter(attack: Readonly<CombatAttack>, at = attack.releaseAt): Point | undefined {
    const actor = this.actors.get(attack.attackerId)
    const definition = this.roster[attack.type]
    if (!definition) return undefined
    // A restored/in-flight projectile can outlive its caster. Sample an ephemeral
    // real rig at the recorded origin rather than losing the shot or using a sprite.
    const visual = actor?.visual ?? new ModelUnitVisual(definition, this.cache)
    visual.setPresentation(this.presentationScale, this.presentationAspect)
    try {
      visual.setPosition(attack.origin.x, attack.origin.y)
      const point = visual.emitterAt({
        motion:
          attack.variant === 'breath' || attack.breath
            ? 'breath'
            : attack.kind === 'heal' || attack.type === 'healer'
              ? 'heal'
              : 'attack',
        seconds: attackAssetElapsedMs(attack, at) / 1000,
        loop: false,
        boss: !!attack.boss,
        facingX: attack.aim?.x ?? attack.target.x - attack.origin.x,
        facingY: attack.aim?.y ?? attack.target.y - attack.origin.y
      })
      return point ? { x: point.x, y: point.y } : undefined
    } catch (error) {
      this.errors[`${attack.type}:emitter`] = String(error)
      return undefined
    } finally {
      if (actor) {
        visual.setPosition(actor.last.x, actor.last.y)
        visual.root.updateWorldMatrix(true, true)
      } else visual.dispose()
    }
  }
  diagnostics() {
    return {
      renderer: 'gltf-mesh',
      presentation: { scale: this.presentationScale, aspect: this.presentationAspect },
      errors: { ...this.errors },
      cache: this.cache.diagnostics(),
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
    for (const visual of this.prepared.values()) visual.dispose()
    this.prepared.clear()
    for (const visual of this.campaignVisuals.values()) visual.dispose()
    this.campaignVisuals.clear()
    this.cache.dispose()
  }
}
