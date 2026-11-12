/**
 * Event → effect tables (DESIGN §15). Pure, so coverage of every SimEvent type, ShotKind and FoeAttack is
 * unit-tested; the Effects director (effects.ts) implements each entry.
 */
import type { FoeAttack } from '../../data/enemies'
import { ITEMS, type ItemId } from '../../data/items'
import type { HitSurface, ShotKind, SimEventType, Surface } from '../../sim/types'

/** Colour of a projectile/antique effect (sRGB hex). */
export function shotColor(kind: ShotKind): number {
  if (kind in ITEMS) return ITEMS[kind as ItemId].color
  return FOE_SHOT_COLORS[kind as Exclude<ShotKind, ItemId>]
}

export const FOE_SHOT_COLORS: Record<'acid' | 'laser' | 'plasma' | 'missile' | 'acidRain', number> = {
  acid: 0xb6ff3a,
  laser: 0xff3a6a,
  plasma: 0x7ae8ff,
  missile: 0xffa040,
  acidRain: 0xc07aff
}

export type MuzzleLook = 'flash' | 'puff' | 'spark' | 'leaf' | 'none'

/** How a fire event of each kind looks at the muzzle and whether it draws a tracer streak. */
export const FIRE_LOOK: Record<ShotKind, { muzzle: MuzzleLook; tracer: boolean; recoil: number; shake: number }> = {
  claw: { muzzle: 'spark', tracer: false, recoil: 0.004, shake: 0 },
  orca: { muzzle: 'spark', tracer: false, recoil: 0.006, shake: 0 },
  narwhal: { muzzle: 'spark', tracer: false, recoil: 0.008, shake: 0.1 },
  mammoth: { muzzle: 'spark', tracer: false, recoil: 0.012, shake: 0.25 },
  mantis: { muzzle: 'spark', tracer: false, recoil: 0.006, shake: 0 },
  bee: { muzzle: 'flash', tracer: true, recoil: 0.006, shake: 0 },
  wood: { muzzle: 'flash', tracer: true, recoil: 0.005, shake: 0.02 },
  humming: { muzzle: 'flash', tracer: true, recoil: 0.003, shake: 0.01 },
  puffer: { muzzle: 'flash', tracer: true, recoil: 0.03, shake: 0.12 },
  owl: { muzzle: 'flash', tracer: true, recoil: 0.04, shake: 0.15 },
  swallow: { muzzle: 'puff', tracer: false, recoil: 0.012, shake: 0.05 },
  pillbug: { muzzle: 'puff', tracer: false, recoil: 0.01, shake: 0.03 },
  eel: { muzzle: 'spark', tracer: false, recoil: 0.002, shake: 0 },
  hippo: { muzzle: 'flash', tracer: false, recoil: 0.06, shake: 0.3 },
  turtle: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  armadillo: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  hedgehog: { muzzle: 'spark', tracer: false, recoil: 0, shake: 0 },
  jelly: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  fang: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  hawk: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  rhino: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  sloth: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  koala: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  cheetah: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  camel: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  frog: { muzzle: 'puff', tracer: false, recoil: 0.004, shake: 0 },
  gecko: { muzzle: 'puff', tracer: false, recoil: 0.008, shake: 0 },
  momonga: { muzzle: 'none', tracer: false, recoil: 0, shake: 0 },
  leaf: { muzzle: 'leaf', tracer: false, recoil: 0, shake: 0 },
  bat: { muzzle: 'puff', tracer: false, recoil: 0.004, shake: 0 },
  octopus: { muzzle: 'puff', tracer: false, recoil: 0.006, shake: 0 },
  pigeon: { muzzle: 'puff', tracer: false, recoil: 0, shake: 0 },
  hermit: { muzzle: 'puff', tracer: false, recoil: 0.004, shake: 0 },
  honeyant: { muzzle: 'puff', tracer: false, recoil: 0.004, shake: 0 },
  acid: { muzzle: 'puff', tracer: false, recoil: 0, shake: 0 },
  laser: { muzzle: 'flash', tracer: true, recoil: 0, shake: 0 },
  plasma: { muzzle: 'flash', tracer: false, recoil: 0, shake: 0 },
  missile: { muzzle: 'puff', tracer: false, recoil: 0, shake: 0 },
  acidRain: { muzzle: 'puff', tracer: false, recoil: 0, shake: 0 }
}

/** Impact look per world surface: debris colour, dust colour, spark count. */
export const IMPACT_LOOK: Record<Surface, { dust: number; chip: number; sparks: number }> = {
  concrete: { dust: 0xcfc8bc, chip: 0x9a948a, sparks: 0 },
  metal: { dust: 0x9aa0a6, chip: 0x6a7076, sparks: 6 },
  wood: { dust: 0xc8a070, chip: 0x8a6440, sparks: 0 },
  crystal: { dust: 0xd8a8ff, chip: 0xb070ff, sparks: 3 },
  ground: { dust: 0xa88a64, chip: 0x6a5a40, sparks: 0 },
  foliage: { dust: 0x8ac060, chip: 0x5a9a3a, sparks: 0 },
  glass: { dust: 0xd8f0ff, chip: 0xbfe8ff, sparks: 2 },
  virtual: { dust: 0x9af4ff, chip: 0x4fe6ff, sparks: 4 }
}

/** Hit look per hit surface. */
export const HIT_LOOK: Record<HitSurface, { color: number; kind: 'ichor' | 'sparks' | 'fluff' | 'ripple' | 'chips' }> =
  {
    fur: { color: 0xfff1d6, kind: 'fluff' },
    chitin: { color: 0x9a4aff, kind: 'ichor' },
    metal: { color: 0xffd27a, kind: 'sparks' },
    shield: { color: 0x7ae8ff, kind: 'ripple' },
    guard: { color: 0x9fe7ff, kind: 'ripple' },
    shell: { color: 0xa6e07a, kind: 'ripple' },
    prop: { color: 0xffb08a, kind: 'chips' }
  }

/** Wind-up telegraph per foe attack. */
export type Telegraph = 'ring' | 'line' | 'sight' | 'self' | 'rain' | 'dome'

export const TELEGRAPH: Record<FoeAttack, Telegraph> = {
  bite: 'self',
  leap: 'line',
  acid: 'ring',
  charge: 'line',
  dive: 'line',
  laser: 'sight',
  mortar: 'ring',
  explode: 'self',
  shieldDome: 'dome',
  slam: 'ring',
  acidRain: 'rain',
  summon: 'self',
  missile: 'rain',
  sweep: 'sight',
  stomp: 'ring'
}

/** Visual answer of each event type (documentation + coverage test). */
export const EVENT_EFFECTS: Record<SimEventType, string> = {
  phase: 'victory confetti / defeat dimming; countdown → play burst',
  countdown: 'HUD (camera holds)',
  fire: 'muzzle flash + tracer in the antique colour, recoil kick for me',
  swing: 'swing trail arc in the antique colour',
  hit: 'impact per hit surface (ichor, sparks, fluff, ripple), damage number, hit flash',
  impact: 'dust + chips + sparks per surface',
  blast: 'toon fireball, smoke ring, shockwave, scorch decal, shake',
  empty: 'grey fizzle at the paw',
  swap: 'materialize sparkles at the paw',
  jump: 'dust puff (air: anima ring)',
  land: 'dust ring (hard: bigger + shake)',
  dash: 'speed streaks + FOV kick for me',
  launch: 'pad spring burst + green rings',
  hook: 'hook line (drawn while hooking) + attach sparks',
  glide: 'membrane wisps while gliding',
  cloak: 'leaf shimmer burst',
  deploy: 'deploy puff in the antique colour',
  propHit: 'chips at the prop',
  propBreak: 'shell shards burst',
  passives: 'flicker of the anima core',
  critical: 'red sparks around the player, hurt vignette for me',
  armorBreak: 'armour shards + white flash + shockwave',
  down: 'beacon pulse',
  reviveStart: 'green rising motes',
  revive: 'green burst ring',
  warp: 'warp light pillar',
  respawn: 'arrival light pillar + ring',
  ko: 'handled by armorBreak / foeDie (feed is HUD)',
  shard: 'shard sparkle pop',
  heal: 'golden motes rising',
  reveal: 'sonar ring sweep',
  foeSpawn: 'violet cracks / light pillar / warp flash per faction',
  foeWindup: 'ground ring at aim, charge line, laser sight, dome shimmer',
  foeAttack: 'attack burst (bite snap, laser flash, slam shockwave, dome)',
  foeDie: 'violet ichor splat or sparks + debris; boss: big burst',
  bossPhase: 'shockwave + shake',
  bossPart: 'sparks + debris burst at the boss',
  wave: 'HUD banner',
  waveClear: 'HUD banner',
  objective: 'capture pulse / damage sparks at the objective',
  radio: 'HUD subtitles',
  lastSpurt: 'HUD + grading pulse',
  suddenDeath: 'HUD',
  tutorial: 'HUD hint'
}
