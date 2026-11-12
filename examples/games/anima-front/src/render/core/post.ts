/**
 * Post-processing chain (DESIGN §15): HDR scene → bloom (only emissive anima clears the threshold) → tone mapping
 * + sRGB (OutputPass) → per-theme grading and vignette → FXAA or SMAA. Skipped entirely at low quality.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import type { ThemeDef } from '../env/themes'
import type { QualityPreset } from './quality'

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1 },
    uVignette: { value: 0.3 },
    uHurt: { value: 0 },
    uAspect: { value: 1.7 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uHurt;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uGain + uLift * (1.0 - c.rgb);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSaturation);
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(0.35, 1.15, length(p));
      col *= 1.0 - v * uVignette;
      col = mix(col, vec3(0.75, 0.08, 0.12), v * uHurt * 0.65);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }
  `
}

export class PostChain {
  readonly composer: EffectComposer
  private readonly renderPass: RenderPass
  private readonly bloom: UnrealBloomPass
  private readonly grade: ShaderPass
  private readonly aa: ShaderPass | SMAAPass | null
  private readonly target: THREE.WebGLRenderTarget
  private width = 1
  private height = 1

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    readonly preset: QualityPreset,
    bloomOn: boolean
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    this.width = Math.max(1, size.x)
    this.height = Math.max(1, size.y)
    this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples: preset.msaa
    })
    this.composer = new EffectComposer(renderer, this.target)
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.6, 0.5, 1.2)
    this.bloom.enabled = bloomOn
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GradeShader)
    this.composer.addPass(this.grade)
    if (preset.aa === 'smaa') this.aa = new SMAAPass()
    else if (preset.aa === 'fxaa') this.aa = new ShaderPass(FXAAShader)
    else this.aa = null
    if (this.aa) this.composer.addPass(this.aa)
    this.setSize(renderer)
  }

  setTheme(theme: ThemeDef) {
    this.bloom.strength = theme.bloom.strength
    this.bloom.radius = theme.bloom.radius
    this.bloom.threshold = theme.bloom.threshold
    const u = this.grade.uniforms
    u.uLift.value.set(...theme.grade.lift)
    u.uGain.value.set(...theme.grade.gain)
    u.uSaturation.value = theme.grade.saturation
    u.uVignette.value = theme.grade.vignette
  }

  setBloom(on: boolean) {
    this.bloom.enabled = on
  }

  /** 0..1 red edge vignette when the local player is hurt / critical. */
  setHurt(amount: number) {
    this.grade.uniforms.uHurt.value = amount
  }

  setSize(renderer: THREE.WebGLRenderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    this.width = Math.max(1, size.x)
    this.height = Math.max(1, size.y)
    this.composer.setPixelRatio(1)
    this.composer.setSize(this.width, this.height)
    this.bloom.setSize(
      Math.max(1, Math.round(this.width * this.preset.bloomScale * 2)),
      Math.max(1, Math.round(this.height * this.preset.bloomScale * 2))
    )
    this.grade.uniforms.uAspect.value = this.width / this.height
    if (this.aa instanceof ShaderPass) this.aa.uniforms.resolution.value.set(1 / this.width, 1 / this.height)
  }

  render(dt: number) {
    this.composer.render(dt)
  }

  dispose() {
    this.composer.dispose()
    this.bloom.dispose()
    this.target.dispose()
    if (this.aa && 'dispose' in this.aa) this.aa.dispose()
  }
}
