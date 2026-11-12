/**
 * Review cells for the bosses.
 *
 *   ?boss=goutetsu&state=windup&attack=sweep&st=0.5&parts=800,0,800,0&hp=0.5&angle=30   (one live boss)
 *   ?sheet=bosses                                  both bosses, a few key states
 *   ?sheet=boss-states&boss=kuitsukushi|goutetsu   every state / attack / part condition (static, labelled)
 *   ?sheet=boss-views&boss=…&state=…&parts=…       six angles of one pose
 *   ?sheet=boss-walk&boss=goutetsu                 eight phases of the walk cycle (angle=90 side view)
 *   ?sheet=boss-seq&boss=…&state=dying&sts=0.1,0.3,0.6,1.5   a state played from idle up to each st
 *   (+ t=global time, zoom=, cy= camera height fraction, elev= camera elevation (rad))
 */
import * as THREE from 'three'
import { FOES, type FoeAttack } from '../data/enemies'
import type { FoeAnim, ModelKit } from '../models/api'
import type { FoeState } from '../sim/types'
import { fitCamera, num, params, stage, type Cell } from './stage'

type BossKind = 'kuitsukushi' | 'goutetsu'

export interface BossCellOpts {
  state?: FoeState
  attack?: FoeAttack
  st?: number
  hp?: number
  parts?: number[]
  angle?: number
  speed?: number
  /** Seconds simulated before the first frame (walk cycle phases). */
  warm?: number
  /** Play the state from st = 0 up to `st` after settling in this prior state (sequence sheets). */
  from?: FoeState
  live?: boolean
  label?: string
  sub?: string
}

/** Camera size and centre (fractions of the height) per boss. */
const FRAME: Record<BossKind, [number, number]> = { kuitsukushi: [1.75, 0.45], goutetsu: [1.45, 0.45] }

export function bossCell(kit: ModelKit, kind: BossKind, o: BossCellOpts = {}): Cell {
  const def = FOES[kind]
  const scene = stage(def.radius * 2.8)
  const boss = kit.createBoss(kind)
  boss.root.traverse((obj) => {
    obj.castShadow = true
    obj.receiveShadow = true
  })
  const holder = new THREE.Group()
  holder.rotation.y = ((o.angle ?? 30) * Math.PI) / 180
  holder.add(boss.root)
  scene.add(holder)
  const state = o.state ?? 'idle'
  const atk = o.attack ?? (state === 'windup' || state === 'attack' ? def.attacks[0]?.id : undefined)
  const windup = def.attacks.find((a) => a.id === atk)?.windup ?? 1
  const loop =
    (state === 'windup' ? windup : state === 'attack' ? 1.5 : state === 'stagger' ? 8 : state === 'dying' ? 3 : 1) + 0.6
  const anim: FoeAnim = {
    state,
    st: 0,
    time: 0,
    speed: o.speed ?? (state === 'move' ? def.speed : 0),
    seed: 0.4,
    hpFrac: o.hp ?? 1,
    attack: atk,
    parts: o.parts
  }
  let st = o.st ?? (state === 'windup' ? windup * 0.75 : 0.3)
  let time = num('t', 1.3)
  // Settle smoothed motion before the first frame.
  const settle = 90 + Math.round((o.warm ?? 0) * 60)
  if (o.from) {
    // Settle in the prior state, then play this one in real time up to st.
    const target = anim.state
    anim.state = o.from
    // From a wind-up: hold its last moment (strike sequences); otherwise settle the prior state.
    anim.attack = o.from === 'windup' ? atk : undefined
    for (let i = 0; i < 90; i++) {
      anim.st = o.from === 'windup' ? Math.max(0, windup - 0.15) + (i / 90) * 0.15 : 1 + i / 60
      anim.time = time + i / 60
      boss.update(1 / 60, anim)
    }
    anim.state = target
    anim.attack = atk
    const n = Math.round(st * 60)
    for (let i = 0; i <= n; i++) {
      anim.st = i / 60
      anim.time = time + (90 + i) / 60
      boss.update(1 / 60, anim)
    }
  } else
    for (let i = 0; i < settle; i++) {
      anim.st = st
      anim.time = time + i / 60
      boss.update(1 / 60, anim)
    }
  time += settle / 60
  const [size, cy] = FRAME[kind]
  const zoom = num('zoom', 1)
  const camera = fitCamera((def.height * size) / zoom, def.height * num('cy', cy), 1.05, num('elev', 0.16))
  camera.far = 400
  camera.updateProjectionMatrix()
  const parts = o.parts?.length ? ` [${o.parts.join(',')}]` : ''
  return {
    scene,
    camera,
    label: o.label ?? `${def.name}（${kind}）`,
    sub:
      o.sub ??
      `${state}${atk && state !== 'idle' && state !== 'move' ? ` ${atk}` : ''} st ${st.toFixed(2)}${parts}${
        o.hp !== undefined && o.hp < 1 ? ` hp ${o.hp}` : ''
      }`,
    step(dt) {
      // Sequence cells are frozen at their moment.
      if (o.from) return
      time += dt
      if (o.live) st = (st + dt) % loop
      anim.st = st
      anim.time = time
      boss.update(dt, anim)
    }
  }
}

const KUI_STATES: BossCellOpts[] = [
  { state: 'idle', parts: [0, 1] },
  { state: 'idle', parts: [1, 1] },
  { state: 'idle', parts: [0, 2], hp: 0.5 },
  { state: 'idle', parts: [1, 3], hp: 0.2 },
  { state: 'windup', attack: 'slam', st: 0.5, parts: [0, 1] },
  { state: 'windup', attack: 'slam', st: 1.05, parts: [0, 1] },
  { state: 'recover', attack: 'slam', st: 0.06, parts: [0, 1] },
  { state: 'recover', attack: 'slam', st: 0.3, parts: [0, 1] },
  { state: 'windup', attack: 'acidRain', st: 1.3, parts: [0, 1] },
  { state: 'recover', attack: 'acidRain', st: 0.08, parts: [0, 1] },
  { state: 'windup', attack: 'summon', st: 1.1, parts: [0, 2], hp: 0.5 },
  { state: 'recover', attack: 'summon', st: 0.1, parts: [0, 2], hp: 0.5 },
  { state: 'spawn', st: 0.15, parts: [0, 1] },
  { state: 'spawn', st: 0.45, parts: [0, 1] },
  { state: 'stagger', st: 0.3, parts: [0, 1] },
  { state: 'dying', st: 0.5, parts: [0, 3], hp: 0 },
  { state: 'dying', st: 3, parts: [0, 3], hp: 0 },
  { state: 'windup', attack: 'slam', st: 0.9, parts: [1, 3], hp: 0.2 }
]

const L = 800
const GOU_STATES: BossCellOpts[] = [
  { state: 'idle', parts: [L, L, L, L] },
  { state: 'move', parts: [L, L, L, L] },
  { state: 'move', parts: [L, L, 0, L], hp: 0.8 },
  { state: 'idle', parts: [L, 300, 500, 120], hp: 0.7 },
  { state: 'windup', attack: 'missile', st: 0.8, parts: [L, L, L, L] },
  { state: 'recover', attack: 'missile', st: 0.1, parts: [L, L, L, L] },
  { state: 'windup', attack: 'sweep', st: 1.2, parts: [L, L, L, L] },
  { state: 'attack', attack: 'sweep', st: 0.3, parts: [L, L, L, L] },
  { state: 'attack', attack: 'sweep', st: 1.3, parts: [L, L, L, L] },
  { state: 'windup', attack: 'stomp', st: 0.8, parts: [L, L, L, L] },
  { state: 'recover', attack: 'stomp', st: 0.06, parts: [L, L, L, L] },
  { state: 'stagger', st: 1, parts: [0, L, 0, L], hp: 0.5 },
  { state: 'stagger', st: 6, parts: [L, 0, 0, L], hp: 0.5 },
  { state: 'spawn', st: 0.2, parts: [L, L, L, L] },
  { state: 'spawn', st: 0.6, parts: [L, L, L, L] },
  { state: 'dying', st: 0.5, parts: [L, L, L, L], hp: 0 },
  { state: 'dying', st: 3, parts: [0, L, L, L], hp: 0 },
  { state: 'move', parts: [L, 0, L, L], hp: 0.4, speed: 0.4 }
]

export function bossCells(kit: ModelKit, sheet: string | null): { cells: Cell[]; cols: number } | null {
  const common = (): BossCellOpts => ({
    state: (params.get('state') ?? 'idle') as FoeState,
    attack: (params.get('attack') as FoeAttack | null) ?? undefined,
    st: params.has('st') ? num('st', 0) : undefined,
    hp: num('hp', 1),
    parts: params.get('parts')?.split(',').map(Number),
    angle: num('angle', 30)
  })
  const kind = (params.get('boss') as BossKind | null) ?? 'kuitsukushi'
  if (sheet === 'bosses')
    return {
      cells: [
        bossCell(kit, 'kuitsukushi', { state: 'idle', parts: [0, 1] }),
        bossCell(kit, 'kuitsukushi', { state: 'idle', parts: [1, 3], hp: 0.3 }),
        bossCell(kit, 'goutetsu', { state: 'move', parts: [800, 800, 800, 800] }),
        bossCell(kit, 'goutetsu', { state: 'stagger', parts: [0, 800, 0, 800], hp: 0.5 })
      ],
      cols: 2
    }
  if (sheet === 'boss-states') {
    const list = kind === 'goutetsu' ? GOU_STATES : KUI_STATES
    return { cells: list.map((o) => bossCell(kit, kind, { angle: num('angle', 30), ...o })), cols: 6 }
  }
  if (sheet === 'boss-walk') {
    const o = { ...common(), state: 'move' as FoeState, angle: num('angle', 90) }
    const cycle = 2.4 / (FOES[kind].speed * 0.75)
    const cells = [0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
      bossCell(kit, kind, { ...o, warm: (k / 8) * cycle, sub: `walk ${k}/8` })
    )
    return { cells, cols: 4 }
  }
  if (sheet === 'boss-seq') {
    const o = common()
    const sts = (params.get('sts') ?? '0.1,0.2,0.3,0.45,0.6,0.8,1.2,2').split(',').map(Number)
    const from = (params.get('from') ?? 'idle') as FoeState
    return { cells: sts.map((st) => bossCell(kit, kind, { ...o, st, from })), cols: 4 }
  }
  if (sheet === 'boss-views') {
    const o = common()
    return { cells: [0, 60, 120, 180, 240, 300].map((angle) => bossCell(kit, kind, { ...o, angle })), cols: 3 }
  }
  if (!sheet && params.get('boss')) return { cells: [bossCell(kit, kind, { ...common(), live: true })], cols: 1 }
  return null
}
