/** What the controlled hero can do right now: the thing to interact with and the contextual key hints. Pure. */
import type { HeroView, PropView, StageInfo, View } from '../sim/types'
import { TILE, TILE_KINDS, type TileKind } from '../vocab'

export interface Target {
  x: number
  /** Top of the thing (bubble position). */
  y: number
  verb: string
  /** Key label when it is not a plain E press (valves are held). */
  key?: string
}

// Interaction ranges of the simulation (props.ts interact).
const REACH = 96

/** Height above the anchor where the interaction bubble sits. */
const TOPS: Record<string, number> = {
  pot: 46,
  barrel: 50,
  acorn: 84,
  cheese: 84,
  goldbell: 84,
  log: 42,
  lever: 40,
  valve: 44,
  chest: 42,
  sign: 46,
  npc: 58
}
const LIFTABLE = new Set(['pot', 'barrel'])
const GRIPPABLE = new Set(['acorn', 'cheese', 'goldbell', 'log'])
const PUSHABLE = new Set(['block', 'boulder', 'crate', 'bigcrate', 'iceblock'])
const ACCEPTORS = new Set(['pedestal', 'scale', 'hook', 'ramslot'])

/** A grippable set onto a filled acceptor has been delivered (placed on its centre); it can no longer be gripped. */
export function delivered(props: readonly PropView[], p: PropView): boolean {
  return props.some(
    (q) => ACCEPTORS.has(q.kind) && q.state === 'on' && Math.abs(q.x - p.x) <= 4 && Math.abs(q.y - p.y) <= 4
  )
}

export function controlled(view: View, myId: string): HeroView | undefined {
  const me = view.players.find((p) => p.id === myId)
  if (!me || me.ctrl < 0) return undefined
  return view.heroes.find((h) => h.slot === me.ctrl)
}

/** The nearest usable thing within reach of the hero (not while holding something). */
export function interactTarget(view: View, info: StageInfo | undefined, h: HeroView): Target | undefined {
  if (h.hold !== undefined || h.state === 'down' || h.state === 'tech' || h.state === 'fall') return undefined
  let best: Target | undefined
  let bd = REACH
  const consider = (x: number, y: number, top: number, verb: string, reach = REACH, key?: string) => {
    const d = Math.hypot(x - h.x, y - h.y)
    if (d < Math.min(bd, reach)) {
      bd = d
      best = { x, y: y - top, verb, key }
    }
  }
  for (const p of view.props) {
    const top = TOPS[p.kind] ?? 46
    if (LIFTABLE.has(p.kind) && p.state === 'idle') consider(p.x, p.y, top, '持ち上げる', 76)
    else if (GRIPPABLE.has(p.kind) && p.state !== 'lifted' && !delivered(view.props, p))
      consider(p.x, p.y, top, 'つかむ', 96)
    else if (p.kind === 'lever' && p.state === 'off') consider(p.x, p.y, top, '引く', 80)
    else if (p.kind === 'valve' && p.state === 'off') consider(p.x, p.y, top, 'バルブをまわす', 84, 'E長押し')
    else if (p.kind === 'chest' && p.state === 'closed') consider(p.x, p.y, top, 'あける', 80)
  }
  if (info) {
    for (const d of info.decor) if (d.kind === 'sign') consider(d.x, d.y, TOPS.sign, '読む', 84)
    for (const n of info.npcs) consider(n.x, n.y, TOPS.npc, '話す', 84)
  }
  return best
}

const gapKind = (k: TileKind | undefined) => !!k && ((!TILE_KINDS[k].walk && TILE_KINDS[k].air) || k === 'spikes')

/** Tile indices around the hero within `r` tiles (centre distance), calling `fn` until it returns true. */
function around(info: StageInfo, h: HeroView, r: number, fn: (i: number) => boolean): boolean {
  const tx = Math.floor(h.x / TILE)
  const ty = Math.floor(h.y / TILE)
  const n = Math.ceil(r)
  for (let dy = -n; dy <= n; dy++)
    for (let dx = -n; dx <= n; dx++) {
      const x = tx + dx
      const y = ty + dy
      if (x < 0 || y < 0 || x >= info.w || y >= info.h) continue
      if (Math.hypot(x * TILE + TILE / 2 - h.x, y * TILE + TILE / 2 - h.y) > TILE * r) continue
      if (fn(y * info.w + x)) return true
    }
  return false
}

/** True when a jumpable gap (water, pit, spikes) is within ~1.5 tiles. */
export function nearGap(info: StageInfo | undefined, h: HeroView, fills: readonly number[] = []): boolean {
  if (!info) return false
  return around(info, h, 1.4, (i) => !fills.includes(i) && gapKind(info.tiles[i]))
}

/** True when one of the stage's mouse holes is within ~1.6 tiles. */
export function nearHole(info: StageInfo | undefined, h: HeroView): boolean {
  if (!info?.holes?.length) return false
  const holes = new Set(info.holes.flat())
  return around(info, h, 1.6, (i) => holes.has(i))
}

/** The running current under the hero, if any (stopped channels do not count). */
export function currentAt(info: StageInfo | undefined, h: HeroView, off: readonly string[] = []) {
  if (!info?.currents) return undefined
  const i = Math.floor(h.y / TILE) * info.w + Math.floor(h.x / TILE)
  return info.currents.find((c) => !off.includes(c.channel) && c.tiles.includes(i))
}

/**
 * The running current under the hero or within `margin` px of its feet. A hero swept to the downstream rim of a channel
 * rests just outside its last tile, so the hint keeps showing while the current is still pulling on them.
 */
export function currentNear(
  info: StageInfo | undefined,
  h: HeroView,
  off: readonly string[] = [],
  margin = TILE * 0.25
) {
  if (!info?.currents) return undefined
  const at = (x: number, y: number) => {
    const tx = Math.floor(x / TILE)
    const ty = Math.floor(y / TILE)
    if (tx < 0 || ty < 0 || tx >= info.w || ty >= info.h) return undefined
    const i = ty * info.w + tx
    return info.currents!.find((c) => !off.includes(c.channel) && c.tiles.includes(i))
  }
  return (
    at(h.x, h.y) ?? at(h.x, h.y - margin) ?? at(h.x, h.y + margin) ?? at(h.x - margin, h.y) ?? at(h.x + margin, h.y)
  )
}

/** The wind zone the hero stands in, if any. */
export function windAt(info: StageInfo | undefined, h: HeroView) {
  const tx = h.x / TILE
  const ty = h.y / TILE
  return info?.winds?.find((z) => tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h)
}

export interface Hint {
  key: string
  text: string
  /** Emphasised (co-op prompts). */
  hot?: boolean
}

const SPECIES_ACTION: Record<string, string> = { slime: 'ジャンプ', rat: 'ダッシュ', crow: '羽ばたき', wolf: '遠吠え' }

/** Contextual hints for the HUD, most relevant first (at most four). */
export function hintsFor(view: View, info: StageInfo | undefined, myId: string): Hint[] {
  const h = controlled(view, myId)
  if (!h || view.phase !== 'play') return []
  const out: Hint[] = []
  const held = h.hold !== undefined ? view.props.find((p: PropView) => p.id === h.hold) : undefined
  const formSize = h.form !== undefined ? (view.formations[h.form]?.slots.length ?? 0) : 0
  if (held && LIFTABLE.has(held.kind)) {
    out.push({ key: 'クリック', text: '投げる' }, { key: 'E', text: 'おろす' })
  } else if (held) {
    out.push({ key: 'E', text: 'はなす' })
    if ((held.strength ?? 0) < (held.weight ?? 0))
      out.push({ key: '陣形', text: `あと${(held.weight ?? 0) - (held.strength ?? 0)}匹でもち上がる！`, hot: true })
  } else {
    const t = interactTarget(view, info, h)
    if (t) out.push({ key: t.key ?? 'E', text: t.verb })
  }
  if (h.state === 'push') {
    const block = view.props.find(
      (p) => PUSHABLE.has(p.kind) && (p.strength ?? 0) > 0 && (p.strength ?? 0) < (p.weight ?? 0)
    )
    if (block) out.push({ key: '陣形', text: 'みんなでおそう！', hot: true })
  }
  // Currents push walkers downstream unless they walk as a formation of three or more.
  const current = currentNear(info, h, view.currentsOff)
  if (current)
    out.push(
      current.strong
        ? { key: '水門', text: '流れが強すぎる！ 水門をひらいて止めよう', hot: true }
        : formSize >= 3
          ? { key: '陣形', text: '陣形なら流されない！' }
          : { key: '陣形', text: '陣形なら流されない', hot: true }
    )
  // Stage 3: wind, vents, lock doors and bells.
  if (view.species === 'crow') {
    const wind = windAt(info, h)
    if (wind)
      out.push(
        formSize >= 3
          ? { key: '陣形', text: '陣形なら風に負けない！' }
          : { key: '陣形', text: '陣形なら風に負けない', hot: true }
      )
    if (view.props.some((p) => p.kind === 'vent' && Math.hypot(p.x - h.x, p.y - h.y) < 110))
      out.push({ key: 'ベント', text: '上昇気流で回復' })
    const door = view.props.find(
      (p) => p.kind === 'lockdoor' && p.state === 'closed' && Math.hypot(p.x - h.x, p.y - h.y) < 140
    )
    if (door)
      out.push(
        view.party.keys > 0
          ? { key: 'カギ', text: 'カギで扉をあける（ふれる）', hot: true }
          : { key: 'カギ', text: 'カギをさがそう' }
      )
    const bell = view.props.find((p) => p.kind === 'bell' && Math.hypot(p.x - h.x, p.y - h.y) < 120)
    if (bell) out.push({ key: 'クリック', text: '鐘を鳴らす' }, { key: 'F', text: 'せーので同時に！', hot: true })
  }
  // Stage 4: moonstones, resonance, ice.
  if (view.species === 'wolf' && info) {
    const near = (kind: string, r: number, state?: string) =>
      view.props.find((p) => p.kind === kind && (!state || p.state === state) && Math.hypot(p.x - h.x, p.y - h.y) < r)
    if (near('bigmoon', 220, 'off')) out.push({ key: 'Space', text: 'ふたり同時に遠吠え＝共鳴', hot: true })
    else if (near('moonstone', 170, 'off')) out.push({ key: 'Space', text: '遠吠えで月石を灯す', hot: true })
    if (near('icewall', 200, 'idle')) out.push({ key: '協力技', text: '協力技で氷の壁をくだく', hot: true })
    if (info.tiles[Math.floor(h.y / TILE) * info.w + Math.floor(h.x / TILE)] === 'ice')
      out.push({ key: '氷', text: '氷の上はすべる' })
  }
  if (formSize && !held) out.push({ key: '長押し', text: '協力技！', hot: true })
  if (!held) {
    if (view.species === 'rat' && nearHole(info, h)) out.push({ key: 'Space', text: 'ネズミ穴へダッシュ', hot: true })
    else if (view.species === 'slime' && nearGap(info, h, view.fills)) out.push({ key: 'Space', text: 'ジャンプ' })
    else if (view.species === 'crow' && (nearGap(info, h, view.fills) || h.z > 1))
      out.push({ key: 'Space長押し', text: '飛ぶ' })
  }
  if ((h.snared ?? 0) > view.t) out.unshift({ key: 'ワナ', text: '仲間にワナをこわしてもらおう！', hot: true })
  const me = view.players.find((p) => p.id === myId)
  if (me && me.slots.length > 1 && out.length < 3) {
    out.push({ key: 'Q', text: h.mode === 'follow' ? '仲間に「待て」' : '仲間に「ついてこい」' })
    if (out.length < 4) out.push({ key: 'Tab', text: '操作キャラ交代' })
  }
  if (out.length < 3 && view.species !== 'slime' && !out.some((x) => x.key.startsWith('Space')))
    out.push({ key: 'Space', text: SPECIES_ACTION[view.species] ?? 'アクション' })
  return out.slice(0, 4)
}
