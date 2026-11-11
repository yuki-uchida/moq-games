import { canvasOf } from './art/atlas'
import { careerFor } from './art/careers'
import { BEAM_DIRS, STAPLE_DIRS, beam, flowerBed, flowerSpots } from './art/arsenal'
import { deathKind, soulAt } from './art/deaths'
import {
  NO_FLIP,
  PENCIL_DIRS,
  SWING_DIRS,
  evolve,
  playMat,
  prewarmAppearanceFrame,
  retainAppearancePrewarm,
  sheet,
  swing
} from './art/index'
import { PALETTE, R } from './art/palette'
import { Raster } from './art/raster'
import { duration, frameAt, type Anim, type Sheet } from './art/sheet'
import { FLAT_PROPS, GROUNDS, PROP_CELL, TILE, groundTile, propsAt } from './art/world'
import {
  COOKING_EFFECTS,
  ENEMIES,
  ENEMY_BY_ID,
  MAX_WEAPON_LEVEL,
  PARENT_LEGACIES,
  PASSIVE_BY_ID,
  STAGES,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_INDEX,
  ageAt,
  stageAt,
  timeAtAge,
  type EnemyDef,
  type Stage
} from './data'
import { Effects, FxFeed, GAMBLE_OFFSET, GAMBLE_RESULT_DELAY, PK, gambleTiming, type Particle } from './effects'
import {
  FOOD_BOB,
  foodChips,
  foodLabelLines,
  foodPiles,
  foodSpriteBox,
  labelClearance,
  LABEL_LINE,
  layoutFoods,
  placeFoodLabels,
  playerBox,
  type Box,
  type FoodLabelEntry,
  type LabelMemory,
  type FoodSpot
} from './food-layout'
import { parentMemorialAt } from './hud'
import { GUARDIAN_SHIELD_ART, RAID, VIEW_HALF } from './game'
import { bodyScale } from './body-size'
import { FX, readGuardBits } from './fx'
import { CHILD_DRAWN, childDrawnBox } from './overhead'
import { FAMILY_SCALE, FAMILY_SLOTS } from './family-slots'
import { OBSERVATION_SPRITES, PET_TYPES, petForm, weaponAppearance } from './weapon-life'
import {
  BULLET_KINDS,
  ENEMY_FLAG,
  GUARD_BASH_STEPS,
  GUARD_BACK,
  GUARD_STEP,
  GUARD_WALK,
  ITEM_KINDS,
  PET_STILL,
  POPUP_BIT,
  SHOT_GAMBLE,
  STRIDE,
  type View,
  type ViewPlayer
} from './view'

/** Painted player bodies by the stage age they belong to; other stages use the nearest one. */
const BODIES: Record<string, string> = {
  乳児期: 'baby',
  幼児期: 'toddler',
  小学生: 'kid',
  中学生: 'junior',
  高校生: 'high',
  青年期: 'college',
  成人期: 'adult',
  壮年期: 'prime',
  中年: 'middle',
  老後: 'elder',
  寝たきり: 'bed'
}
/** Every life stage has its own painted body. */
export const bodyFor = (stage: Stage) => BODIES[stage.name] ?? 'adult'
const appearanceFor = (player: ViewPlayer, body: string) => {
  const career = !['baby', 'toddler', 'bed'].includes(body) ? careerFor(player) : undefined
  return `${body}${career ? `:${career}` : ''}`
}
const GROUND_FADE = 1.5
const TAU = Math.PI * 2
const GAMBLE_LABELS: Record<string, string> = {
  gamble_gacha: 'ガチャ！',
  gamble_poker: 'ポーカー！',
  gamble_pachinko: '大当たり！',
  gamble_horse: '競馬的中！'
}
/** Whether a player's weapon has evolved (Lv8 + its matching passive), from the snapshot alone. */
function isEvolvedView(owner: ViewPlayer | undefined, id: string) {
  const def = WEAPON_BY_ID.get(id)
  const w = owner?.weapons.find((x) => x[0] === id)
  return Boolean(
    def?.evolve && w && w[1] >= MAX_WEAPON_LEVEL && owner!.passives.some((p) => p[0] === def.evolve!.passive)
  )
}

/** Cheap deterministic noise in 0..1 (for jitter that must not change between draws of the same frame). */
function hash(a: number, b = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Frame index of an animation at time t without allocating (falls back to frameAt for held frames). */
function frameIndex(anim: Anim, t: number) {
  if (anim.hold) return frameAt(anim, t)
  const n = anim.frames.length
  const tick = Math.floor(Math.max(0, t) * anim.fps)
  return anim.loop ? tick % n : Math.min(n - 1, tick)
}
const pick = (anim: Anim, t: number) => anim.frames[frameIndex(anim, t)]
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3

/** The tight box around a lettering layer (cached). */
const letterBoxes = new WeakMap<Raster, { r: Raster; x: number; y: number }>()
function letterBox(t: Raster) {
  let box = letterBoxes.get(t)
  if (box) return box
  let x0 = t.w
  let y0 = t.h
  let x1 = 0
  let y1 = 0
  t.map(
    (c, x, y) => ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)), c)
  )
  box = { r: new Raster(x1 - x0 + 1, y1 - y0 + 1).blit(t, -x0, -y0), x: x0, y: y0 }
  letterBoxes.set(t, box)
  return box
}

/** Where a prop touches the ground: centre x, half-width and row of its lowest pixels (cached). */
const footprints = new WeakMap<Raster, { cx: number; rx: number; y: number }>()
function footprint(r: Raster) {
  let found = footprints.get(r)
  if (found) return found
  let maxY = -1
  r.map((c, _x, y) => ((maxY = Math.max(maxY, y)), c))
  let lo = r.w
  let hi = -1
  r.map((c, x, y) => (y >= maxY - 3 && ((lo = Math.min(lo, x)), (hi = Math.max(hi, x))), c))
  found = hi < 0 ? { cx: 0, rx: 0, y: 0 } : { cx: (lo + hi + 1) / 2, rx: (hi - lo + 1) / 2 + 1, y: maxY }
  footprints.set(r, found)
  return found
}

/** A one-pixel gold outline around a sprite (one extra pixel of padding on every side), cached per frame. */
const outlines = new WeakMap<Raster, Raster>()
function goldOutline(src: Raster) {
  let out = outlines.get(src)
  if (out) return out
  out = new Raster(src.w + 2, src.h + 2)
  for (let y = -1; y <= src.h; y++)
    for (let x = -1; x <= src.w; x++)
      if (
        !src.get(x, y) &&
        (src.get(x - 1, y) || src.get(x + 1, y) || src.get(x, y - 1) || src.get(x, y + 1) || src.get(x - 1, y - 1))
      )
        out.set(x + 1, y + 1, R.yellow[1])
  outlines.set(src, out)
  return out
}

/** A text/bubble canvas drawn at `res`× resolution and shown at 1/res of its pixel size. */
interface Label extends HTMLCanvasElement {
  res: number
}

/** Damage number styles: label scale relative to the 20 px glyph atlas, fill colour. */
const NUMBER_STYLES = {
  other: { scale: 0.5, color: '#b9b3c9' },
  mine: { scale: 0.62, color: '#ffffff' },
  strong: { scale: 0.78, color: '#ffcf4d' },
  crit: { scale: 0.9, color: '#ff6a3d' },
  both: { scale: 1.12, color: '#ff8a2a' }
} as const
type NumberStyle = keyof typeof NUMBER_STYLES
const NUMBER_FONT = '800 20px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif'

/** A spouse or child walking with a married player (renderer-only; positions never reach the game). */
export interface Follower {
  sheet: string
  x: number
  y: number
  speed: number
  flip: boolean
  /** Animation offset so the two never step in lockstep. */
  phase: number
  /** Their player is below full HP, so the healing they give shows. */
  heal: boolean
}

/** Half the width and height (px) of a 過保護親's figure around her centre, for keeping the gamble badge off her. */
const BADGE_PARENT_HALF = 12
/** Overlap (px²) the badge's current side must cover beyond the other before it moves over: no flicker on the edge. */
export const BADGE_SIDE_MARGIN = 60
/** Rate (1/s) at which the badge eases across to its new side. */
const BADGE_SIDE_RATE = 12

/** The gamble badge's box with its tail, relative to the player's drawn position, on `side` (+1 right, -1 left). */
export function badgeBoxAt(side: number, size: number): Box {
  const x = 26 * size * side
  const y = 16 - 50 * size
  return { left: x - 11, top: y - 11, right: x + 11, bottom: y + 15 }
}

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

/**
 * The side of the head (+1 right, -1 left) the gamble badge should float on, given the one it is heading for now
 * (`current`) and the centres of the player's 過保護親 relative to her drawn position (her own and the gamble's
 * copies). It moves over only once its side covers more of them than the other side would by `BADGE_SIDE_MARGIN`,
 * so a parent jittering on the edge by a rounded pixel never flips it; clear of all of them it returns to the right.
 */
export function badgeSideTarget(
  current: number,
  parents: readonly { x: number; y: number }[],
  size: number,
  margin = BADGE_SIDE_MARGIN
) {
  const right = badgeBoxAt(1, size)
  const left = badgeBoxAt(-1, size)
  let onRight = 0
  let onLeft = 0
  for (const { x, y } of parents) {
    const box = {
      left: x - BADGE_PARENT_HALF,
      top: y - BADGE_PARENT_HALF,
      right: x + BADGE_PARENT_HALF,
      bottom: y + BADGE_PARENT_HALF
    }
    onRight += overlapArea(box, right)
    onLeft += overlapArea(box, left)
  }
  if (current >= 0) return onRight > onLeft + margin ? -1 : 1
  if (!onRight && !onLeft) return 1
  return onLeft > onRight + margin ? 1 : -1
}

/** Farthest (world px) a gamble event may lie from the snapshot position of the player it is tied to. */
export const GAMBLE_OWNER_REACH = 96
/** Clear space (world px) between a gamble reel (with its label) and the top of its owner's stack of tags. */
export const GAMBLE_REEL_GAP = 4
/** Clear space (CSS px) between the bottom of the gambling player's body and the result banner. */
export const GAMBLE_RESULT_GAP = 6
/** Rate (1/s) at which a gamble reel eases down when its owner's stack of tags gets lower (it rises at once). */
const GAMBLE_REEL_SETTLE = 10
/** How much wider (world px, each side) a name tag or buff image is than the text its box is measured from. */
const GAMBLE_TAG_PAD = 6
/** Rate (1/s) at which a gamble reel or result banner glides over to a new spot. */
const GAMBLE_GLIDE = 9

/**
 * The id of the player a gamble event at (x, y) belongs to: the nearest player now holding the drawn weapon `weapon`
 * as their gamble result (the event comes with the snapshot that set it), else the nearest player; none further than
 * GAMBLE_OWNER_REACH. Two players standing together are told apart by what they drew, then by distance.
 */
export function gambleOwner(
  players: readonly { id: string; x: number; y: number; gambleWeapon?: string }[],
  x: number,
  y: number,
  weapon?: string
): string | undefined {
  const near = (list: readonly (typeof players)[number][]) => {
    let best: string | undefined
    let bestD = GAMBLE_OWNER_REACH ** 2
    for (const p of list) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d <= bestD) {
        bestD = d
        best = p.id
      }
    }
    return best
  }
  const holding = weapon ? players.filter((p) => p.gambleWeapon === weapon) : []
  return near(holding) ?? near(players)
}

/** Seconds the badge must keep wanting the other side before it heads there: a passing overlap never moves it. */
export const BADGE_SWITCH_HOLD = 0.4

/**
 * The other side the gamble badge wants: how long (renderer seconds) it has clearly wanted it so far, and the renderer
 * time of the last frame that was counted.
 */
export interface BadgePending {
  side: number
  wanted: number
  at: number
}

/**
 * Holds the badge on `target` until it has clearly wanted the other side for `BADGE_SWITCH_HOLD` seconds of renderer
 * time `now`. `desired` comes from `badgeSideTarget` judged from the pending side when there is one, else from
 * `target`: once it asks for `target` again the wait starts over. `ready` says whether, judged from `target`, the other
 * side is clearly better right now; only such frames count toward the wait, while frames with a parent in between
 * (neither side clearly better) pause it. Returns the side to head for and what is still pending.
 */
export function holdBadgeSide(
  target: number,
  desired: number,
  pending: BadgePending | undefined,
  now: number,
  ready = true,
  hold = BADGE_SWITCH_HOLD
): { target: number; pending?: BadgePending } {
  if (desired === target) return { target }
  if (pending?.side !== desired) return { target, pending: { side: desired, wanted: 0, at: now } }
  const wanted = pending.wanted + (ready ? Math.max(0, now - pending.at) : 0)
  return wanted >= hold ? { target: desired } : { target, pending: { side: desired, wanted, at: now } }
}

/** Eases the badge's side `dt` real seconds toward `target`, the same for every role, so it glides over, never jumps. */
export const easeBadgeSide = (side: number, target: number, dt: number) =>
  target + (side - target) * Math.exp(-BADGE_SIDE_RATE * Math.max(0, dt))

/**
 * Least clear space between any of `boxes` (shifted by `dx`, `dy`) and any of `obstacles`: along whichever axis they
 * are apart, negative when they overlap (Infinity with no obstacles).
 */
export function boxClearance(boxes: readonly Box[], obstacles: readonly Box[], dx = 0, dy = 0) {
  let least = Infinity
  for (const a of boxes) {
    const left = a.left + dx
    const right = a.right + dx
    const top = a.top + dy
    const bottom = a.bottom + dy
    for (const b of obstacles)
      least = Math.min(least, Math.max(b.left - right, left - b.right, b.top - bottom, top - b.bottom))
  }
  return least
}

const boxUnion = (a: Box, b: Box): Box => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom)
})

/** A spot a gamble reel or result banner may take: its offset from where it goes by default, and how much less wanted. */
export interface GambleSpot {
  dx: number
  dy: number
  cost: number
}
/** Clear space (world px for reels, CSS px for the banner) a spot needs to be taken. */
export const GAMBLE_SPOT_CLEAR = 3.5
/** How much cheaper (cost) a free spot must be to leave the free spot already taken for it. */
export const GAMBLE_SPOT_HOLD = 24

/**
 * Index of the spot among `spots` for `boxes` (about their default place) to take, clear of `obstacles` by `clear`:
 * the cheapest free one, but the spot taken so far (`current`) while it stays free and not `hold` dearer. With no
 * free spot it stays on `current` (the default spot at first) and fades there until one frees up.
 */
export function pickGambleSpot(
  spots: readonly GambleSpot[],
  boxes: readonly Box[],
  obstacles: readonly Box[],
  current?: number,
  clear = GAMBLE_SPOT_CLEAR,
  hold = GAMBLE_SPOT_HOLD
) {
  let best = -1
  const free = spots.map((s) => boxClearance(boxes, obstacles, s.dx, s.dy) >= clear)
  spots.forEach((s, i) => {
    if (free[i] && (best < 0 || s.cost < spots[best].cost)) best = i
  })
  const now = current !== undefined && current < spots.length ? current : undefined
  if (now !== undefined && free[now] && (best < 0 || spots[now].cost <= spots[best].cost + hold)) return now
  return best >= 0 ? best : (now ?? 0)
}

/** How visible a gamble reel or banner is with `clearance` (px) to what it must not cover: gone before touching. */
export const gambleVisibility = (clearance: number) => clamp01((clearance - 1) / 2)

/** How quickly (1/s) the family (FAMILY_SLOTS) close in on their slot, and the farthest (world px) they ever trail behind it. */
const FAMILY_FOLLOW = 7
export const FAMILY_LAG = 40
/** Seconds between the small healing pluses that rise off them while their player is hurt. */
const FAMILY_HEAL_EVERY = 1.6

/**
 * Moves a player's family `dt` seconds toward their slots behind the player drawn at `pos`: the spouse once
 * married, the child once welcomed, nobody while the player is down or the life is ending. They ease after the
 * player and never trail more than FAMILY_LAG behind a slot; someone new or far away appears in their slot.
 * Updates `crew` in place and returns it.
 */
export function followFamily(
  crew: Follower[],
  player: Pick<ViewPlayer, 'fx' | 'married' | 'hasChild' | 'downed' | 'hp' | 'maxHp'>,
  phase: View['phase'],
  pos: { x: number; y: number },
  dt: number
) {
  const count = player.downed || phase !== 'playing' || !player.married ? 0 : player.hasChild ? 2 : 1
  crew.length = Math.min(crew.length, count)
  const back = player.fx < 0 ? 1 : -1
  const step = Math.min(Math.max(0, dt), 0.1)
  const k = 1 - Math.exp(-FAMILY_FOLLOW * step)
  for (let i = 0; i < count; i++) {
    const slot = FAMILY_SLOTS[i]
    const tx = pos.x + back * slot.dx
    const ty = pos.y + slot.dy
    const m = crew[i]
    if (!m || Math.hypot(m.x - tx, m.y - ty) > 200) {
      crew[i] = { sheet: slot.sheet, x: tx, y: ty, speed: 0, flip: back > 0, phase: i * 0.37, heal: false }
      continue
    }
    let x = m.x + (tx - m.x) * k
    let y = m.y + (ty - m.y) * k
    const off = Math.hypot(x - tx, y - ty)
    if (off > FAMILY_LAG) {
      x = tx + ((x - tx) * FAMILY_LAG) / off
      y = ty + ((y - ty) * FAMILY_LAG) / off
    }
    const vx = step > 0 ? (x - m.x) / step : 0
    const speed = step > 0 ? Math.hypot(x - m.x, y - m.y) / step : 0
    m.speed += (Math.min(400, speed) - m.speed) * 0.25
    // Walking, they face where they walk; standing, the way their player faces.
    if (m.speed <= 25) m.flip = player.fx < 0
    else if (Math.abs(vx) > 20) m.flip = vx < 0
    m.x = x
    m.y = y
  }
  for (const m of crew) m.heal = player.hp < player.maxHp
  return crew
}

interface Ent {
  /** Sort key (feet). */
  y: number
  /** ENEMIES index. */
  kind: number
  def?: EnemyDef
  player?: ViewPlayer
  member?: Follower
  /** view.shots index of a companion (生き物観察, garden sprout, pet, 過保護親). */
  shot?: number
  /** view.shots index of a ground vehicle (アウトドア's tricycle ... car), sorted on its wheels. */
  vehicle?: number
  id: number
  x: number
  yy: number
  hp: number
  flash: number
  flags: number
  tagLift: number
  state?: EnemyState
}

interface EnemyState {
  born: number
  seen: number
  windup: number
  blink: boolean
}

/** Scratch view of the shot being drawn. */
interface ShotView {
  i: number
  x: number
  y: number
  r: number
  angle: number
  /** Remaining life 0..1 */
  life: number
  /** Elapsed life 0..1 */
  age: number
  v: number
  ox: number
  oy: number
  evolved: boolean
  /** Fired by the gamble as a copy of another weapon. */
  copied: boolean
  /** 過保護親: the frame her walk is on (GUARD_STEP). */
  step: number
}

const BOSS_AURA = '#a02850'
/** Height (world px) of a garden seed's arc at its top, as the view draws it. */
const SEED_ARC = 48
/** A seed first seen this close (world px) to its owner was seen at its launch, so its flight can be followed. */
const SEED_FIRST_SEEN = 28
/** How far (world px, at body size 1) the buff aura and identity ring reach below a player's feet. */
const FEET_RINGS = 14
/** Size (CSS px) of the weapon's pixel icon on the gamble result banner, and the space after it. */
const GAMBLE_ICON = 24
const GAMBLE_ICON_GAP = 6
const isGamble = (p: Particle) => p.kind === PK.gambleResult || (p.kind === PK.sprite && p.spr.startsWith('gamble_'))
/** How long a new pet takes to pop in, and a leaving one to fade out in a puff (s). */
const PET_POP_SECONDS = 0.2
const PET_FADE_SECONDS = 0.3
/**
 * 過保護親's bash: her shield goes out this far (px, times its scale) at an enemy within this cosine of its way and
 * within its reach (and this many px more); for an enemy she bashes off her shield's reach within her all-round reach
 * of her child (FX.GUARD), the ring round the child (GUARD_RING_PER_R times her shield's radius: the game's all-round
 * reach, 0.65 × the orbit (2.9 r) plus 7 px a scale) lights up GUARD_RING_ARC radians either way of it as long as her
 * bash (GUARD_RING_SECONDS at most). Walking, her walk plays this many times as fast as her standing.
 */
const GUARD_THRUST = 14
/**
 * The child as drawn (CHILD_DRAWN, scaled about her feet by her body size): a thrust never takes the shield
 * GUARD_CHILD_CLEAR px or more over her, across and up and down.
 */
const GUARD_CHILD_BOX = CHILD_DRAWN
const GUARD_CHILD_CLEAR = 1
const GUARD_THRUST_COS = Math.cos((50 * Math.PI) / 180)
const GUARD_STRIKE_SLACK = 16
const GUARD_RING_PER_R = 0.65 * 2.9 + 7 / 20
const GUARD_RING_ARC = 0.45
const GUARD_RING_SECONDS = 0.25
/** How long a food label takes to fade back in once no player covers it (s). */
const FOOD_LABEL_FADE_IN = 0.15
const GOLD = '#ffd75e'

/** Canvas renderer: generated pixel art for everything in the world; labels are rasterised once and reused. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly sprites = new Map<string, HTMLCanvasElement>()
  private readonly shown = new Map<number, { x: number; y: number; seen: number }>()
  private readonly shownPlayers = new Map<string, { x: number; y: number }>()
  /** Enemy bullets in flight by id: a straight path (position at host time `t`, velocity), moved locally every frame. */
  private readonly flying = new Map<number, { kind: number; x: number; y: number; vx: number; vy: number; t: number }>()
  private flyingBullets?: number[]
  /** Seconds the guest has played on since the latest snapshot. */
  private sinceSnapshot = 0
  private readonly states = new Map<number, EnemyState>()
  /** Pending life bars: x, y, width, filled width, height, colour (0 normal, 1 boss, 2 elite). */
  private readonly bars: number[] = []
  private readonly numbers = new Map<string, Label>()
  private frame = 0
  /** Seconds since the previous frame (capped), for easing done while drawing. */
  private frameDt = 0
  private width = 1
  private height = 1
  private scale = 1
  /** Where the world is drawn from this frame (the focus plus screen shake). */
  private camera = { x: 0, y: 0 }
  /** The followed player's position without shake. */
  private focus = { x: 0, y: 0 }
  private readonly shake = { x: 0, y: 0 }
  /** Renderer clock: animations keep breathing even while the game is paused. */
  private clock = 0
  private wonAt?: number
  private beamAt?: number
  /** ms spent generating the death animation on the frame a player went down (dev hook). */
  deathBuildMs = 0
  private halo?: { x: number; y: number; t: number; alpha: number }
  private groundShown?: { stage: Stage; from?: Stage; at: number }
  private readonly motion = new Map<string, { x: number; y: number; speed: number }>()
  private readonly families = new Map<string, Follower[]>()
  /**
   * Per player: the badge being shown, the newest result and when it changed (the reels need time to stop), and the
   * side of the head it floats on (-1 left .. +1 right, eased), the side it is easing toward and the other side it has
   * been wanting, for how long (see `holdBadgeSide`).
   */
  private readonly gambleBadges = new Map<
    string,
    {
      shown?: string
      next?: string
      at: number
      side: number
      target?: number
      pending?: BadgePending
    }
  >()
  /**
   * Per player drawn this frame: the centre x of their body, the top of everything stacked on their head (name tag,
   * buff row, badge, lifted by the tags of players standing together) and the bottom of their body (with the rings
   * at the feet). The gamble reel floats above the top, its result banner below the bottom.
   */
  private readonly stacks = new Map<string, { x: number; top: number; bottom: number }>()
  /**
   * Per player drawn this frame: what gamble reels and result banners must not cover (world px): the body, name tag,
   * buff row and badge (the tags as wide as the images they are drawn from) and the rings at the feet.
   */
  private readonly playerAreas = new Map<string, Box[]>()
  /**
   * Per gamble reel or result banner: the spot it has taken (index into its spots), its eased offset from its default
   * place, how visible it is (it fades out where it would cover something), whether it is not shown at all (the result
   * of another player), the banner's centre this frame (CSS px) and the particle's age (a recycled one starts afresh).
   */
  private readonly gamblePlaces = new Map<
    Particle,
    {
      kind: number
      age: number
      spot?: number
      started: boolean
      dx: number
      dy: number
      vis: number
      hidden: boolean
      x: number
      y: number
    }
  >()
  /** Measured boxes of the gamble reel labels at their largest, about the reel's centre (by label text). */
  private readonly gambleLabelBoxes = new Map<string, Box>()
  private readonly deaths = new Map<string, { at: number; body: string; kind: string }>()
  private readonly parentMemorials = new Map<string, { key: string; age: number }>()
  private parentMemorialTime?: number
  private readonly warmedDeaths = new Set<string>()
  private readonly warmedAppearances = new Set<string>()
  private appearanceView?: View
  private appearanceTime?: number
  private appearancePending = false
  /** Particles, trauma and flashes driven by the fx events of the views drawn so far. */
  readonly fx = new Effects()
  /** The FX.GUARD events not yet seen, and the rings they light round the children: whose, towards where, since when. */
  private readonly guardFeed = new FxFeed()
  private readonly guardRings: { owner: number; x: number; y: number; r: number; at: number; life: number }[] = []
  /** While the characters are drawn: what is drawn over the players' heads, to draw after them (and the rings). */
  private overheads: (() => void)[] | undefined
  private readonly fxView = { local: -1, px: 0, py: 0, cx: 0, cy: 0, hw: 0, hh: 0 }
  private readonly measure =
    typeof document === 'undefined' ? undefined : document.createElement('canvas').getContext('2d')
  private readonly ents: Ent[] = []
  private entCount = 0
  private readonly winders: Ent[] = []
  /**
   * Per pile: the label lines, key, owners in line order and shown sprite boxes; plus every obstacle the labels avoid
   * (sprites, then players).
   */
  private readonly foodLabels: {
    lines: string[][]
    keys: string[]
    owners: number[][]
    piles: Box[][]
    sprites: Box[]
    players: Box[]
    local: number
  } = {
    lines: [],
    keys: [],
    owners: [],
    piles: [],
    sprites: [],
    players: [],
    local: -1
  }
  /** Screen boxes (CSS px from the canvas's top left) of the HUD parts drawn over the canvas; food labels avoid them. */
  private hudRects: (Box & { opaque?: boolean })[] = []
  private transientRects: Box[] = []
  private coverRects: Box[] = []
  private readonly textWidths = new Map<string, number>()
  /** Candidate each food label block took last frame, by pile key (keeps labels from jumping between spots). */
  private readonly foodLabelMemory: LabelMemory = new Map()
  /** Opacity of the food labels: dimmed with the world while your own death plays. */
  private foodLabelAlpha = 1
  /**
   * Per food label (pile key): the clock time it last stopped overlapping a player's body, name tag, buff row or badge.
   * A label over a player is not drawn and fades back in over FOOD_LABEL_FADE_IN once clear. Infinity while covered.
   */
  private readonly foodLabelClear = new Map<string, number>()
  /** Age and the local player's pet age at this frame, for the gamble result's per-age weapon name. */
  private viewAge = 0
  private localPetAge?: number
  /** Food layout of the last frame, reused while the visible foods stay where they are. */
  private foodLayout: { key: string; spots: FoodSpot[] } = { key: '', spots: [] }
  private readonly enemySheets: (Sheet | undefined)[] = []
  private readonly evo = new Int8Array(16 * 64)
  private readonly shot: ShotView = {
    i: 0,
    x: 0,
    y: 0,
    r: 0,
    angle: 0,
    life: 1,
    age: 0,
    v: 0,
    ox: 0,
    oy: 0,
    evolved: false,
    copied: false,
    step: 0
  }
  private readonly beamWarm = new Set<number>()
  private halfW = 0
  private halfH = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    if (typeof window.matchMedia === 'function') {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)')
      const apply = () => (this.fx.motion = query.matches ? 0.25 : 1)
      apply()
      query.addEventListener?.('change', apply)
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = this.canvas.clientWidth || window.innerWidth
    this.height = this.canvas.clientHeight || window.innerHeight
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    // Everyone sees at most the same world area, so off-screen spawns stay off-screen.
    this.scale = Math.max(this.width / (VIEW_HALF.x * 2), this.height / (VIEW_HALF.y * 2)) * dpr
  }

  /** Half size of the world area shown on screen (without the off-screen culling margin). */
  get viewHalf() {
    const k = this.scale || 1
    return { x: this.canvas.width / 2 / k, y: this.canvas.height / 2 / k }
  }

  private sprite(key: string, draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number) {
    let canvas = this.sprites.get(key)
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = Math.ceil(w)
      canvas.height = Math.ceil(h)
      draw(canvas.getContext('2d')!)
      if (this.sprites.size > 600) this.sprites.clear()
      this.sprites.set(key, canvas)
    }
    return canvas
  }

  /** A canvas painted at 2× resolution (drawn with logical size w×h). */
  private hires(
    key: string,
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  ) {
    let canvas = this.sprites.get(key) as Label | undefined
    if (!canvas) {
      canvas = document.createElement('canvas') as Label
      canvas.res = 2
      canvas.width = Math.ceil(w * 2)
      canvas.height = Math.ceil(h * 2)
      const g = canvas.getContext('2d')!
      g.scale(2, 2)
      draw(g, w, h)
      if (this.sprites.size > 600) this.sprites.clear()
      this.sprites.set(key, canvas)
    }
    return canvas
  }

  private label(text: string, size: number, color: string, quiet = false) {
    const px = Math.round(size)
    return this.hires(`l:${text}:${px}:${color}:${quiet}`, px * (text.length + 1.2), px * 1.6, (ctx, w, h) => {
      ctx.font = `700 ${px}px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = quiet ? Math.max(1.5, px / 5) : Math.max(2, px / 4)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = quiet ? 'rgba(15,12,20,.55)' : 'rgba(15,12,20,.85)'
      ctx.strokeText(text, w / 2, h / 2)
      ctx.fillStyle = color
      ctx.fillText(text, w / 2, h / 2)
    })
  }

  /** Drawn width (world px) of a `label` text with its outline. */
  private labelWidth(text: string, size: number) {
    const px = Math.round(size)
    const key = `l:${px}:${text}`
    // Without a measuring canvas (a stripped-down renderer in tests), the label canvas's own width.
    const widths = this.textWidths as Map<string, number> | undefined
    const measure = this.measure as CanvasRenderingContext2D | null | undefined
    let width = widths?.get(key)
    if (width === undefined) {
      if (!widths || !measure) return px * (text.length + 1.2)
      measure.font = `700 ${px}px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif`
      width = measure.measureText(text).width + Math.max(2, px / 4)
      widths.set(key, width)
    }
    return width
  }

  /** A whole damage number as one sprite; a small FIFO cache keeps the number of canvases bounded. */
  private numberSprite(text: string, style: NumberStyle) {
    const key = `${style}:${text}`
    let canvas = this.numbers.get(key)
    if (canvas) return canvas
    const pad = 3
    const measure = this.measure!
    measure.font = NUMBER_FONT
    canvas = this.hires(`n:${key}`, Math.ceil(measure.measureText(text).width + pad * 2), 32, (ctx, w, h) => {
      ctx.font = NUMBER_FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 5
      ctx.strokeStyle = 'rgba(15,12,20,.9)'
      ctx.strokeText(text, w / 2, h / 2)
      ctx.fillStyle = NUMBER_STYLES[style].color
      ctx.fillText(text, w / 2, h / 2)
    })
    // The number sprites live in their own map (not in the shared sprite cache, which clears wholesale).
    this.sprites.delete(`n:${key}`)
    if (this.numbers.size >= 240) for (const old of [...this.numbers.keys()].slice(0, 80)) this.numbers.delete(old)
    this.numbers.set(key, canvas as Label)
    return canvas
  }

  /** Draws a damage number centred at (x, y). */
  private number(text: string, style: NumberStyle, x: number, y: number, scale: number, alpha: number) {
    this.blit(this.numberSprite(text, style), x, y, 0, alpha, NUMBER_STYLES[style].scale * scale)
  }

  /** A soft radial blob of one colour (cached), for glows, halos and auras. */
  private blob(color: string) {
    return this.sprite(
      `blob:${color}`,
      (ctx) => {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
        grad.addColorStop(0, color)
        grad.addColorStop(0.35, color)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha = 1
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 64, 64)
      },
      64,
      64
    )
  }

  private glowAt(x: number, y: number, radius: number, color: string, alpha: number, add = true) {
    const ctx = this.ctx
    ctx.globalAlpha = alpha
    if (add) ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(this.blob(color), x - radius, y - radius, radius * 2, radius * 2)
    if (add) ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  private blit(image: HTMLCanvasElement, x: number, y: number, angle = 0, alpha = 1, scale = 1) {
    const ctx = this.ctx
    const res = (image as Label).res || 1
    const w = (image.width / res) * scale
    const h = (image.height / res) * scale
    if (!angle) {
      ctx.globalAlpha = alpha
      ctx.drawImage(image, x - w / 2, y - h / 2, w, h)
      ctx.globalAlpha = 1
      return
    }
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.drawImage(image, -w / 2, -h / 2, w, h)
    ctx.restore()
  }

  /**
   * Draws a pixel-art frame with its pivot (px, py) at world (x, y): device-pixel snapped, pre-upscaled by
   * k = ceil(scale) and smoothed down to the final size ("sharp bilinear"). `sx`/`sy` stretch it around the pivot.
   * Leaves an identity transform.
   */
  private art(r: Raster, x: number, y: number, px: number, py: number, flip = false, alpha = 1, sx = 1, sy = sx) {
    const s = this.scale
    const k = Math.min(4, Math.max(1, Math.ceil(s * Math.max(sx, sy) - 0.01)))
    const dw = r.w * s * sx
    const dh = r.h * s * sy
    const ax = Math.round(this.canvas.width / 2 + (x - this.camera.x) * s)
    const left = Math.round(ax - (flip ? r.w - px : px) * s * sx)
    const top = Math.round(this.canvas.height / 2 + (y - this.camera.y) * s - py * s * sy)
    const ctx = this.ctx
    ctx.globalAlpha = alpha
    ctx.setTransform(flip ? -1 : 1, 0, 0, 1, flip ? left + dw : left, top)
    ctx.drawImage(canvasOf(r, k), 0, 0, dw, dh)
    ctx.globalAlpha = 1
  }

  /** A 32×32-style weapon frame centred on (x, y), optionally evolved (gold trim). */
  private centred(frame: Raster, x: number, y: number, evolved: boolean, alpha = 1, scale = 1, flip = false) {
    const f = evolved ? evolve(frame) : frame
    this.art(f, x, y, f.w / 2, f.h / 2, flip, alpha, scale)
  }

  /** The gamble result to badge: a new result only appears once the reels have stopped. */
  private gambleBadge(player: ViewPlayer) {
    const id = player.gambleWeapon
    if (!id) {
      this.gambleBadges.delete(player.id)
      return undefined
    }
    let st = this.gambleBadges.get(player.id)
    if (!st) {
      st = { at: this.clock, side: 1 }
      this.gambleBadges.set(player.id, st)
    }
    if (st.next !== id) {
      st.next = id
      st.at = this.clock
    }
    if (st.shown !== id && this.clock - st.at >= GAMBLE_RESULT_DELAY) st.shown = id
    return st.shown
  }

  /**
   * Eases the side of the head a player's gamble badge floats on toward the side that hides fewer of her 過保護親 (her
   * own and the gamble's copies) as drawn, so the badge never covers them; see `badgeSideTarget`. It heads over only
   * once that side has been wanted for a while (`holdBadgeSide`), so a passing overlap leaves it be.
   */
  private easeBadgeSide(view: View, origins: { x: number; y: number }[], index: number, dt: number) {
    const player = view.players[index]
    if (!player?.gambleWeapon) return
    const s = view.shots
    const guard = WEAPON_INDEX.get('p_over')!
    const parents: { x: number; y: number }[] = []
    for (let i = 0; i < s.length; i += STRIDE.shots) {
      if (s[i] !== guard || s[i + 6] !== index) continue
      const sh = this.load(view, origins, i)
      const at = this.companionAt(view, sh, WEAPONS[guard])
      parents.push({ x: at.x - sh.ox, y: at.y - sh.oy })
    }
    const size = bodyScale(
      player.passives.find(([id]) => id === 'p_large')?.[1] ?? 0,
      player.passives.find(([id]) => id === 'p_small')?.[1] ?? 0
    )
    let st = this.gambleBadges.get(player.id)
    if (!st) {
      st = { at: this.clock, side: badgeSideTarget(1, parents, size) }
      this.gambleBadges.set(player.id, st)
    }
    const target = st.target ?? (st.side < 0 ? -1 : 1)
    // While a move is pending it is judged from the side it would move to, so a parent in between (neither side clearly
    // better) only pauses the wait, and the old side turning clearly better again restarts it.
    const desired = badgeSideTarget(st.pending?.side ?? target, parents, size)
    const ready = badgeSideTarget(target, parents, size) !== target
    const held = holdBadgeSide(target, desired, st.pending, this.clock, ready)
    st.target = held.target
    st.pending = held.pending
    st.side = easeBadgeSide(st.side, st.target, dt)
  }

  /**
   * Ties every gamble reel and result banner spawned by this view's events to the player who gambled, so they follow
   * her (see `gambleOwner`); one nobody matches stays where it spawned.
   */
  private claimGambles(view: View) {
    for (const p of this.fx.pool.items) {
      if (p.owner || !isGamble(p)) continue
      const x = p.x - GAMBLE_OFFSET.x
      const y = p.kind === PK.gambleResult ? p.y - GAMBLE_OFFSET.y : p.y + GAMBLE_OFFSET.y
      p.owner = gambleOwner(view.players, x, y, WEAPONS[p.n]?.id) ?? '-'
    }
  }

  /** Traces a rounded rectangle path (no fill). */
  private roundPath(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  /**
   * Screen boxes (CSS px from the canvas's top left) of the HUD parts drawn over the canvas. Food labels keep clear of
   * them from the next frame on, and foods hidden behind `opaque` parts get no label. `transient` are the paths of
   * parts that come and go (banners, feed lines): labels they cross are not drawn while they last, but never move for
   * them. `covers` are the current boxes of those of them that are opaque: foods under them count as out of sight.
   */
  setHudRects(
    rects: readonly (Box & { opaque?: boolean })[],
    transient: readonly Box[] = [],
    covers: readonly Box[] = []
  ) {
    this.hudRects = rects.map((r) => ({ ...r }))
    this.transientRects = transient.map((r) => ({ ...r }))
    this.coverRects = covers.map((r) => ({ ...r }))
  }

  /**
   * Food labels: one block per pile with a sprite on screen, placed clear of food sprites, players, the HUD and other
   * blocks (shrunk, or left out, when there is no room). Drawn above the characters.
   */
  private drawFoodLabels() {
    const { lines, keys, owners, piles, sprites, players, local } = this.foodLabels
    if (!lines.length) {
      this.foodLabelMemory.clear()
      this.foodLabelClear.clear()
      return
    }
    const ctx = this.ctx
    this.world()
    ctx.save()
    ctx.globalAlpha = this.foodLabelAlpha
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#34203b'
    ctx.fillStyle = '#fff4cf'
    const halfW = this.halfW - 80
    const halfH = this.halfH - 80
    // What is fixed to the screen (HUD boxes, the view) is placed against the focus, not the shaking camera, so a shake
    // does not flip which labels the boxes cover. The drawing below still shakes with the world.
    const base = this.focus
    const visible = {
      left: base.x - halfW,
      top: base.y - halfH,
      right: base.x + halfW,
      bottom: base.y + halfH
    }
    const viewport = {
      left: visible.left + 4,
      top: visible.top + 4,
      right: visible.right - 4,
      bottom: visible.bottom - 4
    }
    // CSS px → world: the canvas centre is the focus (the camera without the shake).
    const k = this.canvas.width / (this.width || 1) / this.scale
    const toWorldX = (x: number) => base.x + (x - this.width / 2) * k
    const toWorldY = (y: number) => base.y + (y - this.height / 2) * k
    const toWorld = (r: Box): Box => ({
      left: toWorldX(r.left),
      top: toWorldY(r.top),
      right: toWorldX(r.right),
      bottom: toWorldY(r.bottom)
    })
    const hud = this.hudRects.map(toWorld)
    const occluders = [...this.hudRects.filter((r) => r.opaque).map(toWorld), ...this.coverRects.map(toWorld)]
    const transient = this.transientRects.map(toWorld)
    if (this.textWidths.size > 400) this.textWidths.clear()
    const measure = (text: string) => {
      let width = this.textWidths.get(text)
      if (width === undefined) this.textWidths.set(text, (width = ctx.measureText(text).width))
      return width
    }
    const labelPiles = lines.map((block, n) => ({
      sprites: piles[n],
      lines: block,
      local: owners[n].findIndex((owner) => owner === local),
      key: keys[n]
    }))
    const seen = new Set<string>()
    for (const { pile, box, lines: shown, leader, hidden, onPlayer } of placeFoodLabels(
      labelPiles,
      [...sprites, ...hud],
      visible,
      viewport,
      measure,
      this.foodLabelMemory,
      occluders,
      players,
      this.clock * 1000,
      transient
    )) {
      // A label kept in place while a player passes over it is not drawn over them (their name tag, face or buffs),
      // and fades back in once they are clear.
      const key = keys[pile]
      let fade = 1
      if (key !== undefined) {
        seen.add(key)
        const clear = onPlayer ? Infinity : this.foodLabelClear.get(key)
        const since = clear === Infinity && !onPlayer ? this.clock : (clear ?? -Infinity)
        this.foodLabelClear.set(key, since)
        fade = onPlayer ? 0 : clamp01((this.clock - since) / FOOD_LABEL_FADE_IN)
      }
      // It fades out as a player closes in on it, gone before anything of theirs touches it.
      fade *= labelClearance(box, players)
      if (hidden || fade <= 0) continue
      ctx.globalAlpha = this.foodLabelAlpha * fade
      const cx = (box.left + box.right) / 2
      // A block pushed away from its pile gets a thin leader to it, so crowded labels still point at their foods.
      if (leader) {
        ctx.save()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(255, 244, 207, 0.55)'
        ctx.beginPath()
        ctx.moveTo(leader.x1, leader.y1)
        ctx.lineTo(leader.x2, leader.y2)
        ctx.stroke()
        ctx.fillStyle = 'rgba(255, 244, 207, 0.8)'
        ctx.fillRect(leader.x2 - 1, leader.y2 - 1, 2, 2)
        ctx.restore()
      }
      shown.forEach((text, j) => {
        const ly = box.top + 13 + j * LABEL_LINE
        ctx.strokeText(text, cx, ly)
        ctx.fillText(text, cx, ly)
      })
    }
    for (const key of this.foodLabelClear.keys()) if (!seen.has(key)) this.foodLabelClear.delete(key)
    ctx.restore()
  }

  /**
   * "+n" chip inside the bottom-right corner of a food sprite's box, standing for the foods hidden next to it. The
   * bottom keeps the badge (top right) and the topping (top centre) that tell the foods apart in view.
   */
  private foodChip(box: Box, count: number) {
    const ctx = this.ctx
    const text = `+${count}`
    ctx.save()
    // At most the sprite box less a 1 px inset on each side, so the chip never reaches a neighbouring sprite.
    const room = box.right - box.left - 2
    ctx.font = 'bold 9px sans-serif'
    if (ctx.measureText(text).width + 4 > room) ctx.font = 'bold 7px sans-serif'
    const w = Math.min(room, Math.max(12, Math.ceil(ctx.measureText(text).width) + 4))
    const left = box.right - 1 - w
    const top = box.bottom - 1 - 11
    this.roundPath(left, top, w, 11, 3)
    ctx.fillStyle = '#3a2140'
    ctx.fill()
    ctx.strokeStyle = '#ffd75e'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#fff4cf'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, left + w / 2, top + 6)
    ctx.restore()
  }

  private world() {
    this.ctx.setTransform(
      this.scale,
      0,
      0,
      this.scale,
      this.canvas.width / 2 - this.camera.x * this.scale,
      this.canvas.height / 2 - this.camera.y * this.scale
    )
  }

  /** A soft elliptical glow: a radial gradient from the colour to transparent, squashed into an ellipse. */
  private glowEllipse(x: number, y: number, rx: number, ry: number, hex: string, alpha: number) {
    const ctx = this.ctx
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, ry / rx)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
    gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`)
    gradient.addColorStop(0.55, `rgba(${r},${g},${b},${alpha * 0.45})`)
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(0, 0, rx, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private shadow(x: number, y: number, rx: number, alpha = 0.28, flat = 0.36) {
    const ctx = this.ctx
    this.world()
    ctx.fillStyle = `rgba(12,8,20,${alpha})`
    ctx.beginPath()
    ctx.ellipse(x, y, rx, Math.min(6, rx * flat), 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /** One stage's ground over the visible area: painted tiles and props. */
  private ground(stage: Stage, alpha: number, halfW: number, halfH: number, underProps?: () => void) {
    const ctx = this.ctx
    const key = GROUNDS[stage.name]
    // Tiles: nearest-neighbour onto integer device rectangles so neighbours meet without seams.
    const s = this.scale
    const k = Math.max(1, Math.ceil(s - 0.01))
    const sx = (wx: number) => Math.round(this.canvas.width / 2 + (wx - this.camera.x) * s)
    const sy = (wy: number) => Math.round(this.canvas.height / 2 + (wy - this.camera.y) * s)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = alpha
    const tx0 = Math.floor((this.camera.x - halfW) / TILE)
    const ty0 = Math.floor((this.camera.y - halfH) / TILE)
    for (let tx = tx0; tx * TILE < this.camera.x + halfW; tx++)
      for (let ty = ty0; ty * TILE < this.camera.y + halfH; ty++) {
        const left = sx(tx * TILE)
        const top = sy(ty * TILE)
        ctx.drawImage(
          canvasOf(groundTile(key, tx, ty), k),
          left,
          top,
          sx((tx + 1) * TILE) - left,
          sy((ty + 1) * TILE) - top
        )
      }
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = 1
    if (underProps) {
      this.bedGround = key
      underProps()
    }
    const props = sheet(`props:${key}`)
    for (
      let cx = Math.floor((this.camera.x - halfW - 64) / PROP_CELL);
      cx * PROP_CELL < this.camera.x + halfW + 64;
      cx++
    )
      for (
        let cy = Math.floor((this.camera.y - halfH - 64) / PROP_CELL);
        cy * PROP_CELL < this.camera.y + halfH + 128;
        cy++
      ) {
        for (const prop of propsAt(key, cx, cy)) {
          const frame = props[prop.name].frames[0]
          const foot = footprint(frame)
          if (foot.rx && !FLAT_PROPS.has(prop.name))
            this.shadow(prop.x - frame.w / 2 + foot.cx, prop.y - frame.h + 6 + foot.y + 1, foot.rx, 0.2 * alpha, 0.2)
          this.art(frame, prop.x, prop.y, frame.w / 2, frame.h - 6, false, alpha)
        }
      }
  }

  private appearanceTargets() {
    const view = this.appearanceView
    if (!view || view.phase !== 'playing') return []
    const next = STAGES[STAGES.indexOf(stageAt(view.time)) + 1]
    if (!next) return []
    const remaining = timeAtAge(next.age) - view.time
    if (remaining <= 0 || remaining > 5) return []
    const body = bodyFor(next)
    return [
      ...new Set(view.players.filter((player) => !player.downed).map((player) => appearanceFor(player, body)))
    ].filter((appearance) => !this.warmedAppearances.has(appearance))
  }

  private prewarmAppearances(view: View) {
    if (this.appearanceTime !== undefined && (view.time < this.appearanceTime || view.time - this.appearanceTime > 1)) {
      retainAppearancePrewarm([])
    }
    this.appearanceTime = view.time
    this.appearanceView = view
    retainAppearancePrewarm(this.appearanceTargets().map((appearance) => `player:${appearance}`))
    if (typeof requestIdleCallback !== 'function' || this.appearancePending || !this.appearanceTargets().length) return
    this.appearancePending = true
    const requestedAt = performance.now()
    requestIdleCallback((deadline) => {
      this.appearancePending = false
      if (performance.now() - requestedAt > 250 || deadline.didTimeout || deadline.timeRemaining() < 1) return
      const appearance = this.appearanceTargets()[0]
      if (!appearance) return
      if (prewarmAppearanceFrame(`player:${appearance}`)) this.warmedAppearances.add(appearance)
    })
  }

  /** Builds this stage's death animations one per idle callback, so going down never hitches. */
  private prewarm(body: string) {
    if (typeof requestIdleCallback !== 'function' || this.warmedDeaths.has(body)) return
    this.warmedDeaths.add(body)
    const deaths = sheet(`death:${body}`)
    const kinds = Object.keys(deaths)
    const next = () => {
      const kind = kinds.shift()
      if (!kind) return
      void deaths[kind]
      requestIdleCallback(next, { timeout: 2000 })
    }
    requestIdleCallback(next, { timeout: 2000 })
  }

  /** Eases guest-side entities between snapshots; hosts pass smooth=false. */
  private ease(id: number, x: number, y: number, k: number) {
    const entry = this.shown.get(id)
    if (!entry || Math.hypot(entry.x - x, entry.y - y) > 200) {
      this.shown.set(id, { x, y, seen: this.frame })
      return { x, y }
    }
    entry.x += (x - entry.x) * k
    entry.y += (y - entry.y) * k
    entry.seen = this.frame
    return entry
  }

  playerPosition(player: ViewPlayer, k: number) {
    const entry = this.shownPlayers.get(player.id)
    if (!entry || Math.hypot(entry.x - player.x, entry.y - player.y) > 200) {
      const fresh = { x: player.x, y: player.y }
      this.shownPlayers.set(player.id, fresh)
      return fresh
    }
    entry.x += (player.x - entry.x) * k
    entry.y += (player.y - entry.y) * k
    return entry
  }

  private enemySheet(index: number) {
    return (this.enemySheets[index] ??= sheet(`enemy:${ENEMIES[index].id}`))
  }

  /** The "!" speech bubble above a winding-up enemy (cached). */
  private bang() {
    return this.hires('bang', 14, 18, (ctx, w) => {
      ctx.fillStyle = '#15101c'
      ctx.fillRect(1, 1, w - 2, 13)
      ctx.fillRect(0, 2, w, 11)
      ctx.fillRect(4, 14, 4, 3)
      ctx.fillStyle = '#fff6f0'
      ctx.fillRect(2, 2, w - 4, 11)
      ctx.fillRect(1, 3, w - 2, 9)
      ctx.fillRect(5, 13, 2, 3)
      ctx.fillStyle = '#e8302e'
      ctx.fillRect(6, 3, 2, 6)
      ctx.fillRect(6, 10, 2, 2)
    })
  }

  private enemy(e: Ent) {
    const def = e.def!
    const ctx = this.ctx
    this.world()
    const st = e.state!
    const boss = def.behavior === 'boss'
    const elite = (e.flags & ENEMY_FLAG.elite) !== 0
    const windup = (e.flags & ENEMY_FLAG.windup) !== 0
    const blink = (e.flags & ENEMY_FLAG.blink) !== 0
    const ghost = (e.flags & ENEMY_FLAG.ghost) !== 0
    const scale = elite ? 1.25 : 1
    const id = e.id
    const spawn = clamp01((this.clock - st.born) / 0.25)
    let x = e.x
    let y = e.yy
    let alpha = 0.25 + 0.75 * easeOut(spawn)
    let sx = scale
    let sy = scale
    // Spawn-in: rises out of the ground a few px while fading in.
    y += (1 - easeOut(spawn)) * 8
    if (ghost) {
      x += Math.sin(this.clock * 2.2 + id) * 2.4
      y += Math.sin(this.clock * 1.7 + id * 1.3) * 1.6
      alpha *= 0.46 + 0.06 * Math.sin(this.clock * 3 + id)
    }
    if (blink) {
      alpha *= 0.25 + 0.4 * Math.abs(Math.sin(this.clock * 34 + id))
      sx *= 0.9
      sy *= 1.06
    }
    if (windup) {
      // Coiling up before the dash: a nervous shiver.
      const t = Math.floor(this.clock * 40)
      x += (hash(t, id) - 0.5) * 3
      y += (hash(t, id + 77) - 0.5) * 1.6
    }
    const feet = y + def.radius * scale * 0.8
    const art = this.enemySheet(e.kind)
    if (boss) {
      // An ominous pulsing aura with a few dark motes rising off the body.
      const r = def.radius * 3.2
      this.glowAt(x, feet - def.radius * 0.8, r, BOSS_AURA, 0.2 + 0.07 * Math.sin(this.clock * 2.2), false)
      ctx.fillStyle = 'rgba(70,20,60,.55)'
      for (let j = 0; j < 6; j++) {
        const rise = (this.clock * 22 + j * 17) % 72
        ctx.globalAlpha = Math.min(1, (72 - rise) / 30)
        ctx.fillRect(Math.round(x + (hash(j, id) - 0.5) * def.radius * 2.6), Math.round(feet - rise - 4), 2, 2)
      }
      ctx.globalAlpha = 1
    }
    if (elite) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 5 + id)
      this.glowAt(x, feet - def.radius * 0.5, def.radius * 2.6, GOLD, 0.25 + 0.22 * pulse)
    }
    const anim = e.flash ? art.flash : art.move
    const frame = anim.frames[frameIndex(anim, this.clock + (id % 7) * 0.13)]
    const big = frame.w > 64
    const flip = x > this.focus.x && !NO_FLIP.has(def.id)
    const px = big ? 64 : 32
    const py = big ? 120 : 58
    if (elite) {
      const out = goldOutline(frame)
      this.art(out, x, feet, px + 1, py + 1, flip, (0.55 + 0.45 * Math.sin(this.clock * 6 + id) ** 2) * alpha, sx, sy)
    }
    this.art(frame, x, feet, px, py, flip, alpha, sx, sy)
    this.world()
    // Regular enemies get a small, quiet name tag; life-event bosses keep a big one.
    if (boss) this.blit(this.label(def.name, 16, '#ffe08a'), x, feet + 14)
    else if (alpha > 0.5 && (this.entCount < 60 || Math.abs(x - this.focus.x) + Math.abs(feet - this.focus.y) < 260))
      this.blit(this.label(def.name, 8, '#f4ecff', true), x, feet + 7, 0, 0.75)
    const top = feet - (boss ? 108 : 50 * scale)
    const bar = this.bars
    if (windup) {
      // "!" pops over the head (bigger on bosses).
      const pop = 1 + 0.55 * Math.max(0, 1 - (this.clock - st.windup) / 0.14)
      const bob = Math.sin(this.clock * 30) * 1
      this.blit(this.bang(), x, top - (boss ? 18 : 8) + bob, 0, 1, (boss ? 1.5 : 1) * pop)
    }
    if (elite) {
      const w = def.radius * 2 * scale
      bar.push(x - w / 2, top, w, (w * e.hp) / 100, 3, 2)
    } else if (boss || e.hp < 100) {
      // Life bars are collected and drawn together after the crowd.
      const w = def.radius * 2
      bar.push(x - w / 2, top, w, (w * e.hp) / 100, boss ? 6 : 3, boss ? 1 : 0)
    }
  }

  /** All pending enemy life bars in three fills. */
  private lifeBars() {
    const bars = this.bars
    if (!bars.length) return
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(0,0,0,.6)'
    ctx.beginPath()
    for (let i = 0; i < bars.length; i += 6) ctx.rect(bars[i], bars[i + 1], bars[i + 2], bars[i + 4])
    ctx.fill()
    const colors = ['#ffb3b3', '#ff5d73', GOLD]
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = colors[c]
      ctx.beginPath()
      for (let i = 0; i < bars.length; i += 6)
        if (bars[i + 5] === c) ctx.rect(bars[i], bars[i + 1], bars[i + 3], bars[i + 4])
      ctx.fill()
    }
    bars.length = 0
  }

  private player(
    player: ViewPlayer,
    pos: { x: number; y: number },
    local: boolean,
    time: number,
    phase: View['phase'],
    tagLift = 0
  ) {
    const ctx = this.ctx
    const feet = pos.y + 16
    const size = bodyScale(
      player.passives.find(([id]) => id === 'p_large')?.[1] ?? 0,
      player.passives.find(([id]) => id === 'p_small')?.[1] ?? 0
    )
    const stage = stageAt(time)
    const body = bodyFor(stage)
    const appearance = appearanceFor(player, body)
    // Movement from the eased on-screen position (views carry no velocity).
    const m = this.motion.get(player.id) ?? { x: pos.x, y: pos.y, speed: 0 }
    const step = Math.hypot(pos.x - m.x, pos.y - m.y)
    m.speed += (Math.min(400, step * 60) - m.speed) * 0.25
    m.x = pos.x
    m.y = pos.y
    this.motion.set(player.id, m)
    const buffs = (['food_damage', 'food_defense', 'food_speed'] as const).filter((kind) => player.cookingBuffs?.[kind])
    // Name tag and buff labels as drawn below; their measured widths shape the area food labels keep clear of.
    const logical = (canvas?: HTMLCanvasElement) => (canvas ? canvas.width / ((canvas as Label).res || 1) : 0)
    const nameTag = this.label(local ? `${player.name}（あなた）` : player.name, 11, player.color)
    const tags = buffs.map((kind) => this.label(COOKING_EFFECTS[kind].short, 11, COOKING_EFFECTS[kind].color))
    const tagWidths = tags.map((tag) => logical(tag) - 6)
    // The texts as drawn (the tag canvases are padded): the name, and the row from the first buff's text to the last's.
    const name = this.labelWidth(local ? `${player.name}（あなた）` : player.name, 11)
    const texts = buffs.map((kind) => this.labelWidth(COOKING_EFFECTS[kind].short, 11))
    const rowWidth = tags.length
      ? tagWidths.reduce((sum, w) => sum + w, 0) -
        (tagWidths[0] - texts[0]) / 2 -
        (tagWidths[tags.length - 1] - texts[tags.length - 1]) / 2
      : 0
    const badge = local && !player.downed && Boolean(player.gambleWeapon)
    const box = playerBox(pos.x, feet, size, tagLift, {
      name,
      buffs: rowWidth,
      badge,
      badgeSide: badge ? this.gambleBadges.get(player.id)?.side : undefined
    })
    if (buffs.length) {
      this.world()
      ctx.save()
      // Soft aura under the feet in every buff colour, then the rotating rings and rising arrows.
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 2.4 * this.fx.motion)
      buffs.forEach((kind, index) => {
        this.glowEllipse(
          pos.x,
          feet,
          (30 + index * 4) * size,
          (11 + index * 1.5) * size,
          COOKING_EFFECTS[kind].color,
          0.5 + 0.15 * pulse
        )
      })
      ctx.lineWidth = 2.5
      buffs.forEach((kind, index) => {
        const angle = this.clock * this.fx.motion + index * 2
        const color = COOKING_EFFECTS[kind].color
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.ellipse(pos.x, feet, (22 + index * 5) * size, (8 + index * 2) * size, 0, angle, angle + Math.PI * 1.7)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = color
        for (let n = 0; n < 2; n++) {
          const t = (this.clock * 0.55 * this.fx.motion + n * 0.5 + index * 0.31) % 1
          const px = pos.x + Math.sin(index * 2.1 + n * 3.7) * (14 + index * 3) * size
          const py = feet - 4 * size - t * 46 * size
          const a = Math.sin(t * Math.PI)
          ctx.globalAlpha = 0.85 * a
          ctx.beginPath()
          ctx.moveTo(px, py - 3 * size)
          ctx.lineTo(px + 3 * size, py + 1 * size)
          ctx.lineTo(px + 1 * size, py + 1 * size)
          ctx.lineTo(px + 1 * size, py + 3 * size)
          ctx.lineTo(px - 1 * size, py + 3 * size)
          ctx.lineTo(px - 1 * size, py + 1 * size)
          ctx.lineTo(px - 3 * size, py + 1 * size)
          ctx.closePath()
          ctx.fill()
        }
      })
      ctx.restore()
    }
    // Identity ring at the feet (player colour), drawn under the sprite.
    this.world()
    ctx.strokeStyle = player.color
    if (phase === 'reaper' || phase === 'won')
      ctx.globalAlpha = Math.max(0, 1 - (this.clock - (this.beamAt ?? this.clock)) / 0.6)
    ctx.lineWidth = local ? 3 : 2
    ctx.beginPath()
    ctx.ellipse(pos.x, feet, 17 * size, 6 * size, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    const flip = player.fx < 0
    // 大往生: a peaceful smile while the reaper comes, then the haloed soul rises beside it.
    const ending = body === 'bed' && !player.downed && (phase === 'reaper' || phase === 'won')
    if (phase !== 'won') this.wonAt = undefined
    else if (this.wonAt === undefined) this.wonAt = this.clock
    if (ending) {
      const won = sheet('death:bed').won
      const t = this.wonAt === undefined ? 0 : this.clock - this.wonAt
      this.shadow(pos.x, feet, 13 * size)
      this.art(won.frames[this.wonAt === undefined ? 0 : frameAt(won, t)], pos.x, feet, 32, 58, flip, 1, size)
      const soul = this.wonAt === undefined ? undefined : soulAt(t, duration(won), 'halo')
      // Drawn after the reaper (in front of it), so the soul is seen rising to meet it.
      if (soul) this.halo = { x: pos.x + soul.dx, y: feet + soul.dy, t, alpha: soul.alpha }
      this.world()
    } else if (player.downed) {
      let death = this.deaths.get(player.id)
      if (!death) {
        const tag = player.killer ? ENEMY_BY_ID.get(player.killer)?.tag : undefined
        death = { at: this.clock, body: appearance, kind: deathKind(tag, ageAt(time), body) }
        this.deaths.set(player.id, death)
        // Measured for the dev hook: the cost of the death animation on the frame a player goes down.
        const start = performance.now()
        void sheet(`death:${death.body}`)[death.kind]
        this.deathBuildMs = performance.now() - start
      }
      const anim = sheet(`death:${death.body}`)[death.kind] ?? sheet(`death:${death.body}`).collapse
      const t = this.clock - death.at
      const index = frameAt(anim, t)
      // A lifted body leaves its shadow on the floor, smaller.
      this.shadow(pos.x, feet, 13 * size * (1 - (anim.lift?.[index] ?? 0) / 40))
      this.art(anim.frames[index], pos.x, feet, 32, 58, flip, anim.alpha?.[index] ?? 1, size)
      // Lettering is never mirrored: drawn unflipped at the mirrored position.
      const text = anim.text?.[index]
      if (text) {
        const box = letterBox(text)
        const ox = flip ? 64 - box.x - box.r.w : box.x
        this.art(box.r, pos.x, feet, 32 - ox, 58 - box.y, false, anim.alpha?.[index] ?? 1, size)
      }
      const soul = soulAt(t, duration(anim), anim.soul)
      if (soul) {
        const kind = sheet('soul')[anim.soul === 'ghost' ? 'ghost' : 'float']
        this.art(kind.frames[frameAt(kind, t)], pos.x, feet + soul.dy, 8, 16, false, soul.alpha)
      }
      this.world()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 28, -Math.PI / 2, -Math.PI / 2 + player.revive * Math.PI * 2)
      ctx.stroke()
    } else {
      this.deaths.delete(player.id)
      this.shadow(pos.x, feet, 13 * size)
      this.prewarm(appearance)
      const art = sheet(`player:${appearance}`)
      const anim = player.hurt ? art.hurt : m.speed > 25 ? art.walk : art.idle
      this.art(
        anim.frames[frameAt(anim, player.hurt ? ((this.clock * 8) % 2) / 8 : this.clock)],
        pos.x,
        feet,
        32,
        58,
        flip,
        1,
        size
      )
      this.world()
    }
    // In the finale the name tag and bar fade away so the bed and the rising soul are unobstructed.
    const shown =
      phase === 'reaper' || phase === 'won' ? Math.max(0, 1 - (this.clock - (this.beamAt ?? this.clock)) / 0.6) : 1
    if (shown <= 0) return box
    // What is drawn over her head: her gamble badge, buff rows and name tag.
    const overhead = () => {
      const gambleShown = local && !player.downed ? this.gambleBadge(player) : undefined
      if (gambleShown) {
        const icon = weaponAppearance(gambleShown, ageAt(time), player.petAge).art
        const frame = (sheet('icons')[icon] ?? sheet('icons')[gambleShown]).frames[0]
        const bob = Math.sin(this.clock * 3.2) * 1.6
        // Above the shoulder that hides fewer of her 過保護親 (see easeBadgeSide); the tail points back toward the head.
        const side = this.gambleBadges.get(player.id)?.side ?? 1
        const tail = side < 0 ? -1 : 1
        const bx = pos.x + 26 * size * side
        const by = feet - 50 * size + bob
        const ctx = this.ctx
        this.world()
        ctx.save()
        ctx.shadowColor = 'rgba(255, 215, 94, 0.55)'
        ctx.shadowBlur = 6
        this.roundPath(bx - 11, by - 11, 22, 22, 6)
        ctx.fillStyle = '#34203b'
        ctx.fill()
        ctx.restore()
        ctx.save()
        this.roundPath(bx - 11, by - 11, 22, 22, 6)
        ctx.strokeStyle = '#ffd75e'
        ctx.lineWidth = 1.6
        ctx.stroke()
        this.roundPath(bx - 9, by - 9, 18, 18, 4.5)
        ctx.strokeStyle = 'rgba(255, 242, 176, 0.35)'
        ctx.lineWidth = 0.8
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(bx - 4 * tail, by + 10.5)
        ctx.lineTo(bx - 7 * tail, by + 15)
        ctx.lineTo(bx + tail, by + 10.5)
        ctx.closePath()
        ctx.fillStyle = '#ffd75e'
        ctx.fill()
        ctx.restore()
        this.art(frame, bx, by, frame.w / 2, frame.h / 2, false, 1, 0.5)
        this.world()
      }
      if (buffs.length) {
        // One label per buff in its own colour, laid out side by side and centred on the player.
        let x = pos.x - tagWidths.reduce((sum, w) => sum + w, 0) / 2
        tags.forEach((tag, index) => {
          this.blit(tag, x + tagWidths[index] / 2, feet - 80 * size - tagLift, 0, shown)
          x += tagWidths[index]
        })
      }
      this.blit(nameTag, pos.x, feet - 64 * size - tagLift, 0, shown)
    }
    // (While the characters are drawn, after them all: see draw.)
    if (this.overheads) this.overheads.push(overhead)
    else overhead()
    return box
  }

  /** A player's family this frame (kept per player so they ease along between frames). */
  private family(player: ViewPlayer, pos: { x: number; y: number }, phase: View['phase'], dt: number) {
    let crew = this.families.get(player.id)
    if (!crew) this.families.set(player.id, (crew = []))
    return followFamily(crew, player, phase, pos, dt)
  }

  /** One family member: smaller than the player, with a small healing plus now and then while it is needed. */
  private follower(m: Follower) {
    const feet = m.y + 16
    const art = sheet(m.sheet)
    const anim = m.speed > 25 ? art.walk : art.idle
    this.shadow(m.x, feet, 13 * FAMILY_SCALE)
    this.art(anim.frames[frameAt(anim, this.clock + m.phase)], m.x, feet, 32, 58, m.flip, 1, FAMILY_SCALE)
    if (m.heal) {
      const t = (this.clock + m.phase * 2) % FAMILY_HEAL_EVERY
      if (t < 0.7)
        this.art(pick(sheet('fx').heal, t), m.x + 2, feet - 44 * FAMILY_SCALE - t * 12, 6, 6, false, 1 - t / 0.7, 0.8)
    }
    this.world()
  }

  // -------------------------------------------------------------------------------------------
  // Weapons.

  /** Loads shot `i` of a view's flat array into the scratch record. */
  private load(view: View, origins: { x: number; y: number }[], i: number) {
    const s = view.shots
    const sh = this.shot
    const ownerIndex = s[i + 6]
    sh.i = i
    sh.x = s[i + 1]
    sh.y = s[i + 2]
    sh.r = s[i + 3]
    // (過保護親's field carries the frame of her walk too: GUARD_STEP.)
    sh.step = WEAPONS[s[i]]?.id === 'p_over' ? Math.round(s[i + 4] / GUARD_STEP) : 0
    sh.angle = (s[i + 4] - sh.step * GUARD_STEP) / 100
    sh.life = s[i + 5] / 100
    sh.age = 1 - sh.life
    const copied = (s[i + 7] & SHOT_GAMBLE) !== 0
    sh.copied = copied
    sh.v = s[i + 7] & ~SHOT_GAMBLE
    const origin = origins[ownerIndex]
    sh.ox = origin ? origin.x : sh.x
    sh.oy = origin ? origin.y : sh.y
    const weaponIndex = copied ? WEAPON_INDEX.get('w_gamble')! : s[i]
    const key = ownerIndex * 64 + weaponIndex
    let known = key < this.evo.length ? this.evo[key] : 0
    if (!known) {
      known = isEvolvedView(view.players[ownerIndex], WEAPONS[weaponIndex].id) ? 2 : 1
      if (key < this.evo.length) this.evo[key] = known
    }
    sh.evolved = known === 2
    return sh
  }

  /** The ground whose props the beds were drawn under this frame (to find the props a flower stands near). */
  private bedGround = ''

  /**
   * A garden bed in bloom. The bed itself (soil, rim and the flowers behind a standing prop) is drawn in the ground
   * pass, under the props; the flowers in front of a prop, the sprout fading out, sparkles and pollen come afterwards.
   */
  private gardenBed(sh: ShotView, layer: 'under' | 'over') {
    const ctx = this.ctx
    const fx = sheet('fx')
    const { x, y, r: radius, life, evolved } = sh
    const alpha = Math.min(1, life * 4)
    const art = sheet('weapon:w_garden')
    // The bed grows in over ~0.35 s from when it is first seen blooming. A bed already well into its life when
    // first seen (the page opened on it) is drawn fully grown.
    const key = Math.round(x) * 1e6 + Math.round(y)
    let bloom = this.blooms.get(key)
    if (!bloom) {
      bloom = { at: sh.age > 0.1 ? this.clock - 10 : this.clock, frame: this.frame }
      this.blooms.set(key, bloom)
    }
    bloom.frame = this.frame
    const since = this.clock - bloom.at
    const grow = clamp01(since / 0.15)
    const back = 1 + 2.70158 * Math.pow(grow - 1, 3) + 1.70158 * Math.pow(grow - 1, 2)
    const bedScale = grow >= 1 ? 1 : 0.6 + 0.4 * back
    const bedAlpha = alpha * (grow >= 1 ? 1 : clamp01(grow * 3))
    const kinds = [art.bloom, art.tulip, art.daisy]
    // Each bed is seeded by its fixed spot: neighbouring beds differ and never reshuffle as other shots expire.
    const seed = hash(Math.round(x), Math.round(y))
    const flowers = (front: boolean) =>
      flowerSpots(radius, Math.floor(seed * 4)).forEach((spot, n) => {
        if (this.flowerInFront(x + spot.x, y + spot.y) !== front) return
        // Each flower shoots up from its stem base in turn: 0 -> 1.1 -> 1 tall.
        const u = clamp01((since - Math.min(n * 0.045, 0.2)) / 0.15)
        if (u <= 0.02) return
        const frame = pick(kinds[spot.kind], this.clock + spot.phase)
        if (u >= 1) {
          // The sprite's stem base sits 14 px below its centre.
          this.centred(frame, x + spot.x, y + spot.y - 14, evolved, alpha)
        } else {
          const tall = u < 0.6 ? (1.1 * u) / 0.6 : 1.1 - (0.1 * (u - 0.6)) / 0.4
          const f = evolved ? evolve(frame) : frame
          this.art(f, x + spot.x, y + spot.y, f.w / 2, f.h / 2 + 14, false, alpha, 1, tall)
        }
      })
    if (layer === 'under') {
      const bed = flowerBed(radius)
      this.art(bed, x, y, bed.w / 2, bed.h / 2, false, bedAlpha * 0.96, bedScale)
      if (evolved) {
        this.world()
        ctx.strokeStyle = `rgba(255,209,102,${0.55 * bedAlpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, (radius - 1) * bedScale, 0, TAU)
        ctx.stroke()
      }
      flowers(false)
      // Soft rim (the harvest-green ring the bloom stage is known by).
      this.world()
      ctx.strokeStyle = `rgba(214,243,138,${0.4 * bedAlpha})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, radius * bedScale, 0, TAU)
      ctx.stroke()
      return
    }
    if (since < 0.1) {
      // The sprout it grew from fades out in place as the bed appears.
      this.shadow(x, y + 10, 9, 0.2 * (1 - since * 10))
      this.centred(pick(art.sprout, this.clock + sh.i * 0.1), x, y, evolved, 1 - since * 10)
    }
    flowers(true)
    // A few sparkles scatter as it blooms.
    if (since < 0.4) {
      const t = since / 0.4
      for (let k = 0; k < 5; k++) {
        const a = k * 2.4 + seed * 6
        const reach = radius * (0.25 + 0.65 * t) * (0.75 + 0.1 * (k % 3))
        const sa = Math.sin(t * Math.PI) * 0.9 * alpha
        this.art(
          pick(fx.spark, this.clock * 6 + k),
          x + Math.cos(a) * reach,
          y + Math.sin(a) * reach * 0.6 - 8 - 10 * t,
          6,
          6,
          false,
          sa,
          0.8
        )
      }
    }
    // Pollen and petals drifting up out of the bed.
    this.world()
    const dots = [R.yellow[0], R.pink[1], R.paper[0]]
    for (let j = 0; j < 6; j++) {
      const t = (this.clock * 0.45 + j / 6 + seed) % 1
      const a = (j * 2.4 + seed * 7) * 1.7
      const px = Math.round(x + Math.cos(a) * radius * 0.7 + Math.sin(t * 6 + j) * 3)
      const py = Math.round(y + Math.sin(a) * radius * 0.5 - 6 - t * 26)
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.9 * alpha
      ctx.fillStyle = PALETTE[dots[j % 3]]
      ctx.fillRect(px, py, 2, 2)
    }
    ctx.globalAlpha = 1
  }

  /** Whether a flower standing at (x, foot) is in front of a standing prop it overlaps (so it is drawn over the prop). */
  private flowerInFront(x: number, foot: number) {
    if (!this.bedGround) return false
    const props = sheet(`props:${this.bedGround}`)
    for (let cx = Math.floor((x - 64) / PROP_CELL); cx * PROP_CELL < x + 64; cx++)
      for (let cy = Math.floor((foot - 64) / PROP_CELL); cy * PROP_CELL < foot + 128; cy++)
        for (const prop of propsAt(this.bedGround, cx, cy)) {
          if (FLAT_PROPS.has(prop.name)) continue
          const frame = props[prop.name].frames[0]
          const base = prop.y + 6
          if (foot > base && Math.abs(x - prop.x) < frame.w / 2 + 8 && foot - 28 < base) return true
        }
    return false
  }

  /** Ground-level weapon effects: auras, zones, shockwave rings, rings of song and drifting perfume. */
  private groundShot(view: View, sh: ShotView, def: (typeof WEAPONS)[number]) {
    const ctx = this.ctx
    const fx = sheet('fx')
    const { x, y, r: radius, angle, life, age, evolved, i } = sh
    switch (def.behavior) {
      case 'observe': {
        if (sh.v % 2 === 0) break
        const alpha = clamp01(life * 4)
        this.world()
        // A "nature lens": a soft green pool, a slowly turning dashed rim, ripples and leaves drawn inward.
        const grow = clamp01(sh.age * 8)
        const fill = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius)
        fill.addColorStop(0, `rgba(140,204,105,${0.033 * alpha})`)
        fill.addColorStop(1, `rgba(140,204,105,${0.13 * alpha})`)
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, TAU)
        ctx.fill()
        // A gamble's copy rims its field in the gamble's gold, telling it from the child's own.
        ctx.strokeStyle = sh.copied ? `rgba(255,215,94,${0.85 * alpha})` : `rgba(198,245,190,${0.7 * alpha})`
        ctx.lineWidth = 2
        ctx.setLineDash([9, 7])
        ctx.lineDashOffset = -this.clock * 14
        ctx.beginPath()
        ctx.ellipse(x, y, radius * (0.9 + 0.1 * grow), radius * (0.9 + 0.1 * grow), 0, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineWidth = 1.5
        for (let k = 0; k < 3; k++) {
          const t = (this.clock * 0.5 + k / 3) % 1
          const rr = radius * (0.92 - 0.8 * t)
          ctx.strokeStyle = `rgba(214,243,190,${0.42 * alpha * Math.sin(t * Math.PI)})`
          ctx.beginPath()
          ctx.ellipse(x, y, rr, rr, 0, 0, TAU)
          ctx.stroke()
        }
        // Seeded by the creature's spot (it never moves), so the swirl does not jump when other shots come and go.
        const swirl = hash(Math.round(x), Math.round(y)) * TAU
        for (let k = 0; k < 6; k++) {
          const t = (this.clock * 0.35 + k / 6) % 1
          const a = k * 2.4 + t * 2.2 + swirl
          const rr = radius * (0.95 - 0.85 * t)
          const px = x + Math.cos(a) * rr
          const py = y + Math.sin(a) * rr * 0.9
          this.art(pick(fx.spark, this.clock * 3 + k), px, py, 6, 6, false, alpha * Math.sin(t * Math.PI) * 0.9, 0.6)
        }
        break
      }
      case 'sweep': {
        // A plane flies above everything: only a small, faint shadow falls on the ground far below it.
        if (this.isPlane(view, def)) this.shadow(x, y + 27, 9, 0.14)
        break
      }
      case 'garden': {
        if (sh.v === 0) this.seedShadow(view, sh, def)
        if (sh.v === 1) this.gardenBed(sh, 'over')
        break
      }
      case 'beam': {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const dir = ((Math.round((angle / TAU) * BEAM_DIRS) % BEAM_DIRS) + BEAM_DIRS) % BEAM_DIRS
        const raster = beam(radius, dir)
        this.warmBeam(radius)
        const alpha = clamp01(age * 9) * clamp01(life * 4) * (0.88 + 0.12 * Math.sin(this.clock * 55 + i))
        const cx = sh.ox + cos * radius
        const cy = sh.oy + sin * radius
        if (evolved) {
          this.world()
          ctx.globalCompositeOperation = 'lighter'
          ctx.strokeStyle = `rgba(255,215,94,${0.22 * alpha})`
          ctx.lineWidth = 26
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(sh.ox, sh.oy)
          ctx.lineTo(sh.ox + cos * radius * 2, sh.oy + sin * radius * 2)
          ctx.stroke()
          ctx.lineCap = 'butt'
          ctx.globalCompositeOperation = 'source-over'
        }
        this.art(raster, cx, cy, raster.w / 2, raster.h / 2, false, alpha)
        const book = pick(sheet('weapon:w_reading').fly, this.clock + i * 0.1)
        this.centred(book, sh.ox + cos * 12, sh.oy + sin * 12 - 6, evolved, clamp01(life * 5))
        break
      }
      case 'aura':
      case 'zone': {
        const pos = def.behavior === 'aura' ? { x: sh.ox, y: sh.oy } : { x, y }
        if (def.behavior === 'zone') {
          // 娯楽: an arcade play-mat with a controller and floating pixels.
          const mat = playMat(radius)
          this.art(mat, pos.x, pos.y, mat.w / 2, mat.h / 2, false, 0.4)
          this.art(fx.controller.frames[0], pos.x, pos.y, 9, 6)
          fx.pixels.frames.forEach((p, j) => {
            const a = this.clock * 1.3 + j * 1.7 + i
            this.art(
              p,
              pos.x + Math.cos(a) * radius * 0.6,
              pos.y + Math.sin(a * 1.3) * radius * 0.5 - ((this.clock * 20 + j * 13) % 20),
              1,
              1
            )
          })
        } else {
          // 毒親: a faint toxic ground ring with wisps and skull puffs circling over it.
          this.world()
          ctx.fillStyle = 'rgba(122,98,161,0.24)'
          ctx.strokeStyle = 'rgba(173,143,211,0.6)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.ellipse(pos.x, pos.y + 8, radius, radius * 0.92, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          for (let j = 0; j < 12; j++) {
            // Two swirling rings of wisps and skull puffs at different speeds.
            const inner = j % 2
            const a = this.clock * (inner ? -1.8 : 1.3) + (j * Math.PI) / 6
            const sprite = j % 4 === 3 ? fx.skull.frames[0] : pick(fx.wisp, this.clock + j * 0.2)
            this.art(
              sprite,
              pos.x + Math.cos(a) * radius * (inner ? 0.45 : 0.8),
              pos.y + 8 + Math.sin(a) * radius * (inner ? 0.4 : 0.72),
              sprite.w / 2,
              sprite.h / 2,
              false,
              0.85
            )
          }
          if (evolved)
            for (let j = 0; j < 4; j++)
              this.art(
                pick(fx.star, this.clock + j),
                pos.x + Math.cos(j * 1.6 + this.clock) * radius * 0.4,
                pos.y + Math.sin(j * 1.6 + this.clock) * radius * 0.4,
                4,
                4
              )
        }
        break
      }
      case 'slam': {
        // 筋トレ: the shockwave spreads over the floor as a cracked ring with dust puffs, at its real radius.
        const a = sh.age
        const grow = easeOut(a * 3.2)
        const ring = radius * (0.3 + 0.7 * grow)
        const fade = clamp01(sh.life * 2.2)
        this.world()
        ctx.fillStyle = `rgba(255,236,190,${0.13 * fade})`
        ctx.beginPath()
        ctx.arc(x, y, ring, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`
        ctx.lineWidth = 4 * (1 - a * 0.6)
        ctx.beginPath()
        ctx.arc(x, y, ring, 0, TAU)
        ctx.stroke()
        if (evolved) {
          ctx.strokeStyle = `rgba(255,215,94,${0.6 * fade})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, ring * 0.82, 0, TAU)
          ctx.stroke()
        }
        const cracks = Math.max(6, Math.min(14, Math.round(ring / 11)))
        const crack = fx.crack.frames[a > 0.35 ? 1 : 0]
        for (let j = 0; j < cracks; j++) {
          const ang = (j / cracks) * TAU + 0.25
          this.art(crack, x + Math.cos(ang) * ring * 0.96, y + Math.sin(ang) * ring * 0.96, 24, 12, j % 2 === 1, fade)
        }
        const dust = fx.dust.frames
        for (let j = 0; j < 10; j++) {
          const ang = (j / 10) * TAU + 0.6
          const d = dust[Math.min(dust.length - 1, Math.floor(a * 3.4 + (j % 3) * 0.2))]
          this.art(d, x + Math.cos(ang) * ring, y + Math.sin(ang) * ring - a * 14, 8, 11, false, fade * 0.9, 1.5)
        }
        break
      }
      case 'nova': {
        // カラオケ: a faint soundwave ring under the song.
        const fade = clamp01(sh.life * 2.5)
        this.world()
        ctx.strokeStyle = evolved ? `rgba(255,215,94,${0.32 * fade})` : `rgba(255,170,215,${0.3 * fade})`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(sh.ox, sh.oy, radius, sh.angle - Math.PI / 3, sh.angle + Math.PI / 3)
        ctx.stroke()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = `rgba(255,255,255,${0.35 * fade})`
        ctx.beginPath()
        ctx.arc(sh.ox, sh.oy, Math.max(2, radius - 6), sh.angle - Math.PI / 3, sh.angle + Math.PI / 3)
        ctx.stroke()
        break
      }
      case 'trail': {
        // 香水: a cloud of three drifting puffs that thins out as it lingers.
        const a = sh.age
        const fade = clamp01(a * 7) * clamp01(sh.life * 2.5) * 0.82
        const puff = Math.max(1, Math.min(1.6, radius / 26))
        const drift = a * 10
        for (let j = 0; j < 3; j++) {
          const ang = this.clock * 0.7 + i * 1.3 + (j * TAU) / 3
          const cx = x + Math.cos(ang) * radius * 0.42 + Math.sin(this.clock * 1.8 + i + j) * 2
          const cy = y + Math.sin(ang) * radius * 0.34 - drift
          const frame = fx.perfume.frames[(j + Math.floor(this.clock * 3 + i)) % 3]
          this.art(
            evolved ? evolve(frame) : frame,
            cx,
            cy,
            16,
            16,
            false,
            fade,
            puff * (0.9 + 0.2 * Math.sin(this.clock * 2 + j))
          )
        }
        if (evolved && this.clock % 0.5 < 0.25)
          this.art(
            pick(fx.heal, this.clock * 2 + i),
            x + Math.sin(this.clock * 3 + i) * 8,
            y - 14 - drift,
            6,
            6,
            false,
            fade
          )
        break
      }
      case 'mine': {
        // 貯金: the piggy bank on the floor, a hint of a pulse once armed.
        const art = sheet('weapon:w_savings')
        const armed = sh.v === 1
        const frame = pick(armed ? art.armed : art.fly, this.clock + i * 0.2)
        this.shadow(x, y + 10, 11, 0.25)
        const pulse = armed ? 1 + 0.07 * Math.sin(this.clock * 12 + i) : 1
        this.art(evolved ? evolve(frame) : frame, x, y + 4, 16, 22, false, 1, pulse, pulse)
        break
      }
      default:
    }
  }

  /** Streaks of fading afterimages behind a fast projectile heading (hx, hy). */
  /** Afterimages left to draw this frame (fast projectiles only leave trails while the screen is not flooded). */
  private trailBudget = 0

  /**
   * Garden seeds in the air, by owner, weapon and throw direction: where each was first seen (its launch point when
   * `known`), its ground point and progress along its arc (0..1) last frame, and the frame it was last seen.
   */
  private readonly seeds = new Map<
    string,
    { sx: number; sy: number; gx: number; gy: number; p: number; frame: number; known: boolean }
  >()
  /** When each garden bed was first seen in bloom (keyed by its fixed spot), to time its growing-in. */
  private blooms = new Map<number, { at: number; frame: number }>()

  private afterimages(
    frame: Raster,
    x: number,
    y: number,
    hx: number,
    hy: number,
    step: number,
    evolved: boolean,
    n = 3
  ) {
    n = Math.min(n, this.trailBudget)
    this.trailBudget -= n
    for (let k = n; k >= 1; k--)
      this.centred(frame, x - hx * step * k, y - hy * step * k, evolved, 0.32 - k * 0.07, 1 - k * 0.04)
  }

  /** A jagged lightning bolt between two points, flickering as it lives. */
  private bolt(x0: number, y0: number, x1: number, y1: number, i: number, alpha: number, evolved: boolean) {
    const ctx = this.ctx
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    const n = Math.max(2, Math.floor(len / 15))
    const nx = -dy / len
    const ny = dx / len
    const tick = Math.floor(this.clock * 24)
    this.world()
    ctx.lineJoin = 'miter'
    ctx.lineCap = 'butt'
    const stroke = (color: string, width: number, jitter: number, seed: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(Math.round(x0), Math.round(y0))
      for (let j = 1; j < n; j++) {
        const t = j / n
        const off = (hash(i * 31 + j + seed, tick) - 0.5) * jitter
        ctx.lineTo(Math.round(x0 + dx * t + nx * off), Math.round(y0 + dy * t + ny * off))
      }
      ctx.lineTo(Math.round(x1), Math.round(y1))
      ctx.stroke()
    }
    ctx.globalAlpha = alpha
    if (evolved) {
      stroke('rgba(255,209,102,.35)', 7, 16, 0)
      stroke('#ffd166', 3, 16, 0)
      stroke('rgba(255,255,255,.7)', 1, 22, 9)
    } else stroke('rgba(76,201,240,.38)', 6, 14, 0)
    if (!evolved) stroke('#4cc9f0', 3, 14, 0)
    stroke('#ffffff', 1.5, 14, 0)
    ctx.globalAlpha = 1
  }

  /**
   * Feet offset below the shot of a companion standing in the world (生き物観察's creature, a garden sprout, a pet,
   * 過保護親), or undefined for any other shot. Companions sort with the characters on these feet (where their shadow
   * falls), so one further up the screen than its owner is drawn behind them and never over their head or name tag.
   */
  private companionFeet(sh: ShotView, def: (typeof WEAPONS)[number]) {
    switch (def.behavior) {
      case 'observe':
        return 12
      case 'garden':
        return sh.v === 2 ? 10 : undefined
      case 'pet':
        return 7
      case 'orbit':
        return def.id === 'p_over' ? 14 : undefined
      default:
        return undefined
    }
  }

  /** Where a companion is drawn: 過保護親 rides her owner's eased position like the characters do. */
  private companionAt(view: View, sh: ShotView, def: (typeof WEAPONS)[number]) {
    const owner = def.id === 'p_over' ? view.players[view.shots[sh.i + 6]] : undefined
    return owner ? { x: sh.ox + sh.x - owner.x, y: sh.oy + sh.y - owner.y } : { x: sh.x, y: sh.y }
  }

  /** A companion with its shadow and effects, drawn in the Y-sorted character pass. */
  private companion(view: View, sh: ShotView, def: (typeof WEAPONS)[number]) {
    const fx = sheet('fx')
    const { angle, life, evolved, i } = sh
    const { x, y } = this.companionAt(view, sh, def)
    const age = sh.age
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    switch (def.behavior) {
      case 'observe': {
        const kind = OBSERVATION_SPRITES[Math.floor(sh.v / 2)] ?? 'ant'
        const frame = pick(sheet('weapon:w_observe')[kind], this.clock + hash(Math.round(x), Math.round(y)))
        // The summon pops in over the first ~0.5 s of its (12 s at base) stay.
        const pop = age < 0.04 ? age / 0.04 : 1
        const swell = pop < 1 ? 0.55 + 0.45 * pop + 0.35 * Math.sin(pop * Math.PI) : 1
        this.shadow(x, y + 12, 10 * Math.min(1, swell), 0.2)
        this.centred(frame, x, y, evolved, clamp01(life * 4), swell)
        if (age < 0.04) {
          const alpha = 1 - pop
          this.art(fx.poof.frames[Math.min(3, Math.floor(pop * 4))], x, y + 4, 12, 12, false, alpha, 1.1)
          this.art(pick(fx.spark, this.clock * 6), x - 10, y - 10, 6, 6, false, alpha)
          this.art(pick(fx.spark, this.clock * 6 + 2), x + 11, y - 6, 6, 6, false, alpha)
        }
        break
      }
      case 'garden':
        this.shadow(x, y + 10, 9, 0.2)
        this.centred(pick(sheet('weapon:w_garden').sprout, this.clock + i * 0.1), x, y, evolved)
        break
      case 'orbit':
        this.guardian(view, sh, x, y)
        break
      case 'pet': {
        const standing = sh.v >= PET_STILL
        const variant = standing ? sh.v - PET_STILL : sh.v
        const type = PET_TYPES[Math.floor(variant / 2)] ?? PET_TYPES[0]
        const art = sheet(type === 'dog' ? 'weapon:w_pet' : `weapon:w_pet_${type}`)
        const biting = variant % 2 === 1
        const years = view.players[view.shots[i + 6]]?.petAge ?? 0
        const form = petForm(years)
        // Standing, it stands in its bite sheet's first (mouth shut) frame (a rabbit, whose bite lunges forward, sits
        // in its run's first, tucked-up frame), breathing 1 px about once a second; running or biting, it plays the run
        // or bite.
        const frame = standing
          ? (type === 'rabbit' ? art.fly : art.bite).frames[0]
          : pick(biting ? art.bite : art.fly, this.clock * (years >= 12 ? 0.7 : 1) + i * 0.13)
        const flip = cos < 0
        const bob = biting
          ? 0
          : standing
            ? -Number((this.clock + i * 0.37) % 1 < 0.5)
            : Math.abs(Math.sin(this.clock * 12 + i)) * -1.5
        // A new pet pops in over its first ~0.2 s, like a summoned creature; it leaves in a puff over its last ~0.3 s.
        const popTime = PET_POP_SECONDS / def.duration
        const pop = age < popTime ? age / popTime : 1
        const fadeTime = PET_FADE_SECONDS / def.duration
        const fade = life < fadeTime ? 1 - Math.max(0, life) / fadeTime : 0
        const swell = pop < 1 ? 0.55 + 0.45 * pop + 0.35 * Math.sin(pop * Math.PI) : 1
        this.shadow(x, y + 7, 10 * Math.min(1, swell) * (1 - fade), 0.24)
        const f = evolved ? evolve(frame) : frame
        this.art(f, x, y + bob, 16, 22, flip, 1 - fade, form.scale * swell)
        const puff = pop < 1 ? pop : fade > 0 ? fade : -1
        if (puff >= 0) {
          const alpha = pop < 1 ? 1 - pop : 1 - fade * 0.6
          this.art(fx.poof.frames[Math.min(3, Math.floor(puff * 4))], x, y + 3, 12, 12, false, alpha, 1.1)
          this.art(pick(fx.spark, this.clock * 6), x - 10, y - 10, 6, 6, false, alpha)
          this.art(pick(fx.spark, this.clock * 6 + 2), x + 11, y - 6, 6, 6, false, alpha)
        }
        if (biting) {
          const sp = pick(fx.spark, this.clock * 2 + i)
          this.art(sp, x + cos * 14, y + sin * 6 - 6, 6, 6, false, 0.9)
        }
        if (evolved)
          this.art(
            pick(fx.star, this.clock * 2 + i),
            x + Math.cos(this.clock * 6 + i) * 10,
            y - 14 + Math.sin(this.clock * 6 + i) * 4,
            4,
            4
          )
        break
      }
    }
  }

  /**
   * 過保護親 and her shield, which thrusts (GUARD_THRUST px) at an enemy in front of her as she bashes and fades while
   * spent; walking over the ground (GUARD_WALK) she plays her walk. Bashing an enemy off her shield's reach (a standing
   * child's parents guard all round her), she stays put (the ring round the child lights up towards it: drawGuardRings).
   * The gamble's copy of her pops in (swelling, in a puff and sparkles) and leaves in a puff, as a pet does.
   */
  private guardian(view: View, sh: ShotView, x: number, y: number) {
    const art = sheet('weapon:p_over')
    const cos = Math.cos(sh.angle)
    const sin = Math.sin(sh.angle)
    const time = this.clock + sh.i * 0.1
    const flip = cos < 0
    const scale = sh.r / 20
    // (Walking at any pace: GUARD_WALK, GUARD_FAST or both, stepping back.)
    const walking = (sh.v & GUARD_BACK) !== 0
    const progress = Math.floor((sh.v % GUARD_WALK) / 2)
    const swing = progress ? Math.sin((Math.PI * (progress - 1)) / GUARD_BASH_STEPS) : 0
    let thrust = 0
    if (swing > 0) {
      // Her shield goes out at an enemy in front of her within its reach; one further off, the ring strikes.
      const reach = (GUARDIAN_SHIELD_ART.far + GUARD_THRUST) * scale + GUARD_STRIKE_SLACK
      let ahead = false
      const enemies = view.enemies
      for (let k = 0; k < enemies.length && !ahead; k += STRIDE.enemies) {
        const dx = enemies[k + 2] - x
        const dy = enemies[k + 3] - y
        const d = Math.hypot(dx, dy)
        if (d <= reach && dx * cos + dy * sin >= d * GUARD_THRUST_COS) ahead = true
      }
      // (Not over the child, though: her body as drawn, GUARD_CHILD_BOX about her feet.)
      const tx = x + cos * swing * GUARD_THRUST
      const ty = y + sin * swing * GUARD_THRUST
      const left = tx + (flip ? -GUARDIAN_SHIELD_ART.far : GUARDIAN_SHIELD_ART.near) * scale
      const right = tx + (flip ? -GUARDIAN_SHIELD_ART.near : GUARDIAN_SHIELD_ART.far) * scale
      const owner = view.players[view.shots[sh.i + 6]]
      const box = childDrawnBox(
        owner
          ? bodyScale(
              owner.passives.find(([id]) => id === 'p_large')?.[1] ?? 0,
              owner.passives.find(([id]) => id === 'p_small')?.[1] ?? 0
            )
          : 1,
        GUARD_CHILD_BOX
      )
      const onChild =
        Math.min(right, sh.ox + box.right) - Math.max(left, sh.ox + box.left) >= GUARD_CHILD_CLEAR &&
        Math.min(ty + GUARDIAN_SHIELD_ART.bottom * scale, sh.oy + box.bottom) -
          Math.max(ty + GUARDIAN_SHIELD_ART.top * scale, sh.oy + box.top) >=
          GUARD_CHILD_CLEAR
      if (ahead && !onChild) thrust = swing * GUARD_THRUST
    }
    let alpha = Math.min(1, sh.life * 4)
    let swell = 1
    let puff = -1
    let popping = false
    if (sh.copied) {
      const duration = WEAPON_BY_ID.get('p_over')!.duration
      const pop = sh.age * duration < PET_POP_SECONDS ? (sh.age * duration) / PET_POP_SECONDS : 1
      const fade = sh.life * duration < PET_FADE_SECONDS ? 1 - Math.max(0, sh.life * duration) / PET_FADE_SECONDS : 0
      swell = pop < 1 ? 0.55 + 0.45 * pop + 0.35 * Math.sin(pop * Math.PI) : 1
      alpha = 1 - fade
      puff = pop < 1 ? pop : fade > 0 ? fade : -1
      popping = pop < 1
    }
    // (Her walk, while there is one in her sheet; her stepping in place until then.) Walking, her walk is on the frame
    // the game counts by how far she goes over the ground (GUARD_STEP): on through it, or back through it as she steps
    // back (the game counts down), so stepping back or on again she stays on the same frame.
    const walk = art.walk ?? art.fly
    const body = !walking ? pick(art.fly, time) : walk.frames[sh.step % walk.frames.length]
    this.centred(body, x, y, sh.evolved, alpha, swell, flip)
    this.centred(
      pick(art.guard, time),
      x + cos * thrust * swell,
      y + sin * thrust * swell,
      sh.evolved,
      alpha * (sh.v % 2 ? 0.45 : 1),
      scale * swell,
      flip
    )
    if (puff >= 0) {
      const fx = sheet('fx')
      const shown = popping ? 1 - puff : 1 - puff * 0.6
      this.art(fx.poof.frames[Math.min(3, Math.floor(puff * 4))], x, y + 4, 12, 12, false, shown, 1.2)
      this.art(pick(fx.spark, this.clock * 6), x - 11, y - 12, 6, 6, false, shown)
      this.art(pick(fx.spark, this.clock * 6 + 2), x + 12, y - 7, 6, 6, false, shown)
    }
  }

  /**
   * The rings round the children lit by their 過保護親's all-round bashes (FX.GUARD events, a ring each, but not where
   * her shield itself strikes the enemy), each for as long as her bash (GUARD_RING_SECONDS at most): round the child
   * as drawn now, swelling in and fading out. Drawn over the characters, under the name tags and badges.
   */
  private drawGuardRings(origins: readonly { x: number; y: number }[]) {
    const rings = this.guardRings
    for (let k = rings.length - 1; k >= 0; k--) if (this.clock - rings[k].at >= rings[k].life - 1e-6) rings.splice(k, 1)
    rings.forEach((ring, k) => {
      const origin = origins[ring.owner]
      if (!origin) return
      const age = (this.clock - ring.at) / ring.life
      const swing = age < 0.2 ? 0.6 + 2 * age : (1 - age) / 0.8
      this.guardRing({ ox: origin.x, oy: origin.y, r: ring.r, i: k }, ring.x, ring.y, swing)
    })
  }

  /**
   * The ring round the child (drawn at (`ox`, `oy`)) that her 過保護親's all-round bash reaches (the game's reach
   * about the child, from her shield's radius `r`), lit `swing` (0..1) along an arc towards the enemy she bashed at
   * (`hitX`, `hitY`), with a sparkle where it strikes (on the ring, or on the enemy within it).
   */
  private guardRing(sh: { ox: number; oy: number; r: number; i: number }, hitX: number, hitY: number, swing: number) {
    const radius = sh.r * GUARD_RING_PER_R
    const cx = sh.ox
    const cy = sh.oy
    const toward = Math.atan2(hitY - cy, hitX - cx)
    const strike = Math.min(radius, Math.hypot(hitX - cx, hitY - cy))
    const ctx = this.ctx
    this.world()
    ctx.save()
    ctx.globalAlpha = 0.85 * swing
    ctx.strokeStyle = '#bfe3ff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, cy, radius, toward - GUARD_RING_ARC, toward + GUARD_RING_ARC)
    ctx.stroke()
    ctx.globalAlpha = 0.35 * swing
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cx, cy, radius, toward - GUARD_RING_ARC * 0.6, toward + GUARD_RING_ARC * 0.6)
    ctx.stroke()
    ctx.restore()
    const fx = sheet('fx')
    const sx = cx + Math.cos(toward) * strike
    const sy = cy + Math.sin(toward) * strike
    this.art(pick(fx.spark, this.clock * 8 + sh.i), sx, sy, 6, 6, false, swing, 1.3)
  }

  private isPlane(view: View, def: (typeof WEAPONS)[number]) {
    return weaponAppearance(def.id, ageAt(view.time)).art === 'w_travel_plane'
  }

  /**
   * Where a ground vehicle's wheels meet the ground below its sprite centre (its lowest pixels are 14 px down): its
   * shadow centres here, so it shows just under the wheels, and it sorts with the characters on this line.
   */
  private static readonly VEHICLE_FEET = 13

  /** A sweeping vehicle's afterimages, speed lines and body. */
  private sweepBody(frame: Raster, x: number, cos: number, y: number, evolved: boolean, trails: boolean) {
    const ctx = this.ctx
    const flip = cos < 0
    if (trails) {
      const f = evolved ? evolve(frame) : frame
      const n = Math.min(3, this.trailBudget)
      this.trailBudget -= n
      for (let k = n; k >= 1; k--) this.art(f, x - cos * 12 * k, y, 16, 16, flip, 0.3 - k * 0.07)
    }
    this.world()
    ctx.fillStyle = 'rgba(255,255,255,.5)'
    for (let k = 0; k < 3; k++) {
      const len = 16 + k * 6
      ctx.fillRect(Math.round(cos > 0 ? x - 14 - len : x + 14), Math.round(y - 5 + k * 5), len, 1)
    }
    this.centred(frame, x, y, evolved, 1, 1, flip)
  }

  /** A ground vehicle with its shadow, drawn in the Y-sorted character pass. */
  private vehicle(view: View, sh: ShotView, def: (typeof WEAPONS)[number]) {
    const art = weaponAppearance(def.id, ageAt(view.time)).art
    const frame = pick(sheet(`weapon:${art}`).fly, this.clock + sh.i * 0.1)
    const rx = art === 'w_travel_car' ? 17 : art === 'w_travel_motorcycle' ? 13 : 10
    this.shadow(sh.x, sh.y + Renderer.VEHICLE_FEET, rx, 0.26)
    this.sweepBody(frame, sh.x, Math.cos(sh.angle), sh.y, sh.evolved, this.trailBudget > 0)
  }

  /** Weapon sprites and bolts, above the characters. */
  private topShot(view: View, sh: ShotView, def: (typeof WEAPONS)[number]) {
    const ctx = this.ctx
    const fx = sheet('fx')
    const { x, y, r: radius, angle, life, evolved, i } = sh
    const age = sh.age
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const trails = this.trailBudget > 0
    switch (def.behavior) {
      // Companions (生き物観察's creatures, garden sprouts, pets, 過保護親) are drawn with the characters instead.
      case 'garden':
        if (sh.v === 0) this.centred(pick(sheet('weapon:w_garden').fly, this.clock + i * 0.1), x, y, evolved)
        break
      case 'observe':
      case 'pet':
      case 'aura':
      case 'zone':
      case 'beam':
      case 'trail':
      case 'mine':
      case 'none':
        break
      case 'orbit': {
        if (def.id === 'p_over') break
        // Re-derive the orbit around the eased owner so it never lags behind them.
        const owner = view.players[view.shots[i + 6]]
        const orbit = Math.hypot(x - (owner?.x ?? x), y - (owner?.y ?? y))
        const independent = def.id === 'p_monster'
        const ox = independent ? x : sh.ox + cos * orbit
        const oy = independent ? y : sh.oy + sin * orbit
        const art = sheet(`weapon:${def.id}`)
        const anim = def.id === 'w_friend' ? [art.fly, art.alt, art.alt2][(i / STRIDE.shots) % 3] : art.fly
        this.centred(pick(anim, this.clock + i * 0.1), ox, oy, evolved, Math.min(1, life * 4))
        break
      }
      case 'whip':
      case 'flail': {
        // 美容: a crisp white-pink crescent slash with stars; 頼りない親: motion lines with flailing hands
        // and sweat — both laid exactly along the real whip line (length = radius, at the shot's angle).
        const kind = def.behavior === 'whip' ? 'slash' : 'flail'
        const dir = ((Math.round((angle / TAU) * SWING_DIRS) % SWING_DIRS) + SWING_DIRS) % SWING_DIRS
        const smear = swing(radius, dir, kind)
        const alpha = Math.min(1, life * 3)
        this.art(evolved ? evolve(smear) : smear, x, y, smear.w / 2, smear.h / 2, false, alpha)
        const n = kind === 'slash' ? 5 : 4
        for (let j = 0; j < n; j++) {
          const t = (j / (n - 1)) * 1.6 - 0.8
          const bulge = (1 - t * t) * 14
          const px = x + cos * t * radius + sin * bulge
          const py = y + sin * t * radius - cos * bulge
          if (kind === 'slash') this.centred(pick(fx.star, this.clock * 2 + j), px, py, evolved, alpha)
          else {
            this.centred(pick(fx.hand, this.clock * 4 + j), px, py, evolved, alpha)
            if (j % 2) this.centred(fx.sweat.frames[0], px + 7, py - 9, evolved, alpha)
          }
        }
        break
      }
      case 'strike': {
        // 投資: a chart-arrow bolt from above and an impact burst.
        const f = pick(fx.bolt, this.clock * 2)
        this.art(evolved ? evolve(f) : f, x, y, 12, 118, false, Math.min(1, life * 2))
        this.art(pick(fx.burst, (1 - life) * 0.6), x, y, 14, 14, false, life)
        break
      }
      case 'rain': {
        // お金持ち: a bundle of bills falls, then coins burst out on impact.
        const fall = Math.max(0, life - 0.35) / 0.65
        if (fall > 0) this.centred(fx.bills.frames[0], x, y - fall * 240, evolved)
        else this.art(pick(fx.coins, (0.35 - life) * 3), x, y + 4, 14, 14, false, Math.min(1, life * 3))
        break
      }
      case 'chain': {
        // SNS: a lightning link from the previous node to this one, "like" bubbles popping on the nodes.
        const ageSec = age * 0.25
        const start = sh.v * 0.04
        if (ageSec < start) break
        const reach = clamp01((ageSec - start) / 0.05)
        const x0 = x - cos * radius
        const y0 = y - sin * radius
        const alpha = clamp01(life * 3)
        this.bolt(x0, y0, x0 + (x - x0) * reach, y0 + (y - y0) * reach, i, alpha, evolved)
        if (reach >= 1) {
          const since = ageSec - start - 0.05
          const frame = fx.like.frames[since < 0.04 ? 0 : since < 0.09 ? 1 : 2]
          this.centred(frame, x, y - 12 - clamp01(since * 6) * 6, evolved, alpha, 1.25)
          this.art(pick(fx.spark, this.clock * 3 + sh.v), x, y, 6, 6, false, alpha)
        }
        if (sh.v === 0) this.art(pick(fx.spark, this.clock * 3), x0, y0, 6, 6, false, alpha)
        break
      }
      case 'slam': {
        // The dumbbell is hoisted over the owner's head and slammed down at their feet, then fades.
        const art = sheet('weapon:w_muscle')
        const fall = clamp01(age / 0.2)
        const drop = fall * fall
        const dy = -58 + drop * 70
        const squash = age > 0.2 && age < 0.36 ? 0.8 + 0.2 * ((age - 0.2) / 0.16) : 1
        const frame = art.fly.frames[age < 0.2 ? 0 : 1]
        this.art(
          evolved ? evolve(frame) : frame,
          x,
          y + dy,
          16,
          24,
          false,
          clamp01(life * 3),
          1 / Math.sqrt(squash),
          squash
        )
        break
      }
      case 'barrage': {
        // 残業: staples in one of 16 directions with a small streak.
        const art = sheet('weapon:w_overtime')
        const d = ((Math.round((angle / TAU) * STAPLE_DIRS) % STAPLE_DIRS) + STAPLE_DIRS) % STAPLE_DIRS
        const frame = art.fly.frames[d]
        this.centred(frame, x, y, evolved)
        break
      }
      case 'boomerang': {
        // 結婚指輪: a spinning ring with a short afterimage along its way out and back.
        const art = sheet('weapon:w_ring')
        const frame = pick(art.fly, this.clock + i * 0.1)
        const dx = x - sh.ox
        const dy = y - sh.oy
        const d = Math.hypot(dx, dy)
        if (d > 6 && trails) {
          const way = life > 0.58 ? 1 : -1
          this.afterimages(frame, x, y, (dx / d) * way, (dy / d) * way, 9, evolved, 3)
        }
        this.centred(frame, x, y, evolved)
        if (evolved)
          this.art(
            pick(fx.star, this.clock * 2 + i),
            x + Math.cos(this.clock * 9) * 12,
            y + Math.sin(this.clock * 9) * 12,
            4,
            4
          )
        break
      }
      case 'raid': {
        // ヤンキー親: storms out at an enemy, flying-kicks it and swaggers home. Laid along the raid line from
        // the eased owner (like the orbiters, so it never lags) and mirrored by the way it is heading.
        const owner = view.players[view.shots[i + 6]]
        const dist = Math.hypot(x - (owner?.x ?? x), y - (owner?.y ?? y))
        const px = sh.ox + cos * dist
        const py = sh.oy + sin * dist
        const art = sheet('weapon:p_yankee')
        const out = age < RAID.back
        const flip = out ? cos < 0 : cos > 0
        if (age < RAID.kick) {
          // The run in: dust kicked up behind and a short trail of afterimages.
          const frame = pick(art.fly, this.clock + i * 0.1)
          const appear = clamp01(age * 14)
          for (let k = 1; k <= 2; k++)
            this.art(
              pick(fx.dust, this.clock + k * 0.13),
              px - cos * 11 * k,
              py + 13 - sin * 11 * k,
              8,
              13,
              false,
              appear * (0.75 - k * 0.2)
            )
          this.shadow(px, py + 14, 9, 0.24 * appear)
          if (trails) {
            const n = Math.min(2, this.trailBudget)
            this.trailBudget -= n
            for (let k = n; k >= 1; k--)
              this.centred(frame, px - cos * 9 * k, py - sin * 9 * k, evolved, appear * (0.3 - k * 0.08), 1, flip)
          }
          this.centred(frame, px, py, evolved, appear, 1, flip)
        } else if (out) {
          // The flying kick: a hop off the ground, then a comic impact at the sole.
          const k = (age - RAID.kick) / (RAID.back - RAID.kick)
          const hop = Math.sin(k * Math.PI) * 8
          this.shadow(px, py + 14, 9 - hop * 0.4, 0.2)
          this.centred(art.kick.frames[k < 0.5 ? 0 : 1], px, py - hop, evolved, 1, 1, flip)
          if (k > 0.3)
            this.art(
              fx.impact.frames[k < 0.65 ? 0 : 1],
              px + (flip ? -13 : 13),
              py - hop + 6,
              12,
              12,
              false,
              clamp01((1 - k) * 4),
              0.7 + k * 0.5
            )
        } else {
          // The swagger home, fading out as it reaches the owner.
          const alpha = clamp01(life * 12)
          this.shadow(px, py + 14, 9, 0.24 * alpha)
          this.centred(pick(art.walk, this.clock + i * 0.1), px, py, evolved, alpha, 1, flip)
        }
        break
      }
      case 'nova': {
        // カラオケ: notes riding the expanding ring; the microphone at the singer.
        const fade = clamp01(life * 2.2) * clamp01(age * 10)
        const n = Math.max(6, Math.min(24, Math.round(radius / 8)))
        for (let j = 0; j < n; j++) {
          const ang = sh.angle + (j / (n - 1) - 0.5) * (TAU / 3)
          const rr = radius + Math.sin(this.clock * 8 + j) * 2.5
          this.art(
            fx.note.frames[j % 3],
            sh.ox + Math.cos(ang) * rr,
            sh.oy + Math.sin(ang) * rr - 3,
            6,
            7,
            false,
            fade,
            1.25
          )
        }
        if (evolved && radius > 40)
          for (let j = 0; j < Math.floor(n / 2); j++) {
            const ang = sh.angle + ((j + 0.5) / Math.floor(n / 2) - 0.5) * (TAU / 3)
            this.art(
              fx.note.frames[(j + 1) % 3],
              sh.ox + Math.cos(ang) * radius * 0.62,
              sh.oy + Math.sin(ang) * radius * 0.62 - 3,
              6,
              7,
              false,
              fade * 0.8
            )
          }
        const mic = pick(sheet('weapon:w_karaoke').fly, this.clock)
        this.centred(
          mic,
          sh.ox + Math.cos(sh.angle) * 17,
          sh.oy + Math.sin(sh.angle) * 17 - 6 + Math.sin(this.clock * 10) * 1.5,
          evolved,
          clamp01(life * 6)
        )
        break
      }
      case 'sweep': {
        // Only the plane flies over everything; ground vehicles are Y-sorted with the characters.
        if (!this.isPlane(view, def)) break
        const art = sheet(`weapon:${weaponAppearance(def.id, ageAt(view.time)).art}`)
        this.sweepBody(pick(art.fly, this.clock + i * 0.1), x, cos, y, evolved, trails)
        break
      }
      default: {
        // aim, homing, bounce, arc, wander: the weapon's own flying frames; fast ones leave afterimages.
        const art = sheet(`weapon:${def.id === 'w_sports' ? weaponAppearance(def.id, ageAt(view.time)).art : def.id}`)
        if (def.id === 'w_study') {
          // The pencil points along its flight: one of 16 pre-drawn directions.
          const d = ((Math.round((angle / TAU) * PENCIL_DIRS) % PENCIL_DIRS) + PENCIL_DIRS) % PENCIL_DIRS
          const frame = art.fly.frames[d]
          if (trails) this.afterimages(frame, x, y, cos, sin, 8, evolved, 2)
          this.centred(frame, x, y, evolved)
        } else {
          const frame = pick(art.fly, this.clock + i * 0.1)
          if (trails && (def.behavior === 'homing' || def.behavior === 'aim'))
            this.afterimages(frame, x, y, cos, sin, 8, evolved, 2)
          this.centred(frame, x, y, evolved)
        }
      }
    }
  }

  /**
   * Moves a gamble reel or result banner onto the player who gambled, as drawn this frame: the reel (its frame and
   * label) centred above everything stacked on her head, the banner's top anchor at the bottom of her body. The reel
   * rises at once when her stack grows (a buff row, a neighbour's tag lifting hers) and settles back down gently.
   */
  private followOwner(p: Particle) {
    const st = this.stacks.get(p.owner)
    if (!st) return false
    p.x = st.x
    if (p.kind === PK.gambleResult) {
      p.y = st.bottom
      p.lift = 0
      return true
    }
    const anim = sheet('fx')[p.spr]
    if (!anim) return false
    const half = (Math.max(...anim.frames.map((f) => f.h)) / 2) * p.size * (1 + Math.max(0, p.size2))
    const lift = st.top - GAMBLE_REEL_GAP - half - st.bottom
    if (Number.isNaN(p.lift) || lift < p.lift) p.lift = lift
    else p.lift += (lift - p.lift) * (1 - Math.exp(-GAMBLE_REEL_SETTLE * this.frameDt))
    p.y = st.bottom + p.lift
    return true
  }

  /**
   * Boxes (world px) of a gamble reel about its centre: its frame, and its label at its largest (as `particles` draws
   * it: 25 px above the centre, popping in at up to 1.55 × 12 px and rising 2 px, outlined 4 px wide).
   */
  private reelFootprint(p: Particle): Box[] {
    const anim = sheet('fx')[p.spr]
    if (!anim) return []
    const k = p.size * (1 + Math.max(0, p.size2))
    const w = (Math.max(...anim.frames.map((f) => f.w)) / 2) * k
    const h = (Math.max(...anim.frames.map((f) => f.h)) / 2) * k
    const boxes: Box[] = [{ left: -w, top: -h, right: w, bottom: h }]
    const text = GAMBLE_LABELS[p.spr]
    if (text) {
      let label = this.gambleLabelBoxes.get(text)
      if (!label) {
        const ctx = this.ctx
        ctx.save()
        ctx.font = `bold ${(12 * 1.55).toFixed(1)}px sans-serif`
        const m = ctx.measureText(text)
        ctx.restore()
        const ascent = m.actualBoundingBoxAscent || 12 * 1.55 * 0.9
        const descent = m.actualBoundingBoxDescent || 12 * 1.55 * 0.2
        label = { left: -m.width / 2 - 3, top: -27 - ascent - 3, right: m.width / 2 + 3, bottom: -25 + descent + 3 }
        this.gambleLabelBoxes.set(text, label)
      }
      boxes.push(label)
    }
    return boxes
  }

  /** The result banner's text, pixel icon and sizes (CSS px), as `particles` draws it. */
  private bannerLayout(p: Particle) {
    const weapon = WEAPONS[p.n]
    if (!weapon) return undefined
    // The weapon as it looks at this age (a tennis ball for sports at 20), like the HUD and the badge.
    const shown = weaponAppearance(weapon.id, this.viewAge, this.localPetAge)
    const icon = (sheet('icons')[shown.art] ?? sheet('icons')[weapon.id])?.frames[0]
    const iconRoom = icon ? GAMBLE_ICON + GAMBLE_ICON_GAP : 0
    const ctx = this.ctx
    ctx.save()
    ctx.font = 'bold 20px sans-serif'
    const textWidth = ctx.measureText(shown.name).width
    ctx.restore()
    const width = Math.min(this.width - 16, textWidth + iconRoom + 56)
    return { text: shown.name, icon, iconRoom, textWidth, width }
  }

  /**
   * Places this frame's gamble reels (with their labels) and the local player's result banners, each following the
   * player who gambled. Reels go above everything stacked on her head, banners under her feet; where that would cover
   * another player's body, name tag, buff row or badge, another reel, label or banner, or (banners) an opaque part of
   * the HUD, they glide over to the nearest free spot beside or further from her (spots are kept while they stay free,
   * so they never flick back and forth), and fade out while no spot is free. Other players' results get no banner:
   * their reel and the attack it copies tell them. Reels are placed the local player's first, then her banners, then
   * the others'.
   */
  private placeGambles(localId: string, single: boolean) {
    const items = this.fx.pool.items
    const places = this.gamblePlaces
    const live = new Set<Particle>()
    const reels: Particle[] = []
    const banners: Particle[] = []
    const glide = 1 - Math.exp(-GAMBLE_GLIDE * this.frameDt)
    for (const p of items) {
      if (!isGamble(p) || p.delay > 0) continue
      live.add(p)
      let place = places.get(p)
      if (!place || place.kind !== p.kind || place.age > p.age) {
        place = { kind: p.kind, age: p.age, started: false, dx: 0, dy: 0, vis: 1, hidden: false, x: NaN, y: NaN }
        places.set(p, place)
      }
      place.age = p.age
      const followed = p.owner !== '' && p.owner !== '-' && this.followOwner(p)
      if (p.kind === PK.gambleResult) {
        // One nobody was matched to is shown where it spawned, when you play alone (it can only be yours).
        place.hidden = p.owner === '-' ? !single : p.owner !== localId
        place.x = NaN
        if (!place.hidden && followed && p.age >= GAMBLE_RESULT_DELAY) banners.push(p)
      } else if (followed) reels.push(p)
      else place.vis = 1
    }
    for (const p of places.keys()) if (!live.has(p)) places.delete(p)
    reels.sort((a, b) => Number(b.owner === localId) - Number(a.owner === localId) || b.age - a.age)

    const players = [...this.playerAreas.values()].flat()
    /** What reels and banners already placed cover as drawn (world px), and where they are heading. */
    const drawn: Box[] = []
    const heading: Box[] = []
    const shift = (boxes: readonly Box[], dx: number, dy: number) =>
      boxes.map((b) => ({ left: b.left + dx, top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy }))

    const placeReel = (p: Particle) => {
      const place = places.get(p)!
      const fp = shift(this.reelFootprint(p), p.x, p.y)
      if (!fp.length) return
      const own = (this.playerAreas.get(p.owner) ?? []).slice(0, -1)
      const left = Math.min(...fp.map((b) => b.left)) - p.x
      const right = Math.max(...fp.map((b) => b.right)) - p.x
      const top = Math.min(...fp.map((b) => b.top)) - p.y
      const bottom = Math.max(...fp.map((b) => b.bottom)) - p.y
      const w = right - left
      const h = bottom - top
      const ownLeft = Math.min(p.x, ...own.map((b) => b.left)) - p.x
      const ownRight = Math.max(p.x, ...own.map((b) => b.right)) - p.x
      // Above her stack (shifted aside), beside it or her body, a little higher.
      const xs = [0, -w / 2, w / 2, ownLeft - 6 - right, ownRight + 6 - left]
      xs.push(xs[3] - w * 0.6, xs[4] + w * 0.6)
      const ys = [0, h * 0.5, h, h * 1.5, -h * 0.75]
      const spots: GambleSpot[] = []
      for (const dy of ys)
        for (const dx of xs) spots.push({ dx, dy, cost: Math.abs(dx) + (dy > 0 ? dy * 1.2 : -dy * 2) })
      place.spot = pickGambleSpot(spots, fp, [...players, ...drawn, ...heading], place.spot)
      const to = spots[place.spot]
      place.dx = place.started ? place.dx + (to.dx - place.dx) * glide : to.dx
      place.dy = place.started ? place.dy + (to.dy - place.dy) * glide : to.dy
      place.started = true
      const now = shift(fp, place.dx, place.dy)
      place.vis = gambleVisibility(boxClearance(now, [...players, ...drawn]))
      p.x += place.dx
      p.y += place.dy
      drawn.push(...now)
      heading.push(...shift(fp, to.dx, to.dy))
    }

    for (const p of reels) if (p.owner === localId) placeReel(p)

    // Banners: in CSS px, against the screen (shaking with the world) and the HUD drawn over it.
    const dpr = this.canvas.width / (this.width || 1)
    const kc = this.scale / dpr
    const cam = this.camera
    const toCss = (b: Box): Box => ({
      left: this.width / 2 + (b.left - cam.x) * kc,
      top: this.height / 2 + (b.top - cam.y) * kc,
      right: this.width / 2 + (b.right - cam.x) * kc,
      bottom: this.height / 2 + (b.bottom - cam.y) * kc
    })
    const toWorld = (b: Box): Box => ({
      left: cam.x + (b.left - this.width / 2) / kc,
      top: cam.y + (b.top - this.height / 2) / kc,
      right: cam.x + (b.right - this.width / 2) / kc,
      bottom: cam.y + (b.bottom - this.height / 2) / kc
    })
    const hud = this.hudRects.filter((r) => r.opaque)
    for (const p of banners) {
      const place = places.get(p)!
      const layout = this.bannerLayout(p)
      const st = this.stacks.get(p.owner)
      if (!layout || !st) continue
      const half = layout.width / 2
      const clampX = (x: number) => Math.max(half + 8, Math.min(this.width - half - 8, x))
      const clampY = (y: number) => Math.max(30, Math.min(this.height - 30, y))
      const ax = this.width / 2 + (st.x - cam.x) * kc
      const ay = this.height / 2 + (st.bottom - cam.y) * kc + GAMBLE_RESULT_GAP + 21
      const box: Box = { left: -half, top: -21, right: half, bottom: 21 }
      // Under her feet (shifted aside), further down, or above her stack and her reel.
      const reelTop = drawn.length ? Math.min(...drawn.map((b) => toCss(b).top)) : Infinity
      const above = Math.min(this.height / 2 + (st.top - cam.y) * kc, reelTop) - GAMBLE_RESULT_GAP - 21 - ay
      const xs = [0, -half / 2, half / 2, -half, half, -half - 40, half + 40, -2 * half, 2 * half]
      const ys = [0, 46, above, above - 46, 92]
      const spots: GambleSpot[] = []
      const seen = new Set<string>()
      for (const [row, dy0] of ys.entries())
        for (const dx0 of xs) {
          const dx = clampX(ax + dx0) - ax
          const dy = clampY(ay + dy0) - ay
          const key = `${Math.round(dx)}:${Math.round(dy)}`
          // Clamped to the same place as a cheaper one: kept (indexes stay stable) but never preferred.
          const cost = Math.abs(dx) + Math.abs(dy) * 1.5 + (row >= 2 ? 30 : 0) + (seen.has(key) ? 1e6 : 0)
          seen.add(key)
          spots.push({ dx, dy, cost })
        }
      const others = [...players, ...drawn, ...heading].map(toCss)
      const at = shift([box], ax, ay)
      place.spot = pickGambleSpot(spots, at, [...others, ...hud], place.spot)
      const to = spots[place.spot]
      place.dx = place.started ? place.dx + (to.dx - place.dx) * glide : to.dx
      place.dy = place.started ? place.dy + (to.dy - place.dy) * glide : to.dy
      place.started = true
      // Kept inside the margins while it glides (the anchor shakes with the world).
      place.x = clampX(ax + place.dx)
      place.y = clampY(ay + place.dy)
      const age = p.age - GAMBLE_RESULT_DELAY
      const slide = (1 - (1 - clamp01(age / 0.22)) ** 3) * -14 + 14
      const now = shift([box], place.x, place.y + slide)
      place.vis = gambleVisibility(boxClearance(now, [...[...players, ...drawn].map(toCss), ...hud]))
      drawn.push(...now.map(toWorld))
      heading.push(...shift([box], ax + to.dx, ay + to.dy).map(toWorld))
    }

    for (const p of reels) if (p.owner !== localId) placeReel(p)
  }

  /**
   * The small shadow under a garden seed in flight. The view gives only where the seed is drawn, up on its arc
   * (SEED_ARC high at the top, over 0.8 × the weapon speed of ground along its throw), so its flight is followed from
   * where it was first seen next to its owner: the ground point is where its throw line and its arc meet the drawn
   * spot. The shadow shrinks and fades the higher it is. A seed first seen away from its owner (already in the air)
   * casts none.
   */
  private seedShadow(view: View, sh: ShotView, def: (typeof WEAPONS)[number]) {
    const s = view.shots
    const key = `${s[sh.i + 6]}:${s[sh.i]}:${s[sh.i + 4]}`
    let seed = this.seeds.get(key)
    if (!seed || seed.frame < this.frame - 2) {
      const known = Math.hypot(sh.x - sh.ox, sh.y - sh.oy) <= SEED_FIRST_SEEN
      seed = { sx: sh.x, sy: sh.y, gx: sh.x, gy: sh.y, p: 0, frame: this.frame, known }
      this.seeds.set(key, seed)
    }
    seed.frame = this.frame
    if (!seed.known) return
    const flight = def.speed * 0.8
    const c = Math.cos(sh.angle)
    const n = Math.sin(sh.angle)
    const miss = (d: number) =>
      (seed.sx + d * c - sh.x) ** 2 + (seed.sy + d * n - SEED_ARC * Math.sin((Math.PI * d) / flight) - sh.y) ** 2
    let best = 0
    for (let k = 1; k <= 32; k++) if (miss((k / 32) * flight) < miss(best)) best = (k / 32) * flight
    for (let k = -8; k <= 8; k++) {
      const d = Math.max(0, Math.min(flight, best + (k / 8) * (flight / 32)))
      if (miss(d) < miss(best)) best = d
    }
    seed.p = best / flight
    const height = SEED_ARC * Math.sin(Math.PI * seed.p)
    seed.gx = sh.x
    seed.gy = sh.y + height
    const up = height / SEED_ARC
    this.shadow(seed.gx, seed.gy + 10, 6 * (1 - 0.45 * up), 0.24 * (1 - 0.6 * up))
  }

  /** A seed gone from the air near the end of its arc has landed: a small puff of soil where it came down. */
  private landSeeds() {
    for (const [key, seed] of this.seeds) {
      if (seed.frame === this.frame) continue
      this.seeds.delete(key)
      if (!seed.known || seed.p < 0.75 || seed.frame < this.frame - 2) continue
      this.fx.sprite('poof', seed.gx, seed.gy + 8, { life: 0.3, scale: 0.75, fade: false })
      this.fx.debris(seed.gx, seed.gy + 9, 4, ['#8a6a46', '#a7845a', '#6f5238'], {
        speed: 60,
        up: 50,
        size: 2,
        life: 0.5
      })
    }
  }

  /** Builds every direction of a beam length in idle time so turning around never hitches. */
  private warmBeam(radius: number) {
    const key = Math.max(16, Math.round(radius / 8) * 8)
    if (this.beamWarm.has(key) || typeof requestIdleCallback !== 'function') return
    this.beamWarm.add(key)
    const k = Math.min(4, Math.max(1, Math.ceil(this.scale - 0.01)))
    let dir = 0
    const next = () => {
      if (dir >= BEAM_DIRS) return
      canvasOf(beam(key, dir++), k)
      requestIdleCallback(next, { timeout: 3000 })
    }
    requestIdleCallback(next, { timeout: 3000 })
  }

  // -------------------------------------------------------------------------------------------
  // Particles and screen effects.

  private particles(layer: number) {
    const ctx = this.ctx
    const items = this.fx.pool.items
    const fx = sheet('fx')
    const cx = this.camera.x
    const cy = this.camera.y
    for (let n = 0; n < items.length; n++) {
      const p = items[n]
      if (p.layer !== layer || p.delay > 0) continue
      const reach = p.kind === PK.debris || p.kind === PK.sprite || p.kind === PK.pop ? 40 : 360
      if (Math.abs(p.x - cx) > this.halfW + reach || Math.abs(p.y - cy) > this.halfH + reach) continue
      const t = p.age / p.life
      switch (p.kind) {
        case PK.debris: {
          const s = this.scale
          const size = Math.max(1, Math.round(p.size * s))
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.globalAlpha = p.fade ? clamp01((1 - t) * 3) : 1
          ctx.fillStyle = p.color
          ctx.fillRect(
            Math.round(this.canvas.width / 2 + (p.x - cx) * s),
            Math.round(this.canvas.height / 2 + (p.y - cy) * s),
            size,
            size
          )
          ctx.globalAlpha = 1
          break
        }
        case PK.sprite: {
          const anim = fx[p.spr]
          if (!anim) break
          const gamble = p.spr.startsWith('gamble_') ? gambleTiming(p.spr, t, anim.frames.length) : undefined
          const frame = gamble
            ? anim.frames[gamble.frame]
            : p.once
              ? anim.frames[Math.min(anim.frames.length - 1, Math.floor(t * anim.frames.length))]
              : pick(anim, p.age)
          // A reel fades out while it would cover another player or another gamble's reel or banner (placeGambles).
          const vis = gamble ? (this.gamblePlaces.get(p)?.vis ?? 1) : 1
          if (vis <= 0) break
          const alpha = gamble ? p.alpha * gamble.alpha * vis : p.alpha * (p.fade ? clamp01((1 - t) * 3) : 1)
          this.art(frame, p.x, p.y, frame.w / 2, frame.h / 2, false, alpha, p.size * (1 + p.size2 * t))
          if (gamble) {
            const label = gamble.label ? (GAMBLE_LABELS[p.spr] ?? '') : ''
            const since = gamble.since
            const size = 12 * (1 + 0.55 * Math.max(0, 1 - since * 7))
            const y = p.y - 25 - 2 * Math.min(1, since * 4)
            this.world()
            ctx.save()
            ctx.globalAlpha = alpha
            ctx.font = `bold ${size.toFixed(1)}px sans-serif`
            ctx.textAlign = 'center'
            ctx.lineJoin = 'round'
            ctx.lineWidth = 4
            ctx.strokeStyle = '#34203b'
            ctx.shadowColor = 'rgba(255, 201, 60, 0.7)'
            ctx.shadowBlur = 5
            ctx.strokeText(label, p.x, y)
            ctx.shadowBlur = 0
            const gold = ctx.createLinearGradient(0, y - size * 0.8, 0, y + size * 0.2)
            gold.addColorStop(0, '#fffbe0')
            gold.addColorStop(0.55, '#ffd75e')
            gold.addColorStop(1, '#f0a53a')
            ctx.fillStyle = gold
            ctx.fillText(label, p.x, y)
            ctx.restore()
          }
          break
        }
        case PK.gambleResult: {
          // Only your own result; placeGambles picks its spot and fades it while no spot is free.
          const place = this.gamblePlaces.get(p)
          if (place?.hidden || place?.vis === 0) break
          const vis = place?.vis ?? 1
          const age = p.age - GAMBLE_RESULT_DELAY
          if (age < 0) break
          // The weapon as it looks at this age (a tennis ball for sports at 20), like the HUD and the badge; its pixel
          // icon (the HUD slot's) goes before the name.
          const layout = this.bannerLayout(p)
          if (!layout) break
          const { text: result, icon, iconRoom, textWidth, width } = layout
          const dpr = this.canvas.width / this.width
          ctx.save()
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.font = 'bold 20px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const fade = clamp01((p.life - p.age) / 0.4)
          const intro = clamp01(age / 0.22)
          const ease = 1 - (1 - intro) ** 3
          // Where placeGambles put it (by the player who gambled), else where it spawned.
          const placed = place !== undefined && !Number.isNaN(place.x)
          const x = placed
            ? place.x
            : Math.max(
                width / 2 + 8,
                Math.min(this.width - width / 2 - 8, this.width / 2 + ((p.x - cx) * this.scale) / dpr)
              )
          const y0 = placed
            ? place.y
            : Math.max(30, Math.min(this.height - 30, this.height / 2 + ((p.y - cy) * this.scale) / dpr))
          const y = y0 + (1 - ease) * 14
          const left = x - width / 2
          const top = y - 21
          ctx.globalAlpha = fade * ease * vis
          // Glow, gradient plate and the gold double border.
          ctx.shadowColor = 'rgba(255, 201, 60, 0.6)'
          ctx.shadowBlur = 16
          this.roundPath(left, top, width, 42, 12)
          const plate = ctx.createLinearGradient(0, top, 0, top + 42)
          plate.addColorStop(0, '#5a3566')
          plate.addColorStop(1, '#2a1731')
          ctx.fillStyle = plate
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.lineWidth = 2.2
          ctx.strokeStyle = '#ffd75e'
          ctx.stroke()
          this.roundPath(left + 4, top + 4, width - 8, 34, 8.5)
          ctx.lineWidth = 1
          ctx.strokeStyle = 'rgba(255, 242, 176, 0.7)'
          ctx.stroke()
          // A shine sweeping across the plate, once on arrival.
          const sweep = clamp01((age - 0.12) / 0.7)
          if (sweep > 0 && sweep < 1) {
            ctx.save()
            this.roundPath(left + 2, top + 2, width - 4, 38, 10)
            ctx.clip()
            const sx = left - 30 + (width + 60) * sweep
            const shine = ctx.createLinearGradient(sx - 18, 0, sx + 18, 0)
            shine.addColorStop(0, 'rgba(255, 255, 255, 0)')
            shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.38)')
            shine.addColorStop(1, 'rgba(255, 255, 255, 0)')
            ctx.fillStyle = shine
            ctx.fillRect(sx - 18, top, 36, 42)
            ctx.restore()
          }
          // Icon and text centred together; the text is one fillText, outlined with a stroke.
          ctx.globalAlpha = fade * clamp01(age / 0.15) * vis
          const room = width - 24 - iconRoom
          const shownWidth = Math.min(room, textWidth)
          const tx = x + iconRoom / 2
          if (icon) {
            const ix = Math.round((tx - shownWidth / 2 - iconRoom) * dpr) / dpr
            const iy = Math.round((y - GAMBLE_ICON / 2) * dpr) / dpr
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(
              canvasOf(icon, Math.max(1, Math.ceil((GAMBLE_ICON * dpr) / icon.w))),
              ix,
              iy,
              GAMBLE_ICON,
              GAMBLE_ICON
            )
          }
          ctx.lineJoin = 'round'
          ctx.lineWidth = 3
          ctx.strokeStyle = '#1f1027'
          ctx.strokeText(result, tx, y + 1, room)
          ctx.fillStyle = '#fff2b0'
          ctx.fillText(result, tx, y + 1, room)
          ctx.restore()
          break
        }
        case PK.ring: {
          this.world()
          const r = p.size2 + (p.size - p.size2) * easeOut(t)
          ctx.globalAlpha = p.alpha * (1 - t) ** 1.3
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.width * (1 - t * 0.55)
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, r, r * p.n, 0, 0, TAU)
          ctx.stroke()
          ctx.globalAlpha = 1
          break
        }
        case PK.glow: {
          this.world()
          const e = easeOut(t)
          this.glowAt(p.x, p.y, p.size * (0.55 + 0.45 * e), p.color, p.alpha * (1 - t) ** 1.5, p.add)
          break
        }
        case PK.rays: {
          this.world()
          const len = p.size * easeOut(t * 1.4)
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = p.alpha * (1 - t)
          ctx.fillStyle = p.color
          for (let k = 0; k < p.n; k++) {
            const a = p.rot + (k * TAU) / p.n
            const half = 0.04 + 0.02 * (k % 2)
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x + Math.cos(a - half) * len, p.y + Math.sin(a - half) * len)
            ctx.lineTo(p.x + Math.cos(a + half) * len, p.y + Math.sin(a + half) * len)
            ctx.closePath()
            ctx.fill()
          }
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1
          break
        }
        case PK.pillar: {
          // A column of golden light rising off the player.
          this.world()
          const w = p.size * (1 - t * 0.6) * (t < 0.12 ? t / 0.12 : 1)
          const grad = ctx.createLinearGradient(0, p.y, 0, p.y - p.width)
          grad.addColorStop(0, 'rgba(255,215,94,0.5)')
          grad.addColorStop(1, 'rgba(255,215,94,0)')
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = (1 - t) ** 1.2
          ctx.fillStyle = grad
          ctx.fillRect(p.x - w / 2, p.y - p.width, w, p.width)
          ctx.fillStyle = 'rgba(255,255,255,.3)'
          ctx.fillRect(p.x - w / 6, p.y - p.width * 0.8, w / 3, p.width * 0.8)
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1
          break
        }
        case PK.pop: {
          // The enemy's flash frame stretches, squashes and shrinks away.
          const art = this.enemySheet(p.n).flash
          const frame = art.frames[0]
          const big = frame.w > 64
          const k = 1 - t
          const feet = p.y + ENEMIES[p.n].radius * p.size * 0.8
          const stretch = 1 + 0.3 * Math.sin(clamp01(t * 2.4) * Math.PI)
          this.art(
            frame,
            p.x,
            feet,
            big ? 64 : 32,
            big ? 120 : 58,
            p.x > this.focus.x && !NO_FLIP.has(ENEMIES[p.n].id),
            clamp01(k * 1.6),
            p.size * (1 + 0.45 * t) * k,
            p.size * stretch * (1 - 0.5 * t) * k
          )
          break
        }
        case PK.warn: {
          // A pulsing red warning circle where the boss is about to arrive.
          this.world()
          const pulse = 0.5 + 0.5 * Math.sin(p.age * 14)
          const fade = clamp01((1 - t) * 6)
          ctx.globalAlpha = fade
          ctx.fillStyle = `rgba(255,50,70,${0.1 + 0.12 * pulse})`
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, 0, 0, TAU)
          ctx.fill()
          ctx.strokeStyle = `rgba(255,70,90,${0.6 + 0.3 * pulse})`
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, 0, 0, TAU)
          ctx.stroke()
          ctx.setLineDash([9, 7])
          ctx.lineDashOffset = -p.age * 40
          ctx.lineWidth = 2
          ctx.strokeStyle = 'rgba(255,200,200,.8)'
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size * 0.72, p.size * 0.4, 0, 0, TAU)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = 1
          break
        }
        default:
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  /** A red telegraph lane from a winding-up enemy toward its nearest player. */
  private telegraph(e: Ent, origins: { x: number; y: number }[]) {
    const ctx = this.ctx
    const def = e.def!
    const boss = def.behavior === 'boss'
    let best = -1
    let bd = Infinity
    for (let j = 0; j < origins.length; j++) {
      const d = (origins[j].x - e.x) ** 2 + (origins[j].y - e.yy) ** 2
      if (d < bd) {
        bd = d
        best = j
      }
    }
    if (best < 0) return
    const angle = Math.atan2(origins[best].y - e.yy, origins[best].x - e.x)
    const len = Math.min(Math.sqrt(bd), boss ? 460 : 320)
    const half = Math.max(9, def.radius * (boss ? 0.95 : 0.8))
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 16)
    this.world()
    ctx.save()
    ctx.translate(e.x, e.yy)
    ctx.rotate(angle)
    const grad = ctx.createLinearGradient(0, 0, len, 0)
    grad.addColorStop(0, `rgba(255,50,40,${0.06 + 0.06 * pulse})`)
    grad.addColorStop(1, `rgba(255,50,40,${0.22 + 0.1 * pulse})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, -half, len, half * 2)
    ctx.setLineDash([8, 6])
    ctx.lineDashOffset = -this.clock * 60
    ctx.strokeStyle = `rgba(255,110,90,${0.5 + 0.25 * pulse})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -half)
    ctx.lineTo(len, -half)
    ctx.moveTo(0, half)
    ctx.lineTo(len, half)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  /** Screen-space overlays: flashes, the low-HP vignette. Leaves an identity transform. */
  private overlays(view: View, me: ViewPlayer | undefined) {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const edge = (rgb: string, alpha: number, inner: number) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner, w / 2, h / 2, Math.hypot(w, h) / 2)
      grad.addColorStop(0, `rgba(${rgb},0)`)
      grad.addColorStop(1, `rgba(${rgb},${alpha})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    }
    for (const f of this.fx.flashes) {
      const a = Math.min(1, f.alpha)
      if (f.kind === 'full') {
        ctx.fillStyle = `rgba(${f.rgb},${a})`
        ctx.fillRect(0, 0, w, h)
      } else edge(f.rgb, a, 0.3)
    }
    if (me && !me.downed && view.phase === 'playing' && me.maxHp > 0) {
      const ratio = Math.max(0, me.hp) / me.maxHp
      if (ratio < 0.3) {
        // A heartbeat that quickens as the life drains away.
        const s = 1 - ratio / 0.3
        const t = (this.clock * (1.1 + 1.6 * s)) % 1
        const bump = (c: number) => Math.exp(-(((t - c) / 0.07) ** 2))
        const beat = bump(0.08) + 0.6 * bump(0.28)
        edge('200,20,40', (0.2 + 0.4 * s) * (0.55 + 0.45 * Math.min(1, beat)) * (this.fx.motion < 1 ? 0.6 : 1), 0.25)
      }
    }
  }

  private drawParentMemorials(view: View, dt: number, smooth: boolean) {
    if (this.parentMemorialTime !== undefined && view.time < this.parentMemorialTime) this.parentMemorials.clear()
    this.parentMemorialTime = view.time
    for (const id of this.parentMemorials.keys()) {
      if (!view.players.some((player) => player.id === id && player.parentDeath)) this.parentMemorials.delete(id)
    }
    for (const player of view.players) {
      const death = player.parentDeath
      if (!death) continue
      const key = [player.parent, death.at, death.x, death.y, death.reward].join(':')
      const elapsed = view.time - death.at
      let entry = this.parentMemorials.get(player.id)
      if (!entry || entry.key !== key) {
        entry = { key, age: elapsed }
        this.parentMemorials.set(player.id, entry)
      } else {
        entry.age =
          smooth && elapsed >= 0 ? Math.max(elapsed, entry.age + (view.phase === 'playing' ? dt : 0)) : elapsed
      }
      const memorial = parentMemorialAt(player, death.at + entry.age)
      if (!memorial || !player.parentDeath) continue
      const { x, y, reward } = player.parentDeath
      const { age, alpha, rise, rewardAlpha } = memorial
      const anim = sheet('death:elder').collapse
      const index = frameAt(anim, age)
      this.art(anim.frames[index], x + 30, y + 12, 32, 58, false, (anim.alpha?.[index] ?? 1) * alpha)
      this.art(sheet('icons')[player.parent].frames[0], x - 2, y - 16 - rise * 0.65, 16, 16, false, alpha)
      const soul = sheet('soul').float
      this.art(pick(soul, age), x + 30, y - 15 - rise * 0.5, 8, 16, false, Math.min(1, Math.max(0, age - 0.8)) * alpha)
      const legacy = PARENT_LEGACIES[player.parent]
      if (reward !== 'none')
        this.art(sheet('icons')[legacy].frames[0], x + 62, y - 65, 16, 16, false, rewardAlpha * alpha)
      this.world()
      const lines = [
        `${player.name}：${WEAPON_BY_ID.get(player.parent)!.name}とのお別れ`,
        reward === 'none'
          ? '親の武器を手放した'
          : reward === 'choice'
            ? '成長の選択 +1'
            : `「${PASSIVE_BY_ID.get(legacy)!.name}」を継承！`
      ]
      lines.forEach((text, line) => {
        this.blit(this.label(text, 13, '#f1f4fc'), x + 30, y - 126 + line * 22, 0, line ? rewardAlpha * alpha : alpha)
      })
    }
  }

  draw(view: View, localId: string, dt: number, smooth: boolean) {
    this.prewarmAppearances(view)
    this.prewarm('elder')
    this.frame++
    const ctx = this.ctx
    const k = smooth ? Math.min(1, dt * 14) : 1
    const me = view.players.find((p) => p.id === localId) ?? view.players[0]
    const positions = new Map(view.players.map((p) => [p.id, this.playerPosition(p, k)]))
    for (const id of this.deaths.keys()) if (!positions.has(id)) this.deaths.delete(id)
    const origins = view.players.map((p) => positions.get(p.id)!)
    // Guests ease every shot towards its snapshot spot once per frame; all later passes read the eased copy.
    if (smooth && view.shots.length) {
      const shots = view.shots.slice()
      for (let i = 0; i < shots.length; i += STRIDE.shots) {
        const pos = this.ease(shots[i + 8], shots[i + 1], shots[i + 2], k)
        shots[i + 1] = pos.x
        shots[i + 2] = pos.y
      }
      view = { ...view, shots }
    }
    if (me) {
      const p = positions.get(me.id)!
      this.focus.x = p.x
      this.focus.y = p.y
    }
    this.clock += dt
    this.frameDt = Math.min(dt, 0.1)
    const stage = stageAt(view.time)
    this.viewAge = ageAt(view.time)
    this.localPetAge = me?.petAge
    this.halfW = this.canvas.width / 2 / this.scale + 80
    this.halfH = this.canvas.height / 2 / this.scale + 80
    const halfW = this.halfW
    const halfH = this.halfH

    // Events first: they spawn particles, shake and flashes for this frame.
    const local = view.players.findIndex((p) => p.id === localId)
    const fv = this.fxView
    fv.local = local
    fv.px = this.focus.x
    fv.py = this.focus.y
    fv.cx = this.focus.x
    fv.cy = this.focus.y
    fv.hw = halfW - 80
    fv.hh = halfH - 80
    this.fx.consume(view.fx, view.time, fv)
    for (const i of this.guardFeed.take(view.fx, view.time)) {
      if (view.fx[i + 1] !== FX.GUARD || this.guardRings.length >= 32) continue
      const { shield, seconds, radius } = readGuardBits(view.fx[i + 5])
      if (!shield)
        this.guardRings.push({
          owner: view.fx[i + 4],
          x: view.fx[i + 2],
          y: view.fx[i + 3],
          r: radius,
          at: this.clock,
          life: Math.min(GUARD_RING_SECONDS, seconds || GUARD_RING_SECONDS)
        })
    }
    this.claimGambles(view)
    this.fx.update(Math.min(dt, 0.1))
    this.evo.fill(0)
    // Shake: a camera offset snapped to device pixels so the whole picture moves rigidly.
    this.fx.shakeOffset(this.shake)
    const snap = (v: number) => Math.round(v * this.scale) / this.scale
    this.camera.x = this.focus.x + snap(this.shake.x)
    this.camera.y = this.focus.y + snap(this.shake.y)
    const visible = (x: number, y: number) => Math.abs(x - this.camera.x) < halfW && Math.abs(y - this.camera.y) < halfH

    // Ground of this stage of life, crossfading from the previous one when a new stage begins.
    if (this.groundShown?.stage !== stage) {
      this.groundShown = { stage, from: this.groundShown?.stage, at: this.clock }
      this.prewarm(bodyFor(stage))
    }
    const fade = Math.min(1, (this.clock - this.groundShown.at) / GROUND_FADE)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#16121c'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    if (this.groundShown.from && fade < 1) this.ground(this.groundShown.from, 1, halfW, halfH)
    this.ground(stage, this.groundShown.from ? fade : 1, halfW, halfH, () => {
      // Garden beds lie on the ground, under the standing props.
      const shots = view.shots
      for (let i = 0; i < shots.length; i += STRIDE.shots) {
        if (WEAPONS[shots[i]].behavior !== 'garden') continue
        const sh = this.load(view, origins, i)
        if (sh.v === 1) this.gardenBed(sh, 'under')
      }
    })
    this.world()

    // Experience gems and pickups: pixel sprites with a gentle bob and a soft shadow.
    const items = sheet('items')
    const g = view.gems
    // Shadows of everything in one path: much cheaper than one fill each.
    ctx.fillStyle = 'rgba(12,8,20,.2)'
    ctx.beginPath()
    for (let i = 0; i < g.length; i += STRIDE.gems) {
      if (!visible(g[i], g[i + 1])) continue
      ctx.moveTo(g[i] + 4, g[i + 1] + 6)
      ctx.ellipse(g[i], g[i + 1] + 6, 4, 1.5, 0, 0, TAU)
    }
    ctx.fill()
    for (let i = 0; i < g.length; i += STRIDE.gems) {
      if (!visible(g[i], g[i + 1])) continue
      const v = g[i + 2]
      const anim = v >= 20 ? items.gem3 : v >= 4 ? items.gem2 : items.gem1
      const bob = Math.round(Math.sin(this.clock * 3 + i) * 1.5)
      this.art(pick(anim, this.clock + i * 0.07), g[i], g[i + 1] + bob, 8, 10)
    }
    this.world()
    const it = view.items
    // Foods dropped on the same spot fan out without overlapping (the overflow shows as a "+n" chip on the shown sprite
    // next to it); labels are drawn after the characters.
    const foodAt: number[] = []
    const foodPoints: { x: number; y: number }[] = []
    for (let i = 0; i < it.length; i += STRIDE.items) {
      if (it[i + 3] >= 0 && visible(it[i + 1], it[i + 2])) {
        foodAt.push(i)
        foodPoints.push({ x: it[i + 1], y: it[i + 2] })
      }
    }
    const layoutKey = foodPoints.map((p) => `${p.x},${p.y}`).join(';')
    if (this.foodLayout.key !== layoutKey) this.foodLayout = { key: layoutKey, spots: layoutFoods(foodPoints) }
    const foodSpots = this.foodLayout.spots
    const chips = foodChips(foodSpots)
    const pileOf = foodPiles(foodSpots)
    const pileCount = pileOf.reduce((m, p) => Math.max(m, p + 1), 0)
    const labels = this.foodLabels
    labels.sprites.length = 0
    labels.players.length = 0
    labels.keys = []
    labels.owners = Array.from({ length: pileCount }, () => [])
    labels.piles = Array.from({ length: pileCount }, () => [])
    labels.local = view.players.findIndex((p) => p.id === localId)
    // Every food bobs with one shared phase, so shown sprites keep their distances while they move.
    const foodBob = Math.round(Math.sin(this.clock * 3) * FOOD_BOB)
    const entries: FoodLabelEntry[] = []
    foodAt.forEach((i, slot) => {
      const kind = ITEM_KINDS[it[i]] as keyof typeof COOKING_EFFECTS
      const food = COOKING_EFFECTS[kind]
      const owner = it[i + 3]
      const pileIndex = pileOf[slot]
      entries.push({
        pile: pileIndex,
        owner,
        effect: kind,
        name: view.players[owner]?.name ?? '',
        label: food.label,
        short: food.short
      })
      labels.keys[pileIndex] ??= `${Math.round(it[i + 1] / 4)},${Math.round(it[i + 2] / 4)},${owner}`
      if (!labels.owners[pileIndex].includes(owner)) labels.owners[pileIndex].push(owner)
      const spot = foodSpots[slot]
      if (!spot.shown) return
      // The label obstacle covers the sprite over its whole bob.
      const sprite = foodSpriteBox(spot)
      const box = { ...sprite, top: sprite.top - FOOD_BOB, bottom: sprite.bottom + FOOD_BOB }
      labels.sprites.push(box)
      labels.piles[pileIndex].push(box)
    })
    // Shadows, glows and rings of every item first, then the sprites, so no decoration covers another food's sprite.
    for (let i = 0; i < it.length; i += STRIDE.items) {
      if (!visible(it[i + 1], it[i + 2])) continue
      const food = it[i + 3] >= 0 ? COOKING_EFFECTS[ITEM_KINDS[it[i]] as keyof typeof COOKING_EFFECTS] : undefined
      const spot = food ? foodSpots[foodAt.indexOf(i)] : undefined
      if (spot && !spot.shown) continue
      const ix = spot ? spot.x : it[i + 1]
      const iy = spot ? spot.y : it[i + 2]
      this.shadow(ix, iy + 8, 6, 0.22)
      if (food) {
        const swell = Math.sin(this.clock * 3 * this.fx.motion)
        ctx.save()
        this.glowEllipse(ix, iy + 2, 24 + swell * 3, 20 + swell * 2.5, food.color, 0.5 + 0.12 * swell)
        ctx.globalAlpha = 0.75
        ctx.strokeStyle = food.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(ix, iy + 7, 13 + swell * 2, 5, 0, 0, TAU)
        ctx.stroke()
        // Two twinkles that swell and fade out of step.
        ctx.fillStyle = '#fffbe6'
        for (let n = 0; n < 2; n++) {
          const t = (this.clock * 0.7 * this.fx.motion + n * 0.5 + i * 0.13) % 1
          const k = Math.sin(t * Math.PI)
          const tx = ix + (n ? 11 : -12)
          const ty = iy - 6 + (n ? 4 : -2) - Math.round(t * 3)
          const arm = 1 + 3 * k
          ctx.globalAlpha = 0.9 * k
          ctx.fillRect(tx - 0.5, ty - arm, 1, arm * 2)
          ctx.fillRect(tx - arm, ty - 0.5, arm * 2, 1)
        }
        ctx.restore()
      }
    }
    for (let i = 0; i < it.length; i += STRIDE.items) {
      if (!visible(it[i + 1], it[i + 2])) continue
      const frame = items[ITEM_KINDS[it[i]]].frames[0]
      if (it[i + 3] < 0) {
        this.art(frame, it[i + 1], it[i + 2] + Math.round(Math.sin(this.clock * 3 + i) * 2), 8, 12)
        continue
      }
      const spot = foodSpots[foodAt.indexOf(i)]
      if (spot.shown) this.art(frame, spot.x, spot.y + foodBob, 8, 12, false, 1, 1.5)
    }
    this.world()
    foodSpots.forEach((spot, slot) => {
      if (!chips[slot]) return
      const box = foodSpriteBox(spot)
      this.foodChip({ ...box, top: box.top + foodBob, bottom: box.bottom + foodBob }, chips[slot])
    })
    labels.lines = foodLabelLines(entries, pileCount)

    // Enemies of the crowd (kept for the telegraphs and the Y-sorted draw).
    const e = view.enemies
    this.entCount = 0
    this.winders.length = 0
    const fresh = this.states.size === 0
    for (let i = 0; i < e.length; i += STRIDE.enemies) {
      const def = ENEMIES[e[i + 1]]
      const id = e[i]
      const pos = smooth ? this.ease(id, e[i + 2], e[i + 3], k) : null
      const x = pos ? pos.x : e[i + 2]
      const y = pos ? pos.y : e[i + 3]
      const flags = e[i + 6]
      let st = this.states.get(id)
      if (!st) {
        st = {
          born: fresh && e.length > STRIDE.enemies * 6 ? -9 : this.clock,
          seen: this.frame,
          windup: -9,
          blink: false
        }
        this.states.set(id, st)
      }
      st.seen = this.frame
      if (flags & ENEMY_FLAG.windup) {
        if (st.windup < 0) st.windup = this.clock
      } else st.windup = -9
      const blinking = (flags & ENEMY_FLAG.blink) !== 0
      if (blinking !== st.blink) {
        st.blink = blinking
        // Vanishes and reappears in a puff of smoke.
        if (visible(x, y)) this.fx.sprite('poof', x, y, { life: 0.3, scale: 0.9, fade: false })
      }
      if (!visible(x, y)) continue
      const ent = (this.ents[this.entCount] ??= {
        y: 0,
        kind: 0,
        id: 0,
        x: 0,
        yy: 0,
        hp: 0,
        flash: 0,
        flags: 0,
        tagLift: 0
      })
      this.entCount++
      ent.y = y + def.radius * 0.8
      ent.def = def
      ent.kind = e[i + 1]
      ent.player = undefined
      ent.id = id
      ent.x = x
      ent.yy = y
      ent.hp = e[i + 4]
      ent.flash = e[i + 5]
      ent.flags = flags
      ent.state = st
      if (flags & ENEMY_FLAG.windup) this.winders.push(ent)
    }
    if (this.frame % 60 === 0) {
      for (const [id, entry] of this.shown) if (entry.seen !== this.frame) this.shown.delete(id)
      for (const [id, entry] of this.states) if (entry.seen !== this.frame) this.states.delete(id)
    }

    // Ground effects first (auras, zones, shockwaves, clouds), drawn at their real hit radius.
    const s = view.shots
    for (const w of this.winders) this.telegraph(w, origins)
    this.particles(0)
    this.world()
    for (let i = 0; i < s.length; i += STRIDE.shots) this.groundShot(view, this.load(view, origins, i), WEAPONS[s[i]])
    this.landSeeds()
    this.world()

    // Characters: enemies and players Y-sorted so overlaps read correctly.
    const list: Ent[] = this.ents.slice(0, this.entCount)
    // Companions sort on their own feet too, so one standing further up than its owner is drawn behind them (and,
    // listed before the players, one level with their feet is too). One fighting an enemy it overlaps — a pet biting
    // it, a creature that pulled it in, 過保護親 shoving it — is drawn just in front of that enemy instead of under it,
    // but one standing behind its owner and overlapping their body stays behind them whatever it is fighting.
    const enemies = this.entCount
    for (let i = 0; i < s.length; i += STRIDE.shots) {
      const def = WEAPONS[s[i]]
      const sh = this.load(view, origins, i)
      if (def.behavior === 'sweep' && !this.isPlane(view, def)) {
        // A ground vehicle sorts on its wheels alone, with no companion adjustments.
        if (Math.abs(sh.x - this.camera.x) > halfW + 400) continue
        const y = sh.y + Renderer.VEHICLE_FEET
        list.push({ y, kind: 0, vehicle: i, id: 0, x: sh.x, yy: sh.y, hp: 0, flash: 0, flags: 0, tagLift: 0 })
        continue
      }
      const feet = this.companionFeet(sh, def)
      if (feet === undefined) continue
      if (Math.abs(sh.x - this.camera.x) > halfW + 400 && Math.abs(sh.ox - this.camera.x) > halfW + 400) continue
      const at = this.companionAt(view, sh, def)
      let key = at.y + feet
      if (def.behavior !== 'garden')
        for (let k = 0; k < enemies; k++) {
          const ent = this.ents[k]
          const reach = (ent.def?.radius ?? 0) + 12
          const dx = ent.x - at.x
          const dy = ent.yy - at.y
          if (ent.y + 0.01 > key && dx * dx + dy * dy <= reach * reach) key = ent.y + 0.01
        }
      const owner = origins[s[i + 6]]
      if (owner) {
        const ownerKey = owner.y + 16
        const dx = at.x - owner.x
        const dy = at.y - owner.y
        if (at.y + feet < ownerKey && Math.abs(dx) < 22 && dy > -44 && dy < 8) key = Math.min(key, ownerKey - 0.01)
      }
      list.push({ y: key, kind: 0, shot: i, id: 0, x: at.x, yy: at.y, hp: 0, flash: 0, flags: 0, tagLift: 0 })
    }
    // Name tags of players standing together stack instead of overlapping.
    view.players.forEach((player, i) => {
      const pos = origins[i]
      const lift = view.players.slice(0, i).reduce((height, o) => {
        const q = positions.get(o.id)!
        return height + (Math.abs(q.x - pos.x) < 80 && Math.abs(q.y - pos.y) < 24 ? 13 + (o.cookingBuffs ? 16 : 0) : 0)
      }, 0)
      list.push({
        y: pos.y + 16,
        kind: 0,
        player,
        id: i,
        x: pos.x,
        yy: pos.y,
        hp: 0,
        flash: 0,
        flags: 0,
        tagLift: lift
      })
      // The family sorts on its own feet, so a step behind the player is drawn behind them.
      for (const member of this.family(player, pos, view.phase, dt))
        list.push({
          y: member.y + 16,
          kind: 0,
          member,
          id: i,
          x: member.x,
          yy: member.y,
          hp: 0,
          flash: 0,
          flags: 0,
          tagLift: 0
        })
    })
    if (this.frame % 60 === 0)
      for (const [key, bloom] of this.blooms) if (bloom.frame < this.frame) this.blooms.delete(key)
    if (this.frame % 60 === 0) for (const id of this.families.keys()) if (!positions.has(id)) this.families.delete(id)
    list.sort((a, b) => a.y - b.y)
    // Every enemy's shadow in one path (ghosts cast none), under all the sprites.
    this.world()
    ctx.fillStyle = 'rgba(12,8,20,.28)'
    ctx.beginPath()
    for (const ent of list) {
      if (!ent.def || ent.flags & ENEMY_FLAG.ghost) continue
      const rx = ent.def.radius * 0.9 * (ent.flags & ENEMY_FLAG.elite ? 1.25 : 1)
      ctx.moveTo(ent.x + rx, ent.y)
      ctx.ellipse(ent.x, ent.y, rx, Math.min(6, rx * 0.36), 0, 0, TAU)
    }
    ctx.fill()
    this.bars.length = 0
    this.stacks.clear()
    this.playerAreas.clear()
    this.easeBadgeSide(view, origins, local, dt)
    const overheads: (() => void)[] = []
    this.overheads = overheads
    for (const item of list) {
      if (item.member) this.follower(item.member)
      else if (item.vehicle !== undefined)
        this.vehicle(view, this.load(view, origins, item.vehicle), WEAPONS[s[item.vehicle]])
      else if (item.shot !== undefined) this.companion(view, this.load(view, origins, item.shot), WEAPONS[s[item.shot]])
      else if (item.player) {
        const player = item.player
        const pos = positions.get(player.id)!
        // The boxes food labels keep clear of; a wrapped or stubbed player() (tests, tools) may hand back nothing.
        const boxes: Box[] | undefined = this.player(
          player,
          pos,
          player.id === localId,
          view.time,
          view.phase,
          item.tagLift
        )
        if (boxes?.length) {
          this.foodLabels.players.push(...boxes)
          // The body box first, then the tags above it; the rings at the feet reach FEET_RINGS below them.
          const size = (boxes[0].right - boxes[0].left) / 28
          this.stacks.set(player.id, {
            x: pos.x,
            top: Math.min(...boxes.map((b) => b.top)),
            bottom: Math.max(...boxes.map((b) => b.bottom), pos.y + 16 + FEET_RINGS * size)
          })
          // As drawn: the body's whole frame (64 × 64 about her feet), the tag images (wider than their texts) and
          // the rings (the buff aura with buffs) round the feet.
          const buffs = Object.values(player.cookingBuffs ?? {}).filter(Boolean).length
          const rx = (buffs ? 30 + 4 * (buffs - 1) : 18) * size
          const ry = (buffs ? 11 + 1.5 * (buffs - 1) : 7) * size
          const feet = pos.y + 16
          const body = {
            left: pos.x - 32 * size,
            top: feet - 58 * size,
            right: pos.x + 32 * size,
            bottom: feet + 6 * size
          }
          this.playerAreas.set(player.id, [
            ...boxes.map((b, i) =>
              i ? { ...b, left: b.left - GAMBLE_TAG_PAD, right: b.right + GAMBLE_TAG_PAD } : boxUnion(b, body)
            ),
            { left: pos.x - rx, top: feet - ry, right: pos.x + rx, bottom: feet + ry }
          ])
        }
      } else this.enemy(item)
    }
    this.overheads = undefined
    this.world()
    // Over the characters, the rings 過保護親 light round their children; over those, what is over the players' heads.
    this.drawGuardRings(origins)
    this.world()
    for (const overhead of overheads) overhead()
    this.world()
    this.lifeBars()
    // While your own death plays, the world dims around a spotlight on the body (others' deaths don't).
    const mine = view.players.find((p) => p.id === localId)
    const dying = mine?.downed ? this.deaths.get(mine.id) : undefined
    this.foodLabelAlpha = 1
    if (mine && dying) {
      const pos = positions.get(mine.id)!
      const k = Math.min(1, (this.clock - dying.at) / 0.6)
      this.foodLabelAlpha = 1 - 0.75 * k
      const grad = ctx.createRadialGradient(pos.x, pos.y - 8, 26, pos.x, pos.y - 8, 240)
      grad.addColorStop(0, 'rgba(8,5,14,0)')
      grad.addColorStop(0.25, `rgba(8,5,14,${0.5 * k})`)
      grad.addColorStop(1, `rgba(8,5,14,${0.82 * k})`)
      ctx.fillStyle = grad
      ctx.fillRect(this.camera.x - halfW, this.camera.y - halfH, halfW * 2, halfH * 2)
    }

    this.trailBudget = 70
    for (let i = 0; i < s.length; i += STRIDE.shots) {
      const sh = this.load(view, origins, i)
      if (Math.abs(sh.x - this.camera.x) > halfW + 400 && Math.abs(sh.ox - this.camera.x) > halfW + 400) continue
      this.topShot(view, sh, WEAPONS[s[i]])
    }
    this.world()
    this.drawFoodLabels()

    // Enemy bullets: the animated sprite on a pulsing red danger halo (one baked image per bullet).
    if (view.bullets !== this.flyingBullets) {
      this.flyingBullets = view.bullets
      this.sinceSnapshot = 0
      const b = view.bullets
      const live = new Set(view.bulletIds)
      for (let i = 0; i < b.length; i += STRIDE.bullets) {
        live.add(b[i])
        this.flying.set(b[i], { kind: b[i + 1], x: b[i + 2], y: b[i + 3], vx: b[i + 4], vy: b[i + 5], t: view.time })
      }
      for (const id of this.flying.keys()) if (!live.has(id)) this.flying.delete(id)
    } else if (!view.paused?.length) this.sinceSnapshot += dt
    // Guests draw bullets a little behind the snapshot clock, about where the eased crowd and players stand.
    // ponytail: fixed lag tuned to ease()'s k=dt*14 at 10–15 Hz snapshots; retune if either changes.
    const bulletTime = smooth ? view.time + Math.min(this.sinceSnapshot, 0.15) - 0.1 : view.time
    if (this.flying.size) {
      const sprites = sheet('bullets')
      const sc = this.scale
      const kk = Math.max(1, Math.ceil(sc - 0.01))
      const size = Math.round(40 * sc)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      for (const [id, path] of this.flying) {
        const age = bulletTime - path.t
        const x = path.x + path.vx * age
        const y = path.y + path.vy * age
        if (!visible(x, y)) continue
        const kind = path.kind
        const anim = sprites[BULLET_KINDS[kind]]
        const index = frameIndex(anim, this.clock + id * 0.05)
        const hot = Math.sin(this.clock * 12 + id) > 0
        const image = this.sprite(
          `bullet:${kind}:${index}:${hot}:${kk}`,
          (g) => {
            g.scale(kk, kk)
            const boss = kind >= 5
            const grad = g.createRadialGradient(20, 20, 0, 20, 20, boss ? 19 : 16)
            const tint = boss ? '255,74,42' : '255,51,85'
            grad.addColorStop(0, `rgba(${tint},${hot ? 0.72 : 0.5})`)
            grad.addColorStop(0.55, `rgba(${tint},${hot ? 0.45 : 0.3})`)
            grad.addColorStop(1, `rgba(${tint},0)`)
            g.fillStyle = grad
            g.fillRect(0, 0, 40, 40)
            g.imageSmoothingEnabled = true
            g.drawImage(canvasOf(anim.frames[index], kk), 20 - 9.2, 20 - 9.2, 18.4, 18.4)
          },
          40 * kk,
          40 * kk
        )
        ctx.drawImage(
          image,
          Math.round(this.canvas.width / 2 + (x - this.camera.x) * sc - size / 2),
          Math.round(this.canvas.height / 2 + (y - this.camera.y) * sc - size / 2),
          size,
          size
        )
      }
      this.world()
    }

    // 大往生: a soft warm beam of light falls onto the bed (renderer alpha, not baked into sprites).
    if (view.phase === 'reaper' || view.phase === 'won') {
      const me = view.players.find((p) => p.id === localId) ?? view.players[0]
      if (me) {
        const pos = positions.get(me.id)!
        if (this.beamAt === undefined) this.beamAt = this.clock
        const k = Math.min(1, (this.clock - this.beamAt) / 1.2)
        const top = this.camera.y - halfH
        const grad = ctx.createLinearGradient(0, top, 0, pos.y + 24)
        grad.addColorStop(0, 'rgba(255,236,170,0)')
        grad.addColorStop(1, `rgba(255,236,170,${0.32 * k})`)
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(pos.x - 14, top)
        ctx.lineTo(pos.x + 22, top)
        ctx.lineTo(pos.x + 40, pos.y + 24)
        ctx.lineTo(pos.x - 36, pos.y + 24)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    } else this.beamAt = undefined
    if (view.reaper) {
      // Drawn a step to the side of where it hovers so the old man's face stays visible beside it.
      const x = view.reaper[0] + 30
      const y = view.reaper[1]
      const target = view.players[0] ? positions.get(view.players[0].id)! : { x, y }
      this.shadow(x, y + 66, 26, 0.18)
      // On 大往生 the reaper bows to the departing soul.
      const r = sheet('reaper')
      const frame =
        this.wonAt === undefined
          ? r.move.frames[frameAt(r.move, this.clock)]
          : r.bow.frames[frameAt(r.bow, this.clock - this.wonAt)]
      this.art(frame, x, y + 60, 64, 120, target.x < x)
      this.world()
      this.blit(this.label('死神', 18, '#e6d6ff'), x, y + 76)
    }
    if (this.halo) {
      const halo = sheet('soul').halo
      const frame = halo.frames[frameAt(halo, this.halo.t)]
      this.art(frame, this.halo.x, this.halo.y, frame.w / 2, frame.h, false, this.halo.alpha * 0.88)
      this.world()
      this.halo = undefined
    }

    this.drawParentMemorials(view, dt, smooth)

    // Hits, deaths, level-ups ... : the particles of the fx events.
    this.placeGambles(localId, view.players.length <= 1)
    this.particles(1)
    this.world()

    // Damage numbers: pop in big, settle, drift up; 特攻 stays yellow with "!", crits are bigger, orange-red, "!!".
    const p = view.popups
    for (let i = 0; i < p.length; i += STRIDE.popups) {
      const mine = view.players[p[i + 4]]?.id === localId
      const bits = p[i + 3]
      const strong = (bits & POPUP_BIT.strong) !== 0
      const crit = (bits & POPUP_BIT.crit) !== 0
      const life = p[i + 5] / 100
      const style: NumberStyle = strong && crit ? 'both' : crit ? 'crit' : strong ? 'strong' : mine ? 'mine' : 'other'
      const text = `${p[i + 2]}${crit ? '!!' : strong ? '!' : ''}`
      const age = (1 - life) * 0.6
      const pop = 1 + 0.6 * (1 - easeOut(age / 0.12))
      if (crit && mine && life > 0.85) this.fx.trauma.atLeast(0.14)
      const hop = age < 0.12 ? -Math.sin((age / 0.12) * Math.PI) * 3 : 0
      this.number(text, style, p[i], p[i + 1] - (1 - life) * 24 + hop, pop, Math.min(1, life * 2))
    }

    // Edge arrows toward life events still off-screen.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (let i = 0; i < e.length; i += STRIDE.enemies) {
      const def = ENEMIES[e[i + 1]]
      if (def.behavior !== 'boss') continue
      const dx = e[i + 2] - this.camera.x
      const dy = e[i + 3] - this.camera.y
      if (Math.abs(dx) < halfW - 80 && Math.abs(dy) < halfH - 80) continue
      const a = Math.atan2(dy, dx)
      const cx = this.canvas.width / 2 + Math.cos(a) * (this.canvas.width / 2 - 40)
      const cy = this.canvas.height / 2 + Math.sin(a) * (this.canvas.height / 2 - 40)
      // The boss's own sprite, small, pulsing at the screen edge.
      const frame = sheet(`enemy:${def.id}`).move.frames[0]
      const size = 56 + Math.sin(view.time * 8) * 4
      ctx.globalAlpha = 0.85
      ctx.drawImage(
        canvasOf(frame, 1),
        Math.min(this.canvas.width - 34, Math.max(34, cx)) - size / 2,
        Math.min(this.canvas.height - 34, Math.max(34, cy)) - size / 2,
        size,
        size
      )
      ctx.globalAlpha = 1
    }

    this.overlays(view, mine)
  }
}
