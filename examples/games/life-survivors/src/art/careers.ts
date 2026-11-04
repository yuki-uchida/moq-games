import { rankedAppearance } from '../careers'
import type { ViewPlayer } from '../view'
import { R } from './palette'
import { COLLEGE, HIGH, JUNIOR, MIDDLE, PRIME } from './people'
import { ADULT, ELDER, KID, hurtPoses, idlePoses, sneaker, walkPoses } from './player'
import { human, type Body } from './rig'
import type { Sheet } from './sheet'

const BODIES: Record<string, Body> = {
  kid: KID,
  junior: JUNIOR,
  high: HIGH,
  college: COLLEGE,
  adult: ADULT,
  prime: PRIME,
  middle: MIDDLE,
  elder: ELDER
}
export function careerFor(player: Pick<ViewPlayer, 'weapons' | 'passives'>): string | undefined {
  return rankedAppearance(player.weapons, player.passives)
}

export function careerBody(body: string, career: string): Body {
  const original = BODIES[body]
  const athlete = career === 'soccer'
  const investor = career === 'entrepreneur'
  const social = career === 'social'
  const romantic = career === 'romantic'
  const creative = career === 'creative'
  const casual = social || romantic || creative
  const clothes = athlete
    ? R.green
    : investor
      ? R.purple
      : social
        ? R.mint
        : romantic
          ? R.pink
          : creative
            ? R.orange
            : R.navy
  const dressed: Body = {
    ...original,
    behind: undefined,
    over: undefined,
    farItem: body === 'elder' ? original.farItem : undefined,
    pants: athlete ? R.paper : casual ? R.navy : clothes,
    sleeve: clothes,
    cuff: athlete ? R.paper[0] : original.cuff,
    shoe: athlete ? sneaker : original.shoe,
    lie: {
      ...original.lie,
      coat: clothes,
      beside: undefined,
      detail: (layer, _x0, x1, top, bottom) => {
        const chest = x1 - 6
        if (athlete) {
          layer.rect(chest, top + 2, 2, Math.max(1, bottom - top - 3), R.paper[0])
          layer.rect(chest - 2, top + 2, 4, 1, R.paper[0])
        } else if (casual) {
          if (social) {
            layer.rect(chest - 1, top + 2, 3, 3, R.paper[1])
            layer.set(chest, top + 3, R.yellow[1])
          } else if (romantic) {
            layer.rect(chest + 2, top + 1, 2, Math.max(1, bottom - top - 1), R.purple[1])
          } else {
            layer.rect(chest - 4, top + 2, 7, Math.max(1, bottom - top - 3), R.paper[1])
            layer.rect(chest - 2, top + 3, 3, 2, R.orange[2])
          }
        } else {
          layer.rect(chest + 2, top + 1, 2, Math.max(1, bottom - top - 1), R.paper[0])
          layer.rect(chest - 3, top + 2, 6, 1, investor ? R.yellow[1] : R.red[1])
        }
      }
    },
    torso: (layer, { hx, hy, top, lean }) => {
      layer.rect(hx - 7 + lean, top, 15, hy - top + 2, clothes[1])
      layer.rect(hx - 7 + lean, top, 2, hy - top + 2, clothes[0])
      layer.rect(hx + 6 + lean, top, 2, hy - top + 2, clothes[2])
      if (athlete) {
        layer.rect(hx - 2 + lean, top + 3, 5, 2, R.paper[0])
        layer.rect(hx + 1 + lean, top + 4, 2, 6, R.paper[0])
      } else if (casual) {
        layer.rect(hx - 2 + lean, top, 5, 2, R.paper[1])
        if (social) {
          layer.rect(hx - 5 + lean, top + 4, 3, 4, R.paper[1])
          layer.rect(hx - 4 + lean, top + 5, 1, 1, R.yellow[1])
        } else if (romantic) {
          layer.rect(hx - 4 + lean, top + 2, 9, 3, R.purple[1])
          layer.rect(hx + 3 + lean, top + 4, 2, 5, R.purple[1])
        } else {
          layer.rect(hx - 4 + lean, top + 4, 9, hy - top - 2, R.paper[1])
          layer.rect(hx - 2 + lean, top + 7, 5, 3, R.orange[2])
        }
      } else {
        layer.poly([hx - 2 + lean, top, hx + 4 + lean, top, hx + 1 + lean, top + 7], R.paper[0])
        layer.rect(hx + lean, top + 2, 2, 8, investor ? R.yellow[1] : R.red[1])
        if (!investor) layer.rect(hx - 5 + lean, top + 5, 3, 4, R.paper[1])
      }
    },
    item: athlete
      ? undefined
      : (raster, _frame, hand) => {
          if (social) {
            raster.rect(hand.x - 2, hand.y, 5, 8, R.navy[2])
            raster.rect(hand.x - 1, hand.y + 1, 3, 5, R.sky[0])
            raster.rect(hand.x, hand.y + 6, 1, 1, R.paper[0])
            return
          }
          if (romantic) {
            raster.rect(hand.x - 1, hand.y, 2, 8, R.green[2])
            raster.rect(hand.x - 3, hand.y - 2, 6, 4, R.red[1])
            raster.rect(hand.x - 1, hand.y - 3, 2, 6, R.pink[1])
            raster.rect(hand.x + 1, hand.y + 3, 3, 2, R.green[1])
            return
          }
          if (creative) {
            raster.rect(hand.x - 4, hand.y, 8, 8, R.brown[1])
            raster.rect(hand.x - 3, hand.y, 6, 7, R.paper[1])
            raster.rect(hand.x - 2, hand.y + 2, 4, 1, R.mint[1])
            raster.rect(hand.x - 2, hand.y + 4, 3, 1, R.orange[1])
            return
          }
          raster.rect(hand.x - 4, hand.y + 1, 9, 7, investor ? R.metal[2] : R.brown[1])
          raster.rect(hand.x - 2, hand.y - 1, 5, 2, R.metal[1])
          raster.rect(hand.x, hand.y + 3, 2, 2, R.yellow[1])
        }
  }
  return dressed
}

export function careerSheet(body: string, career: string): Sheet {
  const frames = careerSheetFrames(body, career)
  let step = frames.next()
  while (!step.done) step = frames.next()
  return step.value
}

export function* careerSheetFrames(body: string, career: string): Generator<void, Sheet> {
  const dressed = careerBody(body, career)
  const result: Sheet = {
    idle: { frames: [], fps: 6, loop: true, hold: [3, 2, 3, 1] },
    walk: {
      frames: [],
      fps: body === 'elder' ? 8 : 11,
      loop: true
    },
    hurt: { frames: [], fps: 8, loop: false }
  }
  const poses = {
    idle: idlePoses(),
    walk: walkPoses({ scale: body === 'kid' ? 0.8 : body === 'elder' ? 0.5 : 1 }),
    hurt: hurtPoses()
  }
  for (const [name, sequence] of Object.entries(poses)) {
    for (const pose of sequence) {
      result[name].frames.push(human(dressed, body === 'elder' ? { ...pose, lean: 3, handF: [3, 7] } : pose))
      yield
    }
  }
  return result
}

export const careerSheets = Object.fromEntries(
  Object.keys(BODIES).flatMap((body) =>
    ['soccer', 'bureaucrat', 'entrepreneur', 'social', 'romantic', 'creative'].map((career) => [
      `player:${body}:${career}`,
      () => careerSheet(body, career)
    ])
  )
)
