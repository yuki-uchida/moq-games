import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { ItemId } from '../src/data/items'
import type { SpeciesId } from '../src/data/species'
import type { CharacterModel, CharacterPose, HandPose } from '../src/models/api'
import { gearModel } from '../src/models/gear'
import { createModelKit } from '../src/models'
import { HOLD, readyKey, STANCE, useTrack } from '../src/models/motion'
import type { HandAct, MoveState } from '../src/sim/types'

const MELEE: ItemId[] = ['orca', 'narwhal', 'mammoth', 'mantis', 'claw']

const hand = (item: ItemId | null, act: HandAct = 'idle', uses = 0): HandPose => ({
  item,
  act,
  charge: 0,
  uses,
  combo: 0,
  swap: 0
})

function pose(item: ItemId, move: MoveState, extra: Partial<CharacterPose> = {}): CharacterPose {
  return {
    localVel: move === 'run' ? [0, 6.8] : [0, 0],
    grounded: move !== 'air',
    vy: move === 'air' ? 3 : 0,
    move,
    aimYaw: 0,
    aimPitch: 0,
    hands: [hand(item), hand(null)],
    state: 'alive',
    revive: 0,
    reviving: false,
    hurt: 0,
    ...extra
  }
}

const paw = (c: CharacterModel, out: THREE.Vector3) => {
  const bone = c.root.getObjectByName('pawR')!
  bone.updateWorldMatrix(true, false)
  return bone.getWorldPosition(out)
}

/** Unit direction from the right paw to the antique's muzzle / tip (the root faces +Z, +X is the left side). */
function tipDir(c: CharacterModel, p: CharacterPose, seconds: number): THREE.Vector3 {
  for (let t = 0; t < seconds; t += 1 / 60) c.update(1 / 60, p)
  const m = c.muzzle(0, new THREE.Vector3())
  return m.sub(paw(c, new THREE.Vector3())).normalize()
}

describe('melee stances', () => {
  const kit = createModelKit({ quality: 'low' })

  it('hold blades, hammers and scythes up or back (not pointing forward like guns) when idle, running and aiming', () => {
    for (const species of ['hamster', 'shiba', 'bear'] as SpeciesId[]) {
      const c = kit.createCharacter(species)
      for (const id of MELEE) {
        for (const [move, extra] of [
          ['idle', {}],
          ['run', {}],
          ['idle', { aimPitch: 0.5, aimYaw: 0.3 }],
          ['idle', { aimPitch: -0.6 }]
        ] as [MoveState, Partial<CharacterPose>][]) {
          const d = tipDir(c, pose(id, move, extra), 1)
          const label = `${species} ${id} ${move} ${JSON.stringify(extra)}`
          // Never a rifle hold: the tip rises well above the paw.
          expect(d.y, label).toBeGreaterThan(0.4)
          if (id === 'orca' || id === 'mammoth') expect(d.z, label).toBeLessThan(0) // over the shoulder
          if (id === 'mantis') expect(d.y, label).toBeGreaterThan(0.6) // upright handle, blade tip out at the top
          if (id === 'narwhal') expect(d.z, label).toBeGreaterThan(0) // up and forward
          if (id !== 'claw') expect(d.x, label).toBeLessThan(0.1) // on the right (−X) side, away from the head
        }
      }
      c.dispose()
    }
  }, 60_000)

  it('keeps guns aiming forward', () => {
    const c = kit.createCharacter('fox')
    const d = tipDir(c, pose('bee', 'idle'), 1)
    expect(d.z).toBeGreaterThan(0.8)
    c.dispose()
  }, 30_000)

  it('swings the arm while running with a melee antique', () => {
    const c = kit.createCharacter('shiba')
    const zs: number[] = []
    const v = new THREE.Vector3()
    for (let f = 0; f < 90; f++) {
      c.update(1 / 60, pose('narwhal', 'run'))
      if (f > 30) zs.push(paw(c, v).z)
    }
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.04)
    c.dispose()
  }, 30_000)

  it('starts every use from the stance without a jump and ends back on it', () => {
    const c = kit.createCharacter('shiba')
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    for (const id of MELEE) {
      const rest = tipDir(c, pose(id, 'idle'), 1)
      paw(c, a)
      // First frame of the use: the paw starts blending from where it was.
      c.update(1 / 60, pose(id, 'idle', { hands: [hand(id, 'swing', 1), hand(null)] }))
      expect(paw(c, b).distanceTo(a), id).toBeLessThan(0.04)
      let maxStep = 0
      for (let f = 0; f < 90; f++) {
        paw(c, a)
        c.update(1 / 60, pose(id, 'idle', { hands: [hand(id, f < 20 ? 'swing' : 'idle', 1), hand(null)] }))
        maxStep = Math.max(maxStep, paw(c, b).distanceTo(a))
      }
      expect(maxStep, id).toBeLessThan(0.16)
      const after = tipDir(c, pose(id, 'idle', { hands: [hand(id, 'idle', 1), hand(null)] }), 0.6)
      expect(after.dot(rest), id).toBeGreaterThan(0.97)
    }
    c.dispose()
  }, 30_000)

  it('defines the use tracks of the melee antiques from their stances', () => {
    for (const id of MELEE) {
      const hold = HOLD[id]
      const stance = STANCE[hold]!
      const track = useTrack(id, 0)!
      for (const key of [track.keys[0], track.keys[track.keys.length - 1]]) {
        expect(key.pos, id).toEqual(stance.pos)
        expect(key.fwd, id).toEqual(stance.fwd)
      }
      expect(readyKey(hold, 'idle', 0, id).fwd, id).toEqual(stance.fwd)
    }
  })
})

describe('redesigned antiques and the turtle shell', () => {
  it('build within budget with the tip anchor at the far end', () => {
    const kit = createModelKit({ quality: 'medium' })
    for (const id of ['mantis', 'mammoth', 'leaf', 'sloth'] as ItemId[]) {
      const asset = kit.itemAsset(id)
      expect(asset.triangles, id).toBeLessThanOrEqual(2800)
      expect(asset.triangles, id).toBeGreaterThan(900)
      const item = kit.createItem(id)
      const box = new THREE.Box3().setFromObject(item.root)
      // The muzzle lies on the model (not floating away from it).
      expect(box.distanceToPoint(item.muzzle), id).toBeLessThan(0.02)
      item.dispose()
    }
    // The scythe tip and the mallet face lead (+Z beyond the grip, the blade tip out along +Y).
    expect(kit.itemAsset('mammoth').muzzle[2]).toBeGreaterThan(0.55)
    expect(kit.itemAsset('mantis').muzzle[1]).toBeGreaterThan(0.3)
  }, 30_000)

  it('sculpts the turtle shell as a tall dome within its gear budget', () => {
    const shell = gearModel('turtle', 'medium')
    expect(shell.triangles).toBeLessThanOrEqual(700)
    shell.geometry.computeBoundingBox()
    const bb = shell.geometry.boundingBox!
    // Outward (+Z) depth of the dome and a footprint wide enough to cover the uniform's back plate.
    expect(bb.max.z).toBeGreaterThan(0.13)
    expect(bb.max.x - bb.min.x).toBeGreaterThan(0.34)
    expect(bb.max.y - bb.min.y).toBeGreaterThan(0.36)
  }, 30_000)
})
