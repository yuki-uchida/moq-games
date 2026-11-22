import * as THREE from 'three'
import { createBoardCamera } from '../rendering/BoardCamera'
import { orientBoardCanvas } from '../rendering/BoardCanvas'
import { ATTACK_PROFILES } from '../game/AttackProfiles'
import { STACK_DESIGNS } from '../rendering/stack/designs'
import { StackVisual } from '../rendering/stack/StackVisual'
import type { StackMotion } from '../rendering/stack/StackDesign'
import { getField, type BattlefieldVersion, type FieldId, type LayoutRevision, type UnitType } from '../game/model'
import { StackStage } from '../rendering/stack/stage/StackStage'
import { stackPortrait } from '../rendering/stack/StackPortrait'

// ?types=a,b&motions=idle,walk,attack&facings=8&scale=1.5&t=<seconds fraction of motion>&still
const params = new URL(location.href).searchParams
const types = (params.get('types')?.split(',') ?? Object.keys(STACK_DESIGNS)) as UnitType[]
const motions = (params.get('motions')?.split(',') ?? ['idle', 'walk', 'attack']) as StackMotion[]
const facings = Number(params.get('facings') ?? 8)
const presentation = Number(params.get('scale') ?? 1.5)
const cellW = Number(params.get('cell') ?? 110)
const cellH = Number(params.get('cellh') ?? 120)
const still = params.has('still')
const phase = Number(params.get('t') ?? 0.5)
if (params.has('stage')) {
  const id = params.get('stage') as FieldId
  const layout = Number(params.get('layout') ?? 4) as LayoutRevision
  const version = Number(params.get('version') ?? 2) as BattlefieldVersion
  const field = getField(id, version, layout)
  const aspect = Number(params.get('aspect') ?? 1.116)
  const scene = new THREE.Scene()
  const camera = createBoardCamera(field)
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setPixelRatio(1)
  renderer.setSize(Math.round(field.width * aspect), field.height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  orientBoardCanvas(renderer.domElement)
  document.querySelector('#stage')!.append(renderer.domElement)
  const stage = new StackStage(scene)
  stage.build(field, aspect, 1.5)
  stage.setBase(Number(params.get('tier') ?? 2), 0)
  for (const [index, type] of (
    ['soldier', 'archer', 'tank', 'mage', 'slime', 'goblin', 'wolf'] as UnitType[]
  ).entries()) {
    const slot = field.slots[(index * 3) % field.slots.length]
    const visual = new StackVisual(STACK_DESIGNS[type]!, index / 7)
    visual.setPresentation(1.5, aspect)
    visual.setPosition(slot.x, slot.y)
    visual.sample({ motion: 'idle', seconds: 0, time: 0.4, facingX: 1, facingY: 0.4, boss: false })
    scene.add(visual.root)
  }
  renderer.render(scene, camera)
  document.body.dataset.ready = 'true'
  throw new Error('stage only')
}
if (params.has('portraits')) {
  for (const type of types) {
    const img = document.createElement('img')
    img.src = stackPortrait(STACK_DESIGNS[type], 128)
    img.style.cssText = 'width:128px;height:128px;background:#2c3a46;margin:4px;border-radius:50%'
    document.querySelector('#stage')!.append(img)
  }
  document.body.dataset.ready = 'true'
  throw new Error('portrait sheet only')
}
const rows = types.flatMap((type) => motions.map((motion) => ({ type, motion })))
const width = cellW * facings
const height = cellH * rows.length
const scene = new THREE.Scene()
scene.background = new THREE.Color(params.get('bg') ?? '#5f7f4f')
const camera = createBoardCamera({ width, height })
const renderer = new THREE.WebGLRenderer({ antialias: false })
renderer.setPixelRatio(Number(params.get('dpr') ?? 1))
renderer.setSize(width, height)
renderer.outputColorSpace = THREE.SRGBColorSpace
orientBoardCanvas(renderer.domElement)
document.querySelector('#stage')!.append(renderer.domElement)
const actors = rows.flatMap(({ type, motion }, row) =>
  Array.from({ length: facings }, (_, column) => {
    const design = STACK_DESIGNS[type]!
    const visual = new StackVisual(design, 0.3)
    visual.setPresentation(presentation, 1)
    visual.setPosition(cellW * (column + 0.5), cellH * (row + 0.78))
    scene.add(visual.root)
    const angle = (column / facings) * Math.PI * 2
    return { type, motion, visual, fx: Math.sin(angle), fy: Math.cos(angle) }
  })
)
const start = performance.now()
function frame() {
  const now = (performance.now() - start) / 1000
  for (const actor of actors) {
    const profile = ATTACK_PROFILES[actor.type as keyof typeof ATTACK_PROFILES] ?? { durationMs: 900, cueMs: 450 }
    const length =
      actor.motion === 'walk'
        ? 1
        : actor.motion === 'death'
          ? 1.2
          : actor.motion === 'special'
            ? 1.6
            : profile.durationMs / 1000
    const seconds = still ? phase * length : actor.motion === 'idle' ? now : now % (length + 0.4)
    if (actor.motion === 'death') {
      actor.visual.sample({ motion: 'idle', seconds: 0, time: 0, facingX: actor.fx, facingY: actor.fy, boss: false })
      actor.visual.sampleFall(seconds)
      continue
    }
    actor.visual.sample({
      motion: actor.motion,
      seconds,
      cycle: actor.motion === 'walk' ? seconds : undefined,
      time: still ? 0.4 : now,
      facingX: actor.fx,
      facingY: actor.fy,
      boss: false,
      durationMs: profile.durationMs,
      cueMs: profile.cueMs
    })
  }
  renderer.render(scene, camera)
  if (!still) requestAnimationFrame(frame)
  else document.body.dataset.ready = 'true'
}
frame()
document.querySelector('#status')!.textContent = `${types.length} designs`
