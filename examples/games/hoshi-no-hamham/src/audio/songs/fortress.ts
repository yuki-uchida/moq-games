import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `fortress` theme. */
export const SONG: SongDef = stubSong('fortress')
export const KEY: KeyInfo = majorKey(0)
