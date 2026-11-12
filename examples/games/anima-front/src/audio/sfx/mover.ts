import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Mover sounds: what the player animal does (footsteps, jumps, landings, dash/slide, weapon swap, damage, revive,
 * warp/respawn) and the hit markers. Footsteps and markers are frequent, so they stay quiet and short. The play
 * functions stay free of imports and shared helpers so their source hash covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // Padded paw on ground with a tiny armour clink.
  step: D(
    2,
    0.1,
    0.35,
    (b) => {
      b.nz('lowpass', 1000, 450, 0.05, 0.35, { a: 0.004, q: 0.6 })
      b.tone('sine', 170, 110, 0.06, 0.3, { sw: 0.7 })
      b.tone('triangle', 2600, 2200, 0.03, 0.05, { at: 0.012, lp: [4000, 2500] })
    },
    { vary: 0.18, rev: 0 }
  ),
  // Springy hop with a fabric whoosh.
  jump: D(
    2,
    0.06,
    0.55,
    (b) => {
      b.tone('sine', 280, 680, 0.14, 0.4, { sw: 0.7, a: 0.006 })
      b.nz('bandpass', 700, 2200, 0.16, 0.25, { a: 0.06, q: 0.8 })
      b.tone('triangle', 1900, 2300, 0.04, 0.05, { at: 0.02, lp: [3500, 2000] })
    },
    { vary: 0.06, rev: 0.03 }
  ),
  // Airy puff with a faint rising chime.
  airJump: D(
    2,
    0.08,
    0.5,
    (b) => {
      b.nz('bandpass', 1500, 4200, 0.18, 0.28, { a: 0.07, q: 0.7 })
      b.tone('sine', 520, 900, 0.14, 0.2, { sw: 0.8 })
      b.bell(84, 0.3, 0.1, { at: 0.06, ratio: 2.76, index: 0.6 })
    },
    { vary: 0.04, rev: 0.1 }
  ),
  // Soft thump.
  land: D(
    2,
    0.08,
    0.55,
    (b) => {
      b.tone('sine', 190, 85, 0.1, 0.5, { sw: 0.5 })
      b.nz('lowpass', 1100, 350, 0.09, 0.4, { a: 0.006, q: 0.6 })
    },
    { vary: 0.07, rev: 0.02 }
  ),
  // Heavy armoured thud + clank + dust.
  landHard: D(
    2,
    0.15,
    0.9,
    (b) => {
      // Short low thud, a ringing armour clank and sifting dust.
      b.tone('sine', 100, 50, 0.2, 0.7, { sw: 0.5 })
      b.nz('bandpass', 400, 200, 0.06, 0.4, { q: 1 })
      b.bell(58, 0.3, 0.35, { at: 0.01, ratio: 2.7, index: 2 })
      b.tone('square', 640, 380, 0.14, 0.16, { at: 0.012, lp: [2400, 800], bp: [900, 1.2] })
      b.tone('triangle', 1700, 1350, 0.1, 0.1, { at: 0.02, detune: 30 })
      b.nz('bandpass', 2600, 1400, 0.35, 0.2, { at: 0.08, a: 0.06, q: 0.6 })
    },
    { vary: 0.06, rev: 0.08 }
  ),
  // Quick whooshing burst.
  dash: D(
    2,
    0.15,
    0.7,
    (b) => {
      b.nz('bandpass', 500, 3800, 0.22, 0.55, { a: 0.05, q: 1.1 })
      b.nz('highpass', 4500, 6500, 0.12, 0.14, { a: 0.03 })
      b.tone('sawtooth', 160, 420, 0.2, 0.14, { sw: 0.6, lp: [900, 2200] })
    },
    { vary: 0.06, rev: 0.06 }
  ),
  // Gritty scrape along the ground.
  slide: D(
    1,
    0.3,
    0.55,
    (b) => {
      b.nz('bandpass', 1800, 900, 0.5, 0.4, { a: 0.05, q: 0.9, tr: [38, 0.6] })
      b.nz('lowpass', 500, 250, 0.45, 0.3, { a: 0.03, q: 0.7 })
      b.tone('sawtooth', 130, 90, 0.4, 0.07, { lp: [700, 300] })
    },
    { vary: 0.05, rev: 0.02 }
  ),
  // Mechanical click-clack, two short sounds.
  swap: D(
    2,
    0.15,
    0.6,
    (b) => {
      b.nz('bandpass', 2200, 1500, 0.02, 0.6, { q: 2 })
      b.tone('square', 900, 600, 0.04, 0.14, { lp: [2500, 1200] })
      b.nz('bandpass', 1100, 700, 0.03, 0.7, { at: 0.09, q: 2.5 })
      b.tone('square', 420, 300, 0.07, 0.2, { at: 0.09, lp: [1500, 700] })
      b.tone('triangle', 2300, 2000, 0.06, 0.06, { at: 0.1 })
    },
    { vary: 0.04, rev: 0.02 }
  ),
  // Dry click, empty chamber.
  empty: D(
    2,
    0.12,
    0.45,
    (b) => {
      b.nz('bandpass', 1400, 1000, 0.012, 0.6, { q: 3 })
      b.tone('square', 800, 500, 0.03, 0.12, { lp: [1800, 900] })
      b.nz('lowpass', 500, 300, 0.035, 0.3, { at: 0.008 })
    },
    { vary: 0.03, rev: 0 }
  ),
  // Bright sparkle ping over a snap.
  critical: D(
    2,
    0.06,
    0.7,
    (b) => {
      b.nz('bandpass', 1500, 700, 0.05, 0.6, { q: 0.8 })
      b.tone('sawtooth', 700, 260, 0.08, 0.25, { sw: 0.5, lp: [2500, 600] })
      b.bell(81, 0.45, 0.3, { at: 0.02, ratio: 3.5, index: 1.4 })
      b.bell(88, 0.35, 0.14, { at: 0.05, ratio: 2.76, index: 0.8 })
    },
    { vary: 0.03, rev: 0.1 }
  ),
  // Descending electronic whir.
  passivesOff: D(
    1,
    0.3,
    0.6,
    (b) => {
      b.tone('sawtooth', 900, 180, 0.5, 0.2, { sw: 0.9, lp: [3000, 400], tr: [22, 0.4] })
      b.tone('square', 450, 90, 0.5, 0.1, { sw: 0.9, lp: [1500, 300] })
      b.nz('bandpass', 3000, 400, 0.4, 0.1, { a: 0.02, q: 2 })
    },
    { vary: 0.03, rev: 0.05 }
  ),
  // Ascending electronic whir.
  passivesOn: D(
    1,
    0.3,
    0.6,
    (b) => {
      b.tone('sawtooth', 180, 900, 0.5, 0.2, { sw: 0.9, a: 0.04, lp: [400, 3500], tr: [22, 0.4] })
      b.tone('square', 90, 450, 0.5, 0.1, { sw: 0.9, a: 0.04, lp: [300, 1800] })
      b.bell(88, 0.35, 0.12, { at: 0.35, ratio: 3, index: 0.7 })
    },
    { vary: 0.03, rev: 0.06 }
  ),
  // Small-animal squeak plus impact thud, not shrill.
  hurt: D(
    2,
    0.15,
    0.85,
    (b) => {
      b.tone('triangle', 520, 330, 0.14, 0.4, { sw: 0.8, lp: [2200, 900], bp: [900, 0.9], vib: [28, 40] })
      b.tone('sine', 140, 70, 0.14, 0.55, { sw: 0.5 })
      b.nz('lowpass', 1200, 400, 0.09, 0.35, { a: 0.004, q: 0.6 })
    },
    { vary: 0.07, rev: 0.03 }
  ),
  // Glassy-metal shatter with a downward clunk.
  armorBreak: D(
    2,
    0.2,
    0.95,
    (b) => {
      b.nz('highpass', 3000, 3000, 0.06, 0.4)
      b.nz('bandpass', 5000, 2500, 0.35, 0.25, { q: 1.2, tr: [55, 0.7] })
      b.bell(96, 0.3, 0.14, { ratio: 3.7, index: 2 })
      b.bell(89, 0.3, 0.12, { at: 0.02, ratio: 4.1, index: 2 })
      b.tone('square', 300, 90, 0.25, 0.3, { at: 0.04, sw: 0.6, lp: [1600, 300] })
      b.tone('sine', 110, 50, 0.25, 0.45, { at: 0.04, sw: 0.5 })
    },
    { vary: 0.06, rev: 0.1 }
  ),
  // Sad falling tone plus heavy thud.
  down: D(
    1,
    0.5,
    0.9,
    (b) => {
      b.tone('triangle', 520, 150, 0.7, 0.35, { sw: 0.9, lp: [2200, 400], vib: [5, 25] })
      b.tone('sine', 262, 80, 0.7, 0.2, { sw: 0.9 })
      b.tone('sine', 100, 40, 0.4, 0.8, { at: 0.35, sw: 0.5 })
      b.nz('lowpass', 700, 150, 0.3, 0.4, { at: 0.35, a: 0.008, q: 0.6 })
    },
    { vary: 0.03, rev: 0.12 }
  ),
  // Soft rising tick.
  reviveTick: D(
    2,
    0.1,
    0.4,
    (b) => {
      b.tone('sine', 760, 1050, 0.07, 0.3, { sw: 0.6, a: 0.003 })
      b.nz('bandpass', 2800, 2200, 0.015, 0.1, { q: 2 })
    },
    { vary: 0.03, rev: 0.04 }
  ),
  // Warm rising chime plus soft burst.
  revive: D(
    1,
    0.4,
    0.8,
    (b) => {
      b.nz('bandpass', 600, 2400, 0.3, 0.2, { a: 0.1, q: 0.7 })
      b.tone('sine', 110, 55, 0.2, 0.3, { at: 0.02, sw: 0.5 })
      b.bells([67, 72, 76, 79], 0.09, 0.7, 0.2, { at: 0.04, ratio: 2, index: 0.6 })
      b.tone('triangle', 392, 392, 0.7, 0.1, { at: 0.3, a: 0.05 })
    },
    { vary: 0.02, rev: 0.2 }
  ),
  // Quick phased whoosh with shimmer.
  warp: D(
    1,
    0.2,
    0.7,
    (b) => {
      b.nz('bandpass', 400, 4500, 0.22, 0.4, { a: 0.1, q: 1.4, tr: [30, 0.5] })
      b.nz('bandpass', 4500, 600, 0.2, 0.3, { at: 0.2, a: 0.02, q: 1.4, tr: [30, 0.5] })
      b.tone('sine', 600, 2400, 0.2, 0.18, { sw: 0.9, vib: [14, 60] })
      b.sparkle(4, 0.15, 0.25, 84, 96, 0.08)
    },
    { vary: 0.04, rev: 0.12 }
  ),
  // Materialising shimmer resolving to a chime.
  respawn: D(
    1,
    0.5,
    0.8,
    (b) => {
      b.nz('bandpass', 800, 5000, 0.5, 0.18, { a: 0.3, q: 1.2 })
      b.tone('sine', 300, 1200, 0.5, 0.2, { sw: 0.9, a: 0.1, vib: [9, 30] })
      b.sparkle(7, 0, 0.5, 84, 98, 0.08)
      b.bells([76, 83], 0.12, 0.8, 0.2, { at: 0.5, ratio: 2, index: 0.5 })
      b.tone('triangle', 330, 330, 0.5, 0.08, { at: 0.5, a: 0.03 })
    },
    { vary: 0.02, rev: 0.2 }
  ),
  // Tiny crystalline ping, high and pleasant.
  shard: D(
    4,
    0.04,
    0.45,
    (b) => {
      b.bell(96, 0.28, 0.3, { ratio: 3.2, index: 0.9 })
      b.bell(103, 0.2, 0.12, { at: 0.04, ratio: 2.76, index: 0.6 })
    },
    { vary: 0.06, rev: 0.1 }
  ),
  // Short crisp tick.
  hitmarker: D(
    3,
    0.03,
    0.4,
    (b) => {
      b.nz('bandpass', 3200, 2600, 0.014, 0.6, { q: 2.5 })
      b.tone('sine', 1300, 1000, 0.025, 0.12)
    },
    { vary: 0.03, rev: 0 }
  ),
  // Higher, brighter double tick.
  headmarker: D(
    3,
    0.05,
    0.45,
    (b) => {
      b.nz('bandpass', 3800, 3800, 0.012, 0.4, { q: 1.5 })
      b.tone('sine', 2400, 2400, 0.04, 0.3)
      b.nz('bandpass', 4200, 4200, 0.012, 0.4, { at: 0.055, q: 1.5 })
      b.tone('sine', 3000, 3000, 0.06, 0.32, { at: 0.055 })
    },
    { vary: 0.02, rev: 0.02 }
  ),
  // Lower, weightier thock plus short high ping.
  komarker: D(
    3,
    0.08,
    0.55,
    (b) => {
      b.tone('sine', 300, 110, 0.12, 0.6, { sw: 0.5 })
      b.nz('lowpass', 1200, 400, 0.05, 0.3, { a: 0.003, q: 0.8 })
      b.bell(91, 0.2, 0.18, { at: 0.04, ratio: 3, index: 0.7 })
    },
    { vary: 0.03, rev: 0.03 }
  )
}
