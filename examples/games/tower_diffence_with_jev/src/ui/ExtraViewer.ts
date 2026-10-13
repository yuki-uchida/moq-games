import { ModelEnvironmentLighting } from '../rendering/ModelEnvironmentLighting'
import './extra-viewer.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { UNIT_MODEL_CATALOG } from '../rendering/models/catalog'
import type { UnitType } from '../game/model'
import type { ModelMotion } from '../rendering/ModelUnitVisual'
import { ModelViewerSession, viewerMotions, viewerRoleLabel, viewerRoles } from './ModelViewerSession'

const element = <T extends HTMLElement>(id: string) => document.getElementById(`viewer-${id}`)! as T
const role = element<HTMLSelectElement>('role')
const motion = element<HTMLSelectElement>('motion')
const canvas = element<HTMLCanvasElement>('canvas')
const status = element('status')
const play = element<HTMLButtonElement>('play')
const restart = element<HTMLButtonElement>('restart')
const retry = element<HTMLButtonElement>('retry')
const timeline = element<HTMLInputElement>('timeline')
const speed = element<HTMLSelectElement>('speed')

/** Recreated on BFCache restore; pagehide releases GPU, loaders, listeners and clock. */
function mount() {
  const listeners = new AbortController()
  const session = new ModelViewerSession()
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    status.textContent = '3D表示を開始できませんでした。WebGLが使えるブラウザーで開いてください。'
    role.disabled = motion.disabled = true
    session.dispose()
    return () => listeners.abort()
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  const modelEnvironment = new ModelEnvironmentLighting(scene)
  scene.add(session.root)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x52785e, 2.5))
  const key = new THREE.DirectionalLight(0xfff4db, 3)
  key.position.set(140, 220, 160)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xcde7ff, 1.5)
  fill.position.set(-140, 80, -100)
  scene.add(fill)
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000)
  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = false
  controls.enableDamping = false
  controls.minPolarAngle = 0.05
  controls.maxPolarAngle = Math.PI - 0.05
  controls.minDistance = 20
  controls.maxDistance = 1200
  let initialTarget = new THREE.Vector3(0, 35, 0)
  let initialPosition = new THREE.Vector3(110, 100, 240)
  let fitted = false
  let disposed = false
  let frameRequest = 0
  let lastTime: number | undefined
  let renderCount = 0

  function resetCamera() {
    controls.target.copy(initialTarget)
    camera.position.copy(initialPosition)
    camera.zoom = 1
    camera.updateProjectionMatrix()
    controls.update()
  }
  function resize() {
    const width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()
  function fitCamera() {
    // SkinnedMesh updates bindMatrixInverse here, before CPU bounds inspect the pose.
    scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(session.root)
    if (bounds.isEmpty()) return
    const center = bounds.getCenter(new THREE.Vector3())
    const radius = Math.max(24, bounds.getSize(new THREE.Vector3()).length() / 2)
    const angle = Math.min(
      (camera.fov * Math.PI) / 360,
      Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)
    )
    const distance = (radius / Math.sin(angle)) * 1.35
    initialTarget = center
    initialPosition = center.clone().add(new THREE.Vector3(0.35, 0.23, 1).normalize().multiplyScalar(distance))
    controls.minDistance = radius * 0.6
    controls.maxDistance = distance * 5
    camera.far = Math.max(4000, controls.maxDistance * 2)
    resetCamera()
    fitted = true
  }
  function updateUI() {
    const ready = session.state === 'ready'
    play.disabled = restart.disabled = timeline.disabled = !ready
    const playLabel = session.paused ? 'Play' : 'Pause'
    if (play.textContent !== playLabel) play.textContent = playLabel
    timeline.max = String(session.duration || 1)
    timeline.value = String(session.seconds)
    element('time').textContent = `${session.seconds.toFixed(2)} / ${session.duration.toFixed(2)} s`
    retry.hidden = session.state !== 'error'
    const message =
      session.state === 'error'
        ? session.error
        : ready
          ? '3Dモデル · ' + viewerRoleLabel(session.role!)
          : '3Dモデルを読み込み中…'
    if (status.textContent !== message) status.textContent = message
    if (status.dataset.state !== session.state) status.dataset.state = session.state
  }
  function selectMotion() {
    fitted = false
    lastTime = undefined
    session.select(role.value as UnitType, motion.value as ModelMotion)
    updateUI()
  }
  function selectRole() {
    const definition = UNIT_MODEL_CATALOG[role.value as UnitType]
    const available = definition ? viewerMotions(definition) : []
    const previous = motion.value
    motion.replaceChildren(...available.map((value) => new Option(value, value)))
    motion.value = available.includes(previous as ModelMotion) ? previous : (available[0] ?? '')
    motion.disabled = !available.length
    const missing = []
    if (!definition?.clips.death) missing.push('death は未収録')
    if (role.value === 'healer') missing.push('回復動作は heal')
    element('missing').textContent = missing.join(' · ')
    selectMotion()
  }
  role.disabled = false
  role.replaceChildren(...viewerRoles().map((value) => new Option(viewerRoleLabel(value), value)))
  role.value = viewerRoles().includes('soldier') ? 'soldier' : (viewerRoles()[0] ?? '')
  const on = (target: EventTarget, event: string, listener: EventListener) =>
    target.addEventListener(event, listener, { signal: listeners.signal })
  on(role, 'change', selectRole)
  on(motion, 'change', selectMotion)
  on(retry, 'click', selectMotion)
  on(play, 'click', () => {
    session.toggle()
    updateUI()
  })
  on(restart, 'click', () => {
    session.seek(0)
    updateUI()
  })
  on(timeline, 'input', () => {
    session.seek(Number(timeline.value))
    updateUI()
  })
  on(speed, 'change', () => {
    session.speed = Number(speed.value)
  })
  on(element('reset'), 'click', resetCamera)
  on(canvas, 'webglcontextlost', (event) => {
    event.preventDefault()
    session.pause()
    status.textContent = '3D表示が中断されました。ページを再読み込みしてください。'
    cancelAnimationFrame(frameRequest)
    play.disabled = restart.disabled = timeline.disabled = true
  })
  on(canvas, 'keydown', (event) => {
    const key = (event as KeyboardEvent).key
    const offset = camera.position.clone().sub(controls.target)
    const spherical = new THREE.Spherical().setFromVector3(offset)
    if (key === 'ArrowLeft') spherical.theta -= 0.12
    else if (key === 'ArrowRight') spherical.theta += 0.12
    else if (key === 'ArrowUp') spherical.phi -= 0.12
    else if (key === 'ArrowDown') spherical.phi += 0.12
    else if (key === '+' || key === '=') spherical.radius *= 0.9
    else if (key === '-') spherical.radius *= 1.1
    else return
    event.preventDefault()
    spherical.phi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, spherical.phi))
    spherical.radius = Math.max(controls.minDistance, Math.min(controls.maxDistance, spherical.radius))
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical))
    controls.update()
  })
  on(document, 'visibilitychange', () => {
    lastTime = undefined
    if (document.hidden) {
      session.pause()
      updateUI()
    }
  })
  session.speed = Number(speed.value)
  selectRole()
  function frame(now: number) {
    if (disposed) return
    const delta = lastTime === undefined || document.hidden ? 0 : (now - lastTime) / 1000
    lastTime = now
    session.tick(delta)
    if (session.state === 'ready' && !fitted) fitCamera()
    updateUI()
    controls.update()
    modelEnvironment.ensure(renderer)
    renderer.render(scene, camera)
    renderCount++
    frameRequest = requestAnimationFrame(frame)
  }
  frameRequest = requestAnimationFrame(frame)
  // Read-only diagnostics for runtime regressions; does not start the game/debug bot.
  const diagnostics = () => ({
    ...session.diagnostics(),
    renderCount,
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      distance: camera.position.distanceTo(controls.target)
    },
    renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    modelEnvironment: modelEnvironment.diagnostics(),
    disposed
  })
  Object.assign(window, { __extraViewerDiagnostics: diagnostics })
  return () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frameRequest)
    listeners.abort()
    observer.disconnect()
    controls.dispose()
    session.dispose()
    scene.clear()
    modelEnvironment.dispose()
    renderer.dispose()
  }
}
let unmount: (() => void) | undefined
window.addEventListener('pagehide', () => {
  unmount?.()
  unmount = undefined
})
window.addEventListener('pageshow', () => {
  if (!unmount) unmount = mount()
})
unmount = mount()
