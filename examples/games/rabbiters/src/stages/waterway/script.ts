// Chapter 3 script: eleven shared steps from the sewer to the park's back fence. Progress lives in GameState only:
// `step`, `open` (bit 0 flooded walkway, bit 1 fence net), `items` (handle, Genji's dandelions) and `flags`:
// bits 0–6 for one-shot lines, a pending talk and finished valves; bits 7–18 count ticks of the rummaging, the north
// valve, the drain and the net; bits 19–30 the second valve's ticks (so guests see the bars fill too).
import { canEnter, type Game, type GameState, type Player, type Predator } from '../../game'
import { flies } from '../../stealth'
import { heightAt, inZone, npcNear, waterDepth, type Point, type PredatorStart, type Waypoint } from '../../map'
import type { Marker, Objective, StageScript } from '../../story'
import {
  BEAM,
  beamRect,
  CHECKPOINTS,
  HUBS,
  PARK_CREATURES,
  RIVER_CREATURES,
  ROUTES,
  SEWER_IDS,
  SPOTS,
  ZONES
} from './map'

export const STEP = {
  gama: 0,
  handle: 1,
  valve: 2,
  drain: 3,
  outfall: 4,
  stones: 5,
  bridge: 6,
  genji: 7,
  dandelion: 8,
  net: 9,
  exit: 10
} as const
export const STEPS = 11
const FLAG = { talk: 1, stones: 2, handle: 4, turning: 8, gnawing: 16, valveA: 32, valveB: 64 } as const
/** Seconds of holding E at each valve and the net (two rabbits on one job go twice as fast), and of draining. */
export const HOLD = { rummage: 18, valve: 55, net: 60, drain: 65 } as const
export const DANDELIONS = 4
/** The ford surges (the sluices upstream let water through): stones are awash for SURGE.length of every cycle. */
export const SURGE = { cycle: 45, length: 14 } as const
/** Pure in the clock, like the cars: every client agrees when the stones are awash. */
export const surging = (time: number) => time % SURGE.cycle < SURGE.length
const TICK = 1 / 60
/** Tick counters packed into `flags`: A (north valve, drain, net) and B (the second valve). */
const COUNTER = { A: { shift: 7, mask: 0xfff }, B: { shift: 19, mask: 0xfff } } as const
type Counter = keyof typeof COUNTER
export const holdTicks = (state: Pick<GameState, 'flags'>, counter: Counter = 'A') =>
  (state.flags >> COUNTER[counter].shift) & COUNTER[counter].mask
const setHold = (state: GameState, ticks: number, counter: Counter = 'A') => {
  const { shift, mask } = COUNTER[counter]
  state.flags = (state.flags & ~(mask << shift)) | (Math.min(ticks, mask) << shift)
}

const centre = (id: string) => {
  const zone = ZONES.find((entry) => entry.id === id)!
  return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }
}
const near = (a: { x: number; z: number }, b: { x: number; z: number }, reach: number) =>
  Math.hypot(a.x - b.x, a.z - b.z) < reach
const awake = (game: Game) => game.state.players.filter((player) => !player.downed)

// Transient, host-only: who was already chasing last tick (to shout once per sighting), and where each patroller
// was last seen moving (to notice one wedged against a wall).
const chasing = new Set<string>()
const moving = new Map<string, Point & { at: number }>()

/** True when a walker of this kind can go straight from `from` to `to`. */
function clear(kind: Predator['kind'], from: Point, to: Point) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.5)
  let body = { x: from.x, y: heightAt(from.x, from.z), z: from.z }
  for (let index = 1; index <= steps; index++) {
    const x = from.x + ((to.x - from.x) * index) / steps
    const z = from.z + ((to.z - from.z) * index) / steps
    if (!canEnter(kind, body, x, z, true, false)) return false
    body = { x, y: heightAt(x, z), z }
  }
  return true
}

/**
 * Patrol routes are followed in straight lines, and searchers head straight for what they glimpsed, so someone who
 * chased a rabbit into a nook, or spotted one across deep water, can end up pressing against a wall forever. A
 * patroller that has not moved for 5 s (away from its waypoints), or a searcher for 12 s, gives up and is
 * re-routed: straight to the nearest reachable waypoint, or out through an open hub first.
 */
function unstick(game: Game, predator: Predator) {
  const route = ROUTES[predator.id]
  if (flies(predator.kind) || (predator.state !== 'patrol' && predator.state !== 'search')) return
  if (!route && predator.state === 'patrol') return
  const time = game.state.time
  const mark = moving.get(predator.id)
  const resting =
    predator.state === 'patrol' &&
    predator.route?.some((point) => Math.hypot(point.x - predator.x, point.z - predator.z) < 1.6)
  if (!mark || resting || Math.hypot(mark.x - predator.x, mark.z - predator.z) > 2.5) {
    moving.set(predator.id, { x: predator.x, z: predator.z, at: time })
    return
  }
  if (predator.state === 'search') {
    if (time - mark.at < 12) return
    Object.assign(predator, { state: 'patrol', targetId: null, suspicion: 0 })
    if (!route) return moving.delete(predator.id)
  } else if (time - mark.at < 5) return
  moving.delete(predator.id)
  if (!route) return
  const away = (from: Point) => (point: Point) => Math.hypot(point.x - from.x, point.z - from.z)
  const nearest = <T extends Point>(points: readonly T[], from: Point) =>
    [...points].sort((a, b) => away(from)(a) - away(from)(b))
  /** The route, starting from its waypoint nearest to `from`. */
  const rotate = (from: Point): Waypoint[] => {
    const start = route.indexOf(nearest(route, from)[0])
    return [...route.slice(start), ...route.slice(0, start)]
  }
  const direct = nearest(route, predator).find((point) => clear(predator.kind, predator, point))
  if (direct) return game.setRoute(predator.id, rotate(direct))
  const hub = nearest(HUBS, predator).find((point) => clear(predator.kind, predator, point))
  if (hub) game.setRoute(predator.id, [hub, ...rotate(hub)])
}

function spawn(game: Game, creatures: readonly PredatorStart[]) {
  for (const { kind, x, z, id, route, leash } of creatures) game.spawnPredator(kind, x, z, { id, route, leash })
}
function remove(game: Game, ids: readonly string[]) {
  for (const id of ids) game.removePredator(id)
}

/** `by`: the rabbit that got there, who speaks the step's opening line. */
function advance(game: Game, step: number, by?: Player) {
  const { state } = game
  const say = (id: string) => game.say(id, by?.id)
  state.step = step
  state.flags &= ~FLAG.talk
  setHold(state, 0)
  setHold(state, 0, 'B')
  if (step === STEP.outfall) {
    state.open |= 1
    say('drained')
  } else if (step === STEP.stones) {
    // Out of the sewer at dawn: the river's creatures wake, the sewer's are left behind.
    remove(game, SEWER_IDS)
    spawn(game, RIVER_CREATURES)
    say('outfall')
  } else if (step === STEP.bridge) say('bridge_dogs')
  else if (step === STEP.genji) {
    remove(
      game,
      RIVER_CREATURES.map((entry) => entry.id!)
    )
    spawn(game, PARK_CREATURES)
    say('park_enter')
  } else if (step === STEP.dandelion)
    SPOTS.dandelions.forEach((spot, index) =>
      state.items.push({
        id: `dandelion-${index}`,
        kind: 'dandelion',
        x: spot.x,
        y: heightAt(spot.x, spot.z),
        z: spot.z,
        active: true
      })
    )
  else if (step === STEP.exit) {
    state.open |= 2
    say('net_done')
  }
}

/** Removes a delivered item from the world and the rabbit's mouth. */
function deliver(game: Game, player: Player) {
  game.state.items = game.state.items.filter((item) => item.id !== player.carrying)
  player.carrying = null
}

/** Ticks of E held at a valve or the net; noisy every 3 s. Returns true when the job is done. */
function turn(
  game: Game,
  player: Player,
  label: string,
  seconds: number,
  line: string,
  flag: number,
  counter: Counter = 'A'
) {
  const { state } = game
  if (!(state.flags & flag)) {
    state.flags |= flag
    game.say(line, player.id)
  }
  const ticks = holdTicks(state, counter) + 1
  setHold(state, ticks, counter)
  if (ticks % 180 === 0) game.noise(player.x, player.z, 18)
  game.work(player, label, (ticks * TICK) / seconds)
  return ticks * TICK >= seconds
}
const dandelionsLeft = (state: GameState) => state.items.filter((item) => item.kind === 'dandelion').length

/** People, dogs and the flashlight: the bits of behaviour the generic patrol AI does not have. */
function choreograph(game: Game) {
  const { predators } = game.state
  const find = (id: string) => predators.find((predator) => predator.id === id)
  const worker = find('worker')
  Object.assign(BEAM, beamRect(worker))
  for (const predator of predators) {
    unstick(game, predator)
    const shouting = predator.state === 'chase'
    const started = shouting && !chasing.has(predator.id)
    if (shouting) chasing.add(predator.id)
    else chasing.delete(predator.id)
    const walker = predator.id.startsWith('walkdog-') && find(`walker-${predator.id.slice(-1)}`)
    if (walker) {
      // A leashed dog stays within its lead of the walker; when it barks, the walker comes to see.
      predator.leash = { x: walker.x, z: walker.z, r: 3.5 }
      if (started) game.noise(predator.x, predator.z, 10)
    }
    // The angler shouts when he spots a rabbit: everything nearby comes to look.
    if (predator.id === 'angler' && started) game.noise(predator.x, predator.z, 30)
    if (predator.id.startsWith('jogger-') && predator.state === 'patrol') {
      // Joggers run their loop: the patrol walk plus a running stride.
      const step = 3.2 * TICK
      const x = predator.x + Math.sin(predator.angle) * step
      const z = predator.z + Math.cos(predator.angle) * step
      if (canEnter(predator.kind, predator, x, z, true, false)) Object.assign(predator, { x, z })
    }
    if (predator.kind === 'rat' && predator.state === 'chase') {
      // Rats only nip: give back most of the engine's bite (24/s) so a pack is a nuisance, not a death sentence.
      const bitten = game.state.players.find((player) => player.id === predator.targetId)
      if (bitten && !bitten.downed && Math.hypot(bitten.x - predator.x, bitten.z - predator.z) < 1.3)
        bitten.health = Math.min(100, bitten.health + RAT_REFUND * TICK)
    }
  }
}
const RAT_REFUND = 18

export const script: StageScript = {
  start(game: Game) {
    chasing.clear()
    moving.clear()
    game.say('intro')
  },

  tick(game: Game) {
    const { state } = game
    choreograph(game)
    const players = awake(game)
    const anyIn = (id: string) => players.find((player) => inZone(id, player.x, player.z))
    // Swift water at the ford: a rabbit that touches it (or stands on a stone in a surge) is swept back.
    const surge = surging(state.time)
    for (const player of players)
      if (
        inZone('current', player.x, player.z) &&
        !inZone('sandbar', player.x, player.z) &&
        (surge || waterDepth(player.x, player.z) > 0.05) &&
        player.y - heightAt(player.x, player.z) < 0.05
      ) {
        if (game.quiet) game.say('swept', player.id)
        game.sendBack(player)
      }
    switch (state.step) {
      case STEP.gama:
      case STEP.genji:
        if (state.flags & FLAG.talk && game.quiet) advance(game, state.step + 1)
        break
      case STEP.handle:
        for (const player of players) {
          if (player.carrying !== 'handle') continue
          if (inZone('valve', player.x, player.z)) {
            deliver(game, player)
            game.say('handle_set', player.id)
            advance(game, STEP.valve)
            break
          }
        }
        break
      case STEP.drain: {
        // The water takes a while to go down; the noise has people coming to look meanwhile.
        const ticks = holdTicks(state) + 1
        setHold(state, ticks)
        if (ticks * TICK >= HOLD.drain) advance(game, STEP.outfall)
        break
      }
      case STEP.outfall:
        if (anyIn('outfall')) advance(game, STEP.stones, anyIn('outfall'))
        break
      case STEP.stones: {
        const launching = players.find((player) => near(player, SPOTS.launch, 9))
        if (!(state.flags & FLAG.stones) && launching) {
          state.flags |= FLAG.stones
          game.say('river_stones', launching.id)
        }
        if (anyIn('eastbank')) advance(game, STEP.bridge, anyIn('eastbank'))
        break
      }
      case STEP.bridge:
        if (anyIn('parkgate')) advance(game, STEP.genji, anyIn('parkgate'))
        break
      case STEP.dandelion:
        if (state.flags & FLAG.talk) {
          if (game.quiet) advance(game, STEP.net)
          break
        }
        for (const player of players)
          if (player.carrying?.startsWith('dandelion') && near(player, SPOTS.genji, 3.5)) {
            deliver(game, player)
            if (dandelionsLeft(state)) game.say(`genji_more${dandelionsLeft(state)}`)
            else {
              game.say('genji_thanks')
              state.flags |= FLAG.talk
            }
          }
        break
      case STEP.exit:
        // Any one rabbit through the hole takes the whole family on (downed ones are carried along).
        if (anyIn('exit')) game.nextStage()
        break
    }
  },

  interact(game: Game, player: Player, held: boolean, pressed: boolean) {
    const { state } = game
    const npc = pressed ? npcNear(player.x, player.z, 2.6) : undefined
    if (npc?.id === 'gama') {
      if (state.step === STEP.gama && !(state.flags & FLAG.talk)) {
        state.flags |= FLAG.talk
        game.say('gama_first', player.id)
      } else if (game.quiet)
        game.say(state.step <= STEP.handle ? 'gama_handle' : state.step <= STEP.drain ? 'gama_valve' : 'gama_go')
      return true
    }
    if (npc?.id === 'genji') {
      if (state.step === STEP.genji && !(state.flags & FLAG.talk)) {
        state.flags |= FLAG.talk
        game.say('genji_first', player.id)
      } else if (game.quiet && state.step >= STEP.dandelion && !player.carrying?.startsWith('dandelion'))
        game.say(state.step === STEP.dandelion ? 'genji_wait' : 'genji_go')
      return true
    }
    for (const [zone, flag, counter] of [
      ['valve', FLAG.valveA, 'A'],
      ['valve2', FLAG.valveB, 'B']
    ] as const)
      if (held && state.step === STEP.valve && !(state.flags & flag) && inZone(zone, player.x, player.z)) {
        if (turn(game, player, 'バルブを回す', HOLD.valve, 'valve_turning', FLAG.turning, counter)) {
          state.flags |= flag
          if (state.flags & FLAG.valveA && state.flags & FLAG.valveB) {
            advance(game, STEP.drain)
            game.say('valve_done', player.id)
          } else game.say('valve_half', player.id)
        }
        return true
      }
    if (held && state.step === STEP.handle && !state.items.length && inZone('nest', player.x, player.z)) {
      // The rats hid the handle in their junk: rummaging rustles (and draws them).
      if (turn(game, player, 'ガラクタをさがす', HOLD.rummage, 'rummaging', FLAG.handle)) {
        state.items.push({
          id: 'handle',
          kind: 'handle',
          x: SPOTS.handle.x,
          y: heightAt(SPOTS.handle.x, SPOTS.handle.z),
          z: SPOTS.handle.z,
          active: true
        })
        setHold(state, 0)
        game.say('handle_got', player.id)
      }
      return true
    }
    if (held && state.step === STEP.net && !(state.flags & FLAG.talk) && inZone('net', player.x, player.z)) {
      if (turn(game, player, '網をかじる', HOLD.net, 'net_gnawing', FLAG.gnawing)) advance(game, STEP.exit, player)
      return true
    }
    return false
  },

  respawn(state: GameState) {
    return state.step <= STEP.outfall
      ? CHECKPOINTS.sewer
      : state.step === STEP.stones
        ? CHECKPOINTS.river
        : state.step === STEP.bridge
          ? CHECKPOINTS.eastBank
          : state.step === STEP.genji
            ? CHECKPOINTS.park
            : state.step === STEP.dandelion
              ? CHECKPOINTS.pond
              : CHECKPOINTS.fence
  },

  objective(state: GameState, player: Player): Objective {
    const carrying = (kind: string) => !!player.carrying?.startsWith(kind)
    const talk = (state.flags & FLAG.talk) !== 0
    const hold = (seconds: number) => Math.min(1, (holdTicks(state) * TICK) / seconds)
    const [goal, hint, bar]: [string, string, number?] = (() => {
      switch (state.step) {
        case STEP.gama:
          return [
            talk ? 'ガマ先生の話を聞こう' : 'ガマ先生と話そう',
            '暗い所は見つかりにくい。月明かりと懐中電灯の光は危ない'
          ]
        case STEP.handle:
          return carrying('handle')
            ? ['ハンドルを北の水門のバルブへ', 'くわえていると遅く、見つかりやすい']
            : state.items.length
              ? ['ハンドルをくわえよう', 'ネズミがもどってくる前に']
              : [
                  'ネズミの巣をあさってハンドルを探そう',
                  'ガラクタのそばで E を長押し。水路は橋か土管で渡る（C で入り、ジャンプで出る）',
                  hold(HOLD.rummage)
                ]
        case STEP.valve:
          return [
            'バルブを2つ回して水を引かせよう',
            '北の水門と作業員の部屋。E を長押し。音でだれかが来るかも',
            ((Math.min(holdTicks(state), HOLD.valve * 60) + Math.min(holdTicks(state, 'B'), HOLD.valve * 60)) * TICK) /
              (2 * HOLD.valve)
          ]
        case STEP.drain:
          return ['水が引くのを待とう', '音を聞いて人が来る。物かげで静かに待とう', hold(HOLD.drain)]
        case STEP.outfall:
          return ['排水口から川へ', '南の歩廊を東へ。水の引いた先が排水口']
        case STEP.stones:
          return [
            '飛び石で川を渡ろう',
            surging(state.time)
              ? '今は水があふれている。引くのを待とう'
              : 'ジャンプで石から石へ。落ちると流される。カラスが遠い時に'
          ]
        case STEP.bridge:
          return ['橋の下を抜けて公園へ', '犬たちがねぐらを離れた時に。浅い水を歩くとにおいが消える']
        case STEP.genji:
          return [talk ? 'ゲンじいの話を聞こう' : '池のゲンじいと話そう', 'ベンチや植え込みの下に隠れられる']
        case STEP.dandelion:
          return talk
            ? ['ゲンじいの話を聞こう', '裏山の先に、森がある']
            : carrying('dandelion')
              ? ['タンポポをゲンじいへ', 'くわえていると遅く、見つかりやすい']
              : [
                  `タンポポを届けよう（${DANDELIONS - dandelionsLeft(state)} / ${DANDELIONS}）`,
                  '花だんは遊び場の西、公園の西、池の南、裏のフェンスのそば'
                ]
        case STEP.net:
          return ['フェンスの網をかじろう', '網のそばで E を長押し。管理人さんに注意', hold(HOLD.net)]
        default:
          return ['裏のフェンスの穴から裏山へ', 'だれか1羽が抜ければ、みんなで進む']
      }
    })()
    return {
      title: `第3章｜${goal}`,
      progress: bar ?? state.step / STEPS,
      label: bar === undefined ? `目標 ${state.step + 1} / ${STEPS}` : `${Math.round(bar * 100)}%`,
      hint
    }
  },

  markers(state: GameState): Marker[] {
    const item = (id: string) => state.items.find((entry) => entry.id === id && entry.active)
    const at = (point: { x: number; z: number }, kind: Marker['kind']): Marker[] => [{ x: point.x, z: point.z, kind }]
    switch (state.step) {
      case STEP.gama:
        return at(SPOTS.gama, 'npc')
      case STEP.handle: {
        const handle = item('handle')
        return handle ? at(handle, 'item') : state.items.length ? at(centre('valve'), 'goal') : at(SPOTS.nest, 'goal')
      }
      case STEP.valve:
        return [
          ...(state.flags & FLAG.valveA ? [] : at(centre('valve'), 'goal')),
          ...(state.flags & FLAG.valveB ? [] : at(SPOTS.valve2, 'goal'))
        ]
      case STEP.drain:
      case STEP.outfall:
        return at(centre('outfall'), 'goal')
      case STEP.stones:
        return at(SPOTS.landing, 'goal')
      case STEP.bridge:
        return at(centre('parkgate'), 'goal')
      case STEP.genji:
        return at(SPOTS.genji, 'npc')
      case STEP.dandelion: {
        const flowers = state.items.filter((entry) => entry.kind === 'dandelion' && entry.active)
        if (state.flags & FLAG.talk || !flowers.length) return at(SPOTS.genji, 'npc')
        return [
          ...at(SPOTS.genji, 'npc'),
          ...flowers.map((flower): Marker => ({ x: flower.x, z: flower.z, kind: 'item' }))
        ]
      }
      case STEP.net:
        return at(SPOTS.net, 'goal')
      default:
        return at(SPOTS.exit, 'goal')
    }
  }
}
