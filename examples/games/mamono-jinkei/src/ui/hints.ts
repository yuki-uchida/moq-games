/** What the controlled hero can do right now: the thing to interact with and the contextual key hints. Pure. */
import type { HeroView, PropView, StageInfo, View } from '../sim/types'
import { TILE, TILE_KINDS, type TileKind } from '../vocab'

export interface Target {
  x: number
  /** Top of the thing (bubble position). */
  y: number
  verb: string
}

// Interaction ranges of the simulation (props.ts interact).
const REACH = 96

/** Height above the anchor where the interaction bubble sits. */
const TOPS: Record<string, number> = { pot: 46, acorn: 84, lever: 40, chest: 42, sign: 46, npc: 58 }

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
  const consider = (x: number, y: number, top: number, verb: string, reach = REACH) => {
    const d = Math.hypot(x - h.x, y - h.y)
    if (d < Math.min(bd, reach)) {
      bd = d
      best = { x, y: y - top, verb }
    }
  }
  for (const p of view.props) {
    if (p.kind === 'pot' && p.state === 'idle') consider(p.x, p.y, TOPS.pot, '持ち上げる', 76)
    else if (p.kind === 'acorn' && p.state !== 'lifted') consider(p.x, p.y, TOPS.acorn, 'つかむ', 96)
    else if (p.kind === 'lever' && p.state === 'off') consider(p.x, p.y, TOPS.lever, '引く', 80)
    else if (p.kind === 'chest' && p.state === 'closed') consider(p.x, p.y, TOPS.chest, 'あける', 80)
  }
  if (info) {
    for (const d of info.decor) if (d.kind === 'sign') consider(d.x, d.y, TOPS.sign, '読む', 84)
    for (const n of info.npcs) consider(n.x, n.y, TOPS.npc, '話す', 84)
  }
  return best
}

const gapKind = (k: TileKind | undefined) => !!k && ((!TILE_KINDS[k].walk && TILE_KINDS[k].air) || k === 'spikes')

/** True when a jumpable gap (water, pit, spikes) is within ~1.5 tiles. */
export function nearGap(info: StageInfo | undefined, h: HeroView, fills: readonly number[] = []): boolean {
  if (!info) return false
  const tx = Math.floor(h.x / TILE)
  const ty = Math.floor(h.y / TILE)
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx
      const y = ty + dy
      if (x < 0 || y < 0 || x >= info.w || y >= info.h) continue
      const i = y * info.w + x
      if (fills.includes(i)) continue
      if (gapKind(info.tiles[i])) {
        const cx = x * TILE + TILE / 2
        const cy = y * TILE + TILE / 2
        if (Math.hypot(cx - h.x, cy - h.y) < TILE * 1.4) return true
      }
    }
  return false
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
  if (held?.kind === 'pot') {
    out.push({ key: 'クリック', text: '投げる' }, { key: 'E', text: 'おろす' })
  } else if (held) {
    out.push({ key: 'E', text: 'はなす' })
    if ((held.strength ?? 0) < (held.weight ?? 0))
      out.push({ key: '陣形', text: `あと${(held.weight ?? 0) - (held.strength ?? 0)}匹でもち上がる！`, hot: true })
  } else {
    const t = interactTarget(view, info, h)
    if (t) out.push({ key: 'E', text: t.verb })
  }
  if (h.state === 'push') {
    const block = view.props.find(
      (p) =>
        (p.kind === 'block' || p.kind === 'boulder') && (p.strength ?? 0) > 0 && (p.strength ?? 0) < (p.weight ?? 0)
    )
    if (block) out.push({ key: '陣形', text: 'みんなでおそう！', hot: true })
  }
  if (h.form !== undefined && !held) out.push({ key: '長押し', text: '協力技！', hot: true })
  if (!held && nearGap(info, h, view.fills))
    out.push({ key: 'Space', text: SPECIES_ACTION[view.species] ?? 'アクション' })
  const me = view.players.find((p) => p.id === myId)
  if (me && me.slots.length > 1 && out.length < 3) {
    out.push({ key: 'Q', text: h.mode === 'follow' ? '仲間に「待て」' : '仲間に「ついてこい」' })
    if (out.length < 4) out.push({ key: 'Tab', text: '操作キャラ交代' })
  }
  return out.slice(0, 4)
}
