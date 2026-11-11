import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `title` theme. */
export const SONG: SongDef = stubSong('title')
export const KEY: KeyInfo = majorKey(0)
