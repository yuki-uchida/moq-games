/** Canvas renderer: parallax background, tiles, entities, water and effects. */
import type { BakedArt } from '../art'
import { PAL } from '../art/palette'
import type { ThemeId } from '../art'
import { T, type Boss, type Enemy, type Prop, type World } from './sim'
import { TILE } from './types'

interface ThemeBg {
  skyTop: string
  skyBottom: string
  far: string
  mid: string
  near: string
  stars: boolean
  spires: boolean
}

const BG: Record<ThemeId, ThemeBg> = {
  meadow: {
    skyTop: '#6ec3ff',
    skyBottom: '#e6f8ff',
    far: '#a8d8a0',
    mid: '#6fbf72',
    near: '#3f9450',
    stars: false,
    spires: false
  },
  night: {
    skyTop: '#150d38',
    skyBottom: '#4a3580',
    far: '#3a2a68',
    mid: '#2a1f52',
    near: '#1b1440',
    stars: true,
    spires: false
  },
  cave: {
    skyTop: '#241a3d',
    skyBottom: '#5a4470',
    far: '#463560',
    mid: '#352849',
    near: '#241a33',
    stars: false,
    spires: true
  },
  forest: {
    skyTop: '#2f7a52',
    skyBottom: '#b8e8c0',
    far: '#2a6b46',
    mid: '#1f5236',
    near: '#123a26',
    stars: false,
    spires: false
  },
  fortress: {
    skyTop: '#3a3e52',
    skyBottom: '#9aa0b8',
    far: '#565b74',
    mid: '#42465e',
    near: '#2c3042',
    stars: false,
    spires: true
  },
  castle: {
    skyTop: '#4a3f6a',
    skyBottom: '#b0a4d8',
    far: '#5d5486',
    mid: '#463d68',
    near: '#2f2849',
    stars: true,
    spires: true
  },
  star: {
    skyTop: '#0d0722',
    skyBottom: '#4a2a7a',
    far: '#3a2566',
    mid: '#2a1a50',
    near: '#1a1038',
    stars: true,
    spires: false
  }
}

const WHITE_CACHE = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()

function whiteOf(source: HTMLCanvasElement): HTMLCanvasElement {
  const cached = WHITE_CACHE.get(source)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  WHITE_CACHE.set(source, canvas)
  return canvas
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private white = false
  constructor(
    private canvas: HTMLCanvasElement,
    private art: BakedArt
  ) {
    this.ctx = canvas.getContext('2d')!
    this.ctx.imageSmoothingEnabled = false
  }

  draw(world: World, dt: number) {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    const shakeX = world.shake > 0 ? Math.sin(world.time * 70) * world.shake * 6 : 0
    const shakeY = world.shake > 0 ? Math.cos(world.time * 63) * world.shake * 4 : 0
    const camX = Math.round(world.cameraX + shakeX)
    const camY = Math.round(world.cameraY + shakeY)
    this.drawBackground(world.theme, camX, camY, world.time, w, h)
    ctx.save()
    ctx.translate(-camX, -camY)
    this.drawTiles(world, camX, camY, w, h)
    this.drawBossGate(world)
    this.drawProps(world)
    this.drawBees(world)
    this.drawShots(world)
    for (const enemy of world.enemies) this.drawEnemy(enemy, world.time)
    if (world.boss) this.drawBoss(world.boss, world.time)
    this.drawPlayer(world)
    this.drawWater(world)
    this.drawParticles(world)
    this.drawFloaters(world)
    ctx.restore()
    this.drawVignette(w, h)
    void dt
  }

  private drawBossGate(world: World) {
    const gate = world.bossGate
    if (!gate) return
    const ctx = this.ctx
    const x = gate.x * TILE + 9
    const w = TILE - 18
    const y0 = gate.top * TILE
    const h = (gate.bottom - gate.top + 1) * TILE
    ctx.save()
    ctx.globalAlpha = 0.72
    ctx.fillStyle = PAL.gold
    ctx.fillRect(x, y0, w, h)
    ctx.globalAlpha = 0.95
    ctx.strokeStyle = PAL.goldDeep
    ctx.lineWidth = 4
    ctx.strokeRect(x, y0, w, h)
    ctx.fillStyle = PAL.white
    for (let i = 0; i < 3; i++) {
      const px = x + 8 + i * ((w - 20) / 2)
      const off = Math.sin(world.time * 4 + i * 1.7) * 7
      ctx.fillRect(px, y0 + 12 + off, 3, h - 24)
    }
    ctx.restore()
  }

  // ------------------------------------------------------------------ background
  private drawBackground(theme: ThemeId, camX: number, camY: number, time: number, w: number, h: number) {
    const ctx = this.ctx
    const bg = BG[theme]
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, bg.skyTop)
    gradient.addColorStop(1, bg.skyBottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
    if (bg.stars) {
      for (let i = 0; i < 48; i++) {
        const x = ((i * 137.5) % (w + 80)) - 40
        const y = (i * 89.3) % (h * 0.7)
        const tw = 0.5 + 0.5 * Math.sin(time * 2 + i)
        ctx.globalAlpha = 0.35 + tw * 0.6
        ctx.fillStyle = i % 5 === 0 ? PAL.gold : '#ffffff'
        const size = i % 7 === 0 ? 3 : 2
        ctx.fillRect(Math.round(x), Math.round(y), size, size)
      }
      ctx.globalAlpha = 1
    }
    // far hills
    this.hills(bg.far, camX * 0.15, h * 0.62, 90, 26, time)
    this.hills(bg.mid, camX * 0.3, h * 0.74, 120, 34, time + 2)
    this.hills(bg.near, camX * 0.5, h * 0.9, 150, 40, time + 4)
    if (bg.spires) {
      ctx.fillStyle = bg.near
      const offset = -(camX * 0.4) % 160
      for (let x = offset - 160; x < w + 160; x += 160) {
        ctx.beginPath()
        ctx.moveTo(x, h)
        ctx.lineTo(x + 30, h - 130)
        ctx.lineTo(x + 60, h)
        ctx.closePath()
        ctx.fill()
        ctx.fillRect(x + 70, h - 70, 20, 70)
      }
    }
    void camY
  }

  private hills(color: string, offset: number, base: number, amp: number, step: number, time: number) {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 8) {
      const t = (x + offset) / step
      const y = base - Math.abs(Math.sin(t) * amp) - Math.sin(t * 0.37 + time * 0.05) * 8
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
  }

  // ------------------------------------------------------------------ tiles

  private drawTiles(world: World, camX: number, camY: number, w: number, h: number) {
    const tiles = this.art.tiles[world.theme]
    const ground = world.theme === 'fortress' ? tiles.stone : world.theme === 'castle' ? tiles.brick : tiles.ground
    const x0 = Math.max(0, Math.floor(camX / TILE))
    const x1 = Math.min(world.w - 1, Math.ceil((camX + w) / TILE))
    const y0 = Math.max(0, Math.floor(camY / TILE))
    const y1 = Math.min(world.h - 1, Math.ceil((camY + h) / TILE))
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = world.tiles[ty * world.w + tx]
        if (t === T.EMPTY) continue
        const dx = tx * TILE
        const dy = ty * TILE
        if (t === T.SOLID) {
          const above = world.tileAt(tx, ty - 1)
          ctx_draw(this.ctx, above === T.SOLID || above === T.DIRT ? ground : tiles.ground, dx, dy)
        } else if (t === T.DIRT) {
          ctx_draw(this.ctx, tiles.dirt, dx, dy)
        } else if (t === T.PLATFORM) {
          ctx_draw(this.ctx, tiles.platform, dx, dy)
        } else if (t === T.SPIKE) {
          ctx_draw(this.ctx, tiles.spike, dx, dy)
        }
      }
    }
  }

  // ------------------------------------------------------------------ props

  private drawProps(world: World) {
    for (const prop of world.props) {
      const p = this.art.props
      const dx = prop.x
      const dy = prop.y
      switch (prop.kind) {
        case 'tree':
          if (prop.state === 'fallen') break
          this.drawTilted(p.tree, dx, dy, prop.state === 'falling' ? (0.45 - prop.timer) * 2.4 * prop.dir : 0)
          break
        case 'pine':
          if (prop.state === 'fallen') break
          this.drawTilted(p.pine, dx, dy, prop.state === 'falling' ? (0.45 - prop.timer) * 2.4 * prop.dir : 0)
          break
        case 'pipe':
          ctx_draw(this.ctx, prop.state === 'idle' ? p.pipe : p.pipeHole, dx, dy)
          break
        case 'hive':
          if (prop.state !== 'broken') ctx_draw(this.ctx, p.hive, dx, dy)
          break
        case 'animal':
          if (prop.state === 'idle') ctx_draw(this.ctx, p.animal, dx, dy)
          else if (prop.state !== 'done') {
            const img = prop.state === 'awake' ? p.animalAwake : p.animalAwake
            this.drawFlip(img, prop.x, prop.y + TILE - 64, prop.dir < 0)
          }
          break
        case 'rock':
          if (prop.state !== 'broken') ctx_draw(this.ctx, p.rock, dx, dy)
          break
        case 'switch':
          ctx_draw(this.ctx, prop.state === 'done' ? p.switchOn : p.switchOff, dx, dy)
          break
        case 'door':
          if (prop.state === 'closed') ctx_draw(this.ctx, p.door, dx, dy)
          break
        case 'fruit':
          if (prop.state === 'idle') this.drawBob(p.fruit, prop.x + 16, prop.y + 16, world.time + prop.id)
          break
        case 'twig':
          if (prop.state === 'idle') this.drawBob(p.twig, prop.x + 16, prop.y + 16, world.time + prop.id)
          break
        case 'berry':
          if (prop.state === 'idle') this.drawBob(p.berry, prop.x + 16, prop.y + 16, world.time + prop.id)
          break
        case 'star':
          if (prop.state === 'idle') this.drawBob(p.star, prop.x + 16, prop.y + 16, world.time + prop.id)
          break
        case 'goal':
          this.drawGoal(this.art.tiles[world.theme].goal, prop, world)
          break
        case 'nest':
          this.drawGoal(this.art.tiles[world.theme].nest, prop, world)
          break
        case 'princess': {
          const princess = this.art.characters.princess.idle[0]
          const bob = Math.sin(world.time * 2 + prop.id) * 3
          ctx_draw(this.ctx, princess, prop.x, prop.y + bob)
          if (prop.data === 1) {
            const ctx = this.ctx
            ctx.fillStyle = PAL.ink
            for (let i = 0; i < 4; i++) ctx.fillRect(prop.x + 8 + i * 14, prop.y - 4, 4, 72)
            ctx.fillRect(prop.x + 2, prop.y - 6, 60, 6)
            ctx.fillRect(prop.x + 2, prop.y + 62, 60, 6)
          }
          break
        }
        default:
          break
      }
    }
  }

  private drawGoal(img: HTMLCanvasElement, prop: Prop, world: World) {
    if (world.goalOpen) {
      this.drawBob(img, prop.x, prop.y, world.time)
      const spark = this.art.props.spark
      for (let i = 0; i < 3; i++) {
        const a = world.time * 2 + (i * Math.PI * 2) / 3
        ctx_draw(this.ctx, spark, prop.x + 32 + Math.cos(a) * 34 - 8, prop.y + 32 + Math.sin(a) * 26 - 8)
      }
    } else {
      ctx_draw(this.ctx, img, prop.x, prop.y)
      this.ctx.globalAlpha = 0.55
      this.ctx.fillStyle = PAL.ink
      this.ctx.fillRect(prop.x + 6, prop.y + 6, 52, 52)
      this.ctx.globalAlpha = 1
      this.ctx.fillStyle = PAL.gold
      this.ctx.font = 'bold 28px system-ui, sans-serif'
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'middle'
      this.ctx.fillText('🔒', prop.x + 32, prop.y + 34)
    }
  }

  private drawTilted(img: HTMLCanvasElement, x: number, y: number, angle: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x + 32, y + 64)
    ctx.rotate(angle)
    ctx.drawImage(img, -32, -64)
    ctx.restore()
  }

  private drawBob(img: HTMLCanvasElement, x: number, y: number, time: number) {
    const bob = Math.sin(time * 3) * 4
    ctx_draw(this.ctx, img, x - img.width / 2, y - img.height / 2 + bob)
  }

  private drawFlip(img: HTMLCanvasElement, x: number, y: number, flip: boolean) {
    if (!flip) {
      ctx_draw(this.ctx, img, x, y)
      return
    }
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x + img.width / 2, y)
    ctx.scale(-1, 1)
    ctx.drawImage(img, -img.width / 2, 0)
    ctx.restore()
  }

  // ------------------------------------------------------------------ entities

  private drawPlayer(world: World) {
    const p = world.player
    if (p.dead) return
    const art = this.art.characters.player
    const blink = p.invuln > 0 && Math.floor(world.time * 20) % 2 === 0
    if (blink) this.ctx.globalAlpha = 0.45
    let frames: HTMLCanvasElement[]
    let fps = 8
    if (p.anim === 'walk') frames = art.walk
    else if (p.anim === 'jump') frames = [art.jump]
    else if (p.anim === 'fall') frames = [art.fall]
    else if (p.anim === 'bite') {
      frames = art.bite
      fps = 14
    } else if (p.anim === 'hurt') frames = [art.hurt]
    else {
      frames = art.idle
      fps = 2.5
    }
    const frame = frames[Math.floor(world.time * fps) % frames.length]
    const dx = p.x + p.w / 2 - 32
    const dy = p.y + p.h - 64
    this.drawFlip(frame, dx, dy, p.facing < 0)
    this.ctx.globalAlpha = 1
    if (p.anim === 'bite') {
      const mark = this.art.props.biteMark
      const mx = p.facing > 0 ? p.x + p.w + 6 : p.x - 6 - mark.width
      this.ctx.globalAlpha = 0.85
      ctx_draw(this.ctx, mark, mx, p.y + p.h / 2 - mark.height / 2)
      this.ctx.globalAlpha = 1
    }
  }

  private drawEnemy(enemy: Enemy, time: number) {
    const art = this.art.characters[enemy.kind]
    if (!art) return
    let frames: HTMLCanvasElement[]
    let fps = 8
    if (enemy.kind === 'flyer') {
      frames = art.fly ?? art.walk
      fps = 10
    } else if (!enemy.onGround) frames = [art.jump]
    else if (Math.abs(enemy.vx) > 8) {
      frames = art.walk
      fps = 9
    } else {
      frames = art.idle
      fps = 3
    }
    const frame = frames[Math.floor(time * fps + enemy.id) % frames.length]
    const dx = enemy.x + enemy.w / 2 - 32
    const dy = enemy.y + enemy.h - 64
    this.drawFlip(frame, dx, dy, enemy.facing < 0)
    if (enemy.hitFlash > 0) {
      this.ctx.globalAlpha = Math.min(1, enemy.hitFlash * 6)
      const white = whiteOf(frame)
      this.drawFlip(white, dx, dy, enemy.facing < 0)
      this.ctx.globalAlpha = 1
    }
    if (enemy.hp < enemy.maxHp) {
      this.ctx.fillStyle = PAL.ink
      this.ctx.fillRect(dx + 6, dy - 8, 52, 6)
      this.ctx.fillStyle = PAL.fruit
      this.ctx.fillRect(dx + 7, dy - 7, 50 * (enemy.hp / enemy.maxHp), 4)
    }
  }

  private drawBoss(boss: Boss, time: number) {
    if (boss.dead) return
    const art = this.art.characters[boss.def.art]
    if (!art) return
    const size = 64 * boss.def.scale
    let frames: HTMLCanvasElement[]
    let fps = 8
    if (boss.def.kind === 'flyer' || (boss.def.kind === 'swarm' && !boss.onGround)) {
      frames = art.fly ?? art.walk
      fps = 10
    } else if (boss.state === 'charge' || boss.state === 'dive') {
      frames = art.walk
      fps = 12
    } else if (boss.state === 'windup' || boss.state === 'slam') {
      frames = [art.jump]
    } else if (boss.state === 'stunned' || boss.state === 'tired') {
      frames = [art.hurt]
    } else if (boss.state === 'shoot') {
      frames = art.bite
      fps = 12
    } else {
      frames = art.idle
      fps = 3
    }
    const frame = frames[Math.floor(time * fps) % frames.length]
    const dx = boss.x + boss.w / 2 - size / 2
    const dy = boss.y + boss.h - size
    this.drawFlip(frame, dx, dy, boss.facing < 0)
    if (boss.hitFlash > 0) {
      this.ctx.globalAlpha = Math.min(1, boss.hitFlash * 7)
      this.drawFlip(whiteOf(frame), dx, dy, boss.facing < 0)
      this.ctx.globalAlpha = 1
    }
    if (boss.state === 'stunned' || boss.state === 'tired') {
      const note = this.art.props.note
      for (let i = 0; i < 3; i++) {
        const a = time * 3 + (i * Math.PI * 2) / 3
        ctx_draw(this.ctx, note, dx + size / 2 + Math.cos(a) * 26 - 8, dy - 10 + Math.sin(a) * 8)
      }
    }
  }

  private drawBees(world: World) {
    const bee = this.art.bee
    for (const b of world.bees) {
      const flap = Math.sin(world.time * 30 + b.t * 10) > 0 ? 1 : 0.8
      this.ctx.save()
      this.ctx.translate(b.x, b.y)
      this.ctx.scale(1, flap)
      this.ctx.drawImage(bee, -bee.width / 2, -bee.height / 2)
      this.ctx.restore()
    }
  }

  private drawShots(world: World) {
    for (const shot of world.shots) {
      const img =
        shot.kind === 'shock' ? this.art.props.spark : shot.kind === 'rock' ? this.art.props.seed : this.art.props.seed
      ctx_draw(this.ctx, img, shot.x - img.width / 2, shot.y - img.height / 2)
    }
  }

  private drawWater(world: World) {
    const ctx = this.ctx
    ctx.globalAlpha = 0.72
    for (let ty = 0; ty < world.h; ty++) {
      for (let tx = 0; tx < world.w; tx++) {
        if (!world.water[ty * world.w + tx]) continue
        const dx = tx * TILE
        const dy = ty * TILE
        ctx.fillStyle = PAL.water
        ctx.fillRect(dx, dy, TILE, TILE)
        if (!world.waterAt(tx, ty - 1)) {
          ctx.fillStyle = PAL.waterLight
          ctx.fillRect(dx, dy, TILE, 6)
        }
        if (!world.waterAt(tx - 1, ty) || !world.waterAt(tx + 1, ty)) {
          ctx.fillStyle = PAL.waterDeep
          ctx.fillRect(dx, dy, TILE, 4)
        }
      }
    }
    ctx.globalAlpha = 1
  }

  private drawParticles(world: World) {
    for (const particle of world.particles) {
      this.ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife)
      this.ctx.fillStyle = particle.color
      this.ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size)
    }
    this.ctx.globalAlpha = 1
  }

  private drawFloaters(world: World) {
    const ctx = this.ctx
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const floater of world.floaters) {
      ctx.globalAlpha = Math.min(1, floater.life * 1.6)
      ctx.lineWidth = 4
      ctx.strokeStyle = PAL.ink
      ctx.strokeText(floater.text, floater.x, floater.y)
      ctx.fillStyle = floater.color
      ctx.fillText(floater.text, floater.x, floater.y)
    }
    ctx.globalAlpha = 1
  }

  private drawVignette(w: number, h: number) {
    const ctx = this.ctx
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(20,8,40,0.28)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}

function ctx_draw(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number) {
  ctx.drawImage(img, Math.round(x), Math.round(y))
}
