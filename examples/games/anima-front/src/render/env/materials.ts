/**
 * Environment materials: the tiled-atlas standard material (opaque / foliage with wind sway / alpha-tested
 * cutout), unlit glow (pulsing accents), water and additive light pools. All read the vertex layout of
 * GeoBuilder (tint, rect, fx) and share one time uniform.
 */
import * as THREE from 'three'
import type { EnvMat } from './ctx'
import type { AtlasTextures } from './paint'
import { RELIEF_DEPTH } from './paint-depth'
import type { ThemeDef } from './themes'

export interface EnvMaterials {
  readonly materials: Record<EnvMat, THREE.Material>
  /** Shared uniforms (time, wind, glow). */
  readonly uniforms: { uTime: { value: number }; uWind: { value: number }; uGlow: { value: number } }
  update(time: number): void
  dispose(): void
}

const VERTEX_HEAD = /* glsl */ `
attribute vec4 tint;
attribute vec4 rect;
attribute float fx;
varying vec4 vTint;
varying vec4 vRect;
varying vec2 vTileUv;
varying float vFx;
uniform float uTime;
uniform float uWind;
`

const SWAY = /* glsl */ `
vTint = tint;
vRect = rect;
vTileUv = uv;
vFx = fx;
#ifdef ENV_SWAY
{
  vec4 wpos = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wpos = instanceMatrix * wpos;
  #endif
  wpos = modelMatrix * wpos;
  float weight = fx >= 0.9 ? clamp(uv.y, 0.0, 1.0) : fx;
  float ph = uTime * 1.6 + wpos.x * 0.31 + wpos.z * 0.23;
  float gust = 0.6 + 0.4 * sin(uTime * 0.37 + wpos.x * 0.05);
  float amp = weight * uWind * gust * (fx >= 0.9 ? 0.12 : 0.05);
  transformed.x += sin(ph) * amp;
  transformed.z += cos(ph * 0.8 + 1.3) * amp * 0.7;
}
#endif
`

const FRAG_HEAD = /* glsl */ `
varying vec4 vTint;
varying vec4 vRect;
varying vec2 vTileUv;
varying float vFx;
uniform float uGlow;
uniform float uTime;
`

/**
 * Facade relief (fx < -0.5): parallax occlusion over the half-resolution depth atlas. The tangent frame comes
 * from screen-space derivatives (no tangent attribute); the march fades out with distance where it would only
 * shimmer. Recess depth darkens the albedo (cheap cavity occlusion).
 */
const RELIEF = /* glsl */ `
vec2 tileUv = vTileUv;
float relief = 0.0;
#ifdef ENV_RELIEF
if (vFx < -0.5) {
  float dist = length(vViewPosition);
  float fade = 1.0 - smoothstep(38.0, 70.0, dist);
  if (fade > 0.0) {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);
    vec3 dp1 = dFdx(-vViewPosition);
    vec3 dp2 = dFdy(-vViewPosition);
    vec2 duv1 = dFdx(vTileUv);
    vec2 duv2 = dFdy(vTileUv);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    float det = dot(dp1, dp2perp);
    if (abs(det) > 1e-9) {
      vec3 gU = (dp2perp * duv1.x + dp1perp * duv2.x) / det;
      vec3 gV = (dp2perp * duv1.y + dp1perp * duv2.y) / det;
      float nv = max(dot(V, N), 0.18);
      vec2 dir = vec2(dot(gU, -V), dot(gV, -V)) / nv * fade;
      vec2 g0 = duv1 * vRect.zw;
      vec2 g1 = duv2 * vRect.zw;
      const int STEPS = 12;
      float stepH = RELIEF_DEPTH / float(STEPS);
      float h = 0.0;
      float prevH = 0.0;
      float prevD = 0.0;
      float hit = 0.0;
      for (int i = 0; i <= STEPS; i++) {
        vec2 uvi = vRect.xy + fract(vTileUv + dir * h) * vRect.zw;
        float d = (1.0 - textureGrad(uDepthMap, uvi, g0, g1).r) * RELIEF_DEPTH;
        if (h >= d) {
          float a = prevD - prevH;
          float b = d - h;
          float t = i == 0 ? 0.0 : clamp(a / max(a - b, 1e-5), 0.0, 1.0);
          hit = mix(prevH, h, t);
          break;
        }
        prevH = h;
        prevD = d;
        h += stepH;
        hit = h;
      }
      tileUv = vTileUv + dir * hit;
      relief = hit / RELIEF_DEPTH * fade;
    }
  }
}
#endif
`

const MAP = /* glsl */ `
${RELIEF}
vec2 atlasUv = vRect.xy + fract(tileUv) * vRect.zw;
vec2 atlasGrad = vTileUv * vRect.zw;
#ifdef USE_MAP
  vec4 sampledDiffuseColor = textureGrad(map, atlasUv, dFdx(atlasGrad), dFdy(atlasGrad));
  diffuseColor *= sampledDiffuseColor;
#endif
diffuseColor.rgb *= vTint.rgb * (1.0 - 0.55 * relief);
`

const EMISSIVE = /* glsl */ `
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = textureGrad(emissiveMap, atlasUv, dFdx(atlasGrad), dFdy(atlasGrad));
  totalEmissiveRadiance = emissiveColor.rgb * vTint.a * uGlow;
#endif
`

interface PatchOptions {
  sway?: boolean
  /** Depth atlas for facade relief. */
  relief?: THREE.Texture
  /** Extra aerial haze towards this colour for the distant backdrop. */
  haze?: { color: THREE.Color; amount: number }
}

function patchAtlas(m: THREE.MeshStandardMaterial, shared: EnvMaterials['uniforms'], opts: PatchOptions = {}) {
  const { sway = false, relief, haze } = opts
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime
    shader.uniforms.uWind = shared.uWind
    shader.uniforms.uGlow = shared.uGlow
    if (sway) shader.defines = { ...(shader.defines ?? {}), ENV_SWAY: '' }
    if (relief) {
      shader.defines = { ...(shader.defines ?? {}), ENV_RELIEF: '', RELIEF_DEPTH: RELIEF_DEPTH.toFixed(3) }
      shader.uniforms.uDepthMap = { value: relief }
    }
    if (haze) {
      shader.uniforms.uHazeColor = { value: haze.color }
      shader.uniforms.uHaze = { value: haze.amount }
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWAY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace(
        '#include <common>',
        `#include <common>
${relief ? 'uniform sampler2D uDepthMap;' : ''}${haze ? 'uniform vec3 uHazeColor; uniform float uHaze;' : ''}`
      )
      .replace('#include <map_fragment>', MAP)
      .replace('#include <emissivemap_fragment>', EMISSIVE)
    if (haze)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
#ifdef USE_FOG
gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, uHaze * smoothstep(30.0, 240.0, vFogDepth));
#endif`
      )
  }
  m.customProgramCacheKey = () => `env-atlas-${sway ? 1 : 0}-${relief ? 1 : 0}-${haze ? 1 : 0}`
}

export function createEnvMaterials(tex: AtlasTextures, theme: ThemeDef): EnvMaterials {
  const uniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uGlow: { value: 1 } }
  const atlas = new THREE.MeshStandardMaterial({
    map: tex.albedo,
    emissiveMap: tex.emissive,
    emissive: 0xffffff,
    roughness: 0.88,
    metalness: 0
  })
  patchAtlas(atlas, uniforms, { relief: tex.depth })
  const foliage = new THREE.MeshStandardMaterial({
    map: tex.albedo,
    emissiveMap: tex.emissive,
    emissive: 0xffffff,
    roughness: 0.95,
    metalness: 0
  })
  patchAtlas(foliage, uniforms, { sway: true })
  const cutout = new THREE.MeshStandardMaterial({
    map: tex.albedo,
    emissiveMap: tex.emissive,
    emissive: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    alphaTest: 0.5,
    side: THREE.DoubleSide
  })
  patchAtlas(cutout, uniforms, { sway: true })

  // Distant backdrop: plain atlas with extra aerial haze so the skyline layers into the sky.
  const far = new THREE.MeshStandardMaterial({
    map: tex.albedo,
    emissiveMap: tex.emissive,
    emissive: 0xffffff,
    roughness: 0.95,
    metalness: 0
  })
  patchAtlas(far, uniforms, { haze: { color: new THREE.Color(theme.fog.color), amount: theme.farHaze ?? 0.45 } })

  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff })
  glow.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uWind = uniforms.uWind
    shader.uniforms.uGlow = uniforms.uGlow
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}\nvarying float vPhase;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvTint = tint; vFx = fx; vTileUv = uv; vRect = rect;\n{ vec4 w = vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n w = instanceMatrix * w;\n#endif\n w = modelMatrix * w; vPhase = w.x * 0.37 + w.z * 0.29 + w.y * 0.5; }`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}\nvarying float vPhase;`)
      .replace(
        '#include <map_fragment>',
        `float pulse = 1.0 + vFx * 0.6 * sin(uTime * 2.6 + vPhase);\ndiffuseColor.rgb = vTint.rgb * vTint.a * pulse;`
      )
  }
  glow.customProgramCacheKey = () => 'env-glow'

  const water = new THREE.MeshStandardMaterial({
    map: tex.albedo,
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88
  })
  const sky = new THREE.Color(theme.sky.horizon)
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uWind = uniforms.uWind
    shader.uniforms.uGlow = uniforms.uGlow
    shader.uniforms.uSky = { value: sky }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}\nvarying vec3 vWorldPos;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvTint = tint; vRect = rect; vTileUv = uv + vec2(uTime * 0.02, uTime * 0.013); vFx = fx;\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}\nuniform vec3 uSky;\nvarying vec3 vWorldPos;`)
      .replace('#include <map_fragment>', MAP)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\n{ float t = uTime; vec2 p = vWorldPos.xz;\n vec3 pert = vec3(sin(p.x * 0.8 + t * 1.3) + sin(p.y * 1.1 - t * 0.9), 0.0, cos(p.y * 0.7 + t) + sin((p.x + p.y) * 0.6 + t * 1.7));\n normal = normalize(normal + (viewMatrix * vec4(pert * 0.06, 0.0)).xyz); }`
      )
      .replace(
        '#include <opaque_fragment>',
        `{ vec3 vdir = normalize(vViewPosition); float fres = pow(1.0 - abs(dot(normal, -vdir)), 3.0);\n outgoingLight = mix(outgoingLight, uSky, clamp(fres * 0.85, 0.0, 0.85)); }\n#include <opaque_fragment>`
      )
  }
  water.customProgramCacheKey = () => 'env-water'

  const pool = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  })
  pool.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uWind = uniforms.uWind
    shader.uniforms.uGlow = uniforms.uGlow
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvTint = tint; vTileUv = uv; vRect = rect; vFx = fx;`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace(
        '#include <map_fragment>',
        `float d = length(vTileUv - 0.5) * 2.0; float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.8);\ndiffuseColor.rgb = vTint.rgb * vTint.a * a * 0.55;`
      )
  }
  pool.customProgramCacheKey = () => 'env-pool'

  const materials: Record<EnvMat, THREE.Material> = { atlas, foliage, cutout, glow, water, pool, far }
  return {
    materials,
    uniforms,
    update(time: number) {
      uniforms.uTime.value = time
    },
    dispose() {
      for (const m of Object.values(materials)) m.dispose()
    }
  }
}
