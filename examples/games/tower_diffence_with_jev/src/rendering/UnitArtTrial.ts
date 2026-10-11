import type { BreathMouthTracks } from '../game/BreathGeometry'
import { DRAGON_TRIAL_BREATH_MOUTHS } from './DragonTrialMouths'
import type { Point, Unit } from '../game/model'
import { AUTHORED_ROSTER, DIRECTIONS, MOTIONS } from './AuthoredRoster'
import type { SpriteDirection } from './UnitSprites'

export const UNIT_TRIAL_TYPES = [
  'soldier',
  'archer',
  'tank',
  'mage',
  'frost',
  'healer',
  'runner',
  'ranger',
  'cannon',
  'paladin'
] as const
export type AlliedTrialType = (typeof UNIT_TRIAL_TYPES)[number]
export const ENEMY_TRIAL_TYPES = [
  'slime',
  'goblin',
  'wolf',
  'beetle',
  'shaman',
  'brute',
  'bat',
  'wraith',
  'ogre',
  'dragon'
] as const
export type EnemyTrialType = (typeof ENEMY_TRIAL_TYPES)[number]
export const ALL_TRIAL_TYPES = [...UNIT_TRIAL_TYPES, ...ENEMY_TRIAL_TYPES] as const
export type UnitTrialType = (typeof ALL_TRIAL_TYPES)[number]
export const unitTrialOwner = (type: UnitTrialType) => AUTHORED_ROSTER[type].owner
export interface UnitTrialArt {
  readonly character: string
  readonly clips: Readonly<Record<string, string>>
  readonly idleClips: Readonly<Record<SpriteDirection, string>>
  readonly portrait: string
  readonly displayScale: number
  readonly walkCycleTravelOverride?: number
  readonly impactOffsets?: Readonly<Record<SpriteDirection, Point>>
  readonly breathMouths?: BreathMouthTracks
}
export type UnitTrials = Readonly<Partial<Record<UnitTrialType, UnitTrialArt>>>
export const UNIT_TRIAL_DEFAULTS = {
  soldier: { character: 'leaf-squire-3d', displayScale: 60 / 91, walkCycleTravelOverride: 24 },
  archer: { character: 'forest-archer-3d', displayScale: 1, walkCycleTravelOverride: 24 },
  tank: { character: 'shield-knight-3d', displayScale: 1, walkCycleTravelOverride: 20 },
  mage: { character: 'star-mage-3d', displayScale: 1, walkCycleTravelOverride: 20 },
  frost: { character: 'frost-caster-3d', displayScale: 1, walkCycleTravelOverride: 18 },
  healer: { character: 'flower-healer-3d', displayScale: 1, walkCycleTravelOverride: 18 },
  runner: { character: 'spear-scout-3d', displayScale: 1, walkCycleTravelOverride: 28 },
  ranger: { character: 'falcon-ranger-3d', displayScale: 1, walkCycleTravelOverride: 26 },
  cannon: { character: 'powder-engineer-3d', displayScale: 1, walkCycleTravelOverride: 24 },
  paladin: { character: 'sun-paladin-3d', displayScale: 1, walkCycleTravelOverride: 24 },
  slime: { character: 'purupuru-slime-3d', displayScale: 1, walkCycleTravelOverride: 32 },
  goblin: { character: 'mischief-goblin-3d', displayScale: 1, walkCycleTravelOverride: 32 },
  wolf: { character: 'dusk-wolf-3d', displayScale: 1, walkCycleTravelOverride: 44 },
  beetle: { character: 'ironclad-beetle-3d', displayScale: 1, walkCycleTravelOverride: 40 },
  shaman: { character: 'mushroom-mage-3d', displayScale: 1, walkCycleTravelOverride: 30 },
  bat: { character: 'night-bat-3d', displayScale: 1, walkCycleTravelOverride: 62 },
  wraith: { character: 'mist-wraith-3d', displayScale: 1, walkCycleTravelOverride: 60 },
  dragon: {
    character: 'emberwing-baby-dragon-3d',
    displayScale: 1,
    walkCycleTravelOverride: 37,
    breathMouths: DRAGON_TRIAL_BREATH_MOUTHS
  },
  ogre: {
    character: 'potbelly-club-ogre-3d',
    displayScale: 1,
    walkCycleTravelOverride: 40,
    impactOffsets: {
      n: { x: -9.166744232177734, y: -42.83159255981445 },
      ne: { x: 4.8528594970703125, y: -43.119436264038086 },
      e: { x: 38.62101745605469, y: -31.892537117004395 },
      se: { x: 22.039329528808594, y: -16.227258682250977 },
      s: { x: 9.166717529296875, y: -14.144614219665527 },
      sw: { x: -4.852886199951172, y: -13.856713771820068 },
      w: { x: -38.62101936340332, y: -25.083673000335693 },
      nw: { x: -22.03929901123047, y: -40.748894691467285 }
    }
  },
  brute: {
    character: 'crystal-stone-brute-3d',
    displayScale: 1,
    walkCycleTravelOverride: 40,
    impactOffsets: {
      n: { x: -0.00141143798828125, y: -10.95583963394165 },
      ne: { x: 10.224899291992188, y: -10.273477554321289 },
      e: { x: 29.37261199951172, y: -0.0476377010345459 },
      se: { x: 10.227531433105469, y: 10.178942322731018 },
      s: { x: 0.0013885498046875, y: 10.861602306365967 },
      sw: { x: -10.224929809570312, y: 10.179301142692566 },
      w: { x: -29.372608184814453, y: -0.04660463333129883 },
      nw: { x: -10.227497100830078, y: -10.273120403289795 }
    }
  }
} as const

export function unitTrialArt(
  type: UnitTrialType,
  root: URL,
  options: { readonly walkCycleTravelOverride?: number } = {}
): UnitTrialArt {
  const settings = { ...UNIT_TRIAL_DEFAULTS[type], ...options }
  const url = (motion: string, direction: SpriteDirection) =>
    new URL(`${settings.character}-${motion}-${direction}.json`, root).href
  return {
    ...settings,
    clips: Object.fromEntries(
      DIRECTIONS.flatMap((direction) => [
        ...MOTIONS.map((motion) => [`${unitTrialOwner(type)}:${type}:${motion}:${direction}`, url(motion, direction)]),
        ...(type === 'dragon' ? [[`ai:dragon:attack:${direction}:breath`, url('breath', direction)]] : []),
        ...(type === 'paladin' ? [[`player:paladin:attack:${direction}:heal`, url('heal', direction)]] : [])
      ])
    ),
    idleClips: Object.fromEntries(DIRECTIONS.map((direction) => [direction, url('idle', direction)])) as Record<
      SpriteDirection,
      string
    >,
    portrait: new URL('portrait.png', root).href
  }
}

export function unitTrialCatalog(base: URL): Readonly<Record<UnitTrialType, UnitTrialArt>> {
  return Object.fromEntries(
    ALL_TRIAL_TYPES.map((type) => [type, unitTrialArt(type, new URL(`${type}-3d-trial/`, base))])
  ) as Record<UnitTrialType, UnitTrialArt>
}

export function unitTrialsFromURL(base: URL, pageURL: URL): UnitTrials {
  const catalog = unitTrialCatalog(base)
  return Object.fromEntries(
    ALL_TRIAL_TYPES.filter((type) => pageURL.searchParams.get(`${type}-art`) === '3d').map((type) => [
      type,
      catalog[type]
    ])
  )
}

export function unitTrialFor(unit: Pick<Unit, 'owner' | 'type'>, trials: UnitTrials): UnitTrialArt | undefined {
  return ALL_TRIAL_TYPES.some((type) => type === unit.type && unitTrialOwner(type) === unit.owner)
    ? trials[unit.type as UnitTrialType]
    : undefined
}

export function unitTrialScale(unit: Pick<Unit, 'owner' | 'type'>, trials: UnitTrials): number {
  return unitTrialFor(unit, trials)?.displayScale ?? 1
}

export function unitTrialClips(standard: Readonly<Record<string, string>>, trials: UnitTrials) {
  const clips = { ...standard }
  for (const type of ALL_TRIAL_TYPES) {
    const trial = trials[type]
    if (!trial) continue
    const prefix = `${unitTrialOwner(type)}:${type}:`
    for (const key of Object.keys(clips)) if (key.startsWith(prefix)) delete clips[key]
    for (const [key, url] of Object.entries(trial.clips)) if (key.startsWith(prefix)) clips[key] = url
  }
  return clips as Readonly<Record<string, string>>
}
