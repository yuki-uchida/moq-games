import { C, R } from './palette'
import { Raster, ball, part } from './raster'
import type { Sheet } from './sheet'

function creature(kind: string, frame: number) {
  const image = new Raster(32, 32)
  part(image, (layer) => {
    if (kind === 'ant') {
      for (const x of [11, 16, 21]) {
        layer.line(x, 17, x - 4, 22 + frame, R.brown[3])
        layer.line(x, 15, x - 4, 10 - frame, R.brown[3])
      }
      ball(layer, 10, 16, 5, 5, R.brown)
      ball(layer, 17, 16, 4, 4, R.brown)
      ball(layer, 23, 16, 4, 4, R.brown)
      layer.line(25, 13, 28, 9, R.brown[2]).line(26, 15, 30, 13, R.brown[2])
      layer.set(25, 15, C.white)
    } else if (kind === 'worm') {
      for (let index = 0; index < 7; index++) {
        const y = 17 + Math.round(Math.sin(index + frame) * 3)
        ball(layer, 5 + index * 3.5, y, 3.5, 3.5, R.pink)
      }
      layer.set(27, 15 + frame, C.inkWarm)
    } else if (kind === 'beetle') {
      for (const y of [12, 17, 22]) {
        layer.line(11, y, 6, y - 2 + frame, R.brown[3])
        layer.line(21, y, 26, y - 2 + frame, R.brown[3])
      }
      ball(layer, 16, 18, 8, 10, R.brown)
      layer.line(16, 12, 16, 27, R.brown[3])
      ball(layer, 16, 9, 5, 4, R.brown)
      layer.line(16, 7, 16, 2, R.brown[2]).line(16, 3, 12, 1, R.brown[2])
      layer.line(16, 3, 20, 1, R.brown[2])
    } else if (kind === 'hamster') {
      ball(layer, 9, 9, 4, 4, R.brown)
      ball(layer, 23, 9, 4, 4, R.brown)
      ball(layer, 16, 18 + frame, 11, 10, R.brown)
      layer.ellipse(16, 21 + frame, 8, 6, R.paper[1])
      layer.set(11, 16 + frame, C.inkWarm)
      layer.set(21, 16 + frame, C.inkWarm)
      layer.rect(15, 19 + frame, 3, 2, R.pink[2])
      layer.ellipse(9, 20 + frame, 3, 2, R.pink[1]).ellipse(23, 20 + frame, 3, 2, R.pink[1])
    } else if (kind === 'bird') {
      layer.poly([7, 17, 2, 11 - frame * 2, 9, 14], R.sky[2])
      ball(layer, 16, 16, 9, 7, R.sky)
      ball(layer, 22, 12, 5, 5, R.sky)
      layer.poly([26, 12, 31, 14, 26, 16], R.yellow[1])
      layer.ellipse(14, 17 - frame * 2, 5, 3, R.sky[2])
      layer.set(23, 11, C.inkCool)
      layer.line(14, 22, 13, 26, R.yellow[2]).line(19, 22, 20, 26, R.yellow[2])
    } else {
      layer.poly([9, 16, 3, 10 + frame, 3, 22 - frame], R.orange[2])
      ball(layer, 17, 16, 10, 7, R.orange)
      layer.poly([15, 10, 19, 5, 22, 11], R.yellow[1])
      layer.poly([14, 21, 19, 26, 22, 21], R.orange[2])
      layer.set(23, 14, C.inkWarm)
      layer.set(24, 13, C.white)
      layer.ellipse(14, 16, 4, 3, R.yellow[1])
    }
  })
  return image
}

export function observationSheet(): Sheet {
  const result: Sheet = {}
  for (const kind of ['ant', 'worm', 'beetle', 'hamster', 'bird', 'fish'])
    result[kind] = { frames: [creature(kind, 0), creature(kind, 1)], fps: 4, loop: true }
  result.fly = result.ant
  return result
}

export function observationIcon() {
  const icon = creature('beetle', 0)
  icon.ellipse(24, 9, 6, 6, R.mint[2]).ellipse(24, 9, 4, 4, R.sky[0])
  icon.thick(27, 13, 30, 17, 2, R.brown[2])
  return icon
}
