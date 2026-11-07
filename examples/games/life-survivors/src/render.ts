import { canvasOf } from './art/atlas'
import { careerFor } from './art/careers'
import { BEAM_DIRS, STAPLE_DIRS, beam } from './art/arsenal'
import { deathKind, soulAt } from './art/deaths'
import {
  NO_FLIP,
  PENCIL_DIRS,
  SWING_DIRS,
  evolve,
  playMat,
  prewarmAppearanceFrame,
  retainAppearancePrewarm,
  sheet,
  swing
} from './art/index'
import { R } from './art/palette'
import { Raster } from './art/raster'
import { duration, frameAt, type Anim, type Sheet } from './art/sheet'
import { FLAT_PROPS, GROUNDS, PROP_CELL, TILE, groundTile, propsAt } from './art/world'
import {
  ENEMIES,
  ENEMY_BY_ID,
  MAX_WEAPON_LEVEL,
  PARENT_LEGACIES,
  PASSIVE_BY_ID,
  STAGES,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_INDEX,
  ageAt,
  stageAt,
  timeAtAge,
  type EnemyDef,
  type Stage
} from './data'
import { Effects, PK } from './effects'
import { parentMemorialAt } from './hud'
import { RAID, VIEW_HALF } from './game'
import { bodyScale } from './body-size'
import { OBSERVATION_SPRITES, petForm, weaponAppearance } from './weapon-life'
import {
  BULLET_KINDS,
  ENEMY_FLAG,
  ITEM_KINDS,
  POPUP_BIT,
  SHOT_GAMBLE,
  STRIDE,
  type View,
  type ViewPlayer
} from './view'

/** Painted player bodies by the stage age they belong to; other stages use the nearest one. */
const BODIES: Record<string, string> = {
  乳児期: 'baby',
  幼児期: 'toddler',
  小学生: 'kid',
  中学生: 'junior',
  高校生: 'high',
  青年期: 'college',
  成人期: 'adult',
  壮年期: 'prime',
  中年: 'middle',
  老後: 'elder',
  寝たきり: 'bed'
}
/** Every life stage has its own painted body. */
export const bodyFor = (stage: Stage) => BODIES[stage.name] ?? 'adult'
const appearanceFor = (player: ViewPlayer, body: string) => {
  const career = !['baby', 'toddler', 'bed'].includes(body) ? careerFor(player) : undefined
  return `${body}${career ? `:${career}` : ''}`
}
const GROUND_FADE = 1.5
const TAU = Math.PI * 2
const GAMBLE_LABELS: Record<string, string> = {
  gamble_gacha: 'ガチャ！',
  gamble_poker: 'ポーカー！',
  gamble_pachinko: '大当たり！',
  gamble_horse: '競馬的中！'
}
/** Whether a player's weapon has evolved (Lv8 + its matching passive), from the snapshot alone. */
function isEvolvedView(owner: ViewPlayer | undefined, id: string) {
  const def = WEAPON_BY_ID.get(id)
  const w = owner?.weapons.find((x) => x[0] === id)
  return Boolean(
    def?.evolve && w && w[1] >= MAX_WEAPON_LEVEL && owner!.passives.some((p) => p[0] === def.evolve!.passive)
  )
}

/** Cheap deterministic noise in 0..1 (for jitter that must not change between draws of the same frame). */
function hash(a: number, b = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Frame index of an animation at time t without allocating (falls back to frameAt for held frames). */
function frameIndex(anim: Anim, t: number) {
  if (anim.hold) return frameAt(anim, t)
  const n = anim.frames.length
  const tick = Math.floor(Math.max(0, t) * anim.fps)
  return anim.loop ? tick % n : Math.min(n - 1, tick)
}
const pick = (anim: Anim, t: number) => anim.frames[frameIndex(anim, t)]
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3

/** The tight box around a lettering layer (cached). */
const letterBoxes = new WeakMap<Raster, { r: Raster; x: number; y: number }>()
function letterBox(t: Raster) {
  let box = letterBoxes.get(t)
  if (box) return box
  let x0 = t.w
  let y0 = t.h
  let x1 = 0
  let y1 = 0
  t.map(
    (c, x, y) => ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)), c)
  )
  box = { r: new Raster(x1 - x0 + 1, y1 - y0 + 1).blit(t, -x0, -y0), x: x0, y: y0 }
  letterBoxes.set(t, box)
  return box
}

/** Where a prop touches the ground: centre x, half-width and row of its lowest pixels (cached). */
const footprints = new WeakMap<Raster, { cx: number; rx: number; y: number }>()
function footprint(r: Raster) {
  let found = footprints.get(r)
  if (found) return found
  let maxY = -1
  r.map((c, _x, y) => ((maxY = Math.max(maxY, y)), c))
  let lo = r.w
  let hi = -1
  r.map((c, x, y) => (y >= maxY - 3 && ((lo = Math.min(lo, x)), (hi = Math.max(hi, x))), c))
  found = hi < 0 ? { cx: 0, rx: 0, y: 0 } : { cx: (lo + hi + 1) / 2, rx: (hi - lo + 1) / 2 + 1, y: maxY }
  footprints.set(r, found)
  return found
}

/** A one-pixel gold outline around a sprite (one extra pixel of padding on every side), cached per frame. */
const outlines = new WeakMap<Raster, Raster>()
function goldOutline(src: Raster) {
  let out = outlines.get(src)
  if (out) return out
  out = new Raster(src.w + 2, src.h + 2)
  for (let y = -1; y <= src.h; y++)
    for (let x = -1; x <= src.w; x++)
      if (
        !src.get(x, y) &&
        (src.get(x - 1, y) || src.get(x + 1, y) || src.get(x, y - 1) || src.get(x, y + 1) || src.get(x - 1, y - 1))
      )
        out.set(x + 1, y + 1, R.yellow[1])
  outlines.set(src, out)
  return out
}

/** A text/bubble canvas drawn at `res`× resolution and shown at 1/res of its pixel size. */
interface Label extends HTMLCanvasElement {
  res: number
}

/** Damage number styles: label scale relative to the 20 px glyph atlas, fill colour. */
const NUMBER_STYLES = {
  other: { scale: 0.5, color: '#b9b3c9' },
  mine: { scale: 0.62, color: '#ffffff' },
  strong: { scale: 0.78, color: '#ffcf4d' },
  crit: { scale: 0.9, color: '#ff6a3d' },
  both: { scale: 1.12, color: '#ff8a2a' }
} as const
type NumberStyle = keyof typeof NUMBER_STYLES
const NUMBER_FONT = '800 20px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif'

/** A spouse or child walking with a married player (renderer-only; positions never reach the game). */
export interface Follower {
  sheet: string
  x: number
  y: number
  speed: number
  flip: boolean
  /** Animation offset so the two never step in lockstep. */
  phase: number
  /** Their player is below full HP, so the healing they give shows. */
  heal: boolean
}

/**
 * The family are support, not units: drawn smaller than the player and walking behind them — on the side away
 * from the way the player faces and a step further back. Slots are offsets from the player's position.
 */
export const FAMILY_SCALE = 0.75
export const FAMILY_SLOTS = [
  { sheet: 'family:spouse', dx: 16, dy: -7 },
  { sheet: 'player:kid', dx: 28, dy: -1 }
] as const
/** How quickly (1/s) they close in on their slot, and the farthest (world px) they ever trail behind it. */
const FAMILY_FOLLOW = 7
export const FAMILY_LAG = 40
/** Seconds between the small healing pluses that rise off them while their player is hurt. */
const FAMILY_HEAL_EVERY = 1.6

/**
 * Moves a player's family `dt` seconds toward their slots behind the player drawn at `pos`: the spouse once
 * married, the child once welcomed, nobody while the player is down or the life is ending. They ease after the
 * player and never trail more than FAMILY_LAG behind a slot; someone new or far away appears in their slot.
 * Updates `crew` in place and returns it.
 */
export function followFamily(
  crew: Follower[],
  player: Pick<ViewPlayer, 'fx' | 'married' | 'hasChild' | 'downed' | 'hp' | 'maxHp'>,
  phase: View['phase'],
  pos: { x: number; y: number },
  dt: number
) {
  const count = player.downed || phase !== 'playing' || !player.married ? 0 : player.hasChild ? 2 : 1
  crew.length = Math.min(crew.length, count)
  const back = player.fx < 0 ? 1 : -1
  const step = Math.min(Math.max(0, dt), 0.1)
  const k = 1 - Math.exp(-FAMILY_FOLLOW * step)
  for (let i = 0; i < count; i++) {
    const slot = FAMILY_SLOTS[i]
    const tx = pos.x + back * slot.dx
    const ty = pos.y + slot.dy
    const m = crew[i]
    if (!m || Math.hypot(m.x - tx, m.y - ty) > 200) {
      crew[i] = { sheet: slot.sheet, x: tx, y: ty, speed: 0, flip: back > 0, phase: i * 0.37, heal: false }
      continue
    }
    let x = m.x + (tx - m.x) * k
    let y = m.y + (ty - m.y) * k
    const off = Math.hypot(x - tx, y - ty)
    if (off > FAMILY_LAG) {
      x = tx + ((x - tx) * FAMILY_LAG) / off
      y = ty + ((y - ty) * FAMILY_LAG) / off
    }
    const vx = step > 0 ? (x - m.x) / step : 0
    const speed = step > 0 ? Math.hypot(x - m.x, y - m.y) / step : 0
    m.speed += (Math.min(400, speed) - m.speed) * 0.25
    // Walking, they face where they walk; standing, the way their player faces.
    if (m.speed <= 25) m.flip = player.fx < 0
    else if (Math.abs(vx) > 20) m.flip = vx < 0
    m.x = x
    m.y = y
  }
  for (const m of crew) m.heal = player.hp < player.maxHp
  return crew
}

interface Ent {
  /** Sort key (feet). */
  y: number
  /** ENEMIES index. */
  kind: number
  def?: EnemyDef
  player?: ViewPlayer
  member?: Follower
  id: number
  x: number
  yy: number
  hp: number
  flash: number
  flags: number
  tagLift: number
  state?: EnemyState
}

interface EnemyState {
  born: number
  seen: number
  windup: number
  blink: boolean
}

/** Scratch view of the shot being drawn. */
interface ShotView {
  i: number
  x: number
  y: number
  r: number
  angle: number
  /** Remaining life 0..1 */
  life: number
  /** Elapsed life 0..1 */
  age: number
  v: number
  ox: number
  oy: number
  evolved: boolean
}

const BOSS_AURA = '#a02850'
const GOLD = '#ffd75e'

/** Canvas renderer: generated pixel art for everything in the world; labels are rasterised once and reused. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly sprites = new Map<string, HTMLCanvasElement>()
  private readonly shown = new Map<number, { x: number; y: number; seen: number }>()
  private readonly shownPlayers = new Map<string, { x: number; y: number }>()
  private readonly states = new Map<number, EnemyState>()
  /** Pending life bars: x, y, width, filled width, height, colour (0 normal, 1 boss, 2 elite). */
  private readonly bars: number[] = []
  private readonly numbers = new Map<string, Label>()
  private frame = 0
  private width = 1
  private height = 1
  private scale = 1
  /** Where the world is drawn from this frame (the focus plus screen shake). */
  private camera = { x: 0, y: 0 }
  /** The followed player's position without shake. */
  private focus = { x: 0, y: 0 }
  private readonly shake = { x: 0, y: 0 }
  /** Renderer clock: animations keep breathing even while the game is paused. */
  private clock = 0
  private wonAt?: number
  private beamAt?: number
  /** ms spent generating the death animation on the frame a player went down (dev hook). */
  deathBuildMs = 0
  private halo?: { x: number; y: number; t: number; alpha: number }
  private groundShown?: { stage: Stage; from?: Stage; at: number }
  private readonly motion = new Map<string, { x: number; y: number; speed: number }>()
  private readonly families = new Map<string, Follower[]>()
  private readonly deaths = new Map<string, { at: number; body: string; kind: string }>()
  private readonly parentMemorials = new Map<string, { key: string; age: number }>()
  private parentMemorialTime?: number
  private readonly warmedDeaths = new Set<string>()
  private readonly warmedAppearances = new Set<string>()
  private appearanceView?: View
  private appearanceTime?: number
  private appearancePending = false
  /** Particles, trauma and flashes driven by the fx events of the views drawn so far. */
  readonly fx = new Effects()
  private readonly fxView = { local: -1, px: 0, py: 0, cx: 0, cy: 0, hw: 0, hh: 0 }
  private readonly measure =
    typeof document === 'undefined' ? undefined : document.createElement('canvas').getContext('2d')
  private readonly ents: Ent[] = []
  private entCount = 0
  private readonly winders: Ent[] = []
  private readonly enemySheets: (Sheet | undefined)[] = []
  private readonly evo = new Int8Array(16 * 64)
  private readonly shot: ShotView = {
    i: 0,
    x: 0,
    y: 0,
    r: 0,
    angle: 0,
    life: 1,
    age: 0,
    v: 0,
    ox: 0,
    oy: 0,
    evolved: false
  }
  private readonly beamWarm = new Set<number>()
  private halfW = 0
  private halfH = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    if (typeof window.matchMedia === 'function') {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)')
      const apply = () => (this.fx.motion = query.matches ? 0.25 : 1)
      apply()
      query.addEventListener?.('change', apply)
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = this.canvas.clientWidth || window.innerWidth
    this.height = this.canvas.clientHeight || window.innerHeight
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    // Everyone sees at most the same world area, so off-screen spawns stay off-screen.
    this.scale = Math.max(this.width / (VIEW_HALF.x * 2), this.height / (VIEW_HALF.y * 2)) * dpr
  }

  private sprite(key: string, draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number) {
    let canvas = this.sprites.get(key)
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = Math.ceil(w)
      canvas.height = Math.ceil(h)
      draw(canvas.getContext('2d')!)
      if (this.sprites.size > 600) this.sprites.clear()
      this.sprites.set(key, canvas)
    }
    return canvas
  }

  /** A canvas painted at 2× resolution (drawn with logical size w×h). */
  private hires(
    key: string,
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  ) {
    let canvas = this.sprites.get(key) as Label | undefined
    if (!canvas) {
      canvas = document.createElement('canvas') as Label
      canvas.res = 2
      canvas.width = Math.ceil(w * 2)
      canvas.height = Math.ceil(h * 2)
      const g = canvas.getContext('2d')!
      g.scale(2, 2)
      draw(g, w, h)
      if (this.sprites.size > 600) this.sprites.clear()
      this.sprites.set(key, canvas)
    }
    return canvas
  }

  private label(text: string, size: number, color: string, quiet = false) {
    const px = Math.round(size)
    return this.hires(`l:${text}:${px}:${color}:${quiet}`, px * (text.length + 1.2), px * 1.6, (ctx, w, h) => {
      ctx.font = `700 ${px}px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = quiet ? Math.max(1.5, px / 5) : Math.max(2, px / 4)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = quiet ? 'rgba(15,12,20,.55)' : 'rgba(15,12,20,.85)'
      ctx.strokeText(text, w / 2, h / 2)
      ctx.fillStyle = color
      ctx.fillText(text, w / 2, h / 2)
    })
  }

  /** A whole damage number as one sprite; a small FIFO cache keeps the number of canvases bounded. */
  private numberSprite(text: string, style: NumberStyle) {
    const key = `${style}:${text}`
    let canvas = this.numbers.get(key)
    if (canvas) return canvas
    const pad = 3
    const measure = this.measure!
    measure.font = NUMBER_FONT
    canvas = this.hires(`n:${key}`, Math.ceil(measure.measureText(text).width + pad * 2), 32, (ctx, w, h) => {
      ctx.font = NUMBER_FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 5
      ctx.strokeStyle = 'rgba(15,12,20,.9)'
      ctx.strokeText(text, w / 2, h / 2)
      ctx.fillStyle = NUMBER_STYLES[style].color
      ctx.fillText(text, w / 2, h / 2)
    })
    // The number sprites live in their own map (not in the shared sprite cache, which clears wholesale).
    this.sprites.delete(`n:${key}`)
    if (this.numbers.size >= 240) for (const old of [...this.numbers.keys()].slice(0, 80)) this.numbers.delete(old)
    this.numbers.set(key, canvas as Label)
    return canvas
  }

  /** Draws a damage number centred at (x, y). */
  private number(text: string, style: NumberStyle, x: number, y: number, scale: number, alpha: number) {
    this.blit(this.numberSprite(text, style), x, y, 0, alpha, NUMBER_STYLES[style].scale * scale)
  }

  /** A soft radial blob of one colour (cached), for glows, halos and auras. */
  private blob(color: string) {
    return this.sprite(
      `blob:${color}`,
      (ctx) => {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
        grad.addColorStop(0, color)
        grad.addColorStop(0.35, color)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha = 1
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 64, 64)
      },
      64,
      64
    )
  }

  private glowAt(x: number, y: number, radius: number, color: string, alpha: number, add = true) {
    const ctx = this.ctx
    ctx.globalAlpha = alpha
    if (add) ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(this.blob(color), x - radius, y - radius, radius * 2, radius * 2)
    if (add) ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  private blit(image: HTMLCanvasElement, x: number, y: number, angle = 0, alpha = 1, scale = 1) {
    const ctx = this.ctx
    const res = (image as Label).res || 1
    const w = (image.width / res) * scale
    const h = (image.height / res) * scale
    if (!angle) {
      ctx.globalAlpha = alpha
      ctx.drawImage(image, x - w / 2, y - h / 2, w, h)
      ctx.globalAlpha = 1
      return
    }
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.drawImage(image, -w / 2, -h / 2, w, h)
    ctx.restore()
  }

  /**
   * Draws a pixel-art frame with its pivot (px, py) at world (x, y): device-pixel snapped, pre-upscaled by
   * k = ceil(scale) and smoothed down to the final size ("sharp bilinear"). `sx`/`sy` stretch it around the pivot.
   * Leaves an identity transform.
   */
  private art(r: Raster, x: number, y: number, px: number, py: number, flip = false, alpha = 1, sx = 1, sy = sx) {
    const s = this.scale
    const k = Math.min(4, Math.max(1, Math.ceil(s * Math.max(sx, sy) - 0.01)))
    const dw = r.w * s * sx
    const dh = r.h * s * sy
    const ax = Math.round(this.canvas.width / 2 + (x - this.camera.x) * s)
    const left = Math.round(ax - (flip ? r.w - px : px) * s * sx)
    const top = Math.round(this.canvas.height / 2 + (y - this.camera.y) * s - py * s * sy)
    const ctx = this.ctx
    ctx.globalAlpha = alpha
    ctx.setTransform(flip ? -1 : 1, 0, 0, 1, flip ? left + dw : left, top)
    ctx.drawImage(canvasOf(r, k), 0, 0, dw, dh)
    ctx.globalAlpha = 1
  }

  /** A 32×32-style weapon frame centred on (x, y), optionally evolved (gold trim). */
  private centred(frame: Raster, x: number, y: number, evolved: boolean, alpha = 1, scale = 1, flip = false) {
    const f = evolved ? evolve(frame) : frame
    this.art(f, x, y, f.w / 2, f.h / 2, flip, alpha, scale)
  }

  private world() {
    this.ctx.setTransform(
      this.scale,
      0,
      0,
      this.scale,
      this.canvas.width / 2 - this.camera.x * this.scale,
      this.canvas.height / 2 - this.camera.y * this.scale
    )
  }

  private shadow(x: number, y: number, rx: number, alpha = 0.28, flat = 0.36) {
    const ctx = this.ctx
    this.world()
    ctx.fillStyle = `rgba(12,8,20,${alpha})`
    ctx.beginPath()
    ctx.ellipse(x, y, rx, Math.min(6, rx * flat), 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /** One stage's ground over the visible area: painted tiles and props. */
  private ground(stage: Stage, alpha: number, halfW: number, halfH: number) {
    const ctx = this.ctx
    const key = GROUNDS[stage.name]
    // Tiles: nearest-neighbour onto integer device rectangles so neighbours meet without seams.
    const s = this.scale
    const k = Math.max(1, Math.ceil(s - 0.01))
    const sx = (wx: number) => Math.round(this.canvas.width / 2 + (wx - this.camera.x) * s)
    const sy = (wy: number) => Math.round(this.canvas.height / 2 + (wy - this.camera.y) * s)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = alpha
    const tx0 = Math.floor((this.camera.x - halfW) / TILE)
    const ty0 = Math.floor((this.camera.y - halfH) / TILE)
    for (let tx = tx0; tx * TILE < this.camera.x + halfW; tx++)
      for (let ty = ty0; ty * TILE < this.camera.y + halfH; ty++) {
        const left = sx(tx * TILE)
        const top = sy(ty * TILE)
        ctx.drawImage(
          canvasOf(groundTile(key, tx, ty), k),
          left,
          top,
          sx((tx + 1) * TILE) - left,
          sy((ty + 1) * TILE) - top
        )
      }
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = 1
    const props = sheet(`props:${key}`)
    for (
      let cx = Math.floor((this.camera.x - halfW - 64) / PROP_CELL);
      cx * PROP_CELL < this.camera.x + halfW + 64;
      cx++
    )
      for (
        let cy = Math.floor((this.camera.y - halfH - 64) / PROP_CELL);
        cy * PROP_CELL < this.camera.y + halfH + 128;
        cy++
      ) {
        for (const prop of propsAt(key, cx, cy)) {
          const frame = props[prop.name].frames[0]
          const foot = footprint(frame)
          if (foot.rx && !FLAT_PROPS.has(prop.name))
            this.shadow(prop.x - frame.w / 2 + foot.cx, prop.y - frame.h + 6 + foot.y + 1, foot.rx, 0.2 * alpha, 0.2)
          this.art(frame, prop.x, prop.y, frame.w / 2, frame.h - 6, false, alpha)
        }
      }
  }

  private appearanceTargets() {
    const view = this.appearanceView
    if (!view || view.phase !== 'playing') return []
    const next = STAGES[STAGES.indexOf(stageAt(view.time)) + 1]
    if (!next) return []
    const remaining = timeAtAge(next.age) - view.time
    if (remaining <= 0 || remaining > 5) return []
    const body = bodyFor(next)
    return [
      ...new Set(view.players.filter((player) => !player.downed).map((player) => appearanceFor(player, body)))
    ].filter((appearance) => !this.warmedAppearances.has(appearance))
  }

  private prewarmAppearances(view: View) {
    if (this.appearanceTime !== undefined && (view.time < this.appearanceTime || view.time - this.appearanceTime > 1)) {
      retainAppearancePrewarm([])
    }
    this.appearanceTime = view.time
    this.appearanceView = view
    retainAppearancePrewarm(this.appearanceTargets().map((appearance) => `player:${appearance}`))
    if (typeof requestIdleCallback !== 'function' || this.appearancePending || !this.appearanceTargets().length) return
    this.appearancePending = true
    const requestedAt = performance.now()
    requestIdleCallback((deadline) => {
      this.appearancePending = false
      if (performance.now() - requestedAt > 250 || deadline.didTimeout || deadline.timeRemaining() < 1) return
      const appearance = this.appearanceTargets()[0]
      if (!appearance) return
      if (prewarmAppearanceFrame(`player:${appearance}`)) this.warmedAppearances.add(appearance)
    })
  }

  /** Builds this stage's death animations one per idle callback, so going down never hitches. */
  private prewarm(body: string) {
    if (typeof requestIdleCallback !== 'function' || this.warmedDeaths.has(body)) return
    this.warmedDeaths.add(body)
    const deaths = sheet(`death:${body}`)
    const kinds = Object.keys(deaths)
    const next = () => {
      const kind = kinds.shift()
      if (!kind) return
      void deaths[kind]
      requestIdleCallback(next, { timeout: 2000 })
    }
    requestIdleCallback(next, { timeout: 2000 })
  }

  /** Eases guest-side entities between snapshots; hosts pass smooth=false. */
  private ease(id: number, x: number, y: number, k: number) {
    const entry = this.shown.get(id)
    if (!entry || Math.hypot(entry.x - x, entry.y - y) > 200) {
      this.shown.set(id, { x, y, seen: this.frame })
      return { x, y }
    }
    entry.x += (x - entry.x) * k
    entry.y += (y - entry.y) * k
    entry.seen = this.frame
    return entry
  }

  playerPosition(player: ViewPlayer, k: number) {
    const entry = this.shownPlayers.get(player.id)
    if (!entry || Math.hypot(entry.x - player.x, entry.y - player.y) > 200) {
      const fresh = { x: player.x, y: player.y }
      this.shownPlayers.set(player.id, fresh)
      return fresh
    }
    entry.x += (player.x - entry.x) * k
    entry.y += (player.y - entry.y) * k
    return entry
  }

  private enemySheet(index: number) {
    return (this.enemySheets[index] ??= sheet(`enemy:${ENEMIES[index].id}`))
  }

  /** The "!" speech bubble above a winding-up enemy (cached). */
  private bang() {
    return this.hires('bang', 14, 18, (ctx, w) => {
      ctx.fillStyle = '#15101c'
      ctx.fillRect(1, 1, w - 2, 13)
      ctx.fillRect(0, 2, w, 11)
      ctx.fillRect(4, 14, 4, 3)
      ctx.fillStyle = '#fff6f0'
      ctx.fillRect(2, 2, w - 4, 11)
      ctx.fillRect(1, 3, w - 2, 9)
      ctx.fillRect(5, 13, 2, 3)
      ctx.fillStyle = '#e8302e'
      ctx.fillRect(6, 3, 2, 6)
      ctx.fillRect(6, 10, 2, 2)
    })
  }

  private enemy(e: Ent) {
    const def = e.def!
    const ctx = this.ctx
    this.world()
    const st = e.state!
    const boss = def.behavior === 'boss'
    const elite = (e.flags & ENEMY_FLAG.elite) !== 0
    const windup = (e.flags & ENEMY_FLAG.windup) !== 0
    const blink = (e.flags & ENEMY_FLAG.blink) !== 0
    const ghost = (e.flags & ENEMY_FLAG.ghost) !== 0
    const scale = elite ? 1.25 : 1
    const id = e.id
    const spawn = clamp01((this.clock - st.born) / 0.25)
    let x = e.x
    let y = e.yy
    let alpha = 0.25 + 0.75 * easeOut(spawn)
    let sx = scale
    let sy = scale
    // Spawn-in: rises out of the ground a few px while fading in.
    y += (1 - easeOut(spawn)) * 8
    if (ghost) {
      x += Math.sin(this.clock * 2.2 + id) * 2.4
      y += Math.sin(this.clock * 1.7 + id * 1.3) * 1.6
      alpha *= 0.46 + 0.06 * Math.sin(this.clock * 3 + id)
    }
    if (blink) {
      alpha *= 0.25 + 0.4 * Math.abs(Math.sin(this.clock * 34 + id))
      sx *= 0.9
      sy *= 1.06
    }
    if (windup) {
      // Coiling up before the dash: a nervous shiver.
      const t = Math.floor(this.clock * 40)
      x += (hash(t, id) - 0.5) * 3
      y += (hash(t, id + 77) - 0.5) * 1.6
    }
    const feet = y + def.radius * scale * 0.8
    const art = this.enemySheet(e.kind)
    if (boss) {
      // An ominous pulsing aura with a few dark motes rising off the body.
      const r = def.radius * 3.2
      this.glowAt(x, feet - def.radius * 0.8, r, BOSS_AURA, 0.2 + 0.07 * Math.sin(this.clock * 2.2), false)
      ctx.fillStyle = 'rgba(70,20,60,.55)'
      for (let j = 0; j < 6; j++) {
        const rise = (this.clock * 22 + j * 17) % 72
        ctx.globalAlpha = Math.min(1, (72 - rise) / 30)
        ctx.fillRect(Math.round(x + (hash(j, id) - 0.5) * def.radius * 2.6), Math.round(feet - rise - 4), 2, 2)
      }
      ctx.globalAlpha = 1
    }
    if (elite) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 5 + id)
      this.glowAt(x, feet - def.radius * 0.5, def.radius * 2.6, GOLD, 0.25 + 0.22 * pulse)
    }
    const anim = e.flash ? art.flash : art.move
    const frame = anim.frames[frameIndex(anim, this.clock + (id % 7) * 0.13)]
    const big = frame.w > 64
    const flip = x > this.focus.x && !NO_FLIP.has(def.id)
    const px = big ? 64 : 32
    const py = big ? 120 : 58
    if (elite) {
      const out = goldOutline(frame)
      this.art(out, x, feet, px + 1, py + 1, flip, (0.55 + 0.45 * Math.sin(this.clock * 6 + id) ** 2) * alpha, sx, sy)
    }
    this.art(frame, x, feet, px, py, flip, alpha, sx, sy)
    this.world()
    // Regular enemies get a small, quiet name tag; life-event bosses keep a big one.
    if (boss) this.blit(this.label(def.name, 16, '#ffe08a'), x, feet + 14)
    else if (alpha > 0.5 && (this.entCount < 60 || Math.abs(x - this.focus.x) + Math.abs(feet - this.focus.y) < 260))
      this.blit(this.label(def.name, 8, '#f4ecff', true), x, feet + 7, 0, 0.75)
    const top = feet - (boss ? 108 : 50 * scale)
    const bar = this.bars
    if (windup) {
      // "!" pops over the head (bigger on bosses).
      const pop = 1 + 0.55 * Math.max(0, 1 - (this.clock - st.windup) / 0.14)
      const bob = Math.sin(this.clock * 30) * 1
      this.blit(this.bang(), x, top - (boss ? 18 : 8) + bob, 0, 1, (boss ? 1.5 : 1) * pop)
    }
    if (elite) {
      const w = def.radius * 2 * scale
      const wob = Math.sin(this.clock * 5 + id) * 1.5
      this.blit(this.label('強', 11, GOLD), x, top - 12 + wob, 0, 1, 1 + 0.06 * Math.sin(this.clock * 6))
      bar.push(x - w / 2, top, w, (w * e.hp) / 100, 3, 2)
    } else if (boss || e.hp < 100) {
      // Life bars are collected and drawn together after the crowd.
      const w = def.radius * 2
      bar.push(x - w / 2, top, w, (w * e.hp) / 100, boss ? 6 : 3, boss ? 1 : 0)
    }
  }

  /** All pending enemy life bars in three fills. */
  private lifeBars() {
    const bars = this.bars
    if (!bars.length) return
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(0,0,0,.6)'
    ctx.beginPath()
    for (let i = 0; i < bars.length; i += 6) ctx.rect(bars[i], bars[i + 1], bars[i + 2], bars[i + 4])
    ctx.fill()
    const colors = ['#ffb3b3', '#ff5d73', GOLD]
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = colors[c]
      ctx.beginPath()
      for (let i = 0; i < bars.length; i += 6)
        if (bars[i + 5] === c) ctx.rect(bars[i], bars[i + 1], bars[i + 3], bars[i + 4])
      ctx.fill()
    }
    bars.length = 0
  }

  private player(
    player: ViewPlayer,
    pos: { x: number; y: number },
    local: boolean,
    time: number,
    phase: View['phase'],
    tagLift = 0
  ) {
    const ctx = this.ctx
    const feet = pos.y + 16
    const size = bodyScale(
      player.passives.find(([id]) => id === 'p_large')?.[1] ?? 0,
      player.passives.find(([id]) => id === 'p_small')?.[1] ?? 0
    )
    const stage = stageAt(time)
    const body = bodyFor(stage)
    const appearance = appearanceFor(player, body)
    // Movement from the eased on-screen position (views carry no velocity).
    const m = this.motion.get(player.id) ?? { x: pos.x, y: pos.y, speed: 0 }
    const step = Math.hypot(pos.x - m.x, pos.y - m.y)
    m.speed += (Math.min(400, step * 60) - m.speed) * 0.25
    m.x = pos.x
    m.y = pos.y
    this.motion.set(player.id, m)
    // Identity ring at the feet (player colour), drawn under the sprite.
    this.world()
    ctx.strokeStyle = player.color
    if (phase === 'reaper' || phase === 'won')
      ctx.globalAlpha = Math.max(0, 1 - (this.clock - (this.beamAt ?? this.clock)) / 0.6)
    ctx.lineWidth = local ? 3 : 2
    ctx.beginPath()
    ctx.ellipse(pos.x, feet, 17 * size, 6 * size, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    const flip = player.fx < 0
    // 大往生: a peaceful smile while the reaper comes, then the haloed soul rises beside it.
    const ending = body === 'bed' && !player.downed && (phase === 'reaper' || phase === 'won')
    if (phase !== 'won') this.wonAt = undefined
    else if (this.wonAt === undefined) this.wonAt = this.clock
    if (ending) {
      const won = sheet('death:bed').won
      const t = this.wonAt === undefined ? 0 : this.clock - this.wonAt
      this.shadow(pos.x, feet, 13 * size)
      this.art(won.frames[this.wonAt === undefined ? 0 : frameAt(won, t)], pos.x, feet, 32, 58, flip, 1, size)
      const soul = this.wonAt === undefined ? undefined : soulAt(t, duration(won), 'halo')
      // Drawn after the reaper (in front of it), so the soul is seen rising to meet it.
      if (soul) this.halo = { x: pos.x + soul.dx, y: feet + soul.dy, t, alpha: soul.alpha }
      this.world()
    } else if (player.downed) {
      let death = this.deaths.get(player.id)
      if (!death) {
        const tag = player.killer ? ENEMY_BY_ID.get(player.killer)?.tag : undefined
        death = { at: this.clock, body: appearance, kind: deathKind(tag, ageAt(time), body) }
        this.deaths.set(player.id, death)
        // Measured for the dev hook: the cost of the death animation on the frame a player goes down.
        const start = performance.now()
        void sheet(`death:${death.body}`)[death.kind]
        this.deathBuildMs = performance.now() - start
      }
      const anim = sheet(`death:${death.body}`)[death.kind] ?? sheet(`death:${death.body}`).collapse
      const t = this.clock - death.at
      const index = frameAt(anim, t)
      // A lifted body leaves its shadow on the floor, smaller.
      this.shadow(pos.x, feet, 13 * size * (1 - (anim.lift?.[index] ?? 0) / 40))
      this.art(anim.frames[index], pos.x, feet, 32, 58, flip, anim.alpha?.[index] ?? 1, size)
      // Lettering is never mirrored: drawn unflipped at the mirrored position.
      const text = anim.text?.[index]
      if (text) {
        const box = letterBox(text)
        const ox = flip ? 64 - box.x - box.r.w : box.x
        this.art(box.r, pos.x, feet, 32 - ox, 58 - box.y, false, anim.alpha?.[index] ?? 1, size)
      }
      const soul = soulAt(t, duration(anim), anim.soul)
      if (soul) {
        const kind = sheet('soul')[anim.soul === 'ghost' ? 'ghost' : 'float']
        this.art(kind.frames[frameAt(kind, t)], pos.x, feet + soul.dy, 8, 16, false, soul.alpha)
      }
      this.world()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 28, -Math.PI / 2, -Math.PI / 2 + player.revive * Math.PI * 2)
      ctx.stroke()
    } else {
      this.deaths.delete(player.id)
      this.shadow(pos.x, feet, 13 * size)
      this.prewarm(appearance)
      const art = sheet(`player:${appearance}`)
      const anim = player.hurt ? art.hurt : m.speed > 25 ? art.walk : art.idle
      this.art(
        anim.frames[frameAt(anim, player.hurt ? ((this.clock * 8) % 2) / 8 : this.clock)],
        pos.x,
        feet,
        32,
        58,
        flip,
        1,
        size
      )
      this.world()
    }
    // In the finale the name tag and bar fade away so the bed and the rising soul are unobstructed.
    const shown =
      phase === 'reaper' || phase === 'won' ? Math.max(0, 1 - (this.clock - (this.beamAt ?? this.clock)) / 0.6) : 1
    if (shown <= 0) return
    this.blit(
      this.label(local ? `${player.name}（あなた）` : player.name, 11, player.color),
      pos.x,
      feet - 64 * size - tagLift,
      0,
      shown
    )
  }

  /** A player's family this frame (kept per player so they ease along between frames). */
  private family(player: ViewPlayer, pos: { x: number; y: number }, phase: View['phase'], dt: number) {
    let crew = this.families.get(player.id)
    if (!crew) this.families.set(player.id, (crew = []))
    return followFamily(crew, player, phase, pos, dt)
  }

  /** One family member: smaller than the player, with a small healing plus now and then while it is needed. */
  private follower(m: Follower) {
    const feet = m.y + 16
    const art = sheet(m.sheet)
    const anim = m.speed > 25 ? art.walk : art.idle
    this.shadow(m.x, feet, 13 * FAMILY_SCALE)
    this.art(anim.frames[frameAt(anim, this.clock + m.phase)], m.x, feet, 32, 58, m.flip, 1, FAMILY_SCALE)
    if (m.heal) {
      const t = (this.clock + m.phase * 2) % FAMILY_HEAL_EVERY
      if (t < 0.7)
        this.art(pick(sheet('fx').heal, t), m.x + 2, feet - 44 * FAMILY_SCALE - t * 12, 6, 6, false, 1 - t / 0.7, 0.8)
    }
    this.world()
  }

  // -------------------------------------------------------------------------------------------
  // Weapons.

  /** Loads shot `i` of a view's flat array into the scratch record. */
  private load(view: View, origins: { x: number; y: number }[], i: number) {
    const s = view.shots
    const sh = this.shot
    const ownerIndex = s[i + 6]
    sh.i = i
    sh.x = s[i + 1]
    sh.y = s[i + 2]
    sh.r = s[i + 3]
    sh.angle = s[i + 4] / 100
    sh.life = s[i + 5] / 100
    sh.age = 1 - sh.life
    const copied = s[i + 7] >= SHOT_GAMBLE
    sh.v = copied ? s[i + 7] - SHOT_GAMBLE : s[i + 7]
    const origin = origins[ownerIndex]
    sh.ox = origin ? origin.x : sh.x
    sh.oy = origin ? origin.y : sh.y
    const weaponIndex = copied ? WEAPON_INDEX.get('w_gamble')! : s[i]
    const key = ownerIndex * 64 + weaponIndex
    let known = key < this.evo.length ? this.evo[key] : 0
    if (!known) {
      known = isEvolvedView(view.players[ownerIndex], WEAPONS[weaponIndex].id) ? 2 : 1
      if (key < this.evo.length) this.evo[key] = known
    }
    sh.evolved = known === 2
    return sh
  }

  /** Ground-level weapon effects: auras, zones, shockwave rings, rings of song and drifting perfume. */
  private groundShot(view: View, sh: ShotView, def: (typeof WEAPONS)[number]) {
    const ctx = this.ctx
    const fx = sheet('fx')
    const { x, y, r: radius, angle, life, age, evolved, i } = sh
    switch (def.behavior) {
      case 'observe': {
        if (sh.v % 2 === 0) break
        const alpha = clamp01(life * 4)
        this.world()
        ctx.fillStyle = `rgba(140,204,105,${0.12 * alpha})`
        ctx.strokeStyle = `rgba(198,245,190,${0.55 * alpha})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, TAU)
        ctx.fill()
        ctx.stroke()
        ctx.strokeStyle = `rgba(198,245,190,${0.3 * alpha})`
        ctx.beginPath()
        ctx.arc(x, y, radius * (0.45 + 0.25 * ((this.clock * 0.8) % 1)), 0, TAU)
        ctx.stroke()
        break
      }
      case 'garden': {
        if (sh.v !== 1) break
        const alpha = Math.min(1, life * 4)
        this.world()
        ctx.fillStyle = `rgba(78,152,91,${0.22 * alpha})`
        ctx.strokeStyle = `rgba(214,243,138,${0.65 * alpha})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, TAU)
        ctx.fill()
        ctx.stroke()
        const flowers = sheet('weapon:w_garden').bloom
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * TAU + i
          const d = j === 0 ? 0 : radius * 0.55
          this.centred(
            pick(flowers, this.clock + j * 0.2),
            x + Math.cos(a) * d,
            y + Math.sin(a) * d,
            evolved,
            alpha,
            0.8
          )
        }
        break
      }
      case 'beam': {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const dir = ((Math.round((angle / TAU) * BEAM_DIRS) % BEAM_DIRS) + BEAM_DIRS) % BEAM_DIRS
        const raster = beam(radius, dir)
        this.warmBeam(radius)
        const alpha = clamp01(age * 9) * clamp01(life * 4) * (0.88 + 0.12 * Math.sin(this.clock * 55 + i))
        const cx = sh.ox + cos * radius
        const cy = sh.oy + sin * radius
        if (evolved) {
          this.world()
          ctx.globalCompositeOperation = 'lighter'
          ctx.strokeStyle = `rgba(255,215,94,${0.22 * alpha})`
          ctx.lineWidth = 26
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(sh.ox, sh.oy)
          ctx.lineTo(sh.ox + cos * radius * 2, sh.oy + sin * radius * 2)
          ctx.stroke()
          ctx.lineCap = 'butt'
          ctx.globalCompositeOperation = 'source-over'
        }
        this.art(raster, cx, cy, raster.w / 2, raster.h / 2, false, alpha)
        const book = pick(sheet('weapon:w_reading').fly, this.clock + i * 0.1)
        this.centred(book, sh.ox + cos * 12, sh.oy + sin * 12 - 6, evolved, clamp01(life * 5))
        break
      }
      case 'aura':
      case 'zone': {
        const pos = def.behavior === 'aura' ? { x: sh.ox, y: sh.oy } : { x, y }
        if (def.behavior === 'zone') {
          // 娯楽: an arcade play-mat with a controller and floating pixels.
          const mat = playMat(radius)
          this.art(mat, pos.x, pos.y, mat.w / 2, mat.h / 2, false, 0.4)
          this.art(fx.controller.frames[0], pos.x, pos.y, 9, 6)
          fx.pixels.frames.forEach((p, j) => {
            const a = this.clock * 1.3 + j * 1.7 + i
            this.art(
              p,
              pos.x + Math.cos(a) * radius * 0.6,
              pos.y + Math.sin(a * 1.3) * radius * 0.5 - ((this.clock * 20 + j * 13) % 20),
              1,
              1
            )
          })
        } else {
          // 毒親: a faint toxic ground ring with wisps and skull puffs circling over it.
          this.world()
          ctx.fillStyle = 'rgba(122,98,161,0.24)'
          ctx.strokeStyle = 'rgba(173,143,211,0.6)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.ellipse(pos.x, pos.y + 8, radius, radius * 0.92, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          for (let j = 0; j < 12; j++) {
            // Two swirling rings of wisps and skull puffs at different speeds.
            const inner = j % 2
            const a = this.clock * (inner ? -1.8 : 1.3) + (j * Math.PI) / 6
            const sprite = j % 4 === 3 ? fx.skull.frames[0] : pick(fx.wisp, this.clock + j * 0.2)
            this.art(
              sprite,
              pos.x + Math.cos(a) * radius * (inner ? 0.45 : 0.8),
              pos.y + 8 + Math.sin(a) * radius * (inner ? 0.4 : 0.72),
              sprite.w / 2,
              sprite.h / 2,
              false,
              0.85
            )
          }
          if (evolved)
            for (let j = 0; j < 4; j++)
              this.art(
                pick(fx.star, this.clock + j),
                pos.x + Math.cos(j * 1.6 + this.clock) * radius * 0.4,
                pos.y + Math.sin(j * 1.6 + this.clock) * radius * 0.4,
                4,
                4
              )
        }
        break
      }
      case 'slam': {
        // 筋トレ: the shockwave spreads over the floor as a cracked ring with dust puffs, at its real radius.
        const a = sh.age
        const grow = easeOut(a * 3.2)
        const ring = radius * (0.3 + 0.7 * grow)
        const fade = clamp01(sh.life * 2.2)
        this.world()
        ctx.fillStyle = `rgba(255,236,190,${0.13 * fade})`
        ctx.beginPath()
        ctx.arc(x, y, ring, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`
        ctx.lineWidth = 4 * (1 - a * 0.6)
        ctx.beginPath()
        ctx.arc(x, y, ring, 0, TAU)
        ctx.stroke()
        if (evolved) {
          ctx.strokeStyle = `rgba(255,215,94,${0.6 * fade})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, ring * 0.82, 0, TAU)
          ctx.stroke()
        }
        const cracks = Math.max(6, Math.min(14, Math.round(ring / 11)))
        const crack = fx.crack.frames[a > 0.35 ? 1 : 0]
        for (let j = 0; j < cracks; j++) {
          const ang = (j / cracks) * TAU + 0.25
          this.art(crack, x + Math.cos(ang) * ring * 0.96, y + Math.sin(ang) * ring * 0.96, 24, 12, j % 2 === 1, fade)
        }
        const dust = fx.dust.frames
        for (let j = 0; j < 10; j++) {
          const ang = (j / 10) * TAU + 0.6
          const d = dust[Math.min(dust.length - 1, Math.floor(a * 3.4 + (j % 3) * 0.2))]
          this.art(d, x + Math.cos(ang) * ring, y + Math.sin(ang) * ring - a * 14, 8, 11, false, fade * 0.9, 1.5)
        }
        break
      }
      case 'nova': {
        // カラオケ: a faint soundwave ring under the song.
        const fade = clamp01(sh.life * 2.5)
        this.world()
        ctx.strokeStyle = evolved ? `rgba(255,215,94,${0.32 * fade})` : `rgba(255,170,215,${0.3 * fade})`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(sh.ox, sh.oy, radius, sh.angle - Math.PI / 3, sh.angle + Math.PI / 3)
        ctx.stroke()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = `rgba(255,255,255,${0.35 * fade})`
        ctx.beginPath()
        ctx.arc(sh.ox, sh.oy, Math.max(2, radius - 6), sh.angle - Math.PI / 3, sh.angle + Math.PI / 3)
        ctx.stroke()
        break
      }
      case 'trail': {
        // 香水: a cloud of three drifting puffs that thins out as it lingers.
        const a = sh.age
        const fade = clamp01(a * 7) * clamp01(sh.life * 2.5) * 0.82
        const puff = Math.max(1, Math.min(1.6, radius / 26))
        const drift = a * 10
        for (let j = 0; j < 3; j++) {
          const ang = this.clock * 0.7 + i * 1.3 + (j * TAU) / 3
          const cx = x + Math.cos(ang) * radius * 0.42 + Math.sin(this.clock * 1.8 + i + j) * 2
          const cy = y + Math.sin(ang) * radius * 0.34 - drift
          const frame = fx.perfume.frames[(j + Math.floor(this.clock * 3 + i)) % 3]
          this.art(
            evolved ? evolve(frame) : frame,
            cx,
            cy,
            16,
            16,
            false,
            fade,
            puff * (0.9 + 0.2 * Math.sin(this.clock * 2 + j))
          )
        }
        if (evolved && this.clock % 0.5 < 0.25)
          this.art(
            pick(fx.heal, this.clock * 2 + i),
            x + Math.sin(this.clock * 3 + i) * 8,
            y - 14 - drift,
            6,
            6,
            false,
            fade
          )
        break
      }
      case 'mine': {
        // 貯金: the piggy bank on the floor, a hint of a pulse once armed.
        const art = sheet('weapon:w_savings')
        const armed = sh.v === 1
        const frame = pick(armed ? art.armed : art.fly, this.clock + i * 0.2)
        this.shadow(x, y + 10, 11, 0.25)
        const pulse = armed ? 1 + 0.07 * Math.sin(this.clock * 12 + i) : 1
        this.art(evolved ? evolve(frame) : frame, x, y + 4, 16, 22, false, 1, pulse, pulse)
        break
      }
      default:
    }
  }

  /** Streaks of fading afterimages behind a fast projectile heading (hx, hy). */
  /** Afterimages left to draw this frame (fast projectiles only leave trails while the screen is not flooded). */
  private trailBudget = 0

  private afterimages(
    frame: Raster,
    x: number,
    y: number,
    hx: number,
    hy: number,
    step: number,
    evolved: boolean,
    n = 3
  ) {
    n = Math.min(n, this.trailBudget)
    this.trailBudget -= n
    for (let k = n; k >= 1; k--)
      this.centred(frame, x - hx * step * k, y - hy * step * k, evolved, 0.32 - k * 0.07, 1 - k * 0.04)
  }

  /** A jagged lightning bolt between two points, flickering as it lives. */
  private bolt(x0: number, y0: number, x1: number, y1: number, i: number, alpha: number, evolved: boolean) {
    const ctx = this.ctx
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    const n = Math.max(2, Math.floor(len / 15))
    const nx = -dy / len
    const ny = dx / len
    const tick = Math.floor(this.clock * 24)
    this.world()
    ctx.lineJoin = 'miter'
    ctx.lineCap = 'butt'
    const stroke = (color: string, width: number, jitter: number, seed: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(Math.round(x0), Math.round(y0))
      for (let j = 1; j < n; j++) {
        const t = j / n
        const off = (hash(i * 31 + j + seed, tick) - 0.5) * jitter
        ctx.lineTo(Math.round(x0 + dx * t + nx * off), Math.round(y0 + dy * t + ny * off))
      }
      ctx.lineTo(Math.round(x1), Math.round(y1))
      ctx.stroke()
    }
    ctx.globalAlpha = alpha
    if (evolved) {
      stroke('rgba(255,209,102,.35)', 7, 16, 0)
      stroke('#ffd166', 3, 16, 0)
      stroke('rgba(255,255,255,.7)', 1, 22, 9)
    } else stroke('rgba(76,201,240,.38)', 6, 14, 0)
    if (!evolved) stroke('#4cc9f0', 3, 14, 0)
    stroke('#ffffff', 1.5, 14, 0)
    ctx.globalAlpha = 1
  }

  /** Weapon sprites and bolts, above the characters. */
  private topShot(view: View, sh: ShotView, def: (typeof WEAPONS)[number]) {
    const ctx = this.ctx
    const fx = sheet('fx')
    const { x, y, r: radius, angle, life, evolved, i } = sh
    const age = sh.age
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const trails = this.trailBudget > 0
    switch (def.behavior) {
      case 'observe': {
        const kind = OBSERVATION_SPRITES[Math.floor(sh.v / 2)] ?? 'ant'
        const frame = pick(sheet('weapon:w_observe')[kind], this.clock + i * 0.1)
        this.shadow(x, y + 12, 10, 0.2)
        this.centred(frame, x, y, evolved, clamp01(life * 4))
        break
      }
      case 'garden':
        if (sh.v === 0) this.centred(pick(sheet('weapon:w_garden').fly, this.clock + i * 0.1), x, y, evolved)
        break
      case 'aura':
      case 'zone':
      case 'beam':
      case 'trail':
      case 'mine':
      case 'none':
        break
      case 'orbit': {
        // Re-derive the orbit around the eased owner so it never lags behind them.
        const owner = view.players[view.shots[i + 6]]
        const orbit = Math.hypot(x - (owner?.x ?? x), y - (owner?.y ?? y))
        const independent = def.id === 'p_monster' || def.id === 'p_over'
        const ox = independent ? x : sh.ox + cos * orbit
        const oy = independent ? y : sh.oy + sin * orbit
        const art = sheet(`weapon:${def.id}`)
        const anim = def.id === 'w_friend' ? [art.fly, art.alt, art.alt2][(i / STRIDE.shots) % 3] : art.fly
        const time = this.clock + i * 0.1
        const alpha = Math.min(1, life * 4)
        const flip = def.id === 'p_over' && cos < 0
        this.centred(pick(anim, time), ox, oy, evolved, alpha, 1, flip)
        if (def.id === 'p_over')
          this.centred(pick(art.guard, time), ox, oy, evolved, alpha * (sh.v === 1 ? 0.45 : 1), 1, flip)
        break
      }
      case 'whip':
      case 'flail': {
        // 美容: a crisp white-pink crescent slash with stars; 頼りない親: motion lines with flailing hands
        // and sweat — both laid exactly along the real whip line (length = radius, at the shot's angle).
        const kind = def.behavior === 'whip' ? 'slash' : 'flail'
        const dir = ((Math.round((angle / TAU) * SWING_DIRS) % SWING_DIRS) + SWING_DIRS) % SWING_DIRS
        const smear = swing(radius, dir, kind)
        const alpha = Math.min(1, life * 3)
        this.art(evolved ? evolve(smear) : smear, x, y, smear.w / 2, smear.h / 2, false, alpha)
        const n = kind === 'slash' ? 5 : 4
        for (let j = 0; j < n; j++) {
          const t = (j / (n - 1)) * 1.6 - 0.8
          const bulge = (1 - t * t) * 14
          const px = x + cos * t * radius + sin * bulge
          const py = y + sin * t * radius - cos * bulge
          if (kind === 'slash') this.centred(pick(fx.star, this.clock * 2 + j), px, py, evolved, alpha)
          else {
            this.centred(pick(fx.hand, this.clock * 4 + j), px, py, evolved, alpha)
            if (j % 2) this.centred(fx.sweat.frames[0], px + 7, py - 9, evolved, alpha)
          }
        }
        break
      }
      case 'strike': {
        // 投資: a chart-arrow bolt from above and an impact burst.
        const f = pick(fx.bolt, this.clock * 2)
        this.art(evolved ? evolve(f) : f, x, y, 12, 118, false, Math.min(1, life * 2))
        this.art(pick(fx.burst, (1 - life) * 0.6), x, y, 14, 14, false, life)
        break
      }
      case 'rain': {
        // お金持ち: a bundle of bills falls, then coins burst out on impact.
        const fall = Math.max(0, life - 0.35) / 0.65
        if (fall > 0) this.centred(fx.bills.frames[0], x, y - fall * 240, evolved)
        else this.art(pick(fx.coins, (0.35 - life) * 3), x, y + 4, 14, 14, false, Math.min(1, life * 3))
        break
      }
      case 'chain': {
        // SNS: a lightning link from the previous node to this one, "like" bubbles popping on the nodes.
        const ageSec = age * 0.25
        const start = sh.v * 0.04
        if (ageSec < start) break
        const reach = clamp01((ageSec - start) / 0.05)
        const x0 = x - cos * radius
        const y0 = y - sin * radius
        const alpha = clamp01(life * 3)
        this.bolt(x0, y0, x0 + (x - x0) * reach, y0 + (y - y0) * reach, i, alpha, evolved)
        if (reach >= 1) {
          const since = ageSec - start - 0.05
          const frame = fx.like.frames[since < 0.04 ? 0 : since < 0.09 ? 1 : 2]
          this.centred(frame, x, y - 12 - clamp01(since * 6) * 6, evolved, alpha, 1.25)
          this.art(pick(fx.spark, this.clock * 3 + sh.v), x, y, 6, 6, false, alpha)
        }
        if (sh.v === 0) this.art(pick(fx.spark, this.clock * 3), x0, y0, 6, 6, false, alpha)
        break
      }
      case 'pet': {
        // ペット: the dog runs at its prey and snaps when it arrives; mirrored by where it is heading.
        const art = sheet('weapon:w_pet')
        const biting = sh.v === 1
        const years = view.players[view.shots[i + 6]]?.petAge ?? 0
        const form = petForm(years)
        const frame = pick(biting ? art.bite : art.fly, this.clock * (years >= 12 ? 0.7 : 1) + i * 0.13)
        const flip = cos < 0
        const bob = biting ? 0 : Math.abs(Math.sin(this.clock * 12 + i)) * -1.5
        this.shadow(x, y + 7, 10, 0.24)
        const f = evolved ? evolve(frame) : frame
        this.art(f, x, y + bob, 16, 22, flip, clamp01(life * 4), form.scale)
        if (biting) {
          const sp = pick(fx.spark, this.clock * 2 + i)
          this.art(sp, x + cos * 14, y + sin * 6 - 6, 6, 6, false, 0.9)
        }
        if (evolved)
          this.art(
            pick(fx.star, this.clock * 2 + i),
            x + Math.cos(this.clock * 6 + i) * 10,
            y - 14 + Math.sin(this.clock * 6 + i) * 4,
            4,
            4
          )
        break
      }
      case 'slam': {
        // The dumbbell is hoisted over the owner's head and slammed down at their feet, then fades.
        const art = sheet('weapon:w_muscle')
        const fall = clamp01(age / 0.2)
        const drop = fall * fall
        const dy = -58 + drop * 70
        const squash = age > 0.2 && age < 0.36 ? 0.8 + 0.2 * ((age - 0.2) / 0.16) : 1
        const frame = art.fly.frames[age < 0.2 ? 0 : 1]
        this.art(
          evolved ? evolve(frame) : frame,
          x,
          y + dy,
          16,
          24,
          false,
          clamp01(life * 3),
          1 / Math.sqrt(squash),
          squash
        )
        break
      }
      case 'barrage': {
        // 残業: staples in one of 16 directions with a small streak.
        const art = sheet('weapon:w_overtime')
        const d = ((Math.round((angle / TAU) * STAPLE_DIRS) % STAPLE_DIRS) + STAPLE_DIRS) % STAPLE_DIRS
        const frame = art.fly.frames[d]
        this.centred(frame, x, y, evolved)
        break
      }
      case 'boomerang': {
        // 結婚指輪: a spinning ring with a short afterimage along its way out and back.
        const art = sheet('weapon:w_ring')
        const frame = pick(art.fly, this.clock + i * 0.1)
        const dx = x - sh.ox
        const dy = y - sh.oy
        const d = Math.hypot(dx, dy)
        if (d > 6 && trails) {
          const way = life > 0.58 ? 1 : -1
          this.afterimages(frame, x, y, (dx / d) * way, (dy / d) * way, 9, evolved, 3)
        }
        this.centred(frame, x, y, evolved)
        if (evolved)
          this.art(
            pick(fx.star, this.clock * 2 + i),
            x + Math.cos(this.clock * 9) * 12,
            y + Math.sin(this.clock * 9) * 12,
            4,
            4
          )
        break
      }
      case 'raid': {
        // ヤンキー親: storms out at an enemy, flying-kicks it and swaggers home. Laid along the raid line from
        // the eased owner (like the orbiters, so it never lags) and mirrored by the way it is heading.
        const owner = view.players[view.shots[i + 6]]
        const dist = Math.hypot(x - (owner?.x ?? x), y - (owner?.y ?? y))
        const px = sh.ox + cos * dist
        const py = sh.oy + sin * dist
        const art = sheet('weapon:p_yankee')
        const out = age < RAID.back
        const flip = out ? cos < 0 : cos > 0
        if (age < RAID.kick) {
          // The run in: dust kicked up behind and a short trail of afterimages.
          const frame = pick(art.fly, this.clock + i * 0.1)
          const appear = clamp01(age * 14)
          for (let k = 1; k <= 2; k++)
            this.art(
              pick(fx.dust, this.clock + k * 0.13),
              px - cos * 11 * k,
              py + 13 - sin * 11 * k,
              8,
              13,
              false,
              appear * (0.75 - k * 0.2)
            )
          this.shadow(px, py + 14, 9, 0.24 * appear)
          if (trails) {
            const n = Math.min(2, this.trailBudget)
            this.trailBudget -= n
            for (let k = n; k >= 1; k--)
              this.centred(frame, px - cos * 9 * k, py - sin * 9 * k, evolved, appear * (0.3 - k * 0.08), 1, flip)
          }
          this.centred(frame, px, py, evolved, appear, 1, flip)
        } else if (out) {
          // The flying kick: a hop off the ground, then a comic impact at the sole.
          const k = (age - RAID.kick) / (RAID.back - RAID.kick)
          const hop = Math.sin(k * Math.PI) * 8
          this.shadow(px, py + 14, 9 - hop * 0.4, 0.2)
          this.centred(art.kick.frames[k < 0.5 ? 0 : 1], px, py - hop, evolved, 1, 1, flip)
          if (k > 0.3)
            this.art(
              fx.impact.frames[k < 0.65 ? 0 : 1],
              px + (flip ? -13 : 13),
              py - hop + 6,
              12,
              12,
              false,
              clamp01((1 - k) * 4),
              0.7 + k * 0.5
            )
        } else {
          // The swagger home, fading out as it reaches the owner.
          const alpha = clamp01(life * 12)
          this.shadow(px, py + 14, 9, 0.24 * alpha)
          this.centred(pick(art.walk, this.clock + i * 0.1), px, py, evolved, alpha, 1, flip)
        }
        break
      }
      case 'nova': {
        // カラオケ: notes riding the expanding ring; the microphone at the singer.
        const fade = clamp01(life * 2.2) * clamp01(age * 10)
        const n = Math.max(6, Math.min(24, Math.round(radius / 8)))
        for (let j = 0; j < n; j++) {
          const ang = sh.angle + (j / (n - 1) - 0.5) * (TAU / 3)
          const rr = radius + Math.sin(this.clock * 8 + j) * 2.5
          this.art(
            fx.note.frames[j % 3],
            sh.ox + Math.cos(ang) * rr,
            sh.oy + Math.sin(ang) * rr - 3,
            6,
            7,
            false,
            fade,
            1.25
          )
        }
        if (evolved && radius > 40)
          for (let j = 0; j < Math.floor(n / 2); j++) {
            const ang = sh.angle + ((j + 0.5) / Math.floor(n / 2) - 0.5) * (TAU / 3)
            this.art(
              fx.note.frames[(j + 1) % 3],
              sh.ox + Math.cos(ang) * radius * 0.62,
              sh.oy + Math.sin(ang) * radius * 0.62 - 3,
              6,
              7,
              false,
              fade * 0.8
            )
          }
        const mic = pick(sheet('weapon:w_karaoke').fly, this.clock)
        this.centred(
          mic,
          sh.ox + Math.cos(sh.angle) * 17,
          sh.oy + Math.sin(sh.angle) * 17 - 6 + Math.sin(this.clock * 10) * 1.5,
          evolved,
          clamp01(life * 6)
        )
        break
      }
      case 'sweep': {
        const art = sheet(`weapon:${weaponAppearance(def.id, ageAt(view.time)).art}`)
        const frame = pick(art.fly, this.clock + i * 0.1)
        const flip = cos < 0
        if (trails) {
          const f = evolved ? evolve(frame) : frame
          const n = Math.min(3, this.trailBudget)
          this.trailBudget -= n
          for (let k = n; k >= 1; k--) this.art(f, x - cos * 12 * k, y, 16, 16, flip, 0.3 - k * 0.07)
        }
        this.world()
        ctx.fillStyle = 'rgba(255,255,255,.5)'
        for (let k = 0; k < 3; k++) {
          const len = 16 + k * 6
          ctx.fillRect(Math.round(cos > 0 ? x - 14 - len : x + 14), Math.round(y - 5 + k * 5), len, 1)
        }
        this.centred(frame, x, y, evolved, 1, 1, flip)
        break
      }
      case 'fan': {
        // 料理: food pellets spinning through the air in a fan.
        const art = sheet('weapon:w_cooking')
        const anim = [art.fly, art.alt, art.alt2][sh.v % 3]
        const frame = pick(anim, this.clock + i * 0.07)
        if (trails) this.afterimages(frame, x, y, cos, sin, 8, evolved, 2)
        this.centred(frame, x, y, evolved, 1, 0.85)
        break
      }
      default: {
        // aim, homing, bounce, arc, wander: the weapon's own flying frames; fast ones leave afterimages.
        const art = sheet(`weapon:${def.id === 'w_sports' ? weaponAppearance(def.id, ageAt(view.time)).art : def.id}`)
        if (def.id === 'w_study') {
          // The pencil points along its flight: one of 16 pre-drawn directions.
          const d = ((Math.round((angle / TAU) * PENCIL_DIRS) % PENCIL_DIRS) + PENCIL_DIRS) % PENCIL_DIRS
          const frame = art.fly.frames[d]
          if (trails) this.afterimages(frame, x, y, cos, sin, 8, evolved, 2)
          this.centred(frame, x, y, evolved)
        } else {
          const frame = pick(art.fly, this.clock + i * 0.1)
          if (trails && (def.behavior === 'homing' || def.behavior === 'aim'))
            this.afterimages(frame, x, y, cos, sin, 8, evolved, 2)
          this.centred(frame, x, y, evolved)
        }
      }
    }
  }

  /** Builds every direction of a beam length in idle time so turning around never hitches. */
  private warmBeam(radius: number) {
    const key = Math.max(16, Math.round(radius / 8) * 8)
    if (this.beamWarm.has(key) || typeof requestIdleCallback !== 'function') return
    this.beamWarm.add(key)
    const k = Math.min(4, Math.max(1, Math.ceil(this.scale - 0.01)))
    let dir = 0
    const next = () => {
      if (dir >= BEAM_DIRS) return
      canvasOf(beam(key, dir++), k)
      requestIdleCallback(next, { timeout: 3000 })
    }
    requestIdleCallback(next, { timeout: 3000 })
  }

  // -------------------------------------------------------------------------------------------
  // Particles and screen effects.

  private particles(layer: number) {
    const ctx = this.ctx
    const items = this.fx.pool.items
    const fx = sheet('fx')
    const cx = this.camera.x
    const cy = this.camera.y
    for (let n = 0; n < items.length; n++) {
      const p = items[n]
      if (p.layer !== layer || p.delay > 0) continue
      const reach = p.kind === PK.debris || p.kind === PK.sprite || p.kind === PK.pop ? 40 : 360
      if (Math.abs(p.x - cx) > this.halfW + reach || Math.abs(p.y - cy) > this.halfH + reach) continue
      const t = p.age / p.life
      switch (p.kind) {
        case PK.debris: {
          const s = this.scale
          const size = Math.max(1, Math.round(p.size * s))
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.globalAlpha = p.fade ? clamp01((1 - t) * 3) : 1
          ctx.fillStyle = p.color
          ctx.fillRect(
            Math.round(this.canvas.width / 2 + (p.x - cx) * s),
            Math.round(this.canvas.height / 2 + (p.y - cy) * s),
            size,
            size
          )
          ctx.globalAlpha = 1
          break
        }
        case PK.sprite: {
          const anim = fx[p.spr]
          if (!anim) break
          const frame = p.once
            ? anim.frames[Math.min(anim.frames.length - 1, Math.floor(t * anim.frames.length))]
            : pick(anim, p.age)
          const alpha = p.alpha * (p.fade ? clamp01((1 - t) * 3) : 1)
          this.art(frame, p.x, p.y, frame.w / 2, frame.h / 2, false, alpha, p.size * (1 + p.size2 * t))
          if (p.spr.startsWith('gamble_')) {
            const label =
              t < 0.65 && (p.spr === 'gamble_horse' || p.spr === 'gamble_pachinko') ? '' : (GAMBLE_LABELS[p.spr] ?? '')
            this.world()
            ctx.save()
            ctx.globalAlpha = alpha
            ctx.font = 'bold 11px sans-serif'
            ctx.textAlign = 'center'
            ctx.lineWidth = 3
            ctx.strokeStyle = '#34203b'
            ctx.fillStyle = '#fff2b0'
            ctx.strokeText(label, p.x, p.y - 24)
            ctx.fillText(label, p.x, p.y - 24)
            ctx.restore()
          }
          break
        }
        case PK.gambleResult: {
          const weapon = WEAPONS[p.n]
          if (!weapon) break
          const result = `${weapon.icon} ${weapon.name}`
          const dpr = this.canvas.width / this.width
          ctx.save()
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.globalAlpha = clamp01((p.life - p.age) / 0.4)
          ctx.font = 'bold 20px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const width = Math.min(this.width - 16, ctx.measureText(result).width + 32)
          const x = Math.max(
            width / 2 + 8,
            Math.min(this.width - width / 2 - 8, this.width / 2 + ((p.x - cx) * this.scale) / dpr)
          )
          const y = Math.max(28, Math.min(this.height - 28, this.height / 2 + ((p.y - cy) * this.scale) / dpr))
          ctx.fillStyle = '#34203b'
          ctx.fillRect(x - width / 2, y - 20, width, 40)
          ctx.strokeStyle = '#ffd75e'
          ctx.lineWidth = 2
          ctx.strokeRect(x - width / 2, y - 20, width, 40)
          ctx.fillStyle = '#fff2b0'
          ctx.fillText(result, x, y, width - 16)
          ctx.restore()
          break
        }
        case PK.ring: {
          this.world()
          const r = p.size2 + (p.size - p.size2) * easeOut(t)
          ctx.globalAlpha = p.alpha * (1 - t) ** 1.3
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.width * (1 - t * 0.55)
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, r, r * p.n, 0, 0, TAU)
          ctx.stroke()
          ctx.globalAlpha = 1
          break
        }
        case PK.glow: {
          this.world()
          const e = easeOut(t)
          this.glowAt(p.x, p.y, p.size * (0.55 + 0.45 * e), p.color, p.alpha * (1 - t) ** 1.5, p.add)
          break
        }
        case PK.rays: {
          this.world()
          const len = p.size * easeOut(t * 1.4)
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = p.alpha * (1 - t)
          ctx.fillStyle = p.color
          for (let k = 0; k < p.n; k++) {
            const a = p.rot + (k * TAU) / p.n
            const half = 0.04 + 0.02 * (k % 2)
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x + Math.cos(a - half) * len, p.y + Math.sin(a - half) * len)
            ctx.lineTo(p.x + Math.cos(a + half) * len, p.y + Math.sin(a + half) * len)
            ctx.closePath()
            ctx.fill()
          }
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1
          break
        }
        case PK.pillar: {
          // A column of golden light rising off the player.
          this.world()
          const w = p.size * (1 - t * 0.6) * (t < 0.12 ? t / 0.12 : 1)
          const grad = ctx.createLinearGradient(0, p.y, 0, p.y - p.width)
          grad.addColorStop(0, 'rgba(255,215,94,0.5)')
          grad.addColorStop(1, 'rgba(255,215,94,0)')
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = (1 - t) ** 1.2
          ctx.fillStyle = grad
          ctx.fillRect(p.x - w / 2, p.y - p.width, w, p.width)
          ctx.fillStyle = 'rgba(255,255,255,.3)'
          ctx.fillRect(p.x - w / 6, p.y - p.width * 0.8, w / 3, p.width * 0.8)
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1
          break
        }
        case PK.pop: {
          // The enemy's flash frame stretches, squashes and shrinks away.
          const art = this.enemySheet(p.n).flash
          const frame = art.frames[0]
          const big = frame.w > 64
          const k = 1 - t
          const feet = p.y + ENEMIES[p.n].radius * p.size * 0.8
          const stretch = 1 + 0.3 * Math.sin(clamp01(t * 2.4) * Math.PI)
          this.art(
            frame,
            p.x,
            feet,
            big ? 64 : 32,
            big ? 120 : 58,
            p.x > this.focus.x && !NO_FLIP.has(ENEMIES[p.n].id),
            clamp01(k * 1.6),
            p.size * (1 + 0.45 * t) * k,
            p.size * stretch * (1 - 0.5 * t) * k
          )
          break
        }
        case PK.warn: {
          // A pulsing red warning circle where the boss is about to arrive.
          this.world()
          const pulse = 0.5 + 0.5 * Math.sin(p.age * 14)
          const fade = clamp01((1 - t) * 6)
          ctx.globalAlpha = fade
          ctx.fillStyle = `rgba(255,50,70,${0.1 + 0.12 * pulse})`
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, 0, 0, TAU)
          ctx.fill()
          ctx.strokeStyle = `rgba(255,70,90,${0.6 + 0.3 * pulse})`
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, 0, 0, TAU)
          ctx.stroke()
          ctx.setLineDash([9, 7])
          ctx.lineDashOffset = -p.age * 40
          ctx.lineWidth = 2
          ctx.strokeStyle = 'rgba(255,200,200,.8)'
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size * 0.72, p.size * 0.4, 0, 0, TAU)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = 1
          break
        }
        default:
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  /** A red telegraph lane from a winding-up enemy toward its nearest player. */
  private telegraph(e: Ent, origins: { x: number; y: number }[]) {
    const ctx = this.ctx
    const def = e.def!
    const boss = def.behavior === 'boss'
    let best = -1
    let bd = Infinity
    for (let j = 0; j < origins.length; j++) {
      const d = (origins[j].x - e.x) ** 2 + (origins[j].y - e.yy) ** 2
      if (d < bd) {
        bd = d
        best = j
      }
    }
    if (best < 0) return
    const angle = Math.atan2(origins[best].y - e.yy, origins[best].x - e.x)
    const len = Math.min(Math.sqrt(bd), boss ? 460 : 320)
    const half = Math.max(9, def.radius * (boss ? 0.95 : 0.8))
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 16)
    this.world()
    ctx.save()
    ctx.translate(e.x, e.yy)
    ctx.rotate(angle)
    const grad = ctx.createLinearGradient(0, 0, len, 0)
    grad.addColorStop(0, `rgba(255,50,40,${0.06 + 0.06 * pulse})`)
    grad.addColorStop(1, `rgba(255,50,40,${0.22 + 0.1 * pulse})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, -half, len, half * 2)
    ctx.setLineDash([8, 6])
    ctx.lineDashOffset = -this.clock * 60
    ctx.strokeStyle = `rgba(255,110,90,${0.5 + 0.25 * pulse})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -half)
    ctx.lineTo(len, -half)
    ctx.moveTo(0, half)
    ctx.lineTo(len, half)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  /** Screen-space overlays: flashes, the low-HP vignette. Leaves an identity transform. */
  private overlays(view: View, me: ViewPlayer | undefined) {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const edge = (rgb: string, alpha: number, inner: number) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner, w / 2, h / 2, Math.hypot(w, h) / 2)
      grad.addColorStop(0, `rgba(${rgb},0)`)
      grad.addColorStop(1, `rgba(${rgb},${alpha})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    }
    for (const f of this.fx.flashes) {
      const a = Math.min(1, f.alpha)
      if (f.kind === 'full') {
        ctx.fillStyle = `rgba(${f.rgb},${a})`
        ctx.fillRect(0, 0, w, h)
      } else edge(f.rgb, a, 0.3)
    }
    if (me && !me.downed && view.phase === 'playing' && me.maxHp > 0) {
      const ratio = Math.max(0, me.hp) / me.maxHp
      if (ratio < 0.3) {
        // A heartbeat that quickens as the life drains away.
        const s = 1 - ratio / 0.3
        const t = (this.clock * (1.1 + 1.6 * s)) % 1
        const bump = (c: number) => Math.exp(-(((t - c) / 0.07) ** 2))
        const beat = bump(0.08) + 0.6 * bump(0.28)
        edge('200,20,40', (0.2 + 0.4 * s) * (0.55 + 0.45 * Math.min(1, beat)) * (this.fx.motion < 1 ? 0.6 : 1), 0.25)
      }
    }
  }

  private drawParentMemorials(view: View, dt: number, smooth: boolean) {
    if (this.parentMemorialTime !== undefined && view.time < this.parentMemorialTime) this.parentMemorials.clear()
    this.parentMemorialTime = view.time
    for (const id of this.parentMemorials.keys()) {
      if (!view.players.some((player) => player.id === id && player.parentDeath)) this.parentMemorials.delete(id)
    }
    for (const player of view.players) {
      const death = player.parentDeath
      if (!death) continue
      const key = [player.parent, death.at, death.x, death.y, death.reward].join(':')
      const elapsed = view.time - death.at
      let entry = this.parentMemorials.get(player.id)
      if (!entry || entry.key !== key) {
        entry = { key, age: elapsed }
        this.parentMemorials.set(player.id, entry)
      } else {
        entry.age =
          smooth && elapsed >= 0 ? Math.max(elapsed, entry.age + (view.phase === 'playing' ? dt : 0)) : elapsed
      }
      const memorial = parentMemorialAt(player, death.at + entry.age)
      if (!memorial || !player.parentDeath) continue
      const { x, y, reward } = player.parentDeath
      const { age, alpha, rise, rewardAlpha } = memorial
      const anim = sheet('death:elder').collapse
      const index = frameAt(anim, age)
      this.art(anim.frames[index], x + 30, y + 12, 32, 58, false, (anim.alpha?.[index] ?? 1) * alpha)
      this.art(sheet('icons')[player.parent].frames[0], x - 2, y - 16 - rise * 0.65, 16, 16, false, alpha)
      const soul = sheet('soul').float
      this.art(pick(soul, age), x + 30, y - 15 - rise * 0.5, 8, 16, false, Math.min(1, Math.max(0, age - 0.8)) * alpha)
      const legacy = PARENT_LEGACIES[player.parent]
      if (reward !== 'none')
        this.art(sheet('icons')[legacy].frames[0], x + 62, y - 65, 16, 16, false, rewardAlpha * alpha)
      this.world()
      const lines = [
        `${player.name}：${WEAPON_BY_ID.get(player.parent)!.name}とのお別れ`,
        reward === 'none'
          ? '親の武器を手放した'
          : reward === 'choice'
            ? '成長の選択 +1'
            : `「${PASSIVE_BY_ID.get(legacy)!.name}」を継承！`
      ]
      lines.forEach((text, line) => {
        this.blit(this.label(text, 13, '#f1f4fc'), x + 30, y - 126 + line * 22, 0, line ? rewardAlpha * alpha : alpha)
      })
    }
  }

  draw(view: View, localId: string, dt: number, smooth: boolean) {
    this.prewarmAppearances(view)
    this.prewarm('elder')
    this.frame++
    const ctx = this.ctx
    const k = smooth ? Math.min(1, dt * 14) : 1
    const me = view.players.find((p) => p.id === localId) ?? view.players[0]
    const positions = new Map(view.players.map((p) => [p.id, this.playerPosition(p, k)]))
    for (const id of this.deaths.keys()) if (!positions.has(id)) this.deaths.delete(id)
    const origins = view.players.map((p) => positions.get(p.id)!)
    if (me) {
      const p = positions.get(me.id)!
      this.focus.x = p.x
      this.focus.y = p.y
    }
    this.clock += dt
    const stage = stageAt(view.time)
    this.halfW = this.canvas.width / 2 / this.scale + 80
    this.halfH = this.canvas.height / 2 / this.scale + 80
    const halfW = this.halfW
    const halfH = this.halfH

    // Events first: they spawn particles, shake and flashes for this frame.
    const local = view.players.findIndex((p) => p.id === localId)
    const fv = this.fxView
    fv.local = local
    fv.px = this.focus.x
    fv.py = this.focus.y
    fv.cx = this.focus.x
    fv.cy = this.focus.y
    fv.hw = halfW - 80
    fv.hh = halfH - 80
    this.fx.consume(view.fx, view.time, fv)
    this.fx.update(Math.min(dt, 0.1))
    this.evo.fill(0)
    // Shake: a camera offset snapped to device pixels so the whole picture moves rigidly.
    this.fx.shakeOffset(this.shake)
    const snap = (v: number) => Math.round(v * this.scale) / this.scale
    this.camera.x = this.focus.x + snap(this.shake.x)
    this.camera.y = this.focus.y + snap(this.shake.y)
    const visible = (x: number, y: number) => Math.abs(x - this.camera.x) < halfW && Math.abs(y - this.camera.y) < halfH

    // Ground of this stage of life, crossfading from the previous one when a new stage begins.
    if (this.groundShown?.stage !== stage) {
      this.groundShown = { stage, from: this.groundShown?.stage, at: this.clock }
      this.prewarm(bodyFor(stage))
    }
    const fade = Math.min(1, (this.clock - this.groundShown.at) / GROUND_FADE)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#16121c'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    if (this.groundShown.from && fade < 1) this.ground(this.groundShown.from, 1, halfW, halfH)
    this.ground(stage, this.groundShown.from ? fade : 1, halfW, halfH)
    this.world()

    // Experience gems and pickups: pixel sprites with a gentle bob and a soft shadow.
    const items = sheet('items')
    const g = view.gems
    // Shadows of everything in one path: much cheaper than one fill each.
    ctx.fillStyle = 'rgba(12,8,20,.2)'
    ctx.beginPath()
    for (let i = 0; i < g.length; i += STRIDE.gems) {
      if (!visible(g[i], g[i + 1])) continue
      ctx.moveTo(g[i] + 4, g[i + 1] + 6)
      ctx.ellipse(g[i], g[i + 1] + 6, 4, 1.5, 0, 0, TAU)
    }
    ctx.fill()
    for (let i = 0; i < g.length; i += STRIDE.gems) {
      if (!visible(g[i], g[i + 1])) continue
      const v = g[i + 2]
      const anim = v >= 20 ? items.gem3 : v >= 4 ? items.gem2 : items.gem1
      const bob = Math.round(Math.sin(this.clock * 3 + i) * 1.5)
      this.art(pick(anim, this.clock + i * 0.07), g[i], g[i + 1] + bob, 8, 10)
    }
    this.world()
    const it = view.items
    for (let i = 0; i < it.length; i += STRIDE.items) {
      const anim = items[ITEM_KINDS[it[i]]]
      const bob = Math.round(Math.sin(this.clock * 3 + i) * 2)
      this.shadow(it[i + 1], it[i + 2] + 8, 6, 0.22)
      this.art(anim.frames[0], it[i + 1], it[i + 2] + bob, 8, 12)
    }
    this.world()

    // Enemies of the crowd (kept for the telegraphs and the Y-sorted draw).
    const e = view.enemies
    this.entCount = 0
    this.winders.length = 0
    const fresh = this.states.size === 0
    for (let i = 0; i < e.length; i += STRIDE.enemies) {
      const def = ENEMIES[e[i + 1]]
      const id = e[i]
      const pos = smooth ? this.ease(id, e[i + 2], e[i + 3], k) : null
      const x = pos ? pos.x : e[i + 2]
      const y = pos ? pos.y : e[i + 3]
      const flags = e[i + 6]
      let st = this.states.get(id)
      if (!st) {
        st = {
          born: fresh && e.length > STRIDE.enemies * 6 ? -9 : this.clock,
          seen: this.frame,
          windup: -9,
          blink: false
        }
        this.states.set(id, st)
      }
      st.seen = this.frame
      if (flags & ENEMY_FLAG.windup) {
        if (st.windup < 0) st.windup = this.clock
      } else st.windup = -9
      const blinking = (flags & ENEMY_FLAG.blink) !== 0
      if (blinking !== st.blink) {
        st.blink = blinking
        // Vanishes and reappears in a puff of smoke.
        if (visible(x, y)) this.fx.sprite('poof', x, y, { life: 0.3, scale: 0.9, fade: false })
      }
      if (!visible(x, y)) continue
      const ent = (this.ents[this.entCount] ??= {
        y: 0,
        kind: 0,
        id: 0,
        x: 0,
        yy: 0,
        hp: 0,
        flash: 0,
        flags: 0,
        tagLift: 0
      })
      this.entCount++
      ent.y = y + def.radius * 0.8
      ent.def = def
      ent.kind = e[i + 1]
      ent.player = undefined
      ent.id = id
      ent.x = x
      ent.yy = y
      ent.hp = e[i + 4]
      ent.flash = e[i + 5]
      ent.flags = flags
      ent.state = st
      if (flags & ENEMY_FLAG.windup) this.winders.push(ent)
    }
    if (this.frame % 60 === 0) {
      for (const [id, entry] of this.shown) if (entry.seen !== this.frame) this.shown.delete(id)
      for (const [id, entry] of this.states) if (entry.seen !== this.frame) this.states.delete(id)
    }

    // Ground effects first (auras, zones, shockwaves, clouds), drawn at their real hit radius.
    const s = view.shots
    for (const w of this.winders) this.telegraph(w, origins)
    this.particles(0)
    this.world()
    for (let i = 0; i < s.length; i += STRIDE.shots) this.groundShot(view, this.load(view, origins, i), WEAPONS[s[i]])
    this.world()

    // Characters: enemies and players Y-sorted so overlaps read correctly.
    const list: Ent[] = this.ents.slice(0, this.entCount)
    // Name tags of players standing together stack instead of overlapping.
    view.players.forEach((player, i) => {
      const pos = origins[i]
      const near = view.players.slice(0, i).filter((o) => {
        const q = positions.get(o.id)!
        return Math.abs(q.x - pos.x) < 80 && Math.abs(q.y - pos.y) < 24
      }).length
      list.push({
        y: pos.y + 16,
        kind: 0,
        player,
        id: i,
        x: pos.x,
        yy: pos.y,
        hp: 0,
        flash: 0,
        flags: 0,
        tagLift: near * 13
      })
      // The family sorts on its own feet, so a step behind the player is drawn behind them.
      for (const member of this.family(player, pos, view.phase, dt))
        list.push({
          y: member.y + 16,
          kind: 0,
          member,
          id: i,
          x: member.x,
          yy: member.y,
          hp: 0,
          flash: 0,
          flags: 0,
          tagLift: 0
        })
    })
    if (this.frame % 60 === 0) for (const id of this.families.keys()) if (!positions.has(id)) this.families.delete(id)
    list.sort((a, b) => a.y - b.y)
    // Every enemy's shadow in one path (ghosts cast none), under all the sprites.
    this.world()
    ctx.fillStyle = 'rgba(12,8,20,.28)'
    ctx.beginPath()
    for (const ent of list) {
      if (!ent.def || ent.flags & ENEMY_FLAG.ghost) continue
      const rx = ent.def.radius * 0.9 * (ent.flags & ENEMY_FLAG.elite ? 1.25 : 1)
      ctx.moveTo(ent.x + rx, ent.y)
      ctx.ellipse(ent.x, ent.y, rx, Math.min(6, rx * 0.36), 0, 0, TAU)
    }
    ctx.fill()
    this.bars.length = 0
    for (const item of list) {
      if (item.member) this.follower(item.member)
      else if (item.player) {
        const player = item.player
        this.player(player, positions.get(player.id)!, player.id === localId, view.time, view.phase, item.tagLift)
      } else this.enemy(item)
    }
    this.world()
    this.lifeBars()
    // While your own death plays, the world dims around a spotlight on the body (others' deaths don't).
    const mine = view.players.find((p) => p.id === localId)
    const dying = mine?.downed ? this.deaths.get(mine.id) : undefined
    if (mine && dying) {
      const pos = positions.get(mine.id)!
      const k = Math.min(1, (this.clock - dying.at) / 0.6)
      const grad = ctx.createRadialGradient(pos.x, pos.y - 8, 26, pos.x, pos.y - 8, 240)
      grad.addColorStop(0, 'rgba(8,5,14,0)')
      grad.addColorStop(0.25, `rgba(8,5,14,${0.5 * k})`)
      grad.addColorStop(1, `rgba(8,5,14,${0.82 * k})`)
      ctx.fillStyle = grad
      ctx.fillRect(this.camera.x - halfW, this.camera.y - halfH, halfW * 2, halfH * 2)
    }

    this.trailBudget = 70
    for (let i = 0; i < s.length; i += STRIDE.shots) {
      const sh = this.load(view, origins, i)
      if (Math.abs(sh.x - this.camera.x) > halfW + 400 && Math.abs(sh.ox - this.camera.x) > halfW + 400) continue
      this.topShot(view, sh, WEAPONS[s[i]])
    }
    this.world()

    // Enemy bullets: the animated sprite on a pulsing red danger halo (one baked image per bullet).
    const b = view.bullets
    if (b.length) {
      const sprites = sheet('bullets')
      const sc = this.scale
      const kk = Math.max(1, Math.ceil(sc - 0.01))
      const size = Math.round(40 * sc)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      for (let i = 0; i < b.length; i += STRIDE.bullets) {
        if (!visible(b[i], b[i + 1])) continue
        const kind = b[i + 2]
        const anim = sprites[BULLET_KINDS[kind]]
        const index = frameIndex(anim, this.clock + i * 0.05)
        const hot = Math.sin(this.clock * 12 + i) > 0
        const image = this.sprite(
          `bullet:${kind}:${index}:${hot}:${kk}`,
          (g) => {
            g.scale(kk, kk)
            const boss = kind >= 5
            const grad = g.createRadialGradient(20, 20, 0, 20, 20, boss ? 19 : 16)
            const tint = boss ? '255,74,42' : '255,51,85'
            grad.addColorStop(0, `rgba(${tint},${hot ? 0.72 : 0.5})`)
            grad.addColorStop(0.55, `rgba(${tint},${hot ? 0.45 : 0.3})`)
            grad.addColorStop(1, `rgba(${tint},0)`)
            g.fillStyle = grad
            g.fillRect(0, 0, 40, 40)
            g.imageSmoothingEnabled = true
            g.drawImage(canvasOf(anim.frames[index], kk), 20 - 9.2, 20 - 9.2, 18.4, 18.4)
          },
          40 * kk,
          40 * kk
        )
        ctx.drawImage(
          image,
          Math.round(this.canvas.width / 2 + (b[i] - this.camera.x) * sc - size / 2),
          Math.round(this.canvas.height / 2 + (b[i + 1] - this.camera.y) * sc - size / 2),
          size,
          size
        )
      }
      this.world()
    }

    // 大往生: a soft warm beam of light falls onto the bed (renderer alpha, not baked into sprites).
    if (view.phase === 'reaper' || view.phase === 'won') {
      const me = view.players.find((p) => p.id === localId) ?? view.players[0]
      if (me) {
        const pos = positions.get(me.id)!
        if (this.beamAt === undefined) this.beamAt = this.clock
        const k = Math.min(1, (this.clock - this.beamAt) / 1.2)
        const top = this.camera.y - halfH
        const grad = ctx.createLinearGradient(0, top, 0, pos.y + 24)
        grad.addColorStop(0, 'rgba(255,236,170,0)')
        grad.addColorStop(1, `rgba(255,236,170,${0.32 * k})`)
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(pos.x - 14, top)
        ctx.lineTo(pos.x + 22, top)
        ctx.lineTo(pos.x + 40, pos.y + 24)
        ctx.lineTo(pos.x - 36, pos.y + 24)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    } else this.beamAt = undefined
    if (view.reaper) {
      // Drawn a step to the side of where it hovers so the old man's face stays visible beside it.
      const x = view.reaper[0] + 30
      const y = view.reaper[1]
      const target = view.players[0] ? positions.get(view.players[0].id)! : { x, y }
      this.shadow(x, y + 66, 26, 0.18)
      // On 大往生 the reaper bows to the departing soul.
      const r = sheet('reaper')
      const frame =
        this.wonAt === undefined
          ? r.move.frames[frameAt(r.move, this.clock)]
          : r.bow.frames[frameAt(r.bow, this.clock - this.wonAt)]
      this.art(frame, x, y + 60, 64, 120, target.x < x)
      this.world()
      this.blit(this.label('死神', 18, '#e6d6ff'), x, y + 76)
    }
    if (this.halo) {
      const halo = sheet('soul').halo
      const frame = halo.frames[frameAt(halo, this.halo.t)]
      this.art(frame, this.halo.x, this.halo.y, frame.w / 2, frame.h, false, this.halo.alpha * 0.88)
      this.world()
      this.halo = undefined
    }

    this.drawParentMemorials(view, dt, smooth)

    // Hits, deaths, level-ups ... : the particles of the fx events.
    this.particles(1)
    this.world()

    // Damage numbers: pop in big, settle, drift up; 特攻 stays yellow with "!", crits are bigger, orange-red, "!!".
    const p = view.popups
    for (let i = 0; i < p.length; i += STRIDE.popups) {
      const mine = view.players[p[i + 4]]?.id === localId
      const bits = p[i + 3]
      const strong = (bits & POPUP_BIT.strong) !== 0
      const crit = (bits & POPUP_BIT.crit) !== 0
      const life = p[i + 5] / 100
      const style: NumberStyle = strong && crit ? 'both' : crit ? 'crit' : strong ? 'strong' : mine ? 'mine' : 'other'
      const text = `${p[i + 2]}${crit ? '!!' : strong ? '!' : ''}`
      const age = (1 - life) * 0.6
      const pop = 1 + 0.6 * (1 - easeOut(age / 0.12))
      if (crit && mine && life > 0.85) this.fx.trauma.atLeast(0.14)
      const hop = age < 0.12 ? -Math.sin((age / 0.12) * Math.PI) * 3 : 0
      this.number(text, style, p[i], p[i + 1] - (1 - life) * 24 + hop, pop, Math.min(1, life * 2))
    }

    // Edge arrows toward life events still off-screen.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (let i = 0; i < e.length; i += STRIDE.enemies) {
      const def = ENEMIES[e[i + 1]]
      if (def.behavior !== 'boss') continue
      const dx = e[i + 2] - this.camera.x
      const dy = e[i + 3] - this.camera.y
      if (Math.abs(dx) < halfW - 80 && Math.abs(dy) < halfH - 80) continue
      const a = Math.atan2(dy, dx)
      const cx = this.canvas.width / 2 + Math.cos(a) * (this.canvas.width / 2 - 40)
      const cy = this.canvas.height / 2 + Math.sin(a) * (this.canvas.height / 2 - 40)
      // The boss's own sprite, small, pulsing at the screen edge.
      const frame = sheet(`enemy:${def.id}`).move.frames[0]
      const size = 56 + Math.sin(view.time * 8) * 4
      ctx.globalAlpha = 0.85
      ctx.drawImage(
        canvasOf(frame, 1),
        Math.min(this.canvas.width - 34, Math.max(34, cx)) - size / 2,
        Math.min(this.canvas.height - 34, Math.max(34, cy)) - size / 2,
        size,
        size
      )
      ctx.globalAlpha = 1
    }

    this.overlays(view, mine)
  }
}
