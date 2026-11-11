import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `meadow` theme. */
export const SONG: SongDef = stubSong('meadow')
export const KEY: KeyInfo = majorKey(0)
