import type { SfxName } from '../api'
import { D, type SfxDef } from '../sfx-builder'

/**
 * Match, objectives and interface: countdown, go, waveStart, waveClear, objectiveProgress, objectiveCaptured,
 * objectiveAlarm, objectiveDestroyed, cartMove, koFeed, scoreUp, lastSpurt, victory, defeat, radio, uiMove, uiSelect,
 * uiBack, uiError, uiEquip, uiUnequip, uiTab, uiReady, uiStart, typeBlip, titleHit. Pitched stingers in C major /
 * A minor; the play functions stay free of imports so their source hash covers the sound.
 */
export const defs: Partial<Record<SfxName, SfxDef>> = {
  // One beat of the 3-2-1: crisp pitched beep with a low thump.
  countdown: D(
    1,
    0.3,
    0.8,
    (b) => {
      b.tone('square', 880, 880, 0.09, 0.22, { lp: [3000, 1800], hold: 0.03 })
      b.tone('sine', 1760, 1760, 0.07, 0.12)
      b.tone('sine', 110, 55, 0.18, 0.7, { sw: 0.5 })
      b.nz('bandpass', 2000, 1200, 0.02, 0.15, { q: 2 })
    },
    { vary: 0.02, rev: 0.05 }
  ),
  // The GO! stab: bright rising brass-like chord plus a whoosh.
  go: D(
    1,
    0.5,
    1.0,
    (b) => {
      b.nz('bandpass', 400, 4000, 0.4, 0.28, { a: 0.18, q: 0.9 })
      for (const [f0, f1, g] of [
        [262, 392, 0.2],
        [330, 494, 0.16],
        [392, 587, 0.16]
      ]) {
        b.tone('sawtooth', f0, f1, 0.7, g, { at: 0.12, a: 0.03, sw: 0.25, lp: [1200, 3200], hold: 0.15 })
        b.tone('sawtooth', f0 * 1.005, f1 * 1.005, 0.7, g * 0.6, {
          at: 0.12,
          a: 0.03,
          sw: 0.25,
          lp: [1200, 3200],
          hold: 0.15
        })
      }
      b.bell(84, 0.5, 0.12, { at: 0.14 })
      b.tone('sine', 98, 65, 0.3, 0.5, { at: 0.12, sw: 0.5 })
    },
    { vary: 0.02, rev: 0.15, duck: [0.35, 0.8] }
  ),
  // Alarm-horn rise: two ascending brass blasts and a low drum hit.
  waveStart: D(
    1,
    0.6,
    1.05,
    (b) => {
      b.tone('sine', 90, 45, 0.4, 0.9, { sw: 0.4 })
      b.nz('lowpass', 600, 200, 0.2, 0.3)
      for (const [at, f] of [
        [0.05, 196],
        [0.42, 262]
      ]) {
        b.tone('sawtooth', f, f * 1.02, 0.4, 0.22, { at, a: 0.04, hold: 0.1, lp: [700, 1800] })
        b.tone('sawtooth', f * 1.5, f * 1.53, 0.4, 0.14, { at, a: 0.04, hold: 0.1, lp: [700, 1800] })
        b.tone('square', f / 2, f / 2, 0.4, 0.1, { at, a: 0.04, hold: 0.1, lp: [500, 900] })
      }
      b.tone('sine', 110, 55, 0.3, 0.7, { at: 0.42, sw: 0.4 })
    },
    { vary: 0.02, rev: 0.18, duck: [0.35, 1.0] }
  ),
  // Wave cleared: resolved rising bell arpeggio and soft brass.
  waveClear: D(
    1,
    0.8,
    0.95,
    (b) => {
      b.bells([72, 76, 79, 84, 88], 0.12, 0.5, 0.3, { ratio: 3, index: 1.2 })
      b.bell(96, 0.4, 0.12, { at: 0.5, ratio: 3, index: 0.8 })
      for (const m of [48, 55, 64, 67]) {
        const f = 440 * Math.pow(2, (m - 69) / 12)
        b.tone('sawtooth', f, f, 0.6, 0.09, { at: 0.48, a: 0.08, hold: 0.15, lp: [900, 1600] })
      }
      b.tone('sine', 130, 65, 0.3, 0.4, { sw: 0.4 })
    },
    { vary: 0.02, rev: 0.2, duck: [0.3, 1.2] }
  ),
  // Capture progress: soft rising tick.
  objectiveProgress: D(
    2,
    0.2,
    0.6,
    (b) => {
      b.tone('triangle', 660, 990, 0.1, 0.3, { sw: 0.6 })
      b.tone('sine', 1320, 1980, 0.08, 0.1, { sw: 0.6 })
      b.nz('bandpass', 3000, 3500, 0.015, 0.1, { q: 2 })
    },
    { vary: 0.03, rev: 0.06 }
  ),
  // Captured: rich major chord with a rising sweep.
  objectiveCaptured: D(
    1,
    0.8,
    1.0,
    (b) => {
      b.nz('bandpass', 300, 5000, 0.5, 0.2, { a: 0.3, q: 1 })
      for (const m of [60, 64, 67, 72]) {
        const f = 440 * Math.pow(2, (m - 69) / 12)
        b.tone('sawtooth', f, f, 0.9, 0.11, { at: 0.3, a: 0.03, hold: 0.2, lp: [1000, 2800] })
      }
      b.bells([84, 88, 91], 0.06, 0.8, 0.22, { at: 0.3 })
      b.tone('sine', 65, 45, 0.5, 0.7, { at: 0.3, sw: 0.4 })
    },
    { vary: 0.02, rev: 0.22, duck: [0.35, 1.2] }
  ),
  // Objective under attack: urgent two-tone alarm pulse.
  objectiveAlarm: D(
    1,
    0.9,
    0.9,
    (b) => {
      for (let i = 0; i < 4; i++) {
        const f = i % 2 ? 622 : 831
        b.tone('square', f, f, 0.12, 0.18, { at: i * 0.17, hold: 0.06, lp: [2200, 1400] })
        b.tone('sine', f / 2, f / 2, 0.12, 0.18, { at: i * 0.17, hold: 0.06 })
      }
      b.tone('sine', 80, 55, 0.2, 0.5, { sw: 0.4 })
    },
    { vary: 0.02, rev: 0.1 }
  ),
  // Objective lost: falling dissonant boom and descending tones.
  objectiveDestroyed: D(
    1,
    0.8,
    1.15,
    (b) => {
      // Falling dissonant minor-second drone with descending tones dominating over a modest boom.
      b.tone('sine', 110, 40, 0.5, 0.6, { sw: 0.5 })
      b.tone('sawtooth', 311, 130, 1.0, 0.22, { at: 0.05, sw: 0.9, lp: [1800, 300] })
      b.tone('sawtooth', 330, 138, 1.0, 0.2, { at: 0.05, sw: 0.9, lp: [1800, 300] })
      b.tone('triangle', 880, 440, 0.6, 0.2, { at: 0.2, sw: 0.9 })
      b.tone('triangle', 740, 370, 0.6, 0.2, { at: 0.4, sw: 0.9 })
      b.tone('triangle', 622, 311, 0.6, 0.2, { at: 0.6, sw: 0.9 })
    },
    { vary: 0.03, rev: 0.25, duck: [0.4, 1.0] }
  ),
  // A heavy cart starting to move: clunk and rumbling roll.
  cartMove: D(
    1,
    0.6,
    0.9,
    (b) => {
      b.tone('sine', 100, 50, 0.12, 0.8, { sw: 0.4 })
      b.nz('bandpass', 1500, 700, 0.03, 0.4, { q: 3 })
      b.bell(55, 0.15, 0.25, { ratio: 2.1, index: 3 })
      b.nz('lowpass', 250, 160, 0.5, 0.5, { at: 0.1, a: 0.12, tr: [14, 0.7] })
      b.tone('sawtooth', 55, 70, 0.5, 0.15, { at: 0.1, a: 0.15, lp: [200, 300], tr: [12, 0.8] })
      b.ticks(5, 0.2, 0.08, 900, 0.15)
    },
    { vary: 0.04, rev: 0.06 }
  ),
  // Kill-feed entry: short stylised tick-ping, quiet.
  koFeed: D(
    3,
    0.1,
    0.55,
    (b) => {
      b.nz('bandpass', 4000, 3000, 0.012, 0.15, { q: 2 })
      b.tone('triangle', 1175, 1175, 0.12, 0.2)
      b.tone('sine', 2349, 2349, 0.08, 0.08, { at: 0.03 })
    },
    { vary: 0.03, rev: 0.05 }
  ),
  // Points gained: quick bright coin-like ping.
  scoreUp: D(
    3,
    0.06,
    0.65,
    (b) => {
      b.tone('square', 1319, 1319, 0.05, 0.12, { lp: [4000, 3000] })
      b.tone('square', 1760, 1760, 0.22, 0.14, { at: 0.055, lp: [4000, 2500] })
      b.tone('sine', 3520, 3520, 0.15, 0.08, { at: 0.055 })
    },
    { vary: 0.03, rev: 0.05 }
  ),
  // Final-phase call: urgent rising fanfare over a drum roll.
  lastSpurt: D(
    1,
    1.0,
    1.0,
    (b) => {
      for (let i = 0; i < 14; i++) b.tone('sine', 140, 80, 0.07, 0.25 + i * 0.015, { at: i * 0.06, sw: 0.5 })
      for (let i = 0; i < 14; i++) b.nz('bandpass', 1200, 800, 0.04, 0.12 + i * 0.01, { at: i * 0.06 + 0.03, q: 1 })
      b.run('sawtooth', [57, 60, 64, 69], 0.14, 0.2, 0.17, { at: 0.1, a: 0.02, lp: [900, 2200] })
      for (const m of [64, 69, 72, 76]) {
        const f = 440 * Math.pow(2, (m - 69) / 12)
        b.tone('sawtooth', f, f, 0.6, 0.1, { at: 0.75, a: 0.03, hold: 0.2, lp: [1100, 2800] })
      }
      b.bell(88, 0.6, 0.2, { at: 0.75 })
      b.tone('sine', 110, 55, 0.4, 0.8, { at: 0.75, sw: 0.4 })
    },
    { vary: 0.02, rev: 0.15, duck: [0.4, 1.4] }
  ),
  // Victory: triumphant brass-and-bell fanfare in C major.
  victory: D(
    1,
    2.0,
    1.05,
    (b) => {
      const br = (m: number, at: number, d: number, g: number) => {
        const f = 440 * Math.pow(2, (m - 69) / 12)
        b.tone('sawtooth', f, f, d, g, { at, a: 0.03, hold: d * 0.4, lp: [900, 2600], vib: [5, 8] })
        b.tone('sawtooth', f * 1.004, f * 1.004, d, g * 0.6, { at, a: 0.03, hold: d * 0.4, lp: [900, 2600] })
      }
      br(60, 0, 0.2, 0.12)
      br(64, 0.18, 0.2, 0.12)
      br(67, 0.36, 0.2, 0.12)
      for (const m of [48, 60, 64, 67, 72]) br(m, 0.6, 0.6, 0.09)
      b.bells([84, 88, 91, 96], 0.1, 0.5, 0.22, { at: 0.6 })
      b.tone('sine', 130, 65, 0.4, 0.8, { at: 0.6, sw: 0.4 })
      b.nz('highpass', 7000, 7000, 0.3, 0.05, { at: 0.6 })
    },
    { vary: 0.02, rev: 0.22, duck: [0.45, 1.8] }
  ),
  // Defeat: slow descending minor phrase with a low boom.
  defeat: D(
    1,
    2.0,
    1.0,
    (b) => {
      const br = (m: number, at: number, d: number, g: number) => {
        const f = 440 * Math.pow(2, (m - 69) / 12)
        b.tone('triangle', f, f * 0.98, d, g, { at, a: 0.05, hold: d * 0.3, lp: [900, 400], vib: [4.5, 12] })
        b.tone('sawtooth', f, f * 0.98, d, g * 0.4, { at, a: 0.05, hold: d * 0.3, lp: [700, 300] })
      }
      br(69, 0, 0.3, 0.22)
      br(67, 0.32, 0.3, 0.22)
      br(64, 0.64, 0.3, 0.22)
      br(57, 0.96, 0.45, 0.26)
      b.tone('sine', 82, 36, 0.5, 0.9, { at: 0.96, sw: 0.5 })
      b.bell(57, 0.5, 0.15, { at: 0.96, ratio: 2.1, index: 2 })
    },
    { vary: 0.02, rev: 0.25, duck: [0.45, 1.8] }
  ),
  // Radio chatter squelch: noise burst and two blips.
  radio: D(
    2,
    0.4,
    0.6,
    (b) => {
      b.nz('bandpass', 1800, 1800, 0.12, 0.4, { q: 1.5 })
      b.tone('square', 1500, 1500, 0.05, 0.12, { at: 0.14, bp: [1500, 2] })
      b.tone('square', 1100, 1100, 0.05, 0.12, { at: 0.24, bp: [1100, 2] })
      b.nz('bandpass', 2200, 2200, 0.08, 0.25, { at: 0.34, q: 1.5 })
    },
    { vary: 0.03, rev: 0.02 }
  ),
  // Cursor move tick.
  uiMove: D(
    2,
    0.04,
    0.5,
    (b) => {
      b.tone('sine', 1500, 1300, 0.04, 0.2)
      b.nz('bandpass', 4500, 3500, 0.012, 0.25, { q: 2 })
    },
    { vary: 0.03, rev: 0.02 }
  ),
  // Confirm: clean two-note rising blip.
  uiSelect: D(
    2,
    0.08,
    0.7,
    (b) => {
      b.tone('triangle', 659, 659, 0.08, 0.3)
      b.tone('triangle', 988, 988, 0.16, 0.32, { at: 0.07 })
      b.tone('sine', 1976, 1976, 0.1, 0.08, { at: 0.07 })
    },
    { vary: 0.03, rev: 0.04 }
  ),
  // Cancel: falling two-note blip.
  uiBack: D(
    2,
    0.08,
    0.65,
    (b) => {
      b.tone('triangle', 784, 784, 0.07, 0.3)
      b.tone('triangle', 523, 523, 0.14, 0.3, { at: 0.07 })
    },
    { vary: 0.03, rev: 0.03 }
  ),
  // Rejected: low buzzy double blip.
  uiError: D(
    2,
    0.2,
    0.75,
    (b) => {
      for (const at of [0, 0.11]) {
        b.tone('sawtooth', 170, 160, 0.09, 0.25, { at, lp: [900, 600] })
        b.tone('square', 85, 80, 0.09, 0.15, { at })
      }
    },
    { vary: 0.02, rev: 0.02 }
  ),
  // Equip an antique: mechanical latch click and metallic ring.
  uiEquip: D(
    2,
    0.15,
    0.8,
    (b) => {
      b.nz('bandpass', 2500, 1200, 0.025, 0.5, { q: 2 })
      b.tone('sine', 180, 90, 0.07, 0.5, { sw: 0.5 })
      b.nz('bandpass', 3500, 2500, 0.015, 0.3, { at: 0.06, q: 3 })
      b.bell(79, 0.5, 0.2, { at: 0.07, ratio: 2.76, index: 2 })
    },
    { vary: 0.04, rev: 0.08 }
  ),
  // Unequip: reversed, lighter click.
  uiUnequip: D(
    2,
    0.15,
    0.7,
    (b) => {
      b.nz('bandpass', 3500, 2000, 0.015, 0.3, { q: 3 })
      b.nz('bandpass', 1800, 900, 0.025, 0.35, { at: 0.05, q: 2 })
      b.tone('sine', 120, 70, 0.06, 0.3, { at: 0.05, sw: 0.5 })
      b.bell(72, 0.25, 0.1, { at: 0.05, ratio: 2.76, index: 2 })
    },
    { vary: 0.04, rev: 0.05 }
  ),
  // Tab switch: soft tick-swish.
  uiTab: D(
    2,
    0.06,
    0.55,
    (b) => {
      b.nz('bandpass', 1500, 4500, 0.09, 0.2, { a: 0.03, q: 1 })
      b.tone('triangle', 740, 740, 0.04, 0.2, { at: 0.04 })
    },
    { vary: 0.04, rev: 0.03 }
  ),
  // Ready up: positive three-note chime.
  uiReady: D(
    1,
    0.3,
    0.8,
    (b) => {
      b.bells([76, 79, 84], 0.1, 0.5, 0.3, { ratio: 3, index: 1 })
      b.tone('sine', 1047, 1047, 0.2, 0.05, { at: 0.2 })
    },
    { vary: 0.02, rev: 0.12 }
  ),
  // Start battle: strong, confident, resolved stinger.
  uiStart: D(
    1,
    0.6,
    0.95,
    (b) => {
      b.tone('sine', 90, 45, 0.4, 0.8, { sw: 0.4 })
      b.nz('bandpass', 500, 3500, 0.25, 0.15, { a: 0.12, q: 1 })
      for (const m of [55, 62, 67, 71]) {
        const f = 440 * Math.pow(2, (m - 69) / 12)
        b.tone('sawtooth', f, f, 0.7, 0.1, { at: 0.12, a: 0.02, hold: 0.15, lp: [900, 2400] })
      }
      b.bells([79, 83, 86], 0.07, 0.7, 0.2, { at: 0.12 })
    },
    { vary: 0.02, rev: 0.15, duck: [0.3, 0.8] }
  ),
  // Dialogue text blip: very short, soft, pitched.
  typeBlip: D(
    2,
    0.03,
    0.45,
    (b) => {
      b.tone('square', 800, 780, 0.035, 0.2, { lp: [2500, 1500] })
    },
    { vary: 0.08, rev: 0.01 }
  ),
  // Title impact: deep cinematic boom, metallic shimmer and a rising swell.
  titleHit: D(
    1,
    2.0,
    1.2,
    (b) => {
      b.tone('sine', 70, 28, 0.8, 1.0, { sw: 0.5 })
      b.tone('triangle', 140, 56, 0.6, 0.35, { sw: 0.4 })
      b.nz('lowpass', 1500, 120, 0.5, 0.5, { a: 0.01 })
      b.bells([84, 91, 96, 100], 0.05, 0.6, 0.1, { at: 0.05, ratio: 2.76, index: 2 })
      b.bell(60, 0.8, 0.2, { at: 0.02, ratio: 2.76, index: 3 })
      b.bell(72, 0.7, 0.14, { at: 0.02, ratio: 3.5, index: 2 })
      b.nz('bandpass', 400, 5000, 0.6, 0.2, { at: 0.35, a: 0.4, q: 0.8 })
      b.tone('sawtooth', 131, 262, 0.6, 0.1, { at: 0.3, a: 0.4, lp: [400, 2000] })
    },
    { vary: 0.02, rev: 0.3, duck: [0.45, 1.8] }
  )
}
