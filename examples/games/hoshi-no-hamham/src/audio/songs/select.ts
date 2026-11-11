import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `select` theme. */
export const SONG: SongDef = stubSong('select')
export const KEY: KeyInfo = majorKey(0)
