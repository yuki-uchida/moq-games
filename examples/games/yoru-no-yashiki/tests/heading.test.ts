import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cameraHeading, headingFromYaw } from '../src/heading'
import type { PlayerId } from '../src/match'
import type { WorldFrame } from '../src/world'

const headings = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
const sector = Math.PI / 4

describe('camera heading', () => {
  it('matches all eight world directions over positive and negative revolutions', () => {
    for (const turns of [-100, -2, -1, 0, 1, 2, 100]) {
      for (const [index, heading] of headings.entries()) {
        expect(headingFromYaw(index * sector + turns * 2 * Math.PI)).toBe(heading)
      }
    }
    expect(headingFromYaw(-0)).toBe('北')
    expect(headingFromYaw(Math.PI)).toBe('南')
    expect(headingFromYaw(-Math.PI)).toBe('南')
    expect(headingFromYaw(-Math.PI / 2)).toBe('西')
  })

  it('assigns exact half-sector boundaries clockwise and distinguishes either side', () => {
    for (let index = -8; index < 8; index++) {
      const boundary = (index + 0.5) * sector
      const before = headings[((index % 8) + 8) % 8]
      const after = headings[(((index + 1) % 8) + 8) % 8]
      expect(headingFromYaw(boundary - 1e-10)).toBe(before)
      expect(headingFromYaw(boundary)).toBe(after)
      expect(headingFromYaw(boundary + 1e-10)).toBe(after)
      for (const turns of [-2, -1, 1, 2]) {
        expect(headingFromYaw(boundary - 1e-10 + turns * 2 * Math.PI)).toBe(before)
        expect(headingFromYaw(boundary + turns * 2 * Math.PI)).toBe(after)
        expect(headingFromYaw(boundary + 1e-10 + turns * 2 * Math.PI)).toBe(after)
      }
    }
  })

  it('returns unknown for invalid angles and handles extreme finite angles', () => {
    for (const yaw of [NaN, Infinity, -Infinity]) expect(headingFromYaw(yaw)).toBe('不明')
    for (const yaw of [Number.MAX_VALUE, -Number.MAX_VALUE]) {
      expect(headings).toContain(headingFromYaw(yaw))
      expect(headingFromYaw(yaw)).toBe(headingFromYaw(yaw % (2 * Math.PI)))
    }
  })

  it.each(['host', 'guest'] as const)('follows %s camera through turns and role exchange', (player) => {
    const human = { x: -5, z: 5, yaw: 0 }
    const haunter = { x: 5, z: -5, yaw: Math.PI }
    for (const survivor of ['host', 'guest', 'host'] as PlayerId[]) {
      const role = survivor === player ? 'human' : 'haunter'
      const frame: Pick<WorldFrame, 'role' | 'human' | 'haunter'> = { role, human, haunter }
      const viewer = role === 'human' ? human : haunter
      const remote = role === 'human' ? haunter : human
      viewer.yaw = 0
      remote.yaw = Math.PI
      expect(cameraHeading(frame)).toBe('現在の向き：北')
      for (const [index, heading] of headings.entries()) {
        viewer.yaw = index * sector
        expect(cameraHeading(frame)).toBe('現在の向き：' + heading)
      }
      remote.yaw = NaN
      expect(cameraHeading(frame)).toBe('現在の向き：北西')
      viewer.yaw = NaN
      expect(cameraHeading(frame)).toBe('現在の向き：不明')
    }
  })

  it('uses the same post-movement frame as rendering without live announcements', () => {
    const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
    expect(source).toContain('<p id=heading class=note>現在の向き：不明</p><p id=ritual-hint>')
    const frame = source.slice(source.indexOf('function frame()'))
    expect(frame.indexOf('const worldFrame: WorldFrame')).toBeGreaterThan(frame.indexOf('haunter = movePose('))
    expect(frame).toContain("const role = snapshot.survivor === player ? 'human' : 'haunter'")
    expect(frame).toMatch(/const worldFrame: WorldFrame = \{\s*role,\s*pitch,\s*human,\s*haunter,/)
    expect(frame).toContain(
      "const heading = cameraHeading(worldFrame)\n  if (el('heading').textContent !== heading) text('heading', heading)\n  world?.render(worldFrame)"
    )
    expect(source).not.toContain('aria-live')
  })
})
