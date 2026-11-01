import { playerColor, type GameState } from './game'
import { HAVEN } from './campaign'
import {
  CAVES,
  LANDMARKS,
  SPAWN,
  TUNNEL_EDGES,
  TUNNEL_NODES,
  WATER_LEVEL,
  WORLD,
  heightAt,
  slopeAt,
  smoothstep
} from './map'

const SMELL_RANGE = 45 // nearby food shows up as a scent on the map; the rest must be explored

/** North-up map (1 px = 1 m): terrain and landmarks are drawn once, actors on every HUD tick. */
export class Minimap {
  private readonly context: CanvasRenderingContext2D | null
  private readonly background = document.createElement('canvas')

  constructor(private readonly canvas: HTMLCanvasElement) {
    const width = WORLD.maxX - WORLD.minX
    const height = WORLD.maxZ - WORLD.minZ
    canvas.width = this.background.width = width
    canvas.height = this.background.height = height
    this.context = canvas.getContext('2d')
    const paint = this.background.getContext('2d')
    if (!this.context || !paint) return
    const image = paint.createImageData(width, height)
    for (let py = 0; py < height; py++)
      for (let px = 0; px < width; px++) {
        const x = WORLD.minX + px + 0.5
        const z = WORLD.minZ + py + 0.5
        const y = heightAt(x, z)
        const desert = smoothstep(46, 62, x)
        const light = Math.min(1, 0.72 + y * 0.03)
        let [r, g, b] = [118 + 90 * desert, 150 + 40 * desert, 92 + 40 * desert]
        if (slopeAt(x, z) > 1) [r, g, b] = [120, 104, 88]
        if (y < WATER_LEVEL) [r, g, b] = WATER_LEVEL - y > 0.7 ? [64, 126, 160] : [120, 176, 184]
        image.data.set([r * light, g * light, b * light, 255], (py * width + px) * 4)
      }
    paint.putImageData(image, 0, 0)
    const at = (x: number, z: number): [number, number] => [x - WORLD.minX, z - WORLD.minZ]
    paint.setLineDash([2, 2])
    paint.strokeStyle = '#4a3423'
    paint.lineWidth = 1.5
    for (const [first, second] of TUNNEL_EDGES) {
      paint.beginPath()
      paint.moveTo(...at(TUNNEL_NODES[first].x, TUNNEL_NODES[first].z))
      paint.lineTo(...at(TUNNEL_NODES[second].x, TUNNEL_NODES[second].z))
      paint.stroke()
    }
    paint.setLineDash([])
    for (const node of TUNNEL_NODES) if (node.exit) this.dot(paint, ...at(node.x, node.z), 2.2, '#1d1712')
    for (const cave of CAVES) {
      this.dot(paint, ...at(cave.x, cave.z), cave.r, '#5a524a')
      this.dot(paint, ...at(cave.x, cave.z), cave.r - 2.5, '#2d2a27')
    }
    const colors = { oak: '#2f5a2c', spire: '#b8613f', pines: '#26452f', birch: '#e7c34a' }
    for (const landmark of LANDMARKS) {
      const [px, py] = at(landmark.x, landmark.z)
      paint.fillStyle = colors[landmark.kind]
      paint.beginPath()
      paint.moveTo(px, py - 7)
      paint.lineTo(px + 5, py + 4)
      paint.lineTo(px - 5, py + 4)
      paint.closePath()
      paint.fill()
      paint.strokeStyle = '#fff8'
      paint.lineWidth = 1
      paint.stroke()
    }
    const [hx, hy] = at(SPAWN.x, SPAWN.z)
    paint.fillStyle = '#f3e3b0'
    paint.fillRect(hx - 4, hy - 3, 8, 6)
    paint.beginPath()
    paint.moveTo(hx - 6, hy - 3)
    paint.lineTo(hx, hy - 8)
    paint.lineTo(hx + 6, hy - 3)
    paint.fill()
  }

  private dot(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
    context.fillStyle = color
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }

  draw(state: GameState, localId: string, yaw: number) {
    const context = this.context
    if (!context) return
    context.drawImage(this.background, 0, 0)
    const at = (x: number, z: number): [number, number] => [x - WORLD.minX, z - WORLD.minZ]
    const local = state.players.find((player) => player.id === localId)
    for (const nest of state.nests) {
      if (!nest.active) continue
      const [px, py] = at(nest.x, nest.z)
      context.strokeStyle = '#c23b2c'
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(px - 3, py - 3)
      context.lineTo(px + 3, py + 3)
      context.moveTo(px + 3, py - 3)
      context.lineTo(px - 3, py + 3)
      context.stroke()
    }
    if (local)
      for (const food of state.foods)
        if (food.active && Math.hypot(food.x - local.x, food.z - local.z) < SMELL_RANGE)
          this.dot(context, ...at(food.x, food.z), 1.8, '#f39a3c')
    // Seasons: bedding to fetch in summer; the haven and the kits in winter.
    if (state.chapter === 1)
      for (const straw of state.straws)
        if (straw.active) {
          const [sx, sy] = at(straw.x, straw.z)
          context.fillStyle = '#e8cf7a'
          context.strokeStyle = '#5a4320'
          context.lineWidth = 1
          context.fillRect(sx - 3, sy - 3, 6, 6)
          context.strokeRect(sx - 3, sy - 3, 6, 6)
        }
    if (state.chapter === 3) {
      const [vx, vy] = at(HAVEN.x, HAVEN.z)
      context.strokeStyle = '#ffe9a8'
      context.lineWidth = 2
      context.beginPath()
      context.arc(vx, vy, 7, 0, Math.PI * 2)
      context.stroke()
      for (const kit of state.kits) if (kit.status !== 'lost') this.dot(context, ...at(kit.x, kit.z), 2, '#fff3d6')
    }
    // Teammates wear their collar colour; a downed one gets a red ring.
    for (const player of state.players) {
      if (player.id === localId) continue
      const [x, y] = at(player.x, player.z)
      this.dot(context, x, y, 4.2, player.downed ? '#e06b5b' : '#ffffff')
      this.dot(context, x, y, 3, playerColor(player))
    }
    if (!local) return
    const [px, py] = at(local.x, local.z)
    // View cone (camera looks along −yaw) and the rabbit's heading arrow.
    context.fillStyle = '#ffffff40'
    context.beginPath()
    context.moveTo(px, py)
    context.arc(px, py, 26, -Math.PI / 2 - yaw - 0.45, -Math.PI / 2 - yaw + 0.45)
    context.fill()
    context.save()
    context.translate(px, py)
    context.rotate(-local.angle + Math.PI)
    // Your own marker stays the arrow, filled with your collar colour.
    context.fillStyle = playerColor(local)
    context.strokeStyle = '#ffffff'
    context.lineWidth = 1.5
    context.beginPath()
    context.moveTo(0, -6)
    context.lineTo(4.5, 5)
    context.lineTo(0, 2.5)
    context.lineTo(-4.5, 5)
    context.closePath()
    context.fill()
    context.stroke()
    context.restore()
  }
}
