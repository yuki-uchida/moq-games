/**
 * In-world markers on a light 2D overlay canvas owned by the renderer: damage numbers (option), ally name tags
 * in team colour (enemies only when close or revealed), HP bars over big foes, objective markers with distance
 * (clamped to the screen edge when off-screen), revive markers on downed allies and sonar chevrons.
 */
import * as THREE from 'three'
import { FOES } from '../data/enemies'
import { SPECIES } from '../data/species'
import type { BoxGrid } from './core/box-grid'
import type { PlayerView, PropView, TeamId, V3, View } from '../sim/types'

export const TEAM_COLORS = ['#e5484d', '#3e8ed0', '#f2b33d'] as const
export const ARK_COLOR = '#ffb45c'
const FONT = "'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo','Noto Sans JP',sans-serif"

interface DamageNumber {
  active: boolean
  x: number
  y: number
  z: number
  amount: number
  t: number
  kind: 0 | 1 | 2 | 3
  drift: number
}

/**
 * True when the straight line from the camera to (x, y, z) is not cut by a solid box. Enemy markers use it so
 * a tag never reveals someone standing behind a wall.
 */
export function clearLine(
  grid: Pick<BoxGrid, 'raycast'> | null,
  cam: { x: number; y: number; z: number },
  x: number,
  y: number,
  z: number
): boolean {
  if (!grid) return true
  const dx = x - cam.x
  const dy = y - cam.y
  const dz = z - cam.z
  const d = Math.hypot(dx, dy, dz)
  if (d < 0.5) return true
  return grid.raycast(cam.x, cam.y, cam.z, dx / d, dy / d, dz / d, d) >= d - 0.25
}

/** Whether an opposing unit may be marked: revealed to the local side, or seen at the head or the chest. */
export function enemyMarkable(
  grid: Pick<BoxGrid, 'raycast'> | null,
  cam: { x: number; y: number; z: number },
  revealed: boolean,
  feet: V3,
  headY: number
): boolean {
  if (revealed) return true
  const chest = feet[1] + (headY - feet[1]) * 0.55
  return clearLine(grid, cam, feet[0], headY, feet[2]) || clearLine(grid, cam, feet[0], chest, feet[2])
}

const BIG_FOES = new Set(['oagos', 'ashinaga', 'tategami', 'harigane', 'kurozume'])

const OBJECTIVE_LABEL: Partial<Record<PropView['kind'], string>> = {
  lighthouse: '防衛',
  cart: '護衛',
  node: '破壊',
  zone: '確保'
}

export class Markers {
  readonly canvas: HTMLCanvasElement | null
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly numbers: DamageNumber[] = []
  private width = 1
  private height = 1
  private dpr = 1
  private readonly v = new THREE.Vector3()
  private time = 0
  enabled = true
  private grid: BoxGrid | null = null
  damageNumbers = true

  constructor(gl: HTMLCanvasElement) {
    const parent = gl.parentElement
    if (typeof document === 'undefined' || !parent) {
      this.canvas = null
      this.ctx = null
    } else {
      const c = document.createElement('canvas')
      c.className = 'anima-render-markers'
      c.style.position = 'absolute'
      c.style.pointerEvents = 'none'
      c.style.left = `${gl.offsetLeft}px`
      c.style.top = `${gl.offsetTop}px`
      parent.insertBefore(c, gl.nextSibling)
      this.canvas = c
      this.ctx = c.getContext('2d')
    }
    for (let i = 0; i < 80; i++)
      this.numbers.push({ active: false, x: 0, y: 0, z: 0, amount: 0, t: 0, kind: 0, drift: 0 })
  }

  setGrid(grid: BoxGrid | null) {
    this.grid = grid
  }

  resize(width: number, height: number, dpr: number, gl: HTMLCanvasElement) {
    this.width = width
    this.height = height
    this.dpr = Math.min(2, dpr)
    if (!this.canvas) return
    this.canvas.width = Math.round(width * this.dpr)
    this.canvas.height = Math.round(height * this.dpr)
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.canvas.style.left = `${gl.offsetLeft}px`
    this.canvas.style.top = `${gl.offsetTop}px`
  }

  /** kind: 0 normal, 1 head, 2 weak point, 3 blocked. */
  damage(at: V3, amount: number, kind: 0 | 1 | 2 | 3) {
    if (!this.damageNumbers || amount <= 0) return
    let slot = this.numbers.find((n) => !n.active)
    if (!slot) {
      slot = this.numbers[0]
      for (const n of this.numbers) if (n.t > slot.t) slot = n
    }
    slot.active = true
    slot.x = at[0]
    slot.y = at[1]
    slot.z = at[2]
    slot.amount = amount
    slot.t = 0
    slot.kind = kind
    slot.drift = (Math.random() - 0.5) * 30
  }

  private project(camera: THREE.PerspectiveCamera, x: number, y: number, z: number): boolean {
    this.v.set(x, y, z).project(camera)
    const inFront = this.v.z < 1 && this.v.z > -1
    this.v.x = (this.v.x * 0.5 + 0.5) * this.width
    this.v.y = (-this.v.y * 0.5 + 0.5) * this.height
    return inFront
  }

  draw(
    view: View,
    camera: THREE.PerspectiveCamera,
    me: string | undefined,
    dt: number,
    headTop: (id: string) => V3 | null
  ) {
    this.time += dt
    const c = this.ctx
    if (!c || !this.canvas) return
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.clearRect(0, 0, this.width, this.height)
    if (!this.enabled) return
    const mine = view.players.find((p) => p.id === me)
    const myTeam: TeamId | undefined = mine?.team
    const pvp = view.mode === 'pvp'
    const cam = camera.position

    // Name tags and revive markers.
    for (const p of view.players) {
      if (p.id === me || p.state === 'away') continue
      const ally = myTeam === undefined || p.team === myTeam
      const d = Math.hypot(p.p[0] - cam.x, p.p[1] - cam.y, p.p[2] - cam.z)
      if (!ally && !(d < 14 || p.revealed)) continue
      if (!ally && p.cloak > 0.5 && !p.revealed) continue
      const top = headTop(p.id) ?? [p.p[0], p.p[1] + SPECIES[p.species].height + 0.35, p.p[2]]
      if (!ally && !enemyMarkable(this.grid, cam, p.revealed, p.p, top[1])) continue
      const front = this.project(camera, top[0], top[1] + 0.25, top[2])
      const color = pvp ? TEAM_COLORS[p.team] : ally ? ARK_COLOR : '#ff5a5a'
      if (p.state === 'down' && ally) {
        this.edgeMarker(c, front, '救助', color, d, p)
        continue
      }
      if (!front || d > 70) continue
      const alpha = Math.max(0.25, Math.min(1, 1.4 - d / 50))
      this.nameTag(c, this.v.x, this.v.y, p.name, color, alpha, p.anima / Math.max(1, p.maxAnima), ally)
    }

    // Foe HP bars and sonar chevrons.
    for (const f of view.foes) {
      const def = FOES[f.kind]
      if (def.boss || f.state === 'dying') continue
      const d = Math.hypot(f.p[0] - cam.x, f.p[2] - cam.z)
      if (f.revealed) {
        if (this.project(camera, f.p[0], f.p[1] + def.height + 0.5, f.p[2]))
          this.chevron(c, this.v.x, this.v.y, '#d58aff')
      }
      if (!BIG_FOES.has(f.kind) || f.hp >= f.maxHp || d > 45) continue
      if (!f.revealed && !enemyMarkable(this.grid, cam, false, f.p, f.p[1] + def.height)) continue
      if (!this.project(camera, f.p[0], f.p[1] + def.height + 0.35, f.p[2])) continue
      this.bar(c, this.v.x, this.v.y, Math.max(26, 60 - d), f.hp / f.maxHp, f.shielded ? '#7ae8ff' : '#ff6a5a')
    }

    // Objective markers.
    for (const pr of view.props) {
      const label = pr.kind === 'zone' ? (pr.label ?? OBJECTIVE_LABEL.zone) : OBJECTIVE_LABEL[pr.kind]
      if (!label) continue
      if (pr.kind === 'node' && pr.hp !== undefined && pr.hp <= 0) continue
      const h = pr.kind === 'lighthouse' ? 9 : pr.kind === 'node' ? 4 : 2.5
      const front = this.project(camera, pr.p[0], pr.p[1] + h, pr.p[2])
      const d = Math.hypot(pr.p[0] - cam.x, pr.p[2] - cam.z)
      const color = pr.kind === 'node' ? '#d58aff' : pr.kind === 'zone' ? zoneColor(pr, myTeam) : '#ffd36a'
      this.edgeMarker(c, front, label, color, d, null)
    }

    // Damage numbers.
    for (const n of this.numbers) {
      if (!n.active) continue
      n.t += dt
      if (n.t > 0.9) {
        n.active = false
        continue
      }
      if (!this.project(camera, n.x, n.y + n.t * 1.1, n.z)) continue
      const pop = n.t < 0.12 ? 0.6 + (n.t / 0.12) * 0.7 : 1.3 - Math.min(0.3, (n.t - 0.12) * 1.2)
      const a = n.t > 0.6 ? 1 - (n.t - 0.6) / 0.3 : 1
      const size = (14 + Math.min(14, Math.sqrt(n.amount) * 2)) * pop * (n.kind === 1 ? 1.25 : 1)
      c.globalAlpha = a
      c.font = `900 ${size.toFixed(1)}px ${FONT}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.lineWidth = 4
      c.strokeStyle = 'rgba(20,16,30,0.85)'
      const text = n.kind === 3 ? '防' : String(Math.round(n.amount))
      const x = this.v.x + n.drift * n.t
      c.strokeText(text, x, this.v.y)
      c.fillStyle = n.kind === 1 ? '#ffe14a' : n.kind === 2 ? '#ff9a3c' : n.kind === 3 ? '#9fe7ff' : '#ffffff'
      c.fillText(text, x, this.v.y)
      c.globalAlpha = 1
    }
  }

  private nameTag(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    name: string,
    color: string,
    alpha: number,
    anima: number,
    ally: boolean
  ) {
    c.globalAlpha = alpha
    c.font = `700 13px ${FONT}`
    c.textAlign = 'center'
    c.textBaseline = 'bottom'
    c.lineWidth = 3
    c.strokeStyle = 'rgba(10,12,20,0.75)'
    c.strokeText(name, x, y - 6)
    c.fillStyle = color
    c.fillText(name, x, y - 6)
    if (ally) {
      const w = 38
      c.fillStyle = 'rgba(10,12,20,0.6)'
      c.fillRect(x - w / 2 - 1, y - 4, w + 2, 5)
      c.fillStyle = anima < 0.15 ? '#ff5a4a' : '#ffb45c'
      c.fillRect(x - w / 2, y - 3, w * Math.max(0, Math.min(1, anima)), 3)
    }
    c.globalAlpha = 1
  }

  private bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string) {
    c.fillStyle = 'rgba(10,8,16,0.7)'
    c.fillRect(x - w / 2 - 1, y - 1, w + 2, 6)
    c.fillStyle = color
    c.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 4)
  }

  private chevron(c: CanvasRenderingContext2D, x: number, y: number, color: string) {
    const b = Math.sin(this.time * 6) * 2
    c.fillStyle = color
    c.strokeStyle = 'rgba(20,10,30,0.8)'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(x - 7, y - 9 + b)
    c.lineTo(x, y + b)
    c.lineTo(x + 7, y - 9 + b)
    c.lineTo(x, y - 4 + b)
    c.closePath()
    c.stroke()
    c.fill()
  }

  /** Marker with label + distance, clamped to the screen edge (with an arrow) when off-screen or behind. */
  private edgeMarker(
    c: CanvasRenderingContext2D,
    front: boolean,
    label: string,
    color: string,
    dist: number,
    downed: PlayerView | null
  ) {
    const m = 36
    let x = this.v.x
    let y = this.v.y
    let off = !front || x < m || x > this.width - m || y < m || y > this.height - m
    if (!front) {
      // Behind the camera: mirror so the marker points the right way.
      x = this.width - x
      y = this.height - m
      off = true
    }
    const cx = this.width / 2
    const cy = this.height / 2
    if (off) {
      const dx = x - cx
      const dy = y - cy
      const sx = (cx - m) / Math.max(1e-3, Math.abs(dx))
      const sy = (cy - m) / Math.max(1e-3, Math.abs(dy))
      const s = Math.min(sx, sy, 1)
      x = cx + dx * s
      y = cy + dy * s
    }
    const pulse = 1 + Math.sin(this.time * 4) * 0.06
    c.save()
    c.translate(x, y)
    c.scale(pulse, pulse)
    c.fillStyle = 'rgba(12,14,24,0.7)'
    c.strokeStyle = color
    c.lineWidth = 2.5
    c.beginPath()
    c.moveTo(0, -15)
    c.lineTo(13, 0)
    c.lineTo(0, 15)
    c.lineTo(-13, 0)
    c.closePath()
    c.fill()
    c.stroke()
    if (downed) {
      // Revive progress ring + seconds left.
      c.strokeStyle = '#8af07a'
      c.lineWidth = 3
      c.beginPath()
      c.arc(0, 0, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * downed.revive)
      c.stroke()
    }
    c.fillStyle = color
    c.font = `800 ${label.length > 1 ? 9 : 13}px ${FONT}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(label.length > 2 ? label.slice(0, 2) : label, 0, 0.5)
    c.font = `700 11px ${FONT}`
    c.lineWidth = 3
    c.strokeStyle = 'rgba(10,12,20,0.8)'
    const sub = downed ? `${Math.ceil(downed.timer)}秒` : `${Math.round(dist)}m`
    c.strokeText(sub, 0, 25)
    c.fillStyle = '#ffffff'
    c.fillText(sub, 0, 25)
    if (off) {
      const a = Math.atan2(y - cy, x - cx)
      c.rotate(a)
      c.fillStyle = color
      c.beginPath()
      c.moveTo(24, 0)
      c.lineTo(17, -5)
      c.lineTo(17, 5)
      c.fill()
    }
    c.restore()
  }

  dispose() {
    this.canvas?.remove()
  }
}

function zoneColor(z: PropView, myTeam: TeamId | undefined): string {
  if (z.team === 'foe') return '#ff6a5a'
  if (typeof z.team === 'number' && z.team >= 0)
    return z.team === myTeam || myTeam === undefined ? '#7af0a0' : TEAM_COLORS[z.team as TeamId]
  return '#ffd36a'
}
