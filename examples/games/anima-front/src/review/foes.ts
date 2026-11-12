/**
 * Review cells for crowd foes, drawn exactly like the renderer does (render/actors/foes.ts): one InstancedMesh
 * per rig part, the spawn rise / drop and the dying sink-and-shrink on the root, instance colours for hit
 * flash and shield tint.
 *
 *   ?foe=oagos&state=windup&attack=charge&st=0.3&speed=4&seed=0.3&hp=1&flash=0.5&tint=shield
 *   ?sheet=foes (+ state=…)   ?sheet=foe-states&foe=oagos   ?sheet=crowd&foe=tsubute&n=40
 */
import * as THREE from 'three'
import { FOES, FOE_KINDS, type FoeAttack, type FoeKind } from '../data/enemies'
import type { FoeAnim, ModelKit } from '../models/api'
import type { FoeState } from '../sim/types'
import { fitCamera, num, params, stage, type Cell } from './stage'

export interface FoeCellOpts {
  state?: FoeState
  attack?: FoeAttack
  st?: number
  speed?: number
  seed?: number
  hp?: number
  angle?: number
  live?: boolean
  label?: string
  sub?: string
  flash?: number
  tint?: 'shield' | null
  /** Crowd: number of instances spread around the centre. */
  count?: number
}

const STATE_TIME: Partial<Record<FoeState, number>> = {
  spawn: 0.8,
  attack: 0.6,
  recover: 0.45,
  stagger: 0.6,
  dying: 0.8
}

/** One foe (or a crowd of one kind) in a cell. */
export function foeCell(kit: ModelKit, kind: FoeKind, o: FoeCellOpts = {}): Cell {
  const def = FOES[kind]
  const n = o.count ?? 1
  const crowd = n > 1
  const size = Math.max(def.height, def.radius * 2.2)
  const area = crowd ? Math.sqrt(n) * def.radius * 3.2 : 0
  const scene = stage(Math.max(1.5, size * 0.9 + area * 0.7))
  const rig = kit.foeRig(kind)
  const holder = new THREE.Group()
  holder.rotation.y = ((o.angle ?? 35) * Math.PI) / 180
  scene.add(holder)
  const meshes = rig.parts.map((p) => {
    const m = new THREE.InstancedMesh(p.geometry, p.material, n)
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    holder.add(m)
    return m
  })
  const locals = rig.parts.map(() => new THREE.Matrix4())
  const lift = def.flying ? size * 0.35 : 0
  const state = o.state ?? 'idle'
  const atk = o.attack ?? (state === 'windup' || state === 'attack' ? def.attacks[0]?.id : undefined)
  const windup = def.attacks.find((a) => a.id === atk)?.windup ?? 0.5
  const loop = (state === 'windup' ? windup : (STATE_TIME[state] ?? 0)) + 0.5
  const spots: [number, number, number, number][] = []
  for (let i = 0; i < n; i++) {
    // Deterministic scatter (golden angle) with per-instance seed, facing roughly forward.
    const r = crowd ? def.radius * 2.6 * Math.sqrt(i + 0.5) : 0
    const a = i * 2.39996
    spots.push([
      Math.cos(a) * r,
      Math.sin(a) * r,
      crowd ? (((i * 7919) % 100) / 100 - 0.5) * 0.8 : 0,
      (i * 0.618034) % 1
    ])
  }
  const anim: FoeAnim = { state, st: o.st ?? 0, time: 0, speed: 0, seed: 0, hpFrac: o.hp ?? 1, attack: atk }
  const root = new THREE.Matrix4()
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const color = new THREE.Color()
  let time = num('t', 1.3)
  let st = o.st ?? (state === 'windup' ? windup * 0.75 : state === 'spawn' ? 0.45 : 0.15)
  const draw = () => {
    for (let i = 0; i < n; i++) {
      const [x, z, yaw, seed] = spots[i]
      anim.st = crowd ? st + seed * 0.3 : st
      anim.time = time
      anim.seed = o.seed ?? (crowd ? seed : 0.37)
      anim.speed = o.speed ?? (state === 'move' ? def.speed : 0)
      let sink = 0
      let scale = 1
      if (state === 'spawn') {
        const u = Math.min(1, anim.st / 0.6)
        sink = def.faction === 'creature' ? -(1 - u) * def.height : (1 - u) * (1 - u) * 8
        scale = 0.6 + 0.4 * u
      } else if (state === 'dying') {
        const u = Math.min(1, Math.max(0, (anim.st - 0.25) / 0.5))
        scale = Math.max(1e-4, 1 - u * 0.85)
        sink = -u * def.height * 0.4
      }
      pos.set(x, lift + sink, z)
      q.setFromAxisAngle(up, yaw)
      scl.setScalar(scale)
      root.compose(pos, q, scl)
      rig.pose(anim, locals)
      const fl = o.flash ?? 0
      if (fl > 0) color.setRGB(1 + fl * 4, 1 + fl * 4, 1 + fl * 4)
      else if (o.tint === 'shield') color.setRGB(0.85, 1.15, 1.35)
      else color.setRGB(1, 1, 1)
      for (let k = 0; k < meshes.length; k++) {
        m.multiplyMatrices(root, locals[k])
        meshes[k].setMatrixAt(i, m)
        meshes[k].setColorAt(i, color)
      }
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }
  draw()
  const view = crowd ? Math.max(size * 1.6, area * 1.25) : size * 1.25
  const camera = fitCamera(view * num('zoom', 1), lift + def.height * 0.5, 1.05, num('elev', crowd ? 0.42 : 0.14))
  return {
    scene,
    camera,
    label: o.label ?? `${def.name}（${kind}）`,
    sub: o.sub ?? `${state}${atk && (state === 'windup' || state === 'attack') ? ` ${atk}` : ''}`,
    step(dt) {
      time += dt
      if (o.live) st = (st + dt) % loop
      draw()
    }
  }
}

/** Every state (and every attack's wind-up and strike) of one foe. */
function stateList(kind: FoeKind): FoeCellOpts[] {
  const def = FOES[kind]
  const list: FoeCellOpts[] = [
    { state: 'spawn', st: 0.25, sub: 'spawn 0.25' },
    { state: 'spawn', st: 0.5, sub: 'spawn 0.5' },
    { state: 'idle', sub: 'idle' },
    { state: 'move', speed: def.speed * 0.5, sub: 'move slow' },
    { state: 'move', speed: def.speed, sub: 'move' }
  ]
  for (const a of def.attacks) {
    list.push({ state: 'windup', attack: a.id, st: a.windup * 0.4, sub: `windup ${a.id} 40%` })
    list.push({ state: 'windup', attack: a.id, st: a.windup * 0.95, sub: `windup ${a.id} 95%` })
    list.push({ state: 'attack', attack: a.id, st: 0.08, sub: `attack ${a.id}` })
    list.push({ state: 'recover', attack: a.id, st: 0.15, sub: `recover ${a.id}` })
  }
  list.push(
    { state: 'stagger', st: 0.15, sub: 'stagger' },
    { state: 'dying', st: 0.15, sub: 'dying 0.15' },
    { state: 'dying', st: 0.4, sub: 'dying 0.4' },
    { state: 'idle', flash: 0.6, sub: 'hit flash' },
    { state: 'idle', tint: 'shield', sub: 'shielded' }
  )
  return list
}

export const CROWD_KINDS = FOE_KINDS.filter((k) => !FOES[k].boss)

/** Cells for the foe URL API, or null when the query is not about foes. */
export function foeCells(kit: ModelKit, sheet: string | null): { cells: Cell[]; cols: number } | null {
  const kind = (params.get('foe') ?? 'tsubute') as FoeKind
  const state = (params.get('state') ?? 'idle') as FoeState
  const common = (): FoeCellOpts => ({
    state,
    attack: (params.get('attack') as FoeAttack | null) ?? undefined,
    st: params.has('st') ? num('st', 0) : undefined,
    speed: params.has('speed') ? num('speed', 0) : undefined,
    seed: params.has('seed') ? num('seed', 0) : undefined,
    hp: num('hp', 1),
    angle: num('angle', 35),
    flash: num('flash', 0),
    tint: params.get('tint') === 'shield' ? 'shield' : null
  })
  if (sheet === 'foes') return { cells: CROWD_KINDS.map((k) => foeCell(kit, k, common())), cols: 5 }
  if (sheet === 'foe-states')
    return { cells: stateList(kind).map((o) => foeCell(kit, kind, { ...o, angle: num('angle', 35) })), cols: 7 }
  if (sheet === 'crowd')
    return {
      cells: [
        foeCell(kit, kind, {
          ...common(),
          state: params.get('state') ? state : 'move',
          count: num('n', 30),
          live: true
        })
      ],
      cols: 1
    }
  if (!sheet && params.has('foe')) return { cells: [foeCell(kit, kind, { ...common(), live: true })], cols: 1 }
  return null
}
