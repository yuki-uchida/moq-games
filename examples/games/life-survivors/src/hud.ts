/**
 * HUD logic that does not touch the DOM: the fx -> sound mapping, the banner queue, the level-up card
 * rarity, the boss bar model. main.ts wires these to the page; tests/hud.test.ts drives them directly.
 */
import { ENEMIES, ITEM_KINDS, MAX_WEAPON_LEVEL, WEAPONS, WEAPON_BY_ID } from './data'
import { FX, FX_STRIDE } from './fx'
import type { PlayOptions, SfxName } from './audio'
import { STRIDE } from './view'

export interface FxEv {
  seq: number
  type: number
  x: number
  y: number
  a: number
  b: number
}

/** What the mapping needs from LifeAudio (a fake in tests). */
export interface SoundSink {
  play(name: SfxName, options?: PlayOptions): void
  fire(weaponId: string, options?: PlayOptions & { evolved?: boolean }): void
}

export interface FxContext {
  /** Index of the local player in View.players, -1 when spectating. */
  localIndex: number
  x: number
  y: number
  /** Whether the local player's weapon is evolved (for the fire layer). */
  evolved(weaponId: string): boolean
}

/** Per-game memory of what has been consumed. */
export class FxTracker {
  last = -1
  level = 0
  reset() {
    this.last = -1
    this.level = 0
  }

  /** Events not seen before, oldest first. A seq that went backwards means a new game started. */
  take(fx: number[]): FxEv[] {
    const out: FxEv[] = []
    if (!fx.length) return out
    const newest = fx[fx.length - FX_STRIDE]
    if (newest < this.last) this.reset()
    for (let i = 0; i < fx.length; i += FX_STRIDE) {
      const seq = fx[i]
      if (seq <= this.last) continue
      out.push({ seq, type: fx[i + 1], x: fx[i + 2], y: fx[i + 3], a: fx[i + 4], b: fx[i + 5] })
    }
    this.last = newest
    return out
  }
}

export const PAN_RANGE = 640
export const NEAR_SHOT = 600
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function panFor(x: number, localX: number) {
  return clamp((x - localX) / PAN_RANGE, -1, 1)
}
/** Quieter with distance, never below a quarter. */
export function gainFor(x: number, y: number, ctx: Pick<FxContext, 'x' | 'y'>) {
  return Math.max(0.25, 1 - Math.hypot(x - ctx.x, y - ctx.y) / 900)
}

/** Plays the sound(s) of one fx event. `tracker` makes LEVELUP fire once per new team level. */
export function soundForFx(e: FxEv, ctx: FxContext, sink: SoundSink, tracker: FxTracker) {
  const spectating = ctx.localIndex < 0
  const mine = (index: number) => !spectating && index === ctx.localIndex
  const pan = spectating ? 0 : panFor(e.x, ctx.x)
  const near = spectating ? 0.6 : gainFor(e.x, e.y, ctx)
  const dist = Math.hypot(e.x - ctx.x, e.y - ctx.y)
  switch (e.type) {
    case FX.KILL:
      sink.play(e.b & 1 ? 'killElite' : 'kill', { pan, gain: near })
      break
    case FX.HIT:
      sink.play(e.b & 2 ? 'crit' : e.b & 1 ? 'hitStrong' : 'hit', { pan, gain: near })
      break
    case FX.FIRE: {
      const def = WEAPONS[e.a]
      if (def && mine(e.b)) sink.fire(def.id, { evolved: ctx.evolved(def.id), pan: 0 })
      break
    }
    case FX.HURT:
      if (mine(e.a)) sink.play('hurt', { gain: clamp(0.65 + e.b / 40, 0.65, 1) })
      break
    case FX.GEM:
      if (mine(e.b)) sink.play('gem', { pan: 0 })
      break
    case FX.EVOLVE:
      sink.play('evolve', mine(e.b) ? {} : { pan, gain: 0.35 })
      break
    case FX.CHEST:
      sink.play('chest', mine(e.b) ? {} : { pan, gain: 0.35 })
      break
    case FX.LEVELUP:
      if (e.a > tracker.level) {
        tracker.level = e.a
        sink.play('levelUp')
      }
      break
    case FX.ITEM:
      if (mine(e.b) || spectating || dist < NEAR_SHOT)
        sink.play(ITEM_KINDS[e.a] === 'magnet' ? 'magnet' : 'meal', mine(e.b) ? {} : { pan, gain: 0.5 })
      break
    case FX.DOWN:
      sink.play('down', { pan, gain: near })
      break
    case FX.REVIVE:
      sink.play('revive', { pan, gain: near })
      break
    case FX.STAGE:
      sink.play('stage')
      break
    case FX.SWARM:
      sink.play('swarm')
      break
    case FX.BLAST:
      sink.play('blast', { pan, gain: near })
      break
    case FX.ENEMY_SHOT:
      if (spectating || dist <= NEAR_SHOT) sink.play('enemyShot', { pan, gain: near })
      break
    case FX.WINDUP:
      if (spectating || dist <= NEAR_SHOT) sink.play('windup', { pan, gain: near })
      break
    case FX.ELITE:
      sink.play('elite', { pan, gain: near })
      break
    case FX.BOSS_SPAWN:
      sink.play('bossWarn')
      break
    case FX.BOSS_KILL:
      sink.play('bossKill')
      break
  }
}

export function consumeFx(fx: number[], tracker: FxTracker, ctx: FxContext, sink: SoundSink): FxEv[] {
  const events = tracker.take(fx)
  for (const e of events) soundForFx(e, ctx, sink, tracker)
  return events
}

/** The stinger for entering a new phase, if any. */
export function phaseCue(previous: string | undefined, next: string): SfxName | undefined {
  if (previous === next) return undefined
  return next === 'reaper' ? 'reaper' : next === 'won' ? 'won' : next === 'lost' ? 'lost' : undefined
}

/** 0 = silent, 1 = hp near zero. Only while the local player is alive and playing. */
export function heartbeatLevel(hp: number, maxHp: number, alive: boolean, playing: boolean) {
  if (!alive || !playing || maxHp <= 0) return 0
  const ratio = hp / maxHp
  return ratio < 0.3 ? clamp((0.3 - ratio) / 0.3, 0, 1) : 0
}

/* ---------------------------------------------------------------------------------------------- banners */

export type BannerKind = 'warning' | 'bossKill' | 'stage' | 'swarm' | 'chest' | 'evolve'
export interface Banner {
  kind: BannerKind
  title: string
  sub?: string
  /** Small line above the title (age of a stage card). */
  meta?: string
  /** Emoji beside the subtitle. */
  emoji?: string
  /** Evolution cut-in: weapon id plus the names before and after. */
  art?: { id: string; from: string; to: string }
  /** ms on screen */
  duration: number
}

export const BANNER_MS: Record<BannerKind, number> = {
  warning: 2200,
  bossKill: 1900,
  stage: 1800,
  swarm: 1600,
  chest: 1500,
  evolve: 2000
}
const PRIORITY: Record<BannerKind, number> = { warning: 5, evolve: 4, bossKill: 3, chest: 2, stage: 1, swarm: 0 }
const MAX_WAITING = 4
/** A banner that waited this long is stale. */
const STALE_MS = 6000

/** One banner at a time; the rest wait in order, and the least important are dropped when the line grows. */
export class BannerQueue {
  private waiting: { banner: Banner; at: number }[] = []
  current: { banner: Banner; until: number } | undefined

  push(banner: Banner, now: number) {
    this.waiting.push({ banner, at: now })
    while (this.waiting.length > MAX_WAITING) {
      let drop = 0
      for (let i = 1; i < this.waiting.length; i++)
        if (PRIORITY[this.waiting[i].banner.kind] < PRIORITY[this.waiting[drop].banner.kind]) drop = i
      this.waiting.splice(drop, 1)
    }
  }

  get size() {
    return this.waiting.length + (this.current ? 1 : 0)
  }

  clear() {
    this.waiting = []
    this.current = undefined
  }

  /** Call every frame. Returns what changed so the page can mount / unmount a banner. */
  update(now: number): { show?: Banner; hide?: boolean } {
    const out: { show?: Banner; hide?: boolean } = {}
    if (this.current && now >= this.current.until) {
      this.current = undefined
      out.hide = true
    }
    if (!this.current) {
      while (this.waiting.length) {
        const next = this.waiting.shift()!
        if (now - next.at > STALE_MS && PRIORITY[next.banner.kind] < PRIORITY.chest) continue
        this.current = { banner: next.banner, until: now + next.banner.duration }
        out.show = next.banner
        out.hide = undefined
        break
      }
    }
    return out
  }
}

export const STAGE_LINES = [
  '泣くのが仕事',
  'なんでも口に入れたい',
  '宿題と夏休み',
  '思春期、はじまる',
  '受験の足音',
  'これからの道を探して',
  '満員電車の向こうへ',
  '家と仕事と、ローン',
  '健康診断が気になる',
  'ゆっくり、ゆっくり',
  '最後の時間'
]

/* ------------------------------------------------------------------------------------------- level-up cards */

export type Rarity = 'new' | 'level' | 'evolve' | 'passive' | 'plain'

/** How a level-up choice should be framed. `evolve` covers both ways of finishing an evolution. */
export function choiceRarity(
  weapons: readonly (readonly [string, number, ...number[]])[],
  passives: readonly (readonly [string, number])[],
  choice: string
): Rarity {
  const [kind, id] = choice.split(':')
  const has = (passive: string) => passives.some(([p]) => p === passive)
  if (kind === 'w') {
    const owned = weapons.find(([w]) => w === id)
    if (!owned) return 'new'
    const def = WEAPON_BY_ID.get(id)
    return owned[1] + 1 >= MAX_WEAPON_LEVEL && def?.evolve && has(def.evolve.passive) ? 'evolve' : 'level'
  }
  if (kind === 'p') {
    if (has(id)) return 'passive'
    const completes = weapons.some(([w, lv]) => lv >= MAX_WEAPON_LEVEL && WEAPON_BY_ID.get(w)?.evolve?.passive === id)
    return completes ? 'evolve' : 'passive'
  }
  return 'plain'
}

/* ----------------------------------------------------------------------------------------------- boss bar */

export interface BossInfo {
  id: number
  name: string
  /** 0-100 */
  hp: number
  /** Bosses alive at once. */
  count: number
}

/** The boss the bar follows: the oldest alive. */
export function findBoss(enemies: number[]): BossInfo | undefined {
  let found: BossInfo | undefined
  let count = 0
  for (let i = 0; i < enemies.length; i += STRIDE.enemies) {
    const def = ENEMIES[enemies[i + 1]]
    if (def?.behavior !== 'boss') continue
    count++
    if (!found || enemies[i] < found.id) found = { id: enemies[i], name: def.name, hp: enemies[i + 4], count: 0 }
  }
  if (found) found.count = count
  return found
}
