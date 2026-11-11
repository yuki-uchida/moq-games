import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Bosses: bossRoar, bossWindup, bossCharge, bossDive, bossLeap, bossSlam, bossCast, shockwave, bossCrash, bossHit,
 * bossHitWeak, bossPhase, bossDown, bossBoom, minion, momYell, momTired. Bigger and lower than the rest but still
 * cartoon: weighty, never harsh. The play functions stay free of imports so their source hash covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // The roar that opens the fight: a long low growl on the vowel formants over a deep swell.
  bossRoar: D(
    1,
    1,
    0.95,
    (b) => {
      b.howl(0, 1, 95, 0.55)
      b.tone('sine', 70, 55, 0.8, 0.5, { a: 0.15, sw: 0.8, tr: [18, 0.4] })
      b.tone('sawtooth', 110, 85, 0.8, 0.18, { a: 0.2, lp: [500, 300], vib: [7, 60] })
      b.nz('lowpass', 700, 300, 0.7, 0.22, { a: 0.2, q: 0.7, tr: [24, 0.5] })
    },
    { vary: 0.03, rev: 0.12, duck: [0.5, 1.2] }
  ),
  // A rising tension swell with a glint at the end.
  bossWindup: D(
    1,
    0.3,
    0.7,
    (b) => {
      b.tone('triangle', 180, 520, 0.3, 0.4, { a: 0.22, sw: 0.9, lp: [800, 2500] })
      b.tone('sine', 90, 260, 0.3, 0.3, { a: 0.22, sw: 0.9 })
      b.nz('bandpass', 500, 2500, 0.3, 0.2, { a: 0.22, q: 1.2 })
      b.bell(88, 0.2, 0.1, { at: 0.26, ratio: 3, index: 0.7 })
    },
    { vary: 0.03, rev: 0.05 }
  ),
  // A heavy whoosh with pounding feet.
  bossCharge: D(
    1,
    0.4,
    0.85,
    (b) => {
      b.nz('bandpass', 400, 1400, 0.45, 0.55, { a: 0.18, q: 0.7 })
      b.nz('lowpass', 800, 300, 0.45, 0.3, { a: 0.15, q: 0.6, tr: [12, 0.7] })
      for (let i = 0; i < 4; i++) b.tone('sine', 110 - i * 8, 55, 0.1, 0.5, { at: 0.04 + i * 0.1, sw: 0.5 })
    },
    { vary: 0.04, rev: 0.05 }
  ),
  // A falling whistle with a rush of air.
  bossDive: D(
    1,
    0.4,
    0.75,
    (b) => {
      b.tone('sine', 1500, 320, 0.55, 0.4, { sw: 0.9, vib: [9, 50] })
      b.tone('triangle', 750, 160, 0.55, 0.22, { sw: 0.9, lp: [2500, 800] })
      b.nz('bandpass', 2500, 500, 0.5, 0.3, { a: 0.1, q: 0.9 })
    },
    { vary: 0.04, rev: 0.06 }
  ),
  // A deep spring: a low coil winding up, a boing and a puff.
  bossLeap: D(
    1,
    0.4,
    0.8,
    (b) => {
      b.tone('sine', 90, 330, 0.35, 0.55, { sw: 0.7, vib: [20, 80] })
      b.tone('triangle', 180, 660, 0.25, 0.2, { sw: 0.7, lp: [2000, 900] })
      b.nz('lowpass', 1200, 400, 0.2, 0.3, { a: 0.02, q: 0.6 })
    },
    { vary: 0.04, rev: 0.05 }
  ),
  // The heaviest thump in the game: a deep boom, a body knock and a rumble that rolls out.
  bossSlam: D(
    1,
    0.6,
    1.2,
    (b) => {
      b.tone('sine', 85, 32, 0.7, 1, { sw: 0.4 })
      b.tone('triangle', 180, 70, 0.3, 0.5, { sw: 0.4 })
      b.nz('lowpass', 700, 150, 0.7, 0.6, { a: 0.01, q: 0.6, tr: [16, 0.4] })
      b.nz('bandpass', 1500, 600, 0.12, 0.4, { q: 0.9 })
      b.ticks(6, 0.05, 0.05, 1800, 0.3, 0.03, 0.8)
    },
    { vary: 0.03, rev: 0.12, duck: [0.45, 0.8] }
  ),
  // A dark magical swirl released: a wobbling downward-then-up glide and a glitter.
  bossCast: D(
    1,
    0.4,
    0.75,
    (b) => {
      b.tone('sine', 300, 600, 0.4, 0.35, { a: 0.08, sw: 0.5, vib: [6, 300] })
      b.tone('triangle', 150, 300, 0.4, 0.2, { a: 0.08, lp: [900, 1800], vib: [6, 300] })
      b.nz('bandpass', 800, 2400, 0.4, 0.25, { a: 0.15, q: 2.5, tr: [9, 0.6] })
      b.bell(79, 0.3, 0.12, { at: 0.15, ratio: 2.4, index: 2 })
      b.bell(67, 0.3, 0.1, { at: 0.22, ratio: 2.4, index: 2 })
    },
    { vary: 0.04, rev: 0.15 }
  ),
  // A ground wave rushing outward: a rumble that rolls with a low swept hiss.
  shockwave: D(
    2,
    0.3,
    0.85,
    (b) => {
      b.tone('sine', 90, 70, 0.45, 0.3, { a: 0.12, tr: [14, 0.6] })
      b.nz('bandpass', 160, 1100, 0.5, 0.6, { a: 0.2, q: 1.4, tr: [20, 0.5] })
      b.nz('bandpass', 600, 2400, 0.35, 0.25, { a: 0.15, q: 0.9 })
    },
    { vary: 0.05, rev: 0.05 }
  ),
  // The boss hits a wall: a crunch, then a cartoon "boi-oing" with stars.
  bossCrash: D(
    1,
    0.6,
    1,
    (b) => {
      b.tone('sine', 110, 45, 0.3, 0.8, { sw: 0.4 })
      b.nz('bandpass', 1800, 600, 0.12, 0.6, { q: 0.9 })
      b.ticks(7, 0, 0.02, 2200, 0.4, 0.03, 0.6)
      b.tone('sine', 220, 560, 0.35, 0.4, { at: 0.2, sw: 0.7, vib: [18, 120] })
      b.tone('triangle', 440, 1100, 0.25, 0.14, { at: 0.2, lp: [3000, 1500], vib: [18, 120] })
      b.bells([84, 88, 91], 0.12, 0.3, 0.12, { at: 0.4, ratio: 3, index: 0.7 })
    },
    { vary: 0.04, rev: 0.08 }
  ),
  // A meaty bonk when a bite lands.
  bossHit: D(
    2,
    0.07,
    1,
    (b) => {
      b.tone('sine', 180, 70, 0.2, 0.7, { sw: 0.5 })
      b.nz('bandpass', 1000, 450, 0.1, 0.55, { q: 0.9 })
      b.tone('triangle', 420, 240, 0.08, 0.3, { at: 0.01 })
      b.nz('lowpass', 800, 250, 0.15, 0.3, { q: 0.6 })
    },
    { vary: 0.05, rev: 0.03 }
  ),
  // The same with a bright ring on top: a bonus hit.
  bossHitWeak: D(
    2,
    0.1,
    1.05,
    (b) => {
      b.tone('sine', 190, 75, 0.2, 0.6, { sw: 0.5 })
      b.nz('bandpass', 1100, 500, 0.08, 0.4, { q: 1 })
      b.bell(88, 0.5, 0.35, { at: 0.02, ratio: 3, index: 0.8 })
      b.bell(95, 0.45, 0.2, { at: 0.07, ratio: 3, index: 0.6 })
      b.nz('highpass', 4500, 4500, 0.04, 0.2, { at: 0.02 })
    },
    { vary: 0.04, rev: 0.1 }
  ),
  // The final boss transforms: a dark swell, a burst and a shaking after-rumble.
  bossPhase: D(
    1,
    1,
    1,
    (b) => {
      b.tone('sawtooth', 70, 200, 0.5, 0.25, { a: 0.4, lp: [300, 1200], sw: 0.9 })
      b.tone('sine', 55, 120, 0.5, 0.4, { a: 0.4, sw: 0.9 })
      b.nz('bandpass', 300, 2500, 0.5, 0.3, { a: 0.4, q: 0.9 })
      b.tone('sine', 140, 45, 0.5, 0.9, { at: 0.5, sw: 0.4 })
      b.nz('bandpass', 2000, 500, 0.35, 0.6, { at: 0.5, a: 0.005, q: 0.8 })
      b.bell(55, 0.6, 0.25, { at: 0.5, ratio: 2.7, index: 2 })
      b.tone('sine', 60, 50, 0.4, 0.4, { at: 0.7, tr: [16, 0.6] })
    },
    { vary: 0.03, rev: 0.15, duck: [0.6, 1.2] }
  ),
  // The defeat: a long falling groan with a wobble, a final thump and a burst of stars.
  bossDown: D(
    1,
    1.5,
    1.2,
    (b) => {
      b.howl(0, 1, 80, 0.5)
      b.tone('sawtooth', 160, 45, 1.05, 0.2, { sw: 1, lp: [900, 250], vib: [5, 90] })
      b.tone('sine', 120, 40, 1.05, 0.45, { sw: 1, vib: [5, 60] })
      b.nz('lowpass', 800, 150, 0.8, 0.2, { a: 0.1, q: 0.6 })
      b.tone('sine', 100, 35, 0.35, 0.9, { at: 0.85, sw: 0.4 })
      b.nz('bandpass', 1600, 500, 0.2, 0.5, { at: 0.85, q: 0.8 })
      b.bells([79, 84, 88, 91], 0.09, 0.4, 0.14, { at: 0.9, ratio: 3, index: 0.7 })
    },
    { vary: 0.02, rev: 0.2, duck: [0.7, 1.8] }
  ),
  // One explosion of the defeat chain: round and cartoon.
  bossBoom: D(
    3,
    0.1,
    0.9,
    (b) => {
      b.tone('sine', 260, 110, 0.18, 0.7, { sw: 0.4 })
      b.nz('lowpass', 3200, 500, 0.2, 0.7, { a: 0.006, q: 0.6 })
      b.nz('bandpass', 2600, 1200, 0.07, 0.4, { q: 0.9 })
      b.tone('triangle', 700, 330, 0.12, 0.3, { at: 0.01 })
      b.tone('sine', 1500, 600, 0.06, 0.15, { at: 0.02 })
    },
    { vary: 0.12, rev: 0.06 }
  ),
  // A puff as a helper appears: a soft pop and a small rising squeak.
  minion: D(
    2,
    0.15,
    0.7,
    (b) => {
      b.nz('lowpass', 2200, 600, 0.12, 0.45, { a: 0.02, q: 0.6 })
      b.tone('sine', 300, 700, 0.1, 0.4, { sw: 0.6 })
      b.tone('triangle', 900, 1300, 0.06, 0.12, { at: 0.06, lp: [3500, 2000] })
    },
    { vary: 0.08, rev: 0.03 }
  ),
  // Mum shouting "Koraaa!": a comic scolding squawk, a vowel-y glide that rises and falls, twice as it scolds.
  momYell: D(
    1,
    1,
    0.9,
    (b) => {
      b.tone('sawtooth', 300, 420, 0.22, 0.4, { a: 0.02, hold: 0.2, sw: 0.4, bp: [900, 2.5], vib: [6, 40] })
      b.tone('sawtooth', 420, 280, 0.4, 0.4, { at: 0.35, a: 0.02, hold: 0.25, sw: 0.8, bp: [1100, 2.5], vib: [6, 50] })
      b.tone('triangle', 600, 840, 0.22, 0.14, { a: 0.02, hold: 0.2, sw: 0.4, lp: [3000, 2500] })
      b.nz('bandpass', 1500, 1500, 0.5, 0.06, { a: 0.05, q: 1.5 })
    },
    { vary: 0.03, rev: 0.06 }
  ),
  // Mum runs out of breath: a wheezy deflating sigh.
  momTired: D(
    1,
    1,
    0.7,
    (b) => {
      b.nz('bandpass', 1400, 600, 0.7, 0.4, { a: 0.1, q: 1.6, tr: [7, 0.3] })
      b.tone('sawtooth', 280, 130, 0.7, 0.2, { a: 0.1, bp: [800, 3], sw: 0.9, vib: [7, 60] })
      b.tone('sine', 560, 220, 0.5, 0.1, { at: 0.1, sw: 0.9 })
    },
    { vary: 0.04, rev: 0.05 }
  )
}
