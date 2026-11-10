/** Props, pickups and terrain tiles. Everything is drawn on the same 64×64 grid as the characters. */
import { makeSprite, type Painter, type Sprite } from './pixel'
import { PAL } from './palette'

/** Deterministic hash noise so terrain looks hand-drawn but never flickers. */
function noise(x: number, y: number, seed = 0): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return v - Math.floor(v)
}

export type TileKind = 'ground' | 'dirt' | 'stone' | 'brick' | 'platform' | 'spike' | 'goal' | 'nest'

export interface TileArt {
  ground: Sprite
  dirt: Sprite
  stone: Sprite
  brick: Sprite
  platform: Sprite
  spike: Sprite
  goal: Sprite
  nest: Sprite
}

export interface PropArt {
  tree: Sprite
  pine: Sprite
  log: Sprite
  pipe: Sprite
  pipeHole: Sprite
  hive: Sprite
  animal: Sprite
  animalAwake: Sprite
  rock: Sprite
  rockBits: Sprite[]
  switchOff: Sprite
  switchOn: Sprite
  door: Sprite
  fruit: Sprite
  star: Sprite
  twig: Sprite
  berry: Sprite
  waterDrop: Sprite
  seed: Sprite
  shadow: Sprite
  biteMark: Sprite
  spark: Sprite
  note: Sprite
}

function tileBase(p: Painter, color: string, deep: string, light: string, seed: number) {
  p.rect(0, 0, 64, 64, color)
  for (let y = 0; y < 64; y += 4)
    for (let x = 0; x < 64; x += 4) {
      const n = noise(x, y, seed)
      if (n > 0.78) p.rect(x, y, 4, 4, light)
      else if (n < 0.16) p.rect(x, y, 4, 4, deep)
    }
  p.rect(0, 0, 64, 2, light)
  p.rect(0, 62, 64, 2, deep)
  p.rect(0, 0, 2, 64, light)
  p.rect(62, 0, 2, 64, deep)
}

export function buildTiles(theme: string): TileArt {
  const palettes: Record<string, { body: string; deep: string; light: string; top: string; topDeep: string }> = {
    meadow: { body: PAL.dirt, deep: PAL.dirtDeep, light: PAL.dirtLight, top: PAL.grass, topDeep: PAL.grassDeep },
    night: { body: '#6a4a8c', deep: '#4a3166', light: '#8a66b0', top: '#4f9f6a', topDeep: '#357049' },
    cave: { body: '#5a4a78', deep: '#3d3154', light: '#7a66a0', top: '#6a5a8c', topDeep: '#4a3f68' },
    forest: { body: '#6b4a34', deep: '#4a3122', light: '#8c6547', top: '#3f8f4e', topDeep: '#2a6b38' },
    fortress: { body: PAL.stone, deep: PAL.stoneDeep, light: PAL.stoneLight, top: PAL.stone, topDeep: PAL.stoneDeep },
    castle: { body: PAL.brick, deep: PAL.brickDeep, light: PAL.brickLight, top: PAL.brick, topDeep: PAL.brickDeep },
    star: { body: '#4a3f7a', deep: '#2f2750', light: '#6a5c9e', top: '#ffd45e', topDeep: '#e0a428' }
  }
  const c = palettes[theme] ?? palettes.meadow
  const ground = makeSprite(64, 64, (p) => {
    tileBase(p, c.body, c.deep, c.light, 3)
    p.rect(0, 0, 64, 16, c.top)
    p.rect(0, 14, 64, 4, c.topDeep)
    for (let x = 0; x < 64; x += 8) {
      const n = noise(x, 0, 11)
      if (n > 0.4) p.rect(x + 2, 10, 3, 6, c.topDeep)
    }
    p.rect(0, 0, 64, 3, c.topDeep)
  })
  const dirt = makeSprite(64, 64, (p) => {
    tileBase(p, '#c98b4b', '#9a6230', '#e0aa68', 7)
    for (const [x, y] of [
      [12, 20],
      [40, 34],
      [24, 48],
      [52, 14]
    ] as const) {
      p.circle(x, y, 3, '#8a5527')
      p.circle(x - 1, y - 1, 1.4, '#e8c07a')
    }
    // bite hint cracks
    p.line(30, 28, 36, 34, '#7a4520')
    p.line(36, 34, 32, 40, '#7a4520')
    p.line(36, 34, 42, 38, '#7a4520')
  })
  const stone = makeSprite(64, 64, (p) => {
    tileBase(p, PAL.stone, PAL.stoneDeep, PAL.stoneLight, 5)
    p.rect(0, 20, 64, 3, PAL.stoneDeep)
    p.rect(0, 42, 64, 3, PAL.stoneDeep)
    p.rect(30, 0, 3, 20, PAL.stoneDeep)
    p.rect(14, 23, 3, 19, PAL.stoneDeep)
    p.rect(46, 23, 3, 19, PAL.stoneDeep)
    p.rect(30, 45, 3, 19, PAL.stoneDeep)
  })
  const brick = makeSprite(64, 64, (p) => {
    tileBase(p, PAL.brick, PAL.brickDeep, PAL.brickLight, 9)
    for (let row = 0; row < 4; row++) {
      const y = row * 16
      p.rect(0, y, 64, 2, PAL.brickDeep)
      const offset = row % 2 === 0 ? 0 : 16
      for (let x = offset; x < 64; x += 32) p.rect(x, y, 2, 16, PAL.brickDeep)
    }
  })
  const platform = makeSprite(64, 64, (p) => {
    p.rect(0, 0, 64, 20, PAL.wood)
    p.rect(0, 0, 64, 4, PAL.woodDeep)
    p.rect(0, 16, 64, 4, PAL.woodDeep)
    for (let x = 8; x < 64; x += 16) p.rect(x, 4, 2, 12, PAL.woodDeep)
    p.rect(0, 0, 2, 20, PAL.woodDeep)
    p.rect(62, 0, 2, 20, PAL.woodDeep)
    p.rect(4, 6, 4, 4, PAL.woodDeep)
    p.rect(50, 10, 4, 4, PAL.woodDeep)
  })
  const spike = makeSprite(64, 64, (p) => {
    p.rect(0, 48, 64, 16, PAL.spikeDeep)
    p.rect(0, 48, 64, 4, PAL.spike)
    for (let i = 0; i < 4; i++) {
      const x = i * 16
      p.line(x + 8, 4, x + 8, 48, PAL.spikeDeep)
      p.line(x + 2, 48, x + 8, 4, PAL.spike)
      p.line(x + 14, 48, x + 8, 4, PAL.spike)
      p.line(x + 5, 12, x + 8, 4, PAL.white)
    }
  })
  const goal = makeSprite(64, 64, (p) => {
    p.rect(30, 4, 5, 56, PAL.woodDeep)
    p.rect(30, 4, 2, 56, PAL.wood)
    p.circle(32, 4, 5, PAL.gold)
    p.circle(32, 4, 3, PAL.goldDeep)
    p.rect(35, 8, 26, 18, PAL.ink)
    p.rect(35, 8, 26, 18, '#ff5f8f')
    p.rect(35, 8, 26, 4, '#ff9ecb')
    p.rect(40, 14, 8, 8, PAL.white)
    p.rect(50, 14, 6, 8, PAL.white)
  })
  const nest = makeSprite(64, 64, (p) => {
    p.ellipse(32, 44, 28, 16, PAL.woodDeep)
    p.ellipse(32, 40, 28, 14, PAL.wood)
    p.ellipse(32, 36, 22, 10, PAL.woodDeep)
    p.ellipse(32, 34, 20, 8, '#e8c07a')
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      p.line(32 + Math.cos(a) * 24, 40 + Math.sin(a) * 10, 32 + Math.cos(a) * 30, 42 + Math.sin(a) * 14, PAL.woodDeep)
    }
    p.rect(20, 30, 6, 4, PAL.leaf)
    p.rect(38, 28, 6, 4, PAL.leaf)
    p.circle(32, 30, 6, PAL.playerBody)
    p.circle(30, 28, 1.6, PAL.eye)
    p.circle(34, 28, 1.6, PAL.eye)
  })
  return { ground, dirt, stone, brick, platform, spike, goal, nest }
}

export function buildProps(): PropArt {
  const tree = makeSprite(64, 64, (p) => {
    p.rect(28, 34, 9, 26, PAL.trunkDeep)
    p.rect(29, 34, 4, 26, PAL.trunk)
    p.line(32, 44, 22, 34, PAL.trunkDeep)
    p.line(33, 40, 44, 32, PAL.trunkDeep)
    p.circle(32, 24, 20, PAL.leafDeep)
    p.circle(16, 32, 14, PAL.leafDeep)
    p.circle(48, 32, 14, PAL.leafDeep)
    p.circle(32, 22, 17, PAL.leaf)
    p.circle(18, 30, 11, PAL.leaf)
    p.circle(46, 30, 11, PAL.leaf)
    p.circle(26, 16, 8, PAL.leafLight)
    p.circle(42, 20, 6, PAL.leafLight)
    p.outline(PAL.ink)
  })
  const pine = makeSprite(64, 64, (p) => {
    p.rect(29, 46, 7, 14, PAL.trunkDeep)
    p.rect(30, 46, 3, 14, PAL.trunk)
    for (let i = 0; i < 3; i++) {
      const y = 10 + i * 14
      const w = 30 - i * 6
      p.line(32, y, 32 - w, y + 18, PAL.leafDeep)
      p.line(32, y, 32 + w, y + 18, PAL.leafDeep)
      p.line(32, y, 32 - w + 4, y + 18, PAL.leaf)
      p.line(32, y, 32 + w - 4, y + 18, PAL.leaf)
    }
    p.circle(32, 8, 4, PAL.leafLight)
    p.outline(PAL.ink)
  })
  const log = makeSprite(64, 64, (p) => {
    p.rect(0, 24, 64, 20, PAL.trunkDeep)
    p.rect(2, 26, 60, 16, PAL.trunk)
    p.ellipse(4, 34, 6, 10, PAL.trunkDeep)
    p.ellipse(4, 34, 4, 7, '#e8c07a')
    for (let x = 14; x < 58; x += 12) p.rect(x, 28, 2, 12, PAL.trunkDeep)
    p.rect(0, 24, 64, 3, PAL.leafDeep)
    p.circle(16, 22, 5, PAL.leaf)
    p.circle(44, 22, 6, PAL.leaf)
    p.outline(PAL.ink)
  })
  const pipe = makeSprite(64, 64, (p) => {
    p.rect(16, 10, 32, 48, PAL.pipeDeep)
    p.rect(18, 10, 28, 48, PAL.pipe)
    p.rect(12, 4, 40, 12, PAL.pipeDeep)
    p.rect(14, 6, 36, 8, PAL.pipeLight)
    p.rect(22, 20, 6, 34, PAL.pipeLight)
    p.rect(12, 52, 40, 8, PAL.pipeDeep)
    p.rect(14, 54, 36, 4, PAL.pipe)
    p.outline(PAL.ink)
  })
  const pipeHole = makeSprite(64, 64, (p) => {
    p.rect(16, 10, 32, 48, PAL.pipeDeep)
    p.rect(18, 10, 28, 48, PAL.pipe)
    p.rect(12, 4, 40, 12, PAL.pipeDeep)
    p.rect(14, 6, 36, 8, PAL.pipeLight)
    p.rect(22, 20, 6, 34, PAL.pipeLight)
    p.circle(46, 34, 9, PAL.ink)
    p.circle(46, 34, 7, '#12303a')
    p.circle(43, 31, 2, PAL.pipeLight)
    p.rect(12, 52, 40, 8, PAL.pipeDeep)
    p.outline(PAL.ink)
  })
  const hive = makeSprite(64, 64, (p) => {
    p.line(32, 0, 32, 10, PAL.trunkDeep)
    p.ellipse(32, 34, 20, 24, PAL.hiveDeep)
    p.ellipse(32, 34, 17, 21, PAL.hive)
    for (let y = 20; y < 50; y += 8) p.rect(16, y, 32, 3, PAL.hiveDeep)
    p.circle(32, 44, 6, PAL.ink)
    p.circle(32, 44, 4, '#5a3a12')
    p.outline(PAL.ink)
  })
  const animal = makeSprite(64, 64, (p) => {
    p.ellipse(32, 42, 24, 16, PAL.ink)
    p.ellipse(32, 41, 22, 14, PAL.boar)
    p.circle(16, 34, 10, PAL.ink)
    p.circle(16, 34, 8, PAL.boar)
    p.circle(12, 32, 2.4, PAL.eye)
    p.line(8, 38, 14, 38, PAL.boarDeep)
    p.rect(24, 50, 5, 8, PAL.boarDeep)
    p.rect(38, 50, 5, 8, PAL.boarDeep)
    p.ellipse(50, 40, 6, 5, PAL.boarDeep)
    p.outline(PAL.ink)
  })
  const animalAwake = makeSprite(64, 64, (p) => {
    p.ellipse(32, 40, 24, 17, PAL.ink)
    p.ellipse(32, 39, 22, 15, PAL.boar)
    p.circle(14, 28, 11, PAL.ink)
    p.circle(14, 28, 9, PAL.boar)
    p.circle(11, 26, 3, PAL.eye)
    p.circle(10, 25, 1.2, PAL.eyeShine)
    p.line(6, 20, 12, 24, PAL.eye)
    p.rect(22, 52, 6, 8, PAL.boarDeep)
    p.rect(40, 52, 6, 8, PAL.boarDeep)
    p.ellipse(52, 34, 7, 6, PAL.boarDeep)
    p.rect(52, 26, 3, 8, PAL.cream)
    p.outline(PAL.ink)
  })
  const rock = makeSprite(64, 64, (p) => {
    p.ellipse(32, 42, 24, 18, PAL.ink)
    p.ellipse(32, 40, 22, 16, PAL.rock)
    p.ellipse(24, 32, 9, 7, PAL.rockDeep)
    p.ellipse(42, 36, 7, 5, PAL.rockLight)
    p.line(20, 48, 30, 34, PAL.rockDeep)
    p.outline(PAL.ink)
  })
  const rockBits = [0, 1, 2].map((i) =>
    makeSprite(16, 16, (p) => {
      p.circle(8, 9, 6 - i, PAL.rock)
      p.circle(6, 7, 2, PAL.rockLight)
      p.outline(PAL.ink)
    })
  )
  const switchOff = makeSprite(64, 64, (p) => {
    p.rect(10, 44, 44, 14, PAL.woodDeep)
    p.rect(12, 46, 40, 10, PAL.wood)
    p.rect(26, 20, 12, 26, PAL.stoneDeep)
    p.rect(28, 22, 8, 22, PAL.stone)
    p.rect(20, 8, 24, 16, PAL.ink)
    p.rect(22, 10, 20, 12, '#ff5f6d')
    p.circle(32, 16, 4, PAL.white)
    p.outline(PAL.ink)
  })
  const switchOn = makeSprite(64, 64, (p) => {
    p.rect(10, 44, 44, 14, PAL.woodDeep)
    p.rect(12, 46, 40, 10, PAL.wood)
    p.rect(26, 20, 12, 26, PAL.stoneDeep)
    p.rect(28, 22, 8, 22, PAL.stone)
    p.rect(20, 14, 24, 16, PAL.ink)
    p.rect(22, 16, 20, 12, '#6cc95a')
    p.circle(32, 22, 4, PAL.white)
    p.outline(PAL.ink)
  })
  const door = makeSprite(64, 64, (p) => {
    p.rect(0, 0, 64, 64, PAL.stoneDeep)
    p.rect(4, 4, 56, 60, PAL.stone)
    for (let x = 10; x < 64; x += 12) {
      p.rect(x, 6, 6, 54, PAL.ink)
      p.rect(x + 1, 8, 3, 50, PAL.stoneLight)
    }
    p.rect(0, 26, 64, 8, PAL.ink)
    p.rect(0, 28, 64, 4, PAL.gold)
    p.circle(32, 30, 4, PAL.goldDeep)
  })
  const fruit = makeSprite(32, 32, (p) => {
    p.circle(16, 18, 11, PAL.ink)
    p.circle(16, 18, 9.4, PAL.fruit)
    p.circle(12, 14, 3, PAL.fruitLight)
    p.rect(15, 4, 3, 7, PAL.trunkDeep)
    p.ellipse(21, 6, 6, 3.4, PAL.leaf)
    p.outline(PAL.ink)
  })
  const star = makeSprite(32, 32, (p) => {
    const cx = 16
    const cy = 16
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
      const a2 = a + Math.PI / 5
      p.line(cx, cy, cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, PAL.goldDeep)
      p.line(cx, cy, cx + Math.cos(a2) * 6, cy + Math.sin(a2) * 6, PAL.gold)
    }
    p.circle(cx, cy, 6, PAL.gold)
    p.circle(cx - 2, cy - 2, 2, '#fff3b8')
    p.outline(PAL.ink)
  })
  const twig = makeSprite(32, 32, (p) => {
    p.line(4, 22, 28, 10, PAL.trunkDeep)
    p.line(4, 22, 28, 10, PAL.trunk)
    p.line(14, 18, 22, 24, PAL.trunk)
    p.rect(10, 18, 4, 3, PAL.leaf)
    p.outline(PAL.ink)
  })
  const berry = makeSprite(32, 32, (p) => {
    p.circle(12, 18, 8, PAL.ink)
    p.circle(12, 18, 6.6, '#b04ad0')
    p.circle(20, 14, 7, PAL.ink)
    p.circle(20, 14, 5.6, '#d06ae8')
    p.circle(10, 16, 2, '#f0b8ff')
    p.rect(18, 4, 3, 6, PAL.leafDeep)
    p.outline(PAL.ink)
  })
  const waterDrop = makeSprite(16, 16, (p) => {
    p.ellipse(8, 10, 5, 6, PAL.waterDeep)
    p.ellipse(8, 10, 3.6, 4.6, PAL.water)
    p.circle(6, 8, 1.4, PAL.waterLight)
  })
  const seed = makeSprite(16, 16, (p) => {
    p.ellipse(8, 9, 5, 6, PAL.ink)
    p.ellipse(8, 9, 3.8, 4.8, PAL.wood)
    p.line(5, 6, 11, 12, PAL.woodDeep)
  })
  const shadow = makeSprite(64, 64, (p) => {
    p.ellipse(32, 56, 24, 6, '#1b1035')
  })
  const biteMark = makeSprite(32, 32, (p) => {
    p.circle(16, 16, 12, PAL.ink)
    p.circle(16, 16, 9, PAL.white)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      p.line(16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, PAL.ink)
    }
  })
  const spark = makeSprite(16, 16, (p) => {
    p.rect(7, 0, 2, 16, PAL.gold)
    p.rect(0, 7, 16, 2, PAL.gold)
    p.rect(3, 3, 10, 10, '#fff3b8')
  })
  const note = makeSprite(16, 16, (p) => {
    p.rect(4, 2, 3, 10, PAL.white)
    p.ellipse(8, 12, 5, 4, PAL.white)
    p.rect(5, 3, 2, 8, PAL.ink)
  })
  return {
    tree,
    pine,
    log,
    pipe,
    pipeHole,
    hive,
    animal,
    animalAwake,
    rock,
    rockBits,
    switchOff,
    switchOn,
    door,
    fruit,
    star,
    twig,
    berry,
    waterDrop,
    seed,
    shadow,
    biteMark,
    spark,
    note
  }
}
