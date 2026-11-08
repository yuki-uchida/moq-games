/**
 * Stage 3 guild jobs: falconer, crossbow, windmage, bellmonk — outfits, held items and move sets for the shared rig,
 * plus `buildS3JobSheet` (a copy of jobs.ts's builder that reads this table and supports the `heal` animation).
 */
import { enemySpec } from '../contract'
import { R } from '../palette'
import { despeckle } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import type { Job } from './jobs'
import { DEATH_ALPHA, fall, frames, type PoseSpec, type Style } from './moves'
import { V, renderHuman, type View } from './rig'
import { GAMBESON, PALE_GREEN } from './s3-items'

const FEET = { mainFoot: V(2, 3.4, 0), offFoot: V(-2, 3.4, 0) }

/** 鷹匠: arm out with the hawk on the gauntlet; windup raises it, the attack throws the hawk away. */
const FALCONER: Style = {
  carry: {
    lean: 0.8,
    mainHand: V(5.4, -0.2, -3.8),
    main: { aim: { p: 74 }, glow: 1 },
    offHand: V(0.5, 1, -9.5),
    mainFoot: V(1.6, 3.4, 0),
    offFoot: V(-1.6, 3.4, 0)
  },
  swing: { main: false, off: true },
  idle: [{}, { bob: -1, mainHand: V(5.4, -0.2, -4.4), main: { aim: { p: 78 }, glow: 1 }, head: V(0, 0, -0.4) }],
  windup: [
    {
      lean: -0.8,
      crouch: 1,
      face: 'shout',
      mainHand: V(3.6, -0.6, 3.6),
      main: { aim: { p: 40 }, glow: 1.6 },
      offHand: V(4, -2, -3.4),
      ...FEET
    },
    {
      lean: -1.4,
      crouch: 1.4,
      bob: -0.4,
      face: 'shout',
      mainHand: V(2.6, -0.6, 5.2),
      main: { aim: { p: 24 }, glow: 1.6 },
      offHand: V(5, -2, -2.6),
      flow: 1,
      ...FEET
    }
  ],
  attack: [
    {
      lean: -1.6,
      crouch: 1.2,
      face: 'shout',
      mainHand: V(1.8, -0.6, 5.8),
      main: { aim: { p: 16 }, glow: 1.6 },
      offHand: V(4, -3, -3),
      ...FEET
    },
    {
      lean: 3.6,
      crouch: 0.6,
      face: 'shout',
      mainHand: V(9, -0.6, 1.6),
      main: { aim: { p: 86 }, glow: 0 },
      offHand: V(-1.4, -3.2, -7),
      mainFoot: V(5.4, 3.4, 0),
      offFoot: V(-3.4, 3.6, 0)
    },
    {
      lean: 2.6,
      mainHand: V(7.4, -0.4, -1),
      main: { aim: { p: 82 }, glow: 0 },
      offHand: V(-1, -3.2, -7),
      mainFoot: V(4.6, 3.4, 0),
      offFoot: V(-3, 3.6, 0)
    }
  ],
  hurt: [
    {
      lean: -4,
      bob: -1,
      face: 'hurt',
      head: V(-2, 0, 0.6),
      mainHand: V(2, 2, -3),
      main: { aim: { p: 30 }, glow: 1.6 },
      offHand: V(-1.5, 3.6, -6),
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      lean: -3,
      crouch: 1.6,
      face: 'hurt',
      head: V(-1, 0, -0.5),
      mainHand: V(2, 3, -5),
      main: { aim: { p: 60 }, glow: 0 },
      offHand: V(0, 3.4, -7),
      mainFoot: V(1.5, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 }, glow: 0 } })
}

const CROSS_AIM: PoseSpec = {
  crouch: 1.4,
  lean: 1.2,
  face: 'focus',
  head: V(1.6, 0, -1.4),
  mainFoot: V(3, 3.8, 0),
  offFoot: V(-3, 3.8, 0)
}

/** 弩兵: the crossbow rides at the hip, then comes up to the cheek for a long aim; the shot kicks it up. */
const CROSSBOW: Style = {
  carry: {
    lean: 0.6,
    crouch: 0.8,
    mainHand: V(2.8, -3.4, -7.2),
    main: { aim: { p: 92 }, glow: 1, draw: 1 },
    offHand: V(8.4, -3.4, -6.4),
    mainFoot: V(1.8, 3.6, 0),
    offFoot: V(-1.8, 3.6, 0)
  },
  swing: { main: false, off: false },
  idle: [{}, { bob: -1, mainHand: V(2.8, -3.4, -7.8), offHand: V(8.4, -3.4, -7), head: V(0, 0, -0.4) }],
  windup: [
    {
      ...CROSS_AIM,
      mainHand: V(2.6, -3.4, -1.2),
      main: { aim: { p: 90 }, glow: 1, draw: 1 },
      offHand: V(11, -3.4, -0.6)
    },
    {
      ...CROSS_AIM,
      bob: -0.4,
      lean: 1.6,
      mainHand: V(3, -3.4, -0.6),
      main: { aim: { p: 89 }, glow: 1, draw: 1 },
      offHand: V(11.4, -3.4, 0),
      flow: 1
    }
  ],
  attack: [
    {
      ...CROSS_AIM,
      mainHand: V(3, -3.4, -0.6),
      main: { aim: { p: 89 }, glow: 1, draw: 1 },
      offHand: V(11.4, -3.4, 0)
    },
    {
      ...CROSS_AIM,
      lean: -1.8,
      face: 'shout',
      head: V(-0.4, 0, 0.2),
      mainHand: V(-0.4, -3.4, 1.2),
      main: { aim: { p: 66 }, glow: 0, draw: 0 },
      offHand: V(7.4, -3.4, 3.2),
      flow: -1
    },
    {
      ...CROSS_AIM,
      lean: 0,
      face: 'normal',
      mainHand: V(2, -3.4, -3),
      main: { aim: { p: 80 }, glow: 0, draw: 0 },
      offHand: V(9, -3.4, -2.6)
    }
  ],
  hurt: [
    {
      lean: -4,
      bob: -1,
      face: 'hurt',
      head: V(-2, 0, 0.6),
      mainHand: V(0.4, -1, -7),
      main: { aim: { p: 120 }, glow: 1, draw: 1 },
      offHand: V(5, -3, -6),
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      lean: -3,
      crouch: 1.6,
      face: 'hurt',
      head: V(-1, 0, -0.5),
      mainHand: V(0, 0, -8),
      main: { aim: { p: 135 }, glow: 1, draw: 1 },
      offHand: V(3, -3, -7),
      mainFoot: V(1.5, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 }, glow: 0, draw: 0 } })
}

/** 風の魔導士: a tall feathered staff; windup swirls the wind, the attack sweeps a gust across the field. */
const WINDMAGE: Style = {
  carry: {
    lean: 0.4,
    mainHand: V(2.6, 0.2, -6.4),
    main: { aim: { p: 4 }, glow: 0.4 },
    offHand: V(0.5, 1, -9.5),
    mainFoot: V(1.4, 3, 0),
    offFoot: V(-1.4, 3, 0)
  },
  swing: { main: false, off: true },
  idle: [
    { flow: 0 },
    { bob: -1, flow: 1, mainHand: V(2.6, 0.2, -6.9), main: { aim: { p: 5 }, glow: 0.6 }, head: V(0, 0, -0.4) }
  ],
  windup: [
    {
      crouch: 0.6,
      lean: -0.6,
      face: 'shout',
      mainHand: V(2.6, -0.4, 1.4),
      main: { aim: { p: 14 }, glow: 0.9 },
      offHand: V(5.4, -2.6, -0.6),
      flow: 1,
      ...FEET
    },
    {
      crouch: 0.4,
      lean: -0.8,
      bob: -0.4,
      face: 'shout',
      mainHand: V(2.6, -0.4, 3.6),
      main: { aim: { p: 20 }, glow: 1 },
      offHand: V(5.4, -2.6, 0.6),
      flow: -1,
      ...FEET
    }
  ],
  attack: [
    {
      crouch: 0.8,
      lean: -2.2,
      face: 'shout',
      mainHand: V(0.6, 0.2, 3.4),
      main: { aim: { p: -30 }, glow: 0.9, draw: 0.62 },
      offHand: V(3.4, -3, -2.4),
      flow: -1,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-2.4, 3.4, 0)
    },
    {
      crouch: 0.6,
      lean: 3.4,
      face: 'shout',
      mainHand: V(8.6, -0.2, -0.4),
      main: { aim: { p: 52 }, glow: 1.4, draw: 0.62 },
      offHand: V(5, -3.4, -2),
      flow: 2,
      mainFoot: V(4.6, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      crouch: 0.6,
      lean: 2.4,
      mainHand: V(7.2, -0.2, -1.4),
      main: { aim: { p: 46 }, glow: 1.3, draw: 0.62 },
      offHand: V(3.2, -3.4, -3.2),
      flow: 1,
      mainFoot: V(4, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  hurt: [
    {
      lean: -4,
      bob: -1,
      face: 'hurt',
      head: V(-2, 0, 0.6),
      mainHand: V(-1, 3, -5.6),
      main: { aim: { p: -14 }, glow: 0.1 },
      offHand: V(-1.5, 3.6, -6),
      flow: 2,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      lean: -3,
      crouch: 1.6,
      face: 'hurt',
      head: V(-1, 0, -0.5),
      mainHand: V(0, 3, -7),
      main: { aim: { p: 24 }, glow: 0.1 },
      offHand: V(0, 3.4, -7),
      flow: 1,
      mainFoot: V(1.5, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 }, glow: 0 } })
}

/** 鐘番の修道士: a hand bell; heal rings it overhead in a golden glow. */
const BELLMONK: Style = {
  carry: {
    lean: 0.4,
    mainHand: V(3.6, 0.4, -6.8),
    main: { aim: { p: 152 }, glow: 0 },
    offHand: V(3.4, -1.8, -7.4),
    mainFoot: V(1.4, 3, 0),
    offFoot: V(-1.4, 3, 0)
  },
  swing: { main: false, off: false },
  idle: [
    { flow: 0 },
    { bob: -1, flow: 1, mainHand: V(3.6, 0.4, -7.2), main: { aim: { p: 146 }, glow: 0 }, head: V(0, 0, -0.4) }
  ],
  windup: [
    {
      crouch: 0.6,
      lean: -0.8,
      face: 'shout',
      mainHand: V(2, 0.6, 3.6),
      main: { aim: { p: 172 }, glow: 0.4 },
      offHand: V(4, -2, -2.4),
      flow: 1,
      ...FEET
    },
    {
      crouch: 0.6,
      lean: -1,
      bob: -0.4,
      face: 'shout',
      mainHand: V(1.6, 0.6, 5),
      main: { aim: { p: 196 }, glow: 0.6 },
      offHand: V(4, -2, -2),
      flow: -1,
      ...FEET
    }
  ],
  attack: [
    {
      crouch: 1,
      lean: -2,
      face: 'shout',
      mainHand: V(0.6, 0.6, 5.2),
      main: { aim: { p: 188 }, glow: 0.4 },
      offHand: V(3.4, -3, -3.4),
      mainFoot: V(2.6, 3.4, 0),
      offFoot: V(-2.6, 3.4, 0)
    },
    {
      crouch: 0.6,
      lean: 3.6,
      face: 'shout',
      mainHand: V(8, 0.4, -2.4),
      main: { aim: { p: 100 }, glow: 1.2 },
      offHand: V(0, -3.4, -6),
      mainFoot: V(5.4, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      crouch: 0.8,
      lean: 2.6,
      mainHand: V(6.4, 0.6, -5),
      main: { aim: { p: 130 }, glow: 0.8 },
      offHand: V(1, -3.4, -6.4),
      mainFoot: V(4.4, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  heal: [
    {
      crouch: 0.4,
      lean: -0.4,
      mainHand: V(2.2, 0.6, 2.4),
      main: { aim: { p: 168 }, glow: 0 },
      offHand: V(3, -2, -3),
      ...FEET
    },
    {
      lean: -1,
      bob: 0.6,
      face: 'shout',
      mainHand: V(1.4, 0.6, 9.4),
      main: { aim: { p: 150 }, glow: 0.8 },
      offHand: V(2.4, -2.4, -0.6),
      flow: 1,
      ...FEET
    },
    {
      lean: -1,
      bob: 0.8,
      face: 'shout',
      mainHand: V(1.4, 0.6, 10.2),
      main: { aim: { p: 212 }, glow: 1.4 },
      offHand: V(2.4, -2.4, 0.4),
      flow: -1,
      ...FEET
    },
    {
      lean: -0.4,
      bob: 0.2,
      mainHand: V(1.8, 0.6, 7),
      main: { aim: { p: 176 }, glow: 2 },
      offHand: V(3, -2.4, -2),
      flow: 0,
      ...FEET
    }
  ],
  hurt: [
    {
      lean: -4,
      bob: -1,
      face: 'hurt',
      head: V(-2, 0, 0.6),
      mainHand: V(-1, 3, -5.6),
      main: { aim: { p: 120 }, glow: 0 },
      offHand: V(-1.5, 3.6, -6),
      flow: 2,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      lean: -3,
      crouch: 1.6,
      face: 'hurt',
      head: V(-1, 0, -0.5),
      mainHand: V(0, 3, -7),
      main: { aim: { p: 130 }, glow: 0 },
      offHand: V(0, 3.4, -7),
      flow: 1,
      mainFoot: V(1.5, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 }, glow: 0 } })
}

const IRON = [R.steel[1], R.steel[1], R.steel[2], R.steel[3], R.steel[4]] as const

export const S3_JOBS: Record<string, Job> = {
  // 鷹匠: feathered green cap, leather jerkin over a forest tunic, a big gauntlet.
  falconer: {
    outfit: {
      skin: R.skinTan,
      hair: R.hairBlonde,
      hairStyle: 'short',
      headgear: { kind: 's3feathercap', ramp: R.clothForest, trim: R.gold },
      brow: 'eager',
      tunic: R.clothForest,
      sleeves: R.clothForest,
      gloves: R.leather,
      overlays: [
        { kind: 'vest', ramp: R.leather },
        { kind: 'belt', ramp: R.wood, trim: R.gold }
      ],
      pants: R.clothOchre,
      boots: R.leather
    },
    held: { main: { kind: 's3gauntlet', a: R.leather, trim: R.gold } },
    style: FALCONER
  },
  // 弩兵: steel kettle hat, quilted blue gambeson, heavy crossbow.
  crossbow: {
    outfit: {
      skin: R.skinLight,
      hair: R.hairBrown,
      hairStyle: 'short',
      headgear: { kind: 's3kettle', ramp: IRON, trim: R.jobRed },
      brow: 'stern',
      tunic: GAMBESON,
      sleeves: GAMBESON,
      gloves: R.leather,
      overlays: [{ kind: 's3quilt', ramp: GAMBESON, trim: R.leather }],
      pants: R.clothBlack,
      boots: R.leather,
      bulk: 0.4
    },
    held: { main: { kind: 's3crossbow', a: IRON, b: R.wood, trim: R.gold } },
    style: CROSSBOW
  },
  // 風の魔導士: pale green and white robes, a swirling sash, long silver hair, a feathered ring staff.
  windmage: {
    outfit: {
      skin: R.skinLight,
      hair: R.hairSilver,
      hairStyle: 'long',
      headgear: { kind: 's3windcirclet', ramp: R.gold, trim: R.gold },
      brow: 'calm',
      tunic: PALE_GREEN,
      sleeves: R.clothWhite,
      overlays: [
        { kind: 'robe', ramp: R.clothWhite },
        { kind: 's3sash', ramp: R.jobGreen }
      ],
      pants: R.clothWhite,
      boots: R.leather
    },
    held: { main: { kind: 's3windstaff', a: R.wood } },
    style: WINDMAGE
  },
  // 鐘番の修道士: brown robe, hood, rope belt and a big golden hand bell.
  bellmonk: {
    outfit: {
      skin: R.skinDark,
      hair: R.hairBlack,
      hairStyle: 'none',
      headgear: { kind: 's3hood', ramp: R.hairBrown, trim: R.clothOchre },
      brow: 'calm',
      tunic: R.wood,
      sleeves: R.wood,
      overlays: [
        { kind: 'robe', ramp: R.wood },
        { kind: 's3rope', ramp: R.hay }
      ],
      pants: R.wood,
      boots: R.leather,
      bulk: 0.3
    },
    held: { main: { kind: 's3bell', a: R.gold } },
    style: BELLMONK
  }
}

/** Renders every animation of the enemy sheet contract for one stage-3 job. */
export function buildS3JobSheet(kind: string): Sheet {
  const job = S3_JOBS[kind]
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(enemySpec(kind))) {
    const [base, dir] = name.split('_') as [string, View | undefined]
    const view: View = dir ?? 'side'
    const out = Array.from({ length: want.frames }, (_, i) =>
      despeckle(renderHuman(view, frames(job.style, base, i), job.outfit, job.held))
    )
    const a: Anim = anim(out, want.fps, want.loop)
    if (base === 'death') a.alpha = DEATH_ALPHA
    sheet[name] = a
  }
  return sheet
}
