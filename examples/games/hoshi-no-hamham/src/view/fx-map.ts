/**
 * The visual answer to every simulation event: particles from the `fx` sheet, camera trauma and kicks, hit-stop
 * and popups. The mapped type makes the compiler prove every `SimEventType` has an entry. State changes of props
 * and actors (a tree starting to fall, a ghost playing `defeat`) live in props.ts and actors.ts; this table is the
 * one-shot flourish on top.
 */
import type { SimEvent, SimEventType } from '../game/events'
import { TILE } from '../game/types'
import type { BurstOptions, FxName, SpawnOptions } from './fx'

/** What an effect may do to the view. */
export interface FxApi {
  spawn(name: FxName, x: number, y: number, o?: SpawnOptions): void
  burst(name: FxName, x: number, y: number, count: number, o?: BurstOptions): void
  /** Screen-shake trauma (0..1). */
  trauma(amount: number): void
  /** A short directional push of the camera, px. */
  kick(dx: number, dy: number): void
  /** Hit-stop: the simulation is not stepped for this long (effects keep playing). */
  freeze(seconds: number): void
  popup(text: string, x: number, y: number, color?: string): void
  flash(color?: string, alpha?: number, seconds?: number): void
  /** The red pulse of the hero getting hurt. */
  hurtPulse(): void
  /** View-only random number in [0, 1). */
  rand(): number
}

type Handler<K extends SimEventType> = (event: Extract<SimEvent, { type: K }>, view: FxApi) => void
export type FxMap = { [K in SimEventType]: Handler<K> }

const UP = -Math.PI / 2
const FAN = (center: number, width: number): [number, number] => [center - width / 2, center + width / 2]
const DEBRIS: BurstOptions = { gravity: 900, speed: [120, 260], angle: FAN(UP, 2.2), life: [0.45, 0.8], drag: 0.6 }

function confetti(view: FxApi, x: number, y: number, count: number) {
  const names: FxName[] = ['confettiA', 'confettiB', 'confettiC']
  for (let i = 0; i < count; i++)
    view.burst(names[i % 3], x, y, 1, {
      speed: [180, 360],
      angle: FAN(UP, 1.8),
      gravity: 260,
      drag: 1.6,
      life: [1.2, 2],
      layer: 'front',
      spread: 10
    })
}

export const FX_MAP: FxMap = {
  // ----- the hero
  jump: (e, v) => {
    v.spawn('dust', e.x - 8, e.y - 6, { vx: -30, vy: -10 })
    v.spawn('dust', e.x + 8, e.y - 6, { vx: 30, vy: -10, flip: true })
  },
  land: (e, v) => {
    if (e.speed < 260) return
    v.spawn('dust', e.x - 12, e.y - 6, { vx: -50, vy: -6 })
    v.spawn('dust', e.x + 12, e.y - 6, { vx: 50, vy: -6, flip: true })
    if (e.speed > 650) v.trauma(0.12)
  },
  drop: (e, v) => v.spawn('dust', e.x, e.y + 4, { vy: 20 }),
  bite: (e, v) => {
    v.spawn('chomp', e.x + e.dir * 4, e.y + 8, { flip: e.dir < 0, layer: 'front' })
    if (!e.hit) return
    v.spawn('spark', e.x + e.dir * 12, e.y, { layer: 'front' })
    v.burst('star', e.x + e.dir * 12, e.y, 3, {
      speed: [90, 170],
      angle: FAN(e.dir > 0 ? -0.6 : Math.PI + 0.6, 1.8),
      gravity: 300,
      life: [0.35, 0.55],
      layer: 'front'
    })
    v.kick(e.dir * 3, 0)
    v.freeze(0.04)
  },
  splash: (e, v) => {
    v.spawn('splash', e.x, e.y + 2, { layer: 'front' })
    v.burst('drop', e.x, e.y, e.enter ? 8 : 4, {
      speed: [80, 120 + Math.min(200, e.speed * 0.3)],
      angle: FAN(UP, 1.6),
      gravity: 800,
      life: [0.35, 0.7],
      layer: 'front'
    })
    if (e.enter)
      v.burst('bubble', e.x, e.y + 24, 3, { speed: [10, 30], angle: FAN(UP, 0.8), life: [0.6, 1.1], layer: 'front' })
  },
  hurt: (e, v) => {
    v.freeze(0.1)
    v.trauma(0.35)
    v.kick(e.dir * 4, -2)
    v.hurtPulse()
    v.spawn('spark', e.x, e.y, { layer: 'front' })
    v.burst('star', e.x, e.y - 10, 4, {
      speed: [100, 180],
      angle: FAN(UP, 2.4),
      gravity: 400,
      life: [0.4, 0.6],
      layer: 'front'
    })
  },
  respawn: (e, v) => {
    v.spawn('puff', e.x, e.y - 24)
    v.burst('sparkle', e.x, e.y - 24, 4, { speed: [30, 70], life: [0.3, 0.5] })
  },
  dead: (e, v) => {
    v.trauma(0.6)
    v.flash('#ffffff', 0.5, 0.3)
    v.burst('star', e.x, e.y, 6, { speed: [120, 220], gravity: 300, life: [0.6, 0.9], layer: 'front' })
    v.spawn('smoke', e.x, e.y, { vy: -20 })
  },
  pickup: (e, v) => {
    v.burst('sparkle', e.x, e.y, 6, { speed: [40, 110], life: [0.3, 0.5], layer: 'front' })
    if (e.kind === 'fruit' || e.kind === 'star') {
      v.burst('heart', e.x, e.y, e.kind === 'star' ? 3 : 1, {
        speed: [30, 60],
        angle: FAN(UP, 0.9),
        drag: 1,
        life: [0.7, 0.9],
        layer: 'front'
      })
      v.popup(e.kind === 'star' ? '+2' : '+1', e.x, e.y - 20, e.kind === 'star' ? '#ffd45e' : '#ff9aa4')
    } else v.popup(`${e.count ?? 0}/${e.need ?? 0}`, e.x, e.y - 20, '#a4f29a')
  },
  // ----- gimmicks
  dig: (e, v) => {
    const x = e.tx * TILE + TILE / 2
    const y = e.ty * TILE + TILE / 2
    v.burst('clod', x, y, e.primary ? 6 : 3, { ...DEBRIS, spread: 16 })
    v.spawn('dust', x, y + 8, { rate: e.primary ? 1 : 1.3 })
    if (e.primary) v.trauma(0.12)
  },
  chop: (e, v) => {
    v.burst('chip', e.x - e.dir * 6, e.y + 10, 5, { ...DEBRIS, angle: FAN(e.dir > 0 ? -0.7 : Math.PI + 0.7, 1.4) })
    v.burst('leaf', e.x, e.y - TILE, 4, { speed: [20, 60], gravity: 60, drag: 1.2, life: [1, 1.6], spread: 24 })
    v.kick(e.dir * 2, 0)
  },
  'tree-fall': (e, v) => {
    v.burst('leaf', e.x, e.y - TILE, 6, { speed: [20, 80], gravity: 60, drag: 1.2, life: [1.2, 1.8], spread: 30 })
  },
  'tree-land': (e, v) => {
    for (let i = 0; i < e.length; i++)
      v.burst('dust', (e.tx + i) * TILE + TILE / 2, e.ty * TILE + TILE - 4, 2, {
        speed: [30, 70],
        angle: FAN(UP, 2.6),
        life: [0.3, 0.4],
        spread: 14
      })
    const crown = (e.dir > 0 ? e.tx + e.length - 0.5 : e.tx + 0.5) * TILE
    v.burst('leaf', crown, e.ty * TILE + 16, 10, {
      speed: [60, 160],
      angle: FAN(UP, 2.4),
      gravity: 120,
      drag: 1.4,
      life: [1.2, 2],
      layer: 'front'
    })
    v.burst('chip', crown, e.ty * TILE + 24, 4, DEBRIS)
    v.trauma(0.4)
  },
  'pipe-burst': (e, v) => {
    v.spawn('splash', e.x, e.y - 20, { layer: 'front' })
    v.burst('drop', e.x, e.y - 28, 10, {
      speed: [140, 260],
      angle: FAN(UP, 1.2),
      gravity: 700,
      life: [0.5, 0.9],
      layer: 'front'
    })
    v.spawn('spark', e.x, e.y - 24)
    v.trauma(0.2)
  },
  'hive-break': (e, v) => {
    v.burst('honey', e.x, e.y + 12, 6, { speed: [20, 70], angle: FAN(Math.PI / 2, 1.6), gravity: 420, life: [0.6, 1] })
    v.spawn('anger', e.x + 18, e.y - 30, { vy: -16, life: 0.9, layer: 'front' })
    v.burst('chip', e.x, e.y, 3, DEBRIS)
    v.trauma(0.15)
  },
  sting: (e, v) => {
    v.spawn('spark', e.x, e.y, { rate: 1.4 })
    v.spawn('star', e.x, e.y - 8, { vy: -60, gravity: 200, life: 0.4 })
  },
  'animal-wake': (e, v) => {
    v.spawn('alert', e.x, e.y - 44, { vy: -10, life: 0.8, layer: 'front' })
    v.burst('dust', e.x - e.dir * 20, e.y + 24, 3, {
      speed: [30, 70],
      angle: FAN(e.dir > 0 ? Math.PI : 0, 0.8),
      life: [0.3, 0.4]
    })
  },
  'animal-done': (e, v) => {
    v.spawn('puff', e.x, e.y + 8)
    v.spawn('dust', e.x, e.y + 24)
  },
  'rock-crack': (e, v) => {
    v.burst('shard', e.x, e.y, 4, DEBRIS)
    v.spawn('dust', e.x, e.y + 16)
    v.spawn('spark', e.x, e.y)
    v.kick(0, 2)
  },
  'rock-break': (e, v) => {
    v.burst('shard', e.x, e.y, 10, { ...DEBRIS, spread: 14 })
    v.burst('dust', e.x, e.y + 16, 3, { speed: [30, 70], life: [0.3, 0.4] })
    v.spawn('smoke', e.x, e.y, { vy: -20 })
    v.trauma(0.3)
    v.freeze(0.04)
  },
  switch: (e, v) => {
    v.spawn('shine', e.x + 6, e.y - 10, { layer: 'front' })
    v.spawn('ring', e.x, e.y)
    v.burst('sparkle', e.x, e.y, 5, { speed: [40, 100], life: [0.3, 0.5], layer: 'front' })
  },
  'door-open': (e, v) => {
    for (let i = 0; i < e.w; i++)
      v.burst('dust', e.x + i * TILE + TILE / 2, e.y + e.h * TILE - 6, 3, {
        speed: [30, 90],
        angle: FAN(UP, 2.8),
        life: [0.35, 0.5],
        spread: 18
      })
    v.trauma(0.2)
  },
  spawn: (e, v) => {
    v.burst('sparkle', e.x, e.y, 4, { speed: [30, 80], life: [0.3, 0.5], layer: 'front' })
    v.spawn('puff', e.x, e.y, { rate: 1.4 })
  },
  'princess-free': (e, v) => {
    v.burst('heart', e.x, e.y - 10, 5, {
      speed: [40, 90],
      angle: FAN(UP, 1.4),
      drag: 1.2,
      life: [0.9, 1.3],
      layer: 'front'
    })
    v.burst('sparkle', e.x, e.y, 8, { speed: [60, 140], life: [0.4, 0.6], layer: 'front' })
    v.burst('shard', e.x, e.y, 5, DEBRIS)
  },
  'goal-open': (e, v) => {
    v.spawn('ring', e.x, e.y, { layer: 'front' })
    v.burst('sparkle', e.x, e.y, 12, { speed: [60, 160], life: [0.4, 0.7], layer: 'front' })
    v.spawn('arrow', e.x, e.y - 84, { life: 4, layer: 'front' })
  },
  clear: (e, v) => {
    confetti(v, e.x, e.y - 20, 30)
    v.burst('star', e.x, e.y - 20, 8, { speed: [120, 240], gravity: 260, life: [0.6, 1], layer: 'front' })
    v.flash('#fff7d6', 0.35, 0.3)
  },
  // ----- enemies
  'enemy-hit': (e, v) => {
    v.spawn('spark', e.x, e.y, { layer: 'front' })
    v.burst('star', e.x, e.y - 8, 2, { speed: [80, 140], angle: FAN(UP, 1.6), gravity: 300, life: [0.3, 0.5] })
    v.kick(e.dir * 2, 0)
  },
  'enemy-down': (e, v) => {
    v.freeze(0.07)
    v.spawn('puff', e.x, e.y, { rate: 1.2 })
    v.burst('star', e.x, e.y - 6, 4, {
      speed: [100, 200],
      angle: FAN(UP, 2.2),
      gravity: 380,
      life: [0.4, 0.7],
      layer: 'front'
    })
    v.trauma(0.18)
  },
  hop: (e, v) => v.spawn('dust', e.x, e.y - 6, { rate: 1.3 }),
  spit: (e, v) => v.spawn('smoke', e.x + e.dir * 14, e.y, { vx: e.dir * 30, rate: 1.6 }),
  'shot-hit': (e, v) => {
    if (e.kind === 'shock')
      v.burst('dust', e.x, e.y + 10, 3, { speed: [30, 80], angle: FAN(UP, 2.4), life: [0.3, 0.45] })
    else {
      v.spawn('spark', e.x + 7, e.y + 7, { rate: 1.4 })
      v.burst(e.kind === 'rock' ? 'shard' : 'chip', e.x + 7, e.y + 7, 3, DEBRIS)
    }
  },
  // ----- bosses
  'boss-awake': (e, v) => {
    v.trauma(0.45)
    v.spawn('ring', e.x, e.y, { layer: 'front' })
    v.spawn('anger', e.x + 24, e.y - 56, { vy: -14, life: 1, layer: 'front' })
  },
  'boss-state': (e, v) => {
    if (e.state === 'windup') {
      v.spawn('shine', e.x + e.dir * 14, e.y - 28, { layer: 'front' })
      v.burst('dust', e.x - e.dir * 20, e.y + 30, 2, { speed: [20, 60], angle: FAN(UP, 2), life: [0.3, 0.4] })
    } else if (e.state === 'stunned')
      v.burst('star', e.x, e.y - 30, 3, { speed: [60, 120], angle: FAN(UP, 1.6), gravity: 200, life: [0.4, 0.6] })
    else if (e.state === 'tired') v.spawn('sweat', e.x + 20, e.y - 30, { vy: -10, life: 0.8 })
  },
  'boss-attack': (e, v) => {
    if (e.attack === 'charge' || e.attack === 'dash')
      v.burst('dust', e.x - e.dir * 30, e.y + 30, 4, {
        speed: [60, 140],
        angle: FAN(e.dir > 0 ? Math.PI : 0, 0.9),
        life: [0.3, 0.5]
      })
    else if (e.attack === 'dive')
      v.burst('feather', e.x, e.y, 3, { speed: [30, 80], gravity: 80, drag: 1.4, life: [0.8, 1.2] })
    else if (e.attack === 'leap')
      v.burst('dust', e.x, e.y + 30, 5, { speed: [50, 120], angle: FAN(UP, 2.6), life: [0.3, 0.5] })
    else {
      v.spawn('ring', e.x, e.y, { layer: 'front' })
      v.burst('sparkle', e.x, e.y, 6, { speed: [60, 120], life: [0.3, 0.5], layer: 'front' })
    }
  },
  'boss-shoot': (e, v) => {
    v.spawn('smoke', e.x, e.y, { rate: 1.5 })
    v.burst('sparkle', e.x, e.y, Math.min(6, e.count + 1), { speed: [60, 120], life: [0.2, 0.35] })
  },
  'boss-slam': (e, v) => {
    v.spawn('ring', e.x, e.y - 8, { layer: 'front' })
    v.burst('dust', e.x, e.y - 6, 8, { speed: [80, 180], angle: FAN(UP, 3), life: [0.35, 0.55], spread: 12 })
    v.burst('clod', e.x, e.y - 6, 6, DEBRIS)
    v.trauma(0.7)
  },
  shock: (e, v) => v.spawn('dust', e.x + e.dir * 20, e.y - 6, { vx: e.dir * 40 }),
  'boss-crash': (e, v) => {
    v.burst('star', e.x + e.dir * 24, e.y - 20, 6, {
      speed: [100, 200],
      gravity: 300,
      life: [0.5, 0.8],
      layer: 'front'
    })
    v.spawn('ring', e.x + e.dir * 30, e.y, { layer: 'front' })
    v.burst('shard', e.x + e.dir * 30, e.y, 4, DEBRIS)
    v.trauma(0.6)
    v.freeze(0.06)
  },
  'boss-hit': (e, v) => {
    v.spawn('spark', e.x, e.y, { layer: 'front' })
    v.burst('star', e.x, e.y - 10, e.weak ? 6 : 3, {
      speed: [100, 200],
      angle: FAN(UP, 2.4),
      gravity: 300,
      life: [0.4, 0.6],
      layer: 'front'
    })
    v.freeze(0.06)
    v.trauma(e.weak ? 0.35 : 0.2)
    if (e.weak) v.popup('ナイス！', e.x, e.y - 50, '#ffd45e')
  },
  'boss-phase': (e, v) => {
    v.flash('#ffffff', 0.7, 0.35)
    v.spawn('ring', e.x, e.y, { layer: 'front' })
    v.spawn('ring', e.x, e.y, { layer: 'front', delay: 0.15 })
    v.spawn('boom', e.x, e.y, { layer: 'front' })
    v.spawn('anger', e.x + 26, e.y - 60, { vy: -14, life: 1, layer: 'front' })
    v.trauma(0.6)
  },
  'boss-tired': (e, v) => {
    v.burst('sweat', e.x, e.y - 30, 3, { speed: [30, 60], angle: FAN(UP, 1.6), gravity: 120, life: [0.6, 0.9] })
    v.spawn('smoke', e.x, e.y - 10, { vy: -20 })
  },
  'boss-down': (e, v) => {
    v.freeze(0.45)
    v.flash('#ffffff', 0.6, 0.4)
    v.trauma(0.8)
    for (let i = 0; i < 5; i++)
      v.spawn('boom', e.x + (v.rand() - 0.5) * 80, e.y + (v.rand() - 0.5) * 70, {
        layer: 'front',
        delay: 0.12 + i * 0.16
      })
    v.burst('star', e.x, e.y, 10, { speed: [140, 260], gravity: 300, life: [0.7, 1.1], layer: 'front' })
  },
  minion: (e, v) => {
    v.spawn('puff', e.x, e.y)
    v.burst('sparkle', e.x, e.y, 3, { speed: [40, 80], life: [0.3, 0.4] })
  },
  'gate-up': (e, v) => {
    v.burst('dust', e.tx * TILE + TILE / 2, (e.bottom + 1) * TILE - 6, 6, {
      speed: [40, 120],
      angle: FAN(UP, 2.8),
      life: [0.35, 0.5],
      spread: 20
    })
    v.trauma(0.35)
  },
  'gate-down': (e, v) => {
    for (let ty = e.top; ty <= e.bottom; ty++)
      v.burst('sparkle', e.tx * TILE + TILE / 2, ty * TILE + TILE / 2, 3, {
        speed: [30, 90],
        life: [0.4, 0.7],
        spread: 20,
        layer: 'front'
      })
  }
}

/** Plays the visual answer to one event. */
export function playFx(event: SimEvent, view: FxApi) {
  ;(FX_MAP[event.type] as (event: SimEvent, view: FxApi) => void)(event, view)
}
