/** The shoulder camera's arm stops short of big solid props (the lighthouse) instead of sinking into them. */
import { describe, expect, it } from 'vitest'
import { ARM_LENGTH, CameraRig, pointInSolid, rayHitsSolid, type CameraSolid } from '../src/render/camera'

// the model itself (shaft 1.0, gallery 1.26 + lanterns)
const model: CameraSolid = { id: 1, kind: 'cyl', x: 0, z: -66, r: 1.4, y0: 0, y1: 9 }
/** The solid the renderer hands the rig (a little fatter than the model). */
const lighthouse: CameraSolid = { id: 1, kind: 'cyl', x: 0, z: -66, r: 1.5, y0: 0, y1: 9 }

function settle(rig: CameraRig, yaw: number, pitch = 0) {
  for (let i = 0; i < 90; i++)
    rig.shoulder({ feet: [2.3, 0, -65.5], species: 'shiba', yaw, pitch, shoulder: 1, zoom: 0 }, 1 / 60)
  const p = rig.camera.position
  return { x: p.x, y: p.y, z: p.z, arm: rig.arm.length }
}

describe('shoulder camera against solid props', () => {
  it('standing east of the lighthouse and facing east, the camera stays outside it', () => {
    const free = new CameraRig()
    const inside = settle(free, Math.PI / 2)
    // without the solid the camera hugs the shaft (what the reviewer saw)
    expect(pointInSolid(inside.x, inside.y, inside.z, lighthouse, 0.15)).toBe(true)

    const rig = new CameraRig()
    rig.setSolids([lighthouse])
    for (let k = 0; k < 16; k++) {
      const yaw = (k / 16) * Math.PI * 2
      const cam = settle(rig, yaw)
      expect(pointInSolid(cam.x, cam.y, cam.z, model, 0), `yaw ${yaw.toFixed(2)}`).toBe(false)
      expect(cam.arm).toBeLessThanOrEqual(ARM_LENGTH + 1e-6)
    }
    const east = settle(rig, Math.PI / 2)
    expect(east.arm).toBeLessThan(ARM_LENGTH - 0.5)
  })

  it('rayHitsSolid: cylinders and boxes, ignoring a ray that starts inside', () => {
    const box: CameraSolid = { id: 2, kind: 'box', min: [-1, 0, -1], max: [1, 2.5, 1] }
    expect(rayHitsSolid(5, 1, 0, -1, 0, 0, 10, box, 0)).toBeCloseTo(4)
    expect(rayHitsSolid(5, 1, 0, 1, 0, 0, 10, box, 0)).toBe(Infinity)
    expect(rayHitsSolid(0, 1, 0, 1, 0, 0, 10, box, 0)).toBe(Infinity)
    expect(rayHitsSolid(5, 5, 0, -1, 0, 0, 10, box, 0)).toBe(Infinity)
    expect(rayHitsSolid(5, 1, -66, -1, 0, 0, 10, lighthouse, 0)).toBeCloseTo(3.5)
    expect(rayHitsSolid(0, 1, -66, -1, 0, 0, 10, lighthouse, 0)).toBe(Infinity)
  })
})
