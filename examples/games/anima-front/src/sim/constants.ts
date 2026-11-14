/**
 * Sim-wide tunables that are not part of the data tables (DESIGN §2, §5, §9, §10). Everything is metres,
 * seconds and m/s. Data-driven numbers (antiques, species, foes, missions) stay in src/data.
 */

/** Fixed step (60 Hz). */
export const DT = 1 / 60
export const TICK_RATE = 60

// --- movement (DESIGN §9) ---------------------------------------------------------------------------------------
export const ACCEL_GROUND = 60
export const ACCEL_AIR = 16
export const STEP_UP = 0.45
export const COYOTE_TIME = 0.1
export const JUMP_BUFFER = 0.1
export const DASH_TIME = 0.2
export const DASH_SPEED = 21
export const DASH_COOLDOWN = 0.9
export const DASH_COST = 0.5
/** Penguin belly slide: 0.9 s covering twice the dash distance. */
export const SLIDE_TIME = 0.9
export const SLIDE_SPEED = (DASH_SPEED * DASH_TIME * 2) / SLIDE_TIME
export const SHIBA_DASH_FACTOR = 0.7
/** Fox leaf decoy lifetime. */
export const LEAF_DECOY_TIME = 1.5
/** Falls faster than this are "hard" landings (short slowdown except for rabbits). */
export const HARD_LANDING_SPEED = 14
export const LANDING_SLOW_TIME = 0.18
export const LANDING_SLOW_FACTOR = 0.55
export const GLIDE_FALL = 2.2
export const GLIDE_FORWARD = 10
/** Speed multiplier while down (生身). */
export const DOWN_SPEED_FACTOR = 0.35
/** Speed multiplier while zoomed with フクロウアイ. */
export const ZOOM_SPEED_FACTOR = 0.6
/** Pads: horizontal trigger radius, vertical tolerance and re-trigger lock. */
export const PAD_RADIUS = 0.95
export const PAD_HEIGHT = 0.6
export const PAD_RELAUNCH = 0.5
/** Hook arrival distance. */
export const HOOK_ARRIVE = 1.2
export const MAX_PITCH = 1.35

// --- aim (DESIGN §9) ----------------------------------------------------------------------------------------------
/** Projectiles fly toward the aim ray's first hit, or this far along it. */
export const AIM_RANGE = 250
/**
 * Paw muzzle offset from the aim pivot (DESIGN §9), in metres for a 1.25 m animal (scaled by height / 1.25):
 * `up` below the pivot and `forward` along the body's facing. Sideways each paw sits `side` beyond the body
 * radius on its own side (right paw right, left paw left), i.e. pivot-relative it is
 * ±(radius + side) − shoulderOffset × shoulder along the right axis.
 */
export const MUZZLE = { side: 0.12, up: -0.38, forward: 0.55 } as const

// --- anima (DESIGN §5) --------------------------------------------------------------------------------------------
export const REGEN_DELAY = 4
export const REGEN_RATE = 1.5
export const MIN_REGEN_DELAY = 0.5
export const CRITICAL_OFF = 0.15
export const CRITICAL_ON = 0.2
export const BURN_WINDOW = 3
export const BASE_REGEN = 12
export const BASE_INTRUDER_DPS = 20
export const SHARD_RANGE = 6
export const SHARD_LIFE = 25
export const SHARD_SPEED = 14
export const HAMSTER_SHARD = 1.5

// --- downs, revives, respawns (DESIGN §5, §12) -------------------------------------------------------------------
export const DOWN_TIME = 15
export const AWAY_TIME = 8
export const REVIVE_RANGE = 2.5
export const REVIVE_TIME = 2
export const REVIVE_COST = 15
export const REVIVE_ANIMA = 0.3
export const REVIVE_INVULN = 1
export const PVP_RESPAWN = 5
export const PVP_PROTECT = 2
export const PVE_PROTECT = 2
export const TRAINING_RESPAWN = 3

// --- combat (DESIGN §10) ------------------------------------------------------------------------------------------
export const CREDIT_WINDOW = 10
export const BLAST_EDGE = 0.4
export const BLAST_KNOCK = 6
export const BRUTE_KNOCK = 9
export const BEAR_KNOCK = 0.4
export const BEAR_MELEE = 1.2
export const PUFFER_FALLOFF = 0.3
/** Projectile collision radius (bullets) and grenade radius. */
export const SHOT_RADIUS = 0.08
export const LOB_RADIUS = 0.25
/** Swap time between antiques in one paw. */
export const SWAP_TIME = 0.25
/** At most this many presses wait in a paw's queue. */
export const PRESS_QUEUE_MAX = 3
/** Seconds a cloak takes to fade fully in/out (view only). */
export const CLOAK_FADE_RATE = 4
/** Foes switch to a decoy within this distance. */
export const DECOY_RADIUS = 22
/** Minimum seconds between 'empty' events of one paw while a hold keeps failing. */
export const EMPTY_GAP = 0.35

// --- foes (DESIGN §11) --------------------------------------------------------------------------------------------
export const FOE_SPAWN_TIME = 0.8
export const FOE_DYING_TIME = 0.6
export const FLOW_CELL = 2
export const FLOW_REFRESH = 0.5
export const FOE_AGGRO = 16
/** Damage factor of クロヅメ avatars' antiques (× the difficulty damage multiplier). */
export const AVATAR_DAMAGE = 0.45
/** Bot skill of クロヅメ avatars per difficulty (veterans on 決死). */
export const AVATAR_SKILL: Record<string, number> = { easy: 0.35, normal: 0.5, hard: 0.68 }
/** クイツクシ body hits while its core is closed. */
export const MAW_CLOSED = 0.25
/** Seconds クイツクシ takes no damage after each phase change (its maw shut); the core reopens 2 s later. */
export const MAW_PHASE_GUARD = 4
/** Share of クイツクシ's health one core opening can lose before the maw flinches shut. */
export const MAW_WINDOW_CAP = 0.1
/** ゴウテツ body hits outside the legs and the exposed core. */
export const GOUTETSU_ARMOR = 0.35
/** ゴウテツ attack cooldown multiplier after it rises enraged at half health. */
export const GOUTETSU_ENRAGED_CD = 0.75
/** ゴウテツ leg health (× difficulty hp × the boss's squad scaling); broken legs regrow fully when it rises. */
export const GOUTETSU_LEG_HP = 800
/** Seconds ゴウテツ kneels (core exposed) after two legs break. */
export const GOUTETSU_KNEEL = 8
/** Share of ゴウテツ's health its exposed core can lose in one kneel before it rises. */
export const GOUTETSU_KNEEL_CAP = 0.35
/** Damage share the lighthouse and the cart take from クロヅメ antiques. */
export const OBJECTIVE_ARMOR = 0.35
export const ACID_PUDDLE_DPS = 4
export const ACID_PUDDLE_TIME = 4

// --- modes (DESIGN §12) -------------------------------------------------------------------------------------------
export const WAVE_GAP = 8
export const WAVE_MAX = 70
/** Share of a difficulty's peak offset (peak / 90 − 1) applied to wave spawn counts. */
export const WAVE_COUNT_SCALE = 0.5
/** 巣核: every living node sends this many ツブテ (× the wave count scale) every NODE_SPAWN_GAP seconds. */
export const NODE_SPAWN_COUNT = 4
export const NODE_SPAWN_GAP = 18
/** Share of a difficulty's hp offset (hp − 1) applied to bosses (決死 ×1.025, 訓練 ×0.925). */
export const BOSS_DIFFICULTY_SCALE = 0.25
export const OBJECTIVE_HURT_GAP = 20
export const RESULT_HOLD = 4
export const PVP_LAST_SPURT = 60
export const PVP_SUDDEN_DEATH = 60
export const DEFAULT_PVP_DURATION = 360
export const DEFAULT_COUNTDOWN = 3
