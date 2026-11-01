// Procedural models for the story-mode creatures, people and cars: rounded three.js primitives in the same toy-like
// style as the rabbit. Creatures come back as Actor rigs so scene.animate() walks, flaps and idles them: limbs
// swing on x with indices 0 and 3 in phase (quadrupeds: back-left, front-left, back-right, front-right; people:
// left leg, right leg, left arm, right arm, so each leg swings with the opposite arm), flyers flap two wings on z.
// Named characters (the family, タマ, ゴン, ガマ先生 …) have their own looks; everyone else varies by id.
// Geometries and materials are shared and never disposed per actor.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

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
  /** Predator or NPC id: named characters (mom, tama, gon …) pick their own look. */
  id?: string
  /** Main colour: fur, feathers, shirt or paint. */
  color?: string
  /** People: trousers/skirt and hair colours, long hair. Animals use `hair` as a coat colour. */
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

type V3 = [number, number, number]

const GEOMETRY = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  small: new THREE.SphereGeometry(1, 8, 6),
  box: new RoundedBoxGeometry(1, 1, 1, 2, 0.18),
  sharp: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 10),
  frustum: new THREE.CylinderGeometry(0.55, 1, 1, 16),
  ear: new THREE.ConeGeometry(1, 1, 4),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 10),
  torus: new THREE.TorusGeometry(1, 0.3, 8, 20),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2)
}
const materials = new Map<string, THREE.Material>()
const BEAM = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.16, depthWrite: false })

type Finish = { glow?: number; metal?: number; rough?: number }
function material(color: string, { glow = 0, metal = 0, rough = 0.85 }: Finish = {}): THREE.Material {
  const key = `${color}:${glow}:${metal}:${rough}`
  let found = materials.get(key)
  if (!found)
    materials.set(
      key,
      (found = new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: metal,
        emissive: glow ? color : '#000000',
        emissiveIntensity: glow || 1
      }))
    )
  return found
}

/** A shared unit shape placed, scaled and rotated under `parent`; small parts skip shadows. */
function part(
  parent: THREE.Object3D,
  shape: keyof typeof GEOMETRY,
  color: string | THREE.Material,
  [x, y, z]: V3,
  [sx, sy, sz]: V3,
  [rx, ry, rz]: V3 = [0, 0, 0]
) {
  const size = Math.max(sx, sy, sz)
  const geometry = shape === 'sphere' && size < 0.12 ? GEOMETRY.small : GEOMETRY[shape]
  const mesh = new THREE.Mesh(geometry, typeof color === 'string' ? material(color) : color)
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  mesh.rotation.set(rx, ry, rz)
  mesh.castShadow = size >= 0.18
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
/** Two eyes with a catch-light, facing +z. */
function eyes(parent: THREE.Object3D, y: number, z: number, spread: number, size: number, iris = '#1f2629') {
  for (const side of [-1, 1]) {
    part(parent, 'sphere', material(iris, { rough: 0.25 }), [side * spread, y, z], [size, size * 1.1, size * 0.6])
    part(
      parent,
      'sphere',
      material('#ffffff', { glow: 0.4, rough: 0.3 }),
      [side * spread - size * 0.25, y + size * 0.35, z + size * 0.45],
      [size * 0.3, size * 0.3, size * 0.15]
    )
  }
}
const hashOf = (text: string) => {
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

// ------------------------------------------------------------------ people

type PersonLook = {
  skin?: string
  hair?: string
  hairStyle?: 'short' | 'bob' | 'long' | 'bun' | 'cap' | 'pigtails' | 'bald'
  top?: string
  bottom?: string
  skirt?: boolean
  shoes?: string
  apron?: string
  glasses?: boolean
  backpack?: string
  hat?: string
  vest?: string
}

/** The family and recurring people. Matched on the id, or on a word in it (worker-2, jogger …). */
const PEOPLE: Record<string, PersonLook> = {
  mom: {
    hair: '#4a2f22',
    hairStyle: 'bun',
    top: '#e9a0a8',
    bottom: '#6c7b8f',
    skirt: true,
    apron: '#f3efe2',
    shoes: '#c7a37c'
  },
  dad: { hair: '#23201f', hairStyle: 'short', top: '#f4f4f0', bottom: '#2f3a4c', shoes: '#3a2a22', glasses: true },
  hinata: {
    hair: '#2a1d16',
    hairStyle: 'pigtails',
    top: '#f7d147',
    bottom: '#d9414e',
    skirt: true,
    shoes: '#ffffff',
    backpack: '#c9312f'
  },
  worker: { hair: '#222222', hat: '#e3b23c', top: '#3d6b4a', bottom: '#3d6b4a', shoes: '#1f1f1f', vest: '#f2c94c' },
  jogger: { hair: '#5a3825', hairStyle: 'long', top: '#3cb6c9', bottom: '#222831', shoes: '#ff6a3d' },
  angler: {
    hair: '#cfcfcf',
    hat: '#6b7a4a',
    top: '#8a9a6a',
    bottom: '#4b4b48',
    shoes: '#2a2a2a',
    vest: '#6b7a4a',
    glasses: true
  },
  keeper: { hair: '#3a2a22', hat: '#3f6b4a', top: '#5d8a5a', bottom: '#3f4b3a', shoes: '#3a2a22' },
  walker: { hair: '#6a4a3a', hairStyle: 'bob', top: '#c97b4a', bottom: '#4a5568', shoes: '#f4f4f0' }
}
const STYLES: PersonLook['hairStyle'][] = ['short', 'bob', 'long', 'bun', 'short', 'cap']
function personLook(kind: 'human' | 'child', options: ModelOptions): PersonLook {
  const id = options.id ?? ''
  const named = PEOPLE[id] ?? Object.entries(PEOPLE).find(([word]) => id.includes(word))?.[1]
  if (named) return named
  const hash = hashOf(id)
  return {
    hair: options.hair,
    hairStyle: options.long ? 'long' : STYLES[(hash >>> 4) % STYLES.length],
    top: options.color,
    bottom: options.pants,
    skirt: kind === 'child' ? !!(hash & 2) : !!(hash & 8) && !!options.long,
    shoes: ['#3a2a22', '#f4f4f0', '#2f3a4c', '#c0392b'][(hash >>> 7) % 4],
    backpack: kind === 'child' && hash & 1 ? ['#c9312f', '#2f5fb3', '#2a2a2a'][(hash >>> 9) % 3] : undefined,
    glasses: kind === 'human' && (hash >>> 11) % 5 === 0
  }
}

/**
 * A person at rabbit scale, about 6 tall (a child about 4.2). The camera mostly sees them from knee height, so
 * shoes, trousers and hands carry the identity; the face stays simple and friendly.
 */
function person(kind: 'human' | 'child', options: ModelOptions): Actor {
  const look = personLook(kind, options)
  const child = kind === 'child'
  const skin = look.skin ?? '#f1c7a5'
  const hair = look.hair ?? '#3a2a22'
  const top = look.top ?? '#5f87b8'
  const bottom = look.bottom ?? '#3d4a5c'
  const shoes = look.shoes ?? '#4a3a33'
  const leg = child ? 1.75 : 2.85
  const torso = child ? 1.35 : 1.95
  const headR = child ? 0.6 : 0.5
  const width = child ? 0.78 : 1
  const hip = leg + 0.1
  const shoulder = hip + torso * 0.82
  const headY = hip + torso + headR * 0.95
  const actor = rig(kind, headY + headR + 0.2)
  const { body, limbs } = actor
  for (const side of [-1, 1]) {
    const thigh = group(body, [side * 0.3 * width, hip, 0])
    part(thigh, 'capsule', look.skirt ? skin : bottom, [0, -leg * 0.47, 0], [0.24 * width, leg * 0.62, 0.24 * width])
    if (look.skirt && !child) part(thigh, 'capsule', '#3b3b44', [0, -leg * 0.62, 0], [0.245, leg * 0.3, 0.245])
    part(thigh, 'box', shoes, [0, -leg + 0.12, 0.16], [0.42 * width, 0.28, 0.78 * width])
    part(thigh, 'box', '#efe9df', [0, -leg + 0.02, 0.16], [0.44 * width, 0.07, 0.8 * width])
    limbs.push(thigh)
  }
  part(body, 'box', bottom, [0, hip + 0.05, 0], [1.08 * width, 0.6, 0.7 * width])
  if (look.skirt)
    part(body, 'frustum', bottom, [0, hip - (child ? 0.3 : 0.45), 0], [0.78 * width, child ? 0.8 : 1.15, 0.62 * width])
  part(body, 'capsule', top, [0, hip + torso * 0.52, 0], [0.56 * width, torso * 0.55, 0.38 * width])
  part(body, 'box', top, [0, shoulder - 0.16, 0], [1.2 * width, 0.46, 0.7 * width])
  if (look.vest) part(body, 'box', look.vest, [0, hip + torso * 0.55, 0], [1.16 * width, torso * 0.7, 0.8 * width])
  if (look.apron) {
    part(body, 'box', look.apron, [0, hip + torso * 0.3, 0.36 * width], [0.82 * width, torso * 0.85, 0.08])
    part(body, 'box', look.apron, [0, hip + torso * 0.78, 0.37 * width], [0.42 * width, 0.36, 0.06])
  }
  if (look.backpack) {
    part(body, 'box', look.backpack, [0, hip + torso * 0.62, -0.5 * width], [0.82 * width, 0.95, 0.5])
    part(body, 'box', '#d4af37', [0, hip + torso * 0.5, -0.76 * width], [0.18, 0.12, 0.04])
  }
  for (const side of [-1, 1]) {
    const arm = group(body, [side * 0.62 * width, shoulder - 0.08, 0])
    arm.rotation.z = side * 0.06
    part(arm, 'sphere', top, [0, -0.12, 0], [0.19 * width, 0.24, 0.2 * width])
    part(arm, 'capsule', top, [0, -torso * 0.3, 0], [0.15 * width, torso * 0.32, 0.15 * width])
    part(arm, 'capsule', skin, [0, -torso * 0.72, 0.02], [0.13 * width, torso * 0.2, 0.13 * width])
    part(arm, 'sphere', skin, [0, -torso * 0.92, 0.04], [0.17 * width, 0.2, 0.15 * width])
    if (options.flashlight && side > 0) {
      part(arm, 'cylinder', '#2c3036', [0, -torso * 0.95, 0.3], [0.09, 0.55, 0.09], [Math.PI / 2, 0, 0])
      part(
        arm,
        'cylinder',
        material('#fff4c4', { glow: 2 }),
        [0, -torso * 0.95, 0.58],
        [0.1, 0.03, 0.1],
        [Math.PI / 2, 0, 0]
      )
      // A cheap beam: a soft cone pointing ahead and down, no light source.
      const beam = new THREE.Mesh(GEOMETRY.cone, BEAM)
      beam.position.set(0, -torso * 0.95 - 0.4, 3)
      beam.scale.set(1.6, 5.5, 1.6)
      beam.rotation.x = -Math.PI / 2 - 0.35
      arm.add(beam)
    }
    limbs.push(arm)
  }
  // Head.
  part(body, 'cylinder', skin, [0, shoulder + 0.25, 0], [0.17 * width, 0.4, 0.17 * width])
  part(body, 'sphere', skin, [0, headY, 0.02], [headR * 0.92, headR, headR * 0.95])
  eyes(body, headY + headR * 0.08, headR * 0.82, headR * 0.34, headR * 0.12)
  part(body, 'sphere', '#e8a98d', [0, headY - headR * 0.14, headR * 0.93], [headR * 0.1, headR * 0.09, headR * 0.08])
  part(body, 'sphere', '#9c4d45', [0, headY - headR * 0.42, headR * 0.83], [headR * 0.18, headR * 0.05, headR * 0.06])
  for (const side of [-1, 1]) {
    part(
      body,
      'sphere',
      skin,
      [side * headR * 0.92, headY - headR * 0.05, 0],
      [headR * 0.14, headR * 0.22, headR * 0.12]
    )
    part(
      body,
      'sphere',
      '#f2a8a0',
      [side * headR * 0.55, headY - headR * 0.3, headR * 0.72],
      [headR * 0.16, headR * 0.09, headR * 0.05]
    )
    if (look.glasses)
      part(
        body,
        'torus',
        '#2b2b2b',
        [side * headR * 0.34, headY + headR * 0.08, headR * 0.92],
        [headR * 0.2, headR * 0.2, headR * 0.2]
      )
  }
  const style = look.hat ? 'short' : (look.hairStyle ?? 'short')
  if (style !== 'bald') {
    part(body, 'sphere', hair, [0, headY + headR * 0.22, -headR * 0.06], [headR * 0.98, headR * 0.86, headR])
    part(body, 'sphere', hair, [0, headY + headR * 0.55, headR * 0.45], [headR * 0.8, headR * 0.32, headR * 0.5])
  }
  if (style === 'bob' || style === 'long' || style === 'pigtails')
    part(
      body,
      'sphere',
      hair,
      [0, headY - headR * (style === 'long' ? 0.6 : 0.15), -headR * 0.3],
      [headR * 1.02, headR * (style === 'long' ? 1.5 : 0.95), headR * 0.85]
    )
  if (style === 'bun')
    part(body, 'sphere', hair, [0, headY + headR * 0.75, -headR * 0.6], [headR * 0.42, headR * 0.42, headR * 0.42])
  if (style === 'pigtails')
    for (const side of [-1, 1]) {
      part(
        body,
        'sphere',
        hair,
        [side * headR * 1.05, headY - headR * 0.1, -headR * 0.25],
        [headR * 0.32, headR * 0.6, headR * 0.32]
      )
      part(
        body,
        'sphere',
        '#e8455a',
        [side * headR * 0.95, headY + headR * 0.3, -headR * 0.25],
        [headR * 0.14, headR * 0.14, headR * 0.14]
      )
    }
  if (style === 'cap' || look.hat) {
    const cap = look.hat ?? '#2d5c8a'
    part(body, 'sphere', cap, [0, headY + headR * 0.45, -headR * 0.04], [headR * 1.02, headR * 0.62, headR * 1.04])
    part(body, 'box', cap, [0, headY + headR * 0.5, headR * 0.98], [headR * 1.3, headR * 0.08, headR * 0.7])
  }
  return actor
}

// ------------------------------------------------------------------ four-legged animals

type Frame = { length: number; shoulder: number; coat: string; belly?: string; legColor?: string; paws?: string }

/** Torso, chest and four jointed legs in scene.animate order; returns where the head and tail attach. */
function quadruped(actor: Actor, spec: Frame) {
  const { body, limbs } = actor
  const half = spec.length / 2
  const legLength = spec.shoulder * 0.62
  const bodyY = spec.shoulder * 0.86
  part(body, 'sphere', spec.coat, [0, bodyY, 0], [spec.shoulder * 0.42, spec.shoulder * 0.36, half * 0.82])
  part(
    body,
    'sphere',
    spec.belly ?? spec.coat,
    [0, bodyY - spec.shoulder * 0.08, half * 0.38],
    [spec.shoulder * 0.36, spec.shoulder * 0.34, half * 0.42]
  )
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const leg = group(body, [side * spec.shoulder * 0.24, bodyY - spec.shoulder * 0.08, end * half * 0.56])
      const thick = spec.shoulder * (end < 0 ? 0.13 : 0.11)
      if (end < 0)
        part(
          leg,
          'sphere',
          spec.coat,
          [0, -legLength * 0.1, -thick * 0.2],
          [thick * 1.3, legLength * 0.36, thick * 1.6]
        )
      part(leg, 'capsule', spec.legColor ?? spec.coat, [0, -legLength * 0.55, 0], [thick, legLength * 0.55, thick])
      part(
        leg,
        'sphere',
        spec.paws ?? spec.legColor ?? spec.coat,
        [0, -legLength * 1.02, thick * 0.5],
        [thick * 1.25, thick * 0.75, thick * 1.6]
      )
      limbs.push(leg)
    }
  return { bodyY, half, headY: bodyY + spec.shoulder * 0.42, headZ: half * 0.98 }
}

type CatLook = {
  coat?: string
  patches?: string[]
  stripes?: string
  belly?: string
  eyes?: string
  old?: boolean
  collar?: string
}
const CATS: Record<string, CatLook> = {
  tama: { coat: '#f4efe6', patches: ['#d48a3c', '#2c2622', '#d48a3c'], old: true, collar: '#c0392b' },
  tora: { coat: '#d9873e', stripes: '#9a5422', eyes: '#e9c13a' }
}
function cat(options: ModelOptions): Actor {
  const id = options.id ?? ''
  const hash = hashOf(id)
  const look: CatLook = CATS[id] ?? {
    coat: ['#4b4b52', '#2b2b30', '#e8e2d6', '#c98a4a', options.hair ?? '#8a7a6a'][hash % 5],
    stripes: hash & 4 ? '#3a3a40' : undefined,
    eyes: ['#9ad04a', '#e9c13a', '#7fb6d9'][(hash >>> 3) % 3]
  }
  const coat = look.coat ?? '#c9894a'
  const belly = look.belly ?? '#f4ead8'
  const actor = rig('cat', 1.9)
  const { bodyY, half, headY, headZ } = quadruped(actor, { length: 1.8, shoulder: 1, coat, belly, paws: belly })
  const { body, ears } = actor
  if (look.stripes)
    for (let index = 0; index < 4; index++)
      part(body, 'sphere', look.stripes, [0, bodyY + 0.06, -half * 0.55 + index * 0.32], [0.43, 0.33, 0.07])
  look.patches?.forEach((color, index) =>
    part(body, 'sphere', color, [(index % 2 ? 1 : -1) * 0.22, bodyY + 0.1, -0.3 + index * 0.35], [0.26, 0.24, 0.32])
  )
  part(body, 'sphere', coat, [0, headY - 0.18, headZ - 0.22], [0.26, 0.3, 0.26])
  const head = group(body, [0, headY, headZ])
  part(head, 'sphere', coat, [0, 0, 0], [0.36, 0.31, 0.32])
  part(head, 'sphere', belly, [0, -0.09, 0.22], [0.2, 0.13, 0.15])
  part(head, 'sphere', '#e99aa4', [0, -0.02, 0.33], [0.045, 0.035, 0.03])
  for (const side of [-1, 1]) {
    part(
      head,
      'sphere',
      material(look.eyes ?? '#c8d84a', { rough: 0.2 }),
      [side * 0.15, 0.06, 0.25],
      [0.075, look.old ? 0.04 : 0.075, 0.04]
    )
    part(head, 'sphere', '#111111', [side * 0.15, 0.06, 0.285], [0.018, look.old ? 0.03 : 0.065, 0.01])
    const ear = group(head, [side * 0.2, 0.22, -0.02])
    ear.rotation.z = -side * 0.25
    part(ear, 'ear', coat, [0, 0.12, 0], [0.12, 0.28, 0.07], [0, Math.PI / 4, 0])
    part(ear, 'ear', '#e8a3a8', [0, 0.1, 0.03], [0.07, 0.18, 0.03], [0, Math.PI / 4, 0])
    ears.push(ear)
    for (const tilt of [-0.12, 0.12])
      part(
        head,
        'cylinder',
        '#f6f1e6',
        [side * 0.24, -0.08 + tilt * 0.3, 0.26],
        [0.008, 0.32, 0.008],
        [0, 0, Math.PI / 2 + tilt * side]
      )
  }
  if (look.collar) {
    part(body, 'torus', look.collar, [0, headY - 0.22, headZ - 0.18], [0.24, 0.24, 0.24], [Math.PI / 2 - 0.4, 0, 0])
    part(
      body,
      'sphere',
      material('#e8c24a', { metal: 0.6, rough: 0.3 }),
      [0, headY - 0.38, headZ - 0.02],
      [0.06, 0.06, 0.06]
    )
  }
  // Tail: three segments curling up and over.
  const tail = group(body, [0, bodyY + 0.12, -half * 0.8])
  let link: THREE.Object3D = tail
  for (let index = 0; index < 3; index++) {
    const piece = group(link, index === 0 ? [0, 0, 0] : [0, 0.32, 0])
    piece.rotation.x = index === 0 ? -0.7 : -0.35
    part(piece, 'capsule', index === 2 && look.stripes ? look.stripes : coat, [0, 0.16, 0], [0.065, 0.2, 0.065])
    link = piece
  }
  actor.tail = tail
  return actor
}

type DogLook = {
  breed: 'shiba' | 'mutt' | 'retriever'
  coat?: string
  belly?: string
  collar?: string
  scruffy?: boolean
}
const DOGS: Record<string, DogLook> = { gon: { breed: 'shiba', collar: '#2f6fb3' } }
function dog(options: ModelOptions): Actor {
  const id = options.id ?? ''
  const hash = hashOf(id)
  const stray = id.includes('stray')
  const look: DogLook = DOGS[id] ?? {
    breed: stray ? 'mutt' : (['retriever', 'shiba', 'mutt'] as const)[hash % 3],
    coat: stray ? ['#8a6a4f', '#6d6258', '#a08060'][hash % 3] : undefined,
    collar: stray ? undefined : ['#d9414e', '#2f6fb3', '#38a169'][(hash >>> 2) % 3],
    scruffy: stray
  }
  const breed = look.breed
  const coat = look.coat ?? (breed === 'shiba' ? '#cf8a45' : breed === 'retriever' ? '#e3b86c' : '#8a6a4f')
  const belly = look.belly ?? (breed === 'shiba' ? '#f6ecd9' : coat)
  const size = options.size ?? 1
  const actor = rig('dog', 2.6 * size)
  const { bodyY, half, headY, headZ } = quadruped(actor, {
    length: 2.2,
    shoulder: 1.5,
    coat,
    belly,
    paws: breed === 'shiba' ? belly : coat
  })
  const { body, ears } = actor
  if (look.scruffy)
    for (let index = 0; index < 5; index++)
      part(
        body,
        'ear',
        coat,
        [((index % 3) - 1) * 0.25, bodyY + 0.5, -0.6 + index * 0.3],
        [0.1, 0.2, 0.1],
        [0.3, index, 0]
      )
  part(body, 'sphere', coat, [0, headY - 0.15, headZ - 0.28], [0.32, 0.42, 0.34])
  const head = group(body, [0, headY + 0.12, headZ])
  part(head, 'sphere', coat, [0, 0, 0], [0.4, 0.36, 0.38])
  part(head, 'box', breed === 'shiba' ? belly : coat, [0, -0.12, 0.38], [0.36, 0.26, 0.42])
  part(head, 'sphere', '#1d1d1f', [0, -0.03, 0.6], [0.09, 0.07, 0.06])
  part(head, 'sphere', '#c45a5a', [0, -0.25, 0.42], [0.12, 0.03, 0.12])
  eyes(head, 0.1, 0.3, 0.17, 0.065, '#3a2516')
  if (breed === 'shiba')
    for (const side of [-1, 1]) part(head, 'sphere', belly, [side * 0.2, -0.08, 0.22], [0.16, 0.13, 0.15])
  for (const side of [-1, 1]) {
    const ear = group(head, [side * 0.24, 0.26, -0.05])
    if (breed === 'shiba') {
      ear.rotation.z = -side * 0.15
      part(ear, 'ear', coat, [0, 0.14, 0], [0.14, 0.3, 0.08], [0, Math.PI / 4, 0])
    } else {
      ear.rotation.z = side * (breed === 'retriever' ? 0.5 : 0.25)
      part(ear, 'sphere', breed === 'retriever' ? coat : '#5f4a39', [side * 0.08, -0.16, 0], [0.1, 0.24, 0.16])
    }
    ears.push(ear)
  }
  if (look.collar) {
    part(body, 'torus', look.collar, [0, headY - 0.18, headZ - 0.24], [0.3, 0.3, 0.3], [Math.PI / 2 - 0.5, 0, 0])
    part(
      body,
      'sphere',
      material('#d7d7d7', { metal: 0.7, rough: 0.3 }),
      [0, headY - 0.4, headZ - 0.04],
      [0.06, 0.06, 0.06]
    )
  }
  if (options.leash) part(body, 'cylinder', '#c0392b', [0, headY + 1.2, headZ - 0.1], [0.04, 2.6, 0.04], [0.5, 0, 0])
  const tail = group(body, [0, bodyY + 0.2, -half * 0.82])
  if (breed === 'shiba') part(tail, 'torus', coat, [0, 0.28, -0.08], [0.2, 0.2, 0.32], [0, Math.PI / 2, 0])
  else part(tail, 'capsule', coat, [0, 0.1, -0.32], [0.08, 0.5, 0.08], [-1, 0, 0])
  actor.tail = tail
  actor.root.scale.setScalar(size)
  return actor
}

/** Rat: about 0.8 long, low and quick, round ears and a long bare tail. */
function rat(options: ModelOptions): Actor {
  const coat = ['#6d6460', '#5a524e', '#7d7066'][hashOf(options.id ?? '') % 3]
  const actor = rig('rat', 0.8)
  const { body, limbs, ears } = actor
  part(body, 'sphere', coat, [0, 0.3, -0.05], [0.24, 0.21, 0.42])
  part(body, 'sphere', '#b7aba0', [0, 0.24, 0.05], [0.18, 0.15, 0.3])
  const head = group(body, [0, 0.36, 0.38])
  part(head, 'sphere', coat, [0, 0, 0], [0.16, 0.14, 0.2])
  part(head, 'cone', coat, [0, -0.02, 0.2], [0.1, 0.22, 0.1], [Math.PI / 2, 0, 0])
  part(head, 'sphere', '#e7a3a8', [0, -0.02, 0.32], [0.035, 0.03, 0.03])
  eyes(head, 0.06, 0.12, 0.09, 0.035, '#140c0c')
  for (const side of [-1, 1]) {
    const ear = group(head, [side * 0.12, 0.12, -0.04])
    part(ear, 'cylinder', coat, [0, 0.04, 0], [0.08, 0.02, 0.08], [Math.PI / 2, 0, 0])
    part(ear, 'cylinder', '#e3a2a6', [0, 0.04, 0.012], [0.055, 0.02, 0.055], [Math.PI / 2, 0, 0])
    ears.push(ear)
    for (const tilt of [-0.15, 0.15])
      part(
        head,
        'cylinder',
        '#ddd5cc',
        [side * 0.1, -0.03, 0.22],
        [0.004, 0.2, 0.004],
        [0, 0, Math.PI / 2 + tilt * side]
      )
  }
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const leg = group(body, [side * 0.15, 0.18, end * 0.22])
      part(leg, 'capsule', coat, [0, -0.07, 0], [0.045, 0.08, 0.045])
      part(leg, 'sphere', '#e3a2a6', [0, -0.15, 0.03], [0.05, 0.025, 0.07])
      limbs.push(leg)
    }
  const tail = group(body, [0, 0.27, -0.44])
  let link: THREE.Object3D = tail
  for (let index = 0; index < 3; index++) {
    const piece = group(link, index === 0 ? [0, 0, 0] : [0, 0, -0.26])
    piece.rotation.x = 0.12
    part(
      piece,
      'cylinder',
      '#d99a9c',
      [0, 0, -0.13],
      [0.025 - index * 0.006, 0.27, 0.025 - index * 0.006],
      [Math.PI / 2, 0, 0]
    )
    link = piece
  }
  actor.tail = tail
  return actor
}

/** Tanuki: round, grey-brown, black mask and legs, bushy dark-tipped tail. */
function tanuki(): Actor {
  const coat = '#8d7a62'
  const actor = rig('tanuki', 1.6)
  const { bodyY, half, headY, headZ } = quadruped(actor, {
    length: 1.6,
    shoulder: 0.95,
    coat,
    belly: '#b9a68a',
    legColor: '#2d2620',
    paws: '#2d2620'
  })
  const { body, ears } = actor
  part(body, 'sphere', coat, [0, bodyY + 0.08, -0.05], [0.62, 0.56, 0.86])
  for (const side of [-1, 1]) part(body, 'sphere', coat, [side * 0.34, headY - 0.12, headZ - 0.1], [0.18, 0.2, 0.16])
  const head = group(body, [0, headY, headZ])
  part(head, 'sphere', coat, [0, 0, 0], [0.38, 0.33, 0.34])
  part(head, 'sphere', '#efe4cf', [0, -0.05, 0.22], [0.24, 0.16, 0.18])
  part(head, 'cone', '#efe4cf', [0, -0.08, 0.4], [0.1, 0.2, 0.1], [Math.PI / 2, 0, 0])
  part(head, 'sphere', '#1b1b1b', [0, -0.07, 0.5], [0.05, 0.04, 0.04])
  for (const side of [-1, 1]) {
    part(head, 'sphere', '#2a231e', [side * 0.17, 0.02, 0.22], [0.15, 0.1, 0.1], [0, 0, side * 0.3])
    part(head, 'sphere', '#120d0b', [side * 0.17, 0.05, 0.3], [0.045, 0.045, 0.03])
    part(head, 'sphere', material('#ffffff', { glow: 0.4 }), [side * 0.16, 0.07, 0.33], [0.012, 0.012, 0.01])
    const ear = group(head, [side * 0.23, 0.25, -0.05])
    part(ear, 'sphere', '#3a3029', [0, 0.04, 0], [0.1, 0.1, 0.05])
    ears.push(ear)
  }
  const tail = group(body, [0, bodyY + 0.05, -half * 0.85])
  part(tail, 'sphere', coat, [0, -0.05, -0.3], [0.22, 0.22, 0.42], [-0.4, 0, 0])
  part(tail, 'sphere', '#2d2620', [0, -0.18, -0.62], [0.15, 0.15, 0.15])
  actor.tail = tail
  return actor
}

/** Toad: warty olive dome with golden eyes on top; ガマ先生 wears tiny round glasses. */
function toad(options: ModelOptions): Actor {
  const glasses = options.id === 'gama'
  const actor = rig('toad', 1)
  const { body, limbs } = actor
  const skin = '#7d7b45'
  part(body, 'sphere', skin, [0, 0.36, 0], [0.48, 0.32, 0.5])
  part(body, 'sphere', '#c9bd84', [0, 0.26, 0.12], [0.4, 0.2, 0.38])
  for (let index = 0; index < 9; index++) {
    const angle = index * 2.4
    part(
      body,
      'sphere',
      '#5d5a31',
      [Math.cos(angle) * 0.3, 0.55 + (index % 3) * 0.03, Math.sin(angle) * 0.3 - 0.05],
      [0.06, 0.04, 0.06]
    )
  }
  part(body, 'sphere', skin, [0, 0.52, 0.32], [0.36, 0.22, 0.26])
  part(body, 'box', '#4b3d28', [0, 0.42, 0.55], [0.5, 0.03, 0.05])
  for (const side of [-1, 1]) {
    part(body, 'sphere', skin, [side * 0.17, 0.68, 0.38], [0.12, 0.11, 0.12])
    part(body, 'sphere', material('#d8a62c', { rough: 0.2 }), [side * 0.18, 0.7, 0.46], [0.08, 0.075, 0.05])
    part(body, 'sharp', '#1b1b1b', [side * 0.18, 0.7, 0.505], [0.07, 0.02, 0.01])
    if (glasses) part(body, 'torus', '#3d2f22', [side * 0.18, 0.7, 0.52], [0.1, 0.1, 0.1])
  }
  if (glasses) part(body, 'cylinder', '#3d2f22', [0, 0.72, 0.52], [0.012, 0.12, 0.012], [0, 0, Math.PI / 2])
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const leg = group(body, [side * 0.38, 0.22, end * 0.25])
      part(leg, 'sphere', skin, [side * 0.06, -0.06, 0], end < 0 ? [0.18, 0.13, 0.28] : [0.08, 0.15, 0.08])
      part(leg, 'sphere', '#9a9455', [side * 0.08, -0.19, 0.08], [0.11, 0.025, 0.12])
      limbs.push(leg)
    }
  return actor
}

/** Old pond turtle: domed plated shell, wrinkly neck and (for ゲンじい) a little white beard. */
function turtle(options: ModelOptions): Actor {
  const actor = rig('turtle', 1.1)
  const { body, limbs } = actor
  part(body, 'sphere', '#5b6b3a', [0, 0.42, 0], [0.62, 0.36, 0.78])
  part(body, 'cylinder', '#4b5530', [0, 0.32, 0], [0.66, 0.1, 0.82])
  for (let ring = 0; ring < 2; ring++)
    for (let index = 0; index < (ring ? 6 : 1); index++) {
      const angle = (index / 6) * Math.PI * 2
      part(
        body,
        'cylinder',
        '#76874c',
        [Math.cos(angle) * ring * 0.36, 0.73 - ring * 0.1, Math.sin(angle) * ring * 0.43],
        [0.16, 0.05, 0.16],
        [Math.sin(angle) * ring * 0.4, 0, -Math.cos(angle) * ring * 0.4]
      )
    }
  const neck = group(body, [0, 0.42, 0.72])
  part(neck, 'capsule', '#8b9467', [0, 0.04, 0.12], [0.12, 0.2, 0.12], [1.2, 0, 0])
  part(neck, 'sphere', '#8b9467', [0, 0.14, 0.32], [0.17, 0.14, 0.2])
  if (options.id === 'genji') part(neck, 'cone', '#f4f1e8', [0, -0.03, 0.38], [0.06, 0.16, 0.06], [Math.PI, 0, 0])
  eyes(neck, 0.2, 0.46, 0.09, 0.04, '#2a2215')
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const leg = group(body, [side * 0.5, 0.3, end * 0.48])
      part(leg, 'sphere', '#8b9467', [side * 0.08, -0.12, 0], [0.13, 0.16, 0.15])
      limbs.push(leg)
    }
  return actor
}

// ------------------------------------------------------------------ birds

type BirdLook = {
  size: number
  body: string
  wing: string
  head: string
  beak: string
  belly?: string
  eye?: string
  tail?: string
  legs?: string
}

/** Plump bird. Flyers flap two wings (the limbs); perching birds fold them and walk on two legs. */
function bird(kind: string, look: BirdLook, flyer: boolean): Actor {
  const s = look.size
  const actor = rig(kind, 1.2 * s)
  const { body, limbs } = actor
  part(body, 'sphere', look.body, [0, 0.55 * s, 0], [0.32 * s, 0.32 * s, 0.48 * s])
  if (look.belly) part(body, 'sphere', look.belly, [0, 0.48 * s, 0.12 * s], [0.27 * s, 0.26 * s, 0.32 * s])
  const head = group(body, [0, 0.9 * s, 0.32 * s])
  part(head, 'sphere', look.head, [0, 0, 0], [0.22 * s, 0.21 * s, 0.22 * s])
  part(head, 'cone', look.beak, [0, -0.03 * s, 0.26 * s], [0.07 * s, 0.2 * s, 0.07 * s], [Math.PI / 2, 0, 0])
  for (const side of [-1, 1]) {
    part(
      head,
      'sphere',
      material(look.eye ?? '#1b1b1b', { rough: 0.2 }),
      [side * 0.13 * s, 0.04 * s, 0.13 * s],
      [0.045 * s, 0.05 * s, 0.03 * s]
    )
    part(
      head,
      'sphere',
      material('#ffffff', { glow: 0.4 }),
      [side * 0.135 * s, 0.06 * s, 0.155 * s],
      [0.014 * s, 0.014 * s, 0.01 * s]
    )
    const wing = group(body, [side * 0.27 * s, 0.62 * s, 0])
    for (let feather = 0; feather < 3; feather++)
      if (flyer)
        part(
          wing,
          'sphere',
          feather % 2 ? look.wing : look.body,
          [side * (0.1 + feather * 0.12) * s, -feather * 0.02 * s, -feather * 0.07 * s],
          [0.18 * s, 0.05 * s, 0.38 * s]
        )
      else
        part(
          wing,
          'sphere',
          feather % 2 ? look.wing : look.body,
          [side * 0.03 * s, -feather * 0.04 * s, -(0.05 + feather * 0.1) * s],
          [0.07 * s, 0.2 * s, 0.4 * s],
          [0.25, 0, side * 0.15]
        )
    const leg = group(body, [side * 0.1 * s, 0.28 * s, 0.02 * s])
    part(leg, 'cylinder', look.legs ?? '#d08a6a', [0, -0.14 * s, 0], [0.025 * s, 0.28 * s, 0.025 * s])
    part(leg, 'sphere', look.legs ?? '#d08a6a', [0, -0.26 * s, 0.06 * s], [0.06 * s, 0.02 * s, 0.1 * s])
    limbs.push(flyer ? wing : leg)
  }
  const tail = group(body, [0, 0.6 * s, -0.42 * s])
  part(tail, 'box', look.tail ?? look.wing, [0, -0.04 * s, -0.2 * s], [0.26 * s, 0.05 * s, 0.4 * s], [-0.35, 0, 0])
  actor.tail = tail
  return actor
}

export function buildModel(kind: string, options: ModelOptions = {}): Actor | undefined {
  switch (kind) {
    case 'human':
    case 'child':
      return person(kind, options)
    case 'cat':
      return cat(options)
    case 'dog':
      return dog(options)
    case 'rat':
      return rat(options)
    case 'tanuki':
      return tanuki()
    case 'toad':
      return toad(options)
    case 'turtle':
      return turtle(options)
    case 'crow':
      return bird(
        kind,
        {
          size: 1.6,
          body: '#1d2028',
          wing: '#2b3140',
          head: '#1a1c22',
          beak: '#2a2a2e',
          eye: '#3a2a20',
          legs: '#2a2a2e'
        },
        true
      )
    case 'pigeon': {
      const actor = bird(
        kind,
        {
          size: 1.1,
          body: '#8f97a3',
          wing: '#a9b0ba',
          head: '#7c8592',
          beak: '#3a3a3a',
          belly: '#a2a6b8',
          eye: '#e47b24',
          tail: '#5d6470',
          legs: '#d9787a'
        },
        false
      )
      part(actor.body, 'sphere', material('#5d8f78', { rough: 0.3, metal: 0.4 }), [0, 0.86, 0.26], [0.22, 0.13, 0.2]) // iridescent neck
      for (const side of [-1, 1]) part(actor.body, 'sharp', '#3c4049', [side * 0.27, 0.66, -0.18], [0.03, 0.04, 0.22]) // wing bars
      return actor
    }
    case 'parakeet': {
      const actor = bird(
        kind,
        {
          size: 0.75,
          body: '#6cc24a',
          wing: '#e8e06a',
          head: '#f2e45c',
          beak: '#e7c98e',
          belly: '#7fd457',
          tail: '#2f62b8',
          legs: '#a8a0a0'
        },
        false
      )
      part(actor.body, 'sphere', '#4a74d8', [0, 0.69, 0.36], [0.05, 0.03, 0.03]) // cere
      for (const side of [-1, 1]) part(actor.body, 'sphere', '#24305e', [side * 0.07, 0.58, 0.34], [0.02, 0.02, 0.012]) // throat spots
      return actor
    }
    default:
      return undefined
  }
}

/** Car facing +z, `length` × `width` × `height` (game scale 16 × 6.5 × 5.5), sitting 0.9 above the road. */
export function buildCar(color: string, length = 16, width = 6.5, height = 5.5): THREE.Group {
  const car = new THREE.Group()
  const paint = material(color, { rough: 0.35, metal: 0.2 })
  const glass = material('#253545', { rough: 0.1, metal: 0.4 })
  const deck = 0.9
  // Tall vehicles get a boxy kei-van cabin, others a sedan's.
  const boxy = height > 5.8
  const lower = height * (boxy ? 0.38 : 0.35)
  const cabin = height - deck - lower
  part(car, 'box', paint, [0, deck + lower / 2, 0], [width, lower, length])
  const cabinLength = length * (boxy ? 0.74 : 0.52)
  const cabinZ = -length * (boxy ? 0.08 : 0.05)
  part(car, 'box', paint, [0, deck + lower + cabin / 2, cabinZ], [width * (boxy ? 0.94 : 0.86), cabin, cabinLength])
  // Windows: a glass band showing on all four sides of the cabin.
  part(
    car,
    'box',
    glass,
    [0, deck + lower + cabin * 0.5, cabinZ],
    [width * (boxy ? 0.955 : 0.875), cabin * 0.55, cabinLength * 1.02]
  )
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      part(car, 'wheel', '#1b1c1e', [side * width * 0.46, 1.25, end * length * 0.32], [0.9, 1.25, 1.25])
      part(
        car,
        'wheel',
        material('#b9bec4', { metal: 0.6, rough: 0.35 }),
        [side * width * 0.5, 1.25, end * length * 0.32],
        [0.35, 0.65, 0.65]
      )
    }
  for (const end of [-1, 1]) {
    part(car, 'box', '#2a2d31', [0, deck + 0.45, end * length * 0.5], [width * 1.02, 0.7, 0.6])
    part(car, 'sharp', '#f4f4ee', [0, deck + 0.95, end * length * 0.505], [1.6, 0.6, 0.1]) // plate
    for (const side of [-1, 1])
      part(
        car,
        'box',
        material(end > 0 ? '#fff6d8' : '#d6262c', { glow: end > 0 ? 1.2 : 0.8 }),
        [side * width * 0.36, deck + lower * 0.72, end * length * 0.5],
        [1.2, 0.55, 0.15]
      )
  }
  for (const side of [-1, 1])
    part(car, 'box', paint, [side * width * 0.52, deck + lower + 0.5, length * 0.12], [0.5, 0.45, 0.7]) // mirrors
  return car
}

/** Default model for a chapter item: a small parcel on a ring. */
export function buildItem(kind: string): THREE.Group {
  const item = new THREE.Group()
  const color = `hsl(${hashOf(kind) % 360}, 55%, 60%)`
  part(item, 'box', color, [0, 0.2, 0], [0.4, 0.3, 0.3], [0, 0.4, 0])
  part(item, 'cylinder', '#f3d599', [0, 0.02, 0], [0.45, 0.02, 0.45])
  return item
}
