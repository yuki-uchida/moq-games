/** Art registry: builds every raw sprite once, then bakes it to canvases for the renderer. */
import { bake, type Sprite } from './pixel'
import { buildCharacters, BEE, type CharacterArt } from './characters'
import { buildProps, buildTiles, type PropArt, type TileArt } from './props'

export type ThemeId = 'meadow' | 'night' | 'cave' | 'forest' | 'fortress' | 'castle' | 'star'

export const THEMES: ThemeId[] = ['meadow', 'night', 'cave', 'forest', 'fortress', 'castle', 'star']

export interface ArtSet {
  characters: Record<string, CharacterArt>
  props: PropArt
  tiles: Record<ThemeId, TileArt>
  bee: Sprite
}

export function buildArt(): ArtSet {
  return {
    characters: buildCharacters(),
    props: buildProps(),
    tiles: {
      meadow: buildTiles('meadow'),
      night: buildTiles('night'),
      cave: buildTiles('cave'),
      forest: buildTiles('forest'),
      fortress: buildTiles('fortress'),
      castle: buildTiles('castle'),
      star: buildTiles('star')
    },
    bee: BEE
  }
}

export type BakedCharacter = Record<keyof CharacterArt, HTMLCanvasElement[] | HTMLCanvasElement>

export interface BakedArt {
  characters: Record<
    string,
    {
      idle: HTMLCanvasElement[]
      walk: HTMLCanvasElement[]
      jump: HTMLCanvasElement
      fall: HTMLCanvasElement
      bite: HTMLCanvasElement[]
      hurt: HTMLCanvasElement
      happy: HTMLCanvasElement
      fly?: HTMLCanvasElement[]
    }
  >
  props: { [K in keyof PropArt]: PropArt[K] extends Sprite[] ? HTMLCanvasElement[] : HTMLCanvasElement }
  tiles: Record<ThemeId, { [K in keyof TileArt]: HTMLCanvasElement }>
  bee: HTMLCanvasElement
}

export function bakeArt(set: ArtSet, scale = 1): BakedArt {
  const bakeSprite = (sprite: Sprite) => bake(sprite, scale)
  const bakeCharacter = (character: CharacterArt) => ({
    idle: character.idle.map(bakeSprite),
    walk: character.walk.map(bakeSprite),
    jump: bakeSprite(character.jump),
    fall: bakeSprite(character.fall),
    bite: character.bite.map(bakeSprite),
    hurt: bakeSprite(character.hurt),
    happy: bakeSprite(character.happy),
    fly: character.fly?.map(bakeSprite)
  })
  const props = {} as BakedArt['props']
  for (const [key, value] of Object.entries(set.props)) {
    if (Array.isArray(value)) (props as any)[key] = value.map(bakeSprite)
    else (props as any)[key] = bakeSprite(value as Sprite)
  }
  const tiles = {} as BakedArt['tiles']
  for (const [theme, art] of Object.entries(set.tiles)) {
    const entry: Record<string, HTMLCanvasElement> = {}
    for (const [key, value] of Object.entries(art)) entry[key] = bakeSprite(value as Sprite)
    ;(tiles as any)[theme] = entry
  }
  return {
    characters: Object.fromEntries(Object.entries(set.characters).map(([key, value]) => [key, bakeCharacter(value)])),
    props,
    tiles,
    bee: bakeSprite(set.bee)
  }
}

let cached: ArtSet | null = null

/** Raw art for tests and the art exporter; never touches the DOM. */
export function getArt(): ArtSet {
  if (!cached) cached = buildArt()
  return cached
}
