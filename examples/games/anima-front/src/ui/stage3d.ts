/**
 * Small three.js stages for menus: the title backdrop and the turntables (loadout, codex). Each owns one
 * WebGL context and renders only while visible.
 */
import * as THREE from 'three'
import type { ItemId } from '../data/items'
import type { CharacterPose, HandPose } from '../models/api'

export interface Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  /** Matches the drawing buffer to the canvas' CSS size (call on resize). */
  fit(): void
  render(): void
  dispose(): void
}

export function createStage(
  canvas: HTMLCanvasElement,
  o: { fov?: number; alpha?: boolean; maxDpr?: number } = {}
): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: o.alpha ?? false,
    powerPreference: 'low-power'
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(o.fov ?? 35, 1, 0.1, 400)
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a2c40, 1.4))
  const key = new THREE.DirectionalLight(0xffe2c0, 2.4)
  key.position.set(4, 7, 5)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x8fb6ff, 1.4)
  rim.position.set(-5, 4, -6)
  scene.add(rim)
  let w = 0
  let hgt = 0
  const fit = () => {
    const cw = Math.max(1, Math.round(canvas.clientWidth))
    const ch = Math.max(1, Math.round(canvas.clientHeight))
    const dpr = Math.min(o.maxDpr ?? 2, window.devicePixelRatio || 1)
    if (cw === w && ch === hgt && renderer.getPixelRatio() === dpr) return
    w = cw
    hgt = ch
    renderer.setPixelRatio(dpr)
    renderer.setSize(cw, ch, false)
    camera.aspect = cw / ch
    camera.updateProjectionMatrix()
  }
  return {
    renderer,
    scene,
    camera,
    fit,
    render() {
      fit()
      renderer.render(scene, camera)
    },
    dispose() {
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
      })
      renderer.dispose()
      renderer.forceContextLoss?.()
    }
  }
}

const hand = (item: ItemId | null): HandPose => ({ item, act: 'idle', charge: 0, uses: 0, combo: 0, swap: 0 })

/** A relaxed standing pose holding one antique per paw. */
export function idlePose(r: ItemId | null, l: ItemId | null, emote?: CharacterPose['emote']): CharacterPose {
  return {
    localVel: [0, 0],
    grounded: true,
    vy: 0,
    move: 'idle',
    aimYaw: 0,
    aimPitch: 0,
    hands: [hand(r), hand(l)],
    state: 'alive',
    revive: 0,
    reviving: false,
    hurt: 0,
    emote
  }
}

/** Vertical gradient texture (sky / ground glow) drawn into a canvas. */
export function gradientTexture(stops: [number, string][], size = 256, radial = false): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = radial ? size : 4
  c.height = size
  const g = c.getContext('2d')!
  const grad = radial
    ? g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    : g.createLinearGradient(0, 0, 0, size)
  for (const [at, color] of stops) grad.addColorStop(at, color)
  g.fillStyle = grad
  g.fillRect(0, 0, c.width, c.height)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A soft round platform with a glowing anima ring (menus' turntables). */
export function createPlinth(radius = 1.1): THREE.Group {
  const g = new THREE.Group()
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.04, 0.16, 64),
    new THREE.MeshStandardMaterial({ color: 0x24325c, roughness: 0.55, metalness: 0.1 })
  )
  top.position.y = -0.08
  g.add(top)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.98, 0.025, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0xffa04a })
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.005
  g.add(ring)
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 2.4, 48),
    new THREE.MeshBasicMaterial({
      map: gradientTexture(
        [
          [0, 'rgba(255,160,74,0.35)'],
          [0.45, 'rgba(255,160,74,0.08)'],
          [1, 'rgba(255,160,74,0)']
        ],
        256,
        true
      ),
      transparent: true,
      depthWrite: false
    })
  )
  glow.rotation.x = -Math.PI / 2
  glow.position.y = -0.17
  g.add(glow)
  return g
}
