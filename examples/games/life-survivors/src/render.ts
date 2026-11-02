import { canvasOf } from './art/atlas'
import { deathKind, soulAt } from './art/deaths'
import { NO_FLIP, PENCIL_DIRS, SWING_DIRS, evolve, playMat, sheet, swing } from './art/index'
import { Raster } from './art/raster'
import { duration, frameAt, type Anim } from './art/sheet'
import { FLAT_PROPS, GROUNDS, PROP_CELL, TILE, groundTile, propsAt } from './art/world'
import { ENEMIES, ENEMY_BY_ID, MAX_WEAPON_LEVEL, WEAPONS, WEAPON_BY_ID, ageAt, stageAt, type Stage } from './data'
import { VIEW_HALF } from './game'
import { ITEM_KINDS, STRIDE, type View, type ViewPlayer } from './view'

/** Painted player bodies by the stage age they belong to; other stages use the nearest one. */
const BODIES: Record<string, string> = {
  乳児期: 'baby',
  幼児期: 'toddler',
  小学生: 'kid',
  中学生: 'junior',
  高校生: 'high',
  大学生: 'college',
  社会人: 'adult',
  働き盛り: 'prime',
  中年: 'middle',
  老後: 'elder',
  寝たきり: 'bed'
}
/** Every life stage has its own painted body. */
export const bodyFor = (stage: Stage) => BODIES[stage.name] ?? 'adult'
const GROUND_FADE = 1.5
/** Whether a player's weapon has evolved (Lv8 + its matching passive), from the snapshot alone. */
function isEvolvedView(owner: ViewPlayer | undefined, id: string) {
  const def = WEAPON_BY_ID.get(id)
  const w = owner?.weapons.find((x) => x[0] === id)
  return Boolean(
    def?.evolve && w && w[1] >= MAX_WEAPON_LEVEL && owner!.passives.some((p) => p[0] === def.evolve!.passive)
  )
}

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

/** Sprites carrying lettering (¥, 至急) never mirror. */

/** Canvas renderer: generated pixel art for everything in the world; labels are rasterised once and reused. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly sprites = new Map<string, HTMLCanvasElement>()
  private readonly shown = new Map<number, { x: number; y: number; seen: number }>()
  private readonly shownPlayers = new Map<string, { x: number; y: number }>()
  private frame = 0
  private width = 1
  private height = 1
  private scale = 1
  private camera = { x: 0, y: 0 }
  /** Renderer clock: animations keep breathing even while the game is paused. */
  private clock = 0
  private wonAt?: number
  private beamAt?: number
  /** ms spent generating the death animation on the frame a player went down (dev hook). */
  deathBuildMs = 0
  private halo?: { x: number; y: number; t: number; alpha: number }
  private groundShown?: { stage: Stage; from?: Stage; at: number }
  private readonly motion = new Map<string, { x: number; y: number; speed: number }>()
  private readonly deaths = new Map<string, { at: number; body: string; kind: string }>()

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
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

  private label(text: string, size: number, color: string, quiet = false) {
    const px = Math.round(size)
    return this.sprite(
      `l:${text}:${px}:${color}:${quiet}`,
      (ctx) => {
        ctx.font = `700 ${px}px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = quiet ? Math.max(1.5, px / 5) : Math.max(2, px / 4)
        ctx.strokeStyle = quiet ? 'rgba(15,12,20,.55)' : 'rgba(15,12,20,.85)'
        ctx.strokeText(text, ctx.canvas.width / 2, ctx.canvas.height / 2)
        ctx.fillStyle = color
        ctx.fillText(text, ctx.canvas.width / 2, ctx.canvas.height / 2)
      },
      px * (text.length + 1.2),
      px * 1.6
    )
  }

  private blit(image: HTMLCanvasElement, x: number, y: number, angle = 0, alpha = 1) {
    const ctx = this.ctx
    if (!angle && alpha === 1) return ctx.drawImage(image, x - image.width / 2, y - image.height / 2)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.drawImage(image, -image.width / 2, -image.height / 2)
    ctx.restore()
  }

  /**
   * Draws a pixel-art frame with its pivot (px, py) at world (x, y): device-pixel snapped, pre-upscaled by
   * k = ceil(scale) and smoothed down to the final size ("sharp bilinear"). Leaves an identity transform.
   */
  private art(r: Raster, x: number, y: number, px: number, py: number, flip = false, alpha = 1) {
    const s = this.scale
    const k = Math.max(1, Math.ceil(s - 0.01))
    const dw = r.w * s
    const dh = r.h * s
    const ax = Math.round(this.canvas.width / 2 + (x - this.camera.x) * s)
    const left = Math.round(ax - (flip ? r.w - px : px) * s)
    const top = Math.round(this.canvas.height / 2 + (y - this.camera.y) * s - py * s)
    const ctx = this.ctx
    ctx.globalAlpha = alpha
    ctx.setTransform(flip ? -1 : 1, 0, 0, 1, flip ? left + dw : left, top)
    ctx.drawImage(canvasOf(r, k), 0, 0, dw, dh)
    ctx.globalAlpha = 1
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

  /** Builds this stage's death animations one per idle callback, so going down never hitches. */
  private prewarm(body: string) {
    if (typeof requestIdleCallback !== 'function') return
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

  private enemy(def: (typeof ENEMIES)[number], id: number, pos: { x: number; y: number }, hp: number, flash: number) {
    const ctx = this.ctx
    const boss = def.behavior === 'boss'
    const feet = pos.y + def.radius * 0.8
    const art = sheet(`enemy:${def.id}`)
    this.shadow(pos.x, feet, def.radius * 0.9)
    const anim = flash ? art.flash : art.move
    const frame = anim.frames[frameAt(anim, this.clock + (id % 7) * 0.13)]
    const big = frame.w > 64
    this.art(frame, pos.x, feet, big ? 64 : 32, big ? 120 : 58, pos.x > this.camera.x && !NO_FLIP.has(def.id))
    this.world()
    // Regular enemies get a small, quiet name tag; life-event bosses keep a big one.
    if (boss) this.blit(this.label(def.name, 16, '#ffe08a'), pos.x, feet + 14)
    else this.blit(this.label(def.name, 8, '#f4ecff', true), pos.x, feet + 7, 0, 0.75)
    if (boss || hp < 100) {
      const w = def.radius * 2
      const top = feet - (boss ? 108 : 50)
      ctx.fillStyle = 'rgba(0,0,0,.6)'
      ctx.fillRect(pos.x - w / 2, top, w, boss ? 6 : 3)
      ctx.fillStyle = boss ? '#ff5d73' : '#ffb3b3'
      ctx.fillRect(pos.x - w / 2, top, (w * hp) / 100, boss ? 6 : 3)
    }
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
    const stage = stageAt(time)
    const body = bodyFor(stage)
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
    ctx.ellipse(pos.x, feet, 17, 6, 0, 0, Math.PI * 2)
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
      this.shadow(pos.x, feet, 13)
      this.art(won.frames[this.wonAt === undefined ? 0 : frameAt(won, t)], pos.x, feet, 32, 58, flip)
      const soul = this.wonAt === undefined ? undefined : soulAt(t, duration(won), 'halo')
      // Drawn after the reaper (in front of it), so the soul is seen rising to meet it.
      if (soul) this.halo = { x: pos.x + soul.dx, y: feet + soul.dy, t, alpha: soul.alpha }
      this.world()
    } else if (player.downed) {
      let death = this.deaths.get(player.id)
      if (!death) {
        const tag = player.killer ? ENEMY_BY_ID.get(player.killer)?.tag : undefined
        death = { at: this.clock, body, kind: deathKind(tag, ageAt(time), body) }
        this.deaths.set(player.id, death)
        // Measured for the dev hook: the cost of the death animation on the frame a player goes down.
        const start = performance.now()
        void sheet(`death:${body}`)[death.kind]
        this.deathBuildMs = performance.now() - start
      }
      const anim = sheet(`death:${death.body}`)[death.kind] ?? sheet(`death:${death.body}`).collapse
      const t = this.clock - death.at
      const index = frameAt(anim, t)
      // A lifted body leaves its shadow on the floor, smaller.
      this.shadow(pos.x, feet, 13 * (1 - (anim.lift?.[index] ?? 0) / 40))
      this.art(anim.frames[index], pos.x, feet, 32, 58, flip, anim.alpha?.[index] ?? 1)
      // Lettering is never mirrored: drawn unflipped at the mirrored position.
      const text = anim.text?.[index]
      if (text) {
        const box = letterBox(text)
        const ox = flip ? 64 - box.x - box.r.w : box.x
        this.art(box.r, pos.x, feet, 32 - ox, 58 - box.y, false, anim.alpha?.[index] ?? 1)
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
      this.shadow(pos.x, feet, 13)
      const art = sheet(`player:${body}`)
      const anim = player.hurt ? art.hurt : m.speed > 25 ? art.walk : art.idle
      this.art(
        anim.frames[frameAt(anim, player.hurt ? ((this.clock * 8) % 2) / 8 : this.clock)],
        pos.x,
        feet,
        32,
        58,
        flip
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
      feet - 64 - tagLift,
      0,
      shown
    )
    // Downed players show only the revive ring, not an empty bar.
    if (player.downed) return
    const w = 40
    ctx.globalAlpha = shown
    ctx.fillStyle = 'rgba(0,0,0,.6)'
    ctx.fillRect(pos.x - w / 2, feet + 8, w, 5)
    ctx.fillStyle = player.hp / player.maxHp > 0.3 ? '#7be495' : '#ff6b6b'
    ctx.fillRect(pos.x - w / 2, feet + 8, (w * Math.max(0, player.hp)) / Math.max(1, player.maxHp), 5)
    ctx.globalAlpha = 1
  }

  draw(view: View, localId: string, dt: number, smooth: boolean) {
    this.frame++
    const ctx = this.ctx
    const k = smooth ? Math.min(1, dt * 14) : 1
    const me = view.players.find((p) => p.id === localId) ?? view.players[0]
    const positions = new Map(view.players.map((p) => [p.id, this.playerPosition(p, k)]))
    if (me) this.camera = { ...positions.get(me.id)! }
    this.clock += dt
    const stage = stageAt(view.time)
    const halfW = this.canvas.width / 2 / this.scale + 80
    const halfH = this.canvas.height / 2 / this.scale + 80
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
    for (let i = 0; i < g.length; i += STRIDE.gems) {
      if (!visible(g[i], g[i + 1])) continue
      const v = g[i + 2]
      const anim = v >= 20 ? items.gem3 : v >= 4 ? items.gem2 : items.gem1
      const bob = Math.round(Math.sin(this.clock * 3 + i) * 1.5)
      this.shadow(g[i], g[i + 1] + 6, 4, 0.2)
      this.art(anim.frames[frameAt(anim, this.clock + i * 0.07)], g[i], g[i + 1] + bob, 8, 10)
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

    // Ground effects first (auras and zones), drawn at their real hit radius.
    const s = view.shots
    const fx = sheet('fx')
    const at = (anim: Anim, t: number) => anim.frames[frameAt(anim, t)]
    for (let i = 0; i < s.length; i += STRIDE.shots) {
      const def = WEAPONS[s[i]]
      if (def.behavior !== 'aura' && def.behavior !== 'zone') continue
      const owner = view.players[s[i + 6]]
      const evolved = isEvolvedView(owner, def.id)
      const pos = def.behavior === 'aura' && owner ? positions.get(owner.id)! : { x: s[i + 1], y: s[i + 2] }
      const radius = s[i + 3]
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
          const sprite = j % 4 === 3 ? fx.skull.frames[0] : at(fx.wisp, this.clock + j * 0.2)
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
              at(fx.star, this.clock + j),
              pos.x + Math.cos(j * 1.6 + this.clock) * radius * 0.4,
              pos.y + Math.sin(j * 1.6 + this.clock) * radius * 0.4,
              4,
              4
            )
      }
    }
    this.world()

    // Characters: enemies and players Y-sorted so overlaps read correctly.
    const sorted: { y: number; draw: () => void }[] = []
    const e = view.enemies
    const live = new Set<number>()
    for (let i = 0; i < e.length; i += STRIDE.enemies) {
      const def = ENEMIES[e[i + 1]]
      const pos = smooth ? this.ease(e[i], e[i + 2], e[i + 3], k) : { x: e[i + 2], y: e[i + 3] }
      live.add(e[i])
      if (!visible(pos.x, pos.y)) continue
      const id = e[i]
      const hp = e[i + 4]
      const flash = e[i + 5]
      sorted.push({ y: pos.y + def.radius * 0.8, draw: () => this.enemy(def, id, pos, hp, flash) })
    }
    if (smooth && this.frame % 60 === 0) for (const id of this.shown.keys()) if (!live.has(id)) this.shown.delete(id)

    // Name tags of players standing together stack instead of overlapping.
    const tagLift = new Map<string, number>()
    view.players.forEach((player, i) => {
      const pos = positions.get(player.id)!
      const near = view.players.slice(0, i).filter((o) => {
        const q = positions.get(o.id)!
        return Math.abs(q.x - pos.x) < 80 && Math.abs(q.y - pos.y) < 24
      }).length
      tagLift.set(player.id, near * 13)
    })
    for (const player of view.players) {
      const pos = positions.get(player.id)!
      sorted.push({
        y: pos.y + 16,
        draw: () => this.player(player, pos, player.id === localId, view.time, view.phase, tagLift.get(player.id) ?? 0)
      })
    }
    sorted.sort((a, b) => a.y - b.y)
    for (const item of sorted) item.draw()
    this.world()
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

    for (let i = 0; i < s.length; i += STRIDE.shots) {
      const def = WEAPONS[s[i]]
      const [x, y, radius, angle, life] = [s[i + 1], s[i + 2], s[i + 3], s[i + 4] / 100, s[i + 5] / 100]
      const owner = view.players[s[i + 6]]
      const evolved = isEvolvedView(owner, def.id)
      const origin = owner ? positions.get(owner.id)! : { x, y }
      const centred = (frame: Raster, px: number, py: number, alpha = 1) => {
        const f = evolved ? evolve(frame) : frame
        this.art(f, px, py, f.w / 2, f.h / 2, false, alpha)
      }
      switch (def.behavior) {
        case 'aura':
        case 'zone':
          break
        case 'orbit': {
          // Re-derive the orbit around the eased owner so it never lags behind them.
          const orbit = Math.hypot(x - (owner?.x ?? x), y - (owner?.y ?? y))
          const ox = origin.x + Math.cos(angle) * orbit
          const oy = origin.y + Math.sin(angle) * orbit
          const art = sheet(`weapon:${def.id}`)
          const anim = def.id === 'w_friend' ? [art.fly, art.alt, art.alt2][i % 3] : art.fly
          centred(at(anim, this.clock + i * 0.1), ox, oy, Math.min(1, life * 4))
          break
        }
        case 'whip':
        case 'flail': {
          // 美容: a crisp white-pink crescent slash with stars; 頼りない親: motion lines with flailing hands
          // and sweat — both laid exactly along the real whip line (length = radius, at the shot's angle).
          const kind = def.behavior === 'whip' ? 'slash' : 'flail'
          const dir = ((Math.round((angle / (Math.PI * 2)) * SWING_DIRS) % SWING_DIRS) + SWING_DIRS) % SWING_DIRS
          const smear = swing(radius, dir, kind)
          const alpha = Math.min(1, life * 3)
          this.art(evolved ? evolve(smear) : smear, x, y, smear.w / 2, smear.h / 2, false, alpha)
          const n = kind === 'slash' ? 5 : 4
          for (let j = 0; j < n; j++) {
            const t = (j / (n - 1)) * 1.6 - 0.8
            const bulge = (1 - t * t) * 14
            const px = x + Math.cos(angle) * t * radius + Math.sin(angle) * bulge
            const py = y + Math.sin(angle) * t * radius - Math.cos(angle) * bulge
            if (kind === 'slash') centred(at(fx.star, this.clock * 2 + j), px, py, alpha)
            else {
              centred(at(fx.hand, this.clock * 4 + j), px, py, alpha)
              if (j % 2) centred(fx.sweat.frames[0], px + 7, py - 9, alpha)
            }
          }
          break
        }
        case 'strike': {
          // 投資: a chart-arrow bolt from above and an impact burst.
          const bolt = at(fx.bolt, this.clock * 2)
          const f = evolved ? evolve(bolt) : bolt
          this.art(f, x, y, 12, 118, false, Math.min(1, life * 2))
          this.art(at(fx.burst, (1 - life) * 0.6), x, y, 14, 14, false, life)
          break
        }
        case 'rain': {
          // お金持ち: a bundle of bills falls, then coins burst out on impact.
          const fall = Math.max(0, life - 0.35) / 0.65
          if (fall > 0) centred(fx.bills.frames[0], x, y - fall * 240)
          else this.art(at(fx.coins, (0.35 - life) * 3), x, y + 4, 14, 14, false, Math.min(1, life * 3))
          break
        }
        default: {
          const art = sheet(`weapon:${def.id}`)
          if (def.id === 'w_study') {
            // The pencil points along its flight: one of 16 pre-drawn directions.
            const d = ((Math.round((angle / (Math.PI * 2)) * PENCIL_DIRS) % PENCIL_DIRS) + PENCIL_DIRS) % PENCIL_DIRS
            centred(art.fly.frames[d], x, y)
          } else centred(at(art.fly, this.clock + i * 0.1), x, y)
        }
      }
    }
    this.world()

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

    const p = view.popups
    for (let i = 0; i < p.length; i += STRIDE.popups) {
      const mine = view.players[p[i + 4]]?.id === localId
      const strong = p[i + 3] === 1
      const life = p[i + 5] / 100
      const color = strong ? '#ffcf4d' : mine ? '#ffffff' : '#b9b3c9'
      this.blit(
        this.label(strong ? `${p[i + 2]}!` : String(p[i + 2]), strong ? 15 : mine ? 12 : 10, color),
        p[i],
        p[i + 1] - (1 - life) * 24,
        0,
        Math.min(1, life * 2)
      )
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
  }
}
