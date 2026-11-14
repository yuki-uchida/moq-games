/**
 * What the screens around play draw from the art registry, as lists the app asks the art workers for ahead of time
 * (see `fetchArt`). Pure data: the help screen is built from the tables here, and the Node tests check the lists
 * against the contract and against what the screens build.
 */
import type { Neighbour, TileQuery } from '../art/contract'
import type { StageDef } from '../game/types'
import { resultShot, shotArt, type ArtList, type ClipRef } from './story-scenes'

/** A sprite the help screen shows as an <img> (its PNG is made ahead) or as a playing canvas. */
export interface HelpSprite {
  sheet: string
  clip: string
  /** Shown as a playing canvas instead of a still <img>. */
  play?: boolean
  /** Part of the frame shown: [x, y, w, h]. */
  crop?: readonly [number, number, number, number]
  className?: string
}

/** The hero's moves on the help screen: the clip each one plays. */
export const HELP_MOVES = ['run', 'jump', 'bite'] as const

const SOLID: readonly Neighbour[] = ['solid', 'solid', 'solid', 'solid', 'solid', 'solid', 'solid', 'solid']

/** The help screen's dirt tile. */
export const HELP_DIRT: TileQuery = { theme: 'meadow', kind: 'dirt', around: SOLID, tx: 3, ty: 5 }

/** The gimmicks on the help screen, in order: their pictures (`dirt` is the tile above), name and text. */
export const HELP_GIMMICKS: readonly { art: readonly (HelpSprite | 'dirt')[]; name: string; text: string }[] = [
  {
    art: [{ sheet: 'prop:tree', clip: 'idle', crop: [16, 28, 96, 96], className: 'g-big' }],
    name: '木',
    text: '2かいかじるとたおれて、橋になる'
  },
  { art: ['dirt'], name: '土', text: 'かじると穴があく。道がかわる' },
  { art: [{ sheet: 'prop:pipe', clip: 'burst', play: true }], name: '配管', text: 'かじると水がふきだす' },
  { art: [{ sheet: 'prop:hive', clip: 'idle', play: true }], name: '蜂の巣', text: '怒った蜂が、近くの敵をさしにいく' },
  { art: [{ sheet: 'prop:animal', clip: 'sleep', play: true }], name: '眠る動物', text: '起こすと、まっすぐ突進する' },
  {
    art: [
      { sheet: 'prop:switch1', clip: 'off', play: true },
      { sheet: 'prop:door1', clip: 'mid' }
    ],
    name: 'スイッチと門',
    text: '同じしるしの門がひらく'
  },
  { art: [{ sheet: 'prop:rock', clip: 'idle' }], name: '岩', text: 'かじってくだく' }
]

/** Every sprite of the help screen's gimmicks. */
export const helpSprites = (): HelpSprite[] =>
  HELP_GIMMICKS.flatMap((gimmick) => gimmick.art.filter((art): art is HelpSprite => art !== 'dirt'))

const noArt = (): ArtList => ({ clips: [], tiles: [], backdrops: [] })

/** Puts lists together (each clip, tile and backdrop once). */
export function mergeArt(...lists: ArtList[]): ArtList {
  const clips = new Map<string, ClipRef>()
  const sheets = new Set<string>()
  const tiles = new Map<string, TileQuery>()
  const backdrops = new Set<ArtList['backdrops'][number]>()
  for (const list of lists) {
    for (const ref of list.clips) clips.set(`${ref.sheet}/${ref.clip}`, ref)
    for (const id of list.sheets ?? []) sheets.add(id)
    for (const q of list.tiles) tiles.set(`${q.theme}/${q.kind}/${q.around.join(',')}/${q.tx},${q.ty}`, q)
    for (const theme of list.backdrops) backdrops.add(theme)
  }
  return { clips: [...clips.values()], sheets: [...sheets], tiles: [...tiles.values()], backdrops: [...backdrops] }
}

/** Icons, faces, emblems, nine-slices and the logo: every screen uses the `ui` sheet. */
const UI: ArtList = { ...noArt(), sheets: ['ui'] }

/** The title: the interface and the うりぼう asleep on its hills. */
export const titleArt = (): ArtList => mergeArt(UI, { ...noArt(), clips: [{ sheet: 'prop:animal', clip: 'sleep' }] })

/** The help screen: the hero's moves, the gimmicks and the dirt tile. */
export const helpArt = (): ArtList =>
  mergeArt(UI, {
    clips: [
      ...HELP_MOVES.map((clip) => ({ sheet: 'hero', clip })),
      ...helpSprites().map(({ sheet, clip }) => ({ sheet, clip }))
    ],
    tiles: [HELP_DIRT],
    backdrops: []
  })

/** The stage select: emblems, boss faces and icons. */
export const selectArt = (): ArtList => UI

/** The result screen of a stage: its world as the backdrop, the icons and the nest-material twig. */
export const resultArt = (stage: StageDef): ArtList =>
  mergeArt(UI, shotArt(resultShot(stage.theme, stage.no)), {
    ...noArt(),
    clips: [{ sheet: 'prop:twig', clip: 'idle' }]
  })

/** The game over: the hero lying dazed, the emblem, the face and the icons. */
export const deadArt = (): ArtList => mergeArt(UI, { ...noArt(), clips: [{ sheet: 'hero', clip: 'die' }] })
