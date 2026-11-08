/**
 * Move sets for the guild rig: a `Style` lists poses for idle / windup / attack / hurt / death / guard, walking is
 * generated from one shared contact-passing cycle with the weapon arm(s) held in the style's carry pose.
 * Pose `r` offsets of hands and feet are "outward" for their own side, so lefties reuse the same numbers.
 */
import { V, pose, type Pose } from './rig'

export type PoseSpec = Partial<Pose>

export interface Style {
  /** What the figure keeps while walking: item states, weapon-arm hands, stance. */
  carry: PoseSpec
  /** Which arms swing while walking. */
  swing: { main: boolean; off: boolean }
  idle: PoseSpec[]
  windup: PoseSpec[]
  attack: PoseSpec[]
  hurt: PoseSpec[]
  death: PoseSpec[]
  guard?: PoseSpec[]
}

/** Contact / passing walk cycle (4 frames). `amp` scales the stride. */
export function walkPose(i: number, style: Style, amp = 1): Pose {
  const A = 4.2 * amp
  const phase = i % 4
  const R_FWD = phase === 0
  const L_FWD = phase === 2
  const passing = phase === 1 || phase === 3
  const mainFoot = R_FWD ? V(A, 3.2, 0) : L_FWD ? V(-A, 3.2, 1.4) : phase === 1 ? V(0.5, 3, 0) : V(1, 3.2, 3.2)
  const offFoot = L_FWD ? V(A, 3.2, 0) : R_FWD ? V(-A, 3.2, 1.4) : phase === 3 ? V(0.5, 3, 0) : V(1, 3.2, 3.2)
  const swingF = R_FWD ? -3.6 : L_FWD ? 3.6 : 0
  const base: PoseSpec = {
    bob: passing ? 0.4 : -1,
    mainFoot,
    offFoot,
    flow: passing ? 0 : R_FWD ? 1 : -1
  }
  const hands: PoseSpec = {}
  if (style.swing.main) hands.mainHand = V(swingF * amp, 1, -9.3 + Math.abs(swingF) * 0.12)
  if (style.swing.off) hands.offHand = V(-swingF * amp, 1, -9.3 + Math.abs(swingF) * 0.12)
  return pose({ ...style.carry, ...base, ...hands })
}

export function frames(style: Style, anim: string, i: number): Pose {
  const list = (style as unknown as Record<string, PoseSpec[] | undefined>)[anim]
  if (anim === 'walk') return walkPose(i, style)
  const spec = list?.[i]
  if (!spec) throw new Error(`no ${anim}#${i}`)
  return pose({ ...style.carry, ...spec })
}

// ---------------------------------------------------------------------------------------------------------
// Death: a shared fall — stagger, topple backwards, lie, settle. Per-style hand/item tweaks come from `drop`.

export function fall(drop: PoseSpec): PoseSpec[] {
  return [
    {
      tilt: 14,
      lean: -3,
      bob: -1,
      head: V(-1.5, 0, 0.5),
      face: 'hurt',
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-3, 3.4, 0),
      mainHand: V(-1, 4, -3),
      offHand: V(-1, 4, -3),
      at: V(2, 0, 0),
      ...drop
    },
    {
      tilt: 42,
      lean: -3,
      bob: 0,
      head: V(-1, 0, 0),
      face: 'dead',
      mainFoot: V(3, 3, 1),
      offFoot: V(-1, 3.4, 3),
      mainHand: V(-3, 4.5, -1),
      offHand: V(-3, 4.5, -2),
      at: V(7, 0, 0),
      ...drop
    },
    {
      tilt: 74,
      lean: -1,
      face: 'dead',
      mainFoot: V(2, 3, 1),
      offFoot: V(0, 3.4, 4),
      mainHand: V(-4, 5, -3),
      offHand: V(-4, 5, -4),
      at: V(14, 0, 4),
      ...drop
    },
    {
      tilt: 90,
      face: 'dead',
      mainFoot: V(2, 3.4, 2),
      offFoot: V(0, 3.4, 3),
      mainHand: V(-2, 5, -7),
      offHand: V(-2, 5, -7),
      at: V(21, 0, 5),
      ...drop
    },
    {
      tilt: 90,
      face: 'dead',
      mainFoot: V(1, 3.4, 1.5),
      offFoot: V(0, 3.4, 2),
      mainHand: V(-1, 5, -8),
      offHand: V(-1, 5, -8),
      at: V(21, 0, 5),
      ...drop
    }
  ]
}

export const DEATH_ALPHA = [1, 1, 1, 0.75, 0.4]

// ---------------------------------------------------------------------------------------------------------
// Styles

/** 見習い剣士: a short sword held forward in an eager crouch. */
export const MELEE: Style = {
  carry: {
    lean: 1.6,
    crouch: 1,
    mainHand: V(5, 0.5, -3.2),
    offHand: V(3.4, -1.5, -5),
    main: { aim: { p: 40 } },
    mainFoot: V(2.4, 3.4, 0),
    offFoot: V(-2.4, 3.4, 0)
  },
  swing: { main: false, off: true },
  idle: [{}, { bob: -1, mainHand: V(5, 0.5, -3.8), main: { aim: { p: 48 } }, head: V(0, 0, -0.4) }],
  windup: [
    {
      crouch: 2.4,
      lean: -1.5,
      mainHand: V(1, 1.2, 6),
      main: { aim: { p: -32 } },
      offHand: V(5.5, -2, -1.2),
      face: 'shout',
      mainFoot: V(3, 3.6, 0),
      offFoot: V(-3, 3.6, 0)
    },
    {
      crouch: 2.9,
      lean: -2,
      sway: 0.6,
      bob: -0.4,
      mainHand: V(0.8, 1.2, 7),
      main: { aim: { p: -48 } },
      offHand: V(6, -2, -0.6),
      face: 'shout',
      flow: 1,
      mainFoot: V(3, 3.6, 0),
      offFoot: V(-3, 3.6, 0)
    }
  ],
  attack: [
    {
      crouch: 3,
      lean: -3.4,
      mainHand: V(0, 1, 7.2),
      main: { aim: { p: -62 } },
      offHand: V(5, -3, 0),
      face: 'shout',
      mainFoot: V(3.4, 3.6, 0),
      offFoot: V(-3.4, 3.6, 0)
    },
    {
      crouch: 1,
      lean: 4.4,
      mainHand: V(7.4, 0.6, -2.4),
      main: { aim: { p: 100 }, smear: { p: -50 } },
      offHand: V(-2, -3, -7),
      face: 'shout',
      mainFoot: V(7, 3.4, 0),
      offFoot: V(-4.4, 3.6, 0)
    },
    {
      crouch: 1.6,
      lean: 3.2,
      mainHand: V(6, 0.8, -6.4),
      main: { aim: { p: 150 } },
      offHand: V(-1, -3.4, -7),
      mainFoot: V(6, 3.4, 0),
      offFoot: V(-4, 3.6, 0)
    }
  ],
  hurt: [
    {
      lean: -4.2,
      bob: -1,
      head: V(-2, 0, 0.6),
      face: 'hurt',
      mainHand: V(-1.5, 3.6, -6),
      main: { aim: { p: -20 } },
      offHand: V(-1.5, 3.6, -6),
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      lean: -3,
      crouch: 1.6,
      head: V(-1, 0, -0.5),
      face: 'hurt',
      mainHand: V(0, 3.4, -7),
      main: { aim: { p: 20 } },
      offHand: V(0, 3.4, -7),
      mainFoot: V(1.5, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 } } })
}

/** 村の弓兵: the bow is held in the off hand, the main hand draws the string. */
export const BOWMAN: Style = {
  carry: {
    lean: 0.4,
    mainHand: V(0.5, 1, -9.5),
    offHand: V(4.6, -0.8, -5),
    off: { aim: { p: 112, y: -28 } },
    mainFoot: V(1.6, 3.2, 0),
    offFoot: V(-1.6, 3.2, 0)
  },
  swing: { main: true, off: false },
  idle: [{}, { bob: -1, offHand: V(4.6, -0.8, -5.6), head: V(0, 0, -0.4) }],
  windup: [
    {
      crouch: 1,
      lean: 0.6,
      face: 'focus',
      offHand: V(9.6, -0.8, 3.6),
      off: { aim: { p: 90 }, draw: 0.8 },
      mainHand: V(2.4, -2, 3.4),
      mainFoot: V(2.4, 3.6, 0),
      offFoot: V(-2.8, 3.6, 0)
    },
    {
      crouch: 1.2,
      lean: 0.4,
      face: 'focus',
      offHand: V(9.6, -0.8, 3.8),
      off: { aim: { p: 90 }, draw: 1 },
      mainHand: V(1.4, -2.2, 3.4),
      mainFoot: V(2.4, 3.6, 0),
      offFoot: V(-2.8, 3.6, 0),
      flow: 1
    }
  ],
  attack: [
    {
      crouch: 1.2,
      lean: 0.4,
      face: 'focus',
      offHand: V(9.6, -0.8, 3.8),
      off: { aim: { p: 90 }, draw: 1 },
      mainHand: V(1.2, -2.2, 3.4),
      mainFoot: V(2.4, 3.6, 0),
      offFoot: V(-2.8, 3.6, 0)
    },
    {
      crouch: 0.6,
      lean: -0.4,
      face: 'shout',
      offHand: V(9.8, -0.8, 4),
      off: { aim: { p: 92 }, draw: -0.7 },
      mainHand: V(-1.8, 3.4, 3.8),
      mainFoot: V(2.4, 3.6, 0),
      offFoot: V(-3, 3.6, 0)
    },
    {
      crouch: 0.4,
      lean: 0.6,
      offHand: V(8.4, -0.8, -1.8),
      off: { aim: { p: 98 }, draw: -0.25 },
      mainHand: V(-0.6, 2.4, -4),
      mainFoot: V(2.2, 3.6, 0),
      offFoot: V(-2.6, 3.6, 0)
    }
  ],
  hurt: [
    {
      lean: -4,
      bob: -1,
      face: 'hurt',
      head: V(-2, 0, 0.6),
      mainHand: V(-1.5, 3.6, -6),
      offHand: V(0, 3.6, -6),
      off: { aim: { p: 140 } },
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      lean: -3,
      crouch: 1.6,
      face: 'hurt',
      head: V(-1, 0, -0.5),
      mainHand: V(0, 3.4, -7),
      offHand: V(1, 3.4, -7),
      off: { aim: { p: 150 } },
      mainFoot: V(1.5, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  death: fall({ off: { aim: { p: 140 } } })
}

/** 見習い魔法使い: a wand in the main hand, robe and hat that flow. */
export const WANDER: Style = {
  carry: {
    lean: 0.6,
    mainHand: V(4.4, 0.6, -4.2),
    main: { aim: { p: 24 }, glow: 0.3 },
    offHand: V(0.5, 1, -9.5),
    mainFoot: V(1.4, 3, 0),
    offFoot: V(-1.4, 3, 0)
  },
  swing: { main: false, off: true },
  idle: [
    { flow: 0 },
    { bob: -1, flow: 1, mainHand: V(4.4, 0.6, -4.8), main: { aim: { p: 30 }, glow: 0.45 }, head: V(0, 0, -0.4) }
  ],
  windup: [
    {
      crouch: 0.6,
      lean: -0.4,
      face: 'shout',
      mainHand: V(2.2, 1.4, 4.2),
      main: { aim: { p: 4 }, glow: 0.85 },
      offHand: V(5.6, -2.4, -0.6),
      flow: 1,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-2, 3.4, 0)
    },
    {
      crouch: 0.4,
      lean: -0.6,
      bob: -0.4,
      face: 'shout',
      mainHand: V(2.2, 1.4, 5.4),
      main: { aim: { p: -6 }, glow: 1.2 },
      offHand: V(5.6, -2.4, 0.4),
      flow: -1,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-2, 3.4, 0)
    }
  ],
  attack: [
    {
      crouch: 0.8,
      lean: -1.6,
      mainHand: V(1.5, 1.2, -0.4),
      main: { aim: { p: 35 }, glow: 1 },
      offHand: V(3, -3, -3.6),
      face: 'shout',
      flow: -1,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-2.4, 3.4, 0)
    },
    {
      crouch: 0.6,
      lean: 3.4,
      mainHand: V(9.4, 0.4, -1.4),
      main: { aim: { p: 88 }, glow: 1.5 },
      offHand: V(-0.4, -3.6, -6),
      face: 'shout',
      flow: 2,
      mainFoot: V(4.6, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      crouch: 0.6,
      lean: 2.2,
      mainHand: V(8, 0.6, -2.6),
      main: { aim: { p: 78 }, glow: 0.6 },
      offHand: V(0, -3.2, -6.4),
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
      mainHand: V(-1, 3.6, -5.6),
      main: { aim: { p: -10 }, glow: 0.1 },
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
      mainHand: V(0, 3.4, -7),
      main: { aim: { p: 30 }, glow: 0.1 },
      offHand: V(0, 3.4, -7),
      flow: 1,
      mainFoot: V(1.5, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 }, glow: 0.05 } })
}

/** 盾兵: mace in the left (main) hand, tower shield on the right arm. */
export const SHIELDER: Style = {
  carry: {
    lean: 1.2,
    crouch: 0.8,
    mainHand: V(1.2, 0.8, -8.4),
    main: { aim: { p: 168 } },
    offHand: V(5.2, -4.4, -1.8),
    off: { aim: { p: 0 }, turn: 28 },
    mainFoot: V(1.8, 3.6, 0),
    offFoot: V(-1.8, 3.6, 0)
  },
  swing: { main: true, off: false },
  idle: [{}, { bob: -1, offHand: V(5.2, -4.4, -2.4), head: V(0, 0, -0.4) }],
  windup: [
    {
      crouch: 2,
      lean: -1,
      face: 'shout',
      mainHand: V(0.8, 1.2, 6),
      main: { aim: { p: -34 } },
      offHand: V(5.2, -3.4, -4.6),
      off: { aim: { p: 0 }, turn: 38 },
      mainFoot: V(3, 3.8, 0),
      offFoot: V(-3, 3.8, 0)
    },
    {
      crouch: 2.6,
      lean: -1.6,
      sway: 0.6,
      face: 'shout',
      mainHand: V(0.4, 1.2, 7),
      main: { aim: { p: -52 } },
      offHand: V(5.2, -3.4, -5.2),
      off: { aim: { p: 0 }, turn: 38 },
      mainFoot: V(3, 3.8, 0),
      offFoot: V(-3, 3.8, 0)
    }
  ],
  attack: [
    {
      crouch: 2.8,
      lean: -3,
      face: 'shout',
      mainHand: V(0, 1, 7.4),
      main: { aim: { p: -64 } },
      offHand: V(5, -3.4, -5),
      off: { aim: { p: 0 }, turn: 40 },
      mainFoot: V(3.4, 3.8, 0),
      offFoot: V(-3.4, 3.8, 0)
    },
    {
      crouch: 1,
      lean: 4,
      face: 'shout',
      mainHand: V(7, 0.6, -2.6),
      main: { aim: { p: 108 }, smear: { p: -50 } },
      offHand: V(4.4, -4.4, -3.4),
      off: { aim: { p: 0 }, turn: 20 },
      mainFoot: V(6.4, 3.6, 0),
      offFoot: V(-4, 3.8, 0)
    },
    {
      crouch: 1.4,
      lean: 3,
      mainHand: V(6, 0.8, -6),
      main: { aim: { p: 150 } },
      offHand: V(5, -4.4, -2.4),
      off: { aim: { p: 0 }, turn: 28 },
      mainFoot: V(5.4, 3.6, 0),
      offFoot: V(-3.6, 3.8, 0)
    }
  ],
  hurt: [
    {
      lean: -3.2,
      bob: -1,
      head: V(-1.5, 0, 0.5),
      face: 'hurt',
      mainHand: V(-1, 3.4, -6.2),
      main: { aim: { p: 150 } },
      offHand: V(3.6, -3.4, -3),
      off: { aim: { p: 0 }, turn: 34 },
      mainFoot: V(2, 3.6, 0),
      offFoot: V(-3, 3.6, 0)
    },
    {
      lean: -2.4,
      crouch: 1.4,
      head: V(-1, 0, -0.5),
      face: 'hurt',
      mainHand: V(0, 3.2, -7.4),
      main: { aim: { p: 160 } },
      offHand: V(4.2, -3.6, -3.6),
      off: { aim: { p: 0 }, turn: 30 },
      mainFoot: V(1.6, 3.6, 0),
      offFoot: V(-2.6, 3.6, 0)
    }
  ],
  guard: [
    {
      crouch: 2,
      lean: 1.6,
      face: 'focus',
      mainHand: V(-0.4, 1.4, -5.4),
      main: { aim: { p: -150 } },
      offHand: V(6.4, -4.8, 0.6),
      off: { aim: { p: 0 }, turn: 12 },
      mainFoot: V(2.6, 3.8, 0),
      offFoot: V(-2.6, 3.8, 0)
    },
    {
      crouch: 2.4,
      lean: 2.1,
      bob: -0.4,
      face: 'focus',
      mainHand: V(-0.4, 1.4, -5.4),
      main: { aim: { p: -150 } },
      offHand: V(6.9, -4.8, 0.4),
      off: { aim: { p: 0 }, turn: 12 },
      mainFoot: V(2.6, 3.8, 0),
      offFoot: V(-2.6, 3.8, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 } }, off: { aim: { p: 0 }, turn: 60 } })
}
