import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * The hero: jump, land, landHard, step, skid, bite, biteHit, hurt, die, splashIn, splashOut, swim, drop, respawn,
 * heal, starGet, pickup, lowHp. Soft and rounded: sines and triangles, low-passed noise, short tails. The play
 * functions stay free of imports and shared helpers so their source hash (see `sfx-hash.ts`) covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // A soft rising "boing" with a breath of air.
  jump: D(
    2,
    0.05,
    0.8,
    (b) => {
      b.tone('sine', 300, 700, 0.12, 0.5, { sw: 0.7, a: 0.006 })
      b.tone('triangle', 600, 1400, 0.08, 0.15, { lp: [3000, 1500], at: 0.01 })
      b.nz('bandpass', 1100, 2200, 0.08, 0.14, { a: 0.03, q: 0.8 })
    },
    { vary: 0.06, rev: 0.01 }
  ),
  // A small soft thud with a puff of dust.
  land: D(
    3,
    0.06,
    0.8,
    (b) => {
      b.tone('sine', 230, 115, 0.08, 0.4, { sw: 0.5 })
      b.nz('lowpass', 1300, 400, 0.08, 0.4, { a: 0.008, q: 0.6 })
      b.nz('bandpass', 1800, 1200, 0.025, 0.2, { q: 1 })
    },
    { vary: 0.06, rev: 0.01 }
  ),
  // The same from a height: deeper, with a tiny squeak.
  landHard: D(
    2,
    0.12,
    0.95,
    (b) => {
      b.tone('sine', 140, 60, 0.18, 0.6, { sw: 0.5 })
      b.nz('lowpass', 900, 250, 0.16, 0.5, { a: 0.008, q: 0.6 })
      b.tone('sine', 1100, 1700, 0.08, 0.16, { at: 0.035, vib: [30, 40] })
    },
    { vary: 0.05, rev: 0.03 }
  ),
  // A tiny padded tick, very quiet and strongly varied.
  step: D(
    2,
    0.09,
    0.45,
    (b) => {
      b.nz('lowpass', 900, 500, 0.03, 0.35, { a: 0.004, q: 0.6 })
      b.tone('sine', 190, 125, 0.035, 0.25, { sw: 0.7 })
    },
    { vary: 0.2, rev: 0 }
  ),
  // A short scuff.
  skid: D(
    2,
    0.12,
    0.55,
    (b) => {
      b.nz('bandpass', 2000, 1000, 0.09, 0.3, { a: 0.02, q: 1.1 })
      b.nz('bandpass', 600, 400, 0.08, 0.2, { tr: [40, 0.8], a: 0.01 })
    },
    { vary: 0.08, rev: 0 }
  ),
  // The snap of teeth in the air: two quick clicks and a little whoosh.
  bite: D(
    3,
    0.05,
    0.8,
    (b) => {
      b.nz('bandpass', 2600, 1900, 0.018, 0.8, { q: 2 })
      b.nz('bandpass', 2400, 1800, 0.018, 0.7, { q: 2, at: 0.06 })
      b.tone('triangle', 900, 500, 0.04, 0.15, { at: 0.06 })
      b.nz('bandpass', 800, 2000, 0.09, 0.3, { a: 0.03, q: 0.9 })
    },
    { vary: 0.05, rev: 0.01 }
  ),
  // The bite that connects: a crunchy chomp with a low thump and a crackle. The most satisfying sound in the game.
  biteHit: D(
    3,
    0.07,
    1.15,
    (b) => {
      b.tone('sine', 210, 80, 0.13, 0.6, { sw: 0.5 })
      b.nz('bandpass', 1600, 700, 0.08, 0.7, { q: 1.1 })
      b.tone('triangle', 520, 300, 0.05, 0.3, { at: 0.045 })
      b.nz('bandpass', 2000, 1000, 0.05, 0.4, { at: 0.045, q: 1.2 })
      for (let i = 0; i < 6; i++) b.nz('bandpass', 2300 - i * 120, 1500, 0.02, 0.35, { at: 0.02 + i * 0.02, q: 1.5 })
      b.tone('sine', 520, 780, 0.06, 0.1, { at: 0.07 })
    },
    { vary: 0.06, rev: 0.02 }
  ),
  // A falling squeak with a bump.
  hurt: D(
    2,
    0.15,
    0.9,
    (b) => {
      b.tone('triangle', 1500, 600, 0.2, 0.45, { vib: [22, 60], lp: [4000, 1800] })
      b.tone('sine', 750, 300, 0.2, 0.2, { vib: [22, 60] })
      b.tone('sine', 130, 70, 0.1, 0.5)
      b.nz('lowpass', 900, 300, 0.06, 0.2)
    },
    { vary: 0.05, rev: 0.02 }
  ),
  // A longer falling squeak that wobbles away, then a soft thud.
  die: D(
    1,
    0.5,
    0.95,
    (b) => {
      b.tone('triangle', 1700, 350, 0.65, 0.4, { vib: [7, 120], lp: [4500, 1200] })
      b.tone('sine', 850, 175, 0.65, 0.2, { vib: [7, 120] })
      b.tone('sine', 125, 55, 0.2, 0.6, { at: 0.62, sw: 0.5 })
      b.nz('lowpass', 600, 200, 0.14, 0.3, { at: 0.62 })
    },
    { vary: 0.03, rev: 0.12 }
  ),
  // Water entry: a noise plop, a bloop and bubbles rising.
  splashIn: D(
    2,
    0.1,
    0.85,
    (b) => {
      b.nz('lowpass', 1800, 500, 0.2, 0.6, { a: 0.01, q: 0.7 })
      b.tone('sine', 300, 700, 0.1, 0.3, { at: 0.02, sw: 0.8 })
      b.tone('sine', 700, 1200, 0.07, 0.14, { at: 0.09 })
      b.tone('sine', 850, 1500, 0.07, 0.12, { at: 0.15 })
      b.tone('sine', 1000, 1700, 0.06, 0.1, { at: 0.2 })
    },
    { vary: 0.07, rev: 0.04 }
  ),
  // Water exit: a rising wash, a small plop and drops falling.
  splashOut: D(
    2,
    0.1,
    0.75,
    (b) => {
      b.nz('bandpass', 600, 1800, 0.18, 0.4, { a: 0.05, q: 0.8 })
      b.tone('sine', 250, 500, 0.08, 0.25, { sw: 0.8 })
      b.tone('sine', 1400, 700, 0.05, 0.12, { at: 0.1 })
      b.tone('sine', 1200, 600, 0.05, 0.1, { at: 0.17 })
      b.tone('sine', 1000, 500, 0.05, 0.08, { at: 0.25 })
    },
    { vary: 0.07, rev: 0.04 }
  ),
  // A soft stroke of water.
  swim: D(
    2,
    0.2,
    0.4,
    (b) => {
      b.nz('bandpass', 500, 1100, 0.2, 0.28, { a: 0.08, q: 0.7 })
      b.nz('lowpass', 1500, 700, 0.16, 0.15, { at: 0.02, a: 0.05 })
    },
    { vary: 0.1, rev: 0.03 }
  ),
  // A quick downward whoosh.
  drop: D(
    2,
    0.15,
    0.6,
    (b) => {
      b.nz('bandpass', 1800, 500, 0.1, 0.35, { a: 0.03, q: 0.9 })
      b.tone('sine', 500, 200, 0.08, 0.2)
    },
    { vary: 0.06, rev: 0.01 }
  ),
  // A soft sparkle rising.
  respawn: D(
    1,
    0.4,
    0.7,
    (b) => {
      b.bells([84, 88, 91, 96], 0.06, 0.35, 0.12, { ratio: 3, index: 0.6 })
      b.tone('sine', 400, 1200, 0.3, 0.15, { a: 0.1, sw: 0.8 })
    },
    { vary: 0.02, rev: 0.2 }
  ),
  // Fruit: a bright rising two-note chime.
  heal: D(
    2,
    0.15,
    0.8,
    (b) => {
      b.bell(79, 0.2, 0.5, { ratio: 2, index: 0.6 })
      b.bell(86, 0.22, 0.5, { at: 0.09, ratio: 2, index: 0.6 })
      b.tone('sine', 392, 392, 0.14, 0.15)
    },
    { vary: 0.02, rev: 0.03 }
  ),
  // A sparkling three-note arpeggio with a shimmer.
  starGet: D(
    2,
    0.2,
    0.85,
    (b) => {
      b.bells([84, 88, 91], 0.08, 0.45, 0.4, { ratio: 2.5, index: 0.7 })
      b.sparkle(5, 0.12, 0.3, 91, 100, 0.1)
      b.tone('triangle', 1047, 1047, 0.2, 0.08, { lp: [3000, 3000] })
    },
    { vary: 0.02, rev: 0.2 }
  ),
  // Nest material: a soft pop with a tick.
  pickup: D(
    3,
    0.06,
    0.65,
    (b) => {
      b.tone('sine', 350, 700, 0.06, 0.4, { sw: 0.5 })
      b.tone('sine', 1050, 1400, 0.03, 0.12, { at: 0.01 })
      b.nz('bandpass', 3000, 2000, 0.02, 0.3, { q: 1 })
    },
    { vary: 0.06, rev: 0.01 }
  ),
  // A soft double heartbeat thump.
  lowHp: D(
    1,
    0.35,
    0.85,
    (b) => {
      b.tone('sine', 90, 55, 0.1, 0.8, { sw: 0.6 })
      b.tone('sine', 80, 50, 0.12, 0.6, { at: 0.16, sw: 0.6 })
      b.nz('lowpass', 250, 150, 0.06, 0.2)
    },
    { vary: 0.02, rev: 0 }
  )
}
