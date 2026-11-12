/**
 * Single-draw ink outlines: the inverted hull is appended to the model's own geometry (duplicated vertices with
 * reversed winding and a `hull` = 1 attribute), so a model and its outline are one draw call. The vertex shader
 * pushes hull vertices out along the (skinned) normal and the fragment shader paints them in the outline ink;
 * `uHullOn` = 0 collapses them (cloak, hologram). Shadow passes must skip the hull (`hullDepthMaterial`).
 */
import * as THREE from 'three'

/** Appends an inverted hull to an indexed geometry (every attribute is duplicated). */
export function withHull(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  const n = g.getAttribute('position').count
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute
    const Arr = a.array.constructor as new (len: number) => THREE.TypedArray
    const arr = new Arr(a.array.length * 2)
    arr.set(a.array as ArrayLike<number>, 0)
    arr.set(a.array as ArrayLike<number>, a.array.length)
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized))
  }
  const hull = new Float32Array(n * 2)
  hull.fill(1, n)
  out.setAttribute('hull', new THREE.BufferAttribute(hull, 1))
  const index = g.getIndex()!.array
  const m = index.length
  const total = n * 2
  const idx = total > 65535 ? new Uint32Array(m * 2) : new Uint16Array(m * 2)
  for (let i = 0; i < m; i++) idx[i] = index[i]
  for (let t = 0; t < m; t += 3) {
    idx[m + t] = index[t] + n
    idx[m + t + 1] = index[t + 2] + n
    idx[m + t + 2] = index[t + 1] + n
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  out.userData.hullTriangles = m / 3
  out.boundingBox = g.boundingBox?.clone() ?? null
  out.boundingSphere = g.boundingSphere?.clone() ?? null
  if (!out.boundingSphere) out.computeBoundingSphere()
  return out
}

/** Triangles of a geometry without its outline hull. */
export const drawnTriangles = (g: THREE.BufferGeometry) =>
  (g.getIndex()?.count ?? g.getAttribute('position').count) / 3 - ((g.userData.hullTriangles as number) ?? 0)

export interface HullUniforms {
  /** Outline width (m) at close range; it grows with distance (clamped). */
  uOutline: { value: number }
  /** 1 = outline drawn, 0 = hull collapsed. */
  uHullOn: { value: number }
  uOutlineColor: { value: THREE.Color }
}

export const createHullUniforms = (width = 0.006, color = 0x3a2a32): HullUniforms => ({
  uOutline: { value: width },
  uHullOn: { value: 1 },
  uOutlineColor: { value: new THREE.Color(color) }
})

/** Vertex declarations (after `#include <common>`). */
export const HULL_VERTEX_PARS = /* glsl */ `
#ifdef USE_HULL
attribute float hull;
uniform float uOutline;
uniform float uHullOn;
varying float vHull;
#endif
`

/** Extrusion (after `#include <skinning_vertex>`): `objectNormal` is skinned there. */
export const HULL_VERTEX_EXTRUDE = /* glsl */ `
#ifdef USE_HULL
  vHull = hull;
  if (hull > 0.5) {
    vec4 hp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      hp = instanceMatrix * hp;
    #endif
    hp = modelViewMatrix * hp;
    float hs = clamp(-hp.z * 0.22, 0.7, 3.5);
    transformed += normalize(objectNormal) * uOutline * hs;
  }
#endif
`

/** Collapse (after `#include <project_vertex>`). */
export const HULL_VERTEX_CLIP = /* glsl */ `
#ifdef USE_HULL
  if (hull > 0.5 && uHullOn < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
#endif
`

export const HULL_FRAGMENT_PARS = /* glsl */ `
#ifdef USE_HULL
uniform vec3 uOutlineColor;
varying float vHull;
#endif
`

/** Depth material for shadow passes that ignores the hull (assign as `customDepthMaterial`). */
export function hullDepthMaterial(): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float hull;\nvarying float vHullD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHullD = hull;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHullD;')
      .replace('void main() {', 'void main() {\n\tif (vHullD > 0.5) discard;')
  }
  m.customProgramCacheKey = () => 'anima-hull-depth-1'
  return m
}

let noShadow: THREE.MeshDepthMaterial | null = null

/** Depth material that casts no shadow at all (separate outline meshes, glow cards); shared, never dispose. */
export function noShadowDepthMaterial(): THREE.MeshDepthMaterial {
  if (noShadow) return noShadow
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  m.onBeforeCompile = (shader) => {
    // A data-dependent discard: with an unconditional one the compiler drops the colour output (GL warnings).
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'void main() {\n\tif (gl_FragCoord.w > -1.0) discard;'
    )
  }
  m.customProgramCacheKey = () => 'anima-no-shadow-2'
  noShadow = m
  return m
}
