/**
 * Stand-in for the old in-simulation effects: it turns the simulation's events back into the same particles,
 * popups, screen shake and camera follow the game had before the simulation became pure rules. A later renderer
 * replaces it. It keeps its own random stream so the simulation's stream is never touched.
 */
import type { SimEvent } from '../game/events'
import { Rng, type World } from '../game/sim'
import { TILE } from '../game/types'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  gravity: number
}

export interface Floater {
  x: number
  y: number
  text: string
  life: number
  color: string
}

const GOLD = '#ffd45e'
const WHITE = '#ffffff'
const DIRT = '#c98b4b'
const STONE = '#a8a0b8'

export class LegacyFx {
  particles: Particle[] = []
  floaters: Floater[] = []
  shake = 0
  cameraX = 0
  cameraY = 0
  private rng: Rng
  /** Row of the last bitten dirt tile: tiles above it crumble with a bigger puff than the ones below. */
  private digRow = 0

  constructor(stageNo: number) {
    this.rng = new Rng(stageNo * 7919 + 211)
  }

  handle(event: SimEvent, world: World): void {
    switch (event.type) {
      case 'jump':
        this.burst(event.x, event.y, 5, WHITE, 60, 0.3)
        break
      case 'land':
        this.burst(event.x, event.y, 4, WHITE, 40, 0.25)
        break
      case 'bite':
        if (event.hit) this.addShake(0.12)
        break
      case 'hurt':
        this.burst(event.x, event.y, 12, '#ff5f6d', 200, 0.6)
        this.addShake(0.4)
        break
      case 'pickup':
        if (event.kind === 'fruit') this.pop(event.x, event.y, 'たいりょく+1', 1, '#ff9aa4')
        else if (event.kind === 'star') this.pop(event.x, event.y, 'きらきら+2', 1.1, GOLD)
        else this.pop(event.x, event.y, `${event.count ?? 0}/${event.need ?? 0}`, 1, '#a4f29a')
        this.burst(event.x, event.y, 8, event.kind === 'berry' ? '#d06ae8' : GOLD, 120, 0.4)
        break
      case 'dig': {
        const x = event.tx * TILE + TILE / 2
        const y = event.ty * TILE + TILE / 2
        if (event.primary) {
          this.digRow = event.ty
          this.burst(x, y, 8, DIRT, 130, 0.5)
        } else this.burst(x, y, event.ty < this.digRow ? 6 : 5, DIRT, 110, 0.45)
        break
      }
      case 'chop':
        this.burst(event.x, event.y, 6, '#4fbf67', 110, 0.4)
        break
      case 'tree-land':
        this.addShake(0.4)
        this.burst(event.x - event.dir * (TILE / 2), event.y + TILE, 14, DIRT, 220, 0.6)
        break
      case 'pipe-burst':
        this.burst(event.x, event.y, 10, '#57b8ff', 150, 0.5)
        break
      case 'hive-break':
        this.burst(event.x, event.y, 10, GOLD, 150, 0.4)
        break
      case 'rock-crack':
        this.burst(event.x, event.y, 6, STONE, 110, 0.4)
        break
      case 'rock-break':
        this.burst(event.x, event.y, 6, STONE, 110, 0.4)
        this.burst(event.x, event.y, 14, STONE, 190, 0.6)
        break
      case 'switch':
        this.burst(event.x, event.y, 8, GOLD, 130, 0.4)
        break
      case 'door-open':
        this.burst(event.x + (event.w * TILE) / 2, event.y + (event.h * TILE) / 2, 16, GOLD, 200, 0.6)
        break
      case 'princess-free':
        this.burst(event.x, event.y, 14, GOLD, 180, 0.6)
        this.pop(event.x, event.y - 20, 'ハム姫を救出！', 1.8, GOLD)
        break
      case 'clear':
        this.burst(event.x, event.y, 30, GOLD, 260, 0.9)
        break
      case 'enemy-hit':
        this.burst(event.x, event.y, 7, WHITE, 150, 0.4)
        this.addShake(0.14)
        break
      case 'enemy-down':
        this.burst(event.x, event.y, 7, WHITE, 150, 0.4)
        this.addShake(0.14)
        this.burst(event.x, event.y, 14, GOLD, 200, 0.6)
        break
      case 'hop':
        this.burst(event.x, event.y, 3, WHITE, 40, 0.25)
        break
      case 'shot-hit':
        this.burst(event.x, event.y, 5, event.kind === 'shock' ? GOLD : '#c9b8ff', 120, 0.35)
        break
      case 'boss-awake':
        if (world.stage.objective === 'collect') this.shake = 0.8
        else {
          this.addShake(0.7)
          this.pop(
            event.x,
            event.y - this.bossHalf(world) - 10,
            `${world.stage.boss.name} が たちはだかった！`,
            1.8,
            GOLD
          )
        }
        break
      case 'boss-crash':
        this.shake = 0.5
        this.burst(event.x, event.y, 16, WHITE, 220, 0.6)
        break
      case 'boss-slam':
        if (world.boss?.def.kind === 'final') this.shake = 0.8
        else {
          this.shake = 0.7
          this.burst(event.x, event.y, 18, STONE, 240, 0.7)
        }
        break
      case 'boss-hit':
        if (world.boss?.def.stamina) {
          this.burst(event.x, event.y, 8, GOLD, 170, 0.45)
          this.addShake(0.16)
        } else {
          this.burst(event.x, event.y, 10, GOLD, 190, 0.5)
          this.addShake(0.2)
        }
        break
      case 'boss-phase':
        this.shake = 0.6
        this.pop(event.x - this.bossHalf(world), event.y - this.bossHalf(world), '黒ハム王 第二形態！', 1.6, '#ff5f8f')
        break
      case 'boss-tired':
        this.pop(event.x - this.bossHalf(world), event.y - this.bossHalf(world), 'ハム代はつかれた…', 1.6, GOLD)
        break
      case 'boss-down':
        this.shake = 1
        this.burst(event.x, event.y, 40, GOLD, 320, 1)
        this.burst(event.x, event.y, 24, '#ff9ecb', 260, 0.9)
        this.pop(event.x, event.y - this.bossHalf(world), 'ボス撃破！', 1.6, GOLD)
        break
      case 'minion':
        this.burst(
          world.boss ? world.boss.x + world.boss.w / 2 : event.x,
          world.boss ? world.boss.y + world.boss.h / 2 : event.y,
          10,
          '#c9b8ff',
          160,
          0.5
        )
        break
      case 'gate-up':
        this.burst(event.tx * TILE + TILE / 2, event.top * TILE + TILE / 2, 18, GOLD, 210, 0.6)
        break
      case 'gate-down':
        this.burst(event.tx * TILE + TILE / 2, (event.top + 1) * TILE, 16, GOLD, 220, 0.7)
        break
      default:
        break
    }
  }

  update(dt: number, world: World): void {
    if (world.state === 'play') this.shake = Math.max(0, this.shake - dt * 3)
    for (const particle of this.particles) {
      particle.life -= dt
      particle.vy += particle.gravity * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
    if (world.state !== 'play') return
    for (const floater of this.floaters) {
      floater.life -= dt
      floater.y -= 34 * dt
    }
    this.floaters = this.floaters.filter((floater) => floater.life > 0)
    const p = world.player
    const targetX = p.x + p.w / 2 - 320 + p.facing * 40
    const targetY = p.y + p.h / 2 - 200
    this.cameraX += (targetX - this.cameraX) * Math.min(1, dt * 6)
    this.cameraY += (targetY - this.cameraY) * Math.min(1, dt * 5)
    this.cameraX = Math.max(0, Math.min(world.w * TILE - 640, this.cameraX))
    this.cameraY = Math.max(-40, Math.min(world.h * TILE - 360, this.cameraY))
  }

  private addShake(amount: number) {
    this.shake = Math.max(this.shake, amount)
  }

  private bossHalf(world: World) {
    return world.boss ? world.boss.h / 2 : 0
  }

  private pop(x: number, y: number, text: string, life: number, color: string) {
    this.floaters.push({ x, y, text, life, color })
  }

  private burst(x: number, y: number, count: number, color: string, speed = 120, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2)
      const v = this.rng.range(speed * 0.3, speed)
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        life: this.rng.range(life * 0.5, life),
        maxLife: life,
        color,
        size: this.rng.range(2, 5),
        gravity: 500
      })
    }
  }
}
