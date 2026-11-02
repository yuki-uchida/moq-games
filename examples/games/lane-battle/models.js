import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { beats, gait, flinch, knockout, KO_SECONDS } from './animation.js'

// Characters are built in model space: ~0.9 tall, base at y=0, face toward +Z. Their rig lives in the
// lane frame instead (+X toward the foe, +Y up, +Z toward the viewer), so every swing is a rotation about Z
// in the screen plane and every lunge travels along the lane; meshes are turned by FACE toward the viewer.
const FACE = 0.6
const COS = Math.cos(FACE),
  SIN = Math.sin(FACE)
const toLane = ([x, y, z]) => new THREE.Vector3(x * COS + z * SIN, y, -x * SIN + z * COS)
/** Euler (YXZ) that turns a +Y-pointing part to point along the lane (+X) after FACE, then rolls it by `roll`. */
const ALONG = (roll = 0) => [0, -FACE, roll - Math.PI / 2, 'YXZ']
export { KO_SECONDS }

// ── Geometry ──
const lathe = (points, segments = 28) =>
  new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  )
/** Unit cylinder (radius 1, height 1, centered) with rounded rims. */
function roundedCylinder(bevel = 0.2) {
  const pts = [[0, -0.5]]
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * (Math.PI / 2)
    pts.push([1 - bevel + bevel * Math.cos(a), -0.5 + bevel + bevel * Math.sin(a)])
  }
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2)
    pts.push([1 - bevel + bevel * Math.cos(a), 0.5 - bevel + bevel * Math.sin(a)])
  }
  pts.push([0, 0.5])
  return lathe(pts, 28)
}
/** The poop swirl: one soft coil winding three times, narrowing coil by coil, grooved where it meets itself. */
const TURNS = 3,
  SWIRL_H = 0.84
function swirlAt(v, u) {
  const level = TURNS * v - u / (Math.PI * 2)
  const s = level - Math.floor(level)
  const bulge = Math.sqrt(Math.max(0, 1 - (2 * s - 1) ** 2))
  const foot = Math.min(1, v / 0.07)
  const cap = v > 0.78 ? Math.sqrt(Math.max(0, 1 - ((v - 0.78) / 0.22) ** 2)) : 1
  const env = (0.47 - 0.1 * Math.max(0, level)) * Math.sqrt(foot * (2 - foot)) * cap
  const fade = Math.min(1, v / 0.08)
  return { r: env * (1 - 0.27 * fade * (1 - bulge)), shade: 1 - 0.32 * fade * (1 - bulge) ** 1.5 }
}
/** A parametric surface of revolution, closed in u; `at(j, i)` gives [x, y, z, shade]. */
function revolve(nu, nv, at, closeTop) {
  const pos = [],
    shade = [],
    index = []
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i < nu; i++) {
      const [x, y, z, k = 1] = at(j, i)
      pos.push(x, y, z)
      shade.push(k)
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * nu + i,
        b = j * nu + ((i + 1) % nu)
      index.push(a, b, a + nu, b, b + nu, a + nu)
    }
  if (closeTop) {
    const top = pos.length / 3
    pos.push(...closeTop)
    shade.push(1)
    for (let i = 0; i < nu; i++) index.push(nv * nu + i, nv * nu + ((i + 1) % nu), top)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}
const swirlGeometry = () =>
  revolve(
    48,
    90,
    (j, i) => {
      const v = j / 90,
        u = (i / 48) * Math.PI * 2
      const { r, shade } = swirlAt(v, u)
      return [Math.sin(u) * r, v * SWIRL_H, Math.cos(u) * r, shade]
    },
    [0, SWIRL_H + 0.004, 0]
  )
/** A belt wrapped tight around the swirl between heights y0..y1 (model units), `lift` proud of the coil. */
function swirlBand(y0, y1, lift = 0.016) {
  const nu = 64,
    h = y1 - y0,
    d = Math.min(0.022, h * 0.3),
    profile = []
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    profile.push([
      Math.max(-d, Math.min(d, Math.cos(a) * d * 1.6)),
      y0 + h / 2 + Math.max(-h / 2, Math.min(h / 2, Math.sin(a) * h * 0.62))
    ])
  }
  return revolve(nu, profile.length, (j, i) => {
    const [dr, y] = profile[j % profile.length]
    const u = (i / nu) * Math.PI * 2
    const r = swirlAt(Math.min(1, Math.max(0, y / SWIRL_H)), u).r + lift + d + dr
    return [Math.sin(u) * r, y, Math.cos(u) * r]
  })
}
/** A sheet with an inner face (shrunk by `inset`) so it reads from both sides without a double-sided material. */
function twoSided(g, [ix, iy, iz]) {
  const back = g.clone()
  back.scale(ix, iy, iz)
  const index = back.index.array
  for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]]
  const n = back.attributes.normal
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  return mergeGeometries([g, back])
}
/** The curled tip on top of a poop, bending toward the lead side (+X). */
function tipGeometry() {
  const g = new THREE.ConeGeometry(0.1, 0.22, 16, 6)
  g.translate(0, 0.11, 0)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / 0.22
    p.setX(i, p.getX(i) + 0.1 * t * t)
  }
  g.computeVertexNormals()
  return g
}
const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 16),
  ball: new THREE.SphereGeometry(1, 12, 8),
  hemi: new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  bowl: new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.16),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  rcyl: roundedCylinder(),
  tapered: new THREE.CylinderGeometry(1, 0.78, 1, 24),
  cone: new THREE.ConeGeometry(1, 1, 20),
  ring: new THREE.TorusGeometry(1, 0.13, 10, 32),
  arc: new THREE.TorusGeometry(1, 0.26, 8, 16, Math.PI),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 16),
  drop: lathe([
    [0, 0],
    [0.55, 0.12],
    [0.62, 0.32],
    [0.42, 0.62],
    [0.12, 0.9],
    [0, 1]
  ]),
  swirl: swirlGeometry(),
  tip: tipGeometry(),
  bottle: lathe([
    [0, 0],
    [0.2, 0],
    [0.23, 0.04],
    [0.23, 0.5],
    [0.17, 0.62],
    [0.09, 0.72],
    [0.08, 0.9],
    [0, 0.9]
  ]),
  cupBand: lathe([
    [0.236, 0.16],
    [0.256, 0.162],
    [0.287, 0.418],
    [0.267, 0.42]
  ]),
  cupBody: lathe([
    [0, 0],
    [0.2, 0],
    [0.23, 0.02],
    [0.3, 0.6],
    [0, 0.6]
  ]),
  cape: twoSided(new THREE.CylinderGeometry(1, 1.25, 1, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76), [0.96, 1, 0.96]),
  flare: twoSided(new THREE.CylinderGeometry(1, 1.32, 1, 32, 1, true), [0.95, 1, 0.95]),
  hood: twoSided(new THREE.SphereGeometry(1, 24, 10, Math.PI / 2, Math.PI, 0, Math.PI / 2), [0.9, 0.94, 0.9]),
  tub: lathe([
    [0, 0],
    [0.8, 0],
    [0.93, 0.35],
    [1, 0.85],
    [0.97, 1],
    [0, 1]
  ]),
  pedestal: lathe([
    [0, 0],
    [0.17, 0],
    [0.18, 0.03],
    [0.14, 0.12],
    [0.15, 0.19],
    [0.25, 0.31],
    [0.3, 0.38],
    [0.3, 0.41],
    [0, 0.41]
  ])
}

// ── Materials ──
const TONES = new THREE.DataTexture(new Uint8Array([105, 185, 255]), 3, 1, THREE.RedFormat)
TONES.minFilter = TONES.magFilter = THREE.NearestFilter
TONES.needsUpdate = true
const OUTLINE = { value: 0.018 }
const LINE = '#2b1a12'
function lineMaterial(color) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outline = OUTLINE
    shader.vertexShader =
      'uniform float outline;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += normalize(normal) * outline;'
      )
  }
  return m
}

// ── Kit: parts, bones and faces for one character ──
const CHAIN = ['hips', 'spine', 'chest', 'head']
const INK = '#24150c'
/** Face colours kept out of the hit flash, so a white character's ＞＜ face still reads while it flashes. */
const FACE_INK = new Set([INK, '#5e6280', '#7a5a9a', '#5a1a14', '#e8575a'])
class Kit {
  parts = []
  rigs = {}
  chain = [0.28, 0.52, 0.74]
  /** A rigid bone hanging from `parent`, pivoting at `pivot` (model space). */
  bone(name, parent, pivot) {
    this.rigs[name] = { parent, pivot }
  }
  /** o: { bone, glow, alpha, line, skin } — skin pins a body part to one chain bone instead of blending by height. */
  add(geometry, color, at = [0, 0, 0], scale = 1, rotation = [0, 0, 0], o = {}) {
    const [rx, ry, rz, order = 'XYZ'] = rotation
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)),
      Array.isArray(scale) ? new THREE.Vector3(...scale) : new THREE.Vector3(scale, scale, scale)
    )
    this.parts.push({
      geometry,
      m,
      color,
      alpha: o.alpha ?? 1,
      finish: o.glow ? 'glow' : o.alpha ? 'clear' : o.line === false && FACE_INK.has(color) ? 'ink' : 'toon',
      bone: o.bone ?? 'body',
      skin: o.skin,
      line: o.line ?? !(o.glow || o.alpha)
    })
  }
  /** Eyes, brows, mouths and the expressions used by attacks and hit reactions. */
  face({ bone = 'spine', x: cx = 0, y, z, spread = 0.12, size = 1, mood = 'happy' }) {
    const s = size
    for (const name of ['eyes', 'squint', 'ko']) this.bone(name, bone, [cx, y, z])
    for (const name of ['mouth', 'shout']) this.bone(name, bone, [cx, y - 0.15 * s, z + 0.01])
    const line = { line: false }
    for (const side of [-1, 1]) {
      const x = cx + side * spread
      this.add(GEO.sphere, '#fffdf8', [x, y, z], [0.082 * s, 0.098 * s, 0.05 * s], undefined, { bone: 'eyes' })
      this.add(
        GEO.sphere,
        INK,
        [x + 0.016 * s, y - 0.006 * s, z + 0.036 * s],
        [(mood === 'hyper' ? 0.032 : 0.05) * s, (mood === 'hyper' ? 0.04 : 0.064) * s, 0.026 * s],
        undefined,
        { bone: 'eyes', ...line }
      )
      this.add(GEO.ball, '#ffffff', [x + 0.03 * s, y + 0.03 * s, z + 0.058 * s], 0.019 * s, undefined, {
        bone: 'eyes',
        glow: true
      })
      // ＞＜ while hurt: two strokes per eye pointing at the nose.
      for (const t of [-1, 1])
        this.add(
          GEO.capsule,
          INK,
          [x - side * 0.005 * s, y + t * 0.024 * s, z + 0.03 * s],
          [0.026 * s, 0.07 * s, 0.026 * s],
          [0, 0, Math.PI / 2 + side * t * 0.55],
          { bone: 'squint', ...line }
        )
      // ×× when knocked out.
      for (const t of [-1, 1])
        this.add(GEO.capsule, INK, [x, y, z + 0.03 * s], [0.026 * s, 0.1 * s, 0.026 * s], [0, 0, t * 0.785], {
          bone: 'ko',
          ...line
        })
      if (mood === 'angry' || mood === 'proud')
        this.add(
          GEO.capsule,
          INK,
          [x, y + 0.11 * s, z + 0.03 * s],
          [0.035 * s, 0.13 * s, 0.03 * s],
          [0, 0, Math.PI / 2 + side * (mood === 'angry' ? 0.42 : -0.2)],
          { bone, ...line }
        )
      if (mood === 'sleepy') {
        this.add(
          GEO.hemi,
          '#5e6280',
          [x, y + 0.004 * s, z + 0.004 * s],
          [0.088 * s, 0.07 * s, 0.056 * s],
          [0.25, 0, 0],
          {
            bone: 'eyes',
            ...line
          }
        )
        this.add(
          GEO.capsule,
          '#7a5a9a',
          [x, y - 0.1 * s, z + 0.01 * s],
          [0.02 * s, 0.08 * s, 0.02 * s],
          [0, 0, Math.PI / 2],
          {
            bone,
            ...line
          }
        )
      }
      const cheek = { happy: '#ff9fae', drunk: '#ff5a62', cool: '#8fd3ff', proud: '#ff9fae' }[mood]
      if (cheek)
        this.add(
          GEO.ball,
          cheek,
          [cx + side * spread * 1.45, y - 0.1 * s, z - 0.005],
          [0.055 * s, 0.03 * s, 0.02 * s],
          undefined,
          {
            bone,
            alpha: mood === 'drunk' ? 0.9 : 0.75
          }
        )
    }
    const my = y - 0.15 * s
    if (mood === 'sleepy')
      this.add(GEO.capsule, INK, [cx, my + 0.01 * s, z + 0.03], [0.02 * s, 0.07 * s, 0.02 * s], [0, 0, Math.PI / 2], {
        bone: 'mouth',
        ...line
      })
    else
      this.add(
        GEO.arc,
        INK,
        [cx, my + (mood === 'angry' ? -0.03 : 0.02) * s, z + 0.03],
        [(mood === 'hyper' ? 0.1 : 0.07) * s, (mood === 'hyper' ? 0.08 : 0.06) * s, 0.06 * s],
        [0, 0, mood === 'angry' ? 0 : Math.PI],
        { bone: 'mouth', ...line }
      )
    this.add(GEO.sphere, '#5a1a14', [cx, my, z + 0.02], [0.07 * s, 0.06 * s, 0.035 * s], undefined, {
      bone: 'shout',
      line: false
    })
    this.add(GEO.ball, '#e8575a', [cx, my - 0.03 * s, z + 0.035], [0.045 * s, 0.022 * s, 0.02 * s], undefined, {
      bone: 'shout',
      line: false
    })
  }
}
function pivotOf(kit, name) {
  const i = CHAIN.indexOf(name)
  return i < 0 ? kit.rigs[name].pivot : [0, i ? kit.chain[i - 1] : 0, 0]
}

/** Vertex colours plus skin weights: body parts blend along the chain by height, bone parts follow their bone. */
function painted(part, weigh) {
  let g = part.geometry.clone()
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
  if (!g.index) g = mergeVertices(g)
  g.applyMatrix4(part.m)
  const c = new THREE.Color(part.color)
  const n = g.attributes.position.count
  const shade = part.geometry.attributes.shade
  const color = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const k = shade && n === shade.count ? shade.getX(i) : 1
    color.set([c.r * k, c.g * k, c.b * k, part.alpha], i * 4)
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 4))
  weigh(g, part)
  return g
}
/** Inverted-hull outline: positions welded so smoothed normals push every shell out without cracks. */
function hull(part, weigh) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', part.geometry.attributes.position.clone())
  if (part.geometry.index) g.setIndex(part.geometry.index.clone())
  g.applyMatrix4(part.m)
  const w = mergeVertices(g, 1e-4)
  w.computeVertexNormals()
  weigh(w, part)
  return w
}
const templates = new Map()
const BANDS = 13
/**
 * Every part of a character is skinned to one skeleton (the chain plus its rigid bones) and merged per
 * finish, so a character costs a handful of draw calls; hidden bones collapse to zero scale.
 */
function template(key) {
  if (templates.has(key)) return templates.get(key)
  const recipe = MODELS[key] ?? MODELS.katachi
  const kit = new Kit()
  recipe.build(kit)
  const heights = [0, ...kit.chain]
  const centers = heights.map((h, i) =>
    i < heights.length - 1 ? (h + heights[i + 1]) / 2 : h + (h - heights[i - 1]) / 2
  )
  const order = [...CHAIN, ...Object.keys(kit.rigs)]
  const weigh = (g, part) => {
    const p = g.attributes.position,
      n = p.count
    const index = new Uint16Array(n * 4),
      weight = new Float32Array(n * 4)
    const fixed = order.indexOf(part.bone === 'body' ? part.skin : part.bone)
    for (let i = 0; i < n; i++) {
      if (fixed >= 0) {
        index[i * 4] = fixed
        weight[i * 4] = 1
        continue
      }
      const y = p.getY(i)
      let j = 0
      while (j < centers.length - 1 && y > centers[j + 1]) j++
      const t =
        j === centers.length - 1 ? 0 : Math.min(1, Math.max(0, (y - centers[j]) / (centers[j + 1] - centers[j])))
      index[i * 4] = j
      weight[i * 4] = 1 - t
      index[i * 4 + 1] = Math.min(j + 1, centers.length - 1)
      weight[i * 4 + 1] = t
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4))
  }
  const meshes = []
  for (const finish of ['toon', 'ink', 'clear', 'glow']) {
    const parts = kit.parts.filter((p) => p.finish === finish)
    if (parts.length) meshes.push([finish, mergeGeometries(parts.map((p) => painted(p, weigh)))])
  }
  const lined = kit.parts.filter((p) => p.line)
  if (lined.length) meshes.push(['line', mergeGeometries(lined.map((p) => hull(p, weigh)))])
  // How far the body (not its props or effects) reaches toward the foe at rest, per 0.1-high band, in model units.
  const profile = new Array(BANDS).fill(-Infinity)
  for (const p of kit.parts.filter((p) => p.bone === 'body')) {
    const v = p.geometry.attributes.position,
      at = new THREE.Vector3()
    for (let i = 0; i < v.count; i++) {
      at.fromBufferAttribute(v, i).applyMatrix4(p.m)
      const band = Math.min(BANDS - 1, Math.max(0, Math.floor(at.y / 0.1)))
      profile[band] = Math.max(profile[band], toLane(at.toArray()).x)
    }
  }
  const front = Math.max(...profile)
  const t = { recipe, kit, heights, order, meshes, front, profile, moves: { ...MOVES, ...recipe.moves } }
  templates.set(key, t)
  return t
}

// ── Shared building blocks ──
const BROWN = '#7a4722'
const GOLD = '#f2c14e'
/** A poop: the swirl, its curled tip, a glossy streak and a face; arms are stubby mittens. */
function poop(k, color, { sx = 1, sy = 1, face = { y: 0.4, z: 0.3 }, mood = 'happy', arms = ['B', 'F'] } = {}) {
  k.chain = [0.26 * sy, 0.5 * sy, 0.72 * sy]
  k.add(GEO.swirl, color, [0, 0, 0], [sx, sy, sx])
  k.add(GEO.tip, color, [0, 0.83 * sy, 0], [sx, sy, sx])
  k.add(GEO.ball, '#fff1dc', [0.05 * sx, 0.55 * sy, 0.25 * sx], [0.075, 0.02, 0.02], [0.2, 0.55, 0.32], {
    glow: true,
    alpha: 0.6
  })
  k.add(GEO.ball, '#fff1dc', [0.14 * sx, 0.24 * sy, 0.36 * sx], [0.06, 0.018, 0.02], [0.1, 0.4, 0.2], {
    glow: true,
    alpha: 0.5
  })
  k.face({ bone: 'spine', y: face.y, z: face.z, spread: 0.12 * Math.min(sx, 1.1), mood })
  for (const which of arms) mitten(k, which, color, [(which === 'F' ? 1 : -1) * 0.37 * sx, 0.27 * sy, 0.05])
}
/** A stubby arm with a round mitten, hanging down and out from `pivot`; bone armF (lead side) or armB (near side). */
function mitten(k, which, color, pivot, parent = 'spine', length = 0.13, hand = 0.062) {
  const side = which === 'F' ? 1 : -1
  const name = `arm${which}`
  k.bone(name, parent, pivot)
  const d = [side * 0.5, -0.86, 0.12]
  k.add(
    GEO.capsule,
    color,
    [pivot[0] + (d[0] * length) / 2, pivot[1] + (d[1] * length) / 2, pivot[2] + (d[2] * length) / 2],
    [0.085, length * 0.9, 0.085],
    [0, 0, side * 0.52],
    { bone: name }
  )
  k.add(
    GEO.sphere,
    color,
    [pivot[0] + d[0] * length, pivot[1] + d[1] * length, pivot[2] + d[2] * length],
    hand,
    undefined,
    {
      bone: name
    }
  )
  return [pivot[0] + d[0] * length, pivot[1] + d[1] * length, pivot[2] + d[2] * length]
}
/** A person of the cleanup crew: legs, a uniform, arms and a head; the head is pinned to the head bone. */
function person(k, uniform, { mood = 'angry', pants = '#2c3344' } = {}) {
  k.chain = [0.3, 0.5, 0.66]
  for (const [which, side] of [
    ['F', 1],
    ['B', -1]
  ]) {
    const name = `leg${which}`
    k.bone(name, 'hips', [side * 0.08, 0.3, 0])
    k.add(GEO.capsule, pants, [side * 0.08, 0.17, 0], [0.12, 0.22, 0.12], undefined, { bone: name })
    k.add(GEO.rbox, '#2a2420', [side * 0.08, 0.035, 0.04], [0.11, 0.07, 0.17], undefined, { bone: name })
  }
  k.add(GEO.capsule, uniform, [0, 0.46, 0], [0.34, 0.3, 0.26], undefined, { skin: 'spine' })
  k.add(GEO.cyl, '#3a2a20', [0, 0.32, 0], [0.165, 0.04, 0.13])
  k.add(GEO.sphere, '#f0c7a0', [0, 0.78, 0], 0.17, undefined, { skin: 'head' })
  k.add(GEO.ball, '#e8b48c', [0, 0.765, 0.165], [0.03, 0.035, 0.03], undefined, { skin: 'head', line: false })
  k.face({ bone: 'head', y: 0.8, z: 0.14, spread: 0.065, size: 0.55, mood })
  for (const [which, side] of [
    ['F', 1],
    ['B', -1]
  ]) {
    const name = `arm${which}`
    k.bone(name, 'chest', [side * 0.19, 0.58, 0])
    k.add(GEO.capsule, uniform, [side * 0.21, 0.47, 0.01], [0.09, 0.2, 0.09], [0, 0, side * 0.15], { bone: name })
    k.add(GEO.sphere, '#f0c7a0', [side * 0.23, 0.35, 0.02], 0.045, undefined, { bone: name })
  }
}
/** A broom, mop or scepter shaft held at `grip` by `bone`, running along `dir` (model space, unit). */
function shaft(k, bone, grip, dir, up, down, color = '#c9a46a', radius = 0.016) {
  const len = up + down
  const mid = (up - down) / 2
  const rot = [0, 0, -Math.atan2(dir[0], dir[1])]
  k.add(GEO.cyl, color, [grip[0] + dir[0] * mid, grip[1] + dir[1] * mid, grip[2]], [radius, len, radius], rot, { bone })
  return (t) => [grip[0] + dir[0] * t, grip[1] + dir[1] * t, grip[2]]
}

/** A flickering flame: an orange teardrop around a yellow core, standing on `at`. */
function flame(k, bone, at, h) {
  k.add(GEO.drop, '#ff6a1c', at, [h * 0.42, h, h * 0.42], undefined, { bone, glow: true })
  k.add(GEO.drop, '#ffd23c', [at[0], at[1] + h * 0.04, at[2] + h * 0.12], [h * 0.24, h * 0.62, h * 0.24], undefined, {
    bone,
    glow: true
  })
}

// ── Motion: the shared body response, then each character's own acting ──
/**
 * lunge/back: travel at contact/anticipation; rear/lean: tilt back while winding, forward at contact;
 * squash/stretch: anticipation squash and strike stretch; slam: squash on contact; smear: lane stretch
 * mid-strike; bend: how far the upper body curls and whips; rise: lift during anticipation.
 */
const MOVES = {
  lunge: 0.18,
  back: 0.07,
  rear: 0.16,
  lean: 0.22,
  squash: 0.1,
  stretch: 0.08,
  slam: 0,
  smear: 0.12,
  bend: 0.14,
  rise: 0,
  hop: 0.1,
  stride: 28,
  walk: 'hop',
  base: 0.25,
  tool: false,
  ko: 1,
  mass: 1,
  stand: 0.26
}
function moveBody(b, p, c) {
  const { a, g, h, walk } = c
  const hips = b.hips
  let sy = 1
  if (p.walk === 'hop') {
    hips.position.y += p.hop * g.hop * walk
    sy += (0.07 * g.hop - 0.13 * g.land) * walk
    hips.rotation.z -= 0.08 * walk
    b.head.rotation.z += 0.08 * Math.cos(Math.PI * g.p) * walk
  } else if (p.walk === 'waddle') {
    hips.position.y += p.hop * g.hop * walk
    hips.rotation.z += (0.1 * g.swing - 0.05) * walk
    sy += (0.04 * g.hop - 0.08 * g.land) * walk
  } else if (p.walk === 'legs') {
    hips.position.y += 0.025 * Math.abs(g.swing) * walk
    hips.rotation.z -= 0.06 * walk
    if (b.legF) {
      b.legF.rotation.z += 0.55 * g.swing * walk
      b.legB.rotation.z -= 0.55 * g.swing * walk
      b.armF.rotation.z -= 0.45 * g.swing * walk
      b.armB.rotation.z += (p.tool ? 0.12 : 0.45) * g.swing * walk
    }
  } else if (p.walk === 'float') {
    hips.position.y += 0.04 * Math.sin(c.t * 4) + 0.02 * g.hop * walk
    hips.rotation.z -= 0.1 * walk
  }
  hips.position.x += (p.lunge + c.reach) * a.hit - p.back * a.wind - 0.09 * h.jolt
  hips.position.y += p.rise * a.wind + 0.3 * h.lift
  hips.rotation.z += p.rear * a.wind - p.lean * a.hit + 0.26 * h.jolt + 0.05 * h.wobble
  sy +=
    -p.squash * a.wind +
    p.stretch * a.smear -
    p.slam * a.hit * (1 - a.recoil * 0.5) +
    0.03 * Math.sin(c.t * 3) * (1 - walk)
  sy *= 1 - 0.14 * h.jolt + 0.07 * h.wobble
  const bend = p.bend * (a.wind - 1.1 * a.hit)
  b.spine.rotation.z += bend * 0.3 + 0.06 * h.jolt
  b.chest.rotation.z += bend * 0.35 + 0.1 * h.jolt
  b.head.rotation.z += bend * 0.35 - p.bend * 0.6 * a.recoil + 0.16 * h.jolt - 0.05 * h.wobble
  if (c.ko >= 0) {
    const k = knockout(c.ko)
    hips.position.x -= k.back
    hips.position.y += k.lift
    hips.rotation.z += k.tilt * p.ko
    sy *= k.squash
  }
  // Tip over the base's edge rather than its centre, so leaning lifts the body instead of sinking it.
  const lean = hips.rotation.z
  const edge = lean > 0 ? -p.base : p.base
  hips.position.x += edge * (1 - Math.cos(lean))
  hips.position.y -= edge * Math.sin(lean)
  const wide = 1 / Math.sqrt(sy)
  hips.scale.set(wide * (1 + p.smear * a.smear), sy, wide)
  for (const arm of [b.armF, b.armB]) if (arm) arm.rotation.z += 0.9 * h.jolt * (arm === b.armF ? 1 : 1.2)
}
/** The model's own width axis in the lane frame: lids and flaps hinge about it. */
const WIDTH = toLane([1, 0, 0]).normalize()
/** Big swings: blend monotonically from the wind-up angle to the contact angle through the strike. */
const arc = (a, wind, hit, recoil = 0) =>
  (a.wind > 0 && a.hit > 0 ? wind + ((hit - wind) * a.hit) / (a.wind + a.hit) : a.wind * wind + a.hit * hit) +
  recoil * a.recoil
/** Additive pose channel: rest + d(wind) + d(hit) + d(recoil). */
const beat = (a, wind, hit, recoil = 0) => wind * a.wind + hit * a.hit + recoil * a.recoil
const show = (bone, on) => bone && (bone.visible = on)

/** Character recipes by unit key. Size scales the whole figure. */
const MODELS = {
  // ── Poop army ──
  katachi: {
    size: 1,
    moves: { lunge: 0.26, back: 0.1, rear: 0.18, lean: 0.24, squash: 0.13, stretch: 0.1, bend: 0.16, stand: 0.32 },
    build(k) {
      poop(k, BROWN, { arms: ['B'] })
      // Kabuto: a bronze bowl, a flared neck guard and golden kuwagata horns; a lacquered round shield.
      k.add(GEO.hemi, '#b98a3e', [0, 0.6, 0], [0.27, 0.25, 0.27], undefined, { skin: 'head' })
      k.add(GEO.flare, '#8f6428', [0, 0.57, -0.01], [0.27, 0.08, 0.27], undefined, { skin: 'head' })
      k.add(GEO.rcyl, '#d64a3a', [0, 0.7, 0.245], [0.035, 0.02, 0.035], [Math.PI / 2 - 0.3, 0, 0], { skin: 'head' })
      for (const side of [-1, 1])
        k.add(GEO.cone, GOLD, [side * 0.07, 0.8, 0.25], [0.022, 0.2, 0.022], [-0.2, 0, -side * 0.45], { skin: 'head' })
      k.bone('shield', 'spine', [0.22, 0.27, 0.3])
      const turn = [Math.PI / 2, 0.2, 0, 'YXZ']
      k.add(GEO.rcyl, '#9e3426', [0.22, 0.27, 0.3], [0.2, 0.05, 0.2], turn, { bone: 'shield' })
      k.add(GEO.ring, GOLD, [0.226, 0.27, 0.325], [0.19, 0.19, 0.35], [0, 0.2, 0], { bone: 'shield' })
      k.add(GEO.sphere, GOLD, [0.232, 0.27, 0.35], [0.055, 0.055, 0.035], [0, 0.2, 0], { bone: 'shield' })
    },
    act(b, a) {
      b.shield.position.x += beat(a, -0.09, 0.13)
      b.shield.rotation.z += beat(a, 0.32, -0.22) + (a.recoil && 0.1 * Math.sin(a.since * 70) * a.recoil)
      b.armB.rotation.z += beat(a, -0.7, 1.5, 0.3)
    }
  },
  korokoro: {
    size: 0.86,
    moves: { lunge: 0.14, back: 0.06, rear: 0.24, lean: 0.24, squash: 0.08, stretch: 0.12, bend: 0.22 },
    build(k) {
      poop(k, '#8a5229', { sx: 0.95, arms: ['B'] })
      k.add(swirlBand(0.5, 0.57), '#d64a3a', [0, 0, 0], [0.95, 1, 0.95])
      k.add(GEO.sphere, '#d64a3a', [0, 0.535, -0.28], [0.05, 0.045, 0.04], undefined, { skin: 'chest' })
      k.bone('tails', 'chest', [0, 0.53, -0.3])
      for (const s of [-1, 1])
        k.add(GEO.rbox, '#d64a3a', [s * 0.05, 0.47, -0.33], [0.05, 0.14, 0.025], [0, 0, s * 0.5], { bone: 'tails' })
      // The throwing arm is the lead one, long enough to clear the body when it lets go.
      const hand = mitten(k, 'F', '#8a5229', [0.31, 0.4, 0.2], 'spine', 0.24, 0.07)
      k.bone('pellet', 'armF', hand)
      k.add(GEO.sphere, '#4a2810', [hand[0], hand[1] - 0.02, hand[2] + 0.05], 0.085, undefined, { bone: 'pellet' })
      k.add(GEO.ball, '#ffe6c8', [hand[0] - 0.02, hand[1] + 0.02, hand[2] + 0.12], 0.022, undefined, {
        bone: 'pellet',
        glow: true
      })
      k.bone('muzzle', 'armF', hand)
    },
    act(b, a, c) {
      // Overhand windmill: back and up behind the head, over the top, released forward-up, carried through.
      const thrown = a.wind === 0 && a.hit > 0 && a.since !== Infinity
      b.armF.rotation.z += thrown ? -2 * Math.PI + (2 * Math.PI - 4.25) * a.hit - 0.9 * a.recoil : arc(a, -2.9, -4.25)
      b.armF.position.y += 0.18 * a.wind
      b.armB.rotation.z += beat(a, 0.9, -0.6)
      // Open the throwing side toward the viewer while winding up, then turn through on the release.
      b.hips.rotation.y += beat(a, -0.5, 0.3)
      show(b.pellet, !(a.since < 0.3))
      b.tails.rotation.z += 0.15 * Math.sin(c.t * 16) - 0.5 * a.smear - 0.25 * a.hit
    }
  },
  geri: {
    size: 1.14,
    moves: {
      lunge: 0.34,
      back: 0.12,
      rear: 0.2,
      lean: 0.36,
      squash: 0.17,
      stretch: 0.14,
      smear: 0.22,
      bend: 0.2,
      stand: 0.22
    },
    build(k) {
      poop(k, '#9a5d2e', { mood: 'angry' })
      k.add(swirlBand(0.52, 0.61), '#3f8f4a', [0, 0, 0], 1)
      k.add(GEO.sphere, '#3f8f4a', [0, 0.565, -0.27], [0.05, 0.045, 0.04], undefined, { skin: 'chest' })
      k.bone('tails', 'chest', [0, 0.56, -0.28])
      for (const s of [-1, 1])
        k.add(GEO.rbox, '#3f8f4a', [s * 0.06, 0.49, -0.31], [0.055, 0.17, 0.025], [0, 0, s * 0.6], { bone: 'tails' })
      k.bone('fly', 'hips', [0, 0.95, 0])
      k.add(GEO.ball, '#1c1c1c', [0, 0.95, 0], [0.04, 0.035, 0.035], undefined, { bone: 'fly' })
      for (const s of [-1, 1])
        k.add(GEO.ball, '#e9f6ff', [s * 0.035, 0.985, 0], [0.04, 0.02, 0.012], [0, 0, s * 0.5], {
          bone: 'fly',
          alpha: 0.7
        })
    },
    act(b, a, c) {
      b.tails.rotation.z += 0.2 * Math.sin(c.t * 18) - 0.7 * a.smear - 0.4 * a.hit + 0.3 * a.wind
      b.armB.rotation.z += beat(a, -0.8, 1.1, 0.4)
      b.armF.rotation.z += beat(a, -0.6, 0.9)
      b.fly.position.add(
        new THREE.Vector3(Math.cos(c.t * 7) * 0.42, Math.sin(c.t * 13) * 0.05, Math.sin(c.t * 7) * 0.42)
      )
    }
  },
  bichi: {
    size: 1,
    moves: {
      lunge: 0.1,
      back: 0.05,
      rear: 0.12,
      lean: 0.24,
      squash: 0.26,
      stretch: 0.32,
      smear: 0.08,
      bend: 0.3,
      hop: 0.06
    },
    build(k) {
      poop(k, '#a0703e', { sx: 1.18, sy: 0.72, face: { y: 0.3, z: 0.36 } })
      k.bone('drops', 'chest', [0, 0.45, 0])
      for (const [x, y, z, r] of [
        [0.48, 0.52, 0.08, 0.06],
        [-0.44, 0.42, 0.14, 0.05],
        [0.3, 0.7, -0.1, 0.045],
        [0.18, 0.64, 0.3, 0.035]
      ])
        k.add(GEO.drop, '#9fd8ff', [x, y - r, z], [r * 1.4, r * 2, r * 1.4], [0, 0, -x * 0.5], {
          bone: 'drops',
          alpha: 0.85
        })
      for (const [x, z] of [
        [0.56, 0.22],
        [-0.52, -0.25],
        [0.12, 0.56]
      ])
        k.add(GEO.sphere, '#8f6233', [x, 0.008, z], [0.09, 0.02, 0.07], undefined, { skin: 'hips' })
      k.bone('muzzle', 'head', [0.3, 0.62, 0.15])
    },
    act(b, a, c) {
      const fling = 1 + beat(a, -0.35, 0.5, 0.25)
      b.drops.scale.set(fling, fling, fling)
      b.drops.position.x += beat(a, -0.05, 0.12)
      b.hips.scale.x *= 1 + 0.06 * Math.sin(c.t * 9)
      b.armF.rotation.z += beat(a, 1.2, 2.1)
      b.armB.rotation.z += beat(a, 1.0, 1.8)
    }
  },
  dodeka: {
    size: 1.35,
    moves: {
      lunge: 0.28,
      back: 0.08,
      rear: -0.1,
      lean: -0.22,
      squash: 0.12,
      stretch: 0.05,
      smear: 0.2,
      bend: -0.12,
      hop: 0.07,
      mass: 1.5,
      stand: 0.2
    },
    build(k) {
      poop(k, '#5e3518', { arms: [] })
      k.add(swirlBand(0.1, 0.24, 0.01), '#d64a3a', [0, 0, 0], 1)
      for (const y of [0.105, 0.215])
        k.add(swirlBand(y, y + 0.02, 0.026), '#f2c14e', [0, 0, 0], 1, undefined, { line: false })
      for (const which of ['B', 'F'])
        mitten(k, which, '#5e3518', [(which === 'F' ? 1 : -1) * 0.33, 0.36, 0.06], 'spine', 0.15, 0.07)
      for (const r of [0.6, -0.6])
        k.add(GEO.rbox, '#f2e6c9', [0.12, 0.66, 0.2], [0.16, 0.05, 0.02], [0, 0.25, r], { skin: 'head' })
    },
    act(b, a) {
      b.armB.rotation.z += beat(a, 2.2, -0.9, -0.3)
      b.armF.rotation.z += beat(a, 2.0, -0.7)
    }
  },
  daiou: {
    size: 1.25,
    moves: {
      lunge: 0.12,
      back: 0.04,
      rear: 0.2,
      lean: 0.12,
      squash: -0.12,
      stretch: 0.06,
      slam: 0.22,
      rise: 0.1,
      bend: 0.12,
      mass: 1.4,
      stand: 0.3
    },
    build(k) {
      poop(k, '#4a2a12', { mood: 'proud', arms: [] })
      k.add(GEO.rcyl, GOLD, [0.04, 0.9, 0], [0.16, 0.09, 0.16], undefined, { skin: 'head' })
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2
        k.add(GEO.cone, GOLD, [0.04 + Math.sin(t) * 0.14, 0.99, Math.cos(t) * 0.14], [0.035, 0.1, 0.035], undefined, {
          skin: 'head'
        })
        k.add(
          GEO.ball,
          i % 2 ? '#3a8fd6' : '#d64a3a',
          [0.04 + Math.sin(t) * 0.165, 0.9, Math.cos(t) * 0.165],
          0.022,
          undefined,
          {
            skin: 'head',
            line: false
          }
        )
      }
      k.bone('cape', 'chest', [0, 0.58, -0.08])
      k.add(GEO.cape, '#b3202a', [0, 0.3, 0], [0.43, 0.6, 0.43], undefined, { bone: 'cape' })
      // Ermine trim along the cape's shoulders: white puffs with black tails.
      for (let i = 0; i < 9; i++) {
        const t = Math.PI * (0.62 + (i / 8) * 0.76)
        const at = [Math.sin(t) * 0.36, 0.6 + 0.02 * Math.cos(i * 2.1), Math.cos(t) * 0.36]
        k.add(GEO.sphere, '#fbf7ef', at, 0.07, undefined, { bone: 'cape' })
        if (i % 2)
          k.add(GEO.capsule, '#222222', [at[0] * 1.15, at[1] - 0.02, at[2] * 1.15], [0.025, 0.06, 0.02], undefined, {
            bone: 'cape',
            line: false
          })
      }
      const hand = mitten(k, 'B', '#4a2a12', [-0.37, 0.27, 0.05]).map((v, i) => v + [0, 0, 0.02][i])
      mitten(k, 'F', '#4a2a12', [0.37, 0.27, 0.05])
      // A golden plunger scepter.
      const along = shaft(k, 'armB', hand, [0, 1, 0], 0.32, 0.1, GOLD, 0.022)
      k.add(GEO.sphere, GOLD, along(-0.12), 0.04, undefined, { bone: 'armB' })
      k.add(GEO.hemi, '#c62f2f', along(0.32), [0.11, 0.09, 0.11], undefined, { bone: 'armB' })
      k.add(GEO.ring, '#8a1f1f', along(0.32), [0.11, 0.11, 0.25], [Math.PI / 2, 0, 0], { bone: 'armB' })
    },
    act(b, a) {
      b.armB.rotation.z += beat(a, 3.0, 1.2, 0.25)
      b.armF.rotation.z += beat(a, 1.8, -0.6)
      b.cape.rotation.z += beat(a, 0.12, -0.28, -0.12)
      b.cape.rotation.x += beat(a, 0.06, 0.12)
    }
  },
  // ── Specials: things that upset the stomach ──
  aircon: {
    size: 1,
    moves: {
      lunge: -0.1,
      back: 0.04,
      rear: 0.12,
      lean: -0.16,
      squash: -0.07,
      stretch: 0.04,
      bend: 0.06,
      walk: 'float'
    },
    build(k) {
      k.chain = [0.36, 0.52, 0.68]
      k.add(GEO.rbox, '#f4f6f8', [0, 0.54, 0], [0.86, 0.4, 0.34])
      k.add(GEO.rbox, '#dfe5ea', [0, 0.37, 0.02], [0.82, 0.07, 0.3])
      for (let i = 0; i < 5; i++)
        k.add(GEO.box, '#c4ccd3', [-0.3 + i * 0.15, 0.735, 0.05], [0.1, 0.012, 0.2], undefined, { line: false })
      k.add(GEO.rbox, '#5ad1ff', [0.33, 0.68, 0.168], [0.06, 0.03, 0.01], undefined, { glow: true })
      k.add(GEO.rbox, '#aab3bb', [-0.3, 0.68, 0.168], [0.12, 0.025, 0.01], undefined, { line: false })
      // The vent under the face and its flap, hinged along its top edge.
      k.add(GEO.rbox, '#3d4a55', [0, 0.33, 0.12], [0.7, 0.05, 0.08], undefined, { line: false })
      k.bone('louver', 'hips', [0, 0.355, 0.165])
      k.add(GEO.rbox, '#cfd6dc', [0, 0.315, 0.17], [0.74, 0.085, 0.022], undefined, { bone: 'louver' })
      k.bone('wind', 'hips', [0, 0.16, 0.1])
      for (let i = 0; i < 3; i++)
        k.add(
          GEO.ring,
          '#bfe6ff',
          [-0.22 + i * 0.22, 0.16 - (i % 2) * 0.05, 0.1],
          [0.06, 0.06, 0.4],
          [Math.PI / 2, 0, 0],
          {
            bone: 'wind',
            alpha: 0.7
          }
        )
      // Cold blast: a widening cone out of the open vent toward the foe.
      k.bone('blast', 'hips', [0.24, 0.28, 0.2])
      k.add(GEO.cone, '#cdefff', [0.45, 0.27, 0.32], [0.17, 0.42, 0.12], ALONG(Math.PI), { bone: 'blast', alpha: 0.6 })
      for (const [x, y] of [
        [0.55, 0.3],
        [0.68, 0.24]
      ])
        k.add(GEO.ball, '#ffffff', [x, y, 0.36], 0.03, undefined, { bone: 'blast', glow: true })
      k.bone('muzzle', 'hips', [0.3, 0.28, 0.24])
      k.face({ bone: 'chest', y: 0.57, z: 0.17, spread: 0.16, mood: 'cool' })
    },
    act(b, a, c) {
      b.louver.rotateOnAxis(WIDTH, beat(a, 0.2, -1.25, 0.25))
      const blast = Math.max(a.smear, a.hit * (1 - a.recoil * 0.3))
      show(b.blast, blast > 0.05)
      b.blast.scale.setScalar(0.35 + blast)
      b.wind.rotation.y = c.t * 3
      b.hips.scale.multiplyScalar(1 + beat(a, 0.07, -0.04))
    }
  },
  ramen: {
    size: 1,
    moves: {
      lunge: 0.2,
      back: 0.08,
      rear: 0.18,
      lean: 0.2,
      squash: 0.08,
      stretch: 0.06,
      bend: 0.1,
      walk: 'waddle',
      hop: 0.06,
      mass: 1.15,
      stand: 0.32
    },
    build(k) {
      k.chain = [0.2, 0.36, 0.5]
      k.add(GEO.bowl, '#c8302c', [0, 0.42, 0], [0.47, 0.42, 0.47])
      k.add(GEO.ring, '#f6f0e4', [0, 0.42, 0], [0.465, 0.465, 0.6], [Math.PI / 2, 0, 0])
      k.add(GEO.cyl, '#f6f0e4', [0, 0.04, 0], [0.2, 0.05, 0.2])
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2
        k.add(GEO.box, '#f6f0e4', [Math.sin(t) * 0.42, 0.31, Math.cos(t) * 0.42], [0.06, 0.02, 0.01], [0, t, 0], {
          line: false
        })
      }
      k.add(GEO.cyl, '#e2a64a', [0, 0.4, 0], [0.44, 0.02, 0.44], undefined, { line: false })
      for (const [x, z, r] of [
        [-0.1, 0.1, 0.09],
        [0.1, -0.12, 0.08],
        [0.16, 0.14, 0.07],
        [-0.2, -0.08, 0.08],
        [0.02, 0.0, 0.1]
      ])
        k.add(GEO.ring, '#f6d36b', [x, 0.42, z], [r, r, 0.5], [Math.PI / 2, 0, 0.3], { line: false })
      k.add(GEO.rcyl, '#fbf3ee', [0.2, 0.43, 0.08], [0.09, 0.025, 0.09], [0.25, 0, 0])
      k.add(GEO.ring, '#e86a9a', [0.2, 0.445, 0.085], [0.045, 0.045, 0.3], [Math.PI / 2 + 0.25, 0, 0], { line: false })
      k.add(GEO.rcyl, '#9a5a32', [-0.17, 0.44, -0.02], [0.13, 0.03, 0.13], [0.35, 0, 0.2])
      k.add(GEO.sphere, '#fff7e6', [-0.04, 0.43, 0.22], [0.08, 0.05, 0.07], [0.3, 0, 0])
      k.add(GEO.ball, '#f39a1c', [-0.04, 0.47, 0.23], [0.04, 0.02, 0.035], [0.3, 0, 0], { line: false })
      k.add(GEO.rbox, '#1f3b22', [0.04, 0.56, -0.3], [0.24, 0.3, 0.012], [-0.2, 0, 0])
      k.bone('sticks', 'chest', [0.24, 0.46, 0.0])
      for (const s of [0, 0.045])
        k.add(GEO.cyl, '#d9b277', [0.3 + s, 0.68, -0.02 + s], [0.013, 0.72, 0.013], [0, 0, -0.45], { bone: 'sticks' })
      k.face({ bone: 'spine', y: 0.24, z: 0.42, spread: 0.13 })
    },
    act(b, a) {
      b.sticks.rotation.z += beat(a, 0.85, -1.15, 0.2)
      b.sticks.position.x += beat(a, -0.04, 0.1)
    }
  },
  yofukashi: {
    size: 0.95,
    moves: {
      lunge: 0.14,
      back: 0.06,
      rear: 0.32,
      lean: 0.5,
      squash: 0.06,
      stretch: 0.08,
      bend: 0.18,
      walk: 'waddle',
      hop: 0.07,
      stand: 0.28
    },
    build(k) {
      k.chain = [0.3, 0.55, 0.8]
      k.add(GEO.rbox, '#22252e', [0, 0.47, 0], [0.46, 0.82, 0.09])
      k.add(GEO.rbox, '#3b6fd8', [0, 0.47, 0.044], [0.4, 0.7, 0.01], undefined, { glow: true })
      k.add(GEO.rbox, '#1a1c22', [0, 0.84, 0.047], [0.12, 0.025, 0.01], undefined, { line: false })
      k.add(GEO.ball, '#b9d3ff', [-0.12, 0.66, 0.05], [0.07, 0.012, 0.004], [0, 0, 0.6], { glow: true, alpha: 0.6 })
      k.bone('cap', 'head', [0.02, 0.86, 0])
      k.add(GEO.cone, '#2c3e8f', [0.06, 0.99, 0], [0.19, 0.3, 0.12], [0, 0, -0.35], { bone: 'cap' })
      k.add(GEO.rcyl, '#e8ecf6', [0.02, 0.86, 0], [0.21, 0.05, 0.11], [0, 0, -0.05], { bone: 'cap' })
      k.add(GEO.sphere, '#ffffff', [0.16, 1.11, 0], 0.055, undefined, { bone: 'cap' })
      k.bone('moon', 'hips', [-0.32, 0.9, -0.1])
      k.add(GEO.sphere, '#ffe28a', [-0.32, 0.9, -0.1], 0.06, undefined, { bone: 'moon', glow: true })
      k.add(GEO.ball, '#fff3c4', [-0.22, 1.0, -0.1], 0.025, undefined, { bone: 'moon', glow: true })
      k.face({ bone: 'chest', y: 0.56, z: 0.06, spread: 0.1, size: 0.9, mood: 'sleepy' })
    },
    act(b, a, c) {
      b.cap.rotation.z += 0.1 * Math.sin(c.t * 5) + beat(a, 0.3, -0.5, -0.4)
      b.moon.position.y += 0.03 * Math.sin(c.t * 2)
    }
  },
  sake: {
    size: 1,
    moves: {
      lunge: 0.06,
      back: 0.06,
      rear: 0.32,
      lean: 0.62,
      squash: 0.08,
      stretch: 0.06,
      bend: 0.3,
      walk: 'waddle',
      hop: 0.05
    },
    build(k) {
      k.chain = [0.25, 0.5, 0.7]
      k.add(GEO.bottle, '#2f6b45', [0, 0, 0], 1)
      k.add(GEO.ball, '#d8ffe6', [-0.12, 0.38, 0.19], [0.03, 0.14, 0.02], [0, 0.5, 0], { glow: true, alpha: 0.55 })
      k.add(GEO.rcyl, '#fbf6e9', [0, 0.3, 0.02], [0.236, 0.3, 0.236])
      k.add(GEO.rbox, '#d33a2c', [0, 0.41, 0.2], [0.09, 0.07, 0.04], undefined, { line: false })
      k.add(GEO.rcyl, '#d33a2c', [0, 0.93, 0], [0.09, 0.07, 0.09])
      k.bone('muzzle', 'head', [0, 0.96, 0])
      k.face({ bone: 'spine', y: 0.3, z: 0.24, spread: 0.08, size: 0.8, mood: 'drunk' })
    },
    act(b, a, c) {
      b.hips.rotation.z += 0.06 * Math.sin(c.t * 2.3) * (1 - a.wind)
    }
  },
  jiro: {
    size: 1.25,
    moves: {
      lunge: 0.14,
      back: 0.04,
      rear: 0.16,
      lean: 0.18,
      squash: -0.04,
      stretch: 0.08,
      slam: 0.22,
      rise: 0.12,
      bend: 0.22,
      walk: 'waddle',
      hop: 0.05,
      mass: 1.6,
      stand: 0.2
    },
    build(k) {
      k.chain = [0.3, 0.5, 0.72]
      k.add(GEO.bowl, '#f2efe6', [0, 0.38, 0], [0.5, 0.38, 0.5])
      k.add(GEO.ring, '#2d4f8a', [0, 0.38, 0], [0.5, 0.5, 0.3], [Math.PI / 2, 0, 0])
      k.add(GEO.ring, '#2d4f8a', [0, 0.26, 0], [0.455, 0.455, 0.12], [Math.PI / 2, 0, 0], { line: false })
      k.add(GEO.cyl, '#f2efe6', [0, 0.04, 0], [0.22, 0.05, 0.22])
      k.add(GEO.cyl, '#b07a3c', [0, 0.37, 0], [0.47, 0.02, 0.47], undefined, { line: false })
      k.add(GEO.cone, '#eef2c8', [0, 0.64, 0], [0.34, 0.54, 0.34])
      for (let i = 0; i < 14; i++) {
        const t = i * 2.4,
          y = 0.45 + (i % 5) * 0.08
        const r = 0.33 * (1 - (y - 0.37) / 0.56)
        k.add(GEO.capsule, '#f7f9e0', [Math.sin(t) * r, y, Math.cos(t) * r], [0.03, 0.12, 0.03], [0.4, t, 0.9], {
          line: false
        })
      }
      for (const [x, y, z] of [
        [0.12, 0.6, 0.2],
        [-0.15, 0.5, 0.22],
        [0.05, 0.78, 0.1]
      ])
        k.add(GEO.sphere, '#7fb24a', [x, y, z], [0.07, 0.035, 0.05], [0.3, 0, 0.3])
      for (const s of [-1, 1]) k.add(GEO.rbox, '#8a4b2a', [s * 0.3, 0.48, 0.05], [0.24, 0.09, 0.2], [0, 0, s * 0.7])
      k.add(GEO.sphere, '#fffef6', [0.06, 0.44, 0.3], 0.05)
      k.add(GEO.sphere, '#f4e3b0', [0.02, 0.92, 0], [0.09, 0.05, 0.09])
      k.face({ bone: 'hips', y: 0.2, z: 0.46, spread: 0.14 })
    },
    act() {}
  },
  yakiniku: {
    size: 1,
    moves: {
      lunge: 0.2,
      back: 0.06,
      rear: 0.12,
      lean: 0.14,
      squash: 0.14,
      stretch: 0.1,
      rise: 0,
      bend: 0.06,
      walk: 'waddle',
      hop: 0.07,
      stand: 0.22
    },
    build(k) {
      k.chain = [0.2, 0.38, 0.5]
      k.add(GEO.tapered, '#c9a27a', [0, 0.2, 0], [0.36, 0.4, 0.36])
      k.add(GEO.ring, '#3a3a3a', [0, 0.41, 0], [0.37, 0.37, 0.6], [Math.PI / 2, 0, 0])
      for (const x of [-0.2, 0, 0.2])
        k.add(GEO.box, '#3a3a3a', [x, 0.41, 0], [0.018, 0.018, 0.68], undefined, { line: false })
      k.add(GEO.rbox, '#2a2a2a', [0, 0.12, 0.31], [0.18, 0.09, 0.05])
      k.add(GEO.rbox, '#ff8a2a', [0, 0.12, 0.335], [0.12, 0.05, 0.01], undefined, { glow: true })
      k.bone('meat', 'chest', [0, 0.5, 0])
      for (const [x, z, r] of [
        [-0.13, 0.05, 0.3],
        [0.12, -0.08, -0.4],
        [0.02, 0.15, 0.1]
      ]) {
        k.add(GEO.rbox, '#9b3f2c', [x, 0.5, z], [0.25, 0.065, 0.16], [0.3, r, 0], { bone: 'meat' })
        k.add(GEO.box, '#f6dccb', [x, 0.534, z + 0.01], [0.24, 0.008, 0.035], [0.3, r, 0], {
          bone: 'meat',
          line: false
        })
        for (const d of [-0.05, 0.05])
          k.add(
            GEO.box,
            '#3a1810',
            [x + Math.cos(r) * d, 0.535, z - Math.sin(r) * d + 0.01],
            [0.012, 0.006, 0.15],
            [0.3, r, 0],
            {
              bone: 'meat',
              line: false
            }
          )
      }
      k.bone('flames', 'chest', [0, 0.42, 0])
      for (const [x, z, h] of [
        [-0.05, -0.15, 0.16],
        [0.2, 0.1, 0.13],
        [-0.22, 0.05, 0.11]
      ])
        flame(k, 'flames', [x, 0.42, z], h)
      k.face({ bone: 'spine', y: 0.27, z: 0.36, spread: 0.11, size: 0.85 })
    },
    act(b, a, c) {
      const flare = 1 + beat(a, -0.4, 1.4, 0.6) + 0.15 * Math.sin(c.t * 20)
      b.flames.scale.set(1 + 0.2 * (flare - 1), flare, 1 + 0.2 * (flare - 1))
      b.meat.position.y += beat(a, -0.02, 0.12, 0.08)
      b.meat.rotation.z += beat(a, 0, -0.5, 0.4)
      b.hips.position.y += 0.06 * a.smear
    }
  },
  garlic: {
    size: 0.95,
    moves: {
      lunge: 0.04,
      back: 0.06,
      rear: 0.22,
      lean: 0.28,
      squash: -0.08,
      stretch: 0.04,
      bend: 0.22,
      walk: 'hop',
      hop: 0.07
    },
    build(k) {
      k.chain = [0.28, 0.5, 0.72]
      k.add(GEO.sphere, '#f4ede0', [0, 0.36, 0], [0.4, 0.36, 0.4])
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2 + 0.3
        k.add(GEO.sphere, i % 2 ? '#efe2d6' : '#ead2e4', [Math.cos(t) * 0.2, 0.38, Math.sin(t) * 0.2], [0.2, 0.33, 0.2])
      }
      k.add(GEO.cone, '#e8dcc6', [0, 0.8, 0], [0.08, 0.26, 0.08])
      for (const x of [-0.08, 0, 0.08])
        k.add(GEO.cyl, '#bfa47a', [x, 0.02, 0], [0.012, 0.07, 0.012], undefined, { line: false })
      k.bone('puff', 'head', [0.08, 0.92, 0])
      for (const [x, y, r] of [
        [0.25, 0.95, 0.09],
        [0.4, 0.9, 0.12],
        [0.55, 0.98, 0.1]
      ])
        k.add(GEO.ball, '#d9e86a', [x, y, 0.15], r, undefined, { bone: 'puff', alpha: 0.55 })
      k.bone('muzzle', 'head', [0.1, 0.92, 0.1])
      k.face({ bone: 'spine', y: 0.4, z: 0.4, spread: 0.12 })
    },
    act(b, a) {
      const p = Math.max(a.smear, a.hit)
      show(b.puff, p > 0.05)
      b.puff.scale.setScalar(0.3 + p)
      b.puff.position.x += 0.15 * (1 - a.hit) * a.hit
      b.hips.scale.multiplyScalar(1 + beat(a, 0.1, -0.06))
    }
  },
  curry: {
    size: 1,
    moves: {
      lunge: 0.24,
      back: 0.1,
      rear: 0.2,
      lean: 0.24,
      squash: 0.12,
      stretch: 0.1,
      bend: 0.16,
      walk: 'waddle',
      hop: 0.06,
      stand: 0.24
    },
    build(k) {
      k.chain = [0.2, 0.4, 0.58]
      k.add(GEO.rcyl, '#f8f6f0', [0, 0.03, 0], [0.5, 0.05, 0.5])
      k.add(GEO.ring, '#d9c9a0', [0, 0.05, 0], [0.47, 0.47, 0.25], [Math.PI / 2, 0, 0], { line: false })
      k.add(GEO.hemi, '#fbfbf5', [-0.04, 0.04, 0], [0.36, 0.52, 0.36])
      k.add(GEO.sphere, '#a8541a', [0.17, 0.14, 0.04], [0.33, 0.28, 0.33])
      for (const [x, y, z, c] of [
        [0.26, 0.36, 0.22, '#e0902a'],
        [0.32, 0.3, -0.05, '#f0d27a'],
        [0.1, 0.38, 0.18, '#e0902a']
      ])
        k.add(GEO.rbox, c, [x, y, z], 0.07, [0.3, 0.5, 0.2])
      k.bone('chili', 'head', [0, 0.56, 0])
      k.add(GEO.cone, '#d62a1c', [0.02, 0.68, 0], [0.06, 0.24, 0.06], [0, 0, 0.5], { bone: 'chili' })
      k.add(GEO.cyl, '#3f8f4a', [-0.07, 0.8, 0], [0.012, 0.06, 0.012], [0, 0, 0.5], { bone: 'chili' })
      k.bone('flames', 'chest', [0, 0.55, 0])
      for (const s of [-1, 1]) flame(k, 'flames', [s * 0.3, 0.5, -0.05], 0.18)
      k.face({ bone: 'spine', y: 0.3, z: 0.32, spread: 0.11, size: 0.9, mood: 'angry' })
    },
    act(b, a, c) {
      b.chili.rotation.z += beat(a, 0.5, -0.9, 0.3)
      const flare = 1 + beat(a, 0.4, 1.0) + 0.12 * Math.sin(c.t * 22)
      b.flames.scale.set(flare, flare, flare)
    }
  },
  milk: {
    size: 0.95,
    moves: {
      lunge: 0.26,
      back: 0.1,
      rear: 0.26,
      lean: 0.34,
      squash: 0.1,
      stretch: 0.1,
      smear: 0.16,
      bend: 0.1,
      walk: 'waddle',
      hop: 0.06,
      mass: 1.15,
      stand: 0.22
    },
    build(k) {
      k.chain = [0.22, 0.42, 0.62]
      k.add(GEO.rbox, '#f7f7f2', [0, 0.3, 0], [0.42, 0.56, 0.42])
      k.add(GEO.rbox, '#3d7fd0', [0, 0.15, 0], [0.432, 0.15, 0.432])
      for (const [x, y] of [
        [-0.12, 0.45],
        [0.1, 0.52],
        [0.14, 0.36]
      ])
        k.add(GEO.ball, '#2a2a2a', [x, y, 0.21], [0.05, 0.035, 0.008], undefined, { line: false })
      for (const s of [-1, 1]) k.add(GEO.rbox, '#f7f7f2', [0, 0.65, s * 0.1], [0.42, 0.025, 0.27], [s * 0.75, 0, 0])
      k.bone('spout', 'head', [0, 0.74, 0])
      k.add(GEO.rbox, '#e6e6e0', [0, 0.77, 0], [0.42, 0.07, 0.025], undefined, { bone: 'spout' })
      k.face({ bone: 'spine', y: 0.4, z: 0.22, spread: 0.1, size: 0.9 })
    },
    act(b, a) {
      b.spout.rotation.z += beat(a, 0.3, -0.4, 0.4)
    }
  },
  oyster: {
    size: 1,
    moves: {
      lunge: 0.22,
      back: 0.06,
      rear: 0.12,
      lean: 0.12,
      squash: 0.06,
      stretch: 0.08,
      bend: 0.06,
      walk: 'waddle',
      hop: 0.05,
      stand: 0.24
    },
    build(k) {
      k.chain = [0.15, 0.3, 0.45]
      k.add(GEO.sphere, '#8d918b', [0, 0.14, 0], [0.45, 0.14, 0.37])
      // Frilled rim: irregular lumps round the lower shell, a purple lip where it meets the meat.
      for (let i = 0; i < 11; i++) {
        const t = (i / 11) * Math.PI * 2,
          r = 1 + 0.12 * Math.sin(i * 2.7)
        k.add(
          GEO.sphere,
          i % 3 ? '#80847e' : '#9a9e97',
          [Math.sin(t) * 0.41 * r, 0.15 + 0.02 * Math.cos(i * 1.9), Math.cos(t) * 0.33 * r],
          [0.11, 0.07, 0.09],
          [0, t, 0.3 * Math.sin(i)]
        )
      }
      k.add(GEO.ring, '#7a5a86', [0, 0.215, 0.02], [0.36, 0.29, 0.3], [Math.PI / 2, 0, 0], { line: false })
      k.add(GEO.sphere, '#efe4cf', [0, 0.24, 0.03], [0.35, 0.1, 0.28])
      k.add(GEO.ball, '#fff7ea', [0.05, 0.3, 0.2], [0.08, 0.015, 0.03], undefined, { glow: true, alpha: 0.6 })
      k.add(GEO.rbox, '#f4e04a', [0.34, 0.27, 0.16], [0.1, 0.12, 0.05], [0, 0.4, 0.3])
      k.bone('lid', 'spine', [0, 0.26, -0.3])
      k.add(GEO.sphere, '#a3a69f', [0, 0.5, -0.24], [0.45, 0.1, 0.35], [-1.15, 0, 0], { bone: 'lid' })
      for (const [x, y, z, w] of [
        [-0.2, 0.62, -0.27, 0.12],
        [0.05, 0.66, -0.25, 0.14],
        [0.25, 0.58, -0.25, 0.11],
        [-0.05, 0.47, -0.17, 0.1],
        [0.2, 0.42, -0.14, 0.09]
      ])
        k.add(GEO.sphere, '#8a8e87', [x, y, z], [w, 0.04, w * 0.8], [-1.15, 0, 0.4 * x], { bone: 'lid' })
      k.add(GEO.sphere, '#9b9f98', [-0.3, 0.6, -0.2], [0.2, 0.08, 0.16], [-1.0, 0.4, 0.5], { bone: 'lid' })
      // Growth plates stepping in from the rim, so the lid's outline is not one smooth curve.
      for (const [y, z, w, c] of [
        [0.47, -0.16, 0.4, '#969a93'],
        [0.55, -0.21, 0.31, '#888c85']
      ])
        k.add(GEO.sphere, c, [0.04, y, z], [w, 0.035, w * 0.78], [-1.15, 0, 0.12], { bone: 'lid' })
      k.face({ bone: 'spine', y: 0.33, z: 0.24, spread: 0.11, size: 0.85, mood: 'angry' })
    },
    act(b, a) {
      b.lid.rotation.x += beat(a, -0.55, 0.45, -0.2)
      b.lid.rotation.z += beat(a, 0.25, -0.2)
    }
  },
  ice: {
    size: 0.95,
    moves: {
      lunge: 0.18,
      back: 0.08,
      rear: 0.2,
      lean: 0.28,
      squash: 0.08,
      stretch: 0.1,
      bend: 0.32,
      walk: 'hop',
      hop: 0.08,
      stand: 0.24
    },
    build(k) {
      k.chain = [0.3, 0.52, 0.72]
      k.add(GEO.cone, '#d9a35a', [0, 0.25, 0], [0.2, 0.5, 0.2], [Math.PI, 0, 0])
      for (const y of [0.15, 0.3, 0.42]) {
        const r = 0.2 * (y / 0.5) + 0.005
        k.add(GEO.ring, '#b07a38', [0, y, 0], [r, r, 0.3], [Math.PI / 2, 0, 0], { line: false })
      }
      k.add(GEO.sphere, '#f6b6c8', [0, 0.56, 0], 0.23)
      for (const [x, z, h] of [
        [0.12, 0.15, 0.07],
        [-0.16, 0.08, 0.05],
        [0.18, -0.06, 0.06]
      ])
        k.add(GEO.capsule, '#f6b6c8', [x, 0.4, z], [0.05, h, 0.05])
      k.add(GEO.sphere, '#bff0d4', [0, 0.8, 0], 0.18)
      k.add(GEO.sphere, '#d62a3c', [0.02, 0.99, 0], 0.05)
      k.add(GEO.cyl, '#3f6f2a', [-0.02, 1.06, 0], [0.008, 0.07, 0.008], [0, 0, 0.4], { line: false })
      k.face({ bone: 'chest', y: 0.56, z: 0.2, spread: 0.08, size: 0.75, mood: 'cool' })
    },
    act() {}
  },
  energy: {
    size: 0.95,
    moves: {
      lunge: -0.12,
      back: -0.03,
      rear: -0.34,
      lean: -0.22,
      squash: 0.08,
      stretch: 0.06,
      slam: 0.1,
      bend: 0.12,
      walk: 'waddle',
      hop: 0.06
    },
    build(k) {
      k.chain = [0.25, 0.5, 0.7]
      k.add(GEO.rcyl, '#1f3a26', [0, 0.38, 0], [0.2, 0.72, 0.2])
      k.add(GEO.rcyl, '#c9cdd2', [0, 0.755, 0], [0.18, 0.04, 0.18])
      k.add(GEO.ball, '#e9fff0', [-0.1, 0.42, 0.16], [0.02, 0.2, 0.02], [0, 0.6, 0], { glow: true, alpha: 0.5 })
      k.add(GEO.rbox, '#c8f04a', [0.03, 0.24, 0.2], [0.05, 0.18, 0.012], [0, 0, 0.5], { glow: true })
      k.add(GEO.rbox, '#c8f04a', [-0.01, 0.12, 0.2], [0.05, 0.14, 0.012], [0, 0, 0.5], { glow: true })
      k.bone('tab', 'head', [0.04, 0.78, 0])
      k.add(GEO.rbox, '#dfe3e8', [0.08, 0.785, 0.02], [0.1, 0.014, 0.06], undefined, { bone: 'tab' })
      k.add(GEO.ring, '#dfe3e8', [0.14, 0.79, 0.02], [0.03, 0.03, 0.2], [Math.PI / 2, 0, 0], { bone: 'tab' })
      k.bone('muzzle', 'head', [0.08, 0.8, 0.02])
      // Fizz jet out of the opened tab toward the foe.
      k.bone('fizz', 'head', [0.08, 0.8, 0.02])
      k.add(GEO.cone, '#e9ffd0', [0.27, 0.86, 0.1], [0.07, 0.3, 0.05], ALONG(Math.PI + 0.35), {
        bone: 'fizz',
        alpha: 0.7
      })
      for (const [x, y, r] of [
        [0.4, 0.95, 0.04],
        [0.5, 0.9, 0.03],
        [0.32, 1.0, 0.025]
      ])
        k.add(GEO.ball, '#d6ff7a', [x, y, 0.1], r, undefined, { bone: 'fizz', glow: true })
      k.face({ bone: 'chest', y: 0.5, z: 0.2, spread: 0.08, size: 0.8, mood: 'hyper' })
    },
    act(b, a, c) {
      b.tab.rotation.z += beat(a, 0.15, 1.1, -0.3)
      const jet = Math.max(a.smear, a.hit * (1 - a.recoil * 0.4))
      show(b.fizz, jet > 0.05)
      b.fizz.scale.setScalar(0.3 + jet)
      b.hips.position.x += 0.014 * Math.sin(c.t * 70) * a.wind
    }
  },
  // ── Enemies: the cleanup crew ──
  cleaner: {
    size: 1,
    moves: {
      lunge: 0.06,
      back: 0.05,
      rear: 0.14,
      lean: 0.18,
      squash: 0.04,
      stretch: 0.03,
      bend: 0.2,
      walk: 'legs',
      stride: 18,
      tool: true,
      base: 0.12,
      stand: 0.34
    },
    build(k) {
      person(k, '#3d6fb6')
      k.add(GEO.hemi, '#2e5f9e', [0, 0.82, 0], [0.178, 0.15, 0.178], undefined, { skin: 'head' })
      k.add(GEO.rbox, '#2e5f9e', [0, 0.83, 0.15], [0.17, 0.025, 0.13], [0.1, 0, 0], { skin: 'head' })
      k.add(GEO.rbox, '#ffffff', [0.08, 0.52, 0.13], [0.07, 0.05, 0.01], undefined, { skin: 'spine', line: false })
      const grip = [-0.23, 0.35, 0.06]
      const along = shaft(k, 'armB', grip, [0, 1, 0], 0.3, 0.3)
      k.add(GEO.rbox, '#3a7bd5', along(-0.33), [0.26, 0.07, 0.09], undefined, { bone: 'armB' })
      k.add(GEO.box, '#f4f4f4', along(-0.38), [0.24, 0.05, 0.08], undefined, { bone: 'armB' })
    },
    act(b, a) {
      b.armB.rotation.z += beat(a, 3.1, 1.3, 0.25)
      b.armF.rotation.z += beat(a, 2.6, 0.95)
      b.legF.rotation.z += beat(a, 0.1, 0.45)
      b.legB.rotation.z += beat(a, -0.15, -0.25)
    }
  },
  mop: {
    size: 1,
    moves: {
      lunge: 0.07,
      back: 0.06,
      rear: 0.1,
      lean: 0.15,
      squash: 0.05,
      stretch: 0.03,
      bend: 0.16,
      walk: 'legs',
      stride: 18,
      tool: true,
      base: 0.12,
      stand: 0.34
    },
    build(k) {
      person(k, '#7b5aa6')
      k.add(GEO.hemi, '#d04a8a', [0, 0.8, -0.01], [0.188, 0.17, 0.188], undefined, { skin: 'head' })
      k.add(GEO.sphere, '#d04a8a', [0, 0.84, -0.18], 0.05, undefined, { skin: 'head' })
      k.add(GEO.rbox, '#f39ac4', [0, 0.42, 0.14], [0.26, 0.3, 0.025], [0.08, 0, 0], { skin: 'spine' })
      const grip = [-0.23, 0.35, 0.06]
      const along = shaft(k, 'armB', grip, [0.25, 0.97, 0], 0.32, 0.26)
      const head = along(-0.3)
      k.add(GEO.rbox, '#8a8a8a', head, [0.12, 0.04, 0.06], undefined, { bone: 'armB' })
      for (let i = 0; i < 5; i++)
        k.add(
          GEO.capsule,
          '#eeeee6',
          [head[0] - 0.06 + i * 0.03, head[1] - 0.06, head[2] + (i % 2) * 0.02],
          [0.035, 0.1, 0.035],
          [0, 0, (i - 2) * 0.2],
          {
            bone: 'armB'
          }
        )
    },
    act(b, a) {
      b.armB.rotation.z += beat(a, -0.75, 1.0, 0.35)
      b.armF.rotation.z += beat(a, -0.6, 0.9)
      b.hips.rotation.y += beat(a, -0.4, 0.25)
      b.legF.rotation.z += beat(a, 0.05, 0.4)
      b.legB.rotation.z += beat(a, -0.1, -0.3)
    }
  },
  yogurt: {
    size: 0.9,
    moves: {
      lunge: 0.22,
      back: 0.06,
      rear: 0.14,
      lean: 0.24,
      squash: 0.18,
      stretch: 0.14,
      rise: 0,
      bend: 0.1,
      walk: 'hop',
      hop: 0.08,
      stand: 0.22
    },
    build(k) {
      k.chain = [0.2, 0.4, 0.58]
      k.add(GEO.cupBody, '#fbfbf7', [0, 0, 0], 1)
      k.add(GEO.cyl, '#fbfbf7', [0, 0.6, 0], [0.3, 0.02, 0.3])
      k.add(GEO.cupBand, '#4a7fd0', [0, 0, 0], 1)
      k.add(GEO.ball, '#ffffff', [0, 0.3, 0.27], [0.08, 0.04, 0.01], undefined, { line: false })
      k.bone('lid', 'head', [0, 0.62, -0.28])
      k.add(GEO.rbox, '#d8dde3', [0, 0.63, -0.02], [0.56, 0.016, 0.5], [0.25, 0, 0], { bone: 'lid' })
      k.add(GEO.sphere, '#e2334a', [-0.06, 0.66, 0], [0.07, 0.08, 0.07], undefined, { skin: 'head' })
      k.add(GEO.cone, '#3f8f4a', [-0.06, 0.74, 0], [0.04, 0.03, 0.04], undefined, { skin: 'head', line: false })
      k.face({ bone: 'spine', y: 0.34, z: 0.29, spread: 0.09, size: 0.85, mood: 'angry' })
    },
    act(b, a) {
      b.lid.rotation.x += beat(a, -0.7, 0.35, -0.3)
      b.hips.position.y += 0.08 * a.smear
    }
  },
  sayu: {
    size: 0.85,
    moves: {
      lunge: 0.05,
      back: 0.06,
      rear: 0.2,
      lean: 0.55,
      squash: 0.06,
      stretch: 0.06,
      bend: 0.12,
      walk: 'waddle',
      hop: 0.05
    },
    build(k) {
      k.chain = [0.15, 0.3, 0.42]
      k.add(GEO.rcyl, '#e7dcc4', [0, 0.23, 0], [0.26, 0.46, 0.26])
      k.add(GEO.ring, '#5a7fb5', [0, 0.36, 0], [0.262, 0.262, 0.4], [Math.PI / 2, 0, 0])
      k.add(GEO.cyl, '#f6f3ea', [0, 0.462, 0], [0.225, 0.008, 0.225], undefined, { line: false })
      k.bone('steam', 'head', [0, 0.5, 0])
      for (const [x, y, r] of [
        [-0.08, 0.62, 0.07],
        [0.05, 0.76, 0.09],
        [-0.04, 0.92, 0.06]
      ])
        k.add(GEO.ball, '#ffffff', [x, y, 0], r, undefined, { bone: 'steam', alpha: 0.5 })
      k.bone('muzzle', 'head', [0.2, 0.46, 0.1])
      k.face({ bone: 'spine', y: 0.23, z: 0.26, spread: 0.08, size: 0.8, mood: 'angry' })
    },
    act(b, a, c) {
      b.steam.position.y += 0.03 * Math.sin(c.t * 3)
      b.steam.scale.setScalar(1 + beat(a, 0.2, 0.5))
      b.steam.rotation.z += beat(a, 0.3, -0.6)
    }
  },
  washiki: {
    size: 1.2,
    moves: {
      lunge: 0.16,
      back: 0.06,
      rear: -0.14,
      lean: 0.16,
      squash: 0.1,
      stretch: 0.06,
      bend: 0.1,
      walk: 'waddle',
      hop: 0.04,
      base: 0.5,
      ko: 0.12,
      mass: 1.4,
      stand: 0.24
    },
    build(k) {
      k.chain = [0.12, 0.24, 0.36]
      // A long porcelain basin with a rolled rim; the hooded front (金隠し) carries the face.
      k.add(GEO.tub, '#f4f7f8', [-0.06, 0, 0], [0.5, 0.15, 0.28])
      k.add(GEO.ring, '#ffffff', [-0.06, 0.15, 0], [0.49, 0.27, 0.32], [Math.PI / 2, 0, 0])
      k.add(GEO.sphere, '#a7d8ef', [-0.1, 0.152, 0], [0.38, 0.012, 0.19], undefined, { line: false })
      k.add(GEO.sphere, '#cfeefc', [-0.18, 0.158, 0.05], [0.12, 0.006, 0.05], undefined, { glow: true, alpha: 0.7 })
      k.add(GEO.hood, '#ffffff', [0.26, 0.1, 0], [0.22, 0.36, 0.27], undefined, { skin: 'chest' })
      k.bone('pipe', 'hips', [-0.5, 0.12, -0.12])
      k.add(GEO.cyl, '#a9b4bb', [-0.5, 0.42, -0.12], [0.032, 0.6, 0.032], undefined, { bone: 'pipe' })
      k.add(GEO.rbox, '#cfd8de', [-0.5, 0.73, -0.12], [0.1, 0.07, 0.1], undefined, { bone: 'pipe' })
      k.add(GEO.cyl, '#d9e1e6', [-0.43, 0.76, -0.1], [0.012, 0.13, 0.012], [0, 0, -1.1], { bone: 'pipe' })
      k.bone('splash', 'hips', [0.1, 0.25, 0])
      for (const [x, y, r] of [
        [0.2, 0.32, 0.05],
        [0.34, 0.4, 0.04],
        [0.1, 0.42, 0.035]
      ])
        k.add(GEO.drop, '#9fd8ff', [x, y, 0.1], [r * 1.3, r * 2, r * 1.3], undefined, { bone: 'splash', alpha: 0.8 })
      k.face({ bone: 'chest', x: 0.3, y: 0.27, z: 0.23, spread: 0.072, size: 0.78, mood: 'angry' })
    },
    act(b, a, c) {
      b.pipe.rotation.z +=
        0.06 * Math.sin(c.t * 9) + beat(a, 0.2, -0.3, 0.25) + (c.ko >= 0 ? 1.1 * Math.min(1, c.ko / 0.35) : 0)
      const s = Math.max(a.smear, a.hit * (1 - a.recoil * 0.5))
      show(b.splash, s > 0.05)
      b.splash.scale.setScalar(0.3 + s)
      b.splash.position.y += 0.08 * a.hit
    }
  },
  yoshiki: {
    size: 1.1,
    moves: {
      lunge: -0.14,
      back: -0.02,
      rear: -0.1,
      lean: -0.16,
      squash: 0.08,
      stretch: 0.05,
      slam: 0.06,
      bend: 0.12,
      walk: 'waddle',
      hop: 0.04,
      base: 0.55,
      ko: 0.55
    },
    build(k) {
      k.chain = [0.2, 0.42, 0.62]
      // Side-on so it reads as a toilet: the bowl reaches toward the foe (+X), the tank stands behind.
      k.add(GEO.pedestal, '#fbfcfd', [0.06, 0, 0], [1.3, 1, 0.95])
      k.add(GEO.ring, '#eef1f3', [0.1, 0.42, 0], [0.36, 0.26, 0.42], [Math.PI / 2, 0, 0])
      k.add(GEO.sphere, '#a7d8ef', [0.12, 0.415, 0], [0.26, 0.01, 0.18], undefined, { line: false })
      k.add(GEO.rbox, '#fbfcfd', [-0.36, 0.66, 0], [0.28, 0.46, 0.44])
      k.add(GEO.rbox, '#e9edf0', [-0.36, 0.9, 0], [0.32, 0.05, 0.48])
      k.add(GEO.rbox, '#b9c3ca', [-0.24, 0.84, 0.21], [0.07, 0.025, 0.035], [0, 0, -0.3])
      k.add(GEO.rbox, '#dfe6ea', [0.06, 0.46, 0.27], [0.12, 0.08, 0.04])
      for (const [x, c] of [
        [0.03, '#5ab8ff'],
        [0.09, '#ff7a7a']
      ])
        k.add(GEO.ball, c, [x, 0.47, 0.292], 0.016, undefined, { glow: true })
      k.bone('lid', 'chest', [-0.17, 0.44, 0])
      k.add(GEO.rcyl, '#f4f6f7', [-0.18, 0.64, -0.02], [0.2, 0.035, 0.24], [0, 0, Math.PI / 2 + 0.12, 'YXZ'], {
        bone: 'lid'
      })
      k.bone('nozzle', 'hips', [0.2, 0.43, 0])
      k.add(GEO.cyl, '#c4ccd3', [0.28, 0.44, 0], [0.022, 0.16, 0.022], ALONG(), { bone: 'nozzle' })
      k.add(GEO.sphere, '#9aa6ae', [0.36, 0.44, 0], 0.03, undefined, { bone: 'nozzle' })
      k.bone('jet', 'nozzle', [0.36, 0.44, 0])
      k.add(GEO.cone, '#9fd8ff', [0.6, 0.47, 0.06], [0.08, 0.42, 0.06], ALONG(Math.PI + 0.1), {
        bone: 'jet',
        alpha: 0.75
      })
      for (const [x, y] of [
        [0.78, 0.5],
        [0.7, 0.56]
      ])
        k.add(GEO.drop, '#cdeeff', [x, y, 0.08], [0.03, 0.05, 0.03], undefined, { bone: 'jet', glow: true })
      k.bone('muzzle', 'nozzle', [0.42, 0.45, 0.02])
      k.face({ bone: 'chest', x: -0.37, y: 0.65, z: 0.23, spread: 0.08, size: 0.85, mood: 'angry' })
    },
    act(b, a) {
      b.lid.rotation.z += beat(a, 0.4, -0.55, 0.2)
      b.nozzle.position.x += beat(a, -0.02, 0.14)
      b.nozzle.scale.setScalar(1 + beat(a, -0.1, 0.45))
      const jet = Math.max(a.smear, a.hit * (1 - a.recoil * 0.4))
      show(b.jet, jet > 0.05)
      b.jet.scale.setScalar(0.3 + jet)
    }
  },
  seichou: {
    size: 0.9,
    moves: {
      lunge: 0.04,
      back: 0.05,
      rear: 0.18,
      lean: 0.3,
      squash: 0.12,
      stretch: 0.1,
      bend: 0.18,
      walk: 'hop',
      hop: 0.09
    },
    build(k) {
      k.chain = [0.25, 0.4, 0.55]
      k.add(GEO.capsule, '#fbfbfb', [0, 0.27, 0], [0.45, 0.26, 0.45])
      k.bone('cap', 'chest', [0, 0.42, -0.2])
      k.add(GEO.capsule, '#f07aa0', [0, 0.5, 0], [0.44, 0.36, 0.44], undefined, { bone: 'cap' })
      k.add(GEO.ball, '#ffd6e4', [-0.1, 0.62, 0.17], [0.03, 0.07, 0.02], [0, 0.5, 0], {
        bone: 'cap',
        glow: true,
        alpha: 0.6
      })
      k.bone('powder', 'chest', [0, 0.5, 0])
      for (const [x, y, r] of [
        [0.18, 0.62, 0.06],
        [0.3, 0.7, 0.05],
        [0.4, 0.62, 0.045]
      ])
        k.add(GEO.ball, '#fff6fa', [x, y, 0.12], r, undefined, { bone: 'powder', alpha: 0.75 })
      k.bone('muzzle', 'chest', [0.15, 0.56, 0.1])
      k.face({ bone: 'spine', y: 0.34, z: 0.22, spread: 0.08, size: 0.8, mood: 'angry' })
    },
    act(b, a) {
      b.cap.rotation.z += beat(a, -0.1, 0.5, -0.2)
      b.cap.position.y += beat(a, 0, 0.06)
      const p = Math.max(a.smear, a.hit * (1 - a.recoil * 0.5))
      show(b.powder, p > 0.05)
      b.powder.scale.setScalar(0.3 + p)
    }
  },
  geridome: {
    size: 1.35,
    moves: {
      lunge: 0.2,
      back: 0.08,
      rear: 0.26,
      lean: 0.4,
      squash: 0.12,
      stretch: 0.08,
      slam: 0.1,
      bend: 0.2,
      walk: 'waddle',
      hop: 0.04,
      mass: 1.5,
      stand: 0.2
    },
    build(k) {
      k.chain = [0.25, 0.5, 0.72]
      k.add(GEO.bottle, '#7a3f16', [0, 0, 0], [1.3, 1, 1.3])
      k.add(GEO.ball, '#ffd9b0', [-0.16, 0.36, 0.24], [0.03, 0.14, 0.02], [0, 0.5, 0], { glow: true, alpha: 0.5 })
      k.add(GEO.rcyl, '#fbf6e9', [0, 0.3, 0.02], [0.305, 0.32, 0.305])
      k.add(GEO.rcyl, '#c62f2f', [0, 0.42, 0.02], [0.307, 0.05, 0.307])
      k.bone('cap', 'head', [0, 0.9, 0])
      k.add(GEO.rcyl, '#fbfbfb', [0, 0.95, 0], [0.12, 0.11, 0.12], undefined, { bone: 'cap' })
      k.bone('pills', 'hips', [0, 0.95, 0])
      for (const s of [-1, 1])
        k.add(GEO.capsule, '#ffffff', [s * 0.07, 0.95, 0], [0.06, 0.05, 0.06], [0, 0, Math.PI / 2], { bone: 'pills' })
      k.face({ bone: 'spine', y: 0.28, z: 0.31, spread: 0.1, size: 0.9, mood: 'angry' })
    },
    act(b, a, c) {
      b.cap.position.y += beat(a, -0.01, 0.12, 0.1)
      b.cap.rotation.z += beat(a, 0.1, -0.3, 0.5)
      b.pills.position.add(
        new THREE.Vector3(Math.cos(c.t * 6) * 0.42, 0.05 * Math.sin(c.t * 11), Math.sin(c.t * 6) * 0.42)
      )
    }
  }
}
export const modelSize = (key) => MODELS[key]?.size ?? 1

/** One rigged character. Bones are per actor; geometry is shared per character key. */
export class Actor {
  constructor(key) {
    const t = template(key)
    this.t = t
    this.size = t.recipe.size
    this.root = new THREE.Group()
    this.mats = {
      toon: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TONES, transparent: true }),
      ink: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TONES, transparent: true }),
      clear: new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: TONES,
        transparent: true,
        depthWrite: false
      }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }),
      line: lineMaterial(t.recipe.line ?? LINE)
    }
    const b = (this.bones = {})
    let parent = this.root
    t.heights.forEach((h, i) => {
      const bone = new THREE.Bone()
      bone.position.y = h - (t.heights[i - 1] ?? 0)
      parent.add(bone)
      b[CHAIN[i]] = parent = bone
    })
    for (const [name, { parent: up, pivot }] of Object.entries(t.kit.rigs)) {
      const bone = new THREE.Bone()
      bone.position.copy(toLane(pivot).sub(toLane(pivotOf(t.kit, up))))
      b[up].add(bone)
      b[name] = bone
    }
    this.root.updateMatrixWorld(true)
    const skeleton = new THREE.Skeleton(t.order.map((n) => b[n]))
    for (const [finish, geometry] of t.meshes) {
      const mesh = new THREE.SkinnedMesh(geometry, this.mats[finish])
      mesh.rotation.y = FACE
      mesh.frustumCulled = false
      this.root.add(mesh)
      mesh.bind(skeleton)
    }
    this.rest = Object.values(b).map((bone) => [bone, bone.position.clone()])
    this.motion = 'walk'
    this.fade = null
    this.a = beats('walk', 0, 1)
  }

  /** k: lane-x units per model unit; aspect: x-to-y pixel ratio. The player (side 1) faces left. */
  place(x, y, z, side, k, aspect) {
    this.root.position.set(x, 450 - y, z)
    this.root.scale.set(-k * side * this.size, k * aspect * this.size, k * this.size)
  }

  /** f: { motion, phase, period, walked, lead, hurtAge, power, time, ko, id } */
  animate(f) {
    for (const [bone, p] of this.rest) {
      bone.position.copy(p)
      bone.rotation.set(0, 0, 0)
      bone.scale.set(1, 1, 1)
      bone.visible = true
    }
    const a = beats(f.motion, f.phase, f.period, f.lead)
    // A strike interrupted by the target falling eases out instead of snapping back to the walk.
    if (f.motion !== this.motion) {
      if (this.motion === 'attack') this.fade = { at: f.time, wind: this.a.wind, hit: this.a.hit }
      this.motion = f.motion
    }
    if (this.fade && f.motion === 'walk') {
      const k = (f.time - this.fade.at) / 0.16
      if (k >= 0 && k < 1) {
        a.wind = Math.max(a.wind, this.fade.wind * (1 - k))
        a.hit = Math.max(a.hit, this.fade.hit * (1 - k))
      } else this.fade = null
    }
    this.a = a
    const t = this.t
    const c = {
      a,
      g: gait(f.walked, t.moves.stride),
      h: flinch(f.hurtAge / t.moves.mass, f.power / Math.sqrt(t.moves.mass)),
      walk: f.motion === 'walk' && f.ko < 0 ? 1 - Math.max(a.wind, a.hit) : 0,
      t: f.time,
      ko: f.ko,
      reach: f.reach ?? 0
    }
    moveBody(this.bones, t.moves, c)
    t.recipe.act?.(this.bones, a, c)
    // Expressions: focused while winding up, shouting through the strike, ＞＜ when hurt, ×× when out.
    const b = this.bones
    const mood =
      f.ko >= 0 ? 'ko' : c.h.face ? 'hurt' : a.hit > 0.3 || a.smear > 0.3 ? 'shout' : a.wind > 0.3 ? 'focus' : 'calm'
    show(b.eyes, mood === 'calm' || mood === 'focus' || mood === 'shout')
    show(b.squint, mood === 'hurt')
    show(b.ko, mood === 'ko')
    show(b.mouth, mood === 'calm' || mood === 'focus')
    show(b.shout, mood === 'shout' || mood === 'hurt' || mood === 'ko')
    const blink = (f.time + (f.id % 7) * 0.53) % (2.6 + (f.id % 5) * 0.4) < 0.11
    if (b.eyes) b.eyes.scale.y = mood === 'focus' ? 0.68 : mood === 'calm' && blink ? 0.12 : 1
    if (b.shout) b.shout.scale.setScalar(mood === 'shout' ? 0.8 + 0.4 * a.hit : 1)
    this.mats.toon.emissive.setScalar(0.6 * c.h.flash)
    for (const [bone] of this.rest) if (!bone.visible) bone.scale.setScalar(0)
  }

  setOpacity(opacity) {
    for (const m of Object.values(this.mats)) m.opacity = opacity
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose()
  }
}

/** A typical melee gap in lane units, and how wide it looks in model units on the desktop presentation. */
const MELEE = [32, 0.43]
/** Bones that carry effects or orbiting extras rather than the body or a weapon. */
const EFFECTS = new Set([
  'blast',
  'puff',
  'splash',
  'powder',
  'fizz',
  'jet',
  'drops',
  'steam',
  'wind',
  'fly',
  'pills',
  'moon',
  'flames'
])
/** How much of a body's front may sit inside a typical melee gap at rest (model units). */
const CONTACT = 0.12

/** Procedural three.js characters, rendered into an offscreen WebGL canvas in the 1000×450 lane space. */
export class LaneModels {
  canvas = document.createElement('canvas')
  renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1000, 450, 0, -20000, 20000)
  actors = new Map()
  presentation = [1, 1]
  line = OUTLINE.value
  portraits = new Map()
  muzzles = new Map()
  strikes = new Map()

  constructor() {
    this.renderer.setClearColor(0, 0)
    this.scene.add(new THREE.HemisphereLight(0xfff8ec, 0x7a5a40, 1.5))
    const key = new THREE.DirectionalLight(0xfff4db, 2.3)
    key.position.set(-300, 600, 800)
    this.scene.add(key)
  }

  actor(id, key) {
    let actor = this.actors.get(id)
    if (!actor) {
      actor = new Actor(key)
      this.scene.add(actor.root)
      this.actors.set(id, actor)
    }
    actor.seen = true
    return actor
  }

  /** size: the lane's unit width; aspect: x-to-y pixel ratio of the stretched lane canvas; pxPerLane: CSS px per lane unit. */
  setPresentation(size, aspect, pxPerLane = 1.28) {
    this.presentation = [size * 0.62, aspect]
    // Outlines stay about 1.7 CSS px wide whatever the screen.
    this.line = Math.min(0.04, Math.max(0.012, 1.7 / (size * 0.62 * pxPerLane)))
  }

  /**
   * z: the unit's depth slot; lead: seconds until it reaches its foe while walking (starts the first strike's
   * wind-up); reach: extra lunge (model units) that brings its strike onto the foe's body.
   */
  unit(u, x, y, z, time, lead = Infinity, reach = 0) {
    const actor = this.actor(u.id, u.key)
    actor.place(x, y, z, u.side, ...this.presentation)
    actor.animate({
      reach,
      motion: u.motion,
      phase: u.phase,
      period: u.period,
      walked: u.walkDistance,
      lead,
      hurtAge: u.hurt ? time - u.hurt.at : -1,
      power: u.hurt?.power ?? 1,
      time,
      ko: -1,
      id: u.id
    })
    actor.setOpacity(1)
  }

  /** A fallen unit: knocked back and over with ×× eyes, fading out over KO_SECONDS. */
  fallen(ghost, x, y, z, age) {
    const actor = this.actor(ghost.id, ghost.key)
    actor.place(x, y, z, ghost.side, ...this.presentation)
    actor.animate({
      motion: 'walk',
      phase: 0,
      period: 1,
      walked: 0,
      lead: Infinity,
      hurtAge: -1,
      power: 1,
      time: age,
      ko: age,
      id: ghost.id
    })
    actor.setOpacity(Math.max(0, knockout(age).fade))
  }

  /**
   * Lane-x offset at which a unit is drawn: behind its logical point by its stand-off, so facing fighters
   * keep their faces and bodies apart and only a weapon or the striking body meets the foe; back rows
   * stand a step further back.
   */
  offset(key, side, row = 0) {
    const k = this.presentation[0]
    // Wide bodies (basins, bowls, the big poops) stand back by their own breadth, keeping a little air in
    // front that the strike crosses. A typical melee gap (MELEE lane units) looks the same on every screen:
    // on large-scale (portrait) presentations it would shrink in model terms, so the stand-off grows.
    const { moves, front } = template(key)
    const stand = Math.max(moves.stand, front - CONTACT)
    return side * ((stand * modelSize(key) + row * 0.07) * k + Math.max(0, MELEE[1] * k - MELEE[0]) / 2)
  }

  /** Lane units from a unit's centre to the front of its body at `height` (model units, before size). */
  front(key, height = 0.4) {
    const { profile } = template(key)
    let band = Math.min(BANDS - 1, Math.max(0, Math.floor(height / 0.1)))
    while (band > 0 && profile[band] === -Infinity) band--
    const x = Math.max(profile[band], profile[band - 1] ?? -Infinity, profile[band + 1] ?? -Infinity)
    return x * modelSize(key) * this.presentation[0]
  }

  /**
   * The furthest point of a unit's strike on the contact frame (weapon tip or striking body; effects such as
   * splashes and jets are left out): [lane units ahead of its centre, height in size-scaled model units].
   */
  strike(key) {
    if (!this.strikes.has(key)) {
      const actor = new Actor(key)
      actor.animate({
        motion: 'attack',
        phase: 0,
        period: 1,
        walked: 0,
        lead: Infinity,
        hurtAge: -1,
        power: 1,
        time: 0,
        ko: -1,
        id: 0
      })
      actor.root.updateMatrixWorld(true)
      const mesh = actor.root.children.find((m) => m.isSkinnedMesh)
      const { order } = actor.t
      const skinIndex = mesh.geometry.attributes.skinIndex,
        position = mesh.geometry.attributes.position,
        at = new THREE.Vector3()
      let reach = 0,
        height = 0
      for (let i = 0; i < position.count; i++) {
        if (EFFECTS.has(order[skinIndex.getX(i)])) continue
        mesh.applyBoneTransform(i, at.fromBufferAttribute(position, i)).applyMatrix4(mesh.matrixWorld)
        if (at.x > reach) [reach, height] = [at.x, at.y]
      }
      this.strikes.set(key, [reach * actor.size, height * actor.size])
      actor.dispose()
    }
    const [reach, height] = this.strikes.get(key)
    return [reach * this.presentation[0], height]
  }

  /** Lane offset from a unit's base to its shot emitter at the moment of release, for the current presentation. */
  muzzle(key, side, period = 1) {
    if (!this.muzzles.has(key)) {
      const actor = new Actor(key)
      actor.animate({
        motion: 'attack',
        phase: 0,
        period,
        walked: 0,
        lead: Infinity,
        hurtAge: -1,
        power: 1,
        time: 0,
        ko: -1,
        id: 0
      })
      actor.root.updateMatrixWorld(true)
      const p = actor.bones.muzzle
        ? actor.bones.muzzle.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(0.32, 0.4, 0)
      this.muzzles.set(key, [p.x * actor.size, p.y * actor.size])
      actor.dispose()
    }
    const [mx, my] = this.muzzles.get(key)
    const [k, aspect] = this.presentation
    return [-side * mx * k, -my * k * aspect]
  }

  /** Renders this frame's actors at width×height pixels; actors not touched since the last render are released. */
  render(width, height) {
    for (const [id, actor] of this.actors)
      if (!actor.seen) {
        this.scene.remove(actor.root)
        actor.dispose()
        this.actors.delete(id)
      } else actor.seen = false
    if (this.canvas.width !== width || this.canvas.height !== height) this.renderer.setSize(width, height, false)
    OUTLINE.value = this.line
    this.renderer.render(this.scene, this.camera)
    return this.canvas
  }

  /** One standing pose of a character, centered in a 128×112 portrait, facing the poop army's direction. */
  portrait(key, target) {
    const camera = new THREE.OrthographicCamera(0, 128, 112, 0, -2000, 2000)
    const scene = new THREE.Scene()
    for (const light of this.scene.children) if (light.isLight) scene.add(light.clone())
    const actor = new Actor(key)
    actor.root.position.set(64, 10, 0)
    const k = 84 / actor.size ** 0.6
    actor.root.scale.set(-k * actor.size, k * actor.size, k * actor.size)
    actor.animate({
      motion: 'attack',
      phase: 0.6,
      period: 9,
      walked: 0,
      lead: Infinity,
      hurtAge: -1,
      power: 1,
      time: 0.3,
      ko: -1,
      id: 1
    })
    scene.add(actor.root)
    this.renderer.setSize(128, 112, false)
    OUTLINE.value = Math.min(0.04, 1.6 / (k * actor.size))
    this.renderer.render(scene, camera)
    const context = target.getContext('2d')
    context.clearRect(0, 0, target.width, target.height)
    context.drawImage(this.canvas, 0, 0, target.width, target.height)
    actor.dispose()
  }

  /** Cached data URL portrait for menus. */
  portraitURL(key) {
    if (!this.portraits.has(key)) {
      const c = document.createElement('canvas')
      c.width = 128
      c.height = 112
      this.portrait(key, c)
      this.portraits.set(key, c.toDataURL())
    }
    return this.portraits.get(key)
  }
}
