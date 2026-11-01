import { ENEMIES, TAG_COLORS, WEAPONS, stageAt } from './data'
import { VIEW_HALF } from './game'
import { STRIDE, type View, type ViewPlayer } from './view'

const FRIENDS = ['🧑', '👧', '👦', '🧑‍🦱', '👩', '🧔']
const ITEM_ICONS = ['🍙', '🎁', '🧲']

/** Canvas renderer. Emoji and labels are rasterised once and reused as sprites. */
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

  private emoji(icon: string, size: number) {
    const px = Math.max(8, Math.round(size))
    return this.sprite(
      `e:${icon}:${px}`,
      (ctx) => {
        ctx.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(icon, px * 0.65, px * 0.7)
      },
      px * 1.3,
      px * 1.4
    )
  }

  private label(text: string, size: number, color: string) {
    const px = Math.round(size)
    return this.sprite(
      `l:${text}:${px}:${color}`,
      (ctx) => {
        ctx.font = `700 ${px}px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = Math.max(2, px / 4)
        ctx.strokeStyle = 'rgba(15,12,20,.85)'
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

  draw(view: View, localId: string, dt: number, smooth: boolean) {
    this.frame++
    const ctx = this.ctx
    const k = smooth ? Math.min(1, dt * 14) : 1
    const me = view.players.find((p) => p.id === localId) ?? view.players[0]
    const positions = new Map(view.players.map((p) => [p.id, this.playerPosition(p, k)]))
    if (me) this.camera = { ...positions.get(me.id)! }
    const stage = stageAt(view.time)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = stage.ground
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(
      this.scale,
      0,
      0,
      this.scale,
      this.canvas.width / 2 - this.camera.x * this.scale,
      this.canvas.height / 2 - this.camera.y * this.scale
    )
    const halfW = this.canvas.width / 2 / this.scale + 80
    const halfH = this.canvas.height / 2 / this.scale + 80
    const visible = (x: number, y: number) => Math.abs(x - this.camera.x) < halfW && Math.abs(y - this.camera.y) < halfH

    // Ground: grid and scattered keepsakes of this stage of life.
    const cell = 160
    ctx.strokeStyle = stage.line
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = Math.floor((this.camera.x - halfW) / cell) * cell; x < this.camera.x + halfW; x += cell) {
      ctx.moveTo(x, this.camera.y - halfH)
      ctx.lineTo(x, this.camera.y + halfH)
    }
    for (let y = Math.floor((this.camera.y - halfH) / cell) * cell; y < this.camera.y + halfH; y += cell) {
      ctx.moveTo(this.camera.x - halfW, y)
      ctx.lineTo(this.camera.x + halfW, y)
    }
    ctx.stroke()
    for (let cx = Math.floor((this.camera.x - halfW) / cell); cx * cell < this.camera.x + halfW; cx++)
      for (let cy = Math.floor((this.camera.y - halfH) / cell); cy * cell < this.camera.y + halfH; cy++) {
        const hash = Math.abs(Math.imul(cx * 73856093, 1) ^ Math.imul(cy, 19349663)) % 997
        if (hash % 5) continue
        this.blit(
          this.emoji(stage.decor[hash % stage.decor.length], 26),
          cx * cell + (hash % 120) + 20,
          cy * cell + ((hash * 7) % 120) + 20,
          0,
          0.35
        )
      }

    // Experience and items.
    const g = view.gems
    for (let i = 0; i < g.length; i += STRIDE.gems) {
      if (!visible(g[i], g[i + 1])) continue
      const v = g[i + 2]
      ctx.fillStyle = v >= 20 ? '#ff5d73' : v >= 4 ? '#6ee7a8' : '#69b7ff'
      const s = v >= 20 ? 8 : v >= 4 ? 6 : 5
      ctx.beginPath()
      ctx.moveTo(g[i], g[i + 1] - s)
      ctx.lineTo(g[i] + s * 0.7, g[i + 1])
      ctx.lineTo(g[i], g[i + 1] + s)
      ctx.lineTo(g[i] - s * 0.7, g[i + 1])
      ctx.fill()
    }
    const items = view.items
    for (let i = 0; i < items.length; i += STRIDE.items)
      this.blit(this.emoji(ITEM_ICONS[items[i]], 26), items[i + 1], items[i + 2] + Math.sin(view.time * 4 + i) * 3)

    // Ground effects first (auras and zones), then enemies, then flying shots.
    const s = view.shots
    for (let i = 0; i < s.length; i += STRIDE.shots) {
      const def = WEAPONS[s[i]]
      if (def.behavior !== 'aura' && def.behavior !== 'zone') continue
      const owner = view.players[s[i + 6]]
      const pos = def.behavior === 'aura' && owner ? positions.get(owner.id)! : { x: s[i + 1], y: s[i + 2] }
      const radius = s[i + 3]
      const pulse = 1 + Math.sin(view.time * 6) * 0.03
      ctx.fillStyle = `${def.color}33`
      ctx.strokeStyle = `${def.color}aa`
      ctx.lineWidth = 3
      ctx.setLineDash([10, 8])
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius * pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
      if (def.behavior === 'zone') this.blit(this.emoji(def.icon, 30), pos.x, pos.y, 0, 0.9)
      else
        for (let j = 0; j < 4; j++) {
          const a = view.time * 1.5 + (j * Math.PI) / 2
          this.blit(
            this.emoji(def.icon, 16),
            pos.x + Math.cos(a) * radius * 0.7,
            pos.y + Math.sin(a) * radius * 0.7,
            0,
            0.7
          )
        }
    }

    const e = view.enemies
    const live = new Set<number>()
    for (let i = 0; i < e.length; i += STRIDE.enemies) {
      const def = ENEMIES[e[i + 1]]
      const pos = smooth ? this.ease(e[i], e[i + 2], e[i + 3], k) : { x: e[i + 2], y: e[i + 3] }
      live.add(e[i])
      if (!visible(pos.x, pos.y)) continue
      const boss = def.behavior === 'boss'
      const wobble = Math.sin(view.time * 8 + e[i]) * 2
      ctx.fillStyle = 'rgba(0,0,0,.25)'
      ctx.beginPath()
      ctx.ellipse(pos.x, pos.y + def.radius * 0.8, def.radius * 0.9, def.radius * 0.35, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = e[i + 5] ? '#ffffff' : TAG_COLORS[def.tag]
      ctx.globalAlpha = e[i + 5] ? 0.9 : 0.55
      ctx.beginPath()
      ctx.arc(pos.x, pos.y + wobble, def.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      const angle = def.behavior === 'dash' ? 0 : Math.sin(view.time * 5 + e[i]) * 0.12
      this.blit(this.emoji(def.icon, def.radius * 1.7), pos.x, pos.y + wobble, angle)
      this.blit(
        this.label(def.name, boss ? 16 : 10, boss ? '#ffe08a' : '#f4ecff'),
        pos.x,
        pos.y + def.radius + (boss ? 14 : 8)
      )
      if (boss || e[i + 4] < 100) {
        const w = def.radius * 2
        ctx.fillStyle = 'rgba(0,0,0,.6)'
        ctx.fillRect(pos.x - w / 2, pos.y - def.radius - 12, w, boss ? 6 : 3)
        ctx.fillStyle = boss ? '#ff5d73' : '#ffb3b3'
        ctx.fillRect(pos.x - w / 2, pos.y - def.radius - 12, (w * e[i + 4]) / 100, boss ? 6 : 3)
      }
    }
    if (smooth && this.frame % 60 === 0) for (const id of this.shown.keys()) if (!live.has(id)) this.shown.delete(id)

    for (let i = 0; i < s.length; i += STRIDE.shots) {
      const def = WEAPONS[s[i]]
      const [x, y, radius, angle, life] = [s[i + 1], s[i + 2], s[i + 3], s[i + 4] / 100, s[i + 5] / 100]
      const owner = view.players[s[i + 6]]
      const origin = owner ? positions.get(owner.id)! : { x, y }
      switch (def.behavior) {
        case 'aura':
        case 'zone':
          break
        case 'orbit': {
          // Re-derive the orbit around the eased owner so it never lags behind them.
          const orbit = Math.hypot(x - (owner?.x ?? x), y - (owner?.y ?? y))
          const ox = origin.x + Math.cos(angle) * orbit
          const oy = origin.y + Math.sin(angle) * orbit
          const icon = def.id.startsWith('w_friend') ? FRIENDS[i % FRIENDS.length] : def.icon
          ctx.strokeStyle = `${def.color}55`
          ctx.lineWidth = 6
          ctx.beginPath()
          ctx.arc(origin.x, origin.y, orbit, angle - 0.5, angle)
          ctx.stroke()
          this.blit(this.emoji(icon, radius * 1.5), ox, oy, Math.sin(view.time * 12 + i) * 0.2, Math.min(1, life * 4))
          break
        }
        case 'whip':
        case 'flail': {
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(angle)
          ctx.globalAlpha = Math.min(1, life * 1.5)
          const grad = ctx.createLinearGradient(-radius, 0, radius, 0)
          grad.addColorStop(0, `${def.color}00`)
          grad.addColorStop(1, `${def.color}dd`)
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.ellipse(0, 0, radius, 20, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          for (let j = 0; j < 3; j++)
            this.blit(
              this.emoji(def.icon, 18),
              x + Math.cos(angle) * (j - 1) * radius * 0.6,
              y + Math.sin(angle) * (j - 1) * radius * 0.6,
              0,
              life
            )
          break
        }
        case 'strike': {
          ctx.strokeStyle = `${def.color}`
          ctx.globalAlpha = life
          ctx.lineWidth = 6
          ctx.beginPath()
          ctx.moveTo(x - 30, y - 260)
          ctx.lineTo(x + 12, y - 120)
          ctx.lineTo(x - 10, y - 90)
          ctx.lineTo(x, y)
          ctx.stroke()
          ctx.globalAlpha = 1
          this.blit(this.emoji(def.icon, radius * 1.4), x, y, 0, life)
          break
        }
        case 'rain': {
          const fall = Math.max(0, life - 0.35) / 0.65
          this.blit(this.emoji('💴', 26), x, y - fall * 240, fall * 4, 1)
          if (fall === 0) this.blit(this.emoji(def.icon, radius * 1.4), x, y, 0, life * 3)
          break
        }
        default:
          this.blit(
            this.emoji(def.icon, Math.max(18, radius * 2)),
            x,
            y,
            def.behavior === 'aim' ? angle + Math.PI / 4 : angle
          )
      }
    }

    for (const player of view.players) {
      const pos = positions.get(player.id)!
      const local = player.id === localId
      ctx.fillStyle = 'rgba(0,0,0,.3)'
      ctx.beginPath()
      ctx.ellipse(pos.x, pos.y + 16, 16, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = player.color
      ctx.lineWidth = local ? 4 : 3
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2)
      ctx.stroke()
      if (player.downed) {
        this.blit(this.emoji('💔', 30), pos.x, pos.y)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 28, -Math.PI / 2, -Math.PI / 2 + player.revive * Math.PI * 2)
        ctx.stroke()
      } else
        this.blit(
          this.emoji(stage.icon, 32),
          pos.x,
          pos.y - 2 + Math.sin(view.time * 10) * (player.hurt ? 3 : 1),
          player.fx < 0 ? -0.08 : 0.08,
          player.hurt ? 0.6 : 1
        )
      this.blit(this.label(local ? `${player.name}（あなた）` : player.name, 11, player.color), pos.x, pos.y - 34)
      const w = 40
      ctx.fillStyle = 'rgba(0,0,0,.6)'
      ctx.fillRect(pos.x - w / 2, pos.y + 24, w, 5)
      ctx.fillStyle = player.hp / player.maxHp > 0.3 ? '#7be495' : '#ff6b6b'
      ctx.fillRect(pos.x - w / 2, pos.y + 24, (w * Math.max(0, player.hp)) / Math.max(1, player.maxHp), 5)
    }

    if (view.reaper) {
      const [x, y] = view.reaper
      ctx.fillStyle = 'rgba(10,0,20,.35)'
      ctx.beginPath()
      ctx.arc(x, y, 70, 0, Math.PI * 2)
      ctx.fill()
      this.blit(this.emoji('💀', 64), x, y + Math.sin(view.time * 3) * 6)
      this.blit(this.label('死神', 18, '#e6d6ff'), x, y + 50)
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
      this.blit(
        this.emoji(def.icon, 36),
        Math.min(this.canvas.width - 30, Math.max(30, cx)),
        Math.min(this.canvas.height - 30, Math.max(30, cy)),
        0,
        0.8 + Math.sin(view.time * 8) * 0.2
      )
    }
  }
}
