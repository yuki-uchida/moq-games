/**
 * Stand-in art that satisfies the contract (contract.ts) so the game runs before a sheet's real art exists.
 * Where the first version of the game had a drawing, the stand-in reuses it (`legacy/`); everything else is a
 * plain shape. The registry always prefers real sheets, and `tests/art-contract.test.ts` fails while any
 * stand-in is still in use, so this file and `legacy/` disappear once the art is complete.
 */
import { BOSS_ARTS, ENEMY_KINDS, type AnimSpec, type Neighbour, type ThemeId, type TileQuery } from './contract'
import { buildCharacters, BEE, type CharacterArt } from './legacy/characters'
import type { Sprite } from './legacy/pixel'
import { buildProps, buildTiles, type PropArt, type TileArt } from './legacy/props'
import { R, colorOfRgb, type Ramp } from './palette'
import { Raster, ball, outline } from './raster'
import { anchorOf, type Anim, type Sheet } from './sheet'

/** A legacy RGBA sprite as an indexed raster (its colours join the palette as they are). */
function fromSprite(sprite: Sprite): Raster {
  const r = new Raster(sprite.w, sprite.h)
  for (let i = 0; i < sprite.w * sprite.h; i++) {
    if (sprite.data[i * 4 + 3] < 128) continue
    r.data[i] = colorOfRgb(sprite.data[i * 4], sprite.data[i * 4 + 1], sprite.data[i * 4 + 2])
  }
  return r
}

let characters: Record<string, CharacterArt> | undefined
let props: PropArt | undefined
const tiles = new Map<ThemeId, TileArt>()
const legacyCharacters = () => (characters ??= buildCharacters())
const legacyProps = () => (props ??= buildProps())
const legacyTiles = (theme: ThemeId) => {
  let t = tiles.get(theme)
  if (!t) tiles.set(theme, (t = buildTiles(theme)))
  return t
}

/** Places a legacy character frame into a contract-sized frame with its feet on the anchor. */
function fitFeet(sprite: Sprite, spec: AnimSpec, lift = 2): Raster {
  const src = fromSprite(sprite)
  const out = new Raster(spec.w, spec.h)
  const [ax, ay] = spec.anchor ?? anchorOf({ frames: [out], fps: 1, loop: false })
  return out.blit(src, Math.round(ax - src.w / 2), ay - src.h + lift)
}

/** Places a legacy cell image into a contract frame: as is when the sizes match, else on the cell anchor. */
function fitCell(sprite: Sprite, spec: AnimSpec): Raster {
  const src = fromSprite(sprite)
  if (src.w === spec.w && src.h === spec.h) return src
  const [ax, ay] = spec.anchor ?? [0, 0]
  return new Raster(spec.w, spec.h).blit(src, ax, ay)
}

type LegacyPick = (c: CharacterArt, i: number) => Sprite

/** Which legacy frame stands in for frame `i` of each contract clip. */
const CHARACTER_CLIPS: Record<string, LegacyPick> = {
  idle: (c) => c.idle[0],
  blink: (c) => c.idle[1] ?? c.idle[0],
  wait: (c, i) => c.idle[i % 2 === 0 ? 0 : 1 % c.idle.length],
  run: (c, i) => c.walk[i % c.walk.length],
  move: (c, i) => (c.fly ?? c.walk)[i % (c.fly ?? c.walk).length],
  skid: (c) => c.walk[0],
  jump: (c) => c.jump,
  air: (c, i) => (i === 0 ? c.jump : c.fall),
  fall: (c) => c.fall,
  land: (c) => c.idle[0],
  bite: (c, i) => (i < 2 ? c.bite[0] : i < 4 ? (c.bite[1] ?? c.bite[0]) : c.idle[0]),
  shoot: (c) => c.bite[0],
  attack: (c, i) => c.walk[i % c.walk.length],
  windup: (c) => c.jump,
  recover: (c) => c.idle[0],
  rage: (c) => c.jump,
  intro: (c) => c.jump,
  yell: (c) => c.bite[0],
  hurt: (c) => c.hurt,
  stunned: (c) => c.hurt,
  tired: (c) => c.hurt,
  die: (c) => c.hurt,
  defeat: (c) => c.hurt,
  cheer: (c, i) => (i % 2 ? c.idle[0] : c.happy),
  wave: (c, i) => (i % 2 ? c.idle[0] : c.happy),
  sad: (c) => c.idle[1] ?? c.idle[0],
  swim: (c, i) => c.walk[i % c.walk.length]
}

const LEGACY_CHARACTER: Record<string, string> = {
  hero: 'player',
  princess: 'princess',
  mom: 'mom',
  ...Object.fromEntries(ENEMY_KINDS.map((kind) => [kind, kind])),
  ...Object.fromEntries(BOSS_ARTS.map((art) => [art, art]))
}

type PropPick = (p: PropArt, i: number, theme: TileArt) => Sprite | undefined

const LEGACY_PROP: Record<string, Record<string, PropPick>> = {
  'prop:tree': { idle: (p) => p.tree, cut: (p) => p.tree, shake: (p) => p.tree },
  'prop:pine': { idle: (p) => p.pine, cut: (p) => p.pine, shake: (p) => p.pine },
  'prop:pipe': { idle: (p) => p.pipe, burst: (p) => p.pipeHole, done: (p) => p.pipeHole },
  'prop:hive': { idle: (p) => p.hive },
  'prop:animal': { sleep: (p) => p.animal, wake: (p) => p.animalAwake, run: (p) => p.animalAwake },
  'prop:rock': { idle: (p) => p.rock, cracked: (p) => p.rock },
  'prop:switch1': {
    off: (p) => p.switchOff,
    flip: (p, i) => (i < 2 ? p.switchOff : p.switchOn),
    on: (p) => p.switchOn
  },
  'prop:switch2': {
    off: (p) => p.switchOff,
    flip: (p, i) => (i < 2 ? p.switchOff : p.switchOn),
    on: (p) => p.switchOn
  },
  'prop:door1': { top: (p) => p.door, mid: (p) => p.door, bottom: (p) => p.door },
  'prop:door2': { top: (p) => p.door, mid: (p) => p.door, bottom: (p) => p.door },
  'prop:goal': { locked: (_p, _i, t) => t.goal, open: (_p, _i, t) => t.goal },
  'prop:nest': { locked: (_p, _i, t) => t.nest, open: (_p, _i, t) => t.nest },
  'prop:fruit': { idle: (p) => p.fruit },
  'prop:star': { idle: (p) => p.star },
  'prop:twig': { idle: (p) => p.twig },
  'prop:berry': { idle: (p) => p.berry },
  'prop:seed': { spin: (p) => p.seed }
}

function rampFor(id: string): Ramp {
  if (id === 'fx') return R.gold
  if (id === 'ui') return R.paper
  if (id === 'prop:gate') return R.gold
  if (id === 'prop:cage') return R.steel
  if (id === 'prop:log') return R.bark
  if (id.startsWith('prop:')) return R.wood
  return R.bandana
}

/** A plain shape for anything the first version never drew. */
function plain(spec: AnimSpec, ramp: Ramp, i: number): Raster {
  const r = new Raster(spec.w, spec.h)
  const wobble = i % 2
  if (spec.w === spec.h && spec.w <= 64) {
    const half = spec.w / 2
    ball(r, half, half, half * 0.7 - wobble, half * 0.7 - wobble, ramp)
  } else {
    const m = Math.max(1, Math.floor(Math.min(spec.w, spec.h) * 0.12))
    r.rect(m, m + wobble, spec.w - 2 * m, spec.h - 2 * m - wobble, ramp[1 + (i % 2)])
    r.rect(m, m + wobble, spec.w - 2 * m, 2, ramp[0])
  }
  outline(r)
  return r
}

function frameFor(id: string, name: string, spec: AnimSpec, i: number): Raster {
  const legacyId = LEGACY_CHARACTER[id]
  if (legacyId) {
    const character = legacyCharacters()[legacyId]
    const pick = CHARACTER_CLIPS[name]
    if (character && pick) return fitFeet(pick(character, i), spec)
  }
  const propPick = LEGACY_PROP[id]?.[name]
  if (propPick) {
    const sprite = propPick(legacyProps(), i, legacyTiles('meadow'))
    if (sprite) return id === 'prop:tree' || id === 'prop:pine' ? fitFeet(sprite, spec, 0) : fitCell(sprite, spec)
  }
  if (id === 'prop:log' && name !== 'under') {
    const log = fromSprite(legacyProps().log)
    const out = new Raster(spec.w, spec.h)
    for (let x = 0; x < spec.w; x += 64) out.blit(log, x, 0)
    return out
  }
  if (id === 'prop:bee') return new Raster(spec.w, spec.h).blit(fromSprite(BEE).crop(4, 2, 24, 24), 0, 0)
  return plain(spec, rampFor(id), i)
}

/** A placeholder sheet for any spec. */
export function placeholderSheet(id: string, spec: Record<string, AnimSpec>): Sheet {
  const sheet: Sheet = {}
  for (const [name, s] of Object.entries(spec)) {
    const frames = Array.from({ length: s.frames }, (_, i) => frameFor(id, name, s, i))
    const a: Anim = { frames, fps: s.fps, loop: s.loop }
    if (s.anchor) a.anchor = s.anchor
    sheet[name] = a
  }
  return sheet
}

const solidLike = (n: Neighbour) => n === 'solid' || n === 'dirt' || n === undefined

/** A placeholder terrain tile from the first version's tiles (grass only where the top is exposed). */
export function placeholderTile(q: TileQuery): Raster {
  const art = legacyTiles(q.theme)
  if (q.kind === 'dirt') return fromSprite(art.dirt)
  if (q.kind === 'platform') return fromSprite(art.platform)
  if (q.kind === 'spike') return fromSprite(art.spike)
  const base = fromSprite(q.theme === 'fortress' ? art.stone : q.theme === 'castle' ? art.brick : art.ground)
  if (!solidLike(q.around[0]) || q.theme === 'fortress' || q.theme === 'castle') return base
  // Buried tile: replace the grass cap with soil from further down the same tile.
  const inner = base.clone()
  for (let y = 0; y < 18; y++) for (let x = 0; x < 64; x++) inner.data[y * 64 + x] = base.data[(y + 20) * 64 + x]
  return inner
}
