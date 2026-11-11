import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Enemies: enemyHit, enemyDown, hop, spit, shotHit. Bonks, pops and boings; the play functions stay free of
 * imports so their source hash covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // A round bonk with a tiny squeak on top.
  enemyHit: D(
    3,
    0.06,
    0.85,
    (b) => {
      b.tone('sine', 260, 120, 0.1, 0.55, { sw: 0.5 })
      b.nz('bandpass', 1200, 600, 0.05, 0.4, { q: 1 })
      b.tone('triangle', 1300, 2100, 0.07, 0.2, { at: 0.03, lp: [4000, 2500] })
    },
    { vary: 0.07, rev: 0.01 }
  ),
  // A comic "pop-poof": a bright pop, a rising star-twinkle and a puff of smoke.
  enemyDown: D(
    3,
    0.08,
    0.95,
    (b) => {
      b.tone('sine', 420, 1100, 0.07, 0.5, { sw: 0.6 })
      b.nz('bandpass', 1800, 900, 0.04, 0.4, { q: 1.2 })
      b.nz('lowpass', 1600, 350, 0.3, 0.5, { at: 0.05, a: 0.04, q: 0.6 })
      b.tone('triangle', 700, 1500, 0.2, 0.22, { at: 0.09, vib: [14, 60], lp: [3500, 2000] })
      b.bell(84, 0.25, 0.12, { at: 0.13, ratio: 3, index: 0.8 })
    },
    { vary: 0.06, rev: 0.05 }
  ),
  // A small frog boing: a quick springy up-sweep with a wobble.
  hop: D(
    2,
    0.1,
    0.65,
    (b) => {
      b.tone('sine', 180, 420, 0.1, 0.5, { sw: 0.7, vib: [26, 90] })
      b.tone('triangle', 360, 840, 0.07, 0.15, { lp: [2500, 1200], at: 0.01 })
      b.nz('bandpass', 700, 1100, 0.05, 0.1, { a: 0.02, q: 0.8 })
    },
    { vary: 0.1, rev: 0.01 }
  ),
  // "Ptoo": a puff of air and a small pop.
  spit: D(
    3,
    0.1,
    0.7,
    (b) => {
      b.nz('bandpass', 1500, 2800, 0.07, 0.4, { a: 0.02, q: 0.9 })
      b.tone('sine', 700, 280, 0.05, 0.45, { at: 0.05, sw: 0.5 })
      b.nz('bandpass', 2200, 1400, 0.02, 0.25, { at: 0.05, q: 1.5 })
    },
    { vary: 0.08, rev: 0.01 }
  ),
  // A dry tick-thud as a shot hits a wall.
  shotHit: D(
    3,
    0.05,
    0.6,
    (b) => {
      b.nz('bandpass', 2000, 1100, 0.025, 0.4, { q: 1.5 })
      b.tone('sine', 200, 100, 0.07, 0.45, { sw: 0.5 })
      b.tone('triangle', 520, 380, 0.04, 0.12, { at: 0.005 })
    },
    { vary: 0.1, rev: 0 }
  )
}
