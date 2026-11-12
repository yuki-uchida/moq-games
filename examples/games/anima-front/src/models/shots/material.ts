/**
 * Projectile material: an unlit-ish emissive shader for InstancedMesh (no instance colours). Vertex colours
 * (linear) give the look; the glow mask (animaMask y) marks the hot parts, drawn well above 1 so they clear the
 * bloom threshold, with a white-hot centre where they face the camera. Solid parts get a soft two-band sky shade
 * and a rim. Normals follow the instance stretch (inverse-transpose of the instance matrix).
 */
import * as THREE from 'three'

export interface ShotShade {
  /** Brightness of solid (non-glowing) parts. */
  lit?: number
  /** Brightness of glowing parts (HDR, > 1 blooms). */
  hot?: number
  /** Extra white-hot centre on glowing parts facing the camera. */
  core?: number
  rim?: number
  rimColor?: number
  /** Draw both faces (ribbons, vanes, fins). */
  doubleSided?: boolean
}

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 animaMask;
varying vec3 vCol;
varying float vGlow;
varying vec3 vN;
varying vec3 vV;
varying float vUp;
void main() {
  #ifdef USE_COLOR
    vCol = color;
  #else
    vCol = vec3(1.0);
  #endif
  vGlow = animaMask.y;
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    mat3 im = mat3(instanceMatrix);
    vec3 s2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
    n = im * (n / max(s2, vec3(1e-6)));
  #endif
  vec4 mvPosition = modelViewMatrix * p;
  vN = normalize(normalMatrix * n);
  vV = -mvPosition.xyz;
  vUp = normalize(mat3(modelMatrix) * n).y;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const FRAG = /* glsl */ `
uniform float uLit;
uniform float uHot;
uniform float uCore;
uniform float uRim;
uniform vec3 uRimColor;
#include <common>
#include <fog_pars_fragment>
varying vec3 vCol;
varying float vGlow;
varying vec3 vN;
varying vec3 vV;
varying float vUp;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float up = gl_FrontFacing ? vUp : -vUp;
  float shade = 0.6 + 0.4 * smoothstep(-0.15, 0.25, up);
  float glow = step(0.5, vGlow);
  vec3 c = vCol * mix(uLit * shade, uHot, glow);
  c += (vCol * 0.5 + 0.5) * glow * pow(ndv, 3.0) * uCore;
  c += uRimColor * pow(1.0 - ndv, 2.0) * uRim * (1.0 - glow * 0.5);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

/** Material of one shot kind (shared by every instance of the kind). */
export function createShotMaterial(shade: ShotShade = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uLit: { value: shade.lit ?? 1.1 },
        uHot: { value: shade.hot ?? 3.2 },
        uCore: { value: shade.core ?? 2.5 },
        uRim: { value: shade.rim ?? 0.5 },
        uRimColor: { value: new THREE.Color(shade.rimColor ?? 0xffffff) }
      }
    ]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    fog: true,
    side: shade.doubleSided ? THREE.DoubleSide : THREE.FrontSide
  })
}
