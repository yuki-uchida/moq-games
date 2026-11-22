import * as THREE from 'three'
import { MAX_STACK_PARTS, type StackModel } from './StackModel'

/** Offsets are in voxel cells, rotations in radians (applied Y, then X, then Z). */
export interface PartPose {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
  /** Uniform scale, multiplied by the per-axis scales. */
  s?: number
  sx?: number
  sy?: number
  sz?: number
}
export type StackPose = Record<string, PartPose | undefined>

const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const quaternion = new THREE.Quaternion()
const position = new THREE.Vector3()
const scale = new THREE.Vector3()
const local = new THREE.Matrix4()
const worlds = Array.from({ length: MAX_STACK_PARTS }, () => new THREE.Matrix4())

/** Hierarchical part transforms (parents first), packed for the stack shader. */
export function poseMatrices(model: StackModel, pose: StackPose, out: Float32Array): Float32Array {
  model.parts.forEach((part, index) => {
    const p = pose[part.name]
    position.set(part.at[0] + (p?.x ?? 0), part.at[1] + (p?.y ?? 0), part.at[2] + (p?.z ?? 0))
    euler.set(p?.rx ?? 0, p?.ry ?? 0, p?.rz ?? 0, 'YXZ')
    quaternion.setFromEuler(euler)
    const s = p?.s ?? 1
    scale.set(s * (p?.sx ?? 1), s * (p?.sy ?? 1), s * (p?.sz ?? 1))
    local.compose(position, quaternion, scale)
    if (part.parent < 0) worlds[index].copy(local)
    else worlds[index].multiplyMatrices(worlds[part.parent], local)
    worlds[index].toArray(out, index * 16)
  })
  return out
}

/** Local point of a part in the figure's root cells. */
export function partPoint(
  model: StackModel,
  pose: StackPose,
  part: string,
  at: readonly [number, number, number]
): THREE.Vector3 {
  const index = model.partIndex.get(part)
  if (index === undefined) throw new Error(`${model.id} has no part ${part}`)
  const matrices = poseMatrices(model, pose, new Float32Array(MAX_STACK_PARTS * 16))
  return new THREE.Vector3(...at).applyMatrix4(new THREE.Matrix4().fromArray(matrices, index * 16))
}

const vertexShader = /* glsl */ `
attribute float partIndex;
uniform mat4 uParts[${MAX_STACK_PARTS}];
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 local = uParts[int(partIndex + 0.5)] * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * local;
}`
const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec2 vUv;
float bayer2(vec2 q) { return mod(q.x * 2.0 + q.y * 3.0, 4.0); }
// 4x4 ordered dither threshold in (0, 1).
float bayer4(vec2 p) {
  vec2 q = floor(p);
  return (4.0 * bayer2(mod(q, 2.0)) + bayer2(mod(floor(q / 2.0), 2.0)) + 0.5) / 16.0;
}
void main() {
  vec4 texel = texture2D(map, vUv);
  if (texel.a < 0.5) discard;
  // Fades and ghost previews dither instead of blending, so slices keep their depth order.
  if (uOpacity < 0.999 && bayer4(gl_FragCoord.xy) >= uOpacity) discard;
  gl_FragColor = vec4(mix(texel.rgb * uTint, uFlashColor, uFlash), 1.0);
}`

export interface StackMaterialUniforms {
  [uniform: string]: THREE.IUniform
  map: THREE.IUniform<THREE.Texture>
  uParts: THREE.IUniform<Float32Array>
  uTint: THREE.IUniform<THREE.Color>
  uOpacity: THREE.IUniform<number>
  uFlash: THREE.IUniform<number>
  uFlashColor: THREE.IUniform<THREE.Color>
}

/** One program for every figure; each actor owns its uniforms but shares the model texture. */
export function createStackMaterial(model: StackModel): THREE.ShaderMaterial & { uniforms: StackMaterialUniforms } {
  const uniforms: StackMaterialUniforms = {
    map: { value: model.texture },
    uParts: { value: new Float32Array(MAX_STACK_PARTS * 16) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uOpacity: { value: 1 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) }
  }
  const material = new THREE.ShaderMaterial({
    name: 'sprite-stack',
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true
  })
  return material as THREE.ShaderMaterial & { uniforms: StackMaterialUniforms }
}
