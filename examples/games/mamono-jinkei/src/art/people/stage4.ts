/**
 * Stage 4 people: its four guild enemies, its boss sheets (and minions), built lazily.
 * Ids missing here fall back to placeholders.
 */
import { R } from '../palette'
import type { Sheet } from '../sheet'
import { JOBS, buildJobSheet } from './jobs'
import { BOWMAN, SHIELDER, WANDER, fall, type PoseSpec, type Style } from './moves'
import { V } from './rig'
import { buildLeonSheet } from './s4-leon'
import './s4-parts'

const WHITE = R.clothWhite
const DARK = [R.steel[2], R.steel[3], R.clothBlack[2], R.clothBlack[3], R.steel[4]] as const
const HAIR_ICE = [R.snow[0], R.snow[1], R.ice[1], R.ice[2], R.ice[4]] as const

// 狩人: crouching bow drawer (the bow style with a hunter hunch).
const HUNTER: Style = {
  ...BOWMAN,
  carry: { ...BOWMAN.carry, crouch: 0.8, lean: 0.8 },
  idle: [{}, { bob: -1, offHand: V(4.6, -0.8, -5.6), head: V(0, 0, -0.4), flow: 1 }]
}

// 聖騎士: shield and mace, plus a heal pose (mace raised, golden glow).
const outboard = (p: PoseSpec): PoseSpec =>
  p.offHand ? { ...p, offHand: V(p.offHand.f, p.offHand.r + 3, p.offHand.u) } : p
const PALADIN: Style = {
  ...SHIELDER,
  carry: outboard(SHIELDER.carry),
  idle: SHIELDER.idle.map(outboard),
  windup: SHIELDER.windup.map(outboard),
  attack: SHIELDER.attack.map(outboard),
  hurt: SHIELDER.hurt.map(outboard),
  heal: [
    {
      crouch: 1,
      lean: 0,
      face: 'focus',
      mainHand: V(1.5, 1.2, 2),
      main: { aim: { p: -6 }, glow: 0.4 },
      offHand: V(5.2, -4.4, -2),
      off: { aim: { p: 0 }, turn: 24 }
    },
    {
      crouch: 0.4,
      lean: -0.6,
      face: 'focus',
      head: V(-0.6, 0, 0.6),
      mainHand: V(1, 1.2, 7),
      main: { aim: { p: -2 }, glow: 0.9 },
      offHand: V(5.2, -4.4, -1),
      off: { aim: { p: 0 }, turn: 22 }
    },
    {
      crouch: 0,
      lean: -1,
      bob: 0.8,
      face: 'shout',
      head: V(-0.8, 0, 0.8),
      mainHand: V(0.8, 1.2, 9),
      main: { aim: { p: 0 }, glow: 1.5 },
      offHand: V(5.2, -4.6, 0),
      off: { aim: { p: 0 }, turn: 20 }
    },
    {
      crouch: 0.6,
      lean: -0.4,
      face: 'focus',
      mainHand: V(1, 1.2, 6),
      main: { aim: { p: 6 }, glow: 0.8 },
      offHand: V(5.2, -4.4, -1.6),
      off: { aim: { p: 0 }, turn: 24 }
    }
  ]
}

// 氷の魔女: a tall crystal staff, raised to gather frost and slammed down.
const ICEWITCH: Style = {
  ...WANDER,
  carry: {
    lean: 0.4,
    mainHand: V(3.2, 0.8, -4.4),
    main: { aim: { p: 3 }, glow: 0.5 },
    offHand: V(0.5, 1, -9.5),
    mainFoot: V(1.4, 3, 0),
    offFoot: V(-1.4, 3, 0)
  },
  idle: [
    { flow: 0 },
    { bob: -1, flow: 1, mainHand: V(3.2, 0.8, -5), main: { aim: { p: 6 }, glow: 0.7 }, head: V(0, 0, -0.4) }
  ],
  windup: [
    {
      crouch: 0.4,
      lean: -0.6,
      face: 'shout',
      mainHand: V(2, 1.4, 3.6),
      main: { aim: { p: -6 }, glow: 1 },
      offHand: V(5, -4, 0.6),
      flow: 1,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-2, 3.4, 0)
    },
    {
      crouch: 0.2,
      lean: -1,
      bob: -0.4,
      face: 'shout',
      head: V(-0.6, 0, 0.8),
      mainHand: V(1.4, 1.4, 0),
      main: { aim: { p: -4 }, glow: 1.4 },
      offHand: V(5.4, -5, 2),
      flow: -1,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-2, 3.4, 0)
    }
  ],
  attack: [
    {
      crouch: 0.6,
      lean: -2,
      face: 'shout',
      mainHand: V(0.8, 1.4, 1),
      main: { aim: { p: -30 }, glow: 1.4 },
      offHand: V(4, -4.4, 1),
      flow: -1,
      mainFoot: V(2, 3.4, 0),
      offFoot: V(-2.4, 3.4, 0)
    },
    {
      crouch: 1.6,
      lean: 4,
      face: 'shout',
      mainHand: V(7, 0.6, 0.6),
      main: { aim: { p: 118 }, glow: 1.6, smear: { p: -30 } },
      offHand: V(-0.4, -3.6, -6),
      flow: 2,
      mainFoot: V(5, 3.4, 0),
      offFoot: V(-3.4, 3.4, 0)
    },
    {
      crouch: 1.4,
      lean: 3,
      mainHand: V(6.4, 0.6, -2),
      main: { aim: { p: 130 }, glow: 0.7 },
      offHand: V(0, -3.2, -6.4),
      flow: 1,
      mainFoot: V(4.4, 3.4, 0),
      offFoot: V(-3, 3.4, 0)
    }
  ],
  death: fall({ main: { aim: { p: 150 }, glow: 0.05 } })
}

// 重装兵: slower and heavier than the shield soldier: deeper windup, a full shield wall for the guard.
const HEAVY: Style = {
  ...SHIELDER,
  carry: { ...SHIELDER.carry, crouch: 1.2, lean: 0.8, mainFoot: V(1.6, 4, 0), offFoot: V(-1.6, 4, 0) },
  windup: [
    {
      crouch: 2.4,
      lean: -1.4,
      face: 'shout',
      mainHand: V(0.4, 1.2, 7),
      main: { aim: { p: -48 } },
      offHand: V(5.2, -3.4, -4.6),
      off: { aim: { p: 0 }, turn: 38 },
      mainFoot: V(3.2, 4.2, 0),
      offFoot: V(-3.2, 4.2, 0)
    },
    {
      crouch: 3,
      lean: -2.2,
      sway: 0.6,
      face: 'shout',
      mainHand: V(-0.2, 1.2, 8.6),
      main: { aim: { p: -66 } },
      offHand: V(5.2, -3.4, -5.2),
      off: { aim: { p: 0 }, turn: 38 },
      mainFoot: V(3.2, 4.2, 0),
      offFoot: V(-3.2, 4.2, 0)
    }
  ],
  guard: [
    {
      crouch: 2.4,
      lean: 1.4,
      face: 'focus',
      mainHand: V(-0.4, 1.4, -5.4),
      main: { aim: { p: -150 } },
      offHand: V(6.2, -7.6, 0.4),
      off: { aim: { p: 0 }, turn: 2 },
      mainFoot: V(2.6, 4.2, 0),
      offFoot: V(-2.6, 4.2, 0)
    },
    {
      crouch: 2.8,
      lean: 1.8,
      bob: -0.4,
      face: 'focus',
      mainHand: V(-0.4, 1.4, -5.4),
      main: { aim: { p: -150 } },
      offHand: V(6.6, -7.6, 0.2),
      off: { aim: { p: 0 }, turn: 2 },
      mainFoot: V(2.6, 4.2, 0),
      offFoot: V(-2.6, 4.2, 0)
    }
  ]
}

Object.assign(JOBS, {
  // 狩人: fur-lined hood and cloak, longbow, snare loops and a knife on the belt, snow boots.
  hunter: {
    outfit: {
      skin: R.skinTan,
      hair: R.hairBrown,
      hairStyle: 'short',
      headgear: { kind: 'furhood', ramp: R.clothForest, trim: R.wolfCream },
      brow: 'stern',
      tunic: R.leather,
      sleeves: R.leather,
      gloves: R.leather,
      overlays: [
        { kind: 'belt', ramp: R.wood, trim: R.steel },
        { kind: 'snares', ramp: R.hay }
      ],
      pants: R.wood,
      boots: R.wolfCream,
      back: { kind: 'furcloak', ramp: R.clothForest, trim: R.wolfCream }
    },
    held: { off: { kind: 'longbow', a: R.wood, b: R.paper } },
    style: HUNTER
  },
  // 聖騎士: white-and-gold plate, blue sun tabard, sun kite shield and mace.
  paladin: {
    outfit: {
      skin: R.skinLight,
      hair: R.hairBlonde,
      hairStyle: 'short',
      headgear: { kind: 'sunhelm', ramp: WHITE, trim: R.gold },
      brow: 'calm',
      tunic: WHITE,
      sleeves: WHITE,
      gloves: R.gold,
      overlays: [
        { kind: 'plate', ramp: WHITE },
        { kind: 'suntabard', ramp: R.jobBlue, trim: R.gold },
        { kind: 'belt', ramp: R.gold, trim: R.gold },
        { kind: 'pauldrons', ramp: WHITE, trim: R.gold }
      ],
      pants: R.steel,
      boots: R.gold,
      bulk: 0.8
    },
    held: {
      main: { kind: 'sunmace', a: R.gold, b: R.steel },
      off: { kind: 'kite', a: R.jobBlue, trim: R.gold }
    },
    style: PALADIN
  },
  // 氷の魔女: pale blue frost gown, icicle crown, long white-blue hair, crystal staff.
  icewitch: {
    outfit: {
      skin: R.skinLight,
      hair: HAIR_ICE,
      hairStyle: 'long',
      headgear: { kind: 'icecrown', ramp: R.ice },
      brow: 'sly',
      tunic: R.ice,
      overlays: [
        { kind: 'frostgown', ramp: R.ice, trim: R.snow },
        { kind: 'collar', ramp: R.snow }
      ],
      pants: R.ice,
      boots: R.ice
    },
    held: { main: { kind: 'crystalstaff', a: R.clothNavy, b: R.ice } },
    style: ICEWITCH
  },
  // 重装兵: huge dark steel full plate, tower shield and a war hammer.
  heavy: {
    outfit: {
      skin: R.skinDark,
      hair: R.hairBlack,
      hairStyle: 'short',
      headgear: { kind: 'greathelm', ramp: DARK },
      brow: 'stern',
      tunic: DARK,
      sleeves: DARK,
      gloves: DARK,
      overlays: [
        { kind: 'plate', ramp: DARK },
        { kind: 'belt', ramp: R.clothBlack, trim: R.steel },
        { kind: 'pauldrons', ramp: DARK, trim: R.steel }
      ],
      pants: DARK,
      boots: DARK,
      lefty: true,
      bulk: 2.6
    },
    held: {
      main: { kind: 'warhammer', a: R.steel, b: R.wood },
      off: { kind: 'bigtower', a: DARK, trim: R.gold }
    },
    style: HEAVY
  }
})

export const stage4Sheets: Record<string, () => Sheet> = {
  'enemy:hunter': () => buildJobSheet('hunter'),
  'enemy:paladin': () => buildJobSheet('paladin'),
  'enemy:icewitch': () => buildJobSheet('icewitch'),
  'enemy:heavy': () => buildJobSheet('heavy'),
  'boss:leon': buildLeonSheet
}
