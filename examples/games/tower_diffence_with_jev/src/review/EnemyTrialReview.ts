import { Vector3, type Group, type Mesh, type MeshBasicMaterial, type Scene, type Texture } from 'three'
import { CONFIG, DEFINITIONS, combatStats, stageRules, type Point } from '../game/model'
import { attackContact } from '../game/CombatContact'
import { ATTACK_PROFILES, attackAssetElapsedMs, attackTimeScale } from '../game/AttackProfiles'
import { heavyImpactGeometry, insideHeavyImpact } from '../game/HeavyImpact'
import { BREATH_TIMING, breathTickAt, insideBreath } from '../game/BreathGeometry'
import { dragonBreathBodyClips } from '../rendering/DragonBreathArt'
import { authoredClipKey, GameRenderer, spriteDirection } from '../rendering/GameRenderer'
import { authoredRosterClips, DIRECTIONS } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { authoredAxisProjectilePose, authoredEmitter, projectilePose } from '../rendering/ProjectileMotion'
import type { RuntimeAtlasCache } from '../rendering/RuntimeAtlasCache'
import {
  unitTrialsFromURL,
  unitTrialCatalog,
  unitTrialFor,
  ENEMY_TRIAL_TYPES,
  type EnemyTrialType,
  type UnitTrials
} from '../rendering/UnitArtTrial'
import type { SpriteDirection } from '../rendering/UnitSprites'
import type { LastAuthoredFrame } from '../rendering/CorpseVisual'
import {
  createEnemyTrialScene,
  positionBreathTrialWitnesses,
  type BreathTrialBoundary,
  type EnemyTrialOptions
} from './EnemyTrialScene'
const base = new URL('../../../tower-defense-art/', document.baseURI)
const effectClips = authoredEffectClips(base)
const trialCatalog = unitTrialCatalog(base)
let renderer: GameRenderer
let session: ReturnType<typeof createEnemyTrialScene>
let sounds: unknown[] = []
let breathTicks: {
  sequence: number
  tick: number
  nominalAt: number
  appliedAt: number
  shape: unknown
  losses: { id: number; amount: number }[]
  baseDamage: number
}[] = []
function draw() {
  renderer.render(session.engine.state, null, false)
}
function snapshot() {
  const { engine, actor, target } = session
  const assetsReady = renderer.assetsReady(engine.state)
  sounds.push(...engine.takeCombatSounds())
  const diagnostic = renderer as unknown as {
    units: Map<number, { lastFrame?: LastAuthoredFrame; group: Group; body: Mesh<any, MeshBasicMaterial> }>
    textures: Map<string, Texture>
    scene: Scene
    atlasCache: RuntimeAtlasCache
    projectileLaunches: Map<string, Point>
    unitTrials: UnitTrials
    clips: Readonly<Record<string, string>>
  }
  const visual = diagnostic.units.get(actor.id)
  const last = visual?.lastFrame
  const shadows = visual?.group.children.filter(
    (child) => (child as Mesh<any, MeshBasicMaterial>).material?.map === diagnostic.textures.get('shadow')
  ) as Mesh<any, MeshBasicMaterial>[] | undefined
  const shadow = shadows?.[0]
  const root =
    visual && last
      ? visual.body.localToWorld(
          new Vector3(
            (last.atlas.manifest.frameSize.pivot.x - last.atlas.manifest.frameSize.width / 2) /
              last.atlas.manifest.pixelsPerWorldUnit,
            (last.atlas.manifest.frameSize.height / 2 - last.atlas.manifest.frameSize.pivot.y) /
              last.atlas.manifest.pixelsPerWorldUnit,
            0
          )
        )
      : undefined
  const sampled = last?.atlas.sample(last.elapsedMs)
  const attack = engine.state.attacks.find(
    (value) => value.attackerId === actor.id && value.sequence === actor.attackSequence
  )
  const corpse = engine.state.corpses.find((value) => value.id === actor.id)
  const corpseBody = corpse
    ? (diagnostic.scene.getObjectByName(`corpse-body:${corpse.key}`) as Mesh<any, MeshBasicMaterial> | undefined)
    : undefined
  const shape = attack ? heavyImpactGeometry(attack) : null
  const area = attack ? diagnostic.scene.getObjectByName(`heavy-impact:${attack.id}`) : undefined
  const effect = attack
    ? (diagnostic.scene.getObjectByName(`attack-effect:${attack.id}`) as Mesh<any, MeshBasicMaterial> | undefined)
    : undefined
  const effectKind = attack?.breath
    ? 'breath'
    : attack?.projectile && engine.state.time < attack.impactAt
      ? 'projectile'
      : 'impact'
  const effectURL = attack && effectClips[`${actor.type}:${effectKind}`]
  const effectAtlas = effectURL ? diagnostic.atlasCache.get(effectURL) : undefined
  const sourceURL = attack
    ? diagnostic.clips[authoredClipKey(attack, 'attack', spriteDirection(attack.aim!), attack.variant)]
    : undefined
  const sourceAtlas = sourceURL ? diagnostic.atlasCache.get(sourceURL, false) : undefined
  const emitter =
    attack && sourceAtlas
      ? authoredEmitter(
          attack.origin,
          sourceAtlas.manifest,
          attackAssetElapsedMs(attack, attack.releaseAt),
          (actor.boss ? 1.35 : 1) * (unitTrialFor(actor, diagnostic.unitTrials)?.displayScale ?? 1)
        )
      : undefined
  let effectAnchor: Point | undefined
  if (effect?.visible && effectAtlas) {
    const frame = effectAtlas.manifest.frameSize,
      density = effectAtlas.manifest.pixelsPerWorldUnit
    effect.updateMatrixWorld(true)
    const point = effect.localToWorld(
      new Vector3((frame.pivot.x - frame.width / 2) / density, (frame.height / 2 - frame.pivot.y) / density, 0)
    )
    effectAnchor = { x: point.x, y: point.y }
  } else if (effect?.visible) effectAnchor = { x: effect.position.x, y: effect.position.y }
  const flightPhase = attack?.projectile
    ? (engine.state.time - attack.releaseAt) / (attack.impactAt - attack.releaseAt)
    : null
  const axisFlight = ['shaman', 'wraith', 'dragon'].includes(actor.type) && !!unitTrialFor(actor, diagnostic.unitTrials)
  const expectedProjectile =
    attack && emitter && flightPhase !== null && sourceAtlas
      ? axisFlight
        ? authoredAxisProjectilePose(
            emitter,
            { x: attack.target.x, y: attack.target.y - (attack.base ? 22 : 18) },
            flightPhase,
            attack.impactAt - attack.releaseAt,
            sourceAtlas.manifest.direction,
            attack.targetVelocity
          )
        : projectilePose(
            emitter,
            { x: attack.target.x, y: attack.target.y - (attack.base ? 22 : 18) },
            flightPhase,
            attack.impactAt - attack.releaseAt,
            attack.targetVelocity
          )
      : null
  return {
    fixture: session.fixture,
    breathTicks,
    breath: attack?.breath
      ? {
          logicalShape: attack.breath.shape,
          lockedAim: attack.breath.lockedAim,
          nextTick: attack.breath.nextTick,
          visualMouth:
            last?.atlas.manifest.motion === 'attack'
              ? authoredEmitter(
                  attack.origin,
                  last.atlas.manifest,
                  attackAssetElapsedMs(attack, engine.state.time),
                  actor.boss ? 1.35 : 1
                )
              : undefined
        }
      : null,
    deployment: session.deployment,
    stage: engine.state.stage,
    battlefieldVersion: engine.state.battlefieldVersion,
    rules: stageRules(engine.state.stage, engine.state.waveBossPolicy),
    definition: DEFINITIONS[actor.type],
    expectedStats: combatStats(actor, engine.state.stage),
    playerBaseHp: engine.state.playerBaseHp,
    enemiesResolved: engine.state.enemiesResolved,
    corpseRecorded: !!corpse,
    actorPresent: engine.state.units.includes(actor),
    targetContact: attackContact(actor, target, actor.attackRange),
    simulationTime: engine.state.time,
    phase: engine.state.phase,
    assetsReady,
    effectsReady: !effectURL || !!effectAtlas,
    diagnostics: renderer.diagnostics(),
    actor: {
      id: actor.id,
      owner: actor.owner,
      type: actor.type,
      hp: actor.hp,
      maxHp: actor.maxHp,
      boss: actor.boss,
      attack: actor.attack,
      range: actor.attackRange,
      routeId: actor.routeId,
      gateExit: actor.gateExit,
      flight: actor.flight ?? null,
      slowUntil: actor.slowUntil,
      slowFactor: actor.slowFactor,
      speed: actor.speed,
      x: actor.x,
      y: actor.y,
      progress: actor.progress,
      travelled: actor.travelled,
      moving: actor.moving,
      sequence: actor.attackSequence,
      body: {
        character: last?.atlas.manifest.character,
        motion: last?.atlas.manifest.motion,
        variant: last?.atlas.manifest.attackVariant,
        direction: last?.atlas.manifest.direction,
        frame: sampled?.frame.index,
        elapsedMs: last?.elapsedMs,
        durationMs: last?.atlas.manifest.durationMs,
        walkCycleTravel: unitTrialFor(actor, diagnostic.unitTrials)?.walkCycleTravelOverride,
        root: root ? { x: root.x, y: root.y } : null,
        shadow: shadow
          ? {
              count: shadows!.length,
              visible: shadow.visible && visual!.group.visible,
              position: shadow.getWorldPosition(new Vector3()).toArray(),
              opacity: shadow.material.opacity
            }
          : null,
        frameSize: last?.atlas.manifest.frameSize,
        pixelsPerWorldUnit: last?.atlas.manifest.pixelsPerWorldUnit,
        texture: sampled?.texture.name
      }
    },
    target: {
      id: target.id,
      owner: target.owner,
      type: target.type,
      hp: target.hp,
      maxHp: target.maxHp,
      x: target.x,
      y: target.y,
      slowUntil: target.slowUntil,
      slowFactor: target.slowFactor,
      sequence: target.attackSequence,
      frostMist: diagnostic.units.get(target.id)?.group.getObjectByName('frost-debuff-mist')?.visible ?? false
    },
    witnesses: session.witnesses.map((unit) => ({
      id: unit.id,
      hp: unit.hp,
      maxHp: unit.maxHp,
      x: unit.x,
      y: unit.y,
      inside: attack?.breath?.shape
        ? insideBreath(attack.breath.shape, { x: unit.x, y: unit.y - 18 })
        : shape
          ? insideHeavyImpact(shape, unit)
          : null
    })),
    attack: attack
      ? {
          id: attack.id,
          sequence: attack.sequence,
          timeScale: attackTimeScale(attack),
          variant: attack.variant,
          breath: attack.breath,
          damageActive: attack.damageActive,
          base: attack.base,
          boss: attack.boss,
          range: attack.range,
          power: attack.power,
          aim: attack.aim,
          origin: attack.origin,
          target: attack.target,
          targetId: attack.targetId,
          startedAt: attack.startedAt,
          releaseAt: attack.releaseAt,
          impactAt: attack.impactAt,
          endsAt: attack.endsAt,
          projectile: attack.projectile,
          damageHit: attack.damageHit,
          status: attack.status
        }
      : null,
    shape,
    area: area ? { visible: area.visible, phase: area.userData.phase, shape: area.userData.shape } : null,
    effect: effect
      ? {
          visible: effect.visible,
          texture: effect.material.map?.name,
          anchor: effectAnchor,
          angle: effect.rotation.z,
          depth: effect.position.z,
          authored: !!effectAtlas && effect.material.map?.image === effectAtlas.sample(0).texture.image
        }
      : null,
    projectile: {
      sourceURL,
      sourceAtlasReady: !!sourceAtlas,
      sourceCharacter: sourceAtlas?.manifest.character,
      phase: flightPhase,
      emitter,
      launch: attack && diagnostic.projectileLaunches.get(attack.id),
      axisFlight,
      pose: expectedProjectile
    },
    nominalCueMs:
      (attack?.breath ? BREATH_TIMING.startMs : ATTACK_PROFILES[actor.type].cueMs) * attackTimeScale(attack),
    assetCueMs: attack?.breath ? BREATH_TIMING.startMs : ATTACK_PROFILES[actor.type].cueMs,
    nominalCueFrame:
      last?.atlas.manifest.motion === 'attack'
        ? last.atlas.sample(attack?.breath ? BREATH_TIMING.startMs : ATTACK_PROFILES[actor.type].cueMs).frame.index
        : null,
    corpse: corpseBody
      ? {
          texture: corpseBody.material.map?.name,
          visible: corpseBody.visible && !!corpseBody.parent?.visible,
          opacity: corpseBody.material.opacity,
          color: corpseBody.material.color.getHex(),
          ageMs: corpseBody.parent?.userData.ageMs,
          scale: corpseBody.scale.toArray(),
          frame: corpseBody.userData,
          size: { width: corpseBody.material.map?.image.width, height: corpseBody.material.map?.image.height }
        }
      : null,
    sounds
  }
}
async function ready() {
  for (let i = 0; i < 600; i++) {
    draw()
    const status = snapshot()
    if ((status.assetsReady && status.effectsReady) || renderer.assetStatus === 'error') return status
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Enemy review asset readiness timed out')
}
function replaceRenderer(unitTrials: UnitTrials) {
  renderer?.dispose()
  document.getElementById('field')!.replaceChildren()
  renderer = new GameRenderer(document.getElementById('field')!, {
    clips: { ...authoredRosterClips(base), ...dragonBreathBodyClips(base) },
    effectClips,
    unitTrials
  })
}
async function recreateRenderer(options: { wait?: boolean } = {}) {
  const trials = { ...(renderer as unknown as { unitTrials: UnitTrials }).unitTrials }
  replaceRenderer(trials)
  draw()
  return options.wait === false ? snapshot() : ready()
}
async function prepare(
  type: EnemyTrialType,
  direction: SpriteDirection,
  options: EnemyTrialOptions & { wait?: boolean; syntheticBoss?: boolean } = {}
) {
  if (
    options.syntheticBoss &&
    (options.realBoss || ['wolf', 'beetle', 'brute', 'ogre', 'dragon', 'shaman', 'bat', 'wraith'].includes(type))
  )
    throw new Error(
      'Use realBoss for scheduled Wolf/Beetle/Brute/Ogre/Dragon bosses; Shaman, Bat and Wraith have no scheduled boss'
    )
  session = createEnemyTrialScene(type, direction, options)
  if (options.syntheticBoss) {
    session.actor.boss = true
    session.fixture = {
      ...session.fixture,
      boss: 'Synthetic visual boss; does not establish a scheduled boss deployment'
    }
  }
  sounds = []
  breathTicks = []
  replaceRenderer(unitTrialsFromURL(base, new URL(document.baseURI)))
  document.getElementById('frame-label')!.textContent =
    `${type} / ${direction}${options.realBoss ? ` / REAL Stage ${session.engine.state.stage} BOSS` : options.syntheticBoss ? ' / SYNTHETIC visual boss (not scheduled)' : ''}${options.attackVariant ? ' / SCRIPTED second-attack breath' : ''}`
  draw()
  return options.wait === false ? snapshot() : ready()
}
function step() {
  const { engine } = session
  const beforeHp = new Map(engine.state.units.map((unit) => [unit.id, unit.hp]))
  const baseHp = engine.state.playerBaseHp
  const beforeTicks = new Map(engine.state.attacks.map((attack) => [attack.id, attack.breath?.nextTick ?? 0]))
  session.engine.update(CONFIG.step, (state) => renderer.assetsReady(state))
  for (const attack of engine.state.attacks) {
    const previous = beforeTicks.get(attack.id) ?? 0
    if (attack.breath && attack.breath.nextTick > previous) {
      if (attack.breath.nextTick !== previous + 1) throw new Error('Review step combined multiple breath ticks')
      breathTicks.push({
        sequence: attack.sequence,
        tick: previous,
        nominalAt: breathTickAt(attack.startedAt, previous, attackTimeScale(attack)),
        appliedAt: engine.state.time,
        shape: structuredClone(attack.breath.shape),
        losses: [...beforeHp].flatMap(([id, hp]) => {
          const current = engine.state.units.find((unit) => unit.id === id)?.hp ?? 0
          return current < hp ? [{ id, amount: hp - current }] : []
        }),
        baseDamage: baseHp - engine.state.playerBaseHp
      })
    }
  }
  draw()
  return snapshot()
}
async function advance(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 4000) throw new Error('Invalid advance')
  const goal = session.engine.state.time + milliseconds / 1000
  while (session.engine.state.time + CONFIG.step <= goal + 1e-9) {
    const status = await ready()
    if (!status.assetsReady) return status
    const before = session.engine.state.time
    const after = step()
    // A killed final scheduled boss can legally clear the stage and stop the simulation.
    if (session.engine.state.time === before || session.engine.state.phase !== 'assault') return after
  }
  return ready()
}
Object.assign(window, {
  enemyTrialReview: {
    prepare,
    recreateRenderer,
    ready,
    step,
    advance,
    snapshot,
    roles: ENEMY_TRIAL_TYPES,
    directions: DIRECTIONS,
    async setTrial(type: EnemyTrialType, enabled: boolean) {
      if (!ENEMY_TRIAL_TYPES.includes(type)) throw new Error('Unknown enemy trial')
      renderer.setUnitTrial(type, enabled ? trialCatalog[type] : undefined)
      return ready()
    },
    positionBreathWitnesses(boundary: BreathTrialBoundary) {
      return positionBreathTrialWitnesses(session, boundary)
    },
    moveTarget(contact: boolean) {
      const { actor, target } = session
      const x = actor.x + (contact ? (actor.type === 'dragon' ? 120 : 30) : 400),
        y = actor.y + (contact ? 0 : 400)
      Object.assign(target, { x, y, homeX: x, homeY: y })
      return snapshot()
    },
    moveTargetToRange(outside: boolean) {
      const { actor, target } = session
      const x = actor.x + actor.attackRange + (outside ? 0.01 : -0.01)
      Object.assign(target, { x, y: actor.y, homeX: x, homeY: actor.y })
      return snapshot()
    },
    killTarget() {
      session.target.hp = 0
      return step()
    },
    activateDefender() {
      session.target.attackCooldown = 0
      return step()
    },
    kill() {
      session.actor.hp = 0
      return step()
    }
  }
})
document.getElementById('status')!.textContent = 'ready'
