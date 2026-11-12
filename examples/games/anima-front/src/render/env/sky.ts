/**
 * Sky dome: three-stop gradient, sun/moon disc with glow, drifting procedural clouds and stars at night.
 * Follows the camera; drawn first with no depth writes.
 */
import * as THREE from 'three'
import type { ThemeDef } from './themes'

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

const fragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform vec3 uDisc;
uniform float uDiscSize;
uniform float uDiscGlow;
uniform vec3 uCloud;
uniform vec3 uCloudShade;
uniform float uCover;
uniform float uStars;
uniform float uTime;
uniform float uSpeed;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.4));
  // Warm haze band around the sun's azimuth near the horizon.
  float sunAz = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))));
  col = mix(col, uHaze, pow(sunAz, 6.0) * exp(-abs(h) * 6.0) * 0.6);
  // Stars.
  if (uStars > 0.0 && h > 0.0) {
    vec3 sp = d * 160.0;
    vec3 cell = floor(sp);
    float s = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float core = smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
    col += vec3(step(0.993, s) * core * tw * uStars * 1.6 * smoothstep(0.0, 0.25, h));
  }
  // Sun / moon.
  float sd = dot(d, normalize(uSunDir));
  float disc = smoothstep(cos(uDiscSize * 1.15), cos(uDiscSize * 0.9), sd);
  col += uDisc * pow(max(sd, 0.0), 64.0) * uDiscGlow;
  col += uDisc * pow(max(sd, 0.0), 8.0) * uDiscGlow * 0.25;
  col = mix(col, uDisc * 2.5, disc);
  // Clouds on a virtual plane above.
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.12) * 1.4 + vec2(uTime * uSpeed, uTime * uSpeed * 0.4);
    float n = fbm(cp);
    float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.35, n);
    float lit = fbm(cp + normalize(uSunDir.xz) * 0.08);
    vec3 cc = mix(uCloudShade, uCloud, clamp(0.55 + (n - lit) * 3.0, 0.0, 1.0));
    cc += uDisc * pow(max(sd, 0.0), 12.0) * 0.4;
    col = mix(col, cc, c * smoothstep(0.0, 0.18, h) * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export class SkyDome {
  readonly mesh: THREE.Mesh
  private readonly material: THREE.ShaderMaterial

  constructor(theme: ThemeDef, sunDir: THREE.Vector3) {
    const c = (hex: number) => new THREE.Color(hex)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: c(theme.sky.top) },
        uHorizon: { value: c(theme.sky.horizon) },
        uBottom: { value: c(theme.sky.bottom) },
        uHaze: { value: c(theme.sky.haze) },
        uSunDir: { value: sunDir.clone() },
        uDisc: { value: c(theme.disc.color) },
        uDiscSize: { value: theme.disc.size },
        uDiscGlow: { value: theme.disc.glow },
        uCloud: { value: c(theme.clouds.color) },
        uCloudShade: { value: c(theme.clouds.shade) },
        uCover: { value: theme.clouds.cover },
        uStars: { value: theme.stars },
        uTime: { value: 0 },
        uSpeed: { value: theme.clouds.speed * 10 }
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -10
    this.mesh.scale.setScalar(100)
  }

  update(camera: THREE.Camera, time: number) {
    this.mesh.position.copy(camera.position)
    this.material.uniforms.uTime.value = time
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
