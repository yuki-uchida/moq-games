import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `star` theme. */
export const SONG: SongDef = stubSong('star')
export const KEY: KeyInfo = majorKey(0)
