// PLACEHOLDER chapter 2: talk to Poppo, cross the road, reach the drain under the bank.
import { inZone, npcNear, ZONES } from '../../map'
import type { Game, GameState, Player } from '../../game'
import type { StageScript } from '../../story'

export const script: StageScript = {
  start(game: Game) {
    game.say('intro')
  },
  tick(game: Game) {
    const { state } = game
    if (state.step === 1 && state.players.some((player) => !player.downed && inZone('exit', player.x, player.z)))
      game.nextStage()
  },
  interact(game: Game, player: Player, _held: boolean, pressed: boolean) {
    if (!pressed || game.state.step !== 0 || npcNear(player.x, player.z, 2.5)?.id !== 'poppo') return false
    game.say('poppo')
    game.state.step = 1
    return true
  },
  objective(state: GameState) {
    return state.step === 0
      ? {
          title: '第2章｜ハトのポッポに道をきこう',
          progress: 0,
          label: '目標 1 / 2',
          hint: '車に気をつけて道をわたろう'
        }
      : { title: '第2章｜土手の下の入口へ', progress: 0.5, label: '目標 2 / 2' }
  },
  markers(state: GameState) {
    if (state.step === 0) return [{ x: 28, z: -8, kind: 'npc' }]
    const exit = ZONES.find((zone) => zone.id === 'exit')!
    return [{ x: (exit.minX + exit.maxX) / 2, z: (exit.minZ + exit.maxZ) / 2, kind: 'goal' }]
  }
}
