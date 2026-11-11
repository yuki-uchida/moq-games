/** Character art. Every sprite is authored on a 64×64 grid (bosses are drawn larger and scaled down by the
 * renderer), so the whole game keeps one crisp 64-pixel unit. */
import { makeSprite, type Painter, type Sprite } from './pixel'
import { PAL } from './palette'

export interface CharacterArt {
  idle: Sprite[]
  walk: Sprite[]
  jump: Sprite
  fall: Sprite
  bite: Sprite[]
  hurt: Sprite
  happy: Sprite
  fly?: Sprite[]
}

export interface HamsterOpts {
  body: string
  belly: string
  ear: string
  shade: string
  eye?: 'open' | 'closed' | 'happy' | 'hurt' | 'angry'
  mouth?: 'smile' | 'open' | 'happy' | 'hurt' | 'o' | 'grin'
  footL?: readonly [number, number]
  footR?: readonly [number, number]
  arms?: 'down' | 'up' | 'out'
  crown?: boolean
  bow?: boolean
  cape?: boolean
  angry?: boolean
  bulk?: number
  size?: number
}

/** The round hamster silhouette shared by ハム彦, ハム姫, ハム代 and the final boss. */
export function hamster(opts: HamsterOpts): Sprite {
  const size = opts.size ?? 64
  const bulk = opts.bulk ?? 1
  const cx = size / 2
  const bodyY = size * 0.6
  const rx = size * 0.31 * bulk
  const ry = size * 0.3 * bulk
  return makeSprite(size, size, (p) => {
    const s = size / 64
    const at = (v: number) => v * s
    // cape behind the body
    if (opts.cape) {
      p.ellipse(cx, bodyY + at(2), rx * 1.25, ry * 1.2, PAL.kingShade)
      p.rect(at(2), bodyY - at(6), at(8), at(26), PAL.kingShade)
      p.rect(cx + rx - at(10), bodyY - at(6), at(8), at(26), PAL.kingShade)
    }
    // tail
    p.circle(cx + rx * 0.92, bodyY + at(6), at(5), opts.shade)
    // ears
    for (const dir of [-1, 1]) {
      const ex = cx + dir * rx * 0.66
      const ey = bodyY - ry * 0.82
      p.circle(ex, ey, at(8.5), PAL.ink)
      p.circle(ex, ey, at(6.8), opts.ear)
      p.circle(ex - dir * at(1), ey + at(1), at(3.4), opts.body)
    }
    // body
    p.ellipse(cx, bodyY, rx, ry, PAL.ink)
    p.ellipse(cx, bodyY, rx - at(1.6), ry - at(1.6), opts.body)
    // belly
    p.ellipse(cx, bodyY + ry * 0.36, rx * 0.62, ry * 0.55, opts.belly)
    // feet
    const [flx, fly] = opts.footL ?? [0, 0]
    const [frx, fry] = opts.footR ?? [0, 0]
    for (const [fx, fy] of [
      [cx - rx * 0.45 + at(flx), bodyY + ry - at(1) + at(fly)],
      [cx + rx * 0.45 + at(frx), bodyY + ry - at(1) + at(fry)]
    ] as const) {
      p.ellipse(fx, fy, at(7.5), at(4.6), PAL.ink)
      p.ellipse(fx, fy - at(0.6), at(6), at(3.4), opts.shade)
    }
    // arms
    const armY = bodyY + ry * 0.05
    for (const dir of [-1, 1]) {
      const ax = cx + dir * (rx - at(1))
      const lift = opts.arms === 'up' ? -at(10) : opts.arms === 'out' ? at(2) : at(0)
      p.ellipse(ax, armY + lift, at(4.6), at(6.4), PAL.ink)
      p.ellipse(ax, armY + lift, at(3.2), at(5), opts.shade)
    }
    // face
    const eyeY = bodyY - ry * 0.18
    const eyeDX = rx * 0.42
    const eye = opts.eye ?? 'open'
    for (const dir of [-1, 1]) {
      const ex = cx + dir * eyeDX
      if (eye === 'closed' || eye === 'happy') {
        p.line(ex - at(3), eyeY - at(1.4), ex, eyeY + at(1.6), PAL.eye)
        p.line(ex, eyeY + at(1.6), ex + at(3), eyeY - at(1.4), PAL.eye)
      } else if (eye === 'hurt') {
        p.line(ex - at(3), eyeY - at(3), ex + at(3), eyeY + at(3), PAL.eye)
        p.line(ex - at(3), eyeY + at(3), ex + at(3), eyeY - at(3), PAL.eye)
      } else {
        p.ellipse(ex, eyeY, at(3.4), at(4.6), PAL.eye)
        p.circle(ex - at(1), eyeY - at(1.6), at(1.2), PAL.eyeShine)
        if (opts.angry || eye === 'angry') {
          p.line(ex - dir * at(3), eyeY - at(4.5), ex + dir * at(3), eyeY - at(1.5), PAL.eye)
        }
      }
    }
    // nose
    p.ellipse(cx, bodyY + at(0.5), at(2.4), at(1.8), PAL.blushDeep)
    // mouth
    const mouthY = bodyY + at(6)
    const mouth = opts.mouth ?? 'smile'
    if (mouth === 'open' || mouth === 'happy') {
      p.ellipse(cx, mouthY, at(4.6), mouth === 'happy' ? at(5) : at(4), PAL.ink)
      p.ellipse(cx, mouthY + at(1.4), at(3), at(2.4), '#e0507a')
    } else if (mouth === 'hurt') {
      p.line(cx - at(4), mouthY + at(2), cx + at(4), mouthY + at(2), PAL.ink)
    } else if (mouth === 'o') {
      p.circle(cx, mouthY, at(2.6), PAL.ink)
    } else if (mouth === 'grin') {
      p.line(cx - at(5), mouthY - at(1), cx + at(5), mouthY - at(1), PAL.ink)
      p.line(cx - at(5), mouthY - at(1), cx - at(4), mouthY + at(1.4), PAL.ink)
      p.line(cx + at(5), mouthY - at(1), cx + at(4), mouthY + at(1.4), PAL.ink)
    } else {
      p.line(cx - at(3), mouthY, cx, mouthY + at(2), PAL.ink)
      p.line(cx, mouthY + at(2), cx + at(3), mouthY, PAL.ink)
    }
    // blush
    p.ellipse(cx - rx * 0.68, bodyY + at(3), at(3.6), at(2.2), opts.body === PAL.princessBody ? PAL.blush : PAL.blush)
    p.ellipse(cx + rx * 0.68, bodyY + at(3), at(3.6), at(2.2), PAL.blush)
    // crown
    if (opts.crown) {
      const cw = at(16)
      const cy = bodyY - ry - at(4)
      p.rect(cx - cw / 2, cy, cw, at(6), PAL.gold)
      p.rect(cx - cw / 2, cy - at(5), at(4), at(5), PAL.gold)
      p.rect(cx - at(2), cy - at(7), at(4), at(7), PAL.gold)
      p.rect(cx + cw / 2 - at(4), cy - at(5), at(4), at(5), PAL.gold)
      p.circle(cx, cy - at(8), at(2.2), PAL.blushDeep)
      p.circle(cx - cw / 2 + at(2), cy - at(6), at(2), PAL.blushDeep)
      p.circle(cx + cw / 2 - at(2), cy - at(6), at(2), PAL.blushDeep)
    }
    // bow
    if (opts.bow) {
      const bx = cx + rx * 0.5
      const by = bodyY - ry - at(2)
      p.rect(bx - at(7), by - at(4), at(7), at(8), PAL.blushDeep)
      p.rect(bx, by - at(4), at(7), at(8), PAL.blushDeep)
      p.circle(bx, by, at(3), PAL.gold)
    }
    p.outline(PAL.ink)
  })
}

export interface BeastOpts {
  body: string
  shade: string
  belly?: string
  eye?: 'open' | 'closed' | 'angry' | 'happy' | 'hurt'
  ear?: 'pointy' | 'round' | 'none'
  horn?: boolean
  tusk?: boolean
  wing?: boolean
  tail?: 'long' | 'puff' | 'none'
  snout?: boolean
  fang?: boolean
  size?: number
  bulk?: number
  /** Extra width for a long body (weasels, foxes). */
  long?: number
}

/** Generic quadruped/bird body used for enemies and bosses. */
export function beast(opts: BeastOpts): Sprite {
  const size = opts.size ?? 64
  const bulk = opts.bulk ?? 1
  const long = opts.long ?? 0
  const s = size / 64
  const at = (v: number) => v * s
  const cx = size / 2
  const bodyY = size * 0.62
  const rx = size * 0.28 * bulk + at(long)
  const ry = size * 0.24 * bulk
  return makeSprite(size, size, (p) => {
    // tail
    if (opts.tail === 'long') {
      p.ellipse(cx - rx - at(8), bodyY + at(2), at(14), at(6), opts.shade)
      p.ellipse(cx - rx - at(16), bodyY - at(2), at(7), at(5), opts.body)
    } else if (opts.tail === 'puff') {
      p.circle(cx - rx - at(4), bodyY - at(4), at(7), opts.shade)
    }
    // wings
    if (opts.wing) {
      for (const dir of [-1, 1]) {
        p.ellipse(cx + dir * rx * 0.5, bodyY - ry * 0.3, at(16), at(9), opts.shade)
        p.ellipse(cx + dir * rx * 0.5, bodyY - ry * 0.3, at(13), at(7), opts.body)
      }
    }
    // body
    p.ellipse(cx, bodyY, rx, ry, PAL.ink)
    p.ellipse(cx, bodyY, rx - at(1.6), ry - at(1.6), opts.body)
    if (opts.belly) p.ellipse(cx, bodyY + ry * 0.4, rx * 0.6, ry * 0.5, opts.belly)
    // legs
    for (const [dx, dy] of [
      [-0.55, 0.75],
      [-0.2, 0.8],
      [0.35, 0.8],
      [0.65, 0.7]
    ] as const) {
      p.rect(cx + rx * dx - at(3), bodyY + ry * dy - at(2), at(6), at(9), PAL.ink)
      p.rect(cx + rx * dx - at(2), bodyY + ry * dy - at(1), at(4), at(7), opts.shade)
    }
    // head
    const hx = cx + rx * 0.55
    const hy = bodyY - ry * 0.5
    const hr = at(13 * bulk)
    p.circle(hx, hy, hr, PAL.ink)
    p.circle(hx, hy, hr - at(1.6), opts.body)
    // ears
    if (opts.ear === 'pointy') {
      for (const dir of [-1, 1]) {
        p.rect(hx + dir * at(6) - at(3), hy - hr - at(10), at(7), at(12), PAL.ink)
        p.rect(hx + dir * at(6) - at(2), hy - hr - at(9), at(5), at(10), opts.shade)
      }
    } else if (opts.ear === 'round') {
      for (const dir of [-1, 1]) p.circle(hx + dir * at(9), hy - hr + at(2), at(6), opts.shade)
    }
    if (opts.horn) {
      for (const dir of [-1, 1]) {
        p.rect(hx + dir * at(7) - at(2), hy - hr - at(8), at(5), at(10), PAL.cream)
        p.rect(hx + dir * at(7) - at(2), hy - hr - at(8), at(5), at(3), PAL.gold)
      }
    }
    // snout
    if (opts.snout) {
      p.ellipse(hx + hr * 0.55, hy + at(2), at(9), at(7), opts.shade)
      p.circle(hx + hr * 0.9, hy, at(2.6), PAL.ink)
    }
    // eyes
    const eyeY = hy - at(2)
    const eye = opts.eye ?? 'open'
    for (const dir of [-1, 1]) {
      const ex = hx + dir * at(6)
      if (eye === 'angry') {
        p.ellipse(ex, eyeY, at(3.4), at(4), PAL.eye)
        p.circle(ex - at(1), eyeY - at(1.4), at(1), PAL.eyeShine)
        p.line(ex - dir * at(5), eyeY - at(7), ex + dir * at(4), eyeY - at(4), PAL.eye)
      } else if (eye === 'hurt') {
        p.line(ex - at(3), eyeY - at(3), ex + at(3), eyeY + at(3), PAL.eye)
        p.line(ex - at(3), eyeY + at(3), ex + at(3), eyeY - at(3), PAL.eye)
      } else if (eye === 'closed' || eye === 'happy') {
        p.line(ex - at(3), eyeY, ex + at(3), eyeY, PAL.eye)
      } else {
        p.ellipse(ex, eyeY, at(3.6), at(4.4), PAL.eye)
        p.circle(ex - at(1), eyeY - at(1.6), at(1.2), PAL.eyeShine)
      }
    }
    if (opts.tusk) {
      for (const dir of [-1, 1]) p.rect(hx + dir * at(7) - at(1.5), hy + at(6), at(4), at(9), PAL.cream)
    }
    if (opts.fang) {
      p.rect(hx + at(4), hy + at(6), at(3), at(5), PAL.white)
      p.rect(hx + at(8), hy + at(6), at(3), at(5), PAL.white)
    }
    p.outline(PAL.ink)
  })
}

/** Small bee used by the beehive gimmick. */
export function bee(): Sprite {
  return makeSprite(32, 32, (p) => {
    p.ellipse(16, 18, 10, 8, PAL.ink)
    p.ellipse(16, 18, 8.5, 6.6, PAL.bee)
    p.rect(10, 11, 4, 13, PAL.beeDeep)
    p.rect(18, 11, 4, 13, PAL.beeDeep)
    p.ellipse(12, 8, 6, 4, '#ffffff')
    p.ellipse(20, 8, 6, 4, '#ffffff')
    p.circle(21, 16, 2, PAL.eye)
    p.outline(PAL.ink)
  })
}

function frames(
  build: (pose: Partial<HamsterOpts> & { eye?: HamsterOpts['eye']; mouth?: HamsterOpts['mouth'] }) => Sprite,
  base: HamsterOpts
): CharacterArt {
  return {
    idle: [build({ ...base }), build({ ...base, eye: 'closed' })],
    walk: [
      build({ ...base, footL: [-5, 0], footR: [5, -3], arms: 'out' }),
      build({ ...base, footL: [0, -2], footR: [0, 0], arms: 'down' }),
      build({ ...base, footL: [5, -3], footR: [-5, 0], arms: 'out' }),
      build({ ...base, footL: [0, 0], footR: [0, -2], arms: 'down' })
    ],
    jump: build({ ...base, footL: [-3, 3], footR: [3, 3], arms: 'up', mouth: 'o' }),
    fall: build({ ...base, footL: [-4, -1], footR: [4, -1], arms: 'up', eye: 'hurt', mouth: 'o' }),
    bite: [
      build({ ...base, mouth: 'open', arms: 'out', eye: 'angry' }),
      build({ ...base, mouth: 'grin', arms: 'out', eye: 'angry' })
    ],
    hurt: build({ ...base, eye: 'hurt', mouth: 'hurt', arms: 'up' }),
    happy: build({ ...base, eye: 'happy', mouth: 'happy', arms: 'up' })
  }
}

function beastFrames(
  build: (eye: BeastOpts['eye'], extra?: Partial<BeastOpts>) => Sprite,
  base: BeastOpts
): CharacterArt {
  return {
    idle: [build('open'), build('closed')],
    walk: [
      build('open', { eye: 'open' }),
      build('open', { eye: 'open', tail: base.tail }),
      build('open', { eye: 'open' }),
      build('open', { eye: 'open' })
    ],
    jump: build('open', { eye: 'angry', wing: base.wing }),
    fall: build('hurt', { eye: 'hurt' }),
    bite: [build('angry', { eye: 'angry', fang: base.fang, tusk: base.tusk })],
    hurt: build('hurt', { eye: 'hurt' }),
    happy: build('happy', { eye: 'happy' }),
    fly: [build('open', { wing: true }), build('open', { wing: true, tail: base.tail })]
  }
}

export function buildCharacters(): Record<string, CharacterArt> {
  const player = frames(
    (pose) =>
      hamster({
        body: PAL.playerBody,
        belly: PAL.playerBelly,
        ear: PAL.playerEar,
        shade: PAL.playerShade,
        ...pose
      }),
    { body: PAL.playerBody, belly: PAL.playerBelly, ear: PAL.playerEar, shade: PAL.playerShade }
  )
  const princess = frames(
    (pose) =>
      hamster({
        body: PAL.princessBody,
        belly: PAL.princessBelly,
        ear: PAL.princessEar,
        shade: PAL.princessShade,
        bow: true,
        ...pose
      }),
    {
      body: PAL.princessBody,
      belly: PAL.princessBelly,
      ear: PAL.princessEar,
      shade: PAL.princessShade,
      bow: true
    }
  )
  const mom = frames(
    (pose) =>
      hamster({
        body: PAL.momBody,
        belly: PAL.momBelly,
        ear: PAL.momEar,
        shade: PAL.momShade,
        bulk: 1.22,
        size: 72,
        angry: true,
        ...pose
      }),
    {
      body: PAL.momBody,
      belly: PAL.momBelly,
      ear: PAL.momEar,
      shade: PAL.momShade,
      bulk: 1.22,
      size: 72,
      angry: true
    }
  )
  const king = frames(
    (pose) =>
      hamster({
        body: PAL.kingBody,
        belly: PAL.kingBelly,
        ear: PAL.kingEar,
        shade: PAL.kingShade,
        bulk: 1.4,
        size: 96,
        crown: true,
        cape: true,
        angry: true,
        ...pose
      }),
    {
      body: PAL.kingBody,
      belly: PAL.kingBelly,
      ear: PAL.kingEar,
      shade: PAL.kingShade,
      bulk: 1.4,
      size: 96,
      crown: true,
      cape: true,
      angry: true
    }
  )

  const walker = beastFrames(
    (eye, extra) =>
      beast({ body: PAL.rat, shade: PAL.ratDeep, ear: 'pointy', tail: 'long', snout: true, eye, ...extra }),
    { body: PAL.rat, shade: PAL.ratDeep, ear: 'pointy', tail: 'long', snout: true }
  )
  const flyer = beastFrames(
    (eye, extra) => beast({ body: PAL.crow, shade: PAL.crowDeep, wing: true, tail: 'puff', eye, ...extra }),
    { body: PAL.crow, shade: PAL.crowDeep, wing: true, tail: 'puff' }
  )
  const jumper = beastFrames(
    (eye, extra) => beast({ body: PAL.frog, shade: PAL.frogDeep, belly: '#d8f5b0', eye, ...extra }),
    { body: PAL.frog, shade: PAL.frogDeep, belly: '#d8f5b0' }
  )
  const spitter = beastFrames(
    (eye, extra) =>
      beast({
        body: '#e86a5a',
        shade: '#b84438',
        belly: '#ffd9c8',
        ear: 'none',
        tail: 'none',
        snout: true,
        eye,
        ...extra
      }),
    { body: '#e86a5a', shade: '#b84438', belly: '#ffd9c8', ear: 'none', tail: 'none', snout: true }
  )
  const tough = beastFrames(
    (eye, extra) =>
      beast({ body: PAL.ape, shade: PAL.apeDeep, bulk: 1.3, ear: 'round', tail: 'none', snout: true, eye, ...extra }),
    { body: PAL.ape, shade: PAL.apeDeep, bulk: 1.3, ear: 'round', tail: 'none', snout: true }
  )

  const crowBoss = beastFrames(
    (eye, extra) =>
      beast({
        body: PAL.crow,
        shade: PAL.crowDeep,
        wing: true,
        tail: 'puff',
        bulk: 1.6,
        size: 88,
        fang: true,
        eye,
        ...extra
      }),
    { body: PAL.crow, shade: PAL.crowDeep, wing: true, tail: 'puff', bulk: 1.6, size: 88, fang: true }
  )
  const weaselBoss = beastFrames(
    (eye, extra) =>
      beast({
        body: PAL.rat,
        shade: PAL.ratDeep,
        ear: 'pointy',
        tail: 'long',
        long: 10,
        bulk: 1.3,
        size: 88,
        snout: true,
        fang: true,
        eye,
        ...extra
      }),
    {
      body: PAL.rat,
      shade: PAL.ratDeep,
      ear: 'pointy',
      tail: 'long',
      long: 10,
      bulk: 1.3,
      size: 88,
      snout: true,
      fang: true
    }
  )
  const boarBoss = beastFrames(
    (eye, extra) =>
      beast({
        body: PAL.boar,
        shade: PAL.boarDeep,
        bulk: 1.6,
        size: 96,
        tusk: true,
        snout: true,
        ear: 'pointy',
        tail: 'puff',
        eye,
        ...extra
      }),
    { body: PAL.boar, shade: PAL.boarDeep, bulk: 1.6, size: 96, tusk: true, snout: true, ear: 'pointy', tail: 'puff' }
  )
  const wolfBoss = beastFrames(
    (eye, extra) =>
      beast({
        body: PAL.wolf,
        shade: PAL.wolfDeep,
        bulk: 1.45,
        size: 92,
        ear: 'pointy',
        tail: 'long',
        long: 6,
        fang: true,
        eye,
        ...extra
      }),
    { body: PAL.wolf, shade: PAL.wolfDeep, bulk: 1.45, size: 92, ear: 'pointy', tail: 'long', long: 6, fang: true }
  )
  const bearBoss = beastFrames(
    (eye, extra) =>
      beast({
        body: PAL.bear,
        shade: PAL.bearDeep,
        bulk: 1.7,
        size: 100,
        ear: 'round',
        snout: true,
        tail: 'puff',
        eye,
        ...extra
      }),
    { body: PAL.bear, shade: PAL.bearDeep, bulk: 1.7, size: 100, ear: 'round', snout: true, tail: 'puff' }
  )
  const foxBoss = beastFrames(
    (eye, extra) =>
      beast({
        body: PAL.fox,
        shade: PAL.foxDeep,
        bulk: 1.35,
        size: 88,
        ear: 'pointy',
        tail: 'long',
        long: 10,
        fang: true,
        eye,
        ...extra
      }),
    { body: PAL.fox, shade: PAL.foxDeep, bulk: 1.35, size: 88, ear: 'pointy', tail: 'long', long: 10, fang: true }
  )
  const apeBoss = beastFrames(
    (eye, extra) =>
      beast({
        body: PAL.ape,
        shade: PAL.apeDeep,
        bulk: 1.8,
        size: 104,
        ear: 'round',
        tail: 'none',
        snout: true,
        eye,
        ...extra
      }),
    { body: PAL.ape, shade: PAL.apeDeep, bulk: 1.8, size: 104, ear: 'round', tail: 'none', snout: true }
  )
  const beeBoss = beastFrames(
    (eye, extra) =>
      beast({
        body: PAL.hive,
        shade: PAL.hiveDeep,
        wing: true,
        bulk: 1.4,
        size: 88,
        tail: 'none',
        eye,
        ...extra
      }),
    { body: PAL.hive, shade: PAL.hiveDeep, wing: true, bulk: 1.4, size: 88, tail: 'none' }
  )

  return {
    player,
    princess,
    mom,
    king,
    walker,
    flyer,
    jumper,
    spitter,
    tough,
    crowBoss,
    weaselBoss,
    boarBoss,
    wolfBoss,
    bearBoss,
    foxBoss,
    apeBoss,
    beeBoss
  }
}

export const BEE = bee()
