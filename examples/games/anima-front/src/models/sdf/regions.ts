/**
 * Shader-evaluated paint regions. Markings (paint/emboss colours and masks) are not baked into vertices but
 * drawn per pixel: the fragment shader evaluates each region's SDF at the bind-pose position and antialiases the
 * edge with fwidth, so markings stay crisp at any triangle count and overlapping markings layer exactly like
 * the CPU fold would. Regions are packed into a float DataTexture (works in Node, no WebGL needed to build).
 *
 * Texel layout (RGBA float, one row):
 *   region header (3 texels): [cx, cy, cz, boundRadius] [firstShape, shapeCount, within (−1), flags]
 *                             [r, g, b, alpha] then [mask x, y, z, w] [soft, filterSlot (−1), hasColor, hasMask]
 *   shape (5 texels): [type, cx, cy, cz] [r00, r01, r02, r10] [r11, r12, r20, r21] [r22, p0, p1, p2] [p3, m, 0, 0]
 */
import * as THREE from 'three'
import type { Field } from './field'
import { OpType } from './sculpt'

export const REGION_TEXELS = 5
export const SHAPE_TEXELS = 5
const SS = 21

export interface RegionTable {
  data: Float32Array
  /** Texels per row (the texture is width × 1). */
  width: number
  count: number
  /** Texel index where shapes start. */
  shapeBase: number
  /** Bone index lists of bone-filtered regions, by filter slot (≤ 4). */
  filters: Int16Array[]
}

/** True for ops whose colour/mask the shader draws when regions are enabled. */
export const isRegionOp = (f: Field, i: number) =>
  (f.opType[i] === OpType.Paint || f.opType[i] === OpType.Emboss) &&
  (!Number.isNaN(f.color[i * 3]) || !Number.isNaN(f.mask[i * 4]))

export function buildRegions(f: Field): RegionTable {
  const ops: number[] = []
  for (let i = 0; i < f.count; i++) if (isRegionOp(f, i)) ops.push(i)
  const shapeIds: number[] = []
  const shapeIndex = new Map<number, number>()
  const use = (s: number) => {
    let k = shapeIndex.get(s)
    if (k === undefined) {
      k = shapeIds.length
      shapeIds.push(s)
      shapeIndex.set(s, k)
    }
    return k
  }
  const filters: Int16Array[] = []
  const regionShapes: { first: number; count: number; within: number }[] = []
  for (const i of ops) {
    // Region shapes must be contiguous: re-add the union shapes in order for each region.
    const list = [f.opShape[i], ...(f.opUnion[i] ?? [])]
    const first = shapeIds.length
    for (const s of list) {
      shapeIds.push(s)
    }
    const within = f.opWithin[i] >= 0 ? use(f.opWithin[i]) : -1
    regionShapes.push({ first, count: list.length, within })
  }
  const count = ops.length
  const shapeBase = count * REGION_TEXELS
  const width = Math.max(1, shapeBase + shapeIds.length * SHAPE_TEXELS)
  const data = new Float32Array(width * 4)
  ops.forEach((i, r) => {
    const o = r * REGION_TEXELS * 4
    data[o] = f.bound[i * 4]
    data[o + 1] = f.bound[i * 4 + 1]
    data[o + 2] = f.bound[i * 4 + 2]
    data[o + 3] = Number.isFinite(f.bound[i * 4 + 3]) ? f.bound[i * 4 + 3] : 1e6
    data[o + 4] = regionShapes[r].first
    data[o + 5] = regionShapes[r].count
    data[o + 6] = regionShapes[r].within
    data[o + 7] = f.fuzzy[i]
    const hasColor = !Number.isNaN(f.color[i * 3])
    const hasMask = !Number.isNaN(f.mask[i * 4])
    for (let c = 0; c < 3; c++) data[o + 8 + c] = hasColor ? f.color[i * 3 + c] : 0
    data[o + 11] = f.alpha[i]
    for (let c = 0; c < 4; c++) data[o + 12 + c] = hasMask ? f.mask[i * 4 + c] : 0
    let slot = -1
    const filter = f.boneFilter[i]
    if (filter && filters.length < 4) {
      slot = filters.length
      filters.push(filter)
    }
    data[o + 16] = f.soft[i]
    data[o + 17] = slot
    data[o + 18] = hasColor ? 1 : 0
    data[o + 19] = hasMask ? 1 : 0
  })
  const D = f.shapeData
  shapeIds.forEach((s, k) => {
    const o = (shapeBase + k * SHAPE_TEXELS) * 4
    const so = s * SS
    data[o] = f.shapeType[s]
    data[o + 1] = D[so]
    data[o + 2] = D[so + 1]
    data[o + 3] = D[so + 2]
    for (let j = 0; j < 9; j++) data[o + 4 + j] = D[so + 3 + j]
    for (let j = 0; j < 4; j++) data[o + 13 + j] = D[so + 12 + j]
    data[o + 17] = D[so + 20]
  })
  return { data, width, count, shapeBase, filters }
}

export function regionTexture(t: RegionTable): THREE.DataTexture {
  const tex = new THREE.DataTexture(t.data, t.width, 1, THREE.RGBAFormat, THREE.FloatType)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/** GLSL: SDF of one packed shape and the region loop. Expects uRegions, uRegionCount, uShapeBase, vBind, vFilter. */
export const REGION_GLSL = /* glsl */ `
uniform highp sampler2D uRegions;
uniform int uRegionCount;
uniform int uShapeBase;
varying vec4 vFilter;

vec4 rtex(int i) { return texelFetch(uRegions, ivec2(i, 0), 0); }

float shapeSdf(int k, vec3 p) {
  int o = uShapeBase + k * ${SHAPE_TEXELS};
  vec4 a = rtex(o), b = rtex(o + 1), c = rtex(o + 2), d = rtex(o + 3), e = rtex(o + 4);
  vec3 q = p - a.yzw;
  vec3 l = vec3(dot(vec3(b.x, b.y, b.z), q), dot(vec3(b.w, c.x, c.y), q), dot(vec3(c.z, c.w, d.x), q));
  int type = int(a.x + 0.5);
  float m = e.y;
  vec4 pr = vec4(d.y, d.z, d.w, e.x);
  float r = 1e5;
  if (type == 0) r = length(l) - pr.x;
  else if (type == 1) {
    vec3 rr = pr.xyz;
    float k0 = length(l / rr);
    float k1 = length(l / (rr * rr));
    r = k1 < 1e-6 ? -min(rr.x, min(rr.y, rr.z)) : k0 * (k0 - 1.0) / k1;
  } else if (type == 2) {
    float r1 = pr.x, r2 = pr.y, h = pr.z;
    float bb = (r1 - r2) / h;
    float aa = sqrt(1.0 - bb * bb);
    vec2 qq = vec2(length(l.xz), l.y);
    float kk = dot(qq, vec2(-bb, aa));
    if (kk < 0.0) r = length(qq) - r1;
    else if (kk > aa * h) r = length(qq - vec2(0.0, h)) - r2;
    else r = dot(qq, vec2(aa, bb)) - r1;
  } else if (type == 3) {
    vec3 qq = abs(l) - pr.xyz;
    r = length(max(qq, 0.0)) + min(max(qq.x, max(qq.y, qq.z)), 0.0) - pr.w;
  } else if (type == 4) {
    vec2 qq = vec2(length(l.xz) - pr.x, l.y);
    r = length(qq) - pr.y;
  } else if (type == 5) {
    vec2 dd = vec2(length(l.xz) - pr.x + pr.z, abs(l.y) - pr.y + pr.z);
    r = min(max(dd.x, dd.y), 0.0) + length(max(dd, 0.0)) - pr.z;
  } else if (type == 6) r = l.y;
  else if (type == 7) r = abs(l.y) - pr.x;
  else if (type == 9) {
    float px = abs(l.x);
    float kk = pr.w * px > pr.z * l.z ? px * pr.z + l.z * pr.w : length(vec2(px, l.z));
    r = sqrt(max(dot(l, l) + pr.x * pr.x - 2.0 * pr.x * kk, 0.0)) - pr.y;
  }
  return r * m;
}

/** Applies every region to the colour and the mask channels at bind-pose point p. */
void applyRegions(vec3 p, inout vec3 col, inout vec4 mask) {
  for (int i = 0; i < 64; i++) {
    if (i >= uRegionCount) break;
    int o = i * ${REGION_TEXELS};
    vec4 h0 = rtex(o);
    if (distance(p, h0.xyz) > h0.w) continue;
    vec4 h1 = rtex(o + 1), h2 = rtex(o + 2), h3 = rtex(o + 3), h4 = rtex(o + 4);
    int first = int(h1.x + 0.5), cnt = int(h1.y + 0.5), within = int(h1.z + 0.5 * sign(h1.z));
    float d = 1e5;
    for (int s = 0; s < 4; s++) {
      if (s >= cnt) break;
      d = min(d, shapeSdf(first + s, p));
    }
    if (within >= 0) d = max(d, shapeSdf(within, p));
    float cov;
    if (h1.w > 0.5) cov = 1.0 - smoothstep(-h4.x, h4.x, d);
    else {
      float fw = max(fwidth(d), 1e-5);
      cov = clamp(0.5 - d / (fw * 1.25), 0.0, 1.0);
    }
    cov *= h2.w;
    int slot = int(h4.y + 0.5 * sign(h4.y));
    if (slot >= 0) cov *= smoothstep(0.35, 0.65, slot == 0 ? vFilter.x : slot == 1 ? vFilter.y : slot == 2 ? vFilter.z : vFilter.w);
    if (cov <= 0.0) continue;
    if (h4.z > 0.5) col = mix(col, h2.rgb, cov);
    if (h4.w > 0.5) mask = mix(mask, h3, cov);
  }
}
`
