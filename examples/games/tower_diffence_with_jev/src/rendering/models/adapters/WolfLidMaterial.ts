// Derived from the existing reviewed wolf-lid-color-v1 adapter.
// Local changes: self-contained motion type, reversible per-instance lifecycle,
// and Blender-correct normal-strength XYZ suppression. Original retained.
import * as THREE from 'three'
type Motion = 'idle' | 'walk' | 'attack'

export interface BlinkKey {
  timeMs: number
  blink: number
  depthMorph: number
}
export interface WolfLidConfig {
  adapterId: 'wolf-lid-color-v1'
  version: 1
  required: true
  nodeName: string
  materialName: string
  gltfAttribute: '_BLINK_REST'
  threeAttribute: '_blink_rest'
  eyes: { centerX: number; radiusX: number }[]
  centerZ: number
  radiusZ: number
  regionYExclusive: number[]
  regionRadialFade: number[]
  activeMultiplier: number
  lidOffset: number
  boundarySoftness: number
  creaseThicknessFade: number[]
  creaseOuterUFade: number[]
  creaseLinearRGB: number[]
  skinColorCoefficientsRGB: number[][][]
  skinColorSideThresholdX: number
  coveredRoughness: number
  coveredNormalStrength: number
  tracks: Record<Motion, BlinkKey[]>
}
function bounded(value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid Wolf adapter numeric parameter')
}
export function validateWolfLid(value: unknown): WolfLidConfig {
  const data = value as WolfLidConfig
  if (
    !data ||
    data.adapterId !== 'wolf-lid-color-v1' ||
    data.version !== 1 ||
    data.required !== true ||
    data.nodeName !== 'Wolf_Original_Body' ||
    data.materialName !== 'Wolf_Blink_Surface' ||
    data.gltfAttribute !== '_BLINK_REST' ||
    data.threeAttribute !== '_blink_rest'
  )
    throw new Error('Required Wolf material adapter identity/binding is unsupported')
  if (
    !Array.isArray(data.eyes) ||
    data.eyes.length !== 2 ||
    !Array.isArray(data.skinColorCoefficientsRGB) ||
    data.skinColorCoefficientsRGB.length !== 2
  )
    throw new Error('Invalid Wolf eye regions')
  for (const eye of data.eyes) {
    bounded(eye.centerX, -10, 10)
    bounded(eye.radiusX, 1e-6, 5)
  }
  bounded(data.centerZ, -10, 10)
  bounded(data.radiusZ, 1e-6, 5)
  bounded(data.activeMultiplier, 0, 100)
  bounded(data.lidOffset, -1, 1)
  bounded(data.boundarySoftness, 1e-8, 1)
  bounded(data.skinColorSideThresholdX, -10, 10)
  bounded(data.coveredRoughness, 0, 1)
  if (data.coveredNormalStrength !== 0) throw new Error('Unsupported covered normal strength')
  for (const values of [
    data.regionYExclusive,
    data.regionRadialFade,
    data.creaseThicknessFade,
    data.creaseOuterUFade
  ]) {
    if (!Array.isArray(values) || values.length !== 2 || values[0] >= values[1])
      throw new Error('Invalid adapter bounds')
    values.forEach((value) => bounded(value, -10, 10))
  }
  if (!Array.isArray(data.creaseLinearRGB) || data.creaseLinearRGB.length !== 3) throw new Error('Invalid crease color')
  data.creaseLinearRGB.forEach((value) => bounded(value, 0, 1))
  for (const side of data.skinColorCoefficientsRGB) {
    if (!Array.isArray(side) || side.length !== 3) throw new Error('Invalid skin coefficients')
    for (const channel of side) {
      if (!Array.isArray(channel) || channel.length !== 6) throw new Error('Invalid skin basis')
      channel.forEach((value) => bounded(value, -10, 10))
    }
  }
  for (const [motion, duration] of Object.entries({
    idle: 3000,
    walk: 1000,
    attack: 750
  })) {
    const track = data.tracks?.[motion as Motion]
    if (
      !Array.isArray(track) ||
      track.length < 2 ||
      track.length > 200 ||
      track[0].timeMs !== 0 ||
      track.at(-1)?.timeMs !== duration
    )
      throw new Error('Missing material blink track/end pose')
    track.forEach((key, index) => {
      bounded(key.timeMs, 0, duration)
      bounded(key.blink, 0, 1)
      bounded(key.depthMorph, 0, 1)
      if (index > 0 && key.timeMs <= track[index - 1].timeMs) throw new Error('Blink times are not ordered')
      if (motion === 'attack' && (key.blink !== 0 || key.depthMorph !== 0))
        throw new Error('Attack blink must remain zero')
    })
  }
  return data
}
export function sampleBlink(keys: BlinkKey[], timeMs: number): number {
  const time = Math.max(0, Math.min(keys.at(-1)!.timeMs, timeMs))
  let index = 0
  while (index + 1 < keys.length && keys[index + 1].timeMs <= time) index++
  const left = keys[index],
    right = keys[Math.min(index + 1, keys.length - 1)]
  return right.timeMs === left.timeMs
    ? left.blink
    : THREE.MathUtils.lerp(left.blink, right.blink, (time - left.timeMs) / (right.timeMs - left.timeMs))
}
const FRAGMENT = `
varying vec3 vWolfRest;
uniform float uWolfBlink;
uniform vec2 uWolfEyes[2];
uniform float uWolfCenterZ;
uniform float uWolfRadiusZ;
uniform vec2 uWolfRegionY;
uniform vec2 uWolfRadialFade;
uniform float uWolfActive;
uniform float uWolfOffset;
uniform float uWolfSoftness;
uniform vec2 uWolfCreaseThickness;
uniform vec2 uWolfCreaseOuter;
uniform vec3 uWolfCreaseColor;
uniform float uWolfCoefficients[36];
uniform float uWolfSide;
uniform float uWolfRoughness;
struct WolfLid { float mask; float crease; vec3 skin; };
WolfLid wolfLid(vec3 p, float b) {
  b = clamp(b, 0.0, 1.0);
  float mask = 0.0; float crease = 0.0; vec3 skins[2];
  for (int i = 0; i < 2; i++) {
    float u = (p.x - uWolfEyes[i].x) / uWolfEyes[i].y;
    float v = (p.z - uWolfCenterZ) / uWolfRadiusZ;
    float region = (1.0 - smoothstep(uWolfRadialFade.x, uWolfRadialFade.y, length(vec2(u,v)))) * float(p.y > uWolfRegionY.x && p.y < uWolfRegionY.y);
    float h = sqrt(max(1.0 - u*u, 0.0));
    float upper = uWolfCenterZ + (uWolfRadiusZ - (uWolfRadiusZ + uWolfOffset) * b) * h;
    float lower = uWolfCenterZ + (-uWolfRadiusZ + (uWolfRadiusZ - uWolfOffset) * b) * h;
    float lidActivation = min(b * uWolfActive, 1.0);
    float covered = min(smoothstep(-uWolfSoftness,uWolfSoftness,p.z-upper) + 1.0 - smoothstep(-uWolfSoftness,uWolfSoftness,p.z-lower), 1.0);
    mask += region * covered * lidActivation;
    crease += region * (1.0 - smoothstep(uWolfCreaseThickness.x,uWolfCreaseThickness.y,abs(p.z-upper))) * (1.0 - smoothstep(uWolfCreaseOuter.x,uWolfCreaseOuter.y,abs(u))) * lidActivation;
    vec3 color;
    for (int c = 0; c < 3; c++) {
      int k = i*18+c*6;
      color[c] = uWolfCoefficients[k] + uWolfCoefficients[k+1]*u + uWolfCoefficients[k+2]*v + uWolfCoefficients[k+3]*u*u + uWolfCoefficients[k+4]*u*v + uWolfCoefficients[k+5]*v*v;
    }
    skins[i] = clamp(color,0.0,1.0);
  }
  WolfLid lid; lid.mask = mask; lid.crease = crease; lid.skin = p.x > uWolfSide ? skins[1] : skins[0]; return lid;
}
`
export interface WolfLidController {
  sample(motion: Motion, timeMs: number): void
  dispose(): void
}
export function applyWolfLidMaterial(root: THREE.Object3D, value: unknown): WolfLidController {
  const config = validateWolfLid(value),
    blink = { value: 0 }
  const body = root.getObjectByName(config.nodeName)
  if (!body) throw new Error('Required Wolf body binding is missing')
  const targets: THREE.Mesh[] = []
  body.traverse((object) => {
    if (object instanceof THREE.Mesh) targets.push(object)
  })
  if (!targets.length) throw new Error('Required Wolf mesh is missing')
  let patched = 0
  const bindings: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; adapted: THREE.Material | THREE.Material[]; owned: THREE.Material[] }[] = []
  for (const mesh of targets) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (!materials.some((material) => material.name === config.materialName)) continue
    const attribute = mesh.geometry.getAttribute(config.threeAttribute),
      position = mesh.geometry.getAttribute('position')
    if (!attribute || attribute.itemSize !== 3 || attribute.count !== position.count)
      throw new Error('Required rest-coordinate attribute is missing or has wrong count')
    for (let i = 0; i < attribute.count; i++)
      for (const value of [attribute.getX(i), attribute.getY(i), attribute.getZ(i)]) bounded(value, -100, 100)
    const originalBinding = mesh.material
    const owned: THREE.Material[] = []
    const converted = materials.map((original) => {
      if (original.name !== config.materialName) return original
      if (!(original instanceof THREE.MeshStandardMaterial))
        throw new Error('Wolf material must use the reviewed standard material pipeline')
      if (original.normalMap && original.normalMapType !== THREE.TangentSpaceNormalMap)
        throw new Error('Unsupported Wolf normal-map space')
      const material = original.clone()
      material.customProgramCacheKey = () => 'wolf-lid-color-v1-fixed-reviewed'
      material.onBeforeCompile = (shader) => {
        const vector2 = (values: number[]) => new THREE.Vector2(values[0], values[1])
        Object.assign(shader.uniforms, {
          uWolfBlink: blink,
          uWolfEyes: {
            value: config.eyes.map((eye) => new THREE.Vector2(eye.centerX, eye.radiusX))
          },
          uWolfCenterZ: { value: config.centerZ },
          uWolfRadiusZ: { value: config.radiusZ },
          uWolfRegionY: { value: vector2(config.regionYExclusive) },
          uWolfRadialFade: { value: vector2(config.regionRadialFade) },
          uWolfActive: { value: config.activeMultiplier },
          uWolfOffset: { value: config.lidOffset },
          uWolfSoftness: { value: config.boundarySoftness },
          uWolfCreaseThickness: { value: vector2(config.creaseThicknessFade) },
          uWolfCreaseOuter: { value: vector2(config.creaseOuterUFade) },
          uWolfCreaseColor: {
            value: new THREE.Vector3(...(config.creaseLinearRGB as [number, number, number]))
          },
          uWolfCoefficients: { value: config.skinColorCoefficientsRGB.flat(2) },
          uWolfSide: { value: config.skinColorSideThresholdX },
          uWolfRoughness: { value: config.coveredRoughness }
        })
        shader.vertexShader = `attribute vec3 _blink_rest; varying vec3 vWolfRest;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWolfRest = _blink_rest;'
        )
        shader.fragmentShader = FRAGMENT + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\nWolfLid wolfCurrentLid = wolfLid(vWolfRest,uWolfBlink);\ndiffuseColor.rgb = mix(mix(diffuseColor.rgb,wolfCurrentLid.skin,wolfCurrentLid.mask),uWolfCreaseColor,wolfCurrentLid.crease);'
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor,uWolfRoughness,wolfCurrentLid.mask);'
        )
        const normal = THREE.ShaderChunk.normal_fragment_maps.replace(
          'mapN.xy *= normalScale;',
          'float wolfNormalStrength = max(1.0 - wolfCurrentLid.mask, 0.0); mapN.xy *= normalScale * wolfNormalStrength; mapN.z = mix(1.0, mapN.z, clamp(wolfNormalStrength, 0.0, 1.0));'
        )
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', normal)
      }
      owned.push(material)
      patched++
      return material
    })
    mesh.material = Array.isArray(mesh.material) ? converted : converted[0]
    bindings.push({ mesh, original: originalBinding, adapted: mesh.material, owned })
  }
  if (!patched) throw new Error('Required Wolf material binding is missing')
  return {
    sample(motion, timeMs) {
      blink.value = sampleBlink(config.tracks[motion], timeMs)
    },
    dispose() {
      blink.value = 0
      for (const binding of bindings) {
        if (binding.mesh.material === binding.adapted) binding.mesh.material = binding.original
        for (const material of binding.owned) material.dispose()
      }
      bindings.length = 0
    }
  }
}
