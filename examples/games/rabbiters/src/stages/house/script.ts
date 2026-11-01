// PLACEHOLDER chapter 1: talk to Pisuke, then slip out of the front door.
import { npcNear, inZone, ZONES } from '../../map'
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
    if (!pressed || game.state.step !== 0 || npcNear(player.x, player.z, 2.5)?.id !== 'pisuke') return false
    game.say('pisuke')
    game.state.step = 1
    return true
  },
  objective(state: GameState) {
    return state.step === 0
      ? { title: '第1章｜ピーすけと話そう', progress: 0, label: '目標 1 / 2', hint: '鳥かごのそばで E を押す' }
      : { title: '第1章｜ドアから外へ', progress: 0.5, label: '目標 2 / 2', hint: 'お母さんに見つからないように' }
  },
  markers(state: GameState) {
    if (state.step === 0) return [{ x: -15, z: -10, kind: 'npc' }]
    const exit = ZONES.find((zone) => zone.id === 'exit')!
    return [{ x: (exit.minX + exit.maxX) / 2, z: (exit.minZ + exit.maxZ) / 2, kind: 'goal' }]
  }
}
