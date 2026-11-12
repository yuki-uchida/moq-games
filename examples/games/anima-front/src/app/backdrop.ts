/**
 * The plaza: the light 3D scene behind the menus. The squad stands on a ruined plaza at dusk, the camera slowly
 * orbiting, anima motes drifting up; on the results the squad celebrates (or slumps) with the MVP in a
 * spotlight. The title's live attract demo (attract.ts) is drawn over it when the device can afford it.
 */
import * as THREE from 'three'
import type { ItemId } from '../data/items'
import { presetById } from '../data/loadout'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species'
import type { CharacterModel, Emote, ModelKit } from '../models/api'
import { createStage, gradientTexture, idlePose } from '../ui/stage3d'
import { pawLists } from './loadouts'
import type { BackdropMode, CastMember } from './context'
import { TEAMS } from './match'

export interface Plaza {
  readonly canvas: HTMLCanvasElement
  setMode(mode: BackdropMode): void
  setSquad(species: readonly string[]): void
  setCast(cast: readonly CastMember[] | null): void
  dispose(): void
}

/** Results cast spots: the MVP in front, the others in a shallow arc beside it (x, z, yaw). */
const CAST_SPOTS: [number, number, number][] = [
  [0, 0.85, 0],
  [-1.15, 0.15, 0.22],
  [1.15, 0.15, -0.22],
  [-2.2, -0.5, 0.4]
]
/** Centre of the cast (the camera frames it). */
const CAST_CENTRE_X = -0.5

export function createPlaza(kit: ModelKit): Plaza {
  const canvas = document.createElement('canvas')
  canvas.className = 'af-backdrop'
  canvas.setAttribute('aria-hidden', 'true')
  const stage = createStage(canvas, { fov: 32, maxDpr: 1.5 })
  const { scene, camera } = stage
  scene.background = gradientTexture([
    [0, '#0d1430'],
    [0.45, '#25335f'],
    [0.72, '#6a4b6e'],
    [1, '#f09a5c']
  ])
  scene.fog = new THREE.Fog(0x2a2a50, 18, 60)

  // ground: a cracked plaza with a warm anima glow in the centre
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0x2c3450, roughness: 0.95 })
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    new THREE.MeshBasicMaterial({
      map: gradientTexture(
        [
          [0, 'rgba(255,170,90,0.5)'],
          [0.5, 'rgba(255,140,60,0.12)'],
          [1, 'rgba(255,140,60,0)']
        ],
        256,
        true
      ),
      transparent: true,
      depthWrite: false
    })
  )
  glow.rotation.x = -Math.PI / 2
  glow.position.y = 0.01
  scene.add(glow)

  // ruined skyline: silhouettes of broken buildings and violet crystals far away
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x1b2242, roughness: 1 })
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x6b3fa0,
    emissive: 0x7b3fd0,
    emissiveIntensity: 0.7,
    roughness: 0.3
  })
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rnd() * 0.2
    const r = 24 + rnd() * 14
    const hgt = 3 + rnd() * 12
    const box = new THREE.Mesh(new THREE.BoxGeometry(3 + rnd() * 5, hgt, 3 + rnd() * 4), ruinMat)
    box.position.set(Math.cos(a) * r, hgt / 2 - 0.3, Math.sin(a) * r)
    box.rotation.y = rnd() * Math.PI
    box.rotation.z = (rnd() - 0.5) * 0.12
    scene.add(box)
    if (rnd() > 0.55) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(1 + rnd() * 1.8, 0), crystalMat)
      c.position.set(Math.cos(a + 0.08) * (r - 3), 1 + rnd() * 2, Math.sin(a + 0.08) * (r - 3))
      c.scale.y = 1.8 + rnd()
      c.rotation.set(rnd(), rnd(), rnd() * 0.4)
      scene.add(c)
    }
  }

  // anima motes
  const motes = 160
  const positions = new Float32Array(motes * 3)
  const speeds = new Float32Array(motes)
  for (let i = 0; i < motes; i++) {
    positions[i * 3] = (rnd() - 0.5) * 22
    positions[i * 3 + 1] = rnd() * 8
    positions[i * 3 + 2] = (rnd() - 0.5) * 22
    speeds[i] = 0.2 + rnd() * 0.6
  }
  const moteGeo = new THREE.BufferGeometry()
  moteGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const moteMat = new THREE.PointsMaterial({
    color: 0xffb46a,
    size: 0.09,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  scene.add(new THREE.Points(moteGeo, moteMat))

  const squadRoot = new THREE.Group()
  scene.add(squadRoot)
  let characters: { model: CharacterModel; pose: ReturnType<typeof idlePose> }[] = []
  let squad: SpeciesId[] = []
  let cast: readonly CastMember[] | null = null

  // MVP spotlight: a warm pool of light and a soft beam (shown on the results)
  const spot = new THREE.Group()
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 48),
    new THREE.MeshBasicMaterial({
      map: gradientTexture(
        [
          [0, 'rgba(255,214,120,0.85)'],
          [0.55, 'rgba(255,190,90,0.25)'],
          [1, 'rgba(255,170,60,0)']
        ],
        256,
        true
      ),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.y = 0.02
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.95, 7, 32, 1, true),
    new THREE.MeshBasicMaterial({
      map: gradientTexture([
        [0, 'rgba(255,220,150,0)'],
        [0.6, 'rgba(255,220,150,0.10)'],
        [1, 'rgba(255,220,150,0.28)']
      ]),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  )
  beam.position.y = 3.5
  const spotLight = new THREE.PointLight(0xffd28a, 6, 6, 1.6)
  spotLight.position.set(0, 3, 0.6)
  spot.add(pool, beam, spotLight)
  spot.visible = false
  scene.add(spot)

  const clearCharacters = () => {
    for (const c of characters) {
      squadRoot.remove(c.model.root)
      c.model.dispose()
    }
    characters = []
  }

  const place = (
    id: SpeciesId,
    at: [number, number, number],
    o: { emote?: Emote; team?: number; r?: ItemId | null; l?: ItemId | null } = {}
  ) => {
    try {
      const model = kit.createCharacter(id, { outline: true })
      const lists = pawLists(presetById(SPECIES[id].preset).loadout)
      const [x, z, yaw] = at
      model.root.position.set(x, 0, z)
      model.root.rotation.y = yaw
      if (o.team != null) {
        const t = TEAMS[o.team]
        if (t) model.setTeam(parseInt(t.color.slice(1), 16), o.team as 0 | 1 | 2)
      }
      squadRoot.add(model.root)
      const r = o.r !== undefined ? o.r : (lists.R[0] ?? null)
      const l = o.l !== undefined ? o.l : (lists.L[0] ?? null)
      characters.push({ model, pose: idlePose(o.emote ? null : r, o.emote ? null : l, o.emote) })
    } catch (err) {
      console.warn('[anima-front] backdrop character failed', id, err)
    }
  }

  const buildSquad = () => {
    clearCharacters()
    spot.visible = false
    const spots: [number, number, number][] = [
      [0, 0.6, 0],
      [-1.7, -0.3, 0.35],
      [1.7, -0.3, -0.35],
      [0, -1.6, Math.PI * 0.05]
    ]
    squad.forEach((id, i) => place(id, spots[i]))
  }

  const buildCast = (list: readonly CastMember[]) => {
    clearCharacters()
    // the MVP takes the front spot; the others keep their order
    const order = [...list.filter((c) => c.mvp), ...list.filter((c) => !c.mvp)].slice(0, CAST_SPOTS.length)
    order.forEach((c, i) => place(c.species, CAST_SPOTS[i], { emote: c.emote, team: c.team, r: c.r, l: c.l }))
    spot.visible = order.some((c) => c.mvp)
    spot.position.set(CAST_SPOTS[0][0], 0, CAST_SPOTS[0][1])
  }

  let mode: BackdropMode = 'title'
  let time = 0
  let last = performance.now()
  let raf = 0
  let disposed = false
  const reduced = () => document.documentElement.classList.contains('reduced-motion')

  const loop = (now: number) => {
    if (disposed) return
    raf = requestAnimationFrame(loop)
    if (mode === 'off' || document.hidden) {
      last = now
      return
    }
    const raw = (now - last) / 1000
    // menus are behind a blur: ~30 fps is plenty
    if (mode === 'menu' && raw < 1 / 32) return
    const dt = Math.min(0.1, raw)
    last = now
    time += reduced() ? dt * 0.25 : dt
    const portrait = camera.aspect < 0.8
    stage.fit()
    if (mode === 'results') {
      // a slow sway in front of the cast; the cast stands right of the panels (wide) or above them (portrait)
      const wide = camera.aspect > 1.25
      const d = wide ? 11.5 : portrait ? 20 : 12
      const sway = reduced() ? 0 : Math.sin(time * 0.18) * 0.6
      camera.position.set(CAST_CENTRE_X + sway, 2.3, d)
      camera.lookAt(CAST_CENTRE_X, 0.8, 0)
      const w = stage.renderer.domElement.width
      const hgt = stage.renderer.domElement.height
      if (wide) camera.setViewOffset(w, hgt, -w * 0.29, 0, w, hgt)
      else camera.setViewOffset(w, hgt, 0, hgt * (portrait ? 0.3 : 0.18), w, hgt)
      beam.material.opacity = 0.55 + Math.sin(time * 2.2) * 0.15
    } else {
      camera.clearViewOffset()
      // a slow pendulum in front of the squad (a full orbit would show their backs)
      const a = 0.35 + Math.sin(time * 0.045) * 0.6
      const r = (mode === 'title' ? 9.5 : 11) * (portrait ? 1.45 : 1)
      camera.position.set(Math.sin(a) * r, 2.3 + Math.sin(time * 0.1) * 0.25, Math.cos(a) * r)
      // wide screens: aim left of the squad so it stands on the right, clear of the menu
      const k = camera.aspect > 1.2 ? 1.7 : 0
      camera.lookAt(-Math.cos(a) * k, portrait ? -0.1 : 0.95, Math.sin(a) * k)
    }
    for (const c of characters) {
      try {
        c.model.update(dt, c.pose)
      } catch (err) {
        // a broken model must not stop the backdrop: drop it
        console.warn('[anima-front] backdrop character update failed', err)
        squadRoot.remove(c.model.root)
        characters = characters.filter((x) => x !== c)
      }
    }
    const p = moteGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < motes; i++) {
      let y = p.getY(i) + speeds[i] * dt
      if (y > 8) y = 0
      p.setY(i, y)
      p.setX(i, p.getX(i) + Math.sin(time + i) * dt * 0.08)
    }
    p.needsUpdate = true
    stage.render()
  }
  raf = requestAnimationFrame(loop)

  return {
    canvas,
    setMode(next) {
      mode = next
      canvas.classList.toggle('mode-menu', next === 'menu')
      canvas.classList.toggle('mode-off', next === 'off')
      canvas.classList.toggle('mode-title', next === 'title')
      canvas.classList.toggle('mode-results', next === 'results')
      if (next !== 'results' && cast) {
        cast = null
        buildSquad()
      }
    },
    setSquad(list) {
      squad = list.filter((s): s is SpeciesId => (SPECIES_IDS as readonly string[]).includes(s)).slice(0, 4)
      if (!cast) buildSquad()
    },
    setCast(list) {
      cast = list && list.length ? list : null
      if (cast) buildCast(cast)
      else buildSquad()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      clearCharacters()
      stage.dispose()
      canvas.remove()
    }
  }
}
