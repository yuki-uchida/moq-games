/**
 * Character actors: players, クロヅメ animals and hologram decoys drawn with ModelKit characters. Smooths the
 * body yaw, derives poses, applies team colours/patterns, looks, passives, cloak (enemies see a shimmer, own team
 * sees translucent), hit flash, anima glow and holograms. Models are pooled per key and disposed when unseen.
 */
import * as THREE from 'three'
import type { CharacterModel, CharacterPose, ModelKit } from '../../models/api'
import type { ItemId } from '../../data/items'
import type { SpeciesId } from '../../data/species'
import type { FoeView, PlayerView, PropView, TeamId, V3, View } from '../../sim/types'
import { emoteFor, derivePose, newPose, stepBodyYaw, type BodyYaw, type PoseSource } from './pose'

export const TEAM_HEX = [0xe5484d, 0x3e8ed0, 0xf2b33d] as const

interface Actor {
  key: string
  model: CharacterModel
  species: SpeciesId
  body: BodyYaw
  pose: CharacterPose
  hurt: number
  flash: number
  seen: number
  passives: string
  online: boolean
  team: number
  cloak: number
  /** Previous position for velocity estimates (foe animals, decoys). */
  last: THREE.Vector3
  vel: THREE.Vector3
  hasLast: boolean
  /** The one mesh allowed to cast a shadow (the largest part). */
  shadow: THREE.Mesh | null
}

/** Characters farther than this from the shadow focus cast no shadow (they are a few pixels tall there). */
const SHADOW_RANGE = 34

const STILL: readonly number[] = [0, 0, 0]

export class Characters {
  readonly group = new THREE.Group()
  private readonly actors = new Map<string, Actor>()
  private frameId = 0
  private readonly tmp = new THREE.Vector3()
  private readonly vel3 = [0, 0, 0]
  private readonly src: Mutable<PoseSource> = {
    v: STILL,
    yaw: 0,
    pitch: 0,
    grounded: true,
    move: 'idle',
    hands: IDLE_HANDS,
    state: 'alive',
    revive: 0,
    reviving: false
  }
  outlines = true
  /** Scales animation time (melee hit-stop). */
  animScale = 1

  constructor(private readonly kit: ModelKit) {}

  private get(key: string, species: SpeciesId, look: 'ark' | 'kurozume'): Actor {
    let a = this.actors.get(key)
    if (a && a.species !== species) {
      this.remove(a)
      a = undefined
    }
    if (!a) {
      const model = this.kit.createCharacter(species, { look, outline: this.outlines })
      model.setLook(look)
      // Only the largest mesh casts a shadow: one shadow draw per character instead of one per part.
      let biggest: THREE.Mesh | null = null
      let most = -1
      model.root.traverse((o) => {
        o.castShadow = false
        o.receiveShadow = true
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const n = mesh.geometry?.getAttribute('position')?.count ?? 0
        if (n > most) {
          most = n
          biggest = mesh
        }
      })
      if (biggest) (biggest as THREE.Mesh).castShadow = true
      a = {
        shadow: biggest,
        key,
        model,
        species,
        body: { yaw: 0, turning: false },
        pose: newPose(),
        hurt: 0,
        flash: 0,
        seen: 0,
        passives: '',
        online: true,
        team: -2,
        cloak: -1,
        last: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        hasLast: false
      }
      this.actors.set(key, a)
      this.group.add(model.root)
    }
    a.seen = this.frameId
    return a
  }

  private remove(a: Actor) {
    this.group.remove(a.model.root)
    a.model.dispose()
    this.actors.delete(a.key)
  }

  /** Model for a player id (muzzles, head tops). */
  model(key: string): CharacterModel | undefined {
    return this.actors.get(key)?.model
  }

  hit(key: string, amount: number) {
    const a = this.actors.get(key)
    if (a) a.flash = Math.max(a.flash, amount)
  }

  hurtFlinch(key: string) {
    const a = this.actors.get(key)
    if (a) a.hurt++
  }

  /** Where the sun's shadow box is centred (set by the renderer each frame). */
  readonly shadowFocus = new THREE.Vector3()

  update(view: View, me: string | undefined, dt: number) {
    this.frameId++
    const animDt = dt * this.animScale
    const mine = view.players.find((p) => p.id === me)
    const myTeam: TeamId | undefined = mine?.team
    const pvp = view.mode === 'pvp'
    for (const p of view.players) this.player(p, view, myTeam, pvp, dt, animDt)
    for (const f of view.foes) if (f.animal) this.animal(f, view, dt, animDt)
    for (const pr of view.props)
      if ((pr.kind === 'decoy' || pr.kind === 'leafDecoy') && pr.species) this.decoy(pr, view, myTeam, pvp, dt, animDt)
    for (const a of this.actors.values()) if (a.seen !== this.frameId) this.remove(a)
    // One shadow draw per nearby character: parts added later (antiques, passives) never cast, far ones neither.
    let i = 0
    for (const a of this.actors.values()) {
      const near = a.model.root.position.distanceToSquared(this.shadowFocus) < SHADOW_RANGE * SHADOW_RANGE
      if (a.shadow) a.shadow.castShadow = near
      if ((this.frameId + i++) % 30 === 0)
        a.model.root.traverse((o) => {
          if (o !== a.shadow) o.castShadow = false
        })
    }
  }

  private player(p: PlayerView, view: View, myTeam: TeamId | undefined, pvp: boolean, dt: number, animDt: number) {
    const a = this.get(p.id, p.species, 'ark')
    const m = a.model
    m.root.visible = p.state !== 'away'
    m.root.position.set(p.p[0], p.p[1], p.p[2])
    const speed = Math.hypot(p.v[0], p.v[2])
    const yaw = p.state === 'alive' ? stepBodyYaw(a.body, p.yaw, speed, dt) : a.body.yaw
    m.root.rotation.y = yaw
    const team = pvp ? p.team : -1
    if (a.team !== team) {
      a.team = team
      if (team >= 0) m.setTeam(TEAM_HEX[team as TeamId], team as TeamId)
      else m.setTeam(null, null)
    }
    this.passives(a, p.passives, p.passivesOnline)
    const ally = myTeam === undefined || p.team === myTeam
    const cloak = p.revealed ? Math.min(p.cloak, 0.3) : ally ? Math.min(p.cloak, 0.55) : p.cloak
    if (Math.abs(cloak - a.cloak) > 0.01) {
      a.cloak = cloak
      m.setCloak(cloak)
    }
    m.setAnima(p.anima / Math.max(1, p.maxAnima))
    a.flash = Math.max(0, a.flash - dt * 7)
    m.setFlash(a.flash)
    const s = this.source(p.v, p.yaw)
    s.pitch = p.pitch
    s.grounded = p.grounded
    s.move = p.move
    s.hands = p.hands
    s.state = p.state
    s.revive = p.revive
    s.reviving = !!p.reviving
    derivePose(s, yaw, a.hurt, emoteFor(view.phase, view, p.team), a.pose)
    m.update(animDt, a.pose)
  }

  private animal(f: FoeView, view: View, dt: number, animDt: number) {
    const an = f.animal!
    const a = this.get(`foe:${f.id}`, an.species, 'kurozume')
    const m = a.model
    m.root.position.set(f.p[0], f.p[1], f.p[2])
    this.velocity(a, f.p, dt)
    const speed = Math.hypot(a.vel.x, a.vel.z)
    const yaw = f.state === 'dying' ? a.body.yaw : stepBodyYaw(a.body, f.yaw, speed, dt)
    m.root.rotation.y = yaw
    a.flash = Math.max(0, a.flash - dt * 7)
    m.setFlash(a.flash)
    m.setAnima(f.hp / Math.max(1, f.maxHp))
    m.root.visible = !(f.state === 'dying' && f.st > 0.4)
    this.vel3[0] = a.vel.x
    this.vel3[1] = a.vel.y
    this.vel3[2] = a.vel.z
    const s = this.source(this.vel3, f.yaw)
    s.pitch = an.pitch
    s.grounded = an.grounded
    s.move = an.move
    s.hands = an.hands
    s.state = f.state === 'dying' ? 'down' : 'alive'
    derivePose(s, yaw, a.hurt, emoteFor(view.phase, view, 'foe'), a.pose)
    m.update(animDt, a.pose)
  }

  private decoy(pr: PropView, view: View, myTeam: TeamId | undefined, pvp: boolean, dt: number, animDt: number) {
    const a = this.get(`prop:${pr.id}`, pr.species!, 'ark')
    const m = a.model
    if (a.cloak !== -5) {
      a.cloak = -5
      m.setHologram(true)
    }
    const team = pvp && typeof pr.team === 'number' && pr.team >= 0 ? pr.team : -1
    if (a.team !== team) {
      a.team = team
      if (team >= 0) m.setTeam(TEAM_HEX[team as TeamId], team as TeamId)
      else m.setTeam(null, null)
    }
    m.root.position.set(pr.p[0], pr.p[1], pr.p[2])
    this.velocity(a, pr.p, dt)
    m.root.rotation.y = pr.yaw
    const fade = pr.life !== undefined && pr.life < 0.5 ? pr.life / 0.5 : 1
    m.root.scale.setScalar(0.85 + 0.15 * fade)
    void myTeam
    this.vel3[0] = a.vel.x
    this.vel3[1] = 0
    this.vel3[2] = a.vel.z
    const s = this.source(this.vel3, pr.yaw)
    s.move = pr.kind === 'decoy' ? 'run' : 'idle'
    derivePose(
      s,
      pr.yaw,
      0,
      emoteFor(view.phase, view, typeof pr.team === 'number' ? (pr.team as TeamId) : 'foe'),
      a.pose
    )
    m.update(animDt, a.pose)
  }

  /** Resets and returns the scratch pose source. */
  private source(v: readonly number[], yaw: number): Mutable<PoseSource> {
    const s = this.src
    s.v = v
    s.yaw = yaw
    s.pitch = 0
    s.grounded = true
    s.move = 'idle'
    s.hands = IDLE_HANDS
    s.state = 'alive'
    s.revive = 0
    s.reviving = false
    return s
  }

  private velocity(a: Actor, p: V3, dt: number) {
    this.tmp.set(p[0], p[1], p[2])
    if (a.hasLast && dt > 0) {
      const k = 1 - Math.exp(-12 * dt)
      a.vel.x += ((this.tmp.x - a.last.x) / dt - a.vel.x) * k
      a.vel.y += ((this.tmp.y - a.last.y) / dt - a.vel.y) * k
      a.vel.z += ((this.tmp.z - a.last.z) / dt - a.vel.z) * k
    }
    a.last.copy(this.tmp)
    a.hasLast = true
  }

  private passives(a: Actor, list: ItemId[], online: boolean) {
    // Cheap change detection without joining every frame.
    let sig = list.length * 31 + (online ? 1 : 0)
    for (const id of list) sig = (sig * 33 + id.charCodeAt(0) + id.length) | 0
    const key = String(sig)
    if (key === a.passives && online === a.online) return
    a.passives = key
    a.online = online
    a.model.setPassives(list, online)
  }

  dispose() {
    for (const a of [...this.actors.values()]) this.remove(a)
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

const IDLE_HANDS: PoseSource['hands'] = [
  { items: [], sel: -1, swap: 0, act: 'idle', charge: 0, cooldown: 0, uses: 0, combo: 0 },
  { items: [], sel: -1, swap: 0, act: 'idle', charge: 0, cooldown: 0, uses: 0, combo: 0 }
]
