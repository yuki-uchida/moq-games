import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Foes: spawns, creature voices, machine sounds and boss sounds. Creatures are organic (chitters, squeals, wet
 * noise), machines electronic / mechanical. Cute but threatening, never shrill. The play functions stay free of
 * imports so their source hash covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // Creatures bursting out of the ground: dirt crumble plus scuttling legs.
  foeSpawnBurrow: D(
    3,
    0.12,
    0.8,
    (b) => {
      b.nz('lowpass', 900, 250, 0.35, 0.5, { a: 0.02, q: 0.7, tr: [26, 0.6] })
      b.tone('sine', 120, 60, 0.2, 0.45, { sw: 0.5 })
      b.nz('bandpass', 1200, 500, 0.12, 0.3, { at: 0.02, q: 0.9 })
      b.ticks(7, 0.12, 0.04, 2600, 0.22, 0.02, 0.8)
    },
    { vary: 0.07, rev: 0.06 }
  ),
  // A pod falling from above: a whistle down, then a heavy thud.
  foeSpawnDrop: D(
    3,
    0.15,
    0.9,
    (b) => {
      b.tone('sine', 1800, 420, 0.4, 0.22, { sw: 0.95 })
      b.nz('bandpass', 2600, 700, 0.38, 0.14, { a: 0.1, q: 1.5 })
      b.tone('sine', 110, 42, 0.3, 0.95, { at: 0.4, sw: 0.4 })
      b.nz('lowpass', 600, 150, 0.25, 0.45, { at: 0.4, q: 0.7 })
      b.ticks(3, 0.42, 0.04, 1800, 0.2, 0.03, 0.6)
    },
    { vary: 0.05, rev: 0.1 }
  ),
  // Machine teleport-in: an electronic phase sweep resolving into a zap.
  foeSpawnWarp: D(
    3,
    0.12,
    0.8,
    (b) => {
      b.tone('square', 220, 1400, 0.3, 0.12, { a: 0.08, sw: 0.9, lp: [1200, 3000], vib: [30, 200] })
      b.tone('sine', 400, 1800, 0.3, 0.2, { a: 0.08, sw: 0.9, tr: [24, 0.5] })
      b.tone('sawtooth', 1500, 160, 0.14, 0.24, { at: 0.3, lp: [3500, 600] })
      b.nz('bandpass', 3000, 900, 0.1, 0.22, { at: 0.3, q: 1.2 })
    },
    { vary: 0.04, rev: 0.1 }
  ),
  // Small bug chitter: rapid clicks.
  tsubuteChitter: D(
    3,
    0.1,
    0.55,
    (b) => {
      for (let i = 0; i < 6; i++) {
        const f = 2200 + b.rnd() * 900
        b.tone('square', f, f * 0.7, 0.03, 0.16, { at: i * 0.045, lp: [3000, 1500], bp: [f, 2] })
        b.nz('bandpass', 3000, 1500, 0.02, 0.12, { at: i * 0.045, q: 2 })
      }
    },
    { vary: 0.07, rev: 0.02 }
  ),
  // A small snap with a wet crunch.
  tsubuteBite: D(
    4,
    0.08,
    0.65,
    (b) => {
      b.nz('highpass', 3000, 3000, 0.02, 0.3)
      b.nz('bandpass', 1400, 500, 0.1, 0.5, { q: 1.6, tr: [60, 0.6] })
      b.tone('triangle', 520, 190, 0.09, 0.4, { sw: 0.5, lp: [1800, 600] })
      b.nz('lowpass', 500, 200, 0.12, 0.25, { at: 0.03, q: 0.8 })
    },
    { vary: 0.07, rev: 0.03 }
  ),
  // A hop whoosh with a squeak.
  tsubuteLeap: D(
    3,
    0.12,
    0.6,
    (b) => {
      b.nz('bandpass', 500, 2200, 0.18, 0.35, { a: 0.07, q: 0.9 })
      b.tone('sine', 700, 1500, 0.1, 0.3, { at: 0.02, sw: 0.8, vib: [28, 90] })
      b.tone('triangle', 180, 120, 0.1, 0.2, { sw: 0.5 })
    },
    { vary: 0.07, rev: 0.03 }
  ),
  // Needle shooter spit: a sharp pffft and a thin whistle.
  hariganeSpit: D(
    3,
    0.1,
    0.7,
    (b) => {
      b.nz('bandpass', 3200, 1600, 0.09, 0.4, { q: 1.1 })
      b.nz('highpass', 2000, 2000, 0.03, 0.2)
      b.tone('sine', 2500, 4200, 0.2, 0.1, { at: 0.03, sw: 0.8 })
      b.tone('triangle', 300, 160, 0.08, 0.3, { sw: 0.5 })
    },
    { vary: 0.05, rev: 0.03 }
  ),
  // Acid landing: a wet splash with a sizzling hiss.
  acidSplash: D(
    3,
    0.1,
    0.75,
    (b) => {
      b.nz('bandpass', 1800, 600, 0.14, 0.5, { q: 0.9, tr: [40, 0.5] })
      b.tone('sine', 380, 120, 0.12, 0.35, { sw: 0.5 })
      b.nz('bandpass', 2600, 1800, 0.3, 0.3, { at: 0.05, a: 0.05, q: 0.8 })
      b.ticks(8, 0.08, 0.035, 2200, 0.15, 0.015, 1)
    },
    { vary: 0.06, rev: 0.05 }
  ),
  // Big beetle roar: a low growl on formants with a wobble.
  oagosRoar: D(
    1,
    0.5,
    0.95,
    (b) => {
      b.howl(0, 0.75, 105, 0.5)
      b.tone('sawtooth', 90, 70, 0.5, 0.3, { a: 0.08, lp: [900, 350], tr: [30, 0.85] })
      b.tone('sine', 75, 55, 0.5, 0.35, { a: 0.08 })
      b.nz('bandpass', 700, 300, 0.5, 0.2, { a: 0.1, q: 1.5, tr: [34, 0.7] })
    },
    { vary: 0.04, rev: 0.15 }
  ),
  // Heavy charge: a rolling stomp rumble.
  oagosCharge: D(
    1,
    0.4,
    0.9,
    (b) => {
      for (let i = 0; i < 5; i++) b.tone('sine', 95 - i * 4, 48, 0.13, 0.7, { at: i * 0.1, sw: 0.5 })
      b.nz('lowpass', 500, 200, 0.7, 0.45, { a: 0.1, q: 0.7, tr: [11, 0.7] })
      b.nz('bandpass', 400, 1200, 0.5, 0.2, { a: 0.2, q: 0.8 })
    },
    { vary: 0.05, rev: 0.06 }
  ),
  // Flying bug dive: a descending buzzing whine.
  kagerouDive: D(
    2,
    0.2,
    0.65,
    (b) => {
      b.tone('sawtooth', 1100, 260, 0.55, 0.22, { sw: 0.95, lp: [3000, 700], tr: [58, 0.7] })
      b.tone('square', 560, 130, 0.55, 0.1, { sw: 0.95, lp: [1800, 500], tr: [58, 0.7] })
      b.nz('bandpass', 2200, 600, 0.5, 0.15, { a: 0.1, q: 1.4 })
    },
    { vary: 0.05, rev: 0.05 }
  ),
  // Creature death: a short rattling squeal falling in pitch, then a crunch.
  creatureDie: D(
    3,
    0.1,
    0.8,
    (b) => {
      b.tone('sawtooth', 1100, 220, 0.3, 0.25, { sw: 0.9, lp: [3000, 700], tr: [38, 0.7], vib: [14, 80] })
      b.tone('triangle', 550, 120, 0.3, 0.2, { sw: 0.9 })
      b.nz('bandpass', 900, 350, 0.1, 0.4, { at: 0.2, q: 1.3, tr: [50, 0.6] })
      b.ticks(5, 0.18, 0.03, 1800, 0.2, 0.02, 0.6)
    },
    { vary: 0.07, rev: 0.05 }
  ),
  // Laser beam shot: a bright zap with falling pitch.
  mitsumeLaser: D(
    4,
    0.1,
    0.75,
    (b) => {
      b.tone('sawtooth', 3600, 700, 0.18, 0.26, { sw: 0.8, lp: [6000, 1500] })
      b.tone('square', 1800, 350, 0.18, 0.1, { sw: 0.8, lp: [4000, 1000] })
      b.nz('highpass', 3500, 3500, 0.03, 0.2)
      b.tone('sine', 200, 120, 0.1, 0.25, { sw: 0.5 })
    },
    { vary: 0.04, rev: 0.06 }
  ),
  // Tall walker step: servo thunk and metal clank.
  ashinagaStep: D(
    3,
    0.2,
    0.7,
    (b) => {
      b.tone('sine', 100, 50, 0.16, 0.7, { sw: 0.5 })
      b.tone('sawtooth', 220, 150, 0.1, 0.12, { at: 0.02, lp: [800, 400] })
      b.bell(66, 0.25, 0.14, { at: 0.07, ratio: 4.1, index: 1.2 })
      b.nz('bandpass', 2200, 1200, 0.05, 0.3, { at: 0.07, q: 3 })
      b.nz('lowpass', 400, 150, 0.14, 0.3)
    },
    { vary: 0.06, rev: 0.06 }
  ),
  // Mortar launch: a hollow thump and a rising whistle.
  ashinagaMortar: D(
    2,
    0.25,
    0.85,
    (b) => {
      b.tone('sine', 150, 55, 0.2, 0.85, { sw: 0.4 })
      b.nz('bandpass', 500, 200, 0.18, 0.35, { q: 4 })
      b.tone('sine', 500, 2000, 0.4, 0.15, { at: 0.06, sw: 0.95 })
      b.nz('bandpass', 800, 3000, 0.4, 0.12, { at: 0.06, a: 0.15, q: 1.5 })
    },
    { vary: 0.05, rev: 0.1 }
  ),
  // Rolling bomb warning: a fast urgent double beep.
  korogashiBeep: D(
    2,
    0.2,
    0.6,
    (b) => {
      b.tone('square', 1560, 1560, 0.07, 0.2, { lp: [3500], hold: 0.02 })
      b.tone('square', 1560, 1560, 0.07, 0.2, { at: 0.12, lp: [3500], hold: 0.02 })
      b.tone('sine', 780, 780, 0.07, 0.2, { hold: 0.02 })
      b.tone('sine', 780, 780, 0.07, 0.2, { at: 0.12, hold: 0.02 })
    },
    { vary: 0.03, rev: 0.03 }
  ),
  // Shield dome up: a low hum swell and a glassy ping.
  tategamiDome: D(
    2,
    0.3,
    0.7,
    (b) => {
      b.tone('sine', 90, 140, 0.4, 0.5, { a: 0.2, sw: 0.8, tr: [10, 0.3] })
      b.tone('triangle', 180, 280, 0.4, 0.2, { a: 0.2, sw: 0.8, lp: [800, 1500] })
      b.bell(93, 0.4, 0.18, { at: 0.2, ratio: 3.1, index: 0.6 })
      b.bell(100, 0.3, 0.1, { at: 0.24, ratio: 3.1, index: 0.5 })
      b.nz('bandpass', 600, 2400, 0.3, 0.1, { a: 0.18, q: 2 })
    },
    { vary: 0.03, rev: 0.2 }
  ),
  // Machine death: an electrical fizzle, a clunk and a metal rattle.
  machineDie: D(
    3,
    0.15,
    0.85,
    (b) => {
      b.nz('highpass', 4000, 2500, 0.2, 0.3, { tr: [50, 0.9] })
      b.tone('sawtooth', 900, 120, 0.3, 0.18, { sw: 0.9, lp: [2500, 400], tr: [30, 0.8] })
      b.tone('sine', 120, 55, 0.2, 0.7, { at: 0.2, sw: 0.4 })
      b.nz('lowpass', 500, 200, 0.15, 0.3, { at: 0.2 })
      for (let i = 0; i < 5; i++) b.bell(60 + Math.floor(b.rnd() * 10), 0.12, 0.08, { at: 0.26 + i * 0.05, ratio: 4.3 })
    },
    { vary: 0.06, rev: 0.07 }
  ),
  // Huge boss roar: a deep rumbling body with formant motion.
  bossRoar: D(
    1,
    1,
    1.05,
    (b) => {
      b.howl(0, 1.1, 48, 0.55)
      b.tone('sine', 40, 30, 0.9, 0.8, { a: 0.2, tr: [9, 0.5] })
      b.tone('sawtooth', 52, 38, 0.9, 0.3, { a: 0.2, lp: [350, 160], vib: [5, 60] })
      b.nz('lowpass', 800, 200, 0.85, 0.3, { a: 0.25, q: 0.7, tr: [16, 0.6] })
    },
    { vary: 0.03, rev: 0.25, duck: [0.45, 1.8] }
  ),
  // Huge ground slam: a deep boom, cracking and rubble.
  bossSlam: D(
    1,
    0.6,
    1.25,
    (b) => {
      // Wind-up creak, then a hard crack and boom, with rubble clattering down afterwards.
      b.nz('bandpass', 500, 1400, 0.12, 0.35, { a: 0.1, q: 3 })
      b.tone('sine', 75, 28, 0.55, 1, { at: 0.12, sw: 0.4 })
      b.nz('bandpass', 2800, 1000, 0.14, 0.8, { at: 0.12, q: 1.3 })
      b.bell(56, 0.35, 0.35, { at: 0.12, ratio: 2.4, index: 2 })
      b.nz('lowpass', 700, 150, 0.4, 0.4, { at: 0.12, q: 0.6, tr: [14, 0.4] })
      b.ticks(16, 0.3, 0.035, 1500, 0.35, 0.04, 0.9)
      b.bell(48, 0.2, 0.15, { at: 0.55, ratio: 3.3, index: 1.6 })
    },
    { vary: 0.03, rev: 0.2, duck: [0.35, 0.8] }
  ),
  // Acid rain: droplets pattering in a rising then falling hiss shower.
  bossAcidRain: D(
    1,
    0.5,
    0.85,
    (b) => {
      b.nz('bandpass', 2400, 3200, 0.55, 0.3, { a: 0.25, q: 0.7 })
      b.nz('bandpass', 1500, 2000, 0.5, 0.25, { a: 0.2, q: 0.8, tr: [30, 0.5] })
      b.ticks(20, 0.05, 0.03, 1800, 0.22, 0.02, 1)
      b.tone('sine', 140, 100, 0.5, 0.25, { a: 0.2 })
    },
    { vary: 0.05, rev: 0.12 }
  ),
  // Dark summoning: a low swelling drone with eerie rising tones and sparkles.
  bossSummon: D(
    1,
    0.6,
    0.85,
    (b) => {
      b.tone('sawtooth', 60, 90, 0.6, 0.3, { a: 0.3, lp: [300, 700], vib: [5, 40] })
      b.tone('sine', 120, 180, 0.6, 0.3, { a: 0.3 })
      b.tone('sine', 400, 1200, 0.5, 0.14, { at: 0.1, a: 0.25, sw: 0.9, vib: [7, 200] })
      b.tone('triangle', 600, 1800, 0.5, 0.08, { at: 0.15, a: 0.25, sw: 0.9, vib: [6, 250] })
      b.sparkle(6, 0.3, 0.35, 84, 100, 0.07)
    },
    { vary: 0.03, rev: 0.25 }
  ),
  // Armour opening to expose the core: mechanical unlocking clanks and a pulsing glow.
  bossCoreOpen: D(
    1,
    0.6,
    0.9,
    (b) => {
      for (let i = 0; i < 3; i++) {
        b.tone('sine', 110, 55, 0.12, 0.6, { at: i * 0.16, sw: 0.4 })
        b.bell(60 + i * 3, 0.2, 0.15, { at: i * 0.16 + 0.02, ratio: 4.2, index: 1.5 })
        b.nz('bandpass', 2000, 900, 0.05, 0.3, { at: i * 0.16, q: 2.5 })
      }
      b.tone('sine', 220, 330, 0.45, 0.3, { at: 0.25, a: 0.25, sw: 0.9, tr: [8, 0.6] })
      b.tone('triangle', 440, 660, 0.4, 0.12, { at: 0.28, a: 0.2, tr: [8, 0.6] })
    },
    { vary: 0.03, rev: 0.15 }
  ),
  // Missile launch: ignition whoosh and a rising whine.
  bossMissile: D(
    2,
    0.3,
    0.85,
    (b) => {
      b.nz('lowpass', 800, 3000, 0.45, 0.5, { a: 0.08, q: 0.8 })
      b.nz('bandpass', 600, 1800, 0.4, 0.3, { q: 0.7 })
      b.tone('sawtooth', 400, 1600, 0.45, 0.12, { sw: 0.9, lp: [1200, 3500] })
      b.tone('sine', 90, 60, 0.25, 0.5, { sw: 0.5 })
    },
    { vary: 0.05, rev: 0.12 }
  ),
  // Big charged laser: a charging whine, then a thick sustained beam burst.
  bossLaser: D(
    1,
    0.6,
    0.95,
    (b) => {
      b.tone('sawtooth', 300, 2400, 0.3, 0.18, { a: 0.2, sw: 0.95, lp: [1500, 4000] })
      b.tone('sine', 150, 1200, 0.3, 0.2, { a: 0.2, sw: 0.95 })
      b.tone('sawtooth', 220, 180, 0.4, 0.35, { at: 0.3, a: 0.02, lp: [2500, 900], vib: [40, 40] })
      b.tone('square', 110, 90, 0.4, 0.25, { at: 0.3, a: 0.02, lp: [900, 400] })
      b.nz('bandpass', 2000, 800, 0.4, 0.3, { at: 0.3, a: 0.02, q: 0.8 })
    },
    { vary: 0.03, rev: 0.12, duck: [0.3, 0.8] }
  ),
  // Giant footstep: a deep thud and a rattle.
  bossStomp: D(
    2,
    0.3,
    1,
    (b) => {
      // Heavy heel thud, a softer toe thud a beat later, and a long rattle of loose plates in the mids.
      b.tone('sine', 115, 55, 0.22, 0.9, { sw: 0.4, a: 0.003 })
      b.nz('lowpass', 600, 200, 0.08, 0.4)
      b.tone('sine', 85, 48, 0.2, 0.55, { at: 0.15, sw: 0.4, a: 0.004 })
      b.nz('bandpass', 1100, 500, 0.35, 0.3, { at: 0.04, a: 0.05, q: 2, tr: [30, 0.8] })
      b.ticks(8, 0.2, 0.04, 2200, 0.25, 0.02, 0.8)
    },
    { vary: 0.05, rev: 0.1 }
  ),
  // A boss part breaking off: a heavy metallic crack and tumbling debris.
  bossPart: D(
    2,
    0.2,
    0.95,
    (b) => {
      b.nz('highpass', 3000, 3000, 0.03, 0.35)
      b.bell(55, 0.4, 0.2, { ratio: 4.3, index: 1.6 })
      b.tone('sine', 120, 50, 0.25, 0.65, { sw: 0.4 })
      b.nz('bandpass', 1500, 600, 0.15, 0.35, { q: 1.5 })
      for (let i = 0; i < 6; i++)
        b.bell(52 + Math.floor(b.rnd() * 14), 0.12, 0.07, { at: 0.12 + i * 0.06 + b.rnd() * 0.03, ratio: 4.1 })
    },
    { vary: 0.06, rev: 0.1 }
  ),
  // Boss defeated: a long chain of explosions, a collapsing rumble and a final deep boom.
  bossDown: D(
    1,
    2,
    1.3,
    (b) => {
      for (let i = 0; i < 6; i++) {
        const at = i * 0.12 + b.rnd() * 0.04
        b.tone('sine', 120 - i * 8, 40, 0.25, 0.55, { at, sw: 0.4 })
        b.nz('lowpass', 1500, 250, 0.2, 0.4, { at, q: 0.6 })
        b.nz('bandpass', 2200, 700, 0.08, 0.25, { at, q: 1 })
      }
      b.nz('lowpass', 500, 80, 0.7, 0.45, { at: 0.25, a: 0.3, q: 0.7, tr: [13, 0.6] })
      b.tone('sine', 70, 24, 0.5, 1, { at: 0.75, sw: 0.4 })
      b.nz('lowpass', 900, 100, 0.5, 0.55, { at: 0.75, q: 0.6 })
      b.ticks(10, 0.8, 0.04, 1500, 0.2, 0.03, 0.9)
    },
    { vary: 0.03, rev: 0.25, duck: [0.5, 2.0] }
  )
}
