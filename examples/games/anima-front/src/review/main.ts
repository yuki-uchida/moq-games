/**
 * Model review page (dev only): turntables and labelled contact sheets of every animal and antique.
 *
 * URL API (all optional):
 *   ?species=fox&pose=run&r=orca&l=bee&angle=30&look=kurozume&team=1&passives=turtle,jelly&t=0.8
 *   ?item=hippo&act=charge&charge=1&angle=35
 *   ?sheet=species|views|poses|items|held|looks|faces  (+ species=…, angle=…, pose=…)
 *   quality=low|medium|high, outline=0, holo=1, cloak=0.5, static=1, cell=WxH, bg=light|dark
 * When everything is drawn, window.__review = { ready: true, stats, cells } (used by the screenshot script).
 */
import * as THREE from 'three'
import { ITEM_IDS, ITEMS, type ItemId } from '../data/items'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species'
import type { CharacterModel, ItemModel, Quality } from '../models/api'
import { createModelKit } from '../models/index'
import type { HandAct } from '../sim/types'
import { POSE_LABEL, POSE_TIME, POSES, poseAt, type PoseName } from './poses'

declare global {
  interface Window {
    __review?: { ready: boolean; stats: unknown; cells: number; ms: number }
  }
}

const q = new URLSearchParams(location.search)
const num = (key: string, def: number) => (q.has(key) ? Number(q.get(key)) : def)
const quality = (q.get('quality') ?? 'medium') as Quality
const sheet = q.get('sheet')
const isStatic = q.get('static') === '1' || !!sheet
const angleDeg = num('angle', sheet === 'items' ? 55 : 0)
const [cellW, cellH] = (q.get('cell') ?? (sheet === 'items' ? '260x260' : '300x380')).split('x').map(Number)
const dark = q.get('bg') === 'dark'
const TEAMS: [number, 0 | 1 | 2][] = [
  [0xe5484d, 0],
  [0x3e8ed0, 1],
  [0xf2b33d, 2]
]

const t0 = performance.now()
if (q.get('nosimp') === '1') (globalThis as { __animaModelsDebug?: object }).__animaModelsDebug = { noSimplify: true }
const kit = createModelKit({ quality })

interface Cell {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  label: string
  sub?: string
  step(dt: number): void
}

function stage(): THREE.Scene {
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xeef3ff, 0x8a7864, 1.25))
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.3)
  sun.position.set(2.2, 4.2, 3.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = sun.shadow.camera.bottom = -1.6
  sun.shadow.camera.right = sun.shadow.camera.top = 1.6
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xc8dcff, 0.6)
  fill.position.set(-3, 2, -2.5)
  scene.add(fill)
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 48),
    new THREE.MeshStandardMaterial({ color: dark ? 0x3a4050 : 0xd8d0c4, roughness: 1 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  return scene
}

function fitCamera(height: number, centerY: number, extra = 1.12): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(26, cellW / cellH, 0.05, 60)
  const fov = (camera.fov * Math.PI) / 180
  const dist = ((height * extra) / 2 / Math.tan(fov / 2)) * Math.max(1, (cellH / cellW) * 0.75)
  const el = 0.12
  camera.position.set(0, centerY + Math.sin(el) * dist, Math.cos(el) * dist)
  camera.lookAt(0, centerY, 0)
  return camera
}

interface CharOpts {
  pose?: PoseName
  t?: number
  r?: ItemId | null
  l?: ItemId | null
  angle?: number
  look?: 'ark' | 'kurozume'
  team?: number
  passives?: ItemId[]
  online?: boolean
  holo?: boolean
  cloak?: number
  anima?: number
  label?: string
  sub?: string
  face?: boolean
}

function characterCell(id: SpeciesId, o: CharOpts): Cell {
  const scene = stage()
  const model: CharacterModel = kit.createCharacter(id, { look: o.look, outline: q.get('outline') !== '0' })
  model.root.rotation.y = ((o.angle ?? angleDeg) * Math.PI) / 180
  scene.add(model.root)
  if (o.team !== undefined && o.team >= 0) model.setTeam(TEAMS[o.team][0], TEAMS[o.team][1])
  if (o.passives?.length) model.setPassives(o.passives, o.online ?? true)
  if (o.holo) model.setHologram(true)
  if (o.cloak) model.setCloak(o.cloak)
  model.setAnima(o.anima ?? 1)
  const H = SPECIES[id].height
  const zoom = num('zoom', 1)
  const camera = o.face ? fitCamera(H * 0.5, H * 0.78, 1.1) : fitCamera((H * 1.3) / zoom, H * num('cy', 0.6))
  const pose = o.pose ?? 'idle'
  let time = 0
  const step = (dt: number) => {
    time += dt
    model.update(dt, poseAt(pose, time, o.r ?? null, o.l ?? null))
  }
  const name = SPECIES[id].kind
  return { scene, camera, label: o.label ?? `${name}（${id}）`, sub: o.sub, step }
}

function itemCell(id: ItemId, o: { angle?: number; act?: HandAct; charge?: number }): Cell {
  const scene = stage()
  const item: ItemModel = kit.createItem(id)
  const box = new THREE.Box3().setFromObject(item.root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const holder = new THREE.Group()
  holder.add(item.root)
  item.root.position.sub(center)
  const radius = Math.max(size.length() * 0.5, 0.04)
  holder.position.y = radius + 0.01
  holder.rotation.y = ((o.angle ?? angleDeg) * Math.PI) / 180
  scene.add(holder)
  // Fit the camera to the antique at its real size (outlines keep their in-game width).
  const camera = fitCamera(radius * 2.1, holder.position.y, 1.0)
  camera.near = radius * 0.05
  camera.updateProjectionMatrix()
  const tri = kit.stats().items[id]?.triangles ?? 0
  return {
    scene,
    camera,
    label: `${ITEMS[id].name}（${id}）`,
    sub: `${tri} tris`,
    step: (dt) => item.update(dt, o.act ?? 'idle', o.charge ?? 0)
  }
}

// ---------------------------------------------------------------------------------------------- cell lists

const itemParam = (key: string) => (q.get(key) as ItemId | null) ?? null
const speciesParam = (q.get('species') ?? 'shiba') as SpeciesId
const poseParam = (q.get('pose') ?? 'idle') as PoseName
const ACTIVE = ITEM_IDS.filter((id) => ITEMS[id].active)

function buildCells(): { cells: Cell[]; cols: number } {
  const common = (): CharOpts => ({
    pose: poseParam,
    t: num('t', POSE_TIME[poseParam]),
    r: itemParam('r'),
    l: itemParam('l'),
    look: (q.get('look') as 'ark' | 'kurozume' | null) ?? 'ark',
    team: q.has('team') ? num('team', -1) : undefined,
    passives: (q.get('passives')?.split(',').filter(Boolean) ?? []) as ItemId[],
    holo: q.get('holo') === '1',
    cloak: num('cloak', 0)
  })
  switch (sheet) {
    case 'species':
      return { cells: SPECIES_IDS.map((id) => characterCell(id, common())), cols: 4 }
    case 'views': {
      const cells: Cell[] = []
      for (const id of SPECIES_IDS)
        for (const a of [0, 45, 90, 180]) cells.push(characterCell(id, { ...common(), angle: a, sub: `${a}°` }))
      return { cells, cols: 4 }
    }
    case 'poses': {
      const r = itemParam('r'),
        l = itemParam('l')
      return {
        cells: POSES.map((p) =>
          characterCell(speciesParam, {
            ...common(),
            pose: p,
            t: POSE_TIME[p],
            r,
            l,
            angle: num('angle', 30),
            label: POSE_LABEL[p],
            sub: p
          })
        ),
        cols: 7
      }
    }
    case 'items':
      return {
        cells: ITEM_IDS.map((id) =>
          itemCell(id, { act: (q.get('act') as HandAct) ?? 'idle', charge: num('charge', 0) })
        ),
        cols: 7
      }
    case 'held':
      return {
        cells: ACTIVE.map((id) =>
          characterCell(speciesParam, {
            ...common(),
            pose: poseParam,
            t: num('t', POSE_TIME[poseParam]),
            r: id,
            l: null,
            angle: num('angle', 35),
            label: ITEMS[id].name,
            sub: id
          })
        ),
        cols: 7
      }
    case 'looks': {
      const id = speciesParam
      const a = num('angle', 0)
      const list: CharOpts[] = [
        { label: 'ARK', angle: a },
        { label: 'ARK 背面', angle: 180 },
        { label: 'アカネ隊（斜線）', team: 0, angle: 160 },
        { label: 'アオイ隊（水玉）', team: 1, angle: 160 },
        { label: 'キハダ隊（山形）', team: 2, angle: 160 },
        { label: 'クロヅメ', look: 'kurozume', angle: 30 },
        { label: 'クロヅメ 背面', look: 'kurozume', angle: 180 },
        { label: '幻（ハトポッポ）', holo: true, angle: 30 },
        { label: '迷彩 50%', cloak: 0.5, angle: 30 },
        { label: 'カメ＋クラゲ', passives: ['turtle', 'jelly'], angle: 150 },
        { label: 'ハリネズミ＋モモンガ', passives: ['hedgehog', 'momonga'], angle: 150 },
        { label: 'モモンガ滑空', passives: ['momonga'], pose: 'glide', angle: 20 },
        { label: '装備オフライン', passives: ['turtle', 'hedgehog'], online: false, angle: 150, anima: 0.1 },
        { label: 'アニマ残り僅か', anima: 0.08, angle: 0 }
      ]
      return {
        cells: list.map((o) => characterCell(id, { ...o, pose: o.pose ?? 'idle' })),
        cols: 7
      }
    }
    case 'faces': {
      const pose = poseParam
      return {
        cells: SPECIES_IDS.map((id) =>
          characterCell(id, { ...common(), pose, t: num('t', POSE_TIME[pose]), face: true, angle: num('angle', 15) })
        ),
        cols: 4
      }
    }
  }
  const item = q.get('item') as ItemId | null
  if (item)
    return { cells: [itemCell(item, { act: (q.get('act') as HandAct) ?? 'idle', charge: num('charge', 0) })], cols: 1 }
  return { cells: [characterCell(speciesParam, common())], cols: 1 }
}

// ---------------------------------------------------------------------------------------------- page

const css = document.createElement('style')
css.textContent = `
  html, body { margin: 0; background: ${dark ? '#1d2230' : 'linear-gradient(#e8edf3, #d9d4cb)'}; font-family: system-ui, sans-serif; }
  .grid { position: relative; }
  .label { position: absolute; font-size: 13px; color: ${dark ? '#e8ecf4' : '#2a2a33'}; text-align: center; pointer-events: none; }
  .label b { display: block; font-weight: 700; }
  .label span { font-size: 11px; opacity: 0.7; }
  .panel { position: fixed; top: 8px; left: 8px; background: #fffd; padding: 8px; border-radius: 8px; font-size: 13px; z-index: 2; }
  .panel select, .panel button { margin: 2px; }
  .stats { position: fixed; bottom: 6px; right: 8px; font-size: 11px; color: #555; white-space: pre; }
`
document.head.appendChild(css)

const { cells, cols } = buildCells()
const rows = Math.ceil(cells.length / cols)
const single = cells.length === 1 && !sheet
const width = single ? window.innerWidth : cols * cellW
const height = single ? window.innerHeight : rows * cellH + 0
const grid = document.createElement('div')
grid.className = 'grid'
grid.style.width = `${width}px`
grid.style.height = `${height}px`
document.body.appendChild(grid)

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
renderer.setPixelRatio(single ? Math.min(devicePixelRatio, 2) : 1)
renderer.setSize(width, height)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.0
renderer.setScissorTest(true)
renderer.setClearColor(0x000000, 0)
grid.appendChild(renderer.domElement)

cells.forEach((cell, i) => {
  const label = document.createElement('div')
  label.className = 'label'
  const x = (i % cols) * cellW
  const y = Math.floor(i / cols) * cellH
  label.style.left = `${x}px`
  label.style.top = `${y + 6}px`
  label.style.width = `${single ? width : cellW}px`
  label.innerHTML = `<b>${cell.label}</b>${cell.sub ? `<span>${cell.sub}</span>` : ''}`
  grid.appendChild(label)
  if (single) {
    cell.camera.aspect = width / height
    cell.camera.updateProjectionMatrix()
  }
})

function draw() {
  cells.forEach((cell, i) => {
    const w = single ? width : cellW,
      h = single ? height : cellH
    const x = single ? 0 : (i % cols) * cellW
    const y = single ? 0 : height - (Math.floor(i / cols) + 1) * cellH
    renderer.setViewport(x, y, w, h)
    renderer.setScissor(x, y, w, h)
    renderer.render(cell.scene, cell.camera)
  })
}

function statsText() {
  const s = kit.stats()
  const lines = Object.entries(s.species).map(([id, v]) => `${id} ${v!.triangles} tris ${v!.ms.toFixed(0)} ms`)
  return lines.join('\n')
}

if (isStatic) {
  // Simulate each cell to its pose time with a fixed step, then draw once.
  const dt = 1 / 60
  const tEnd = num('t', POSE_TIME[poseParam])
  const times = cells.map((_, i) => {
    if (sheet === 'poses') return POSE_TIME[POSES[i]]
    if (sheet === 'looks') return 1.2
    return tEnd
  })
  cells.forEach((cell, i) => {
    for (let t = 0; t < times[i]; t += dt) cell.step(dt)
  })
  draw()
  window.__review = { ready: true, stats: kit.stats(), cells: cells.length, ms: performance.now() - t0 }
} else {
  const panel = document.createElement('div')
  panel.className = 'panel'
  const select = (key: string, values: readonly string[], labels?: (v: string) => string) => {
    const s = document.createElement('select')
    for (const v of ['', ...values]) {
      const o = document.createElement('option')
      o.value = v
      o.textContent = v ? (labels ? labels(v) : v) : `（${key}）`
      if (q.get(key) === v) o.selected = true
      s.appendChild(o)
    }
    s.onchange = () => {
      if (s.value) q.set(key, s.value)
      else q.delete(key)
      location.search = q.toString()
    }
    panel.appendChild(s)
  }
  select('species', SPECIES_IDS, (v) => SPECIES[v as SpeciesId].kind)
  select('pose', POSES, (v) => POSE_LABEL[v as PoseName])
  select('r', ACTIVE, (v) => `右：${ITEMS[v as ItemId].name}`)
  select('l', ACTIVE, (v) => `左：${ITEMS[v as ItemId].name}`)
  select('look', ['ark', 'kurozume'])
  select('team', ['0', '1', '2'])
  select('item', ITEM_IDS, (v) => ITEMS[v as ItemId].name)
  select('quality', ['low', 'medium', 'high'])
  document.body.appendChild(panel)
  const stats = document.createElement('div')
  stats.className = 'stats'
  stats.textContent = statsText()
  document.body.appendChild(stats)
  let last = performance.now()
  let spin = 0
  const loop = () => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    spin += dt * 0.5
    for (const cell of cells) {
      cell.step(dt)
      cell.scene.children.forEach((c) => {
        if (c.type === 'Group') c.rotation.y = (angleDeg * Math.PI) / 180 + (q.get('spin') === '0' ? 0 : spin)
      })
    }
    draw()
    requestAnimationFrame(loop)
  }
  loop()
  window.__review = { ready: true, stats: kit.stats(), cells: cells.length, ms: performance.now() - t0 }
}
