/**
 * 猫使いの魔女ミルダ: a stylish witch on a broom, drawn natively at 128×128 with the guild rig's 3D-lite projection.
 * The sprite is drawn near the ground; hovering animations carry a per-frame `lift` that the renderer applies.
 * Tall crooked hat with cat ears, dark violet dress with gold trim, long silver hair, a cat-headed staff.
 */
import { BOSS_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, despeckle, hash, rng, shadeEdges, type Ramp } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { Cam, Painter, V, aimDir, bar, ik, vadd, vscale, type Pt, type View, type V3 } from './rig'

const VIO: Ramp = [R.shadow[1], R.shadow[2], R.shadow[3], R.shadow[3], R.shadow[4]]
const GOLD = R.gold
const HAIR = R.hairSilver
const SKIN = R.skinLight

interface MP {
  lean: number
  bob: number
  head: V3
  hatBend: number
  hatDrop: number
  mainHand: V3
  offHand: V3
  staff: { p: number; y?: number }
  glow: number
  flow: number
  sparks: number
  sigil: number
  sit: boolean
  broomBroken: boolean
  tilt: number
  at: V3
  face: 'smug' | 'cast' | 'hurt' | 'dizzy' | 'closed'
  fade: number
  lieStaff: boolean
}

const mp = (p: Partial<MP> = {}): MP => ({
  lean: 0,
  bob: 0,
  head: V(),
  hatBend: 6,
  hatDrop: 0,
  mainHand: V(7, 5, -5),
  offHand: V(2, -5, -9),
  staff: { p: 20 },
  glow: 0.25,
  flow: 0,
  sparks: 0,
  sigil: 0,
  sit: false,
  broomBroken: false,
  tilt: 0,
  at: V(),
  face: 'smug',
  fade: 0,
  lieStaff: false,
  ...p
})

function renderMilda(view: View, m: MP): Raster {
  const cam = new Cam(view, 64, 116, m.tilt, m.at)
  const paint = new Painter(128, 128)
  const side = view === 'side'
  const seatU = m.sit ? 6 : 29
  const seat = V(-3, 0, seatU + m.bob)
  const shU = seatU + m.bob + 21
  const shoulder = V(m.lean - 2, 0, shU)
  const headC = vadd(V(m.lean - 1, 0, shU + 11), m.head)
  const [hipX, hipY] = cam.px(seat)
  const [shX, shY] = cam.px(shoulder)
  const [hX, hY] = cam.px(headC)
  const hcx = Math.round(hX)
  const hcy = Math.round(hY)
  const f = m.flow
  const flowX = (t: number) => (side ? -f * t * 2.4 : f * t * 1.4)

  // ---- broom
  paint.add(-2, (l) => {
    const u0 = m.sit ? 3 : 25 + m.bob * 0.5
    const stickEnd = m.broomBroken ? 6 : 30
    const bp = (k: number, u: number) =>
      side ? V(k, 0, u) : view === 'down' ? V(0.55 * k, -0.83 * k, u) : V(0.55 * k, 0.83 * k, u)
    const tail = m.broomBroken ? bp(-6, u0) : bp(-30, u0 - 1)
    const head = bp(stickEnd, u0 + (m.sit ? 0 : 2.5))
    const a = cam.px(tail)
    const b = cam.px(head)
    if (!m.broomBroken) {
      bar(l, a, b, 4, R.wood[1])
      shadeEdges(l, R.wood, 1, true)
      // straw bristles at the tail: a fanned bundle
      const t1 = cam.px(bp(-27, u0 - 1))
      const fan = [-8, -5, -2, 1, 4, 7]
      const t2 = fan.map((k) => cam.px(bp(-46, u0 - 1 + k * 0.9)))
      l.poly([t1[0], t1[1] - 3, ...t2.flatMap((p) => p), t1[0], t1[1] + 3], R.hay[1])
      shadeEdges(l, R.hay, 1, true)
      for (let i = 0; i < 6; i++) {
        const p = t2[i]
        l.line(t1[0] + 2, t1[1], p[0], p[1], R.hay[i % 2 ? 2 : 0])
      }
      // binding
      const bx = Math.round(t1[0])
      const by = Math.round(t1[1])
      l.rect(bx - 1, by - 3, 3, 6, R.leather[2])
      l.rect(bx - 1, by - 3, 3, 1, R.leather[1])
    } else {
      // snapped: a short stump here, the rest lies on the floor
      bar(l, a, b, 4, R.wood[1])
      shadeEdges(l, R.wood, 1, true)
      l.rect(Math.round(b[0]), Math.round(b[1]) - 2, 3, 5, R.wood[3])
    }
  })
  if (m.broomBroken) {
    paint.add(-3, (l) => {
      // the broken-off head with the bristles, and a splinter, lying on the floor
      const cx = 94
      const cy = 112
      bar(l, [cx - 18, cy - 3], [cx + 4, cy + 1], 4, R.wood[1])
      l.poly([cx + 3, cy - 5, cx + 17, cy - 8, cx + 19, cy + 4, cx + 3, cy + 4], R.hay[1])
      for (let i = 0; i < 5; i++) l.line(cx + 4, cy - 3 + i, cx + 18, cy - 6 + i * 2, R.hay[i % 2 ? 2 : 0])
      l.rect(cx + 2, cy - 5, 3, 9, R.leather[2])
      l.rect(cx - 30, cy + 4, 8, 2, R.wood[2])
      shadeEdges(l, R.hay, 1, true)
    })
  }

  // ---- legs: boots dangling below the broom (or out along the floor when seated)
  for (const sgn of [1, -1] as const) {
    const near = side && sgn > 0
    const hip = vadd(seat, V(0, sgn * 4, 0))
    const foot = m.sit
      ? V(side ? 14 + (near ? 2 : -1) : 4, sgn * (side ? 4 : 12), 1.5)
      : V(side ? 5 + (near ? 1 : -2) : sgn * 0.4, sgn * (side ? 4 : 8), 9 - (sgn > 0 ? 0 : 1) + m.bob * 0.4)
    const { mid, end } = ik(hip, foot, 12, 12, V(1, 0, 0.1))
    const a = cam.px(hip)
    const mm = cam.px(mid)
    const e = cam.px(end)
    const ramp: Ramp = side && !near ? [VIO[1], VIO[2], VIO[3], VIO[3], VIO[4]] : VIO
    paint.add(side ? (near ? 3 : -3) : -1, (l) => {
      bar(l, a, mm, 7, ramp[1])
      bar(l, mm, e, 6, ramp[1])
      shadeEdges(l, ramp, 1, true)
      const bx = Math.round(e[0])
      const by = Math.round(e[1])
      // pointy witch boot with a gold cuff
      l.rect(bx - 3, by - 5, 6, 5, R.clothBlack[1])
      l.rect(bx - 3, by - 5, 6, 1, GOLD[1])
      if (side) l.poly([bx + 3, by - 3, bx + 9, by, bx + 3, by], R.clothBlack[1])
      else l.rect(bx - 4, by - 1, 8, 3, R.clothBlack[1])
      shadeEdges(l, R.clothBlack, 1, true)
      l.paint(bx - 3, by - 5, GOLD[0])
    })
  }

  // ---- dress skirt
  paint.add(0.1, (l) => {
    const top = Math.round(hipY) - 7
    const hem = Math.round(hipY) + (m.sit ? 9 : 17)
    for (let y = top; y < hem; y++) {
      const t = (y - top) / (hem - top)
      const hw = (side ? 7 : 9) + t * (side ? 6 : 8) + Math.sin(t * 5 + f) * 0.6
      const c0 = hipX + flowX(t * t)
      for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++) {
        if (y >= hem - 2 && (x + y) % 5 === 0) continue
        l.set(x, y, VIO[1])
      }
    }
    shadeEdges(l, VIO, 2, true)
    // gold hem trim and a diagonal fold highlight
    for (let x = hipX - 18; x < hipX + 18; x++) if (l.get(x, hem - 3) && l.get(x, hem - 2)) l.set(x, hem - 3, GOLD[1])
    for (let y = top + 3; y < hem - 4; y++)
      l.paint(Math.round(hipX - 3 + (y - top) * 0.15 + flowX(((y - top) / (hem - top)) ** 2)), y, VIO[0])
    if (!side && view === 'down') for (let y = top + 5; y < hem - 4; y += 2) l.paint(Math.round(hipX + 2), y, GOLD[2])
  })

  // ---- long silver hair behind the body
  paint.add(0.2, (l) => {
    if (view === 'up') return
    const topY = hcy - 4
    const botY = Math.round(shY) + 20
    for (let y = topY; y < botY; y++) {
      const t = (y - topY) / (botY - topY)
      if (side) {
        const c = hcx - 6 + flowX(t) - t * 5
        for (let x = Math.round(c - 5 - t * 2); x < Math.round(c + 4); x++) l.set(x, y, HAIR[1])
      } else {
        for (const s of [-1, 1]) {
          const c = hcx + s * (10.2 + t * 1.2) + flowX(t) * s * 0.6
          const w = 3.2 - t * 1.6
          for (let x = Math.round(c - w); x < Math.round(c + w); x++) l.set(x, y, HAIR[1])
        }
      }
    }
    shadeEdges(l, HAIR, 1, true)
    for (let y = topY + 6; y < botY - 2; y += 4)
      l.paint(side ? hcx - 8 - Math.round(flowX((y - topY) / (botY - topY))) : hcx - 12, y, HAIR[2])
  })

  // ---- bodice
  paint.add(0.3, (l) => {
    const top = Math.round(shY) - 2
    const bot = Math.round(hipY) - 5
    for (let y = top; y < bot; y++) {
      const t = (y - top) / (bot - top)
      const hw = side ? 6.5 - t * 1.6 : 9.5 - t * 3.2
      const c0 = shX + (hipX - shX) * t
      for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++)
        if (!(y <= top + 1 && Math.abs(x + 0.5 - c0) > hw - 1.6)) l.set(x, y, VIO[1])
    }
    shadeEdges(l, VIO, 2, true)
    if (view === 'down') {
      // gold bodice trim, a V neckline and a crescent brooch
      for (let y = top + 2; y < bot - 1; y++) {
        l.paint(shX - 1, y, GOLD[1])
        l.paint(shX, y, GOLD[2])
      }
      l.rect(shX - 2, top, 4, 3, SKIN[1])
      l.set(shX - 1, top + 3, SKIN[2])
      l.ellipse(shX + 4, top + 5, 2, 2, GOLD[1])
      l.set(shX + 4, top + 4, GOLD[0])
      l.rect(Math.round(hipX) - 8, bot - 2, 16, 2, GOLD[1])
    } else if (view === 'up') {
      for (let y = top + 2; y < bot; y += 2) l.paint(shX, y, GOLD[2])
      l.rect(Math.round(hipX) - 6, bot - 2, 12, 2, GOLD[1])
    } else {
      l.rect(Math.round(hipX) - 5, bot - 2, 10, 2, GOLD[1])
      for (let y = top + 3; y < bot - 3; y += 3) l.paint(Math.round(shX + 3), y, GOLD[2])
    }
  })

  // ---- arms (bell sleeves) and the staff
  const hands: V3[] = []
  for (const sgn of [1, -1] as const) {
    const isMain = sgn === 1
    const off = isMain ? m.mainHand : m.offHand
    const sh = V(m.lean - 2, sgn * (side ? 5 : 10), shU - 3)
    const { mid, end } = ik(sh, vadd(sh, V(off.f, sgn * off.r, off.u)), 12, 13, V(-0.3, sgn * 0.8, -0.7))
    hands[sgn] = end
    const far = side && sgn < 0
    const ramp: Ramp = far ? [VIO[1], VIO[2], VIO[3], VIO[3], VIO[4]] : VIO
    const a = cam.px(sh)
    const mm = cam.px(mid)
    const e = cam.px(end)
    const handFront = view === 'down' ? end.f > 4 : view === 'up' ? -end.f > 4 : false
    const depth = side ? (sgn > 0 ? 4 : -2.5) : handFront ? 0.9 : 0.45
    paint.add(depth, (l) => {
      bar(l, a, mm, 6, ramp[1])
      bar(l, mm, e, 7, ramp[1])
      shadeEdges(l, ramp, 1, true)
      // wide gold-trimmed cuff
      const ex = Math.round(e[0])
      const ey = Math.round(e[1])
      l.ellipse(ex, ey, 4.4, 3.8, ramp[2])
      l.ellipse(ex, ey, 3.4, 2.8, ramp[1])
      for (let a2 = 0; a2 < 9; a2++) l.paint(ex - 4 + a2, ey + 3, GOLD[1])
    })
    paint.add(depth + 0.005, (l) => {
      const ex = Math.round(e[0])
      const ey = Math.round(e[1])
      l.rect(ex - 1, ey - 1, 3, 3, far ? SKIN[2] : SKIN[1])
      l.set(ex - 1, ey - 1, SKIN[0])
    })
  }

  // staff in the main hand: a cat-headed rod
  {
    const hand = hands[1]
    const d = aimDir(m.staff)
    const depth = (side ? 4 : view === 'down' && hand.f > 4 ? 0.9 : 0.45) + 0.003
    const a = cam.px(vadd(hand, vscale(d, -12)))
    const b = cam.px(vadd(hand, vscale(d, 30)))
    const top = cam.px(vadd(hand, vscale(d, 36)))
    paint.add(m.lieStaff ? -2.5 : depth, (l) => {
      if (m.lieStaff) {
        bar(l, [30, 111], [76, 113], 3, R.wood[2])
        return
      }
      bar(l, a, b, 3, R.clothBlack[2])
      shadeEdges(l, R.clothBlack, 1, true)
      for (let k = -4; k <= 12; k += 8) {
        const p = cam.px(vadd(hand, vscale(d, k)))
        l.rect(Math.round(p[0]) - 2, Math.round(p[1]) - 1, 4, 2, GOLD[2])
      }
      // golden cat head with pointed ears and glowing eyes
      const tx = Math.round(top[0])
      const ty = Math.round(top[1])
      l.poly([tx - 6, ty - 2, tx - 5, ty - 10, tx - 1, ty - 5], GOLD[1])
      l.poly([tx + 6, ty - 2, tx + 5, ty - 10, tx + 1, ty - 5], GOLD[1])
      l.ellipse(tx, ty, 6.2, 5.4, GOLD[1])
      l.ellipse(tx - 1, ty - 1, 4, 3.2, GOLD[0])
      shadeEdges(l, GOLD, 1, false)
      const eye = m.glow > 0.6 ? R.jobRed[0] : R.magic[1]
      l.rect(tx - 4, ty - 1, 2, 2, eye)
      l.rect(tx + 2, ty - 1, 2, 2, eye)
      l.set(tx, ty + 2, R.jobRed[1])
    })
    // glow halo and hex sparks
    if (m.glow > 0.3 || m.sparks > 0) {
      paint.add(
        depth + 0.6,
        (l) => {
          const tx = Math.round(top[0])
          const ty = Math.round(top[1])
          const rn = rng(hash(Math.round(tx), Math.round(ty), Math.round(m.sparks * 10)))
          if (m.glow > 0.5) {
            l.ring(tx, ty, 8 + m.glow * 2, 9 + m.glow * 2, R.shadow[0])
          }
          const n = Math.round(m.sparks * 14)
          for (let i = 0; i < n; i++) {
            const ang = rn() * Math.PI * 2
            const r = 8 + rn() * 18 * m.sparks
            const sx = tx + Math.cos(ang) * r
            const sy = ty + Math.sin(ang) * r * 0.8
            const c = [R.jobRed[0], R.shadow[0], C.white, R.jobRed[1]][i % 4]
            l.set(sx, sy, c)
            if (i % 3 === 0) {
              l.set(sx + 1, sy, c)
              l.set(sx, sy + 1, c)
              l.set(sx - 1, sy, c)
              l.set(sx, sy - 1, c)
            }
          }
        },
        false
      )
    }
  }

  // ---- head: pale face, sly amber eyes
  paint.add(0.5, (l) => {
    const rx = side ? 9.4 : 10.2
    for (let y = hcy - 12; y <= hcy + 12; y++)
      for (let x = hcx - 13; x <= hcx + 13; x++) {
        const dx = x + 0.5 - hcx
        const dy = y + 0.5 - hcy
        const skull = (dx / rx) ** 2 + (dy / 9.6) ** 2 <= 1
        const jaw = dy > 2 && dy < 11 && Math.abs(dx - (side ? 1.5 : 0)) < 7.4 - (dy - 2) * 0.78
        if (skull || jaw) l.set(x, y, SKIN[1])
      }
    shadeEdges(l, SKIN, 1, false)
    if (view === 'down') {
      for (const s of [-1, 1]) {
        const ex = hcx + s * 4.6
        const ey = hcy + 1
        if (m.face === 'closed' || m.face === 'hurt') {
          l.rect(ex - 2, ey + 1, 4, 1, R.clothBlack[1])
        } else if (m.face === 'dizzy') {
          l.ring(ex, ey + 1, 1.4, 3.2, R.beak[1])
          l.set(ex, ey + 1, C.black)
        } else {
          l.rect(ex - 2, ey - 1, 5, 4, R.paper[1])
          l.rect(ex - 1, ey, 3, 3, R.beak[1])
          l.rect(ex, ey, 1, 3, C.black)
          l.set(ex - 1, ey, R.beak[0])
          // upper lid slants for a smug look
          l.rect(ex - 3, ey - 2, 6, 1, R.clothBlack[1])
          l.set(ex + (s < 0 ? -3 : 3), ey - 3, R.clothBlack[1])
          l.set(ex + (s < 0 ? -4 : 4), ey - 4, R.clothBlack[1])
        }
      }
      l.set(hcx, hcy + 5, SKIN[2])
      l.rect(hcx - 2, hcy + 8, 5, 1, R.jobRed[2])
      l.set(hcx + 3, hcy + 7, R.jobRed[2])
      if (m.face === 'cast') l.rect(hcx - 2, hcy + 8, 5, 2, R.jobRed[3])
    } else if (side) {
      const ex = hcx + 5
      if (m.face === 'closed' || m.face === 'hurt') l.rect(ex - 1, hcy + 2, 4, 1, R.clothBlack[1])
      else {
        l.rect(ex - 1, hcy, 4, 3, R.paper[1])
        l.rect(ex, hcy, 2, 3, R.beak[1])
        l.set(ex + 1, hcy + 1, C.black)
        l.rect(ex - 2, hcy - 2, 6, 1, R.clothBlack[1])
        l.set(ex + 4, hcy - 3, R.clothBlack[1])
      }
      l.set(hcx + 10, hcy + 4, SKIN[1])
      l.set(hcx + 10, hcy + 5, SKIN[2])
      l.rect(hcx + 5, hcy + 8, 4, 1, R.jobRed[2])
    }
  })
  // hair fringe and top
  paint.add(0.52, (l) => {
    for (let y = hcy - 13; y <= hcy + 14; y++)
      for (let x = hcx - 14; x <= hcx + 14; x++) {
        const dx = x + 0.5 - hcx
        const dy = y + 0.5 - hcy
        const big = (dx / 11.4) ** 2 + ((dy + 1) / 11) ** 2 <= 1
        if (view === 'up') {
          if (big && dy < 11) l.set(x, y, HAIR[1])
        } else if (view === 'down') {
          const fr = -4.2 + (((x * 5) % 7) / 7) * 3.4 + (Math.abs(dx) < 2 ? -1 : 0)
          if (big && (dy < fr || (Math.abs(dx) > 8 && dy < 6))) l.set(x, y, HAIR[1])
        } else if (big && dx < 0.5 && dy < 8) l.set(x, y, HAIR[1])
        else if (big && dy < -4 + Math.max(0, dx - 2) * 0.4) l.set(x, y, HAIR[1])
        else if (big && dx >= 0.5 && dx < 8 && dy < -2.4) l.set(x, y, HAIR[1])
      }
    shadeEdges(l, HAIR, 1, true)
    l.paint(hcx - 5, hcy - 8, HAIR[0])
    l.paint(hcx - 4, hcy - 9, HAIR[0])
  })

  // long hair seen from behind: a silver curtain down the back
  if (view === 'up')
    paint.add(0.55, (l) => {
      const topY = hcy + 2
      const botY = Math.round(shY) + 24
      for (let y = topY; y < botY; y++) {
        const t = (y - topY) / (botY - topY)
        const hw = 10.5 - t * t * 4.5 - t * 1.5
        const c0 = hcx + flowX(t) * 0.5
        for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++)
          if (!(y > botY - 3 && (x + y) % 3 === 0)) l.set(x, y, HAIR[1])
      }
      shadeEdges(l, HAIR, 1, true)
      for (let y = topY + 2; y < botY - 2; y += 3) {
        l.paint(hcx - 3, y, HAIR[2])
        l.paint(hcx + 3, y + 1, HAIR[2])
      }
    })

  // ---- crooked witch hat with cat ears
  paint.add(0.6, (l) => {
    const baseY = hcy - 8 + m.hatDrop
    const height = 33
    const bend = m.hatBend + f * 0.8
    const tipX = hcx + (side ? -2 : 0)
    for (let y = baseY; y > baseY - height; y--) {
      const t = (baseY - y) / height
      const hw = Math.max(4.4, 11.2 * (1 - t) ** 0.85)
      const c0 = tipX + bend * t ** 1.6 + Math.sin(t * 5) * 0.8
      for (let x = Math.round(c0 - hw); x < Math.round(c0 + hw); x++) l.set(x, y, VIO[1])
    }
    // cat ears at the crooked tip
    const ty = baseY - height
    const tx = Math.round(tipX + bend)
    l.poly([tx - 6, ty + 5, tx - 7, ty - 7, tx - 1, ty + 1], VIO[1])
    l.poly([tx + 6, ty + 5, tx + 7, ty - 7, tx + 1, ty + 1], VIO[1])
    shadeEdges(l, VIO, 1, true)
    // inner ear glints
    l.rect(tx - 5, ty - 3, 1, 5, R.jobRed[2])
    l.rect(tx + 4, ty - 3, 1, 5, R.jobRed[2])
    // gold band with a cat-head buckle
    const by = baseY - 4
    for (let y = by; y < by + 3; y++)
      for (let x = hcx - 14; x < hcx + 14; x++) if (l.get(x, y) && l.get(x, y - 2)) l.set(x, y, GOLD[1])
    if (view !== 'up') {
      l.rect(hcx - 2, by - 1, 5, 5, GOLD[1])
      l.set(hcx - 2, by - 3, GOLD[1])
      l.set(hcx + 2, by - 3, GOLD[1])
      l.set(hcx - 1, by + 1, VIO[3])
      l.set(hcx + 1, by + 1, VIO[3])
    }
  })
  paint.add(0.61, (l) => {
    const cy = hcy - 8 + m.hatDrop
    const rx = side ? 17 : 20
    l.ellipse(hcx - (side ? 1 : 0), cy + 1, rx, 4.8, VIO[1])
    shadeEdges(l, VIO, 1, true)
    for (let x = hcx - 21; x < hcx + 21; x++) if (l.get(x, cy - 3) && !l.get(x, cy + 6)) l.paint(x, cy + 5, VIO[3])
    for (let x = hcx - rx + 2; x < hcx + rx - 2; x += 3) l.paint(x, cy + 5, GOLD[2])
  })

  return despeckle(paint.render())
}

// ---------------------------------------------------------------------------------------------------------
// Animations

type Maker = (i: number) => MP
const HOVER = { lean: 1, mainHand: V(8, 5, -4), offHand: V(3, -5, -9) }

const MOVES: Record<string, Maker> = {
  idle: (i) =>
    mp({
      ...HOVER,
      bob: [0, 1, 1.5, 0.5][i],
      flow: [0, 1, 2, 1][i],
      hatBend: 6 + [0, 1, 2, 1][i],
      staff: { p: 18 + i },
      glow: [0.3, 0.45, 0.6, 0.45][i]
    }),
  cast: (i) =>
    mp({
      lean: [-3, -1, 4, 3][i],
      bob: [1, 1, 0, 0.5][i],
      mainHand: [V(1, 6, 4), V(3, 6, 6), V(11, 3, 0), V(10, 4, -2)][i],
      staff: { p: [-25, 5, 82, 70][i] },
      offHand: V(4, -6, [-4, -2, -8, -8][i]),
      glow: [0.7, 0.9, 1, 0.8][i],
      sparks: [0.2, 0.4, 1, 0.8][i],
      flow: [2, 0, -2, -1][i],
      face: i > 1 ? 'cast' : 'smug',
      hatBend: [8, 9, 4, 5][i]
    }),
  summon: (i) =>
    mp({
      lean: [-1, -3, -3, -2][i],
      bob: [1, 2, 3, 2][i],
      mainHand: V(2, 6, [9, 12, 14, 12][i]),
      offHand: V(2, -6, [9, 12, 14, 12][i]),
      staff: { p: [10, 5, 0, 5][i] },
      glow: [0.6, 0.9, 1, 0.9][i],
      sigil: [0.35, 0.7, 1, 0.8][i],
      sparks: [0.2, 0.5, 0.8, 0.5][i],
      flow: [1, 2, 3, 2][i],
      face: 'cast',
      hatBend: [7, 8, 9, 8][i]
    }),
  hurt: (i) =>
    mp({
      lean: [-5, -3][i],
      bob: [-1, 0][i],
      head: V(-3, 0, -1),
      mainHand: V(0, 7, -7),
      offHand: V(0, -7, -7),
      staff: { p: 100 },
      glow: 0,
      flow: [4, 2][i],
      face: 'hurt',
      hatBend: [10, 8][i],
      tilt: [6, 3][i]
    }),
  broken: (i) =>
    mp({
      sit: true,
      broomBroken: true,
      lean: [3, 5, 3, 1][i],
      head: V([1, 0, -1, 0][i], [-3, 0, 3, 0][i], [-2, -3, -2, -1][i]),
      hatBend: 12,
      hatDrop: 2 + [0, 1, 0, 1][i],
      mainHand: V(5, 8, -14),
      offHand: V(5, -8, -14),
      lieStaff: true,
      glow: 0,
      flow: [1, 0, -1, 0][i],
      face: 'dizzy',
      tilt: [-3, 0, 3, 0][i]
    }),
  death: (i) =>
    mp({
      sit: i >= 2,
      broomBroken: i >= 2,
      lean: [-6, -4, 2, 3, 3, 3, 3, 3][i],
      tilt: [8, 18, 0, 0, 0, 0, 0, 0][i],
      at: V([0, -4, 0, 0, 0, 0, 0, 0][i], 0, [14, 6, 0, 0, 0, 0, 0, 0][i]),
      hatBend: 12,
      hatDrop: i >= 2 ? 6 : 2,
      head: V(0, 0, -2),
      mainHand: V(4, 8, -13),
      offHand: V(4, -8, -13),
      lieStaff: i >= 2,
      staff: { p: 120 },
      glow: 0,
      face: 'closed',
      fade: [0, 0, 0.1, 0.3, 0.5, 0.7, 0.88, 1][i]
    })
}

const HOVER_LIFT: Record<string, number[]> = {
  idle: [14, 16, 18, 16],
  cast: [14, 15, 16, 15],
  summon: [16, 20, 24, 20],
  hurt: [15, 12]
}

/** Dissolves a frame into feathers and sparkles: pixels drop out by a seeded threshold and light motes rise. */
function dissolve(src: Raster, fade: number, seed: number): Raster {
  if (fade <= 0) return src
  const out = new Raster(src.w, src.h)
  const rn = rng(seed)
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const c = src.data[y * src.w + x]
      if (!c) continue
      // dissolve from the top down so the hat goes first
      const thr = fade * 1.25 - (y / src.h) * 0.35
      const h = (hash(x, y, seed) % 1000) / 1000
      if (h > thr) out.set(x, y, c)
    }
  const b = src.bounds()
  if (b && fade < 1.01) {
    const n = Math.round(24 * Math.min(1, fade * 1.4))
    for (let i = 0; i < n; i++) {
      const x = b.x + rn() * b.w
      const y = b.y - fade * 12 + rn() * b.h * (1 - fade * 0.5)
      if (i % 3 === 0) {
        // a drifting feather: a short curved violet/silver stroke
        const c1 = i % 2 ? R.hairSilver[1] : R.shadow[1]
        out.line(x, y, x + 2, y - 1, c1)
        out.line(x + 2, y - 1, x + 3, y + 1, R.hairSilver[0])
      } else {
        // a gold sparkle
        out.set(x, y, R.gold[0])
        out.set(x + 1, y, R.gold[1])
        out.set(x - 1, y, R.gold[1])
        out.set(x, y - 1, R.gold[1])
        out.set(x, y + 1, R.gold[1])
      }
    }
  }
  return out
}

function sigils(base: Raster, s: number, i: number): Raster {
  if (s <= 0) return base
  const out = new Raster(base.w, base.h)
  const cx = 64
  const cy = 56
  const r = 26 + s * 8
  const col = [R.shadow[0], R.jobRed[0], C.white, R.shadow[1]]
  out.ring(cx, cy, r, r + 1, col[0])
  out.ring(cx, cy, r - 6, r - 5, col[3])
  // glyph ticks around the rings, rotating with the frame
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + i * 0.35
    const x = cx + Math.cos(a) * (r - 3)
    const y = cy + Math.sin(a) * (r - 3)
    out.set(x, y, col[k % 3])
    out.set(x + Math.cos(a), y + Math.sin(a), col[0])
    if (k % 2) out.set(x - Math.sin(a), y + Math.cos(a), col[1])
  }
  // a five-point star in the middle
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * Math.PI * 2 - Math.PI / 2 + i * 0.35
    const a1 = (((k + 2) % 5) / 5) * Math.PI * 2 - Math.PI / 2 + i * 0.35
    out.line(
      cx + Math.cos(a0) * (r - 8),
      cy + Math.sin(a0) * (r - 8),
      cx + Math.cos(a1) * (r - 8),
      cy + Math.sin(a1) * (r - 8),
      col[1]
    )
  }
  return out.blit(base)
}

export function buildMildaSheet(): Sheet {
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(BOSS_SPEC.milda)) {
    const [base, dir] = name.split('_') as [string, View | undefined]
    const view: View = dir ?? 'down'
    const make = MOVES[base]
    const out = Array.from({ length: want.frames }, (_, i) => {
      const m = make(i)
      let r = renderMilda(view, m)
      if (m.sigil) r = sigils(r, m.sigil, i)
      if (m.fade) r = dissolve(r, m.fade, 7 + i * 13)
      return r
    })
    const a: Anim = anim(out, want.fps, want.loop)
    if (want.lift) a.lift = HOVER_LIFT[base]
    if (base === 'death') a.alpha = [1, 1, 1, 1, 1, 0.9, 0.7, 0.45]
    sheet[name] = a
  }
  return sheet
}

export type { Pt }
