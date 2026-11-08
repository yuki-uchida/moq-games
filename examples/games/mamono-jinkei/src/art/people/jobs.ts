/**
 * Guild jobs as data: an outfit, held items and a move style per job, plus `buildJobSheet` which renders every
 * animation of `enemySpec(kind)` from the rig. To add a job (stages 2–4): add an entry to JOBS with an `Outfit`
 * (see rig.ts), the held `main`/`off` ItemSpec (see items.ts) and a `Style` (see moves.ts; reuse MELEE/BOWMAN/
 * WANDER/SHIELDER or write new poses), then register it in people/index.ts. New items, headgear, back items and torso
 * overlays register themselves in the ITEMS / HEADGEAR / BACK_ITEMS / OVERLAYS tables.
 */
import { enemySpec } from '../contract'
import { R } from '../palette'
import { despeckle } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import './items'
import { BOWMAN, DEATH_ALPHA, MELEE, SHIELDER, WANDER, frames, type Style } from './moves'
import { renderHuman, type Held, type Outfit, type View } from './rig'

export interface Job {
  outfit: Outfit
  held: Held
  style: Style
}

const MAIL = [R.steel[1], R.steel[2], R.steel[3], R.steel[3], R.steel[4]] as const

export const JOBS: Record<string, Job> = {
  // 見習い剣士: brown hair with a headband, crimson tunic under a leather vest, short sword.
  rookie: {
    outfit: {
      skin: R.skinLight,
      hair: R.hairBrown,
      hairStyle: 'spiky',
      headgear: { kind: 'headband', ramp: R.clothWhite, trim: R.steel },
      brow: 'eager',
      tunic: R.clothCrimson,
      sleeves: R.clothCrimson,
      gloves: R.leather,
      overlays: [
        { kind: 'vest', ramp: R.leather },
        { kind: 'belt', ramp: R.wood, trim: R.gold }
      ],
      pants: R.clothNavy,
      boots: R.leather
    },
    held: { main: { kind: 'sword', a: R.steel, b: R.leather, trim: R.gold } },
    style: MELEE
  },
  // 村の弓兵: brown leather cap, ochre tunic, longbow and quiver.
  bowman: {
    outfit: {
      skin: R.skinLight,
      hair: R.hairBlonde,
      hairStyle: 'short',
      headgear: { kind: 'cap', ramp: R.leather, trim: R.gold },
      brow: 'stern',
      tunic: R.clothOchre,
      gloves: R.leather,
      overlays: [{ kind: 'belt', ramp: R.leather, trim: R.steel }],
      pants: R.clothForest,
      boots: R.wood,
      back: { kind: 'quiver', ramp: R.leather, trim: R.gold }
    },
    held: { off: { kind: 'bow', a: R.wood, b: R.paper, trim: R.leather } },
    style: BOWMAN
  },
  // 見習い魔法使い: purple robe and pointed hat, a wand with a fire glow.
  apprentice: {
    outfit: {
      skin: R.skinLight,
      hair: R.hairRed,
      hairStyle: 'bob',
      headgear: { kind: 'wizhat', ramp: R.clothPurple, trim: R.gold },
      brow: 'sly',
      tunic: R.clothPurple,
      overlays: [
        { kind: 'robe', ramp: R.clothPurple },
        { kind: 'belt', ramp: R.gold, trim: R.gold }
      ],
      pants: R.clothPurple,
      boots: R.leather
    },
    held: { main: { kind: 'wand', a: R.wood, b: R.fire } },
    style: WANDER
  },
  // 盾兵: steel helmet, chainmail, tower shield with the guild crest, short mace (left-handed).
  shieldman: {
    outfit: {
      skin: R.skinDark,
      hair: R.hairBlack,
      hairStyle: 'short',
      headgear: { kind: 'helmet', ramp: R.steel, trim: R.jobRed },
      brow: 'stern',
      tunic: MAIL,
      sleeves: MAIL,
      gloves: R.leather,
      overlays: [
        { kind: 'mail', ramp: MAIL },
        { kind: 'belt', ramp: R.leather, trim: R.gold }
      ],
      pants: R.leather,
      boots: R.leather,
      lefty: true,
      bulk: 0.5
    },
    held: {
      main: { kind: 'mace', a: R.steel, b: R.wood },
      off: { kind: 'tower', a: R.steel, trim: R.gold }
    },
    style: SHIELDER
  }
}

const VIEWS: View[] = ['down', 'up', 'side']

/** Renders every animation of the enemy sheet contract for one job. */
export function buildJobSheet(kind: string): Sheet {
  const job = JOBS[kind]
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(enemySpec(kind))) {
    const [base, dir] = name.split('_') as [string, View | undefined]
    const views = dir ? [dir] : (['side'] as View[])
    for (const view of views) {
      void VIEWS
      const out = Array.from({ length: want.frames }, (_, i) =>
        despeckle(renderHuman(view, frames(job.style, base === 'death' ? 'death' : base, i), job.outfit, job.held))
      )
      const a: Anim = anim(out, want.fps, want.loop)
      if (base === 'death') a.alpha = DEATH_ALPHA
      sheet[name] = a
    }
  }
  return sheet
}
