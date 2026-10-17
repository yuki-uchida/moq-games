import type { UnitType } from '../game/model'

interface MotionProfile {
  stride: number
  bob: number
  lean: number
  lunge: number
  recoil: number
  lift: number
  squash: number
  airborne?: true
  ranged?: true
}

const PROFILES: Partial<Record<UnitType, MotionProfile>> = {
  soldier: { stride: 3, bob: 2.5, lean: 0.1, lunge: 13, recoil: 3, lift: 1, squash: 0.025 },
  runner: { stride: 4, bob: 3, lean: 0.12, lunge: 16, recoil: 4, lift: 2, squash: 0.025 },
  tank: { stride: 1.5, bob: 1.5, lean: 0.06, lunge: 7, recoil: 2, lift: 0, squash: 0.035 },
  paladin: { stride: 3, bob: 2.5, lean: 0.12, lunge: 14, recoil: 3, lift: 2, squash: 0.035 },
  archer: { stride: 2.5, bob: 2, lean: 0.085, lunge: 0, recoil: 7, lift: 0, squash: 0.015, ranged: true },
  ranger: { stride: 3, bob: 2.5, lean: 0.1, lunge: 0, recoil: 9, lift: 0, squash: 0.02, ranged: true },
  cannon: { stride: 1.5, bob: 1.5, lean: 0.07, lunge: 0, recoil: 11, lift: 0, squash: 0.055, ranged: true },
  mage: { stride: 2, bob: 2.5, lean: 0.08, lunge: 2, recoil: 5, lift: 4, squash: 0.03, ranged: true },
  healer: { stride: 2, bob: 2.5, lean: 0.065, lunge: 1, recoil: 3, lift: 5, squash: 0.025, ranged: true },
  frost: { stride: 2, bob: 2, lean: 0.08, lunge: 2, recoil: 5, lift: 4, squash: 0.03, ranged: true },
  slime: { stride: 1, bob: 5, lean: 0.035, lunge: 11, recoil: 2, lift: 4, squash: 0.13 },
  goblin: { stride: 4, bob: 3, lean: 0.14, lunge: 14, recoil: 4, lift: 3, squash: 0.04 },
  wolf: { stride: 4, bob: 3, lean: 0.09, lunge: 16, recoil: 3, lift: 6, squash: 0.06 },
  beetle: { stride: 2, bob: 1.5, lean: 0.05, lunge: 10, recoil: 2, lift: 1, squash: 0.05 },
  shaman: { stride: 3, bob: 3, lean: 0.1, lunge: 2, recoil: 5, lift: 4, squash: 0.045, ranged: true },
  brute: { stride: 2, bob: 3.5, lean: 0.08, lunge: 9, recoil: 2, lift: 6, squash: 0.09 },
  bat: { stride: 2, bob: 4, lean: 0.12, lunge: 13, recoil: 3, lift: 5, squash: 0.025, airborne: true },
  wraith: { stride: 2, bob: 4, lean: 0.065, lunge: 2, recoil: 4, lift: 6, squash: 0.03, airborne: true, ranged: true },
  ogre: { stride: 2.5, bob: 3.5, lean: 0.11, lunge: 11, recoil: 3, lift: 5, squash: 0.08 },
  dragon: { stride: 2, bob: 4, lean: 0.09, lunge: 3, recoil: 8, lift: 5, squash: 0.035, airborne: true, ranged: true }
}

function ease(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

export function expressiveMotion(input: {
  type: UnitType
  motion: 'idle' | 'walk' | 'attack' | 'hit' | 'death'
  elapsedMs: number
  durationMs: number
  cueMs?: number
}) {
  const profile = PROFILES[input.type]
  let forward = 0,
    lift = 0,
    sway = 0,
    lean = 0,
    squash = 0,
    dust = 0,
    trail = 0
  if (!profile) return { forward, lift, sway, lean, scaleX: 1, scaleY: 1, dust, trail }
  if (input.motion === 'walk' && input.durationMs > 0) {
    const phase = ((input.elapsedMs % input.durationMs) / input.durationMs) * Math.PI * 2
    sway = Math.sin(phase) * profile.stride
    lift = Math.abs(Math.sin(phase)) * profile.bob
    lean = Math.sin(phase) * profile.lean * 0.35
    squash = input.type === 'slime' ? Math.cos(phase * 2) * profile.squash * 0.55 : 0
    dust = profile.airborne ? 0 : Math.max(0, Math.cos(phase * 2)) ** 8 * 0.28
  } else if (input.motion === 'attack' && input.durationMs > 0) {
    const end = input.durationMs,
      cue = input.cueMs ?? end * 0.5,
      now = Math.min(end, Math.max(0, input.elapsedMs))
    const windup = ease(now / Math.max(1, cue * 0.7)) * (1 - ease((now - cue * 0.7) / Math.max(1, cue * 0.3)))
    const strike =
      ease((now - cue * 0.7) / Math.max(1, cue * 0.3)) * (1 - ease((now - cue) / Math.max(1, (end - cue) * 0.65)))
    const recoil =
      ease((now - cue) / Math.max(1, (end - cue) * 0.15)) *
      (1 - ease((now - cue - (end - cue) * 0.15) / Math.max(1, (end - cue) * 0.85)))
    forward = strike * profile.lunge - windup * 4 - recoil * profile.recoil
    lift = windup * profile.lift + strike * (profile.airborne ? 2 : 0)
    lean = -windup * profile.lean + strike * profile.lean * 1.35 - recoil * profile.lean * 0.5
    squash = windup * profile.squash - strike * profile.squash * 0.7
    dust = profile.airborne || profile.ranged ? 0 : strike * 0.3
    trail = profile.ranged ? 0 : strike * 0.7
  }
  return { forward, lift, sway, lean, scaleX: 1 + squash, scaleY: 1 - squash, dust, trail }
}
