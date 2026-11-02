// The four chapters in story order. Each folder owns its map, script, dialogue, look and scenery.
import { talkLine, type StageDef } from '../story'
import house from './house'
import town from './town'
import waterway from './waterway'
import forest from './forest'

export const STAGES: readonly StageDef[] = [house, town, waterway, forest]
/** Shared speaker names; a stage's `names` override these. */
export const DEFAULT_NAMES: Record<string, string> = { rabbit: 'モチ', narrator: '' }
export const speakerName = (stage: number, who: string) =>
  (Object.hasOwn(STAGES[stage].names, who) ? STAGES[stage].names[who] : DEFAULT_NAMES[who]) ?? who

/** `{name}` → the rabbit a line is about; `{rabbits}` → モチ alone, モチたち with siblings in the room. */
export const fillNames = (text: string, name: string, rabbits: number) =>
  text.replaceAll('{name}', name).replaceAll('{rabbits}', rabbits > 1 ? 'モチたち' : 'モチ')

/**
 * The line being spoken, the same on every client: 'rabbit' lines come from the rabbit the talk is about (`talk.by`,
 * else the host's), never from whoever is watching. `speaker` is the scene actor key of whoever says it.
 */
export function spokenLine(
  stage: number,
  state: {
    time: number
    talk?: { id: string; at: number; by?: string } | null
    players: readonly { id: string; name: string }[]
  }
) {
  const line = talkLine(STAGES[stage].conversations, state.talk, state.time)
  if (!line) return undefined
  const rabbit = state.players.find((player) => player.id === state.talk?.by) ?? state.players[0]
  const name = rabbit?.name ?? DEFAULT_NAMES.rabbit
  return {
    who: line.who,
    name: line.who === 'rabbit' ? name : speakerName(stage, line.who),
    speaker: line.who === 'rabbit' ? rabbit && `player:${rabbit.id}` : line.who,
    text: fillNames(line.text, name, state.players.length)
  }
}
