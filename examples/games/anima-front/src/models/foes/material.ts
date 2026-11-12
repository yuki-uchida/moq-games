/**
 * Shading of the invaders (DESIGN §11): the kit's toon ramp with a crisp glossy highlight (chitin / ceramic),
 * a coloured rim, and three emissive channels from the `animaMask` attribute:
 *
 * - y `VEIN`: pulsing glow in `uGlowColor` (violet veins, cyan seams); the pulse travels along the body and is
 *   phase-shifted per instance (from the instance position), so a crowd never pulses in sync.
 * - w `EYE`: steady glow in `uGlow2Color` (orange eye cores, lens eyes).
 * - x `HOT`: glow in `uGlow3Color` (weak sacs, warning lights, open cores).
 * - z `MATTE`: no gloss highlight (soft membranes, teeth).
 *
 * Works on plain meshes and InstancedMesh. With instancing, the renderer's instance colour is read as a hit
 * flash when every channel is > 1 (white flash) and as a tint otherwise (sonar / shield); the instancing chunks
 * stay intact. Optional single-draw ink outline (hull.ts) with `USE_HULL`.
 */
import * as THREE from 'three'
import type { Mask } from '../sdf/sculpt'
import { REGION_GLSL } from '../sdf/regions'
import type { RegionUniforms } from '../materials'
import {
  HULL_FRAGMENT_PARS,
  HULL_VERTEX_CLIP,
  HULL_VERTEX_EXTRUDE,
  HULL_VERTEX_PARS,
  createHullUniforms,
  type HullUniforms
} from '../hull'

export const HOT: Mask = [1, 0, 0, 0]
export const VEIN: Mask = [0, 1, 0, 0]
export const MATTE: Mask = [0, 0, 1, 0]
export const EYE: Mask = [0, 0, 0, 1]

export interface FoeUniforms extends HullUniforms {
  uGlowColor: { value: THREE.Color }
  uGlow: { value: number }
  uGlow2Color: { value: THREE.Color }
  uGlow2: { value: number }
  uGlow3Color: { value: THREE.Color }
  uGlow3: { value: number }
  /** Seconds (pose() writes the global time here). */
  uTime: { value: number }
  /** Vein pulse: angular speed and depth (0 = steady). */
  uPulse: { value: THREE.Vector2 }
  uRim: { value: number }
  uRimColor: { value: THREE.Color }
  /** Gloss highlight strength and size (higher = smaller). */
  uGloss: { value: THREE.Vector2 }
  /** Uniform hit flash for non-instanced models (bosses). */
  uFlash: { value: number }
  /** Darkens and desaturates (husks, dead bosses). */
  uDim: { value: number }
}

export interface FoeLook {
  glow?: number
  glowColor?: number
  eye?: number
  eyeColor?: number
  hot?: number
  hotColor?: number
  pulse?: [number, number]
  rim?: number
  rimColor?: number
  gloss?: [number, number]
}

/** Creature (蝕獣) defaults: violet veins, orange eye cores, glossy indigo chitin. */
export const CREATURE_LOOK: Required<FoeLook> = {
  glow: 1.5,
  glowColor: 0xa86bff,
  eye: 2.2,
  eyeColor: 0xff8a2a,
  hot: 1.8,
  hotColor: 0xd890ff,
  pulse: [3.2, 0.55],
  rim: 0.45,
  rimColor: 0x8c6cff,
  gloss: [0.75, 60]
}

/** Machine (蝕機) defaults: cyan seams and lens eyes on pearl ceramic. */
export const MACHINE_LOOK: Required<FoeLook> = {
  glow: 1.7,
  glowColor: 0x4fe8ff,
  eye: 2.6,
  eyeColor: 0x7ff6ff,
  hot: 2.4,
  hotColor: 0xff4a4a,
  pulse: [1.6, 0.3],
  rim: 0.45,
  rimColor: 0xbfefff,
  gloss: [0.55, 40]
}

export function createFoeUniforms(look: FoeLook = CREATURE_LOOK): FoeUniforms {
  const l = { ...CREATURE_LOOK, ...look }
  return {
    ...createHullUniforms(0.012, 0x1e1a2a),
    uGlowColor: { value: new THREE.Color(l.glowColor) },
    uGlow: { value: l.glow },
    uGlow2Color: { value: new THREE.Color(l.eyeColor) },
    uGlow2: { value: l.eye },
    uGlow3Color: { value: new THREE.Color(l.hotColor) },
    uGlow3: { value: l.hot },
    uTime: { value: 0 },
    uPulse: { value: new THREE.Vector2(l.pulse[0], l.pulse[1]) },
    uRim: { value: l.rim },
    uRimColor: { value: new THREE.Color(l.rimColor) },
    uGloss: { value: new THREE.Vector2(l.gloss[0], l.gloss[1]) },
    uFlash: { value: 0 },
    uDim: { value: 0 }
  }
}

let emptyRegions: THREE.DataTexture | null = null

const VERTEX_PARS = /* glsl */ `
attribute vec4 animaMask;
attribute vec4 markColor;
attribute float ao;
attribute vec4 regionFilter;
varying vec4 vMask;
varying vec4 vMark;
varying vec3 vBind;
varying float vAO;
varying vec4 vFilter;
varying vec3 vTint;
varying float vInstFlash;
varying float vPhase;
${HULL_VERTEX_PARS}
`

const VERTEX_COLOR = /* glsl */ `
  vMask = animaMask;
  vMark = markColor;
  vBind = position;
  vAO = ao;
  vFilter = regionFilter;
  #ifdef USE_COLOR
    vColor = color;
  #endif
  vTint = vec3(1.0);
  vInstFlash = 0.0;
  vPhase = 0.0;
  #ifdef USE_INSTANCING_COLOR
    float fl = clamp(min(instanceColor.r, min(instanceColor.g, instanceColor.b)) - 1.0, 0.0, 4.0) * 0.25;
    vInstFlash = fl;
    vTint = fl > 0.0 ? vec3(1.0) : instanceColor;
  #endif
  #ifdef USE_INSTANCING
    vPhase = dot(instanceMatrix[3].xz, vec2(0.71, 0.53));
  #endif
`

const FRAGMENT_PARS = /* glsl */ `
uniform vec3 uGlowColor;
uniform float uGlow;
uniform vec3 uGlow2Color;
uniform float uGlow2;
uniform vec3 uGlow3Color;
uniform float uGlow3;
uniform float uTime;
uniform vec2 uPulse;
uniform float uRim;
uniform vec3 uRimColor;
uniform vec2 uGloss;
uniform float uFlash;
uniform float uDim;
varying vec4 vMask;
varying vec4 vMark;
varying vec3 vBind;
varying float vAO;
varying vec3 vTint;
varying float vInstFlash;
varying float vPhase;
${HULL_FRAGMENT_PARS}

float crisp(float x) {
  float fw = max(fwidth(x) * 0.85, 0.004);
  return smoothstep(0.5 - fw, 0.5 + fw, x);
}

vec3 getGradientIrradiance(vec3 normal, vec3 lightDirection) {
  float d = dot(normal, lightDirection) * 0.5 + 0.5;
  // Softer bands than the animals: low-poly crowd shapes stay smooth, the gloss highlight stays crisp.
  float fw = max(fwidth(d), 0.002) + 0.05;
  float b1 = smoothstep(0.40 - fw, 0.40 + fw, d);
  float b2 = smoothstep(0.66 - fw, 0.66 + fw, d);
  vec3 lo = vec3(0.5, 0.47, 0.62);
  vec3 mid = vec3(0.8, 0.79, 0.86);
  return mix(lo, mix(mid, vec3(1.0), b2), b1);
}
`

const COLOR_FRAGMENT = /* glsl */ `
  vec4 animaMsk = vec4(crisp(vMask.x), crisp(vMask.y), crisp(vMask.z), crisp(vMask.w));
  vec3 paintCol = mix(vColor, vMark.rgb, crisp(vMark.a));
  applyRegions(vBind, paintCol, animaMsk);
  diffuseColor.rgb *= paintCol * vAO * vTint;
`

const EMISSIVE_FRAGMENT = /* glsl */ `
  #include <emissivemap_fragment>
  float pulse = 1.0 - uPulse.y * (0.5 + 0.5 * sin(uTime * uPulse.x + vPhase - vBind.y * 3.0 - vBind.z * 2.0));
  vec3 glowSum = uGlowColor * (uGlow * pulse * animaMsk.y) + uGlow2Color * (uGlow2 * animaMsk.w)
    + uGlow3Color * (uGlow3 * animaMsk.x);
  totalEmissiveRadiance += glowSum * (1.0 - uDim * 0.85);
`

const OPAQUE_FRAGMENT = /* glsl */ `{
    vec3 V = normalize(vViewPosition);
    float ndv = clamp(dot(normal, V), 0.0, 1.0);
    float rim = smoothstep(0.55, 1.0, 1.0 - ndv);
    float lit = 1.0 - max(animaMsk.y, max(animaMsk.w, animaMsk.x));
    outgoingLight += uRimColor * (rim * uRim * lit);
    #if NUM_DIR_LIGHTS > 0
      vec3 Hv = normalize(directionalLights[0].direction + V);
      float sp = pow(max(dot(normal, Hv), 0.0), uGloss.y);
      outgoingLight += directionalLights[0].color * smoothstep(0.2, 0.8, sp) * uGloss.x * lit * (1.0 - animaMsk.z) * 0.3;
    #endif
    float grey = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    outgoingLight = mix(outgoingLight, vec3(grey) * 0.45, uDim * 0.75);
    outgoingLight = mix(outgoingLight, vec3(1.0, 0.96, 0.98), clamp(max(uFlash, vInstFlash) * 0.85, 0.0, 0.85));
    #ifdef USE_HULL
      if (vHull > 0.5) outgoingLight = uOutlineColor * (0.55 + 0.45 * paintCol) * (1.0 - uDim * 0.5);
    #endif
  }
  #include <opaque_fragment>`

/**
 * Material of one rigid foe part (or a boss mesh). Parts of one foe share `u`; `regions` are the part's shader
 * paint regions (`regionsOf(baked)`), `hull` turns on the single-draw outline (the geometry must carry one).
 */
export function createFoeMaterial(
  u: FoeUniforms,
  regions: RegionUniforms | null = null,
  opts: { hull?: boolean; side?: THREE.Side } = {}
): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, color: 0xffffff, side: opts.side ?? THREE.FrontSide })
  emptyRegions ??= new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  const ru = {
    uRegions: { value: regions?.texture ?? emptyRegions },
    uRegionCount: { value: regions?.count ?? 0 },
    uShapeBase: { value: regions?.shapeBase ?? 0 }
  }
  if (opts.hull) (m as unknown as { defines: Record<string, string> }).defines = { USE_HULL: '' }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, ru)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${VERTEX_COLOR}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${HULL_VERTEX_EXTRUDE}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${HULL_VERTEX_CLIP}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', `${FRAGMENT_PARS}${REGION_GLSL}`)
      .replace('#include <color_fragment>', COLOR_FRAGMENT)
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAGMENT)
      .replace('#include <opaque_fragment>', OPAQUE_FRAGMENT)
  }
  m.customProgramCacheKey = () => (opts.hull ? 'anima-foe-1-hull' : 'anima-foe-1')
  return m
}
