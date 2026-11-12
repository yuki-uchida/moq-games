import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ITEMS, ITEM_IDS, type ItemId } from '../src/data/items'
import { SPECIES_IDS } from '../src/data/species'
import type { CharacterPose, Emote, HandPose } from '../src/models/api'
import { createModelKit } from '../src/models'
import type { HandAct, MoveState } from '../src/sim/types'

const MOVES: MoveState[] = ['idle', 'run', 'air', 'dash', 'slide', 'glide', 'hook', 'launch']
const ACTS: HandAct[] = ['idle', 'fire', 'charge', 'guard', 'swing', 'beam', 'cooldown']
const EMOTES: Emote[] = ['victory', 'defeat', 'cheer', 'salute', 'wave']
const ACTIVE = ITEM_IDS.filter((id) => ITEMS[id].active)

const hand = (item: ItemId | null, act: HandAct, charge: number, uses: number, swap = 0): HandPose => ({
  item,
  act,
  charge,
  uses,
  combo: uses % 3,
  swap
})

function pose(over: Partial<CharacterPose>): CharacterPose {
  return {
    localVel: [0, 0],
    grounded: true,
    vy: 0,
    move: 'idle',
    aimYaw: 0,
    aimPitch: 0,
    hands: [hand(null, 'idle', 0, 0), hand(null, 'idle', 0, 0)],
    state: 'alive',
    revive: 0,
    reviving: false,
    hurt: 0,
    ...over
  }
}

function assertFinite(root: THREE.Object3D, label: string) {
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    for (const e of o.matrixWorld.elements) if (!Number.isFinite(e)) throw new Error(`NaN in ${label}: ${o.name}`)
  })
}

describe('procedural animation', () => {
  const kit = createModelKit({ quality: 'low' })

  it('runs every move, act, emote and state for every species without NaN', () => {
    const out = new THREE.Vector3()
    for (const id of SPECIES_IDS) {
      const c = kit.createCharacter(id)
      let uses = 0
      let hurt = 0
      const step = (p: CharacterPose, frames = 12) => {
        for (let f = 0; f < frames; f++) c.update(1 / 60, p)
      }
      for (const move of MOVES)
        step(
          pose({
            move,
            grounded: move === 'idle' || move === 'run' || move === 'dash' || move === 'slide',
            vy: move === 'air' ? -6 : move === 'launch' ? 14 : 0,
            localVel: move === 'idle' ? [0, 0] : [2, 7],
            aimPitch: 0.6,
            aimYaw: -0.4
          })
        )
      for (const act of ACTS) {
        uses++
        step(pose({ hands: [hand('orca', act, 0.7, uses), hand('bee', act, 0.4, uses)], hurt: ++hurt }))
      }
      for (const emote of EMOTES) step(pose({ emote }), 30)
      step(pose({ state: 'down', revive: 0.5 }), 30)
      step(pose({ state: 'away' }), 10)
      step(pose({ reviving: true, hands: [hand('bee', 'idle', 0, uses), hand(null, 'idle', 0, 0)] }), 30)
      // Extreme aim and a huge frame time must stay stable.
      c.update(5, pose({ aimPitch: 1.35, aimYaw: 3, localVel: [-40, -40] }))
      assertFinite(c.root, id)
      expect(Number.isFinite(c.muzzle(0, out).x)).toBe(true)
      expect(Number.isFinite(c.muzzle(1, out).y)).toBe(true)
      c.dispose()
    }
  }, 60_000)

  it('holds every active antique in either paw, with swaps, and reports a muzzle on the antique', () => {
    const c = kit.createCharacter('shiba')
    const out = new THREE.Vector3()
    let uses = 0
    for (const id of ACTIVE) {
      for (const act of ACTS) {
        uses++
        for (let f = 0; f < 6; f++)
          c.update(1 / 60, pose({ hands: [hand(id, act, f / 5, uses, f === 3 ? 0.5 : 0), hand(id, act, 0.5, uses)] }))
      }
      assertFinite(c.root, id)
      const m = c.muzzle(0, out)
      // The muzzle is in front of the animal and within a couple of metres.
      expect(m.length(), id).toBeLessThan(3)
    }
    c.dispose()
  }, 60_000)

  it('aims: raising aimPitch raises the right muzzle of a held pistol', () => {
    const c = kit.createCharacter('fox')
    const low = new THREE.Vector3()
    const high = new THREE.Vector3()
    const run = (pitch: number, out: THREE.Vector3) => {
      for (let f = 0; f < 60; f++)
        c.update(1 / 60, pose({ aimPitch: pitch, hands: [hand('bee', 'idle', 0, 0), hand(null, 'idle', 0, 0)] }))
      c.muzzle(0, out)
    }
    run(-0.5, low)
    run(0.8, high)
    expect(high.y).toBeGreaterThan(low.y + 0.05)
    // Facing +Z: the held pistol points forward and sits on the right (−X) side.
    expect(low.z).toBeGreaterThan(0.1)
    expect(low.x).toBeLessThan(0)
    c.dispose()
  }, 30_000)
})
