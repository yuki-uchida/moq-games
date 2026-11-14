import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchArt, listClips, listReady, listSteps } from '../src/app/art-fetch'
import { overlayTextSteps, TILES_PER_STEP } from '../src/app/warm'
import { clipReady, sheet, tile, tileKey } from '../src/art'
import { allSheetSpecs, THEMES } from '../src/art/contract'
import { STAGES } from '../src/game/stages'
import {
  deadArt,
  helpArt,
  HELP_DIRT,
  HELP_GIMMICKS,
  HELP_MOVES,
  helpSprites,
  mergeArt,
  resultArt,
  selectArt,
  titleArt
} from '../src/ui/screen-art'
import {
  CREDITS_SHOT,
  ENDING_SCENES,
  groundTiles,
  resultShot,
  SCENE_W,
  shotArt,
  STORY_SCENES,
  type ArtList,
  type Shot
} from '../src/ui/story-scenes'

const specs = allSheetSpecs()

const SHOTS: [string, Shot][] = [
  ...Object.entries(STORY_SCENES).flatMap(([scene, shots]) =>
    shots.map((shot, page) => [`${scene} page ${page + 1}`, shot] as [string, Shot])
  ),
  ...ENDING_SCENES.map((shot, page) => [`ending page ${page + 1}`, shot] as [string, Shot]),
  ['credits', CREDITS_SHOT],
  ...STAGES.map((stage) => [`result ${stage.no}`, resultShot(stage.theme, stage.no)] as [string, Shot])
]

const has = (list: ArtList, sheet: string, clip: string) =>
  list.clips.some((ref) => ref.sheet === sheet && ref.clip === clip) || (list.sheets ?? []).includes(sheet)

/** Every clip and sheet a list names exists in the art contract, and every theme is a world. */
function checkList(list: ArtList, where: string) {
  for (const ref of list.clips) expect(specs[ref.sheet]?.[ref.clip], `${where}: ${ref.sheet}/${ref.clip}`).toBeDefined()
  for (const id of list.sheets ?? []) expect(specs[id], `${where}: sheet ${id}`).toBeDefined()
  for (const theme of list.backdrops) expect(THEMES).toContain(theme)
  for (const q of list.tiles) expect(THEMES).toContain(q.theme)
}

describe('what a shot draws', () => {
  for (const [label, shot] of SHOTS)
    it(`${label}: its backdrop, its ground strip, every figure and every mark`, () => {
      const art = shotArt(shot)
      checkList(art, label)
      expect(art.backdrops).toEqual([shot.theme])
      for (const figure of shot.figures) expect(has(art, figure.sheet, figure.clip), figure.sheet).toBe(true)
      for (const mark of shot.marks ?? []) expect(has(art, 'fx', mark.clip), mark.clip).toBe(true)
      // The backdrop's drifting leaves.
      expect(has(art, 'fx', 'leaf')).toBe(true)
      // The strip: whole tiles from the one under the scroll's left edge to past the right edge of the scene.
      const scroll = shot.scroll ?? 0
      const first = Math.floor(scroll / 64)
      expect(art.tiles.map((q) => q.tx)).toEqual(
        Array.from({ length: Math.ceil((SCENE_W + 64) / 64) }, (_, i) => first + i)
      )
      for (const q of art.tiles) {
        expect(q).toMatchObject({ theme: shot.theme, kind: 'solid', ty: 9 })
        expect(q.around.slice(0, 2)).toEqual(['empty', 'empty'])
      }
      expect(groundTiles(shot)).toEqual(art.tiles)
      // Each clip once.
      const keys = art.clips.map((ref) => `${ref.sheet}/${ref.clip}`)
      expect(new Set(keys).size).toBe(keys.length)
    })
})

describe('what the screens draw', () => {
  it('the help screen: the hero moves, every gimmick sprite, the dirt tile and the interface', () => {
    const art = helpArt()
    checkList(art, 'help')
    for (const clip of HELP_MOVES) expect(has(art, 'hero', clip), clip).toBe(true)
    const sprites = HELP_GIMMICKS.flatMap((gimmick) => gimmick.art)
    expect(sprites.filter((art) => art === 'dirt')).toHaveLength(1)
    for (const sprite of helpSprites()) expect(has(art, sprite.sheet, sprite.clip), sprite.sheet).toBe(true)
    expect(art.tiles).toEqual([HELP_DIRT])
    expect(HELP_DIRT).toMatchObject({ theme: 'meadow', kind: 'dirt' })
    expect(art.sheets).toContain('ui')
    // A crop lies inside its frame.
    for (const sprite of helpSprites()) {
      if (!sprite.crop) continue
      const spec = specs[sprite.sheet][sprite.clip]
      const [x, y, w, h] = sprite.crop
      expect(x + w).toBeLessThanOrEqual(spec.w)
      expect(y + h).toBeLessThanOrEqual(spec.h)
    }
  })

  it('the title, the select and the game over use the interface sheet; the title its sleeping うりぼう', () => {
    for (const [name, art] of [
      ['title', titleArt()],
      ['select', selectArt()],
      ['dead', deadArt()]
    ] as const) {
      checkList(art, name)
      expect(art.sheets).toContain('ui')
    }
    expect(has(titleArt(), 'prop:animal', 'sleep')).toBe(true)
    expect(has(deadArt(), 'hero', 'die')).toBe(true)
  })

  for (const stage of STAGES)
    it(`the result of stage ${stage.no}: its world's backdrop shot, the icons and the twig`, () => {
      const art = resultArt(stage)
      checkList(art, `result ${stage.no}`)
      const shot = shotArt(resultShot(stage.theme, stage.no))
      expect(art.backdrops).toEqual([stage.theme])
      expect(art.tiles.map(tileKey)).toEqual(shot.tiles.map(tileKey))
      for (const ref of shot.clips) expect(has(art, ref.sheet, ref.clip)).toBe(true)
      expect(has(art, 'prop:twig', 'idle')).toBe(true)
    })

  it('merges lists without repeating anything', () => {
    const a = shotArt(STORY_SCENES['1'][0])
    const merged = mergeArt(a, a, deadArt())
    expect(merged.clips.length).toBe(a.clips.length + 1)
    expect(merged.tiles.length).toBe(a.tiles.length)
    expect(merged.backdrops).toEqual(a.backdrops)
    expect(merged.sheets).toEqual(['ui'])
  })
})

describe('fetching a screen’s art', () => {
  it('spells whole sheets out into their clips, each once', () => {
    const clips = listClips({ clips: [{ sheet: 'ui', clip: 'lock' }], sheets: ['ui'], tiles: [], backdrops: [] })
    expect(clips.map((ref) => ref.clip)).toEqual(Object.keys(sheet('ui')))
  })

  it('turns a list into one slice per backdrop and clip and batches of tiles', () => {
    const list = mergeArt(shotArt(STORY_SCENES['2'][0]), {
      clips: [],
      tiles: Array.from({ length: TILES_PER_STEP + 1 }, (_, i) => ({ ...HELP_DIRT, tx: i })),
      backdrops: []
    })
    const steps = listSteps(list, 'x')
    expect(steps[0].label).toBe(`backdrop:${list.backdrops[0]}`)
    expect(steps.filter((step) => step.request?.kind === 'clip')).toHaveLength(listClips(list).length)
    const batches = steps.filter((step) => step.request?.kind === 'tiles')
    expect(batches.map((step) => step.label)).toEqual(['tiles:x:0', 'tiles:x:1'])
    const asked = batches.flatMap((step) => (step.request?.kind === 'tiles' ? step.request.queries : []))
    expect(asked.map(tileKey)).toEqual(list.tiles.map(tileKey))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('is ready once every clip, tile and backdrop is here; fetching makes it so without a source', async () => {
    // Baking needs a canvas: a stand-in that keeps nothing (a hidden page, so the slices yield with timers).
    const context = {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData() {}
    }
    vi.stubGlobal('document', {
      hidden: true,
      createElement: () => ({ width: 0, height: 0, getContext: () => context })
    })
    const shot = STORY_SCENES['3'][2]
    const list = shotArt(shot)
    expect(listReady(list)).toBe(false)
    const first = fetchArt('test:shot', list)
    // The same key shares the running fetch.
    expect(fetchArt('test:shot', list)).toBe(first)
    await first
    expect(listReady(list)).toBe(true)
    for (const ref of list.clips) expect(clipReady(ref.sheet, ref.clip)).toBe(true)
    for (const q of list.tiles) expect(tile(q).w).toBe(64)
    await expect(fetchArt('test:shot', list, 'urgent')).resolves.toBeUndefined()
  })
})

describe('the overlay’s fonts at the boot', () => {
  it('measures one size per slice, the popups and then the bubbles', () => {
    const steps = overlayTextSteps()
    expect(steps.map((step) => step.label)).toEqual([
      ...[9, 10, 11, 12, 13, 14, 15].map((size) => `font:popup:${size}`),
      'font:bubble:13',
      'font:bubble:15'
    ])
    // Without a canvas (Node) a slice does nothing and does not throw.
    for (const step of steps) expect(() => step.run()).not.toThrow()
  })
})
