/**
 * Shading of the model kit: a 3-band toon ramp with a soft rim light on vertex colours (baked AO included), the
 * `animaMask` channels (x team trim with its pattern, y anima glow, z armour recolour, w animated glow), white
 * hit flash, camouflage shimmer, hologram scanlines and an inverted-hull ink outline. Materials are plain
 * MeshToon/MeshBasic materials patched in onBeforeCompile, so they work with three's lights, fog and skinning.
 */
import * as THREE from 'three'
import { REGION_GLSL } from './sdf/regions'

export interface AnimaUniforms {
  uTeam: { value: THREE.Color }
  /** 0 = ARK default trim colour, 1 = team colour with pattern. */
  uTeamOn: { value: number }
  /** 0 stripes, 1 dots, 2 chevrons. */
  uPattern: { value: number }
  uTrim: { value: THREE.Color }
  uArmorTint: { value: THREE.Color }
  uGlowColor: { value: THREE.Color }
  uGlow: { value: number }
  uGlow2Color: { value: THREE.Color }
  uGlow2: { value: number }
  uFlash: { value: number }
  uCloak: { value: number }
  uHolo: { value: number }
  uDim: { value: number }
  uTime: { value: number }
  uRim: { value: number }
  uRimColor: { value: THREE.Color }
  uOutline: { value: number }
}

export function createUniforms(): AnimaUniforms {
  return {
    uTeam: { value: new THREE.Color(0xffffff) },
    uTeamOn: { value: 0 },
    uPattern: { value: 0 },
    uTrim: { value: new THREE.Color(0xffc861) },
    uArmorTint: { value: new THREE.Color(1, 1, 1) },
    uGlowColor: { value: new THREE.Color(0xff9a3c) },
    uGlow: { value: 1 },
    uGlow2Color: { value: new THREE.Color(0xffffff) },
    uGlow2: { value: 0 },
    uFlash: { value: 0 },
    uCloak: { value: 0 },
    uHolo: { value: 0 },
    uDim: { value: 0 },
    uTime: { value: 0 },
    uRim: { value: 0.35 },
    uRimColor: { value: new THREE.Color(0xfff2e0) },
    uOutline: { value: 0.006 }
  }
}

const TOON_PARS = /* glsl */ `
uniform vec3 uTeam;
uniform float uTeamOn;
uniform float uPattern;
uniform vec3 uTrim;
uniform vec3 uArmorTint;
uniform vec3 uGlowColor;
uniform float uGlow;
uniform vec3 uGlow2Color;
uniform float uGlow2;
uniform float uFlash;
uniform float uCloak;
uniform float uHolo;
uniform float uDim;
uniform float uTime;
uniform float uRim;
uniform vec3 uRimColor;
varying vec4 vMask;
varying vec4 vMark;
varying vec3 vBind;

/** Crisp, antialiased threshold of a vertex-interpolated linear ramp at 0.5. */
float crisp(float x) {
  float fw = max(fwidth(x) * 0.85, 0.004);
  return smoothstep(0.5 - fw, 0.5 + fw, x);
}

float teamPattern(vec3 p) {
  float u = atan(p.x, p.z) * 0.16;
  float v = p.y;
  if (uPattern < 0.5) return step(0.5, fract((u + v) * 16.0));
  if (uPattern < 1.5) {
    vec2 g = fract(vec2(u * 20.0, v * 20.0 + floor(u * 20.0) * 0.5)) - 0.5;
    return 1.0 - smoothstep(0.24, 0.3, length(g));
  }
  return step(0.5, fract(v * 14.0 - abs(fract(u * 7.0) - 0.5) * 1.6));
}

vec3 getGradientIrradiance(vec3 normal, vec3 lightDirection) {
  float d = dot(normal, lightDirection) * 0.5 + 0.5;
  float fw = max(fwidth(d), 0.002) + 0.015;
  float b1 = smoothstep(0.40 - fw, 0.40 + fw, d);
  float b2 = smoothstep(0.62 - fw, 0.62 + fw, d);
  vec3 lo = vec3(0.56, 0.52, 0.64);
  vec3 mid = vec3(0.84, 0.82, 0.86);
  return mix(lo, mix(mid, vec3(1.0), b2), b1);
}
`

const TOON_VERTEX_PARS = /* glsl */ `
attribute vec4 animaMask;
attribute vec4 markColor;
attribute float ao;
attribute vec4 regionFilter;
varying vec4 vMask;
varying vec4 vMark;
varying vec3 vBind;
varying float vAO;
varying vec4 vFilter;
`

/** Shader paint regions of one model (see sdf/regions.ts); null = none. */
export interface RegionUniforms {
  texture: THREE.Texture
  count: number
  shapeBase: number
}

let emptyRegions: THREE.DataTexture | null = null

/** Region uniforms of a baked model. */
export const regionsOf = (b: {
  texture: THREE.Texture
  regions: { count: number; shapeBase: number }
}): RegionUniforms => ({
  texture: b.texture,
  count: b.regions.count,
  shapeBase: b.regions.shapeBase
})

/**
 * Body/antique material. `regions` are the model's shader-drawn markings (bind-pose space); meshes sharing the
 * uniforms but not the regions (rigid parts, gear) get their own material instance without them.
 */
export function createToonMaterial(u: AnimaUniforms, regions: RegionUniforms | null = null): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, color: 0xffffff })
  emptyRegions ??= new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  const ru = {
    uRegions: { value: regions?.texture ?? emptyRegions },
    uRegionCount: { value: regions?.count ?? 0 },
    uShapeBase: { value: regions?.shapeBase ?? 0 }
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, ru)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TOON_VERTEX_PARS}`)
      .replace(
        '#include <color_vertex>',
        '#include <color_vertex>\n\tvMask = animaMask;\n\tvMark = markColor;\n\tvBind = position;\n\tvAO = ao;\n\tvFilter = regionFilter;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', `${TOON_PARS}${REGION_GLSL}varying float vAO;\n`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `vec4 animaMsk = vec4(crisp(vMask.x), crisp(vMask.y), crisp(vMask.z), crisp(vMask.w));
  vec3 paintCol = mix(vColor, vMark.rgb, crisp(vMark.a));
  applyRegions(vBind, paintCol, animaMsk);
  diffuseColor.rgb *= paintCol * vAO;
  float trimW = animaMsk.x;
  if (trimW > 0.001) {
    float pat = teamPattern(vBind);
    vec3 team = mix(uTeam, mix(uTeam, vec3(1.0), 0.72), pat);
    vec3 trim = mix(uTrim, team, uTeamOn);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * trim, trimW);
  }
  diffuseColor.rgb *= mix(vec3(1.0), uArmorTint, animaMsk.z);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
  totalEmissiveRadiance += uGlowColor * (uGlow * animaMsk.y) + uGlow2Color * (uGlow2 * animaMsk.w);`
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `{
    vec3 V = normalize(vViewPosition);
    float ndv = clamp(dot(normal, V), 0.0, 1.0);
    float rim = smoothstep(0.5, 1.0, 1.0 - ndv);
    outgoingLight += uRimColor * (rim * uRim) * (0.35 + 0.65 * diffuseColor.rgb);
    float grey = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    outgoingLight = mix(outgoingLight, vec3(grey) * 0.55, uDim * 0.7);
    outgoingLight = mix(outgoingLight, vec3(1.0, 0.98, 0.95), uFlash);
    if (uHolo > 0.5) {
      float scan = 0.6 + 0.4 * step(0.5, fract(vBind.y * 70.0 - uTime * 1.5));
      vec3 hc = vec3(0.35, 0.92, 1.0) * (0.45 + 0.8 * grey);
      outgoingLight = hc * scan + vec3(0.6, 1.0, 1.0) * rim * 0.8;
      diffuseColor.a = (0.32 + 0.3 * scan + rim * 0.35) * opacity;
    }
    if (uCloak > 0.001) {
      float shimmer = 0.5 + 0.5 * sin(vBind.y * 40.0 + vBind.x * 25.0 - uTime * 6.0);
      outgoingLight = mix(outgoingLight, vec3(0.75, 0.95, 1.0) * (0.4 + rim), uCloak * 0.6);
      diffuseColor.a *= 1.0 - uCloak * (0.94 - rim * 0.5 * shimmer);
    }
  }
  #include <opaque_fragment>`
      )
  }
  m.customProgramCacheKey = () => 'anima-toon-2'
  return m
}

/** Unlit vertex-colour material that also shows the crisp mark layer (mouths, small decals). */
export function createFlatMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 markColor;\nvarying vec4 vMark;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvMark = markColor;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vMark;')
      .replace(
        '#include <color_fragment>',
        [
          'float fwm = max(fwidth(vMark.a) * 0.85, 0.004);',
          'diffuseColor.rgb *= mix(vColor, vMark.rgb, smoothstep(0.5 - fwm, 0.5 + fwm, vMark.a));'
        ].join('\n')
      )
  }
  m.customProgramCacheKey = () => 'anima-flat-1'
  return m
}

/** Inverted-hull outline: back faces pushed out along the (skinned) normal, tinted by the vertex colour. */
export function createOutlineMaterial(u: AnimaUniforms, color = 0x3a2a32): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, vertexColors: true })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = u.uOutline
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace(
        '#include <skinning_vertex>',
        /* glsl */ `#include <skinning_vertex>
  #ifdef USE_SKINNING
    vec3 oN = objectNormal;
  #else
    vec3 oN = normal;
  #endif
  vec4 oView = modelViewMatrix * vec4(transformed, 1.0);
  float oScale = clamp(-oView.z * 0.22, 0.7, 3.5);
  transformed += normalize(oN) * uOutline * oScale;`
      )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n\tdiffuseColor.rgb = diffuseColor.rgb * 0.9 + vec3(0.02, 0.015, 0.03);'
    )
  }
  m.customProgramCacheKey = () => 'anima-outline-1'
  return m
}

export interface EyeUniforms {
  uIris: { value: THREE.Color }
  uIrisDark: { value: THREE.Color }
  uPupil: { value: number }
  uFlash: { value: number }
  uCloak: { value: number }
  uHolo: { value: number }
  uTime: { value: number }
}

/**
 * Glossy chibi eye drawn in the fragment shader on a dome: dark rim, iris gradient (dark top, bright bottom),
 * big pupil and two highlights. The dome's local position (unit sphere, front = +Z) drives the pattern.
 */
export function createEyeMaterial(e: EyeUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...e },
    transparent: false,
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uIris;
      uniform vec3 uIrisDark;
      uniform float uPupil;
      uniform float uFlash;
      uniform float uCloak;
      uniform float uHolo;
      uniform float uTime;
      varying vec3 vLocal;
      void main() {
        vec2 p = vLocal.xy;
        float r = length(p);
        float aa = fwidth(r) * 1.5;
        vec3 rimC = vec3(0.07, 0.05, 0.09);
        float t = clamp(0.5 - p.y * 0.75, 0.0, 1.0);
        vec3 iris = mix(uIrisDark, uIris, smoothstep(0.15, 0.95, t));
        iris += uIris * 0.35 * smoothstep(0.55, 0.0, length(p - vec2(0.0, -0.55)));
        vec3 c = mix(iris, rimC, smoothstep(0.84 - aa, 0.84 + aa, r));
        float pr = length(p * vec2(1.0, 0.92) - vec2(0.0, 0.04));
        c = mix(vec3(0.04, 0.03, 0.06), c, smoothstep(uPupil - aa, uPupil + aa, pr));
        float h1 = length((p - vec2(-0.3, 0.36)) * vec2(1.0, 1.25));
        float h2 = length(p - vec2(0.3, -0.36));
        c = mix(c, vec3(1.0), 1.0 - smoothstep(0.2 - aa, 0.2 + aa, h1));
        c = mix(c, vec3(1.0), 1.0 - smoothstep(0.1 - aa, 0.1 + aa, h2));
        c = mix(c, vec3(1.0), uFlash * 0.7);
        float a = 1.0;
        if (uHolo > 0.5) { c = vec3(0.4, 0.95, 1.0) * (0.4 + 0.6 * dot(c, vec3(0.33))); }
        a *= 1.0 - uCloak * 0.95;
        if (a < 0.02) discard;
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`
  })
}

export function createEyeUniforms(iris: number, irisDark: number, pupil: number): EyeUniforms {
  return {
    uIris: { value: new THREE.Color(iris) },
    uIrisDark: { value: new THREE.Color(irisDark) },
    uPupil: { value: pupil },
    uFlash: { value: 0 },
    uCloak: { value: 0 },
    uHolo: { value: 0 },
    uTime: { value: 0 }
  }
}
