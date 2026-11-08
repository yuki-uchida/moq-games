/**
 * Shape checks for messages crossing the network. The host never trusts a guest: inputs are rebuilt field by field
 * with clamped numbers; snapshots are checked enough that the renderer cannot crash on them.
 */
import type { HeroReport, NetInput, View } from '../sim/types'
import { JOBS, STAGES, type Job } from '../vocab'

const ROOM = /^[a-zA-Z0-9_-]{1,64}$/

/** Room codes are 1–64 characters of [a-zA-Z0-9_-]. */
export const validRoom = (room: string) => ROOM.test(room)

/** Normalises user text into a room code (spaces → '-', other characters dropped). */
export function cleanRoom(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64)
}

const WORDS = ['purun', 'mori', 'kaze', 'hoshi', 'tsuki', 'kinoko', 'donguri', 'nezumi', 'karasu', 'ookami']

/** A friendly random room code such as `donguri-428`. */
export function randomRoom(rand: () => number = Math.random): string {
  const w = WORDS[Math.floor(rand() * WORDS.length) % WORDS.length]
  return `${w}-${100 + Math.floor(rand() * 900)}`
}

const num = (v: unknown, lo: number, hi: number, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0)
const bool = (v: unknown) => v === true

function report(v: unknown): HeroReport | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  if (typeof r.slot !== 'number' || !Number.isInteger(r.slot) || r.slot < 0 || r.slot > 3) return undefined
  if (![r.x, r.y].every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined
  return {
    slot: r.slot,
    x: num(r.x, -1e5, 1e5),
    y: num(r.y, -1e5, 1e5),
    z: num(r.z, 0, 1000),
    vx: num(r.vx, -2000, 2000),
    vy: num(r.vy, -2000, 2000),
    facing: num(r.facing, -10, 10),
    forceSeq: count(r.forceSeq),
    airborne: bool(r.airborne)
  }
}

/** A guest's input rebuilt from untrusted JSON, or undefined when it is not an input at all. */
export function validateNetInput(raw: unknown): NetInput | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  let mx = num(r.mx, -1, 1)
  let my = num(r.my, -1, 1)
  const len = Math.hypot(mx, my)
  if (len > 1) (mx /= len), (my /= len)
  const input: NetInput = {
    mx,
    my,
    aim: num(r.aim, -10, 10, Math.PI / 2),
    attackHeld: bool(r.attackHeld),
    actionHeld: bool(r.actionHeld),
    attackPresses: count(r.attackPresses),
    attackReleases: count(r.attackReleases),
    actionPresses: count(r.actionPresses),
    interactPresses: count(r.interactPresses),
    switchPresses: count(r.switchPresses),
    modePresses: count(r.modePresses),
    signalPresses: count(r.signalPresses)
  }
  if (r.aimDist !== undefined) input.aimDist = num(r.aimDist, 0, 4000)
  const hero = report(r.hero)
  if (hero) input.hero = hero
  if (typeof r.job === 'string' && (JOBS as readonly string[]).includes(r.job)) input.job = r.job as Job
  if (typeof r.name === 'string') {
    const name = cleanName(r.name)
    if (name) input.name = name
  }
  if (typeof r.menu === 'boolean') input.menu = r.menu
  return input
}

/** Display names: ≤ 12 characters, no control characters. */
export function cleanName(text: string): string {
  // eslint-disable-next-line no-control-regex
  return [...text.replace(/[\u0000-\u001f\u007f<>]/g, '').trim()].slice(0, 12).join('')
}

/** Enough of a View that the client can render it. */
export function looksLikeView(raw: unknown): raw is View {
  if (!raw || typeof raw !== 'object') return false
  const v = raw as Partial<View>
  return (
    v.v === 1 &&
    typeof v.t === 'number' &&
    typeof v.seq === 'number' &&
    typeof v.phase === 'string' &&
    (STAGES as readonly string[]).includes(v.stage as string) &&
    Array.isArray(v.heroes) &&
    Array.isArray(v.enemies) &&
    Array.isArray(v.props) &&
    Array.isArray(v.events) &&
    Array.isArray(v.players) &&
    Array.isArray(v.shots) &&
    Array.isArray(v.pickups) &&
    Array.isArray(v.techs) &&
    Array.isArray(v.formations) &&
    Array.isArray(v.dialogs) &&
    Array.isArray(v.gone) &&
    !!v.party
  )
}
