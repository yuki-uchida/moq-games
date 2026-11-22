import * as THREE from 'three'
import type { StackFrameAtlas, StackModel } from './StackModel'
import { MAX_STACK_PARTS, MAX_STACK_SLICES, STACK_SPACING, STACK_SQUASH } from './SliceSheet'

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

/** Hierarchical part transforms (parents first), used for emitter placement and slice-sheet baking. */
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

// ---------- SpriteCook True 2D Slice-Stacking Shader (Body + 1px Crisp Outline) ----------

const stackVertexShader = /* glsl */ `
uniform vec4 uArtBounds; // (minX, minY, width, height) in integer art pixels around ground pivot (0, 0)
varying vec2 vArtPx;
void main() {
  // PlaneGeometry(1, 1) has position.xy in [-0.5, +0.5], where +y is DOWN on the board.
  vec2 uv01 = position.xy + vec2(0.5);
  vArtPx = uArtBounds.xy + uv01 * uArtBounds.zw;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const stackFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform vec2 uAtlasSize;
uniform vec2 uSliceSize;
uniform vec2 uCenter;
uniform int uSlices;
uniform float uBaseLift;
uniform float uFrame;
uniform float uTurn;
uniform float uSquash;
uniform float uSpacing;
uniform float uFall;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec2 vArtPx;

float bayer2(vec2 q) { return mod(q.x * 2.0 + q.y * 3.0, 4.0); }
float bayer4(vec2 p) {
  vec2 q = floor(p);
  return (4.0 * bayer2(mod(q, 2.0)) + bayer2(mod(floor(q / 2.0), 2.0)) + 0.5) / 16.0;
}

vec4 sampleStack(vec2 u, float c, float s, float maxR) {
  if (abs(u.x) > maxR) return vec4(0.0);
  float halfY = maxR * uSquash;
  float minLift = (uBaseLift + 0.0) * uSpacing;
  float maxLift = (uBaseLift + float(uSlices - 1)) * uSpacing;
  if (u.y + maxLift < -halfY || u.y + minLift > halfY) return vec4(0.0);
  // Compute tight slice range [zBot, zTop] that can overlap pixel u.
  int zTop = int(floor((halfY - u.y) / max(0.001, uSpacing) - uBaseLift + 1.0));
  int zBot = int(floor((-halfY - u.y) / max(0.001, uSpacing) - uBaseLift));
  if (zTop >= uSlices) zTop = uSlices - 1;
  if (zBot < 0) zBot = 0;
  for (int i = 0; i < ${MAX_STACK_SLICES}; i++) {
    int z = zTop - i;
    if (z < zBot) break;
    float lift = floor((uBaseLift + float(z)) * uSpacing + 0.5);
    vec2 r = vec2(u.x, (u.y + lift) / uSquash);
    vec2 local = vec2(c * r.x + s * r.y, -s * r.x + c * r.y);
    vec2 sp = floor(local + uCenter + 0.5);
    if (sp.x >= 0.0 && sp.x < uSliceSize.x && sp.y >= 0.0 && sp.y < uSliceSize.y) {
      vec2 texPx = vec2(float(z) * uSliceSize.x + sp.x + 0.5, uFrame * uSliceSize.y + sp.y + 0.5);
      vec4 col = texture2D(map, texPx / uAtlasSize);
      if (col.a > 0.5) return col;
    }
  }
  return vec4(0.0);
}

void main() {
  // Snap every fragment to an exact integer art-pixel coordinate.
  vec2 p = floor(vArtPx);
  float fc = cos(uFall);
  float fs = sin(uFall);
  vec2 u = abs(uFall) > 0.0001 ? vec2(p.x * fc + p.y * fs, -p.x * fs + p.y * fc) : p;
  float maxR = length(uSliceSize) * 0.5 + 1.5;
  float halfY = maxR * uSquash;
  // Early-out background pixels outside the stack + 1px outline envelope before any slice loop.
  if (abs(u.x) > maxR + 1.5) discard;
  float topY = -halfY - (uBaseLift + float(uSlices - 1)) * uSpacing - 2.0;
  float botY = halfY - uBaseLift * uSpacing + 2.0;
  if (u.y < topY || u.y > botY) discard;

  float c = cos(uTurn);
  float s = sin(uTurn);
  vec4 hit = sampleStack(u, c, s, maxR);
  vec3 rgb;
  if (hit.a > 0.5) {
    rgb = hit.rgb;
  } else {
    // Crisp 1-art-px dark outline ONCE around the finished stack silhouette (zero internal speckle).
    vec2 duY = abs(uFall) > 0.0001 ? vec2(fs, fc) : vec2(0.0, 1.0);
    vec2 duX = abs(uFall) > 0.0001 ? vec2(fc, -fs) : vec2(1.0, 0.0);
    vec4 n = sampleStack(u - duY, c, s, maxR);
    if (n.a <= 0.5) n = sampleStack(u + duY, c, s, maxR);
    if (n.a <= 0.5) n = sampleStack(u - duX, c, s, maxR);
    if (n.a <= 0.5) n = sampleStack(u + duX, c, s, maxR);
    if (n.a <= 0.5) discard;
    // Tinted rich dark pixel-art ink matching SpriteCook's crisp silhouette outlines.
    rgb = mix(vec3(0.07, 0.06, 0.12), n.rgb * vec3(0.24, 0.22, 0.28), 0.45);
  }
  // Fades and ghost previews dither instead of alpha-blending so stacks keep exact ground-Y depth order.
  if (uOpacity < 0.999 && bayer4(gl_FragCoord.xy) >= uOpacity) discard;
  gl_FragColor = vec4(mix(rgb * uTint, uFlashColor, uFlash), 1.0);
}`

// ---------- Crisp Stepped Pixel-Art Contact Shadow Shader ----------

const shadowFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform vec2 uAtlasSize;
uniform vec2 uSliceSize;
uniform vec2 uCenter;
uniform float uShadowColumn;
uniform float uFrame;
uniform float uTurn;
uniform float uSquash;
uniform vec2 uShadowOffset;
uniform float uOpacity;
varying vec2 vArtPx;

void main() {
  vec2 p = floor(vArtPx) - uShadowOffset;
  float c = cos(uTurn);
  float s = sin(uTurn);
  vec2 r = vec2(p.x, p.y / uSquash);
  vec2 local = vec2(c * r.x + s * r.y, -s * r.x + c * r.y);
  vec2 sp = floor(local + uCenter + 0.5);
  if (sp.x < 0.0 || sp.x >= uSliceSize.x || sp.y < 0.0 || sp.y >= uSliceSize.y) discard;
  vec2 texPx = vec2(uShadowColumn * uSliceSize.x + sp.x + 0.5, uFrame * uSliceSize.y + sp.y + 0.5);
  vec4 mask = texture2D(map, texPx / uAtlasSize);
  if (mask.a < 0.5) discard;
  gl_FragColor = vec4(0.085, 0.11, 0.15, 0.36 * uOpacity);
}`

export interface StackMaterialUniforms {
  [uniform: string]: THREE.IUniform
  map: THREE.IUniform<THREE.Texture>
  uAtlasSize: THREE.IUniform<THREE.Vector2>
  uSliceSize: THREE.IUniform<THREE.Vector2>
  uCenter: THREE.IUniform<THREE.Vector2>
  uArtBounds: THREE.IUniform<THREE.Vector4>
  uSlices: THREE.IUniform<number>
  uBaseLift: THREE.IUniform<number>
  uFrame: THREE.IUniform<number>
  uTurn: THREE.IUniform<number>
  uSquash: THREE.IUniform<number>
  uSpacing: THREE.IUniform<number>
  uFall: THREE.IUniform<number>
  uTint: THREE.IUniform<THREE.Color>
  uOpacity: THREE.IUniform<number>
  uFlash: THREE.IUniform<number>
  uFlashColor: THREE.IUniform<THREE.Color>
}

export interface StackShadowUniforms {
  [uniform: string]: THREE.IUniform
  map: THREE.IUniform<THREE.Texture>
  uAtlasSize: THREE.IUniform<THREE.Vector2>
  uSliceSize: THREE.IUniform<THREE.Vector2>
  uCenter: THREE.IUniform<THREE.Vector2>
  uArtBounds: THREE.IUniform<THREE.Vector4>
  uShadowColumn: THREE.IUniform<number>
  uFrame: THREE.IUniform<number>
  uTurn: THREE.IUniform<number>
  uSquash: THREE.IUniform<number>
  uShadowOffset: THREE.IUniform<THREE.Vector2>
  uOpacity: THREE.IUniform<number>
}

/** Shared SpriteCook sprite-stacking program; each actor owns uniforms and shares the design's atlas. */
export function createStackMaterial(
  atlas: StackFrameAtlas,
  bounds: THREE.Vector4
): THREE.ShaderMaterial & { uniforms: StackMaterialUniforms } {
  const uniforms: StackMaterialUniforms = {
    map: { value: atlas.texture },
    uAtlasSize: { value: new THREE.Vector2(atlas.atlasWidth, atlas.atlasHeight) },
    uSliceSize: { value: new THREE.Vector2(atlas.sliceWidth, atlas.sliceHeight) },
    uCenter: { value: new THREE.Vector2(atlas.cx, atlas.cy) },
    uArtBounds: { value: bounds.clone() },
    uSlices: { value: atlas.sliceCount },
    uBaseLift: { value: atlas.baseLift },
    uFrame: { value: 0 },
    uTurn: { value: 0 },
    uSquash: { value: STACK_SQUASH },
    uSpacing: { value: STACK_SPACING },
    uFall: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uOpacity: { value: 1 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) }
  }
  const material = new THREE.ShaderMaterial({
    name: 'sprite-stack',
    uniforms,
    vertexShader: stackVertexShader,
    fragmentShader: stackFragmentShader,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true
  })
  return material as THREE.ShaderMaterial & { uniforms: StackMaterialUniforms }
}

/** Crisp stepped pixel-art contact shadow matching the rotated, squashed stack footprint. */
export function createStackShadowMaterial(
  atlas: StackFrameAtlas,
  bounds: THREE.Vector4
): THREE.ShaderMaterial & { uniforms: StackShadowUniforms } {
  const uniforms: StackShadowUniforms = {
    map: { value: atlas.texture },
    uAtlasSize: { value: new THREE.Vector2(atlas.atlasWidth, atlas.atlasHeight) },
    uSliceSize: { value: new THREE.Vector2(atlas.sliceWidth, atlas.sliceHeight) },
    uCenter: { value: new THREE.Vector2(atlas.cx, atlas.cy) },
    uArtBounds: { value: bounds.clone() },
    uShadowColumn: { value: atlas.sliceCount },
    uFrame: { value: 0 },
    uTurn: { value: 0 },
    uSquash: { value: STACK_SQUASH },
    uShadowOffset: { value: new THREE.Vector2(2, 2) },
    uOpacity: { value: 1 }
  }
  const material = new THREE.ShaderMaterial({
    name: 'sprite-stack-shadow',
    uniforms,
    vertexShader: stackVertexShader,
    fragmentShader: shadowFragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: true
  })
  return material as THREE.ShaderMaterial & { uniforms: StackShadowUniforms }
}
