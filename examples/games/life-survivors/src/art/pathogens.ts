import { C, R } from './palette'
import { Raster, ball, part } from './raster'
import type { Sheet } from './sheet'

function pathogen(size: number, frame: number): Raster {
  const raster = new Raster(size, size)
  const scale = size / 64
  const centerX = 32 * scale
  const centerY = 32 * scale
  const pulse = Math.sin((frame / 6) * Math.PI * 2)
  const radius = (size === 128 ? 14 : 11) * scale + pulse * scale

  if (size === 128) {
    part(raster, (layer) => {
      for (const [index, point] of [
        [14, 19],
        [51, 20],
        [16, 49],
        [50, 48]
      ].entries()) {
        const bob = Math.sin(((frame + index) / 6) * Math.PI * 2) * scale
        ball(layer, point[0] * scale, point[1] * scale + bob, 4 * scale, 4 * scale, R.red)
        layer.ellipse(point[0] * scale + scale, point[1] * scale + bob, scale, scale, C.inkWarm)
      }
    })
  }

  part(raster, (layer) => {
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + frame * 0.08
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      const endX = centerX + dx * (radius + 5 * scale)
      const endY = centerY + dy * (radius + 5 * scale)
      layer.thick(centerX + dx * radius * 0.8, centerY + dy * radius * 0.8, endX, endY, 2 * scale, R.purple[2])
      ball(layer, endX, endY, 2 * scale, 2 * scale, R.red, false)
    }
  })

  part(raster, (layer) => {
    ball(layer, centerX, centerY, radius, radius, R.purple)
    for (const offset of [-4, 4]) {
      const eyeX = centerX + offset * scale
      const eyeY = centerY - 2 * scale
      layer.ellipse(eyeX, eyeY, 2.4 * scale, 2.6 * scale, C.white)
      layer.ellipse(eyeX + 0.5 * scale, eyeY + 0.5 * scale, scale, 1.2 * scale, R.red[2])
    }
    layer.thick(centerX - 4 * scale, centerY + 5 * scale, centerX + 4 * scale, centerY + 5 * scale, scale, C.inkCool)
    for (const offset of [-6, 6])
      layer.ellipse(centerX + offset * scale, centerY + 5 * scale, 1.5 * scale, 1.5 * scale, R.pink[1])
  })
  return raster
}

const pathogenSheet = (size: number): Sheet => ({
  move: {
    frames: Array.from({ length: 6 }, (_unused, frame) => pathogen(size, frame)),
    fps: 8,
    loop: true
  }
})

export const infectionSheet = () => pathogenSheet(64)
export const outbreakSheet = () => pathogenSheet(128)
