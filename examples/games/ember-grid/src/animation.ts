import { prepareContacts, showContact } from './ImpactPresentation'
import { path, size, type Game, type Unit } from './game'
import type * as THREE from 'three'
import { world, type Point, type Stage } from './stage'
import { ATTACK_PROFILES } from '../../tower_diffence_with_jev/src/game/AttackProfiles'
import type { UnitType } from '../../tower_diffence_with_jev/src/game/model'
import { battleSpeed, reducedMotion } from './settings'

/** Waits ms, but resolves at once while/when the tab is hidden so turns never stall on throttled timers. */
export function pause(ms: number) {
  return new Promise<void>((resolve) => {
    if (document.hidden) return resolve()
    const done = () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', done)
      resolve()
    }
    const timer = setTimeout(done, ms * battleSpeed())
    document.addEventListener('visibilitychange', done)
  })
}
export const snapshot = (game: Game) => game.units.map((u) => ({ ...u }))
type Action = { kind: 'attack' | 'heal'; target: Unit }
export function actionChange(before: Unit[], action: Action) {
  const old = before.find((unit) => unit.id === action.target.id)!
  return {
    target: action.target,
    amount: action.kind === 'attack' ? old.hp - action.target.hp : action.target.hp - old.hp
  }
}
/** Back-to-front order: the far corner is (size-1, 0), the near corner (0, size-1). */
export const depth = (p: Point) => p.y - p.x + size - 1
/** Walk the same legal path as movement rules: through same-side units, never through rocks or foes. */
export function route(game: Game, before: Unit[], from: Unit, to: Point): Point[] {
  return path({ rocks: game.rocks, units: before }, from, to)
}

export const effectKind = (role: string, range: number) =>
  range < 2 ? 'contact' : role === 'archer' ? 'arrow' : role === 'dragon' ? 'fireball' : 'spell'
const unit = (dx: number, dy: number) => {
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

/**
 * Sequences one action on the 3D stage. Every step is timed by pause(), never by animation frames:
 * a hidden tab completes immediately, and the stage samples the same time-based tracks when it renders.
 */
export class BattleAnimation {
  private nodes = new Set<HTMLElement>()
  private version = 0
  constructor(
    private stage: Stage,
    private field: HTMLElement,
    private cue: (role: string) => void
  ) {}
  cancel() {
    this.version++
    this.nodes.forEach((n) => n.remove())
    this.nodes.clear()
    this.stage.release()
  }
  async prepare(roles: string[], progress: (done: number, total: number) => void) {
    try {
      prepareContacts(roles)
    } catch (error) {
      console.warn('Ember contact effect unavailable', error)
    }
    return this.stage.load(roles, progress)
  }
  /** DOM overlay anchored at a projected world point; never intercepts input. */
  private overlay(point: THREE.Vector3) {
    const node = document.createElement('span'),
      at = this.stage.screen(point)
    node.className = 'fx'
    node.setAttribute('aria-hidden', 'true')
    node.style.left = `${at.x}px`
    node.style.top = `${at.y}px`
    this.field.append(node)
    this.nodes.add(node)
    return node
  }
  async present(game: Game, before: Unit[], acting: Unit, action?: Action, speed = 1) {
    const token = this.version,
      live = () => token === this.version
    const from = before.find((u) => u.id === acting.id)!
    const change = action && actionChange(before, action),
      target = change?.target
    const path = route(game, before, from, acting)
    const moved = from.x !== acting.x || from.y !== acting.y
    const reduced = reducedMotion()
    const actor = this.stage.get(acting.id)
    if ((!moved && !target) || !actor) return
    try {
      if (moved) {
        const step = (reduced ? 80 : 220) / speed
        for (let i = 1; i < path.length && live(); i++) {
          actor.facing = unit(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
          actor.track = {
            motion: 'walk',
            start: performance.now(),
            ms: step * battleSpeed(),
            from: path[i - 1],
            to: path[i],
            cycle: i - 1
          }
          await pause(step)
        }
        actor.at = { x: acting.x, y: acting.y }
        actor.track = undefined
      }
      const victim = target && this.stage.get(target.id)
      if (target && victim && live()) {
        actor.facing = unit(target.x - acting.x, target.y - acting.y)
        victim.facing = unit(acting.x - target.x, acting.y - target.y)
        const chest = (p: Point) => world(p, 0.42 * this.stage.figure)
        const profile = ATTACK_PROFILES[acting.role as UnitType]
        const ms = (reduced ? 80 : profile.durationMs) / speed
        const started = performance.now()
        actor.track = {
          motion: action!.kind === 'heal' ? 'heal' : 'attack',
          start: started,
          ms: ms * battleSpeed(),
          clipMs: profile.durationMs
        }
        await pause((profile.cueMs / profile.durationMs) * ms)
        if (!live()) return
        this.cue(acting.role)
        if (action!.kind === 'heal') {
          const effect = this.overlay(chest(target))
          effect.classList.add('healing-effect')
          effect.textContent = `✚ +${change!.amount}`
          // pause() scales by the battle speed itself, so convert the remaining real time back.
          await pause(Math.max(600 / speed, (started + ms * battleSpeed() - performance.now()) / battleSpeed()))
          return
        }
        const kind = effectKind(acting.role, acting.range)
        if (kind !== 'contact') {
          const flight = (reduced ? 80 : 240) / speed
          const origin = this.stage.emitter(acting.id, profile.cueMs) ?? chest(acting)
          const land = this.stage.shoot(kind, origin, chest(target), flight * battleSpeed())
          await pause(flight)
          land()
          if (!live()) return
        }
        const impactedAt = performance.now(),
          reaction = (reduced ? 80 : target.hp === 0 ? 550 : 300) / speed
        victim.track = {
          motion: target.hp === 0 ? 'death' : 'hit',
          start: impactedAt,
          ms: reaction * battleSpeed(),
          push: actor.facing
        }
        const a = this.stage.screen(chest(acting)),
          b = this.stage.screen(chest(target))
        showContact(this.overlay(chest(target)), acting.role, Math.atan2(b.y - a.y, b.x - a.x))
        const number = document.createElement('span')
        number.className = 'damage-number'
        number.textContent = `−${change!.amount}${target.hp === 0 ? ' ✦' : ''}`
        this.overlay(world(target, 0.5 * this.stage.figure)).append(number)
        // Finish both the attack clip's recovery and the victim's reaction.
        const now = performance.now()
        await pause(
          Math.max(
            (started + ms * battleSpeed() - now) / battleSpeed(),
            (impactedAt + reaction * battleSpeed() - now) / battleSpeed(),
            0
          )
        )
      }
    } catch (error) {
      // A failed model must never strand input or change the tactical result.
      console.warn('Ember animation unavailable', error)
    } finally {
      if (live()) {
        this.nodes.forEach((n) => n.remove())
        this.nodes.clear()
        this.stage.release()
      }
    }
  }
}
