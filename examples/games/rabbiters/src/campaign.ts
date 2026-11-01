// Four-season campaign layered on the core survival rules: grow (spring), carry bedding to the
// home burrow (summer), carry and give birth (autumn), then lead the kits across the stream to the
// Big Oak hollow (winter). A day/night cycle changes how far predators can see.
import { MAX_PREDATORS, SHELTERS, SPAWN, heightAt } from './map'

export interface Straw {
  id: string
  x: number
  y: number
  z: number
  active: boolean
}

export interface Kit {
  id: string
  x: number
  y: number
  z: number
  angle: number
  hidden: boolean
  status: 'follow' | 'wait' | 'safe' | 'lost'
}

type Point = { x: number; z: number }

export const CHAPTERS = [
  { season: '春', title: '芽吹き', goal: '食べて、大きくなろう' },
  { season: '夏', title: '巣づくり', goal: '巣材を巣穴へ運ぼう' },
  { season: '秋', title: 'みのり', goal: '新しい命を宿そう' },
  { season: '冬', title: '旅立ち', goal: '子ウサギを大樫のうろへ' }
] as const

export const CAMPAIGN = {
  beddingGoal: 6,
  kitCount: 3,
  carrySpeed: 0.8,
  carryDetection: 1.3,
  kitDetection: 0.8,
  kitSpeed: 3.4,
  kitFollowRange: 7,
  /** Hunters the nests can field per season: the wild grows more dangerous as the year turns. */
  predatorCap: [0.7, 0.8, 0.9, 1].map((share) => Math.round(MAX_PREDATORS * share)),
  /** Hunters reaching this close to the home burrow give up the hunt and turn back. */
  denRadius: 6,
  dayLength: 300,
  nightStart: 200
} as const

export const BURROW: Point = { x: SPAWN.x, z: SPAWN.z }
/** Winter destination: the hollow under the Big Oak, beyond the stream. Predators cannot enter shelters. */
export const HAVEN = { x: SHELTERS[1].x, z: SHELTERS[1].z, radius: 4 } as const

/** Bedding bundles around the home meadow and just across the stream. */
export const STRAW_SPOTS = [
  [-98, -18],
  [-128, 32],
  [-88, 40],
  [-74, -8],
  [-118, -40],
  [-40, -10]
] as const

export const createStraws = (): Straw[] =>
  STRAW_SPOTS.map(([x, z], index) => ({ id: `straw-${index}`, x, y: heightAt(x, z), z, active: true }))

/** 0 during the day, 1 at full night, with 10 s dusk and dawn fades. */
export function nightAmount(time: number) {
  const t = (((time % CAMPAIGN.dayLength) + CAMPAIGN.dayLength) % CAMPAIGN.dayLength) - CAMPAIGN.nightStart
  return Math.max(0, Math.min(1, t / 10, (CAMPAIGN.dayLength - CAMPAIGN.nightStart - t) / 10))
}

/** Hawks roost at night; ground hunters see farther in the dark. */
export const nightVision = (kind: string, time: number) => 1 + nightAmount(time) * (kind === 'hawk' ? -0.7 : 0.3)

export function spawnKits(x: number, z: number): Kit[] {
  return Array.from({ length: CAMPAIGN.kitCount }, (_, index) => ({
    id: `kit-${index}`,
    x,
    y: heightAt(x, z),
    z,
    angle: 0,
    hidden: false,
    status: 'wait'
  }))
}

/** Point `gap` metres back along a trail that ends at `from` (newest point last). */
export function alongTrail(from: Point, trail: readonly Point[], gap: number): Point {
  let left = gap
  let ahead = from
  for (let index = trail.length - 1; index >= 0; index--) {
    const point = trail[index]
    const span = Math.hypot(ahead.x - point.x, ahead.z - point.z)
    if (span >= left) {
      const share = span ? left / span : 0
      return { x: ahead.x + (point.x - ahead.x) * share, z: ahead.z + (point.z - ahead.z) * share }
    }
    left -= span
    ahead = point
  }
  return ahead
}

type Leader = Point & { id: string; y: number; downed: boolean }

/**
 * Kits trail the nearest standing rabbit within range along the path it actually walked, so they never
 * cut through rocks or cliffs. They are slower than a walk and are safe once inside the haven.
 */
export function moveKits(
  kits: Kit[],
  players: readonly Leader[],
  trails: ReadonlyMap<string, readonly Point[]>,
  dt: number,
  speedAt: (kit: Kit) => number,
  step: (kit: Kit, dx: number, dz: number) => void,
  hide: (kit: Kit, leader: Leader | undefined) => boolean
) {
  kits.forEach((kit, index) => {
    if (kit.status === 'safe' || kit.status === 'lost') return
    let leader: Leader | undefined
    let best: number = CAMPAIGN.kitFollowRange
    for (const player of players) {
      const range = Math.hypot(player.x - kit.x, player.z - kit.z)
      // A parent down in the mole tunnels is out of reach.
      if (!player.downed && range < best && player.y > heightAt(player.x, player.z) - 1) {
        leader = player
        best = range
      }
    }
    kit.status = leader ? 'follow' : 'wait'
    if (leader) {
      const goal = alongTrail(leader, trails.get(leader.id) ?? [], 1.1 + index * 0.7)
      const range = Math.hypot(goal.x - kit.x, goal.z - kit.z)
      if (range > 0.2) {
        const stride = Math.min(range, CAMPAIGN.kitSpeed * speedAt(kit) * dt)
        kit.angle = Math.atan2(goal.x - kit.x, goal.z - kit.z)
        step(kit, ((goal.x - kit.x) / range) * stride, ((goal.z - kit.z) / range) * stride)
      }
    }
    kit.y = heightAt(kit.x, kit.z)
    kit.hidden = hide(kit, leader)
    if (Math.hypot(kit.x - HAVEN.x, kit.z - HAVEN.z) < HAVEN.radius) kit.status = 'safe'
  })
}
