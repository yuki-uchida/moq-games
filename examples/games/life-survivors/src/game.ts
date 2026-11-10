import {
  BULLET_INDEX,
  COOKING_EFFECTS,
  COOKING_ITEMS,
  ENEMY_BY_ID,
  ENEMY_INDEX,
  EVENTS,
  ITEM_KINDS,
  WEAPON_LEVELS,
  MAX_GAME_PLAYERS,
  MAX_PASSIVE_LEVEL,
  MAX_WEAPON_LEVEL,
  PARENTS,
  PARENT_LEGACIES,
  PASSIVES,
  PASSIVE_BY_ID,
  PASSIVE_SLOTS,
  PEOPLE_FEAR,
  PEOPLE_FEAR_UNTIL_AGE,
  PLAYER_COLORS,
  POOLS,
  RUN_SECONDS,
  STAGES,
  TALENT_CATEGORIES,
  TALENT_WEAPONS,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_INDEX,
  WEAPON_SLOTS,
  isRelationshipEnemy,
  ageAt,
  stageAt,
  type BossPattern,
  type EnemyDef,
  type TalentCategory,
  type Tag,
  type WeaponDef
} from './data'
import { FX, FX_CAP, FX_WINDOW, guardBits, type FxEvent } from './fx'
import { bodyScale } from './body-size'
import { FAMILY_SLOTS } from './family-slots'
import {
  GUARDIAN_BODY,
  OVERHEAD,
  CHILD_DRAWN,
  boxAbout,
  boxesOverlap,
  childDrawnBox,
  overheadBoxes,
  type OverheadBox
} from './overhead'
import { LIFE_OUTCOMES, parentFarewell, type LifeDecision, type ParentReward } from './history'
import { rankedCareer, type Career } from './careers'
import {
  GAMBLE_FORMS,
  PET_LIFESPAN,
  PET_MEMORY,
  PET_TYPES,
  gambleForm,
  observationSprite,
  weaponAppearance
} from './weapon-life'

/** 読書: beam i fans out from the facing — back, then left/right, then halving the gaps. */
export function beamSpread(i: number): number {
  if (i <= 0) return 0
  const level = Math.floor(Math.log2(i))
  return ((2 * (i - 2 ** level) + 1) * Math.PI) / 2 ** level
}

export const STRONG_MULTIPLIER = 2.5
export const GIFTED = 1.7
export const POOR = 0.55
export const SPAWN_RADIUS = 780
export const VIEW_HALF = { x: 640, y: 360 }
export const REAPER_SECONDS = 4
export const MAX_BULLETS = 140
const hasFixedInterval = (id: string) =>
  id === 'p_toxic' || id === 'p_over' || id === 'w_perfume' || id === 'w_observe' || id === 'w_cooking'
/** A critical hit hits this much harder. */
export const CRIT_MULTIPLIER = 2
/**
 * ヤンキー親's raid as shares of its life: storming out until `kick`, the flying kick until `back`, then the
 * swagger home. The renderer reads the same timeline from the shot's age.
 */
export const RAID = { kick: 0.3, back: 0.46 } as const
/** How far out a raid is, as a share of its reach, after `t` (0..1) of its life; it ends back at the owner. */
export function raidReach(t: number) {
  if (t < RAID.kick) {
    const k = t / RAID.kick
    return 0.8 * k * (0.6 + 0.4 * k)
  }
  if (t < RAID.back) return 0.8 + 0.2 * Math.sin(((t - RAID.kick) / (RAID.back - RAID.kick)) * (Math.PI / 2))
  return 1 - (t - RAID.back) / (1 - RAID.back)
}
const PLAYER_RADIUS = 14
/**
 * 過保護: where the all-round reach of a parent guarding a standing child is centred, as it always was (her old place
 * behind the child): this far above the child and `h·r·` this far across (see shieldTouches).
 */
const GUARDIAN_SHIELD_LIFT = 5
const GUARDIAN_SHIELD_SPREAD = 0.6
/**
 * 過保護: where she stands beside a standing child: `GUARDIAN_REST_X + 14·size` px out to the side and `GUARDIAN_REST_Y`
 * px from the child's centre, her face and figure clear of the child; each further parent on that side stands
 * `GUARDIAN_REST_GAP` px further out.
 */
const GUARDIAN_REST_X = 10
const GUARDIAN_REST_Y = -1
const GUARDIAN_REST_GAP = 23
/** How near (px) another player stands for the parents of a standing child to take the side away from them. */
const GUARDIAN_NEIGHBOUR = 90
/** How near (px) another player, her family and parents stand for the parents of a standing child to keep clear of them. */
const GUARDIAN_NEIGHBOUR_REACH = 160
/**
 * 過保護: while the child walks up the screen, her parents walk at her shoulders (`GUARDIAN_UP_Y`·size from her centre),
 * just outside her name tag, buff rows and gamble badge (GUARDIAN_UP_CLEAR px to spare); a parent further out on a side
 * stands `GUARDIAN_REST_GAP` px further on.
 */
const GUARDIAN_UP_Y = -18
const GUARDIAN_UP_CLEAR = 4
/**
 * How steeply (px down per px across) the line a walking parent keeps below rises as she nears the overhead boxes from
 * the side, so she ducks below them smoothly rather than in one step (see guardianOverheadFloor).
 */
const GUARDIAN_FLOOR_SLOPE = 4
/**
 * The fastest (px/s, 4.5 px a frame at 60 fps) any 過保護親 moves relative to her child: about twice the child's
 * walk, so she walks (or runs) over to a new place rather than glides.
 */
export const GUARDIAN_SPEED = 270
/**
 * Walking (the view's GUARD_WALK bit): from this speed over the ground (px/s) on, and until she has stayed under
 * GUARDIAN_WALK_OFF px/s for GUARDIAN_WALK_HOLD s, so the walk does not flicker on and off.
 */
const GUARDIAN_WALK_ON = 40
const GUARDIAN_WALK_OFF = 25
const GUARDIAN_WALK_HOLD = 0.12
/** Walking mostly up or down the screen, she still faces this much (share of her speed) to her own side. */
const GUARDIAN_FACE_SIDE = 0.25
/** How far (0..1) her child has come to stand (Shot.guardianStill) for 過保護親 to head for her place beside her. */
const GUARDIAN_STAND = 0.3
/** 過保護: the least distance between the centres of any two parents of the same child (kept in their line's order). */
export const GUARDIAN_GAP = 22
/** Two parents whose centres are nearer than this across and up and down (px) stand drawn over each other. */
export const GUARDIAN_OVERLAP = { x: 12, y: 18 } as const
/**
 * The child's body (|dx| < x·size, top·size < dy < bottom about her centre) that 過保護親's centre never crosses, and
 * the room (px) she keeps round it: she goes round the child instead (guardianStep).
 */
export const GUARDIAN_CHILD = { x: 12, top: -30, bottom: 14 } as const
const GUARDIAN_CHILD_MARGIN = 3
/**
 * The room her way round the child keeps (|dx| < x·size, top·size < dy < bottom about the child's centre): no
 * parent's figure or shield reaches more than GUARDIAN_DRAWN_CLEAR px into it as she goes round the child.
 */
const GUARDIAN_ROUTE = { x: 11, top: -30, bottom: 16 } as const
const GUARDIAN_DRAWN_CLEAR = 4
/**
 * The child's body as drawn (CHILD_DRAWN, scaled about her feet by her body size: childDrawnBox): the way a parent
 * faces never holds her shield GUARDIAN_SHIELD_CLEAR px or more into it, across and up and down.
 */
const GUARDIAN_DRAWN = CHILD_DRAWN
const GUARDIAN_SHIELD_CLEAR = 1
/**
 * The side (left or right) 過保護親 is drawn facing holds GUARDIAN_FACE_HOLD s before she turns to the other, unless
 * her shield would lie over her child, her head or her family where she faces (and not the other way); and holds
 * GUARDIAN_FACE_LEAST s (over ten frames at 60 fps) whatever her shield lies over. Beside a standing child she turns to
 * face the way she goes only on her way to a place more than GUARDIAN_FACE_TURN px off (and keeps facing it while
 * more than GUARDIAN_FACE_KEEP px off); on a shorter way (back to her place, say) she keeps facing out from the child.
 */
const GUARDIAN_FACE_HOLD = 0.25
const GUARDIAN_FACE_LEAST = 0.18
const GUARDIAN_FACE_TURN = 40
const GUARDIAN_FACE_KEEP = 30
/** How many points (one a frame at 60 fps) on her way over GUARDIAN_FACE_HOLD 過保護親 looks at as she turns. */
const GUARDIAN_FACE_STEPS = 15
/**
 * 過保護親 going against the way she faces (at least GUARDIAN_BACK_ACROSS px/s across the screen over the ground) steps
 * back: no faster than GUARDIAN_BACK_SPEED px/s relative to her child (two thirds of the child's walk). Walking (the
 * view's GUARD_WALK bits), from GUARDIAN_WALK_FAST px/s over the ground on she plays her walk twice as fast.
 */
const GUARDIAN_BACK_SPEED = 90
const GUARDIAN_BACK_ACROSS = 30
const GUARDIAN_BACK_ROOM = 3 * GUARDIAN_GAP
const GUARDIAN_WALK_FAST = 200
/** How long (s) the way 過保護親 goes over the ground takes to tell which way she faces as she goes. */
const GUARDIAN_FACE_DRIFT = 0.05
/** How much less (a share a step) what lies a step further on her way counts as she weighs which way to face. */
const GUARDIAN_FACE_FADE = 0.8
/** How far (px) clear of the child, what is over her head and her family 過保護親 would hold her shield as she turns. */
const GUARDIAN_FACE_PAD = 6
const GUARDIAN_FACE_CHILD = 3
/** How far into what she keeps out of round the child (its share) a way she looks along may go before she trusts it no more. */
const GUARDIAN_FACE_THROUGH = 0.9
/** How much further (px) than her thrust shield reaches the renderer still thrusts it at an enemy. */
const GUARDIAN_STRIKE_SLACK = 16
/** How far (px, times the shield's size) the renderer thrusts 過保護親's shield out at the enemy she bashes. */
const GUARDIAN_THRUST = 14
/** How far out (px, times body size) from the child anything a parent's shield could be drawn over reaches. */
const GUARDIAN_SHIELD_NEAR = 45
/** How far apart (px) the points are that a parent checks along her way for the child and the boxes over her head. */
const GUARDIAN_PATH_STEP = 3
/** How many times over a parent counts the part of her way inside what she keeps out of (see guardianStep). */
const GUARDIAN_INSIDE = 12
/** How much longer (px) a parent counts going round below her child than behind her (see guardianStep). */
const GUARDIAN_BELOW = 24
/** How many places round another parent (or round where she stood) a parent weighs when she must keep clear. */
const GUARDIAN_AROUND = 48
/** How far (px, at most 12) a parent hemmed in by the child and another coming at her may dodge in a step. */
const GUARDIAN_DODGE = 12
/**
 * A resting pet a parent goes round on her way, if it is within GUARDIAN_PET_NEAR px of her: her centre keeps this far
 * (px) to either side of the pet's, and up and down from it.
 */
const GUARDIAN_PET = { x: 18, up: 20, down: 24 } as const
const GUARDIAN_PET_NEAR = 60
const GUARDIAN_SLIDE = 0.1
/** How far (px) into what she keeps out of a parent may be as her straight way starts (or how near her goal is), and
 * still go straight. */
const GUARDIAN_GRAZE = 1
/** The ways (cos, sin) to those GUARDIAN_AROUND places. */
const GUARDIAN_AROUND_WAYS = Array.from({ length: GUARDIAN_AROUND }, (_, k) => [
  Math.cos((2 * Math.PI * k) / GUARDIAN_AROUND),
  Math.sin((2 * Math.PI * k) / GUARDIAN_AROUND)
])
/** How far (px) from another parent's centre, and by how many points round her, a parent finds her way round her. */
const GUARDIAN_PASS = GUARDIAN_GAP + 3
const GUARDIAN_ROUND = 8
/** How far (px) round the way she would go straight a parent looks for the others to find her way round. */
const GUARDIAN_NEAR_WAY = 50
/**
 * 生き物観察's creature as drawn (its sprites reach 16 px either side of its centre and 15 px above and below): a
 * standing child's parents stand clear of it.
 */
export const CREATURE_BODY = { x: 16, y: 15 } as const
/** A family member (FAMILY_SCALE of a player's figure) on a family slot: half-width and reach up and down (px). */
const FAMILY_BODY = { x: 11, top: -28, bottom: 21 } as const
/** Another player's body as drawn: half-width and reach up and down (px) from her centre. */
const PLAYER_BODY = { x: 14, top: -42, bottom: 22 } as const
/**
 * The shield 過保護親 holds (its art spans -1..16 px out on the side she faces and 8 px above to 11 px below her centre,
 * scaled by r/20): a parent standing in a row stands outside the shields of the others.
 */
export const GUARDIAN_SHIELD_ART = { near: -1, far: 16, top: -8, bottom: 11 } as const
/**
 * How far (px) past the next parent's centre in a row a parent's shield, held out from her, may reach: it covers no
 * more than 6 px (under a third) of the 20 px wide figure, which reaches 14 px back from her centre.
 */
const GUARDIAN_SHIELD_SHOWN = 8
/** How far (px) from the child her own parents stand at most beside her standing, and the gamble's copies. */
const GUARDIAN_OWN_NEAR = 61.5
const GUARDIAN_COPY_NEAR = 136
/**
 * How far back (px, up the screen) the second row of a standing child's parents stands behind the first, and how far
 * ahead (down) the row in front stands (half a step out): clear of the first row's shields.
 */
const GUARDIAN_FRONT_ROW = 30
const GUARDIAN_BACK_ROW = 26
/** Reach around the child within which a walking guardian can also bash enemies right behind. */
const GUARDIAN_CLOSE_REACH = 26
/** 生き物観察: how far (radians) a creature's way out turns down the screen at a time to miss 過保護親, and how often. */
const OBSERVATION_TURN = (15 * Math.PI) / 180
const OBSERVATION_TURNS = 4
/** 生き物観察: the steepest angle above the horizon at which a creature appears in front of an upward-facing player. */
const OBSERVATION_MAX_ELEVATION = (20 * Math.PI) / 180
/** How far from their owner a new pet's first choice of resting spot lies (see petRestAngle), and モンスターペアレント rests. */
const PET_REST_RADIUS = 34
/** The rings of idle pets' resting spots round their owner (px), and the most room (px along the arc) each spot takes. */
const PET_SPOT_RADII = [34, 56, 78, 100] as const
const PET_SPOT_ROOM = 23
/** The arc the spots lie along: -20° to 200° (screen y down), round the sides and below, never above the head. */
const PET_SPOT_FROM = (-20 * Math.PI) / 180
const PET_SPOT_ARC = (220 * Math.PI) / 180

/**
 * Idle pets' resting spots: offsets from their owner, evenly along the arc on each ring, `1 + floor(arc / 23)` to a
 * ring (6, 10, 14 and 17), no two closer than 22 px. Each pet holds one (Shot.restSpot), see Game.assignPetSpots.
 */
export const PET_SPOTS: readonly { x: number; y: number }[] = PET_SPOT_RADII.flatMap((radius) => {
  const count = 1 + Math.floor((radius * PET_SPOT_ARC) / PET_SPOT_ROOM)
  return Array.from({ length: count }, (_, j) => {
    const angle = PET_SPOT_FROM + (PET_SPOT_ARC * j) / (count - 1)
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
})

/**
 * Half-sizes (px) of the boxes round other companions where no resting pet may stand: a spot with |dx| < x and
 * |dy| < y from one is blocked. 過保護親 (where she stands and where she is heading) and モンスターペアレント, 生き物観察's creature,
 * and the family's places behind a married player (see Game.petObstacles).
 */
const PET_CLEAR_GUARDIAN = { x: 22, y: 26 } as const
const PET_CLEAR_CREATURE = { x: 22, y: 22 } as const
const PET_CLEAR_FAMILY = { x: 20, y: 24 } as const
/** About how far (px) a resting pet's figure reaches either way from its centre. */
export const PET_HALF = { x: 12, y: 12 } as const
/**
 * Another living player's body (|dx| < 12, -30 < dy < 14 about her centre) with a pet's figure (PET_HALF) round it: the
 * box's centre offset from hers and its half-size.
 */
const PET_CLEAR_PLAYER = { x: 0, y: -8, bx: 12 + PET_HALF.x, by: 22 + PET_HALF.y } as const
/** Half-size (px) of the box round a resting spot taken by another player's pet, so the two never stand 17 px close. */
const PET_CLEAR_PET = 17
/** How much (px) wider every box is for a pet choosing a new spot, so it is not pushed off again straight away. */
const PET_SPOT_SLACK = 8

/** Another companion a resting pet keeps clear of: its offset from the owner and the half-size of its box. */
interface PetObstacle {
  x: number
  y: number
  bx: number
  by: number
}

const petSpotBlocked = (spot: { x: number; y: number }, obstacles: readonly PetObstacle[], slack = 0) =>
  obstacles.some((o) => Math.abs(spot.x - o.x) < o.bx + slack && Math.abs(spot.y - o.y) < o.by + slack)

/** How far apart (px) the points are that a pet checks along its run to a new spot. */
const PET_PATH_STEP = 4

/**
 * Whether a pet can run straight from `from` to `to` (offsets from the owner) without crossing an obstacle's box, other
 * than one it already stands in (it is leaving that one).
 */
function petPathClear(from: { x: number; y: number }, to: { x: number; y: number }, obstacles: readonly PetObstacle[]) {
  const ahead = obstacles.filter((o) => !petSpotBlocked(from, [o]))
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / PET_PATH_STEP)
  for (let j = 1; j < steps; j++) {
    const t = j / steps
    if (petSpotBlocked({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, ahead)) return false
  }
  return true
}

/**
 * 同じ敵を追うペット: where around their target the pets after the first go, as turns (radians) from the side the first
 * one bites from. Twelve places all round, all touching it; a thirteenth goes round again.
 */
const PET_CHASE_TURNS = [0, 1.1, -1.1, 2.2, -2.2, Math.PI, 0.55, -0.55, 1.65, -1.65, 2.75, -2.75] as const
/** Nearer (px) than this to the enemy's centre, the first chaser gives no way to bite from. */
const PET_CHASE_CENTRED = 0.5
/** How much faster than it runs a pet pushed off its resting spot goes to its new one. */
const PET_RELOCATE_SPEED = 2
/**
 * 過保護親: how far ahead (s) a resting pet looks along her swing, and the points along her way (this many, this far
 * apart in px) a pet moving on avoids.
 */
const PET_GUARDIAN_LOOKAHEAD = 0.15
const PET_GUARDIAN_PATH_SAMPLES = 8
const PET_GUARDIAN_PATH_STEP = 20
/** The moments (s) ahead, up to PET_GUARDIAN_LOOKAHEAD, at which a resting pet already keeps clear of 過保護親. */
const PET_GUARDIAN_SOON = [1 / 60, 0.05, 0.1, PET_GUARDIAN_LOOKAHEAD] as const
/** How near (px, either side, and up and down from her) 過保護親 a pet on its way to a new spot stops short of her. */
const PET_GUARDIAN_WAIT = { x: 18, up: 24, down: 20 } as const
/** A pet that has moved no more than this (px) in a step is standing still. */
const PET_STILL_STEP = 0.3

/**
 * Which way (radians) an idle pet would rest from its owner. The monster parent's own `h` slot; other pets spread their
 * `orbit` over the lower half and the sides (-20° to 200°), never in the fan above the owner's head and hat. A gamble's
 * copied pet takes the slot between its owner's own pets (`orbit` + 1.2). A pet looks for its resting spot from here
 * (see Game.assignPetSpots).
 */
export function petRestAngle(weapon: string, source: string, orbit: number, h: number) {
  if (weapon === 'p_monster') return h * Math.PI
  const slot = orbit + (source !== 'w_pet' ? 1.2 : 0)
  return -0.35 + ((((slot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * (Math.PI + 0.7)
}

/**
 * The lowest point (px from the child's centre, so the greatest y) a 過保護親 at `x` must keep below to stay clear of
 * `boxes` over the child's head (overheadBoxes): below every box her figure (GUARDIAN_BODY) overlaps across, and rising
 * GUARDIAN_FLOOR_SLOPE px per px she stands clear of one to the side, so moving across she ducks below them smoothly.
 */
export function guardianOverheadFloor(x: number, boxes: readonly OverheadBox[]) {
  let floor = -Infinity
  for (const box of boxes) {
    const into = Math.min(x + GUARDIAN_BODY.x - box.left, box.right - (x - GUARDIAN_BODY.x))
    floor = Math.max(floor, box.bottom + GUARDIAN_BODY.y - GUARDIAN_FLOOR_SLOPE * Math.max(0, -into))
  }
  return floor
}

/**
 * 過保護親's offset from her child of body size `size` part (`still`) of the way from where she walks (`walk`, from
 * guardianWalkOffset) to her place beside the standing child (`rest`): while the child faces up she keeps below the
 * boxes over the child's head (guardianOverheadFloor), less and less as she comes to stand, so nothing in it jumps.
 */
export function guardianBlend(
  walk: { x: number; y: number },
  rest: { x: number; y: number },
  still: number,
  forwardY: number,
  size: number
) {
  const x = walk.x + (rest.x - walk.x) * still
  let y = walk.y + (rest.y - walk.y) * still
  const duck = guardianDuck(forwardY, still)
  if (duck > 0) y += Math.max(0, guardianOverheadFloor(x, guardianOverhead(size)) - y) * duck
  return { x, y }
}

/** How fully (0..1) 過保護親 keeps below the boxes over the head of her child facing `forwardY` and standing `still`. */
const guardianDuck = (forwardY: number, still: number) =>
  Math.min(1, Math.max(0, -forwardY / 0.15)) * Math.min(1, 2 * (1 - still))

/** How far (px) out to the side of a child of body size `size` her parents walk while she walks up the screen. */
export const guardianUpX = (size: number) => guardianOverheadReach(size) + GUARDIAN_BODY.x + GUARDIAN_UP_CLEAR
/** How far out (px) to either side what is drawn over the head of a child of body size `size` reaches. */
const guardianOverheadReach = (size: number) =>
  Math.max(...guardianOverhead(size).map((box) => Math.max(box.right, -box.left)))

/** 過保護親's offset from her child walking facing (`forwardX`, `forwardY`) in her place in the formation. */
const guardianAhead = (forwardX: number, forwardY: number, guard: { h: number; orbit: number; r: number }) => {
  const ahead = guard.orbit * 0.65
  const across = guard.h * guard.r * 1.5
  return { x: forwardX * ahead - forwardY * across, y: forwardY * ahead + forwardX * across }
}

/**
 * The offset (px) of 過保護親 `guard`, `rank`th in her line (her child's parents and the gamble's copies in order, see
 * Game.guardianLine), from her child of body size `size` walking facing (`forwardX`, `forwardY`), before she steps
 * beside a standing child: where she heads for (guardianStep takes her there). `side` is the shoulder (its sign: +1
 * right, -1 left) the line walks at.
 *
 * Walking down or across they keep the formation ahead of the child (`h` slots across the way she faces). Walking up
 * the screen they all go to the shoulder on the side she last faced, just outside her name tag, buff rows and gamble
 * badge (guardianUpX): the first at shoulder height and each next one a step (`gap`) further out, leaving
 * the other shoulder free for the badge. Facing up at all, none of them heads into those boxes: on her way from the
 * formation to the shoulder she ducks below them (guardianOverheadFloor). Moving over to the other shoulder they go
 * round the child, below her or over the top of those boxes (guardianStep).
 */
export function guardianWalkOffset(
  forwardX: number,
  forwardY: number,
  guard: { h: number; orbit: number; r: number },
  rank: number,
  side: number,
  size = 1,
  gap = GUARDIAN_REST_GAP
) {
  const formation = guardianAhead(forwardX, forwardY, guard)
  // How far she has gone over to the shoulder: from 9° above the horizon, all the way from 40°.
  const up = Math.min(1, Math.max(0, (-forwardY - 0.15) / 0.5))
  // Facing up at all, she keeps below the boxes over the child's head.
  const duck = guardianDuck(forwardY, 0)
  const boxes = guardianOverhead(size)
  const shoulderX = guardianUpX(size) + gap * rank
  const shoulderY = Math.max(GUARDIAN_UP_Y * size, guardianOverheadFloor(shoulderX, boxes))
  const slotX = shoulderX * (side < 0 ? -1 : 1)
  const x = formation.x + (slotX - formation.x) * up
  let y = formation.y + (shoulderY - formation.y) * up
  if (duck > 0) y += Math.max(0, guardianOverheadFloor(x, boxes) - y) * duck
  return { x, y }
}

/** overheadBoxes (with the gamble badge or without) for a child of body size `size`, found once for each. */
const guardianOverheadBySize = new Map<string, OverheadBox[]>()
function guardianOverhead(size: number, badge = true) {
  const key = `${size} ${badge}`
  let boxes = guardianOverheadBySize.get(key)
  if (!boxes) {
    if (guardianOverheadBySize.size > 64) guardianOverheadBySize.clear()
    boxes = overheadBoxes(size, OVERHEAD.rows, badge)
    guardianOverheadBySize.set(key, boxes)
  }
  return boxes
}

/**
 * What 過保護親's centre keeps out of round her child of body size `size`, her shield `shield` times its size: wide
 * and low enough that neither her figure (GUARDIAN_BODY) nor her shield (GUARDIAN_SHIELD_ART, held the way she goes)
 * reaches GUARDIAN_DRAWN_CLEAR px into the room kept round the child (GUARDIAN_ROUTE), and never less than GUARDIAN_CHILD
 * with GUARDIAN_CHILD_MARGIN round it: its middle and half-size.
 */
function guardianChildBox(size: number, shield = 1) {
  const last = guardianChildBoxLast
  if (last.size === size && last.shield === shield) return last.box
  const top = GUARDIAN_CHILD.top * size - GUARDIAN_CHILD_MARGIN
  const bottom = Math.max(
    GUARDIAN_CHILD.bottom + GUARDIAN_CHILD_MARGIN,
    GUARDIAN_ROUTE.bottom + Math.max(GUARDIAN_BODY.y, -GUARDIAN_SHIELD_ART.top * shield) - GUARDIAN_DRAWN_CLEAR + 1
  )
  const hx = Math.max(
    GUARDIAN_CHILD.x * size + GUARDIAN_CHILD_MARGIN,
    GUARDIAN_ROUTE.x * size + GUARDIAN_BODY.x - GUARDIAN_DRAWN_CLEAR + 1
  )
  const box = { cy: (top + bottom) / 2, hx, hy: (bottom - top) / 2 }
  guardianChildBoxLast = { size, shield, box }
  return box
}
/** The last child's box found (most children are one size, most parents' shields one size). */
let guardianChildBoxLast = { size: NaN, shield: NaN, box: { cy: 0, hx: 0, hy: 0 } }
type GuardianChildBox = ReturnType<typeof guardianChildBox>

/** How far out a point (offset from the child) lies, measured in the child's box (below 1: inside it). */
const guardianBoxReach = (p: { x: number; y: number }, box: GuardianChildBox) =>
  Math.max(Math.abs(p.x) / box.hx, Math.abs(p.y - box.cy) / box.hy)

/** `p` moved straight out from the middle of the child's box to its edge, if it is inside it. */
function guardianOutOfChild(p: { x: number; y: number }, box: GuardianChildBox) {
  const reach = guardianBoxReach(p, box)
  if (reach >= 1) return p
  if (reach < 1e-6) return { x: 0, y: box.cy + box.hy }
  return { x: p.x / reach, y: box.cy + (p.y - box.cy) / reach }
}

/** Whether `p` lies inside one of `blocks` (boxes 過保護親's centre keeps out of). */
const guardianInBlock = (p: { x: number; y: number }, blocks: readonly OverheadBox[]) =>
  blocks.some((b) => p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom)

/** `p` moved to the nearest edge (and a pixel on) of each of `blocks` it lies inside. */
function guardianOutOfBlocks(p: { x: number; y: number }, blocks: readonly OverheadBox[]) {
  let at = p
  for (const b of blocks) {
    if (!guardianInBlock(at, [b])) continue
    const ways = [
      { x: b.left - 1, y: at.y },
      { x: b.right + 1, y: at.y },
      { x: at.x, y: b.top - 1 },
      { x: at.x, y: b.bottom + 1 }
    ]
    at = ways.reduce((best, way) =>
      Math.hypot(way.x - p.x, way.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? way : best
    )
  }
  return at
}

/** An open half-plane `nx·x + ny·y < k`. */
interface GuardianPlane {
  nx: number
  ny: number
  k: number
}

/**
 * What 過保護親's centre keeps out of, as open convex shapes (offsets from her child): each a set of half-planes (the
 * child's body, `blocks`, and walking up the part below guardianOverheadFloor under each box over the head) or a disc
 * round another parent.
 */
interface GuardianObstacles {
  shapes: GuardianShape[]
  discs: { x: number; y: number; r: number }[]
}

/** A convex shape: its half-planes and the box it lies within (unbounded where it is). */
interface GuardianShape extends OverheadBox {
  planes: GuardianPlane[]
}

const guardianRect = (b: OverheadBox): GuardianShape => ({
  left: b.left,
  top: b.top,
  right: b.right,
  bottom: b.bottom,
  planes: [
    { nx: -1, ny: 0, k: -b.left },
    { nx: 1, ny: 0, k: b.right },
    { nx: 0, ny: -1, k: -b.top },
    { nx: 0, ny: 1, k: b.bottom }
  ]
})

/**
 * The obstacles for a parent of a child of body size `size`: her body, what lies more than 2 px under
 * guardianOverheadFloor below the name tag and buff rows and, walking up (`duck` over 0.5) or gambling (`badge`), the
 * gamble badge (for each box over the head the floor is the lowest of three lines: level below it and rising
 * GUARDIAN_FLOOR_SLOPE px per px to either side), discs of radius `gap` round `others`, and `blocks`.
 */
function guardianObstacles(
  size: number,
  duck: number,
  others: readonly { x: number; y: number }[],
  gap: number,
  blocks: readonly OverheadBox[],
  badge = false,
  slack = 0,
  shield = 1
): GuardianObstacles {
  let shapes = [...guardianFixedShapes(size, duck > 0.5 || badge, shield), ...blocks.map(guardianRect)]
  // (Brushing no more than `slack` px into one counts as missing it.)
  if (slack > 0)
    shapes = shapes.map((shape) => ({
      ...shape,
      planes: shape.planes.map((h) => ({ ...h, k: h.k - slack * Math.hypot(h.nx, h.ny) }))
    }))
  return { shapes, discs: others.map((o) => ({ x: o.x, y: o.y, r: gap })) }
}

/** The child's body and what lies under guardianOverheadFloor (with the badge or not), by body size (see guardianObstacles). */
const guardianShapesBySize = new Map<string, GuardianShape[]>()
function guardianFixedShapes(size: number, badge: boolean, shield = 1) {
  const key = `${size} ${badge} ${shield}`
  let shapes = guardianShapesBySize.get(key)
  if (shapes) return shapes
  const box = guardianChildBox(size, shield)
  shapes = [guardianRect({ left: -box.hx, right: box.hx, top: box.cy - box.hy, bottom: box.cy + box.hy })]
  // (A box whose floor lies nowhere lower than another's adds nothing: the rows over the name tag.)
  const overhead = guardianOverhead(size, badge)
  const floor = (b: OverheadBox) => b.bottom + GUARDIAN_BODY.y
  const under = overhead.filter(
    (b, i) =>
      !overhead.some(
        (o, j) =>
          j !== i &&
          o.left <= b.left &&
          o.right >= b.right &&
          floor(o) >= floor(b) &&
          (j < i || o.left < b.left || o.right > b.right || floor(o) > floor(b))
      )
  )
  for (const b of under) {
    const c = b.bottom + GUARDIAN_BODY.y
    const left = b.left - GUARDIAN_BODY.x
    const right = b.right + GUARDIAN_BODY.x
    shapes.push({
      left: -Infinity,
      top: -Infinity,
      right: Infinity,
      bottom: c,
      planes: [
        { nx: 0, ny: 1, k: c },
        { nx: -GUARDIAN_FLOOR_SLOPE, ny: 1, k: c - GUARDIAN_FLOOR_SLOPE * left },
        { nx: GUARDIAN_FLOOR_SLOPE, ny: 1, k: c + GUARDIAN_FLOOR_SLOPE * right }
      ]
    })
  }
  if (guardianShapesBySize.size > 64) guardianShapesBySize.clear()
  guardianShapesBySize.set(key, shapes)
  return shapes
}

/** Whether `p` lies inside one of `obstacles`. */
function guardianBlockedAt(p: { x: number; y: number }, obstacles: GuardianObstacles) {
  for (const shape of obstacles.shapes) if (shape.planes.every((h) => h.nx * p.x + h.ny * p.y < h.k)) return true
  for (const d of obstacles.discs) if ((p.x - d.x) ** 2 + (p.y - d.y) ** 2 < d.r * d.r) return true
  return false
}

/** The open stretches (shares of the way, 0..1) from `a` to `b` inside one of `obstacles` (with `any`, the first). */
function guardianSpans(
  a: { x: number; y: number },
  b: { x: number; y: number },
  obstacles: GuardianObstacles,
  any = false
) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const spans: [number, number][] = []
  // (What the way's box misses it misses too.)
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const bottom = Math.max(a.y, b.y)
  for (const shape of obstacles.shapes) {
    if (right <= shape.left || left >= shape.right || bottom <= shape.top || top >= shape.bottom) continue
    let low = -Infinity
    let high = Infinity
    for (const h of shape.planes) {
      const room = h.k - (h.nx * a.x + h.ny * a.y)
      const rate = h.nx * dx + h.ny * dy
      if (rate === 0) {
        if (room <= 0) high = -Infinity
      } else if (rate > 0) high = Math.min(high, room / rate)
      else low = Math.max(low, room / rate)
      if (low >= high) break
    }
    low = Math.max(low, 0)
    high = Math.min(high, 1)
    if (high - low > 1e-9) {
      spans.push([low, high])
      if (any) return spans
    }
  }
  const qa = dx * dx + dy * dy
  for (const d of obstacles.discs) {
    if (right <= d.x - d.r || left >= d.x + d.r || bottom <= d.y - d.r || top >= d.y + d.r) continue
    const ox = a.x - d.x
    const oy = a.y - d.y
    const qb = 2 * (ox * dx + oy * dy)
    const qc = ox * ox + oy * oy - d.r * d.r
    if (qa === 0) {
      if (qc < 0) spans.push([0, 1])
      continue
    }
    const disc = qb * qb - 4 * qa * qc
    if (disc <= 0) continue
    const root = Math.sqrt(disc)
    const low = Math.max(0, (-qb - root) / (2 * qa))
    const high = Math.min(1, (-qb + root) / (2 * qa))
    if (high - low > 1e-9) {
      spans.push([low, high])
      if (any) return spans
    }
  }
  return spans
}

/**
 * The way from `a` to `b` through `obstacles`: how far along (share) she first comes out of those she starts inside
 * (0 if none), or Infinity once she goes back into one after that.
 */
function guardianWayOut(a: { x: number; y: number }, b: { x: number; y: number }, obstacles: GuardianObstacles) {
  if (!guardianBlockedAt(a, obstacles)) return guardianSpans(a, b, obstacles, true).length ? Infinity : 0
  const spans = guardianSpans(a, b, obstacles)
  let out = 0
  if (guardianBlockedAt(a, obstacles))
    for (let grown = true; grown; ) {
      grown = false
      for (const [low, high] of spans)
        if (low <= out + 1e-9 && high > out) {
          out = high
          grown = true
        }
    }
  for (const [low, high] of spans) if (high > out + 1e-9 && low >= out - 1e-9 && low < 1) return Infinity
  return out
}

/**
 * Where 過保護親, `rank`th in her line, goes in one step from `from` toward `to` (offsets from her child of body size
 * `size`), no further than `most` px, by the shortest way round what she keeps out of: the child's body; what is drawn
 * over her head (below guardianOverheadFloor: the name tag and buff rows, and walking up by `duck` or gambling by
 * `badge` the gamble badge); the other parents (`others`, where they now stand, by GUARDIAN_PASS px); and `blocks`
 * (the family behind a married child, 生き物観察's creatures by a standing one). The way runs straight, or by the
 * corners of those: round the child below her (over her body is under her name tag), beside what is over her head,
 * and walking up over the top of it too (each parent further on in her line GUARDIAN_GAP further out and higher).
 * Starting inside one of them, she leaves it by the shortest way out.
 */
export function guardianStep(
  from: { x: number; y: number },
  to: { x: number; y: number },
  most: number,
  duck: number,
  size: number,
  rank = 0,
  others: readonly { x: number; y: number }[] = [],
  blocks: readonly OverheadBox[] = [],
  badge = false,
  shield = 1
) {
  if (most <= 0) return { ...from }
  return guardianAlong(from, guardianWay(from, to, duck, size, rank, others, blocks, badge, shield), most)
}

/** The points (the last her goal) by which guardianStep takes 過保護親 from `from` toward `to`. */
export function guardianWay(
  from: { x: number; y: number },
  to: { x: number; y: number },
  duck: number,
  size: number,
  rank = 0,
  others: readonly { x: number; y: number }[] = [],
  blocks: readonly OverheadBox[] = [],
  badge = false,
  shield = 1
) {
  const box = guardianChildBox(size, shield)
  const goal = guardianOutOfBlocks(guardianOutOfChild(to, box), blocks)
  const boxes = duck > 0.5 ? guardianOverhead(size) : undefined
  // (One standing on her goal is to give way to her there: she goes on.)
  const round = others.filter((o) => Math.hypot(goal.x - o.x, goal.y - o.y) >= GUARDIAN_GAP)
  const obstacles = guardianObstacles(size, duck, round, GUARDIAN_GAP - 1e-6, blocks, badge, 0, shield)
  const blocked = (p: { x: number; y: number }) => guardianBlockedAt(p, obstacles)
  // A straight way's length, with what of it lies inside counted GUARDIAN_INSIDE times; none once it goes back in.
  const cost = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    const out = guardianWayOut(a, b, obstacles)
    return out === Infinity ? Infinity : d + out * d * (GUARDIAN_INSIDE - 1)
  }
  const straight = Math.hypot(goal.x - from.x, goal.y - from.y)
  if (straight <= GUARDIAN_GRAZE) return [goal]
  // Straight, if the way is clear but for the first GUARDIAN_GRAZE px (leaving what she brushes against).
  const leave = guardianWayOut(from, goal, obstacles)
  if (leave * straight <= GUARDIAN_GRAZE) return [goal]
  // The corners she may go by, and what going by each adds.
  const lane = GUARDIAN_GAP * rank
  const top = box.cy - box.hy
  const bottom = box.cy + box.hy
  const beside = guardianOverheadReach(size) + GUARDIAN_BODY.x
  const corners: { x: number; y: number; extra: number }[] = []
  for (const side of [-1, 1]) {
    const x = side * box.hx
    corners.push({ x, y: top, extra: 0 }, { x, y: bottom, extra: boxes ? 0 : GUARDIAN_BELOW })
    corners.push({ x: side * beside, y: 0, extra: 0 }, { x: side * beside, y: bottom, extra: 0 })
    if (boxes) {
      // Over the top, each parent further on in her line GUARDIAN_GAP further out and higher.
      const outside = beside + lane
      const above = Math.min(...boxes.map((b) => b.top)) - GUARDIAN_BODY.y - GUARDIAN_UP_CLEAR - lane
      corners.push({ x: side * outside, y: above, extra: 0 }, { x: side * outside, y: lane, extra: 0 })
    }
  }
  // And round the corners of what else she keeps out of, and the parents before her in her line.
  for (const b of blocks)
    for (const x of [b.left - 1, b.right + 1])
      for (const y of [b.top - 1, b.bottom + 1]) corners.push({ x, y, extra: 0 })
  // (Only round those near her way: the box round `from` and `goal`, GUARDIAN_NEAR_WAY px wider.)
  const left = Math.min(from.x, goal.x) - GUARDIAN_NEAR_WAY
  const right = Math.max(from.x, goal.x) + GUARDIAN_NEAR_WAY
  const high = Math.min(from.y, goal.y) - GUARDIAN_NEAR_WAY
  const low = Math.max(from.y, goal.y) + GUARDIAN_NEAR_WAY
  for (const other of round)
    for (let k = 0; k < GUARDIAN_ROUND && other.x > left && other.x < right && other.y > high && other.y < low; k++) {
      const angle = (2 * Math.PI * k) / GUARDIAN_ROUND
      corners.push({
        x: other.x + Math.cos(angle) * GUARDIAN_PASS,
        y: other.y + Math.sin(angle) * GUARDIAN_PASS,
        extra: 0
      })
    }
  const nodes = corners.filter((corner) => !blocked(corner))
  // Shortest way (A*, from `from` through the corners to `goal`): each step between two corners is weighed (cost) only
  // once nothing shorter is left, counting it first by its straight length (which it is never shorter than).
  const all = [...nodes, { ...goal, extra: 0 }, { ...from, extra: 0 }]
  const end = all.length - 2
  const start = all.length - 1
  const ahead = all.map((node) => Math.hypot(goal.x - node.x, goal.y - node.y))
  const best = all.map(() => Infinity)
  const previous = all.map(() => -1)
  const done = all.map(() => false)
  // A heap of [way so far plus straight to goal, from, to, weighed (1) or not (0), way so far].
  const heap: [number, number, number, number, number][] = []
  const push = (entry: [number, number, number, number, number]) => {
    heap.push(entry)
    for (let i = heap.length - 1; i > 0; ) {
      const up = (i - 1) >> 1
      if (heap[up][0] <= heap[i][0]) break
      ;[heap[up], heap[i]] = [heap[i], heap[up]]
      i = up
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      for (let i = 0; ; ) {
        const l = 2 * i + 1
        const r = l + 1
        let low = i
        if (l < heap.length && heap[l][0] < heap[low][0]) low = l
        if (r < heap.length && heap[r][0] < heap[low][0]) low = r
        if (low === i) break
        ;[heap[low], heap[i]] = [heap[i], heap[low]]
        i = low
      }
    }
    return top
  }
  const open = (at: number) => {
    for (let i = 0; i < start; i++)
      if (!done[i]) {
        const way = best[at] + Math.hypot(all[i].x - all[at].x, all[i].y - all[at].y) + all[i].extra
        push([way + ahead[i], at, i, 0, way])
      }
  }
  best[start] = 0
  done[start] = true
  open(start)
  while (heap.length) {
    const [, at, to, weighed, way] = pop()
    if (done[to]) continue
    if (!weighed) {
      const step = cost(all[at], all[to])
      if (step === Infinity) continue
      const through = best[at] + step + all[to].extra
      push([through + ahead[to], at, to, 1, through])
      continue
    }
    done[to] = true
    best[to] = way
    previous[to] = at
    if (to === end) break
    open(to)
  }
  if (best[end] === Infinity) return [goal]
  const way: { x: number; y: number }[] = []
  for (let i = end; i !== start && i >= 0; i = previous[i]) way.unshift({ x: all[i].x, y: all[i].y })
  return way
}

/** Where `most` px along the way from `from` through `points` in turn lies. */
function guardianAlong(from: { x: number; y: number }, points: readonly { x: number; y: number }[], most: number) {
  let at = from
  let left = most
  for (const point of points) {
    const d = Math.hypot(point.x - at.x, point.y - at.y)
    if (d >= left) return { x: at.x + ((point.x - at.x) * left) / d, y: at.y + ((point.y - at.y) * left) / d }
    at = point
    left -= d
  }
  return { ...at }
}

/**
 * Points on the way (`points`, the last her goal) from `from`: the first `skip` px on, then every `step` px, up to
 * GUARDIAN_FACE_STEPS of them (where she is still, once she is there).
 */
function guardianSamples(
  from: { x: number; y: number },
  points: readonly { x: number; y: number }[],
  skip: number,
  step: number
) {
  const out: { x: number; y: number }[] = []
  let at = from
  let left = skip + step
  for (const point of points) {
    let d = Math.hypot(point.x - at.x, point.y - at.y)
    while (d >= left && out.length < GUARDIAN_FACE_STEPS) {
      at = { x: at.x + ((point.x - at.x) * left) / d, y: at.y + ((point.y - at.y) * left) / d }
      out.push(at)
      d -= left
      left = step
    }
    if (out.length >= GUARDIAN_FACE_STEPS) return out
    at = point
    left -= d
  }
  while (out.length < GUARDIAN_FACE_STEPS) out.push({ ...at })
  return out
}

/**
 * How much (px²) of 過保護親's shield (GUARDIAN_SHIELD_ART, `scale` times its size), at `at` from her child of body
 * size `size` and facing `face`, lies over `boxes` (Game.guardianShieldBoxes): the child's drawn body, the first,
 * counted once it reaches GUARDIAN_SHIELD_CLEAR px into it each way; the others once it reaches GUARDIAN_DRAWN_CLEAR
 * (each of them `pad` px wider all round), what lies over the child counting `child` times.
 */
function guardianShieldOn(
  boxes: readonly OverheadBox[],
  scale: number,
  size: number,
  at: { x: number; y: number },
  face: number,
  pad = 0,
  child = 1
) {
  const side = Math.cos(face) < 0 ? -1 : 1
  const a = at.x + side * GUARDIAN_SHIELD_ART.near * scale
  const b = at.x + side * GUARDIAN_SHIELD_ART.far * scale
  const left = Math.min(a, b)
  const right = Math.max(a, b)
  const top = at.y + GUARDIAN_SHIELD_ART.top * scale
  const bottom = at.y + GUARDIAN_SHIELD_ART.bottom * scale
  // (Nothing of that reaches further out than GUARDIAN_SHIELD_NEAR px, nor further down than the family's feet.)
  if (left > GUARDIAN_SHIELD_NEAR * size || right < -GUARDIAN_SHIELD_NEAR * size) return 0
  if (top > FAMILY_SLOTS[1].dy + FAMILY_BODY.bottom) return 0
  let over = 0
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    const clear = i ? GUARDIAN_DRAWN_CLEAR : GUARDIAN_SHIELD_CLEAR
    const across = Math.min(right, box.right + pad) - Math.max(left, box.left - pad)
    const down = Math.min(bottom, box.bottom + pad) - Math.max(top, box.top - pad)
    if (across >= clear && down >= clear) over += across * down * (i ? 1 : child)
  }
  return over
}

/**
 * `at` (offset from the child of body size `size`) after her step from `from`, made to keep `GUARDIAN_GAP` clear of
 * each of `others` (the parents before her in her line, where they now stand), out of the child's body, walking up
 * (`duck` over 0.5) out of the boxes over her head unless she already stood in them, and no more than `most` px from
 * `from` (with no `from`, anywhere): if it does not, the nearest point to it that does among those `GUARDIAN_GAP` round
 * the others, those `most` round `from` and `from` itself (failing all of them, the nearest clear of the others and
 * the child).
 */
export function guardianKeepApart(
  at: { x: number; y: number },
  from: { x: number; y: number } | undefined,
  others: readonly { x: number; y: number }[],
  most: number,
  size: number,
  duck = 0,
  blocks: readonly OverheadBox[] = [],
  badge = false,
  shield = 1
) {
  const box = guardianChildBox(size, shield)
  const p = guardianOutOfChild(at, box)
  const boxes = guardianOverhead(size, duck > 0.5 || badge)
  const over = (q: { x: number; y: number }) => q.y < guardianOverheadFloor(q.x, boxes)
  const overhead = from !== undefined && over(from)
  const apart = (q: { x: number; y: number }) =>
    guardianBoxReach(q, box) >= 1 - 1e-9 &&
    (overhead || !over(q)) &&
    others.every((o) => Math.hypot(q.x - o.x, q.y - o.y) >= GUARDIAN_GAP - 1e-9) &&
    (!guardianInBlock(q, blocks) || (from !== undefined && guardianInBlock(from, blocks)))
  const near = (q: { x: number; y: number }) => !from || Math.hypot(q.x - from.x, q.y - from.y) <= most + 1e-9
  if (apart(p) && near(p)) return p
  const places: { x: number; y: number }[] = []
  const round = (c: { x: number; y: number }, r: number) => {
    for (const [cos, sin] of GUARDIAN_AROUND_WAYS) places.push({ x: c.x + cos * r, y: c.y + sin * r })
  }
  for (const other of others) round(other, GUARDIAN_GAP + 1e-6)
  if (from) {
    places.push(from)
    if (most > 0) round(from, most * (1 - 1e-6))
    // Along the way to `at`, as far as she may go.
    const d = Math.hypot(p.x - from.x, p.y - from.y)
    if (d > 0)
      for (let k = 1; k <= 8; k++)
        places.push({
          x: from.x + ((p.x - from.x) * Math.min(d, most) * k) / 8 / d,
          y: from.y + ((p.y - from.y) * Math.min(d, most) * k) / 8 / d
        })
  }
  const nearest = (list: { x: number; y: number }[]) => {
    let best: { x: number; y: number } | undefined
    let cost = Infinity
    for (const q of list) {
      const d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d < cost) {
        best = q
        cost = d
      }
    }
    return best
  }
  const out = (q: { x: number; y: number }) => guardianBoxReach(q, box) >= 1 - 1e-9
  // Failing that, she may step over the blocks, then nearer the others (yet never on top of one: not within
  // GUARDIAN_OVERLAP of her), then into the boxes over the head too; but never into the child or further than she may go.
  const clearOf = (q: { x: number; y: number }, gap: number) =>
    others.every((o) => Math.hypot(q.x - o.x, q.y - o.y) >= gap - 1e-9)
  const drawnApart = (q: { x: number; y: number }) =>
    others.every(
      (o) => Math.abs(q.x - o.x) >= GUARDIAN_OVERLAP.x + 0.5 || Math.abs(q.y - o.y) >= GUARDIAN_OVERLAP.y + 0.5
    )
  const reach = places.filter((q) => near(q) && out(q))
  const under = reach.filter((q) => overhead || !over(q))
  // Hemmed in (by the child and one coming at her), she dodges as fast as GUARDIAN_DODGE px a step.
  if (from)
    for (const [cos, sin] of GUARDIAN_AROUND_WAYS)
      places.push({ x: from.x + cos * GUARDIAN_DODGE, y: from.y + sin * GUARDIAN_DODGE })
  const dodge = places.filter(
    (q) =>
      out(q) && (overhead || !over(q)) && (!from || Math.hypot(q.x - from.x, q.y - from.y) <= GUARDIAN_DODGE + 1e-9)
  )
  return (
    nearest(reach.filter(apart)) ??
    nearest(under.filter((q) => clearOf(q, GUARDIAN_GAP))) ??
    nearest(under.filter(drawnApart)) ??
    nearest(dodge.filter((q) => clearOf(q, GUARDIAN_GAP))) ??
    nearest(dodge.filter(drawnApart)) ??
    nearest(reach.filter((q) => clearOf(q, GUARDIAN_GAP))) ??
    nearest(reach.filter(drawnApart)) ??
    nearest(reach) ??
    nearest(places.filter(apart)) ??
    p
  )
}

/**
 * Where 過保護親 settles for, aiming at `aim` (offset from the child of body size `size`) from `from` (or nowhere yet):
 * `aim` itself if it lies clear of the parents before her in her line (`others`, GUARDIAN_GAP round each), out of the
 * child's body, out of `blocks` and, walking up (`duck` over 0.5), out of the boxes over her head; else the nearest
 * place to it that
 * does and that she can go to straight from `from` without coming nearer one of them, so she never stands
 * shuttling round one of the others.
 */
export function guardianSettle(
  aim: { x: number; y: number },
  from: { x: number; y: number } | undefined,
  others: readonly { x: number; y: number }[],
  size: number,
  duck: number,
  blocks: readonly OverheadBox[] = [],
  badge = false,
  shield = 1
) {
  const box = guardianChildBox(size, shield)
  const boxes = guardianOverhead(size, duck > 0.5 || badge)
  const clear = (q: { x: number; y: number }, gap: number) =>
    guardianBoxReach(q, box) >= 1 - 1e-9 &&
    q.y >= guardianOverheadFloor(q.x, boxes) &&
    others.every((o) => Math.hypot(q.x - o.x, q.y - o.y) >= gap - 1e-9) &&
    !guardianInBlock(q, blocks)
  if (clear(aim, GUARDIAN_GAP)) return aim
  // Out of the child and the blocks, below what is drawn over the head, or out beside it; and round the others.
  const floor = guardianOverheadFloor(aim.x, boxes)
  const beside = guardianOverheadReach(size) + GUARDIAN_BODY.x + 1
  const places: { x: number; y: number }[] = [
    guardianOutOfBlocks(guardianOutOfChild(aim, box), blocks),
    { x: aim.x, y: Math.max(aim.y, floor) },
    { x: aim.x < 0 ? -beside : beside, y: aim.y }
  ]
  for (const other of others)
    for (const [cos, sin] of GUARDIAN_AROUND_WAYS)
      places.push({ x: other.x + cos * (GUARDIAN_GAP + 1e-6), y: other.y + sin * (GUARDIAN_GAP + 1e-6) })
  if (from) places.push(from)
  // The nearest to `aim` first: the first she can go to straight (no stretch of the way inside), else the nearest.
  const distances = places.map((q) => Math.hypot(q.x - aim.x, q.y - aim.y))
  const order = places.map((_, i) => i).sort((a, b) => distances[a] - distances[b] || a - b)
  // (Sliding round another parent from one of these places to the next one, she may brush GUARDIAN_SLIDE px inside;
  // only the others count here, as she finds her way round what else stands there, guardianStep.)
  const obstacles = from && {
    shapes: [],
    discs: others.map((o) => ({ x: o.x, y: o.y, r: GUARDIAN_GAP - GUARDIAN_SLIDE }))
  }
  let first: { x: number; y: number } | undefined
  for (const i of order) {
    const q = places[i]
    if (!clear(q, GUARDIAN_GAP)) continue
    first ??= q
    if (!obstacles || !from || guardianSpans(from, q, obstacles, true).length === 0) return q
  }
  return first ?? aim
}

/** The shoulder 過保護親 (now on `side`) walk at while their child faces `forwardX` across (see guardianStep). */
const guardianTargetSide = (forwardX: number, side: number) =>
  forwardX > 0.25 ? 1 : forwardX < -0.25 ? -1 : Math.sign(side) || 1
const BASE_PASSIVE_COUNT = 12
const BASE_SPEED = 135
const STEP = 1 / 60
const MAX_ENEMIES = 560
const MAX_GEMS = 320
const MAX_SHOTS = 420
const MAX_ITEMS = 36
const CELL = 80
const ELITE_FROM = 120
const ELITE_CHANCE = 0.018
const SLOWMO_SECONDS = 1.4
const SLOWMO_SCALE = 0.3
const BULLET_IFRAMES = 0.5
const BOSS_IFRAMES = 0.6
const SHIELD_RECOVERY = 1.5
const guardianBashDuration = (level: number) => 0.35 / (1 + (level - 1) * 0.25)
/** Side slot of a new 過保護親: the gamble's copy stands one slot further out than her own, never on them. */
const guardianSlot = (h: number, copied: boolean) => (copied ? h + (h >= 0 ? 1 : -1) : h)
/** Pixels per second the creature draws each caught enemy toward itself, before knockback resistance. */
export const OBSERVATION_PULL_SPEED = 105
const observationStillSeconds = (level: number) => 2 - (level - 1) * 0.125
/** Share of max HP a level-up restores. */
const LEVEL_HEAL = 0.06
/** Crowd shooters hold their fire while this many bullets are already in the air (bosses ignore it). */
const SHOOTER_BULLET_LIMIT = 40
/** Pattern cooldowns of bosses (seconds). */
const PATTERN_COOLDOWN: Record<BossPattern, number> = { ring: 3.5, spiral: 6, summon: 7, charge: 6 }

export interface Input {
  x: number
  y: number
  /** Index of the chosen level-up card, valid only for the matching choiceSeq. */
  pick: number
  pickSeq: number
  /** Half size of the world area this player's screen shows; sports balls bounce at its edges. */
  viewX?: number
  viewY?: number
}

export interface OwnedWeapon {
  id: string
  gambleWeapon?: string
  gambleUntil?: number
  acquiredAge?: number
  observationCount?: number
  lv: number
  cd: number
  /** Seconds held; investments compound with it. */
  held: number
  damage: number
}

export interface Player {
  id: string
  name: string
  color: string
  x: number
  y: number
  still: number
  fx: number
  fy: number
  hp: number
  maxHp: number
  downed: boolean
  revive: number
  joinedAt: number
  history: LifeDecision[]
  dating: boolean
  married: boolean
  hasChild: boolean
  parent: string
  parentDeath?: { at: number; x: number; y: number; reward: ParentReward }
  /** Total damage dealt by the parent weapon, kept after the parent dies. */
  parentDamage?: number
  talents: Record<TalentCategory, number>
  weapons: OwnedWeapon[]
  passives: { id: string; lv: number }[]
  cookingBuffs?: Partial<Record<Exclude<CookingItemKind, 'food_heal'>, { time: number; power: number }>>
  choices: string[]
  choiceSeq: number
  pending: number
  parentRewardPending: number
  swapPending: number
  careerPending: number
  /** 蒸発済み's free birth hand is still waiting to be dealt (consumed by the first offer). */
  birthPick?: boolean
  hurt: number
  /** Seconds of grace after an enemy bullet hit. */
  invuln: number
  shieldRecovery: number
  /** Cooldown of the HURT fx and the damage gathered for it. */
  hurtFx: number
  hurtAcc: number
  /** Enemy id that dealt the final blow while downed (picks the death animation and the result text). */
  killer?: string
}

export interface Enemy {
  id: number
  kind: string
  targetPlayer?: string
  x: number
  y: number
  hp: number
  maxHp: number
  kx: number
  ky: number
  vx: number
  vy: number
  slow: number
  life: number
  flash: number
  /** A tougher variant that appeared at random. */
  elite: boolean
  /** Collision radius multiplier (elites are bigger). */
  scale: number
  /** AI state (charger: 0 approach, 1 windup, 2 dash, 3 recover; circler: 0 orbit, 1 dive; boss charge likewise). */
  mode: number
  /** Seconds left in the current mode (or until the next blink). */
  timer: number
  /** Locked target of a windup. */
  tx: number
  ty: number
  /** > 0 while telegraphing an attack. */
  windup: number
  /** > 0 while fading out before a teleport. */
  blink: number
  shotCd: number
  /** Boss pattern cooldowns, parallel to the def's patterns. */
  pcd: number[]
  /** Seconds of spiral fire left. */
  burst: number
  spin: number
}

export interface Shot {
  id: number
  owner: string
  weapon: string
  sourceWeapon: string
  kind: WeaponDef['behavior']
  x: number
  y: number
  vx: number
  vy: number
  r: number
  angle: number
  guardianHeading?: number
  /** 過保護: which shoulder (+1 right, -1 left) the child's parents step beside while she walks up the screen. */
  guardianSide?: number
  /** 過保護: 0 while the owner walks (shield ahead), 1 once they stand still (beside them, guarding all round). */
  guardianStill?: number
  /** 過保護: where she stood relative to her owner when last moved, so a copy can keep clear of her before her turn. */
  guardianOffset?: { x: number; y: number }
  /** 過保護: where she was last heading (offset from her owner) before the last part of her step (Game.stepGuardian). */
  guardianAim?: { x: number; y: number }
  /**
   * 過保護: the way she is drawn facing (not the way she bashes, `angle`): out from a standing child, the way she goes
   * over the ground while walking, and the way she bashes while she bashes facing out or walking.
   */
  guardianFace?: number
  /** 過保護: how long (s) since she last turned to face the other side (see GUARDIAN_FACE_HOLD). */
  guardianTurned?: number
  /** 過保護: the way (px/s) she has gone over the ground of late (see GUARDIAN_FACE_DRIFT). */
  guardianDrift?: { x: number; y: number }
  /** 過保護: how she walks, for the view (see Game.paceGuardian); none while she does not walk. */
  guardianPace?: 'walk' | 'fast' | 'back'
  /** 過保護: whether she walks (over the ground, see GUARDIAN_WALK_ON), how long she has been slow, and where she was. */
  guardianWalking?: boolean
  guardianSlow?: number
  guardianGround?: { x: number; y: number }
  /** 過保護: her place beside her standing owner (offset from them, Game.guardianRestSpot). */
  guardianRest?: { x: number; y: number }
  orbit: number
  spin: number
  life: number
  maxLife: number
  damage: number
  pierce: number
  tick: number
  knockback: number
  strong: Tag[]
  hits: Map<number, number>
  /** Whip half-extents (x along facing); the full radius of a nova or mine; a raid's hit radius on foot. */
  w: number
  h: number
  /** Variant for the renderer: chain link, biting, armed, pellet kind. */
  v: number
  petType?: number
  /** Pet: which of PET_SPOTS it rests on (see Game.assignPetSpots); none while every spot is taken. */
  restSpot?: number
  /** Pet: seconds since it last moved more than PET_STILL_STEP in a step. */
  petStill?: number
  /** Pet: pushed off its resting spot and on its way to a new one (see assignPetSpots). */
  relocating?: boolean
  /** Seconds before the shot exists (staples fired one after another). */
  delay: number
  /** Per-behaviour scratch: elapsed time, arming time, retarget timer. */
  aux: number
  /** Every hit crits. */
  crit: boolean
  critChance: number
  strongMult: number
  /** What a pet is chasing. */
  target?: Enemy
  targets?: Enemy[]
}

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  damage: number
  life: number
  /** Index into BULLET_KINDS. */
  kind: number
  /** Enemy def id of the shooter (the killer when it downs someone). */
  src: string
}

export interface Gem {
  x: number
  y: number
  v: number
  pull: boolean
}

type CookingItemKind = (typeof COOKING_ITEMS)[number]
export type Item =
  | { kind: 'meal' | 'chest' | 'magnet'; x: number; y: number }
  | { kind: CookingItemKind; x: number; y: number; owner: string; power: number }

export interface Popup {
  x: number
  y: number
  v: number
  strong: boolean
  crit: boolean
  owner: string
  life: number
}

export interface LogEntry {
  t: number
  text: string
  to?: string
}

export interface GameState {
  time: number
  phase: 'playing' | 'reaper' | 'won' | 'lost'
  level: number
  xp: number
  xpNext: number
  kills: number
  players: Player[]
  enemies: Enemy[]
  shots: Shot[]
  bullets: Bullet[]
  gems: Gem[]
  items: Item[]
  popups: Popup[]
  log: LogEntry[]
  /** Recent events for renderer / HUD / audio, oldest first. */
  fx: FxEvent[]
  /** Real seconds of slow motion left (after a boss falls); `Game.step` slows time while it lasts. */
  slowmo: number
  eventIndex: number
  reaper?: { x: number; y: number }
  nextId: number
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const xpForLevel = (level: number) =>
  Math.round(((5 + level * 6 + level * level * 0.3) * 1.3 * (1 + Math.min(20, Math.max(0, level - 10)) * 0.0125)) / 0.8)

export const passiveLevel = (player: Player, id: string) => player.passives.find((p) => p.id === id)?.lv ?? 0
export const passivePower = (player: Player, id: string) =>
  passiveLevel(player, id) * player.talents[PASSIVE_BY_ID.get(id)!.category]
export const playerRadius = (player: Player) =>
  PLAYER_RADIUS * bodyScale(passiveLevel(player, 'p_large'), passiveLevel(player, 'p_small'))

/** 人間への恐怖 (モンスターペアレント's child) rarely draws 対人 cards: 50% at birth, +2.5% a year, normal at 20. */
export const peopleFearFriendRate = (player: Pick<Player, 'passives'>, age: number) =>
  player.passives.some((passive) => passive.id === PEOPLE_FEAR)
    ? Math.min(1, 0.5 + (0.5 * Math.max(0, age)) / PEOPLE_FEAR_UNTIL_AGE)
    : 1

export function generateTalents(rng: () => number): Record<TalentCategory, number> {
  const anchors = TALENT_CATEGORIES.map(() => rng())
  return Object.fromEntries(
    TALENT_CATEGORIES.map((category, index) => {
      const value = (anchors[index] * 2 + anchors[(index + 5) % 6] + anchors[(index + 1) % 6]) / 4
      return [category, POOR + value * (GIFTED - POOR)]
    })
  ) as Record<TalentCategory, number>
}
export const weaponSlots = (player: Player, age = 18) =>
  player.parent === 'p_toxic' && age < 18 ? 2 : WEAPON_SLOTS + (player.parent === 'p_free' ? 1 : 0)
const talentWeaponCount = (player: Player) => player.weapons.filter((w) => !WEAPON_BY_ID.get(w.id)?.parent).length
const canObtainWeapon = (player: Player, def: WeaponDef, age: number) =>
  age >= def.minAge && (def.id !== 'w_ring' || player.married) && !player.weapons.some((weapon) => weapon.id === def.id)

export function isEvolved(player: Player, weapon: OwnedWeapon) {
  const def = WEAPON_BY_ID.get(weapon.id)
  return Boolean(def?.evolve && weapon.lv >= MAX_WEAPON_LEVEL && passiveLevel(player, def.evolve.passive) > 0)
}

/** 生き物観察 holds 10 enemies at Lv1, 10 more per level (80 at Lv8) and 100 once evolved. */
export function observationTargets(player: Player, weapon: OwnedWeapon) {
  const levels = WEAPON_LEVELS.w_observe.slice(0, weapon.lv - 1)
  return (
    10 + levels.reduce((value, upgrade) => value + (upgrade.targets ?? 0), 0) + (isEvolved(player, weapon) ? 20 : 0)
  )
}

export function weaponName(player: Player, weapon: OwnedWeapon, age?: number) {
  const def = WEAPON_BY_ID.get(weapon.id)!
  const name = age === undefined ? def.name : weaponAppearance(weapon.id, age, age - (weapon.acquiredAge ?? age)).name
  return isEvolved(player, weapon) ? `${def.evolve!.name}${name === def.name ? '' : `／${name}`}` : name
}

export interface PlayerStats {
  maxHp: number
  armor: number
  regen: number
  speed: number
  magnet: number
  xpGain: number
  might: number
  cooldown: number
  area: number
  /** Chance of a critical hit. */
  crit: number
  /** Bonus weapon count from 器用. */
  amount: number
  /** Projectile speed multiplier. */
  shotSpeed: number
  /** Effect duration multiplier. */
  duration: number
  /** Damage multiplier against a card's 特攻 tags. */
  strong: number
}

export function playerStats(player: Player): PlayerStats {
  const p = (id: string) => passivePower(player, id)
  return {
    maxHp: Math.max(
      25,
      100 +
        (p('p_bold') + p('p_acceptance')) * 20 +
        p('p_large') * 15 -
        p('p_small') * 10 +
        (player.parent === 'p_gone' ? 60 : 0) +
        (player.parent === 'p_toxic' ? -10 : 0)
    ),
    armor:
      p('p_stubborn') +
      p('p_patience') +
      (player.parent === 'p_over' || player.parent === 'p_weak' ? 1 : 0) +
      COOKING_EFFECTS.food_defense.amount * (player.cookingBuffs?.food_defense?.power ?? 0),
    regen:
      player.parent === 'p_toxic'
        ? 0
        : (p('p_optimist') + p('p_affection') + p(PET_MEMORY)) * 0.4 +
          p('p_kind') * 0.2 +
          (player.parent === 'p_gone' ? 1 : 0),
    speed:
      BASE_SPEED *
      (1 + p('p_healthy') * 0.08 + p('p_small') * 0.03) *
      (1 + COOKING_EFFECTS.food_speed.amount * (player.cookingBuffs?.food_speed?.power ?? 0)),
    magnet: 64 * (1 + p('p_greedy') * 0.25),
    xpGain: (1 + p('p_greedy') * 0.1) * (player.parent === 'p_weak' ? 1.25 : 1),
    might:
      (1 +
        p('p_hot') * 0.05 +
        p('p_courage') * 0.1 +
        p('p_clever') * 0.03 +
        (player.hp <= player.maxHp / 2 ? p('p_competitive') * 0.1 : 0)) *
      (player.parent === 'p_toxic' ? 1.05 : 1) *
      (1 + COOKING_EFFECTS.food_damage.amount * (player.cookingBuffs?.food_damage?.power ?? 0)),
    cooldown: Math.max(0.5, 1 - p('p_diligent') * 0.05 - p('p_hasty') * 0.05 + p('p_grand') * 0.1),
    area: 1 + p('p_kind') * 0.08 + p('p_cautious') * 0.05,
    crit: 0.05 + p('p_lucky') * 0.05,
    amount:
      (passiveLevel(player, 'p_clever') >= 4 ? 2 : passiveLevel(player, 'p_clever') >= 1 ? 1 : 0) +
      passiveLevel(player, 'p_grand'),
    shotSpeed: Math.max(0.5, 1 + p('p_curious') * 0.1 - p('p_cautious') * 0.05),
    duration: Math.max(0.5, 1 + p('p_curious') * 0.1 - p('p_hasty') * 0.05),
    strong: STRONG_MULTIPLIER + p('p_savvy') * 0.25
  }
}

export interface WeaponStats {
  damage: number
  cooldown: number
  amount: number
  area: number
  duration: number
  speed: number
  crit: number
  strong: number
}

/** Everything that multiplies a weapon, including the hidden talent. */
export function weaponStats(
  player: Player,
  weapon: OwnedWeapon,
  stats = playerStats(player),
  def = WEAPON_BY_ID.get(weapon.id)!
): WeaponStats {
  const source = WEAPON_BY_ID.get(weapon.id)!
  const lv = weapon.lv
  const evolved = isEvolved(player, weapon)
  const upgrades = WEAPON_LEVELS[def.id].slice(0, lv - 1)
  const sourceUpgrades = WEAPON_LEVELS[source.id].slice(0, lv - 1)
  let damage = def.damage * sourceUpgrades.reduce((value, upgrade) => value * (upgrade.damage ?? 1), 1) * stats.might
  if (source.category) damage *= player.talents[source.category]
  if (evolved) damage *= 1.6
  if (source.id === 'w_gamble') damage *= 0.5
  if (def.id === 'w_study' && player.parent === 'p_edu') damage *= 1.3
  if (def.id === 'w_invest') {
    if (player.parent === 'p_rich') damage *= 1.3
    damage *= 1 + weapon.held / 150
  }
  return {
    damage,
    cooldown: hasFixedInterval(source.id)
      ? def.cooldown
      : def.cooldown *
        sourceUpgrades.reduce((value, upgrade) => value * (upgrade.cooldown ?? 1), 1) *
        stats.cooldown *
        (evolved ? 0.8 : 1),
    amount:
      def.id === 'p_over' || def.id === 'p_monster'
        ? lv >= 4
          ? 2
          : 1
        : def.behavior === 'observe' || def.behavior === 'raid' || def.id === 'p_toxic'
          ? 1
          : def.amount +
            upgrades.reduce((value, upgrade) => value + (upgrade.amount ?? 0), 0) +
            (evolved && def.id !== 'w_sports' ? 1 : 0) +
            (def.behavior === 'none' || def.behavior === 'chain' ? 0 : stats.amount),
    area: upgrades.reduce((value, upgrade) => value * (upgrade.area ?? 1), 1) * stats.area * (evolved ? 1.2 : 1),
    duration:
      def.duration *
      (1 + upgrades.reduce((value, upgrade) => value + (upgrade.duration ?? 0), 0)) *
      (evolved ? 1.3 : 1) *
      stats.duration,
    speed: stats.shotSpeed,
    crit: stats.crit,
    strong: stats.strong
  }
}

export function choiceText(
  player: Player,
  choice: string,
  age?: number
): { icon: string; name: string; text: string; tag: string } {
  if (choice === 'd:yes')
    return {
      icon: '💞',
      name: '交際する',
      text: 'パートナーと交際を始める。浮気相手や束縛するパートナーが現れる',
      tag: ''
    }
  if (choice === 'd:no') return { icon: '🌿', name: '交際しない', text: '今は一人で歩む', tag: '' }
  if (choice === 'f:yes')
    return { icon: '🧒', name: '迎える', text: '本人の回復が毎秒HP2→3。子育ての試練が加わる', tag: '' }
  if (choice === 'f:no')
    return { icon: '🤝', name: '迎えない', text: '本人の回復は毎秒HP2のまま。今の家族で歩む', tag: '' }
  const [kind, id] = choice.split(':')
  if (kind === 's' || kind === 'r') {
    const def = WEAPON_BY_ID.get(id)!
    const appearance =
      age === undefined
        ? def
        : weaponAppearance(id, age, age - (player.weapons.find((w) => w.id === id)?.acquiredAge ?? age))
    return {
      icon: appearance.icon,
      name: appearance.name,
      text: kind === 's' ? def.desc : 'この武器と入れ替える',
      tag: kind === 's' ? 'NEW' : '交換'
    }
  }
  if (choice === 'x:skip') return { icon: '↩', name: '交換しない', text: '今の武器をそのまま使う', tag: '' }
  if (kind === 'w') {
    const def = WEAPON_BY_ID.get(id)!
    const owned = player.weapons.find((w) => w.id === id)
    const appearance = age === undefined ? def : weaponAppearance(id, age, age - (owned?.acquiredAge ?? age))
    if (!owned) return { icon: appearance.icon, name: appearance.name, text: def.desc, tag: 'NEW' }
    const next = owned.lv + 1
    const evolves =
      next === MAX_WEAPON_LEVEL && def.evolve && passiveLevel(player, def.evolve.passive)
        ? `・${def.evolve.name}に進化！`
        : ''
    return {
      icon: appearance.icon,
      name: appearance.name,
      text: `${WEAPON_LEVELS[id][Math.min(next - 2, MAX_WEAPON_LEVEL - 2)].text}${evolves}`,
      tag: `Lv ${next}`
    }
  }
  if (kind === 'p') {
    const def = PASSIVE_BY_ID.get(id)!
    const lv = passiveLevel(player, id)
    return { icon: def.icon, name: def.name, text: def.desc, tag: lv ? `Lv ${lv + 1}` : '性格' }
  }
  return choice === 'x:meal'
    ? { icon: '🍙', name: 'ごはん', text: '精神力を 40 回復', tag: '' }
    : { icon: '💴', name: 'お小遣い', text: '経験値を少しもらう', tag: '' }
}

/** Chance that a chest holds three turning points instead of one. */
export const CHEST_TRIPLE = 0.2

export class Game {
  state: GameState
  private readonly rng: () => number
  private readonly feelRng: () => number
  private grid = new Map<number, Enemy[]>()
  private spawnDebt = 0
  private inputs = new Map<string, Input>()
  private familyHands = new Map<string, string[]>()
  private nightcryStarted = false
  private pendingBosses: string[] = []
  /** 過保護親 already moved this step (see moveGuardian). */
  private readonly guardiansMoved = new Set<Shot>()
  /** 過保護親's last guardianSettle: what it was asked (aim, place, size, ducking, others, blocks) and its answer. */
  private readonly guardianSettled = new WeakMap<
    Shot,
    { ask: number[]; fresh: { x: number; y: number }; goal: { x: number; y: number } }
  >()
  /** Whether the shots are moving now (moveShots), so 過保護親 move in their line's order. */
  private guardianPass = false
  /** 過保護親's places beside her standing child last found for each owner, and the step they were found in. */
  private readonly guardianRestSpots = new Map<string, { tick: number; spots: Map<Shot, { x: number; y: number }> }>()
  /** Counts the game's steps (and steps of none), so what is found once a step is found again the next. */
  private guardianTick = 0
  /** The gap (guardianRestGap) between each child's parents, and the step it was found in. */
  private readonly guardianGaps = new Map<string, { tick: number; gap: number }>()
  /** 過保護親's way ahead as last found for the pets (guardianAhead), and the step it was found in. */
  private readonly guardianAheads = new WeakMap<
    Shot,
    {
      tick: number
      soon: { x: number; y: number }[]
      heading: { x: number; y: number }
      path: { x: number; y: number }[]
    }
  >()
  private careers = new Map<
    string,
    { studied?: boolean; employed?: boolean; path?: 'sports' | 'assets' | 'creative' | 'social'; settled?: boolean }
  >()
  private accumulator = 0
  private fxSeq = 0
  private stageIndex = -1
  private tickHits = 0
  private tickShots = 0
  private tickKills = 0

  constructor(seed = Date.now()) {
    this.rng = mulberry32(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b))
    this.feelRng = mulberry32(Math.imul(seed ^ 0x243f6a88, 0x85ebca6b))
    this.state = {
      time: 0,
      phase: 'playing',
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      kills: 0,
      players: [],
      enemies: [],
      shots: [],
      bullets: [],
      gems: [],
      items: [],
      popups: [],
      log: [],
      fx: [],
      slowmo: 0,
      eventIndex: 0,
      nextId: 1
    }
  }

  random() {
    return this.rng()
  }

  /** Records an event for the renderer / HUD / audio. */
  private emit(type: number, x = 0, y = 0, a = 0, b = 0) {
    const fx = this.state.fx
    fx.push({ seq: ++this.fxSeq, t: this.state.time, type, x: Math.round(x), y: Math.round(y), a: Math.round(a), b })
    if (fx.length > FX_CAP) fx.shift()
  }

  private playerIndex(player: Player) {
    return Math.max(0, this.state.players.indexOf(player))
  }

  addPlayer(id: string, parentId?: string): Player | undefined {
    const state = this.state
    const existing = state.players.find((player) => player.id === id)
    if (existing) return existing
    if (state.players.length >= MAX_GAME_PLAYERS) return undefined
    const index = PLAYER_COLORS.findIndex((color) => !state.players.some((player) => player.color === color))
    const parent = parentId ?? PARENTS[Math.floor(this.rng() * PARENTS.length)].id
    const talents = generateTalents(this.rng)
    const anchor = state.players.find((p) => !p.downed)
    const player: Player = {
      id,
      name: `P${index + 1}`,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      x: (anchor?.x ?? 0) + (index ? Math.cos(index) * 40 : 0),
      y: (anchor?.y ?? 0) + (index ? Math.sin(index) * 40 : 0),
      still: 0,
      fx: 1,
      fy: 0,
      hp: 0,
      maxHp: 0,
      downed: false,
      revive: 0,
      joinedAt: state.time,
      history: [],
      dating: false,
      married: false,
      hasChild: false,
      parent,
      talents,
      weapons: parent === 'p_gone' ? [] : [{ id: parent, lv: 1, cd: 0.5, held: 0, damage: 0 }],
      passives: parent === 'p_monster' && ageAt(state.time) < PEOPLE_FEAR_UNTIL_AGE ? [{ id: PEOPLE_FEAR, lv: 1 }] : [],
      choices: [],
      choiceSeq: 0,
      pending: parent === 'p_gone' ? 1 : 0,
      parentRewardPending: 0,
      swapPending: 0,
      careerPending: 0,
      birthPick: parent === 'p_gone',
      hurt: 0,
      invuln: 0,
      shieldRecovery: 0,
      hurtFx: 0,
      hurtAcc: 0
    }
    player.maxHp = player.hp = playerStats(player).maxHp
    state.players.push(player)
    if (state.time >= EVENTS.find((event) => event.swarm === 'car')!.at) {
      this.familyHands.set(player.id, player.choices)
      player.choices = ['d:yes', 'd:no']
      player.choiceSeq++
    }
    this.careers.set(id, {})
    const parentDef = WEAPON_BY_ID.get(parent)!
    this.log(`${player.name}が生まれた。親は「${parentDef.name}」。`)
    return player
  }

  removePlayer(id: string) {
    this.state.players = this.state.players.filter((player) => player.id !== id)
    this.inputs.delete(id)
    this.familyHands.delete(id)
    this.careers.delete(id)
    this.state.shots = this.state.shots.filter((shot) => shot.owner !== id)
    this.state.items = this.state.items.filter((item) => !('owner' in item) || item.owner !== id)
  }

  setInput(id: string, raw: unknown) {
    if (!raw || typeof raw !== 'object') return
    const value = raw as Record<string, unknown>
    const num = (v: unknown, lo: number, hi: number, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
    let x = num(value.x, -1, 1, 0)
    let y = num(value.y, -1, 1, 0)
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    const pick = Number.isSafeInteger(value.pick) ? (value.pick as number) : -1
    const pickSeq = Number.isSafeInteger(value.pickSeq) ? (value.pickSeq as number) : -1
    const viewX = num(value.viewX, 80, VIEW_HALF.x, VIEW_HALF.x)
    const viewY = num(value.viewY, 80, VIEW_HALF.y, VIEW_HALF.y)
    this.inputs.set(id, { x, y, pick, pickSeq, viewX, viewY })
    const player = this.state.players.find((p) => p.id === id)
    if (
      this.state.phase === 'playing' &&
      player &&
      pick >= 0 &&
      pickSeq === player.choiceSeq &&
      pick < player.choices.length
    )
      this.choose(player, pick)
  }

  /** Solo play pauses on a level-up, like a board game turn; co-op keeps running. */
  get paused() {
    const players = this.state.players
    return (
      this.state.phase === 'playing' &&
      this.state.time < RUN_SECONDS &&
      players.length === 1 &&
      !players[0].downed &&
      players[0].choices.length > 0
    )
  }

  /** Advances by real time. Slow motion (after a boss falls) stretches it; `tick` itself is never scaled. */
  step(dt: number) {
    const state = this.state
    const scale = state.slowmo > 0 ? SLOWMO_SCALE : 1
    state.slowmo = Math.max(0, state.slowmo - dt)
    this.accumulator = Math.min(this.accumulator + dt * scale, 0.25)
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP
      this.tick(STEP)
    }
  }

  private log(text: string, to?: string) {
    this.state.log.push({ t: this.state.time, text, to })
    if (this.state.log.length > 12) this.state.log.shift()
  }

  tick(dt: number) {
    const state = this.state
    this.guardianTick++
    this.tickHits = 0
    this.tickShots = 0
    this.tickKills = 0
    for (const popup of state.popups) popup.life -= dt
    state.popups = state.popups.filter((popup) => popup.life > 0)
    while (state.fx.length && state.fx[0].t < state.time - FX_WINDOW) state.fx.shift()
    if (state.phase === 'won' || state.phase === 'lost' || this.paused || !state.players.length) return
    if (state.phase === 'reaper') return this.reaperTick(dt)
    state.time += dt
    this.ageWeapons()
    if (state.time >= RUN_SECONDS) return this.summonReaper()
    this.stageTick()
    this.movePlayers(dt)
    this.runEvents()
    this.spawn(dt)
    this.buildGrid()
    this.moveEnemies(dt)
    this.fireWeapons(dt)
    this.moveShots(dt)
    this.moveBullets(dt)
    for (const player of state.players) {
      if (!player.downed && player.married && player.parent !== 'p_toxic')
        player.hp = Math.min(player.maxHp, player.hp + (2 + (player.hasChild ? 1 : 0)) * dt)
    }
    this.collectGems(dt)
    this.revivePlayers(dt)
    if (state.players.every((player) => player.downed)) {
      state.phase = 'lost'
      this.log(`心が折れた… 享年${ageAt(state.time)}歳`)
    }
  }

  /** Announces each life stage once, when the age enters it. */
  private stageTick() {
    const stage = stageAt(this.state.time)
    const index = STAGES.indexOf(stage)
    if (index > this.stageIndex) {
      this.stageIndex = index
      this.emit(FX.STAGE, 0, 0, index)
    }
  }

  private summonReaper() {
    const state = this.state
    state.time = RUN_SECONDS
    state.phase = 'reaper'
    state.enemies = []
    state.shots = []
    state.bullets = []
    const anchor = state.players[0]
    state.reaper = { x: anchor.x + 420, y: anchor.y - 260 }
    this.log('死神が迎えに来た。寿命が尽きる——')
  }

  private reaperTick(dt: number) {
    const state = this.state
    state.time = Math.min(RUN_SECONDS + REAPER_SECONDS, state.time + dt)
    const target = state.players[0]
    const reaper = state.reaper!
    reaper.x += (target.x + 40 - reaper.x) * Math.min(1, dt * 1.2)
    reaper.y += (target.y - 30 - reaper.y) * Math.min(1, dt * 1.2)
    if (state.time >= RUN_SECONDS + REAPER_SECONDS) {
      state.phase = 'won'
      this.log(`大往生。享年${ageAt(RUN_SECONDS)}歳、人生をまっとうした。`)
    }
  }

  private movePlayers(dt: number) {
    for (const player of this.state.players) {
      const buffs = player.cookingBuffs
      if (buffs) {
        for (const kind of COOKING_ITEMS) {
          if (kind === 'food_heal') continue
          const buff = buffs[kind]
          if (buff && (buff.time -= dt) <= 1e-9) delete buffs[kind]
        }
        if (!buffs.food_damage && !buffs.food_defense && !buffs.food_speed) delete player.cookingBuffs
      }
      const stats = playerStats(player)
      player.maxHp = stats.maxHp
      player.hurt = Math.max(0, player.hurt - dt)
      player.invuln = Math.max(0, player.invuln - dt)
      player.shieldRecovery = Math.max(0, player.shieldRecovery - dt)
      player.hurtFx = Math.max(0, player.hurtFx - dt)
      if (player.downed) {
        player.still = 0
        continue
      }
      const input = this.inputs.get(player.id) ?? { x: 0, y: 0, pick: -1, pickSeq: -1 }
      player.still = input.x || input.y ? 0 : player.still + dt
      // Level-up choices slow you down in co-op so picking is not a death sentence.
      const speed = stats.speed * (player.choices.length ? 0.6 : 1)
      player.x += input.x * speed * dt
      player.y += input.y * speed * dt
      if (input.x || input.y) {
        const l = Math.hypot(input.x, input.y)
        player.fx = input.x / l
        player.fy = input.y / l
      }
      player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt)
      const kind = passivePower(player, 'p_kind')
      if (kind)
        for (const friend of this.state.players)
          if (
            friend !== player &&
            !friend.downed &&
            friend.parent !== 'p_toxic' &&
            Math.hypot(friend.x - player.x, friend.y - player.y) < 140
          )
            friend.hp = Math.min(friend.maxHp, friend.hp + kind * 0.5 * dt)
      if (
        !player.choices.length &&
        (player.pending > 0 || player.parentRewardPending > 0 || player.swapPending > 0 || player.careerPending > 0)
      )
        this.offer(player)
    }
  }

  private runEvents() {
    const state = this.state
    this.pendingBosses = this.pendingBosses.filter((kind) => !this.spawnEnemy(kind))
    while (state.eventIndex < EVENTS.length && state.time >= EVENTS[state.eventIndex].at) {
      const index = state.eventIndex++
      const event = EVENTS[index]
      if (event.boss === 'b_univ' || event.boss === 'b_shukatsu' || event.boss === 'b_layoff') {
        for (const player of state.players) {
          if (player.joinedAt >= event.at) continue
          const career = this.careers.get(player.id)!
          const level = (id: string) => player.weapons.find((weapon) => weapon.id === id)?.lv ?? 0
          const sports = Math.max(level('w_sports'), level('w_muscle'))
          const assets = Math.max(level('w_invest'), level('w_savings'))
          const creative = Math.max(level('w_hobby'), level('w_karaoke'), level('w_travel'), level('w_cooking'))
          const social = Math.max(level('w_friend'), level('w_sns'), level('w_pet'))
          let reward = 0
          let text: string
          if (event.boss === 'b_univ') {
            if (career.studied !== undefined) continue
            career.studied = level('w_study') >= 3
            reward = career.studied ? 1 : 0
            text = LIFE_OUTCOMES.b_univ[career.studied ? 0 : 1]
          } else if (event.boss === 'b_shukatsu') {
            if (career.employed !== undefined) continue
            const work = level('w_work') >= 2
            const eligible: Career[] = []
            if (work) eligible.push('bureaucrat')
            if (sports >= 4) eligible.push('soccer')
            if (assets >= 4) eligible.push('entrepreneur')
            if (creative >= 4) eligible.push('creative')
            if (social >= 4) eligible.push('social')
            const selected =
              rankedCareer(
                player.weapons.map(({ id, lv }) => [id, lv]),
                player.passives.map(({ id, lv }) => [id, lv]),
                eligible
              ) ?? (work ? 'bureaucrat' : undefined)
            career.employed = selected === 'bureaucrat'
            reward = career.employed ? (career.studied ? 2 : 1) : 0
            text = LIFE_OUTCOMES.b_shukatsu[career.employed ? (career.studied ? 0 : 1) : 2]
            if (
              selected === 'soccer' ||
              selected === 'entrepreneur' ||
              selected === 'creative' ||
              selected === 'social'
            ) {
              career.path = selected === 'soccer' ? 'sports' : selected === 'entrepreneur' ? 'assets' : selected
              reward = 1
              text =
                LIFE_OUTCOMES.b_shukatsu[
                  career.path === 'sports' ? 3 : career.path === 'assets' ? 4 : career.path === 'creative' ? 5 : 6
                ]
            }
          } else {
            if (career.settled !== undefined) continue
            career.settled = true
            reward = career.employed ? (level('w_work') >= 4 ? 2 : 1) : 0
            text = LIFE_OUTCOMES.b_layoff[reward === 2 ? 0 : reward === 1 ? 1 : 2]
            if (career.path) {
              reward =
                (career.path === 'sports'
                  ? sports
                  : career.path === 'assets'
                    ? assets
                    : career.path === 'creative'
                      ? creative
                      : social) >= 4
                  ? 2
                  : 1
              text =
                LIFE_OUTCOMES.b_layoff[
                  (career.path === 'sports' ? 3 : career.path === 'assets' ? 5 : career.path === 'creative' ? 7 : 15) +
                    (reward === 2 ? 0 : 1)
                ]
            }
            const eligible: Career[] = []
            if (level('w_work') >= 4) eligible.push('bureaucrat')
            if (sports >= 4) eligible.push('soccer')
            if (assets >= 4) eligible.push('entrepreneur')
            if (creative >= 4) eligible.push('creative')
            if (social >= 4) eligible.push('social')
            const selected = rankedCareer(
              player.weapons.map(({ id, lv }) => [id, lv]),
              player.passives.map(({ id, lv }) => [id, lv]),
              eligible
            )
            const previous = career.employed
              ? 'bureaucrat'
              : career.path === 'sports'
                ? 'soccer'
                : career.path === 'assets'
                  ? 'entrepreneur'
                  : career.path
            if (selected && selected !== previous) {
              reward = 2
              const outcome =
                selected === 'bureaucrat'
                  ? previous
                    ? 14
                    : career.employed === false
                      ? 13
                      : 9
                  : selected === 'social'
                    ? 17
                    : 9 + ['bureaucrat', 'soccer', 'entrepreneur', 'creative'].indexOf(selected)
              text = LIFE_OUTCOMES.b_layoff[outcome]
            }
          }
          player.careerPending += reward
          player.history.push({ event: index, outcome: text })
          this.log(text, player.id)
        }
      }
      const wedding = event.boss === 'b_wedding'
      if (event.swarm === 'car') {
        for (const player of state.players) {
          if (player.joinedAt >= event.at) continue
          this.familyHands.set(player.id, player.choices)
          player.choices = ['d:yes', 'd:no']
          player.choiceSeq++
        }
      }
      const birth = event.swarm === 'nightcry'
      const childEvent = birth || event.boss === 'b_rebel' || event.swarm === 'mischief'
      if (wedding || birth) {
        for (const player of state.players) {
          if (player.joinedAt >= event.at) continue
          if (player.history.some((decision) => decision.event === index)) continue
          if (wedding) {
            if (player.choices[0] === 'd:yes') {
              player.choices = this.familyHands.get(player.id) ?? []
              this.familyHands.delete(player.id)
              player.choiceSeq++
            }
            player.married = player.weapons.some((weapon) => weapon.id === 'w_love' && weapon.lv >= 2)
            this.log(LIFE_OUTCOMES.b_wedding[player.married ? 0 : 1], player.id)
          } else if (player.married) {
            this.familyHands.set(player.id, player.choices)
            player.choices = ['f:yes', 'f:no']
            player.choiceSeq++
            player.history.push({ event: index, outcome: LIFE_OUTCOMES.nightcry[3] })
            continue
          }
          const outcome = wedding ? LIFE_OUTCOMES.b_wedding[player.married ? 0 : 1] : LIFE_OUTCOMES.nightcry[2]
          player.history.push({ event: index, outcome })
        }
      }
      if (birth) continue
      if (event.boss === 'b_layoff' || event.swarm === 'endless_meeting') {
        const employed = state.players.filter(
          (player) =>
            this.careers.get(player.id)?.employed && (event.swarm !== 'endless_meeting' || player.joinedAt < event.at)
        )
        if (!employed.length) continue
        this.log(`${employed.map((player) => player.name).join('・')}の仕事の試練：${event.text}`)
      } else if (event.boss === 'b_care') {
        const families = state.players.filter((player) => player.joinedAt < event.at && player.parent !== 'p_gone')
        if (!families.length) continue
        this.log(`${families.map((player) => player.name).join('・')}の家族の試練：${event.text}`)
        for (const player of families) this.loseParent(player, index)
      } else if (wedding || childEvent) {
        const families = state.players.filter((player) => (wedding ? player.married : player.hasChild))
        if (!families.length) continue
        this.log(`${families.map((player) => player.name).join('・')}の家族の試練：${event.text}`)
      } else this.log(event.text)
      if (event.boss && !this.spawnEnemy(event.boss)) this.pendingBosses.push(event.boss)
      if (event.swarm) this.spawnSwarm(index)
    }
  }

  private spawnSwarm(index: number, anchor = this.randomAlive()) {
    const event = EVENTS[index]
    if (event.swarm && anchor) {
      const count = Math.round((event.count ?? 20) * this.playerFactor())
      this.emit(FX.SWARM, anchor.x, anchor.y, index)
      const formation = event.formation ?? 'ring'
      const side = this.rng() * Math.PI * 2
      const px = -Math.sin(side)
      const py = Math.cos(side)
      const cx = anchor.x + Math.cos(side) * SPAWN_RADIUS
      const cy = anchor.y + Math.sin(side) * SPAWN_RADIUS
      const spacing = Math.min(34, 1500 / count)
      const clump = 36 + count * 2.2
      for (let i = 0; i < count; i++) {
        if (formation === 'wall') {
          const offset = (i - (count - 1) / 2) * spacing
          this.spawnEnemy(event.swarm, cx + px * offset, cy + py * offset)
        } else if (formation === 'cluster') {
          const angle = this.rng() * Math.PI * 2
          const radius = Math.sqrt(this.rng()) * clump
          this.spawnEnemy(event.swarm, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
        } else {
          const angle = (i / count) * Math.PI * 2
          this.spawnEnemy(
            event.swarm,
            anchor.x + Math.cos(angle) * SPAWN_RADIUS,
            anchor.y + Math.sin(angle) * SPAWN_RADIUS
          )
        }
      }
    }
  }

  playerFactor() {
    return 1 + (this.state.players.length - 1) * 0.6
  }

  hpScale() {
    const progress = this.state.time / RUN_SECONDS
    const minutes = progress * 30
    return (
      (1 + minutes * 0.14 + minutes * minutes * 0.004) *
      (1 + 0.2 * progress ** 2) *
      (1 + (this.state.players.length - 1) * 0.45)
    )
  }

  targetPopulation() {
    const progress = this.state.time / RUN_SECONDS
    return Math.min(MAX_ENEMIES, Math.round((14 + progress * 300) * this.playerFactor()))
  }

  private randomAlive() {
    const alive = this.state.players.filter((player) => !player.downed)
    return alive[Math.floor(this.rng() * alive.length)]
  }

  private spawn(dt: number) {
    const state = this.state
    const deficit = this.targetPopulation() - state.enemies.length
    if (deficit <= 0) return
    this.spawnDebt += Math.min(deficit, 6 + state.time / 30) * dt * 2
    const age = ageAt(state.time)
    const pool = POOLS.find((entry) => age < entry.untilAge)!.enemies.filter(
      ([id]) =>
        (ENEMY_BY_ID.get(id)!.tag !== 'child' || state.players.some((player) => player.hasChild)) &&
        (!isRelationshipEnemy(id) ||
          state.players.some((player) => !player.downed && (player.dating || player.married)))
    )
    const total = pool.reduce((sum, [, weight]) => sum + weight, 0)
    while (this.spawnDebt >= 1) {
      this.spawnDebt--
      let roll = this.rng() * total
      let kind = pool[0][0]
      for (const [id, weight] of pool) {
        roll -= weight
        if (roll <= 0) {
          kind = id
          break
        }
      }
      const def = ENEMY_BY_ID.get(kind)!
      if (def.behavior === 'swarm') {
        // Swarmers come in clumps of five to eight from one direction.
        const anchor = this.randomAlive()
        if (!anchor) return
        const count = 5 + Math.floor(this.rng() * 4)
        const side = this.rng() * Math.PI * 2
        for (let i = 0; i < count; i++) {
          const angle = this.rng() * Math.PI * 2
          const radius = Math.sqrt(this.rng()) * 60
          this.spawnEnemy(
            kind,
            anchor.x + Math.cos(side) * SPAWN_RADIUS + Math.cos(angle) * radius,
            anchor.y + Math.sin(side) * SPAWN_RADIUS + Math.sin(angle) * radius
          )
        }
        this.spawnDebt -= count - 1
        continue
      }
      const elite = state.time >= ELITE_FROM && def.behavior !== 'dash' && this.rng() < ELITE_CHANCE
      this.spawnEnemy(kind, undefined, undefined, { elite })
    }
  }

  spawnEnemy(kind: string, x?: number, y?: number, options: { elite?: boolean } = {}) {
    const state = this.state
    const def = ENEMY_BY_ID.get(kind)
    if (!def) return
    const eligible = isRelationshipEnemy(kind) ? state.players.filter((p) => !p.downed && (p.dating || p.married)) : []
    const anchor = isRelationshipEnemy(kind) ? eligible[Math.floor(this.rng() * eligible.length)] : this.randomAlive()
    if (!anchor) return
    if (state.enemies.length >= MAX_ENEMIES + 20) {
      if (def.behavior !== 'boss') return
      const index = state.enemies.findIndex((enemy) => ENEMY_BY_ID.get(enemy.kind)!.behavior !== 'boss')
      if (index < 0) return
      const [retired] = state.enemies.splice(index, 1)
      retired.hp = 0
      for (const shot of state.shots) if (shot.target === retired) shot.target = undefined
    }
    if (x === undefined || y === undefined) {
      const angle = this.rng() * Math.PI * 2
      x = anchor.x + Math.cos(angle) * SPAWN_RADIUS
      y = anchor.y + Math.sin(angle) * SPAWN_RADIUS
    }
    const elite = Boolean(options.elite) && def.behavior !== 'boss'
    const hp =
      def.behavior === 'boss'
        ? def.hp * (1 + (state.players.length - 1) * 0.6)
        : def.hp * this.hpScale() * (elite ? 5 : 1)
    let vx = 0
    let vy = 0
    if (def.behavior === 'dash') {
      const l = Math.hypot(anchor.x - x, anchor.y - y) || 1
      vx = ((anchor.x - x) / l) * def.speed
      vy = ((anchor.y - y) / l) * def.speed
    }
    const enemy: Enemy = {
      id: state.nextId++,
      kind,
      ...(isRelationshipEnemy(kind) ? { targetPlayer: anchor.id } : {}),
      x,
      y,
      hp,
      maxHp: hp,
      kx: 0,
      ky: 0,
      vx,
      vy,
      slow: 0,
      life: 0,
      flash: 0,
      elite,
      scale: elite ? 1.25 : 1,
      mode: 0,
      timer: 0,
      tx: 0,
      ty: 0,
      windup: 0,
      blink: 0,
      shotCd: 0,
      pcd: [],
      burst: 0,
      spin: 0
    }
    if (def.shot) enemy.shotCd = 0.6 + this.rng() * def.shot.cooldown
    if (def.behavior === 'blink') enemy.timer = 1.5 + this.rng() * 1.5
    if (def.behavior === 'circler') enemy.timer = 2 + this.rng()
    if (def.behavior === 'boss') enemy.pcd = (def.patterns ?? []).map((_, i) => 2 + i * 2.5)
    state.enemies.push(enemy)
    if (def.behavior === 'boss') this.emit(FX.BOSS_SPAWN, x, y, ENEMY_INDEX.get(kind)!)
    if (elite) {
      this.emit(FX.ELITE, x, y, ENEMY_INDEX.get(kind)!)
      this.log(`手ごわい「${def.name}」が現れた！`)
    }
    return enemy
  }

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768)
  }

  private buildGrid() {
    this.grid.clear()
    for (const enemy of this.state.enemies) {
      const k = this.key(Math.floor(enemy.x / CELL), Math.floor(enemy.y / CELL))
      const cell = this.grid.get(k)
      if (cell) cell.push(enemy)
      else this.grid.set(k, [enemy])
    }
  }

  /** Enemies whose cell overlaps the circle; callers do the exact test. */
  private near(x: number, y: number, r: number, visit: (enemy: Enemy) => boolean | void) {
    const x0 = Math.floor((x - r - 50) / CELL)
    const x1 = Math.floor((x + r + 50) / CELL)
    const y0 = Math.floor((y - r - 50) / CELL)
    const y1 = Math.floor((y + r + 50) / CELL)
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.grid.get(this.key(cx, cy))
        if (cell) for (const enemy of cell) if (enemy.hp > 0 && visit(enemy) === false) return
      }
  }

  private nearestPlayer(x: number, y: number) {
    let best: Player | undefined
    let distance = Infinity
    for (const player of this.state.players) {
      if (player.downed) continue
      const d = (player.x - x) ** 2 + (player.y - y) ** 2
      if (d < distance) {
        distance = d
        best = player
      }
    }
    return best ? { player: best, distance: Math.sqrt(distance) } : undefined
  }

  /** Nearest living enemy to a point within `range`, skipping the given ids. */
  private nearestEnemy(x: number, y: number, range: number, skip?: Set<number>) {
    let best: Enemy | undefined
    let distance = range * range
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0 || skip?.has(enemy.id)) continue
      const d = (enemy.x - x) ** 2 + (enemy.y - y) ** 2
      if (d <= distance) {
        distance = d
        best = enemy
      }
    }
    return best
  }

  /** How much of a knockback this enemy feels. */
  private knockScale(enemy: Enemy, def: EnemyDef) {
    if (def.behavior === 'boss') return 0
    return (def.behavior === 'tank' ? 0.15 : 1) * (enemy.elite ? 0.3 : 1)
  }

  private moveEnemies(dt: number) {
    const state = this.state
    const list = state.enemies
    const count = list.length
    const remaining: Enemy[] = []
    for (let i = 0; i < count; i++) {
      const enemy = list[i]
      if (enemy.hp <= 0) continue
      const def = ENEMY_BY_ID.get(enemy.kind)!
      enemy.life += dt
      enemy.flash = Math.max(0, enemy.flash - dt)
      enemy.slow = Math.max(0, enemy.slow - dt)
      const owner = isRelationshipEnemy(enemy.kind) ? state.players.find((p) => p.id === enemy.targetPlayer) : undefined
      if (isRelationshipEnemy(enemy.kind) && (!owner || owner.downed || (!owner.dating && !owner.married))) {
        enemy.hp = 0
        for (const shot of state.shots) if (shot.target === enemy) shot.target = undefined
        continue
      }
      const target = owner
        ? { player: owner, distance: Math.hypot(owner.x - enemy.x, owner.y - enemy.y) }
        : this.nearestPlayer(enemy.x, enemy.y)
      if (!target) {
        remaining.push(enemy)
        continue
      }
      const radius = def.radius * enemy.scale
      // Life speeds up as you age.
      const speed = def.speed * (enemy.slow > 0 ? 0.45 : 1) * (1 + (state.time / RUN_SECONDS) * 0.35)
      const l = target.distance || 1
      const ux = (target.player.x - enemy.x) / l
      const uy = (target.player.y - enemy.y) / l
      // Velocity this tick; behaviours below fill it in.
      let mx = ux * speed
      let my = uy * speed
      let separate = true
      switch (def.behavior) {
        case 'dash':
          if (enemy.life > 5) continue
          mx = enemy.vx
          my = enemy.vy
          separate = false
          break
        case 'swarm': {
          const weave = Math.sin(enemy.life * 4 + enemy.id * 1.7) * 0.9
          mx = (ux - uy * weave) * speed
          my = (uy + ux * weave) * speed
          break
        }
        case 'charger': {
          const burst = this.chargeAi(enemy, def, target, ux, uy, def.dash ?? 340, 0.7, 0.6, 0.8, 220, dt)
          mx = burst.x
          my = burst.y
          separate = burst.separate
          break
        }
        case 'shooter': {
          const spec = def.shot!
          if (l > 300) {
            mx = ux * speed
            my = uy * speed
          } else if (l < 210) {
            mx = -ux * speed * 0.8
            my = -uy * speed * 0.8
          } else {
            const sign = enemy.id % 2 ? 1 : -1
            mx = -uy * sign * speed * 0.7
            my = ux * sign * speed * 0.7
          }
          enemy.shotCd -= dt
          if (enemy.shotCd <= 0 && l < 500 && state.bullets.length < SHOOTER_BULLET_LIMIT) {
            enemy.shotCd = spec.cooldown * (0.9 + this.rng() * 0.2)
            this.shoot(enemy, def, target.player)
          }
          break
        }
        case 'circler':
          if (enemy.mode === 0) {
            if (l > 320) {
              mx = ux * speed
              my = uy * speed
            } else {
              const sign = enemy.id % 2 ? 1 : -1
              const radial = Math.max(-1, Math.min(1, (l - 180) / 120))
              mx = (-uy * sign * 1.2 + ux * radial) * speed
              my = (ux * sign * 1.2 + uy * radial) * speed
              enemy.timer -= dt
              if (enemy.timer <= 0) {
                enemy.mode = 1
                enemy.timer = 0.9
                enemy.vx = ux * speed * 3.2
                enemy.vy = uy * speed * 3.2
              }
            }
          } else {
            mx = enemy.vx
            my = enemy.vy
            separate = false
            enemy.timer -= dt
            if (enemy.timer <= 0) {
              enemy.mode = 0
              enemy.timer = 2 + this.rng()
            }
          }
          break
        case 'blink':
          if (enemy.blink > 0) {
            mx = 0
            my = 0
            enemy.blink -= dt
            if (enemy.blink <= 0) {
              enemy.blink = 0
              const angle = this.rng() * Math.PI * 2
              enemy.x = target.player.x + Math.cos(angle) * 120
              enemy.y = target.player.y + Math.sin(angle) * 120
              enemy.timer = 2.6 + this.rng() * 0.8
            }
          } else {
            enemy.timer -= dt
            if (enemy.timer <= 0) enemy.blink = 0.35
          }
          break
        case 'ghost': {
          const wave = Math.sin(enemy.life * 1.5 + enemy.id) * 0.9
          mx = (ux - uy * wave) * speed
          my = (uy + ux * wave) * speed
          separate = false
          break
        }
        case 'boss': {
          const move = this.bossAi(enemy, def, target, ux, uy, speed, dt)
          mx = move.x
          my = move.y
          separate = move.separate
          break
        }
        default:
      }
      enemy.x += mx * dt
      enemy.y += my * dt
      if (separate)
        // Light separation so crowds read as a crowd, not a single blob.
        this.near(enemy.x, enemy.y, radius, (other) => {
          if (other === enemy) return
          const ox = enemy.x - other.x
          const oy = enemy.y - other.y
          const min = radius + ENEMY_BY_ID.get(other.kind)!.radius * other.scale * 0.8
          const d2 = ox * ox + oy * oy
          if (d2 > 0.01 && d2 < min * min) {
            const d = Math.sqrt(d2)
            const push = Math.min(((min - d) / d) * 0.35, 3)
            enemy.x += ox * push
            enemy.y += oy * push
          }
        })
      // Too far from everyone: re-enter from the edge instead of trailing forever.
      if (def.behavior !== 'dash' && def.behavior !== 'boss' && target.distance > SPAWN_RADIUS * 1.45) {
        const angle = this.rng() * Math.PI * 2
        enemy.x = target.player.x + Math.cos(angle) * SPAWN_RADIUS
        enemy.y = target.player.y + Math.sin(angle) * SPAWN_RADIUS
      }
      enemy.x += enemy.kx * dt
      enemy.y += enemy.ky * dt
      enemy.kx *= Math.exp(-dt * 8)
      enemy.ky *= Math.exp(-dt * 8)
      for (const player of state.players) {
        if (isRelationshipEnemy(enemy.kind) && player.id !== enemy.targetPlayer) continue
        if (player.downed) continue
        const reach = radius + playerRadius(player)
        if ((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2 >= reach * reach) continue
        if (enemy.mode === 2 && (def.behavior === 'charger' || def.behavior === 'boss')) {
          // A charge lands as one blow (then the attacker is spent), not as a grinding touch.
          if (player.invuln > 0) continue
          const armor = playerStats(player).armor
          const damaged = this.damagePlayer(
            player,
            Math.max(def.damage * 0.25, def.damage * 0.8 - armor) * (enemy.elite ? 1.5 : 1),
            def.id
          )
          if (damaged) player.invuln = BULLET_IFRAMES
          enemy.mode = 3
          enemy.timer = 0.8
        } else if (def.behavior === 'boss') {
          // A life event hits in blows with a moment's grace between, so one clumsy touch is not the end.
          if (player.invuln > 0) continue
          const armor = playerStats(player).armor
          const damaged = this.damagePlayer(player, Math.max(def.damage * 0.2, def.damage * 0.6 - armor), def.id)
          if (damaged && player.invuln <= 0) player.invuln = BOSS_IFRAMES
        } else this.hurt(player, def, dt, enemy.elite ? 1.5 : 1)
      }
      remaining.push(enemy)
    }
    // Anything born during the pass (summons) joins next tick.
    for (let i = count; i < list.length; i++) remaining.push(list[i])
    state.enemies = remaining
  }

  /**
   * Approach, telegraph, dash at the spot locked at the start of the telegraph, recover.
   * Used by chargers and by bosses' `charge` pattern (which enters through mode 1).
   */
  private chargeAi(
    enemy: Enemy,
    def: EnemyDef,
    target: { player: Player; distance: number },
    ux: number,
    uy: number,
    dash: number,
    windup: number,
    dashTime: number,
    recover: number,
    range: number,
    dt: number
  ) {
    let x = 0
    let y = 0
    let separate = true
    const speed = def.speed * (enemy.slow > 0 ? 0.45 : 1) * (1 + (this.state.time / RUN_SECONDS) * 0.35)
    if (enemy.mode === 0) {
      if (target.distance <= range && def.behavior === 'charger') this.beginWindup(enemy, def, target.player, windup)
      else {
        x = ux * speed
        y = uy * speed
      }
    } else if (enemy.mode === 1) {
      enemy.timer -= dt
      enemy.windup = Math.max(0, enemy.timer)
      if (enemy.timer <= 0) {
        enemy.mode = 2
        enemy.timer = dashTime
        enemy.windup = 0
        const dx = enemy.tx - enemy.x
        const dy = enemy.ty - enemy.y
        const l = Math.hypot(dx, dy)
        const dirx = l > 1 ? dx / l : ux
        const diry = l > 1 ? dy / l : uy
        enemy.vx = dirx * dash
        enemy.vy = diry * dash
      }
    } else if (enemy.mode === 2) {
      x = enemy.vx
      y = enemy.vy
      separate = false
      enemy.timer -= dt
      if (enemy.timer <= 0) {
        enemy.mode = 3
        enemy.timer = recover
      }
    } else {
      enemy.timer -= dt
      if (enemy.timer <= 0) enemy.mode = 0
    }
    return { x, y, separate }
  }

  private beginWindup(enemy: Enemy, def: EnemyDef, player: Player, windup: number) {
    enemy.mode = 1
    enemy.timer = windup
    enemy.windup = windup
    enemy.tx = player.x
    enemy.ty = player.y
    this.emit(FX.WINDUP, enemy.x, enemy.y, ENEMY_INDEX.get(def.id)!)
  }

  /** Boss movement plus its attack patterns. */
  private bossAi(
    enemy: Enemy,
    def: EnemyDef,
    target: { player: Player; distance: number },
    ux: number,
    uy: number,
    speed: number,
    dt: number
  ) {
    const patterns = def.patterns ?? []
    for (let i = 0; i < enemy.pcd.length; i++) enemy.pcd[i] -= dt
    if (enemy.burst > 0) this.spiralFire(enemy, def, dt)
    if (enemy.mode === 0 && enemy.burst <= 0 && target.distance < 640) {
      for (let i = 0; i < patterns.length; i++) {
        if (enemy.pcd[i] > 0) continue
        enemy.pcd[i] = PATTERN_COOLDOWN[patterns[i]]
        this.startPattern(enemy, def, patterns[i], target.player)
        break
      }
    }
    if (enemy.mode === 0) return { x: ux * speed, y: uy * speed, separate: true }
    return this.chargeAi(enemy, def, target, ux, uy, def.dash ?? 380, 0.9, 0.55, 0.8, 0, dt)
  }

  private startPattern(enemy: Enemy, def: EnemyDef, pattern: BossPattern, player: Player) {
    const bullet = BULLET_INDEX.get(def.id) ?? 0
    const damage = Math.max(4, Math.round(def.damage * 0.3))
    if (pattern === 'ring') {
      const count = 10 + Math.min(6, Math.floor(def.hp / 6000))
      const offset = this.rng() * Math.PI * 2
      for (let i = 0; i < count; i++) {
        const angle = offset + (i / count) * Math.PI * 2
        this.addBullet(enemy.x, enemy.y, angle, 150, 8, damage, bullet, def.id)
      }
      this.emit(FX.ENEMY_SHOT, enemy.x, enemy.y, ENEMY_INDEX.get(def.id)!)
    } else if (pattern === 'spiral') {
      enemy.burst = 2
      enemy.shotCd = 0
      enemy.spin = this.rng() * Math.PI * 2
    } else if (pattern === 'summon') {
      const count = 4 + (def.hp > 20000 ? 2 : def.hp > 5000 ? 1 : 0)
      const alive = this.state.enemies.reduce((n, e) => n + (e.kind === def.minion ? 1 : 0), 0)
      if (def.minion && alive < 12 && this.state.enemies.length + count < MAX_ENEMIES)
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + this.rng() * 0.4
          this.spawnEnemy(
            def.minion,
            enemy.x + Math.cos(angle) * (def.radius + 50),
            enemy.y + Math.sin(angle) * (def.radius + 50)
          )
        }
      this.emit(FX.ENEMY_SHOT, enemy.x, enemy.y, ENEMY_INDEX.get(def.id)!)
    } else this.beginWindup(enemy, def, player, 0.9)
  }

  private spiralFire(enemy: Enemy, def: EnemyDef, dt: number) {
    enemy.burst -= dt
    enemy.shotCd -= dt
    const bullet = BULLET_INDEX.get(def.id) ?? 0
    const damage = Math.max(4, Math.round(def.damage * 0.3))
    while (enemy.shotCd <= 0 && enemy.burst > -0.1) {
      enemy.shotCd += 0.12
      enemy.spin += 0.5
      this.addBullet(enemy.x, enemy.y, enemy.spin, 170, 8, damage, bullet, def.id)
      this.addBullet(enemy.x, enemy.y, enemy.spin + Math.PI, 170, 8, damage, bullet, def.id)
    }
  }

  private addBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    r: number,
    damage: number,
    kind: number,
    src: string
  ) {
    if (this.state.bullets.length >= MAX_BULLETS) return
    this.state.bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r,
      damage,
      life: 3.6,
      kind,
      src
    })
  }

  /** A shooter's volley at a player. */
  private shoot(enemy: Enemy, def: EnemyDef, player: Player) {
    const spec = def.shot!
    const kind = BULLET_INDEX.get(spec.bullet) ?? 0
    const count = spec.count ?? 1
    const damage = spec.damage * (enemy.elite ? 1.5 : 1)
    const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x)
    if (spec.ring) {
      const offset = this.rng() * Math.PI * 2
      for (let i = 0; i < count; i++)
        this.addBullet(enemy.x, enemy.y, offset + (i / count) * Math.PI * 2, spec.speed, 7, damage, kind, def.id)
    } else
      for (let i = 0; i < count; i++) {
        const angle = aim + (count > 1 ? (i / (count - 1) - 0.5) * (spec.spread ?? 0.5) : 0)
        this.addBullet(enemy.x, enemy.y, angle, spec.speed, 7, damage, kind, def.id)
      }
    if (this.tickShots++ < 3) this.emit(FX.ENEMY_SHOT, enemy.x, enemy.y, ENEMY_INDEX.get(def.id)!)
  }

  private moveBullets(dt: number) {
    const state = this.state
    if (!state.bullets.length) return
    const alive = state.players.filter((player) => !player.downed)
    const blockers = state.shots.filter(
      (shot) => (shot.sourceWeapon === 'w_friend' || shot.sourceWeapon === 'w_pet') && shot.delay <= 0
    )
    const kept: Bullet[] = []
    for (const bullet of state.bullets) {
      bullet.life -= dt
      if (bullet.life <= 0) continue
      bullet.x += bullet.vx * dt
      bullet.y += bullet.vy * dt
      const guard = state.shots.find((shot) => {
        if (shot.weapon !== 'p_over' || shot.life <= 0 || shot.delay > 0 || shot.v !== 0) return false
        const owner = alive.find((player) => player.id === shot.owner)
        return owner && owner.shieldRecovery <= 0 && this.shieldTouches(shot, bullet.x, bullet.y, bullet.r)
      })
      if (guard) {
        guard.v = 1
        alive.find((player) => player.id === guard.owner)!.shieldRecovery = SHIELD_RECOVERY
        continue
      }
      if (
        blockers.some((shot) => {
          const reach = shot.r + bullet.r
          return (shot.x - bullet.x) ** 2 + (shot.y - bullet.y) ** 2 <= reach * reach
        })
      )
        continue
      let spent = false
      for (const player of alive) {
        if (player.invuln > 0) continue
        const reach = bullet.r + playerRadius(player) - 3
        if ((player.x - bullet.x) ** 2 + (player.y - bullet.y) ** 2 < reach * reach) {
          const armor = playerStats(player).armor
          this.damagePlayer(player, Math.max(bullet.damage * 0.25, bullet.damage - armor), bullet.src, false)
          player.invuln = BULLET_IFRAMES
          spent = true
          break
        }
      }
      if (!spent) kept.push(bullet)
    }
    state.bullets = kept
  }

  /** Contact damage, applied continuously while touching. */
  private hurt(player: Player, def: EnemyDef, dt: number, mult = 1) {
    const armor = playerStats(player).armor
    this.damagePlayer(player, Math.max(def.damage * 0.25, def.damage - armor) * dt * 2.2 * mult, def.id)
  }

  private damagePlayer(player: Player, amount: number, killer: string, allowGuard = true) {
    if (allowGuard && player.parent === 'p_over' && player.shieldRecovery <= 0) {
      const shield = this.state.shots.find(
        (shot) =>
          shot.owner === player.id && shot.weapon === 'p_over' && shot.life > 0 && shot.delay <= 0 && shot.v === 0
      )
      if (shield) {
        shield.v = 1
        player.shieldRecovery = SHIELD_RECOVERY
        return false
      }
    }
    player.hp -= amount
    player.hurt = 0.2
    player.hurtAcc += amount
    if (player.hurtFx <= 0) {
      player.hurtFx = 0.25
      this.emit(FX.HURT, player.x, player.y, this.playerIndex(player), Math.max(1, Math.round(player.hurtAcc)))
      player.hurtAcc = 0
    }
    if (player.hp <= 0) {
      player.hp = 0
      player.downed = true
      player.revive = 0
      player.killer = killer
      this.emit(FX.DOWN, player.x, player.y, this.playerIndex(player))
      this.log(`${player.name}の心が折れた…（仲間がそばにいると立ち直る）`)
    }
    return true
  }

  private revivePlayers(dt: number) {
    for (const player of this.state.players) {
      if (!player.downed) continue
      const helper = this.state.players.some(
        (other) => !other.downed && Math.hypot(other.x - player.x, other.y - player.y) < 70
      )
      player.revive = helper ? player.revive + dt / 3 : Math.max(0, player.revive - dt / 6)
      if (player.revive >= 1) {
        player.downed = false
        player.revive = 0
        player.killer = undefined
        player.hp = player.maxHp * 0.5
        player.hurtAcc = 0
        this.emit(FX.REVIVE, player.x, player.y, this.playerIndex(player))
        this.log(`${player.name}が立ち直った！`)
      }
    }
  }

  private fireWeapons(dt: number) {
    for (const player of this.state.players) {
      if (player.downed) continue
      const stats = playerStats(player)
      for (const weapon of player.weapons) {
        if (weapon.id === 'w_cooking' && weapon.held === 0) weapon.cd = WEAPON_BY_ID.get(weapon.id)!.cooldown
        weapon.held += dt
        if (
          weapon.id === 'w_travel' &&
          this.state.shots.some((shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id)
        )
          continue
        weapon.cd -= dt
        if (weapon.id === 'p_over') {
          const ws = weaponStats(player, weapon, stats)
          let guards = this.state.shots.filter((shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id)
          if (!guards.length) weapon.cd = ws.cooldown
          if (guards.length > ws.amount) {
            const extra = new Set(guards.slice(ws.amount))
            this.state.shots = this.state.shots.filter((shot) => !extra.has(shot))
            guards = guards.slice(0, ws.amount)
          }
          if (guards.length < ws.amount) {
            this.fire(player, weapon, ws)
            guards = this.state.shots.filter((shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id)
          }
          if (weapon.cd <= 0) {
            for (const guard of guards) guard.v = 0
            weapon.cd = ws.cooldown
          }
          for (const [index, guard] of guards.entries()) {
            guard.h = index - (guards.length - 1) / 2
            guard.orbit = WEAPON_BY_ID.get(weapon.id)!.area * ws.area
            guard.r = 20 * ws.area
            guard.damage = ws.damage
            guard.critChance = ws.crit
            guard.strongMult = ws.strong
            guard.tick = guardianBashDuration(weapon.lv)
          }
          continue
        }
        if (weapon.id === 'p_toxic') {
          const aura = this.state.shots.find((shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id)
          if (aura) {
            const ws = weaponStats(player, weapon, stats)
            aura.r = WEAPON_BY_ID.get(weapon.id)!.area * ws.area
            aura.damage = ws.damage
            aura.critChance = ws.crit
            aura.strongMult = ws.strong
            continue
          }
        }
        if (
          weapon.id === 'w_observe' &&
          (player.still < observationStillSeconds(weapon.lv) ||
            this.state.shots.some((shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id))
        )
          continue
        if (weapon.cd > (weapon.id === 'w_cooking' ? 1e-9 : 0) && weapon.id !== 'w_observe') continue
        const ws = weaponStats(player, weapon, stats)
        const copiedMonster =
          weapon.id === 'w_gamble' &&
          weapon.gambleWeapon === 'p_monster' &&
          weapon.held < (weapon.gambleUntil ?? 0) &&
          player.weapons.some((owned) => owned.id === 'p_monster')
        if (weapon.id === 'p_monster' || copiedMonster) {
          const limit = copiedMonster
            ? weaponStats(player, weapon, stats, WEAPON_BY_ID.get('p_monster')!).amount
            : ws.amount
          const active = this.state.shots.filter(
            (shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id && shot.weapon === 'p_monster'
          ).length
          if (active >= limit) continue
        }
        weapon.cd += ws.cooldown
        if (weapon.cd < 0) weapon.cd = ws.cooldown
        this.emit(FX.FIRE, player.x, player.y, WEAPON_INDEX.get(weapon.id)!, this.playerIndex(player))
        this.fire(player, weapon, ws)
      }
    }
  }

  private ageWeapons() {
    const age = ageAt(this.state.time)
    for (const player of this.state.players) {
      if (age >= PEOPLE_FEAR_UNTIL_AGE && player.passives.some((passive) => passive.id === PEOPLE_FEAR)) {
        player.passives = player.passives.filter((passive) => passive.id !== PEOPLE_FEAR)
        this.log(`${player.name}は20歳になり、「人間への恐怖」が消えた。`, player.id)
      }
      const pet = player.weapons.find((weapon) => weapon.id === 'w_pet')
      if (!pet) continue
      pet.acquiredAge ??= age
      if (age - pet.acquiredAge < PET_LIFESPAN) continue
      player.weapons = player.weapons.filter((weapon) => weapon !== pet)
      this.state.shots = this.state.shots.filter((shot) => shot.owner !== player.id || shot.sourceWeapon !== pet.id)
      const refresh = (hand: string[]) => hand.filter((choice) => !choice.startsWith('r:w_pet:'))
      if (player.choices.some((choice) => choice === 'w:w_pet' || choice.startsWith('r:w_pet:'))) {
        player.choices = refresh(player.choices)
        if (!player.choices.length) player.choices = ['x:skip']
        player.choiceSeq++
      }
      const familyHand = this.familyHands.get(player.id)
      if (familyHand?.length) {
        const remaining = refresh(familyHand)
        this.familyHands.set(player.id, remaining.length ? remaining : ['x:skip'])
      }
      if (pet.lv >= MAX_WEAPON_LEVEL && !passiveLevel(player, PET_MEMORY)) {
        player.passives.push({ id: PET_MEMORY, lv: 1 })
        this.log(`${player.name}の愛犬が旅立った。「愛犬との思い出」は心に残る。`)
      } else this.log(`${player.name}の愛犬が旅立った。`)
    }
  }

  private targets(player: Player, count: number, range: number) {
    const found: { enemy: Enemy; d: number }[] = []
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue
      const d = Math.hypot(enemy.x - player.x, enemy.y - player.y)
      if (d <= range) found.push({ enemy, d })
    }
    found.sort((a, b) => a.d - b.d)
    return found.slice(0, count).map((entry) => entry.enemy)
  }

  private shot(player: Player, weapon: OwnedWeapon, def: WeaponDef, ws: WeaponStats, extra: Partial<Shot>) {
    const life = extra.life ?? ws.duration
    const shot: Shot = {
      id: this.state.nextId++,
      owner: player.id,
      weapon: def.id,
      sourceWeapon: weapon.id,
      kind: def.behavior,
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      r: def.area * ws.area,
      angle: 0,
      orbit: 0,
      spin: 0,
      maxLife: life,
      damage: ws.damage,
      pierce: def.pierce,
      tick: def.pierce === Infinity ? 0.5 : Infinity,
      knockback: def.knockback,
      strong: def.strong,
      hits: new Map(),
      w: 0,
      h: 0,
      v: 0,
      delay: 0,
      aux: 0,
      crit: false,
      critChance: ws.crit,
      strongMult: ws.strong,
      ...extra,
      life
    }
    if (this.state.shots.length < MAX_SHOTS) this.state.shots.push(shot)
    return shot
  }

  private fire(player: Player, weapon: OwnedWeapon, ws: WeaponStats, def = WEAPON_BY_ID.get(weapon.id)!) {
    // 過保護親 alive from this source (her own skill or the gamble's copy): neither tops up beyond its amount.
    const existingGuards =
      def.id === 'p_over'
        ? this.state.shots.filter(
            (shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id && shot.weapon === def.id
          ).length
        : 0
    const n =
      def.id === 'p_monster'
        ? Math.max(
            0,
            ws.amount -
              this.state.shots.filter(
                (shot) => shot.owner === player.id && shot.weapon === 'p_monster' && shot.sourceWeapon === weapon.id
              ).length
          )
        : def.id === 'p_over'
          ? Math.max(0, ws.amount - existingGuards)
          : ws.amount
    const rng = this.rng
    const speed = def.speed * ws.speed
    switch (def.behavior) {
      case 'orbit':
        for (let i = 0; i < n; i++)
          this.shot(player, weapon, def, ws, {
            angle: (i / n) * Math.PI * 2,
            guardianHeading: def.id === 'p_over' ? Math.atan2(player.fy, player.fx) : undefined,
            guardianStill: def.id === 'p_over' ? Number(player.still > 0) : undefined,
            // A new 過保護親 joins her line on the shoulder it walks at.
            guardianSide:
              def.id === 'p_over'
                ? this.state.shots.find((shot) => shot.owner === player.id && shot.weapon === 'p_over')?.guardianSide
                : undefined,
            orbit: def.area * ws.area,
            spin: def.id === 'p_monster' ? 192 * ws.speed : def.id === 'p_over' ? 240 * ws.speed : speed,
            r: 20 * (def.id === 'p_over' ? ws.area : Math.sqrt(ws.area)),
            h:
              def.id === 'p_over'
                ? guardianSlot(i + existingGuards - (ws.amount - 1) / 2, weapon.id !== def.id)
                : def.id === 'p_monster'
                  ? Number(
                      this.state.shots.some(
                        (shot) => shot.owner === player.id && shot.weapon === def.id && shot.h === 0
                      )
                    )
                  : 0,
            tick: def.id === 'p_over' ? guardianBashDuration(weapon.lv) : 0.45
          })
        break
      case 'aura':
        this.shot(player, weapon, def, ws, { r: def.area * ws.area, tick: 0.45 })
        break
      case 'aim':
      case 'homing':
      case 'bounce': {
        const found = this.targets(player, n, 700)
        for (let i = 0; i < n; i++) {
          const target = found[i % Math.max(1, found.length)]
          let angle = target
            ? Math.atan2(target.y - player.y, target.x - player.x)
            : Math.atan2(player.fy, player.fx) + (i - (n - 1) / 2) * 0.25
          if (def.behavior === 'bounce') angle += (rng() - 0.5) * 0.6
          this.shot(player, weapon, def, ws, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            pierce:
              def.pierce +
              WEAPON_LEVELS[def.id].slice(0, weapon.lv - 1).reduce((value, upgrade) => value + (upgrade.pierce ?? 0), 0)
          })
        }
        break
      }
      case 'wander':
        for (let i = 0; i < n; i++) {
          this.shot(player, weapon, def, ws, {
            x: player.x + (i - (n - 1) / 2) * def.area * ws.area * 2,
            vy: -speed,
            angle: -Math.PI / 2
          })
        }
        break
      case 'arc':
        for (let i = 0; i < n; i++) {
          const side = (i % 2 ? -1 : 1) * (player.fx < 0 ? -1 : 1)
          this.shot(player, weapon, def, ws, { vx: side * (90 + rng() * 140 + i * 30), vy: -speed - rng() * 80 })
        }
        break
      case 'zone':
        for (let i = 0; i < n; i++) {
          const found = this.targets(player, 8, 360)
          const target = found[Math.floor(rng() * found.length)]
          const angle = rng() * Math.PI * 2
          this.shot(player, weapon, def, ws, {
            x: target?.x ?? player.x + Math.cos(angle) * 120,
            y: target?.y ?? player.y + Math.sin(angle) * 120,
            tick: 0.5
          })
        }
        break
      case 'strike':
      case 'rain': {
        const found = this.targets(player, 24, 520)
        for (let i = 0; i < n; i++) {
          const target = found.splice(Math.floor(rng() * found.length), 1)[0]
          if (!target) break
          this.shot(player, weapon, def, ws, { x: target.x, y: target.y, tick: Infinity })
        }
        break
      }
      case 'whip':
      case 'flail':
      case 'beam':
        for (let i = 0; i < n; i++) {
          let angle =
            def.behavior === 'flail' ? rng() * Math.PI * 2 : Math.atan2(player.fy, player.fx) + (i % 2 ? Math.PI : 0)
          if (def.behavior === 'whip' && i >= 2) angle += (i % 2 ? -1 : 1) * 0.6
          if (def.behavior === 'beam') angle = Math.atan2(player.fy, player.fx) + beamSpread(i)
          const length = def.area * ws.area
          if (def.behavior === 'beam')
            this.shot(player, weapon, def, ws, {
              angle,
              w: length / 2,
              h: 9 * ws.area,
              r: length / 2,
              x: player.x + Math.cos(angle) * length * 0.5,
              y: player.y + Math.sin(angle) * length * 0.5,
              tick: 0.2
            })
          else
            this.shot(player, weapon, def, ws, {
              angle,
              w: length / 2,
              h: def.behavior === 'flail' ? 22 : 22 * ws.area,
              r: length / 2,
              x: player.x + Math.cos(angle) * length * 0.5,
              y: player.y + Math.sin(angle) * length * 0.5,
              tick: Infinity
            })
        }
        break
      case 'chain': {
        // SNS: instant. Each link is a short-lived visual segment that ends on its victim.
        const hit = new Set<number>()
        let fromX = player.x
        let fromY = player.y
        const jump = 170 * ws.area
        const links = Math.round((2 + n) * (ws.duration / def.duration))
        for (let i = 0; i < links; i++) {
          const target = this.nearestEnemy(fromX, fromY, i === 0 ? 420 * ws.area : jump, hit)
          if (!target) break
          hit.add(target.id)
          const dx = target.x - fromX
          const dy = target.y - fromY
          const link = this.shot(player, weapon, def, ws, {
            x: target.x,
            y: target.y,
            angle: Math.atan2(dy, dx),
            r: Math.hypot(dx, dy),
            v: i,
            pierce: 1,
            tick: Infinity
          })
          this.damage(target, ENEMY_BY_ID.get(target.kind)!, link, player)
          fromX = target.x
          fromY = target.y
        }
        break
      }
      case 'pet': {
        for (let i = 0; i < n; i++) {
          const orbit = i * 2.4
          // It appears on a free resting spot near its own way out from the child (not on the child), clear of the pets
          // already out (an earlier round's stay outlasts the cooldown) and of the other companions.
          const base = this.petBase(def.id, weapon.id, orbit, 0)
          const used = new Set<number>()
          for (const shot of this.state.shots)
            if (shot.owner === player.id && shot.weapon === 'w_pet' && shot.delay <= 0 && shot.restSpot !== undefined)
              used.add(shot.restSpot)
          const restSpot = this.pickPetSpot(base, used, this.petObstacles(player).avoid)
          const rest = restSpot === undefined ? base : PET_SPOTS[restSpot]
          this.shot(player, weapon, def, ws, {
            x: player.x + rest.x,
            y: player.y + rest.y,
            // It starts out facing the way the child faces.
            angle: Math.atan2(player.fy, player.fx),
            restSpot,
            orbit,
            petType: i % PET_TYPES.length,
            spin: speed,
            tick: 0.4
          })
        }
        break
      }
      case 'observe': {
        if (
          player.still < observationStillSeconds(weapon.lv) ||
          this.state.shots.some(
            (shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id && shot.weapon === def.id
          ) ||
          this.state.shots.length >= MAX_SHOTS
        )
          break
        const form = observationSprite(ageAt(this.state.time), weapon.observationCount ?? 0)
        weapon.observationCount = (weapon.observationCount ?? 0) + 1
        // Facing up, the creature appears no more than 20° above the horizon, clear of the name tag and buff labels
        // stacked over the head; straight up it goes to the right.
        // The child's own creature and a gamble's copy appear across the child from each other (whichever comes
        // first, or comes again while the other is out), so the two fields of view do not lie on top of each other;
        // the same limit on rising above the horizon applies.
        const other = this.state.shots.find(
          (shot) => shot.owner === player.id && shot.weapon === def.id && shot.sourceWeapon !== weapon.id
        )
        const otherDistance = other ? Math.hypot(other.x - player.x, other.y - player.y) : 0
        const facingX = other && otherDistance > 1e-6 ? -(other.x - player.x) / otherDistance : player.fx
        const facingY = other && otherDistance > 1e-6 ? -(other.y - player.y) / otherDistance : player.fy
        let appearX = facingX
        let appearY = facingY
        if (facingY < 0) {
          const elevation = Math.min(Math.atan2(-facingY, Math.abs(facingX)), OBSERVATION_MAX_ELEVATION)
          const sideways = Math.abs(facingX) >= 0.2 ? Math.sign(facingX) : 1
          appearX = Math.cos(elevation) * sideways
          appearY = -Math.sin(elevation)
        }
        // Where her parents (過保護親) stand or are heading beside her, it turns down the screen OBSERVATION_TURN at a
        // time (as far as OBSERVATION_TURNS of them), then tries the other side, so it never appears on one of them.
        const guards = this.state.shots.filter(
          (shot) => shot.owner === player.id && shot.weapon === 'p_over' && shot.delay <= 0
        )
        const clear = (x: number, y: number) =>
          guards.every((guard) =>
            [guard.guardianOffset ?? { x: guard.x - player.x, y: guard.y - player.y }, guard.guardianRest].every(
              (at) =>
                !at ||
                Math.abs(at.x - x) >= CREATURE_BODY.x + GUARDIAN_BODY.x ||
                Math.abs(at.y - y) >= CREATURE_BODY.y + GUARDIAN_BODY.y
            )
          )
        if (!clear(appearX * 50, appearY * 50)) {
          const ways: { x: number; y: number }[] = []
          for (const mirror of [1, -1]) {
            const from = Math.atan2(appearY, appearX * mirror)
            const down = Math.cos(from) >= 0 ? 1 : -1
            for (let k = 0; k <= OBSERVATION_TURNS; k++) {
              const angle = from + down * k * OBSERVATION_TURN
              ways.push({ x: Math.cos(angle), y: Math.sin(angle) })
            }
          }
          const way = ways.find((w) => clear(w.x * 50, w.y * 50))
          if (way) {
            appearX = way.x
            appearY = way.y
          }
        }
        this.shot(player, weapon, def, ws, {
          x: player.x + appearX * 50,
          y: player.y + appearY * 50,
          w: observationTargets(player, weapon),
          v: form * 2 + 1,
          tick: 0.5
        })
        break
      }
      case 'slam': {
        const radius = def.area * ws.area
        const slam = this.shot(player, weapon, def, ws, { r: radius, tick: Infinity })
        this.near(player.x, player.y, radius, (enemy) => {
          const edef = ENEMY_BY_ID.get(enemy.kind)!
          const reach = radius + edef.radius * enemy.scale
          if ((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2 <= reach * reach)
            this.damage(enemy, edef, slam, player)
        })
        this.emit(FX.BLAST, player.x, player.y, radius, WEAPON_INDEX.get(def.id)!)
        break
      }
      case 'barrage': {
        const target = this.nearestEnemy(player.x, player.y, 700)
        const base = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(player.fy, player.fx)
        for (let i = 0; i < n * 3; i++) {
          const angle = base + (rng() - 0.5) * 0.08
          this.shot(player, weapon, def, ws, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            delay: i * 0.06
          })
        }
        break
      }
      case 'boomerang': {
        const target = this.nearestEnemy(player.x, player.y, 700)
        const base = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(player.fy, player.fx)
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * 0.45
          this.shot(player, weapon, def, ws, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            tick: 0.35
          })
        }
        break
      }
      case 'nova':
        for (let i = 0; i < n; i++)
          this.shot(player, weapon, def, ws, {
            r: 10,
            angle: Math.atan2(player.fy, player.fx),
            w: def.area * ws.area,
            tick: Infinity,
            delay: i * 0.22
          })
        break
      case 'sweep':
        for (let i = 0; i < n; i++) {
          const side = rng() < 0.5 ? -1 : 1
          this.shot(player, weapon, def, ws, {
            x: player.x - side * (VIEW_HALF.x + 40),
            y: player.y + (rng() * 2 - 1) * 220,
            vx: side * speed,
            ...(weapon.id === 'w_travel'
              ? { aux: player.x + side * (VIEW_HALF.x + 40), life: (2 * (VIEW_HALF.x + 40)) / speed + 1 }
              : {}),
            angle: side > 0 ? 0 : Math.PI,
            tick: 5
          })
        }
        break
      case 'mine': {
        let planted = 0
        for (const shot of this.state.shots)
          if (shot.owner === player.id && shot.sourceWeapon === weapon.id && shot.weapon === def.id) planted++
        for (let i = 0; i < n && planted + i < 5 + n * 2; i++) {
          const angle = rng() * Math.PI * 2
          this.shot(player, weapon, def, ws, {
            x: player.x + (i ? Math.cos(angle) * 28 : 0),
            y: player.y + (i ? Math.sin(angle) * 28 : 0),
            r: 16,
            w: def.area * ws.area,
            aux: 0.4,
            tick: Infinity
          })
        }
        break
      }
      case 'gamble': {
        const candidates = player.weapons.filter((owned) => {
          const def = WEAPON_BY_ID.get(owned.id)
          return def && def.id !== 'w_gamble' && def.behavior !== 'none' && def.behavior !== 'food'
        })
        if (!candidates.length) {
          weapon.gambleWeapon = undefined
          break
        }
        if (!candidates.some((owned) => owned.id === weapon.gambleWeapon) || weapon.held >= (weapon.gambleUntil ?? 0)) {
          weapon.gambleWeapon = candidates[Math.floor(rng() * candidates.length)].id
          weapon.gambleUntil = weapon.held + 12
          this.emit(
            FX.GAMBLE,
            player.x,
            player.y,
            GAMBLE_FORMS.indexOf(gambleForm(ageAt(this.state.time))),
            WEAPON_INDEX.get(weapon.gambleWeapon)!
          )
        }
        const copied = WEAPON_BY_ID.get(weapon.gambleWeapon!)!
        this.fire(player, weapon, weaponStats(player, weapon, playerStats(player), copied), copied)
        break
      }
      case 'trail':
        for (let i = 0; i < n; i++) {
          const jitter = i ? 30 : 0
          this.shot(player, weapon, def, ws, {
            x: player.x + (rng() * 2 - 1) * jitter,
            y: player.y + (rng() * 2 - 1) * jitter,
            tick: 0.5
          })
        }
        break
      case 'food': {
        const kind = COOKING_ITEMS[Math.floor(rng() * COOKING_ITEMS.length)]
        this.drop({
          kind,
          x: player.x + player.fx * 60,
          y: player.y + player.fy * 60,
          owner: player.id,
          power:
            1 +
            WEAPON_LEVELS[def.id]
              .slice(0, weapon.lv - 1)
              .reduce((value, upgrade) => value + (upgrade.foodPower ?? 0), 0) +
            (isEvolved(player, weapon) ? 0.3 : 0)
        })
        break
      }
      case 'garden': {
        const target = this.nearestEnemy(player.x, player.y, 700)
        const base = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(player.fy, player.fx)
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * 0.35
          this.shot(player, weapon, def, ws, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            r: 10 * ws.area,
            w: def.area * ws.area,
            aux: (def.speed * 0.8) / speed,
            orbit: (def.speed * 0.8) / speed,
            pierce: 1,
            tick: 0.5
          })
        }
        break
      }
      case 'raid': {
        // ヤンキー親 storms out at the nearest enemies, one each, stopping a stride short so the sole lands on
        // them; with nobody near it swaggers out ahead.
        const reach = def.area * ws.area
        const found = this.targets(player, n, reach * 2)
        const r = 18 * Math.sqrt(ws.area)
        for (let i = 0; i < n; i++) {
          const target = found[i]
          const angle = target
            ? Math.atan2(target.y - player.y, target.x - player.x)
            : Math.atan2(player.fy, player.fx) + (i - (n - 1) / 2) * 0.7
          const d = target ? Math.hypot(target.x - player.x, target.y - player.y) - 14 : reach * 0.6
          this.shot(player, weapon, def, ws, { angle, orbit: Math.max(48, Math.min(reach, d)), r, w: r, tick: 0.3 })
        }
        break
      }
    }
  }

  private moveShots(dt: number) {
    const state = this.state
    const players = new Map(state.players.map((player) => [player.id, player]))
    this.guardiansMoved.clear()
    this.guardianPass = true
    for (const player of state.players) this.assignPetSpots(player)
    const kept: Shot[] = []
    for (const shot of state.shots) {
      const owner = players.get(shot.owner)
      if (!owner) continue
      if (shot.delay > 0) {
        shot.delay -= dt
        // Staples leave from wherever the owner is when their turn comes.
        if (shot.delay <= 0 && shot.kind === 'barrage') {
          shot.x = owner.x
          shot.y = owner.y
        }
        kept.push(shot)
        continue
      }
      if (
        (shot.weapon === 'p_toxic' || shot.weapon === 'p_over') &&
        shot.sourceWeapon === shot.weapon &&
        owner.weapons.some((weapon) => weapon.id === shot.weapon)
      )
        shot.life = shot.maxLife
      else shot.life -= dt
      if (shot.kind === 'garden' && shot.v === 0) {
        const travel = Math.min(dt, shot.aux)
        shot.x += shot.vx * travel
        shot.y += shot.vy * travel
        shot.aux -= dt
        if (shot.aux <= 0) {
          shot.v = 2
          shot.aux = 0.5
        }
        kept.push(shot)
        continue
      }
      if (shot.kind === 'garden' && shot.v === 2) {
        shot.aux -= dt
        if (shot.aux <= 0) {
          shot.v = 1
          shot.r = shot.w
          shot.life = shot.maxLife
          shot.pierce = Infinity
        }
        kept.push(shot)
        continue
      }
      if (shot.life <= 0 && shot.sourceWeapon !== 'w_travel') {
        if (shot.weapon === 'p_free') this.burst(shot, owner)
        continue
      }
      switch (shot.kind) {
        case 'sweep':
          shot.x += shot.vx * dt
          if (shot.sourceWeapon === 'w_travel' && (shot.x - shot.aux) * shot.vx >= 0) continue
          break
        case 'orbit':
          if (shot.weapon === 'p_monster') this.movePet(shot, owner, dt)
          else if (shot.weapon === 'p_over') this.moveGuardian(shot, owner, dt)
          else {
            shot.angle += shot.spin * dt
            shot.x = owner.x + Math.cos(shot.angle) * shot.orbit
            shot.y = owner.y + Math.sin(shot.angle) * shot.orbit
          }
          break
        case 'aura':
          shot.x = owner.x
          shot.y = owner.y
          break
        case 'homing': {
          const target = this.targets({ ...owner, x: shot.x, y: shot.y } as Player, 1, 260)[0]
          if (target) {
            const want = Math.atan2(target.y - shot.y, target.x - shot.x)
            let diff = want - shot.angle
            diff = Math.atan2(Math.sin(diff), Math.cos(diff))
            shot.angle += Math.max(-4 * dt, Math.min(4 * dt, diff))
            const speed = Math.hypot(shot.vx, shot.vy)
            shot.vx = Math.cos(shot.angle) * speed
            shot.vy = Math.sin(shot.angle) * speed
          }
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          break
        }
        case 'bounce': {
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          // Walls are the owner's own screen edges, so the ball stays fully visible on any aspect ratio.
          const screen = this.inputs.get(owner.id)
          const margin = Math.max(20, shot.r)
          const wallX = Math.max(0, (screen?.viewX ?? VIEW_HALF.x) - margin)
          const wallY = Math.max(0, (screen?.viewY ?? VIEW_HALF.y) - margin)
          if (Math.abs(shot.x - owner.x) > wallX) {
            const side = Math.sign(shot.x - owner.x)
            shot.vx = -side * Math.abs(shot.vx)
            shot.x = owner.x + side * wallX
          }
          if (Math.abs(shot.y - owner.y) > wallY) {
            const side = Math.sign(shot.y - owner.y)
            shot.vy = -side * Math.abs(shot.vy)
            shot.y = owner.y + side * wallY
          }
          shot.angle += dt * 10
          break
        }
        case 'arc':
          shot.vy += 900 * dt
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          shot.angle += dt * 9
          break
        case 'whip':
        case 'flail':
        case 'zone':
        case 'strike':
        case 'rain':
        case 'chain':
        case 'slam':
        case 'trail':
        case 'garden':
          break
        case 'beam':
          shot.x = owner.x + Math.cos(shot.angle) * shot.w
          shot.y = owner.y + Math.sin(shot.angle) * shot.w
          break
        case 'nova':
          shot.x = owner.x
          shot.y = owner.y
          shot.r = 10 + (shot.w - 10) * (1 - shot.life / shot.maxLife)
          break
        case 'boomerang': {
          shot.aux += dt
          const out = shot.maxLife * 0.42
          if (shot.aux < out) {
            const slowing = 1 - shot.aux / out
            shot.x += shot.vx * slowing * dt
            shot.y += shot.vy * slowing * dt
          } else {
            const dx = owner.x - shot.x
            const dy = owner.y - shot.y
            const d = Math.hypot(dx, dy)
            const speed = Math.min(720, 120 + (shot.aux - out) * 700)
            if (d < 22) continue
            shot.x += (dx / d) * Math.min(d, speed * dt)
            shot.y += (dy / d) * Math.min(d, speed * dt)
          }
          shot.angle += dt * 14
          break
        }
        case 'pet':
          this.movePet(shot, owner, dt)
          break
        case 'observe':
          this.moveObservation(shot, owner, dt)
          break
        case 'raid': {
          // Out and back along one line from the owner; the flying kick lands a wider blow than the run.
          const t = 1 - shot.life / shot.maxLife
          const d = shot.orbit * raidReach(t)
          shot.x = owner.x + Math.cos(shot.angle) * d
          shot.y = owner.y + Math.sin(shot.angle) * d
          shot.r = shot.w * (t >= RAID.kick && t < RAID.back ? 1.6 : 1)
          break
        }
        case 'mine':
          if (shot.aux > 0) {
            shot.aux -= dt
            shot.v = 0
          } else {
            shot.v = 1
            if (this.mineTouched(shot)) {
              this.burst(shot, owner)
              continue
            }
          }
          break
        default:
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
      }
      if (shot.weapon === 'p_over' || this.collide(shot, owner)) kept.push(shot)
      else if (shot.weapon === 'p_free') this.burst(shot, owner)
    }
    this.guardianPass = false
    this.guardiansMoved.clear()
    state.shots = kept
  }

  private moveObservation(shot: Shot, owner: Player, dt: number) {
    {
      const targets: Enemy[] = []
      this.near(shot.x, shot.y, shot.r, (enemy) => {
        if (enemy.hp > 0 && Math.hypot(enemy.x - shot.x, enemy.y - shot.y) <= shot.r) targets.push(enemy)
      })
      targets.sort(
        (first, second) =>
          (first.x - shot.x) ** 2 + (first.y - shot.y) ** 2 - (second.x - shot.x) ** 2 - (second.y - shot.y) ** 2
      )
      shot.targets = targets.slice(0, shot.w)
    }
    for (const enemy of shot.targets) {
      if (enemy.hp <= 0 || !this.state.enemies.includes(enemy)) continue
      const dx = shot.x - enemy.x
      const dy = shot.y - enemy.y
      const distance = Math.hypot(dx, dy)
      if (distance > shot.r) continue
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const pull = Math.min(distance, OBSERVATION_PULL_SPEED * this.knockScale(enemy, def) * dt)
      enemy.x += (dx / (distance || 1)) * pull
      enemy.y += (dy / (distance || 1)) * pull
      enemy.slow = Math.max(enemy.slow, 0.12)
      if ((shot.hits.get(enemy.id) ?? -1) <= this.state.time) {
        shot.hits.set(enemy.id, this.state.time + shot.tick)
        this.damage(enemy, def, shot, owner)
      }
    }
  }

  /**
   * Moves 過保護親 `shot` of `owner` on by `dt`: where she heads for (her place in the formation, at the shoulder or
   * beside the standing child, guardianBlend) and then, from where she stood, the last part every parent shares: no
   * faster than GUARDIAN_SPEED, round below the child rather than through her (guardianStep), and GUARDIAN_GAP clear of
   * the parents before her in her line (guardianKeepApart).
   */
  private stepGuardian(shot: Shot, owner: Player, dt: number, line = this.guardianLine(shot)) {
    const targetHeading = Math.atan2(owner.fy, owner.fx)
    const heading = shot.guardianHeading ?? targetHeading
    const difference = Math.atan2(Math.sin(targetHeading - heading), Math.cos(targetHeading - heading))
    shot.guardianHeading = heading + difference * (1 - Math.exp(-8 * dt))
    const forwardX = Math.cos(shot.guardianHeading)
    const forwardY = Math.sin(shot.guardianHeading)
    const still =
      (shot.guardianStill ?? 0) + (Number(owner.still > 0) - (shot.guardianStill ?? 0)) * (1 - Math.exp(-12 * dt))
    shot.guardianStill = Math.abs(still - Math.round(still)) < 0.01 ? Math.round(still) : still
    shot.guardianSide = guardianTargetSide(forwardX, shot.guardianSide ?? 1)
    const size = this.bodySize(owner)
    const walk = this.guardianWalk(shot, owner, forwardX, forwardY, shot.guardianSide, line)
    // Her place beside the standing child (she glides there in the last part of her step); walking, it counts for
    // nothing (and is found again as the child stops).
    shot.guardianRest = shot.guardianStill > 0 ? this.guardianRestSpot(shot, owner) : undefined
    // (Her shield's reach is centred from the blend of the two, as it always was; see shieldTouches.)
    shot.guardianAim = guardianBlend(walk, shot.guardianRest ?? walk, shot.guardianStill, forwardY, size)
    // She heads for her place beside the child while the child (mostly) stands, and for her place walking once the
    // child (mostly) walks, so a step or two on the spot does not send her round the child and back.
    const aim = shot.guardianRest && shot.guardianStill > GUARDIAN_STAND ? shot.guardianRest : shot.guardianAim
    const last = shot.guardianOffset
    // (A hair under, so rounding never takes her past it.)
    let most = Math.max(0, GUARDIAN_SPEED * dt - 1e-6)
    const duck = guardianDuck(forwardY, shot.guardianStill)
    const others = line
      .filter((other) => other !== shot)
      .map((other) => other.guardianOffset ?? { x: other.x - owner.x, y: other.y - owner.y })
    // She heads for the nearest place to her aim clear of the parents before her, so she settles there.
    const blocks = this.guardianBlocks(owner)
    const scale = shot.r / 20
    // Standing where the family has just come to walk (the child turned), she steps off them as fast as she dodges.
    const dodging =
      last !== undefined && this.familyOut(owner) && guardianInBlock(last, blocks.slice(0, owner.hasChild ? 2 : 1))
    if (dodging) most = Math.max(most, Math.min(GUARDIAN_DODGE, (GUARDIAN_DODGE / STEP) * dt) - 1e-6)
    // While she gambles, the badge floats over either side of her head.
    const badge = owner.weapons.some((weapon) => weapon.id === 'w_gamble')
    // (The same as last time for the same aim, place, parents before her and obstacles.)
    const ask = [aim.x, aim.y, last?.x ?? NaN, last?.y ?? NaN, size, duck > 0.5 ? 1 : 0, badge ? 1 : 0]
    for (const o of others) ask.push(o.x, o.y)
    for (const b of blocks) ask.push(b.left, b.top, b.right, b.bottom)
    const settled = this.guardianSettled.get(shot)
    const fresh =
      settled && settled.ask.length === ask.length && settled.ask.every((v, i) => Object.is(v, ask[i]))
        ? settled.fresh
        : guardianSettle(aim, last, others, size, duck, blocks, badge, scale)
    // Settling for somewhere else than her aim, she keeps to the place she settled for while her aim stays put and
    // the place stays clear, rather than turning back and forth between two on her way.
    const kept =
      Math.hypot(fresh.x - aim.x, fresh.y - aim.y) > GUARDIAN_GRAZE &&
      settled &&
      Math.hypot(settled.ask[0] - aim.x, settled.ask[1] - aim.y) < GUARDIAN_GRAZE &&
      guardianSettle(settled.goal, undefined, others, size, duck, blocks, badge, scale) === settled.goal
    const goal = kept ? settled.goal : fresh
    this.guardianSettled.set(shot, { ask, fresh, goal })
    // On her way she goes round all the others (those after her in her line where they stand now), so she never
    // runs into one who is to give way only to her.
    const around = this.state.shots
      .filter((other) => other !== shot && other.weapon === 'p_over' && other.owner === shot.owner && other.delay <= 0)
      .map((other) => other.guardianOffset ?? { x: other.x - owner.x, y: other.y - owner.y })
    // And round the child's resting pets near her, if one runs across her way (they keep clear of her, but one on its
    // way to a new spot may cross it).
    const pets: OverheadBox[] = []
    if (last)
      for (const pet of this.state.shots)
        if (pet.owner === shot.owner && pet.weapon === 'w_pet' && pet.delay <= 0 && !pet.target) {
          const x = pet.x - owner.x
          const y = pet.y - owner.y
          if (Math.hypot(x - last.x, y - last.y) <= GUARDIAN_PET_NEAR)
            pets.push({
              left: x - GUARDIAN_PET.x,
              top: y - GUARDIAN_PET.up,
              right: x + GUARDIAN_PET.x,
              bottom: y + GUARDIAN_PET.down
            })
        }
    // (Round the family, her shield too keeps off them; but not round the one beside her place, which she faces away
    // from standing there.)
    const wide = this.familyOut(owner) ? this.guardianBlocks(owner, scale) : blocks
    const routeBlocks = wide.map((box, i) =>
      goal.x > box.left && goal.x < box.right && goal.y > box.top && goal.y < box.bottom ? blocks[i] : box
    )
    // (As guardianStep: her way there, and how far along it she goes this step.)
    const way =
      last && most > 0
        ? guardianWay(last, goal, duck, size, line.length - 1, around, [...routeBlocks, ...pets], badge, scale)
        : undefined
    let next = last ? (way ? guardianAlong(last, way, most) : { ...last }) : goal
    // Going against the way she faces beside her standing child (back to her place, say), she steps back no faster
    // than GUARDIAN_BACK_SPEED; but not as she dodges, nor out of what she keeps out of round the child, nor with
    // another parent of the child within GUARDIAN_BACK_ROOM (who would catch her up and stand over her). (Walking with
    // the child, she goes over the ground as the child goes: slower, she would only fall behind.)
    const was = shot.guardianGround
    if (
      last &&
      way &&
      was &&
      dt > 0 &&
      owner.still > 0 &&
      !dodging &&
      guardianBoxReach(last, guardianChildBox(size, scale)) >= 1 &&
      around.every((o) => Math.hypot(o.x - last.x, o.y - last.y) >= GUARDIAN_BACK_ROOM)
    ) {
      const gx = (owner.x + next.x - was.x) / dt
      const back = Math.max(0, GUARDIAN_BACK_SPEED * dt - 1e-6)
      if (Math.abs(gx) >= GUARDIAN_BACK_ACROSS && gx < 0 !== Math.cos(shot.guardianFace ?? 0) < 0 && back < most) {
        // (Only where that keeps her clear of the others as it is: hemmed in, she goes on as before.)
        const slow = guardianAlong(last, way, back)
        const kept = guardianKeepApart(slow, last, others, back, size, duck, blocks, badge, scale)
        if (Math.hypot(kept.x - slow.x, kept.y - slow.y) < 1e-6) next = slow
      }
    }
    const at = guardianKeepApart(next, last, others, most, size, duck, blocks, badge, scale)
    shot.x = owner.x + at.x
    shot.y = owner.y + at.y
    shot.guardianOffset = at
    // Where she will be over the next GUARDIAN_FACE_HOLD, going on as fast as she may: on her way to her place beside
    // the child once the child has stopped, or to her place walking once the child walks (though her goal may still
    // lie between the two as the child comes to stand or sets off); on her way to her goal, should that way to her
    // place go through the child; nowhere, should that way too (as one does from inside what she keeps out of).
    const settling = Boolean(shot.guardianRest) && owner.still > 0
    // (Walking, where she will walk once she has turned with the child.)
    const place =
      settling && shot.guardianRest
        ? shot.guardianRest
        : this.guardianWalk(
            shot,
            owner,
            Math.cos(targetHeading),
            Math.sin(targetHeading),
            guardianTargetSide(Math.cos(targetHeading), shot.guardianSide),
            line
          )
    const step = (GUARDIAN_SPEED * GUARDIAN_FACE_HOLD) / GUARDIAN_FACE_STEPS
    const box = guardianChildBox(size, scale)
    const through = (points: readonly { x: number; y: number }[]) =>
      points.some((p) => guardianBoxReach(p, box) < GUARDIAN_FACE_THROUGH)
    let there = Math.hypot(place.x - goal.x, place.y - goal.y) <= GUARDIAN_GRAZE
    let soon: { x: number; y: number }[] = []
    let blind = false
    if (!there && last) {
      soon = guardianSamples(
        at,
        guardianWay(at, place, duck, size, line.length - 1, around, [...routeBlocks, ...pets], badge, scale),
        0,
        step
      )
      if (through(soon)) there = blind = true
    }
    if (there) soon = way && last ? guardianSamples(last, way, most, step) : []
    if (through(soon)) {
      soon = []
      blind = true
    }
    // (Not knowing her way round the child to the other side, she keeps facing out from her until she knows it.)
    const wary = blind && Math.abs(at.x) > 4 && Math.sign(place.x) !== Math.sign(at.x)
    this.faceGuardian(shot, at, last, dt, owner, there ? goal : place, soon, settling, wary)
    this.paceGuardian(shot)
    if (this.guardianPass) this.guardiansMoved.add(shot)
  }

  /**
   * How 過保護親 `shot` (now `at` from her child, `last` before, heading for `goal`, and `soon` where she will be over
   * the next GUARDIAN_FACE_HOLD) is drawn after a step of `dt`: walking while she goes over the ground
   * (GUARDIAN_WALK_ON), facing the way she goes (and out to her side while she goes up or down the screen) as she
   * walks with her child or over to a place further off (GUARDIAN_FACE_TURN) on the child's other side; standing
   * beside a standing child (even as the child takes a step or two), facing out from her, and on her way to her place
   * beside the child (`settling`) on the side she is on, facing out to that side; otherwise the way she faced.
   * Wherever she faces, she faces the way that holds less of her shield over the child, what is over her head and her
   * family, now and on her way soon; and she keeps to the side she faces for GUARDIAN_FACE_HOLD before she turns to
   * the other (GUARDIAN_FACE_LEAST to take her shield off them).
   */
  private faceGuardian(
    shot: Shot,
    at: { x: number; y: number },
    last: { x: number; y: number } | undefined,
    dt: number,
    owner: Player,
    goal: { x: number; y: number },
    soon: readonly { x: number; y: number }[] = [],
    settling = false,
    wary = false
  ) {
    const was = shot.guardianGround
    shot.guardianGround = { x: shot.x, y: shot.y }
    if (!was || dt <= 0) {
      // Just out: facing out from the child (the way she walks, a little out to her own side).
      if (Math.abs(at.x) > 4)
        shot.guardianFace =
          (shot.guardianStill ?? 0) >= 0.5
            ? at.x > 0
              ? 0
              : Math.PI
            : Math.atan2(owner.fy, Math.sign(at.x) * Math.max(Math.abs(owner.fx), GUARDIAN_FACE_SIDE))
      return
    }
    shot.guardianTurned = (shot.guardianTurned ?? GUARDIAN_FACE_HOLD) + dt
    const vx = (shot.x - was.x) / dt
    const vy = (shot.y - was.y) / dt
    const speed = Math.hypot(vx, vy)
    const ease = 1 - Math.exp(-dt / GUARDIAN_FACE_DRIFT)
    const drift = shot.guardianDrift ?? { x: vx, y: vy }
    drift.x += (vx - drift.x) * ease
    drift.y += (vy - drift.y) * ease
    shot.guardianDrift = drift
    if (speed >= GUARDIAN_WALK_ON) {
      shot.guardianWalking = true
      shot.guardianSlow = 0
    } else if (speed < GUARDIAN_WALK_OFF) {
      shot.guardianSlow = (shot.guardianSlow ?? 0) + dt
      if (shot.guardianSlow >= GUARDIAN_WALK_HOLD) shot.guardianWalking = false
    }
    // Bashing, she faces the enemy she bashes (see moveGuardian).
    if (shot.aux > 0 && shot.guardianFace === shot.angle && this.guardianBashClear(shot, owner, at)) return
    const boxes = this.guardianShieldBoxes(owner)
    const now = shot.guardianFace ?? 0
    const side = Math.cos(now) < 0 ? -1 : 1
    const out = Math.abs(at.x) > 4 ? Math.sign(at.x) : side
    const standing = (shot.guardianStill ?? 0) >= 0.5
    // (Going over to a new place beside her child, or walking with the child; not standing by her as she shuffles.)
    const moving = last ? Math.hypot(at.x - last.x, at.y - last.y) / dt >= GUARDIAN_WALK_OFF : false
    // How much of her shield, facing `way`, lies over the child, what is over her head and her family, where she is
    // and on her way soon, all told (what lies further on counting for less, GUARDIAN_FACE_FADE a step), with
    // GUARDIAN_FACE_PAD px to spare, and what lies over the child herself counting GUARDIAN_FACE_CHILD times.
    const over = (way: number) =>
      soon.reduce(
        (sum, p, k) =>
          sum +
          this.guardianCovered(shot, owner, p, way, boxes, GUARDIAN_FACE_PAD, GUARDIAN_FACE_CHILD) *
            GUARDIAN_FACE_FADE ** (k + 1),
        this.guardianCovered(shot, owner, at, way, boxes, GUARDIAN_FACE_PAD, GUARDIAN_FACE_CHILD)
      )
    // Facing `way` (or `other`, if less of her shield lies over them that way).
    const rather = (way: number, other: number) => {
      const keep = over(way)
      return keep > 0 && over(other) < keep ? other : way
    }
    const facing = (sign: number) => (sign > 0 ? 0 : Math.PI)
    let face: number
    if (shot.guardianWalking && speed > 1 && (moving || !standing)) {
      // The way she goes over the ground, of late (not the way a step aside to keep clear of another took her).
      // (Which side she goes to, by the way she has gone of late, but up or down the screen as she goes now.)
      const going = Math.hypot(drift.x, drift.y)
      const to = Math.abs(drift.x) >= GUARDIAN_FACE_SIDE * going ? Math.sign(drift.x) : out
      const across = to * Math.max(Math.abs(vx), GUARDIAN_FACE_SIDE * speed)
      const wy = vy
      // She faces the way she goes only on her way to a place further off: on the child's other side, if the child
      // stands.
      const off = Math.hypot(goal.x - at.x, goal.y - at.y)
      const far = off > ((across < 0 ? -1 : 1) === side ? GUARDIAN_FACE_KEEP : GUARDIAN_FACE_TURN)
      const there = Math.abs(goal.x) > 4 ? Math.sign(goal.x) : out
      if (settling && !far) face = rather(facing(there), facing(-there))
      else if (standing && !far) face = rather(facing(out), facing(-out))
      else if (wary) face = rather(Math.atan2(wy, out * Math.abs(across)), Math.atan2(wy, -out * Math.abs(across)))
      else face = rather(Math.atan2(wy, across), Math.atan2(wy, -across))
    } else if (standing) face = facing(out)
    else return
    // She keeps to the side she faces for a while, unless her shield lies over the child (or what is over her head,
    // or her family) there and would lie over none of them the other way (to spare), now or on her way soon; but not at
    // once.
    if ((Math.cos(face) < 0 ? -1 : 1) !== side) {
      if (
        shot.guardianTurned < GUARDIAN_FACE_LEAST - 1e-6 ||
        (shot.guardianTurned < GUARDIAN_FACE_HOLD - 1e-6 &&
          !(
            this.guardianCovered(shot, owner, at, now, boxes) > 0 &&
            [at, ...soon].every((p) => this.guardianCovered(shot, owner, p, face, boxes) === 0)
          ))
      )
        return
      shot.guardianTurned = 0
    }
    shot.guardianFace = face
  }

  /**
   * How 過保護親 `shot` walks, for the view (GUARD_WALK bits): stepping back while she goes against the way she faces
   * (GUARDIAN_BACK_ACROSS), fast from GUARDIAN_WALK_FAST px/s over the ground, otherwise at a walk.
   */
  private paceGuardian(shot: Shot) {
    const drift = shot.guardianDrift
    if (!shot.guardianWalking || !drift) {
      shot.guardianPace = undefined
      return
    }
    const back = Math.abs(drift.x) >= GUARDIAN_BACK_ACROSS && drift.x < 0 !== Math.cos(shot.guardianFace ?? 0) < 0
    shot.guardianPace = back ? 'back' : Math.hypot(drift.x, drift.y) >= GUARDIAN_WALK_FAST ? 'fast' : 'walk'
  }

  /**
   * How much of 過保護親 `shot`'s shield, at `at` from her child `owner` facing `face`, lies over the child, what is over
   * her head or her family (`boxes`, guardianShieldBoxes; see guardianShieldOn); bashing, also where the renderer
   * thrusts it out that way (GUARDIAN_THRUST).
   */
  private guardianCovered(
    shot: Shot,
    owner: Player,
    at: { x: number; y: number },
    face: number,
    boxes = this.guardianShieldBoxes(owner),
    pad = 0,
    child = 1
  ) {
    const scale = shot.r / 20
    const size = this.bodySize(owner)
    const reach = shot.aux > 0 ? GUARDIAN_THRUST * scale : 0
    return (
      guardianShieldOn(boxes, scale, size, at, face, pad, child) +
      (reach
        ? guardianShieldOn(
            boxes,
            scale,
            size,
            { x: at.x + Math.cos(face) * reach, y: at.y + Math.sin(face) * reach },
            face,
            pad,
            child
          )
        : 0)
    )
  }

  /**
   * Whether 過保護親 `shot`, at `at` from her child `owner`, may turn her shield to the enemy she bashes (`angle`): not
   * standing beside the child with the enemy on the child's side of her, and her shield, held and thrust out
   * (GUARDIAN_THRUST) that way, nowhere over the child, what is over her head or her family.
   */
  private guardianBashClear(shot: Shot, owner: Player, at: { x: number; y: number }) {
    const side = Math.sign(at.x)
    if ((shot.guardianStill ?? 0) >= 0.5 && side && Math.cos(shot.angle) * side < 0) return false
    const scale = shot.r / 20
    const reach = GUARDIAN_THRUST * scale
    const thrust = { x: at.x + Math.cos(shot.angle) * reach, y: at.y + Math.sin(shot.angle) * reach }
    const boxes = this.guardianShieldBoxes(owner)
    const size = this.bodySize(owner)
    return (
      guardianShieldOn(boxes, scale, size, at, shot.angle) === 0 &&
      guardianShieldOn(boxes, scale, size, thrust, shot.angle) === 0
    )
  }

  /**
   * What 過保護親's shields keep off round her child `owner` (offsets from her): first the child's drawn body
   * (childDrawnBox), then what is drawn over her head and, walking behind a married child, her family.
   */
  private guardianShieldBoxes(owner: Player): OverheadBox[] {
    const size = this.bodySize(owner)
    const boxes: OverheadBox[] = [
      childDrawnBox(size, GUARDIAN_DRAWN),
      ...overheadBoxes(
        size,
        OVERHEAD.rows,
        owner.weapons.some((weapon) => weapon.id === 'w_gamble')
      )
    ]
    if (this.familyOut(owner)) {
      const back = owner.fx < 0 ? 1 : -1
      for (const slot of FAMILY_SLOTS.slice(0, owner.hasChild ? 2 : 1))
        boxes.push({
          left: back * slot.dx - FAMILY_BODY.x,
          top: slot.dy + FAMILY_BODY.top,
          right: back * slot.dx + FAMILY_BODY.x,
          bottom: slot.dy + FAMILY_BODY.bottom
        })
    }
    return boxes
  }

  /**
   * The boxes (offsets from `owner`) a parent of hers keeps her centre out of (GUARDIAN_BODY round each): the family
   * walking behind a married child (FAMILY_SLOTS) and, while the child stands, 生き物観察's creatures, so none walks
   * over them on her way; and (GUARDIAN_OVERLAP round each) the parents of the players near her before her.
   */
  private guardianBlocks(owner: Player, shield?: number): OverheadBox[] {
    const blocks: OverheadBox[] = []
    if (this.familyOut(owner)) {
      const back = owner.fx < 0 ? 1 : -1
      // On her way (with her `shield`, held the way she goes) her shield keeps off the family as her figure does.
      const s = shield ?? 0
      const across = Math.max(GUARDIAN_BODY.x, GUARDIAN_SHIELD_ART.far * s)
      const above = Math.max(GUARDIAN_BODY.y, GUARDIAN_SHIELD_ART.bottom * s)
      const below = Math.max(GUARDIAN_BODY.y, -GUARDIAN_SHIELD_ART.top * s)
      for (const slot of FAMILY_SLOTS.slice(0, owner.hasChild ? 2 : 1))
        blocks.push({
          left: back * slot.dx - FAMILY_BODY.x - across,
          top: slot.dy + FAMILY_BODY.top - above,
          right: back * slot.dx + FAMILY_BODY.x + across,
          bottom: slot.dy + FAMILY_BODY.bottom + below
        })
    }
    // The parents of a player before her (they never give way to hers): her parents' centres keep out of theirs.
    const earlier = new Set<string>()
    for (const other of this.state.players) {
      if (other === owner) break
      if (!other.downed && Math.hypot(other.x - owner.x, other.y - owner.y) <= GUARDIAN_NEIGHBOUR_REACH)
        earlier.add(other.id)
    }
    if (earlier.size)
      for (const guard of this.state.shots)
        if (guard.weapon === 'p_over' && guard.delay <= 0 && earlier.has(guard.owner))
          blocks.push(boxAbout(guard.x - owner.x, guard.y - owner.y, GUARDIAN_OVERLAP))
    if (owner.still > 0)
      for (const creature of this.state.shots)
        if (creature.weapon === 'w_observe' && creature.delay <= 0 && creature.life > 0)
          blocks.push(
            boxAbout(creature.x - owner.x, creature.y - owner.y, {
              x: CREATURE_BODY.x + GUARDIAN_BODY.x,
              y: CREATURE_BODY.y + GUARDIAN_BODY.y
            })
          )
    return blocks
  }

  private moveGuardian(shot: Shot, owner: Player, dt: number) {
    if (!this.guardiansMoved.has(shot)) {
      // In a step of the game, the parents before her in her line move first: she keeps clear of where they now are.
      const line = this.guardianLine(shot)
      if (this.guardianPass)
        line.forEach((before, i) => {
          if (before !== shot && !this.guardiansMoved.has(before))
            this.stepGuardian(before, owner, dt, line.slice(0, i + 1))
        })
      this.stepGuardian(shot, owner, dt, line)
    }
    shot.aux = Math.max(0, shot.aux - dt)
    if (shot.aux > 0) return
    shot.angle = Math.atan2(owner.fy, owner.fx)
    let target: Enemy | undefined
    let distance = Infinity
    this.near(owner.x, owner.y, shot.orbit + shot.r + PLAYER_RADIUS, (enemy) => {
      const dx = enemy.x - shot.x
      const dy = enemy.y - shot.y
      const d = dx * dx + dy * dy
      const radius = ENEMY_BY_ID.get(enemy.kind)!.radius * enemy.scale
      const overlappingAlly = this.state.players.some(
        (player) =>
          !player.downed &&
          Math.hypot(player.x - owner.x, player.y - owner.y) <= shot.orbit &&
          Math.hypot(enemy.x - player.x, enemy.y - player.y) <= playerRadius(player) + radius
      )
      const closeReach = PLAYER_RADIUS + GUARDIAN_CLOSE_REACH * (shot.r / 20) + radius
      const close = (enemy.x - owner.x) ** 2 + (enemy.y - owner.y) ** 2 <= closeReach * closeReach
      if ((overlappingAlly || close || this.shieldTouches(shot, enemy.x, enemy.y, radius)) && d < distance) {
        target = enemy
        distance = d
      }
    })
    if (!target) return
    const enemy: Enemy = target
    const dx = enemy.x - shot.x
    const dy = enemy.y - shot.y
    if (dx || dy) shot.angle = Math.atan2(dy, dx)
    shot.aux = shot.tick
    // She turns her shield to the enemy where she may (guardianBashClear), if her shield reaches it (the renderer
    // thrusts it out at the enemy) and she has faced the way she faces for long enough to turn (GUARDIAN_FACE_HOLD).
    const scale = shot.r / 20
    const at = shot.guardianOffset ?? { x: shot.x - owner.x, y: shot.y - owner.y }
    const reaches = Math.hypot(dx, dy) <= (GUARDIAN_SHIELD_ART.far + GUARDIAN_THRUST) * scale + GUARDIAN_STRIKE_SLACK
    const turns = Math.cos(shot.angle) < 0 !== Math.cos(shot.guardianFace ?? 0) < 0
    const shield =
      reaches &&
      (!turns || (shot.guardianTurned ?? GUARDIAN_FACE_HOLD) >= GUARDIAN_FACE_HOLD - 1e-6) &&
      this.guardianBashClear(shot, owner, at)
    if (shield) {
      if (turns) shot.guardianTurned = 0
      shot.guardianFace = shot.angle
    }
    // Within her all-round reach of the child, the ring round the child lights up towards it (where her shield does
    // not strike it).
    const ring = shot.orbit * 0.65 + 7 * scale
    const radius = ENEMY_BY_ID.get(enemy.kind)!.radius * enemy.scale
    if (Math.hypot(enemy.x - owner.x, enemy.y - owner.y) <= ring + radius)
      this.emit(FX.GUARD, enemy.x, enemy.y, this.playerIndex(owner), guardBits(shield, shot.tick, shot.r))
    this.emit(FX.FIRE, shot.x, shot.y, WEAPON_INDEX.get(shot.weapon)!, this.playerIndex(owner))
    this.damage(enemy, ENEMY_BY_ID.get(enemy.kind)!, shot, owner)
  }

  private movePet(shot: Shot, owner: Player, dt: number) {
    shot.aux -= dt
    if (shot.aux <= 0 || (shot.target && shot.target.hp <= 0)) {
      shot.aux = 0.2
      let best: Enemy | undefined
      let distance = Infinity
      let lastHit = Infinity
      let occupied = Infinity
      const chasers = new Map<Enemy, number>()
      if (shot.weapon === 'w_pet' || shot.weapon === 'p_monster')
        for (const other of this.state.shots)
          if (other !== shot && other.owner === shot.owner && other.weapon === shot.weapon && other.target)
            chasers.set(other.target, (chasers.get(other.target) ?? 0) + 1)
      this.near(owner.x, owner.y, 300, (enemy) => {
        if (Math.hypot(enemy.x - owner.x, enemy.y - owner.y) > 300) return
        const d = (enemy.x - shot.x) ** 2 + (enemy.y - shot.y) ** 2
        const hit = shot.weapon === 'w_pet' ? (shot.hits.get(enemy.id) ?? -Infinity) : 0
        const count = chasers.get(enemy) ?? 0
        if (hit < lastHit || (hit === lastHit && (count < occupied || (count === occupied && d < distance)))) {
          lastHit = hit
          occupied = count
          distance = d
          best = enemy
        }
      })
      shot.target = best
    }
    const target = shot.target
    const fromX = shot.x
    const fromY = shot.y
    if (target) {
      shot.relocating = false
      // Pets after the first on one enemy bite it from their own side, around it, not on top of one another.
      const contact = shot.weapon === 'w_pet' ? this.petContact(shot, owner, target) : target
      const dx = contact.x - shot.x
      const dy = contact.y - shot.y
      const d = Math.hypot(dx, dy)
      // A pet keeps right on its place round the enemy (no dead zone, so it never lurches after a walking enemy);
      // the monster parent stops within 4 px of its target's centre.
      if (d > (contact === target ? 4 : 0.5)) {
        const step = Math.min(d, shot.spin * dt)
        shot.x += (dx / d) * step
        shot.y += (dy / d) * step
      }
      if (d > 8) shot.angle = Math.atan2(dy, dx)
      else if (contact !== target && (target.x !== shot.x || target.y !== shot.y))
        shot.angle = Math.atan2(target.y - shot.y, target.x - shot.x)
      const reach = shot.r + (ENEMY_BY_ID.get(target.kind)?.radius ?? 12) * target.scale + 6
      shot.v = Math.hypot(target.x - fromX, target.y - fromY) < reach ? 1 : 0
    } else {
      // With nothing to chase the dog trots back to its spot beside the owner.
      const rest =
        shot.weapon === 'w_pet' && shot.restSpot !== undefined
          ? PET_SPOTS[shot.restSpot]
          : this.petBase(shot.weapon, shot.sourceWeapon, shot.orbit, shot.h)
      const dx = owner.x + rest.x - shot.x
      const dy = owner.y + rest.y - shot.y
      const d = Math.hypot(dx, dy)
      if (d > 0.5) {
        // Following (or settling) it keeps up every step and stops right on its spot, so it never trails back and
        // forth behind a walking owner; it faces the way it moves and keeps its last facing once it stands. Pushed off
        // its spot (see assignPetSpots), it hurries to the new one.
        const step = Math.min(d, shot.spin * (shot.relocating ? PET_RELOCATE_SPEED : 1) * dt)
        // On its way to a new spot it waits rather than run into 過保護親 (she goes round it).
        const into = (x: number, y: number) =>
          this.state.shots.some(
            (guard) =>
              guard.weapon === 'p_over' &&
              guard.owner === shot.owner &&
              guard.delay <= 0 &&
              Math.abs(x - guard.x) < PET_GUARDIAN_WAIT.x &&
              y - guard.y > -PET_GUARDIAN_WAIT.up &&
              y - guard.y < PET_GUARDIAN_WAIT.down
          )
        const nextX = shot.x + (dx / d) * step
        const nextY = shot.y + (dy / d) * step
        const wait = shot.relocating && shot.weapon === 'w_pet' && into(nextX, nextY) && !into(shot.x, shot.y)
        if (!wait) {
          shot.x = nextX
          shot.y = nextY
        }
        if (step > PET_STILL_STEP) shot.angle = Math.atan2(dy, dx)
        if (step >= d) shot.relocating = false
      } else shot.relocating = false
      shot.v = 0
    }
    shot.petStill = Math.hypot(shot.x - fromX, shot.y - fromY) > PET_STILL_STEP ? 0 : (shot.petStill ?? 0) + dt
  }

  /**
   * Where pet `shot` bites `target`. The first of its owner's pets on that enemy (by id) bites from the side it comes
   * from; the next ones take places round the enemy (PET_CHASE_TURNS) from the first one's side, so they keep their
   * places however the enemy and the child move about each other. All of them touch it, close enough to bite.
   */
  private petContact(shot: Shot, owner: Player, target: Enemy) {
    let k = 0
    let first = shot
    for (const other of this.state.shots)
      if (
        other.id < shot.id &&
        other.target === target &&
        other.owner === shot.owner &&
        other.weapon === 'w_pet' &&
        other.delay <= 0
      ) {
        k++
        if (other.id < first.id) first = other
      }
    let angle: number
    if (Math.hypot(first.x - target.x, first.y - target.y) > PET_CHASE_CENTRED)
      angle = Math.atan2(first.y - target.y, first.x - target.x)
    else if (owner.x !== target.x || owner.y !== target.y) angle = Math.atan2(owner.y - target.y, owner.x - target.x)
    else angle = first.angle + Math.PI
    angle += PET_CHASE_TURNS[k % PET_CHASE_TURNS.length]
    const reach = (ENEMY_BY_ID.get(target.kind)?.radius ?? 12) * target.scale + shot.r - 4
    return { x: target.x + Math.cos(angle) * reach, y: target.y + Math.sin(angle) * reach }
  }

  /** Where (offset from the owner) an idle pet rests without a spot: PET_REST_RADIUS out along petRestAngle. */
  private petBase(weapon: string, source: string, orbit: number, h: number) {
    const angle = petRestAngle(weapon, source, orbit, h)
    return { x: Math.cos(angle) * PET_REST_RADIUS, y: Math.sin(angle) * PET_REST_RADIUS }
  }

  /**
   * The other companions a resting pet of `owner` keeps clear of, as offsets from the owner: each 過保護親 where she
   * stands, where she will be in PET_GUARDIAN_LOOKAHEAD and where she is heading, モンスターペアレント, 生き物観察's
   * creatures, and the spouse and child walking behind a married player (FAMILY_SLOTS, whenever the renderer draws
   * them) — the owner's own and every other living player's — and the other living players' bodies; the gamble badge
   * over either side of the owner's head while she gambles; and the spots the pets of the players before her in
   * `state.players` rest on (they never give way to hers, so no two keep pushing each other off).
   * `hold` blocks a pet's own spot; `avoid`, for a pet choosing a new one, adds points along each 過保護親's swing, so
   * a pet moved on is not pushed off again by the same swing; `now` is only where each of them stands now.
   */
  private petObstacles(owner: Player) {
    const hold: PetObstacle[] = []
    const avoid: PetObstacle[] = []
    const now: PetObstacle[] = []
    const guardian = PET_CLEAR_GUARDIAN
    const creature = PET_CLEAR_CREATURE
    let baseX = 0
    let baseY = 0
    const both = (x: number, y: number, bx: number, by: number, current = true) => {
      hold.push({ x: baseX + x, y: baseY + y, bx, by })
      avoid.push({ x: baseX + x, y: baseY + y, bx, by })
      if (current) now.push({ x: baseX + x, y: baseY + y, bx, by })
    }
    const players = new Map(this.state.players.map((player) => [player.id, player]))
    let earlier = true
    for (const player of this.state.players) {
      if (player === owner) {
        earlier = false
        continue
      }
      if (player.downed) continue
      const x = player.x - owner.x
      const y = player.y - owner.y
      both(x + PET_CLEAR_PLAYER.x, y + PET_CLEAR_PLAYER.y, PET_CLEAR_PLAYER.bx, PET_CLEAR_PLAYER.by)
      // Pets of a player before her keep their spots; hers keep clear of them.
      if (earlier)
        for (const shot of this.state.shots)
          if (shot.owner === player.id && shot.weapon === 'w_pet' && shot.delay <= 0 && shot.restSpot !== undefined) {
            const spot = PET_SPOTS[shot.restSpot]
            both(x + spot.x, y + spot.y, PET_CLEAR_PET, PET_CLEAR_PET)
          }
    }
    for (const shot of this.state.shots) {
      if (shot.delay > 0) continue
      const of = shot.owner === owner.id ? owner : players.get(shot.owner)
      if (!of || (of !== owner && of.downed)) continue
      if (shot.weapon !== 'p_over' && shot.weapon !== 'p_monster' && shot.weapon !== 'w_observe') continue
      baseX = of.x - owner.x
      baseY = of.y - owner.y
      if (shot.weapon === 'p_over') {
        const at = shot.guardianOffset ?? { x: shot.x - of.x, y: shot.y - of.y }
        both(at.x, at.y, guardian.x, guardian.y)
        const ahead = this.guardianAhead(shot, of, at)
        for (const soon of ahead.soon) both(soon.x, soon.y, guardian.x, guardian.y, false)
        both(ahead.heading.x, ahead.heading.y, guardian.x, guardian.y, false)
        for (const on of ahead.path) avoid.push({ x: baseX + on.x, y: baseY + on.y, bx: guardian.x, by: guardian.y })
      } else if (shot.weapon === 'p_monster') both(shot.x - of.x, shot.y - of.y, guardian.x, guardian.y)
      else both(shot.x - of.x, shot.y - of.y, creature.x, creature.y)
    }
    for (const player of this.state.players) {
      if (player !== owner && player.downed) continue
      if (!this.familyOut(player)) continue
      baseX = player.x - owner.x
      baseY = player.y - owner.y
      const back = player.fx < 0 ? 1 : -1
      for (const slot of FAMILY_SLOTS.slice(0, player.hasChild ? 2 : 1))
        both(back * slot.dx, slot.dy, PET_CLEAR_FAMILY.x, PET_CLEAR_FAMILY.y)
    }
    baseX = baseY = 0
    // The gamble badge floats over one side of her head or the other, and may move over at any time.
    if (owner.weapons.some((weapon) => weapon.id === 'w_gamble'))
      for (const box of overheadBoxes(this.bodySize(owner), 0, true).slice(1))
        both(
          (box.left + box.right) / 2,
          (box.top + box.bottom) / 2,
          (box.right - box.left) / 2 + PET_HALF.x,
          (box.bottom - box.top) / 2 + PET_HALF.y
        )
    return { hold, avoid, now }
  }

  /**
   * Where 過保護親 `shot` of `owner`, now at `at` (offset from her), will be, for the pets keeping clear of her: where
   * she is heading in the end, and on her way there (guardianWay, no faster than GUARDIAN_SPEED) over the next
   * PET_GUARDIAN_LOOKAHEAD (`soon`) and at points along it (`path`). Found once a step, however many pets ask.
   */
  private guardianAhead(shot: Shot, owner: Player, at: { x: number; y: number }) {
    const known = this.guardianAheads.get(shot)
    if (known && known.tick === this.guardianTick) return known
    const size = this.bodySize(owner)
    const duck = guardianDuck(Math.sin(shot.guardianHeading ?? 0), shot.guardianStill ?? 0)
    const rank = this.guardianLine(shot).length - 1
    const blocks = this.guardianBlocks(owner)
    const badge = owner.weapons.some((weapon) => weapon.id === 'w_gamble')
    const heading = this.guardianOffsetAhead(shot, owner, 1, 1)
    const around = this.state.shots
      .filter((other) => other !== shot && other.weapon === 'p_over' && other.owner === shot.owner && other.delay <= 0)
      .map((other) => other.guardianOffset ?? { x: other.x - owner.x, y: other.y - owner.y })
    const way = guardianWay(at, heading, duck, size, rank, around, blocks, badge, shot.r / 20)
    const soon = PET_GUARDIAN_SOON.map((seconds) => guardianAlong(at, way, GUARDIAN_SPEED * seconds))
    const path = Array.from({ length: PET_GUARDIAN_PATH_SAMPLES }, (_, j) =>
      guardianAlong(at, way, PET_GUARDIAN_PATH_STEP * (j + 1))
    )
    const ahead = { tick: this.guardianTick, soon, heading, path }
    this.guardianAheads.set(shot, ahead)
    return ahead
  }

  /**
   * Where 過保護親 `shot` heads for relative to her child once her facing and standing have gone the shares `turn` and
   * `settle` of the way from where they are now to where the child now faces and stands, as she eases them in
   * stepGuardian (1, 1: where she is heading in the end; before the last part of her step, guardianStep).
   */
  private guardianOffsetAhead(shot: Shot, owner: Player, turn: number, settle: number) {
    const targetHeading = Math.atan2(owner.fy, owner.fx)
    const heading = shot.guardianHeading ?? targetHeading
    const along = heading + Math.atan2(Math.sin(targetHeading - heading), Math.cos(targetHeading - heading)) * turn
    const forwardX = Math.cos(along)
    const forwardY = Math.sin(along)
    const now = shot.guardianStill ?? Number(owner.still > 0)
    const still = now + (Number(owner.still > 0) - now) * settle
    const offset = this.guardianWalk(
      shot,
      owner,
      forwardX,
      forwardY,
      guardianTargetSide(forwardX, shot.guardianSide ?? 1)
    )
    return guardianBlend(offset, this.guardianRestSpot(shot, owner), still, forwardY, this.bodySize(owner))
  }

  /**
   * The free spot (index into PET_SPOTS, not in `used`) for a pet that would rest at `base` (offset from its owner):
   * the nearest one clear of every obstacle with PET_SPOT_SLACK to spare; failing that the free one furthest from the
   * obstacles; none once every spot is taken.
   */
  private pickPetSpot(
    base: { x: number; y: number },
    used: ReadonlySet<number>,
    obstacles: readonly PetObstacle[],
    from?: { x: number; y: number },
    now: readonly PetObstacle[] = obstacles,
    reachable = false
  ) {
    let best: number | undefined
    let cost = Infinity
    // A pet already out first looks for a spot it can run to straight without crossing another companion, where they
    // are heading or failing that where they stand now (with `reachable`, only such a spot).
    for (const path of from ? (reachable ? [obstacles, now] : [obstacles, now, undefined]) : [undefined]) {
      for (let i = 0; i < PET_SPOTS.length; i++) {
        if (used.has(i) || petSpotBlocked(PET_SPOTS[i], obstacles, PET_SPOT_SLACK)) continue
        if (path && from && !petPathClear(from, PET_SPOTS[i], path)) continue
        const d = Math.hypot(PET_SPOTS[i].x - base.x, PET_SPOTS[i].y - base.y)
        if (d < cost) {
          best = i
          cost = d
        }
      }
      if (best !== undefined) return best
    }
    if (reachable && from) return undefined
    let clearance = -Infinity
    for (let i = 0; i < PET_SPOTS.length; i++) {
      if (used.has(i)) continue
      const spot = PET_SPOTS[i]
      let clear = Infinity
      for (const o of obstacles)
        clear = Math.min(clear, Math.max(Math.abs(spot.x - o.x) - o.bx, Math.abs(spot.y - o.y) - o.by))
      const d = Math.hypot(spot.x - base.x, spot.y - base.y)
      if (clear > clearance || (clear === clearance && d < cost)) {
        best = i
        clearance = clear
        cost = d
      }
    }
    return best
  }

  /**
   * Hands out the resting spots (PET_SPOTS) among all of `owner`'s pets, oldest first, whatever their source, round or
   * kind and whether chasing or not. Each keeps its spot while no older pet holds it and no obstacle (petObstacles)
   * blocks it (nor, for one on its way there, stands in its way); the others, oldest first, take the nearest free spot
   * clear of the obstacles with room to spare — nearest to where a pet pushed off its spot stands now, or for a new one
   * to its own way out (petRestAngle).
   */
  private assignPetSpots(owner: Player) {
    const pets = this.state.shots.filter(
      (shot) => shot.owner === owner.id && shot.weapon === 'w_pet' && shot.delay <= 0 && shot.life > 0
    )
    if (!pets.length) return
    pets.sort((first, second) => first.id - second.id)
    const { hold, avoid, now } = this.petObstacles(owner)
    const used = new Set<number>()
    const moving: Shot[] = []
    for (const pet of pets) {
      const spot = pet.restSpot
      // One on its way to a new spot also looks again once a companion steps into its way there.
      const cut =
        spot !== undefined &&
        pet.relocating &&
        !pet.target &&
        !petPathClear({ x: pet.x - owner.x, y: pet.y - owner.y }, PET_SPOTS[spot], now)
      if (spot !== undefined && !cut && !used.has(spot) && !petSpotBlocked(PET_SPOTS[spot], hold)) used.add(spot)
      else moving.push(pet)
    }
    for (const pet of moving) {
      const pushed = pet.restSpot !== undefined
      const base = pushed
        ? { x: pet.x - owner.x, y: pet.y - owner.y }
        : this.petBase(pet.weapon, pet.sourceWeapon, pet.orbit, pet.h)
      // One pushed off that can run nowhere without crossing another companion stays on its spot while it is free
      // (過保護親 go round a pet in their way); failing that it takes any.
      const kept = pet.restSpot
      const reached = pushed ? this.pickPetSpot(base, used, avoid, base, now, true) : undefined
      if (pushed && reached === undefined && kept !== undefined && !used.has(kept)) {
        used.add(kept)
        continue
      }
      pet.restSpot = reached ?? this.pickPetSpot(base, used, avoid, pushed ? base : undefined, now)
      if (pet.restSpot !== undefined) used.add(pet.restSpot)
      if (pushed && !pet.target) pet.relocating = true
    }
  }

  private mineTouched(shot: Shot) {
    let touched = false
    this.near(shot.x, shot.y, 30, (enemy) => {
      const reach = shot.r + 6 + ENEMY_BY_ID.get(enemy.kind)!.radius * enemy.scale
      if ((enemy.x - shot.x) ** 2 + (enemy.y - shot.y) ** 2 <= reach * reach) {
        touched = true
        return false
      }
    })
    return touched
  }

  private burst(shot: Shot, owner: Player) {
    const balloon = shot.weapon === 'p_free'
    const radius = balloon ? shot.r * 4 : shot.w
    const blast = balloon ? { ...shot, knockback: 240 } : shot
    this.near(shot.x, shot.y, radius, (enemy) => {
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const reach = radius + def.radius * enemy.scale
      if ((enemy.x - shot.x) ** 2 + (enemy.y - shot.y) ** 2 <= reach * reach)
        this.damage(enemy, def, blast, owner, balloon ? shot : undefined)
    })
    this.emit(FX.BLAST, shot.x, shot.y, radius, WEAPON_INDEX.get(shot.weapon)!)
  }

  /** A player's body size as drawn (body-size.ts): what she draws over her head moves with it. */
  private bodySize(player: Player) {
    return bodyScale(passiveLevel(player, 'p_large'), passiveLevel(player, 'p_small'))
  }

  /** Whether `player`'s spouse and child walk behind her now (the renderer draws them then; see FAMILY_SLOTS). */
  private familyOut(player: Player) {
    return player.married && !player.downed && this.state.phase === 'playing'
  }

  /**
   * Where 過保護親 `shot` stands beside her standing child `owner` (offset from her), her face and figure in view, each
   * parent in her line (guardianLine) in turn taking a free place clear of what stands there: 生き物観察's creatures,
   * the family walking behind a married child (FAMILY_SLOTS), and another player near her with her family and parents.
   * The places lie in a row out from either side of the child, the first `GUARDIAN_REST_X + 14·size` px out and each
   * next one a step (guardianRestGap) further on (below what is drawn over her head), and failing those in a second row
   * behind. Near and steady: a parent keeps her place while it stays free; otherwise she takes the free place nearest
   * the child on the side she is on (the child's own parents within the first two places, the gamble's copies within
   * three), crossing to the other side only when that side is full; all of them on the side the child faces while her
   * family walks behind her, or on the side away from another player near her.
   */
  private guardianRestSpot(shot: Shot, owner: Player) {
    // The places of her whole line are found once a step (each parent takes hers in turn, so those before her find
    // the same), however often they are asked for.
    const known = this.guardianRestSpots.get(shot.owner)
    const spot = known && known.tick === this.guardianTick ? known.spots.get(shot) : undefined
    if (spot) return spot
    const line = this.state.shots.filter(
      (other) => other.weapon === 'p_over' && other.owner === shot.owner && (other.delay <= 0 || other === shot)
    )
    line.sort((a, b) => Math.abs(a.h) - Math.abs(b.h) || a.h - b.h || a.id - b.id)
    const spots = this.findGuardianRestSpots(line[line.length - 1], owner)
    if (this.guardianRestSpots.size > 16) this.guardianRestSpots.clear()
    this.guardianRestSpots.set(shot.owner, { tick: this.guardianTick, spots })
    return spots.get(shot)!
  }

  /** Where each parent in 過保護親 `shot`'s line (guardianLine), up to her, stands beside her standing child. */
  private findGuardianRestSpots(shot: Shot, owner: Player) {
    const line = this.guardianLine(shot)
    let side = Math.sign(line[0].guardianSide ?? 0) || (owner.fx < 0 ? -1 : 1)
    let both = true
    const size = this.bodySize(owner)
    const blocks: OverheadBox[] = []
    const later: OverheadBox[] = []
    const block = (x: number, y: number, half: { x: number; y: number }) => blocks.push(boxAbout(x, y, half))
    const family = (player: Player, baseX: number, baseY: number) => {
      if (!this.familyOut(player)) return
      const back = player.fx < 0 ? 1 : -1
      for (const slot of FAMILY_SLOTS.slice(0, player.hasChild ? 2 : 1))
        blocks.push({
          left: baseX + back * slot.dx - FAMILY_BODY.x,
          top: baseY + slot.dy + FAMILY_BODY.top,
          right: baseX + back * slot.dx + FAMILY_BODY.x,
          bottom: baseY + slot.dy + FAMILY_BODY.bottom
        })
    }
    if (this.familyOut(owner)) {
      side = owner.fx < 0 ? -1 : 1
      both = false
      family(owner, 0, 0)
    } else {
      let nearest = GUARDIAN_NEIGHBOUR
      for (const other of this.state.players) {
        if (other === owner || other.downed) continue
        const dx = owner.x - other.x
        const d = Math.hypot(dx, owner.y - other.y)
        if (d <= nearest && Math.abs(dx) >= 1) {
          nearest = d
          side = Math.sign(dx)
          both = false
        }
      }
    }
    let earlier = true
    for (const other of this.state.players) {
      if (other === owner) {
        earlier = false
        continue
      }
      const dx = other.x - owner.x
      const dy = other.y - owner.y
      if (other.downed || Math.hypot(dx, dy) > GUARDIAN_NEIGHBOUR_REACH) continue
      blocks.push({
        left: dx - PLAYER_BODY.x,
        top: dy + PLAYER_BODY.top,
        right: dx + PLAYER_BODY.x,
        bottom: dy + PLAYER_BODY.bottom
      })
      family(other, dx, dy)
      for (const guard of this.state.shots)
        if (guard.owner === other.id && guard.weapon === 'p_over' && guard.delay <= 0) {
          const at = boxAbout(guard.x - owner.x, guard.y - owner.y, GUARDIAN_BODY)
          // Those of a player after her give way to hers; but a parent of hers finding a new place keeps clear of them.
          if (earlier) blocks.push(at)
          else later.push(at)
        }
    }
    for (const creature of this.state.shots)
      if (creature.weapon === 'w_observe' && creature.delay <= 0 && creature.life > 0)
        block(creature.x - owner.x, creature.y - owner.y, CREATURE_BODY)
    const gap = this.guardianRestGap(shot, owner)
    // The row in front stands clear below the shields of the row beside the child.
    const front = Math.max(
      GUARDIAN_FRONT_ROW,
      Math.ceil(
        GUARDIAN_BODY.y + (GUARDIAN_SHIELD_ART.bottom * (gap - GUARDIAN_SHIELD_SHOWN)) / GUARDIAN_SHIELD_ART.far
      )
    )
    const base = GUARDIAN_REST_X + 14 * size
    const overhead = guardianOverhead(size)
    const below = guardianOverhead(
      size,
      owner.weapons.some((weapon) => weapon.id === 'w_gamble')
    )
    const child = guardianChildBox(size)
    // As many places in a row as her whole line could take (the same for each of them, so each finds the same).
    const room = this.state.shots.filter((other) => other.weapon === 'p_over' && other.owner === shot.owner).length + 1
    const row = (towards: number, line: 'side' | 'back' | 'front') => {
      const places: { x: number; y: number }[] = []
      for (let k = 0; k <= room; k++) {
        const x = towards * (base + gap * (line === 'side' ? k : k + 0.5))
        // (Below what is drawn over the head: a small child's gamble badge hangs lower.)
        const place =
          line === 'back'
            ? { x, y: GUARDIAN_REST_Y - GUARDIAN_BACK_ROW }
            : {
                x,
                y: Math.max(GUARDIAN_REST_Y, guardianOverheadFloor(x, below)) + (line === 'front' ? front : 0)
              }
        const body = boxAbout(place.x, place.y, GUARDIAN_BODY)
        if (line === 'back' && (guardianBoxReach(place, child) < 1 || overhead.some((box) => boxesOverlap(body, box))))
          continue
        places.push(place)
      }
      return places
    }
    const taken: { x: number; y: number }[] = []
    const spots = new Map<Shot, { x: number; y: number }>()
    // (In another row, a parent stands clear of the shields of this one.)
    const free = (place: { x: number; y: number }) =>
      taken.every((other) => Math.abs(place.y - other.y) >= front - 0.5 || Math.abs(place.x - other.x) > gap - 0.5)
    const clear = (place: { x: number; y: number }) =>
      !blocks.some((box) => boxesOverlap(boxAbout(place.x, place.y, GUARDIAN_BODY), box))
    let spot = { x: side * base, y: GUARDIAN_REST_Y }
    // The child's own parents before the gamble's copies; among them those keeping their places first, then those
    // nearer the child first, so none has to pass another on her way out to hers.
    const away = (guard: Shot) => {
      const at = guard.guardianOffset ?? { x: guard.x - owner.x, y: guard.y - owner.y }
      return Math.hypot(at.x, at.y)
    }
    const order = [...line].sort(
      (a, b) =>
        Number(a.sourceWeapon !== 'p_over') - Number(b.sourceWeapon !== 'p_over') ||
        Number(!a.guardianRest) - Number(!b.guardianRest) ||
        away(a) - away(b) ||
        line.indexOf(a) - line.indexOf(b)
    )
    for (const guard of order) {
      // Near the child (GUARDIAN_OWN_NEAR, GUARDIAN_COPY_NEAR: on a phone held upright, in view).
      const reach = guard.sourceWeapon === 'p_over' ? GUARDIAN_OWN_NEAR : GUARDIAN_COPY_NEAR
      // She stays on the side she is on (beside the child, or ahead of her as she stops), unless the child's family or
      // a player near her takes it.
      const at = guard.guardianOffset ?? { x: guard.x - owner.x, y: guard.y - owner.y }
      const first = !both ? side : Math.abs(at.x) > 4 ? Math.sign(at.x) : guard.sourceWeapon === 'p_over' ? side : -side
      const places = [
        ...row(first, 'side'),
        ...row(-first, 'side'),
        ...row(first, 'front'),
        ...row(-first, 'front'),
        ...row(first, 'back'),
        ...row(-first, 'back')
      ]
      const near = places.filter((place) => Math.hypot(place.x, place.y) <= reach)
      const kept = guard.guardianRest
      const keep =
        kept &&
        near.find(
          (place) => Math.abs(place.x - kept.x) < 0.5 && Math.abs(place.y - kept.y) < 0.5 && free(place) && clear(place)
        )
      const open = (place: { x: number; y: number }) =>
        !later.some((box) => boxesOverlap(boxAbout(place.x, place.y, GUARDIAN_BODY), box))
      spot =
        keep ||
        near.find((place) => free(place) && clear(place) && open(place)) ||
        near.find((place) => free(place) && clear(place)) ||
        places.find((place) => free(place) && clear(place)) ||
        places.find(free) ||
        spot
      taken.push(spot)
      spots.set(guard, spot)
    }
    return spots
  }

  /**
   * How far apart (px) the parents in 過保護親 `shot`'s line stand beside a standing child: GUARDIAN_REST_GAP, or
   * wider once their shields (GUARDIAN_SHIELD_ART, scaled by r/20) grow, so none stands inside another's shield.
   */
  private guardianRestGap(shot: Shot, owner: Player) {
    // (Found once a step for each child.)
    const known = this.guardianGaps.get(owner.id)
    if (known && known.tick === this.guardianTick && shot.delay <= 0) return known.gap
    const shields = this.state.shots.filter(
      (other) => other.weapon === 'p_over' && other.owner === shot.owner && (other.delay <= 0 || other === shot)
    )
    let scale = Math.max(...shields.map((other) => other.r / 20))
    // As wide for the gamble's copies of her while it plays her, whether one is out now or not, so the others stay put
    // as they come and go.
    const def = WEAPON_BY_ID.get('p_over')!
    for (const weapon of owner.weapons)
      if (weapon.id === 'w_gamble' && weapon.gambleWeapon === 'p_over')
        scale = Math.max(scale, weaponStats(owner, weapon, playerStats(owner), def).area)
    const gap = Math.max(GUARDIAN_REST_GAP, Math.ceil(GUARDIAN_SHIELD_ART.far * scale + GUARDIAN_SHIELD_SHOWN))
    if (shot.delay <= 0) this.guardianGaps.set(owner.id, { tick: this.guardianTick, gap })
    return gap
  }

  /**
   * guardianWalkOffset for 過保護親 `shot` of `owner` in her `line` (guardianLine), the child's own parents walking at
   * shoulder `side`: the gamble's copies walk at the other shoulder (out past the badge there), so walking up the
   * screen no shoulder has more than two of them and all stay in view.
   */
  private guardianWalk(
    shot: Shot,
    owner: Player,
    forwardX: number,
    forwardY: number,
    side: number,
    line = this.guardianLine(shot)
  ) {
    const copy = shot.sourceWeapon !== 'p_over'
    const own = line.some((other) => other.sourceWeapon === 'p_over')
    const rank = line.filter((other) => (other.sourceWeapon !== 'p_over') === copy).length - 1
    return guardianWalkOffset(
      forwardX,
      forwardY,
      shot,
      copy && own ? rank : line.length - 1,
      copy && own ? -side : side,
      this.bodySize(owner),
      this.guardianRestGap(shot, owner)
    )
  }

  /**
   * 過保護親 `shot`'s line: her child's parents and the gamble's copies out now, the child's own before the copies (by
   * |h|, then h), up to and including her. Each stands a step further out from the one before (see guardianWalkOffset).
   */
  private guardianLine(shot: Shot) {
    const line = this.state.shots.filter(
      (other) => other.weapon === 'p_over' && other.owner === shot.owner && (other.delay <= 0 || other === shot)
    )
    line.sort((a, b) => Math.abs(a.h) - Math.abs(b.h) || a.h - b.h || a.id - b.id)
    return line.slice(0, line.indexOf(shot) + 1)
  }

  private shieldTouches(shot: Shot, x: number, y: number, radius: number) {
    const scale = shot.r / 20
    // Standing still the parent covers every side, all round the child: the reach is centred where it always was,
    // whatever place beside the child she has stepped to.
    const still = shot.guardianStill ?? 0
    if (still >= 0.5) {
      const reach = shot.orbit * 0.65 + 7 * scale + radius
      const legacyX = shot.h * shot.r * GUARDIAN_SHIELD_SPREAD
      const legacyY = -GUARDIAN_SHIELD_LIFT
      const rest = shot.guardianRest ?? { x: legacyX, y: legacyY }
      // From where she was heading (her child plus guardianAim), not where her glide round the others has her now.
      const off = shot.guardianOffset
      const aim = shot.guardianAim
      const atX = off && aim ? shot.x - off.x + aim.x : shot.x
      const atY = off && aim ? shot.y - off.y + aim.y : shot.y
      const dx = x - (atX - rest.x * still + legacyX * (still - 1))
      const dy = y - (atY - rest.y * still + legacyY * (still - 1))
      return dx * dx + dy * dy <= reach * reach
    }
    const thrust = shot.aux > 0 ? Math.sin(Math.PI * (1 - Math.min(1, shot.aux / shot.tick))) * 14 : 0
    const centerX = shot.x + (Math.cos(shot.angle) < 0 ? -7 : 7) * scale + Math.cos(shot.angle) * thrust
    const dx = Math.max(Math.abs(x - centerX) - 7 * scale, 0)
    const dy = Math.max(Math.abs(y - (shot.y + 3 * scale + Math.sin(shot.angle) * thrust)) - 9 * scale, 0)
    return dx * dx + dy * dy <= radius * radius
  }

  /** Applies hits; returns false once the shot is used up. */
  private collide(shot: Shot, owner: Player) {
    const time = this.state.time
    if (shot.kind === 'chain' || shot.kind === 'slam' || shot.kind === 'mine' || shot.kind === 'observe') return true
    // Rain falls first and lands at the end of its life; strikes land immediately.
    if (shot.kind === 'rain' && shot.life > shot.maxLife * 0.35) return true
    let alive = true
    if (shot.kind === 'nova') {
      this.near(shot.x, shot.y, shot.r + 20, (enemy) => {
        const def = ENEMY_BY_ID.get(enemy.kind)!
        const d = Math.hypot(enemy.x - shot.x, enemy.y - shot.y)
        if (Math.abs(d - shot.r) > 16 + def.radius * enemy.scale) return
        const direction = Math.atan2(enemy.y - shot.y, enemy.x - shot.x) - shot.angle
        if (Math.cos(direction) < 0.5) return
        if (shot.hits.has(enemy.id)) return
        shot.hits.set(enemy.id, Infinity)
        this.damage(enemy, def, shot, owner)
      })
      return true
    }
    const rect = shot.kind === 'whip' || shot.kind === 'flail' || shot.kind === 'beam'
    const cos = Math.cos(shot.angle)
    const sin = Math.sin(shot.angle)
    this.near(shot.x, shot.y, shot.r, (enemy) => {
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const radius = def.radius * enemy.scale
      const dx = enemy.x - shot.x
      const dy = enemy.y - shot.y
      if (rect) {
        const along = dx * cos + dy * sin
        const across = -dx * sin + dy * cos
        if (Math.abs(along) > shot.w + radius || Math.abs(across) > shot.h + radius) return
      } else if (dx * dx + dy * dy > (shot.r + radius) ** 2) return
      if ((shot.hits.get(enemy.id) ?? -1) > time) return
      shot.hits.set(enemy.id, time + shot.tick)
      this.damage(enemy, def, shot, owner)
      if (--shot.pierce <= 0) {
        alive = false
        return false
      }
    })
    return alive
  }

  private damage(enemy: Enemy, def: EnemyDef, shot: Shot, owner: Player, origin?: { x: number; y: number }) {
    const strong = shot.strong.includes(def.tag)
    const crit = shot.crit || this.rng() < shot.critChance
    const amount =
      shot.damage * (strong ? shot.strongMult : 1) * (0.9 + this.rng() * 0.2) * (crit ? CRIT_MULTIPLIER : 1)
    enemy.hp -= amount
    enemy.flash = 0.12
    if (shot.weapon === 'w_love') enemy.slow = 1.2
    else if (shot.kind === 'garden') enemy.slow = Math.max(enemy.slow, 0.6)
    const knock = shot.knockback * this.knockScale(enemy, def)
    if (knock) {
      let dx = enemy.x - (origin?.x ?? owner.x)
      let dy = enemy.y - (origin?.y ?? owner.y)
      if (!dx && !dy && shot.weapon === 'p_over') {
        dx = owner.fx
        dy = owner.fy
      } else if (origin && !dx && !dy) dy = -1
      const l = Math.hypot(dx, dy) || 1
      enemy.kx += (dx / l) * knock
      enemy.ky += (dy / l) * knock
    }
    const weapon = owner.weapons.find((w) => w.id === shot.sourceWeapon)
    const dealt = Math.min(amount, Math.max(0, enemy.hp + amount))
    if (weapon) weapon.damage += dealt
    if (weapon && weapon.id === owner.parent) owner.parentDamage = (owner.parentDamage ?? 0) + dealt
    if (this.state.popups.length < 80)
      this.state.popups.push({
        x: enemy.x,
        y: enemy.y - def.radius,
        v: Math.round(amount),
        strong,
        crit,
        owner: owner.id,
        life: 0.6
      })
    if (this.tickHits < (crit ? 5 : 3)) {
      this.tickHits++
      this.emit(FX.HIT, enemy.x, enemy.y, WEAPON_INDEX.get(shot.weapon)!, (strong ? 1 : 0) | (crit ? 2 : 0))
    }
    if (enemy.hp <= 0) this.kill(enemy, def)
  }

  /** Leaves a pickup; the oldest one on the ground makes room when there are too many. */
  private drop(item: Item) {
    const items = this.state.items
    if (items.length >= MAX_ITEMS) items.shift()
    items.push(item)
  }

  private kill(enemy: Enemy, def: EnemyDef) {
    const state = this.state
    state.kills++
    const xp = def.xp * (enemy.elite ? 6 : 1)
    if (state.gems.length < MAX_GEMS) state.gems.push({ x: enemy.x, y: enemy.y, v: xp, pull: false })
    else state.gems[Math.floor(this.rng() * state.gems.length)].v += xp
    const index = ENEMY_INDEX.get(def.id)!
    if (def.behavior === 'boss') {
      this.drop({ kind: 'chest', x: enemy.x, y: enemy.y })
      state.slowmo = SLOWMO_SECONDS
      this.emit(FX.BOSS_KILL, enemy.x, enemy.y, index)
      this.log(`「${def.name}」を乗り越えた！ 転機が訪れる。`)
    } else {
      if (this.tickKills++ < 12) this.emit(FX.KILL, enemy.x, enemy.y, index, enemy.elite ? 1 : 0)
      if (enemy.elite) {
        // Elites always leave something: a meal, or now and then a turning point.
        const mealChance = state.time < RUN_SECONDS / 2 ? 0.6 : 0.8
        this.drop({ kind: this.rng() < mealChance ? 'meal' : 'chest', x: enemy.x, y: enemy.y })
      } else if (this.rng() < 0.0015 && state.items.length < 20) this.drop({ kind: 'meal', x: enemy.x, y: enemy.y })
      else if (this.rng() < 0.0012 && state.items.length < 20) this.drop({ kind: 'magnet', x: enemy.x, y: enemy.y })
    }
    if (def.child && def.children)
      for (let i = 0; i < def.children; i++) {
        const angle = (i / def.children) * Math.PI * 2 + this.rng()
        this.spawnEnemy(def.child, enemy.x + Math.cos(angle) * 22, enemy.y + Math.sin(angle) * 22)
      }
  }

  private collectGems(dt: number) {
    const state = this.state
    const alive = state.players.filter((player) => !player.downed)
    if (!alive.length) return
    const stats = new Map(alive.map((player) => [player.id, playerStats(player)]))
    const gathered = new Map<string, number>()
    const kept: Gem[] = []
    for (const gem of state.gems) {
      let best: Player | undefined
      let distance = Infinity
      for (const player of alive) {
        const d = Math.hypot(player.x - gem.x, player.y - gem.y)
        if (d < distance) {
          distance = d
          best = player
        }
      }
      if (!best) continue
      const s = stats.get(best.id)!
      if (distance < s.magnet) gem.pull = true
      if (gem.pull) {
        const speed = 420 * dt
        gem.x += ((best.x - gem.x) / (distance || 1)) * speed
        gem.y += ((best.y - gem.y) / (distance || 1)) * speed
      }
      if (distance < PLAYER_RADIUS + 8) {
        this.gainXp(gem.v * s.xpGain)
        gathered.set(best.id, (gathered.get(best.id) ?? 0) + 1)
      } else kept.push(gem)
    }
    state.gems = kept
    for (const [id, count] of gathered) {
      const player = alive.find((p) => p.id === id)!
      this.emit(FX.GEM, player.x, player.y, count, this.playerIndex(player))
    }
    state.items = state.items.filter((item) => {
      const taker = alive.find(
        (player) =>
          (!('owner' in item) || item.owner === player.id) &&
          Math.hypot(player.x - item.x, player.y - item.y) < PLAYER_RADIUS + 16
      )
      if (!taker) return true
      const takerIndex = this.playerIndex(taker)
      if ('owner' in item) {
        if (item.kind === 'food_heal')
          taker.hp = Math.min(taker.maxHp, taker.hp + COOKING_EFFECTS.food_heal.amount * item.power)
        else {
          taker.cookingBuffs ??= {}
          taker.cookingBuffs[item.kind] = { time: 60, power: item.power }
        }
        this.emit(FX.ITEM, item.x, item.y, ITEM_KINDS.indexOf(item.kind), takerIndex)
      } else if (item.kind === 'meal') {
        taker.hp = Math.min(taker.maxHp, taker.hp + 40)
        this.emit(FX.ITEM, item.x, item.y, ITEM_KINDS.indexOf('meal'), takerIndex)
      } else if (item.kind === 'magnet') {
        for (const gem of state.gems) gem.pull = true
        this.emit(FX.ITEM, item.x, item.y, ITEM_KINDS.indexOf('magnet'), takerIndex)
      } else {
        const grant = this.rng() < CHEST_TRIPLE ? 3 : 1
        for (const player of alive) player.pending += grant
        this.emit(FX.CHEST, item.x, item.y, grant, takerIndex)
      }
      return false
    })
  }

  gainXp(amount: number) {
    const state = this.state
    state.xp += amount
    let leveled = false
    while (state.xp >= state.xpNext) {
      state.xp -= state.xpNext
      state.level++
      leveled = true
      state.xpNext = Math.round(xpForLevel(state.level) * (1 + (state.players.length - 1) * 0.5))
      for (const player of state.players)
        if (!player.downed) {
          const hasOptions = this.options(player).length > 0
          if (
            state.level % 5 === 0 &&
            (!hasOptions || talentWeaponCount(player) >= weaponSlots(player, ageAt(state.time)))
          )
            player.swapPending++
          if (hasOptions || state.level % 5 !== 0) player.pending++
          // Growing up also mends the heart a little.
          player.hp = Math.min(player.maxHp, player.hp + player.maxHp * LEVEL_HEAL)
          this.emit(FX.LEVELUP, player.x, player.y, state.level, this.playerIndex(player))
        }
    }
    if (leveled) for (const player of state.players) if (!player.downed) this.shockwave(player)
  }

  /** A level-up pushes the crowd back off whoever grew (no damage). */
  private shockwave(player: Player) {
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue
      const dx = enemy.x - player.x
      const dy = enemy.y - player.y
      const d = Math.hypot(dx, dy)
      if (d > 190) continue
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const push = 360 * (1 - d / 260) * this.knockScale(enemy, def)
      enemy.kx += (dx / (d || 1)) * push
      enemy.ky += (dy / (d || 1)) * push
    }
  }

  private loseParent(player: Player, event: number) {
    if (player.parentDeath) return
    const weapon = player.weapons.find((owned) => owned.id === player.parent)
    const legacy = PARENT_LEGACIES[player.parent]
    let reward: ParentReward = 'none'
    if (weapon && weapon.lv >= MAX_WEAPON_LEVEL) {
      if (passiveLevel(player, legacy) >= MAX_PASSIVE_LEVEL) {
        reward = 'choice'
        player.parentRewardPending++
      } else {
        reward = 'passive'
        this.grantPassive(player, legacy)
      }
    }
    player.parentDeath = { at: EVENTS[event].at, x: player.x, y: player.y, reward }
    player.weapons = player.weapons.filter((owned) => owned.id !== player.parent)
    this.state.shots = this.state.shots.filter(
      (shot) => shot.owner !== player.id || shot.sourceWeapon !== player.parent
    )
    player.shieldRecovery = 0
    const clean = (hand: string[]) => {
      const result = hand.filter(
        (choice) =>
          choice !== `w:${player.parent}` &&
          !(choice === `p:${legacy}` && passiveLevel(player, legacy) >= MAX_PASSIVE_LEVEL)
      )
      if (hand.length && !result.length) player.parentRewardPending++
      return result
    }
    const choices = clean(player.choices)
    if (choices.length !== player.choices.length) player.choiceSeq++
    player.choices = choices
    const saved = this.familyHands.get(player.id)
    if (saved) this.familyHands.set(player.id, clean(saved))
    const outcome = parentFarewell(player.parent, reward)
    player.history.push({ event, outcome })
    player.history.sort(
      (first, second) => (first.at ?? EVENTS[first.event].at) - (second.at ?? EVENTS[second.event].at)
    )
    this.log(outcome, player.id)
    this.emit(FX.PARENT_DEATH, player.x, player.y, WEAPON_INDEX.get(player.parent)!, this.playerIndex(player))
  }

  /** Builds the level-up hand for a player from what their age and slots allow. */
  options(player: Player): string[] {
    const age = ageAt(this.state.time)
    const result: string[] = []
    for (const weapon of player.weapons)
      if (weapon.lv < MAX_WEAPON_LEVEL && !(player.parentDeath && weapon.id === player.parent))
        result.push(`w:${weapon.id}`)
    if (talentWeaponCount(player) < weaponSlots(player, age))
      for (const def of TALENT_WEAPONS) if (canObtainWeapon(player, def, age)) result.push(`w:${def.id}`)
    for (const passive of player.passives)
      if (passive.id !== PET_MEMORY && passive.id !== PEOPLE_FEAR && passive.lv < MAX_PASSIVE_LEVEL)
        result.push(`p:${passive.id}`)
    if (player.passives.filter((passive) => passive.id !== PET_MEMORY).length < PASSIVE_SLOTS)
      for (const def of PASSIVES)
        if (def.id !== PET_MEMORY && !player.passives.some((p) => p.id === def.id)) result.push(`p:${def.id}`)
    return result
  }

  /** Cards you already hold come up more often, so a build can actually be finished. */
  private cardWeight(player: Player, choice: string) {
    const [kind, id] = choice.split(':')
    const owned =
      kind === 'w' ? player.weapons.some((w) => w.id === id) : player.passives.some((passive) => passive.id === id)
    const weapon = kind === 'w' ? WEAPON_BY_ID.get(id) : undefined
    const category = kind === 'w' ? weapon?.category : PASSIVE_BY_ID.get(id)?.category
    const friend = category === 'friend' && !weapon?.parent
    const weight = (owned ? 2.5 : 1) * (friend ? peopleFearFriendRate(player, ageAt(this.state.time)) : 1)
    return kind === 'p' ? (weight * BASE_PASSIVE_COUNT) / (PASSIVES.length - 1) : weight
  }

  private offer(player: Player) {
    player.choiceSeq++
    const parentReward = player.pending === 0 && player.parentRewardPending > 0
    const career = player.pending === 0 && !parentReward && player.swapPending === 0 && player.careerPending > 0
    if ((player.pending === 0 && !parentReward && player.swapPending > 0) || (career && !this.options(player).length)) {
      if (career) player.careerPending--
      else player.swapPending--
      const age = ageAt(this.state.time)
      const pool = TALENT_WEAPONS.filter((def) => canObtainWeapon(player, def, age))
      const hand: string[] = []
      while (hand.length < 3 && pool.length)
        hand.push(`s:${pool.splice(Math.floor(this.rng() * pool.length), 1)[0].id}`)
      if (hand.length && talentWeaponCount(player)) player.choices = [...hand, 'x:skip']
      return
    }
    // 蒸発済み's first hand (自立): only the talents of early childhood, whatever the age.
    const birth = player.birthPick === true
    player.birthPick = false
    const pool = birth
      ? TALENT_WEAPONS.filter((def) => def.minAge <= 6).map((def) => `w:${def.id}`)
      : this.options(player)
    if (!pool.length && parentReward) pool.push('x:meal', 'x:coin')
    const hand: string[] = []
    // 運がいい sometimes deals a fourth card.
    const size = 3 + (this.rng() < passivePower(player, 'p_lucky') * 0.1 ? 1 : 0)
    while (hand.length < size && pool.length) {
      const weights = pool.map((choice) => this.cardWeight(player, choice))
      let roll = this.rng() * weights.reduce((sum, w) => sum + w, 0)
      let pick = pool.length - 1
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i]
        if (roll <= 0) {
          pick = i
          break
        }
      }
      hand.push(pool.splice(pick, 1)[0])
    }
    player.choices = hand
    if (career) player.careerPending--
    else if (parentReward) player.parentRewardPending--
    else player.pending--
  }

  choose(player: Player, index: number) {
    if (this.state.phase !== 'playing' || !Number.isSafeInteger(index) || !this.state.players.includes(player)) return
    const choice = player.choices[index]
    if (!choice) return
    if (choice === 'd:yes' || choice === 'd:no') {
      const hand = this.familyHands.get(player.id)
      if (!hand) return
      this.familyHands.delete(player.id)
      player.choices = hand
      player.choiceSeq++
      player.dating = choice === 'd:yes'
      this.log(player.dating ? 'パートナーと交際を始めた。' : '今は一人で歩むことにした。', player.id)
      return
    }
    if (choice === 'f:yes' || choice === 'f:no') {
      const hand = this.familyHands.get(player.id)
      if (!hand) return
      this.familyHands.delete(player.id)
      player.choices = hand
      player.choiceSeq++
      player.hasChild = choice === 'f:yes'
      const event = EVENTS.findIndex((entry) => entry.swarm === 'nightcry')
      const outcome = LIFE_OUTCOMES.nightcry[player.hasChild ? 0 : 1]
      player.history = player.history.filter((entry) => entry.event !== event)
      player.history.push({ event, outcome, at: this.state.time })
      player.history.sort(
        (first, second) => (first.at ?? EVENTS[first.event].at) - (second.at ?? EVENTS[second.event].at)
      )
      this.log(outcome, player.id)
      if (player.hasChild && !this.nightcryStarted) {
        this.nightcryStarted = true
        this.log(`${player.name}の家族の試練：${EVENTS[event].text}`)
        this.spawnSwarm(event, player)
      }
      return
    }
    const [kind, id, replacement] = choice.split(':')
    player.choices = []
    player.choiceSeq++
    if (kind === 's') {
      player.choices = [
        ...player.weapons
          .filter((weapon) => !WEAPON_BY_ID.get(weapon.id)?.parent)
          .map((weapon) => `r:${weapon.id}:${id}`),
        'x:skip'
      ]
    } else if (kind === 'r') {
      const index = player.weapons.findIndex((weapon) => weapon.id === id)
      if (index >= 0 && replacement && WEAPON_BY_ID.has(replacement)) {
        if (id === 'w_pet')
          this.state.shots = this.state.shots.filter((shot) => shot.owner !== player.id || shot.sourceWeapon !== id)
        player.weapons[index] = {
          id: replacement,
          lv: 1,
          cd: 0.2,
          held: 0,
          damage: 0,
          acquiredAge: ageAt(this.state.time)
        }
        this.feel(player, WEAPON_BY_ID.get(replacement)!, 1)
      }
    } else if (kind === 'w') {
      if (player.parentDeath && id === player.parent) return
      const owned = player.weapons.find((w) => w.id === id)
      if (owned) {
        const before = isEvolved(player, owned)
        owned.lv = Math.min(MAX_WEAPON_LEVEL, owned.lv + 1)
        this.feel(player, WEAPON_BY_ID.get(id)!, owned.lv)
        if (!before && isEvolved(player, owned)) this.announceEvolution(player, owned)
      } else {
        player.weapons.push({ id, lv: 1, cd: 0.2, held: 0, damage: 0, acquiredAge: ageAt(this.state.time) })
        this.feel(player, WEAPON_BY_ID.get(id)!, 1)
      }
    } else if (kind === 'p') {
      this.grantPassive(player, id)
    } else if (choice === 'x:meal') player.hp = Math.min(player.maxHp, player.hp + 40)
    else if (choice === 'x:coin') this.gainXp(this.state.xpNext * 0.25)
  }

  private grantPassive(player: Player, id: string) {
    const owned = player.passives.find((p) => p.id === id)
    const evolvedBefore = new Set(player.weapons.filter((w) => isEvolved(player, w)).map((w) => w.id))
    if (owned) {
      owned.lv = Math.min(MAX_PASSIVE_LEVEL, owned.lv + 1)
      this.feel(player, PASSIVE_BY_ID.get(id)!, owned.lv)
    } else {
      player.passives.push({ id, lv: 1 })
      this.feel(player, PASSIVE_BY_ID.get(id)!, 1)
    }
    let evolved = false
    for (const weapon of player.weapons)
      if (!evolvedBefore.has(weapon.id) && isEvolved(player, weapon)) {
        evolved = true
        this.emit(FX.EVOLVE, player.x, player.y, WEAPON_INDEX.get(weapon.id)!, this.playerIndex(player))
      }
    if (evolved) this.log(`${player.name}の手札が進化した！`)
    const stats = playerStats(player)
    if (!player.downed && stats.maxHp > player.maxHp) player.hp += stats.maxHp - player.maxHp
    player.maxHp = stats.maxHp
    player.hp = Math.min(player.hp, player.maxHp)
  }

  private announceEvolution(player: Player, weapon: OwnedWeapon) {
    this.emit(FX.EVOLVE, player.x, player.y, WEAPON_INDEX.get(weapon.id)!, this.playerIndex(player))
    this.log(`${player.name}の「${WEAPON_BY_ID.get(weapon.id)!.name}」が「${weaponName(player, weapon)}」に進化！`)
  }

  private feel(player: Player, def: Pick<WeaponDef, 'category' | 'icon' | 'name'>, level: number) {
    if (!def.category) return
    const power = player.talents[def.category]
    const actual = power >= 1.25 ? GIFTED : power <= 0.9 ? POOR : 1
    if (level === 1 && this.rng() >= 0.75) this.rng()
    const truthful = this.feelRng() < Math.min(1, 0.5 + (level - 1) * 0.1)
    const values = [GIFTED, 1, POOR]
    const sensed = truthful ? actual : values.filter((v) => v !== actual)[Math.floor(this.feelRng() * 2)]
    const text =
      sensed === GIFTED
        ? 'なんだか、しっくりくる…！'
        : sensed === POOR
          ? 'どうも向いていない気がする…'
          : 'まあ、ふつうかな。'
    this.log(`${def.icon} ${def.name}：${text}`, player.id)
  }
}
