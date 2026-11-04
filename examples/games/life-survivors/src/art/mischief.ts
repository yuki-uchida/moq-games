import { R } from './palette'
import { Raster, part } from './raster'
import type { Sheet } from './sheet'

export function mischiefSheet(): Sheet {
  return {
    move: {
      frames: Array.from({ length: 6 }, (_, frame) => {
        const raster = new Raster(64, 64)
        const sway = [0, 1, 1, 0, -1, -1][frame]
        const bounce = [0, -2, -3, -2, 0, -1][frame]
        part(raster, (layer) => {
          layer.poly([12 + sway, 17, 44 + sway, 20, 48 + sway, 48, 10 + sway, 46], R.paper[1])
          layer.line(13 + sway, 44, 45 + sway, 46, R.paper[2])
          layer.thick(17 + sway, 24, 37 + sway, 32, 3, R.red[1])
          layer.thick(37 + sway, 32, 20 + sway, 35, 3, R.red[1])
          layer.thick(20 + sway, 35, 39 + sway, 40, 3, R.red[1])
          layer.line(18 + sway, 39, 27 + sway, 25, R.navy[1])
          layer.line(27 + sway, 25, 34 + sway, 42, R.navy[1])
          layer.line(34 + sway, 42, 41 + sway, 27, R.navy[1])
        })
        part(raster, (layer) => {
          layer.thick(42 - sway, 39 + bounce, 51 - sway, 23 + bounce, 5, R.yellow[1])
          layer.thick(42 - sway, 39 + bounce, 44 - sway, 35 + bounce, 5, R.yellow[2])
          layer.poly([49 - sway, 24 + bounce, 53 - sway, 26 + bounce, 54 - sway, 19 + bounce], R.yellow[0])
          layer.set(53 - sway, 20 + bounce, R.yellow[2])
        })
        part(raster, (layer) => {
          layer.rect(13 + sway, 46 + bounce, 11, 10, R.red[1])
          layer.rect(14 + sway, 46 + bounce, 9, 2, R.red[0])
          layer.rect(21 + sway, 48 + bounce, 3, 8, R.red[2])
          layer.rect(15 + sway, 43 + bounce, 3, 3, R.red[0])
          layer.rect(20 + sway, 43 + bounce, 3, 3, R.red[0])
        })
        part(raster, (layer) => {
          layer.poly([27, 49, 39, 47, 39, 56, 27, 58], R.navy[1])
          layer.poly([27, 49, 31, 45, 43, 43, 39, 47], R.navy[0])
          layer.poly([39, 47, 43, 43, 43, 52, 39, 56], R.navy[2])
        })
        part(raster, (layer) => {
          layer.ellipse(49 - sway, 52 + bounce, 7, 5, R.green[1])
          layer.ellipse(47 - sway, 50 + bounce, 3, 2, R.green[0])
          layer.line(50 - sway, 48 + bounce, 47 - sway, 55 + bounce, R.yellow[0])
        })
        return raster
      }),
      fps: 10,
      loop: true
    }
  }
}
