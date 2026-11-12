/**
 * A deterministic fake View animated by time, for the HUD demo (`?hud-demo`, dev only) and unit tests.
 * It exercises every HUD element without the sim: anima burn and critical, paw swaps and cooldowns, hits,
 * KOs, radio, waves, the boss bar, PvP scores and a downed squad mate.
 */
import type { FoeKind } from '../../data/enemies'
import { ITEMS, type ItemId } from '../../data/items'
import { MISSIONS } from '../../data/missions'
import { SPECIES, type SpeciesId } from '../../data/species'
import type {
  FoeView,
  HandView,
  ModeId,
  PlayerStats,
  PlayerView,
  PropView,
  SimEvent,
  TeamId,
  V3,
  View
} from '../../sim/types'

const stats = (k: number): PlayerStats => ({
  kos: 3 + k * 2,
  assists: k,
  downs: k % 2,
  revives: (k + 1) % 3,
  damage: 800 + k * 230,
  taken: 120 + k * 15,
  spent: 210 + k * 30,
  gathered: 90 + k * 12,
  shots: 120,
  hits: 80,
  byItem: { bee: 40 + k * 5, orca: 70 - k * 10 }
})

const hand = (items: ItemId[], sel: number, t: number, cycle: number): HandView => {
  const phase = (t % cycle) / cycle
  return {
    items,
    sel,
    swap: phase < 0.05 ? 1 - phase / 0.05 : 0,
    act: phase > 0.5 && phase < 0.7 ? 'charge' : phase > 0.3 && phase < 0.4 ? 'cooldown' : 'idle',
    charge: phase > 0.5 && phase < 0.7 ? (phase - 0.5) / 0.2 : 0,
    cooldown: phase > 0.3 && phase < 0.4 ? (0.4 - phase) * 10 : 0,
    uses: Math.floor(t * 3),
    combo: Math.floor(t * 3) % 3,
    locks: items[sel] === 'swallow' ? [1, 2] : undefined
  }
}

function player(
  id: string,
  name: string,
  species: SpeciesId,
  team: TeamId,
  p: V3,
  t: number,
  k: number,
  r: ItemId[],
  l: ItemId[]
): PlayerView {
  const max = SPECIES[species].anima
  const wave = 0.5 + 0.5 * Math.sin(t * 0.35 + k)
  const anima = Math.max(0, max * (0.08 + 0.9 * wave))
  const rsel = Math.floor(t / 4 + k) % r.length
  const lsel = Math.floor(t / 6 + k) % l.length
  return {
    id,
    name,
    team,
    species,
    bot: id !== 'p1',
    p,
    v: [0, 0, 0],
    yaw: t * 0.2 + k,
    pitch: 0,
    shoulder: 1,
    anima,
    maxAnima: max,
    state: 'alive',
    timer: 0,
    revive: 0,
    invuln: false,
    grounded: true,
    move: 'run',
    hands: [hand(r, rsel, t + k, 4), hand(l, lsel, t + k * 2, 6)],
    passives: ['turtle', 'koala', 'koala', 'jelly'],
    passivesOnline: anima / max > 0.15,
    cloak: 0,
    revealed: false,
    burn: Math.max(0, Math.cos(t * 0.35 + k)) * max * 0.18,
    dashCooldown: 0,
    negateAt: -1,
    stats: stats(k)
  }
}

const foe = (id: number, kind: FoeKind, p: V3, t: number): FoeView => ({
  id,
  kind,
  p,
  yaw: 0,
  hp: 30 + ((id * 13 + t * 5) % 30),
  maxHp: 60,
  state: 'move',
  st: t % 1,
  revealed: id % 3 === 0,
  shielded: false
})

/** The demo view at time `t` (events left empty; see `demoEvents`). */
export function demoView(mode: ModeId, t: number): View {
  const ring = (i: number, r: number, speed = 0.15): V3 => [
    Math.cos(i * 1.7 + t * speed) * r,
    0,
    Math.sin(i * 1.7 + t * speed) * r + 6
  ]
  const players: PlayerView[] = [
    player('p1', 'ハヤテ', 'shiba', 0, [0, 0, 0], t, 0, ['orca', 'bee', 'owl', 'swallow'], ['bee', 'frog', 'gecko'])
  ]
  if (mode !== 'training') {
    players.push(
      player('bot1', 'ミケ', 'cat', 0, ring(1, 8), t, 1, ['claw', 'puffer'], ['gecko', 'frog']),
      player('bot2', 'ゴウ', 'bear', 0, ring(2, 10), t, 2, ['mammoth', 'wood'], ['armadillo']),
      player('bot3', 'モチ', 'hamster', 0, ring(3, 6), t, 3, ['humming'], ['honeyant', 'bat'])
    )
    const down = players[3]
    const cycle = t % 24
    if (cycle > 10 && cycle < 18) {
      down.state = 'down'
      down.timer = 18 - cycle
      down.anima = 0
      down.revive = cycle > 14 ? (cycle - 14) / 2 : 0
    } else if (cycle >= 18) {
      down.state = 'away'
      down.timer = 24 - cycle
      down.anima = 0
    }
  }
  if (mode === 'pvp') {
    const other: [string, SpeciesId][] = [
      ['コノハ', 'fox'],
      ['ペンタ', 'penguin'],
      ['ソラ', 'owl'],
      ['ユキ', 'rabbit']
    ]
    for (const team of [1, 2] as TeamId[]) {
      other.forEach(([name, sp], i) => {
        const k = team * 4 + i
        const pv = player(
          `e${k}`,
          `${name}${team === 2 ? 'Ⅱ' : ''}`,
          sp,
          team,
          ring(k, 18 + i * 4, 0.1),
          t,
          k,
          ['wood'],
          ['bee']
        )
        pv.revealed = i % 2 === 0
        players.push(pv)
      })
    }
  }
  const foes: FoeView[] =
    mode === 'pve'
      ? [
          foe(1, 'tsubute', ring(4, 14, 0.3), t),
          foe(2, 'tsubute', ring(5, 18, 0.3), t),
          foe(3, 'harigane', ring(6, 24, 0.2), t),
          foe(4, 'kagerou', ring(7, 12, 0.5), t),
          foe(5, 'oagos', ring(8, 30, 0.1), t),
          foe(6, 'tsubute', ring(9, 34, 0.3), t)
        ]
      : []
  const props: PropView[] = []
  if (mode === 'pve') {
    props.push({ id: 100, kind: 'lighthouse', p: [4, 0, -14], yaw: 0, team: 0, hp: 1400, maxHp: 2000, t })
  }
  if (mode === 'pvp') {
    props.push(
      { id: 200, kind: 'base', p: [0, 0, -40], yaw: 0, team: 0, r: 8, t },
      { id: 201, kind: 'base', p: [34, 0, 20], yaw: 0, team: 1, r: 8, t },
      { id: 202, kind: 'base', p: [-34, 0, 20], yaw: 0, team: 2, r: 8, t }
    )
  }
  const view: View = {
    tick: Math.floor(t * 60),
    time: t,
    mode,
    map: mode === 'pvp' ? 'arena' : mode === 'training' ? 'range' : 'oldtown',
    phase: t < 3 ? 'countdown' : 'play',
    clock: t < 3 ? 3 - t : mode === 'pvp' ? Math.max(0, 360 - (t - 3) * 4) : t - 3,
    players,
    foes,
    shots: [],
    props,
    shards: [],
    events: []
  }
  if (mode === 'pve') {
    const wave = 1 + (Math.floor(t / 20) % 5)
    view.pve = {
      mission: 'sakura',
      difficulty: 'normal',
      wave,
      waves: 5,
      next: t % 20 > 17 ? 20 - (t % 20) : 0,
      foesLeft: 24 - Math.floor(t % 20),
      tickets: 4,
      objective: { label: MISSIONS.sakura.objective.label, hp: 1400 - (t % 30) * 10, maxHp: 2000 },
      boss:
        wave >= 4
          ? { kind: 'kuitsukushi', name: 'クイツクシ', hp: 6000 - (t % 20) * 200, maxHp: 6000, phase: 1 }
          : undefined
    }
  }
  if (mode === 'pvp') {
    const k = Math.floor(t / 3)
    view.pvp = {
      scores: [k + 2, Math.floor(k * 0.8) + 3, Math.floor(k * 0.6)],
      lastSpurt: view.phase === 'play' && view.clock < 60,
      suddenDeath: false
    }
  }
  if (mode === 'training') {
    const step = Math.floor(t / 6) % 8
    view.training = {
      infinite: false,
      step,
      steps: 8,
      hint: TRAINING_HINTS[step]
    }
  }
  return view
}

const TRAINING_HINTS = [
  'WASDで移動してみよう',
  'マウスで周りを見渡そう',
  'Spaceでジャンプ。長押しで高く跳べる',
  'Shiftでダッシュ。アニマを少し使う',
  '左クリックで右手、右クリックで左手のアンティークを使う',
  'Q / Eで手のアンティークを切り替えよう',
  'アニマが尽きるとアーマーが崩壊する。回復を待とう',
  '倒れた仲間に近づいてFを長押しで救助'
]

let nextId = 1

/** Events that happened in (t0, t1] of the demo timeline. */
export function demoEvents(mode: ModeId, t0: number, t1: number, view: View): SimEvent[] {
  const out: SimEvent[] = []
  const every = (period: number, offset = 0) => Math.floor((t1 - offset) / period) > Math.floor((t0 - offset) / period)
  const me = 'p1'
  const foe = view.foes[Math.floor(t1) % Math.max(1, view.foes.length)]
  const enemy = view.players.find((p) => p.team !== 0)
  const target = foe?.id ?? enemy?.id ?? 'dummy'
  const at: V3 = foe?.p ?? enemy?.p ?? [0, 1, 8]
  const base = { t: t1 }
  if (t0 < 3 && t1 >= 3) out.push({ ...base, id: nextId++, type: 'phase', phase: 'play' })
  for (let n = 3; n >= 1; n--) if (t0 < 3 - n && t1 >= 3 - n) out.push({ ...base, id: nextId++, type: 'countdown', n })
  if (t1 < 3) return out
  if (every(0.45)) {
    out.push({
      ...base,
      id: nextId++,
      type: 'hit',
      target,
      targetKind: foe ? 'foe' : 'player',
      by: me,
      item: 'bee',
      amount: 10,
      at,
      head: every(1.8),
      surface: 'chitin'
    })
  }
  if (every(3.2, 1)) {
    out.push({ ...base, id: nextId++, type: 'ko', who: target, by: me, assists: ['bot1'], item: 'orca', points: 1 })
  }
  if (every(4.1, 2)) {
    const by = view.players[1]?.id ?? me
    out.push({ ...base, id: nextId++, type: 'ko', who: enemy?.id ?? 5, by, assists: [], item: 'puffer', points: 1 })
  }
  if (every(2.3, 0.5)) {
    const src = foe ?? enemy
    out.push({
      ...base,
      id: nextId++,
      type: 'hit',
      target: me,
      targetKind: 'player',
      by: src?.id ?? 1,
      amount: 6,
      at: [0, 1, 0],
      surface: 'fur'
    })
  }
  if (every(9, 4)) {
    const lines =
      mode === 'pvp'
        ? [{ who: 'ruri' as const, text: 'アオイ隊が中央の塔を押さえています！ 挟み撃ちに注意して！' }]
        : MISSIONS.sakura.waves.map((w) => w.radio!).filter(Boolean)
    const line = lines[Math.floor(t1 / 9) % lines.length]
    out.push({ ...base, id: nextId++, type: 'radio', who: line.who, text: line.text })
  }
  if (mode === 'pve' && every(20, 0.1)) {
    out.push({
      ...base,
      id: nextId++,
      type: 'wave',
      wave: view.pve?.wave ?? 1,
      waves: 5,
      boss: (view.pve?.wave ?? 1) >= 4
    })
  }
  if (mode === 'pvp' && t0 < 300 / 4 && t1 >= 300 / 4) out.push({ ...base, id: nextId++, type: 'lastSpurt' })
  if (every(4)) {
    const p = view.players[0]
    const item = p.hands[0].items[p.hands[0].sel]
    if (item && ITEMS[item]) out.push({ ...base, id: nextId++, type: 'swap', who: me, hand: 'R', item })
  }
  if (every(6.5, 3)) out.push({ ...base, id: nextId++, type: 'empty', who: me, hand: 'R' })
  return out
}
