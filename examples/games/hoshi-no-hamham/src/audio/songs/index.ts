import type { ThemeName } from '../api'
import type { SongDef } from '../notation'
import * as boss from './boss'
import * as castle from './castle'
import * as cave from './cave'
import * as ending from './ending'
import * as finalBoss from './finalBoss'
import * as forest from './forest'
import * as fortress from './fortress'
import * as meadow from './meadow'
import * as night from './night'
import * as select from './select'
import * as star from './star'
import * as story from './story'
import * as title from './title'
import { CLEAR, CLEAR_KEY, GAMEOVER, GAMEOVER_KEY } from './jingles'
import { isStub, type KeyInfo } from './util'

/** Every theme's score. Per-song `gain` trims (in each file) balance perceived loudness across themes. */
export const SONGS: Record<ThemeName, SongDef> = {
  title: title.SONG,
  select: select.SONG,
  story: story.SONG,
  meadow: meadow.SONG,
  night: night.SONG,
  cave: cave.SONG,
  forest: forest.SONG,
  fortress: fortress.SONG,
  castle: castle.SONG,
  star: star.SONG,
  boss: boss.SONG,
  finalBoss: finalBoss.SONG,
  ending: ending.SONG,
  clear: CLEAR,
  gameover: GAMEOVER
}

/** The key each score is checked against. */
export const KEYS: Record<ThemeName, KeyInfo> = {
  title: title.KEY,
  select: select.KEY,
  story: story.KEY,
  meadow: meadow.KEY,
  night: night.KEY,
  cave: cave.KEY,
  forest: forest.KEY,
  fortress: fortress.KEY,
  castle: castle.KEY,
  star: star.KEY,
  boss: boss.KEY,
  finalBoss: finalBoss.KEY,
  ending: ending.KEY,
  clear: CLEAR_KEY,
  gameover: GAMEOVER_KEY
}

/** Themes that still play their stand-in score. */
export const pendingSongs = (): ThemeName[] => (Object.keys(SONGS) as ThemeName[]).filter((t) => isStub(SONGS[t]))
