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
import {
  DIRS,
  ENEMIES,
  JOBS,
  SPECIES,
  STAGES,
  type BossKind,
  type Dir,
  type NpcKind,
  type Species,
  type StageId
} from '../vocab'

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
  /** Shared-sheet entries introduced for one stage: only required once that stage is released. */
  stage?: StageId
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
  // The thief's hit-and-run dash (low, fast, a dust trail in the sprite).
  if (kind === 'thief') Object.assign(spec, perDir('dash', { ...C64, frames: 3, loop: true, fps: 14 }))
  return spec
}

/** Small summoned creatures `minion:<kind>` (the falconer's hawk). */
export const MINION_SPEC: Record<string, Record<string, AnimSpec>> = {
  hawk: {
    ...perDir('fly', { ...C64, frames: 4, loop: true, fps: 12, lift: true }),
    ...perDir('swoop', { ...C64, frames: 3, loop: false, fps: 14, hit: 1 }),
    hurt: { ...C64, frames: 2, loop: false, fps: 12 },
    death: { ...C64, frames: 4, loop: false, fps: 10 }
  }
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
  // Stage 2: the cat witch rides a broom (hovering, never touches the ground) behind her giant cat.
  milda: {
    ...perDir('idle', { ...C128, frames: 4, loop: true, fps: 6, lift: true }), // hovering on the broom
    ...perDir('cast', { ...C128, frames: 4, loop: false, fps: 10, hit: 2, lift: true }), // spell at a hero
    summon: { ...C128, frames: 4, loop: false, fps: 8, lift: true }, // calls kittens / thieves
    ...perDir('hurt', { ...C128, frames: 2, loop: false, fps: 12, lift: true }),
    broken: { ...C128, frames: 4, loop: true, fps: 6 }, // knocked off the broom, dizzy on the floor
    death: { ...C128, frames: 8, loop: false, fps: 8 }
  },
  // Stage 3: the dragoon rides a wyvern (192×192 frames, feet/shadow point at (96, 176)).
  valk: {
    ...perDir('fly', { w: 192, h: 192, anchor: [96, 176], frames: 6, loop: true, fps: 10, lift: true }),
    ...perDir('dive', { w: 192, h: 192, anchor: [96, 176], frames: 4, loop: false, fps: 12, hit: 2, lift: true }),
    ...perDir('breath', { w: 192, h: 192, anchor: [96, 176], frames: 4, loop: true, fps: 10, lift: true }),
    ...perDir('ground', { w: 192, h: 192, anchor: [96, 176], frames: 4, loop: true, fps: 6 }), // landed
    downed: { w: 192, h: 192, anchor: [96, 176], frames: 4, loop: true, fps: 6 }, // pulled down by the tornado
    ...perDir('hurt', { w: 192, h: 192, anchor: [96, 176], frames: 2, loop: false, fps: 12 }),
    death: { w: 192, h: 192, anchor: [96, 176], frames: 8, loop: false, fps: 8 }
  },
  // Stage 4: the guild's hero, two phases (phase 2 glows with holy light).
  leon: {
    ...perDir('idle', { ...C128, frames: 4, loop: true, fps: 5 }),
    ...perDir('walk', { ...C128, frames: 6, loop: true, fps: 10 }),
    ...perDir('windup', { ...C128, frames: 3, loop: false, fps: 10 }),
    ...perDir('slash', { ...C128, frames: 5, loop: false, fps: 16, hit: 2 }), // sword combo hit
    ...perDir('dash', { ...C128, frames: 3, loop: true, fps: 14 }),
    pillar: { ...C128, frames: 6, loop: false, fps: 10, hit: 4 }, // sword raised: holy pillars fall
    shield: { ...C128, frames: 4, loop: true, fps: 8 }, // inside the holy shield bubble
    awaken: { ...C128, frames: 8, loop: false, fps: 8 }, // phase 2 transformation
    broken: { ...C128, frames: 4, loop: true, fps: 6 },
    ...perDir('hurt', { ...C128, frames: 2, loop: false, fps: 12 }),
    death: { ...C128, frames: 8, loop: false, fps: 8 }
  }
}

/** Boss companions drawn as their own entity: `boss:cat` (milda's giant cat). */
export const BOSS_EXTRA_SPEC: Record<string, Record<string, AnimSpec>> = {
  cat: {
    ...perDir('idle', { ...C128, frames: 4, loop: true, fps: 5 }),
    ...perDir('walk', { ...C128, frames: 6, loop: true, fps: 10 }),
    ...perDir('crouch', { ...C128, frames: 2, loop: true, fps: 8 }), // pounce windup, tail lashing
    ...perDir('pounce', { ...C128, frames: 4, loop: false, fps: 12, hit: 2, lift: true }),
    ...perDir('swipe', { ...C128, frames: 4, loop: false, fps: 14, hit: 1 }),
    stunned: { ...C128, frames: 4, loop: true, fps: 6 }, // dizzy after the stampede
    ...perDir('hurt', { ...C128, frames: 2, loop: false, fps: 12 }),
    flee: { ...C128, frames: 4, loop: true, fps: 12 } // runs off when the witch falls
  }
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
  // チューチュー大行進: the heroes run in their dash frames; these are the trail and the gnawed debris.
  rat: {
    stampede_dust: { w: 96, h: 64, frames: 6, loop: true, fps: 14 }, // billowing dust behind the line
    gnaw_chips: { w: 64, h: 64, frames: 5, loop: false, fps: 14 }, // wood chips flying from a barricade
    rush_aura: { w: 64, h: 64, frames: 4, loop: true, fps: 14, anchor: [32, 56] } // speed lines around a rat
  },
  // 黒羽の大旋風: a whirlwind of black feathers (sizes per tier), crows circle inside it.
  crow: {
    tornado_2: { w: 192, h: 192, anchor: [96, 176], frames: 6, loop: true, fps: 14 },
    tornado_3: { w: 224, h: 224, anchor: [112, 208], frames: 6, loop: true, fps: 14 },
    tornado_4: { w: 256, h: 256, anchor: [128, 240], frames: 6, loop: true, fps: 14 },
    feather: { w: 16, h: 16, frames: 4, loop: true, fps: 10 }
  },
  // 月下群狼陣: the joint howl, the lunge streak and the closing crescent wave.
  wolf: {
    howl_wave: { w: 320, h: 320, frames: 5, loop: false, fps: 12 },
    moon: { w: 256, h: 256, frames: 6, loop: false, fps: 10 }, // a full moon flaring behind the pack
    ...Object.fromEntries(
      Array.from({ length: 16 }, (_, a) => [`lunge_${a}`, { w: 96, h: 96, frames: 4, loop: false, fps: 18 }])
    ),
    ...Object.fromEntries(
      Array.from({ length: 16 }, (_, a) => [`crescent_${a}`, { w: 160, h: 160, frames: 4, loop: false, fps: 16 }])
    )
  }
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
  gem_sparkle: { w: 16, h: 16, frames: 4, loop: false, fps: 16 },
  // Stage 2–4 hazards and projectiles.
  bomb: { w: 32, h: 32, frames: 2, loop: true, fps: 8, stage: 'sewer' }, // alchemist's lobbed potion flask (fuse glint)
  bomb_burst: { w: 96, h: 96, frames: 6, loop: false, fps: 18, stage: 'sewer' }, // green-purple potion explosion
  hex: { w: 32, h: 32, frames: 4, loop: true, fps: 12, stage: 'sewer' }, // the cat witch's homing violet hex bolt
  snare: { w: 48, h: 48, frames: 2, loop: true, fps: 4, anchor: [24, 30], stage: 'sewer' }, // rat-catcher's snare on the ground
  snare_snap: { w: 48, h: 48, frames: 3, loop: false, fps: 16, anchor: [24, 30], stage: 'sewer' },
  gust: { w: 64, h: 64, frames: 4, loop: true, fps: 12, stage: 'tower' }, // wind mage's travelling gust
  icespike: { w: 64, h: 96, frames: 6, loop: false, fps: 16, anchor: [32, 80], stage: 'forest' }, // ice witch spikes erupting
  pillar: { w: 64, h: 192, frames: 6, loop: false, fps: 14, anchor: [32, 176], stage: 'forest' }, // the hero's holy pillar
  fire_breath: { w: 64, h: 64, frames: 4, loop: true, fps: 14, stage: 'tower' }, // one puff of the wyvern's breath
  dash_trail: { w: 64, h: 64, frames: 3, loop: false, fps: 16, anchor: [32, 56], stage: 'sewer' }, // rat dash afterimage
  howl: { w: 128, h: 128, frames: 5, loop: false, fps: 14, stage: 'forest' }, // a wolf's howl ring
  wind: { w: 64, h: 16, frames: 4, loop: true, fps: 12, stage: 'tower' }, // ambient wind streak
  snow: { w: 8, h: 8, frames: 4, loop: true, fps: 6, stage: 'forest' }, // snowflake particle
  ember: { w: 8, h: 8, frames: 4, loop: true, fps: 10, stage: 'forest' }, // brazier ember particle
  drip: { w: 16, h: 32, frames: 5, loop: false, fps: 12, anchor: [8, 30], stage: 'sewer' }, // sewer drip splash
  moonlight: { w: 96, h: 96, frames: 4, loop: true, fps: 8, stage: 'forest' } // glow over a lit moonstone
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

const prop = (w: number, h: number, frames: number, anchor: readonly [number, number], loop = false, fps = 1) => ({
  w,
  h,
  frames,
  anchor,
  loop,
  fps: frames > 1 && fps === 1 ? 12 : fps
})

/**
 * Puzzle and furniture props every stage sheet draws in its own style, so the simulation's generic parts (plates,
 * levers, gates, chests, pushable blocks, liftable pots, crystals, the orb altar) work in any stage.
 */
const COMMON_PROPS: Record<string, AnimSpec> = {
  block: prop(64, 96, 1, [32, 64]), // pushable, weight 2, 1×1
  pot: prop(64, 64, 1, [32, 56]), // liftable and throwable
  pot_break: prop(64, 64, 5, [32, 56], false, 16),
  rock: prop(64, 64, 1, [32, 32]),
  plate_off: prop(64, 64, 1, [32, 32]),
  plate_on: prop(64, 64, 1, [32, 32]),
  plate2_off: prop(64, 64, 1, [32, 32]),
  plate2_on: prop(64, 64, 1, [32, 32]),
  crystal_off: prop(64, 96, 2, [32, 72], true, 3),
  crystal_on: prop(64, 96, 4, [32, 72], true, 8),
  crystal_hit: prop(64, 96, 4, [32, 72], false, 16),
  lever_off: prop(64, 64, 1, [32, 40]),
  lever_on: prop(64, 64, 1, [32, 40]),
  lever_pull: prop(64, 64, 4, [32, 40], false, 12),
  gate_closed: prop(64, 96, 1, [32, 64]),
  gate_opening: prop(64, 96, 5, [32, 64], false, 12),
  gate_open: prop(64, 96, 1, [32, 64]),
  bossdoor_closed: prop(192, 192, 1, [96, 160]),
  bossdoor_opening: prop(192, 192, 6, [96, 160], false, 8),
  bossdoor_open: prop(192, 192, 1, [96, 160]),
  sign: prop(64, 64, 1, [32, 48]),
  chest_closed: prop(64, 64, 1, [32, 48]),
  chest_opening: prop(64, 64, 4, [32, 48], false, 10),
  chest_open: prop(64, 64, 1, [32, 48]),
  torch: prop(32, 64, 4, [16, 56], true, 10),
  altar: prop(128, 128, 1, [64, 80])
}

/**
 * Stage props `props:<stage>`. Anchors map to the entity position: for grid props that is the centre of the
 * footprint, for standing props (pots, crystals) the base. Stages 2–4 draw COMMON_PROPS plus their own gimmicks.
 */
export const PROPS_SPEC: Record<'meadow' | 'sewer' | 'tower' | 'forest', Record<string, AnimSpec>> = {
  // Stage 2 地下水路と穀物庫: sewers (dim, torch-lit) leading up into a wooden granary.
  sewer: {
    ...COMMON_PROPS,
    crate: prop(64, 96, 1, [32, 64]), // pushable, weight 1
    bigcrate: prop(128, 160, 1, [64, 96]), // pushable, weight 4, 2×2
    barrel: prop(64, 64, 1, [32, 56]), // liftable
    barrel_break: prop(64, 64, 5, [32, 56], false, 16),
    cheese: prop(96, 96, 1, [48, 80]), // giant cheese wheel, grip weight 3
    scale_off: prop(128, 96, 1, [64, 64]), // the cheese's pedestal (a big grain scale)
    scale_on: prop(128, 96, 4, [64, 64], true, 8),
    valve_off: prop(64, 64, 1, [32, 40]), // turned with E
    valve_on: prop(64, 64, 1, [32, 40]),
    valve_turn: prop(64, 64, 6, [32, 40], false, 12),
    sluice_closed: prop(64, 96, 1, [32, 64]), // gate piece across a water channel
    sluice_opening: prop(64, 96, 5, [32, 64], false, 10),
    sluice_open: prop(64, 96, 1, [32, 64]),
    barricade: prop(128, 128, 1, [64, 96]), // 2×1 wooden barricade, only the stampede gnaws through
    barricade_break: prop(128, 128, 7, [64, 96], false, 14),
    mousetrap_idle: prop(64, 64, 1, [32, 40]),
    mousetrap_snap: prop(64, 64, 4, [32, 40], false, 16),
    lamp: prop(32, 64, 4, [16, 56], true, 8), // hanging lantern on a post
    sack: prop(64, 64, 1, [32, 52]),
    grate: prop(64, 64, 1, [32, 32]), // floor drain (decoration)
    pipe: prop(64, 96, 2, [32, 80], true, 3), // wall outlet dripping into the channel
    haybale: prop(64, 80, 1, [32, 56]),
    shelf: prop(128, 128, 1, [64, 112]),
    cobweb: prop(64, 64, 1, [32, 32])
  },
  // Stage 3 風鳴りの崖と時計塔: windy cliffs over the clouds and a clocktower.
  tower: {
    ...COMMON_PROPS,
    vent: prop(64, 64, 4, [32, 32], true, 12), // updraft vent: refills flight
    windmill: prop(128, 192, 1, [64, 160]),
    windmill_spin: prop(128, 192, 6, [64, 160], true, 14), // spun by the tornado
    // Drawbridge pieces (one per sky tile; 64×80 with the tile in the lower 64 rows). A run of pieces reads as one
    // bridge: the renderer draws `_up_<row>` only on the hinge column (the raised leaf, posts and chains), the
    // `_lowering_<row>` free edge at the end of the deck it unrolls from the hinge, and `_down_<row><col>` with
    // row n/m/s/o (north edge, inside, south edge, one tile wide) and col h/m/e (hinge end, inside, free end).
    // The plain names are the stand-alone one-tile bridge.
    drawbridge_up: prop(80, 80, 1, [40, 48]),
    drawbridge_lowering: prop(80, 80, 5, [40, 48], false, 10),
    drawbridge_down: prop(80, 80, 1, [40, 48]),
    ...Object.fromEntries(
      (['n', 'm', 's'] as const).flatMap((row) => [
        [`drawbridge_up_${row}`, prop(80, 80, 1, [40, 48])],
        [`drawbridge_lowering_${row}`, prop(80, 80, 5, [40, 48], false, 10)]
      ])
    ),
    ...Object.fromEntries(
      (['n', 'm', 's', 'o'] as const).flatMap((row) =>
        (['h', 'm', 'e'] as const).map((col) => [`drawbridge_down_${row}${col}`, prop(80, 80, 1, [40, 48])])
      )
    ),
    bell: prop(64, 96, 1, [32, 80]),
    bell_ring: prop(64, 96, 6, [32, 80], false, 14),
    goldbell: prop(96, 96, 1, [48, 80]), // grip weight 4
    hook_off: prop(128, 96, 1, [64, 64]), // the gold bell's frame
    hook_on: prop(128, 96, 4, [64, 64], true, 8),
    lockdoor_closed: prop(64, 96, 1, [32, 64]), // opened with a key
    lockdoor_opening: prop(64, 96, 5, [32, 64], false, 10),
    lockdoor_open: prop(64, 96, 1, [32, 64]),
    gear: prop(64, 64, 4, [32, 32], true, 8), // decoration
    flag: prop(64, 96, 4, [32, 88], true, 10),
    cloud: prop(192, 96, 2, [96, 48], true, 1)
  },
  // Stage 4 月影の森と白銀の砦: a moonlit snowy forest and the guild's silver fortress (dark: lights matter).
  forest: {
    ...COMMON_PROPS,
    moonstone_off: prop(64, 96, 1, [32, 72]), // lit by a howl
    moonstone_on: prop(64, 96, 4, [32, 72], true, 8),
    bigmoon_off: prop(128, 160, 1, [64, 128]), // needs a resonant howl or the pack technique
    bigmoon_on: prop(128, 160, 4, [64, 128], true, 8),
    iceblock: prop(64, 96, 1, [32, 64]), // pushable, slides until blocked
    icewall: prop(128, 160, 1, [64, 96]), // 2×2, only the pack technique shatters it
    icewall_break: prop(128, 160, 7, [64, 96], false, 14),
    log: prop(128, 96, 1, [64, 64]), // battering-ram log, grip weight 4
    ramslot_off: prop(128, 96, 1, [64, 64]),
    ramslot_on: prop(128, 96, 4, [64, 64], true, 8),
    snowpile: prop(64, 64, 1, [32, 40]),
    snowpile_dig: prop(64, 64, 5, [32, 40], false, 14),
    brazier: prop(64, 96, 4, [32, 80], true, 10),
    pine: prop(128, 192, 2, [64, 160], true, 1),
    deadtree: prop(128, 192, 1, [64, 160]),
    banner: prop(64, 128, 4, [32, 120], true, 8),
    tent: prop(128, 128, 1, [64, 112])
  },
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
  for (const [kind, spec] of Object.entries(BOSS_EXTRA_SPEC)) out[`boss:${kind}`] = spec
  for (const [kind, spec] of Object.entries(MINION_SPEC)) out[`minion:${kind}`] = spec
  for (const [species, spec] of Object.entries(TECH_SPEC)) if (Object.keys(spec).length) out[`tech:${species}`] = spec
  out.fx = FX_SPEC
  out.items = ITEMS_SPEC
  out.ui = UI_SPEC
  for (const [stage, spec] of Object.entries(PROPS_SPEC)) out[`props:${stage}`] = spec
  return out
}
