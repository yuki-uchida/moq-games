import { fieldScenery } from '../game/FieldScenery'
import {
  distanceToPath,
  FIELDS,
  getField,
  pointOnPath,
  type BattlefieldVersion,
  type LayoutRevision,
  type FieldId,
  type Point
} from '../game/model'
import { allRoadPaths, distanceToRoadUnion, type ResolvedBattlefield } from '../game/BattlefieldRoutes'

type Random = () => number
type Context = CanvasRenderingContext2D

const PALETTES = {
  meadow: {
    ground: '#829967',
    light: '#a1b47c',
    dark: '#6b875f',
    road: '#c3ae80',
    edge: '#697651',
    accent: '#dfd8a2',
    stone: '#99a38b',
    leaf: '#537e55',
    leafLight: '#88a86a',
    leafDark: '#385c48'
  },
  desert: {
    ground: '#bb9565',
    light: '#d2ae77',
    dark: '#a47e58',
    road: '#e3c993',
    edge: '#a07a52',
    accent: '#f6dfad',
    stone: '#b28c64',
    leaf: '#798864',
    leafLight: '#a7b37c',
    leafDark: '#596d52'
  },
  frost: {
    ground: '#b3cace',
    light: '#d8e3df',
    dark: '#92b1bd',
    road: '#e6e8d9',
    edge: '#83a5ad',
    accent: '#fcf9de',
    stone: '#93adb5',
    leaf: '#6c9092',
    leafLight: '#acccc4',
    leafDark: '#50717e'
  },
  volcanic: {
    ground: '#615d63',
    light: '#797174',
    dark: '#49494f',
    road: '#9b8474',
    edge: '#514851',
    accent: '#efb986',
    stone: '#776b70',
    leaf: '#865f5d',
    leafLight: '#b4896d',
    leafDark: '#4b454f'
  }
} as const

type Palette = (typeof PALETTES)[FieldId]

function seededRandom(id: FieldId): Random {
  let seed = 71 + Object.keys(FIELDS).indexOf(id) * 997
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function ellipse(c: Context, x: number, y: number, rx: number, ry: number, color: string) {
  c.fillStyle = color
  c.beginPath()
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  c.fill()
}

function shape(c: Context, points: readonly number[][], fill: string | CanvasGradient, stroke?: string) {
  c.beginPath()
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
  c.closePath()
  c.fillStyle = fill
  c.fill()
  if (stroke) {
    c.strokeStyle = stroke
    c.stroke()
  }
}

function materialWash(c: Context, x: number, y: number, width: number, height: number, light: string, dark: string) {
  const wash = c.createLinearGradient(x, y, x + width, y + height)
  wash.addColorStop(0, light)
  wash.addColorStop(1, dark)
  return wash
}

function softPatch(c: Context, x: number, y: number, rx: number, ry: number, color: string, random: Random) {
  const points = Array.from({ length: 9 }, (_, i) => {
    const angle = (i / 9) * Math.PI * 2,
      radius = 0.78 + random() * 0.22
    return { x: x + Math.cos(angle) * rx * radius, y: y + Math.sin(angle) * ry * radius }
  })
  c.beginPath()
  c.moveTo((points[8].x + points[0].x) / 2, (points[8].y + points[0].y) / 2)
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length]
    c.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2)
  })
  c.closePath()
  c.fillStyle = color
  c.fill()
}

function terrain(c: Context, field: ResolvedBattlefield, colors: Palette, random: Random) {
  const wash = c.createLinearGradient(0, 0, field.width * 0.35, field.height)
  wash.addColorStop(0, colors.light)
  wash.addColorStop(0.5, colors.ground)
  wash.addColorStop(1, colors.ground)
  c.fillStyle = wash
  c.fillRect(0, 0, field.width, field.height)
  for (let i = 0; i < 125; i++) {
    c.globalAlpha = 0.035 + random() * 0.075
    softPatch(
      c,
      random() * field.width,
      random() * field.height,
      45 + random() * 145,
      18 + random() * 68,
      i % 3 ? colors.light : colors.dark,
      random
    )
  }
  c.globalAlpha = 1
  for (let i = 0; i < 1350; i++) {
    const x = random() * field.width,
      y = random() * field.height
    c.globalAlpha = 0.1 + random() * 0.12
    ellipse(c, x, y, 0.7 + random() * 2.5, 0.5 + random(), i % 3 ? colors.light : colors.dark)
  }
  c.globalAlpha = 1
  for (let i = 0; i < 780; i++) {
    const x = random() * field.width,
      y = random() * field.height,
      width = 4 + random() * 12
    c.lineWidth = 0.7 + random() * 0.6
    c.globalAlpha = field.id === 'volcanic' ? 0.14 : 0.2
    c.strokeStyle = i % 3 ? colors.dark : colors.light
    c.beginPath()
    if (field.id === 'desert') {
      c.moveTo(x - width, y)
      c.quadraticCurveTo(x, y - 3, x + width, y + 1)
    } else if (field.id === 'frost') {
      c.moveTo(x - width * 0.5, y)
      c.lineTo(x + width * 0.2, y - 2)
      c.lineTo(x + width * 0.6, y - 1)
    } else if (field.id === 'volcanic') {
      c.moveTo(x - width, y - 2)
      c.lineTo(x - width * 0.2, y)
      c.lineTo(x + width * 0.25, y + 5)
      c.lineTo(x + width, y + 4)
    } else {
      c.moveTo(x - 3, y - 3)
      c.lineTo(x, y)
      c.lineTo(x + 1, y - 5)
      c.moveTo(x + 3, y)
      c.lineTo(x + 5, y - 3)
    }
    c.stroke()
  }
  c.globalAlpha = 1
}

function traceRoad(c: Context, path: readonly Point[]) {
  c.beginPath()
  path.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)))
}

function pebble(c: Context, x: number, y: number, rx: number, ry: number, color: string, random: Random) {
  c.save()
  c.translate(x, y)
  c.rotate(random() * Math.PI)
  softPatch(c, 0, 0, rx, ry, color, random)
  c.restore()
}

function traceFieldRoad(c: Context, field: ResolvedBattlefield) {
  const paths = allRoadPaths(field)
  if (paths.length === 1) return traceRoad(c, paths[0])
  c.beginPath()
  for (const path of paths) {
    c.moveTo(path[0].x, path[0].y)
    for (const point of path.slice(1)) c.lineTo(point.x, point.y)
  }
}
function roadSegments(field: ResolvedBattlefield): [Point, Point][] {
  return allRoadPaths(field).flatMap((path) =>
    path.slice(1).map((point, index): [Point, Point] => [path[index], point])
  )
}
function roadDistance(field: ResolvedBattlefield, point: Point): number {
  return field.version === 1 ? distanceToPath(field.path, point) : distanceToRoadUnion(field, point)
}

function roadShoulders(c: Context, field: ResolvedBattlefield, colors: Palette) {
  const random = seededRandom(field.id)
  for (const [a, b] of roadSegments(field)) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy)
    for (let distance = 12; distance < length - 12; distance += 21 + random() * 22) {
      for (const side of [-1, 1]) {
        const offset = (35 + random() * 2) * side,
          x = a.x + (dx * distance - dy * offset) / length,
          y = a.y + (dy * distance + dx * offset) / length,
          width = 7 + random() * 9
        if (
          [-width, 0, width].some(
            (along) => roadDistance(field, { x: x + (dx * along) / length, y: y + (dy * along) / length }) < 33
          )
        )
          continue
        c.save()
        c.translate(x, y)
        c.rotate(Math.atan2(dy, dx))
        c.scale(1, side)
        c.globalAlpha = field.id === 'frost' ? 0.62 : 0.32
        shape(
          c,
          [
            [-width, -2],
            [-width * 0.6, 3],
            [width * 0.5, 4],
            [width, 0],
            [width * 0.65, -3]
          ],
          field.id === 'frost' ? colors.light : colors.dark
        )
        c.strokeStyle = colors.accent
        c.lineWidth = field.id === 'frost' ? 2.2 : 1.3
        c.beginPath()
        c.moveTo(-width * 0.8, -1.5)
        c.quadraticCurveTo(-width * 0.2, 1, width * 0.65, -1.5)
        c.stroke()
        if (field.id === 'meadow') {
          c.strokeStyle = colors.leafDark
          c.lineWidth = 1
          c.beginPath()
          c.moveTo(-width * 0.25, 3)
          c.lineTo(-width * 0.5, 7)
          c.moveTo(-width * 0.25, 3)
          c.lineTo(-width * 0.12, 6)
          c.stroke()
        }
        c.restore()
      }
    }
  }
}

function road(c: Context, field: ResolvedBattlefield, colors: Palette, random: Random) {
  c.lineJoin = c.lineCap = 'round'
  traceFieldRoad(c, field)
  c.strokeStyle = colors.dark
  c.globalAlpha = 0.24
  c.lineWidth = 84
  c.stroke()
  c.globalAlpha = 1
  c.strokeStyle = colors.edge
  c.lineWidth = 76
  c.stroke()
  for (const [a, b] of roadSegments(field)) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy)
    for (let d = 5; d < length; d += 8 + random() * 12) {
      for (const side of [-1, 1]) {
        const offset = (33 + random() * 4) * side
        const x = a.x + (dx * d - dy * offset) / length,
          y = a.y + (dy * d + dx * offset) / length
        ellipse(c, x, y, 3 + random() * 4, 2 + random() * 3, colors.edge)
      }
    }
  }
  traceFieldRoad(c, field)
  c.strokeStyle = colors.accent
  c.globalAlpha = field.id === 'frost' ? 0.62 : 0.34
  c.lineWidth = 69
  c.stroke()
  c.globalAlpha = 1
  c.strokeStyle = colors.road
  c.lineWidth = 62
  c.stroke()
  roadShoulders(c, field, colors)
  for (let i = 0; i < 6500 * (field.height / 960); i++) {
    const point = { x: random() * field.width, y: random() * field.height }
    const distance = roadDistance(field, point)
    if (distance > 29) continue
    const isPaver = random() < (field.id === 'desert' ? 0.13 : 0.35)
    const size = isPaver ? 5 + random() * 6 : 0.8 + random() * 2.2
    c.globalAlpha = isPaver ? 0.2 + random() * 0.14 : 0.15 + random() * 0.12
    if (field.id === 'volcanic' && isPaver) {
      shape(
        c,
        [
          [point.x - size, point.y - size * 0.4],
          [point.x + size * 0.5, point.y - size * 0.55],
          [point.x + size, point.y],
          [point.x + size * 0.5, point.y + size * 0.45],
          [point.x - size * 0.8, point.y + size * 0.3]
        ],
        random() < 0.65 ? '#b29b86' : '#6e6364',
        '#514b55'
      )
      c.globalAlpha = 0.13
      c.strokeStyle = '#efbf91'
      c.lineWidth = 0.8
      c.beginPath()
      c.moveTo(point.x - size * 0.7, point.y - size * 0.25)
      c.lineTo(point.x + size * 0.35, point.y - size * 0.35)
      c.stroke()
    } else if (field.id === 'desert' && !isPaver) {
      c.strokeStyle = colors.edge
      c.lineWidth = 0.7
      c.beginPath()
      c.moveTo(point.x - size * 2, point.y)
      c.quadraticCurveTo(point.x, point.y - 1.5, point.x + size * 2, point.y + 0.7)
      c.stroke()
    } else if (field.id === 'frost' && isPaver) {
      c.globalAlpha = 0.16
      shape(
        c,
        [
          [point.x - size, point.y],
          [point.x, point.y - size * 0.6],
          [point.x + size, point.y - size * 0.2],
          [point.x + size * 0.5, point.y + size * 0.5]
        ],
        '#79a6b7'
      )
      c.globalAlpha = 0.4
      c.strokeStyle = '#ffffff'
      c.lineWidth = 0.7
      c.beginPath()
      c.moveTo(point.x - size * 0.6, point.y)
      c.lineTo(point.x, point.y - size * 0.35)
      c.lineTo(point.x + size * 0.6, point.y - size * 0.1)
      c.stroke()
    } else {
      pebble(
        c,
        point.x,
        point.y,
        size,
        size * (0.36 + random() * 0.27),
        random() < 0.6 ? colors.accent : colors.edge,
        random
      )
    }
    if (isPaver && field.id !== 'frost') {
      c.globalAlpha = 0.16
      c.strokeStyle = colors.edge
      c.lineWidth = 0.9
      c.beginPath()
      c.moveTo(point.x - size * 0.4, point.y + size * 0.45)
      c.quadraticCurveTo(point.x + size * 0.15, point.y + size * 0.65, point.x + size * 0.65, point.y + size * 0.25)
      c.stroke()
    }
  }
  c.globalAlpha = 1
}

function tree(c: Context, colors: Palette, snow: boolean, variation: number) {
  ellipse(c, 7, 5, 31, 11, snow ? '#78959d35' : '#365b4135')
  ellipse(c, 1, 4, 10, 3, '#263a3b26')
  c.lineJoin = c.lineCap = 'round'
  c.lineWidth = 2.3
  shape(
    c,
    [
      [-5, 2],
      [-3, -28],
      [6, -27],
      [6, 2],
      [10, 5],
      [-8, 5]
    ],
    '#7f7453',
    '#4e614b'
  )
  c.strokeStyle = '#b7a778'
  c.lineWidth = 1.7
  c.beginPath()
  c.moveTo(-1, 0)
  c.lineTo(0, -24)
  c.stroke()
  if (snow) {
    for (let layer = 2; layer >= 0; layer--) {
      const y = -24 - (2 - layer) * 17,
        width = 24 - (2 - layer) * 6
      c.beginPath()
      c.moveTo(0, y - 26)
      c.bezierCurveTo(-8, y - 16, -width + 7, y - 4, -width, y + 5)
      c.quadraticCurveTo(-width * 0.7, y + 12, -width * 0.3, y + 8)
      c.quadraticCurveTo(0, y + 16, width * 0.32, y + 8)
      c.quadraticCurveTo(width * 0.75, y + 12, width, y + 5)
      c.bezierCurveTo(width - 7, y - 4, 9, y - 16, 0, y - 26)
      c.fillStyle = materialWash(c, -width, y - 20, width * 2, 33, colors.leafLight, colors.leafDark)
      c.fill()
      c.strokeStyle = colors.leafDark
      c.lineWidth = 2
      c.stroke()
      c.beginPath()
      c.moveTo(0, y - 25)
      c.quadraticCurveTo(-7, y - 13, -width + 5, y + 1)
      c.quadraticCurveTo(-width * 0.3, y - 3, -3, y + 3)
      c.quadraticCurveTo(6, y - 2, width - 8, y)
      c.quadraticCurveTo(7, y - 16, 0, y - 25)
      c.fillStyle = '#dce8e2'
      c.fill()
      ellipse(c, -3, y - 10, 4, 2, '#f4f5e8')
    }
  } else {
    c.beginPath()
    c.moveTo(-25, -25)
    c.bezierCurveTo(-37, -30, -32, -49, -23, -51)
    c.bezierCurveTo(-29, -68, -10, -78 - variation, -1, -70)
    c.bezierCurveTo(10, -79, 27, -67, 25, -55)
    c.bezierCurveTo(39, -48, 34, -31, 26, -28)
    c.bezierCurveTo(20, -17, 7, -17, 1, -22)
    c.bezierCurveTo(-7, -17, -23, -18, -25, -25)
    c.fillStyle = materialWash(c, -25, -70, 48, 55, colors.leafLight, colors.leafDark)
    c.fill()
    c.lineWidth = 2.5
    c.strokeStyle = colors.leafDark
    c.stroke()
    for (const [x, y, rx, ry] of [
      [-13, -50, 16, 17],
      [1, -61, 15, 12],
      [14, -46, 13, 14]
    ]) {
      c.fillStyle = materialWash(c, x - rx * 0.5, y - ry, rx, ry * 2, colors.leafLight, colors.leaf)
      c.beginPath()
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 0.55
    ellipse(c, -11, -61, 8, 4, '#b4c783')
    ellipse(c, 14, -53, 5, 3, '#b4c783')
    c.globalAlpha = 1
    c.strokeStyle = colors.leafDark
    c.lineWidth = 1.3
    c.beginPath()
    c.moveTo(-20, -32)
    c.quadraticCurveTo(-12, -26, -7, -31)
    c.moveTo(11, -27)
    c.quadraticCurveTo(21, -26, 24, -33)
    c.stroke()
    c.lineWidth = 1.1
    for (const [x, y, width] of [
      [-23, -50, 7],
      [-10, -70, 8],
      [7, -64, 6],
      [17, -44, 7],
      [-7, -36, 6]
    ]) {
      c.strokeStyle = colors.leafDark
      c.globalAlpha = 0.22
      c.beginPath()
      c.moveTo(x - width / 2, y)
      c.quadraticCurveTo(x, y + 3, x + width / 2, y - 1)
      c.stroke()
      c.strokeStyle = colors.leafLight
      c.globalAlpha = 0.65
      c.beginPath()
      c.moveTo(x - width / 2, y - 2)
      c.quadraticCurveTo(x, y, x + width / 2, y - 3)
      c.stroke()
    }
    c.globalAlpha = 1
  }
}

function rock(c: Context, colors: Palette, volcanic: boolean, snow: boolean, random: Random) {
  const width = 14 + random() * 13,
    height = 10 + random() * 13
  ellipse(c, 3, 4, width + 4, 7, '#25303a28')
  ellipse(c, 1, 4, width * 0.86, 3, '#28343a24')
  c.lineWidth = 1.8
  shape(
    c,
    [
      [-width, 1],
      [-width * 0.8, -height * 0.6],
      [-width * 0.25, -height],
      [width * 0.55, -height * 0.88],
      [width, -height * 0.2],
      [width * 0.8, 4],
      [-width * 0.5, 6]
    ],
    materialWash(c, -width, -height, width * 1.6, height * 1.3, colors.stone, colors.dark),
    colors.edge
  )
  shape(
    c,
    [
      [-width * 0.8, -height * 0.6],
      [-width * 0.25, -height],
      [width * 0.55, -height * 0.88],
      [width * 0.22, -height * 0.3],
      [-width * 0.4, -height * 0.22]
    ],
    snow ? '#e1ebe6' : colors.light
  )
  shape(
    c,
    [
      [width * 0.22, -height * 0.3],
      [width * 0.55, -height * 0.88],
      [width, -height * 0.2],
      [width * 0.8, 4],
      [width * 0.08, 4]
    ],
    colors.dark
  )
  c.strokeStyle = snow ? '#f3f5ea' : colors.accent
  c.globalAlpha = snow ? 0.72 : 0.3
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(-width * 0.76, -height * 0.58)
  c.lineTo(-width * 0.25, -height * 0.91)
  c.lineTo(width * 0.5, -height * 0.8)
  c.stroke()
  c.strokeStyle = colors.edge
  c.globalAlpha = 0.48
  c.beginPath()
  c.moveTo(-width * 0.4, -height * 0.18)
  c.lineTo(-width * 0.22, -height * 0.04)
  c.lineTo(-width * 0.29, height * 0.16)
  c.moveTo(width * 0.34, -height * 0.1)
  c.lineTo(width * 0.57, -height * 0.16)
  c.stroke()
  c.globalAlpha = 1
  if (volcanic && random() > 0.35) {
    c.strokeStyle = '#d3986d'
    c.lineWidth = 1.5
    c.beginPath()
    c.moveTo(-width * 0.5, -height * 0.5)
    c.lineTo(-width * 0.1, -height * 0.2)
    c.lineTo(-width * 0.24, 1)
    c.lineTo(width * 0.1, 3)
    c.stroke()
  }
}

function cactus(c: Context, colors: Palette, random: Random) {
  ellipse(c, 4, 4, 21, 7, '#79644132')
  const lean = random() * 5 - 2.5
  c.lineCap = c.lineJoin = 'round'
  for (const [width, color] of [
    [12, colors.leafDark],
    [9, colors.leaf],
    [3, colors.leafLight]
  ] as const) {
    c.lineWidth = width
    c.strokeStyle = color
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(lean, -42)
    c.moveTo(0, -17)
    c.quadraticCurveTo(-18, -15, -17, -24)
    c.lineTo(-17, -30)
    c.moveTo(0, -28)
    c.quadraticCurveTo(15, -25, 15, -33)
    c.lineTo(15, -39)
    c.stroke()
  }
  ellipse(c, lean, -46, 4, 2.5, '#d4b079')
}

function groundSprig(c: Context, colors: Palette, id: FieldId, random: Random) {
  if (id === 'volcanic') {
    rock(c, colors, true, false, random)
    return
  }
  c.strokeStyle = id === 'frost' ? '#8da8ab' : colors.leaf
  c.lineWidth = 1.5
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(-7, 2)
  c.quadraticCurveTo(-10, -3, -13, -5)
  c.moveTo(-2, 2)
  c.quadraticCurveTo(-6, -8, -4, -11)
  c.moveTo(1, 2)
  c.quadraticCurveTo(6, -7, 9, -7)
  c.stroke()
  if (id === 'meadow' && random() < 0.35) {
    ellipse(c, -4, -11, 2.7, 2.5, '#e2d5a0')
    ellipse(c, 9, -7, 2, 2, '#d9c795')
  }
}

function scenery(c: Context, field: ResolvedBattlefield, colors: Palette, random: Random) {
  for (const item of fieldScenery(field.id, field.version, field.layoutRevision)) {
    c.save()
    c.translate(item.x, item.y)
    c.scale(item.scale, item.scale)
    if (item.kind === 'tree') tree(c, colors, field.id === 'frost', random() * 8)
    else if (item.kind === 'cactus') cactus(c, colors, random)
    else if (item.kind === 'rock') rock(c, colors, field.id === 'volcanic', field.id === 'frost', random)
    else groundSprig(c, colors, field.id, random)
    c.restore()
  }
}

function slowRoadSurface(c: Context, field: ResolvedBattlefield, colors: Palette) {
  const surface = field.slowSurface,
    random = seededRandom(field.id)
  const points: Point[] = []
  for (let progress = surface.startProgress; progress < surface.endProgress; progress += 5)
    points.push(pointOnPath(field.path, progress))
  points.push(pointOnPath(field.path, surface.endProgress))
  const fill = { mud: '#806345', 'soft-sand': '#b88a54', slush: '#7f9fa7', ash: '#48414d' }[surface.kind]
  c.save()
  c.lineJoin = 'round'
  c.lineCap = 'butt'
  c.globalAlpha = 0.62
  const left: number[][] = [],
    right: number[][] = []
  for (const [index, p] of points.entries()) {
    const progress = Math.min(surface.endProgress, surface.startProgress + index * 5)
    const q = pointOnPath(field.path, progress + 1)
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    const nx = -(q.y - p.y) / length,
      ny = (q.x - p.x) / length
    const halfWidth = 17 + random() * 5
    left.push([p.x + nx * halfWidth, p.y + ny * halfWidth])
    right.push([p.x - nx * (19 + random() * 3), p.y - ny * (19 + random() * 3)])
  }
  shape(c, [...left, ...right.reverse()], fill)
  for (let i = 0; i < 54; i++) {
    const progress =
      surface.startProgress + 8 + random() * Math.max(1, surface.endProgress - surface.startProgress - 16)
    const p = pointOnPath(field.path, progress),
      q = pointOnPath(field.path, progress + 1)
    const length = Math.hypot(q.x - p.x, q.y - p.y),
      offset = (random() - 0.5) * 30
    const x = p.x - ((q.y - p.y) / length) * offset,
      y = p.y + ((q.x - p.x) / length) * offset
    c.globalAlpha = 0.18 + random() * 0.16
    ellipse(c, x, y, 2 + random() * 4, 0.8 + random() * 2, i % 3 ? colors.accent : fill)
  }
  c.globalAlpha = 0.65
  c.strokeStyle = colors.accent
  c.lineWidth = 1.5
  for (const progress of [surface.startProgress, surface.endProgress]) {
    const p = pointOnPath(field.path, progress),
      q = pointOnPath(field.path, progress + 1)
    const length = Math.hypot(q.x - p.x, q.y - p.y),
      nx = -(q.y - p.y) / length,
      ny = (q.x - p.x) / length
    c.beginPath()
    c.moveTo(p.x - nx * 22, p.y - ny * 22)
    c.lineTo(p.x + nx * 22, p.y + ny * 22)
    c.stroke()
  }
  const center = pointOnPath(field.path, (surface.startProgress + surface.endProgress) / 2)
  c.globalAlpha = 1
  c.fillStyle = '#3b4e43df'
  c.beginPath()
  c.roundRect(center.x - 31, center.y - 9, 62, 18, 6)
  c.fill()
  c.fillStyle = '#fff2cc'
  c.font = 'bold 10px "Noto Sans CJK JP", "Hiragino Kaku Gothic ProN", sans-serif'
  c.textAlign = 'center'
  c.fillText(`地上 ${Math.round(surface.speedFactor * 100)}%`, center.x, center.y + 4)
  c.restore()
}

function arch(c: Context, x: number, y: number, width: number, height: number, color: string) {
  c.beginPath()
  c.moveTo(x - width / 2, y)
  c.lineTo(x - width / 2, y - height + width / 2)
  c.arc(x, y - height + width / 2, width / 2, Math.PI, 0)
  c.lineTo(x + width / 2, y)
  c.closePath()
  c.fillStyle = color
  c.fill()
}

function gate(c: Context, point: Point, colors: Palette, base: boolean, snow: boolean, health = 1) {
  c.save()
  c.translate(point.x, point.y)
  if (base) c.scale(1, 1.12)
  c.lineJoin = c.lineCap = 'round'
  ellipse(c, 3, 8, base ? 45 : 37, 13, '#263b3c38')
  c.lineWidth = 2
  if (base) {
    ellipse(c, 1, 8, 58, 16, '#203f3730')
    shape(
      c,
      [
        [-48, 12],
        [-58, 4],
        [-48, -8],
        [46, -8],
        [57, 4],
        [47, 14]
      ],
      colors.stone,
      colors.edge
    )
    c.fillStyle = materialWash(c, -25, -94, 49, 55, '#dfd3b0', '#b4ac94')
    c.fillRect(-25, -94, 50, 57)
    c.fillStyle = '#a39983'
    c.fillRect(16, -94, 9, 57)
    c.strokeStyle = '#8f978377'
    c.lineWidth = 0.8
    for (let row = 0; row < 5; row++) {
      const y = -86 + row * 10
      c.beginPath()
      c.moveTo(-23, y)
      c.lineTo(23, y)
      c.moveTo(row % 2 ? -13 : 7, y)
      c.lineTo(row % 2 ? -13 : 7, y + 9)
      c.stroke()
    }
    shape(
      c,
      [
        [-34, -92],
        [-4, -124],
        [30, -92]
      ],
      materialWash(c, -26, -121, 50, 37, colors.leaf, colors.leafDark),
      '#344e4c'
    )
    shape(
      c,
      [
        [-29, -95],
        [-4, -119],
        [-2, -95]
      ],
      colors.leafLight
    )
    c.strokeStyle = snow ? '#e9eee5' : colors.leaf
    c.lineWidth = snow ? 4 : 2
    for (let row = 0; row < 3; row++) {
      c.beginPath()
      c.moveTo(-24 + row * 5, -100 - row * 6)
      c.lineTo(23 - row * 7, -100 - row * 6)
      c.stroke()
    }
    c.fillStyle = '#314a4a44'
    c.fillRect(-25, -92, 50, 4)
    c.strokeStyle = '#e4dabc'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(-24, -87)
    c.lineTo(-24, -51)
    c.stroke()
    arch(c, -4, -65, 13, 22, '#47615a')
    arch(c, -4, -67, 7, 16, '#ffdfa0')
    c.fillStyle = '#657368'
    c.fillRect(-5, -83, 2, 18)
    c.fillRect(-10, -75, 12, 2)
    shape(
      c,
      [
        [-36, 9],
        [-35, -36],
        [34, -36],
        [38, 9]
      ],
      materialWash(c, -33, -36, 67, 44, '#92a598', '#607c79'),
      '#435a5c'
    )
    shape(
      c,
      [
        [-33, -36],
        [-30, -48],
        [29, -48],
        [33, -36]
      ],
      '#acb8a1',
      '#506564'
    )
    for (const side of [-1, 1]) {
      const x = side * 30
      c.fillStyle = materialWash(c, x - 11, -58, 22, 66, '#a4b3a0', '#758f86')
      c.fillRect(x - 11, -58, 22, 66)
      c.fillStyle = '#bcc5aa'
      c.fillRect(x - 10, -55, 7, 59)
      c.fillStyle = '#637c79'
      c.fillRect(x + 6, -55, 5, 60)
      c.fillStyle = '#3b53552b'
      c.fillRect(x - 10, -56, 20, 5)
      c.lineWidth = 1.6
      shape(
        c,
        [
          [x - 14, -56],
          [x - 14, -65],
          [x - 7, -65],
          [x - 7, -59],
          [x - 3, -59],
          [x - 3, -65],
          [x + 4, -65],
          [x + 4, -59],
          [x + 8, -59],
          [x + 8, -65],
          [x + 14, -65],
          [x + 14, -56]
        ],
        snow ? '#e2e9df' : '#b6c2a7',
        '#506867'
      )
      arch(c, x, -22, 7, 16, '#3b585c')
      for (let row = 0; row < 4; row++) {
        c.strokeStyle = '#758a82'
        c.lineWidth = 1
        c.beginPath()
        c.moveTo(x - 8, -12 - row * 10)
        c.lineTo(x + 7, -12 - row * 10)
        c.moveTo(x + (row % 2 ? -3 : 2), -12 - row * 10)
        c.lineTo(x + (row % 2 ? -3 : 2), -21 - row * 10)
        c.stroke()
      }
    }
    arch(c, 0, 10, 35, 46, '#465a56')
    arch(c, 0, 9, 26, 36, '#8a7455')
    c.strokeStyle = '#c4cdb0'
    c.lineWidth = 1.4
    c.beginPath()
    c.moveTo(-17, 7)
    c.lineTo(-17, -18)
    c.arc(0, -18, 17, Math.PI, Math.PI * 1.75)
    c.stroke()
    c.fillStyle = '#384c4633'
    c.fillRect(-12, -13, 24, 5)
    c.strokeStyle = '#b6a075'
    c.lineWidth = 1.5
    for (const x of [-8, -3, 3, 8]) {
      c.beginPath()
      c.moveTo(x, 8)
      c.lineTo(x, -20)
      c.stroke()
    }
    c.strokeStyle = '#50635e'
    c.lineWidth = 3
    c.beginPath()
    c.moveTo(-11, -8)
    c.lineTo(11, -8)
    c.moveTo(-11, 3)
    c.lineTo(11, 3)
    c.stroke()
    c.strokeStyle = '#d7cda3'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(0, -48)
    c.lineTo(0, -97)
    c.stroke()
    shape(
      c,
      [
        [2, -95],
        [24, -92],
        [18, -82],
        [24, -77],
        [2, -79]
      ],
      '#a2cac0',
      '#577d7d'
    )
    shape(
      c,
      [
        [2, -95],
        [7, -93],
        [7, -80],
        [2, -79]
      ],
      '#d1e1c9'
    )
    shape(
      c,
      [
        [20, -85],
        [18, -82],
        [24, -77],
        [17, -79]
      ],
      '#669a96'
    )
    shape(
      c,
      [
        [9, -88],
        [12, -92],
        [15, -88],
        [12, -84]
      ],
      '#e8dfa8'
    )
    ellipse(c, -22, 9, 12, 4, colors.road)
    ellipse(c, 25, 11, 10, 3, colors.road)
    for (const side of [-1, 1]) {
      const x = side * 47
      c.fillStyle = colors.leafDark
      c.fillRect(x - 2, -34, 4, 35)
      shape(
        c,
        [
          [x - 8, -32],
          [x + 8, -32],
          [x + 6, -13],
          [x, -8],
          [x - 6, -13]
        ],
        colors.leafLight,
        colors.leafDark
      )
      shape(
        c,
        [
          [x, -27],
          [x + 4, -21],
          [x, -17],
          [x - 4, -21]
        ],
        '#f4dfa0'
      )
      ellipse(c, x, 3, 8, 3, colors.edge)
    }
    if (health < 0.67) {
      c.strokeStyle = '#4d5652'
      c.lineWidth = 2
      for (const side of [-1, 1]) {
        c.beginPath()
        c.moveTo(side * 27, -40)
        c.lineTo(side * 32, -32)
        c.lineTo(side * 28, -24)
        c.lineTo(side * 34, -17)
        c.stroke()
      }
      shape(
        c,
        [
          [-48, 12],
          [-44, 6],
          [-37, 8],
          [-35, 13],
          [-42, 16]
        ],
        '#91a091',
        '#667d75'
      )
      shape(
        c,
        [
          [33, 14],
          [35, 8],
          [41, 11],
          [42, 16]
        ],
        '#697e75'
      )
    }
    if (health < 0.34) {
      shape(
        c,
        [
          [-25, -48],
          [-21, -33],
          [-13, -46]
        ],
        '#43554f'
      )
      c.strokeStyle = '#c9c9ab'
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(-25, -48)
      c.lineTo(-21, -33)
      c.moveTo(27, -61)
      c.lineTo(30, -49)
      c.stroke()
      shape(
        c,
        [
          [27, -61],
          [30, -49],
          [38, -60]
        ],
        '#43554f'
      )
      c.strokeStyle = '#594f41'
      c.lineWidth = 3
      c.beginPath()
      c.moveTo(-4, -20)
      c.lineTo(3, -12)
      c.lineTo(-1, -6)
      c.lineTo(5, 5)
      c.stroke()
      ellipse(c, -13, 13, 8, 3, '#9b8f77')
    }
  } else {
    arch(c, 0, 7, 67, 67, colors.leafDark)
    arch(c, 0, 8, 44, 49, '#35434a')
    arch(c, 0, 8, 32, 39, '#26383d')
    c.strokeStyle = colors.stone
    c.lineWidth = 7
    c.beginPath()
    c.arc(0, -25, 26, Math.PI, 0)
    c.stroke()
    for (const side of [-1, 1]) {
      shape(
        c,
        [
          [side * 22, 8],
          [side * 22, -29],
          [side * 34, -26],
          [side * 35, 8]
        ],
        colors.stone,
        colors.edge
      )
      c.fillStyle = colors.light
      c.fillRect(side === -1 ? -34 : 23, -16, 10, 3)
    }
    shape(
      c,
      [
        [-9, -56],
        [9, -56],
        [8, -34],
        [0, -28],
        [-8, -34]
      ],
      '#b78369',
      '#6d5951'
    )
    shape(
      c,
      [
        [0, -48],
        [4, -42],
        [0, -36],
        [-4, -42]
      ],
      '#e5c18a'
    )
    if (snow) ellipse(c, -14, -47, 16, 4, '#e1ebe6')
  }
  c.fillStyle = '#344c48dd'
  c.beginPath()
  c.roundRect(-33, 20, 66, 20, 7)
  c.fill()
  c.fillStyle = '#ece3be'
  c.font = 'bold 11px "Noto Sans CJK JP", "Hiragino Kaku Gothic ProN", sans-serif'
  c.textAlign = 'center'
  c.fillText(base ? '王国の門' : '侵入口', 0, 34)
  c.restore()
}

export function createFieldArt(
  fieldId: FieldId,
  includeBase = true,
  version: BattlefieldVersion = 1,
  ground?: CanvasImageSource,
  layoutRevision: LayoutRevision = 1
): HTMLCanvasElement {
  const field = getField(fieldId, version, layoutRevision),
    colors = PALETTES[fieldId],
    random = seededRandom(fieldId)
  const canvas = document.createElement('canvas')
  canvas.width = field.width
  canvas.height = field.height
  const c = canvas.getContext('2d')!
  c.imageSmoothingEnabled = true
  if (ground && layoutRevision === 4) {
    c.drawImage(ground, 0, 0, field.width, field.height)
    // Preserve the existing slow-terrain mechanic and its visible label over
    // the approved art, without repainting props or duplicating its buildings.
    slowRoadSurface(c, field, colors)
    return canvas
  }
  terrain(c, field, colors, random)
  road(c, field, colors, random)
  if (ground && version === 2) c.drawImage(ground, 0, 0, field.width, field.height)
  slowRoadSurface(c, field, colors)
  scenery(c, field, colors, random)
  gate(c, field.path[0], colors, false, fieldId === 'frost')
  if (includeBase) gate(c, field.path[field.path.length - 1], colors, true, fieldId === 'frost')
  return canvas
}

export function createBaseArt(fieldId: FieldId, healthRatio: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 256
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = true
  gate(context, { x: 96, y: 184 }, PALETTES[fieldId], true, fieldId === 'frost', healthRatio)
  return canvas
}

export function createSandbagArt(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 40
  const c = canvas.getContext('2d')!
  c.imageSmoothingEnabled = true
  ellipse(c, 33, 25, 28, 10, '#24392e48')
  const bags = [
    [15, 14, -0.13],
    [33, 12, 0.08],
    [49, 15, -0.08],
    [22, 24, 0.08],
    [42, 25, -0.1]
  ]
  for (const [x, y, angle] of bags) {
    c.save()
    c.translate(x, y)
    c.rotate(angle)
    c.lineWidth = 1.4
    shape(
      c,
      [
        [-10, -5],
        [-6, -8],
        [6, -7],
        [11, -3],
        [10, 4],
        [6, 7],
        [-7, 6],
        [-11, 2]
      ],
      '#b7a16d',
      '#625f43'
    )
    shape(
      c,
      [
        [-8, -4],
        [-5, -6],
        [5, -5],
        [8, -2],
        [5, 0],
        [-5, -1]
      ],
      '#d7c38c'
    )
    c.strokeStyle = '#8d7c50'
    c.lineWidth = 0.8
    c.beginPath()
    c.moveTo(-7, 4)
    c.quadraticCurveTo(0, 6, 7, 4)
    c.moveTo(8, -2)
    c.lineTo(7, 3)
    c.stroke()
    c.fillStyle = '#8c815856'
    for (const [gx, gy] of [
      [-4, 1],
      [1, 3],
      [4, 1],
      [-6, 3]
    ])
      c.fillRect(gx, gy, 1, 1)
    c.restore()
  }
  return canvas
}
