// Chapter 2 script. Six goals: leave the alleys → help Ponta (talk, gnaw the crows' net, carry cabbage to his kits,
// back for his tip about the drains) → cross the main road → through the shopping street (the pet-shop hamster
// tells of the shrine) → Poppo at the shrine (talk, fetch bread, rest under the floor till dark) → gnaw open the
// grate on the drain under the bank and go in.
// Progress is shared by every rabbit and lives in GameState: `step`, one-shot `flags`, the grate in `open` bit 0
// and the carried things in `items`. The chapter ends as soon as ANY rabbit enters the drain: everyone moves on
// together (downed teammates included).
import { heightAt, inShelter, inZone, npcNear } from '../../map'
import { flies } from '../../stealth'
import type { Game, GameState, Player } from '../../game'
import type { Marker, Objective, StageScript } from '../../story'
import { BEATS, BREAD, CABBAGE, KITS, KURUMI, NIGHT_WALK, PONTA, POPPO, SHRINE_HALL, SPAWN } from './map'

export const STEP = {
  alley: 0,
  ponta: 1,
  net: 2,
  cabbage: 3,
  back: 4,
  road: 5,
  pet: 6,
  street: 7,
  poppo: 8,
  bread: 9,
  dusk: 10,
  bank: 11
} as const
/** Which of the six goals each step belongs to. */
const GOAL_OF_STEP = [0, 1, 1, 1, 1, 2, 3, 3, 4, 4, 4, 5]
const F = {
  tora: 1,
  talked: 2, // the current step's conversation has started; the step moves on when it ends
  road: 4,
  shop: 8,
  carried: 16,
  bank: 64,
  walker: 128,
  drain: 256
} as const
/** Seconds of gnawing (summed over every rabbit) that open the crows' net and the wire on the drain grate. */
export const NET_SECONDS = 30
export const GRATE_SECONDS = 30
/** Seconds the rabbits rest under the shrine floor while the sun sets and the keeper closes up. */
export const DUSK_SECONDS = 100
const NOISE_EVERY = 3.5
// ponytail: gnaw and rest progress is per-session host state; a retry from the checkpoint starts it again.
const gnawed = new WeakMap<Game, number>()
const rested = new WeakMap<Game, number>()
/** Grate-side mouth of the drain, past the bars. */
export const EXIT = { x: 146.2, z: -64 } as const
const GRATE_SPOT = { x: 150, z: -63.5 } as const
/** The keeper's closing round at dusk: the offering box, round the hall, then out of the torii. */
const CLOSING = [
  { x: 88, z: 3, wait: 6 },
  { x: 90, z: 12, wait: 3 },
  { x: 108, z: 11, wait: 4 },
  { x: 108, z: -11, wait: 4 },
  { x: 90, z: -12, wait: 3 },
  { x: 70, z: -10 },
  { x: 68, z: 0, wait: 8 },
  { x: 86, z: 2 }
]
/** Pedestrians who go home when night falls. */
const HOME_AT_NIGHT = ['passer-e', 'shopper-2', 'kid-2']

const near = (a: { x: number; z: number }, b: { x: number; z: number }, reach: number) =>
  Math.hypot(a.x - b.x, a.z - b.z) < reach
const awake = (state: GameState) => state.players.filter((player) => !player.downed)
const anyIn = (state: GameState, zone: string) => awake(state).some((player) => inZone(zone, player.x, player.z))
const find = (game: Game, id: string) => game.state.predators.find((predator) => predator.id === id)

/** One tick of gnawing; every few seconds the noise draws whoever is near. True once it is through. */
function gnaw(game: Game, player: Player, seconds: number, radius: number, heard: string) {
  const before = gnawed.get(game) ?? 0
  const after = before + 1 / 60
  gnawed.set(game, after)
  if (Math.floor(after / NOISE_EVERY) > Math.floor(before / NOISE_EVERY)) {
    game.noise(player.x, player.z, radius)
    if (after < NOISE_EVERY * 1.5) game.say(heard)
  }
  if (after < seconds) return false
  gnawed.delete(game)
  return true
}

/** Starts the step's conversation; the step advances once it (and anything queued) has been spoken. */
function talk(game: Game, id: string) {
  game.state.flags |= F.talked
  game.say(id)
}

/** Night: the keeper and the shoppers go home, the dog walker comes out on the riverside. */
function nightfall(game: Game) {
  for (const id of [...HOME_AT_NIGHT, 'keeper']) game.removePredator(id)
  const route = NIGHT_WALK.map(([x, z, wait]) => ({ x, z, wait }))
  game.spawnPredator('human', route[0].x, route[0].z, { id: 'walker', route })
  game.spawnPredator('dog', route[0].x, route[0].z - 2.5, { id: 'walker-dog', leash: 5 })
}

/** The walker's dog heels behind its person and can only lunge as far as the leash; its barking calls the owner. */
function walkDog(game: Game) {
  const walker = find(game, 'walker')
  const dog = find(game, 'walker-dog')
  if (!walker || !dog) return
  dog.leash = { x: walker.x, z: walker.z, r: 5 }
  if (dog.state === 'patrol') {
    const x = walker.x - Math.sin(walker.angle) * 2.2 + Math.cos(walker.angle) * 1.1
    const z = walker.z - Math.cos(walker.angle) * 2.2 - Math.sin(walker.angle) * 1.1
    Object.assign(dog, { x, z, y: heightAt(x, z), angle: walker.angle })
  } else if (dog.state === 'chase') game.noise(dog.x, dog.z, 12)
}

// Patrols return to their route in a straight line; one wedged against a wall after a chase hops back onto its
// route while no rabbit is near enough to see it.
const stuck = new WeakMap<Game, Map<string, { x: number; z: number; still: number }>>()
function keepToBeats(game: Game, dt: number) {
  let seen = stuck.get(game)
  if (!seen) stuck.set(game, (seen = new Map()))
  for (const predator of game.state.predators) {
    const beat = Object.hasOwn(BEATS, predator.id) ? BEATS[predator.id] : undefined
    if (beat) {
      predator.x = Math.min(Math.max(predator.x, beat.minX), beat.maxX)
      predator.z = Math.min(Math.max(predator.z, beat.minZ), beat.maxZ)
    }
    if (!predator.route || flies(predator.kind)) continue
    const last = seen.get(predator.id) ?? { x: predator.x, z: predator.z, still: 0 }
    const moved = Math.hypot(predator.x - last.x, predator.z - last.z) > 0.3
    const waiting = predator.route.some((point) => near(point, predator, 1.5))
    last.still = moved || waiting || predator.state !== 'patrol' ? 0 : last.still + dt
    if (moved) Object.assign(last, { x: predator.x, z: predator.z })
    seen.set(predator.id, last)
    if (last.still < 3 || awake(game.state).some((player) => near(player, predator, 25))) continue
    const back = predator.route.reduce((best, point) =>
      near(point, predator, Math.hypot(best.x - predator.x, best.z - predator.z)) ? point : best
    )
    Object.assign(predator, { x: back.x, z: back.z, y: heightAt(back.x, back.z) })
    Object.assign(last, { x: back.x, z: back.z, still: 0 })
  }
}

/** A thing to carry, laid out when its errand begins. */
const item = (id: string, at: { x: number; z: number }) => ({
  id,
  kind: id,
  x: at.x,
  y: heightAt(at.x, at.z),
  z: at.z,
  active: true
})

export const script: StageScript = {
  start(game: Game) {
    gnawed.delete(game)
    rested.delete(game)
    stuck.delete(game)
    game.say('intro')
  },
  tick(game: Game, dt: number) {
    const { state } = game
    const once = (bit: number, line?: string) => {
      if (state.flags & bit) return false
      state.flags |= bit
      if (line) game.say(line)
      return true
    }
    const advance = (step: number, line?: string) => {
      state.step = step
      state.flags &= ~F.talked
      if (line) game.say(line)
    }
    keepToBeats(game, dt)
    const listened = state.flags & F.talked && game.quiet
    const players = awake(state)
    const tora = find(game, 'tora')
    if (tora && players.some((player) => near(player, tora, 16))) once(F.tora, 'alley_cats')
    switch (state.step) {
      case STEP.alley:
        if (anyIn(state, 'garbage')) advance(STEP.ponta, 'garbage')
        break
      case STEP.ponta:
        if (listened) advance(STEP.net)
        break
      case STEP.net:
        if (listened) {
          advance(STEP.cabbage)
          state.items.push(item('cabbage', CABBAGE))
        }
        break
      case STEP.cabbage:
        if (players.some((player) => player.carrying === 'cabbage')) once(F.carried, 'cabbage_got')
        if (listened) advance(STEP.back)
        break
      case STEP.back:
        if (listened) {
          advance(STEP.road)
          state.flags &= ~F.carried
          // Ponta shares the other half of the cabbage with every rabbit at the garbage point.
          for (const rabbit of players) if (near(rabbit, PONTA, 16)) rabbit.hunger = Math.min(100, rabbit.hunger + 45)
        }
        break
      case STEP.road:
        if (anyIn(state, 'road')) once(F.road, 'road_first')
        if (anyIn(state, 'crossed')) advance(STEP.pet, 'road_crossed')
        break
      case STEP.pet:
        if (players.some((player) => player.x > -30)) once(F.shop, 'shopping_street')
        if (listened) advance(STEP.street)
        break
      case STEP.street:
        if (anyIn(state, 'street-end')) advance(STEP.poppo, 'street_end')
        break
      case STEP.poppo:
        if (listened) {
          advance(STEP.bread)
          state.items.push(item('bread', BREAD))
        }
        break
      case STEP.bread:
        if (players.some((player) => player.carrying === 'bread')) once(F.carried, 'bread_got')
        if (listened) {
          advance(STEP.dusk)
          game.setRoute('keeper', CLOSING)
        }
        break
      case STEP.dusk: {
        // Resting under the floor (any rabbit) while the sky goes dark and the keeper locks up.
        const resting = players.some((player) => inShelter(player.x, player.z))
        const rest = (rested.get(game) ?? 0) + (resting ? dt : 0)
        rested.set(game, rest)
        if (rest >= DUSK_SECONDS && !(state.flags & F.talked)) talk(game, 'nightfall')
        if (listened) {
          rested.delete(game)
          advance(STEP.bank)
          nightfall(game)
        }
        break
      }
      case STEP.bank:
        walkDog(game)
        if (anyIn(state, 'bank')) once(F.bank, 'night_bank')
        if (players.some((player) => near(player, find(game, 'walker') ?? { x: 1e9, z: 0 }, 22)))
          once(F.walker, 'walker')
        if (players.some((player) => near(player, EXIT, 14))) once(F.drain, 'drain_near')
        if (state.open & 1 && anyIn(state, 'exit')) game.nextStage()
        break
    }
  },
  interact(game: Game, player: Player, held: boolean, pressed: boolean) {
    const { state } = game
    const npc = npcNear(player.x, player.z, 2.6)?.id
    const fresh = !(state.flags & F.talked)
    if (pressed && fresh && npc === 'ponta' && (state.step === STEP.ponta || state.step === STEP.back)) {
      talk(game, state.step === STEP.ponta ? 'ponta_first' : 'ponta_drain')
      return true
    }
    if (held && fresh && state.step === STEP.net && inZone('net', player.x, player.z)) {
      // Tearing plastic rustles: the crows and Tora's gang come to look.
      if (gnaw(game, player, NET_SECONDS, 18, 'net_heard')) talk(game, 'ponta_net')
      return true
    }
    if (pressed && fresh && npc === 'kits' && state.step === STEP.cabbage && player.carrying === 'cabbage') {
      player.carrying = null // eaten: the item stays put away
      talk(game, 'kits_thanks')
      return true
    }
    if (pressed && fresh && npc === 'kurumi' && state.step === STEP.pet) {
      talk(game, 'kurumi_first')
      return true
    }
    if (pressed && fresh && npc === 'poppo' && state.step === STEP.poppo) {
      talk(game, 'poppo_first')
      return true
    }
    if (pressed && fresh && npc === 'poppo' && state.step === STEP.bread && player.carrying === 'bread') {
      player.carrying = null
      talk(game, 'poppo_thanks')
      return true
    }
    if (held && state.step === STEP.bank && !(state.open & 1) && inZone('grate', player.x, player.z)) {
      // A rattling grate carries along the riverside: the dog walker may come by.
      if (gnaw(game, player, GRATE_SECONDS, 24, 'grate_heard')) {
        state.open |= 1
        game.say('grate_open')
      }
      return true
    }
    if (pressed && npc && game.quiet) {
      game.say(`${npc}_idle`)
      return true
    }
    return false
  },
  caught(game, player, predator) {
    game.sendBack(player, predator)
    if (game.quiet) game.say('caught')
  },
  respawn(state: GameState) {
    if (state.step === STEP.alley) return SPAWN
    if (state.step < STEP.road) return { x: -92, z: -38 } // the garbage point
    if (state.step === STEP.road) return { x: -80, z: -39.5 }
    if (state.step === STEP.pet || state.step === STEP.street) return { x: -33.2, z: -21 } // under the bus-stop bench
    if (state.step === STEP.poppo || state.step === STEP.bread) return { x: 38.5, z: 7.8 } // under the last stand
    return SHRINE_HALL // under the raised floor
  },
  objective(state: GameState, player: Player): Objective {
    const goal = GOAL_OF_STEP[state.step] ?? 5
    const listen = (who: string) => ({ title: `${who}の話を聞こう` })
    const talking = state.flags & F.talked
    const { title, hint } = ((): { title: string; hint?: string } => {
      switch (state.step) {
        case STEP.alley:
          return { title: '路地を抜けよう', hint: '段ボールやバケツのそばでしゃがむと、ネコに見つからない' }
        case STEP.ponta:
          return talking ? listen('ポン太') : { title: 'ゴミ置き場のタヌキと話そう', hint: 'ポン太のそばで E' }
        case STEP.net:
          return talking
            ? listen('ポン太')
            : {
                title: 'ネットをかじって穴をあけよう',
                hint: 'ネットの前で E を長押し。音でカラスやネコが来たらかくれよう'
              }
        case STEP.cabbage:
          return talking
            ? listen('タヌキの子どもたち')
            : {
                title: 'キャベツをタヌキの子どもにとどけよう',
                hint:
                  player.carrying === 'cabbage'
                    ? '南の路地のおく。くわえていると遅く、見つかりやすい'
                    : 'ネットの前のキャベツをくわえよう'
              }
        case STEP.back:
          return talking ? listen('ポン太') : { title: 'ポン太のところへもどろう', hint: 'ゴミ置き場で E' }
        case STEP.road:
          return {
            title: '大通りを渡ろう',
            hint: '車のすきまを待つか、歩道の格子ぶたで C（排水管）。出口で SPACE'
          }
        case STEP.pet:
          return talking
            ? listen('くるみ')
            : {
                title: 'ペットショップのハムスターに道をきこう',
                hint: '看板や自転車の下、プランターの花のかげを通ろう'
              }
        case STEP.street:
          return { title: '商店街を抜けよう', hint: '子どもは足がはやい。見つかったら物かげへ' }
        case STEP.poppo:
          return talking ? listen('ポッポ') : { title: '神社でハトのポッポと話そう', hint: '車道を渡って、鳥居の先へ' }
        case STEP.bread:
          return talking
            ? listen('ポッポ')
            : {
                title: 'パンのみみをポッポにとどけよう',
                hint:
                  player.carrying === 'bread'
                    ? 'くわえていると遅く、見つかりやすい'
                    : '商店街の東のはしのパン屋さんにある'
              }
        case STEP.dusk:
          return talking
            ? { title: '日がしずんだ' }
            : { title: '社の床下で日が暮れるのを待とう', hint: '床下なら、だれにも見つからない' }
        default:
          return {
            title: '土手の下の入口へ',
            hint:
              state.open & 1
                ? '格子がひらいた。暗い穴の中へ'
                : '街灯の下は見つかりやすい。さびた格子は E 長押しでかじれる'
          }
      }
    })()
    return { title: `第2章｜${title}`, progress: goal / 6, label: `目標 ${goal + 1} / 6`, hint }
  },
  markers(state: GameState): Marker[] {
    const loose = (id: string) => state.items.find((entry) => entry.id === id && entry.active)
    switch (state.step) {
      case STEP.alley:
        return [{ x: -87, z: -39, kind: 'goal' }]
      case STEP.ponta:
      case STEP.back:
        return [{ ...PONTA, kind: 'npc' }]
      case STEP.net:
        return state.flags & F.talked ? [{ ...PONTA, kind: 'npc' }] : [{ x: -82.5, z: -43, kind: 'goal' }]
      case STEP.cabbage: {
        const cabbage = loose('cabbage')
        return [cabbage ? { x: cabbage.x, z: cabbage.z, kind: 'item' } : { ...KITS, kind: 'npc' }]
      }
      case STEP.road:
        return [{ x: -34, z: -2, kind: 'goal' }]
      case STEP.pet:
        return [{ ...KURUMI, kind: 'npc' }]
      case STEP.street:
        return [{ x: 38, z: 0, kind: 'goal' }]
      case STEP.poppo:
        return [{ ...POPPO, kind: 'npc' }]
      case STEP.bread: {
        const bread = loose('bread')
        return [bread ? { x: bread.x, z: bread.z, kind: 'item' } : { ...POPPO, kind: 'npc' }]
      }
      case STEP.dusk:
        return [{ ...SHRINE_HALL, kind: 'goal' }]
      default:
        return [state.open & 1 ? { ...EXIT, kind: 'goal' } : { ...GRATE_SPOT, kind: 'goal' }]
    }
  }
}
