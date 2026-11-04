import { bossSheets } from './bosses'
import { careerSheetFrames, careerSheets } from './careers'
import { BOSSES2_NO_FLIP, bosses2Sheets, bulletSheet } from './bosses2'
import { ROSTER2_NO_FLIP, roster2Sheets } from './roster2'
import { ROSTER3_NO_FLIP, roster3Sheets } from './roster3'
import { weaponSheets } from './weapons'
import { bullySheet, expenseSheet, flash, germSheet, hsBossSheet, jobSheet, rosterSheets } from './enemies'
import { careerDeathSheet, deathSheets } from './deaths'
import { familySheets } from './family'
import { peopleSheets } from './people'
import { adultSheet, babySheet, bedSheet, elderSheet, kidSheet } from './player'
import type { Sheet } from './sheet'
import { PROP_NAMES, TILE, groundTile, propSheet, propsAt, tileSheet } from './world'

/** Enemy sheets get a white hit-flash twin of every frame. */
const withFlash = (make: () => Sheet) => () => {
  const s = make()
  return { ...s, flash: { ...s.move, frames: s.move.frames.map(flash) } }
}

/** Every generated sheet, built lazily on first use and cached. */
export const SHEETS: Record<string, () => Sheet> = {
  ...careerSheets,
  'player:baby': babySheet,
  'player:kid': kidSheet,
  'player:adult': adultSheet,
  'player:elder': elderSheet,
  'player:bed': bedSheet,
  ...familySheets,
  'enemy:germ': withFlash(germSheet),
  'enemy:bully': withFlash(bullySheet),
  'enemy:expense': withFlash(expenseSheet),
  'enemy:job': withFlash(jobSheet),
  'enemy:b_hs': withFlash(hsBossSheet),
  ...Object.fromEntries(Object.entries(bossSheets).map(([id, make]) => [id, id === 'reaper' ? make : withFlash(make)])),
  ...deathSheets,
  ...weaponSheets(),
  ...Object.fromEntries(Object.entries(rosterSheets).map(([id, make]) => [id, withFlash(make)])),
  ...Object.fromEntries(
    Object.entries({ ...roster2Sheets, ...roster3Sheets, ...bosses2Sheets }).map(([id, make]) => [id, withFlash(make)])
  ),
  bullets: bulletSheet,
  ...Object.fromEntries(
    Object.entries(peopleSheets).map(([id, make]) => [id, id.startsWith('enemy:') ? withFlash(make) : make])
  ),
  ...Object.fromEntries(
    Object.keys(PROP_NAMES).flatMap((g) => [
      [`tiles:${g}`, () => tileSheet(g)],
      [`props:${g}`, () => propSheet(g)]
    ])
  )
}

const cache = new Map<string, Sheet>()
let partial: { id: string; frames: Generator<void, Sheet>; at: number } | undefined

export function retainAppearancePrewarm(ids: string[]) {
  if (partial && (!ids.includes(partial.id) || performance.now() - partial.at > 250)) partial = undefined
}

export function prewarmAppearanceFrame(id: string): boolean {
  if (cache.has(id) || !careerSheets[id]) return true
  const now = performance.now()
  if (!partial || partial.id !== id || now - partial.at > 250) {
    const [, body, career] = id.split(':')
    partial = { id, frames: careerSheetFrames(body, career), at: now }
  }
  partial.at = now
  const step = partial.frames.next()
  if (!step.done) return false
  cache.set(id, step.value)
  partial = undefined
  return true
}

export function sheet(id: string): Sheet {
  if (partial?.id === id) partial = undefined
  let found = cache.get(id)
  if (!found) {
    const [kind, body, career] = id.split(':')
    found =
      kind === 'death' && career && careerSheets[`player:${body}:${career}`]
        ? careerDeathSheet(body, career)
        : SHEETS[id]()
    cache.set(id, found)
  }
  return found
}

/** The stage ground each sheet is reviewed on. */
const REVIEW_GROUND: Record<string, string> = {
  'player:toddler': 'playground',
  'player:junior': 'gym',
  'player:high': 'sidewalk',
  'player:college': 'campus',
  'player:prime': 'street',
  'player:middle': 'golf',
  'player:elder': 'garden',
  'player:bed': 'ward',
  'player:baby': 'nursery',
  'player:kid': 'school',
  'player:adult': 'office',
  'death:adult': 'office',
  'death:kid': 'school',
  'death:baby': 'nursery',
  'death:elder': 'office',
  'enemy:germ': 'nursery',
  'enemy:bully': 'school',
  'enemy:expense': 'office',
  'enemy:job': 'office',
  'enemy:b_hs': 'school',
  reaper: 'office'
}
export const groundFor = (id: string) => REVIEW_GROUND[id] ?? (id.startsWith('props:') ? id.slice(6) : undefined)

/** Review mockups: a 640×360 art-px crop of a stage with its props, the player and a crowd. */
const SCENES: [string, string, string[]][] = [
  ['nursery', 'baby', ['germ', 'germ', 'germ', 'insult', 'germ']],
  ['playground', 'toddler', ['germ', 'insult', 'bully', 'insult', 'germ']],
  ['school', 'kid', ['bully', 'lesson', 'teacher', 'germ', 'b_hs']],
  ['gym', 'junior', ['lesson', 'exam', 'club', 'bully', 'teacher']],
  ['sidewalk', 'high', ['exam', 'club', 'girlfriend', 'insult', 'car']],
  ['campus', 'college', ['exam', 'expense', 'girlfriend', 'job', 'b_univ']],
  ['office', 'adult', ['job', 'expense', 'boss', 'cert', 'b_shukatsu']],
  ['street', 'prime', ['kid', 'job', 'loan', 'boss', 'b_mortgage']],
  ['golf', 'middle', ['illness', 'loan', 'gossip', 'job', 'b_layoff']],
  ['garden', 'elder', ['illness', 'germ', 'gossip', 'loan', 'expense']],
  ['ward', 'bed', ['illness', 'germ', 'expense', 'insult', 'b_illness']]
]

/** Review mockups: a 640×360 art-px crop of each stage with its props, the player and a crowd. */
export const mockups = () =>
  SCENES.map(([ground, body, foes]) => ({
    ground,
    player: `player:${body}`,
    enemies: foes.map((id) => `enemy:${id}`)
  })).map(({ ground, player, enemies }) => {
    const ox = 3 * TILE * 3
    const oy = 2 * TILE * 3
    const items: {
      sheet: string
      anim: string
      frame: number
      x: number
      y: number
      px: number
      py: number
      flip?: boolean
      shadow?: number
      layer: number
    }[] = []
    for (let cy = 1; cy < 6; cy++)
      for (let cx = 2; cx < 8; cx++) {
        for (const prop of propsAt(ground, cx, cy)) {
          const frame = propSheet(ground)[prop.name].frames[0]
          items.push({
            sheet: `props:${ground}`,
            anim: prop.name,
            frame: 0,
            x: prop.x - ox,
            y: prop.y - oy,
            px: frame.w / 2,
            py: frame.h - 6,
            layer: 0
          })
        }
      }
    items.push({ sheet: player, anim: 'walk', frame: 1, x: 320, y: 200, px: 32, py: 58, shadow: 11, layer: 1 })
    const spots = [
      [180, 140],
      [460, 130],
      [520, 260],
      [140, 290],
      [380, 320]
    ]
    enemies.forEach((id, i) => {
      const big = id.startsWith('enemy:b_')
      items.push({
        sheet: id,
        anim: 'move',
        frame: i % 6,
        x: spots[i][0],
        y: spots[i][1],
        px: big ? 64 : 32,
        py: big ? 120 : 58,
        flip: spots[i][0] > 320 && !NO_FLIP.has(id.slice(6)),
        shadow: big ? 26 : 10,
        layer: 1
      })
    })
    return { stage: ground, ox: 0, oy: 0, items }
  })

export { groundTile }
export { PENCIL_DIRS, SWING_DIRS, evolve, playMat, swing } from './weapons'
export { FLAT_PROPS } from './world'
/** Sprites carrying lettering (¥, 至急, 0点 …) never mirror. */
export const NO_FLIP = new Set([
  'expense',
  'job',
  'b_hs',
  'b_shukatsu',
  'b_mortgage',
  'b_rebel',
  ...ROSTER2_NO_FLIP,
  ...ROSTER3_NO_FLIP,
  ...BOSSES2_NO_FLIP
])
export { deathKind, soulAt } from './deaths'
export { PALETTE_RGBA } from './palette'
