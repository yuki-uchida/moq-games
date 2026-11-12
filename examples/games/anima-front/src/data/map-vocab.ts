/**
 * Shared vocabulary between the map data (src/sim/maps) and the environment renderer (src/render):
 * what each `MapBox.style` means per kind, the decor kinds, and the anchor/path/spawn-tag names the modes use.
 */

/** `MapBox.style` per `MapBox.kind`. Unknown styles fall back to 0. */
export const BOX_STYLES = {
  building: {
    0: 'concrete office: grey panels, window grid, rooftop AC units',
    1: 'brick shop-house: red-brown brick, shop shutters and faded awnings on the ground floor',
    2: 'apartment block: cream tiles, balconies with railings',
    3: 'old wooden house: dark timber, tiled roof edge, sliding doors',
    4: 'station / public hall: large glass front, clock, canopy',
    5: 'warehouse: corrugated metal, roll-up doors, numbers painted on',
    6: 'animal-made outpost: patched wood and cloth, paper lanterns, paw-print banners',
    7: 'virtual block (arena): clean white surfaces, glowing cyan edges',
    8: 'ruin: broken concrete, exposed rebar, missing chunks, overgrown',
    9: 'crystal-crusted ruin (blight): dark walls swallowed by violet crystal'
  },
  roof: { 0: 'flat concrete roof with a parapet', 1: 'tiled roof', 2: 'metal roof', 3: 'virtual roof' },
  wall: {
    0: 'concrete wall',
    1: 'brick wall',
    2: 'sandbag barricade (ARK)',
    3: 'wooden barricade',
    4: 'virtual barrier panel',
    5: 'crystal wall'
  },
  platform: { 0: 'concrete slab / bridge', 1: 'wooden deck', 2: 'metal grating', 3: 'virtual platform' },
  stairs: { 0: 'concrete steps', 1: 'wooden steps', 2: 'metal steps', 3: 'virtual steps' },
  crate: { 0: 'wooden crate', 1: 'metal crate', 2: 'ARK supply crate (orange stripes)' },
  container: { 0: 'red', 1: 'blue', 2: 'green', 3: 'orange', 4: 'white', 5: 'rusted brown' },
  car: { 0: 'rusted sedan', 1: 'van', 2: 'bus', 3: 'small truck' },
  rock: { 0: 'boulder', 1: 'rubble pile' },
  crystal: { 0: 'crystal cluster', 1: 'tall crystal spire', 2: 'organic hive growth' },
  tree: { 0: 'cherry tree', 1: 'broadleaf tree', 2: 'dead tree', 3: 'pine', 4: 'virtual tree (arena)' },
  fence: { 0: 'chain-link fence', 1: 'guardrail', 2: 'wooden fence', 3: 'virtual rail' },
  pillar: { 0: 'concrete pillar', 1: 'steel column', 2: 'virtual pylon' },
  ground: {
    0: 'grass and soil',
    1: 'concrete pavement',
    2: 'dirt',
    3: 'plaza stone tiles',
    4: 'dock planks',
    5: 'crystal-crusted ground',
    6: 'virtual floor grid',
    7: 'water (not solid; set solid: false)'
  },
  road: { 0: 'asphalt road with lane marks', 1: 'sidewalk tiles', 2: 'crosswalk', 3: 'railway tracks' },
  barrier: { 0: 'invisible wall (never drawn)' }
} as const

/** Visual-only dressing (`MapDecor.kind`). `s` scales, `style` picks a variant. */
export const DECOR_KINDS = [
  'lamp', // street lamp (lit at night)
  'lantern', // paper lantern on a string/post (animal-made)
  'sign', // shop sign with invented text
  'vending', // rusty vending machine
  'bench',
  'bush',
  'grass', // grass tuft cluster
  'flowers',
  'ivy', // ivy patch on a wall face (yaw = facing)
  'moss',
  'debris', // small rubble
  'trash', // bags / bins
  'tire',
  'cone', // traffic cone
  'pole', // utility pole (wires connect consecutive poles with the same style)
  'banner', // ARK paw-print banner
  'flag',
  'puddle',
  'crane', // harbour gantry crane (visual; its legs are solid boxes)
  'buoy',
  'rope',
  'bollard',
  'crystalShard', // small violet crystal
  'pod', // blight organic pod (pulses)
  'tendril', // blight tendril over the ground
  'holo', // arena hologram panel / signage
  'arrow', // arena floor arrow
  'antenna',
  'watertank',
  'acunit',
  'cherryPetals' // drifting petals emitter
] as const
export type DecorKind = (typeof DECOR_KINDS)[number]

/**
 * Names the modes rely on (DESIGN §12, §14). Maps must provide them; modes must use only these.
 *
 * oldtown: anchors `lighthouse` (mission 1 objective), `gate` (west gate, mission 3 goal); path `cart` (≥ 8
 *   points, ~140 m, east market → gate); foe spawn tags `north` (creature ruins), `east`, `west`, `air`
 *   (flyers), `raid` (クロヅメ warp-in spots); squad base around the lighthouse, a second squad base near the
 *   cart route start (tag in `bases` order: [lighthouse base, cart base]).
 * harbor: anchors `zoneA`, `zoneB`, `zoneC` (capture points in order), `sea` (where ゴウテツ walks out of the
 *   water); foe spawn tags `drop` (machine drop zones), `sea`, `air`.
 * blight: anchors `node1`, `node2`, `node3`, `crater` (boss centre for the `crater` variant); foe spawn tags
 *   `node1`, `node2`, `node3`, `crater`, `air`.
 * arena: three team bases (team 0, 1, 2) with 4 spawns each, anchor `plaza`; fixed frog pads.
 * range: anchors `target1`…`target8` (static targets), `dummy` (dummy squad area), `tutorial1`…`tutorial8`
 *   (tutorial checkpoints in order); paths `mover1`, `mover2` (moving target lanes).
 */
export const MODE_NAMES = {
  oldtown: { anchors: ['lighthouse', 'gate'], paths: ['cart'], tags: ['north', 'east', 'west', 'air', 'raid'] },
  harbor: { anchors: ['zoneA', 'zoneB', 'zoneC', 'sea'], paths: [], tags: ['drop', 'sea', 'air'] },
  blight: {
    anchors: ['node1', 'node2', 'node3', 'crater'],
    paths: [],
    tags: ['node1', 'node2', 'node3', 'crater', 'air']
  },
  arena: { anchors: ['plaza'], paths: [], tags: [] },
  range: {
    anchors: [
      'target1',
      'target2',
      'target3',
      'target4',
      'target5',
      'target6',
      'target7',
      'target8',
      'dummy',
      'tutorial1',
      'tutorial2',
      'tutorial3',
      'tutorial4',
      'tutorial5',
      'tutorial6',
      'tutorial7',
      'tutorial8'
    ],
    paths: ['mover1', 'mover2'],
    tags: []
  }
} as const
