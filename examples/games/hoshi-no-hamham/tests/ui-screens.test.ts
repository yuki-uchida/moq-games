import { describe, expect, test } from 'vitest'
import { allSheetSpecs, THEMES } from '../src/art/contract'
import { OPENING_PAGES, STAGES } from '../src/game/stages'
import {
  backingScale,
  countValue,
  fitScale,
  formatClock,
  formatTotal,
  goalProgress,
  nineSlice,
  NINE_SLICE,
  starRating,
  starTrail,
  STAR_RULES
} from '../src/ui/rules'
import { pickNeighbour } from '../src/ui/spatial'
import { BLIP_EVERY, BLIP_MIN_GAP_MS, BlipGate } from '../src/ui/typewriter'
import {
  CREDITS_SHOT,
  ENDING_SCENES,
  endingShot,
  GROUND,
  SCENE_H,
  SCENE_W,
  shotFor,
  STORY_SCENES,
  type Shot
} from '../src/ui/story-scenes'

const specs = allSheetSpecs()

function checkShot(shot: Shot, where: string) {
  expect(THEMES, `${where}: theme`).toContain(shot.theme)
  expect(shot.figures.length, `${where}: somebody on stage`).toBeGreaterThan(0)
  for (const figure of shot.figures) {
    expect(specs[figure.sheet], `${where}: sheet ${figure.sheet}`).toBeDefined()
    expect(specs[figure.sheet][figure.clip], `${where}: clip ${figure.sheet}/${figure.clip}`).toBeDefined()
    expect(figure.x, `${where}: ${figure.sheet} inside the picture`).toBeGreaterThanOrEqual(0)
    expect(figure.x).toBeLessThanOrEqual(SCENE_W)
    expect(GROUND - (figure.lift ?? 0), `${where}: ${figure.sheet} not above the picture`).toBeGreaterThan(0)
  }
  for (const mark of shot.marks ?? []) {
    expect(specs.fx[mark.clip], `${where}: fx/${mark.clip}`).toBeDefined()
    expect(mark.x).toBeGreaterThanOrEqual(0)
    expect(mark.x).toBeLessThanOrEqual(SCENE_W)
    expect(GROUND - mark.lift).toBeGreaterThan(0)
  }
}

describe('story scenes', () => {
  test('the opening and every stage intro have a shot for every page', () => {
    expect(STORY_SCENES.opening.length, 'one shot per opening page').toBe(OPENING_PAGES.length)
    for (const stage of STAGES) {
      const shots = STORY_SCENES[String(stage.no)]
      expect(shots, `stage ${stage.no}`).toBeDefined()
      expect(shots.length, `stage ${stage.no} has a shot per intro page`).toBe(stage.intro.length)
    }
  })

  test('every scene names only sheets and clips from the art contract', () => {
    for (const [key, shots] of Object.entries(STORY_SCENES)) shots.forEach((shot, i) => checkShot(shot, `${key}#${i}`))
    ENDING_SCENES.forEach((shot, i) => checkShot(shot, `ending#${i}`))
    checkShot(CREDITS_SHOT, 'credits')
  })

  test('each stage intro shows its own world, and a boss stage shows its boss', () => {
    // Stage 6 is the nest-building stage: its intro never mentions the bear, so the picture does not show him.
    const bossless = new Set([6])
    for (const stage of STAGES) {
      const shots = STORY_SCENES[String(stage.no)]
      expect(
        shots.some((shot) => shot.theme === stage.theme),
        `stage ${stage.no} world`
      ).toBe(true)
      expect(
        shots.some((shot) => shot.figures.some((f) => f.sheet === stage.boss.art)),
        `stage ${stage.no} shows ${stage.boss.art}`
      ).toBe(!bossless.has(stage.no))
    }
  })

  test('the opening shows what its pages say: the hero alone, then the nest and mom, then the chase', () => {
    const sheets = (page: number) => STORY_SCENES.opening[page].figures.map((f) => f.sheet)
    // 「ハム彦という名前の子ハムスター」: only the hero.
    expect(sheets(0)).toEqual(['hero'])
    // 「ママと大げんかして、巣を飛び出しました」: the nest, mom and the hero running away from them.
    expect(sheets(1)).toEqual(expect.arrayContaining(['prop:nest', 'mom', 'hero']))
    // 「もう、かえってこなくっていいの！」 and the chase: mom and the hero, never the king or the princess.
    for (const page of [2, 3]) expect(sheets(page).sort()).toEqual(['hero', 'mom'])
    for (let page = 0; page < OPENING_PAGES.length; page++)
      expect(sheets(page), `opening page ${page}`).not.toEqual(expect.arrayContaining(['king']))
    // The hero runs away from mom on the chase page: mom behind (left), the hero in front.
    const chase = STORY_SCENES.opening[3]
    expect(chase.figures.find((f) => f.sheet === 'mom')!.x).toBeLessThan(
      chase.figures.find((f) => f.sheet === 'hero')!.x
    )
  })

  test('the kidnapping page: the weasel gallops off to the right with the princess on his back, clear of his head', () => {
    const [shot] = STORY_SCENES['3']
    const weasel = shot.figures.find((f) => f.sheet === 'weaselBoss')!
    const princess = shot.figures.find((f) => f.sheet === 'princess')!
    expect(weasel.flip).toBe(false)
    expect(weasel.clip).toBe('attack')
    // She sits on his back (his galloping body is about 40 px high there), not on the ground and not in the air ...
    expect(princess.lift ?? 0).toBeGreaterThanOrEqual(28)
    expect(princess.lift ?? 0).toBeLessThanOrEqual(46)
    // ... behind his shoulders: his head and cap, at the front of his 100 px length, stay clear of her.
    expect(weasel.x - princess.x).toBeGreaterThanOrEqual(12)
    expect(weasel.x - princess.x).toBeLessThan(40)
    // She is carried: she does not bob on her own.
    expect(princess.motion ?? 'none').toBe('none')
    // And she is drawn over him.
    expect(shot.figures.indexOf(princess)).toBeGreaterThan(shot.figures.indexOf(weasel))
  })

  test('stage 1 shows mom behind the hero', () => {
    const one = STORY_SCENES['1'][0]
    const mom = one.figures.find((f) => f.sheet === 'mom')!
    const hero = one.figures.find((f) => f.sheet === 'hero')!
    expect(mom.x).toBeLessThan(hero.x)
  })

  test('shots clamp to the last one for longer stories and the ending has one per page', () => {
    expect(shotFor(1, 99)).toBe(STORY_SCENES['1'][STORY_SCENES['1'].length - 1])
    expect(shotFor(1, -3)).toBe(STORY_SCENES['1'][0])
    expect(shotFor('opening', 0)).toBe(STORY_SCENES.opening[0])
    expect(endingShot(99)).toBe(ENDING_SCENES[ENDING_SCENES.length - 1])
    expect(ENDING_SCENES[0].theme).toBe('star')
    const nest = ENDING_SCENES.find((shot) =>
      ['hero', 'princess', 'mom', 'prop:nest'].every((id) => shot.figures.some((f) => f.sheet === id))
    )
    expect(nest, 'the nest with the three of them').toBeDefined()
    expect(SCENE_W / SCENE_H).toBe(2)
  })
})

describe('typewriter blips', () => {
  /** Feeds a text at `cps` characters per second and returns the times (ms) and characters that blipped. */
  function run(text: string, cps: number) {
    const gate = new BlipGate()
    const blips: { at: number; char: string }[] = []
    Array.from(text).forEach((char, index) => {
      const at = (index * 1000) / cps
      if (gate.next(char, at)) blips.push({ at, char })
    })
    return blips
  }

  test('about every third character blips, never a space or punctuation', () => {
    const text = 'むかしむかし、星の丘に「ハム彦」という名前の子ハムスターがいました。'
    const blips = run(text, 32)
    expect(blips.length).toBeGreaterThan(Array.from(text).length / (BLIP_EVERY + 2))
    expect(blips.length).toBeLessThanOrEqual(Math.ceil(Array.from(text).length / BLIP_EVERY))
    for (const { char } of blips) expect(char).not.toMatch(/[\s\p{P}\p{S}]/u)
    // The first two characters never blip; the third (a voiced one) does.
    expect(blips[0].char).toBe('し')
  })

  test('punctuation holds the blip for the next voiced character', () => {
    const gate = new BlipGate()
    expect(gate.next('あ', 0)).toBe(false)
    expect(gate.next('い', 100)).toBe(false)
    expect(gate.next('、', 200)).toBe(false)
    expect(gate.next(' ', 300)).toBe(false)
    expect(gate.next('う', 400)).toBe(true)
  })

  test('blips are never closer than the floor, however fast the text prints', () => {
    for (const cps of [32, 120, 400, 2000]) {
      const blips = run('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめも'.repeat(3), cps)
      blips.forEach((blip, i) => {
        if (i > 0) expect(blip.at - blips[i - 1].at, `${cps} cps`).toBeGreaterThanOrEqual(BLIP_MIN_GAP_MS)
      })
    }
    expect(BLIP_MIN_GAP_MS).toBe(45)
  })
})

describe('result rules', () => {
  test('stars: one for the clear, two with at most two hits, three with none', () => {
    expect(starRating(0)).toBe(3)
    expect(starRating(1)).toBe(2)
    expect(starRating(2)).toBe(2)
    expect(starRating(3)).toBe(1)
    expect(starRating(40)).toBe(1)
    expect(STAR_RULES.map((rule) => rule.label)).toEqual(['クリア', 'ダメージ2回まで', 'ノーダメージ'])
  })

  test('clear times are m:ss.t and totals m:ss or h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00.0')
    expect(formatClock(83.44)).toBe('1:23.4')
    expect(formatClock(59.96)).toBe('1:00.0')
    expect(formatClock(605.2)).toBe('10:05.2')
    expect(formatTotal(324.9)).toBe('5:24')
    expect(formatTotal(3725)).toBe('1:02:05')
  })

  test('count-ups start at zero, end on the value and never overshoot', () => {
    expect(countValue(12, 0)).toBe(0)
    expect(countValue(12, 1)).toBe(12)
    let last = 0
    for (let p = 0; p <= 1; p += 0.05) {
      const v = countValue(12, p)
      expect(v).toBeGreaterThanOrEqual(last)
      expect(v).toBeLessThanOrEqual(12)
      last = v
    }
  })
})

describe('pixel maths', () => {
  test('nine-slice borders are whole multiples of the 8 px corner', () => {
    expect(NINE_SLICE).toEqual({ size: 24, corner: 8 })
    expect(nineSlice(1)).toEqual({ slice: 8, border: 8, middle: 8, minBox: 16 })
    expect(nineSlice(3)).toEqual({ slice: 8, border: 24, middle: 8, minBox: 48 })
    expect(nineSlice(2.4).border).toBe(16)
    expect(() => nineSlice(1, 16, 8)).toThrow()
  })

  test('sprites fit at whole-number device scales', () => {
    expect(fitScale(384, 128, 800, 300, 1)).toEqual({ scale: 2, cssW: 768, cssH: 256 })
    expect(fitScale(384, 128, 300, 300, 1)).toEqual({ scale: 1, cssW: 384, cssH: 128 })
    const phone = fitScale(384, 128, 330, 120, 3)
    expect(phone.scale).toBe(2)
    expect(phone.cssW * 3).toBe(768)
    expect(backingScale(320, 860, 1)).toBe(3)
    expect(backingScale(320, 100, 1)).toBe(1)
    expect(backingScale(320, 4000, 2)).toBe(4)
  })

  test('arrow keys move by rows and columns through a grid', () => {
    // 5 × 2 grid of 100 × 80 cards with 20 px gaps.
    const boxes = Array.from({ length: 10 }, (_, i) => ({
      x: (i % 5) * 120,
      y: Math.floor(i / 5) * 100,
      w: 100,
      h: 80
    }))
    expect(pickNeighbour(boxes, 0, 'right')).toBe(1)
    expect(pickNeighbour(boxes, 0, 'down')).toBe(5)
    expect(pickNeighbour(boxes, 7, 'up')).toBe(2)
    expect(pickNeighbour(boxes, 4, 'right')).toBe(-1)
    expect(pickNeighbour(boxes, 5, 'left')).toBe(-1)
    expect(pickNeighbour(boxes, 9, 'left')).toBe(8)
  })
})

describe('title and game-over rules', () => {
  test('the star trail lights the cleared stages and marks the next one', () => {
    const fresh = starTrail(0, 10)
    expect(fresh.stars).toHaveLength(10)
    expect(fresh.stars.every((s) => s === 'dim')).toBe(true)
    expect(fresh.text).toBe('ぜんぶで 10ステージ')
    expect(fresh.label).toContain('ぜんぶで 10ステージ')

    const three = starTrail(3, 10)
    expect(three.stars.filter((s) => s === 'lit')).toHaveLength(3)
    expect(three.stars.indexOf('next')).toBe(3)
    expect(three.text).toBe('クリア 3/10')
    expect(three.label).toBe(three.text)

    const all = starTrail(10, 10)
    expect(all.stars.every((s) => s === 'lit')).toBe(true)
    expect(starTrail(14, 10).stars.filter((s) => s === 'lit')).toHaveLength(10)
  })

  test('the progress toward the goal is a share of the way from the start to the goal', () => {
    expect(goalProgress(0.31, 0.9)).toEqual({ progress: 0.31 / 0.9, left: 66 })
    expect(goalProgress(0, 0.9)).toEqual({ progress: 0, left: 100 })
    expect(goalProgress(0.95, 0.9)).toEqual({ progress: 1, left: 0 })
    expect(goalProgress(0.5, 0)).toEqual({ progress: 0, left: 100 })
  })
})
