/**
 * Stage 2 guild enemies as rig data: 盗賊 thief, 錬金術師 alchemist, ネズミ捕り ratcatcher, 槍衛兵 spearguard.
 * They register into the shared JOBS table and are rendered by buildJobSheet (thief dash adds a dust streak).
 */
import { R } from '../palette'
import { Raster } from '../raster'
import type { Sheet } from '../sheet'
import { JOBS, buildJobSheet, type Job } from './jobs'
import { fall, type PoseSpec, type Style } from './moves'
import './s2-parts'
import { V } from './rig'

const TEAL = [R.water[1], R.water[2], R.water[3], R.water[3], R.water[4]] as const

// ---------------------------------------------------------------------------------------------------------
// Move sets

const hurt = (carry: PoseSpec): PoseSpec[] => [
  {
    lean: -4.2,
    bob: -1,
    head: V(-2, 0, 0.6),
    face: 'hurt',
    mainHand: V(-1.5, 3.6, -6),
    offHand: V(-1.5, 3.6, -6),
    ...carry
  },
  {
    lean: -3,
    crouch: 1.6,
    head: V(-1, 0, -0.5),
    face: 'hurt',
    mainHand: V(0, 3.4, -7),
    offHand: V(0, 3.4, -7),
    ...carry
  }
]

/** 盗賊: low, sneaky, a dagger held ready. */
const THIEF: Style = {
  carry: {
    lean: 3.2,
    crouch: 3,
    head: V(1, 0, -0.6),
    mainHand: V(5, 0.6, -5.4),
    main: { aim: { p: 62 } },
    offHand: V(1.5, -2, -8),
    mainFoot: V(2.8, 3.8, 0),
    offFoot: V(-2.8, 3.8, 0)
  },
  swing: { main: false, off: true },
  idle: [{}, { bob: -0.8, head: V(1, 0, -1.2), offHand: V(1.5, -2, -8.6) }],
  windup: [
    {
      crouch: 4.6,
      lean: 1.2,
      face: 'focus',
      mainHand: V(-1.2, 1.6, 0.4),
      main: { aim: { p: -34 } },
      offHand: V(5, -2, -3.4),
      mainFoot: V(3.6, 4, 0),
      offFoot: V(-3.6, 4, 0)
    },
    {
      crouch: 5.2,
      lean: 0.4,
      sway: 0.8,
      face: 'focus',
      mainHand: V(-2.2, 1.6, 0.8),
      main: { aim: { p: -48 } },
      offHand: V(5.6, -2, -3),
      flow: 1,
      mainFoot: V(3.6, 4, 0),
      offFoot: V(-3.6, 4, 0)
    }
  ],
  attack: [
    {
      crouch: 5,
      lean: -1.4,
      face: 'focus',
      mainHand: V(-2.4, 1.6, 0.4),
      main: { aim: { p: -52 } },
      offHand: V(5, -2, -3),
      mainFoot: V(3.8, 4, 0),
      offFoot: V(-3.8, 4, 0)
    },
    {
      crouch: 2.4,
      lean: 6,
      face: 'shout',
      mainHand: V(8.4, 0.4, -2.6),
      main: { aim: { p: 98 }, smear: { p: 20 } },
      offHand: V(-2, -3, -6),
      mainFoot: V(7.4, 3.8, 0),
      offFoot: V(-4.6, 3.8, 0)
    },
    {
      crouch: 3,
      lean: 4.4,
      mainHand: V(6.6, 0.6, -6),
      main: { aim: { p: 140 } },
      offHand: V(-1, -3.4, -7),
      mainFoot: V(6, 3.8, 0),
      offFoot: V(-4, 3.8, 0)
    }
  ],
  hurt: hurt({ main: { aim: { p: 20 } }, mainFoot: V(2, 3.4, 0), offFoot: V(-3.4, 3.4, 0) }),
  death: fall({ main: { aim: { p: 150 } } }),
  dash: [0, 1, 2].map((i) => ({
    tilt: -13,
    crouch: 5.4,
    lean: 6.4,
    head: V(1.6, 0, -0.4),
    face: 'focus' as const,
    mainHand: V(-5.6, 1.6, -4.4),
    main: { aim: { p: -70 } },
    offHand: V(-6, -2, -3.2),
    mainFoot: [V(7, 3.6, 0), V(-1, 3.6, 3.2), V(-7.2, 3.6, 1)][i],
    offFoot: [V(-7.2, 3.6, 1), V(1, 3.6, 0), V(7, 3.6, 0)][i],
    bob: [-1, 0.6, -1][i],
    flow: [2, 3, 2][i]
  }))
}

/** 錬金術師: shakes a flask and lobs it overhand. */
const ALCHEMIST: Style = {
  carry: {
    lean: 0.8,
    mainHand: V(4, 0.8, -5.6),
    main: { aim: { p: 4 }, glow: 0.3 },
    offHand: V(0.5, 1, -9.5),
    mainFoot: V(1.6, 3.4, 0),
    offFoot: V(-1.6, 3.4, 0)
  },
  swing: { main: false, off: true },
  idle: [
    { flow: 0 },
    { bob: -1, mainHand: V(4, 0.8, -6.2), main: { aim: { p: 14 }, glow: 0.5 }, head: V(0, 0, -0.4), flow: 1 }
  ],
  windup: [
    {
      crouch: 0.8,
      lean: 0.6,
      face: 'shout',
      mainHand: V(3.6, 0.2, 1.6),
      main: { aim: { p: 14 }, glow: 1 },
      offHand: V(4.4, -1.4, -2.6),
      flow: 1,
      mainFoot: V(2, 3.6, 0),
      offFoot: V(-2, 3.6, 0)
    },
    {
      crouch: 0.8,
      lean: 0.6,
      sway: 0.8,
      face: 'shout',
      mainHand: V(4.6, 0.8, 0.4),
      main: { aim: { p: -16 }, glow: 1 },
      offHand: V(3.8, -1.4, -3.4),
      flow: -1,
      mainFoot: V(2, 3.6, 0),
      offFoot: V(-2, 3.6, 0)
    }
  ],
  attack: [
    {
      crouch: 1.6,
      lean: -3.2,
      face: 'shout',
      mainHand: V(-2.2, 1.6, 8.4),
      main: { aim: { p: -40 }, glow: 1 },
      offHand: V(5, -2.6, -1),
      flow: -2,
      mainFoot: V(3, 3.6, 0),
      offFoot: V(-3, 3.6, 0)
    },
    {
      crouch: 0.6,
      lean: 4.4,
      face: 'shout',
      mainHand: V(7.4, 0.6, 5),
      main: { aim: { p: 80 }, glow: 0.6, hidden: true },
      offHand: V(-1, -3.4, -6),
      flow: 2,
      mainFoot: V(5.6, 3.6, 0),
      offFoot: V(-3.4, 3.6, 0)
    },
    {
      crouch: 1,
      lean: 3,
      mainHand: V(6.2, 0.8, -2.4),
      main: { aim: { p: 100 }, hidden: true },
      offHand: V(-0.4, -3.4, -6.4),
      flow: 1,
      mainFoot: V(4.8, 3.6, 0),
      offFoot: V(-3, 3.6, 0)
    }
  ],
  hurt: hurt({ main: { aim: { p: -10 }, glow: 0.8 }, flow: 2, mainFoot: V(2, 3.4, 0), offFoot: V(-3.4, 3.4, 0) }),
  death: fall({ main: { aim: { p: 150 }, glow: 0 } })
}

/** ネズミ捕り: a long snare pole; the attack swipes the net forward and sets the snare. */
const RATCATCHER: Style = {
  carry: {
    lean: 0.8,
    mainHand: V(3.6, 0.8, -4.6),
    main: { aim: { p: 12 } },
    offHand: V(0.5, 1, -9.5),
    mainFoot: V(1.6, 3.4, 0),
    offFoot: V(-1.6, 3.4, 0)
  },
  swing: { main: false, off: true },
  idle: [{}, { bob: -1, mainHand: V(3.6, 0.8, -5.2), main: { aim: { p: 16 } }, head: V(0, 0, -0.4) }],
  windup: [
    {
      crouch: 2,
      lean: -1.6,
      face: 'focus',
      mainHand: V(0.4, 1.6, 0.6),
      main: { aim: { p: -42 } },
      offHand: V(4.4, -2, -2.6),
      mainFoot: V(3, 3.8, 0),
      offFoot: V(-3, 3.8, 0)
    },
    {
      crouch: 2.6,
      lean: -2.2,
      sway: 0.6,
      face: 'focus',
      mainHand: V(0, 1.6, 1.4),
      main: { aim: { p: -60 } },
      offHand: V(4.8, -2, -2),
      flow: 1,
      mainFoot: V(3, 3.8, 0),
      offFoot: V(-3, 3.8, 0)
    }
  ],
  attack: [
    {
      crouch: 2.8,
      lean: -3,
      face: 'focus',
      mainHand: V(-0.4, 1.4, 2.2),
      main: { aim: { p: -68 } },
      offHand: V(4.6, -2.6, -2),
      mainFoot: V(3.4, 3.8, 0),
      offFoot: V(-3.4, 3.8, 0)
    },
    {
      crouch: 1.4,
      lean: 4.4,
      face: 'shout',
      mainHand: V(6.6, 0.6, -1.6),
      main: { aim: { p: 98 }, smear: { p: -30 } },
      offHand: V(-1, -3.2, -6.4),
      mainFoot: V(6.4, 3.8, 0),
      offFoot: V(-4, 3.8, 0)
    },
    {
      crouch: 1.8,
      lean: 3.4,
      mainHand: V(6, 0.8, -4.4),
      main: { aim: { p: 128 } },
      offHand: V(-0.6, -3.4, -6.4),
      mainFoot: V(5.2, 3.8, 0),
      offFoot: V(-3.6, 3.8, 0)
    }
  ],
  hurt: hurt({ main: { aim: { p: -10 } }, mainFoot: V(2, 3.4, 0), offFoot: V(-3.4, 3.4, 0) }),
  death: fall({ main: { aim: { p: 140 } } })
}

/** 槍衛兵: a long spear (reach) and a round shield; guard = braced with the spear forward. */
const SPEARGUARD: Style = {
  carry: {
    lean: 0.8,
    mainHand: V(3.4, 0.8, -6.4),
    main: { aim: { p: 5 } },
    offHand: V(4.6, -4.2, -3),
    off: { aim: { p: 0 }, turn: 26 },
    mainFoot: V(1.8, 3.6, 0),
    offFoot: V(-1.8, 3.6, 0)
  },
  swing: { main: false, off: false },
  idle: [{}, { bob: -1, head: V(0, 0, -0.4), offHand: V(4.6, -4.2, -3.6) }],
  windup: [
    {
      crouch: 2,
      lean: -1.2,
      face: 'shout',
      mainHand: V(-1.4, 1.4, -3.6),
      main: { aim: { p: 80 } },
      offHand: V(5.2, -3.8, -2),
      off: { aim: { p: 0 }, turn: 20 },
      mainFoot: V(3, 3.8, 0),
      offFoot: V(-3, 3.8, 0)
    },
    {
      crouch: 2.6,
      lean: -2.2,
      sway: 0.6,
      face: 'shout',
      mainHand: V(-3, 1.4, -3.6),
      main: { aim: { p: 80 } },
      offHand: V(5.2, -3.8, -2),
      off: { aim: { p: 0 }, turn: 20 },
      flow: 1,
      mainFoot: V(3, 3.8, 0),
      offFoot: V(-3, 3.8, 0)
    }
  ],
  attack: [
    {
      crouch: 2.8,
      lean: -3,
      face: 'shout',
      mainHand: V(-4, 1.4, -3.4),
      main: { aim: { p: 80 } },
      offHand: V(5.2, -3.8, -2),
      off: { aim: { p: 0 }, turn: 20 },
      mainFoot: V(3.4, 3.8, 0),
      offFoot: V(-3.4, 3.8, 0)
    },
    {
      crouch: 1.2,
      lean: 3.4,
      face: 'shout',
      mainHand: V(7.4, 0.6, -3.4),
      main: { aim: { p: 90 } },
      offHand: V(4, -4.6, -3),
      off: { aim: { p: 0 }, turn: 14 },
      mainFoot: V(7, 3.8, 0),
      offFoot: V(-4.4, 3.8, 0)
    },
    {
      crouch: 1.6,
      lean: 3.6,
      mainHand: V(6.4, 0.8, -4),
      main: { aim: { p: 86 } },
      offHand: V(4.6, -4.4, -3),
      off: { aim: { p: 0 }, turn: 22 },
      mainFoot: V(5.6, 3.8, 0),
      offFoot: V(-3.6, 3.8, 0)
    }
  ],
  hurt: hurt({
    main: { aim: { p: -4 } },
    off: { aim: { p: 0 }, turn: 34 },
    offHand: V(3.6, -3.4, -4),
    mainFoot: V(2, 3.4, 0),
    offFoot: V(-3.4, 3.4, 0)
  }),
  guard: [
    {
      crouch: 2.4,
      lean: 2,
      face: 'focus',
      mainHand: V(6.6, 1, -4),
      main: { aim: { p: 82 } },
      offHand: V(6.2, -4.6, 0.4),
      off: { aim: { p: 0 }, turn: 10 },
      mainFoot: V(3.4, 3.8, 0),
      offFoot: V(-3.4, 3.8, 0)
    },
    {
      crouch: 2.8,
      lean: 2.5,
      bob: -0.4,
      face: 'focus',
      mainHand: V(7.2, 1, -4),
      main: { aim: { p: 82 } },
      offHand: V(6.6, -4.6, 0.2),
      off: { aim: { p: 0 }, turn: 10 },
      mainFoot: V(3.4, 3.8, 0),
      offFoot: V(-3.4, 3.8, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 } }, off: { aim: { p: 0 }, turn: 60 } })
}

// ---------------------------------------------------------------------------------------------------------
// Outfits

const STAGE2_JOBS: Record<string, Job> = {
  // 盗賊: dark hood with a scarf mask, light leather, a short dagger.
  thief: {
    outfit: {
      skin: R.skinTan,
      hair: R.hairBlack,
      hairStyle: 'none',
      headgear: { kind: 'hood', ramp: R.clothBlack, trim: R.clothPurple },
      brow: 'sly',
      tunic: R.leather,
      sleeves: R.clothBlack,
      gloves: R.clothBlack,
      overlays: [
        { kind: 'belt', ramp: R.clothBlack, trim: R.steel },
        { kind: 'collar', ramp: R.clothPurple }
      ],
      pants: R.clothBlack,
      boots: R.clothBlack
    },
    held: { main: { kind: 'dagger', a: R.steel, b: R.clothBlack } },
    style: THIEF
  },
  // 錬金術師: goggles, a stained apron over a teal coat, a belt of flasks.
  alchemist: {
    outfit: {
      skin: R.skinLight,
      hair: R.hairBlonde,
      hairStyle: 'spiky',
      headgear: { kind: 'goggles', ramp: R.leather },
      brow: 'eager',
      tunic: TEAL,
      overlays: [
        { kind: 'coat', ramp: TEAL },
        { kind: 'apron', ramp: R.clothWhite },
        { kind: 'stains', ramp: R.poison },
        { kind: 'flasks', ramp: R.leather }
      ],
      gloves: R.leather,
      pants: R.clothBlack,
      boots: R.leather
    },
    held: { main: { kind: 'flask', a: R.paper, b: R.poison } },
    style: ALCHEMIST
  },
  // ネズミ捕り: wide-brim hat, patched coat, a cage on the back and a snare pole.
  ratcatcher: {
    outfit: {
      skin: R.skinTan,
      hair: R.hairBrown,
      hairStyle: 'short',
      headgear: { kind: 'brim', ramp: R.wood, trim: R.leather },
      brow: 'stern',
      tunic: R.clothForest,
      overlays: [
        { kind: 'coat', ramp: R.clothForest },
        { kind: 'patch', ramp: R.clothOchre },
        { kind: 'belt', ramp: R.leather, trim: R.steel }
      ],
      gloves: R.leather,
      pants: R.clothNavy,
      boots: R.wood,
      back: { kind: 'cage', ramp: R.wood }
    },
    held: { main: { kind: 'netpole', a: R.wood } },
    style: RATCATCHER
  },
  // 槍衛兵: city-guard kettle helm, navy tabard over mail, a long spear and a round shield.
  spearguard: {
    outfit: {
      skin: R.skinLight,
      hair: R.hairBlack,
      hairStyle: 'short',
      headgear: { kind: 'cityhelm', ramp: R.steel, trim: R.gold },
      brow: 'stern',
      tunic: [R.steel[1], R.steel[2], R.steel[3], R.steel[3], R.steel[4]],
      sleeves: [R.steel[1], R.steel[2], R.steel[3], R.steel[3], R.steel[4]],
      overlays: [
        { kind: 'guardtabard', ramp: R.clothNavy },
        { kind: 'belt', ramp: R.leather, trim: R.gold }
      ],
      gloves: R.leather,
      pants: R.clothNavy,
      boots: R.leather,
      bulk: 0.3
    },
    held: {
      main: { kind: 'longspear', a: R.steel, b: R.wood },
      off: { kind: 'round', a: R.clothNavy, trim: R.gold }
    },
    style: SPEARGUARD
  }
}
Object.assign(JOBS, STAGE2_JOBS)

/** The thief's dash gets a dust streak trailing behind the sprint. */
function withDust(sheet: Sheet): Sheet {
  for (const [name, a] of Object.entries(sheet)) {
    if (!name.startsWith('dash_')) continue
    const dir = name.slice(5)
    a.frames = a.frames.map((f, i) => {
      const under = new Raster(f.w, f.h)
      const dust = [R.dirt[0], R.dirt[1], R.dirt[2]]
      const lines =
        dir === 'side'
          ? [
              [14 - i * 2, 54, 26, 54],
              [10 - i, 50, 20, 51],
              [18 + i, 57, 27, 57]
            ]
          : dir === 'down'
            ? [
                [27, 46 - i * 2, 27, 36],
                [37, 48 - i, 37, 40],
                [32, 44, 32, 34 - i]
              ]
            : [
                [27, 52, 27, 58 + i],
                [37, 52, 37, 60],
                [32, 54, 32, 61 - i]
              ]
      lines.forEach(([x0, y0, x1, y1], k) => {
        under.line(x0, y0, x1, y1, dust[k % 3])
        under.line(x0, y0 + 1, x1 - 2, y1 + 1, dust[(k + 1) % 3])
      })
      // puffs at the feet
      under.ellipse(dir === 'side' ? 17 + i * 2 : 24, 55 - (i % 2), 3, 2.2, dust[1])
      under.ellipse(dir === 'side' ? 11 + i : 40, 54, 2.2, 1.8, dust[0])
      return under.blit(f)
    })
  }
  return sheet
}

export const stage2Enemies: Record<string, () => Sheet> = Object.fromEntries(
  Object.keys(STAGE2_JOBS).map((kind) => [`enemy:${kind}`, () => withDust(buildJobSheet(kind))])
)
