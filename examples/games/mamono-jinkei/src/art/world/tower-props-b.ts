/** Stage 3 props, part 2: the clocktower gimmicks (vent, windmill, drawbridge, bells, doors, gear, flag, cloud). */
import { Raster, ball } from '../raster'
import type { Sheet } from '../sheet'
import { solid } from './pp'
import { mod, vn1 } from './gfx'
import {
  C,
  D,
  GOLD,
  R,
  RK,
  RT,
  S,
  SK,
  STEEL,
  WOOD,
  beam,
  block3,
  bayer,
  frame,
  gearSprite,
  mk,
  outline,
  part,
  post,
  rivet,
  shade,
  strap,
  swing
} from './tower-pp'
import { rope } from './tower-gfx'

// ------------------------------------------------------------------ vent

function vent(f: number) {
  const r = frame('vent')
  part(r, (l) => {
    l.ellipse(32, 38, 26, 15, S[2])
    l.ellipse(32, 36.5, 26, 14.5, S[1])
    l.ellipse(32, 36.5, 22, 11.5, S[3])
    l.ellipse(32, 37, 20.5, 10, C.black)
  })
  // inner rim highlight
  r.ring(32, 36.5, 21, 22.6, S[0], Math.PI * 0.9, Math.PI * 1.9)
  // slats
  for (let i = 0; i < 4; i++) {
    const y = 31 + i * 3.4
    const half = Math.sqrt(Math.max(0, 1 - ((y - 37) / 10) ** 2)) * 20
    r.rect(32 - half, y, half * 2, 2, STEEL[2])
    r.rect(32 - half, y, half * 2, 1, STEEL[0])
  }
  // brass studs at the rim
  for (const [x, y] of [
    [9, 38],
    [55, 38],
    [32, 24],
    [32, 49]
  ])
    r.set(x, y, GOLD[0]), r.set(x + 1, y + 1, GOLD[3])
  // wind wisps rising with a 16 px period
  const wisps = [
    [19, 0],
    [32, 6],
    [45, 11]
  ]
  for (const [x0, ph] of wisps) {
    for (let y = 3; y < 33; y++) {
      const u = (y + f * 4 + ph) % 16
      if (u > 10) continue
      const t = (33 - y) / 30
      if (t > 0.7 && bayer(x0, y) > 1.6 - t * 1.6) continue
      const wob = Math.round(Math.sin(((y + f * 4) / 16) * Math.PI * 2 + ph * 0.6) * 2)
      r.set(x0 + wob, y, R.paper[0])
      r.set(x0 + wob - 1, y, SK[0])
      if (u > 1 && u < 9 && t < 0.6) r.set(x0 + wob + 1, y, SK[1])
    }
  }
  return r
}

// ------------------------------------------------------------------ windmill

function sail(l: Raster, hx: number, hy: number, ang: number) {
  const dx = Math.sin(ang)
  const dy = -Math.cos(ang)
  const px = Math.cos(ang)
  const py = Math.sin(ang)
  const pt = (rr: number, lat: number): [number, number] => [hx + dx * rr + px * lat, hy + dy * rr + py * lat]
  const cloth = R.clothWhite
  const quad = [pt(14, 1.5), pt(56, 1.5), pt(56, 14), pt(14, 14)].flat()
  l.poly(quad, cloth[1])
  // shaded lower half and ribs
  l.poly([pt(14, 8), pt(56, 8), pt(56, 14), pt(14, 14)].flat(), cloth[2])
  for (let rr = 14; rr <= 56; rr += 7) {
    const [a, b] = [pt(rr, 1.5), pt(rr, 14)]
    l.line(a[0], a[1], b[0], b[1], WOOD[2])
  }
  const f0 = pt(14, 14)
  const f1 = pt(56, 14)
  l.line(f0[0], f0[1], f1[0], f1[1], WOOD[1])
  // rod
  const a = pt(6, 0)
  const b = pt(58, 0)
  l.thick(a[0], a[1], b[0], b[1], 3, WOOD[2])
  l.line(a[0] - px * 0.5, a[1] - py * 0.5, b[0] - px * 0.5, b[1] - py * 0.5, WOOD[0])
  const c = pt(58, 0)
  l.thick(c[0], c[1], pt(58, 15)[0], pt(58, 15)[1], 2, WOOD[1])
}

function windmill(spin: number) {
  const r = frame('windmill')
  shade(r, 64, 172, 42, 9)
  part(r, (l) => {
    // stone foundation
    l.poly([30, 176, 98, 176, 92, 132, 36, 132], S[1])
    // wooden upper tower
    l.poly([39, 132, 89, 132, 80, 70, 48, 70], WOOD[1])
  })
  // stone foundation shading + bricks
  for (let y = 132; y < 176; y++) {
    const half = 34 - (y - 132) * 0.01 * 9 + (y - 132) * 0.24
    for (let x = Math.ceil(64 - half); x < 64 + half; x++) {
      const t = (x - (64 - half)) / (half * 2)
      let c = t < 0.2 ? S[0] : t < 0.62 ? S[1] : t < 0.85 ? S[2] : S[3]
      const course = Math.floor((y - 132) / 7)
      if ((y - 132) % 7 === 6) c = S[3]
      else if ((x + (course % 2) * 8) % 16 === 0) c = c === S[0] ? S[1] : S[3]
      if (y === 176 - 1) c = S[3]
      r.set(x, y, c)
    }
  }
  // wooden shaft with vertical planks
  for (let y = 70; y < 132; y++) {
    const t0 = (y - 70) / 62
    const half = 16 + t0 * 9.5
    for (let x = Math.ceil(64 - half); x < 64 + half; x++) {
      const t = (x - (64 - half)) / (half * 2)
      let c = t < 0.15 ? WOOD[0] : t < 0.6 ? WOOD[1] : t < 0.85 ? WOOD[2] : WOOD[3]
      if ((x - 64 + 100) % 7 === 0 && t > 0.1) c = c === WOOD[1] ? WOOD[2] : WOOD[3]
      if ((y > 100 && y < 103) || (y > 79 && y < 82)) c = c === WOOD[3] ? WOOD[3] : STEEL[2]
      r.set(x, y, c)
    }
  }
  // door and window
  r.poly([54, 176, 54, 154, 58, 149, 70, 149, 74, 154, 74, 176], WOOD[3])
  r.poly([56, 176, 56, 155, 59, 151, 69, 151, 72, 155, 72, 176], WOOD[1])
  r.rect(63, 151, 2, 25, WOOD[3])
  r.rect(56, 160, 16, 2, STEEL[2])
  r.rect(56, 168, 16, 2, STEEL[2])
  r.set(60, 165, GOLD[0])
  r.set(68, 165, GOLD[0])
  r.ellipse(64, 106, 5, 6, C.inkCool)
  r.ellipse(64, 106, 4, 5, SK[2])
  r.rect(60, 105, 9, 1, WOOD[3])
  // roof cap
  part(r, (l) => {
    l.poly([34, 72, 64, 30, 94, 72], RT[1])
    l.ellipse(64, 72, 31, 6, RT[2])
  })
  for (let y = 36; y < 72; y++) {
    const half = ((y - 30) / 42) * 30
    for (let x = Math.ceil(64 - half); x < 64 + half; x++) {
      const t = (x - (64 - half)) / (half * 2)
      let c = t < 0.2 ? RT[0] : t < 0.62 ? RT[1] : t < 0.85 ? RT[2] : RT[3]
      if ((y - 36) % 6 === 5) c = RT[3]
      else if ((x + Math.floor((y - 36) / 6) * 5) % 10 === 0) c = c === RT[0] ? RT[1] : RT[3]
      r.set(x, y, c)
    }
  }
  r.ellipse(64, 73, 31, 5, RT[2])
  for (let x = 33; x < 96; x++) r.set(x, 77, x % 2 ? RT[3] : RT[2])
  r.rect(63, 24, 2, 8, GOLD[2])
  r.ellipse(64, 24, 2.4, 2.4, GOLD[1])
  r.set(63, 23, GOLD[0])
  // hub and sails
  const hx = 64
  const hy = 66
  const layer = new Raster(128, 192)
  const base = 0.38 + spin
  for (let k = 0; k < 4; k++) sail(layer, hx, hy, base + (k * Math.PI) / 2)
  outline(layer)
  r.blit(layer)
  r.ellipse(hx, hy, 7.5, 7.5, GOLD[3])
  r.ellipse(hx - 0.5, hy - 0.5, 6.5, 6.5, GOLD[1])
  r.ellipse(hx - 1.5, hy - 1.5, 3, 3, GOLD[0])
  r.set(hx + 2, hy + 2, GOLD[2])
  r.ellipse(hx, hy, 1.6, 1.6, STEEL[2])
  return r
}

// ------------------------------------------------------------------ drawbridge
//
// A drawbridge is a run of tile-sized pieces (one prop per tile) that has to read as one bridge, so every piece
// draws the variant for its place in the run: row `n` / `m` / `s` (north edge, inside, south edge) or `o` (a
// one-tile-wide bridge), and column `h` / `m` / `e` (hinge end, inside, free end). Frames are drawn hinged on the
// left; the renderer (render/drawbridges.ts) picks the variants, mirrors them for a bridge hinged on its east side
// and unrolls the deck from the hinge while it lowers. Frames are 80×80: the tile is the lower 64 rows between
// 8 px margins, so rails and the raised leaf can stand up out of their tile and the end beams rest on the banks.

type BridgeRow = 'n' | 'm' | 's' | 'o'
const BRIDGE_ROWS: BridgeRow[] = ['n', 'm', 's', 'o']
/** The tile inside a drawbridge frame: left edge and top. */
const OX = 8
const TY = 16
const northEdge = (row: BridgeRow) => row === 'n' || row === 'o'
const southEdge = (row: BridgeRow) => row === 's' || row === 'o'
/** Plank deck rows of a piece (frame y, end exclusive). */
const deckTop = (row: BridgeRow) => TY + (northEdge(row) ? 10 : 0)
const deckBot = (row: BridgeRow) => TY + (southEdge(row) ? 52 : 64)
/** The bridge's full extent including its edge beams. */
const leafTop = (row: BridgeRow) => TY + (northEdge(row) ? 4 : 0)
const leafBot = (row: BridgeRow) => TY + (southEdge(row) ? 58 : 64)

/**
 * Crosswise planks, 16 px wide, from frame x `x0` to `x1`, with butt joints and grain that repeat every tile so
 * the rows and columns of a run join up.
 */
function bridgeDeck(l: Raster, row: BridgeRow, x0: number, x1: number) {
  for (let x = x0; x < x1; x++) {
    const tx = mod(x - OX, 64)
    const px = tx % 16
    const pi = tx >> 4
    // a one-tile-wide bridge is spanned by single planks; wider decks have staggered butt joints
    const joint = row === 'o' ? -9 : [9, 41, 25, 57][pi]
    for (let y = deckTop(row); y < deckBot(row); y++) {
      const ty = y - TY
      let c = WOOD[1]
      if (px === 0) c = WOOD[0]
      else if (px === 1 && pi % 2 === 0) c = WOOD[0]
      else if (px === 14) c = WOOD[2]
      else if (px === 15) c = WOOD[3]
      else if ((px === 5 && mod(ty + pi * 17, 32) < 12) || (px === 10 && mod(ty + pi * 29, 40) < 9)) c = WOOD[2]
      if (ty === joint && px < 15) c = WOOD[3]
      else if (ty === joint + 1 && px < 15) c = WOOD[0]
      if ((px === 3 || px === 11) && (ty === joint + 3 || ty === joint - 2)) c = STEEL[1]
      l.set(x, y, c)
    }
  }
}

/** Long iron bands near the outer edges, riveted every 16 px. */
function bridgeBands(r: Raster, row: BridgeRow, x0: number, x1: number) {
  const ys: number[] = []
  if (northEdge(row)) ys.push(TY + 13)
  if (southEdge(row)) ys.push(TY + 47)
  for (const y of ys) {
    r.rect(x0, y, x1 - x0, 2, STEEL[2])
    r.rect(x0, y, x1 - x0, 1, STEEL[1])
    for (let x = x0 + 4; x < x1; x += 16) r.set(x, y, STEEL[0])
  }
}

/** A short rail post standing on an edge beam (`foot` = frame y of its foot). */
function railPost(l: Raster, x: number, foot: number, h: number) {
  post(l, x, foot - h, foot, 4)
  l.rect(x, foot - h, 4, 1, WOOD[0])
}

/** A tall hinge post on the bank (10 px wide, its right side on the tile edge). */
function hingePost(l: Raster, top: number, foot: number) {
  post(l, OX - 8, top, foot, 10)
  l.rect(OX - 8, top, 10, 2, WOOD[0])
  l.rect(OX - 8, top + 2, 10, 1, WOOD[3])
}

/** The hinge post's brass cap, winch drum and bolt. */
function hingeCap(r: Raster, top: number) {
  r.rect(OX - 7, top, 8, 1, GOLD[0])
  r.rect(OX - 7, top + 1, 8, 1, GOLD[2])
  r.ellipse(OX - 3, top + 7, 2.6, 2.6, STEEL[2])
  r.set(OX - 4, top + 6, STEEL[0])
  r.set(OX - 2, top + 8, STEEL[3])
  rivet(r, OX - 4, top + 13)
}

/** A chain from (x0, y0) to (x1, y1) with `sag` px of droop. */
function chain(r: Raster, x0: number, y0: number, x1: number, y1: number, sag: number) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)))
  for (let i = 0; i <= n; i += 2) {
    const t = i / n
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag
    r.set(x, y, (i >> 1) % 2 ? STEEL[2] : STEEL[0])
    r.set(x + 1, y, STEEL[3])
  }
}

/** The lowered deck piece; `hinge` / `free` draw the end beams of the run, resting 6 px onto the banks. */
function bridgeDown(name: string, row: BridgeRow, hinge: boolean, free: boolean) {
  const r = frame(name)
  const x0 = hinge ? OX - 6 : OX
  const x1 = free ? OX + 70 : OX + 64
  // rail posts every 32 px; the hinge post and the free end replace the outermost ones
  const posts = [12, free ? 50 : 44].filter((x) => !(hinge && x < 20)).map((x) => x + OX)
  const ends = [hinge ? OX - 3 : OX - 20, ...posts, free ? OX + 58 : OX + 76]
  part(r, (l) => {
    bridgeDeck(l, row, x0, x1)
    if (northEdge(row)) beam(l, x0, x1, TY + 4, 6)
    if (southEdge(row)) {
      beam(l, x0, x1, TY + 52, 6)
      // the deck's front face over the drop
      l.rect(x0, TY + 58, x1 - x0, 3, WOOD[3])
      for (let x = x0 + 2; x < x1; x += 8) l.set(x, TY + 59, WOOD[2])
    }
    if (hinge) {
      // the hinge beam straddles the bank's edge, its iron knuckles on the bank side
      post(l, OX - 6, leafTop(row), leafBot(row), 10)
      for (let y = TY + 6; y < leafBot(row) - 6; y += 16) {
        l.rect(OX - 6, y, 6, 6, STEEL[2])
        l.rect(OX - 6, y, 6, 1, STEEL[0])
        l.rect(OX - 6, y + 5, 6, 1, STEEL[3])
      }
    }
    if (free) {
      post(l, OX + 58, leafTop(row), leafBot(row), 12)
      l.rect(OX + 68, leafTop(row), 2, leafBot(row) - leafTop(row), STEEL[2])
      l.rect(OX + 68, leafTop(row), 1, leafBot(row) - leafTop(row), STEEL[1])
    }
    if (northEdge(row)) {
      for (const x of posts) railPost(l, x, TY + 8, 16)
      if (hinge) hingePost(l, TY - 16, TY + 12)
    }
    if (southEdge(row)) {
      for (const x of posts) railPost(l, x, TY + 56, 18)
      if (hinge) hingePost(l, TY + 32, TY + 62)
    }
  })
  // pieces join their neighbours: no outline across an inner seam
  if (!northEdge(row)) for (let x = 0; x < r.w; x++) r.set(x, TY - 1, 0)
  for (let y = 0; y < r.h; y++) {
    if (!hinge) r.set(OX - 1, y, 0)
    if (!free) r.set(OX + 64, y, 0)
  }
  bridgeBands(r, row, hinge ? OX + 4 : x0, free ? OX + 58 : x1)
  if (hinge) for (let y = TY + 6; y < leafBot(row) - 6; y += 16) rivet(r, OX - 4, y + 2)
  if (free) for (let y = leafTop(row) + 6; y < leafBot(row) - 4; y += 16) rivet(r, OX + 62, y)
  // rope rails between the posts
  for (let i = 0; i + 1 < ends.length; i++) {
    const a = ends[i] + 2
    const b = ends[i + 1] + 2
    if (northEdge(row)) rope(r, a, TY - 6, b, TY - 6, 2)
    if (southEdge(row)) rope(r, a, TY + 40, b, TY + 40, 3)
  }
  if (hinge) {
    // the lifting chains lie slack from the hinge posts to rings on the edge beams
    if (northEdge(row)) {
      hingeCap(r, TY - 16)
      chain(r, OX + 1, TY - 10, OX + 24, TY + 6, 3)
      r.ring(OX + 25, TY + 7, 1, 2.2, GOLD[2])
    }
    if (southEdge(row)) {
      hingeCap(r, TY + 32)
      chain(r, OX + 1, TY + 38, OX + 24, TY + 54, 3)
      r.ring(OX + 25, TY + 55, 1, 2.2, GOLD[2])
    }
  }
  return r
}

/**
 * The raised bridge from above: only the hinge piece shows anything, the upright leaf seen end-on (its free-end
 * beam) along the hinge with the hinge posts and taut chains; the gap stays open sky.
 */
function bridgeUp(name: string, row: BridgeRow) {
  const r = frame(name)
  const top = northEdge(row) ? TY - 12 : TY
  const bot = leafBot(row) + (southEdge(row) ? 2 : 0)
  const lx = OX - 2
  // the leaf's shadow on the clouds
  for (let y = top + 8; y < bot + 3; y++)
    for (let x = lx + 9; x < lx + 22; x++) if (bayer(x, y) < 0.7 - (x - lx - 9) * 0.05) r.set(x, y, SK[3])
  part(r, (l) => {
    post(l, lx, top, bot, 9)
    l.rect(lx, top, 9, 2, WOOD[0])
    if (southEdge(row)) l.rect(lx, bot - 3, 9, 3, WOOD[3])
    if (northEdge(row)) hingePost(l, 0, TY + 10)
    if (southEdge(row)) hingePost(l, TY + 32, TY + 62)
  })
  if (!northEdge(row)) for (let x = 0; x < r.w; x++) if (x < lx || x >= lx + 9) r.set(x, TY - 1, 0)
  // iron caps across the leaf's top edge and the plank ends between them
  for (let y = top + (northEdge(row) ? 10 : 4); y < bot - 5; y += 12) {
    r.rect(lx + 1, y, 7, 2, STEEL[2])
    r.rect(lx + 1, y, 7, 1, STEEL[1])
    r.set(lx + 4, y + 6, WOOD[3])
    r.set(lx + 4, y + 7, WOOD[3])
  }
  if (northEdge(row)) {
    hingeCap(r, 0)
    chain(r, OX + 1, 8, lx + 8, top + 2, -1)
  }
  if (southEdge(row)) {
    hingeCap(r, TY + 32)
    chain(r, OX + 1, TY + 40, lx + 8, TY + 26, 1)
  }
  if (!northEdge(row) && !southEdge(row))
    for (let y = TY + 8; y < TY + 64; y += 16) {
      r.rect(OX - 6, y, 4, 6, STEEL[2])
      r.rect(OX - 6, y, 4, 1, STEEL[0])
    }
  return r
}

/**
 * The free end of the leaf as it swings down (`k` 0 → 1): its end beam ending at the anchor (the renderer unrolls
 * the deck up to it), still lifted and throwing a shadow ahead onto the clouds that shrinks as it lands.
 */
function bridgeEdge(name: string, row: BridgeRow, k: number) {
  const r = frame(name)
  const ax = OX + 32
  const lift = Math.round(16 * (1 - k))
  const top = leafTop(row) - (northEdge(row) ? lift : 0)
  const bot = leafBot(row) - (southEdge(row) ? lift : 0)
  const reach = Math.round(4 + 24 * (1 - k))
  for (let y = leafTop(row); y < leafBot(row) + 2; y++)
    for (let x = ax + 1; x < ax + 1 + reach; x++) {
      const fade = (x - ax - 1) / reach
      if (bayer(x, y) < 0.75 - fade * 0.55) r.set(x, y, SK[3])
    }
  part(r, (l) => {
    post(l, ax - 8, top, bot, 9)
    l.rect(ax - 8, top, 9, 2, WOOD[0])
    if (southEdge(row) && lift > 0) l.rect(ax - 8, bot, 9, lift, WOOD[3])
  })
  if (!northEdge(row)) for (let x = 0; x < r.w; x++) if (x < ax - 8 || x > ax) r.set(x, TY - 1, 0)
  for (let y = top + 6; y < bot - 4; y += 16) {
    r.rect(ax - 7, y, 7, 2, STEEL[2])
    r.rect(ax - 7, y, 7, 1, STEEL[1])
  }
  return r
}

const BRIDGE_COLS = [
  ['h', true, false],
  ['m', false, false],
  ['e', false, true]
] as const

/** Every drawbridge animation: the stand-alone piece plus the variants for each place in a run. */
function drawbridgeAnims(): Sheet {
  const out: Sheet = {}
  const edgeFrames = (name: string, row: BridgeRow) => [0.1, 0.3, 0.5, 0.7, 0.9].map((k) => bridgeEdge(name, row, k))
  out.drawbridge_up = mk('drawbridge_up', [bridgeUp('drawbridge_up', 'o')])
  out.drawbridge_lowering = mk('drawbridge_lowering', edgeFrames('drawbridge_lowering', 'o'))
  out.drawbridge_down = mk('drawbridge_down', [bridgeDown('drawbridge_down', 'o', true, true)])
  for (const row of BRIDGE_ROWS) {
    if (row !== 'o') {
      out[`drawbridge_up_${row}`] = mk(`drawbridge_up_${row}`, [bridgeUp(`drawbridge_up_${row}`, row)])
      const lowering = `drawbridge_lowering_${row}`
      out[lowering] = mk(lowering, edgeFrames(lowering, row))
    }
    for (const [col, hinge, free] of BRIDGE_COLS) {
      const name = `drawbridge_down_${row}${col}`
      out[name] = mk(name, [bridgeDown(name, row, hinge, free)])
    }
  }
  return out
}

// ------------------------------------------------------------------ bells

function bellLayer(withRing: boolean) {
  // drawn around a pivot at the centre of a 96×96 layer
  void withRing
  const l = new Raster(96, 96)
  const cx = 48
  const top = 48
  const hw = (y: number) => {
    const t = y / 38
    return Math.round(4 + 8 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) + Math.max(0, t - 0.62) * 22)
  }
  l.rect(cx - 1, top - 6, 3, 6, STEEL[2])
  l.ring(cx + 0.5, top - 8, 2, 3.2, STEEL[1])
  for (let y = 0; y < 38; y++) {
    const w = hw(y)
    for (let x = cx - w; x <= cx + w; x++) {
      const t = (x - cx) / Math.max(1, w)
      let c = t < -0.55 ? GOLD[0] : t < 0.1 ? GOLD[1] : t < 0.6 ? GOLD[2] : GOLD[3]
      if (t < -0.2 && t > -0.45 && y > 4 && y < 28) c = GOLD[0]
      if (y > 30 && y < 33) c = c === GOLD[0] ? GOLD[1] : GOLD[3]
      if (y >= 33) c = t < -0.5 ? GOLD[0] : t < 0.4 ? GOLD[1] : GOLD[2]
      if (y === 37) c = GOLD[3]
      l.set(x, top + y, c)
    }
  }
  l.ellipse(cx, top + 38, hw(37) - 1, 2.6, C.inkWarm)
  l.rect(cx - 1, top + 38, 3, 4, STEEL[2])
  l.ellipse(cx, top + 43, 2.4, 2.4, STEEL[1])
  l.set(cx - 1, top + 42, STEEL[0])
  return l
}

function bell(f: number, ring: boolean) {
  const r = frame(ring ? 'bell_ring' : 'bell')
  shade(r, 32, 82, 28, 4)
  part(r, (l) => {
    // stone plinth and the oak frame
    block3(l, 6, 74, 52, 6, 8, [S[0], S[1], S[2], S[3]])
    post(l, 9, 18, 76, 6)
    post(l, 49, 18, 76, 6)
    beam(l, 4, 60, 12, 8)
    l.rect(5, 12, 54, 1, WOOD[0])
    rivet(l, 8, 14)
    rivet(l, 52, 14)
    // diagonal braces
    l.line(15, 60, 24, 21, WOOD[2])
    l.line(16, 60, 25, 21, WOOD[1])
    l.line(49, 60, 40, 21, WOOD[3])
    l.line(48, 60, 39, 21, WOOD[2])
  })
  const angle = ring ? [-0.3, 0.26, -0.19, 0.12, -0.06, 0.02][f] : 0
  const layer = bellLayer(ring)
  const out = new Raster(64, 96)
  if (ring) swing(out, layer, 48, 48, angle, 32, 26)
  else out.blit(layer, 32 - 48, 26 - 48)
  part(r, (l) => l.blit(out))
  if (ring && f < 4) {
    const k = [8, 7, 5, 3][f]
    for (const sgn of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const rad = 22 + i * 4 + f * 2
        r.ring(
          32,
          52,
          rad,
          rad + 1,
          i === 0 ? R.holy[0] : R.holy[1],
          sgn > 0 ? -0.4 : Math.PI - 0.1 + 0,
          sgn > 0 ? 0.4 : Math.PI + 0.5
        )
      }
    void k
    for (const [dx, dy] of [
      [-26, 40],
      [26, 36],
      [-24, 56],
      [25, 58]
    ])
      if ((f + dx) % 2 === 0) {
        r.set(32 + dx, dy, C.white)
        r.set(32 + dx + 1, dy, R.holy[1])
        r.set(32 + dx, dy - 1, R.holy[1])
      }
  }
  return r
}

function goldbell() {
  const r = frame('goldbell')
  shade(r, 46, 78, 42, 9)
  const cy = 52
  const x0 = 17
  const x1 = 70
  const radius = (x: number) => {
    const t = (x - x0) / (x1 - x0)
    return 7 + 14 * Math.sin(Math.min(1, t * 1.7) * Math.PI * 0.5) + Math.max(0, t - 0.7) * 26
  }
  part(r, (l) => {
    // crown loop
    l.ring(13, 41, 3, 5.5, GOLD[2])
    l.ring(13, 41, 4, 5.5, GOLD[1])
    for (let x = x0; x <= x1; x++) {
      const rr = radius(x)
      for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
        const v = (y + 0.5 - cy) / rr
        if (Math.abs(v) > 1) continue
        let c = v < -0.62 ? GOLD[0] : v < -0.1 ? GOLD[1] : v < 0.42 ? GOLD[2] : GOLD[3]
        if (v > -0.45 && v < -0.3 && x > x0 + 6 && x < x1 - 8) c = GOLD[0]
        l.set(x, y, c)
      }
    }
    // bands
    for (const bx of [28, 44, 60, 69])
      for (let y = 0; y < 64; y++)
        if (l.get(bx, y)) {
          l.set(bx, y, GOLD[3])
          l.set(bx + 1, y, l.get(bx + 1, y) === GOLD[0] ? GOLD[1] : GOLD[0])
        }
    // mouth
    l.ellipse(x1 + 1, cy, 6.5, radius(x1) + 1, GOLD[3])
    l.ellipse(x1 + 2, cy, 4.8, radius(x1) - 1.5, C.inkWarm)
    l.ellipse(x1 + 3, cy + 2, 2.8, radius(x1) - 6, C.black)
  })
  // clapper on the ground and engraved runes
  r.ellipse(84, 66, 4, 3, STEEL[2])
  r.ellipse(83, 65, 3, 2, STEEL[1])
  r.set(82, 64, STEEL[0])
  for (const bx of [36, 52]) {
    r.ring(bx, 50, 2, 3.4, GOLD[3])
    r.set(bx, 44, GOLD[3])
  }
  // rope coil
  r.ellipse(12, 68, 7, 3, D[3])
  r.ellipse(12, 67, 6, 2.4, D[1])
  r.ellipse(12, 67, 3, 1, D[3])
  return r
}

function hook(on: boolean, f: number) {
  const r = frame(on ? 'hook_on' : 'hook_off')
  shade(r, 64, 76, 56, 7)
  // floor ring of runes
  const pulse = on ? [0, 1, 2, 1][f] : 0
  r.ring(64, 73, 34, 36, on ? (pulse > 0 ? GOLD[0] : GOLD[1]) : S[3], 0, Math.PI * 2)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const x = 64 + Math.cos(a) * 30
    const y = 73 + Math.sin(a) * 9.5
    r.rect(x, y, 2, 2, on ? (i % 2 === f % 2 ? R.holy[0] : GOLD[1]) : S[2])
    if (on) r.set(x + 2, y + 2, GOLD[3])
  }
  part(r, (l) => {
    block3(l, 8, 66, 24, 5, 10, [S[0], S[1], S[2], S[3]])
    block3(l, 96, 66, 24, 5, 10, [S[0], S[1], S[2], S[3]])
    post(l, 14, 14, 68, 12)
    post(l, 102, 14, 68, 12)
    beam(l, 6, 122, 8, 10)
    l.rect(7, 8, 114, 1, WOOD[0])
    l.line(26, 52, 40, 19, WOOD[2])
    l.line(27, 52, 41, 19, WOOD[1])
    l.line(102, 52, 88, 19, WOOD[3])
    l.line(101, 52, 87, 19, WOOD[2])
    strap(l, 12, 14, 16, 3)
    strap(l, 100, 14, 16, 3)
    rivet(l, 14, 20)
    rivet(l, 112, 20)
    // hook chain
    for (let i = 0; i < 5; i++) l.rect(63, 18 + i * 4, 3, 3, i % 2 ? STEEL[2] : STEEL[0])
    l.thick(64, 40, 64, 46, 4, STEEL[1])
    l.ring(64, 51, 5, 8, STEEL[1], -0.4, Math.PI * 1.1)
    l.ring(64, 51, 5, 6.5, STEEL[0], Math.PI * 0.6, Math.PI * 1.1)
  })
  if (on) {
    const layer = new Raster(96, 96)
    const bl = bellLayer(false)
    layer.blit(bl, 0, 0)
    const sw = [0, 0.04, 0, -0.04][f]
    const tmp = new Raster(128, 96)
    swing(tmp, bl, 48, 48, sw, 64, 54)
    part(r, (l) => l.blit(tmp))
    // glow motes
    for (let i = 0; i < 6; i++) {
      const a = i * 1.7 + f * 0.8
      const x = 64 + Math.cos(a) * (20 + i * 3)
      const y = 60 - ((f * 5 + i * 9) % 40) + Math.sin(a) * 4
      r.set(x, y, R.holy[0])
      r.set(x + 1, y, R.holy[1])
    }
  }
  return r
}

// ------------------------------------------------------------------ lock door

function lockDoor(open: number, name: string) {
  const r = frame(name)
  shade(r, 32, 92, 29, 4)
  const arch = (x: number, y: number) =>
    x >= 14 && x < 50 && (y >= 44 ? y < 90 : (x - 32) ** 2 / 18 ** 2 + (y - 44) ** 2 / 16 ** 2 <= 1)
  part(r, (l) => {
    block3(l, 3, 10, 58, 8, 80, [S[0], S[1], S[2], S[3]], 8)
  })
  // opening
  for (let y = 24; y < 90; y++)
    for (let x = 12; x < 52; x++) if (arch(x, y)) r.set(x, y, y > 80 ? C.inkWarm : C.inkBlue)
  // glow of what lies behind
  for (let y = 76; y < 90; y++)
    for (let x = 14; x < 50; x++) if (arch(x, y) && bayer(x, y) < (y - 76) / 14 && open > 0) r.set(x, y, GOLD[3])
  // arch ring of voussoirs
  for (let y = 22; y < 92; y++)
    for (let x = 8; x < 56; x++) {
      if (arch(x, y)) continue
      const near =
        arch(x - 2, y) ||
        arch(x + 2, y) ||
        arch(x, y + 2) ||
        arch(x, y - 2) ||
        arch(x - 1, y - 1) ||
        arch(x + 1, y - 1) ||
        arch(x - 1, y + 1) ||
        arch(x + 1, y + 1)
      if (near && y < 90) r.set(x, y, x < 32 ? S[0] : S[1])
    }
  r.rect(29, 24, 6, 6, GOLD[1])
  r.rect(29, 24, 6, 1, GOLD[0])
  r.rect(29, 29, 6, 1, GOLD[3])
  // door leaf (hinged on the left): compressed horizontally while opening
  const leafW = Math.max(0, Math.round(36 * (1 - open)))
  if (leafW > 1) {
    for (let y = 26; y < 90; y++)
      for (let x = 14; x < 14 + leafW; x++) {
        if (!arch(Math.round(14 + ((x - 14) * 36) / leafW), y)) continue
        const u = Math.round(((x - 14) * 36) / leafW)
        let c = WOOD[1]
        const px = u % 9
        if (px === 0) c = WOOD[0]
        else if (px === 8) c = WOOD[3]
        else if (px === 7) c = WOOD[2]
        if (px > 1 && px < 7 && (y * 5 + u) % 23 === 0) c = WOOD[2]
        if (x === 14 + leafW - 1) c = WOOD[3]
        r.set(x, y, c)
      }
    // steel straps
    for (const yy of [38, 58, 76]) {
      for (let x = 14; x < 14 + leafW; x++) {
        r.set(x, yy, STEEL[0])
        r.set(x, yy + 1, STEEL[1])
        r.set(x, yy + 2, STEEL[1])
        r.set(x, yy + 3, STEEL[3])
        if ((x - 14) % 12 === 4 && leafW > 12) r.set(x, yy + 1, STEEL[0])
      }
    }
    if (leafW > 24) {
      // big brass keyhole plate
      const kx = 14 + Math.round(leafW * 0.55)
      r.ellipse(kx, 58, 9, 9, GOLD[3])
      r.ellipse(kx - 0.5, 57.5, 8, 8, GOLD[1])
      r.ellipse(kx - 2, 55, 4, 4, GOLD[0])
      r.ellipse(kx, 56, 3.4, 3.4, C.inkWarm)
      r.rect(kx - 1, 57, 3, 8, C.inkWarm)
      r.set(kx + 4, 63, GOLD[3])
    }
  }
  return r
}

// ------------------------------------------------------------------ boss door

function bossDoor(open: number) {
  const r = frame('bossdoor_closed')
  const W = 192
  shade(r, 96, 190, 88, 6)
  // facade
  part(r, (l) => {
    block3(l, 8, 20, 176, 8, 166, [S[0], S[1], S[2], S[3]], 20)
  })
  // pilasters
  for (const x0 of [8, 160]) {
    for (let y = 28; y < 184; y++)
      for (let i = 0; i < 24; i++) {
        const t = i / 24
        let c = t < 0.15 ? S[0] : t < 0.6 ? S[1] : t < 0.85 ? S[2] : S[3]
        if ((y - 28) % 12 === 11) c = S[3]
        r.set(x0 + i, y, c)
      }
    strap(r, x0 - 1, 28, 26, 4)
    strap(r, x0 - 1, 178, 26, 5)
    for (let k = 0; k < 4; k++) rivet(r, x0 + 3 + k * 6, 29)
  }
  // cornice
  strap(r, 6, 20, 180, 3)
  for (let i = 0; i < 30; i++) rivet(r, 10 + i * 6, 24)
  // clock face
  const cx = 96
  const cy = 52
  r.ellipse(cx, cy + 1, 28, 28, S[3])
  r.ellipse(cx, cy, 27, 27, GOLD[3])
  r.ellipse(cx - 0.5, cy - 0.5, 26, 26, GOLD[1])
  r.ellipse(cx, cy, 22, 22, GOLD[3])
  r.ellipse(cx, cy, 21, 21, R.paper[1])
  r.ellipse(cx - 1.5, cy - 1.5, 19, 19, R.paper[0])
  r.ellipse(cx, cy, 20.5, 20.5, R.paper[1])
  r.ellipse(cx - 1, cy - 1, 18.5, 18.5, R.paper[0])
  r.ring(cx, cy, 20.5, 22, GOLD[2])
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const r0 = k % 3 === 0 ? 14 : 16.5
    r.line(
      cx + Math.cos(a) * r0,
      cy + Math.sin(a) * r0,
      cx + Math.cos(a) * 19,
      cy + Math.sin(a) * 19,
      k % 3 === 0 ? C.inkCool : R.paper[3]
    )
  }
  r.line(cx, cy, cx - 6, cy - 10, C.inkCool)
  r.line(cx + 1, cy, cx - 5, cy - 10, C.inkCool)
  r.line(cx, cy, cx + 11, cy + 3, C.inkCool)
  r.line(cx, cy + 1, cx + 11, cy + 4, R.paper[3])
  r.ellipse(cx, cy, 2.4, 2.4, GOLD[1])
  r.set(cx - 1, cy - 1, GOLD[0])
  // brass gear ornaments flanking the dial
  for (const gx of [48, 144]) {
    const g = gearSprite(40, 20, 20, 15, 10, 0.2)
    r.blit(g, gx - 20, cy - 20)
  }
  // door opening
  const ox0 = 52
  const ox1 = 140
  const spring = 130
  const rad = 42
  const inOpening = (x: number, y: number) =>
    x >= ox0 && x < ox1 && y < 188 && (y >= spring || (x + 0.5 - 96) ** 2 + (y + 0.5 - spring) ** 2 <= rad * rad)
  // interior
  for (let y = 84; y < 188; y++)
    for (let x = ox0; x < ox1; x++) {
      if (!inOpening(x, y)) continue
      const t = (y - 84) / 104
      let c = C.black
      if (t > 0.7 && bayer(x, y) < (t - 0.7) * 2.2) c = C.inkBlue
      if (t > 0.9 && bayer(x, y) < (t - 0.9) * 6) c = R.stone[3]
      r.set(x, y, c)
    }
  // stair hint inside
  if (open > 0.4)
    for (let k = 0; k < 4; k++) r.rect(60 + k * 2, 178 - k * 3, 72 - k * 4, 2, k % 2 ? R.stone[3] : R.stone[2])
  // doors
  const leaf = (x0: number, dir: 1 | -1) => {
    const W0 = 44
    const w = Math.max(1, Math.round(W0 * (1 - open * 0.92)))
    for (let y = 84; y < 188; y++)
      for (let k = 0; k < w; k++) {
        const x = dir === 1 ? x0 + k : x0 + W0 - 1 - k
        const u = Math.round((k * W0) / w)
        const sx = dir === 1 ? x0 + u : x0 + W0 - 1 - u
        if (!inOpening(sx, y) && !(inOpening(x, y) && open > 0)) continue
        if (!inOpening(x, y)) continue
        let c = WOOD[1]
        const px = u % 11
        if (px === 0) c = WOOD[0]
        else if (px === 10) c = WOOD[3]
        else if (px === 9) c = WOOD[2]
        if (px > 1 && px < 9 && (y * 3 + u * 2) % 29 === 0) c = WOOD[2]
        // iron straps
        for (const sy of [88, 120, 152, 176]) {
          if (y >= sy && y < sy + 6) c = y === sy ? STEEL[0] : y < sy + 4 ? STEEL[1] : STEEL[3]
          if (y >= sy && y < sy + 6 && u % 14 === 5 && y === sy + 2) c = GOLD[0]
        }
        if (k === w - 1) c = WOOD[3]
        r.set(x, y, c)
      }
  }
  leaf(ox0, 1)
  leaf(96, -1)
  // ring handles
  if (open < 0.3) {
    for (const hx of [90, 102]) {
      r.ring(hx, 140, 3.6, 5.2, GOLD[2])
      r.ring(hx, 140, 3.8, 4.6, GOLD[0], Math.PI * 0.9, Math.PI * 1.6)
      r.ellipse(hx, 134, 2.4, 2, GOLD[1])
    }
    r.rect(95, 90, 2, 96, WOOD[3])
  }
  // arch ring (voussoirs) and keystone
  for (let y = 76; y < 190; y++)
    for (let x = 42; x < 150; x++) {
      if (inOpening(x, y)) continue
      let near = false
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, 1],
        [0, -1],
        [-3, 0],
        [3, 0],
        [0, -3],
        [-2, -2],
        [2, -2],
        [-4, 0],
        [4, 0],
        [0, -5],
        [-3, -3],
        [3, -3]
      ])
        if (inOpening(x + dx, y + dy)) {
          near = true
          break
        }
      if (!near) continue
      const a = Math.atan2(y - spring, x - 96)
      const k = Math.floor(((a + Math.PI) / Math.PI) * 11)
      let c = k % 2 ? S[0] : S[1]
      if (x < 96 && k % 2 === 0) c = S[1]
      if (inOpening(x, y - 1) || inOpening(x - 1, y) || inOpening(x + 1, y)) c = S[3]
      r.set(x, y, c)
    }
  r.poly([88, 82, 104, 82, 102, 96, 90, 96], GOLD[1])
  r.rect(88, 82, 16, 1, GOLD[0])
  r.rect(90, 95, 12, 1, GOLD[3])
  r.set(96, 89, GOLD[0])
  r.set(95, 89, GOLD[0])
  // plinth
  for (let x = 6; x < 186; x++) {
    r.set(x, 186, S[0])
    r.set(x, 187, S[1])
    r.set(x, 188, S[2])
    r.set(x, 189, S[3])
  }
  r.rect(46, 186, 100, 4, S[2])
  r.rect(46, 186, 100, 1, S[0])
  void W
  return r
}

// ------------------------------------------------------------------ gear

function gear(f: number) {
  const r = frame('gear')
  const phase = (f / 4) * ((Math.PI * 2) / 10)
  const sh = gearSprite(64, 32, 32, 25, 10, phase)
  const dark = new Raster(64, 64)
  dark.blit(
    sh.map(() => RK[3]),
    2,
    3
  )
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (dark.get(x, y) && bayer(x, y) < 0.5) dark.set(x, y, 0)
  r.blit(dark)
  const g = gearSprite(64, 32, 32, 25, 10, phase)
  part(r, (l) => l.blit(g))
  return r
}

// ------------------------------------------------------------------ flag

function flag(f: number) {
  const r = frame('flag')
  shade(r, 32, 90, 17, 4)
  part(r, (l) => {
    block3(l, 18, 80, 28, 6, 8, [S[0], S[1], S[2], S[3]])
    post(l, 30, 12, 82, 4)
  })
  r.ellipse(32, 11, 3, 3, GOLD[1])
  r.set(31, 10, GOLD[0])
  r.set(33, 12, GOLD[3])
  const wave = (x: number) => Math.sin(x * 0.3 - f * (Math.PI / 2)) * 3.2 * Math.min(1, x / 12)
  const pen = new Raster(64, 96)
  const len = 38
  for (let x = 0; x < len; x++) {
    const hh = 12 - x * 0.3
    const top = 16 + wave(x) - hh
    const bot = 16 + wave(x) + hh
    const slope = wave(x + 1) - wave(x)
    for (let y = Math.round(top); y <= Math.round(bot); y++) {
      let c = R.clothCrimson[1]
      if (slope < -0.5) c = R.clothCrimson[0]
      else if (slope > 0.5) c = R.clothCrimson[2]
      if (y <= top + 1) c = c === R.clothCrimson[2] ? R.clothCrimson[1] : R.clothCrimson[0]
      if (y >= bot - 1) c = R.clothCrimson[2]
      // swallowtail notch
      if (x > len - 8 && Math.abs(y - (16 + wave(x))) < (x - (len - 8)) * 0.8) continue
      pen.set(33 + x, y, c)
    }
  }
  // emblem: a gold gear
  const ey = 16 + wave(8)
  pen.ellipse(41, ey, 3.2, 3.2, GOLD[1])
  pen.ellipse(41, ey, 1.4, 1.4, R.clothCrimson[2])
  pen.set(40, ey - 2, GOLD[0])
  part(r, (l) => l.blit(pen))
  return r
}

// ------------------------------------------------------------------ cloud

function cloud(f: number) {
  const r = frame('cloud')
  const j = f ? 2 : 0
  const lumps: [number, number, number, number, number][] = [
    [58 + j, 54, 34, 22, 20],
    [98 - j, 46, 40, 30, 26],
    [138 + j, 54, 34, 22, 19],
    [30, 62 - f, 22, 14, 12],
    [166, 62 + f, 22, 14, 12],
    [98, 64, 62, 16, 12 + f]
  ]
  solid(r, lumps, [R.paper[0], SK[0], SK[1], SK[2]], 4, 31 + f * 7)
  // a few soft wisps trailing off the bottom edge
  for (let x = 20; x < 172; x++) {
    const v = vn1(x + f * 3, 16, 77)
    if (v > 0.74 && !r.get(x, 78 + (x % 2))) r.set(x, 78 + (x % 2), SK[1])
  }
  return r
}

export const propsB = (): Sheet => ({
  vent: mk('vent', [0, 1, 2, 3].map(vent)),
  windmill: mk('windmill', [windmill(0)]),
  windmill_spin: mk(
    'windmill_spin',
    [0, 1, 2, 3, 4, 5].map((k) => windmill((k * Math.PI) / 2 / 6))
  ),
  ...drawbridgeAnims(),
  bell: mk('bell', [bell(0, false)]),
  bell_ring: mk(
    'bell_ring',
    [0, 1, 2, 3, 4, 5].map((f) => bell(f, true))
  ),
  goldbell: mk('goldbell', [goldbell()]),
  hook_off: mk('hook_off', [hook(false, 0)]),
  hook_on: mk(
    'hook_on',
    [0, 1, 2, 3].map((f) => hook(true, f))
  ),
  lockdoor_closed: mk('lockdoor_closed', [lockDoor(0, 'lockdoor_closed')]),
  lockdoor_opening: mk(
    'lockdoor_opening',
    [0.2, 0.4, 0.6, 0.8, 0.95].map((o) => lockDoor(o, 'lockdoor_opening'))
  ),
  lockdoor_open: mk('lockdoor_open', [lockDoor(1, 'lockdoor_open')]),
  gear: mk('gear', [0, 1, 2, 3].map(gear)),
  flag: mk('flag', [0, 1, 2, 3].map(flag)),
  cloud: mk('cloud', [cloud(0), cloud(1)]),
  bossdoor_closed: mk('bossdoor_closed', [bossDoor(0)]),
  bossdoor_opening: mk('bossdoor_opening', [0.12, 0.3, 0.5, 0.7, 0.85, 0.95].map(bossDoor)),
  bossdoor_open: mk('bossdoor_open', [bossDoor(1)])
})

export { ball, RT }
