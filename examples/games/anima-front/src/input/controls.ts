/**
 * Device-independent control state (DESIGN §8). Keyboard/mouse, gamepad and touch sources write into one
 * `ControlState`; once per frame `PlayerInputBuilder` turns it into the sim's `PlayerInput`:
 * - presses are counted on every button-down (never lost between samples, never doubled);
 * - paw selection is an absolute index computed from the paw lists of the latest view;
 * - look deltas are already in radians (+x = turn right, +y = look up).
 */
import { BTN, type PlayerInput } from '../sim/types'

export type Button = 'R' | 'L' | 'jump' | 'dash' | 'interact'
export type Command =
  | { type: 'cycle'; hand: 'R' | 'L'; dir: 1 | -1 }
  | { type: 'pick'; hand: 'R' | 'L'; index: number }
  | { type: 'shoulder' }

/** UI-level actions the game screen handles itself. */
export type UiAction = 'pause' | 'scoreboardOn' | 'scoreboardOff'

const BUTTON_BIT: Record<Button, number> = {
  R: BTN.R,
  L: BTN.L,
  jump: BTN.JUMP,
  dash: BTN.DASH,
  interact: BTN.INTERACT
}

export const PITCH_LIMIT = 1.35

export class ControlState {
  /** Digital movement keys (keyboard / d-pad). */
  keys = { forward: false, back: false, left: false, right: false }
  /** Analog movement per source ([x right, y forward], each axis −1..1). */
  readonly sticks = new Map<string, [number, number]>()
  /** Accumulated look since the last build (radians). */
  lookYaw = 0
  lookPitch = 0
  readonly presses = { r: 0, l: 0, jump: 0, dash: 0 }
  private readonly holds = new Map<string, number>()
  readonly commands: Command[] = []
  /** Which kind of device was used last (for hints and aim assist). */
  lastDevice: 'mouse' | 'gamepad' | 'touch' = 'mouse'

  press(button: Button, source: string): void {
    const key = `${source}:${button}`
    if (this.holds.get(key)) return // key repeat
    this.holds.set(key, 1)
    if (button === 'R') this.presses.r++
    else if (button === 'L') this.presses.l++
    else if (button === 'jump') this.presses.jump++
    else if (button === 'dash') this.presses.dash++
  }

  release(button: Button, source: string): void {
    this.holds.delete(`${source}:${button}`)
  }

  /** Releases everything a source holds (blur, pointer-lock loss, gamepad disconnect, pause). */
  releaseSource(source: string): void {
    for (const key of [...this.holds.keys()]) if (key.startsWith(`${source}:`)) this.holds.delete(key)
    this.sticks.delete(source)
    if (source === 'kb') this.keys = { forward: false, back: false, left: false, right: false }
  }

  releaseAll(): void {
    this.holds.clear()
    this.sticks.clear()
    this.keys = { forward: false, back: false, left: false, right: false }
  }

  held(button: Button): boolean {
    for (const key of this.holds.keys()) if (key.endsWith(`:${button}`)) return true
    return false
  }

  heldBits(): number {
    let bits = 0
    for (const b of Object.keys(BUTTON_BIT) as Button[]) if (this.held(b)) bits |= BUTTON_BIT[b]
    return bits
  }

  look(dyaw: number, dpitch: number): void {
    this.lookYaw += dyaw
    this.lookPitch += dpitch
  }

  setStick(source: string, x: number, y: number): void {
    if (x === 0 && y === 0) this.sticks.delete(source)
    else this.sticks.set(source, [x, y])
  }

  command(c: Command): void {
    if (this.commands.length < 32) this.commands.push(c)
  }

  /** Movement vector [mx, mz], length ≤ 1. */
  move(): [number, number] {
    let x = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0)
    let z = (this.keys.forward ? 1 : 0) - (this.keys.back ? 1 : 0)
    for (const [sx, sy] of this.sticks.values()) {
      x += sx
      z += sy
    }
    const len = Math.hypot(x, z)
    if (len > 1) {
      x /= len
      z /= len
    }
    return [x, z]
  }
}

export interface PawInfo {
  /** Number of antiques in each paw's list (from the latest PlayerView). */
  countR: number
  countL: number
  /** The sim's current selection (used to seed the desired selection once). */
  selR: number
  selL: number
}

export class PlayerInputBuilder {
  yaw = 0
  pitch = 0
  selR = 0
  selL = 0
  shoulder: 1 | -1 = 1
  private seeded = false

  /** Places the camera/aim (spawn, respawn) and forgets the old selection seed. */
  reset(yaw: number, pitch = 0): void {
    this.yaw = yaw
    this.pitch = pitch
  }

  build(state: ControlState, paws: PawInfo | null): PlayerInput {
    if (paws && !this.seeded) {
      this.selR = Math.max(0, paws.selR)
      this.selL = Math.max(0, paws.selL)
      this.seeded = true
    }
    this.yaw = wrapAngle(this.yaw - state.lookYaw)
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + state.lookPitch))
    state.lookYaw = 0
    state.lookPitch = 0
    const countR = paws?.countR ?? 0
    const countL = paws?.countL ?? 0
    for (const c of state.commands) {
      if (c.type === 'shoulder') this.shoulder = this.shoulder === 1 ? -1 : 1
      else if (c.type === 'cycle') {
        const n = c.hand === 'R' ? countR : countL
        if (n <= 0) continue
        const cur = c.hand === 'R' ? this.selR : this.selL
        const next = (((cur + c.dir) % n) + n) % n
        if (c.hand === 'R') this.selR = next
        else this.selL = next
      } else if (c.type === 'pick') {
        const n = c.hand === 'R' ? countR : countL
        if (c.index < 0 || c.index >= n) continue
        if (c.hand === 'R') this.selR = c.index
        else this.selL = c.index
      }
    }
    state.commands.length = 0
    if (countR > 0 && this.selR >= countR) this.selR = countR - 1
    if (countL > 0 && this.selL >= countL) this.selL = countL - 1
    const [mx, mz] = state.move()
    return {
      mx,
      mz,
      yaw: this.yaw,
      pitch: this.pitch,
      held: state.heldBits(),
      presses: { ...state.presses },
      selR: this.selR,
      selL: this.selL,
      shoulder: this.shoulder
    }
  }
}

export function wrapAngle(a: number): number {
  const t = Math.PI * 2
  return ((((a + Math.PI) % t) + t) % t) - Math.PI
}

/** Radial dead zone with rescaling so the output starts at 0 just outside the zone and reaches 1. */
export function applyDeadZone(x: number, y: number, deadZone: number): [number, number] {
  const len = Math.hypot(x, y)
  if (len <= deadZone) return [0, 0]
  const scaled = Math.min(1, (len - deadZone) / (1 - deadZone))
  return [(x / len) * scaled, (y / len) * scaled]
}

/** Look response curve: keeps direction, raises the magnitude to `exponent` for fine aim near the centre. */
export function responseCurve(x: number, y: number, exponent: number): [number, number] {
  const len = Math.hypot(x, y)
  if (len === 0) return [0, 0]
  const k = Math.pow(Math.min(1, len), exponent) / len
  return [x * k, y * k]
}

/** Radians per pixel of mouse movement at sensitivity 1. */
export const MOUSE_RAD_PER_PX = 0.0022
/** Radians per second at full stick deflection and sensitivity 1. */
export const STICK_RAD_PER_S = 3.4
