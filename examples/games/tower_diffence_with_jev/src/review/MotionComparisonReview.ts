import { Vector3 } from 'three'
import { CONFIG } from '../game/model'
import { GameRenderer } from '../rendering/GameRenderer'
import { authoredRosterClips } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { authoredDeathClips } from '../rendering/DeathArt'
import { unitTrialsFromURL } from '../rendering/UnitArtTrial'
import { createMotionComparisonScene, type MotionReviewOptions } from './MotionComparisonScene'

const base = new URL('../../../tower-defense-art/', document.baseURI)
const field = document.getElementById('field')!
const viewport = document.getElementById('viewport')!
const params = new URL(document.baseURI).searchParams
const revision = params.get('revision') ?? 'UNLABELLED'
if (!['old2d', 'prior3d', 'new3d'].includes(revision))
  throw new Error('Set revision=old2d, prior3d or new3d explicitly')
let scene: ReturnType<typeof createMotionComparisonScene>
let renderer: GameRenderer
let stopped = true
let runToken = 0
let visualMs = 0
let nativeRecording:
  | {
      canvas: HTMLCanvasElement
      context: CanvasRenderingContext2D
      stream: MediaStream
      recorder: MediaRecorder
      chunks: Blob[]
      finished: Promise<void>
      capturedFrames: { tick: number; frame: number; elapsedMs: number }[]
    }
  | undefined
function startNativeRecording() {
  if (nativeRecording) throw new Error('A native recording is already active')
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 832
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '9999', pointerEvents: 'none' })
  document.body.append(canvas)
  const context = canvas.getContext('2d')!
  const stream = canvas.captureStream(60)
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 12000000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data)
  }
  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  nativeRecording = { canvas, context, stream, recorder, chunks, finished, capturedFrames: [] }
  recorder.start()
  draw()
}
async function stopNativeRecording() {
  const active = nativeRecording
  if (!active) throw new Error('No native recording is active')
  active.recorder.stop()
  await active.finished
  nativeRecording = undefined
  active.stream.getTracks().forEach((track) => track.stop())
  active.canvas.remove()
  const bytes = new Uint8Array(await new Blob(active.chunks, { type: active.recorder.mimeType }).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.slice(i, i + 8192))
  return {
    base64: btoa(binary),
    requestedFps: 60,
    capturedFrames: active.capturedFrames,
    width: 1280,
    height: 832,
    stampEncoding: '32 white/black 8px bits at y36; lower16bits simulation tick, upper16bits sampled body frame'
  }
}
const wallNow = performance.now.bind(performance)
Object.defineProperty(performance, 'now', { configurable: true, value: () => visualMs })
function draw() {
  renderer.render(scene.engine.state, null, false)
  const elapsedMs = scene.elapsedMs
  const last = (renderer as any).units.get(scene.actor.id)?.lastFrame
  const index = last?.atlas.sample(last.elapsedMs).frame.index
  document.getElementById('status')!.textContent =
    `${revision} · ${scene.options.role}${scene.options.realBoss ? ' Stage 5 boss' : ''} · ${scene.options.action} ${scene.options.direction} · ${elapsedMs.toFixed(3)} ms · frame ${index ?? 'loading'}`
  if (nativeRecording) {
    const { context, capturedFrames } = nativeRecording
    const source = field.querySelector('canvas')!
    context.fillStyle = '#083e30'
    context.fillRect(0, 0, 1280, 52)
    context.drawImage(source, viewport.scrollLeft, viewport.scrollTop, 1280, 780, 0, 52, 1280, 780)
    context.fillStyle = 'white'
    context.font = '18px monospace'
    context.fillText(
      `${revision} ${scene.options.role} ${scene.options.direction} ${elapsedMs.toFixed(3)} ms frame ${index ?? 'loading'}`,
      8,
      23
    )
    const tick = Math.round((elapsedMs * 60) / 1000),
      frame = index ?? 65535
    for (let bit = 0; bit < 32; bit++) {
      context.fillStyle = ((bit < 16 ? tick : frame) >>> bit % 16) & 1 ? 'white' : 'black'
      context.fillRect(bit * 8, 36, 8, 12)
    }
    capturedFrames.push({ tick, frame, elapsedMs })
  }
}
function snapshot() {
  const diagnostic = renderer.diagnostics()
  const body = (renderer as any).units.get(scene.actor.id)
  const last = body?.lastFrame
  const sampled = last?.atlas.sample(last.elapsedMs)
  let pivot = null
  if (last && body) {
    const m = last.atlas.manifest
    body.body.updateWorldMatrix(true, false)
    const p = body.body.localToWorld(
      new Vector3(
        (m.frameSize.pivot.x - m.frameSize.width / 2) / m.pixelsPerWorldUnit,
        (m.frameSize.height / 2 - m.frameSize.pivot.y) / m.pixelsPerWorldUnit,
        0
      )
    )
    pivot = { x: p.x, y: p.y }
  }
  const unit = diagnostic.units.find((value) => value.id === scene.actor.id)
  const attack = scene.engine.state.attacks.find(
    (value) => value.attackerId === scene.actor.id && value.sequence === scene.actor.attackSequence
  )
  return {
    revision,
    options: scene.options,
    fixture: scene.fixture,
    elapsedMs: scene.elapsedMs,
    simulationTime: scene.engine.state.time,
    presentationMs: visualMs,
    assetsReady: renderer.assetsReady(scene.engine.state),
    assetErrors: diagnostic.assetErrors,
    actor: {
      id: scene.actor.id,
      owner: scene.actor.owner,
      hp: scene.actor.hp,
      x: scene.actor.x,
      y: scene.actor.y,
      speed: scene.actor.speed,
      travelled: scene.actor.travelled,
      moving: scene.actor.moving,
      sequence: scene.actor.attackSequence,
      boss: scene.actor.boss
    },
    body: {
      character: last?.atlas.manifest.character,
      motion: last?.atlas.manifest.motion,
      direction: last?.atlas.manifest.direction,
      frame: sampled?.frame.index,
      elapsedMs: last?.elapsedMs,
      pivot,
      visible: !!unit?.visible && !!unit?.drawnThisFrame,
      scale: unit?.scale,
      texture: last?.atlas.manifest.texture,
      sha256: last?.atlas.manifest.sha256
    },
    target: { id: scene.target.id, hp: scene.target.hp, x: scene.target.x, y: scene.target.y },
    hpLoss: scene.startHp - scene.target.hp,
    attack: attack
      ? {
          sequence: attack.sequence,
          targetId: attack.targetId,
          damageHit: attack.damageHit,
          startedAt: attack.startedAt,
          impactAt: attack.impactAt,
          endsAt: attack.endsAt,
          projectile: attack.projectile
        }
      : null,
    stage: scene.engine.state.stage,
    battlefieldVersion: scene.engine.state.battlefieldVersion,
    native: {
      canvasCssWidth: field.querySelector('canvas')?.getBoundingClientRect().width,
      devicePixelRatio,
      scalePolicy: '128 world-pixel cell at 128 CSS px; Wolf boss uses unchanged 1.35 scale'
    }
  }
}
async function ready() {
  const deadline = wallNow() + 30000
  for (;;) {
    draw()
    if (Object.keys(renderer.assetErrors).length) throw new Error(JSON.stringify(renderer.assetErrors))
    if (renderer.assetsReady(scene.engine.state)) {
      draw()
      return snapshot()
    }
    if (wallNow() > deadline) throw new Error('Motion review assets timed out')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}
function pause() {
  stopped = true
  runToken++
}
async function prepare(options: MotionReviewOptions) {
  pause()
  renderer?.dispose()
  field.replaceChildren()
  visualMs = 0
  scene = createMotionComparisonScene(options)
  const url = new URL(document.baseURI)
  for (const role of ['wolf', 'runner']) url.searchParams.set(`${role}-art`, revision === 'old2d' ? '2d' : '3d')
  renderer = new GameRenderer(field, {
    clips: authoredRosterClips(base),
    effectClips: authoredEffectClips(base),
    deathClips: authoredDeathClips(base),
    unitTrials: unitTrialsFromURL(base, url)
  })
  await ready()
  const rehearse = async (milliseconds: number) => {
    for (let tick = 0; tick < Math.ceil(milliseconds / (CONFIG.step * 1000)); tick++) await step()
  }
  if (options.action === 'route' && options.role === 'wolf') {
    await rehearse(700)
    scene.moveWolfTarget(true)
    await rehearse(1000)
    scene.moveWolfTarget(false)
    await rehearse(1500)
  } else {
    await rehearse(
      options.action === 'route' ? 8000 : options.action === 'attack' ? 1000 : options.action === 'walk' ? 1800 : 3200
    )
  }
  scene.engine.invalidateAI()
  scene = createMotionComparisonScene(options)
  visualMs = 0
  const result = await ready()
  viewport.scrollLeft = Math.max(0, scene.actor.x - viewport.clientWidth / 2)
  viewport.scrollTop = Math.max(0, scene.actor.y - viewport.clientHeight / 2)
  document.getElementById('fixture')!.textContent = scene.fixture
  document.getElementById('status')!.textContent = 'ready'
  document.getElementById('revision')!.textContent = revision
  return result
}
async function step() {
  await ready()
  scene.step(() => renderer.assetsReady(scene.engine.state))
  visualMs = scene.elapsedMs
  draw()
  return ready()
}
/** One fixed simulation tick per deadline; missed deadlines are recorded, never hidden with catch-up. */
async function play(milliseconds = 1200) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 10000)
    throw new Error('Invalid play duration')
  stopped = false
  const token = ++runToken
  const samples = [snapshot()]
  const frames: { tick: number; stepStartedWallMs: number; wallElapsedMs: number; lateMs: number }[] = []
  const start = wallNow(),
    count = Math.ceil(milliseconds / (CONFIG.step * 1000))
  for (let tick = 1; tick <= count && !stopped && token === runToken; tick++) {
    const due = start + tick * CONFIG.step * 1000
    await new Promise<void>((resolve) => {
      const wait = () => (wallNow() + 0.5 >= due ? resolve() : requestAnimationFrame(wait))
      requestAnimationFrame(wait)
    })
    if (stopped || token !== runToken) break
    const stepStartedWallMs = wallNow() - start
    samples.push(await step())
    const wallElapsedMs = wallNow() - start
    frames.push({
      tick,
      stepStartedWallMs,
      wallElapsedMs,
      lateMs: Math.max(0, wallElapsedMs - tick * CONFIG.step * 1000)
    })
  }
  if (token === runToken) stopped = true
  const late = frames.map((frame) => frame.lateMs).sort((a, b) => a - b)
  const percentile = (p: number) => late[Math.min(late.length - 1, Math.floor((late.length - 1) * p))] ?? 0
  const pacing = {
    maxLateMs: late.at(-1) ?? 0,
    p50LateMs: percentile(0.5),
    p95LateMs: percentile(0.95),
    p99LateMs: percentile(0.99),
    aboveOneTick: late.filter((ms) => ms > 1000 / 60).length,
    aboveTwoTicks: late.filter((ms) => ms > 1000 / 30).length
  }
  return {
    samples,
    frames,
    pacing,
    simulationTickPolicy:
      'Every simulation tick is advanced in order. This does not prove every tick was recorded in the video.',
    recordedVideoFrameCoverage: 'UNVERIFIED: independently inspect encoded frame FPS/PTS and hit-near frames',
    wallElapsedMs: wallNow() - start,
    requestedMs: milliseconds,
    droppedSimulationTicks: 0,
    nativeAcceptance: 'OPEN: recording and functional checks do not establish visual quality'
  }
}
Object.assign(window, {
  motionComparisonReview: {
    prepare,
    ready,
    snapshot,
    step,
    play,
    pause,
    startNativeRecording,
    stopNativeRecording,
    moveWolfTarget: (contact: boolean) => scene.moveWolfTarget(contact)
  }
})
function options(): MotionReviewOptions {
  const selected = (document.getElementById('role') as HTMLSelectElement).value
  return {
    role: selected === 'runner' ? 'runner' : 'wolf',
    realBoss: selected === 'wolf-boss',
    action: (document.getElementById('action') as HTMLSelectElement).value as MotionReviewOptions['action'],
    direction: (document.getElementById('direction') as HTMLSelectElement).value as MotionReviewOptions['direction']
  }
}
document.getElementById('play')!.onclick = async () => {
  await prepare(options())
  await play(options().action === 'idle' ? 3200 : options().action === 'route' ? 8000 : 1600)
}
document.getElementById('pause')!.onclick = pause
document.getElementById('status')!.textContent = 'ready'
