import { Game } from '../src/game'
import { STAGES } from '../src/stages'
import { HouseBot } from './house-bot'

const HOUSE = 0

/** Plays chapter 1 with one bot per rabbit; returns minutes of game time (Infinity if it did not clear). */
export function play(seed: number, rabbits: number, threats: boolean, limitMinutes: number) {
  const game = new Game(seed, undefined, HOUSE)
  for (let index = 0; index < rabbits; index++) game.addPlayer(`r${index}`, `R${index}`)
  const bots = game.state.players.map((player) => new HouseBot(game, player.id, threats))
  let catches = 0
  const caught = STAGES[HOUSE].script.caught!
  STAGES[HOUSE].script.caught = (...args) => {
    catches++
    caught(...args)
  }
  try {
    for (let frame = 0; frame < limitMinutes * 3600 && game.state.stage === HOUSE; frame++) {
      if (!threats) game.state.predators = []
      if (game.state.phase !== 'playing') break
      for (const bot of bots) game.setInput(bot.id, bot.input())
      game.step(1 / 60)
    }
  } finally {
    STAGES[HOUSE].script.caught = caught
  }
  return { minutes: game.state.stage === HOUSE ? Infinity : game.state.time / 60, catches, game }
}
