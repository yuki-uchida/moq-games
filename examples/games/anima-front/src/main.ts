/** Entry point: styles, then the app shell (src/app). `?hud-demo` (dev server only) opens the HUD demo. */
import './ui/styles/base.css'
import './ui/styles/screens.css'
import './ui/styles/loadout.css'
import './ui/styles/hud.css'
import './ui/styles/touch.css'
import './ui/styles/polish.css'
import { startApp, type AppOptions } from './app/app'
import { LOCAL_PLAYER_ID } from './app/lobby'
import { buildSeats, matchConfig, type MatchSelection } from './app/match'
import { resolveLoadout, loadArmory } from './app/saves'
import { browserStore } from './app/storage'
import { debugEnabled } from './app/debug'
import { SPECIES } from './data/species'
import type { ModeId } from './sim/types'

const root = document.getElementById('app')
const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

async function main() {
  if (!root) return
  const params = new URLSearchParams(location.search)
  const options: AppOptions = {
    debug: debugEnabled(isDev),
    attract: params.get('attract') !== '0'
  }
  if (isDev && params.has('hud-demo')) {
    const { createDemoSession } = await import('./ui/hud/demo')
    const raw = params.get('hud-demo')
    const mode: ModeId = raw === 'pvp' || raw === 'training' ? raw : 'pve'
    const end = Number(params.get('end') ?? 'Infinity')
    const selection: MatchSelection =
      mode === 'pve'
        ? { mode, mission: 'sakura', difficulty: 'normal' }
        : mode === 'training'
          ? { mode, training: { tutorial: true, infiniteAnima: false } }
          : { mode }
    const armory = loadArmory(browserStore())
    const { loadout, name } = resolveLoadout(armory, 'shiba')
    const seats = buildSeats(selection, {
      id: LOCAL_PLAYER_ID,
      name: SPECIES.shiba.name,
      species: 'shiba',
      loadout,
      loadoutName: name
    })
    const config = matchConfig(selection, seats, 1)
    options.initial = {
      name: 'game',
      args: {
        selection,
        start: { config, me: LOCAL_PLAYER_ID, connect: () => createDemoSession(config, LOCAL_PLAYER_ID, end) }
      }
    }
  }
  startApp(root, options)
}

void main()
