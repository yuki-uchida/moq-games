// Procedural models for the story-mode creatures, people and cars: three.js primitives in the same style as
// the rabbit and forest predators in scene.ts. Creatures come back as Actor rigs (limbs, ears, tail groups), so
// scene.animate() walks, flaps and idles them. Geometries and materials are shared and never disposed per actor.
import * as THREE from 'three'

export type Actor = {
  root: THREE.Group
  body: THREE.Group
  limbs: THREE.Group[]
  ears: THREE.Group[]
  tail?: THREE.Group
  belly?: THREE.Mesh
  dust?: THREE.Mesh
  marker?: { symbol: THREE.Sprite; meter: THREE.Sprite; fill: THREE.Sprite }
  /** Speech or bark bubble over the head. */
  bubble?: THREE.Sprite
  lastState?: string
  bark?: { text: string; until: number }
  alertAt: number
  pack?: THREE.Group
  /** Model of the chapter item in the rabbit's mouth, keyed by item id. */
  carried?: { id: string; object: THREE.Object3D }
  kind: string
  x: number
  z: number
  moving: number
  /** Height of the head top, for markers and speech bubbles. */
  top: number
}

export type ModelOptions = {
  /** Main colour: fur, feathers, shirt or paint. */
  color?: string
  /** People: trousers/skirt and hair colours, hair style. */
  pants?: string
  hair?: string
  long?: boolean
  /** A torch beam ahead (sewer workers). */
  flashlight?: boolean
  /** Dogs: overall size factor (1 = mid-size, 2.2 long). */
  size?: number
  /** Dogs: a lead rising toward the walker's hand. */
  leash?: boolean
}

const GEOMETRY = {
  sphere: new THREE.SphereGeometry(1, 12, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2)
}
const materials = new Map<string, THREE.Material>()
const BEAM = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.16, depthWrite: false })
function material(color: string, glow = false): THREE.Material {
  const key = `${color}:${glow}`
  let found = materials.get(key)
  if (!found)
    materials.set(
      key,
      (found = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        flatShading: true,
        emissive: glow ? color : '#000000'
      }))
    )
  return found
}

type V3 = [number, number, number]
function part(
  parent: THREE.Object3D,
  shape: keyof typeof GEOMETRY,
  color: string,
  [x, y, z]: V3,
  [sx, sy, sz]: V3,
  [rx, ry, rz]: V3 = [0, 0, 0],
  glow = false
) {
  const mesh = new THREE.Mesh(GEOMETRY[shape], material(color, glow))
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  mesh.rotation.set(rx, ry, rz)
  mesh.castShadow = Math.max(sx, sy, sz) > 0.25
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}
const group = (parent: THREE.Object3D, [x, y, z]: V3) => {
  const result = new THREE.Group()
  result.position.set(x, y, z)
  parent.add(result)
  return result
}
function rig(kind: string, top: number): Actor {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  return { root, body, limbs: [], ears: [], kind, x: NaN, z: NaN, moving: 0, alertAt: -Infinity, top }
}
const eyes = (parent: THREE.Object3D, y: number, z: number, spread: number, size: number) => {
  for (const side of [-1, 1]) part(parent, 'sphere', '#1d2427', [side * spread, y, z], [size, size * 1.1, size * 0.7])
}

/** Adult (6 m in game scale) or child (4.2 m): limbs are [left leg, right leg, left arm, right arm]. */
function person(kind: 'human' | 'child', options: ModelOptions): Actor {
  const actor = rig(kind, kind === 'child' ? 4.6 : 6.4)
  const body = actor.body
  body.scale.setScalar(kind === 'child' ? 0.7 : 1)
  const shirt = options.color ?? '#5b7fb0'
  const pants = options.pants ?? '#3c4250'
  const hair = options.hair ?? '#2e2420'
  const skin = '#f0c8a4'
  for (const side of [-1, 1]) {
    const leg = group(body, [side * 0.36, 2.8, 0])
    part(leg, 'cylinder', pants, [0, -1.3, 0], [0.3, 2.6, 0.3])
    part(leg, 'box', '#3a2f2a', [0, -2.68, 0.15], [0.42, 0.24, 0.8])
    actor.limbs.push(leg)
  }
  part(body, 'box', pants, [0, 2.95, 0], [1.25, 0.6, 0.7])
  part(body, 'cylinder', shirt, [0, 3.9, 0], [0.72, 1.9, 0.5])
  part(body, 'sphere', shirt, [0, 4.75, 0], [0.82, 0.32, 0.52])
  for (const side of [-1, 1]) {
    const arm = group(body, [side * 0.92, 4.7, 0])
    part(arm, 'cylinder', shirt, [0, -0.6, 0], [0.2, 1.2, 0.2])
    part(arm, 'cylinder', skin, [0, -1.55, 0], [0.16, 0.9, 0.16])
    part(arm, 'sphere', skin, [0, -2.05, 0], [0.2, 0.22, 0.2])
    if (side > 0 && options.flashlight) {
      part(arm, 'cylinder', '#2b2b2b', [0, -2.05, 0.25], [0.12, 0.5, 0.12], [Math.PI / 2, 0, 0])
      // A cheap beam: a soft cone pointing ahead and down, no light source.
      const beam = new THREE.Mesh(GEOMETRY.cone, BEAM)
      beam.position.set(0, -2.4, 3)
      beam.scale.set(1.6, 5.5, 1.6)
      beam.rotation.x = -Math.PI / 2 - 0.35
      arm.add(beam)
    }
    actor.limbs.push(arm)
  }
  // Swap so indices 0 and 3 (left leg, right arm) swing together.
  ;[actor.limbs[2], actor.limbs[3]] = [actor.limbs[3], actor.limbs[2]]
  part(body, 'cylinder', skin, [0, 5.0, 0], [0.2, 0.3, 0.2])
  const head = group(body, [0, 5.55, 0])
  part(head, 'sphere', skin, [0, 0, 0], [0.55, 0.6, 0.55])
  part(head, 'sphere', hair, [0, 0.18, -0.08], [0.6, 0.5, 0.58])
  if (options.long) part(head, 'box', hair, [0, -0.45, -0.35], [1, 1.1, 0.3])
  eyes(head, 0.02, 0.48, 0.2, 0.07)
  part(head, 'sphere', '#d98c7a', [0, -0.25, 0.48], [0.12, 0.05, 0.05])
  return actor
}

/** Four-legged animal: cats, dogs, rats, tanuki and toads share the rig, proportions differ. */
function quadruped(
  kind: string,
  look: {
    length: number
    height: number
    color: string
    belly?: string
    head: number
    ear: 'point' | 'flop' | 'round' | 'none'
    tail: 'thin' | 'bushy' | 'stub' | 'none'
    tailColor?: string
    mask?: string
    snout?: number
  }
): Actor {
  const { length, height, color } = look
  const actor = rig(kind, height + look.head * 2.2)
  const body = actor.body
  const torso = height * 0.62
  part(body, 'sphere', color, [0, torso, 0], [length * 0.22, height * 0.24, length * 0.42])
  if (look.belly)
    part(
      body,
      'sphere',
      look.belly,
      [0, torso - height * 0.08, length * 0.05],
      [length * 0.17, height * 0.18, length * 0.32]
    )
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const leg = group(body, [side * length * 0.13, torso - height * 0.05, end * length * 0.28])
      part(leg, 'cylinder', color, [0, -torso * 0.48, 0], [length * 0.05, torso * 0.95, length * 0.05])
      part(leg, 'sphere', look.belly ?? color, [0, -torso + 0.04, length * 0.02], [length * 0.06, 0.05, length * 0.08])
      actor.limbs.push(leg)
    }
  // Limb order by animate(): indices 0 and 3 (front-left, back-right... ) in phase gives a trot.
  const head = group(body, [0, torso + look.head * 0.9, length * 0.45])
  part(head, 'sphere', color, [0, 0, 0], [look.head, look.head * 0.9, look.head])
  if (look.mask)
    part(head, 'sphere', look.mask, [0, 0.02, look.head * 0.55], [look.head * 0.85, look.head * 0.35, look.head * 0.5])
  if (look.snout)
    part(
      head,
      'sphere',
      look.belly ?? color,
      [0, -look.head * 0.25, look.head * 0.85],
      [look.head * 0.45, look.head * 0.35, look.snout]
    )
  part(
    head,
    'sphere',
    '#2a2426',
    [0, -look.head * 0.1, look.head * (look.snout ? 0.85 + look.snout * 0.9 : 0.95)],
    [look.head * 0.14, look.head * 0.1, look.head * 0.1]
  )
  eyes(head, look.head * 0.2, look.head * 0.82, look.head * 0.4, look.head * 0.14)
  if (look.ear !== 'none')
    for (const side of [-1, 1]) {
      const ear = group(head, [side * look.head * 0.55, look.head * 0.7, -look.head * 0.1])
      if (look.ear === 'point')
        part(ear, 'cone', color, [0, look.head * 0.25, 0], [look.head * 0.3, look.head * 0.55, look.head * 0.18])
      else if (look.ear === 'flop')
        part(
          ear,
          'sphere',
          look.tailColor ?? color,
          [side * look.head * 0.15, -look.head * 0.3, 0],
          [look.head * 0.18, look.head * 0.5, look.head * 0.3]
        )
      else
        part(ear, 'sphere', '#e8a8a8', [0, look.head * 0.1, 0], [look.head * 0.32, look.head * 0.32, look.head * 0.08])
      actor.ears.push(ear)
    }
  if (look.tail !== 'none') {
    const tail = group(body, [0, torso + height * 0.05, -length * 0.42])
    const tailColor = look.tailColor ?? color
    if (look.tail === 'thin')
      part(tail, 'cylinder', tailColor, [0, length * 0.18, -length * 0.15], [0.05, length * 0.45, 0.05], [-0.7, 0, 0])
    else if (look.tail === 'bushy') {
      part(tail, 'sphere', tailColor, [0, 0, -length * 0.2], [length * 0.12, length * 0.12, length * 0.25])
      part(tail, 'sphere', '#2e2620', [0, 0, -length * 0.38], [length * 0.1, length * 0.1, length * 0.08])
    } else part(tail, 'sphere', tailColor, [0, 0.05, -0.05], [length * 0.07, length * 0.07, length * 0.07])
    actor.tail = tail
  }
  return actor
}

/** Bird rig. Flyers (crow) put wings in `limbs` so animate() flaps them; perched birds (pigeon, parakeet) step. */
function bird(
  kind: string,
  look: { size: number; color: string; head: string; wing: string; beak: string; flyer: boolean }
) {
  const s = look.size
  const actor = rig(kind, s * 1.6)
  const body = actor.body
  part(body, 'sphere', look.color, [0, s * 0.6, 0], [s * 0.35, s * 0.35, s * 0.55])
  const head = group(body, [0, s * 1.05, s * 0.35])
  part(head, 'sphere', look.head, [0, 0, 0], [s * 0.26, s * 0.26, s * 0.26])
  part(head, 'cone', look.beak, [0, -s * 0.02, s * 0.32], [s * 0.08, s * 0.22, s * 0.08], [Math.PI / 2, 0, 0])
  eyes(head, s * 0.06, s * 0.18, s * 0.15, s * 0.05)
  part(body, 'box', look.wing, [0, s * 0.6, -s * 0.65], [s * 0.3, s * 0.06, s * 0.45], [0.3, 0, 0])
  if (look.flyer)
    for (const side of [-1, 1]) {
      const wing = group(body, [side * s * 0.3, s * 0.7, 0])
      part(wing, 'sphere', look.wing, [side * s * 0.5, 0, -s * 0.05], [s * 0.6, s * 0.06, s * 0.35])
      actor.limbs.push(wing)
    }
  else {
    for (const side of [-1, 1]) {
      const wing = group(body, [side * s * 0.3, s * 0.65, 0])
      part(wing, 'sphere', look.wing, [0, 0, -s * 0.05], [s * 0.08, s * 0.25, s * 0.45])
    }
    for (const side of [-1, 1]) {
      const leg = group(body, [side * s * 0.12, s * 0.32, 0])
      part(leg, 'cylinder', '#d08a5a', [0, -s * 0.15, 0], [s * 0.03, s * 0.3, s * 0.03])
      actor.limbs.push(leg)
    }
  }
  return actor
}

function turtle(): Actor {
  const actor = rig('turtle', 1.4)
  const body = actor.body
  part(body, 'sphere', '#5c6b3c', [0, 0.45, 0], [0.9, 0.5, 1.1])
  part(body, 'sphere', '#c9b77a', [0, 0.3, 0], [0.85, 0.15, 1.05])
  for (let ring = 0; ring < 5; ring++) {
    const angle = ring * 1.256
    part(body, 'sphere', '#7a8a4c', [Math.cos(angle) * 0.45, 0.82, Math.sin(angle) * 0.55], [0.25, 0.1, 0.25])
  }
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const leg = group(body, [side * 0.75, 0.3, end * 0.7])
      part(leg, 'sphere', '#8a8a5a', [side * 0.1, -0.15, 0], [0.22, 0.14, 0.3])
      actor.limbs.push(leg)
    }
  const head = group(body, [0, 0.5, 1.15])
  part(head, 'sphere', '#8a8a5a', [0, 0, 0.1], [0.28, 0.25, 0.35])
  eyes(head, 0.08, 0.38, 0.14, 0.05)
  return actor
}

/** Story-mode creature or person; undefined for kinds scene.ts builds itself (rabbit and forest predators). */
export function buildModel(kind: string, options: ModelOptions = {}): Actor | undefined {
  switch (kind) {
    case 'human':
    case 'child':
      return person(kind, options)
    case 'cat':
      return quadruped(kind, {
        length: 1.8,
        height: 1.0,
        color: options.color ?? '#d59a52',
        belly: '#f2e2c8',
        head: 0.3,
        ear: 'point',
        tail: 'thin',
        snout: 0.12
      })
    case 'dog': {
      const size = options.size ?? 1
      const actor = quadruped(kind, {
        length: 2.2 * size,
        height: 1.5 * size,
        color: options.color ?? '#b07a4a',
        belly: '#ecd9b8',
        head: 0.36 * size,
        ear: 'flop',
        tail: 'stub',
        tailColor: options.color ?? '#8e5e36',
        snout: 0.28 * size
      })
      if (options.leash)
        part(actor.body, 'cylinder', '#c0392b', [0, 1.6 * size + 1.3, 0.75 * size], [0.04, 2.6, 0.04], [0.5, 0, 0])
      return actor
    }
    case 'rat':
      return quadruped(kind, {
        length: 0.8,
        height: 0.35,
        color: options.color ?? '#7d7470',
        belly: '#b9aea8',
        head: 0.13,
        ear: 'round',
        tail: 'thin',
        tailColor: '#d9a3a3',
        snout: 0.1
      })
    case 'tanuki':
      return quadruped(kind, {
        length: 1.7,
        height: 1.0,
        color: '#8a7358',
        belly: '#5a4a3a',
        head: 0.34,
        ear: 'round',
        tail: 'bushy',
        tailColor: '#7a6448',
        mask: '#2e2620',
        snout: 0.16
      })
    case 'toad': {
      const actor = quadruped(kind, {
        length: 0.9,
        height: 0.5,
        color: '#8a7a4a',
        belly: '#d8c89a',
        head: 0.26,
        ear: 'none',
        tail: 'none'
      })
      for (const side of [-1, 1]) part(actor.body, 'sphere', '#c8b25a', [side * 0.13, 0.62, 0.48], [0.09, 0.09, 0.09])
      return actor
    }
    case 'turtle':
      return turtle()
    case 'crow':
      return bird(kind, { size: 1.1, color: '#1e2126', head: '#24282e', wing: '#15181c', beak: '#2a2a2a', flyer: true })
    case 'pigeon':
      return bird(kind, {
        size: 0.9,
        color: '#9aa1ad',
        head: '#6c7a8a',
        wing: '#7e8693',
        beak: '#e0b0a0',
        flyer: false
      })
    case 'parakeet':
      return bird(kind, {
        size: 0.6,
        color: '#6cc04a',
        head: '#f2df4a',
        wing: '#3e8a3a',
        beak: '#f0b080',
        flyer: false
      })
    default:
      return undefined
  }
}

/** Car facing +z, `length` × `width` × `height` (game scale 16 × 6.5 × 5.5), sitting 0.9 above the road. */
export function buildCar(color: string, length = 16, width = 6.5, height = 5.5): THREE.Group {
  const car = new THREE.Group()
  const clearance = 0.9
  const lower = height * 0.5
  part(car, 'box', color, [0, clearance + lower / 2, 0], [width, lower, length])
  part(
    car,
    'box',
    color,
    [0, clearance + lower + (height - clearance - lower) / 2, -length * 0.05],
    [width * 0.88, height - clearance - lower, length * 0.55]
  )
  part(
    car,
    'box',
    '#25313d',
    [0, clearance + lower + (height - clearance - lower) / 2, -length * 0.05],
    [width * 0.9, (height - clearance - lower) * 0.6, length * 0.5]
  )
  for (const side of [-1, 1]) {
    part(
      car,
      'box',
      '#fff4c0',
      [side * width * 0.32, clearance + lower * 0.6, length / 2],
      [width * 0.18, 0.4, 0.1],
      [0, 0, 0],
      true
    )
    part(
      car,
      'box',
      '#d0302a',
      [side * width * 0.32, clearance + lower * 0.6, -length / 2],
      [width * 0.16, 0.35, 0.1],
      [0, 0, 0],
      true
    )
    for (const end of [-1, 1])
      part(car, 'wheel', '#1e1e1e', [side * width * 0.46, 1.1, end * length * 0.32], [0.5, 1.1, 1.1])
  }
  return car
}

/** Default model for a chapter item: a small parcel on a ring. */
export function buildItem(kind: string): THREE.Group {
  const item = new THREE.Group()
  let hash = 0
  for (const char of kind) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const color = `hsl(${hash % 360}, 55%, 60%)`
  part(item, 'box', color, [0, 0.2, 0], [0.4, 0.3, 0.3], [0, 0.4, 0])
  part(item, 'cylinder', '#f3d599', [0, 0.02, 0], [0.45, 0.02, 0.45])
  return item
}
