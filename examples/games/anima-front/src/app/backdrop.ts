/**
 * The 3D scene behind the menus: the squad standing on a ruined plaza at dusk, the camera slowly orbiting,
 * anima motes drifting up. Implements `Backdrop`, so the renderer's live attract demo can replace it later.
 */
import * as THREE from 'three'
import { presetById } from '../data/loadout'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species'
import type { CharacterModel, ModelKit } from '../models/api'
import { createStage, gradientTexture, idlePose } from '../ui/stage3d'
import { pawLists } from './loadouts'
import type { Backdrop, BackdropMode } from './context'

export function createMenuBackdrop(kit: ModelKit): Backdrop {
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
    const a = time * 0.06 + 0.6
    const portrait = camera.aspect < 0.8
    const r = (mode === 'title' ? 9.5 : 11) * (portrait ? 1.45 : 1)
    camera.position.set(Math.sin(a) * r, 2.3 + Math.sin(time * 0.1) * 0.25, Math.cos(a) * r)
    // wide screens: aim left of the squad so it stands on the right, clear of the menu
    const k = camera.aspect > 1.2 ? 1.7 : 0
    camera.lookAt(-Math.cos(a) * k, portrait ? -0.1 : 0.95, Math.sin(a) * k)
    for (const c of characters) c.model.update(dt, c.pose)
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
    },
    setSquad(list) {
      for (const c of characters) {
        squadRoot.remove(c.model.root)
        c.model.dispose()
      }
      characters = []
      const ids = list.filter((s): s is SpeciesId => (SPECIES_IDS as readonly string[]).includes(s)).slice(0, 4)
      const spots: [number, number, number][] = [
        [0, 0, 0.6],
        [-1.7, 0, -0.3],
        [1.7, 0, -0.3],
        [0, 0, -1.6]
      ]
      ids.forEach((id, i) => {
        try {
          const model = kit.createCharacter(id, { outline: true })
          const lists = pawLists(presetById(SPECIES[id].preset).loadout)
          const [x, y, z] = spots[i]
          model.root.position.set(x, y, z)
          model.root.rotation.y = (i === 1 ? 0.35 : i === 2 ? -0.35 : 0) + (i === 3 ? Math.PI * 0.05 : 0)
          squadRoot.add(model.root)
          characters.push({ model, pose: idlePose(lists.R[0] ?? null, lists.L[0] ?? null) })
        } catch (err) {
          console.warn('[anima-front] backdrop character failed', id, err)
        }
      })
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      for (const c of characters) c.model.dispose()
      stage.dispose()
      canvas.remove()
    }
  }
}
