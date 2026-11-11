import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `night` theme. */
export const SONG: SongDef = stubSong('night')
export const KEY: KeyInfo = majorKey(0)
