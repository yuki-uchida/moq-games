import { R } from './palette'
import { Raster, part } from './raster'
import type { Sheet } from './sheet'

export function controllingPartnerSheet(): Sheet {
  return {
    move: {
      frames: Array.from({ length: 6 }, (_, frame) => {
        const raster = new Raster(64, 64)
        const sway = [0, 1, 1, 0, -1, -1][frame]
        const step = [0, 2, 1, -1, -2, -1][frame]
        part(raster, (layer) => {
          layer.rect(24 + step, 46, 6, 12, R.navy[2])
          layer.rect(35 - step, 46, 6, 12, R.navy[2])
          layer.rect(22 + step, 55, 9, 4, R.navy[4])
          layer.rect(35 - step, 55, 9, 4, R.navy[4])
          layer.poly([24, 27, 40, 27, 44, 48, 20, 48], R.red[2])
          layer.rect(29, 28, 6, 19, R.red[0])
          layer.thick(23, 31, 17 + sway, 41, 6, R.red[2])
          layer.thick(41, 31, 47 + sway, 37, 6, R.red[2])
        })
        part(raster, (layer) => {
          layer.ellipse(32 + sway, 17, 10, 12, R.navy[3])
          layer.ellipse(32 + sway, 20, 8, 9, R.paper[1])
          layer.rect(23 + sway, 9, 18, 7, R.navy[3])
          layer.line(26 + sway, 18, 30 + sway, 20, R.navy[4])
          layer.line(34 + sway, 20, 38 + sway, 18, R.navy[4])
          layer.rect(28 + sway, 21, 2, 2, R.navy[4])
          layer.rect(35 + sway, 21, 2, 2, R.navy[4])
          layer.line(30 + sway, 26, 35 + sway, 26, R.red[3])
        })
        part(raster, (layer) => {
          layer.rect(43 + sway, 27, 12, 20, R.navy[4])
          layer.rect(45 + sway, 29, 8, 15, R.paper[0])
          layer.rect(47 + sway, 31, 4, 2, R.red[2])
          layer.rect(47 + sway, 35, 4, 2, R.red[2])
          layer.rect(47 + sway, 39, 4, 2, R.red[2])
          layer.ellipse(14 + sway, 35, 6, 7, R.yellow[2])
          layer.ellipse(14 + sway, 35, 3, 4, 0)
          layer.rect(7 + sway, 35, 14, 13, R.yellow[1])
          layer.rect(13 + sway, 39, 2, 6, R.navy[4])
          layer.line(20 + sway, 43, 26, 43, R.yellow[2])
        })
        return raster
      }),
      fps: 10,
      loop: true
    }
  }
}
