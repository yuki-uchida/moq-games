import { canInitiateDamage } from '../game/HealingActions'
import type { Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three'
import {
  CONFIG,
  canTargetUnit,
  fieldFor,
  type AllyType,
  type BattlefieldVersion,
  type FieldId,
  type Point
} from '../game/model'
import { physicalProjectionOnRoute, routeProgressToEdgeAnchor } from '../game/BattlefieldRoutes'
import { routeSandbags } from '../game/EnemyTravel'
import { insideHeavyImpact } from '../game/HeavyImpact'
import { GameRenderer } from '../rendering/GameRenderer'
import { authoredRosterClips } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { authoredDeathClips } from '../rendering/DeathArt'
import { dragonBreathBodyClips, dragonBreathClips } from '../rendering/DragonBreathArt'
import {
  BATTLEFIELD_FIXTURE_CONTRACT,
  captureBattlefieldAttacks,
  createAntiAirReview,
  createAreaReview,
  createBagReview,
  createBattlefieldOverview,
  createFlightReview,
  createFormationReview,
  createGateReview,
  createJunctionReview,
  killFlightReviewTarget,
  reviewAreaGeometry,
  type BattlefieldScene
} from './BattlefieldScene'

const base = new URL('../../../tower-defense-art/', document.baseURI)
const host = document.getElementById('field')!
let renderer: GameRenderer | undefined
let review: BattlefieldScene | undefined
let initialTime = 0
let presentationMs = 10000
let trace: ReturnType<typeof motionSample>[] = []

Object.defineProperty(performance, 'now', { configurable: true, value: () => presentationMs })

function current() {
  if (!review || !renderer) throw new Error('Prepare a scripted battlefield case first')
  return { review, renderer }
}

function draw() {
  const { review, renderer } = current()
  renderer.render(review.engine.state)
}

async function waitForAssets() {
  const deadline = Date.now() + 20000
  for (;;) {
    const { review, renderer } = current()
    draw()
    const errors = { ...renderer.assetErrors, ...renderer.presentationAssetErrors }
    if (Object.keys(errors).length) throw new Error(JSON.stringify(errors))
    if (renderer.assetsReady(review.engine.state)) {
      draw()
      return
    }
    if (Date.now() > deadline) throw new Error('Timed out waiting for real battlefield PNG assets')
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
}

function motionSample() {
  const { review } = current(),
    state = review.engine.state
  return {
    time: state.time,
    units: state.units.map((unit) => ({
      id: unit.id,
      owner: unit.owner,
      type: unit.type,
      x: unit.x,
      y: unit.y,
      hp: unit.hp,
      speed: unit.speed,
      progress: unit.progress,
      routeId: unit.routeId ?? null,
      sequence: unit.attackSequence,
      flight: unit.flight ? { ...unit.flight } : null,
      edge: unit.owner === 'ai' ? routeProgressToEdgeAnchor(fieldFor(state), unit.routeId, unit.progress) : null
    }))
  }
}

function worldPoint(point: Point) {
  const { review, renderer } = current(),
    field = fieldFor(review.engine.state),
    bounds = host.getBoundingClientRect()
  return renderer.worldPointAt(
    bounds.left + (point.x / field.width) * bounds.width,
    bounds.top + (point.y / field.height) * bounds.height
  )
}

function snapshot() {
  const { review, renderer } = current(),
    state = review.engine.state,
    field = fieldFor(state)
  captureBattlefieldAttacks(review)
  const scene = (renderer as unknown as { scene: Scene }).scene
  const canvas = host.querySelector('canvas')!,
    gl = canvas.getContext('webgl2')
  const areaAttack = review.attacks.get(String(review.setup.attackId)),
    shape = areaAttack ? reviewAreaGeometry(areaAttack) : null
  const area = areaAttack
    ? scene.getObjectByName(`${areaAttack.type === 'dragon' ? 'dragon-splash' : 'heavy-impact'}:${areaAttack.id}`)
    : undefined
  const result = {
    kind: review.kind,
    fixture: BATTLEFIELD_FIXTURE_CONTRACT,
    setup: review.setup,
    simulationTime: state.time,
    elapsedMs: (state.time - initialTime) * 1000,
    presentationMs,
    phase: state.phase,
    baseHp: state.playerBaseHp,
    resolved: state.enemiesResolved,
    field: {
      id: field.id,
      version: field.version,
      width: field.width,
      height: field.height,
      entrance: field.entrance,
      gate: field.gate,
      routes: field.routes,
      edges: field.edges
    },
    assetsReady: renderer.assetsReady(state),
    assetErrors: { ...renderer.assetErrors, ...renderer.presentationAssetErrors },
    render: renderer.diagnostics(),
    canvas: {
      width: canvas.width,
      height: canvas.height,
      bounds: canvas.getBoundingClientRect().toJSON(),
      webgl: !!gl && !gl.isContextLost(),
      version: gl?.getParameter(gl.VERSION) ?? null
    },
    actors: Object.fromEntries(
      Object.entries(review.actors).map(([name, unit]) => [
        name,
        {
          ...unit,
          present: state.units.includes(unit),
          roadDistance: unit.owner === 'ai' ? physicalProjectionOnRoute(field, unit.routeId, unit).distance : null,
          bagsAhead: routeSandbags(state, unit).map((bag) => bag.id),
          insideArea: shape ? insideHeavyImpact(shape, unit) : null
        }
      ])
    ),
    units: motionSample().units,
    bags: review.bags.map((bag) => ({ ...bag, present: state.sandbags.includes(bag) })),
    attacks: [...review.attacks.values()].map((attack) => ({
      id: attack.id,
      attackerId: attack.attackerId,
      targetId: attack.targetId ?? null,
      type: attack.type,
      base: attack.base,
      barrierId: attack.barrierId ?? null,
      sequence: attack.sequence,
      power: attack.power,
      startedAt: attack.startedAt,
      endsAt: attack.endsAt,
      releaseAt: attack.releaseAt,
      impactAt: attack.impactAt,
      elapsedMs: (state.time - attack.startedAt) * 1000,
      status: attack.status,
      damageHit: attack.damageHit,
      breath: attack.breath ? structuredClone(attack.breath) : null
    })),
    pending: structuredClone(state.pendingSpawns),
    breathMeshes: [...review.attacks.values()]
      .filter((attack) => attack.breath)
      .map((attack) => {
        const mesh = scene.getObjectByName(`attack-effect:${attack.id}`) as
          | Mesh<PlaneGeometry, MeshBasicMaterial>
          | undefined
        return {
          attackId: attack.id,
          visible: mesh?.visible ?? false,
          scale: mesh?.scale.toArray() ?? null,
          texture: mesh?.material.map?.name ?? null
        }
      }),
    area: {
      shape,
      visible: area?.visible ?? false,
      renderedShape:
        area?.userData.shape ??
        (area && areaAttack?.type === 'dragon'
          ? { kind: 'circle', origin: { x: area.position.x, y: area.position.y }, radius: area.userData.radius }
          : null),
      phase: area?.userData.phase ?? (area && areaAttack?.type === 'dragon' ? 'impact' : null)
    },
    eligibility:
      review.actors.defender && review.actors.flyer
        ? canInitiateDamage(review.actors.defender) &&
          canTargetUnit(review.actors.defender, review.actors.flyer, state.battlefieldVersion)
        : null,
    corpses: structuredClone(state.corpses),
    trace
  }
  document.getElementById('status')!.textContent = JSON.stringify(result)
  document.getElementById('frame-label')!.textContent =
    `${review.kind} / ${field.id} v${field.version} / ${field.width} × ${field.height} / ${(state.time - initialTime).toFixed(3)} s`
  return result
}

async function prepare(next: BattlefieldScene) {
  renderer?.dispose()
  host.replaceChildren()
  review = next
  const field = fieldFor(review.engine.state)
  host.style.width = `${field.width}px`
  host.style.height = `${field.height}px`
  host.dataset.worldWidth = String(field.width)
  host.dataset.worldHeight = String(field.height)
  host.dataset.battlefieldVersion = String(field.version)
  presentationMs = 10000
  initialTime = review.engine.state.time
  renderer = new GameRenderer(host, {
    clips: { ...authoredRosterClips(base), ...dragonBreathBodyClips(base) },
    effectClips: { ...authoredEffectClips(base), 'dragon:breath': dragonBreathClips(base).effect },
    deathClips: authoredDeathClips(base)
  })
  renderer.setField(field.id, field.version)
  trace = [motionSample()]
  await waitForAssets()
  return snapshot()
}

async function sample(elapsedMs: number) {
  const { review, renderer } = current(),
    goal = initialTime + elapsedMs / 1000
  if (!Number.isFinite(elapsedMs) || goal < review.engine.state.time - 1e-8 || elapsedMs > 20000)
    throw new Error('Battlefield samples must be monotonic and within 20 seconds')
  while (review.engine.state.time + CONFIG.step <= goal + 1e-9) {
    await waitForAssets()
    const before = review.engine.state.time
    review.engine.update(CONFIG.step, (state) => renderer.assetsReady(state))
    if (review.engine.state.time === before) throw new Error('Battlefield simulation stopped before requested sample')
    captureBattlefieldAttacks(review)
    presentationMs = 10000 + (review.engine.state.time - initialTime) * 1000
    trace.push(motionSample())
    draw()
  }
  await waitForAssets()
  return snapshot()
}

const api = {
  prepareOverview: (field: FieldId = 'meadow', version: BattlefieldVersion = 2) =>
    prepare(createBattlefieldOverview(field, version)),
  prepareJunction: (field: FieldId, junction: 'split' | 'merge') => prepare(createJunctionReview(field, junction)),
  prepareBags: (kind: 'shared' | 'exclusive') => prepare(createBagReview(kind)),
  prepareFormation: () => prepare(createFormationReview()),
  prepareFlight: (type: 'bat' | 'wraith' | 'dragon' = 'bat', engaged = false) =>
    prepare(createFlightReview(type, engaged)),
  prepareAntiAir: (type: AllyType, targetType: 'bat' | 'wraith' | 'dragon' = 'bat') =>
    prepare(createAntiAirReview(type, targetType)),
  prepareGate: (type: 'slime' | 'dragon' = 'slime', boss = false, version: BattlefieldVersion = 2) =>
    prepare(createGateReview(type, boss, version)),
  prepareArea: (type: 'brute' | 'ogre' | 'dragon' = 'brute', version: BattlefieldVersion = 2) =>
    prepare(createAreaReview(type, version)),
  async killFlightTarget() {
    killFlightReviewTarget(current().review)
    draw()
    return snapshot()
  },
  sample,
  snapshot: () => {
    draw()
    return snapshot()
  },
  worldPoint,
  resize(scale: number) {
    if (!Number.isFinite(scale) || scale < 0.2 || scale > 1) throw new Error('Invalid review CSS scale')
    const field = fieldFor(current().review.engine.state)
    host.style.width = `${field.width * scale}px`
    host.style.height = `${field.height * scale}px`
    draw()
    return snapshot()
  }
}

Object.assign(window, { battlefieldReview: api })
document.getElementById('review-prepare')!.onclick = async () => {
  const field = (document.getElementById('review-field') as HTMLSelectElement).value as FieldId
  const kind = (document.getElementById('review-case') as HTMLSelectElement).value
  if (kind === 'split' || kind === 'merge') await api.prepareJunction(field, kind)
  else if (kind === 'shared' || kind === 'exclusive') await api.prepareBags(kind)
  else if (kind === 'formation') await api.prepareFormation()
  else if (kind === 'flight') await api.prepareFlight()
  else if (kind === 'gate' || kind === 'boss') await api.prepareGate('dragon', kind === 'boss')
  else if (kind === 'area') await api.prepareArea()
  else await api.prepareOverview(field, kind === 'legacy' ? 1 : 2)
}
document.getElementById('review-step')!.onclick = () => {
  void sample((current().review.engine.state.time - initialTime) * 1000 + 200)
}
document.getElementById('review-kill')!.onclick = () => {
  void api.killFlightTarget()
}
document.getElementById('status')!.textContent = 'ready'
