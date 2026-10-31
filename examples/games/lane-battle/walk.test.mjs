import { test } from 'node:test'
import assert from 'node:assert/strict'
import { animationFrame, walkPose } from './animation.js'
import { createGame, step, summon } from './simulation.js'

test('walk pose follows distance rather than wall clock and loops at scaled stride', () => {
  const meta = { fps: 52, frames: Array(24).fill({}), frameSize: { width: 128 }, strideWorldUnits: 24 }
  const sample = (distance, phase = 0) => animationFrame(meta, 'walk', phase, 1, distance, 128)
  assert.equal(sample(0, 9), sample(0, 1))
  assert.equal(sample(12), 12)
  assert.equal(sample(24), sample(0))
  assert.equal(animationFrame(meta, 'walk', 0, 1, 12, 256), 6)
})

test('walk distance follows movement and stays fixed while attacking', () => {
  const game = createGame()
  summon(game, 0)
  const unit = game.units[0]
  const start = unit.x
  step(game, 0.1)
  assert.ok(Math.abs(unit.walkDistance - (unit.x - start)) < 1e-9)
  unit.x = 920
  const distance = unit.walkDistance
  step(game, 0.1)
  assert.equal(unit.motion, 'attack')
  assert.equal(unit.walkDistance, distance)
})

test('weight shift is smooth across the seam and mirrors by direction', () => {
  const meta = { frameSize: { width: 128 }, strideWorldUnits: 24 }
  const pose = (distance, side = 1) => walkPose(meta, distance, 128, side, 'soldier')
  const first = pose(0)
  const last = pose(24)
  assert.ok(Math.abs(first.angle - last.angle) < 1e-12)
  assert.ok(Math.abs(first.height - last.height) < 1e-12)
  assert.ok(pose(6).height < first.height)
  assert.equal(pose(6).angle, -pose(6, -1).angle)
})
