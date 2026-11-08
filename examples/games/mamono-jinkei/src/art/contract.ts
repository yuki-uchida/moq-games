/**
 * The art contract: every sheet id, animation name, frame count, frame size and anchor the game draws.
 * Art modules must produce exactly these (extra animations are allowed); `tests/art-contract.test.ts` checks
 * every registered sheet against this file, and the placeholders in placeholder.ts follow it too.
 *
 * Conventions
 * - Character frames are 64×64 with the feet on (32, 56) (the default anchor), lit from the top-left, selective
 *   outlines, the master palette only. `side` frames face right (the renderer mirrors them).
 * - Bosses are 128×128 with the feet on (64, 116). Larger effects are listed with their size and anchor.
 * - Frame 0 of every `attack_*` is the anticipation, the listed `hit` frame is the moment of contact.
 */
import { DIRS, ENEMIES, JOBS, SPECIES, STAGES, type BossKind, type Dir, type NpcKind, type Species } from '../vocab'

export interface AnimSpec {
  frames: number
  w: number
  h: number
  loop: boolean
  /** Required anchor when it differs from the default for the size. */
  anchor?: readonly [number, number]
  /** The animation must provide a per-frame `lift` array (airborne poses). */
  lift?: boolean
  /** Frame index of the contact/release moment (attacks), for the simulation's timing. */
  hit?: number
  fps: number
}

const perDir = (prefix: string, spec: AnimSpec, dirs: readonly Dir[] = DIRS) =>
  Object.fromEntries(dirs.map((dir) => [`${prefix}_${dir}`, spec]))

const C64 = { w: 64, h: 64 }

/** The species action animation of each hero species (`action_<dir>`). */
export const ACTION_SPEC: Record<Species, AnimSpec> = {
  slime: { ...C64, frames: 4, loop: false, lift: true, fps: 10 }, // crouch, launch, air, land squash
  rat: { ...C64, frames: 3, loop: false, fps: 14 }, // dash stretch with speed lines in the sprite
  crow: { ...C64, frames: 4, loop: true, lift: true, fps: 12 }, // flapping flight
  wolf: { ...C64, frames: 4, loop: false, fps: 8 } // howl: head up, mouth open
}

/** Every hero sheet `hero:<species>:<job>`. */
export function heroSpec(species: Species): Record<string, AnimSpec> {
  return {
    ...perDir('idle', { ...C64, frames: 4, loop: true, fps: 6 }),
    ...perDir('walk', { ...C64, frames: 6, loop: true, fps: 12 }),
    ...perDir('attack', { ...C64, frames: 4, loop: false, fps: 18, hit: 1 }),
    ...perDir('charge', { ...C64, frames: 2, loop: true, fps: 8 }),
    ...perDir('skill', { ...C64, frames: 4, loop: false, fps: 14, hit: 1 }),
    ...perDir('hurt', { ...C64, frames: 2, loop: false, fps: 12 }),
    ...perDir('push', { ...C64, frames: 4, loop: true, fps: 8 }),
    ...perDir('carry', { ...C64, frames: 4, loop: true, fps: 10 }),
    ...perDir('grip', { ...C64, frames: 2, loop: true, fps: 6 }),
    ...perDir('action', ACTION_SPEC[species]),
    down: { ...C64, frames: 4, loop: false, fps: 8 },
    revive: { ...C64, frames: 4, loop: false, fps: 10 },
    victory: { ...C64, frames: 6, loop: true, fps: 8 },
    fall: { ...C64, frames: 4, loop: false, fps: 10 }
  }
}

/** Every enemy sheet `enemy:<kind>`. Shield bearers add `guard_<dir>`; healers add `heal`. */
export function enemySpec(kind: string): Record<string, AnimSpec> {
  const spec: Record<string, AnimSpec> = {
    ...perDir('idle', { ...C64, frames: 2, loop: true, fps: 4 }),
    ...perDir('walk', { ...C64, frames: 4, loop: true, fps: 8 }),
    ...perDir('windup', { ...C64, frames: 2, loop: true, fps: 10 }),
    ...perDir('attack', { ...C64, frames: 3, loop: false, fps: 14, hit: 1 }),
    ...perDir('hurt', { ...C64, frames: 2, loop: false, fps: 12 }),
    death: { ...C64, frames: 5, loop: false, fps: 10 }
  }
  if (['shieldman', 'spearguard', 'paladin', 'heavy'].includes(kind))
    Object.assign(spec, perDir('guard', { ...C64, frames: 2, loop: true, fps: 6 }))
  if (['bellmonk', 'paladin'].includes(kind)) spec.heal = { ...C64, frames: 4, loop: false, fps: 10 }
  return spec
}

/** Friendly NPC monsters `npc:<kind>` (front-facing). */
export const NPC_SPEC: Record<string, AnimSpec> = {
  idle: { ...C64, frames: 4, loop: true, fps: 5 },
  talk: { ...C64, frames: 4, loop: true, fps: 8 }
}

const C128 = { w: 128, h: 128 }
/** Boss sheets `boss:<kind>`. */
export const BOSS_SPEC: Record<BossKind, Record<string, AnimSpec>> = {
  garud: {
    ...perDir('idle', { ...C128, frames: 4, loop: true, fps: 5 }),
    ...perDir('walk', { ...C128, frames: 6, loop: true, fps: 8 }),
    ...perDir('guard', { ...C128, frames: 2, loop: true, fps: 4 }),
    ...perDir('windup', { ...C128, frames: 3, loop: false, fps: 8 }), // before a shield charge or a sweep
    ...perDir('charge', { ...C128, frames: 4, loop: true, fps: 12 }), // shield-first charge
    ...perDir('sweep', { ...C128, frames: 5, loop: false, fps: 14, hit: 2 }), // wide sword sweep
    slam: { ...C128, frames: 6, loop: false, fps: 10, hit: 3 }, // jumps and slams the shield down
    call: { ...C128, frames: 4, loop: false, fps: 6 }, // raises the sword to call rookies
    broken: { ...C128, frames: 4, loop: true, fps: 6 }, // guard broken: dizzy, shield dropped
    ...perDir('hurt', { ...C128, frames: 2, loop: false, fps: 12 }),
    death: { ...C128, frames: 8, loop: false, fps: 8 }
  },
  // Stages 2–4 are specified when those stages are built.
  milda: {},
  valk: {},
  leon: {}
}

/** Co-op technique sprites `tech:<species>`. */
export const TECH_SPEC: Record<Species, Record<string, AnimSpec>> = {
  slime: Object.fromEntries(
    [2, 3, 4].flatMap((n) => {
      const big = { w: 192, h: 192, anchor: [96, 176] as const }
      return [
        [`jumbo_${n}_form`, { ...big, frames: 4, loop: false, fps: 12 }],
        [`jumbo_${n}_jump`, { ...big, frames: 3, loop: false, fps: 8, lift: true }],
        [`jumbo_${n}_land`, { ...big, frames: 5, loop: false, fps: 12 }]
      ]
    })
  ),
  rat: {},
  crow: {},
  wolf: {}
}

/** Directional effects come in 16 turns (index a = angle / 22.5°, 0 = right, clockwise on screen). */
export const TURNS = 16
const turns = (prefix: string, spec: AnimSpec) =>
  Object.fromEntries(Array.from({ length: TURNS }, (_, a) => [`${prefix}_${a}`, spec]))

/** The shared effects sheet `fx`. Sizes are frame sizes; anchors are the frame centre unless listed. */
export const FX_SPEC: Record<string, AnimSpec> = {
  ...turns('slash', { w: 96, h: 96, frames: 4, loop: false, fps: 24 }), // sword crescent toward the turn
  spin: { w: 192, h: 192, frames: 6, loop: false, fps: 20 }, // 回転斬り ring
  bonk: { w: 64, h: 64, frames: 4, loop: false, fps: 20 }, // cleric staff impact star
  ...turns('arrow', { w: 32, h: 32, frames: 1, loop: false, fps: 1 }), // hero arrow
  ...turns('enemy_arrow', { w: 32, h: 32, frames: 1, loop: false, fps: 1 }), // guild arrow (darker fletching)
  bolt: { w: 32, h: 32, frames: 4, loop: true, fps: 16 }, // magic bolt
  orb: { w: 64, h: 64, frames: 4, loop: true, fps: 12 }, // 大魔弾
  fireball: { w: 32, h: 32, frames: 4, loop: true, fps: 14 }, // guild apprentice fire
  burst: { w: 96, h: 96, frames: 6, loop: false, fps: 20 }, // magic burst
  bigburst: { w: 192, h: 192, frames: 7, loop: false, fps: 18 },
  holy: { w: 224, h: 224, frames: 6, loop: false, fps: 16 }, // 聖なる輪
  heal: { w: 32, h: 48, frames: 6, loop: false, fps: 14, anchor: [16, 44] }, // rising sparkles
  hit: { w: 48, h: 48, frames: 4, loop: false, fps: 24 }, // impact spark
  clang: { w: 48, h: 48, frames: 4, loop: false, fps: 24 }, // blocked by a guard
  dust: { w: 32, h: 32, frames: 5, loop: false, fps: 16, anchor: [16, 26] },
  smoke: { w: 64, h: 64, frames: 6, loop: false, fps: 12, anchor: [32, 48] }, // enemy defeated poof
  splash: { w: 64, h: 64, frames: 5, loop: false, fps: 14, anchor: [32, 44] },
  leaf: { w: 16, h: 16, frames: 4, loop: true, fps: 10 }, // cut grass bits (particles)
  shard: { w: 16, h: 16, frames: 4, loop: true, fps: 12 }, // pot shards (particles)
  stun: { w: 32, h: 16, frames: 6, loop: true, fps: 10 }, // stars circling a head
  alert: { w: 16, h: 24, frames: 3, loop: false, fps: 12, anchor: [8, 23] }, // "!" when an enemy notices
  spark: { w: 16, h: 16, frames: 4, loop: true, fps: 16 }, // charge particles
  charge_full: { w: 64, h: 64, frames: 4, loop: true, fps: 16, anchor: [32, 56] }, // full-charge aura at the feet
  shock: { w: 160, h: 160, frames: 6, loop: false, fps: 20 }, // landing / slam shockwave
  soul: { w: 32, h: 48, frames: 4, loop: true, fps: 6, anchor: [16, 44] }, // downed hero's spirit bubble
  revive: { w: 96, h: 96, frames: 6, loop: false, fps: 14, anchor: [48, 80] },
  telegraph: { w: 64, h: 64, frames: 2, loop: true, fps: 8 }, // red ground warning tile for casters
  gem_sparkle: { w: 16, h: 16, frames: 4, loop: false, fps: 16 }
}

/** Pick-ups `items` (anchor = where it rests on the ground). */
export const ITEMS_SPEC: Record<string, AnimSpec> = {
  heart: { w: 32, h: 32, frames: 4, loop: true, fps: 6, anchor: [16, 28] },
  bigheart: { w: 32, h: 32, frames: 4, loop: true, fps: 6, anchor: [16, 28] },
  gem: { w: 32, h: 32, frames: 6, loop: true, fps: 10, anchor: [16, 28] },
  gem_big: { w: 32, h: 32, frames: 6, loop: true, fps: 10, anchor: [16, 28] },
  key: { w: 32, h: 32, frames: 4, loop: true, fps: 6, anchor: [16, 28] },
  orb: { w: 64, h: 64, frames: 8, loop: true, fps: 10, anchor: [32, 56] } // the stage's 陣の宝珠 shard
}

/** HUD and in-world UI glyphs `ui`. */
export const UI_SPEC: Record<string, AnimSpec> = {
  heart_full: { w: 16, h: 16, frames: 1, loop: false, fps: 1 },
  heart_half: { w: 16, h: 16, frames: 1, loop: false, fps: 1 },
  heart_empty: { w: 16, h: 16, frames: 1, loop: false, fps: 1 },
  gem: { w: 16, h: 16, frames: 1, loop: false, fps: 1 },
  key: { w: 16, h: 16, frames: 1, loop: false, fps: 1 },
  ...Object.fromEntries(JOBS.map((job) => [`job_${job}`, { w: 24, h: 24, frames: 1, loop: false, fps: 1 }])),
  ...Object.fromEntries(SPECIES.map((s) => [`species_${s}`, { w: 24, h: 24, frames: 1, loop: false, fps: 1 }])),
  cursor: { w: 16, h: 16, frames: 2, loop: true, fps: 4 },
  pip_full: { w: 12, h: 12, frames: 1, loop: false, fps: 1 }, // strength meter paw pips
  pip_empty: { w: 12, h: 12, frames: 1, loop: false, fps: 1 },
  ...turns('offscreen', { w: 16, h: 16, frames: 1, loop: false, fps: 1 }), // ally arrow at the screen edge
  bubble: { w: 32, h: 32, frames: 2, loop: true, fps: 3 } // interaction prompt bubble
}

/**
 * Stage props `props:<stage>`. Anchors map to the entity position: for grid props that is the centre of the
 * footprint, for standing props (pots, crystals) the base.
 */
export const PROPS_SPEC: Record<'meadow', Record<string, AnimSpec>> = {
  meadow: {
    block: { w: 64, h: 96, frames: 1, loop: false, fps: 1, anchor: [32, 64] }, // stone block, weight 2, 1×1
    boulder: { w: 128, h: 160, frames: 1, loop: false, fps: 1, anchor: [64, 96] }, // boulder, weight 4, 2×2
    pot: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 56] },
    pot_break: { w: 64, h: 64, frames: 5, loop: false, fps: 16, anchor: [32, 56] },
    grass: { w: 64, h: 80, frames: 3, loop: true, fps: 3, anchor: [32, 48] }, // cuttable tuft on a tile centre
    grass_cut: { w: 64, h: 80, frames: 4, loop: false, fps: 14, anchor: [32, 48] },
    bush: { w: 64, h: 80, frames: 1, loop: false, fps: 1, anchor: [32, 48] }, // solid decoration
    rock: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 32] },
    tree: { w: 128, h: 192, frames: 2, loop: true, fps: 1, anchor: [64, 160] }, // solid trunk; canopy sways
    flower: { w: 32, h: 32, frames: 2, loop: true, fps: 2, anchor: [16, 24] },
    fence_h: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 32] },
    fence_v: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 32] },
    plate_off: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 32] },
    plate_on: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 32] },
    plate2_off: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 32] },
    plate2_on: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 32] },
    bigplate_off: { w: 128, h: 128, frames: 1, loop: false, fps: 1, anchor: [64, 64] },
    bigplate_on: { w: 128, h: 128, frames: 1, loop: false, fps: 1, anchor: [64, 64] },
    crystal_off: { w: 64, h: 96, frames: 2, loop: true, fps: 3, anchor: [32, 72] },
    crystal_on: { w: 64, h: 96, frames: 4, loop: true, fps: 8, anchor: [32, 72] },
    crystal_hit: { w: 64, h: 96, frames: 4, loop: false, fps: 16, anchor: [32, 72] },
    lever_off: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 40] },
    lever_on: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 40] },
    lever_pull: { w: 64, h: 64, frames: 4, loop: false, fps: 12, anchor: [32, 40] },
    gate_closed: { w: 64, h: 96, frames: 1, loop: false, fps: 1, anchor: [32, 64] }, // iron bars on one tile
    gate_opening: { w: 64, h: 96, frames: 5, loop: false, fps: 12, anchor: [32, 64] }, // bars sink into the floor
    gate_open: { w: 64, h: 96, frames: 1, loop: false, fps: 1, anchor: [32, 64] },
    bossdoor_closed: { w: 192, h: 192, frames: 1, loop: false, fps: 1, anchor: [96, 160] }, // 3 tiles wide
    bossdoor_opening: { w: 192, h: 192, frames: 6, loop: false, fps: 8, anchor: [96, 160] },
    bossdoor_open: { w: 192, h: 192, frames: 1, loop: false, fps: 1, anchor: [96, 160] },
    sign: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 48] },
    chest_closed: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 48] },
    chest_opening: { w: 64, h: 64, frames: 4, loop: false, fps: 10, anchor: [32, 48] },
    chest_open: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 48] },
    acorn: { w: 96, h: 96, frames: 1, loop: false, fps: 1, anchor: [48, 80] }, // giant acorn, grip weight 3
    pedestal_off: { w: 128, h: 96, frames: 1, loop: false, fps: 1, anchor: [64, 64] }, // 2×1 footprint
    pedestal_on: { w: 128, h: 96, frames: 4, loop: true, fps: 8, anchor: [64, 64] },
    crackrock: { w: 128, h: 160, frames: 1, loop: false, fps: 1, anchor: [64, 96] }, // 2×2, only the press breaks it
    crackrock_break: { w: 128, h: 160, frames: 7, loop: false, fps: 14, anchor: [64, 96] },
    bounce: { w: 64, h: 64, frames: 1, loop: false, fps: 1, anchor: [32, 40] }, // bounce mushroom
    bounce_boing: { w: 64, h: 64, frames: 4, loop: false, fps: 16, anchor: [32, 40] },
    pillar: { w: 64, h: 160, frames: 1, loop: false, fps: 1, anchor: [32, 144] }, // ruins pillar, solid 1×1
    torch: { w: 32, h: 64, frames: 4, loop: true, fps: 10, anchor: [16, 56] },
    altar: { w: 128, h: 128, frames: 1, loop: false, fps: 1, anchor: [64, 80] } // where the orb appears
  }
}

/** Animated terrain kinds and their frame counts (tileRaster `frame` cycles through these at TILE_FPS). */
export const TILE_FRAMES: Partial<Record<string, number>> = { water: 4, current: 4, sludge: 4 }
export const TILE_FPS = 4

/** All sheet ids with their specs (stages without content yet list no ids). */
export function allSheetSpecs(): Record<string, Record<string, AnimSpec>> {
  const out: Record<string, Record<string, AnimSpec>> = {}
  for (const species of SPECIES) for (const job of JOBS) out[`hero:${species}:${job}`] = heroSpec(species)
  for (const stage of STAGES) for (const kind of ENEMIES[stage]) out[`enemy:${kind}`] = enemySpec(kind)
  for (const kind of ['elder', 'smith', 'seer', 'bard'] satisfies NpcKind[]) out[`npc:${kind}`] = NPC_SPEC
  for (const [kind, spec] of Object.entries(BOSS_SPEC)) if (Object.keys(spec).length) out[`boss:${kind}`] = spec
  for (const [species, spec] of Object.entries(TECH_SPEC)) if (Object.keys(spec).length) out[`tech:${species}`] = spec
  out.fx = FX_SPEC
  out.items = ITEMS_SPEC
  out.ui = UI_SPEC
  for (const [stage, spec] of Object.entries(PROPS_SPEC)) out[`props:${stage}`] = spec
  return out
}
