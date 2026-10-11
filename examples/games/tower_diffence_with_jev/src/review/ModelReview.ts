import * as THREE from 'three'
import { ModelAssetCache } from '../rendering/ModelAssetCache'
import { ModelUnitVisual, type ModelMotion } from '../rendering/ModelUnitVisual'

const scene = new THREE.Scene()
scene.background = new THREE.Color('#60785e')
const camera = new THREE.OrthographicCamera(0, 800, 0, 450, -200, 200)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(800, 450)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
document.querySelector('#stage')!.append(renderer.domElement)
scene.add(new THREE.HemisphereLight(0xf4ffe3, 0x244352, 2.5))
const light = new THREE.DirectionalLight(0xffe0ad, 3)
light.position.set(-120, -240, 100)
scene.add(light)
const cache = new ModelAssetCache()
const url = new URL('../../../tower-defense-art/models/slime/animated.glb', document.baseURI).href
const visual = new ModelUnitVisual({
  scale: 95, origin: [0, 0, 0], yaw: 0, walkDistance: 32,
  clips: Object.fromEntries(['idle', 'walk', 'attack', 'death'].map(clip => [clip, { url, clip }])),
  provenance: 'Library slime source bundle v1; authored melted-body source and four clips; unaccepted pilot'
}, cache)
scene.add(visual.root)
visual.setPosition(400, 325)
const floor = new THREE.Mesh(new THREE.CircleGeometry(145, 64), new THREE.MeshBasicMaterial({ color: 0x3a5644 }))
floor.scale.y = .32
floor.position.set(400, 325, -20)
scene.add(floor)
const motion = document.querySelector<HTMLSelectElement>('#motion')!
let start = performance.now(), angle = 0, handle = 0
motion.onchange = () => { start = performance.now() }
document.querySelector<HTMLButtonElement>('#replay')!.onclick = () => { start = performance.now() }
document.querySelector<HTMLButtonElement>('#turn')!.onclick = () => { angle += Math.PI / 4 }
const status = document.querySelector('#status')!
function frame() {
  try {
    const selected = motion.value as ModelMotion
    visual.sample({ motion: selected, seconds: (performance.now() - start) / 1000,
      loop: selected === 'idle' || selected === 'walk', facingX: Math.sin(angle), facingY: Math.cos(angle), boss: false })
    const info = visual.diagnostics()
    status.textContent = cache.error(url) ?? `${info.renderer}: ${info.meshes} meshes, ${info.triangles} triangles · ${selected} · ${info.seconds?.toFixed(2)}s`
    renderer.render(scene, camera)
    Object.assign(window, { modelReview: { ...info, cache: cache.diagnostics(), renderer: renderer.info.render } })
  } catch (error) { status.textContent = String(error) }
  handle = requestAnimationFrame(frame)
}
frame()
window.addEventListener('pagehide', () => { cancelAnimationFrame(handle); visual.dispose(); cache.dispose(); floor.geometry.dispose(); floor.material.dispose(); renderer.dispose() }, { once: true })
