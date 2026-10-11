import { attackAssetElapsedMs } from '../game/AttackProfiles'
import { committedHealAmount } from '../game/HealingActions'
import { UNIT_TRIAL_TYPES, unitTrialsFromURL, type AlliedTrialType } from '../rendering/UnitArtTrial'
import { createRangedReviewScene } from './RangedScene'
import { ATTACK_PROFILES } from '../game/AttackProfiles'
import type { CombatSoundEvent } from '../game/CombatSoundEvents'
import { heavyImpactGeometry, insideHeavyImpact } from '../game/HeavyImpact'
import { Vector3, type Group, type Mesh, type MeshBasicMaterial, type PlaneGeometry, type Scene } from 'three'
import { CONFIG, FIELDS, DEFINITIONS, pointOnPath, type FieldId } from '../game/model'
import { insideBreath, type BreathDirection } from '../game/BreathGeometry'
import { attackContact } from '../game/CombatContact'
import { authoredRosterClips } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { authoredDeathClips } from '../rendering/DeathArt'
import { dragonBreathBodyClips, dragonBreathClips } from '../rendering/DragonBreathArt'
import { GameRenderer } from '../rendering/GameRenderer'
import type { RuntimeAtlasCache } from '../rendering/RuntimeAtlasCache'
import type { LastAuthoredFrame } from '../rendering/CorpseVisual'
import {
  createBreathReviewScene,
  createHeavyImpactReviewScene,
  createLockedHitReviewScene,
  createInterceptionReviewScene,
  type InterceptionReviewKind,
  type LockedHitReviewRole,
  createCommanderReviewScene,
  createContactReviewScene,
  createDeathReviewScene,
  createHealingReviewScene,
  type HealingReviewKind,
  PRESENTATION_FIXTURE_CONTRACT,
  type ContactReviewKind,
  type DeathReviewRole
} from './PresentationScene'

type PixelMesh = Mesh<PlaneGeometry, MeshBasicMaterial>
type Session =
  | ({ kind: 'healing' } & ReturnType<typeof createHealingReviewScene>)
  | ({ kind: 'heavy-impact' } & ReturnType<typeof createHeavyImpactReviewScene>)
  | ({ kind: 'interception' } & ReturnType<typeof createInterceptionReviewScene>)
  | ({ kind: 'locked-hit' } & ReturnType<typeof createLockedHitReviewScene>)
  | ({ kind: 'breath' } & ReturnType<typeof createBreathReviewScene>)
  | ({ kind: 'death' } & ReturnType<typeof createDeathReviewScene>)
  | ({ kind: 'commander' } & ReturnType<typeof createCommanderReviewScene>)
  | ({ kind: 'contact' } & ReturnType<typeof createContactReviewScene>)
type RendererDiagnostics = {
  scene: Scene
  atlasCache: RuntimeAtlasCache
  commander?: { cache: RuntimeAtlasCache }
  units: Map<number, { group: Group; body: PixelMesh; coldMist: PixelMesh; lastFrame?: LastAuthoredFrame }>
}

const base = new URL('../../../tower-defense-art/', document.baseURI)
const clips = { ...authoredRosterClips(base), ...dragonBreathBodyClips(base) }
const breathURLs = dragonBreathClips(base)
const effectClips = { ...authoredEffectClips(base), 'dragon:breath': breathURLs.effect }
const host = document.getElementById('field')!
let renderer: GameRenderer | undefined
let session: Session | undefined
let presentationMs = 10000
let initialSimulationTime = 0
let initialPresentationTime = 10000
let capturedSounds: CombatSoundEvent[] = []

Object.defineProperty(performance, 'now', { configurable: true, value: () => presentationMs })

function current() {
  if (!session || !renderer) throw new Error('Prepare a presentation scene first')
  return { session, renderer, diagnostic: renderer as unknown as RendererDiagnostics }
}

function draw() {
  const { session, renderer } = current()
  renderer.render(session.engine.state)
}

async function waitForAssets(extra: () => boolean = () => true) {
  const deadline = Date.now() + 20000
  for (;;) {
    const { session, renderer } = current()
    draw()
    if (renderer.assetsReady(session.engine.state) && extra()) {
      draw()
      return
    }
    if (Object.keys(renderer.assetErrors).length) throw new Error(JSON.stringify(renderer.assetErrors))
    if (Date.now() > deadline) throw new Error('Timed out waiting for real review PNG assets')
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
}

async function prepare(next: Session, commanderMode = false) {
  renderer?.dispose()
  host.replaceChildren()
  session = next
  capturedSounds = []
  presentationMs = initialPresentationTime = 10000
  initialSimulationTime = session.engine.state.time
  renderer = new GameRenderer(host, {
    clips,
    effectClips,
    deathClips: authoredDeathClips(base),
    commanderBase: base,
    unitTrials: unitTrialsFromURL(base, new URL(document.baseURI))
  })
  renderer.setCommanderMode(commanderMode)
  await waitForAssets()
  return snapshot()
}

function bodyEvidence(unitId: number) {
  const visual = current().diagnostic.units.get(unitId)
  if (!visual) return null
  const frame = visual.lastFrame?.atlas.sample(visual.lastFrame.elapsedMs)
  const manifest = visual.lastFrame?.atlas.manifest
  let mouth: { x: number; y: number } | null = null
  if (frame?.frame.emitter && manifest) {
    visual.body.updateWorldMatrix(true, false)
    const point = visual.body.localToWorld(
      new Vector3(
        (frame.frame.emitter.x - manifest.frameSize.width / 2) / manifest.pixelsPerWorldUnit,
        (manifest.frameSize.height / 2 - frame.frame.emitter.y) / manifest.pixelsPerWorldUnit,
        0
      )
    )
    mouth = { x: point.x, y: point.y }
  }
  return {
    visible: visual.group.visible && visual.body.visible,
    texture: visual.body.material.map?.name ?? null,
    textureId: visual.body.material.map?.uuid ?? null,
    character: manifest?.character ?? null,
    headState: frame?.frame.headState ?? null,
    frameIndex: frame?.frame.index ?? null,
    motion: manifest?.motion ?? null,
    attackVariant: manifest?.attackVariant ?? null,
    direction: manifest?.direction ?? null,
    frameSize: manifest?.frameSize ?? null,
    meshSize: {
      width: visual.body.geometry.parameters.width,
      height: visual.body.geometry.parameters.height
    },
    worldPosition: visual.body.getWorldPosition(new Vector3()).toArray(),
    scale: visual.body.scale.toArray(),
    mouth,
    usesAuthoredTexture: !!frame && visual.body.material.map === frame.texture
  }
}

function snapshot() {
  const { session, renderer, diagnostic } = current()
  const state = session.engine.state
  capturedSounds.push(...session.engine.takeCombatSounds())
  const common = {
    kind: session.kind,
    simulationTime: state.time,
    presentationMs,
    phase: state.phase,
    stage: state.stage,
    assetsReady: renderer.assetsReady(state),
    assetErrors: { ...renderer.assetErrors, ...renderer.presentationAssetErrors },
    soundEvents: structuredClone(capturedSounds),
    actor: {
      id: session.actor.id,
      hp: session.actor.hp,
      maxHp: session.actor.maxHp,
      x: session.actor.x,
      y: session.actor.y,
      progress: session.actor.progress,
      sequence: session.actor.attackSequence,
      body: bodyEvidence(session.actor.id)
    },
    fixture: PRESENTATION_FIXTURE_CONTRACT
  }
  let details: Record<string, unknown> = {}
  if (session.kind === 'healing') {
    const { actor, target, attack } = session,
      mesh = attack ? diagnostic.scene.getObjectByName(`attack-effect:${attack.id}:heal`) : undefined
    details = {
      healingKind: session.healingKind,
      healAmount: DEFINITIONS.healer.heal,
      target: {
        id: target.id,
        hp: target.hp,
        maxHp: target.maxHp,
        x: target.x,
        y: target.y,
        body: bodyEvidence(target.id)
      },
      ally: { id: session.ally.id, hp: session.ally.hp },
      attack: attack
        ? {
            id: attack.id,
            status: attack.status,
            releaseAt: attack.releaseAt,
            impactAt: attack.impactAt,
            targetId: attack.healing?.targetId,
            healingHit: attack.healing?.hit ?? false,
            damageHit: attack.damageHit,
            damageActive: attack.damageActive,
            endsAt: attack.endsAt
          }
        : null,
      selfTarget: attack?.healing?.targetId === actor.id,
      wispVisible: !!mesh?.visible
    }
  } else if (session.kind === 'heavy-impact') {
    const { attack } = session,
      shape = heavyImpactGeometry(attack)!,
      group = diagnostic.scene.getObjectByName(`heavy-impact:${attack.id}`)
    details = {
      elapsedMs: (state.time - attack.startedAt) * 1000,
      attack: {
        status: attack.status,
        power: attack.power,
        damageHit: attack.damageHit,
        targetId: attack.targetId
      },
      shape,
      recipients: [session.target, session.inside, session.outside].map((unit) => ({
        id: unit.id,
        hp: unit.hp,
        x: unit.x,
        y: unit.y,
        inside: insideHeavyImpact(shape, unit),
        body: bodyEvidence(unit.id)
      })),
      area: {
        visible: !!group?.visible,
        phase: group?.userData.phase ?? null,
        shape: group?.userData.shape ?? null,
        z: group?.position.z ?? null
      }
    }
  } else if (session.kind === 'interception') {
    const { actor, target } = session
    const attack = state.attacks.filter((value) => value.attackerId === actor.id).at(-1)
    details = {
      target: { id: target.id, hp: target.hp, x: target.x, y: target.y, body: bodyEvidence(target.id) },
      home: { x: actor.homeX, y: actor.homeY },
      distanceFromHome: Math.hypot(actor.x - actor.homeX, actor.y - actor.homeY),
      leash: DEFINITIONS[actor.type].leash,
      speed: actor.speed,
      returnHomeAt: actor.returnHomeAt ?? 0,
      attack: attack
        ? {
            startedAt: attack.startedAt,
            endsAt: attack.endsAt,
            impactAt: attack.impactAt,
            damageHit: attack.damageHit,
            targetId: attack.targetId,
            status: attack.status
          }
        : null
    }
  } else if (session.kind === 'locked-hit') {
    const { attack, target, actor } = session
    details = {
      elapsedMs: (state.time - attack.startedAt) * 1000,
      releaseAt: attack.releaseAt,
      impactAt: attack.impactAt,
      target: { id: target.id, hp: target.hp, x: target.x, y: target.y, body: bodyEvidence(target.id) },
      range: attack.range,
      distance: Math.hypot(target.x - actor.x, target.y - actor.y),
      status: attack.status,
      lockedTargetId: attack.targetId,
      damageHit: attack.damageHit,
      healingHit: attack.healing?.hit ?? false,
      actionKind: attack.kind ?? 'legacy-coupled',
      healAmount: attack.healing ? committedHealAmount(attack) : 0,
      healingAnimation:
        attack.kind === 'heal' && actor.type === 'paladin'
          ? bodyEvidence(actor.id)?.attackVariant === 'heal'
            ? 'dedicated-heal'
            : 'neutral-whole-body-fallback'
          : undefined,
      power: attack.power,
      targetSlow: {
        active: target.hp > 0 && target.slowUntil > state.time && target.slowFactor < 1,
        until: target.slowUntil,
        factor: target.slowFactor,
        remaining: Math.max(0, target.slowUntil - state.time),
        mistVisible: diagnostic.units.get(target.id)?.coldMist.visible ?? false
      }
    }
  } else if (session.kind === 'breath') {
    const { attack, target } = session
    const elapsedMs = (state.time - attack.startedAt) * 1000
    const mesh = diagnostic.scene.getObjectByName(`attack-effect:${attack.id}`) as PixelMesh | undefined
    const atlas = diagnostic.atlasCache.get(breathURLs.effect, false)
    let renderedMouth = null
    if (mesh?.visible && atlas) {
      mesh.updateWorldMatrix(true, false)
      const { width, height, pivot } = atlas.manifest.frameSize
      const density = atlas.manifest.pixelsPerWorldUnit
      const point = mesh.localToWorld(new Vector3((pivot.x - width / 2) / density, (height / 2 - pivot.y) / density, 0))
      renderedMouth = { x: point.x, y: point.y }
    }
    details = {
      elapsedMs,
      attackId: attack.id,
      attackStatus: attack.status,
      nextTick: attack.breath!.nextTick,
      shape: attack.breath!.shape,
      lockedAim: attack.breath!.lockedAim ?? null,
      targetHp: target.hp,
      targetInside: !!attack.breath!.shape && insideBreath(attack.breath!.shape, { x: target.x, y: target.y - 18 }),
      beam: {
        visible: mesh?.visible ?? false,
        mouth: renderedMouth,
        angle: mesh?.rotation.z ?? null,
        scale: mesh?.scale.x ?? null,
        texture: mesh?.material.map?.name ?? null,
        usesAuthoredTexture:
          !!mesh?.visible &&
          !!atlas &&
          mesh.material.map === atlas.sample(attackAssetElapsedMs(attack, state.time) - 480).texture
      }
    }
  } else if (session.kind === 'death') {
    const corpse = state.corpses.find((value) => value.id === session.actor.id)
    const group = corpse ? diagnostic.scene.getObjectByName(`corpse:${corpse.key}`) : undefined
    const body = corpse
      ? (diagnostic.scene.getObjectByName(`corpse-body:${corpse.key}`) as PixelMesh | undefined)
      : undefined
    details = {
      corpse: corpse ?? null,
      death: group
        ? {
            visible: group.visible,
            state: group.userData.state,
            frameIndex: body?.userData.frameIndex ?? null,
            source: body?.userData.source ?? null,
            texture: body?.material.map?.name ?? null,
            textureId: body?.material.map?.uuid ?? null,
            meshSize: body ? { width: body.geometry.parameters.width, height: body.geometry.parameters.height } : null,
            worldPosition: body?.getWorldPosition(new Vector3()).toArray() ?? null,
            scale: body?.scale.toArray() ?? null,
            x: group.position.x,
            y: group.position.y
          }
        : null,
      corpseCount: diagnostic.scene.children.filter((object) => object.name.startsWith('corpse:')).length
    }
  } else if (session.kind === 'commander') {
    const group = diagnostic.scene.getObjectByName('jev-commander')
    const body = diagnostic.scene.getObjectByName('jev-commander-body') as PixelMesh | undefined
    const bubble = host.querySelector<HTMLDivElement>('.commander-order'),
      name = host.querySelector<HTMLDivElement>('.commander-name')
    details = {
      requestCount: session.requestCount(),
      evidence: state.commanderOrder,
      unitCount: state.units.length,
      commander: {
        visible: group?.visible ?? false,
        presentationOnly: group?.userData.presentationOnly ?? false,
        texture: body?.material.map?.name ?? null,
        name: name?.textContent ?? '',
        nameHidden: name?.hidden ?? true,
        namePosition: { x: parseFloat(name?.style.left ?? '0'), y: parseFloat(name?.style.top ?? '0') },
        anchor: group ? { x: group.position.x, y: group.position.y } : null,
        bubbleHidden: bubble?.hidden ?? true,
        bubble: bubble?.textContent ?? '',
        attribution: bubble?.dataset.attribution ?? null,
        asset: bubble?.dataset.asset ?? null
      }
    }
  } else {
    const attack = state.attacks.find((value) => value.attackerId === session.actor.id)
    const bag = state.sandbags[0]
    const target = session.contactKind === 'base' ? FIELDS.meadow.path.at(-1)! : (bag ?? session.target)
    const targetKind = bag ? 'sandbag' : session.contactKind === 'base' ? 'base' : 'unit'
    details = {
      targetHp: session.target.hp,
      baseHp: state.playerBaseHp,
      bagHp: bag?.hp ?? null,
      bagVisual: bag
        ? (() => {
            const mesh = diagnostic.scene.getObjectByName(`road-sandbag:${bag.id}`) as PixelMesh | undefined
            const label = host.querySelector<HTMLElement>(`.sandbag-health[data-sandbag-id="${bag.id}"]`)
            return {
              renderOrder: mesh?.renderOrder,
              depthWrite: mesh?.material.depthWrite,
              visible: mesh?.visible,
              unitRenderOrders: [...diagnostic.units.values()].map((v) => v.body.renderOrder),
              top: label?.style.top,
              hp: label?.dataset.hp,
              max: label?.getAttribute('aria-valuemax')
            }
          })()
        : null,
      contact: attackContact(session.actor, target, session.actor.attackRange, targetKind),
      attack: attack
        ? {
            status: attack.status,
            base: attack.base,
            barrierId: attack.barrierId ?? null,
            target: attack.target
          }
        : null
    }
  }
  const result = { ...common, ...details }
  document.getElementById('status')!.textContent = JSON.stringify(result)
  document.getElementById('frame-label')!.textContent =
    `${session.kind} / simulation ${state.time.toFixed(3)}s / presentation ${presentationMs}ms`
  return result
}

async function sample(elapsedMs: number) {
  const { session, renderer } = current()
  const goal = initialSimulationTime + elapsedMs / 1000
  if (!Number.isFinite(elapsedMs) || goal < session.engine.state.time - 1e-8 || elapsedMs > 12000)
    throw new Error('Review samples must be monotonic and within 12 seconds')
  while (session.engine.state.time + CONFIG.step <= goal + 1e-9) {
    await waitForAssets()
    const before = session.engine.state.time
    session.engine.update(CONFIG.step, (state) => renderer.assetsReady(state))
    if (session.engine.state.time === before) throw new Error('Review simulation stopped before the requested sample')
    presentationMs = initialPresentationTime + (session.engine.state.time - initialSimulationTime) * 1000
    draw()
  }
  await waitForAssets()
  return snapshot()
}

const api = {
  preparePaladin: (kind: 'injured' | 'near-full' | 'full', direction: BreathDirection = 'e') => {
    const missing = { injured: 10, 'near-full': 3, full: 0 }[kind]
    if (missing === undefined) throw new Error('Unknown paladin review health')
    const scene = createRangedReviewScene('paladin', direction, { distance: 35, actorMissingHp: missing })
    return prepare({ kind: 'locked-hit', ...scene })
  },
  killPaladinTarget: () => {
    const { session } = current()
    if (session.kind !== 'locked-hit' || session.actor.type !== 'paladin')
      throw new Error('Prepare a paladin attack first')
    session.target.hp = 0
    session.engine.update(CONFIG.step)
    presentationMs += CONFIG.step * 1000
    draw()
    return snapshot()
  },
  prepareHealing: (kind: HealingReviewKind, direction: BreathDirection = 'e') =>
    prepare({ kind: 'healing', ...createHealingReviewScene(kind, direction) }),
  killHealingTarget: () => {
    const { session } = current()
    if (session.kind !== 'healing') throw new Error('Prepare a healing scene first')
    session.target.hp = 0
    draw()
    return snapshot()
  },
  prepareTrialIdle: (type: AlliedTrialType, direction: BreathDirection) => {
    if (!UNIT_TRIAL_TYPES.includes(type)) throw new Error('Unknown trial role')
    const scene = createRangedReviewScene(type, direction, {
      distance: ATTACK_PROFILES[type].flightMs ? 120 : 35
    })
    scene.engine.state.phase = 'preparation'
    scene.engine.state.attacks = []
    scene.actor.attackSequence = 0
    return prepare({ kind: 'death', ...scene })
  },
  prepareTrialAttack: (type: AlliedTrialType, direction: BreathDirection) => {
    if (!UNIT_TRIAL_TYPES.includes(type)) throw new Error('Unknown trial role')
    return prepare({
      kind: 'locked-hit',
      ...createRangedReviewScene(type, direction, { distance: ATTACK_PROFILES[type].flightMs ? 120 : 35 })
    })
  },
  prepareSoldierIdle: (direction: BreathDirection) => {
    const scene = createRangedReviewScene('soldier', direction, { distance: 35 })
    scene.engine.state.phase = 'preparation'
    scene.engine.state.attacks = []
    scene.actor.attackSequence = 0
    return prepare({ kind: 'death', ...scene })
  },
  prepareSoldierAttack: (direction: BreathDirection) =>
    prepare({ kind: 'locked-hit', ...createRangedReviewScene('soldier', direction, { distance: 35 }) }),
  prepareHeavyImpact: (type: 'brute' | 'ogre', direction: BreathDirection, boss = false) =>
    prepare({ kind: 'heavy-impact', ...createHeavyImpactReviewScene(type, direction, boss) }),
  moveHeavyPrimaryOutside() {
    const { session } = current()
    if (session.kind !== 'heavy-impact') throw new Error('Prepare heavy impact first')
    const shape = heavyImpactGeometry(session.attack)!,
      aim = session.attack.aim!,
      length = Math.hypot(aim.x, aim.y)
    const point = {
      x: shape.origin.x + (aim.x / length) * (shape.radius + 130),
      y: shape.origin.y + (aim.y / length) * (shape.radius + 130)
    }
    Object.assign(session.target, point, { homeX: point.x, homeY: point.y })
    draw()
    return snapshot()
  },
  prepareInterception: (kind: InterceptionReviewKind) =>
    prepare({ kind: 'interception', ...createInterceptionReviewScene(kind) }),
  moveInterceptionTargetAway() {
    const { session } = current()
    if (session.kind !== 'interception') throw new Error('Prepare interception first')
    Object.assign(session.target, pointOnPath(FIELDS.meadow.path, 1500), { progress: 1500, speed: 0 })
    draw()
    return snapshot()
  },
  prepareLockedHit: (role: LockedHitReviewRole) => prepare({ kind: 'locked-hit', ...createLockedHitReviewScene(role) }),
  prepareBreath: (direction: BreathDirection) => prepare({ kind: 'breath', ...createBreathReviewScene(direction) }),
  prepareDeath: (role: DeathReviewRole, direction: BreathDirection) =>
    prepare({ kind: 'death', ...createDeathReviewScene(role, direction) }),
  async prepareCommander(jevMode = true, fieldId: FieldId = 'meadow') {
    const scene = createCommanderReviewScene(fieldId)
    await prepare({ kind: 'commander', ...scene }, jevMode)
    scene.engine.update(CONFIG.step)
    await Promise.resolve()
    await waitForAssets(() => {
      const cache = current().diagnostic.commander?.cache
      return (
        !jevMode ||
        !!(
          cache?.get(new URL('commander/monster_commander-idle-e.json', base).href, false) &&
          cache.get(new URL('commander/monster_commander-order-e.json', base).href, false)
        )
      )
    })
    return snapshot()
  },
  prepareContact: (kind: ContactReviewKind) => prepare({ ...createContactReviewScene(kind), kind: 'contact' }),
  async prepareSandbagOverlap() {
    await prepare({ ...createContactReviewScene('sandbag'), kind: 'contact' })
    const { session } = current()
    if (session.kind !== 'contact') throw new Error('Wrong review kind')
    const bag = session.engine.state.sandbags[0]
    bag.hp = bag.maxHp * 0.6
    Object.assign(session.actor, { x: bag.x + 7, y: bag.y + 8, speed: 0, attackCooldown: 10000 })
    Object.assign(session.target, { x: bag.x - 9, y: bag.y + 4, homeX: bag.x - 9, homeY: bag.y + 4 })
    await waitForAssets()
    return snapshot()
  },
  setSandbagHp(hp: number) {
    const { session } = current()
    const bag = session.engine.state.sandbags[0]
    if (!bag || !Number.isFinite(hp) || hp < 0 || hp > bag.maxHp) throw new Error('Invalid review bag HP')
    bag.hp = hp
    if (hp === 0) session.engine.state.sandbags = []
    draw()
    return snapshot()
  },
  removeSandbag() {
    const { session } = current()
    const bag = session.engine.state.sandbags[0]
    if (!bag || !session.engine.removeSandbag(bag.id)) throw new Error('Could not remove review bag')
    draw()
    return snapshot()
  },
  sample,
  snapshot: () => {
    draw()
    return snapshot()
  },
  stepWithAssetGate() {
    const { session, renderer } = current()
    session.engine.update(CONFIG.step, (state) => renderer.assetsReady(state))
    draw()
    return snapshot()
  },
  moveBreathTargetOutside() {
    const { session } = current()
    if (session.kind !== 'breath' || !session.attack.breath?.shape) throw new Error('Breath must be emitting first')
    const { origin, direction } = session.attack.breath.shape
    Object.assign(session.target, {
      x: origin.x - direction.x * 120,
      y: origin.y - direction.y * 120 + 18,
      homeX: origin.x - direction.x * 120,
      homeY: origin.y - direction.y * 120 + 18
    })
    return snapshot()
  },
  async killActor() {
    const { session } = current()
    if (
      session.kind !== 'death' &&
      session.kind !== 'breath' &&
      (session.kind !== 'locked-hit' || session.actor.type !== 'paladin')
    )
      throw new Error('This fixture has no kill hook')
    session.actor.hp = 0
    session.engine.update(CONFIG.step)
    presentationMs += CONFIG.step * 1000
    draw()
    return snapshot()
  },
  async resolveCommander(source: string, stale = false) {
    const { session } = current()
    if (session.kind !== 'commander') throw new Error('Prepare the commander fixture first')
    session.resolve(source, stale)
    for (let i = 0; i < 8; i++) await Promise.resolve()
    draw()
    return snapshot()
  },
  setCommanderAdjustment(adjusted: boolean) {
    const { session } = current()
    if (session.kind !== 'commander' || !session.engine.state.commanderOrder)
      throw new Error('Resolve the commander fixture first')
    const state = session.engine.state,
      previous = state.commanderOrder!
    // Explicit presentation-only mismatch fixture; no deployment or paid request is issued.
    state.commanderOrder = {
      ...previous,
      revision: previous.revision + 1,
      acceptedAt: state.time,
      requested: adjusted ? { type: 'spawn', unitType: 'slime' } : previous.applied
    }
    draw()
    return snapshot()
  },
  advancePresentation(elapsedMs: number) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 10000) throw new Error('Invalid visual time')
    presentationMs += elapsedMs
    draw()
    return snapshot()
  },
  async resetStage() {
    const { session } = current()
    session.engine.state.phase = 'cleared'
    if (!session.engine.nextStage()) throw new Error('Review stage reset failed')
    await waitForAssets()
    return snapshot()
  }
}

Object.assign(window, { presentationReview: api })
document.getElementById('status')!.textContent = 'ready'
