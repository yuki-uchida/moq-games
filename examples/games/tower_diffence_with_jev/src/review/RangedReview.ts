import { unitTrialsFromURL, unitTrialClips, unitTrialScale } from '../rendering/UnitArtTrial'
import { Vector3, type Mesh, type MeshBasicMaterial, type Scene } from 'three'
import './RosterReview'
import { createRangedReviewScene } from './RangedScene'
import type { GameEngine } from '../game/GameEngine'
import type { CombatSoundEvent } from '../game/CombatSoundEvents'
import { CONFIG, type UnitType } from '../game/model'
import { ATTACK_PROFILES } from '../game/AttackProfiles'
import { GameRenderer, spriteDirection } from '../rendering/GameRenderer'
import { AUTHORED_ROSTER, DIRECTIONS, authoredRosterClips } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { RuntimeAtlasCache } from '../rendering/RuntimeAtlasCache'
import {
  loadEffectWholeFrameAtlas,
  loadRuntimeWholeFrameAtlas,
  sampleWholeFrame,
  type WholeFrameAtlas
} from '../rendering/WholeFrameAtlas'
import {
  authoredEmitter,
  projectilePose,
  authoredAxisProjectilePose,
  arrowArcHeight,
  arrowProjectilePose
} from '../rendering/ProjectileMotion'
import type { SpriteDirection } from '../rendering/UnitSprites'

const RANGED: readonly UnitType[] = [
  'archer',
  'ranger',
  'mage',
  'healer',
  'frost',
  'cannon',
  'shaman',
  'wraith',
  'dragon'
]
const base = new URL('../../../tower-defense-art/', document.baseURI)
const trials = unitTrialsFromURL(base, new URL(document.baseURI)),
  standardClips = authoredRosterClips(base),
  clips = unitTrialClips(standardClips, trials),
  effects = authoredEffectClips(base)
const host = document.getElementById('field')!
let renderer: GameRenderer | undefined
let atlases: WholeFrameAtlas[] = []
let session:
  | {
      engine: GameEngine
      actorId: number
      targetId: number
      attackId: string
      attackAtlas: WholeFrameAtlas
      effectAtlas: WholeFrameAtlas
      healing: boolean
    }
  | undefined
let capturedFrames = new Set<number>()
let capturedSounds: CombatSoundEvent[] = []

async function prepare(
  role: UnitType,
  direction: SpriteDirection,
  options: Parameters<typeof createRangedReviewScene>[2] = {}
) {
  if (!RANGED.includes(role) || !DIRECTIONS.includes(direction)) throw new Error('Unknown review role/direction')
  renderer?.dispose()
  for (const atlas of atlases) atlas.dispose()
  atlases = []
  capturedFrames = new Set()
  capturedSounds = []
  host.replaceChildren()
  const loaded = new Map<string, WholeFrameAtlas>()
  const owner = AUTHORED_ROSTER[role].owner
  const frameKey = `${owner}:${role}:attack:${direction}`
  const effectKey = `${role}:${role === 'healer' ? 'heal' : 'projectile'}`
  const { engine, actor, target, attack } = createRangedReviewScene(role, direction, options)
  const targetDirection = spriteDirection({ x: target.facingX, y: target.facingY })
  const urls = [
    clips[`${target.owner}:${target.type}:idle:${targetDirection}`],
    clips[frameKey],
    clips[`${owner}:${role}:idle:${direction}`],
    effects[effectKey],
    effects[`${role}:muzzle`]
  ].filter(Boolean)
  const effectURLs = new Set(Object.values(effects))
  for (const url of new Set(urls)) {
    const atlas = await (effectURLs.has(url) ? loadEffectWholeFrameAtlas(url) : loadRuntimeWholeFrameAtlas(url))
    loaded.set(url, atlas)
    atlases.push(atlas)
  }
  if (spriteDirection(attack.aim!) !== direction) throw new Error('Review aim did not match the authored direction')
  const attackAtlas = loaded.get(clips[frameKey])!,
    effectAtlas = loaded.get(effects[effectKey])!
  if (!sampleWholeFrame(attackAtlas.manifest, ATTACK_PROFILES[role].cueMs).emitter)
    throw new Error('Missing authored weapon anchor')
  const cache = new RuntimeAtlasCache()
  cache.get = (url) => loaded.get(url)
  renderer = new GameRenderer(host, { clips: standardClips, unitTrials: trials, effectClips: effects, cache })
  session = {
    engine,
    actorId: actor.id,
    targetId: target.id,
    attackId: attack.id,
    attackAtlas,
    effectAtlas,
    healing: role === 'healer'
  }
  document.getElementById('frame-label')!.textContent = `${role} / ${direction}`
  return sample(0)
}

function sample(elapsedMs: number, targetStep?: { x: number; y: number }) {
  if (!session || !renderer || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 1800)
    throw new Error('Invalid review sample')
  const { engine, actorId, targetId, attackId, attackAtlas, effectAtlas, healing } = session
  const attack = engine.state.attacks.find((value) => value.id === attackId)!
  if (!attack) throw new Error('Review attack expired')
  const goal = attack.startedAt + elapsedMs / 1000
  if (targetStep) {
    const target = engine.state.units.find((unit) => unit.id === targetId)!
    if (!Number.isFinite(targetStep.x) || !Number.isFinite(targetStep.y)) throw new Error('Invalid target step')
    target.x += targetStep.x
    target.y += targetStep.y
  }
  while (engine.state.time + 1e-9 < goal) engine.update(CONFIG.step)
  capturedSounds.push(...engine.takeCombatSounds())
  renderer.render(engine.state)
  const actor = engine.state.units.find((unit) => unit.id === actorId)!
  const target = engine.state.units.find((unit) => unit.id === targetId)!
  const origin = authoredEmitter(
    attack.origin,
    attackAtlas.manifest,
    ATTACK_PROFILES[actor.type].cueMs,
    (actor.boss ? 1.35 : 1) * unitTrialScale(actor, trials)
  )!
  const targetPoint = { x: target.x, y: target.y - 18 * (target.boss ? 1.35 : 1) }
  const phase = (engine.state.time - attack.releaseAt) / (attack.impactAt - attack.releaseAt)
  if (phase >= 0 && phase < 1)
    capturedFrames.add(effectAtlas.sample((engine.state.time - attack.releaseAt) * 1000).frame.index)
  const pose =
    actor.type === 'archer' || actor.type === 'ranger'
      ? arrowProjectilePose(
          origin,
          targetPoint,
          phase,
          attack.impactAt - attack.releaseAt,
          attack.targetVelocity,
          arrowArcHeight(attack.aim ? Math.hypot(attack.aim.x, attack.aim.y) : attack.range)
        )
      : actor.type === 'cannon' && trials.cannon
        ? authoredAxisProjectilePose(
            origin,
            targetPoint,
            phase,
            attack.impactAt - attack.releaseAt,
            attackAtlas.manifest.direction
          )
        : projectilePose(origin, targetPoint, phase, attack.impactAt - attack.releaseAt, attack.targetVelocity)
  const scene = (renderer as unknown as { scene: Scene }).scene
  const mesh = scene.getObjectByName(`attack-effect:${attack.id}${healing ? ':heal' : ''}`) as
    | Mesh<any, MeshBasicMaterial>
    | undefined
  const rendered =
    phase >= 0 && phase < 1 && mesh?.visible
      ? (() => {
          const frame = effectAtlas.manifest.frameSize,
            density = effectAtlas.manifest.pixelsPerWorldUnit
          mesh.updateMatrixWorld(true)
          const tip = mesh.localToWorld(
            new Vector3((frame.pivot.x - frame.width / 2) / density, (frame.height / 2 - frame.pivot.y) / density, 0)
          )
          return {
            tip: { x: tip.x, y: tip.y },
            angle: mesh.rotation.z,
            depth: mesh.position.z,
            usesAuthoredTexture:
              mesh.material.map === effectAtlas.sample((engine.state.time - attack.releaseAt) * 1000).texture
          }
        })()
      : undefined
  const result = {
    diagnostics: renderer.diagnostics(),
    actorCharacter: attackAtlas.manifest.character,
    releaseFrame: sampleWholeFrame(attackAtlas.manifest, ATTACK_PROFILES[actor.type].cueMs).index,
    role: actor.type,
    direction: attackAtlas.manifest.direction,
    elapsedMs: (engine.state.time - attack.startedAt) * 1000,
    attackStartedAt: attack.startedAt,
    origin,
    groundOrigin: attack.origin,
    groundTarget: attack.target,
    targetVelocity: attack.targetVelocity,
    arrowArcHeight:
      actor.type === 'archer' || actor.type === 'ranger'
        ? arrowArcHeight(attack.aim ? Math.hypot(attack.aim.x, attack.aim.y) : attack.range)
        : undefined,
    target: targetPoint,
    projectile: pose,
    rendered,
    phase,
    status: attack.status,
    targetHp: target.hp,
    targetSlow: {
      active: target.hp > 0 && target.slowUntil > engine.state.time && target.slowFactor < 1,
      until: target.slowUntil,
      factor: target.slowFactor,
      remaining: Math.max(0, target.slowUntil - engine.state.time)
    },
    soundEvents: structuredClone(capturedSounds),
    damageHit: attack.damageHit,
    healingHit: attack.healing?.hit ?? false,
    healing,
    effectFrames: [...capturedFrames],
    hasEmitter: true,
    actorPosition: { x: actor.x, y: actor.y }
  }
  document.getElementById('status')!.textContent = JSON.stringify(result)
  document.getElementById('frame-label')!.textContent =
    `${actor.type} / ${attackAtlas.manifest.direction} / ${Math.round(result.elapsedMs)}ms`
  return result
}

Object.assign(window, { rangedReview: { prepare, sample, roles: RANGED, directions: DIRECTIONS } })
document.getElementById('status')!.textContent = 'ready'
