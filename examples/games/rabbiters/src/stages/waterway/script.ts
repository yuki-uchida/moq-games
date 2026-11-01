// PLACEHOLDER chapter 3: hold E at the valve to open the floodgate, talk to Genji, leave by the outfall.
import { inZone, npcNear, ZONES } from '../../map'
import type { Game, GameState, Player } from '../../game'
import type { StageScript } from '../../story'

const VALVE_SECONDS = 3
// ponytail: valve progress is per-session script state; a retry just turns it again.
const turning = new Map<string, number>()
const centre = (id: string) => {
  const zone = ZONES.find((entry) => entry.id === id)!
  return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }
}

export const script: StageScript = {
  start(game: Game) {
    turning.clear()
    game.say('intro')
  },
  tick(game: Game) {
    const { state } = game
    if (state.step === 2 && state.players.some((player) => !player.downed && inZone('exit', player.x, player.z)))
      game.nextStage()
  },
  interact(game: Game, player: Player, held: boolean, pressed: boolean) {
    const { state } = game
    if (state.step === 0 && held && inZone('valve', player.x, player.z)) {
      const turned = (turning.get(player.id) ?? 0) + 1 / 60
      turning.set(player.id, turned)
      if (turned >= VALVE_SECONDS) {
        state.open |= 1
        state.step = 1
        game.say('gate')
        game.noise(player.x, player.z, 12)
      }
      return true
    }
    if (state.step === 1 && pressed && npcNear(player.x, player.z, 2.5)?.id === 'genji') {
      game.say('genji')
      state.step = 2
      return true
    }
    return false
  },
  objective(state: GameState) {
    return state.step === 0
      ? {
          title: '第3章｜バルブを回して水門を開けよう',
          progress: 0,
          label: '目標 1 / 3',
          hint: 'バルブのそばで E を長押し'
        }
      : state.step === 1
        ? { title: '第3章｜カメのゲンじいと話そう', progress: 1 / 3, label: '目標 2 / 3' }
        : { title: '第3章｜排水口から外へ', progress: 2 / 3, label: '目標 3 / 3' }
  },
  markers(state: GameState) {
    const at = state.step === 0 ? centre('valve') : state.step === 1 ? { x: 26, z: 7 } : centre('exit')
    return [{ ...at, kind: state.step === 1 ? 'npc' : 'goal' }]
  }
}
