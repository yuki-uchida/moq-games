import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Armour, gadgets and impacts. The play functions stay free of imports so their source hash covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // Energy shield deploying: rising shimmer plus a swelling hum.
  shieldUp: D(
    2,
    0.2,
    0.85,
    (b) => {
      b.tone('sawtooth', 110, 220, 0.5, 0.18, { a: 0.25, lp: [400, 1800], vib: [6, 20] })
      b.tone('sine', 600, 1800, 0.4, 0.2, { a: 0.2, sw: 0.8 })
      b.bell(84, 0.5, 0.12, { at: 0.3, ratio: 2, index: 1 })
      b.nz('bandpass', 1500, 5000, 0.4, 0.2, { a: 0.25, q: 2 })
    },
    { vary: 0.03, rev: 0.18 }
  ),
  // Shield absorbs a hit: glassy ping and an electric zap.
  shieldHit: D(
    3,
    0.06,
    0.85,
    (b) => {
      b.bell(91, 0.4, 0.3, { ratio: 3.5, index: 1.5 })
      b.tone('sawtooth', 3000, 400, 0.18, 0.14, { lp: [5000, 600], tr: [60, 0.7] })
      b.tone('sine', 1500, 1450, 0.3, 0.2, { at: 0.02, a: 0.01 })
      b.tone('sine', 220, 150, 0.15, 0.2)
    },
    { vary: 0.04, rev: 0.12 }
  ),
  // Hit on a hard shell: knock with a hollow ring.
  shellHit: D(
    3,
    0.06,
    0.9,
    (b) => {
      b.tone('triangle', 260, 180, 0.09, 0.6, { sw: 0.5 })
      b.tone('sine', 520, 500, 0.25, 0.22, { bp: [520, 6] })
      b.nz('bandpass', 1500, 900, 0.03, 0.4, { q: 2 })
      b.bell(72, 0.25, 0.1, { at: 0.005, ratio: 2.4, index: 1 })
    },
    { vary: 0.05, rev: 0.05 }
  ),
  // Porcupine quills: a volley of fast thin flicks.
  quill: D(
    2,
    0.15,
    0.8,
    (b) => {
      for (let i = 0; i < 5; i++) {
        const at = i * 0.035 + b.rnd() * 0.012
        b.tone('sine', 3200 + b.rnd() * 1200, 1400, 0.05, 0.14, { at })
        b.nz('highpass', 5500, 5500, 0.02, 0.12, { at })
      }
      b.nz('bandpass', 2500, 5000, 0.2, 0.15, { q: 1.5 })
    },
    { vary: 0.05, rev: 0.05 }
  ),
  // Jelly bubble burst: wet pop with a squelch.
  jellyPop: D(
    3,
    0.08,
    0.85,
    (b) => {
      b.tone('sine', 700, 180, 0.08, 0.5, { sw: 0.4 })
      b.nz('bandpass', 1200, 400, 0.12, 0.35, { q: 4, tr: [30, 0.7] })
      b.tone('sine', 300, 120, 0.15, 0.2, { at: 0.04, vib: [25, 300] })
    },
    { vary: 0.07, rev: 0.05 }
  ),
  // Bouncy pad placed: springy boing and a thunk.
  frogPlace: D(
    2,
    0.15,
    0.85,
    (b) => {
      b.tone('sine', 170, 100, 0.08, 0.5, { sw: 0.5 })
      b.tone('triangle', 350, 1100, 0.2, 0.3, { sw: 0.6, vib: [22, 160], at: 0.03 })
      b.tone('sine', 700, 350, 0.14, 0.15, { at: 0.2 })
      b.nz('bandpass', 2000, 1000, 0.04, 0.2, { q: 1.5 })
    },
    { vary: 0.05, rev: 0.05 }
  ),
  // Pad launches the player: a big boing and a whoosh upward.
  frogLaunch: D(
    2,
    0.2,
    0.95,
    (b) => {
      b.tone('sine', 180, 900, 0.35, 0.4, { sw: 0.8, vib: [14, 180] })
      b.tone('triangle', 360, 1500, 0.3, 0.2, { sw: 0.8, vib: [14, 180] })
      b.nz('bandpass', 400, 3500, 0.4, 0.4, { a: 0.12, q: 0.9 })
      b.tone('sine', 120, 60, 0.1, 0.5, { sw: 0.5 })
    },
    { vary: 0.04, rev: 0.12 }
  ),
  // Grapple fired: sharp thwip and a short zip.
  geckoFire: D(
    2,
    0.15,
    0.85,
    (b) => {
      b.tone('sawtooth', 1800, 400, 0.06, 0.18, { lp: [5000, 800] })
      b.nz('bandpass', 3000, 7000, 0.12, 0.3, { a: 0.02, q: 2.5 })
      b.tone('sine', 900, 2500, 0.1, 0.18, { at: 0.03 })
    },
    { vary: 0.04, rev: 0.05 }
  ),
  // Hook sticks: metallic thock with a tiny ring.
  geckoAttach: D(
    2,
    0.15,
    0.9,
    (b) => {
      b.tone('triangle', 200, 110, 0.07, 0.6, { sw: 0.5 })
      b.nz('bandpass', 2200, 1200, 0.025, 0.4, { q: 2 })
      b.bell(79, 0.3, 0.14, { at: 0.01, ratio: 2.76, index: 2 })
    },
    { vary: 0.04, rev: 0.06 }
  ),
  // Glider unfolds: fabric snap and rushing air.
  glideOpen: D(
    1,
    0.4,
    0.85,
    (b) => {
      b.nz('highpass', 3000, 3000, 0.03, 0.45)
      b.nz('bandpass', 600, 2500, 0.4, 0.35, { a: 0.1, q: 0.7 })
      b.nz('bandpass', 1500, 900, 0.3, 0.2, { at: 0.06, q: 1.2, tr: [24, 0.8] })
      b.tone('triangle', 180, 120, 0.1, 0.25)
    },
    { vary: 0.05, rev: 0.1 }
  ),
  // Leaf cloak on: soft rustle and a rising shimmer.
  leafOn: D(
    1,
    0.3,
    0.7,
    (b) => {
      b.nz('bandpass', 4500, 3500, 0.3, 0.3, { a: 0.05, q: 0.8, tr: [28, 0.9] })
      b.tone('sine', 500, 1500, 0.4, 0.15, { a: 0.1, sw: 0.9, vib: [7, 40] })
      b.bell(91, 0.4, 0.08, { at: 0.2, ratio: 3, index: 0.8 })
    },
    { vary: 0.03, rev: 0.15 }
  ),
  // Leaf cloak off: rustle and a falling shimmer.
  leafOff: D(
    1,
    0.3,
    0.7,
    (b) => {
      b.nz('bandpass', 3500, 4500, 0.3, 0.3, { a: 0.1, q: 0.8, tr: [22, 0.9] })
      b.tone('sine', 1500, 450, 0.4, 0.15, { a: 0.03, sw: 0.9, vib: [7, 40] })
      b.bell(79, 0.35, 0.08, { ratio: 3, index: 0.8 })
    },
    { vary: 0.03, rev: 0.15 }
  ),
  // Sonar: a clean round ping with a faint echo.
  sonar: D(
    1,
    0.4,
    0.85,
    (b) => {
      b.tone('sine', 1200, 1150, 0.5, 0.45, { a: 0.008 })
      b.tone('sine', 2400, 2300, 0.2, 0.08)
      b.tone('sine', 1200, 1150, 0.4, 0.15, { at: 0.22, a: 0.01 })
    },
    { vary: 0.02, rev: 0.25 }
  ),
  // Ink grenade lobbed: soft whoosh.
  inkThrow: D(
    2,
    0.2,
    0.65,
    (b) => {
      b.nz('bandpass', 500, 1600, 0.3, 0.4, { a: 0.12, q: 0.8 })
      b.tone('sine', 120, 90, 0.1, 0.2, { a: 0.01 })
    },
    { vary: 0.05, rev: 0.05 }
  ),
  // Ink burst: wet splat and a hiss cloud.
  inkBurst: D(
    2,
    0.15,
    0.9,
    (b) => {
      b.nz('lowpass', 1800, 300, 0.12, 0.6, { q: 1.5 })
      b.tone('sine', 250, 70, 0.14, 0.5, { sw: 0.5 })
      b.nz('bandpass', 2600, 1500, 0.6, 0.3, { at: 0.05, a: 0.08, q: 0.6 })
      b.nz('bandpass', 900, 500, 0.15, 0.25, { at: 0.02, q: 4, tr: [32, 0.8] })
    },
    { vary: 0.06, rev: 0.12 }
  ),
  // Pigeon drone: wing flaps and a cooing blip.
  pigeon: D(
    1,
    0.4,
    0.8,
    (b) => {
      for (let i = 0; i < 5; i++) b.nz('bandpass', 900, 500, 0.05, 0.3, { at: i * 0.055, q: 1, a: 0.01 })
      b.tone('sine', 380, 300, 0.12, 0.3, { at: 0.28, a: 0.02, vib: [30, 60], bp: [450, 3] })
      b.tone('sine', 330, 280, 0.16, 0.3, { at: 0.42, a: 0.02, vib: [28, 60], bp: [400, 3] })
    },
    { vary: 0.05, rev: 0.08 }
  ),
  // Hermit turret deploy: mechanical unfold clunks and a servo.
  hermitDeploy: D(
    1,
    0.4,
    0.9,
    (b) => {
      b.tone('triangle', 150, 80, 0.08, 0.6, { sw: 0.5 })
      b.tone('sawtooth', 200, 520, 0.3, 0.14, { at: 0.08, lp: [900, 1500], tr: [40, 0.5] })
      b.tone('triangle', 130, 70, 0.1, 0.6, { at: 0.26, sw: 0.5 })
      b.nz('bandpass', 2000, 1200, 0.03, 0.35, { at: 0.26, q: 2 })
      b.ticks(4, 0.1, 0.045, 1800, 0.18)
    },
    { vary: 0.04, rev: 0.08 }
  ),
  // Turret hit: dull metal clang.
  hermitHit: D(
    3,
    0.06,
    0.9,
    (b) => {
      b.bell(60, 0.3, 0.3, { ratio: 2.3, index: 2.5 })
      b.tone('triangle', 170, 120, 0.08, 0.5, { sw: 0.5 })
      b.nz('bandpass', 1100, 700, 0.04, 0.4, { q: 1.5 })
    },
    { vary: 0.05, rev: 0.05 }
  ),
  // Turret destroyed: crunchy collapse and sparks.
  hermitBreak: D(
    1,
    0.3,
    1,
    (b) => {
      b.tone('sine', 110, 45, 0.3, 0.7, { sw: 0.4 })
      b.nz('lowpass', 2500, 500, 0.35, 0.6, { q: 1 })
      b.bell(58, 0.4, 0.2, { ratio: 2.3, index: 3 })
      b.ticks(9, 0.05, 0.04, 2800, 0.3, 0.02, 0.8)
      b.nz('highpass', 6000, 6000, 0.25, 0.12, { at: 0.05 })
    },
    { vary: 0.05, rev: 0.1 }
  ),
  // Honey trap planted: sticky squelch and a soft thump.
  honeyPlant: D(
    2,
    0.2,
    0.8,
    (b) => {
      b.tone('sine', 85, 55, 0.14, 0.6, { sw: 0.5 })
      b.tone('sine', 160, 90, 0.28, 0.3, { at: 0.03, vib: [24, 500], lp: [500, 250] })
      b.nz('bandpass', 600, 250, 0.3, 0.4, { at: 0.03, q: 6, tr: [20, 0.9] })
    },
    { vary: 0.05, rev: 0.05 }
  ),
  // Heal: gentle rising chime sparkle.
  heal: D(
    1,
    0.3,
    0.75,
    (b) => {
      b.bells([76, 79, 83, 88], 0.09, 0.4, 0.2, { ratio: 3, index: 0.7 })
      b.sparkle(5, 0.2, 0.3, 88, 98, 0.06)
      b.tone('sine', 660, 1320, 0.5, 0.06, { a: 0.1 })
    },
    { vary: 0.02, rev: 0.22 }
  ),

  // Soft thump on fur.
  hitFur: D(
    4,
    0.03,
    0.85,
    (b) => {
      b.tone('sine', 150, 70, 0.1, 0.7, { sw: 0.5 })
      b.nz('lowpass', 900, 300, 0.08, 0.35)
    },
    { vary: 0.07, rev: 0.02 }
  ),
  // Dry crunchy crack of insect shell.
  hitChitin: D(
    4,
    0.03,
    0.85,
    (b) => {
      b.nz('bandpass', 3500, 1800, 0.05, 0.5, { q: 1.2 })
      b.ticks(3, 0, 0.012, 2800, 0.3, 0.015, 0.6)
      b.tone('triangle', 240, 110, 0.07, 0.4, { sw: 0.5 })
    },
    { vary: 0.07, rev: 0.02 }
  ),
  // Bright metallic clank for hitting machines.
  hitMetal: D(
    4,
    0.03,
    0.85,
    (b) => {
      b.bell(77, 0.16, 0.26, { ratio: 2.76, index: 3 })
      b.nz('bandpass', 2500, 1500, 0.025, 0.4, { q: 2 })
      b.tone('triangle', 420, 120, 0.06, 0.5, { sw: 0.5 })
      b.tone('square', 900, 700, 0.03, 0.1, { at: 0.01 })
    },
    { vary: 0.06, rev: 0.03 }
  ),
  // Sharper headshot thock with a high accent.
  hitHead: D(
    4,
    0.03,
    0.95,
    (b) => {
      b.tone('triangle', 420, 190, 0.07, 0.65, { sw: 0.4 })
      b.nz('bandpass', 2400, 1400, 0.03, 0.45, { q: 2 })
      b.tone('sine', 2600, 2200, 0.1, 0.15, { at: 0.005 })
    },
    { vary: 0.05, rev: 0.03 }
  ),
  // Weak-point hit: crisp crystalline crack plus a low thump.
  hitWeak: D(
    3,
    0.04,
    1,
    (b) => {
      b.tone('sine', 120, 55, 0.09, 0.7, { sw: 0.4 })
      b.nz('highpass', 4500, 4500, 0.04, 0.4)
      b.bell(93, 0.1, 0.2, { ratio: 3.5, index: 1.5 })
      b.bell(88, 0.08, 0.1, { at: 0.02, ratio: 2.9, index: 1.2 })
    },
    { vary: 0.04, rev: 0 }
  ),
  // Bullet on concrete: dry chip and puff.
  impactConcrete: D(
    4,
    0.04,
    0.8,
    (b) => {
      b.nz('bandpass', 3000, 1500, 0.04, 0.4, { q: 1.2 })
      b.nz('lowpass', 1200, 400, 0.12, 0.3, { a: 0.01 })
      b.ticks(3, 0.02, 0.02, 2200, 0.2, 0.02, 0.6)
    },
    { vary: 0.07, rev: 0.04 }
  ),
  // Ricochet clang with a short whine.
  impactMetal: D(
    4,
    0.04,
    0.85,
    (b) => {
      b.bell(86, 0.25, 0.25, { ratio: 2.76, index: 2 })
      b.nz('bandpass', 3500, 2000, 0.025, 0.3, { q: 2 })
      b.tone('sine', 3800, 1500, 0.2, 0.1, { at: 0.02, sw: 0.8 })
    },
    { vary: 0.07, rev: 0.06 }
  ),
  // Woody tock with a splinter.
  impactWood: D(
    4,
    0.04,
    0.85,
    (b) => {
      b.tone('triangle', 330, 220, 0.07, 0.6, { sw: 0.5 })
      b.tone('sine', 700, 480, 0.05, 0.2)
      b.ticks(3, 0.02, 0.018, 2300, 0.25, 0.02, 0.6)
      b.nz('bandpass', 900, 500, 0.06, 0.25, { q: 1 })
    },
    { vary: 0.07, rev: 0.03 }
  ),
  // Glassy shatter chime.
  impactCrystal: D(
    4,
    0.04,
    0.8,
    (b) => {
      b.nz('highpass', 6000, 6000, 0.06, 0.3)
      b.bells([96, 100, 95], 0.025, 0.3, 0.14, { ratio: 3.5, index: 1.2 })
      b.ticks(5, 0.02, 0.025, 4500, 0.12, 0.015, 0.7)
    },
    { vary: 0.06, rev: 0.1 }
  ),
  // Earth thud with dirt hiss.
  impactGround: D(
    4,
    0.04,
    0.9,
    (b) => {
      b.tone('sine', 110, 50, 0.14, 0.7, { sw: 0.4 })
      b.nz('lowpass', 1500, 300, 0.16, 0.45, { a: 0.008 })
      b.nz('highpass', 4000, 3000, 0.15, 0.1, { at: 0.03 })
    },
    { vary: 0.07, rev: 0.03 }
  ),
  // Small pop-boom.
  explosionSmall: D(
    3,
    0.05,
    1,
    (b) => {
      b.tone('sine', 240, 70, 0.14, 0.7, { sw: 0.4 })
      b.nz('bandpass', 2500, 700, 0.2, 0.7, { q: 0.6 })
      b.nz('highpass', 3500, 3500, 0.04, 0.25)
      b.tone('triangle', 500, 150, 0.1, 0.3, { sw: 0.4 })
    },
    { vary: 0.06, rev: 0.1 }
  ),
  // Normal explosion: boom, crackle and debris.
  explosion: D(
    3,
    0.08,
    1.15,
    (b) => {
      b.tone('sine', 140, 50, 0.4, 1, { sw: 0.3 })
      b.tone('triangle', 200, 70, 0.25, 0.35, { sw: 0.4 })
      b.nz('bandpass', 3500, 500, 0.4, 0.8, { q: 0.5 })
      b.nz('highpass', 4000, 4000, 0.06, 0.25)
      b.ticks(16, 0.06, 0.03, 2200, 0.45, 0.03, 0.9)
      b.nz('bandpass', 1600, 700, 0.3, 0.25, { at: 0.1, q: 0.7 })
    },
    { vary: 0.05, rev: 0.2 }
  ),
  // Big explosion: huge deep boom and a long rolling rumble.
  explosionBig: D(
    2,
    0.2,
    1.3,
    (b) => {
      b.tone('sine', 70, 24, 0.85, 1.1, { sw: 0.35, a: 0.01 })
      b.tone('sine', 48, 28, 0.9, 0.5, { at: 0.05, a: 0.06 })
      b.nz('lowpass', 1200, 100, 0.8, 0.9, { q: 0.7, a: 0.01 })
      b.nz('lowpass', 400, 70, 0.8, 0.55, { at: 0.2, a: 0.25, tr: [9, 0.6] })
      b.nz('highpass', 3000, 3000, 0.1, 0.2)
    },
    { vary: 0.04, rev: 0.28, duck: [0.45, 1.4] }
  )
}
