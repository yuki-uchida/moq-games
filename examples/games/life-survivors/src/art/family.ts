import { C, R } from './palette'
import type { Raster } from './raster'
import { HAIR_KEY, idlePoses, planes, walkPoses } from './player'
import { LIE, SKIN, human, type Body, type HeadSpec, type Pose, type Pt } from './rig'
import type { Anim, Sheet } from './sheet'

/** The family who walk with a married player: support figures, not player stages. */

const anim = (frames: Raster[], fps: number, hold?: number[]): Anim => ({ frames, fps, loop: true, hold })

// ---------------------------------------------------------------------------------------------
// 配偶者: a woman with long black hair swept to one side and a gold hair clip, a coral long-sleeved dress
// with a white round collar and a thin belt, the skirt flaring to mid-calf, flat shoes.

const DRESS = R.orange

const SPOUSE_HEAD: HeadSpec = {
  w: 19,
  h: 18,
  hairAt: [-1, -1],
  hair: [
    '......jjjjjjj........',
    '....jjHHHHHHHjj......',
    '...jHHHaaaHHHHHj.....',
    '..jHHaaHHHHHHHHHj....',
    '..jHHHHHHHHHHHHHHj...',
    '.jHHHHHHHHHHHHHHHHj..',
    '.jHHHHJ.JHHHHHHHHHj..',
    '.jHHHJ....JJHHHHHHj..',
    '.jHHJ.........JJHHHj.',
    '.jHHJ............JHj.',
    '.jHHJ............JHj.',
    '.jHHJ............JHj.',
    '.jHHJ.............Hj.',
    '.jHHHJ............j..',
    '.jHHHJ...............',
    '.jHHHJ...............',
    'jHHHHJ...............',
    'jHHHJ................',
    'jHHJ.................',
    '.jj..................'
  ],
  key: HAIR_KEY,
  eyes: 'adult',
  near: [6, 10],
  far: [14, 10],
  mouth: [10, 15],
  nose: [12, 13],
  ear: [0, 10],
  blush: true,
  extra: (l, x, y, face) => {
    // A gold clip above the parting.
    l.rect(x + 2, y + 5, 3, 1, R.yellow[1])
    l.set(x + 2, y + 5, R.yellow[0])
    if (face === 'none' || face === 'dead') return
    // Lashes flick out at the outer corners (along the lid line when blinking); soft rose lips.
    const lash = face === 'blink' ? 12 : face === 'open' ? 10 : -1
    if (lash > 0) {
      l.paint(x + 5, y + lash, C.inkCool)
      l.paint(x + 15, y + lash, C.inkCool)
    }
    l.map((c, _x, py) => (c === SKIN[3] && py >= y + 15 && py <= y + 17 ? R.pink[2] : c))
  }
}

function flat(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 2
  const y = Math.round(end.y)
  l.rect(x, y + 1, 5, 2, R.brown[2])
  l.rect(x + 1, y + 1, 2, 1, R.brown[1])
  l.set(x + 4, y + 2, R.brown[3])
}

export const SPOUSE: Body = {
  hip: 41,
  thigh: 7.5,
  shin: 7.5,
  legW: 4,
  gap: 3,
  torsoH: 14,
  span: 7,
  upper: 6.5,
  fore: 6,
  armW: 3,
  hang: [-1, 12],
  head: SPOUSE_HEAD,
  headAt: [-9, -17],
  pants: SKIN,
  sleeve: DRESS,
  cuff: DRESS[2],
  shoe: flat,
  torso: (l, { hx, hy, top, lean: L, p }) => {
    l.rect(hx - 2 + L, top - 3, 5, 4, SKIN[2])
    // The skirt flares from the belt to mid-calf; its hem trails the stride a little.
    const sway = -Math.sign(p.lag)
    l.poly([hx - 6, hy - 2, hx + 7, hy - 2, hx + 10 + sway, hy + 10, hx - 9 + sway, hy + 10], DRESS[1])
    // Fitted bodice.
    l.poly(
      [hx - 7 + L, top + 2, hx - 5 + L, top, hx + 5 + L, top, hx + 7 + L, top + 2, hx + 6, hy, hx - 6, hy],
      DRESS[1]
    )
    planes(l, DRESS, DRESS[1], 1, 2)
    // Pleats and the hem line.
    l.line(hx - 3, hy + 1, hx - 5 + sway, hy + 9, DRESS[2])
    l.line(hx + 3, hy + 1, hx + 4 + sway, hy + 9, DRESS[2])
    l.rect(hx - 8 + sway, hy + 10, 18, 1, DRESS[2])
    // Thin belt with a small buckle.
    l.rect(hx - 6, hy - 2, 13, 1, R.brown[2])
    l.set(hx + 1, hy - 2, R.yellow[1])
    // White round collar.
    l.ellipse(hx + L + 0.5, top + 0.5, 4, 1.6, R.paper[0])
    l.rect(hx - 1 + L, top - 1, 3, 2, SKIN[1])
  },
  lie: { thick: 9, coat: DRESS, head: { grid: LIE.fluffy, key: HAIR_KEY } }
}

export const spouse = (p: Pose) => human(SPOUSE, p)

export const familySheets: Record<string, () => Sheet> = {
  'family:spouse': () => ({
    idle: anim(idlePoses().map(spouse), 6, [3, 2, 3, 1]),
    walk: anim(walkPoses({ scale: 0.8, swing: 0.5 }).map(spouse), 11)
  })
}
