// Motion clocks shared by every character. The simulation lands a hit (or releases a shot) at attack
// phase 0, so the contact pose is held exactly then; the anticipation is spent in the last part of the
// previous period and the recovery in the first part of the next. Damage timing is never changed here.

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/** Phase lengths in seconds for an attack period: anticipation (incl. strike), strike, recovery, contact hold. */
export function timing(period, tempo = [0.42, 0.035]) {
  const anticipation = Math.min(tempo[0], period * 0.55)
  const recovery = Math.min(0.34, period * 0.4)
  return {
    anticipation,
    strike: Math.min(0.08, anticipation * 0.32),
    recovery,
    hold: Math.min(tempo[1], recovery * 0.5)
  }
}

/**
 * Attack beats around the simulation hit. `wind` (0..1) gathers slowly before the strike, `hit` snaps to 1
 * during the fast strike, holds on contact and eases out over the recovery, `smear` peaks mid-strike and
 * `recoil` is the rebound right after contact. While walking, `lead` (seconds until the foe is in range)
 * starts the anticipation early so even the first strike is wound up.
 */
export function beats(motion, phase, period, lead = Infinity, tempo) {
  const { anticipation, strike, recovery, hold } = timing(period, tempo)
  const until = motion === 'attack' ? period - phase : lead
  const since = motion === 'attack' ? phase : Infinity
  let wind = 0,
    hit = 0,
    smear = 0,
    recoil = 0
  if (until < strike) {
    const s = 1 - until / strike
    hit = s * s
    wind = 1 - s
    smear = Math.sin(Math.PI * Math.min(1, s * 1.15))
  } else if (until < anticipation) wind = smooth((anticipation - until) / (anticipation - strike))
  if (since < recovery) {
    const r = since < hold ? 0 : (since - hold) / (recovery - hold)
    hit = Math.max(hit, 1 - smooth(r))
    recoil = since < hold ? 0 : Math.sin(Math.PI * Math.min(1, (since - hold) / (recovery * 0.5))) * (1 - r)
  }
  return { wind, hit, smear, recoil, since, until }
}

/** Walk cycle from walked lane distance: `p` 0..1 within a step, `hop` its arc, `land` the touchdown squash, `swing` ±1 per stride. */
export function gait(walked, stride) {
  const cycle = walked / stride
  const p = cycle - Math.floor(cycle)
  return {
    cycle,
    p,
    hop: Math.sin(Math.PI * p),
    land: Math.max(0, 1 - Math.min(p, 1 - p) / 0.16) ** 2,
    swing: Math.sin(Math.PI * cycle)
  }
}

/** Hit reaction: an instant jolt held for a few frames, then a damped wobble; `flash` and `face` are short. */
export function flinch(age, power = 1) {
  if (!(age >= 0 && age < 0.55)) return { jolt: 0, wobble: 0, flash: 0, face: false }
  const jolt = (age < 0.05 ? 1 : Math.exp(-(age - 0.05) / 0.075)) * power
  const wobble = Math.exp(-age / 0.13) * Math.sin((age / 0.21) * Math.PI * 2) * power
  return { jolt, wobble, flash: Math.max(0, 1 - age / 0.1), face: age < 0.32 }
}

export const KO_SECONDS = 1.15
/** Knock-out: popped up and back, tipping over, a squash on landing, then a fade. */
export function knockout(age, duration = KO_SECONDS) {
  const t = Math.min(1, Math.max(0, age / duration))
  const air = Math.min(1, t / 0.42)
  const landed = Math.max(0, t - 0.42)
  return {
    back: 0.16 * smooth(t / 0.5),
    lift: t < 0.42 ? 0.22 * 4 * air * (1 - air) : 0,
    tilt: 1.3 * smooth(t / 0.42),
    squash: t < 0.42 ? 1 + 0.06 * air : 0.82 - 0.22 * Math.exp(-landed / 0.05),
    fade: t < 0.75 ? 1 : (1 - t) / 0.25
  }
}
