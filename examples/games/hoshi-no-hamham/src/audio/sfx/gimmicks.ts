import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Gimmicks: dig, crumble, chop, treeCreak, treeCrash, pipeBurst, hiveBreak, sting, animalWake, animalCharge,
 * animalPoof, rockCrack, rockBreak, switchOn, doorOpen, spawnItem, cageBreak, goalOpen, gateUp, gateDown. Wooden
 * and cartoon foley; the play functions stay free of imports so their source hash covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // A crumbly burst of dirt with a low thump.
  dig: D(
    3,
    0.06,
    0.8,
    (b) => {
      b.tone('sine', 170, 85, 0.1, 0.4, { sw: 0.5 })
      b.nz('lowpass', 1800, 500, 0.18, 0.7, { a: 0.005, q: 0.6 })
      b.ticks(7, 0.01, 0.022, 2200, 0.3, 0.025, 0.5)
    },
    { vary: 0.06, rev: 0.01 }
  ),
  // The lighter cascade when more dirt gives way.
  crumble: D(
    3,
    0.08,
    0.55,
    (b) => {
      b.ticks(9, 0, 0.025, 1400, 0.22, 0.03, 0.6)
      b.nz('lowpass', 1200, 400, 0.18, 0.25, { a: 0.03 })
      b.tone('sine', 95, 60, 0.1, 0.2, { at: 0.04 })
    },
    { vary: 0.08, rev: 0.01 }
  ),
  // A woody "tock" with a crack.
  chop: D(
    2,
    0.08,
    0.9,
    (b) => {
      b.tone('triangle', 340, 230, 0.07, 0.7, { sw: 0.5 })
      b.tone('sine', 680, 450, 0.05, 0.25)
      b.nz('bandpass', 2500, 1500, 0.02, 0.35, { q: 2 })
      b.nz('bandpass', 700, 400, 0.06, 0.2, { q: 1 })
    },
    { vary: 0.05, rev: 0.01 }
  ),
  // A slow creak as the tree starts to fall.
  treeCreak: D(
    1,
    0.8,
    0.7,
    (b) => {
      b.tone('sawtooth', 150, 230, 0.8, 0.2, { a: 0.2, lp: [600, 900], tr: [14, 0.9], vib: [5, 250] })
      b.nz('bandpass', 700, 1100, 0.75, 0.12, { a: 0.2, q: 5, tr: [16, 0.9] })
      b.tone('sine', 75, 60, 0.7, 0.2, { a: 0.2 })
    },
    { vary: 0.05, rev: 0.08 }
  ),
  // A heavy thud with cracking wood and rustling leaves.
  treeCrash: D(
    1,
    0.5,
    1.15,
    (b) => {
      b.tone('sine', 95, 35, 0.5, 1, { sw: 0.4 })
      b.tone('triangle', 200, 80, 0.3, 0.5, { sw: 0.4 })
      b.ticks(8, 0, 0.035, 2400, 0.7, 0.03, 0.8)
      b.nz('bandpass', 900, 400, 0.25, 0.5, { q: 0.9 })
      b.nz('bandpass', 3500, 2500, 0.5, 0.45, { at: 0.12, a: 0.08, q: 0.6, tr: [22, 0.6] })
    },
    { vary: 0.04, rev: 0.12 }
  ),
  // A metallic clang and a burst of pressurised hiss.
  pipeBurst: D(
    2,
    0.2,
    0.85,
    (b) => {
      b.bell(67, 0.3, 0.35, { ratio: 2.76, index: 3 })
      b.tone('triangle', 400, 300, 0.12, 0.2)
      b.tone('sine', 140, 70, 0.12, 0.5, { sw: 0.5 })
      b.nz('bandpass', 3000, 1600, 0.35, 0.3, { a: 0.02, q: 0.7 })
    },
    { vary: 0.05, rev: 0.1 }
  ),
  // A papery crack and a swelling angry buzz.
  hiveBreak: D(
    1,
    0.4,
    0.9,
    (b) => {
      b.nz('bandpass', 2200, 1500, 0.05, 0.5, { q: 1.2 })
      b.ticks(4, 0, 0.02, 1600, 0.3)
      b.tone('sawtooth', 190, 210, 0.4, 0.18, { a: 0.2, lp: [800, 1100], tr: [48, 0.6], at: 0.05 })
      b.tone('sawtooth', 200, 222, 0.4, 0.12, { a: 0.2, lp: [800, 1100], tr: [53, 0.6], at: 0.05 })
    },
    { vary: 0.05, rev: 0.06 }
  ),
  // A tiny sharp prick.
  sting: D(
    3,
    0.08,
    0.55,
    (b) => {
      b.tone('sine', 2200, 1500, 0.06, 0.3)
      b.nz('bandpass', 3200, 2500, 0.02, 0.25, { q: 3 })
    },
    { vary: 0.05, rev: 0.01 }
  ),
  // A startled snort.
  animalWake: D(
    2,
    0.3,
    0.8,
    (b) => {
      b.nz('bandpass', 700, 1400, 0.16, 0.5, { a: 0.04, q: 2.5 })
      b.tone('triangle', 220, 330, 0.18, 0.25, { lp: [900, 1400] })
      b.nz('bandpass', 800, 500, 0.12, 0.35, { at: 0.14, q: 2 })
    },
    { vary: 0.08, rev: 0.01 }
  ),
  // Four quick hoof beats.
  animalCharge: D(
    1,
    0.4,
    0.7,
    (b) => {
      for (let i = 0; i < 4; i++) {
        b.tone('sine', 130, 75, 0.07, 0.5, { at: i * 0.09 })
        b.nz('bandpass', 900, 500, 0.04, 0.25, { at: i * 0.09, q: 1.5 })
      }
    },
    { vary: 0.07, rev: 0.04 }
  ),
  // A soft poof.
  animalPoof: D(
    2,
    0.2,
    0.6,
    (b) => {
      b.nz('lowpass', 1400, 400, 0.2, 0.45, { a: 0.04, q: 0.5 })
      b.tone('sine', 400, 200, 0.14, 0.2, { a: 0.02 })
    },
    { vary: 0.06, rev: 0.03 }
  ),
  // A stony crack.
  rockCrack: D(
    2,
    0.08,
    0.85,
    (b) => {
      b.nz('bandpass', 2000, 1200, 0.04, 0.6, { q: 1.3 })
      b.ticks(3, 0.01, 0.02, 1500, 0.3, 0.02)
      b.tone('triangle', 220, 150, 0.1, 0.4)
      b.tone('sine', 110, 70, 0.12, 0.3)
    },
    { vary: 0.06, rev: 0.01 }
  ),
  // A rumble with falling debris.
  rockBreak: D(
    1,
    0.4,
    1,
    (b) => {
      b.nz('lowpass', 600, 220, 0.5, 0.7, { a: 0.02, q: 0.8 })
      b.tone('sine', 110, 55, 0.4, 0.5, { sw: 0.5 })
      b.tone('triangle', 170, 120, 0.12, 0.3, { at: 0.02 })
      b.nz('bandpass', 1800, 900, 0.07, 0.6, { q: 1.2 })
      b.ticks(12, 0.1, 0.04, 1300, 0.5, 0.035, 1.2)
    },
    { vary: 0.05, rev: 0.1 }
  ),
  // A mechanical clunk and a rising two-tone chime.
  switchOn: D(
    2,
    0.2,
    0.8,
    (b) => {
      b.tone('triangle', 260, 110, 0.08, 0.6)
      b.nz('bandpass', 1400, 800, 0.03, 0.35, { q: 2 })
      b.bell(76, 0.3, 0.28, { at: 0.1, ratio: 2, index: 0.7 })
      b.bell(83, 0.34, 0.28, { at: 0.18, ratio: 2, index: 0.7 })
    },
    { vary: 0.03, rev: 0.12 }
  ),
  // A heavy slide and a final thud.
  doorOpen: D(
    1,
    0.6,
    0.9,
    (b) => {
      b.nz('lowpass', 700, 350, 0.7, 0.5, { a: 0.15, tr: [7, 0.5] })
      b.tone('sawtooth', 80, 60, 0.7, 0.15, { a: 0.1, lp: [300, 200] })
      b.tone('sine', 90, 45, 0.25, 0.9, { at: 0.75, sw: 0.5 })
      b.nz('lowpass', 400, 200, 0.15, 0.3, { at: 0.75 })
    },
    { vary: 0.03, rev: 0.08 }
  ),
  // A soft pop-up blip.
  spawnItem: D(
    2,
    0.1,
    0.65,
    (b) => {
      b.tone('sine', 500, 1000, 0.06, 0.4, { sw: 0.5 })
      b.tone('sine', 1000, 1500, 0.05, 0.22, { at: 0.05 })
      b.bell(91, 0.08, 0.08, { at: 0.07, ratio: 2, index: 0.5 })
    },
    { vary: 0.05, rev: 0.02 }
  ),
  // A metallic clatter and a sparkle.
  cageBreak: D(
    1,
    0.5,
    0.95,
    (b) => {
      b.bell(70, 0.25, 0.3, { ratio: 2.9, index: 2.5 })
      b.bell(75, 0.3, 0.25, { at: 0.05, ratio: 3.3, index: 2 })
      b.bell(66, 0.3, 0.25, { at: 0.1, ratio: 2.4, index: 2.5 })
      b.tone('sine', 150, 70, 0.12, 0.5, { sw: 0.5 })
      b.sparkle(6, 0.15, 0.35, 88, 100, 0.12)
    },
    { vary: 0.04, rev: 0.15 }
  ),
  // A bright little fanfare of four notes with a shimmer.
  goalOpen: D(
    1,
    0.8,
    1.1,
    (b) => {
      b.bells([72, 76, 79, 84], 0.1, 0.5, 0.4, { ratio: 2, index: 0.8 })
      b.run('triangle', [60, 64, 67, 72], 0.1, 0.25, 0.18, { lp: [2500, 2500] })
      b.bell(84, 0.8, 0.3, { at: 0.3, ratio: 2, index: 0.6 })
      b.sparkle(8, 0.35, 0.5, 90, 102, 0.1)
    },
    { vary: 0.01, rev: 0.2, duck: [0.25, 0.6] }
  ),
  // A magical whoosh upward and a low slam.
  gateUp: D(
    1,
    0.6,
    0.95,
    (b) => {
      b.nz('bandpass', 300, 3000, 0.55, 0.45, { a: 0.3, q: 1.5 })
      b.tone('sine', 150, 600, 0.55, 0.35, { a: 0.2 })
      b.sparkle(5, 0.3, 0.3, 88, 98, 0.1)
      b.tone('sine', 70, 35, 0.35, 0.9, { at: 0.6, sw: 0.5 })
      b.nz('lowpass', 300, 100, 0.15, 0.3, { at: 0.6 })
    },
    { vary: 0.03, rev: 0.2 }
  ),
  // The barrier dissolving: a shimmer falling away.
  gateDown: D(
    1,
    0.6,
    0.8,
    (b) => {
      b.bells([96, 93, 89, 86, 81, 77], 0.07, 0.35, 0.15, { ratio: 2.5, index: 0.6 })
      b.tone('sine', 1200, 300, 0.55, 0.15, { tr: [10, 0.5] })
      b.nz('bandpass', 3000, 600, 0.45, 0.15, { a: 0.1, q: 0.8 })
    },
    { vary: 0.03, rev: 0.2 }
  )
}
