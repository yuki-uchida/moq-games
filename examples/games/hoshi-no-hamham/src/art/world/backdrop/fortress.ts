import { R, color, ramp } from '../../palette'
import { Raster, noiseAt } from '../../raster'
import type { Backdrop, BackdropLayer } from '../types'
import {
  W,
  fadeBottom,
  glow,
  gradient,
  layerImage,
  lightOn,
  pillar,
  shafts,
  skyImage,
  stampShaded,
  tiled,
  tintMap,
  type Tones
} from './kit'

/**
 * Backdrop of the `fortress` world (stages 7–8): inside the gang's stone fortress.
 * far  = block wall with tall barred windows (pale sky and mountains behind) and light falling through,
 * mid  = pillars, round arches, hanging chains and dull red gang banners,
 * near = darker pillars with wall torches.
 */

const wallFar = ramp('#6e748c', '#5e647c', '#50566e', '#434860', '#32364a')
const wallMid = ramp('#565c76', '#484e66', '#3c4258', '#30354a', '#222638')
const wallNear = ramp('#3a3f56', '#2f3447', '#262a3b', '#1e2130', '#14161f')
const sill = ramp('#8a90a8', '#767c96', '#626880', '#4c5270', '#363a50')
const skyPale = [color('#dce8f2'), color('#c4d6e8'), color('#a8c0dc')]
const mountain = ramp('#98aecb', '#8aa0c0', '#7890b2', '#6a82a4', '#5a7294')
const iron = ramp('#4a5068', '#3a3f54', '#2c3042', '#20232f', '#14161f')
const banner = ramp('#b06260', '#96504e', '#7c4048', '#5e3040', '#40202e')
const bannerMark = color('#c8a070')
const flame = R.fire

const tFar: Tones = { hi: wallFar[0], base: wallFar[1], shade: wallFar[2], deep: wallFar[3] }
const tMid: Tones = { hi: wallMid[0], base: wallMid[1], shade: wallMid[2], deep: wallMid[3] }
const tNear: Tones = { hi: wallNear[0], base: wallNear[1], shade: wallNear[2], deep: wallNear[3] }
const tIron: Tones = { hi: iron[0], base: iron[1], shade: iron[2], deep: iron[3] }
const tSill: Tones = { hi: sill[0], base: sill[1], shade: sill[2], deep: sill[3] }

function sky() {
  const r = skyImage()
  gradient(r, [
    { at: 0, c: R.fortWall[3] },
    { at: 120, c: wallFar[3] },
    { at: 260, c: wallFar[2] },
    { at: 340, c: wallFar[1] }
  ])
  return r
}

/** One tall barred window with an arched top: pale sky, far mountains, iron bars, a stone surround. */
function window(r: Raster, cx: number, top: number, w: number, h: number) {
  const x0 = cx - w / 2
  const inside = (x: number, y: number) => {
    const dy = y - (top + w / 2)
    if (y < top + w / 2) return ((x + 0.5 - cx) / (w / 2)) ** 2 + ((y + 0.5 - (top + w / 2)) / (w / 2)) ** 2 <= 1
    return x >= x0 && x < x0 + w && dy < h
  }
  // surround: the shape grown by 3 px, shaded like a stone frame
  const frame = new Raster(w + 14, h + 14)
  for (let y = 0; y < frame.h; y++)
    for (let x = 0; x < frame.w; x++) {
      const gx = x + (cx - w / 2 - 7)
      const gy = y + (top - 7)
      for (let oy = -3; oy <= 3 && !frame.get(x, y); oy++)
        for (let ox = -3; ox <= 3; ox++)
          if (ox * ox + oy * oy <= 10 && inside(gx + ox, gy + oy)) {
            frame.set(x, y, 1)
            break
          }
    }
  stampShaded(r, frame, cx - w / 2 - 7, top - 7, tSill, { shade: [2, 2], hi: [1, 1] })
  // the opening
  for (let y = top; y < top + h; y++)
    for (let x = x0; x <= x0 + w; x++) {
      if (!inside(x, y)) continue
      const f = (y - top) / h
      r.set(x, y, skyPale[Math.min(2, Math.floor(f * 3 + (noiseAt(x, y, 4) < 0.0 ? 1 : 0)))])
    }
  // dithered sky: re-fill with a bayer blend
  for (let y = top; y < top + h; y++)
    for (let x = x0; x <= x0 + w; x++) {
      if (!inside(x, y)) continue
      const t = ((y - top) / h) * 2
      const i = Math.min(1, Math.floor(t))
      const f = t - i
      r.set(x, y, bayerPick(x, y, f) ? skyPale[i + 1] : skyPale[i])
    }
  // distant mountains
  const base = top + h
  for (let x = x0; x <= x0 + w; x++) {
    if (!inside(x, base - 10)) continue
    const u = (x - x0) / w
    const peak1 = base - 34 - Math.abs(Math.sin(u * 5)) * 14
    const peak2 = base - 20 - Math.abs(Math.sin(u * 8 + 1)) * 8
    for (let y = Math.round(peak1); y < base; y++)
      if (inside(x, y)) r.set(x, y, y - Math.round(peak1) < 2 ? mountain[0] : mountain[1])
    for (let y = Math.round(peak2); y < base; y++)
      if (inside(x, y)) r.set(x, y, y - Math.round(peak2) < 2 ? mountain[2] : mountain[3])
  }
  // iron bars and a cross bar
  tiled((dx) => {
    for (let bx = x0 + 4; bx < x0 + w - 2; bx += 8) {
      for (let y = top; y < top + h; y++)
        if (inside(bx, y) && inside(bx + 1, y)) {
          r.set(bx + dx, y, iron[1])
          r.set(bx + 1 + dx, y, iron[2])
        }
    }
    for (let x = x0; x <= x0 + w; x++)
      for (const by of [top + Math.round(h * 0.45), top + Math.round(h * 0.78)]) {
        if (inside(x, by)) {
          r.set(x + dx, by, iron[1])
          r.set(x + dx, by + 1, iron[2])
        }
      }
  })
  // sill
  stampShaded(r, new Raster(w + 12, 5).rect(0, 0, w + 12, 5, 1), cx - w / 2 - 6, top + h, tSill, {
    shade: [0, 2],
    hi: [0, 1]
  })
}

function bayerPick(x: number, y: number, f: number) {
  const m = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  return m[(y & 3) * 4 + (x & 3)] / 16 < f
}

function farWall(): BackdropLayer {
  const r = layerImage(0)
  // Block courses 16 px high, blocks 40 px wide, every other course shifted by half a block.
  const rows = Math.ceil(r.h / 16)
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 ? 20 : 0
    for (let b = 0; b < 16; b++) {
      const x0 = b * 40 + shift
      const n = noiseAt(b, row, 5)
      const t = n < 0.2 ? tFar.hi : tFar.base
      const body = new Raster(40, 16)
      body.rect(0, 0, 40, 16, 1)
      // fill block with its tone, 1 px mortar on the right and bottom, lit top edge
      tiled((dx) => {
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 40; x++) {
            const c = x === 39 || y === 15 ? tFar.shade : t
            r.set(x0 + x + dx, row * 16 + y, c)
          }
      })
    }
  }
  // windows, with the surround cutting through the courses
  for (const cx of [120, 280, 440, 600]) window(r, cx, 70, 52, 110)
  // light falling through each window onto the wall below and to the right
  shafts(
    r,
    [120, 280, 440, 600].map((x) => ({ x: x + 8, w: 46, strength: 0.55 })),
    { slope: 0.42, y0: 186, y1: 330 }
  )
  fadeBottom(r, 40, tFar.deep)
  return { image: r, parallax: 0.07, y: 0 }
}

function chain(r: Raster, x: number, y: number, len: number) {
  tiled((dx) => {
    for (let i = 0; i < len; i += 3) {
      r.rect(x - 1 + dx, y + i, 2, 3, i % 6 === 0 ? iron[0] : iron[2])
      r.set(x + dx, y + i + 1, 0)
    }
    r.rect(x - 2 + dx, y + len, 4, 3, iron[2])
  })
}

function hangingBanner(r: Raster, cx: number, y: number, w: number, h: number) {
  const m = new Raster(w, h)
  m.rect(0, 0, w, h - 8, 1)
  m.poly([0, h - 9, w / 2, h - 3, w, h - 9], 1)
  m.poly([0, h - 9, w / 2, h, w / 2, h - 3, 0, h - 9], 1)
  // swallowtail notch
  m.poly([w / 2 - 3, h, w / 2, h - 7, w / 2 + 3, h], 0)
  stampShaded(
    r,
    m,
    cx - w / 2,
    y,
    { hi: banner[0], base: banner[1], shade: banner[2], deep: banner[3] },
    { shade: [3, 2], hi: [1, 1], deep: [1, 0] }
  )
  tiled((dx) => {
    // pole and finials
    r.rect(cx - w / 2 - 2 + dx, y - 2, w + 4, 2, iron[2])
    r.rect(cx - w / 2 - 3 + dx, y - 3, 2, 4, iron[1])
    r.rect(cx + w / 2 + 1 + dx, y - 3, 2, 4, iron[1])
    // a small gang mark: a vertical bar and a diamond
    r.rect(cx - 1 + dx, y + 8, 2, 10, bannerMark)
    r.poly([cx + dx, y + 20, cx + 4 + dx, y + 25, cx + dx, y + 30, cx - 4 + dx, y + 25], bannerMark)
  })
}

function midHall(): BackdropLayer {
  const y = 40
  const r = layerImage(y)
  const pillars = [40, 200, 360, 520]
  // arches first, so the pillars overlap their feet
  for (const px of pillars) {
    const cx = px + 80
    const arch = new Raster(150, 90)
    arch.ring(75, 85, 59, 69, 1, -Math.PI, 0)
    stampShaded(r, arch, cx - 75, 18, tMid, { shade: [3, 3], hi: [2, 2] })
  }
  // pillars with capital and base
  for (const px of pillars) {
    pillar(r, px - 11, 0, 22, r.h, tMid)
    stampShaded(r, new Raster(34, 9).rect(0, 0, 34, 9, 1), px - 17, 20, tMid, {
      shade: [0, 3],
      hi: [0, 1],
      deep: [0, 1]
    })
    stampShaded(r, new Raster(30, 6).rect(0, 0, 30, 6, 1), px - 15, 29, tMid, { shade: [0, 2], hi: [0, 1] })
    stampShaded(r, new Raster(32, 10).rect(0, 0, 32, 10, 1), px - 16, 196, tMid, {
      shade: [0, 3],
      hi: [0, 1],
      deep: [0, 1]
    })
    // stone band
    tiled((dx) => r.rect(px - 11 + dx, 110, 22, 2, wallMid[3]))
  }
  // banners hang on every other pillar's face
  hangingBanner(r, 40, 52, 20, 70)
  hangingBanner(r, 360, 56, 20, 64)
  // chains from the arch crowns
  for (const [x, len] of [
    [118, 52],
    [124, 36],
    [278, 60],
    [438, 44],
    [444, 58],
    [598, 40]
  ])
    chain(r, x, 18, len)
  fadeBottom(r, 40, tMid.deep)
  return { image: r, parallax: 0.28, y }
}

function torch(r: Raster, x: number, y: number) {
  glow(r, x, y - 6, 22, [color('#6e5a6c'), color('#826470'), color('#98746e'), color('#b08470')], 1.1)
  tiled((dx) => {
    // bracket
    r.rect(x - 1 + dx, y, 3, 8, iron[2])
    r.rect(x - 3 + dx, y - 1, 7, 2, iron[1])
    // flame: teardrop
    r.poly([x + dx, y - 14, x + 4 + dx, y - 6, x + dx, y - 1, x - 4 + dx, y - 6], flame[2])
    r.poly([x + dx, y - 11, x + 2.5 + dx, y - 6, x + dx, y - 2, x - 2.5 + dx, y - 6], flame[1])
    r.poly([x + dx, y - 8, x + 1 + dx, y - 5, x + dx, y - 3, x - 1 + dx, y - 5], flame[0])
  })
}

function nearPillars(): BackdropLayer {
  const y = 20
  const r = layerImage(y)
  const xs = [104, 296, 456, 584]
  for (const px of xs) {
    pillar(r, px - 13, 0, 26, r.h, tNear)
    stampShaded(r, new Raster(38, 10).rect(0, 0, 38, 10, 1), px - 19, 6, tNear, {
      shade: [0, 3],
      hi: [0, 1],
      deep: [0, 1]
    })
    stampShaded(r, new Raster(36, 12).rect(0, 0, 36, 12, 1), px - 18, 200, tNear, {
      shade: [0, 4],
      hi: [0, 1],
      deep: [0, 1]
    })
  }
  // torches on two of them; the light warms the stone around
  for (const [px, ty] of [
    [104, 150],
    [456, 142]
  ]) {
    lightOn(
      r,
      px,
      ty - 8,
      36,
      2,
      tintMap(
        [wallNear[0], wallNear[1], wallNear[2], wallNear[3]],
        [color('#6a4a52'), color('#58404a'), color('#483540'), color('#382a36')]
      ),
      1
    )
    torch(r, px, ty)
  }
  fadeBottom(r, 36, tNear.deep)
  return { image: r, parallax: 0.52, y }
}

export const backdrop: (() => Backdrop) | undefined = () => ({
  sky: sky(),
  layers: [farWall(), midHall(), nearPillars()],
  ambience: 'embers'
})
