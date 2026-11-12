import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Antique (signature weapon) sounds, melee then ranged. The play functions stay free of imports so their source hash
 * covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // Quick scratchy slash: a bright swish with a dry tick.
  claw: D(
    4,
    0.05,
    0.85,
    (b) => {
      b.nz('bandpass', 1400, 4500, 0.12, 0.55, { a: 0.05, q: 1.4 })
      b.nz('bandpass', 2600, 2000, 0.05, 0.3, { at: 0.07, q: 1.2 })
      b.ticks(3, 0.06, 0.018, 2000, 0.4, 0.02)
      b.tone('triangle', 700, 320, 0.06, 0.2, { at: 0.07 })
    },
    { vary: 0.07, rev: 0.03 }
  ),
  // Heavy wet water-slap swing and thump.
  orca: D(
    2,
    0.2,
    1,
    (b) => {
      b.nz('bandpass', 300, 1100, 0.28, 0.5, { a: 0.14, q: 0.8 })
      b.nz('lowpass', 1800, 300, 0.3, 0.55, { at: 0.2, a: 0.005, q: 0.8 })
      b.tone('sine', 140, 50, 0.3, 0.9, { at: 0.2, sw: 0.4 })
      b.nz('bandpass', 1500, 600, 0.12, 0.3, { at: 0.2, q: 2.5, tr: [40, 0.8] })
      b.nz('highpass', 3000, 3000, 0.04, 0.2, { at: 0.2 })
    },
    { vary: 0.05, rev: 0.1 }
  ),
  // Armoured plate raising: scrape then metallic clank.
  guardUp: D(
    2,
    0.2,
    0.9,
    (b) => {
      b.nz('bandpass', 600, 1800, 0.2, 0.3, { a: 0.1, q: 3, tr: [30, 0.6] })
      b.bell(62, 0.4, 0.45, { at: 0.2, ratio: 2.76, index: 2.2 })
      b.bell(74, 0.25, 0.25, { at: 0.2, ratio: 4.1, index: 1.5 })
      b.tone('sine', 200, 90, 0.1, 0.5, { at: 0.2, sw: 0.5 })
      b.nz('highpass', 4000, 4000, 0.03, 0.3, { at: 0.2 })
    },
    { vary: 0.03, rev: 0.1 }
  ),
  // A hit absorbed by the guard: dull metal knock then a short rattle.
  guardHit: D(
    3,
    0.08,
    1,
    (b) => {
      b.tone('sine', 260, 110, 0.12, 0.8, { sw: 0.4 })
      b.tone('square', 420, 330, 0.08, 0.15, { lp: [1200, 500] })
      b.nz('bandpass', 900, 500, 0.08, 0.5, { q: 2 })
      b.bell(55, 0.3, 0.22, { at: 0.01, ratio: 3.3, index: 1.2 })
      b.ticks(5, 0.07, 0.03, 1500, 0.2, 0.025)
    },
    { vary: 0.05, rev: 0.06 }
  ),
  // Long spear-lance thrust: a rising whistle-swoosh then a sharp impact.
  narwhal: D(
    2,
    0.15,
    0.95,
    (b) => {
      b.nz('bandpass', 1200, 4500, 0.28, 0.4, { a: 0.2, q: 2.2 })
      b.tone('sine', 1500, 3400, 0.26, 0.2, { a: 0.18, sw: 0.9 })
      b.tone('triangle', 520, 150, 0.14, 0.7, { at: 0.28, sw: 0.4 })
      b.nz('highpass', 3500, 3500, 0.06, 0.55, { at: 0.28 })
      b.bell(84, 0.25, 0.2, { at: 0.28, ratio: 3, index: 1 })
    },
    { vary: 0.04, rev: 0.08 }
  ),
  // Deep rising rumble swell of a heavy weapon charging (about 0.6 s).
  mammothWindup: D(
    1,
    0.4,
    0.9,
    (b) => {
      b.tone('sawtooth', 50, 85, 0.25, 0.4, { a: 0.45, sw: 1, lp: [250, 500], tr: [16, 0.6] })
      b.tone('sawtooth', 85, 150, 0.22, 0.4, { at: 0.25, a: 0.3, sw: 1, lp: [500, 900], tr: [22, 0.6] })
      b.tone('sine', 45, 80, 0.25, 0.6, { a: 0.4, sw: 1 })
      b.tone('sine', 80, 130, 0.22, 0.5, { at: 0.25, a: 0.3, sw: 1 })
      b.nz('bandpass', 400, 900, 0.22, 0.25, { at: 0.1, a: 0.3, q: 4, tr: [30, 0.9] })
      b.tone('square', 220, 520, 0.2, 0.1, { at: 0.3, a: 0.25, sw: 1, lp: [800, 2000] })
    },
    { vary: 0.03, rev: 0.1 }
  ),
  // Huge hammer slam: boom, crack and falling debris.
  mammoth: D(
    1,
    0.4,
    1.25,
    (b) => {
      // Rising windup swell, then a delayed hit: metallic crack + boom, debris rolling late.
      b.nz('bandpass', 300, 1800, 0.18, 0.5, { a: 0.16, q: 1.2 })
      b.tone('sawtooth', 90, 200, 0.18, 0.2, { a: 0.15, lp: [500, 1500] })
      b.tone('sine', 85, 30, 0.7, 0.8, { at: 0.2, sw: 0.3 })
      b.nz('highpass', 2500, 2500, 0.08, 0.9, { at: 0.2 })
      b.bell(52, 0.5, 0.45, { at: 0.2, ratio: 2.9, index: 2.2 })
      b.bell(64, 0.35, 0.25, { at: 0.2, ratio: 3.7, index: 1.5 })
      b.ticks(14, 0.35, 0.05, 1800, 0.4, 0.04, 0.9)
      b.nz('bandpass', 900, 300, 0.4, 0.3, { at: 0.5, a: 0.1, q: 0.8, tr: [18, 0.7] })
    },
    { vary: 0.04, rev: 0.22, duck: [0.35, 0.8] }
  ),
  // Two fast scythe slashes of bright steel.
  mantis: D(
    2,
    0.15,
    0.9,
    (b) => {
      for (let i = 0; i < 2; i++) {
        const at = i * 0.13
        b.nz('bandpass', 3500 + i * 700, 9000, 0.1, 0.5, { at, a: 0.035, q: 2.8 })
        b.tone('sine', 4200 + i * 500, 2200, 0.09, 0.12, { at: at + 0.03, sw: 0.8 })
        b.bell(96 + i * 3, 0.18, 0.18, { at: at + 0.06, ratio: 4.2, index: 1.2 })
      }
    },
    { vary: 0.04, rev: 0.05 }
  ),
  // Light buzzy pew: fast downward sweep with a buzz.
  bee: D(
    4,
    0.05,
    0.75,
    (b) => {
      b.tone('sawtooth', 1900, 520, 0.09, 0.35, { sw: 0.8, lp: [4000, 1200] })
      b.tone('square', 1400, 420, 0.07, 0.12, { sw: 0.8, tr: [180, 0.9] })
      b.nz('bandpass', 3500, 1500, 0.04, 0.2, { q: 1.5 })
    },
    { vary: 0.06, rev: 0.02 }
  ),
  // Woodpecker: 3-4 rapid wooden knocks.
  wood: D(
    3,
    0.1,
    0.9,
    (b) => {
      for (let i = 0; i < 4; i++) {
        const at = i * 0.055 + b.rnd() * 0.008
        b.tone('triangle', 780 - i * 25, 380, 0.04, 0.6, { at, sw: 0.5 })
        b.nz('bandpass', 1900, 1100, 0.03, 0.4, { at, q: 3 })
      }
      b.nz('highpass', 5500, 5500, 0.02, 0.25)
    },
    { vary: 0.05, rev: 0.03 }
  ),
  // Hummingbird: fast high-pitched chatter bursts.
  humming: D(
    4,
    0.06,
    0.7,
    (b) => {
      for (let i = 0; i < 3; i++) {
        const at = i * 0.05
        b.tone('sine', 2000 + i * 250, 3000 + i * 200, 0.035, 0.3, { at, sw: 0.9, tr: [120, 0.7] })
        b.tone('triangle', 1300, 1800, 0.03, 0.15, { at, sw: 0.9 })
      }
    },
    { vary: 0.06, rev: 0.03 }
  ),
  // Deep puff blast: muffled low air-cannon thump with a soft burst.
  puffer: D(
    2,
    0.2,
    1.05,
    (b) => {
      b.tone('sine', 150, 70, 0.35, 0.35, { a: 0.03, sw: 0.5 })
      b.nz('bandpass', 1100, 300, 0.35, 1, { a: 0.07, q: 0.5 })
      b.nz('lowpass', 900, 200, 0.3, 0.5, { a: 0.04, q: 0.7 })
      b.tone('triangle', 240, 110, 0.2, 0.3, { a: 0.02, sw: 0.5, lp: [600, 250] })
    },
    { vary: 0.04, rev: 0.12 }
  ),
  // Scope zoom-in: short rising servo whir then a soft click.
  owlZoom: D(
    1,
    0.2,
    0.7,
    (b) => {
      b.tone('sawtooth', 280, 1100, 0.3, 0.2, { a: 0.05, sw: 0.9, lp: [900, 2800], vib: [28, 40] })
      b.tone('square', 560, 1700, 0.26, 0.07, { a: 0.05, sw: 0.9, lp: [1500, 3500], tr: [45, 0.6] })
      b.tone('sine', 1100, 1700, 0.22, 0.1, { a: 0.1, sw: 0.9 })
      b.nz('highpass', 4500, 4500, 0.015, 0.4, { at: 0.31 })
      b.tone('triangle', 1200, 700, 0.025, 0.35, { at: 0.31 })
    },
    { vary: 0.03, rev: 0.03 }
  ),
  // Sniper: a sharp crack with a low hoot-like tail.
  owl: D(
    2,
    0.3,
    1,
    (b) => {
      b.nz('highpass', 3000, 3000, 0.07, 0.8)
      b.nz('bandpass', 2200, 800, 0.14, 0.4, { q: 0.9 })
      b.tone('sine', 220, 90, 0.2, 0.7, { sw: 0.3 })
      b.tone('sine', 330, 300, 0.35, 0.3, { at: 0.12, a: 0.05, sw: 0.5, lp: [900, 500], vib: [5, 25] })
      b.tone('sine', 240, 215, 0.4, 0.28, { at: 0.2, a: 0.06, sw: 0.6, lp: [700, 400] })
    },
    { vary: 0.04, rev: 0.2 }
  ),
  // Target lock: two quick rising tonal blips.
  swallowLock: D(
    2,
    0.12,
    0.7,
    (b) => {
      b.tone('square', 1100, 1150, 0.06, 0.25, { lp: [3000, 2500] })
      b.tone('sine', 2200, 2300, 0.06, 0.15)
      b.tone('square', 1650, 1700, 0.08, 0.25, { at: 0.09, lp: [4000, 3000] })
      b.tone('sine', 3300, 3400, 0.08, 0.15, { at: 0.09 })
    },
    { vary: 0.02, rev: 0.04 }
  ),
  // Whistling darts: a volley of fast descending whistles.
  swallow: D(
    3,
    0.1,
    0.85,
    (b) => {
      for (let i = 0; i < 3; i++) {
        const at = i * 0.06
        b.tone('sine', 3800 - i * 300, 1500, 0.2, 0.28, { at, a: 0.01, sw: 0.9, vib: [14, 40] })
        b.tone('triangle', 1900 - i * 150, 750, 0.18, 0.1, { at, sw: 0.9 })
        b.nz('bandpass', 4500, 2000, 0.12, 0.15, { at, q: 3 })
      }
    },
    { vary: 0.05, rev: 0.07 }
  ),
  // Launcher thunk: low hollow thunk and a small rattle.
  pillbug: D(
    2,
    0.15,
    0.95,
    (b) => {
      // Hollow bloop (mid-band formant), then a delayed rattle of shell fragments.
      b.tone('sine', 330, 110, 0.14, 0.8, { sw: 0.5, bp: [400, 3] })
      b.tone('triangle', 520, 220, 0.1, 0.3, { sw: 0.4, bp: [700, 2] })
      b.nz('bandpass', 1200, 500, 0.06, 0.3, { q: 5 })
      b.ticks(9, 0.12, 0.025, 2600, 0.3, 0.02, 1)
      b.bell(55, 0.2, 0.12, { at: 0.18, ratio: 3.1, index: 1.5 })
    },
    { vary: 0.05, rev: 0.07 }
  ),
  // Rattling bounce of a shell bomb: short ticks and a metallic tonk.
  pillbugBounce: D(
    3,
    0.1,
    0.8,
    (b) => {
      b.ticks(4, 0, 0.022, 2800, 0.3, 0.015)
      b.bell(76, 0.2, 0.4, { at: 0.07, ratio: 2.4, index: 1.6 })
      b.tone('triangle', 640, 380, 0.07, 0.35, { at: 0.07, sw: 0.5 })
      b.nz('bandpass', 2000, 1200, 0.05, 0.2, { at: 0.07, q: 3 })
    },
    { vary: 0.06, rev: 0.06 }
  ),
  // Crackling electric start: a sizzling zap that rises with arcs.
  eelStart: D(
    2,
    0.2,
    0.85,
    (b) => {
      b.tone('sawtooth', 220, 1300, 0.4, 0.22, { a: 0.1, sw: 0.9, lp: [1500, 5000], tr: [60, 0.8] })
      b.nz('bandpass', 2500, 7000, 0.4, 0.35, { a: 0.15, q: 1.2, tr: [70, 0.9] })
      b.ticks(10, 0.05, 0.035, 4500, 0.28, 0.012, 1)
      b.tone('square', 90, 120, 0.4, 0.12, { a: 0.1, lp: [400, 600], tr: [100, 0.9] })
    },
    { vary: 0.05, rev: 0.08 }
  ),
  // Charge rumble: a low rising growl that builds for about 0.7 s.
  hippoCharge: D(
    1,
    0.4,
    0.9,
    (b) => {
      b.tone('sawtooth', 38, 60, 0.25, 0.45, { a: 0.45, sw: 1, lp: [120, 250], vib: [9, 60] })
      b.tone('sawtooth', 60, 100, 0.25, 0.45, { at: 0.25, a: 0.35, sw: 1, lp: [250, 500], vib: [11, 60] })
      b.tone('sawtooth', 100, 150, 0.2, 0.3, { at: 0.5, a: 0.2, sw: 1, lp: [500, 800], vib: [13, 60] })
      b.nz('lowpass', 250, 1100, 0.25, 0.35, { at: 0.2, a: 0.4, q: 0.9, tr: [26, 0.6] })
      b.howl(0.05, 0.7, 62, 0.14)
    },
    { vary: 0.03, rev: 0.1 }
  ),
  // Huge muffled boom: very deep, long soft-edged tail with a rolling rumble.
  hippo: D(
    1,
    0.5,
    1.3,
    (b) => {
      // Slow swelling muffled boom, a lagging heavy heave and a long beating rumble.
      b.tone('sine', 40, 32, 0.6, 0.8, { a: 0.25, sw: 0.5 })
      b.nz('lowpass', 300, 100, 0.5, 0.4, { a: 0.25, q: 1, tr: [8, 0.6] })
      b.tone('sine', 60, 28, 0.7, 1, { at: 0.35, a: 0.03, sw: 0.5 })
      b.tone('triangle', 130, 50, 0.5, 0.35, { at: 0.35, a: 0.03, lp: [350, 100], tr: [6, 0.5] })
      b.nz('lowpass', 350, 70, 0.7, 0.55, { at: 0.35, a: 0.04, q: 1, tr: [7, 0.7] })
    },
    { vary: 0.03, rev: 0.28, duck: [0.4, 0.9] }
  )
}
