import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `castle` theme. */
export const SONG: SongDef = stubSong('castle')
export const KEY: KeyInfo = majorKey(0)
