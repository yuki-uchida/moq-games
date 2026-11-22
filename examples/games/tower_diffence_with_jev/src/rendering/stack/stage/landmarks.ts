import type { FieldId } from '../../../game/model'
import type { StackDesign } from '../StackDesign'
import type { VoxelPart } from '../Voxel'

const hash = (x: number, y: number, z: number) => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const ROOF: Record<FieldId, string> = { meadow: '#4f8fc0', desert: '#c4683f', frost: '#5f7fae', volcanic: '#7a3f52' }

function tower(p: VoxelPart, cx: number, cz: number, height: number, radius: number, damage: number) {
  const broken = damage > 0.6 && cx < 0
  const top = broken ? Math.round(height * 0.55) : height
  p.cylinder(cx, cz, 0, top, radius, radius, 'stone')
  p.fill([cx - radius - 1, top, cz - radius - 1], [cx + radius, top + 1, cz + radius], 'stoneLight', (x, y, z) => {
    const r = Math.hypot(x - cx, z - cz)
    const merlon = Math.floor(Math.atan2(x - cx, z - cz) * 2.2) % 2 === 0
    return r <= radius + 0.6 && r > radius - 1.2 && (y < top + 1 || merlon)
  })
  if (!broken) p.cylinder(cx, cz, top + 1, top + 9, radius + 0.8, 0.4, 'roof')
  p.face(Math.round(cx - 0.5), Math.round(top * 0.6), 'window', '+z')
}

/**
 * 王国の城 — the knights' castle: a grey-stone keep behind a curtain wall with four round
 * towers under order-blue cones, a gatehouse with an oak door and banners. Damage knocks off
 * merlons and a tower top, opens cracks and leaves rubble and embers.
 */
const designs = new Map<string, StackDesign>()
const once = (key: string, make: () => StackDesign) => designs.get(key) ?? (designs.set(key, make()), designs.get(key)!)

export function castleDesign(fieldId: FieldId, tier: 0 | 1 | 2): StackDesign {
  return once(`castle:${fieldId}:${tier}`, () => buildCastle(fieldId, tier))
}
function buildCastle(fieldId: FieldId, tier: 0 | 1 | 2): StackDesign {
  const damage = [1, 0.5, 0][tier]
  return {
    type: `prop:castle-${fieldId}-${tier}`,
    voxel: 2.4,
    walkDistance: 1,
    shadow: [22, 16],
    blueprint: {
      id: `castle-${fieldId}-${tier}`,
      layerCopies: 2,
      colors: {
        stone: '#a8a59c',
        stoneDark: '#7f7c74',
        stoneLight: '#cbc7bb',
        roof: ROOF[fieldId],
        door: '#7a4f2d',
        iron: '#3d3b3f',
        window: '#2a2630',
        banner: '#75b6d5',
        gold: '#e8c35a',
        rubble: '#8c887e',
        moss:
          fieldId === 'frost'
            ? '#f2f8fb'
            : fieldId === 'desert'
              ? '#d8b36e'
              : fieldId === 'volcanic'
                ? '#5a4a52'
                : '#6fa04a',
        '*ember': '#ff8a3c'
      },
      build(kit) {
        const p = kit.part('body')
        // Curtain wall ring.
        p.box([-14, 0, -12], [13, 9, 9], 'stone')
        p.box([-12, 0, -10], [11, 9, 7], 0)
        for (let x = -14; x <= 13; x += 2) {
          p.box([x, 10, -12], [x, 11, -12], 'stoneLight').box([x, 10, 9], [x, 11, 9], 'stoneLight')
        }
        for (let z = -12; z <= 9; z += 2)
          p.box([-14, 10, z], [-14, 11, z], 'stoneLight').box([13, 10, z], [13, 11, z], 'stoneLight')
        // Keep.
        p.box([-6, 0, -8], [5, 20, 2], 'stone').box([-6, 21, -8], [5, 21, 2], 'stoneLight')
        p.box([-7, 22, -9], [6, 30, 3], 0)
        p.fill(
          [-7, 22, -9],
          [6, 29, 3],
          'roof',
          (x, y, z) => Math.abs(x + 0.5) <= 6.5 - (y - 22) * 0.8 && z >= -8 && z <= 2
        )
        for (const x of [-4, -1, 2]) p.box([x, 14, 3], [x, 16, 3], 'window')
        // Gatehouse with door and portcullis bars on the front (+z).
        p.box([-5, 0, 8], [4, 13, 11], 'stoneDark').box([-5, 14, 8], [4, 14, 11], 'stoneLight')
        p.box([-2, 0, 12], [1, 7, 12], 'door').box([-2, 8, 12], [1, 8, 12], 'iron')
        for (const x of [-2, 0]) p.box([x, 0, 12], [x, 7, 12], 'iron')
        // Corner towers.
        for (const [x, z] of [
          [-13.5, -11.5],
          [13, -11.5],
          [-13.5, 9],
          [13, 9]
        ])
          tower(p, x, z, 15, 3.6, damage)
        // Banners on the gatehouse and keep.
        p.box([-5, 9, 12], [-4, 13, 12], 'banner')
          .box([3, 9, 12], [4, 13, 12], 'banner')
          .set(-5, 13, 12, 'gold')
          .set(4, 13, 12, 'gold')
        p.box([0, 31, -3], [0, 36, -3], 'iron').box([1, 33, -3], [4, 36, -3], 'banner')
        // Weathering.
        p.paint((x, y, z, c) =>
          y < 2 && hash(x, y, z) > 0.6 ? 'moss' : hash(x, y, z) > 0.93 ? 'stoneDark' : undefined
        )
        if (damage > 0) {
          // Missing merlons, wall breaches and a cracked keep.
          p.paint((x, y, z) => (y >= 9 && hash(x, z, y) < damage * 0.35 ? 0 : undefined))
          p.paint((x, y, z) =>
            y > 3 && y < 14 && (x === 13 || x === -14) && hash(y, z, x) < damage * 0.12 ? 0 : undefined
          )
          p.paint((x, y, z) =>
            y > 4 && y < 20 && z === 2 && (x * 3 + y) % 7 === 0 && damage > 0.4 ? 'window' : undefined
          )
          for (let i = 0; i < 14 * damage; i++) {
            const x = Math.round((hash(i, 3, 7) - 0.5) * 32),
              z = 12 + Math.round(hash(i, 5, 1) * 6)
            p.box([x, 0, z], [x + 1, Math.round(hash(i, 9, 2) * 2), z], 'rubble')
          }
          if (damage > 0.6)
            for (const [x, y, z] of [
              [-13, 9, 9],
              [6, 21, 0],
              [-10, 10, -12]
            ])
              p.set(x, y, z, '*ember')
        }
      }
    },
    pose: () => ({})
  }
}

/** The monster den at the road's entrance: a rocky mound around a dark mouth with glowing eyes. */
export function denDesign(fieldId: FieldId): StackDesign {
  return once(`den:${fieldId}`, () => buildDen(fieldId))
}
function buildDen(fieldId: FieldId): StackDesign {
  const crystal = { meadow: '#a07ad8', desert: '#e0a24a', frost: '#7ac8e8', volcanic: '#ff7a3c' }[fieldId]
  return {
    type: `prop:den-${fieldId}`,
    voxel: 2.4,
    walkDistance: 1,
    shadow: [16, 12],
    blueprint: {
      id: `den-${fieldId}`,
      layerCopies: 2,
      colors: {
        rock:
          fieldId === 'frost'
            ? '#7d8794'
            : fieldId === 'desert'
              ? '#b98a58'
              : fieldId === 'volcanic'
                ? '#3d3440'
                : '#6f6a66',
        rockDark: '#4a4544',
        cap:
          fieldId === 'frost'
            ? '#f2f8fb'
            : fieldId === 'desert'
              ? '#d8b36e'
              : fieldId === 'volcanic'
                ? '#57495a'
                : '#5f8f44',
        void: '#120c16',
        crystal,
        '*glow': '#ffe36a',
        '*crystalGlow': crystal
      },
      build(kit) {
        const p = kit.part('body')
        p.ellipsoid([0.5, 2, 0.5], [13, 11, 10], 'rock')
        p.paint((x, y) => (y < 0 ? 0 : undefined))
        // Mouth open toward +z.
        p.fill([-6, 0, 2], [6, 9, 12], 'void', (x, y, z) => Math.hypot((x - 0.5) / 5.4, y / 8) <= 1 && z > 3)
        p.paint((x, y, z) => (Math.hypot((x - 0.5) / 5.4, (y - 0.5) / 8) <= 1 && z > 5 ? 0 : undefined))
        p.fill([-5, 0, 2], [5, 8, 5], 'void', (x, y, z) => Math.hypot((x - 0.5) / 5, y / 7.4) <= 1)
        p.paint((x, y, z) =>
          !p.has(x, y + 1, z) && y > 6 ? 'cap' : y < 2 && hash(x, y, z) > 0.6 ? 'rockDark' : undefined
        )
        p.set(-2, 3, 6, '*glow').set(2, 3, 6, '*glow')
        for (const [x, z, h, lean] of [
          [-9, 2, 7, -0.4],
          [8, 3, 6, 0.4],
          [6, -6, 9, 0.2],
          [-7, -5, 5, -0.3]
        ])
          p.segment(
            [x + 0.5, 4, z + 0.5],
            [x + 0.5 + lean * h, 4 + h, z + 0.5],
            1.2,
            hash(x, z, h) > 0.5 ? '*crystalGlow' : 'crystal',
            0.3
          )
      }
    },
    pose: () => ({})
  }
}
