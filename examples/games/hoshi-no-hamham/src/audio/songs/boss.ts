import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `boss` theme. */
export const SONG: SongDef = stubSong('boss')
export const KEY: KeyInfo = majorKey(0)
