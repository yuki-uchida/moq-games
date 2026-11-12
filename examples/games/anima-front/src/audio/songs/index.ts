import type { ThemeName } from '../api'
import type { SongDef } from '../notation'
import * as blight from './blight'
import * as boss from './boss'
import * as briefing from './briefing'
import * as credits from './credits'
import * as finalBoss from './finalBoss'
import * as harbor from './harbor'
import { LOSE, LOSE_KEY, WIN, WIN_KEY } from './jingles'
import * as menu from './menu'
import * as night from './night'
import * as oldtown from './oldtown'
import * as pvp from './pvp'
import * as title from './title'
import * as training from './training'
import { isStub, type KeyInfo } from './util'

/** Every theme's score. Per-song `gain` trims (in each file) balance perceived loudness across themes. */
export const SONGS: Record<ThemeName, SongDef> = {
  title: title.SONG,
  menu: menu.SONG,
  briefing: briefing.SONG,
  oldtown: oldtown.SONG,
  harbor: harbor.SONG,
  night: night.SONG,
  blight: blight.SONG,
  boss: boss.SONG,
  finalBoss: finalBoss.SONG,
  pvp: pvp.SONG,
  training: training.SONG,
  win: WIN,
  lose: LOSE,
  credits: credits.SONG
}

/** The key each score is checked against. */
export const KEYS: Record<ThemeName, KeyInfo> = {
  title: title.KEY,
  menu: menu.KEY,
  briefing: briefing.KEY,
  oldtown: oldtown.KEY,
  harbor: harbor.KEY,
  night: night.KEY,
  blight: blight.KEY,
  boss: boss.KEY,
  finalBoss: finalBoss.KEY,
  pvp: pvp.KEY,
  training: training.KEY,
  win: WIN_KEY,
  lose: LOSE_KEY,
  credits: credits.KEY
}

/** Themes that still play their stand-in score. */
export const pendingSongs = (): ThemeName[] => (Object.keys(SONGS) as ThemeName[]).filter((t) => isStub(SONGS[t]))
