import { goblinPursuitTarget } from './GoblinTarget'
import { nextTankRoadblock } from './TankRoadblock'
import { effectiveMovementSpeed } from './CommanderSupport'
import {
  advanceMudTravel,
  applyMudTravel,
  allBarriers,
  roadItems,
  type MudTravel,
  type MudTravelGeometry
} from './Fortifications'
import { attackContact, sandbagStandOff } from './CombatContact'
import { physicalProjectionOnRoute, routeSurface } from './BattlefieldRoutes'
import {
  ROAD_EFFECTS,
  advanceRoadProgress,
  fieldFor,
  isAirborneEnemy,
  pathLength,
  pointOnPath,
  routePathFor,
  type GameState,
  type Point,
  type Sandbag,
  type Unit
} from './model'

export interface EnemyTravelResult extends Point {
  mud?: MudTravel
  progress: number
  flight: Unit['flight']
  moving: boolean
  facingX: number
  facingY: number
}

/** Only validated historical bosses can retain a raid, solely to join their captured road. */
export function isReturningBossRaid(enemy: Pick<Unit, 'owner' | 'boss' | 'type' | 'flight'>): boolean {
  return enemy.owner === 'ai' && enemy.boss && isAirborneEnemy(enemy.type) && enemy.flight?.phase === 'return'
}

export function enemyRecoveryUntil(state: Readonly<GameState>, enemy: Unit): number {
  return state.attacks.reduce(
    (until, attack) => (attack.attackerId === enemy.id ? Math.max(until, attack.endsAt) : until),
    state.time
  )
}

export function routeSandbags(state: Readonly<GameState>, enemy: Unit): Sandbag[] {
  if (enemy.owner !== 'ai' || isAirborneEnemy(enemy.type)) return []
  const field = fieldFor(state)
  return allBarriers(state)
    .flatMap((bag) => {
      if (bag.hp <= 0) return []
      const projection = physicalProjectionOnRoute(field, enemy.routeId, bag)
      if (projection.distance > ROAD_EFFECTS.sandbag.radius + 1e-9) return []
      return [{ ...bag, progress: projection.progress }]
    })
    .filter((bag) => bag.progress + 1e-9 >= enemy.progress)
    .sort((a, b) => a.progress - b.progress || a.id - b.id)
}

function barrierStop(state: Readonly<GameState>, enemy: Unit, barrier: Sandbag): number {
  const path = routePathFor(state, enemy.routeId)
  let before = Math.max(enemy.progress, barrier.progress - sandbagStandOff(enemy)),
    contact = barrier.progress
  if (attackContact({ ...enemy, ...pointOnPath(path, before) }, barrier, enemy.attackRange, 'sandbag').inRange)
    return before
  for (let sample = 0; sample < 32; sample++) {
    const middle = (before + contact) / 2
    if (attackContact({ ...enemy, ...pointOnPath(path, middle) }, barrier, enemy.attackRange, 'sandbag').inRange)
      contact = middle
    else before = middle
  }
  return contact
}

export function nextRoadObstruction(state: Readonly<GameState>, enemy: Unit) {
  if (enemy.owner !== 'ai' || isAirborneEnemy(enemy.type)) return undefined
  const barrier =
    state.battlefieldVersion === 2
      ? routeSandbags(state, enemy)[0]
      : allBarriers(state)
          .filter((bag) => bag.hp > 0 && bag.progress + 1e-9 >= enemy.progress)
          .sort((a, b) => a.progress - b.progress || a.id - b.id)[0]
  const barrierProgress = barrier
    ? state.battlefieldVersion === 2
      ? barrierStop(state, enemy, barrier)
      : Math.max(enemy.progress, barrier.progress - sandbagStandOff(enemy))
    : Infinity
  const tank = nextTankRoadblock(state, enemy)
  // Sandbags win exact ties. Otherwise only the physically nearest obstruction wins.
  if (tank && tank.stopProgress < barrierProgress - 1e-9)
    return { kind: 'tank' as const, tank: tank.tank, stopProgress: tank.stopProgress }
  return barrier ? { kind: 'sandbag' as const, barrier, stopProgress: barrierProgress } : undefined
}

export function advanceEnemyTravel(
  state: Readonly<GameState>,
  enemy: Unit,
  dt: number,
  pauseUntil = enemyRecoveryUntil(state, enemy),
  mudGeometry?: MudTravelGeometry
): EnemyTravelResult {
  const field = fieldFor(state),
    path = routePathFor(state, enemy.routeId),
    base = field.gate,
    airborne = isAirborneEnemy(enemy.type),
    returningBoss = isReturningBossRaid(enemy),
    speed = effectiveMovementSpeed(enemy, state.time, dt) * (state.time < enemy.slowUntil ? enemy.slowFactor : 1)
  let mud: MudTravel | undefined
  let progress = enemy.progress,
    flight = enemy.flight ? { ...enemy.flight } : undefined,
    point: Point = { x: enemy.x, y: enemy.y }
  if (
    state.time + 1e-9 >= pauseUntil &&
    !enemy.gateExit &&
    (returningBoss || !attackContact(enemy, base, enemy.attackRange, 'base').inRange)
  ) {
    if (airborne && flight) {
      const target = state.units.find((unit) => unit.id === flight!.targetId && unit.owner === 'player' && unit.hp > 0)
      let returnDestination: Point | undefined
      if (!target) flight.phase = 'return'
      if (flight.phase === 'return') {
        returnDestination = pointOnPath(path, flight.returnProgress)
        point = moveToward(point, returnDestination, speed * dt)
      } else if (target) {
        const distance = Math.hypot(target.x - point.x, target.y - point.y),
          movement = Math.min(speed * dt, Math.max(0, distance - enemy.attackRange))
        point = moveToward(point, target, movement)
        flight.phase = attackContact({ ...enemy, ...point }, target, enemy.attackRange).inRange ? 'engage' : 'approach'
      }
      if (!returningBoss && attackContact({ ...enemy, ...point }, base, enemy.attackRange, 'base').inRange)
        point = firstContact(
          enemy,
          point,
          (candidate) => attackContact({ ...enemy, ...candidate }, base, enemy.attackRange, 'base').inRange
        )
      if (returnDestination && Math.hypot(point.x - returnDestination.x, point.y - returnDestination.y) <= 1e-9) {
        progress = flight.returnProgress
        flight = undefined
      }
    } else if (
      goblinPursuitTarget(state, enemy) &&
      attackContact(enemy, goblinPursuitTarget(state, enemy)!, enemy.attackRange).inRange
    ) {
      point = { x: enemy.x, y: enemy.y }
    } else {
      const obstruction = nextRoadObstruction(state, enemy),
        limit = Math.min(pathLength(path), obstruction?.stopProgress ?? Infinity),
        usesMud =
          !airborne &&
          state.economyVersion === 2 &&
          (roadItems(state).some((item) => item.kind === 'mud') || (enemy.mudSlowUntil ?? 0) > state.time - dt)
      if (usesMud) mud = advanceMudTravel(state, enemy, dt, limit, routeSurface(field, enemy.routeId), mudGeometry)
      let nextProgress = Math.min(
        limit,
        mud?.progress ??
          advanceRoadProgress(progress, speed, dt, airborne ? undefined : routeSurface(field, enemy.routeId))
      )
      if (attackContact({ ...enemy, ...pointOnPath(path, nextProgress) }, base, enemy.attackRange, 'base').inRange) {
        let before = progress,
          contact = nextProgress
        for (let sample = 0; sample < 32; sample++) {
          const middle = (before + contact) / 2
          if (attackContact({ ...enemy, ...pointOnPath(path, middle) }, base, enemy.attackRange, 'base').inRange)
            contact = middle
          else before = middle
        }
        nextProgress = contact
      }
      const pursuit = goblinPursuitTarget(state, enemy)
      if (
        pursuit &&
        attackContact({ ...enemy, ...pointOnPath(path, nextProgress) }, pursuit, enemy.attackRange).inRange
      ) {
        let before = progress,
          contact = nextProgress
        for (let sample = 0; sample < 32; sample++) {
          const middle = (before + contact) / 2
          if (attackContact({ ...enemy, ...pointOnPath(path, middle) }, pursuit, enemy.attackRange).inRange)
            contact = middle
          else before = middle
        }
        nextProgress = contact
      }
      progress = nextProgress
      point = pointOnPath(path, progress)
    }
  }
  if (!mud && !airborne && state.economyVersion === 2 && roadItems(state).some((item) => item.kind === 'mud'))
    mud = advanceMudTravel(state, enemy, dt, progress, routeSurface(field, enemy.routeId), mudGeometry)
  const facingX = point.x - enemy.x,
    facingY = point.y - enemy.y,
    moving = Math.hypot(facingX, facingY) > 0.001
  return {
    ...(mud ? { mud } : {}),
    ...point,
    progress,
    flight,
    moving,
    facingX: moving ? facingX : enemy.facingX,
    facingY: moving ? facingY : enemy.facingY
  }
}

function moveToward(start: Point, end: Point, distance: number): Point {
  const length = Math.hypot(end.x - start.x, end.y - start.y),
    fraction = length > 0 ? Math.min(1, Math.max(0, distance) / length) : 0
  return { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction }
}

function firstContact(start: Point, end: Point, inRange: (point: Point) => boolean): Point {
  let before = 0,
    contact = 1
  for (let sample = 0; sample < 32; sample++) {
    const middle = (before + contact) / 2,
      point = { x: start.x + (end.x - start.x) * middle, y: start.y + (end.y - start.y) * middle }
    if (inRange(point)) contact = middle
    else before = middle
  }
  return { x: start.x + (end.x - start.x) * contact, y: start.y + (end.y - start.y) * contact }
}

export function applyEnemyTravel(state: Readonly<GameState>, enemy: Unit, travel: EnemyTravelResult): void {
  const { mud, ...movement } = travel
  Object.assign(enemy, movement)
  if (mud) applyMudTravel(state, enemy, mud)
}
