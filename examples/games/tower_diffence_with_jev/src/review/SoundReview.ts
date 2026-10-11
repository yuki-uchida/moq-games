import { SoundPlayer } from '../audio/SoundPlayer'
import { soundCatalog } from '../audio/SoundCatalog'
import type { CombatSoundEvent } from '../game/CombatSoundEvents'
import { ALLY_TYPES, ENEMY_TYPES, CONFIG, type UnitType } from '../game/model'
import { createRangedReviewScene } from './RangedScene'
import { createBreathReviewScene } from './PresentationScene'

const catalog = soundCatalog(new URL('../../../tower-defense-sfx/', document.baseURI))
const player = new SoundPlayer(catalog, (status) => {
  document.getElementById('audio-status')!.textContent = JSON.stringify(status)
})
let enabled = true
let session: ReturnType<typeof createRangedReviewScene> | ReturnType<typeof createBreathReviewScene> | undefined
let emitted: CombatSoundEvent[] = []
const snapshot = () => ({
  audio: player.diagnostics,
  simulation: session?.engine.state.time ?? 0,
  targetHp: session?.target.hp ?? null,
  slowUntil: session?.target.slowUntil ?? 0,
  events: structuredClone(emitted)
})
const display = () => {
  document.getElementById('audio-result')!.textContent = JSON.stringify(snapshot(), null, 2)
}
document.getElementById('audio-unlock')!.onclick = () => void player.unlock().then(display)
document.getElementById('audio-mute')!.onclick = () => {
  enabled = !enabled
  player.setEnabled(enabled)
  display()
}
document.getElementById('audio-retry')!.onclick = () => player.retryFailed()
Object.assign(window, {
  soundReview: {
    snapshot,
    prepare: (role: UnitType, breath = false) => {
      if (![...ALLY_TYPES, ...ENEMY_TYPES].includes(role) || (breath && role !== 'dragon'))
        throw new Error('Invalid sound review role')
      session = breath ? createBreathReviewScene('e') : createRangedReviewScene(role, 'e', { distance: 30 })
      emitted = []
      player.setBattle(session.engine.state.battleId, session.engine.state.stage)
      display()
      return snapshot()
    },
    advance: (seconds: number) => {
      if (!session || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3) throw new Error('Invalid review step')
      for (let i = 0; i < Math.round(seconds / CONFIG.step); i++) {
        session.engine.update(CONFIG.step)
        const events = session.engine.takeCombatSounds()
        emitted.push(...events)
        player.consume(events, session.engine.state.time)
      }
      display()
      return snapshot()
    },
    replay: () => {
      if (session) player.consume(emitted, session.engine.state.time)
      return snapshot()
    },
    cancel: () => {
      if (session) session.target.hp = 0
    }
  }
})
