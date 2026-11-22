import type { FieldId } from '../../../game/model'
import type { StackDesign } from '../StackDesign'
import type { VoxelPart } from '../Voxel'

const ROOF: Record<FieldId, { main: string; light: string; dark: string }> = {
  meadow: { main: '#2a75d6', light: '#5aa0f5', dark: '#1a4c94' },
  desert: { main: '#cc5229', light: '#eb7a4d', dark: '#8c3116' },
  frost: { main: '#3863b8', light: '#6893e0', dark: '#213f7d' },
  volcanic: { main: '#9e284d', light: '#cc4b72', dark: '#661530' }
}

function tower(p: VoxelPart, cx: number, cz: number, height: number, radius: number, broken: boolean) {
  const top = broken ? Math.round(height * 0.56) : height
  p.cylinder(cx, cz, 0, top, radius, radius, 'stone')
  // Clean horizontal masonry course bands (zero salt-and-pepper noise).
  p.paint((x, y, z) => {
    const r = Math.hypot(x - cx, z - cz)
    if (r > radius + 0.5 || y > top) return undefined
    if (y === 0 || y === 1) return 'stoneDark'
    if (y % 4 === 0 && r > radius - 1.1) return 'stoneDark'
    return undefined
  })
  // Crisp battlement parapet with alternating merlons.
  p.fill([cx - radius - 1, top, cz - radius - 1], [cx + radius + 1, top + 2, cz + radius + 1], 'stoneLight', (x, y, z) => {
    const r = Math.hypot(x - cx, z - cz)
    const merlon = Math.floor(Math.atan2(x - cx, z - cz) * 2.55) % 2 === 0
    return r <= radius + 0.9 && r > radius - 1.2 && (y < top + 1 || merlon)
  })
  if (!broken) {
    p.cylinder(cx, cz, top + 2, top + 12, radius + 1.1, 0.4, 'roof')
    p.paint((x, y, z) =>
      y >= top + 2 && Math.hypot(x - cx, z - cz) <= radius + 1.2 && x < cx && z > cz - 1 ? 'roofLight' : undefined
    )
    p.box([Math.round(cx), top + 13, Math.round(cz)], [Math.round(cx), top + 14, Math.round(cz)], 'gold')
  }
  p.box([Math.round(cx - 0.5), Math.round(top * 0.55), Math.round(cz + radius)], [Math.round(cx - 0.5), Math.round(top * 0.72), Math.round(cz + radius)], 'window')
}

const designs = new Map<string, StackDesign>()
const once = (key: string, make: () => StackDesign) => designs.get(key) ?? (designs.set(key, make()), designs.get(key)!)

/**
 * 王国の城 — a grand hero-scale fortress on the unified voxel=2 grid:
 * - Towers over units (~44 slices tall) with clean stone masonry courses (zero random noise)
 * - Prominent protruding gatehouse with dark recessed archway, warm glowing torch braziers,
 *   iron portcullis teeth, oak gate and twin royal order banners
 * - Three strictly distinct damage tiers (`tier 2 > tier 1 > tier 0` voxel counts)
 */
export function castleDesign(fieldId: FieldId, tier: 0 | 1 | 2): StackDesign {
  return once(`castle:${fieldId}:${tier}`, () => buildCastle(fieldId, tier))
}

function buildCastle(fieldId: FieldId, tier: 0 | 1 | 2): StackDesign {
  const roof = ROOF[fieldId]
  return {
    type: `prop:castle-${fieldId}-${tier}`,
    voxel: 2,
    walkDistance: 1,
    shadow: [26, 20],
    blueprint: {
      id: `castle-${fieldId}-${tier}`,
      layerCopies: 1,
      colors: {
        stone: '#a6a198',
        stoneDark: '#736f68',
        stoneLight: '#cfc9bd',
        roof: roof.main,
        roofLight: roof.light,
        roofDark: roof.dark,
        door: '#6e4323',
        iron: '#323138',
        window: '#1f1c26',
        void: '#120f18',
        banner: '#3b8ee0',
        bannerTrim: '#f2c849',
        gold: '#f2c849',
        rubble: '#878278',
        moss:
          fieldId === 'frost'
            ? '#dceaf5'
            : fieldId === 'desert'
              ? '#cfa96c'
              : fieldId === 'volcanic'
                ? '#4c3e4a'
                : '#57873f',
        '*torch': '#ffbe38',
        '*ember': '#ff7524'
      },
      build(kit) {
        const p = kit.part('body')
        // Broad stone foundation plinth & curtain wall ring.
        p.box([-17, 0, -14], [16, 1, 11], 'stoneDark')
        p.box([-16, 2, -13], [15, 11, 10], 'stone')
        p.box([-13, 2, -10], [12, 11, 7], 0)
        // Clean horizontal masonry band around the curtain wall.
        p.box([-16, 6, -13], [15, 6, -13], 'stoneDark')
          .box([-16, 6, 10], [15, 6, 10], 'stoneDark')
          .box([-16, 6, -13], [-16, 6, 10], 'stoneDark')
          .box([15, 6, -13], [15, 6, 10], 'stoneDark')
        // Crisp battlements around the curtain wall.
        for (let x = -16; x <= 15; x += 2) {
          p.box([x, 12, -13], [x, 13, -13], 'stoneLight').box([x, 12, 10], [x, 13, 10], 'stoneLight')
        }
        for (let z = -13; z <= 10; z += 2) {
          p.box([-16, 12, z], [-16, 13, z], 'stoneLight').box([15, 12, z], [15, 13, z], 'stoneLight')
        }

        // Tall central royal keep with warm lit windows & steep gabled roof.
        p.box([-8, 0, -9], [7, 24, 3], 'stone')
          .box([-8, 25, -9], [7, 25, 3], 'stoneLight')
          .box([-8, 8, -9], [7, 8, 3], 'stoneDark')
          .box([-8, 16, -9], [7, 16, 3], 'stoneDark')
        p.fill(
          [-9, 26, -10],
          [8, 36, 4],
          'roof',
          (x, y, z) => Math.abs(x + 0.5) <= 8.5 - (y - 26) * 0.8 && z >= -9 && z <= 3
        )
        p.paint((x, y, z) => (y >= 26 && x < -1 && z >= -9 && z <= 3 ? 'roofLight' : undefined))
        p.box([-1, 36, -9], [0, 36, 3], 'gold')
        for (const x of [-5, -1, 3]) {
          p.box([x, 17, 4], [x + 1, 20, 4], 'window')
          p.set(x, 18, 4, '*torch')
        }

        // Prominent protruding gatehouse (+z) with recessed arch, warm braziers, portcullis & twin banners.
        p.box([-7, 0, 9], [6, 16, 14], 'stone').box([-7, 17, 9], [6, 17, 14], 'stoneLight')
        p.box([-7, 0, 9], [6, 2, 14], 'stoneDark').box([-7, 10, 9], [6, 10, 14], 'stoneDark')
        for (let x = -7; x <= 6; x += 2) p.box([x, 18, 14], [x, 19, 14], 'stoneLight')
        // Deep recessed arched doorway.
        p.fill([-4, 0, 11], [3, 9, 14], 'void', (x, y) => Math.hypot((x + 0.5) / 3.8, Math.max(0, y - 5) / 4.2) <= 1)
        p.box([-3, 0, 11], [2, 8, 11], 'door')
        for (const x of [-3, -1, 1]) p.box([x, 6, 13], [x, 8, 13], 'iron')
        p.box([-3, 8, 13], [2, 9, 13], 'iron')
        // Warm glowing wall torches flanking the gate arch!
        p.box([-6, 5, 15], [-5, 6, 15], 'iron').box([-6, 7, 15], [-5, 8, 15], '*torch')
        p.box([4, 5, 15], [5, 6, 15], 'iron').box([4, 7, 15], [5, 8, 15], '*torch')
        // Twin royal order banners hanging from the gatehouse parapet + side curtain walls for clear visibility from all angles.
        p.box([-7, 10, 15], [-5, 16, 15], 'banner').box([-7, 10, 15], [-5, 11, 15], 'bannerTrim')
        p.box([4, 10, 15], [6, 16, 15], 'banner').box([4, 10, 15], [6, 11, 15], 'bannerTrim')
        // Side curtain banners, warm lit arrow slits & braziers so the south-facing wall shines when castle faces west/east.
        for (const sx of [-17, 16]) {
          p.box([sx, 5, -5], [sx, 10, -3], 'banner').box([sx, 5, -5], [sx, 6, -3], 'bannerTrim')
          p.box([sx, 5, 2], [sx, 10, 4], 'banner').box([sx, 5, 2], [sx, 6, 4], 'bannerTrim')
          p.box([sx, 7, -1], [sx, 9, 0], 'window').set(sx, 8, -1, '*torch')
        }
        // Tall royal spire & fluttering flag atop the keep.
        if (tier >= 1) {
          p.box([0, 37, -3], [0, 44, -3], 'iron')
          p.box([1, 40, -3], [6, 43, -3], 'banner').box([1, 40, -3], [6, 40, -3], 'bannerTrim')
        }

        // Four corner towers (tier 1 breaks NW tower; tier 0 breaks NW + SE towers).
        tower(p, -15.5, -12.5, 18, 4.2, tier < 2)
        tower(p, 15, -12.5, 18, 4.2, false)
        tower(p, -15.5, 10, 18, 4.2, false)
        tower(p, 15, 10, 18, 4.2, tier === 0)

        // Subtle biome moss/snow/sand band along the lowest stone course only (clean, zero salt-and-pepper noise).
        p.paint((x, y, z) => (y === 0 && (Math.abs(x) >= 15 || z <= -12) ? 'moss' : undefined))

        // Deliberate clean structural damage for tiers 1 & 0 (guarantees strict voxel decrease tier 2 > tier 1 > tier 0).
        if (tier <= 1) {
          // Wall breach on the east curtain wall & sheared gatehouse battlements.
          p.box([14, 7, -4], [16, 13, 3], 0)
          p.box([-7, 18, 14], [-1, 19, 14], 0)
          p.box([-14, 12, -13], [-4, 13, -13], 0)
          // Scattered stone rubble outside the breach.
          p.box([16, 0, -2], [18, 2, 1], 'rubble').box([-14, 0, 15], [-11, 1, 16], 'rubble')
        }
        if (tier === 0) {
          // Major keep roof collapse, wide west breach, broken gate arch & smoldering embers.
          p.box([-9, 28, -9], [2, 37, 4], 0)
          p.box([-17, 5, -5], [-14, 13, 4], 0)
          p.box([-6, 12, 11], [5, 19, 15], 0)
          p.box([-18, 0, -2], [-15, 2, 2], 'rubble').box([8, 0, 15], [12, 2, 17], 'rubble')
          for (const [x, y, z] of [
            [-15, 10, 10],
            [-4, 27, 0],
            [14, 7, -1],
            [-14, 6, 0]
          ])
            p.box([x, y, z], [x + 1, y + 1, z], '*ember')
        }
      }
    },
    pose: () => ({})
  }
}

/**
 * 魔物の巣 — four genuinely distinct biome-specific monster dens on the unified voxel=2 grid:
 * - Meadow: overgrown mossy fang-crag cave with hanging vines, bone trophies & shadow crystals
 * - Desert: sun-bleached sandstone temple arch with giant buried beast ribs & amber crystals
 * - Frost: jagged glacier ice cavern with overhanging snow cornice & hanging icicle fangs
 * - Volcanic: cracked obsidian caldera maw with glowing magma fissures & ember rim-light
 */
export function denDesign(fieldId: FieldId): StackDesign {
  return once(`den:${fieldId}`, () => buildDen(fieldId))
}

function buildDen(fieldId: FieldId): StackDesign {
  const palette: Record<FieldId, Record<string, string>> = {
    meadow: {
      rock: '#635f5c',
      rockDark: '#3f3b3a',
      rockLight: '#85807b',
      cap: '#487d38',
      capLight: '#6ca64e',
      accent: '#e6dcc3',
      crystal: '#8b5cd4',
      '*crystalGlow': '#b98aff',
      void: '#0f0a14',
      '*glow': '#ffe34d'
    },
    desert: {
      rock: '#b57e4a',
      rockDark: '#7d4f28',
      rockLight: '#d9a46c',
      cap: '#d6b174',
      capLight: '#ebcc94',
      accent: '#f0e6cc',
      crystal: '#d48224',
      '*crystalGlow': '#ffba42',
      void: '#1a0e0a',
      '*glow': '#ffcf38'
    },
    frost: {
      rock: '#6c7c8f',
      rockDark: '#445263',
      rockLight: '#97a9bd',
      cap: '#dcebf5',
      capLight: '#f2f9ff',
      accent: '#7cd0ed',
      crystal: '#5aaed6',
      '*crystalGlow': '#b8f3ff',
      void: '#0b121f',
      '*glow': '#ffe659'
    },
    volcanic: {
      rock: '#352c38',
      rockDark: '#1f1924',
      rockLight: '#544659',
      cap: '#4a3d4f',
      capLight: '#735a66',
      accent: '#ff6e24',
      crystal: '#d93d26',
      '*crystalGlow': '#ff9933',
      void: '#12080d',
      '*glow': '#ffcf33'
    }
  }

  return {
    type: `prop:den-${fieldId}`,
    voxel: 2,
    walkDistance: 1,
    shadow: [20, 15],
    blueprint: {
      id: `den-${fieldId}`,
      layerCopies: 1,
      colors: palette[fieldId],
      build(kit) {
        const p = kit.part('body')

        if (fieldId === 'desert') {
          // Stepped weathered sandstone temple arch & mesa mound.
          p.ellipsoid([0, 3, -2], [15, 12, 11], 'rock')
          p.box([-13, 0, -1], [-8, 15, 9], 'rockLight').box([8, 0, -1], [13, 15, 9], 'rockLight')
          p.box([-14, 14, -2], [14, 18, 10], 'cap').box([-12, 18, -1], [12, 20, 8], 'capLight')
          p.paint((x, y) => (y < 0 ? 0 : y % 4 === 1 && y < 14 ? 'rockDark' : undefined))
          // Giant bleached beast ribs arching beside the cavern entrance!
          for (const side of [-1, 1]) {
            p.segment([side * 12, 1, 10], [side * 15, 9, 11], 1.1, 'accent', 0.7)
            p.segment([side * 15, 9, 11], [side * 11, 13, 10], 0.8, 'accent', 0.5)
          }
        } else if (fieldId === 'frost') {
          // Dramatic glacier ice cavern with overhanging snow cornice & flanking ice spires.
          p.ellipsoid([0, 3, -1], [16, 13, 12], 'rock')
          p.paint((x, y) => (y < 0 ? 0 : undefined))
          // Thick overhanging snow drift cap on top.
          p.fill([-16, 10, -12], [16, 17, 11], 'cap', (x, y, z) =>
            Math.hypot(x / 15.5, (y - 10) / 7, (z + 0.5) / 11) <= 1 && y >= 11
          )
          p.paint((x, y, z) => (y >= 14 && x < 2 ? 'capLight' : undefined))
          // Giant translucent glacier spires framing the cave mouth.
          for (const [x, z, h, lean] of [
            [-13, 4, 13, -0.35],
            [13, 4, 12, 0.35],
            [-9, -6, 15, -0.2],
            [9, -5, 14, 0.25]
          ])
            p.segment([x, 4, z], [x + lean * h, 4 + h, z], 2.2, '*crystalGlow', 0.5)
        } else if (fieldId === 'volcanic') {
          // Jagged cracked obsidian caldera volcano maw with glowing magma fissures.
          p.cylinder(0, 0, 0, 18, 16, 11, 'rock')
          p.paint((x, y, z) => (y >= 16 && Math.hypot(x, z) < 7 ? 0 : undefined))
          // Glowing molten magma crater & vertical lava fissures running down the flanks.
          p.fill([-7, 14, -7], [7, 16, 7], '*crystalGlow', (x, y, z) => Math.hypot(x, z) <= 6.5)
          for (const [x, z] of [
            [-10, 4],
            [10, 3],
            [-12, -4],
            [11, -5]
          ]) {
            p.box([x, 2, z], [x + 1, 15, z + 1], 'accent')
          }
          // Jagged obsidian crown fangs around the caldera rim.
          for (const [x, z, h] of [
            [-11, 2, 23],
            [11, 2, 22],
            [-7, -9, 24],
            [8, -8, 23]
          ])
            p.segment([x, 14, z], [x * 1.08, h, z], 2.0, 'rockLight', 0.5)
        } else {
          // Meadow: overgrown mossy fang-crag cave with boulders, vines & purple shadow crystals.
          p.ellipsoid([0, 3, -1], [16, 14, 12], 'rock')
          p.ellipsoid([-10, 4, 2], [7, 7, 7], 'rockDark').ellipsoid([10, 4, 2], [7, 7, 7], 'rockDark')
          p.paint((x, y) => (y < 0 ? 0 : undefined))
          // Lush layered moss blanket across upper crag.
          p.paint((x, y, z) => (!p.has(x, y + 1, z) && y >= 8 ? (x < 0 ? 'capLight' : 'cap') : undefined))
          // Hanging moss vines & bleached warning skull beside entrance.
          p.box([-8, 7, 10], [-8, 12, 10], 'cap').box([8, 8, 10], [8, 12, 10], 'cap')
          p.box([-12, 0, 10], [-10, 2, 12], 'accent').set(-11, 1, 12, 'void')
          for (const [x, z, h, lean] of [
            [-12, 2, 10, -0.35],
            [11, 3, 9, 0.35],
            [8, -7, 12, 0.2],
            [-9, -6, 9, -0.3]
          ])
            p.segment([x, 5, z], [x + lean * h, 5 + h, z], 1.7, '*crystalGlow', 0.4)
        }

        // Deep dark cavernous mouth (+z) carved cleanly into every den + fang teeth / icicles across the arch!
        p.fill([-8, 0, 2], [8, 12, 15], 'void', (x, y, z) => Math.hypot(x / 7.2, y / 10.5) <= 1 && z > 3)
        p.paint((x, y, z) => (Math.hypot(x / 7.2, (y - 0.5) / 10.5) <= 1 && z > 6 ? 0 : undefined))
        p.fill([-7, 0, 2], [7, 10, 6], 'void', (x, y, z) => Math.hypot(x / 6.6, y / 9.5) <= 1)
        // Overhanging stalactite / icicle / obsidian fangs across the cave roof.
        const fangColor = fieldId === 'frost' ? 'accent' : fieldId === 'volcanic' ? 'rockLight' : 'rockDark'
        p.box([-5, 9, 8], [-4, 11, 9], fangColor)
          .box([0, 10, 8], [1, 12, 9], fangColor)
          .box([4, 9, 8], [5, 11, 9], fangColor)
        // Bold 2x2 blazing monster eyes peering out of the pitch-black abyss!
        p.box([-4, 4, 7], [-3, 5, 7], '*glow').box([2, 4, 7], [3, 5, 7], '*glow')
      }
    },
    pose: () => ({})
  }
}
