/**
 * Shared vocabulary of マモノ陣形: every id used by the simulation, the art, the audio and the UI.
 * Adding an id here is a contract change: art sheets, stage data and tests must follow.
 */

export const TILE = 64

export const JOBS = ['sword', 'mage', 'archer', 'cleric'] as const
export type Job = (typeof JOBS)[number]
export const JOB_NAMES: Record<Job, string> = { sword: '剣士', mage: '魔法使い', archer: '弓使い', cleric: '僧侶' }
/** Slot colours (CSS) of the four jobs, used by the HUD, name tags and formation links. */
export const JOB_COLORS: Record<Job, string> = {
  sword: '#ec5b50',
  mage: '#4f8fe8',
  archer: '#6cc95a',
  cleric: '#f2c84a'
}

export const SPECIES = ['slime', 'rat', 'crow', 'wolf'] as const
export type Species = (typeof SPECIES)[number]
export const SPECIES_NAMES: Record<Species, string> = {
  slime: 'スライム',
  rat: 'ネズミ',
  crow: 'カラス',
  wolf: 'ウルフ'
}

export const STAGES = ['meadow', 'sewer', 'tower', 'forest'] as const
export type StageId = (typeof STAGES)[number]
export const STAGE_SPECIES: Record<StageId, Species> = { meadow: 'slime', sewer: 'rat', tower: 'crow', forest: 'wolf' }
export const STAGE_NAMES: Record<StageId, string> = {
  meadow: 'ぷるぷる草原と古城跡',
  sewer: '地下水路と穀物庫',
  tower: '風鳴りの崖と時計塔',
  forest: '月影の森と白銀の砦'
}

/** Art directions: side faces right and is mirrored for left. */
export const DIRS = ['down', 'up', 'side'] as const
export type Dir = (typeof DIRS)[number]

/** Sprite direction for a facing angle (radians, 0 = right, y down) plus whether to mirror the side frames. */
export function dirOf(angle: number): { dir: Dir; flip: boolean } {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  if (Math.abs(c) >= 0.6) return { dir: 'side', flip: c < 0 }
  return { dir: s > 0 ? 'down' : 'up', flip: false }
}

/** Enemy kinds per stage (the adventurers' guild). */
export const ENEMIES = {
  meadow: ['rookie', 'bowman', 'apprentice', 'shieldman'],
  sewer: ['thief', 'alchemist', 'ratcatcher', 'spearguard'],
  tower: ['falconer', 'crossbow', 'windmage', 'bellmonk'],
  forest: ['hunter', 'paladin', 'icewitch', 'heavy']
} as const satisfies Record<StageId, readonly string[]>
export type EnemyKind = (typeof ENEMIES)[StageId][number]
export const ENEMY_NAMES: Record<EnemyKind, string> = {
  rookie: '見習い剣士',
  bowman: '村の弓兵',
  apprentice: '見習い魔法使い',
  shieldman: '盾兵',
  thief: '盗賊',
  alchemist: '錬金術師',
  ratcatcher: 'ネズミ捕り',
  spearguard: '槍衛兵',
  falconer: '鷹匠',
  crossbow: '弩兵',
  windmage: '風の魔導士',
  bellmonk: '鐘番の修道士',
  hunter: '狩人',
  paladin: '聖騎士',
  icewitch: '氷の魔女',
  heavy: '重装兵'
}

export const BOSSES: Record<StageId, string> = { meadow: 'garud', sewer: 'milda', tower: 'valk', forest: 'leon' }
export type BossKind = 'garud' | 'milda' | 'valk' | 'leon'
export const BOSS_NAMES: Record<BossKind, string> = {
  garud: '盾騎士団長ガルド',
  milda: '猫使いの魔女ミルダ',
  valk: '竜騎士ヴァルク',
  leon: '勇者レオン'
}

export const NPCS: Record<StageId, string> = { meadow: 'elder', sewer: 'smith', tower: 'seer', forest: 'bard' }
export type NpcKind = 'elder' | 'smith' | 'seer' | 'bard'
export const NPC_NAMES: Record<NpcKind, string> = {
  elder: '長老スライム（賢者）',
  smith: 'ネズミの鍛冶屋',
  seer: 'カラスの占い師',
  bard: '老狼の吟遊詩人'
}

/**
 * Terrain kinds. walk = heroes can walk on it; air = an airborne hero (jumping slime, flying crow) may pass
 * over it, and landing on a non-walkable air tile is a fall.
 */
export const TILE_KINDS = {
  grass: { walk: true, air: true },
  flowers: { walk: true, air: true },
  path: { walk: true, air: true },
  floor: { walk: true, air: true },
  bridge: { walk: true, air: true },
  wall: { walk: false, air: false },
  hedge: { walk: false, air: false },
  fence: { walk: false, air: true },
  water: { walk: false, air: true },
  pit: { walk: false, air: true },
  spikes: { walk: true, air: true },
  // Stage 2–4 kinds.
  brick: { walk: false, air: false },
  sewer: { walk: true, air: true },
  current: { walk: true, air: true },
  sludge: { walk: false, air: true },
  planks: { walk: true, air: true },
  hole: { walk: false, air: false },
  rock: { walk: false, air: false },
  cliff: { walk: true, air: true },
  sky: { walk: false, air: true },
  roof: { walk: false, air: true },
  snow: { walk: true, air: true },
  ice: { walk: true, air: true },
  forest: { walk: true, air: true },
  thicket: { walk: false, air: false },
  fortwall: { walk: false, air: false }
} as const satisfies Record<string, { walk: boolean; air: boolean }>
export type TileKind = keyof typeof TILE_KINDS

/** Terrain kinds each stage's tileset must draw. */
export const STAGE_TILES: Record<StageId, readonly TileKind[]> = {
  meadow: ['grass', 'flowers', 'path', 'floor', 'bridge', 'wall', 'hedge', 'fence', 'water', 'pit', 'spikes'],
  sewer: ['sewer', 'current', 'sludge', 'planks', 'brick', 'hole', 'floor', 'bridge', 'pit', 'wall'],
  tower: ['cliff', 'rock', 'sky', 'roof', 'floor', 'planks', 'bridge', 'wall', 'grass', 'pit'],
  forest: ['forest', 'thicket', 'snow', 'ice', 'water', 'fortwall', 'floor', 'bridge', 'path', 'pit']
}
