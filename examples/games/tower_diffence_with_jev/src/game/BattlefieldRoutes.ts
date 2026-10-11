import { WINDING_BRANCHES } from './WindingLayouts'
import type { BattlefieldVersion, LayoutRevision, Field, FieldId, Point, RouteId, SlowSurface } from './model'

export type { BattlefieldVersion, RouteId } from './model'

export interface RoadEdge {
  id: string
  from: string
  to: string
  points: Point[]
}

export interface RoadRouteDefinition {
  id: RouteId | undefined
  label: string
  edgeIds: string[]
}

export interface RoadRoute extends RoadRouteDefinition {
  path: Point[]
  length: number
}

export interface RoadAnchor {
  edgeId: string
  offset: number
}

export interface RoadProjection extends Point, RoadAnchor {
  progress: number
  distance: number
  routeId?: RouteId
}

export interface ResolvedBattlefield extends Field {
  version: BattlefieldVersion
  layoutRevision: LayoutRevision
  edges: RoadEdge[]
  routes: RoadRoute[]
  entrance: Point
  gate: Point
  surfaceAnchor?: { edgeId: string; startOffset: number; endOffset: number }
}

const EPSILON = 1e-7
const resolvedFields = new WeakMap<Field, Map<string, ResolvedBattlefield>>()

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function lengthOf(path: readonly Point[]): number {
  return path.slice(1).reduce((length, point, index) => length + distance(path[index], point), 0)
}

function pointAt(path: readonly Point[], progress: number): Point {
  let remaining = Math.max(0, progress)
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1],
      end = path[index],
      length = distance(start, end)
    if (remaining <= length) {
      const fraction = length ? remaining / length : 0
      return { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction }
    }
    remaining -= length
  }
  return { ...path[path.length - 1] }
}

function project(path: readonly Point[], point: Point): Point & { progress: number; distance: number } {
  let closest = { ...path[0], progress: 0, distance: Infinity },
    accumulated = 0
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1],
      end = path[index],
      dx = end.x - start.x,
      dy = end.y - start.y,
      length = Math.hypot(dx, dy)
    if (!length) continue
    const fraction = Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length))
      ),
      x = start.x + dx * fraction,
      y = start.y + dy * fraction,
      separation = Math.hypot(point.x - x, point.y - y)
    if (separation < closest.distance) {
      closest = { x, y, progress: accumulated + length * fraction, distance: separation }
    }
    accumulated += length
  }
  return closest
}

interface RoadSegment {
  edge: RoadEdge
  index: number
  start: Point
  end: Point
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x
}

function difference(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

function segmentIntersection(a: RoadSegment, b: RoadSegment): Point | 'overlap' | null {
  const directionA = difference(a.end, a.start),
    directionB = difference(b.end, b.start),
    between = difference(b.start, a.start),
    denominator = cross(directionA, directionB)
  if (Math.abs(denominator) <= EPSILON) {
    if (Math.abs(cross(between, directionA)) > EPSILON) return null
    const squaredLength = directionA.x ** 2 + directionA.y ** 2,
      start = (between.x * directionA.x + between.y * directionA.y) / squaredLength,
      end = start + (directionB.x * directionA.x + directionB.y * directionA.y) / squaredLength,
      low = Math.max(0, Math.min(start, end)),
      high = Math.min(1, Math.max(start, end))
    if (high < low - EPSILON) return null
    if (high - low > EPSILON) return 'overlap'
    return { x: a.start.x + directionA.x * low, y: a.start.y + directionA.y * low }
  }
  const fractionA = cross(between, directionB) / denominator,
    fractionB = cross(between, directionA) / denominator
  if (fractionA < -EPSILON || fractionA > 1 + EPSILON || fractionB < -EPSILON || fractionB > 1 + EPSILON) {
    return null
  }
  return { x: a.start.x + directionA.x * fractionA, y: a.start.y + directionA.y * fractionA }
}

function nodeAt(edge: RoadEdge, point: Point): string | null {
  if (distance(edge.points[0], point) <= EPSILON) return edge.from
  if (distance(edge.points[edge.points.length - 1], point) <= EPSILON) return edge.to
  return null
}

function validateIntersections(edges: readonly RoadEdge[]): void {
  const segments = edges.flatMap((edge) =>
    edge.points.slice(1).map((end, index) => ({ edge, index, start: edge.points[index], end }))
  )
  for (let index = 0; index < segments.length; index++) {
    const a = segments[index]
    for (const b of segments.slice(index + 1)) {
      const intersection = segmentIntersection(a, b)
      if (!intersection) continue
      if (intersection !== 'overlap') {
        if (a.edge === b.edge && Math.abs(a.index - b.index) === 1) continue
        const node = nodeAt(a.edge, intersection)
        if (a.edge !== b.edge && node && node === nodeAt(b.edge, intersection)) continue
      }
      throw new Error(`Road intersection outside a junction: ${a.edge.id}, ${b.edge.id}`)
    }
  }
}

export function buildRoadRoutes(edges: readonly RoadEdge[], definitions: readonly RoadRouteDefinition[]): RoadRoute[] {
  const edgeById = new Map<string, RoadEdge>(),
    nodes = new Map<string, Point>(),
    outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.id || edgeById.has(edge.id) || !edge.from || !edge.to || edge.from === edge.to) {
      throw new Error('Road edges need unique IDs and distinct endpoints')
    }
    if (
      edge.points.length < 2 ||
      edge.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)) ||
      edge.points.slice(1).some((point, index) => distance(edge.points[index], point) <= EPSILON)
    ) {
      throw new Error(`Invalid road polyline: ${edge.id}`)
    }
    for (const [node, point] of [
      [edge.from, edge.points[0]],
      [edge.to, edge.points[edge.points.length - 1]]
    ] as const) {
      const previous = nodes.get(node)
      if (previous && distance(previous, point) > EPSILON) throw new Error(`Discontinuous road junction: ${node}`)
      nodes.set(node, point)
    }
    edgeById.set(edge.id, edge)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  }
  const visiting = new Set<string>(),
    visited = new Set<string>()
  function visit(node: string): void {
    if (visiting.has(node)) throw new Error('Road graph contains a cycle')
    if (visited.has(node)) return
    visiting.add(node)
    for (const next of outgoing.get(node) ?? []) visit(next)
    visiting.delete(node)
    visited.add(node)
  }
  for (const node of nodes.keys()) visit(node)
  validateIntersections(edges)

  const routeIds = new Set<RouteId | undefined>(),
    usedEdges = new Set<string>(),
    routes = definitions.map((definition) => {
      if (routeIds.has(definition.id) || !definition.edgeIds.length) throw new Error('Invalid road route definition')
      routeIds.add(definition.id)
      const path: Point[] = [],
        routeEdges = new Set<string>()
      let node = 'entrance'
      for (const id of definition.edgeIds) {
        const edge = edgeById.get(id)
        if (!edge || edge.from !== node || routeEdges.has(id)) throw new Error(`Discontinuous road route: ${id}`)
        path.push(...(path.length ? edge.points.slice(1) : edge.points))
        routeEdges.add(id)
        usedEdges.add(id)
        node = edge.to
      }
      if (node !== 'gate') throw new Error('Road route does not reach the gate')
      return { ...definition, path, length: lengthOf(path) }
    })
  if (!routes.length || usedEdges.size !== edges.length) throw new Error('Road graph contains unused edges')
  return routes
}

const BRANCHES: Record<FieldId, { left: number[][]; right: number[][] }> = {
  meadow: {
    left: [
      [640, 260],
      [120, 260],
      [120, 900],
      [320, 900],
      [320, 500],
      [520, 500],
      [520, 1000],
      [640, 1000]
    ],
    right: [
      [640, 260],
      [1140, 260],
      [1140, 820],
      [960, 820],
      [960, 460],
      [780, 460],
      [780, 1000],
      [640, 1000]
    ]
  },
  desert: {
    left: [
      [640, 240],
      [100, 240],
      [100, 520],
      [560, 520],
      [560, 780],
      [100, 780],
      [100, 1000],
      [640, 1000]
    ],
    right: [
      [640, 240],
      [1180, 240],
      [1180, 500],
      [700, 500],
      [700, 800],
      [1180, 800],
      [1180, 1000],
      [640, 1000]
    ]
  },
  frost: {
    left: [
      [640, 260],
      [200, 400],
      [140, 720],
      [460, 720],
      [460, 460],
      [560, 460],
      [560, 1000],
      [640, 1000]
    ],
    right: [
      [640, 260],
      [1100, 380],
      [1160, 740],
      [840, 740],
      [840, 460],
      [740, 460],
      [740, 1000],
      [640, 1000]
    ]
  },
  volcanic: {
    left: [
      [640, 180],
      [100, 180],
      [100, 1000],
      [250, 1000],
      [250, 260],
      [400, 260],
      [400, 1000],
      [640, 1000]
    ],
    right: [
      [640, 180],
      [1180, 180],
      [1180, 1000],
      [1030, 1000],
      [1030, 240],
      [880, 240],
      [880, 1000],
      [640, 1000]
    ]
  }
}

function points(coords: readonly number[][]): Point[] {
  return coords.map(([x, y]) => ({ x, y }))
}

function createSlots(field: ResolvedBattlefield): Field['slots'] {
  const slots: Field['slots'] = []
  for (const route of field.routes) {
    for (let progress = 180; progress < route.length - 100; progress += 145) {
      const point = pointAt(route.path, progress),
        next = pointAt(route.path, progress + 1),
        dx = next.x - point.x,
        dy = next.y - point.y,
        size = Math.hypot(dx, dy)
      for (const side of [-1, 1]) {
        const slot = { x: point.x - (dy / size) * 66 * side, y: point.y + (dx / size) * 66 * side }
        if (
          slot.x < 50 ||
          slot.x > field.width - 50 ||
          slot.y < (field.layoutRevision === 3 ? 94 : 50) ||
          slot.y > field.height - 50 ||
          distanceToRoadUnion(field, slot) < 52 ||
          slots.some((other) => distance(other, slot) < 90)
        )
          continue
        slots.push({ id: slots.length, ...slot })
      }
    }
  }
  return slots
}

export function resolveBattlefield(
  legacyField: Field,
  version: BattlefieldVersion = 1,
  layoutRevision: LayoutRevision = 1
): ResolvedBattlefield {
  if (
    (version !== 1 && version !== 2) ||
    (layoutRevision !== 1 && layoutRevision !== 2 && layoutRevision !== 3) ||
    (version === 1 && layoutRevision !== 1)
  )
    throw new RangeError('Unsupported battlefield layout revision')
  const key = `${version}:${layoutRevision}`
  const cache = resolvedFields.get(legacyField) ?? new Map<string, ResolvedBattlefield>(),
    existing = cache.get(key)
  if (existing) return existing
  let field: ResolvedBattlefield
  if (version === 1) {
    const edge: RoadEdge = { id: 'legacy', from: 'entrance', to: 'gate', points: legacyField.path }
    field = {
      ...legacyField,
      version,
      layoutRevision,
      edges: [edge],
      routes: [
        {
          id: undefined,
          label: '一本道',
          edgeIds: [edge.id],
          path: legacyField.path,
          length: lengthOf(legacyField.path)
        }
      ],
      entrance: legacyField.path[0],
      gate: legacyField.path[legacyField.path.length - 1]
    }
  } else if (layoutRevision === 3) {
    // One unambiguous serpentine road. Route IDs remain stable for AI/save contracts,
    // but both choices traverse the same complete road, with no shortcut junction.
    const shift = { meadow: 0, desert: 16, frost: -16, volcanic: 8 }[legacyField.id]
    const entrance = { x: 80, y: 140 },
      gate = { x: 1190, y: 790 }
    const path = points([
      [80, 140],
      [1120 + shift, 140],
      [1120 + shift, 290],
      [160 + shift, 290],
      [160 + shift, 440],
      [1120 + shift, 440],
      [1120 + shift, 590],
      [160 + shift, 590],
      [160 + shift, 740],
      [1190, 740],
      [1190, 790]
    ])
    const edges: RoadEdge[] = [{ id: 'serpentine', from: 'entrance', to: 'gate', points: path }]
    const routes = buildRoadRoutes(edges, [
      { id: 'left', label: '蛇行する道', edgeIds: ['serpentine'] },
      { id: 'right', label: '蛇行する道', edgeIds: ['serpentine'] }
    ])
    field = {
      ...legacyField,
      version,
      layoutRevision,
      width: 1280,
      height: 920,
      path,
      slots: [],
      edges,
      routes,
      entrance,
      gate,
      surfaceAnchor: { edgeId: 'serpentine', startOffset: routes[0].length - 210, endOffset: routes[0].length - 70 }
    }
    field.slowSurface = routeSurface(field, 'left')
    field.slots = createSlots(field)
  } else {
    const branch = layoutRevision === 1 ? BRANCHES[legacyField.id] : WINDING_BRANCHES[legacyField.id]
    if (!branch) throw new RangeError(`Unavailable winding layout: ${legacyField.id}`)
    const left = points(branch.left),
      right = points(branch.right),
      entrance = { x: 640, y: 60 },
      gate = { x: 640, y: 1340 },
      edges: RoadEdge[] = [
        { id: 'entry', from: 'entrance', to: 'split', points: [entrance, left[0]] },
        { id: 'left', from: 'split', to: 'merge', points: left },
        { id: 'right', from: 'split', to: 'merge', points: right },
        { id: 'gate', from: 'merge', to: 'gate', points: [left[left.length - 1], gate] }
      ],
      routes = buildRoadRoutes(edges, [
        { id: 'left', label: '左の道', edgeIds: ['entry', 'left', 'gate'] },
        { id: 'right', label: '右の道', edgeIds: ['entry', 'right', 'gate'] }
      ])
    if (
      routes.some((route) => route.path.length > 14) ||
      new Set(edges.flatMap((edge) => edge.points.map((point) => `${point.x},${point.y}`))).size >
        (layoutRevision === 1 ? 18 : 24)
    )
      throw new Error('Road graph exceeds battlefield geometry limits')
    field = {
      ...legacyField,
      version,
      layoutRevision,
      width: 1280,
      height: 1440,
      path: routes[0].path,
      slots: [],
      edges,
      routes,
      entrance,
      gate,
      surfaceAnchor: { edgeId: 'gate', startOffset: 20, endOffset: 160 }
    }
    field.slowSurface = routeSurface(field, 'left')
    field.slots = createSlots(field)
  }
  cache.set(key, field)
  resolvedFields.set(legacyField, cache)
  return field
}

export function routeFor(field: ResolvedBattlefield, routeId?: RouteId): RoadRoute {
  const route = routeId === undefined ? field.routes[0] : field.routes.find((route) => route.id === routeId)
  if (!route) throw new RangeError(`Unknown battlefield route: ${String(routeId)}`)
  return route
}

export function allRoadPaths(field: ResolvedBattlefield): readonly Point[][] {
  return field.edges.map((edge) => edge.points)
}

export function distanceToRoadUnion(field: ResolvedBattlefield, point: Point): number {
  return Math.min(...field.edges.map((edge) => project(edge.points, point).distance))
}

export function edgeOffsetToRouteProgress(
  field: ResolvedBattlefield,
  routeId: RouteId | undefined,
  anchor: RoadAnchor
): number | null {
  let accumulated = 0
  for (const id of routeFor(field, routeId).edgeIds) {
    const edge = field.edges.find((edge) => edge.id === id)!,
      length = lengthOf(edge.points)
    if (id === anchor.edgeId) {
      return Number.isFinite(anchor.offset) && anchor.offset >= 0 && anchor.offset <= length
        ? accumulated + anchor.offset
        : null
    }
    accumulated += length
  }
  return null
}

export function routeProgressToEdgeAnchor(
  field: ResolvedBattlefield,
  routeId: RouteId | undefined,
  progress: number
): RoadAnchor | null {
  const route = routeFor(field, routeId)
  if (!Number.isFinite(progress) || progress < 0 || progress > route.length) return null
  let remaining = progress
  for (const id of route.edgeIds) {
    const edge = field.edges.find((edge) => edge.id === id)!,
      length = lengthOf(edge.points)
    if (remaining <= length + EPSILON) return { edgeId: id, offset: Math.min(length, remaining) }
    remaining -= length
  }
  return null
}

export function pointAtRoadAnchor(field: ResolvedBattlefield, anchor: RoadAnchor): Point | null {
  const edge = field.edges.find((edge) => edge.id === anchor.edgeId)
  if (!edge || !Number.isFinite(anchor.offset) || anchor.offset < 0 || anchor.offset > lengthOf(edge.points))
    return null
  return pointAt(edge.points, anchor.offset)
}

export function nearestRoadEdge(field: ResolvedBattlefield, point: Point): RoadProjection {
  let nearest: RoadProjection | undefined
  for (const edge of field.edges) {
    const projection = project(edge.points, point)
    if (nearest && projection.distance >= nearest.distance) continue
    const route = field.routes.find((route) => route.edgeIds.includes(edge.id))!,
      anchor = { edgeId: edge.id, offset: projection.progress }
    nearest = {
      ...projection,
      ...anchor,
      routeId: route.id,
      progress: edgeOffsetToRouteProgress(field, route.id, anchor)!
    }
  }
  return nearest!
}

export function physicalProjectionOnRoute(field: ResolvedBattlefield, routeId: RouteId | undefined, point: Point) {
  return project(routeFor(field, routeId).path, point)
}

export function routeSurface(field: ResolvedBattlefield, routeId?: RouteId): SlowSurface {
  if (!field.surfaceAnchor) return field.slowSurface
  const anchor = field.surfaceAnchor,
    startProgress = edgeOffsetToRouteProgress(field, routeId, { edgeId: anchor.edgeId, offset: anchor.startOffset }),
    endProgress = edgeOffsetToRouteProgress(field, routeId, { edgeId: anchor.edgeId, offset: anchor.endOffset })
  if (startProgress === null || endProgress === null) throw new Error('Slow surface is outside its road route')
  return { ...field.slowSurface, startProgress, endProgress }
}

/** Canonical geometry content identity. Keep insertion order and integer coordinates stable. */
export function battlefieldGeometryIdentity(field: ResolvedBattlefield): string {
  return JSON.stringify({
    fieldId: field.id,
    battlefieldVersion: field.version,
    layoutRevision: field.layoutRevision,
    width: field.width,
    height: field.height,
    edges: field.edges.map(({ id, from, to, points }) => ({ id, from, to, points: points.map((p) => [p.x, p.y]) })),
    routes: field.routes.map(({ id, edgeIds }) => ({ id: id ?? null, edgeIds }))
  })
}
