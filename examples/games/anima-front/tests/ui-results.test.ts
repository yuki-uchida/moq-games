import { describe, expect, it } from 'vitest'
import { memoryStore } from '../src/app/storage'
import { GUIDE_DEVICES, GUIDE_ROWS, guideSeen, markGuideSeen } from '../src/ui/hud/guide'
import { demoView } from '../src/ui/hud/demo-view'
import { pickMvp } from '../src/ui/hud/model'
import { outcomeOf, RANK_STAMP_AT, resultsCast, SCORE_COUNT } from '../src/ui/screens/results-model'
import type { View } from '../src/sim/types'

const ended = (mode: 'pve' | 'pvp', phase: View['phase']): View => ({ ...demoView(mode, 30), phase })

describe('results cast', () => {
  it('PvE victory: the squad with the MVP in front striking the victory pose, the others cheering', () => {
    const v = ended('pve', 'victory')
    const me = v.players[0].id
    const cast = resultsCast(v, me, outcomeOf({ view: v, me }))
    expect(cast).toHaveLength(Math.min(4, v.players.length))
    const mvp = cast.filter((c) => c.mvp)
    expect(mvp).toHaveLength(1)
    expect(mvp[0].emote).toBe('victory')
    expect(mvp[0].species).toBe(v.players.find((p) => p.id === pickMvp(v))?.species)
    for (const c of cast.filter((x) => !x.mvp)) expect(['cheer', 'wave', 'salute']).toContain(c.emote)
    expect(cast.every((c) => c.team === undefined)).toBe(true)
  })

  it('defeat slumps everyone; PvP shows only my team in its colours', () => {
    const pve = ended('pve', 'defeat')
    expect(resultsCast(pve, pve.players[0].id, 'defeat').every((c) => c.emote === 'defeat')).toBe(true)
    const pvp = ended('pvp', 'victory')
    const me = pvp.players[0]
    const cast = resultsCast(pvp, me.id, 'victory')
    expect(cast.length).toBeLessThanOrEqual(4)
    expect(cast.every((c) => c.team === me.team)).toBe(true)
  })

  it('stamps the rank after the score count-up', () => {
    expect(RANK_STAMP_AT).toBeGreaterThan(SCORE_COUNT.delay + SCORE_COUNT.duration)
  })
})

describe('first-match controls guide', () => {
  it('is remembered once dismissed', () => {
    const store = memoryStore()
    expect(guideSeen(store)).toBe(false)
    markGuideSeen(store)
    expect(guideSeen(store)).toBe(true)
    expect(guideSeen(null)).toBe(false)
  })

  it('covers moving, looking, both paws and jumping on every device', () => {
    for (const d of GUIDE_DEVICES) {
      const text = GUIDE_ROWS[d.id].map((r) => r[0]).join()
      for (const need of ['移動', '視点', 'ジャンプ']) expect(text).toContain(need)
      expect(text).toMatch(/右手/)
      expect(text).toMatch(/左手/)
    }
  })
})
