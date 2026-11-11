import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The stage clear jingle. */
export const CLEAR: SongDef = stubSong('clear', true)
export const CLEAR_KEY: KeyInfo = majorKey(0)

/** The game over jingle. */
export const GAMEOVER: SongDef = stubSong('gameover', true)
export const GAMEOVER_KEY: KeyInfo = majorKey(0)
