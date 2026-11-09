/**
 * Guest-side prediction of the controlled hero (DESIGN §13). Runs the same stepBody/Grid code as the host, with
 * dynamic solids from the latest View, applies host forces (warp/impulse, by sequence number) and the host's speed
 * multiplier, and follows the snapshot while the host owns the hero's motion (techniques, grips, downs, falls).
 */
import { TILE } from '../vocab'
import { Grid } from './grid'
import { CROW_FLIGHT, newBody, stepBody, type Body } from './move'
import type { HeroPredictor } from './api'
import type { HeroReport, InputState, StageInfo, View } from './types'

/** Hero states whose position the host dictates. */
const HOST_LOCKED = new Set(['tech', 'grip', 'down', 'fall', 'victory'])

export function createPredictorImpl(info: StageInfo, playerId: string): HeroPredictor {
  const grid = new Grid(info)
  let lastSeq = -1
  let slot = -1
  let body: Body | undefined
  let applied = 0
  let seenAction = -1
  let fills = 0
  let stopped = ''
  return {
    update(view: View, input: InputState, dt: number): HeroReport | undefined {
      if (view.stage !== info.id || view.phase === 'lobby') {
        body = undefined
        return undefined
      }
      const me = view.players.find((p) => p.id === playerId)
      const hv = me && me.ctrl >= 0 ? view.heroes.find((h) => h.slot === me.ctrl) : undefined
      if (!hv) {
        body = undefined
        slot = -1
        return undefined
      }
      if (view.seq !== lastSeq) {
        lastSeq = view.seq
        grid.setSolidProps(view.props)
        const off = (view.currentsOff ?? []).join()
        if (off !== stopped) grid.setStopped((stopped = off) ? off.split(',') : [])
        grid.setBarrier(view.barrier ?? [], info.rooms)
        if ((view.fills?.length ?? 0) !== fills) {
          for (const i of view.fills ?? []) grid.fill(i)
          fills = view.fills?.length ?? 0
        }
      }
      if (!body || slot !== hv.slot) {
        body = newBody(hv.x, hv.y, hv.facing)
        if (hv.stamina !== undefined) body.stamina = hv.stamina * CROW_FLIGHT.stamina
        slot = hv.slot
        applied = hv.force?.seq ?? 0
        seenAction = input.actionPresses
      }
      const f = hv.force
      if (f && f.seq > applied) {
        applied = f.seq
        if (f.kind === 'warp') {
          body.x = f.x
          body.y = f.y
          body.vx = body.vy = body.kx = body.ky = 0
          body.jt = -1
          body.z = 0
        } else {
          body.kx += f.vx
          body.ky += f.vy
        }
      }
      const action = input.actionPresses > seenAction
      seenAction = input.actionPresses
      if (view.phase !== 'play' || HOST_LOCKED.has(hv.state)) {
        body.x = hv.x
        body.y = hv.y
        body.z = hv.z
        body.vx = body.vy = body.kx = body.ky = 0
        body.jt = -1
      } else {
        const stunned = (hv.stun ?? 0) > view.t || (hv.snared ?? 0) > view.t
        const form = hv.form !== undefined ? view.formations[hv.form] : undefined
        const res = stepBody(
          body,
          { mx: input.mx, my: input.my, action, actionHeld: input.actionHeld },
          grid,
          view.species,
          stunned ? 0 : (hv.speed ?? 1),
          dt,
          hv.hold === undefined && !stunned,
          { resist: (form?.slots.length ?? 0) >= 3, carrying: hv.hold !== undefined }
        )
        if (res.fell) {
          // Wait for the host's fall and respawn warp.
          body.vx = body.vy = 0
        }
        // Far from the host copy (lost sync): snap back.
        if (Math.hypot(body.x - hv.x, body.y - hv.y) > 6 * TILE) {
          body.x = hv.x
          body.y = hv.y
        }
      }
      return {
        slot,
        x: Math.round(body.x * 10) / 10,
        y: Math.round(body.y * 10) / 10,
        z: Math.round(body.z * 10) / 10,
        vx: Math.round(body.vx * 10) / 10,
        vy: Math.round(body.vy * 10) / 10,
        facing: Math.round(body.facing * 100) / 100,
        forceSeq: applied,
        airborne: body.jt >= 0 || body.z > 0.01 || body.flying
      }
    },
    current() {
      if (!body || slot < 0) return undefined
      return { slot, x: body.x, y: body.y, z: body.z, facing: body.facing, vx: body.vx, vy: body.vy }
    }
  }
}
