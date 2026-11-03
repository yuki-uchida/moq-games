import { MAX_WEAPON_LEVEL, WEAPONS } from '../data'
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
const CAREERS: Record<string, string> = {
  w_sports: 'soccer',
  w_muscle: 'soccer',
  w_study: 'bureaucrat',
  w_reading: 'bureaucrat',
  w_work: 'bureaucrat',
  w_overtime: 'bureaucrat',
  w_invest: 'entrepreneur',
  w_savings: 'entrepreneur',
  w_gamble: 'entrepreneur'
}

export function careerFor(player: Pick<ViewPlayer, 'weapons' | 'passives'>): string | undefined {
  let best = 3
  let career: string | undefined
  for (const def of WEAPONS) {
    const owned = player.weapons.find(([id]) => id === def.id)
    if (!owned || !CAREERS[def.id]) continue
    const evolved =
      owned[1] >= MAX_WEAPON_LEVEL &&
      def.evolve &&
      player.passives.some(([id, lv]) => id === def.evolve!.passive && lv > 0)
    const score = owned[1] + (evolved ? MAX_WEAPON_LEVEL : 0)
    if (score > best) {
      best = score
      career = CAREERS[def.id]
    }
  }
  return career
}

export function careerSheet(body: string, career: string): Sheet {
  const original = BODIES[body]
  const athlete = career === 'soccer'
  const investor = career === 'entrepreneur'
  const clothes = athlete ? R.green : investor ? R.purple : R.navy
  const dressed: Body = {
    ...original,
    behind: undefined,
    over: undefined,
    farItem: body === 'elder' ? original.farItem : undefined,
    pants: athlete ? R.paper : clothes,
    sleeve: clothes,
    cuff: athlete ? R.paper[0] : original.cuff,
    shoe: athlete ? sneaker : original.shoe,
    torso: (layer, { hx, hy, top, lean }) => {
      layer.rect(hx - 7 + lean, top, 15, hy - top + 2, clothes[1])
      layer.rect(hx - 7 + lean, top, 2, hy - top + 2, clothes[0])
      layer.rect(hx + 6 + lean, top, 2, hy - top + 2, clothes[2])
      if (athlete) {
        layer.rect(hx - 2 + lean, top + 3, 5, 2, R.paper[0])
        layer.rect(hx + 1 + lean, top + 4, 2, 6, R.paper[0])
      } else {
        layer.poly([hx - 2 + lean, top, hx + 4 + lean, top, hx + 1 + lean, top + 7], R.paper[0])
        layer.rect(hx + lean, top + 2, 2, 8, investor ? R.yellow[1] : R.red[1])
        if (!investor) layer.rect(hx - 5 + lean, top + 5, 3, 4, R.paper[1])
      }
    },
    item: athlete
      ? undefined
      : (raster, _frame, hand) => {
          raster.rect(hand.x - 4, hand.y + 1, 9, 7, investor ? R.metal[2] : R.brown[1])
          raster.rect(hand.x - 2, hand.y - 1, 5, 2, R.metal[1])
          raster.rect(hand.x, hand.y + 3, 2, 2, R.yellow[1])
        }
  }
  const paint = (poses: ReturnType<typeof idlePoses>) =>
    poses.map((pose) => human(dressed, body === 'elder' ? { ...pose, lean: 3, handF: [3, 7] } : pose))
  return {
    idle: { frames: paint(idlePoses()), fps: 6, loop: true, hold: [3, 2, 3, 1] },
    walk: {
      frames: paint(walkPoses({ scale: body === 'kid' ? 0.8 : body === 'elder' ? 0.5 : 1 })),
      fps: body === 'elder' ? 8 : 11,
      loop: true
    },
    hurt: { frames: paint(hurtPoses()), fps: 8, loop: false }
  }
}

export const careerSheets = Object.fromEntries(
  Object.keys(BODIES).flatMap((body) =>
    ['soccer', 'bureaucrat', 'entrepreneur'].map((career) => [
      `player:${body}:${career}`,
      () => careerSheet(body, career)
    ])
  )
)
