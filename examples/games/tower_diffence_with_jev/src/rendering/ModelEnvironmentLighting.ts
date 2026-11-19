import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export function createBattlefieldModelLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): ModelEnvironmentLighting {
  renderer.toneMapping = THREE.NeutralToneMapping
  const sky = new THREE.HemisphereLight(0xffefd4, 0x7795ac, 1.75)
  sky.position.set(0, -0.93, 0.37)
  const light = new THREE.DirectionalLight(0xffe3b8, 2.75)
  light.position.set(-3, -4, 6)
  const fill = new THREE.DirectionalLight(0xb8dfe5, 1.3)
  fill.position.set(4, -2, -1)
  scene.add(sky, light, fill)
  return new ModelEnvironmentLighting(scene, 0.5)
}

/** One renderer-owned IBL, shared by every real model in its scene. No asset requests. */
export class ModelEnvironmentLighting {
  private target?: THREE.WebGLRenderTarget
  private disposed = false
  private generations = 0

  constructor(
    private readonly scene: THREE.Scene,
    private readonly intensity = 0.25
  ) {}

  /** Lazy so the title screen retains its zero-render/zero-program startup. */
  ensure(renderer: THREE.WebGLRenderer): void {
    if (this.target || this.disposed) return
    const generator = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    try {
      this.target = generator.fromScene(room, 0.04)
      this.scene.environment = this.target.texture
      this.scene.environmentIntensity = this.intensity
      this.generations++
    } finally {
      room.dispose()
      generator.dispose()
    }
  }

  invalidate(): void {
    this.target?.dispose()
    this.target = undefined
    this.scene.environment = null
  }

  diagnostics() {
    return { ready: !!this.target, intensity: this.scene.environmentIntensity, generations: this.generations }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.target && this.scene.environment === this.target.texture) this.scene.environment = null
    this.target?.dispose()
    this.target = undefined
  }
}
