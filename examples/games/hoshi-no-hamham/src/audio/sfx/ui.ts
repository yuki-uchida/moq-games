import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Interface and staging: menuMove, menuSelect, menuBack, pauseIn, pauseOut, textBlip, pageTurn, stageStart, ready,
 * unlock, tallyTick, tallyDone, newRecord, irisOut, irisIn, titleStart, confetti. Light and musical, tuned to
 * C major (MIDI 72 = C5) so they sit with the title music; the play functions stay free of imports.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // A soft wooden tick.
  menuMove: D(
    2,
    0.04,
    0.4,
    (b) => {
      b.tone('sine', 880, 700, 0.04, 0.4, { a: 0.003 })
      b.tone('triangle', 440, 400, 0.03, 0.2)
      b.nz('bandpass', 1500, 1000, 0.015, 0.12, { q: 1.5 })
    },
    { vary: 0.03, rev: 0 }
  ),
  // A bright two-note confirm: E5 -> C6.
  menuSelect: D(
    2,
    0.08,
    0.55,
    (b) => {
      b.tone('sine', 659, 659, 0.12, 0.45)
      b.tone('triangle', 1318, 1318, 0.08, 0.1, { lp: [3500, 2000] })
      b.tone('sine', 1047, 1047, 0.15, 0.5, { at: 0.07 })
      b.bell(84, 0.15, 0.1, { at: 0.07, ratio: 3, index: 0.6 })
    },
    { vary: 0.01, rev: 0.05 }
  ),
  // A soft falling two-note: G4 -> C4.
  menuBack: D(
    2,
    0.08,
    0.5,
    (b) => {
      b.tone('sine', 523, 523, 0.1, 0.45)
      b.tone('triangle', 1047, 1047, 0.06, 0.08, { lp: [2500, 1500] })
      b.tone('sine', 392, 392, 0.18, 0.5, { at: 0.07 })
      b.tone('triangle', 784, 784, 0.1, 0.1, { at: 0.07, lp: [2000, 1200] })
    },
    { vary: 0.01, rev: 0.04 }
  ),
  // A short down-sweep into the pause.
  pauseIn: D(
    1,
    0.2,
    0.55,
    (b) => {
      b.tone('sine', 1047, 392, 0.18, 0.45, { sw: 0.8 })
      b.tone('triangle', 523, 196, 0.16, 0.2, { lp: [2500, 800] })
      b.nz('bandpass', 2500, 700, 0.14, 0.12, { a: 0.02, q: 0.8 })
    },
    { vary: 0.02, rev: 0.03 }
  ),
  // The same going up, brighter.
  pauseOut: D(
    1,
    0.2,
    0.55,
    (b) => {
      b.tone('sine', 392, 1047, 0.16, 0.45, { sw: 0.8 })
      b.tone('triangle', 196, 523, 0.14, 0.2, { lp: [900, 2500] })
      b.bell(84, 0.2, 0.1, { at: 0.1, ratio: 3, index: 0.6 })
    },
    { vary: 0.02, rev: 0.03 }
  ),
  // A tiny voice-like blip; heavy variation makes the typewriter text chatter.
  textBlip: D(
    2,
    0.03,
    0.35,
    (b) => {
      b.tone('triangle', 520, 480, 0.05, 0.4, { a: 0.004, lp: [2200, 1500] })
      b.tone('sine', 260, 240, 0.05, 0.25)
    },
    { vary: 0.3, rev: 0 }
  ),
  // A papery flick: a quick noise sweep and a soft flap.
  pageTurn: D(
    2,
    0.12,
    0.5,
    (b) => {
      b.nz('bandpass', 3000, 1200, 0.16, 0.4, { a: 0.03, q: 0.7 })
      b.nz('bandpass', 900, 500, 0.08, 0.25, { at: 0.12, a: 0.01, q: 0.8 })
      b.tone('sine', 150, 100, 0.06, 0.15, { at: 0.12 })
    },
    { vary: 0.08, rev: 0 }
  ),
  // A short rising flourish: C5 E5 G5 C6.
  stageStart: D(
    1,
    0.4,
    0.75,
    (b) => {
      b.run('triangle', [72, 76, 79, 84], 0.09, 0.2, 0.35, { lp: [4000, 2500] })
      b.run('sine', [60, 64, 67, 72], 0.09, 0.2, 0.3)
      b.bells([84], 0, 0.5, 0.18, { at: 0.27, ratio: 3, index: 0.7 })
      b.nz('bandpass', 800, 3000, 0.3, 0.1, { a: 0.1, q: 0.7 })
    },
    { vary: 0.01, rev: 0.1 }
  ),
  // A single clear "go" note: G5 with a bell on top.
  ready: D(
    1,
    0.3,
    0.7,
    (b) => {
      b.tone('triangle', 700, 784, 0.16, 0.45, { sw: 0.15, lp: [3000, 1800] })
      b.tone('sine', 392, 392, 0.16, 0.35)
      b.tone('sine', 196, 196, 0.1, 0.25)
      b.bell(91, 0.16, 0.22, { ratio: 3, index: 1 })
    },
    { vary: 0.01, rev: 0.005 }
  ),
  // A sparkling lock-opening jingle: a click, then a rising pentatonic run of bells.
  unlock: D(
    1,
    0.6,
    0.8,
    (b) => {
      b.nz('bandpass', 2200, 1400, 0.02, 0.4, { q: 2 })
      b.tone('triangle', 330, 220, 0.04, 0.3, { at: 0.005 })
      b.bells([76, 79, 84, 88, 91], 0.08, 0.35, 0.3, { at: 0.12, ratio: 3, index: 0.9 })
      b.bell(96, 0.6, 0.2, { at: 0.55, ratio: 3, index: 0.6 })
      b.tone('sine', 523, 523, 0.5, 0.25, { at: 0.5 })
      b.sparkle(6, 0.4, 0.4, 88, 100, 0.07)
    },
    { vary: 0.01, rev: 0.15 }
  ),
  // A quick counting tick.
  tallyTick: D(
    3,
    0.03,
    0.35,
    (b) => {
      b.tone('triangle', 1047, 1047, 0.04, 0.4, { lp: [3000, 2000] })
      b.tone('sine', 523, 523, 0.04, 0.2)
    },
    { vary: 0.04, rev: 0 }
  ),
  // The tally lands: a small C major chord with a sparkle.
  tallyDone: D(
    1,
    0.4,
    0.7,
    (b) => {
      b.tone('triangle', 523, 523, 0.5, 0.3, { lp: [3000, 1800] })
      b.tone('triangle', 659, 659, 0.5, 0.28, { lp: [3000, 1800], at: 0.03 })
      b.tone('triangle', 784, 784, 0.55, 0.28, { lp: [3000, 1800], at: 0.06 })
      b.tone('sine', 262, 262, 0.5, 0.3)
      b.bell(96, 0.5, 0.12, { at: 0.1, ratio: 3, index: 0.6 })
    },
    { vary: 0.01, rev: 0.1 }
  ),
  // A happy sparkle fanfare: G5 C6 E6 G6 held, with glitter.
  newRecord: D(
    1,
    0.8,
    0.85,
    (b) => {
      b.run('triangle', [79, 84, 88, 91], 0.1, 0.18, 0.35, { lp: [4500, 3000] })
      b.run('sine', [67, 72, 76, 79], 0.1, 0.18, 0.3)
      b.tone('triangle', 1568, 1568, 0.55, 0.3, { at: 0.4, lp: [5000, 3000], vib: [6, 15] })
      b.tone('sine', 523, 659, 0.55, 0.3, { at: 0.4, sw: 0.05 })
      b.tone('sine', 392, 392, 0.55, 0.25, { at: 0.4 })
      b.sparkle(10, 0.35, 0.6, 91, 103, 0.08)
    },
    { vary: 0.01, rev: 0.15 }
  ),
  // A falling whoosh: the wipe closes.
  irisOut: D(
    1,
    0.3,
    0.55,
    (b) => {
      b.nz('bandpass', 3000, 400, 0.4, 0.5, { a: 0.1, q: 0.8 })
      b.tone('sine', 700, 200, 0.4, 0.25, { sw: 0.8 })
      b.tone('triangle', 350, 100, 0.35, 0.12, { lp: [1500, 500] })
    },
    { vary: 0.02, rev: 0.05 }
  ),
  // A rising whoosh: the wipe opens.
  irisIn: D(
    1,
    0.3,
    0.55,
    (b) => {
      b.nz('bandpass', 400, 3200, 0.4, 0.5, { a: 0.25, q: 0.8 })
      b.tone('sine', 200, 800, 0.4, 0.25, { sw: 0.8, a: 0.1 })
      b.bell(88, 0.25, 0.08, { at: 0.3, ratio: 3, index: 0.6 })
    },
    { vary: 0.02, rev: 0.05 }
  ),
  // The start button: a bigger confirm, C5 G5 C6 E6, with a sparkle burst.
  titleStart: D(
    1,
    0.5,
    0.8,
    (b) => {
      b.run('triangle', [72, 79, 84, 88], 0.07, 0.2, 0.35, { lp: [4500, 2800] })
      b.run('sine', [60, 67, 72, 76], 0.07, 0.2, 0.3)
      b.bell(96, 0.5, 0.15, { at: 0.2, ratio: 3, index: 0.7 })
      b.nz('bandpass', 1000, 4000, 0.25, 0.12, { a: 0.08, q: 0.7 })
      b.sparkle(6, 0.2, 0.3, 91, 100, 0.07)
    },
    { vary: 0.01, rev: 0.12 }
  ),
  // A soft party-popper: a pop, a puff and falling glitter.
  confetti: D(
    2,
    0.2,
    0.7,
    (b) => {
      b.tone('sine', 350, 120, 0.07, 0.5, { sw: 0.5 })
      b.nz('bandpass', 1800, 900, 0.05, 0.4, { q: 1 })
      b.nz('lowpass', 2500, 700, 0.3, 0.3, { at: 0.03, a: 0.03, q: 0.6 })
      b.ticks(12, 0.08, 0.025, 3000, 0.1, 0.02, 0.8)
      b.sparkle(4, 0.1, 0.25, 88, 98, 0.05)
    },
    { vary: 0.05, rev: 0.06 }
  )
}
