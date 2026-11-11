import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `forest` theme. */
export const SONG: SongDef = stubSong('forest')
export const KEY: KeyInfo = majorKey(0)
