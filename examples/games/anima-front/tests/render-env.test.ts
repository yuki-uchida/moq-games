import { describe, expect, it } from 'vitest'
import { BOX_STYLES, DECOR_KINDS } from '../src/data/map-vocab'
import { QUALITY_PRESETS } from '../src/render/core/quality'
import { TILE_NAMES, tileRect } from '../src/render/env/atlas'
import { planEnvironment } from '../src/render/env/plan'
import { THEMES } from '../src/render/env/themes'
import { buildTestMap } from '../src/render-test/testmap'
import type { BoxKind, MapDef, MapTheme } from '../src/sim/types'

const THEME_IDS: MapTheme[] = ['day', 'sunset', 'night', 'blight', 'virtual']

/** Draw calls the renderer adds on top of the environment plan (sky, particles, actors, markers, post). */
const DYNAMIC_BUDGET = 200

describe('environment planning', () => {
  it('the test map uses every box kind/style and every decor kind', () => {
    const map = buildTestMap()
    for (const [kind, styles] of Object.entries(BOX_STYLES)) {
      for (const style of Object.keys(styles)) {
        const found = map.boxes.some((b) => b.kind === kind && (b.style ?? 0) === Number(style))
        expect(found, `${kind} style ${style}`).toBe(true)
      }
    }
    for (const kind of DECOR_KINDS)
      expect(
        map.decor.some((d) => d.kind === kind),
        kind
      ).toBe(true)
  })

  it('plans every box kind/style and every decor kind in every theme without throwing', { timeout: 60_000 }, () => {
    for (const theme of THEME_IDS) {
      const map: MapDef = { ...buildTestMap(theme), boxes: [], decor: [] }
      for (const [kind, styles] of Object.entries(BOX_STYLES))
        for (const style of Object.keys(styles))
          map.boxes.push({ kind: kind as BoxKind, min: [0, 0, 0], max: [6, 8, 4], style: Number(style) })
      DECOR_KINDS.forEach((kind, i) => {
        for (let style = 0; style < 4; style++) map.decor.push({ kind, p: [i * 3, 0, style * 3], style, s: 1, yaw: i })
      })
      const plan = planEnvironment(map, THEMES[theme], { density: 1, chunk: 64 })
      expect(plan.skipped).toEqual([])
      expect(plan.stats.triangles).toBeGreaterThan(1000)
      for (const c of plan.chunks) {
        expect(c.geo.vertexCount * 4).toBe(c.geo.tint.length)
        expect(c.geo.vertexCount * 4).toBe(c.geo.rect.length)
        expect(c.geo.vertexCount).toBe(c.geo.fx.length)
        for (let i = 0; i < c.geo.pos.length; i++) expect(Number.isFinite(c.geo.pos[i])).toBe(true)
      }
    }
  })

  it('every non-barrier box style produces geometry', { timeout: 60_000 }, () => {
    for (const [kind, styles] of Object.entries(BOX_STYLES)) {
      if (kind === 'barrier') continue
      for (const style of Object.keys(styles)) {
        const map: MapDef = {
          ...buildTestMap('day'),
          boxes: [{ kind: kind as BoxKind, min: [0, 0, 0], max: [6, 8, 4], style: Number(style) }],
          decor: []
        }
        const empty = planEnvironment({ ...map, boxes: [] }, THEMES.day, { density: 1, chunk: 64 })
        const plan = planEnvironment(map, THEMES.day, { density: 1, chunk: 64 })
        expect(plan.stats.triangles, `${kind} ${style}`).toBeGreaterThan(empty.stats.triangles)
      }
    }
  })

  it('stays within the draw-call budget at every quality', { timeout: 60_000 }, () => {
    const map = buildTestMap('day')
    for (const [quality, preset] of Object.entries(QUALITY_PRESETS)) {
      const plan = planEnvironment(map, THEMES.day, { density: preset.decorDensity, chunk: preset.chunk })
      // Main pass draws every batch at worst; the shadow pass draws casters inside the sun box at worst.
      const env = plan.stats.drawCalls + (preset.shadows ? plan.stats.shadowCasters : 0)
      expect(env + DYNAMIC_BUDGET, quality).toBeLessThanOrEqual(450)
      expect(plan.stats.triangles, quality).toBeLessThan(700_000)
    }
  })

  it('atlas tiles have distinct rects inside the unit square', () => {
    const seen = new Set<string>()
    for (const name of TILE_NAMES) {
      const r = tileRect(name)
      expect(r[0]).toBeGreaterThanOrEqual(0)
      expect(r[1]).toBeGreaterThanOrEqual(0)
      expect(r[0] + r[2]).toBeLessThanOrEqual(1)
      expect(r[1] + r[3]).toBeLessThanOrEqual(1)
      seen.add(r.join(','))
    }
    expect(seen.size).toBe(TILE_NAMES.length)
  })
})
