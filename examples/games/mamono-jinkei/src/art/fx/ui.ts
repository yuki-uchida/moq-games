/** Sheet `ui`: HUD hearts, resource glyphs, job and species icons, cursor, pips, off-screen arrows and the prompt bubble. */
import { TURNS, UI_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, ball, outlineWith, type Ramp } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { JOBS, SPECIES } from '../../vocab'
import { glyphRaster } from './font'
import { gemRaster } from './items'
import { TAU, roundRect, shadeMask, sparkle } from './util'

const make = (name: string, fr: Raster[]): Anim => {
  const s = UI_SPEC[name]
  return anim(fr, s.fps, s.loop)
}

const HEART = [
  '..####..####..',
  '.######.######.',
  '##############',
  '##############',
  '##############',
  '.############.',
  '..##########..',
  '...########...',
  '....######....',
  '.....####.....',
  '......##......'
]

function heartMask(): Raster {
  const m = new Raster(16, 16)
  HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') m.set(x + 1, y + 2, 1)
  })
  return m
}

function hudHeart(kind: 'full' | 'half' | 'empty'): Raster {
  const m = heartMask()
  const full = shadeMask(m, R.jobRed)
  const empty = new Raster(16, 16)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (m.get(x, y)) empty.set(x, y, !m.get(x + 1, y) || !m.get(x, y + 1) ? R.clothBlack[2] : R.clothBlack[1])
  const r = new Raster(16, 16)
  if (kind === 'empty') r.blit(empty)
  else if (kind === 'full') r.blit(full)
  else {
    r.blit(empty)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) if (full.get(x, y)) r.set(x, y, full.get(x, y))
  }
  if (kind !== 'empty') {
    r.paint(3, 5, C.white)
    r.paint(4, 5, C.white)
    r.paint(3, 6, C.white)
  } else r.paint(3, 5, R.clothBlack[0])
  outlineWith(r, kind === 'empty' ? C.inkCool : C.inkWarm, false)
  return r
}

function keyIcon(): Raster {
  const m = new Raster(16, 16)
  m.ellipse(5.5, 5.5, 3.6, 3.6, 1)
  m.thick(7.5, 7.5, 12, 12, 2, 1)
  m.rect(10, 12, 2, 2, 1)
  m.rect(12, 10, 2, 2, 1)
  const r = shadeMask(m, R.gold)
  r.ellipse(5.5, 5.5, 1.3, 1.3, 0)
  r.paint(3, 3, C.white)
  r.paint(4, 2, C.white)
  outlineWith(r, C.inkWarm, false)
  return r
}

const badge = (ramp: Ramp) => {
  const r = shadeMask(roundRect(24, 24, 1, 1, 22, 22, 6), ramp)
  return r
}

/** Draws the symbol layer first, outlines it so it reads on the badge, and lays it over. */
function icon(ramp: Ramp, draw: (l: Raster) => void) {
  const r = badge(ramp)
  const l = new Raster(24, 24)
  draw(l)
  outlineWith(l, ramp[4], false)
  r.blit(l)
  outlineWith(r, C.inkCool, false)
  return r
}

function swordIcon() {
  return icon(R.jobRed, (l) => {
    l.thick(17.5, 5.5, 9, 14, 3.4, R.steel[2])
    l.thick(17, 5.5, 9, 13.5, 2.6, R.steel[1])
    l.thick(16.6, 6, 10, 12.8, 1.2, C.white)
    l.poly([19.5, 3.5, 20.5, 8, 15.5, 3.5], C.white)
    l.thick(7, 12, 12, 17, 2.4, R.gold[1])
    l.set(7, 12, R.gold[0])
    l.thick(9.5, 14.5, 6, 18, 2.4, R.wood[1])
    l.ellipse(5.2, 18.8, 1.5, 1.5, R.gold[1])
  })
}

function mageIcon() {
  return icon(R.jobBlue, (l) => {
    l.thick(6.5, 18.5, 14, 11, 2.2, R.wood[1])
    l.thick(6.3, 18.3, 13.8, 10.8, 0.8, R.wood[0])
    l.poly([16, 3.5, 20, 8, 16, 13, 12, 8], R.magic[1])
    l.poly([16, 3.5, 12, 8, 16, 8], R.magic[0])
    l.poly([16, 8, 20, 8, 16, 13], R.magic[2])
    l.set(14, 6, C.white)
    l.set(14, 5, C.white)
    sparkle(l, 20, 14, 2, C.white, C.white, R.magic[0])
    l.set(8, 7, C.white)
  })
}

function archerIcon() {
  return icon(R.jobGreen, (l) => {
    l.ring(11, 12, 7, 9.3, R.wood[1], -1.15, 1.15)
    l.ring(11, 12, 7, 8.2, R.wood[0], -1.15, 0.2)
    const x = 11 + Math.cos(1.15) * 8
    const y0 = 12 - Math.sin(1.15) * 8
    l.line(x, y0, x, 12 + Math.sin(1.15) * 8, C.white)
    l.line(4.5, 12, 19, 12, R.wood[2])
    l.line(4.5, 11, 19, 11, R.wood[1])
    l.poly([21.5, 11.6, 17, 8.8, 17.5, 11.6, 17, 14.4], R.steel[0])
    l.poly([4, 11.5, 2.5, 9, 6.5, 9.5, 7, 11.5], R.jobGreen[0])
    l.poly([4, 11.5, 2.5, 14, 6.5, 13.5, 7, 11.5], R.jobGreen[0])
  })
}

function clericIcon() {
  const r = badge(R.jobGold)
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8 + 0.4
    const wide = k % 2 === 0
    const e = wide ? 9.6 : 8.4
    r.thick(
      12 + Math.cos(a) * 6.4,
      12 + Math.sin(a) * 6.4,
      12 + Math.cos(a) * e,
      12 + Math.sin(a) * e,
      wide ? 2 : 1.4,
      C.white
    )
  }
  const disc = new Raster(24, 24)
  disc.ellipse(12, 12, 5, 5, R.holy[2])
  disc.ellipse(11.7, 11.7, 4.2, 4.2, R.holy[1])
  disc.ellipse(11.4, 11.4, 2.8, 2.8, R.holy[0])
  outlineWith(disc, R.jobGold[3], false)
  r.blit(disc)
  r.rect(11, 9, 2, 6, C.white)
  r.rect(9, 11, 6, 2, C.white)
  outlineWith(r, C.inkCool, false)
  return r
}

// Species heads ------------------------------------------------------------------------------------------------

const eyes = (r: Raster, y: number, dx = 4) => {
  for (const sx of [-1, 1]) {
    const x = 12 + sx * dx - 1
    r.rect(x, y, 2, 3, C.black)
    r.set(x, y, C.white)
  }
}

function speciesIcon(species: (typeof SPECIES)[number]) {
  const r = new Raster(24, 24)
  if (species === 'slime') {
    r.poly([12, 2, 14.5, 6.5, 9.5, 6.5], R.ice[1])
    ball(r, 12, 14, 10, 8, R.ice)
    r.ellipse(8, 9, 2.4, 1.4, C.white)
    eyes(r, 13)
    r.set(12, 18, R.ice[3])
    r.set(11, 17, R.ice[3])
    r.set(13, 17, R.ice[3])
    r.paint(5, 16, C.blush)
    r.paint(18, 16, C.blush)
  } else if (species === 'rat') {
    for (const sx of [-1, 1]) {
      ball(r, 12 + sx * 7.5, 7, 4.4, 4.4, R.ratFur)
      r.ellipse(12 + sx * 7.5, 7.5, 2.4, 2.4, R.ratPink[1])
    }
    ball(r, 12, 14.5, 8.8, 7.6, R.ratFur)
    r.ellipse(12, 17.5, 3.4, 2.6, R.ratPink[0])
    r.rect(11, 16, 2, 2, R.ratPink[2])
    eyes(r, 11, 4.3)
    for (const sx of [-1, 1]) {
      r.line(12 + sx * 4, 18, 12 + sx * 9.5, 17, R.paper[2])
      r.line(12 + sx * 4, 19, 12 + sx * 9.5, 20, R.paper[2])
    }
  } else if (species === 'crow') {
    ball(r, 12, 12.5, 9.2, 8.8, R.crowFeather)
    r.poly([7, 4.5, 9, 1.5, 11, 4.5], R.crowFeather[1])
    r.poly([11, 4.5, 14, 1, 15.5, 4.8], R.crowFeather[1])
    r.ellipse(8, 8, 3, 2, R.crowSheen[1])
    for (const sx of [-1, 1]) {
      r.ellipse(12 + sx * 4.2, 11.5, 2.5, 2.8, C.white)
      r.rect(12 + sx * 4.2 - 1, 11, 2, 3, C.black)
    }
    r.poly([8.5, 14.5, 15.5, 14.5, 12, 21.5], R.beak[1])
    r.poly([8.5, 14.5, 15.5, 14.5, 12, 17.5], R.beak[0])
    r.line(8.5, 14.5, 12, 21.5, R.beak[3])
  } else {
    r.poly([3, 11, 5, 1.5, 11, 6.5], R.wolfFur[1])
    r.poly([21, 11, 19, 1.5, 13, 6.5], R.wolfFur[2])
    r.poly([5.2, 8, 5.6, 4.5, 8.5, 6.8], R.ratPink[1])
    ball(r, 12, 13.5, 9.4, 8, R.wolfFur)
    r.ellipse(12, 18, 5.4, 3.6, R.wolfCream[1])
    r.ellipse(11.4, 17.6, 3.4, 2, R.wolfCream[0])
    r.rect(10, 15, 4, 2, C.black)
    r.set(10, 15, R.paper[2])
    r.rect(12, 18, 1, 2, R.wolfFur[3])
    for (const sx of [-1, 1]) {
      r.rect(12 + sx * 4.4 - 1, 10, 2, 3, C.black)
      r.set(12 + sx * 4.4 - 1, 10, C.white)
    }
    r.rect(5, 13, 2, 1, R.wolfFur[0])
  }
  outlineWith(r, C.inkCool, false)
  return r
}

// Cursor, pips, arrows, bubble -----------------------------------------------------------------------------------

function cursorFrame(f: number): Raster {
  const r = new Raster(16, 16)
  const rad = f ? 5.6 : 4.6
  r.ring(8, 8, rad - 0.9, rad + 0.5, C.white)
  const gap = f ? 6 : 5
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ])
    for (let k = gap; k < 8; k++)
      r.set(8 + dx * k - (dx < 0 ? 1 : 0) + (dx ? 0 : 0), 8 + dy * k - (dy < 0 ? 1 : 0), C.white)
  r.rect(7, 7, 2, 2, f ? R.fire[1] : C.white)
  outlineWith(r, C.inkCool, false)
  return r
}

function pip(full: boolean): Raster {
  const m = new Raster(12, 12)
  m.rect(1, 5, 2, 3, 1)
  m.rect(3, 2, 2, 3, 1)
  m.rect(7, 2, 2, 3, 1)
  m.rect(9, 5, 2, 3, 1)
  m.rect(4, 7, 4, 1, 1)
  m.rect(3, 8, 6, 2, 1)
  m.rect(4, 10, 4, 1, 1)
  let r: Raster
  if (full) r = shadeMask(m, R.gold)
  else r = m.clone().map(() => R.clothBlack[1])
  outlineWith(r, full ? C.inkWarm : C.inkCool, false)
  return r
}

function offscreenArrow(turn: number): Raster {
  const r = new Raster(16, 16)
  const a = (turn * TAU) / TURNS
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const P = (u: number, v: number): [number, number] => [8 + ux * u - uy * v, 8 + uy * u + ux * v]
  const pts = [P(7.4, 0), P(-3.6, 6), P(-1.2, 0), P(-3.6, -6)]
  // Shaded half (lower-right of the light) in a second layer.
  r.poly(pts.flat(), C.white)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if (r.get(x, y) && (x - 7.5) * 0.6 + (y - 7.5) * 0.8 > 2.2) r.set(x, y, R.paper[2])
  outlineWith(r, C.inkCool, false)
  return r
}

function bubbleFrame(f: number): Raster {
  const r = new Raster(32, 32)
  const o = f ? -1 : 0
  const m = new Raster(32, 32)
  m.ellipse(16, 14 + o, 12, 11.5, 1)
  m.poly([12, 22 + o, 20, 22 + o, 16, 29 + o], 1)
  const body = shadeMask(m, R.paper)
  r.blit(body)
  // Round off the rim shading: a lit inner field.
  r.ellipse(15, 13 + o, 9, 8.5, C.white)
  const e = glyphRaster('E', 'label')
  if (e)
    r.blit(
      e.clone().map(() => (f ? R.jobBlue[2] : R.jobBlue[3])),
      13,
      9 + o
    )
  if (f) sparkle(r, 24, 6, 2, C.white, C.white, R.holy[0])
  outlineWith(r, C.inkCool, false)
  return r
}

export function buildUi(): Sheet {
  const s: Sheet = {
    heart_full: make('heart_full', [hudHeart('full')]),
    heart_half: make('heart_half', [hudHeart('half')]),
    heart_empty: make('heart_empty', [hudHeart('empty')]),
    gem: make('gem', [gemUi()]),
    key: make('key', [keyIcon()]),
    job_sword: make('job_sword', [swordIcon()]),
    job_mage: make('job_mage', [mageIcon()]),
    job_archer: make('job_archer', [archerIcon()]),
    job_cleric: make('job_cleric', [clericIcon()]),
    cursor: make('cursor', [cursorFrame(0), cursorFrame(1)]),
    pip_full: make('pip_full', [pip(true)]),
    pip_empty: make('pip_empty', [pip(false)]),
    bubble: make('bubble', [bubbleFrame(0), bubbleFrame(1)])
  }
  for (const sp of SPECIES) s[`species_${sp}`] = make(`species_${sp}`, [speciesIcon(sp)])
  for (let a = 0; a < TURNS; a++) s[`offscreen_${a}`] = make(`offscreen_${a}`, [offscreenArrow(a)])
  void JOBS
  return s
}

function gemUi(): Raster {
  return gemRaster(16, 8, 7.5, 5.2, 5.6, Math.PI / 4, R.magic)
}
