/**
 * The built environment of one map: merged chunk meshes, instanced decor, sky dome, hemisphere + sun lighting
 * with a shadow box that follows the local player, fog, and the theme for post-processing and ambience.
 */
import * as THREE from 'three'
import type { MapDef } from '../../sim/types'
import type { QualityPreset } from '../core/quality'
import { SHADOW_CASTERS, type Emitter } from './ctx'
import { createEnvMaterials, type EnvMaterials } from './materials'
import { paintAtlas, type AtlasTextures } from './paint'
import { planEnvironment, type EnvPlan } from './plan'
import { SkyDome } from './sky'
import { themeFor, type ThemeDef } from './themes'

export class Environment {
  readonly group = new THREE.Group()
  readonly theme: ThemeDef
  readonly sunDir = new THREE.Vector3()
  readonly sun: THREE.DirectionalLight
  readonly hemi: THREE.HemisphereLight
  readonly sky: SkyDome
  readonly fog: THREE.Fog
  readonly plan: EnvPlan
  readonly emitters: Emitter[]
  private readonly textures: AtlasTextures
  private readonly mats: EnvMaterials
  private readonly geometries: THREE.BufferGeometry[] = []
  private shadowRange = 60

  constructor(map: MapDef, variant: 'night' | 'crater' | undefined, preset: QualityPreset) {
    this.theme = themeFor(map, variant)
    const t = this.theme
    this.sunDir.set(...t.sunDir).normalize()
    this.textures = paintAtlas(preset.maxPixelRatio > 1 ? 8 : 4)
    this.mats = createEnvMaterials(this.textures, t)
    this.plan = planEnvironment(map, t, { density: preset.decorDensity, chunk: preset.chunk })
    this.emitters = this.plan.emitters

    for (const c of this.plan.chunks) {
      const geo = c.geo.toGeometry()
      this.geometries.push(geo)
      const mesh = new THREE.Mesh(geo, this.mats.materials[c.mat])
      mesh.matrixAutoUpdate = false
      mesh.castShadow = SHADOW_CASTERS.has(c.mat)
      mesh.receiveShadow = c.mat !== 'glow' && c.mat !== 'pool'
      if (c.mat === 'pool') mesh.renderOrder = 2
      if (c.mat === 'water') mesh.renderOrder = 1
      mesh.name = `env:${c.mat}:${c.cell}`
      this.group.add(mesh)
    }
    const m = new THREE.Matrix4()
    for (const inst of this.plan.instanced) {
      const geo = inst.geo.toGeometry()
      this.geometries.push(geo)
      const mesh = new THREE.InstancedMesh(geo, this.mats.materials[inst.mat], inst.count)
      for (let i = 0; i < inst.count; i++) mesh.setMatrixAt(i, m.fromArray(inst.matrices, i * 16))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.castShadow = SHADOW_CASTERS.has(inst.mat)
      mesh.receiveShadow = inst.mat !== 'glow' && inst.mat !== 'pool'
      mesh.matrixAutoUpdate = false
      mesh.name = `decor:${inst.key}`
      this.group.add(mesh)
    }

    this.hemi = new THREE.HemisphereLight(t.hemi.sky, t.hemi.ground, t.hemi.intensity)
    this.sun = new THREE.DirectionalLight(t.sunColor, t.sunIntensity)
    this.sun.castShadow = preset.shadows
    this.configureShadows(preset)
    this.group.add(this.hemi, this.sun, this.sun.target)
    this.sky = new SkyDome(t, this.sunDir)
    this.group.add(this.sky.mesh)
    this.fog = new THREE.Fog(t.fog.color, t.fog.near, Math.min(t.fog.far, preset.far * 0.95))
  }

  configureShadows(preset: QualityPreset) {
    this.sun.castShadow = preset.shadows
    this.shadowRange = preset.shadowRange
    const cam = this.sun.shadow.camera
    cam.left = -this.shadowRange
    cam.right = this.shadowRange
    cam.top = this.shadowRange
    cam.bottom = -this.shadowRange
    cam.near = 1
    cam.far = 260
    cam.updateProjectionMatrix()
    if (this.sun.shadow.mapSize.x !== preset.shadowMapSize) {
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.035
    this.sun.shadow.radius = 3
  }

  /** Moves the sun's shadow box to `focus`, snapped to shadow texels so edges never crawl. */
  update(time: number, camera: THREE.Camera, focus: THREE.Vector3) {
    this.mats.update(time)
    this.sky.update(camera, time)
    const texel = (this.shadowRange * 2) / this.sun.shadow.mapSize.x
    // Snap in light space: project the focus onto the light's basis.
    const d = this.sunDir
    const right = _r.set(d.z, 0, -d.x).normalize()
    const up = _u.crossVectors(right, d).normalize()
    const a = Math.round(focus.dot(right) / texel) * texel
    const b = Math.round(focus.dot(up) / texel) * texel
    const c = focus.dot(d)
    _f.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(d, c)
    this.sun.target.position.copy(_f)
    this.sun.position.copy(_f).addScaledVector(d, 120)
    this.sun.target.updateMatrixWorld()
  }

  /** Night-only emissive multiplier tweak (e.g. flicker during blackouts); 1 = as planned. */
  setGlow(k: number) {
    this.mats.uniforms.uGlow.value = k
  }

  setWind(k: number) {
    this.mats.uniforms.uWind.value = k
  }

  dispose() {
    for (const g of this.geometries) g.dispose()
    this.mats.dispose()
    this.textures.dispose()
    this.sky.dispose()
    this.sun.shadow.map?.dispose()
    this.group.clear()
  }
}

const _r = new THREE.Vector3()
const _u = new THREE.Vector3()
const _f = new THREE.Vector3()
