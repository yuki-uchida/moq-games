import type { ThemeName } from '../api'
import type { SongDef } from '../notation'
import { BOSS } from './boss'
import { ENDING } from './ending'
import { FINAL_BOSS } from './finalBoss'
import { FOREST } from './forest'
import { CLEAR, GAMEOVER } from './jingles'
import { LOBBY } from './lobby'
import { MEADOW } from './meadow'
import { SEWER } from './sewer'
import { TITLE } from './title'
import { TOWER } from './tower'

/** Every theme's score. Per-song `gain` trims (in each file) balance perceived loudness across themes. */
export const SONGS: Record<ThemeName, SongDef> = {
  title: TITLE,
  lobby: LOBBY,
  meadow: MEADOW,
  sewer: SEWER,
  tower: TOWER,
  forest: FOREST,
  boss: BOSS,
  finalBoss: FINAL_BOSS,
  clear: CLEAR,
  gameover: GAMEOVER,
  ending: ENDING
}
