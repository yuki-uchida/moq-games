import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `cave` theme. */
export const SONG: SongDef = stubSong('cave')
export const KEY: KeyInfo = majorKey(0)
