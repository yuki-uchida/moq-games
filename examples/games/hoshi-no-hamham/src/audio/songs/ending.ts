import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `ending` theme. */
export const SONG: SongDef = stubSong('ending')
export const KEY: KeyInfo = majorKey(0)
