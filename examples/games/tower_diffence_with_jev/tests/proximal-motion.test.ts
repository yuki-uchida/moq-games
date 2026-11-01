import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { directMotionClip } from '../src/rendering/DirectedMotion'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import { ATTACK_PROFILES } from '../src/game/AttackProfiles'

const files = { wolf: 'wolf-walk-smooth.glb', brute: 'brute-motion-v2-candidate.glb' }
async function load(role: keyof typeof files) {
  const bytes = readFileSync(`public/tower-defense-art/models/${role}/${files[role]}`)
  const loader = new GLTFLoader()
  loader.register(() => ({ name: 'NO_TEXTURE_IO', loadTexture: () => Promise.resolve(new THREE.Texture()) }))
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  for (const [i, clip] of gltf.animations.entries())
    Object.assign(clip, { userData: gltf.parser.json.animations[i].extras })
  return gltf
}
function player(scene: THREE.Object3D, clip: THREE.AnimationClip) {
  const mixer = new THREE.AnimationMixer(scene)
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  return (t: number) => {
    mixer.setTime(t)
    scene.updateMatrixWorld(true)
  }
}
const position = (scene: THREE.Object3D, name: string) =>
  scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))!.getWorldPosition(new THREE.Vector3())

describe('authored proximal locomotion regressions (actual distributed GLBs)', () => {
  for (const role of ['wolf', 'brute'] as const) {
    it(`${role}: rigid segment lengths, meaningful shoulder/hip swing and stable loop`, async () => {
      const { scene, animations } = await load(role)
      const clip = animations.find((c) => c.name === 'walk')!
      expect(directMotionClip(scene, clip, role)).toBe(clip)
      const sample = player(scene, clip)
      const chains =
        role === 'wolf'
          ? ['FL', 'FR', 'HL', 'HR'].map((k) => [`upper.${k}`, `lower.${k}`, `paw.${k}`])
          : ['L', 'R'].map((k) => [`thigh.${k}`, `shin.${k}`, `foot.${k}`])
      const lengths = new Map<string, number>(),
        directions = new Map<string, THREE.Vector3[]>()
      sample(0)
      const initial = chains.flat().map((n) => position(scene, n))
      for (let i = 0; i <= 120; i++) {
        sample(i / 120)
        for (const [a, b, c] of chains) {
          const p = position(scene, a),
            q = position(scene, b),
            r = position(scene, c)
          for (const [key, length] of [
            [a, p.distanceTo(q)],
            [b, q.distanceTo(r)]
          ] as const) {
            lengths.set(key, lengths.get(key) ?? length)
            expect(length).toBeCloseTo(lengths.get(key)!, 5)
          }
          const list = directions.get(a) ?? []
          list.push(q.sub(p).normalize())
          directions.set(a, list)
        }
      }
      for (const ds of directions.values()) {
        expect(Math.max(...ds.map((v) => v.angleTo(ds[0])))).toBeGreaterThan(0.35)
        for (let i = 1; i < ds.length; i++) expect(ds[i].angleTo(ds[i - 1])).toBeLessThan(0.18)
      }
      chains.flat().forEach((n, i) => expect(position(scene, n).distanceTo(initial[i])).toBeLessThan(0.00001))
    })
    it(`${role}: planted feet match the runtime stride and have zero vertical travel during stance`, async () => {
      const { scene, animations } = await load(role)
      const sample = player(scene, animations.find((c) => c.name === 'walk')!)
      const stance = role === 'wolf' ? 0.45 : 0.54
      const stride = UNIT_MODEL_CATALOG[role]!.walkDistance / UNIT_MODEL_CATALOG[role]!.scale
      const feet =
        role === 'wolf'
          ? ([
              ['FL', 0],
              ['FR', 0.5],
              ['HL', 0.5],
              ['HR', 0]
            ] as const)
          : ([
              ['L', 0],
              ['R', 0.5]
            ] as const)
      for (const [side, offset] of feet) {
        const start = offset === 0 ? 0 : 0.5
        const values: THREE.Vector3[] = []
        for (let i = 0; i <= 90; i++) {
          const t = start + (i / 90) * (stance - 0.0001)
          sample(t % 1)
          const p = position(scene, `${role === 'wolf' ? 'paw' : 'foot'}.${side}`)
          p.z += stride * t // Native +Z forward; planted local feet move -Z.
          values.push(p)
        }
        expect(stance).toBeGreaterThan(0.4)
        for (const p of values) expect(p.distanceTo(values[0])).toBeLessThan(0.0002)
      }
    })
  }
  it('brute: rigid rock weights, coherent arm chains and unchanged 660 ms impact contract', async () => {
    const { scene, animations } = await load('brute')
    const clip = animations.find((c) => c.name === 'attack')!
    expect(clip.duration).toBeCloseTo(1.2)
    expect(ATTACK_PROFILES.brute.cueMs).toBe(660)
    expect(directMotionClip(scene, clip, 'brute')).toBe(clip)
    const sample = player(scene, clip)
    const spans: number[] = []
    for (let i = 0; i <= 144; i++) {
      sample(i / 120)
      for (const side of ['L', 'R']) {
        const h = position(scene, `upper.${side}`),
          e = position(scene, `fore.${side}`),
          w = position(scene, `hand.${side}`)
        expect(h.distanceTo(e)).toBeCloseTo(0.237118, 5)
        expect(e.distanceTo(w)).toBeCloseTo(0.287967, 5)
      }
      spans.push(position(scene, 'hand.L').y)
    }
    expect(Math.max(...spans) - Math.min(...spans)).toBeGreaterThan(0.6)
    scene.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh)) return
      const weights = o.geometry.getAttribute('skinWeight')
      for (let i = 0; i < weights.count; i++)
        expect(Math.max(weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i))).toBeCloseTo(1)
    })
  })
  it('wolf: shoulder and hip transition vertices are influenced above the elbows/knees', async () => {
    const { scene } = await load('wolf')
    const counts = new Map<string, number>()
    scene.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh)) return
      const p = o.geometry.getAttribute('position'),
        w = o.geometry.getAttribute('skinWeight'),
        j = o.geometry.getAttribute('skinIndex')
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < -0.28) continue
        for (let k = 0; k < 4; k++) {
          const name = o.skeleton.bones[j.getComponent(i, k)].name
          if (name.startsWith('upper') && w.getComponent(i, k) > 0.25) counts.set(name, (counts.get(name) ?? 0) + 1)
        }
      }
    })
    for (const side of ['FL', 'FR', 'HL', 'HR']) expect(counts.get(`upper${side}`) ?? 0).toBeGreaterThan(20)
  })
})
