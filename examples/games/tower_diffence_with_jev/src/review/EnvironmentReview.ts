import { Vector3, type Mesh, type MeshBasicMaterial, type PlaneGeometry, type Scene } from 'three'
import { GameEngine } from '../game/GameEngine'
import { allRoadPaths, battlefieldGeometryIdentity } from '../game/BattlefieldRoutes'
import { fieldScenery } from '../game/FieldScenery'
import { gateMuzzle, roadItems } from '../game/Fortifications'
import {
  CONFIG,
  fieldFor,
  pointOnPath,
  type BattlefieldVersion,
  type LayoutRevision,
  type FieldId
} from '../game/model'
import { freshProfile, freshRunFromProfile, resumeProgress } from '../progression/ProgressionData'
import { GameRenderer } from '../rendering/GameRenderer'
import { authoredRosterClips } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { authoredDeathClips } from '../rendering/DeathArt'
import { unitTrialsFromURL } from '../rendering/UnitArtTrial'
import type { EnvironmentArt } from '../rendering/EnvironmentArt'
import {
  captureFortificationScene,
  createFortificationGateReview,
  createFortificationGearReview,
  createFortificationMudReview,
  createFortificationSpikeReview,
  type FortificationScene
} from './FortificationScene'

type PixelMesh = Mesh<PlaneGeometry, MeshBasicMaterial>
const host = document.getElementById('field')!,
  base = new URL('../../../tower-defense-art/', document.baseURI)
let renderer: GameRenderer,
  review: FortificationScene,
  presentationMs = 10000,
  pendingToggle: Promise<void> = Promise.resolve()
Object.defineProperty(performance, 'now', { configurable: true, value: () => presentationMs })

function internal() {
  return renderer as unknown as { scene: Scene; background: PixelMesh; environmentArt?: EnvironmentArt }
}
function draw() {
  renderer.render(review.engine.state)
}
async function waitForActors() {
  const deadline = Date.now() + 30000
  for (;;) {
    draw()
    const errors = { ...renderer.assetErrors, ...renderer.presentationAssetErrors }
    if (Object.keys(errors).length) throw new Error(JSON.stringify(errors))
    if (renderer.assetsReady(review.engine.state)) return
    if (Date.now() > deadline) throw new Error('Timed out loading environment review actor assets')
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
}
function meshEvidence(name: string) {
  const mesh = internal().scene.getObjectByName(name) as PixelMesh | undefined
  if (!mesh) return null
  const texture = mesh.material.map,
    id = texture?.name.replace(/^environment:/, ''),
    sprite = id && internal().environmentArt?.props[id],
    point = sprite && (sprite.emitter ?? sprite.pivot)
  mesh.updateWorldMatrix(true, false)
  const registered =
    sprite && point
      ? mesh.localToWorld(new Vector3(point.x - sprite.width / 2, sprite.height / 2 - point.y, 0)).toArray()
      : null
  return {
    name,
    visible: mesh.visible,
    position: mesh.position.toArray(),
    scale: mesh.scale.toArray(),
    rotation: mesh.rotation.z,
    renderOrder: mesh.renderOrder,
    geometry: [mesh.geometry.parameters.width, mesh.geometry.parameters.height],
    texture: { name: texture?.name, width: texture?.image?.width, height: texture?.image?.height },
    pivot: sprite ? sprite.pivot : null,
    emitter: sprite ? sprite.emitter : null,
    registeredWorld: registered,
    groundWorld: sprite
      ? mesh
          .localToWorld(new Vector3(sprite.pivot.x - sprite.width / 2, sprite.height / 2 - sprite.pivot.y, 0))
          .toArray()
      : null,
    data: structuredClone(mesh.userData)
  }
}
function snapshot() {
  const state = review.engine.state,
    field = fieldFor(state),
    canvas = host.querySelector('canvas')!,
    gl = canvas.getContext('webgl2')
  const result = {
    fixture:
      'Scripted offline, fresh in-memory data; no localStorage or Jev connection. Renderer-only compass road fragments and gate HP samples are explicitly scripted; gameplay samples use the real fixed-step engine.',
    kind: review.kind,
    setup: review.setup,
    phase: state.phase,
    time: state.time,
    baseHp: state.playerBaseHp,
    state: structuredClone(state),
    field: {
      id: field.id,
      version: field.version,
      layoutRevision: field.layoutRevision,
      geometryIdentity: battlefieldGeometryIdentity(field),
      width: field.width,
      height: field.height,
      gate: field.gate,
      roads: allRoadPaths(field),
      slowSurface: field.slowSurface,
      scenery: fieldScenery(field.id, field.version, field.layoutRevision)
    },
    environment: renderer.environmentStatus(),
    assetsReady: renderer.assetsReady(state),
    errors: { ...renderer.assetErrors, ...renderer.presentationAssetErrors },
    canvas: { width: canvas.width, height: canvas.height, webgl: !!gl && !gl.isContextLost() },
    render: renderer.diagnostics(),
    muzzle: gateMuzzle(state),
    sounds: structuredClone(review.sounds),
    shots: [...review.shots.values()],
    meshes: Object.fromEntries(
      [
        'defended-base',
        'gate-armor',
        'gate-cannon',
        'gate-cannon-mount',
        'gate-muzzle',
        'gate-cannon-range',
        ...state.sandbags.map((item) => `road-sandbag:${item.id}`),
        ...roadItems(state).map((item) => `road-${item.kind}:${item.id}`),
        ...state.units.map((unit) => `mud-slow:${unit.id}`),
        ...(state.fortifications?.gate.shots ?? []).map((shot) => `gate-shot:${shot.id}`)
      ].map((name) => [name, meshEvidence(name)])
    ),
    background: internal().background.material.map?.name,
    labels: Array.from(host.querySelectorAll<HTMLElement>('.sandbag-health, .road-item-charges')).map((label) => ({
      sandbagId: label.dataset.sandbagId,
      roadItemId: label.dataset.roadItemId,
      hp: label.getAttribute('aria-valuenow'),
      maxHp: label.getAttribute('aria-valuemax'),
      charges: label.dataset.charges
    }))
  }
  document.getElementById('status')!.textContent = `${review.kind}: ${result.background}`
  return result
}
async function mount(next: FortificationScene, enabled = true) {
  renderer?.dispose()
  host.replaceChildren()
  review = next
  presentationMs = 10000
  const state = review.engine.state,
    phase = state.phase,
    field = fieldFor(state)
  host.style.width = `${field.width}px`
  host.style.height = `${field.height}px`
  state.phase = 'preparation'
  renderer = new GameRenderer(host, {
    clips: authoredRosterClips(base),
    effectClips: authoredEffectClips(base),
    deathClips: authoredDeathClips(base),
    unitTrials: unitTrialsFromURL(base, new URL(document.baseURI)),
    environmentBase: base
  })
  draw()
  await renderer.setEnvironmentTrial(enabled)
  state.phase = phase
  renderer.setGateSelected(true)
  await waitForActors()
  captureFortificationScene(review)
  return snapshot()
}
function preparationScene(
  fieldId: FieldId = 'meadow',
  version: BattlefieldVersion = 2,
  layoutRevision: LayoutRevision = 1
): FortificationScene {
  if (version === 2 && layoutRevision === 1) {
    const next = createFortificationGearReview()
    next.engine.state.fieldId = fieldId
    next.kind = 'environment-preparation'
    return next
  }
  return {
    kind: version === 1 ? 'legacy-field' : 'revised-environment-preparation',
    engine: new GameEngine(
      { decide: () => new Promise(() => {}) },
      freshRunFromProfile(freshProfile(), version === 2 ? 2 : 1),
      fieldId,
      20261005,
      () => 0,
      undefined,
      version,
      layoutRevision
    ),
    actors: {},
    items: new Map(),
    shots: new Map(),
    attacks: new Map(),
    sounds: [],
    setup: {}
  }
}
function purchaseProps() {
  const { engine } = review,
    path = fieldFor(engine.state).routes[0].path
  for (const kind of ['sandbag', 'spike', 'mud'] as const) {
    let placed = false
    for (let progress = 320; progress < 1400 && !placed; progress += 30) {
      const point = pointOnPath(path, progress)
      placed = kind === 'sandbag' ? engine.placeSandbag(point).valid : engine.placeRoadItem(kind, point).valid
    }
    if (!placed) throw new Error(`Could not purchase review ${kind}`)
  }
  for (const kind of ['armor', 'cannon'] as const)
    if (!engine.upgradeGate(kind)) throw new Error(`Could not purchase review gate ${kind}`)
}
async function sample(milliseconds: number) {
  const goal = milliseconds / 1000
  if (!Number.isFinite(goal) || goal < review.engine.state.time - 1e-8 || goal > 20)
    throw new Error('Invalid monotonic review time')
  while (review.engine.state.time + CONFIG.step <= goal + 1e-9) {
    await waitForActors()
    const previous = review.engine.state.time
    review.engine.update(CONFIG.step, (state) => renderer.assetsReady(state))
    if (previous === review.engine.state.time) throw new Error('Review simulation unexpectedly stopped')
    presentationMs += CONFIG.step * 1000
    captureFortificationScene(review)
    draw()
  }
  await waitForActors()
  return snapshot()
}
function overlayEvidence() {
  const art = internal().environmentArt
  if (!art) throw new Error('Enable the environment before measuring overlays')
  const canvas = internal().background.material.map!.image as HTMLCanvasElement,
    ground = document.createElement('canvas'),
    field = fieldFor(review.engine.state)
  ground.width = canvas.width
  ground.height = canvas.height
  ground.getContext('2d')!.drawImage(art.field, 0, 0)
  const patch = (x: number, y: number, size: number) => {
    const left = Math.max(0, Math.min(canvas.width - size, Math.round(x - size / 2))),
      top = Math.max(0, Math.min(canvas.height - size, Math.round(y - size / 2))),
      actual = canvas.getContext('2d')!.getImageData(left, top, size, size).data,
      source = ground.getContext('2d')!.getImageData(left, top, size, size).data
    let changed = 0
    for (let i = 0; i < actual.length; i += 4)
      if (actual[i] !== source[i] || actual[i + 1] !== source[i + 1] || actual[i + 2] !== source[i + 2]) changed++
    return { x, y, size, changed }
  }
  const surface = field.slowSurface,
    center = pointOnPath(field.path, (surface.startProgress + surface.endProgress) / 2)
  return {
    slowSurface: patch(center.x, center.y, 20),
    scenery: fieldScenery(field.id, field.version, field.layoutRevision)
      .filter((item) => item.kind !== 'sprig')
      .slice(0, 6)
      .map((item) => ({ kind: item.kind, ...patch(item.x, item.y - 8, 24) }))
  }
}
const api = {
  prepare: (
    fieldId: FieldId = 'meadow',
    enabled = true,
    version: BattlefieldVersion = 2,
    layoutRevision: LayoutRevision = 1
  ) => mount(preparationScene(fieldId, version, layoutRevision), enabled),
  async prepareProps(enabled = true) {
    await mount(preparationScene(), enabled)
    purchaseProps()
    draw()
    return snapshot()
  },
  async prepareGate(direction = 6, enabled = true) {
    const next = createFortificationGateReview({ direction: 'north' }),
      origin = gateMuzzle(next.engine.state),
      angle = (direction * Math.PI) / 4
    Object.assign(next.actors.target, { x: origin.x + Math.cos(angle) * 100, y: origin.y + Math.sin(angle) * 100 + 18 })
    next.setup.compassDirection = direction
    return mount(next, enabled)
  },
  prepareSpike: (mode: Parameters<typeof createFortificationSpikeReview>[0] = 'break') =>
    mount(createFortificationSpikeReview(mode)),
  prepareMud: (mode: Parameters<typeof createFortificationMudReview>[0] = 'last-charge') =>
    mount(createFortificationMudReview(mode)),
  async toggle(enabled: boolean) {
    await renderer.setEnvironmentTrial(enabled)
    draw()
    return snapshot()
  },
  beginToggle(enabled: boolean) {
    pendingToggle = renderer.setEnvironmentTrial(enabled)
    draw()
    return snapshot()
  },
  async finishToggle() {
    await pendingToggle
    draw()
    return snapshot()
  },
  async changeField(fieldId: FieldId) {
    review.engine.state.fieldId = fieldId
    draw()
    await renderer.setEnvironmentTrial(true)
    draw()
    return snapshot()
  },
  beginAssault() {
    if (!review.engine.startAssault()) throw new Error('Review could not start assault')
    draw()
    return snapshot()
  },
  returnToPreparation() {
    review.engine.state.phase = 'preparation'
    review.setup.scriptedPreparation = 'Phase-only rendering boundary; not an engine stage completion'
    draw()
    return snapshot()
  },
  gateHp(ratio: number) {
    review.engine.state.playerBaseHp = CONFIG.baseHp * ratio
    draw()
    return snapshot()
  },
  async checkpointRoundtrip() {
    const before = review.engine.exportCheckpoint()
    if (!before) throw new Error('Review must have a production-valid checkpoint')
    const engine = GameEngine.fromCheckpoint(
      before,
      { decide: () => new Promise(() => {}) },
      resumeProgress(before.profile, before.progress),
      () => 0
    )
    if (!engine) throw new Error('Could not restore review checkpoint')
    const enabled = renderer.environmentStatus().enabled
    await mount({ ...review, engine }, enabled)
    return { before, after: engine.exportCheckpoint(), snapshot: snapshot() }
  },
  damageProps() {
    const state = review.engine.state
    state.sandbags[0].hp = 7
    const spike = roadItems(state).find((item) => item.kind === 'spike')!
    if (spike.kind === 'spike') spike.hp = 5
    const mud = roadItems(state).find((item) => item.kind === 'mud')!
    if (mud.kind === 'mud') mud.charges = 2
    draw()
    return snapshot()
  },
  removeProps() {
    for (const item of [...roadItems(review.engine.state)]) review.engine.removeRoadItem(item.id)
    for (const item of [...review.engine.state.sandbags]) review.engine.removeSandbag(item.id)
    draw()
    return snapshot()
  },
  roadHeading(direction: number) {
    const field = fieldFor(review.engine.state),
      savedEdges = field.edges,
      savedRoutes = field.routes,
      angle = (direction * Math.PI) / 4 - Math.PI / 2,
      state = review.engine.state,
      props = [...state.sandbags, ...roadItems(state)],
      anchors = props.map((item) => ({ item, edgeId: item.edgeId, offset: item.offset }))
    try {
      Object.assign(field, {
        edges: [
          ...savedEdges,
          ...props.map((item) => ({
            id: `review-${item.id}`,
            from: 'review-start',
            to: 'review-end',
            points: [-100, 100].map((offset) => ({
              x: item.x + Math.cos(angle) * offset,
              y: item.y + Math.sin(angle) * offset
            }))
          }))
        ]
      })
      Object.assign(field, {
        routes: savedRoutes.map((route, index) =>
          index ? route : { ...route, edgeIds: [...route.edgeIds, ...props.map((item) => `review-${item.id}`)] }
        )
      })
      for (const item of props) Object.assign(item, { edgeId: `review-${item.id}`, offset: 100 })
      draw()
      const result = snapshot()
      result.setup = {
        ...result.setup,
        scriptedRoadDirection: direction,
        roadGeometry: 'Temporary compass fragments; no simulation steps'
      }
      return result
    } finally {
      Object.assign(field, { edges: savedEdges, routes: savedRoutes })
      for (const { item, edgeId, offset } of anchors) Object.assign(item, { edgeId, offset })
    }
  },
  overlayEvidence,
  sample,
  snapshot() {
    draw()
    return snapshot()
  }
}
Object.assign(window, { environmentReview: api })
document.getElementById('review-prepare')!.onclick = () => {
  void api.prepare((document.getElementById('review-theme') as HTMLSelectElement).value as FieldId)
}
document.getElementById('status')!.textContent = 'ready'
