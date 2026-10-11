import type { Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three'
import { CONFIG, DEFINITIONS, fieldFor } from '../game/model'
import { FORTIFICATIONS, gateMuzzle, roadItems } from '../game/Fortifications'
import { routeSandbags } from '../game/EnemyTravel'
import { GameRenderer } from '../rendering/GameRenderer'
import { authoredRosterClips } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { authoredDeathClips } from '../rendering/DeathArt'
import { dragonBreathBodyClips, dragonBreathClips } from '../rendering/DragonBreathArt'
import {
  FORTIFICATION_FIXTURE_CONTRACT,
  captureFortificationScene,
  createFortificationArmorReview,
  createFortificationGateReview,
  createFortificationGearReview,
  createFortificationLegacyReview,
  createFortificationMudReview,
  createFortificationPriorityReview,
  createFortificationSpikeReview,
  killFortificationTarget,
  relocateMudEntrant,
  type FortificationScene,
  type GateReviewOptions
} from './FortificationScene'

const host = document.getElementById('field')!,
  base = new URL('../../../tower-defense-art/', document.baseURI)
let renderer: GameRenderer | undefined,
  review: FortificationScene | undefined,
  initialTime = 0,
  presentationMs = 10000,
  trace: ReturnType<typeof frameSample>[] = []

Object.defineProperty(performance, 'now', { configurable: true, value: () => presentationMs })

function current() {
  if (!renderer || !review) throw new Error('Prepare a scripted fortification review first')
  return { renderer, review }
}

function draw() {
  const { renderer, review } = current()
  renderer.render(review.engine.state)
}

async function waitForAssets() {
  const deadline = Date.now() + 20000
  for (;;) {
    const { renderer, review } = current()
    draw()
    const errors = { ...renderer.assetErrors, ...renderer.presentationAssetErrors }
    if (Object.keys(errors).length) throw new Error(JSON.stringify(errors))
    if (renderer.assetsReady(review.engine.state)) {
      draw()
      return
    }
    if (Date.now() >= deadline) throw new Error('Timed out waiting for real fortification review PNG assets')
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
}

function frameSample() {
  const { review } = current(),
    state = review.engine.state
  return {
    time: state.time,
    baseHp: state.playerBaseHp,
    units: state.units.map((unit) => ({
      id: unit.id,
      hp: unit.hp,
      x: unit.x,
      y: unit.y,
      progress: unit.progress,
      speed: unit.speed,
      mudSlowUntil: unit.mudSlowUntil ?? null
    })),
    items: structuredClone(roadItems(state)),
    shots: structuredClone(state.fortifications?.gate.shots ?? []),
    soundCount: review.sounds.filter((sound) => sound.attackerId === 0).length
  }
}

function meshEvidence(name: string) {
  const scene = (current().renderer as unknown as { scene: Scene }).scene,
    mesh = scene.getObjectByName(name) as Mesh<PlaneGeometry, MeshBasicMaterial> | undefined
  return mesh
    ? {
        name,
        visible: mesh.visible,
        position: mesh.position.toArray(),
        renderOrder: mesh.renderOrder,
        depthTest: mesh.material.depthTest,
        depthWrite: mesh.material.depthWrite,
        opacity: mesh.material.opacity,
        color: mesh.material.color.getHexString(),
        rotation: mesh.rotation.z,
        scale: mesh.scale.toArray(),
        texture: {
          name: mesh.material.map?.name ?? null,
          width: mesh.material.map?.image?.width ?? null,
          height: mesh.material.map?.image?.height ?? null
        },
        data: { ...mesh.userData }
      }
    : null
}

function snapshot() {
  const { renderer, review } = current(),
    state = review.engine.state,
    field = fieldFor(state),
    canvas = host.querySelector('canvas')!,
    gl = canvas.getContext('webgl2')
  captureFortificationScene(review)
  const result = {
    kind: review.kind,
    fixture: FORTIFICATION_FIXTURE_CONTRACT,
    setup: review.setup,
    simulationTime: state.time,
    elapsedMs: (state.time - initialTime) * 1000,
    presentationMs,
    phase: state.phase,
    economyVersion: state.economyVersion ?? 1,
    baseHp: state.playerBaseHp,
    resolved: state.enemiesResolved,
    field: { id: field.id, version: field.version, width: field.width, height: field.height, gate: field.gate },
    assetsReady: renderer.assetsReady(state),
    assetErrors: { ...renderer.assetErrors, ...renderer.presentationAssetErrors },
    canvas: {
      width: canvas.width,
      height: canvas.height,
      webgl: !!gl && !gl.isContextLost(),
      bounds: canvas.getBoundingClientRect().toJSON()
    },
    render: renderer.diagnostics(),
    actors: Object.fromEntries(
      Object.entries(review.actors).map(([name, unit]) => [
        name,
        {
          ...unit,
          present: state.units.includes(unit),
          armor: DEFINITIONS[unit.type].armor,
          barriersAhead: routeSandbags(state, unit).map((item) => item.id)
        }
      ])
    ),
    items: [...review.items.values()].map((item) => ({
      ...item,
      present: roadItems(state).some((current) => current.id === item.id)
    })),
    gate: structuredClone(state.fortifications?.gate ?? null),
    muzzle: gateMuzzle(state),
    range: FORTIFICATIONS.cannon.range,
    shots: [...review.shots.values()],
    attacks: [...review.attacks.values()],
    sounds: review.sounds,
    gateSounds: review.sounds.filter((sound) => sound.attackerId === 0),
    corpses: structuredClone(state.corpses),
    meshes: {
      base: meshEvidence('defended-base'),
      cannon: meshEvidence('gate-cannon'),
      muzzle: meshEvidence('gate-muzzle'),
      range: meshEvidence('gate-cannon-range'),
      shots: [...review.shots.keys()].map((id) => meshEvidence(`gate-shot:${id}`)).filter(Boolean),
      slowed: Object.values(review.actors)
        .map((unit) => meshEvidence(`mud-slow:${unit.id}`))
        .filter(Boolean),
      corpses: state.corpses.map((corpse) => meshEvidence(`corpse-body:${corpse.key}`)).filter(Boolean)
    },
    badges: Array.from(host.querySelectorAll<HTMLElement>('.unit-equipment')).map((element) => ({
      unitId: Number(element.dataset.unitId),
      equipment: element.dataset.equipment,
      label: element.getAttribute('aria-label'),
      width: element.style.width,
      height: element.style.height
    })),
    trace
  }
  document.getElementById('status')!.textContent = JSON.stringify(result)
  document.getElementById('frame-label')!.textContent =
    `${review.kind} / scripted offline / ${result.elapsedMs.toFixed(1)} ms / economy v${result.economyVersion}`
  ;(document.getElementById('review-step') as HTMLButtonElement).disabled = state.phase !== 'assault'
  ;(document.getElementById('review-kill') as HTMLButtonElement).disabled =
    review.kind !== 'gate' || review.actors.target.hp <= 0
  return result
}

async function prepare(next: FortificationScene) {
  renderer?.dispose()
  host.replaceChildren()
  review = next
  initialTime = review.engine.state.time
  presentationMs = 10000
  const field = fieldFor(review.engine.state)
  host.style.width = `${field.width}px`
  host.style.height = `${field.height}px`
  renderer = new GameRenderer(host, {
    clips: { ...authoredRosterClips(base), ...dragonBreathBodyClips(base) },
    effectClips: { ...authoredEffectClips(base), 'dragon:breath': dragonBreathClips(base).effect },
    deathClips: authoredDeathClips(base)
  })
  renderer.setField(field.id, field.version)
  renderer.setGateSelected(true)
  captureFortificationScene(review)
  trace = [frameSample()]
  await waitForAssets()
  return snapshot()
}

async function sample(elapsedMs: number) {
  const { renderer, review } = current(),
    goal = initialTime + elapsedMs / 1000
  if (!Number.isFinite(elapsedMs) || goal < review.engine.state.time - 1e-8 || elapsedMs > 20000)
    throw new Error('Fortification samples must be monotonic and within 20 seconds')
  while (review.engine.state.time + CONFIG.step <= goal + 1e-9) {
    await waitForAssets()
    const before = review.engine.state.time
    review.engine.update(CONFIG.step, (state) => renderer.assetsReady(state))
    if (before === review.engine.state.time) throw new Error('Fortification simulation stopped before requested sample')
    presentationMs = 10000 + (review.engine.state.time - initialTime) * 1000
    captureFortificationScene(review)
    trace.push(frameSample())
    draw()
  }
  await waitForAssets()
  return snapshot()
}

const api = {
  prepareGate: (options: GateReviewOptions = {}) => prepare(createFortificationGateReview(options)),
  prepareArmor: (level = 1) => prepare(createFortificationArmorReview(level)),
  preparePriority: (mode: 'boss' | 'nearest' | 'range') => prepare(createFortificationPriorityReview(mode)),
  prepareSpike: (mode: Parameters<typeof createFortificationSpikeReview>[0] = 'melee') =>
    prepare(createFortificationSpikeReview(mode)),
  prepareMud: (mode: Parameters<typeof createFortificationMudReview>[0] = 'waiting') =>
    prepare(createFortificationMudReview(mode)),
  prepareGear: () => prepare(createFortificationGearReview()),
  prepareLegacy: () => prepare(createFortificationLegacyReview()),
  killTarget() {
    killFortificationTarget(current().review)
    draw()
    return snapshot()
  },
  relocateMud(inside: boolean) {
    relocateMudEntrant(current().review, inside)
    draw()
    return snapshot()
  },
  sample,
  snapshot() {
    draw()
    return snapshot()
  }
}

Object.assign(window, { fortificationReview: api })
document.getElementById('review-prepare')!.onclick = async () => {
  const kind = (document.getElementById('review-case') as HTMLSelectElement).value,
    level = Number((document.getElementById('review-level') as HTMLSelectElement).value)
  if (kind === 'gate') await api.prepareGate({ level })
  else if (kind === 'armor') await api.prepareArmor(level)
  else if (kind === 'mud') await api.prepareMud()
  else if (kind === 'gear') await api.prepareGear()
  else if (kind === 'legacy') await api.prepareLegacy()
  else await api.prepareSpike(kind as Parameters<typeof createFortificationSpikeReview>[0])
}
document.getElementById('review-step')!.onclick = () => {
  void sample((current().review.engine.state.time - initialTime) * 1000 + 100)
}
document.getElementById('review-kill')!.onclick = () => {
  api.killTarget()
}
document.getElementById('status')!.textContent = 'ready'
