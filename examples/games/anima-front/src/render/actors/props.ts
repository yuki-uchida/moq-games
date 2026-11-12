/**
 * Props (ModelKit.createProp) plus render-side visuals: capture zone rings with progress and a light curtain,
 * team base rings, fixed frog pads from the map. Decoys are drawn as hologram characters (characters.ts).
 */
import * as THREE from 'three'
import type { ModelKit, PropModel } from '../../models/api'
import type { MapDef, PropView, TeamId, View } from '../../sim/types'
import { TEAM_HEX } from './characters'

const ringVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const ringFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uFill;
uniform float uProgress;
uniform float uTime;
uniform float uInner;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float band = smoothstep(uInner - 0.04, uInner, r) * (1.0 - smoothstep(0.97, 1.0, r));
  float ang = atan(p.x, p.y) / 6.2831853 + 0.5;
  float prog = step(ang, uProgress) * band;
  float dash = step(0.5, fract(ang * 24.0 - uTime * 0.2));
  float inner = (1.0 - smoothstep(0.0, uInner, r)) * 0.12 + smoothstep(uInner - 0.25, uInner, r) * 0.18;
  vec3 col = uColor * (band * (0.3 + 0.3 * dash) + inner * 0.7) + uFill * prog * 0.85;
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0 - r * 6.0);
  gl_FragColor = vec4(col * pulse, 1.0);
}
`

const curtainVertex = /* glsl */ `
varying float vH;
void main() { vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const curtainFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying float vH;
void main() {
  float a = pow(1.0 - vH, 2.5) * (0.22 + 0.08 * sin(uTime * 2.0 + vH * 8.0));
  gl_FragColor = vec4(uColor * a, 1.0);
}
`

interface RingVis {
  ring: THREE.Mesh
  curtain: THREE.Mesh
  ringMat: THREE.ShaderMaterial
  curtainMat: THREE.ShaderMaterial
  seen: number
}

export class Props {
  readonly group = new THREE.Group()
  private readonly models = new Map<number, { model: PropModel; seen: number }>()
  private readonly rings = new Map<string, RingVis>()
  private readonly ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
  private readonly curtainGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0)
  private readonly padModels: PropModel[] = []
  private frameId = 0
  private time = 0

  constructor(private readonly kit: ModelKit) {}

  setMap(map: MapDef) {
    for (const m of this.padModels) {
      this.group.remove(m.root)
      m.dispose()
    }
    this.padModels.length = 0
    for (const r of this.rings.values()) {
      this.group.remove(r.ring, r.curtain)
      r.ringMat.dispose()
      r.curtainMat.dispose()
    }
    this.rings.clear()
    for (const pad of map.pads) {
      const m = this.kit.createProp('pad')
      m.root.position.set(...pad.p)
      m.root.rotation.y = pad.yaw
      this.group.add(m.root)
      this.padModels.push(m)
    }
    // Squad/team bases from the map (rings are drawn even before the sim spawns base props).
    for (const [i, b] of map.bases.entries()) {
      const r = this.ring(`mapbase:${i}`)
      r.ring.position.set(b.p[0], b.p[1] + 0.06, b.p[2])
      r.ring.scale.setScalar(b.r)
      r.curtain.position.set(b.p[0], b.p[1], b.p[2])
      r.curtain.scale.set(b.r, 2.2, b.r)
      const color = b.team === 'squad' ? 0xffb45c : TEAM_HEX[b.team as TeamId]
      r.ringMat.uniforms.uColor.value.setHex(color).multiplyScalar(1.4)
      r.ringMat.uniforms.uProgress.value = 0
      r.ringMat.uniforms.uInner.value = 0.9
      r.curtainMat.uniforms.uColor.value.setHex(color).multiplyScalar(0.5)
      r.seen = Infinity
    }
  }

  private ring(key: string): RingVis {
    let r = this.rings.get(key)
    if (r) return r
    const ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() },
        uFill: { value: new THREE.Color() },
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uInner: { value: 0.88 }
      },
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    })
    const curtainMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 } },
      vertexShader: curtainVertex,
      fragmentShader: curtainFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
    const ring = new THREE.Mesh(this.ringGeo, ringMat)
    ring.renderOrder = 5
    const curtain = new THREE.Mesh(this.curtainGeo, curtainMat)
    curtain.renderOrder = 6
    this.group.add(ring, curtain)
    r = { ring, curtain, ringMat, curtainMat, seen: 0 }
    this.rings.set(key, r)
    return r
  }

  update(view: View, myTeam: TeamId | undefined, dt: number) {
    this.frameId++
    this.time += dt
    for (const pr of view.props) {
      if ((pr.kind === 'decoy' || pr.kind === 'leafDecoy') && pr.species) continue
      if (pr.kind === 'zone' || pr.kind === 'base') this.zone(pr, myTeam)
      if (pr.kind === 'ink' || pr.kind === 'base' || pr.kind === 'puddle') continue
      let e = this.models.get(pr.id)
      if (!e) {
        const model = this.kit.createProp(pr.kind)
        model.root.traverse((o) => {
          o.castShadow = true
          o.receiveShadow = true
        })
        this.group.add(model.root)
        e = { model, seen: 0 }
        this.models.set(pr.id, e)
      }
      e.seen = this.frameId
      e.model.root.position.set(pr.p[0], pr.p[1], pr.p[2])
      e.model.root.rotation.y = pr.yaw
      e.model.update(dt, pr.t, pr.state ?? 0, pr.life)
      if (pr.hp !== undefined && pr.maxHp) e.model.setHealth?.(Math.max(0, Math.min(1, pr.hp / pr.maxHp)))
    }
    for (const [id, e] of this.models) {
      if (e.seen === this.frameId) continue
      this.group.remove(e.model.root)
      e.model.dispose()
      this.models.delete(id)
    }
    for (const [key, r] of this.rings) {
      r.ringMat.uniforms.uTime.value = this.time
      r.curtainMat.uniforms.uTime.value = this.time
      if (r.seen === Infinity || r.seen === this.frameId) continue
      this.group.remove(r.ring, r.curtain)
      r.ringMat.dispose()
      r.curtainMat.dispose()
      this.rings.delete(key)
    }
    for (const m of this.padModels) m.update(dt, this.time, 0, undefined)
  }

  private zone(pr: PropView, myTeam: TeamId | undefined) {
    const r = this.ring(`prop:${pr.id}`)
    r.seen = this.frameId
    const radius = pr.r ?? 6
    r.ring.position.set(pr.p[0], pr.p[1] + 0.07, pr.p[2])
    r.ring.scale.setScalar(radius)
    r.curtain.position.set(pr.p[0], pr.p[1], pr.p[2])
    r.curtain.scale.set(radius, pr.kind === 'zone' ? 3.5 : 2.2, radius)
    let color = 0xffd36a
    if (pr.team === 'foe') color = 0xff5a4a
    else if (typeof pr.team === 'number' && pr.team >= 0)
      color =
        pr.kind === 'base'
          ? TEAM_HEX[pr.team as TeamId]
          : pr.team === myTeam || myTeam === undefined
            ? 0x7af0a0
            : TEAM_HEX[pr.team as TeamId]
    r.ringMat.uniforms.uColor.value.setHex(color).multiplyScalar(1.1)
    r.ringMat.uniforms.uFill.value.setHex(0x7af0a0)
    r.ringMat.uniforms.uProgress.value = pr.kind === 'zone' ? (pr.state ?? 0) : 0
    r.ringMat.uniforms.uInner.value = pr.kind === 'zone' ? 0.86 : 0.92
    r.curtainMat.uniforms.uColor.value.setHex(color).multiplyScalar(0.38)
  }

  dispose() {
    for (const e of this.models.values()) e.model.dispose()
    this.models.clear()
    for (const r of this.rings.values()) {
      r.ringMat.dispose()
      r.curtainMat.dispose()
    }
    this.rings.clear()
    for (const m of this.padModels) m.dispose()
    this.padModels.length = 0
    this.ringGeo.dispose()
    this.curtainGeo.dispose()
    this.group.clear()
  }
}
