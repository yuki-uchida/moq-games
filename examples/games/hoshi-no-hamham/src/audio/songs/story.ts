import type { SongDef } from '../notation'
import { majorKey, stubSong, type KeyInfo } from './util'

/** The `story` theme. */
export const SONG: SongDef = stubSong('story')
export const KEY: KeyInfo = majorKey(0)
