import * as THREE from 'three'
import { stageRules, type GameState, type Unit, type UnitType, type Point, type CombatAttack } from '../game/model'
import { ModelAssetCache } from './ModelAssetCache'
import { ModelUnitVisual, unitModelPose, type UnitModelDefinition, type ModelMotion } from './ModelUnitVisual'

export type ModelRoster = Readonly<Partial<Record<UnitType, UnitModelDefinition>>>
interface Actor { type: UnitType; visual: ModelUnitVisual; last: Unit; deadAt?: number }

/** Owns mesh lifetimes independently of the simulation's short corpse retention. */
export class ModelUnitLayer {
  readonly errors: Record<string, string> = {}
  private actors = new Map<number, Actor>()
  private preview?: { type: UnitType; visual: ModelUnitVisual }
  private previousState?: Readonly<GameState>
  private previousStage?: number
  private previousField?: string
  constructor(private readonly scene: THREE.Scene, readonly roster: ModelRoster, readonly cache = new ModelAssetCache()) {}

  private request(type: UnitType, motions: readonly ModelMotion[]): boolean {
    const definition = this.roster[type]
    if (!definition) { this.errors[type] = `No approved animated model for ${type}`; return false }
    let ready = true
    for (const motion of motions) {
      const spec = definition.clips[motion]
      if (!spec) { this.errors[`${type}:${motion}`] = `Missing authored ${motion} model`; ready = false; continue }
      const status = this.cache.request(spec.url)
      if (status !== 'ready') ready = false
      if (status === 'error') this.errors[spec.url] = this.cache.error(spec.url) ?? 'Model load failed'
    }
    return ready
  }
  /** Prefetch only the current formation, selected defender and upcoming wave. */
  ready(state: Readonly<GameState>, selected?: UnitType): boolean {
    let ready = true
    const types = new Set(state.units.filter(unit => unit.hp > 0).map(unit => unit.type))
    if (selected) types.add(selected)
    if (state.phase === 'preparation') {
      const wave = stageRules(state.stage, state.waveBossPolicy)
      for (const type of wave.enemyTypes) types.add(type)
      if (wave.bossType) types.add(wave.bossType)
    }
    for (const type of types) {
      const motions: ModelMotion[] = ['idle', 'walk', type === 'healer' ? 'heal' : 'attack']
      if (type === 'dragon') motions.push('breath')
      if (this.roster[type]?.clips.death) motions.push('death')
      if (!this.request(type, motions)) ready = false
    }
    return ready && !Object.keys(this.errors).length
  }
  render(state: Readonly<GameState>): void {
    if (this.previousState && (this.previousState !== state || this.previousStage !== state.stage || this.previousField !== state.fieldId)) this.clearActors()
    this.previousState = state
    this.previousStage = state.stage
    this.previousField = state.fieldId
    const living = new Set<number>()
    for (const unit of state.units) {
      if (unit.hp <= 0) continue
      living.add(unit.id)
      let actor = this.actors.get(unit.id)
      if (actor?.type !== unit.type) { actor?.visual.dispose(); this.actors.delete(unit.id); actor = undefined }
      if (!actor) {
        const definition = this.roster[unit.type]
        if (!definition) { this.errors[unit.type] = `Missing ${unit.type} model`; continue }
        const visual = new ModelUnitVisual(definition, this.cache)
        this.scene.add(visual.root)
        actor = { type: unit.type, visual, last: { ...unit } }
        this.actors.set(unit.id, actor)
      }
      actor.last = { ...unit }
      const action = state.attacks.find(action => action.attackerId === unit.id && action.sequence === unit.attackSequence)
      let pose = unitModelPose(unit, state.time, action)
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
      try { actor.visual.sample(pose) }
      catch (error) { this.errors[`${unit.type}:${pose.motion}`] = String(error); actor.visual.root.visible = false }
    }
    for (const [id, actor] of this.actors) {
      if (living.has(id)) continue
      const corpse = state.corpses?.find(corpse => corpse.id === id)
      const deadUnit = state.units.find(unit => unit.id === id && unit.hp <= 0)
      if (!corpse && !deadUnit && actor.deadAt === undefined) { actor.visual.dispose(); this.actors.delete(id); continue }
      actor.deadAt ??= corpse?.diedAt ?? state.time
      const elapsed = Math.max(0, state.time - actor.deadAt)
      const hasDeath = !!actor.visual.definition.clips.death
      // Roles without an authored death deliberately retain their last real 3D pose.
      // This is the existing held-pose corpse policy, never an invented death clip.
      if (hasDeath) {
        try { actor.visual.sample({ motion: 'death', seconds: elapsed, loop: false, facingX: actor.last.facingX, facingY: actor.last.facingY, boss: actor.last.boss }) }
        catch (error) { this.errors[`${actor.type}:death`] = String(error) }
      }
      const hold = hasDeath ? 1.2 : .45
      if (elapsed > hold) { actor.visual.dispose(); this.actors.delete(id) }
    }
    this.cache.evict()
  }
  setPreview(type?: UnitType, point?: Point, facing?: Point): void {
    if (!type || !point || !facing) { if (this.preview) this.preview.visual.root.visible = false; return }
    if (this.preview?.type !== type) {
      this.preview?.visual.dispose()
      const definition = this.roster[type]
      if (!definition) return
      const visual = new ModelUnitVisual(definition, this.cache)
      this.scene.add(visual.root)
      this.preview = { type, visual }
    }
    this.preview!.visual.setPosition(point.x, point.y)
    try { this.preview!.visual.sample({ motion: 'idle', seconds: 0, loop: true, facingX: facing.x, facingY: facing.y, boss: false }) }
    catch (error) { this.errors[`${type}:preview`] = String(error) }
  }
  visible(id: number): boolean { return this.actors.get(id)?.visual.root.visible ?? false }
  motion(id: number): ModelMotion | undefined { return this.actors.get(id)?.visual.motion }
  emitter(attack: Readonly<CombatAttack>): Point | undefined {
    const actor = this.actors.get(attack.attackerId)
    if (!actor) return undefined
    try {
      const pose = unitModelPose(actor.last, attack.releaseAt, attack)
      const point = actor.visual.emitterAt(pose)
      return point ? { x: point.x, y: point.y } : undefined
    } catch (error) { this.errors[`${attack.type}:emitter`] = String(error); return undefined }
  }
  diagnostics() {
    return { renderer: 'gltf-mesh', errors: { ...this.errors }, cache: this.cache.diagnostics(),
      units: [...this.actors].map(([id, actor]) => ({ id, type: actor.type, ...actor.visual.diagnostics() })) }
  }
  private clearActors(): void { for (const actor of this.actors.values()) actor.visual.dispose(); this.actors.clear() }
  dispose(): void { this.clearActors(); this.preview?.visual.dispose(); this.cache.dispose() }
}
