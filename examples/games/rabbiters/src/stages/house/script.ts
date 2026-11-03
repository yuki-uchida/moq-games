// Chapter 1 「ケージの外へ」: wake up in the cage and wait for Hinata to leave for school, gnaw the latch while
// nobody is near, ask old Tama the way out, fetch her two niboshi from under Mom's nose, find her collar tag in
// the genkan while Hinata searches the house, open the cat flap, cross the garden past Gon and dig the gap under
// the fence wider. Progress lives in GameState (step, flags incl. gnawed/dug seconds and the niboshi count, open
// gates, items); only cooldowns and hold timers are transient.
import type { Game, GameState, Player, Predator } from '../../game'
import { heightAt, inZone, npcNear, type Point } from '../../map'
import { inRect } from '../kit'
import type { Marker, Objective, StageScript } from '../../story'
import { FRONT, driveFamily, investigate, investigating, phaseAt, type Spot } from './family'
import {
  DIG_SECONDS,
  FLAG,
  GNAW_SECONDS,
  NIBOSHI_WANTED,
  dug,
  gnawed,
  has,
  niboshiGiven,
  setDug,
  setGnawed,
  setNiboshiGiven
} from './flags'
import {
  CAGE,
  CAGE_DOOR,
  CATFLAP,
  DOMA_DEPTH,
  EXIT,
  GAP,
  GATE,
  NIBOSHI,
  PELLETS,
  PISUKE,
  SPAWN,
  TAG,
  TAMA
} from './map'

export const STEPS = 6
const PUSH_SECONDS = 1.5
const SQUAWK_COOLDOWN = 45
const GNAW_NOISE = 10
const DIG_NOISE = 14
const SQUAWK_NOISE = 25
const PULL_SECONDS = 3
const FLAP_SECONDS = 3
const RUSTLE_NOISE = 10 // Mom at the sink hears it
const LOOK_AT_PANTRY: Spot = { x: 32, z: -1.5, wait: 6, face: Math.PI }
export const DOOR_INSIDE = { x: CAGE_DOOR.x, z: CAGE_DOOR.z + 0.85 } as const
const LOOK_AT_CAGE: Spot = { x: -30, z: 12.5, wait: 6, face: 0 }
const LOOK_AT_BIRD: Spot = { x: -24, z: 13.5, wait: 6, face: 0 }
const LOOK_AT_GON: Spot = { x: 12, z: 31, wait: 8, face: -Math.PI / 2, look: true }
const LOOK_AT_GAP: Spot = { x: -30, z: 42, wait: 6, face: Math.PI * 0.8, look: true }

type Transient = {
  gnaw: number
  dig: number
  lastHeard: number
  lastScold: number
  squawkAt: number
  gonAt: number
  push: Map<string, number>
  pull: number
  flap: number
}
const transient = new WeakMap<Game, Transient>()
function memo(game: Game): Transient {
  let entry = transient.get(game)
  if (!entry)
    transient.set(
      game,
      (entry = {
        gnaw: 0,
        dig: 0,
        lastHeard: -99,
        lastScold: -99,
        squawkAt: -99,
        gonAt: -99,
        push: new Map(),
        pull: 0,
        flap: 0
      })
    )
  return entry
}

const near = (a: Point, b: Point, reach: number) => Math.hypot(a.x - b.x, a.z - b.z) < reach
const people = (game: Game) => game.state.predators.filter((entry) => entry.kind === 'human' || entry.kind === 'child')
const cageOpen = (state: Pick<GameState, 'open'>) => (state.open & (1 << GATE.cage)) !== 0
const pelletsEaten = (state: GameState) => state.foods.slice(0, PELLETS.length).filter((food) => !food.active).length
const awake = (state: GameState) => state.players.filter((player) => !player.downed)
const inCage = (player: Point) => inRect(player.x, player.z, CAGE)
const item = (id: string, kind: string, at: Point, y = heightAt(at.x, at.z)) => ({ id, kind, ...at, y, active: true })

/** Every person within `radius` of a sound comes over (through the doors) to look. */
function heard(game: Game, x: number, z: number, radius: number, spot: Spot) {
  const coming: Predator[] = []
  for (const person of people(game))
    if (person.state !== 'chase' && near(person, { x, z }, radius)) {
      investigate(game, person, spot)
      coming.push(person)
    }
  return coming
}

/** Holding E at the latch: 30 s in all, a clink every second; anyone close by bends it back a little. */
function gnaw(game: Game, player: Player) {
  const { state } = game
  const memory = memo(game)
  if (!has(state, FLAG.gnawStart)) {
    state.flags |= FLAG.gnawStart
    game.say('gnaw_start', player.id)
  }
  const before = gnawed(state)
  memory.gnaw += 1 / 60
  if (memory.gnaw >= 0.25) {
    setGnawed(state, before + 0.25)
    memory.gnaw -= 0.25
  }
  const after = gnawed(state)
  if (Math.floor(after) > Math.floor(before)) {
    const coming = heard(game, CAGE_DOOR.x, CAGE_DOOR.z, GNAW_NOISE, LOOK_AT_CAGE)
    if (coming.length && state.time - memory.lastHeard > 20 && game.quiet) {
      memory.lastHeard = state.time
      game.say(coming[0].id === 'dad' ? 'gnaw_heard_dad' : 'gnaw_heard')
    }
  }
  if (
    after < GNAW_SECONDS &&
    state.time - memory.lastScold > 10 &&
    people(game).some((person) => near(person, CAGE_DOOR, 6.5))
  ) {
    memory.lastScold = state.time
    setGnawed(state, Math.max(0, after - 8))
    game.say('gnaw_caught', player.id)
  }
  game.work(player, '留め金をかじる', gnawed(state) / GNAW_SECONDS)
  if (gnawed(state) >= GNAW_SECONDS) {
    state.open |= 1 << GATE.cage
    state.flags |= FLAG.latch
    state.step = 2
    game.say('gnaw_done', player.id)
  }
}

/** Holding E at the fence: dig the gap wide enough. Scrabbling carries; Gon and anyone in the garden hear it. */
function dig(game: Game, player: Player) {
  const { state } = game
  const memory = memo(game)
  if (!has(state, FLAG.digStart)) {
    state.flags |= FLAG.digStart
    game.say('dig_start', player.id)
  }
  const before = dug(state)
  memory.dig += 1 / 60
  if (memory.dig >= 0.25) {
    setDug(state, before + 0.25)
    memory.dig -= 0.25
  }
  if (Math.floor(dug(state)) > Math.floor(before)) {
    game.noise(GAP.x, GAP.z, DIG_NOISE)
    heard(game, GAP.x, GAP.z, DIG_NOISE, LOOK_AT_GAP)
  }
  game.work(player, 'すき間を掘る', dug(state) / DIG_SECONDS)
  if (dug(state) >= DIG_SECONDS) {
    state.open |= 1 << GATE.gap
    game.say('dug', player.id)
  }
}

/** Holding E at the pantry: tug a niboshi out of the bag. It rustles, and Mom at the sink may hear it. */
function pull(game: Game, player: Player) {
  const { state } = game
  const memory = memo(game)
  if (memory.pull === 0 && game.quiet && niboshiGiven(state) === 0) game.say('niboshi_bag', player.id)
  const before = memory.pull
  memory.pull += 1 / 60
  if (Math.floor(memory.pull) > Math.floor(before)) {
    const coming = heard(game, NIBOSHI.x, NIBOSHI.z, RUSTLE_NOISE, LOOK_AT_PANTRY)
    if (coming.some((person) => person.id === 'mom') && state.time - memory.lastHeard > 20 && game.quiet) {
      memory.lastHeard = state.time
      game.say('niboshi_heard')
    }
  }
  game.work(player, 'にぼしを引っぱる', memory.pull / PULL_SECONDS)
  if (memory.pull >= PULL_SECONDS) {
    memory.pull = 0
    state.items = [item(`niboshi-${niboshiGiven(state)}`, 'niboshi', NIBOSHI)]
  }
}

function talkTo(game: Game, id: string, player: Player) {
  const { state } = game
  const memory = memo(game)
  if (id === 'pisuke') {
    if (state.step === 0 && !has(state, FLAG.pisuke)) {
      state.flags |= FLAG.pisuke
      game.say('pisuke_first', player.id)
    } else if (state.step < 2) {
      if (game.quiet) game.say('pisuke_again')
    } else if (state.time - memory.squawkAt < SQUAWK_COOLDOWN) {
      if (game.quiet) game.say('pisuke_tired')
    } else {
      // The distraction: Pisuke mimics the doorbell and everyone nearby comes to the living room.
      memory.squawkAt = state.time
      game.say('pisuke_squawk')
      heard(game, PISUKE.x, PISUKE.z, SQUAWK_NOISE, LOOK_AT_BIRD)
    }
    return
  }
  if (id !== 'tama' || !game.quiet || state.step < 2) return
  if (state.step === 2) {
    state.flags |= FLAG.tamaMet
    game.say('tama_first')
  } else if (state.step === 3) game.say('tama_wait')
  else game.say(state.step === 4 ? 'tama_tag' : 'tama_bye')
}

export const script: StageScript = {
  start(game: Game) {
    game.say('intro')
  },

  tick(game: Game, dt: number) {
    const { state } = game
    const memory = memo(game)
    driveFamily(game, dt)
    const players = awake(state)
    // Dad is out at noon and comes home in the afternoon.
    if (!state.predators.some((entry) => entry.id === 'dad') && phaseAt(state.time) !== 'noon')
      game.spawnPredator('human', FRONT.x, FRONT.z, { id: 'dad' })
    // Someone who spots an escaped rabbit tells the family: a Mochi hunt from now on.
    if (
      !has(state, FLAG.search) &&
      state.step >= 2 &&
      people(game).some((person) => person.state === 'chase' && person.targetId)
    ) {
      state.flags |= FLAG.search
      game.say(
        'search_start',
        people(game).find((person) => person.state === 'chase' && person.targetId)?.targetId ?? undefined
      )
    }
    // Gon barks at what he sees; Mom comes out to have a look.
    const gon = state.predators.find((entry) => entry.id === 'gon')
    const mom = state.predators.find((entry) => entry.id === 'mom')
    if (gon && mom && gon.state !== 'patrol' && state.time - memory.gonAt > 30 && !investigating(game, 'mom')) {
      memory.gonAt = state.time
      investigate(game, mom, LOOK_AT_GON)
      if (game.quiet) game.say('gon_heard')
    }

    switch (state.step) {
      case 0: {
        if (!has(state, FLAG.pellets) && pelletsEaten(state) >= PELLETS.length) {
          state.flags |= FLAG.pellets
          game.say('eat_done')
        }
        // Finish breakfast and Pisuke's conversation, then send Hinata to school without a clock-based wait.
        if (
          (state.flags & (FLAG.pellets | FLAG.pisuke)) === (FLAG.pellets | FLAG.pisuke) &&
          !has(state, FLAG.bye) &&
          game.quiet
        ) {
          if (!has(state, FLAG.morningCall)) {
            state.flags |= FLAG.morningCall
            game.say('morning_call')
          } else {
            state.flags |= FLAG.bye
            game.say('hinata_leaves')
          }
        }
        if (has(state, FLAG.bye) && game.quiet && !state.predators.some((entry) => entry.id === 'hinata'))
          state.step = 1
        break
      }
      case 2:
        // Tama says what she wants; then the errand begins.
        if (has(state, FLAG.tamaMet) && game.quiet) state.step = 3
        break
      case 3: {
        const carrier = players.find((player) => player.carrying?.startsWith('niboshi'))
        if (carrier && !has(state, FLAG.niboshiGot)) {
          state.flags |= FLAG.niboshiGot
          game.say('niboshi_got', carrier.id)
        }
        if (carrier && near(carrier, TAMA, 2.8)) {
          carrier.carrying = null
          const given = niboshiGiven(state) + 1
          setNiboshiGiven(state, given)
          state.items = []
          if (given < NIBOSHI_WANTED) game.say('niboshi_more')
          else {
            state.flags |= FLAG.fed
            game.say('niboshi_given')
          }
        }
        if (has(state, FLAG.fed) && game.quiet) {
          state.step = 4
          state.items = [item('tag', 'tag', TAG, DOMA_DEPTH)]
        }
        break
      }
      case 4: {
        if (!has(state, FLAG.hinataHome)) {
          // Hinata is back from school, and finds the cage empty.
          state.flags |= FLAG.hinataHome | FLAG.search
          game.spawnPredator('child', FRONT.x, FRONT.z, { id: 'hinata' })
          game.say('hinata_home')
        }
        const carrier = players.find((player) => player.carrying === 'tag')
        if (carrier && !has(state, FLAG.tagGot)) {
          state.flags |= FLAG.tagGot
          game.say('tag_got', carrier.id)
        }
        break
      }
      case 5: {
        const outside = players.find((player) => inZone('garden', player.x, player.z))
        if (!has(state, FLAG.garden) && outside) {
          state.flags |= FLAG.garden
          game.say('garden_enter', outside.id)
        }
        // Everyone still on their feet squeezes through together (downed rabbits are carried along).
        const out = players.filter((player) => inZone('exit', player.x, player.z))
        if (!has(state, FLAG.exiting) && out.length && out.length === players.length) {
          state.flags |= FLAG.exiting
          game.say('fence_exit')
        }
        if (has(state, FLAG.exiting) && game.quiet) game.nextStage()
        break
      }
    }
  },

  interact(game: Game, player: Player, held: boolean, pressed: boolean) {
    const { state } = game
    const memory = memo(game)
    if (state.step === 1 && held && inCage(player) && near(player, DOOR_INSIDE, 1.4)) {
      gnaw(game, player)
      return true
    }
    if (
      state.step === 3 &&
      held &&
      !state.items.length &&
      !state.players.some((entry) => entry.carrying?.startsWith('niboshi')) &&
      inZone('pantry', player.x, player.z)
    ) {
      pull(game, player)
      return true
    }
    if (state.step === 4 && held && player.carrying === 'tag' && inZone('catflap', player.x, player.z)) {
      // Press the tag to the cat flap until it clicks.
      if (memory.flap === 0) game.say('catflap_press', player.id)
      memory.flap += 1 / 60
      game.work(player, 'タグを押しあてる', memory.flap / FLAP_SECONDS)
      if (memory.flap >= FLAP_SECONDS) {
        memory.flap = 0
        player.carrying = null
        state.items = []
        state.open |= 1 << GATE.catflap
        state.step = 5
        game.say('catflap_open', player.id)
      }
      return true
    }
    if (state.step === 5 && held && !(state.open & (1 << GATE.gap)) && inZone('dig', player.x, player.z)) {
      dig(game, player)
      return true
    }
    // The broken latch: a rabbit put back in the cage pushes the door open again.
    if (has(state, FLAG.latch) && !cageOpen(state) && held && near(player, CAGE_DOOR, 1.5)) {
      const pushed = (memory.push.get(player.id) ?? 0) + 1 / 60
      memory.push.set(player.id, pushed)
      game.work(player, '扉を押す', pushed / PUSH_SECONDS)
      if (pushed >= PUSH_SECONDS) {
        memory.push.delete(player.id)
        state.open |= 1 << GATE.cage
        if (game.quiet) game.say('door_push', player.id)
      }
      return true
    }
    const npc = pressed ? npcNear(player.x, player.z, 2.5) : undefined
    if (npc) {
      talkTo(game, npc.id, player)
      return true
    }
    return false
  },

  caught(game: Game, player: Player, predator: Predator) {
    // Picked up and put back in the cage; the family is on the lookout now.
    game.sendBack(player, predator)
    const { state } = game
    state.open &= ~(1 << GATE.cage)
    state.flags |= FLAG.search
    if (game.quiet) game.say(`caught-${predator.id}`, player.id)
  },

  respawn: () => SPAWN,

  objective(state: GameState, player: Player): Objective {
    const step = Math.min(state.step, STEPS - 1)
    const label = `目標 ${step + 1} / ${STEPS}`
    const at = (progress: number) => (step + Math.max(0, Math.min(1, progress))) / STEPS
    const carrying = player.carrying ?? ''
    let objective: Objective
    switch (state.step) {
      case 0:
        objective = !has(state, FLAG.pellets)
          ? {
              title: '第1章｜ペレットを3つ食べよう',
              progress: at(pelletsEaten(state) / 6),
              label: `${label} · ペレット ${pelletsEaten(state)} / 3`,
              hint: 'WASD で歩いて、ケージの中のペレットを食べよう'
            }
          : !has(state, FLAG.pisuke)
            ? {
                title: '第1章｜となりのピーすけと話そう',
                progress: at(0.5),
                label,
                hint: '鳥かごに近いケージのはしで E を押す'
              }
            : {
                title: '第1章｜ひなたが学校へ行くのを待とう',
                progress: at(has(state, FLAG.bye) ? 0.95 : has(state, FLAG.morningCall) ? 0.8 : 0.6),
                label,
                hint: has(state, FLAG.bye)
                  ? 'ひなたが玄関へ向かっているよ。出かけたら留め金をかじろう'
                  : '話を聞いている間に、ひなたが学校へ行く準備をするよ'
              }
        break
      case 1:
        objective = {
          title: '第1章｜ケージの留め金をかじろう',
          progress: at(gnawed(state) / GNAW_SECONDS),
          label: `${label} · ${Math.floor((gnawed(state) / GNAW_SECONDS) * 100)}%`,
          hint: '扉のそばで E を長押し。音がするので、人がいない時に'
        }
        break
      case 2:
        objective = {
          title: '第1章｜和室のタマに会いに行こう',
          progress: at(has(state, FLAG.tamaMet) ? 0.8 : 0),
          label,
          hint: has(state, FLAG.tamaMet)
            ? 'タマの話を聞こう'
            : '廊下の先の和室。ソファやテーブルの下（C でしゃがむ）に隠れながら'
        }
        break
      case 3: {
        const count = `煮干し ${niboshiGiven(state)} / ${NIBOSHI_WANTED}`
        objective = carrying.startsWith('niboshi')
          ? {
              title: '第1章｜煮干しをタマに届けよう',
              progress: at((niboshiGiven(state) + 0.6) / NIBOSHI_WANTED),
              label: `${label} · ${count}`,
              hint: 'くわえている間は遅く、目立つ。冷蔵庫の裏のネズミ穴は押し入れへの近道'
            }
          : {
              title: '第1章｜台所の煮干しを取ってこよう',
              progress: at(niboshiGiven(state) / NIBOSHI_WANTED),
              label: `${label} · ${count}`,
              hint: '流し台の手前、低い棚の下で E 長押し。ガサガサ音がするので、お母さんの背中を見て'
            }
        break
      }
      case 4:
        objective =
          carrying === 'tag'
            ? {
                title: '第1章｜タグを洗面所の猫ドアへ',
                progress: at(0.6),
                label,
                hint: '猫ドアの前で E を長押し。ひなたが探している、見つからないように'
              }
            : {
                title: '第1章｜玄関の靴箱の下でタグを探そう',
                progress: at(0.2),
                label,
                hint: '土間へおりて、C でしゃがんで靴箱の下へ。上がるときは SPACE'
              }
        break
      default: {
        const open = (state.open & (1 << GATE.gap)) !== 0
        const waiting = inZone('exit', player.x, player.z)
        objective = {
          title: open ? '第1章｜フェンスのすき間から外へ' : '第1章｜庭を抜けて、フェンスのすき間をほろう',
          progress: at(open ? 0.85 : 0.2 + (0.6 * dug(state)) / DIG_SECONDS),
          label: open ? label : `${label} · ほる ${Math.floor((dug(state) / DIG_SECONDS) * 100)}%`,
          hint: waiting
            ? 'きょうだいがそろうのを待とう'
            : open
              ? 'C でしゃがんで、すき間をくぐろう'
              : 'ゴンの鎖の届かないところを通ろう。すき間の前で E を長押ししてほる'
        }
      }
    }
    if (has(state, FLAG.latch) && !cageOpen(state) && inCage(player))
      objective = { ...objective, hint: 'もどされちゃった。扉のそばで E を長押しして押しあけよう' }
    else if (player.hunger < 30) objective = { ...objective, hint: 'おなかがすいた。台所の野菜くずや庭の畑へ' }
    return objective
  },

  markers(state: GameState): Marker[] {
    const live = state.items.find((entry) => entry.active)
    switch (state.step) {
      case 0:
        if (!has(state, FLAG.pellets))
          return state.foods
            .slice(0, PELLETS.length)
            .filter((food) => food.active)
            .map((food) => ({ x: food.x, z: food.z, kind: 'item' as const }))
        return has(state, FLAG.pisuke) ? [{ ...DOOR_INSIDE, kind: 'goal' }] : [{ ...PISUKE, kind: 'npc' }]
      case 1:
        return [{ ...DOOR_INSIDE, kind: 'goal' }]
      case 2:
        return [{ ...TAMA, kind: 'npc' }]
      case 3:
        return live
          ? [{ x: live.x, z: live.z, kind: 'item' }]
          : state.players.some((entry) => entry.carrying?.startsWith('niboshi'))
            ? [{ ...TAMA, kind: 'npc' }]
            : [{ ...NIBOSHI, kind: 'goal' }]
      case 4:
        return live ? [{ x: live.x, z: live.z, kind: 'item' }] : [{ ...CATFLAP, kind: 'goal' }]
      default:
        return [{ ...(state.open & (1 << GATE.gap) ? EXIT : GAP), kind: 'goal' }]
    }
  }
}
