import type { RoadGeometrySnapshot } from './RoadGeometryCache'
import type { ResolvedBattlefield } from './BattlefieldRoutes'
import type { Unit } from './model'

/** Internal, synchronous forecast inputs; never retained with forecast results. */
export interface ForecastQueryContext {
  readonly roads: RoadGeometrySnapshot
  /** Absent for paid cohorts, whose cloned units mutate during prediction. */
  readonly restraints?: {
    readonly units: readonly Unit[]
    readonly field: ResolvedBattlefield
    readonly assignments: ReadonlyMap<number, number>
  }
}
