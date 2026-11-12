/**
 * Shape checks for everything that crosses the network. The host never trusts a guest: inputs and lobby profiles
 * are rebuilt field by field with clamped numbers, monotonic counters and sanitized loadouts; guests check the
 * host's messages enough that the screens and the renderer cannot crash on them.
 */
import { DIFFICULTIES, type Difficulty } from '../data/enemies'
import type { Loadout } from '../data/loadout'
import { MISSION_IDS, type MissionId } from '../data/missions'
import { SPECIES_IDS, type SpeciesId } from '../data/species'
import type { MatchSelection, Seat } from '../app/match'
import { sanitizeLoadout } from '../sim/api'
import { BTN, neutralPlayerInput, type MatchConfig, type PlayerInput, type TeamId, type View } from '../sim/types'

const ID = /^[a-zA-Z0-9_-]{1,64}$/
const MAX_PITCH = 1.35
const MAX_COUNTER = 1e9
const ALL_BUTTONS = BTN.R | BTN.L | BTN.JUMP | BTN.DASH | BTN.INTERACT

export const validId = (id: unknown): id is string => typeof id === 'string' && ID.test(id)

// ---------------------------------------------------------------------------------------------------------------
// Room codes and names

/** Room codes are 3–32 characters of [a-z0-9-] (the relay allows more; short codes are easy to read out). */
export const validRoom = (room: string) => /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(room)

/** Normalises user text into a room code (lower case, spaces → '-', other characters dropped). */
export function cleanRoom(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
}

const WORDS = [
  'sakura',
  'kujira',
  'hinata',
  'kitsune',
  'tanuki',
  'usagi',
  'pengin',
  'fukurou',
  'hamu',
  'shiba',
  'kuma',
  'neko',
  'momiji',
  'hotaru',
  'kumo',
  'tsubame'
]

/** A friendly random room code such as `kujira-4821`. */
export function randomRoom(rand: () => number = Math.random): string {
  const w = WORDS[Math.floor(rand() * WORDS.length) % WORDS.length]
  return `${w}-${1000 + Math.floor(rand() * 9000)}`
}

/** Display names: ≤ 12 characters, no control or markup characters. */
export function cleanName(text: unknown, fallback = 'なかま'): string {
  if (typeof text !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const out = [...text.replace(/[\u0000-\u001f\u007f-\u009f<>&"'`]/g, '').trim()].slice(0, 12).join('')
  return out || fallback
}

// ---------------------------------------------------------------------------------------------------------------
// Inputs

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

/** A press counter: a safe non-negative integer that never goes below `prev`. */
function counter(v: unknown, prev: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > MAX_COUNTER) return prev
  return v < prev ? prev : v
}

/**
 * A guest's PlayerInput rebuilt from untrusted JSON. `prev` is the last accepted input of the same session: the
 * press counters only grow (a smaller value keeps the previous one), so a replayed or forged message can never
 * trigger an edge twice. Undefined when it is not an input at all.
 */
export function validatePlayerInput(raw: unknown, prev?: PlayerInput): PlayerInput | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const base = prev ?? neutralPlayerInput()
  let mx = num(r.mx, -1, 1, 0)
  let mz = num(r.mz, -1, 1, 0)
  const len = Math.hypot(mx, mz)
  if (len > 1) {
    mx /= len
    mz /= len
  }
  let yaw = num(r.yaw, -1e4, 1e4, base.yaw)
  // Keep the look angle bounded without changing its direction.
  if (Math.abs(yaw) > Math.PI * 4) yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw))
  const pr = (r.presses && typeof r.presses === 'object' ? r.presses : {}) as Record<string, unknown>
  const held = typeof r.held === 'number' && Number.isInteger(r.held) ? r.held & ALL_BUTTONS : 0
  return {
    mx,
    mz,
    yaw,
    pitch: num(r.pitch, -MAX_PITCH, MAX_PITCH, base.pitch),
    held,
    presses: {
      r: counter(pr.r, base.presses.r),
      l: counter(pr.l, base.presses.l),
      jump: counter(pr.jump, base.presses.jump),
      dash: counter(pr.dash, base.presses.dash)
    },
    selR: Math.round(num(r.selR, 0, 15, base.selR)),
    selL: Math.round(num(r.selL, 0, 15, base.selL)),
    shoulder: r.shoulder === -1 ? -1 : 1
  }
}

/** The same input with movement and every held button released; look, paw choice and counters are kept. */
export function releasedInput(input: PlayerInput): PlayerInput {
  return { ...input, mx: 0, mz: 0, held: 0, presses: { ...input.presses } }
}

// ---------------------------------------------------------------------------------------------------------------
// Lobby profiles (guest → host)

export interface Profile {
  name: string
  species: SpeciesId
  loadout: Loadout
  loadoutName: string
  /** PvP team the player asks for. */
  team: TeamId
  ready: boolean
  /** Match id the player's game screen is in (0 = not in a match). */
  inMatch: number
}

const isTeam = (t: unknown): t is TeamId => t === 0 || t === 1 || t === 2

/** A guest's lobby profile rebuilt from untrusted JSON (the loadout goes through sanitizeLoadout). */
export function validateProfile(raw: unknown): Profile | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.species !== 'string' || !(SPECIES_IDS as readonly string[]).includes(r.species)) return undefined
  return {
    name: cleanName(r.name),
    species: r.species as SpeciesId,
    loadout: sanitizeLoadout(r.loadout),
    loadoutName: cleanName(r.loadoutName, '編成'),
    team: isTeam(r.team) ? r.team : 0,
    ready: r.ready === true,
    inMatch: typeof r.inMatch === 'number' && Number.isSafeInteger(r.inMatch) && r.inMatch > 0 ? r.inMatch : 0
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Host messages (checked by guests)

/** The match selection a room plays (PvE mission/difficulty or PvP). */
export function validateSelection(raw: unknown): MatchSelection | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (r.mode === 'pvp') return { mode: 'pvp' }
  if (r.mode !== 'pve') return undefined
  const mission = (MISSION_IDS as readonly string[]).includes(r.mission as string) ? (r.mission as MissionId) : 'sakura'
  const difficulty = Object.hasOwn(DIFFICULTIES, r.difficulty as string) ? (r.difficulty as Difficulty) : 'normal'
  return { mode: 'pve', mission, difficulty }
}

/** A lobby seat from the host (the `local` flag is the receiver's business and set later). */
export function validateSeat(raw: unknown): Omit<Seat, 'local'> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (!validId(r.id) || !isTeam(r.team)) return undefined
  if (typeof r.species !== 'string' || !(SPECIES_IDS as readonly string[]).includes(r.species)) return undefined
  const seat: Omit<Seat, 'local'> = {
    id: r.id,
    name: cleanName(r.name),
    species: r.species as SpeciesId,
    loadout: sanitizeLoadout(r.loadout),
    loadoutName: cleanName(r.loadoutName, '編成'),
    team: r.team,
    ready: r.ready === true
  }
  if (typeof r.bot === 'number' && Number.isFinite(r.bot)) seat.bot = Math.min(1, Math.max(0, r.bot))
  return seat
}

/** A match config from the host: rebuilt from the selection, the seats and the seed (nothing else is trusted). */
export function validateConfig(raw: unknown): MatchConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (r.mode !== 'pve' && r.mode !== 'pvp') return undefined
  if (!Array.isArray(r.players) || !r.players.length || r.players.length > 12) return undefined
  if (typeof r.seed !== 'number' || !Number.isFinite(r.seed)) return undefined
  const players: MatchConfig['players'] = []
  for (const p of r.players) {
    const seat = validateSeat({ ...(p as object), ready: true })
    if (!seat) return undefined
    const cfg: MatchConfig['players'][number] = {
      id: seat.id,
      name: seat.name,
      species: seat.species,
      loadout: seat.loadout,
      team: seat.team
    }
    if (seat.bot !== undefined) cfg.bot = seat.bot
    players.push(cfg)
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) return undefined
  const maps = ['oldtown', 'harbor', 'blight', 'arena']
  if (!maps.includes(r.map as string)) return undefined
  const config: MatchConfig = { mode: r.mode, map: r.map as MatchConfig['map'], seed: r.seed >>> 0, players }
  if (r.variant === 'night' || r.variant === 'crater') config.variant = r.variant
  if (r.mode === 'pve') {
    const sel = validateSelection(r)
    if (sel?.mode === 'pve') {
      config.mission = sel.mission
      config.difficulty = sel.difficulty
    }
  }
  if (typeof r.countdown === 'number' && r.countdown >= 0 && r.countdown <= 30) config.countdown = r.countdown
  if (typeof r.duration === 'number' && r.duration > 0 && r.duration <= 3600) config.duration = r.duration
  return config
}

/** Enough of a View that the screens and the renderer can draw it. */
export function looksLikeView(raw: unknown): raw is View {
  if (!raw || typeof raw !== 'object') return false
  const v = raw as Partial<View>
  return (
    typeof v.tick === 'number' &&
    typeof v.time === 'number' &&
    Number.isFinite(v.time) &&
    typeof v.clock === 'number' &&
    typeof v.phase === 'string' &&
    typeof v.mode === 'string' &&
    typeof v.map === 'string' &&
    Array.isArray(v.players) &&
    Array.isArray(v.foes) &&
    Array.isArray(v.shots) &&
    Array.isArray(v.props) &&
    Array.isArray(v.shards) &&
    Array.isArray(v.events) &&
    v.players.every(
      (p) =>
        !!p &&
        typeof p.id === 'string' &&
        Array.isArray(p.p) &&
        p.p.length === 3 &&
        Array.isArray(p.hands) &&
        p.hands.length === 2
    ) &&
    v.foes.every((f) => !!f && typeof f.id === 'number' && Array.isArray(f.p) && f.p.length === 3)
  )
}
