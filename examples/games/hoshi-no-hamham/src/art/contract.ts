/**
 * The art contract: every sheet id, animation name, frame count, frame size and anchor the game draws.
 * Art modules must produce exactly these (extra animations are allowed); `tests/art-contract.test.ts` checks every
 * registered sheet against this file, and `tests/art-complete.test.ts` fails while anything it lists is undrawn.
 *
 * Conventions
 * - Everything is lit from the top-left, uses the master palette and selective outlines, and faces **right**
 *   (the view mirrors frames for left).
 * - Character cells are 64×64 with the feet on (32, 60). ハム代 is 96×96 with the feet on (48, 90). Bosses are
 *   128×128 with the feet on (64, 120). The anchor is drawn on the centre-bottom of the physics box:
 *
 *   | sheet                | physics box (w×h) |     | sheet       | physics box |
 *   | -------------------- | ----------------- | --- | ----------- | ----------- |
 *   | hero                 | 42×46             |     | mom         | 52×52       |
 *   | walker               | 44×38             |     | crowBoss    | 63×63       |
 *   | flyer                | 44×34             |     | weaselBoss  | 63×63       |
 *   | jumper               | 42×42             |     | boarBoss    | 69×69       |
 *   | spitter              | 46×42             |     | wolfBoss    | 66×66       |
 *   | tough                | 52×50             |     | bearBoss    | 72×72       |
 *   | princess (prop cell) | 64×64             |     | foxBoss     | 63×63       |
 *   |                      |                   |     | apeBoss     | 75×75       |
 *   |                      |                   |     | beeBoss     | 63×63       |
 *   |                      |                   |     | king        | 69×69       |
 *
 *   The visible body is about as wide as the box and may be up to 1.4× as tall; ears, tails, wings, capes and
 *   weapons may reach further.
 * - Frame 0 of an attack-like clip is the anticipation; `hit` is the frame of contact or release.
 * - Cell props are 64×64 images placed on the top-left of their map cell (anchor [0, 0]).
 */

export const THEMES = ['meadow', 'night', 'cave', 'forest', 'fortress', 'castle', 'star'] as const
export type ThemeId = (typeof THEMES)[number]

export interface AnimSpec {
  frames: number
  w: number
  h: number
  loop: boolean
  fps: number
  /** Required anchor when it differs from the default for the size (see sheet.ts `defaultAnchor`). */
  anchor?: readonly [number, number]
  /** Frame index of the contact/release moment. */
  hit?: number
  /**
   * A clip that does not loop normally holds its last frame. With `sustain` it keeps cycling its last `sustain`
   * frames instead, for as long as the view shows it: the tension of a held wind-up, the flutter of a long fall,
   * the stars over a knocked-out boss.
   */
  sustain?: number
}

type Specs = Record<string, AnimSpec>

const clip = (
  w: number,
  h: number,
  frames: number,
  fps: number,
  loop: boolean,
  extra: Partial<AnimSpec> = {}
): AnimSpec => ({ w, h, frames, fps, loop, ...extra })
const cell = (frames: number, fps: number, loop: boolean, extra: Partial<AnimSpec> = {}) =>
  clip(64, 64, frames, fps, loop, extra)
const big = (frames: number, fps: number, loop: boolean, extra: Partial<AnimSpec> = {}) =>
  clip(128, 128, frames, fps, loop, extra)
const mid = (frames: number, fps: number, loop: boolean, extra: Partial<AnimSpec> = {}) =>
  clip(96, 96, frames, fps, loop, extra)
/** A cell prop frame placed on its cell's top-left. */
const tileCell = (frames: number, fps: number, loop: boolean) => clip(64, 64, frames, fps, loop, { anchor: [0, 0] })
/** A small centred sprite. */
const small = (size: number, frames: number, fps: number, loop: boolean) => clip(size, size, frames, fps, loop)

// ---------------------------------------------------------------------------------------------------- cast

export const HERO_SPEC: Specs = {
  idle: cell(8, 8, true), // one breath: the chest rises, the head follows, ears and tuft settle a beat later
  // The same eight poses as `idle` with the eyes shut: the view swaps in the frame of the same index for the
  // length of a blink, so a blink never interrupts the breath.
  blink: cell(8, 8, true),
  wait: cell(12, 8, false), // fidget after standing still: looks around, grooms a cheek with both paws, settles
  run: cell(8, 14, true), // contact frames 0 and 4
  turn: cell(2, 20, false), // facing the camera for a moment when he turns around on the spot
  skid: cell(3, 14, false, { sustain: 2 }), // braking when reversing at speed: heels dug in, scarf thrown forward
  jump: cell(3, 14, false, { sustain: 2 }), // launch stretch, then rising with ears and scarf pulled down
  apex: cell(2, 10, false), // the top of the arc: frame 0 still rising (tucked), frame 1 tipping over (opening)
  fall: cell(3, 12, true), // arms up, fur and scarf fluttering
  land: cell(4, 18, false), // squash, rebound, overshoot, settle
  bite: cell(6, 24, false, { hit: 2 }), // anticipation, lunge, CHOMP with the front teeth, recoil, chew, settle
  hurt: cell(3, 12, false),
  die: cell(8, 10, false, { sustain: 2 }), // hit, tumble ×3, bounce, flat on the back, then stars circling (sustain)
  cheer: cell(8, 12, true), // victory hop with both arms up
  swim: cell(6, 10, true) // paddling, cheeks puffed
}

export const PRINCESS_SPEC: Specs = {
  idle: cell(8, 8, true),
  sad: cell(6, 6, true), // caged: trembling, a tear
  cheer: cell(8, 12, true),
  wave: cell(6, 8, true)
}

export const MOM_SPEC: Specs = {
  idle: mid(8, 8, true), // hands on hips, foot tapping
  yell: mid(6, 10, false, { sustain: 2 }), // stage 1 intro: 「こらーっ！」
  move: mid(8, 14, true), // furious run, ladle raised
  stunned: mid(6, 8, true), // dizzy after smashing through a tree or rock
  tired: mid(6, 6, true), // out of breath, rubbing her back
  hurt: mid(3, 12, false)
}

export const ENEMY_KINDS = ['walker', 'flyer', 'jumper', 'spitter', 'tough'] as const
export type EnemyArt = (typeof ENEMY_KINDS)[number]

const DEFEAT = cell(6, 12, false) // the blow, flung back head over heels (drawn, never a turned picture), limp
const HURT = cell(2, 12, false)

export const ENEMY_SPEC: Record<EnemyArt, Specs> = {
  walker: { idle: cell(6, 8, true), move: cell(8, 12, true), hurt: HURT, defeat: DEFEAT },
  flyer: { move: cell(8, 16, true), hurt: HURT, defeat: DEFEAT }, // always flapping
  jumper: {
    idle: cell(6, 8, true), // the throat pumps
    // The frog never rests: the moment it lands it is off again, so this clip is nearly all the player sees of
    // it. The view picks the frame by vertical speed: 0 the launch (fully stretched), 1 rising, 2 the top of the
    // hop (tucked), 3 falling, 4 bracing for the ground (legs reaching down, body starting to squash).
    air: cell(5, 8, false),
    land: cell(3, 14, false),
    hurt: HURT,
    defeat: DEFEAT
  },
  spitter: { idle: cell(6, 8, true), shoot: cell(6, 12, false, { hit: 3 }), hurt: HURT, defeat: DEFEAT },
  tough: { idle: cell(6, 8, true), move: cell(8, 10, true), hurt: HURT, defeat: DEFEAT }
}

/** How each boss fights; decides which clips its sheet needs. */
export const BOSS_KIND = {
  crowBoss: 'flyer',
  weaselBoss: 'brute',
  boarBoss: 'brute',
  wolfBoss: 'brute',
  bearBoss: 'tank',
  foxBoss: 'swarm',
  apeBoss: 'tank',
  beeBoss: 'swarm',
  king: 'final'
} as const
export type BossArt = keyof typeof BOSS_KIND
export const BOSS_ARTS = Object.keys(BOSS_KIND) as BossArt[]

const BOSS_COMMON: Specs = {
  idle: big(6, 8, true),
  intro: big(8, 10, false, { sustain: 2 }), // the roar or pose shown when the fight begins, then held alive
  hurt: big(3, 12, false),
  defeat: big(8, 10, false, { sustain: 2 }) // the last blow, the fall, the bounce, then out cold (stars circling)
}

const BOSS_BY_KIND: Record<(typeof BOSS_KIND)[BossArt], Specs> = {
  // idle → windup → charge along the ground → (wall: stunned) → recover
  brute: {
    windup: big(4, 10, false, { sustain: 2 }), // the whole body commits; the last two frames tremble with tension
    attack: big(6, 16, true),
    stunned: big(6, 8, true),
    recover: big(4, 6, true)
  },
  // hovering idle → windup → dive → recover
  flyer: {
    windup: big(4, 10, false, { sustain: 2 }),
    attack: big(3, 14, true),
    recover: big(4, 8, true)
  },
  // walk → windup (crouch) → leap (air: 0 rising, 1 the top, 2 falling) → land (slam) → recover
  tank: {
    move: big(8, 10, true),
    windup: big(4, 10, false, { sustain: 2 }),
    air: big(3, 8, false),
    land: big(4, 14, false),
    recover: big(4, 6, true)
  },
  // walk → windup → dash → recover
  swarm: {
    move: big(8, 12, true),
    windup: big(4, 12, false, { sustain: 2 }),
    attack: big(6, 16, true),
    recover: big(4, 8, true)
  },
  // walk → windup → charge | leap and slam | cast → recover; `rage` is the phase 2 transformation
  final: {
    move: big(8, 10, true),
    windup: big(4, 12, false, { sustain: 2 }),
    attack: big(6, 16, true),
    air: big(3, 8, false),
    land: big(4, 14, false),
    shoot: big(6, 12, false, { hit: 3 }),
    recover: big(4, 6, true),
    rage: big(10, 10, false, { sustain: 2 })
  }
}

/** The animation specs of a boss sheet: the clips every boss has plus those of its kind. */
export const bossSpec = (art: BossArt): Specs => ({ ...BOSS_COMMON, ...BOSS_BY_KIND[BOSS_KIND[art]] })

// --------------------------------------------------------------------------------------------------- props

const BASE_PROP_SPEC: Record<string, Specs> = {
  // The trunk stands on the middle of its cell; the frame reaches one tile above and half a tile to each side.
  'prop:tree': {
    idle: clip(128, 128, 4, 4, true, { anchor: [64, 124] }),
    cut: clip(128, 128, 4, 4, true, { anchor: [64, 124] }), // after the first bite: a notch in the trunk
    shake: clip(128, 128, 3, 18, false, { anchor: [64, 124] })
  },
  'prop:pine': {
    idle: clip(128, 128, 4, 4, true, { anchor: [64, 124] }),
    cut: clip(128, 128, 4, 4, true, { anchor: [64, 124] }),
    shake: clip(128, 128, 3, 18, false, { anchor: [64, 124] })
  },
  // A fallen tree is a solid block four tiles long and one tile high: trunk with the stump on the left, the
  // crushed crown on the right, a top the hero can visibly walk on. `under` fills a cell where it spans a pit.
  'prop:log': {
    tree: clip(256, 64, 1, 1, false, { anchor: [0, 0] }),
    pine: clip(256, 64, 1, 1, false, { anchor: [0, 0] }),
    under: tileCell(1, 1, false)
  },
  'prop:pipe': { idle: tileCell(2, 2, true), burst: tileCell(4, 12, true), done: tileCell(1, 1, false) },
  // `post` is a tileable pole and `arm` the bracket the hive hangs from, so a hive is never floating.
  'prop:hive': {
    idle: tileCell(4, 5, true),
    broken: tileCell(1, 1, false),
    post: tileCell(1, 1, false),
    arm: tileCell(1, 1, false)
  },
  'prop:animal': { sleep: tileCell(4, 3, true), wake: tileCell(3, 12, false), run: tileCell(6, 14, true) },
  'prop:rock': { idle: tileCell(1, 1, false), cracked: tileCell(1, 1, false) },
  'prop:switch1': { off: tileCell(2, 3, true), flip: tileCell(3, 16, false), on: tileCell(2, 3, true) },
  'prop:switch2': { off: tileCell(2, 3, true), flip: tileCell(3, 16, false), on: tileCell(2, 3, true) },
  // Doors are one tile wide and several tall: a cap, a tileable middle and a foot.
  'prop:door1': { top: tileCell(1, 1, false), mid: tileCell(1, 1, false), bottom: tileCell(1, 1, false) },
  'prop:door2': { top: tileCell(1, 1, false), mid: tileCell(1, 1, false), bottom: tileCell(1, 1, false) },
  // The barrier that seals a boss arena.
  'prop:gate': { top: tileCell(4, 8, true), mid: tileCell(4, 8, true), bottom: tileCell(4, 8, true) },
  // The goal flag stands in its cell; the frame reaches one tile above it.
  'prop:goal': {
    locked: clip(64, 128, 2, 2, true, { anchor: [0, 64] }),
    open: clip(64, 128, 6, 10, true, { anchor: [0, 64] })
  },
  'prop:nest': {
    locked: clip(128, 64, 2, 2, true, { anchor: [32, 0] }),
    open: clip(128, 64, 4, 6, true, { anchor: [32, 0] })
  },
  // Drawn around ハム姫's cell: `back` behind her, `front` over her.
  'prop:cage': {
    back: clip(96, 96, 1, 1, false, { anchor: [16, 28] }),
    front: clip(96, 96, 1, 1, false, { anchor: [16, 28] }),
    break: clip(96, 96, 4, 14, false, { anchor: [16, 28] })
  },
  'prop:fruit': { idle: small(32, 4, 8, true) },
  'prop:star': { idle: small(32, 6, 10, true) },
  'prop:twig': { idle: small(32, 2, 3, true) },
  'prop:berry': { idle: small(32, 2, 3, true) },
  'prop:seed': { spin: small(16, 4, 14, true) }, // acorn spat by リス団員
  'prop:feather': { spin: small(24, 4, 14, true) }, // カラス助
  'prop:stinger': { fly: small(24, 2, 14, true) }, // ハチ女王
  'prop:orb': { pulse: small(24, 4, 12, true) }, // きつね旋風 and 黒ハム王
  'prop:shock': { roll: clip(48, 32, 4, 14, true, { anchor: [24, 30] }) }, // ground shockwave
  'prop:bee': { fly: small(24, 2, 24, true) }
}

// ---------------------------------------------------------------------------------------------- tree worlds

/**
 * The bitable trees and their logs have their own drawings in the worlds that are not meadows. A variant sheet is
 * called `<sheet>:<variant>` and has exactly the clips, sizes and anchors of the original, so the view only has
 * to pick the sheet (`themedProp`).
 */
export const TREE_VARIANTS = ['cave', 'keep', 'star'] as const
export type TreeVariant = (typeof TREE_VARIANTS)[number]
const TREE_PROPS = ['prop:tree', 'prop:pine', 'prop:log'] as const

/** Which variant a world uses (meadow, night and forest keep the original drawings). */
const TREE_VARIANT_OF: Partial<Record<ThemeId, TreeVariant>> = {
  cave: 'cave',
  fortress: 'keep',
  castle: 'keep',
  star: 'star'
}

export const PROP_SPEC: Record<string, Specs> = {
  ...BASE_PROP_SPEC,
  ...Object.fromEntries(
    TREE_PROPS.flatMap((id) => TREE_VARIANTS.map((v) => [`${id}:${v}`, BASE_PROP_SPEC[id]] as const))
  )
}

/** The sheet to draw for a prop in a world: the world's own tree, pine or log, else the id itself. */
export function themedProp(id: string, theme: ThemeId): string {
  const variant = TREE_VARIANT_OF[theme]
  return variant && (TREE_PROPS as readonly string[]).includes(id) ? `${id}:${variant}` : id
}

// ----------------------------------------------------------------------------------------------- effects

export const FX_SPEC: Specs = {
  dust: small(32, 5, 16, false),
  puff: small(48, 6, 14, false), // the poof an enemy leaves
  smoke: small(32, 6, 12, false),
  spark: small(32, 4, 20, false), // hit spark
  star: small(16, 4, 12, true), // impact star
  shine: small(16, 4, 12, false), // glint on steel and gems
  sparkle: small(16, 4, 14, false),
  chomp: clip(64, 64, 5, 24, false, { hit: 2 }), // the jaws that snap in front of the hero
  ring: small(64, 5, 18, false), // expanding shock ring
  boom: small(64, 6, 16, false), // cartoon explosion
  glow: small(64, 1, 1, false), // soft dithered light disc
  leaf: small(16, 4, 8, true),
  needle: small(8, 2, 8, true),
  chip: small(8, 2, 8, true), // wood
  clod: small(12, 2, 8, true), // dirt
  shard: small(12, 3, 10, true), // rock
  drop: small(8, 2, 8, true), // water
  splash: clip(48, 32, 5, 16, false, { anchor: [24, 30] }),
  bubble: small(8, 3, 6, true),
  gush: clip(64, 64, 4, 12, true, { anchor: [0, 0] }), // the fountain above a burst pipe
  honey: small(8, 2, 6, true),
  feather: small(16, 4, 8, true),
  heart: small(16, 4, 8, true),
  confettiA: small(8, 4, 12, true),
  confettiB: small(8, 4, 12, true),
  confettiC: small(8, 4, 12, true),
  zzz: small(16, 3, 2, true),
  alert: clip(16, 24, 2, 8, true), // "!"
  anger: small(16, 2, 8, true),
  sweat: small(16, 3, 8, true),
  dizzy: clip(48, 24, 4, 10, true), // stars circling a stunned head
  arrow: small(32, 2, 4, true) // points at the open goal
}

// ------------------------------------------------------------------------------------------------- interface

const icon = () => small(16, 1, 1, false)
const face = () => small(32, 1, 1, false)

export const UI_SPEC: Specs = {
  heartFull: icon(),
  heartEmpty: icon(),
  heartGain: small(16, 4, 14, false),
  heartLose: small(16, 4, 14, false),
  soundOn: icon(),
  soundOff: icon(),
  pause: icon(),
  play: icon(),
  lock: icon(),
  starOn: icon(),
  starOff: icon(),
  arrowLeft: icon(),
  arrowRight: icon(),
  arrowUp: icon(),
  arrowDown: icon(),
  tooth: icon(),
  jump: icon(),
  home: icon(),
  retry: icon(),
  next: icon(),
  clock: icon(),
  check: icon(),
  sun: icon(),
  moon: icon(),
  paw: icon(),
  // Faces for the boss bar, the stage select and the story panels.
  face_hero: face(),
  face_princess: face(),
  face_mom: face(),
  face_crowBoss: face(),
  face_weaselBoss: face(),
  face_boarBoss: face(),
  face_wolfBoss: face(),
  face_bearBoss: face(),
  face_foxBoss: face(),
  face_apeBoss: face(),
  face_beeBoss: face(),
  face_king: face(),
  // One emblem per world for the stage select.
  theme_meadow: face(),
  theme_night: face(),
  theme_cave: face(),
  theme_forest: face(),
  theme_fortress: face(),
  theme_castle: face(),
  theme_star: face(),
  // The pixel logotype 「星のハムハム」.
  logo: clip(384, 128, 1, 1, false),
  // Nine-slice sources (8 px corners): a night panel with a gold rim and a cream paper card.
  panel: small(24, 1, 1, false),
  paper: small(24, 1, 1, false)
}

/** Every sheet id with its animation specs. */
export function allSheetSpecs(): Record<string, Specs> {
  return {
    hero: HERO_SPEC,
    princess: PRINCESS_SPEC,
    mom: MOM_SPEC,
    ...ENEMY_SPEC,
    ...Object.fromEntries(BOSS_ARTS.map((art) => [art, bossSpec(art)])),
    ...PROP_SPEC,
    fx: FX_SPEC,
    ui: UI_SPEC
  }
}

// --------------------------------------------------------------------------------------------------- terrain

export const TILE_KINDS = ['solid', 'dirt', 'platform', 'spike'] as const
export type TileKind = (typeof TILE_KINDS)[number]
/** What a neighbouring cell holds: a tile kind, `empty`, or `undefined` outside the map. */
export type Neighbour = TileKind | 'empty' | undefined

/** What the terrain painter needs to know about one tile. */
export interface TileQuery {
  theme: ThemeId
  kind: TileKind
  /** The 8 neighbours in order N, NE, E, SE, S, SW, W, NW. */
  around: readonly Neighbour[]
  /** Map coordinates, for deterministic variation. */
  tx: number
  ty: number
}

/** A small decoration the view scatters over exposed terrain by a position hash. */
export interface DecorSpec {
  /** `top`: stands on an exposed top edge. `under`: hangs from an exposed underside. */
  where: 'top' | 'under'
  /** Relative frequency among the theme's decorations of the same `where`. */
  weight: number
}

// ------------------------------------------------------------------------------------------------- backdrops

/** The logical view size backdrops are painted for. */
export const VIEW_W = 640
export const VIEW_H = 360

export const AMBIENCE = ['none', 'pollen', 'fireflies', 'dust', 'leaves', 'embers', 'stardust'] as const
export type Ambience = (typeof AMBIENCE)[number]
