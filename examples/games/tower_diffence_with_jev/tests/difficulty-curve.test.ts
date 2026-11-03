import { SPECIALS, specialReady } from '../src/game/SpecialAbilities'
import { stageRules, type AllyType } from '../src/game/model'
import { DRAGON_BREATH_MOUTHS } from '../src/rendering/DragonBreathArt'
import { it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { GameEngine } from '../src/game/GameEngine'
import { RuleBasedAI } from '../src/ai/AIController'
import {
  freshProfile,
  freshRunFromProfile,
  scout,
  availableAllies,
  resumeProgress
} from '../src/progression/UpgradeSystem'
it('completes all ten stages with earned funds, spaced defenses and reserved caster specials', async () => {
  const logs = []
  const seed = 42,
    anchor = 180,
    policy = 'focus-reserve'
  {
    // Use the browser's actual flame geometry and the local offline enemy controller.
    let clock = 0
    const save = freshRunFromProfile(freshProfile(), 2, 1),
      e = new GameEngine(new RuleBasedAI(), save, 'meadow', seed, () => clock, DRAGON_BREATH_MOUTHS, 2, 1)
    const offsets: Record<AllyType, [number, number]> = {
      tank: [0, 0],
      soldier: [-42, 0],
      runner: [42, 0],
      archer: [-145, 0],
      mage: [145, 0],
      healer: [0, 170],
      frost: [-140, 120],
      ranger: [140, 120],
      cannon: [-145, 60],
      paladin: [0, -60]
    }
    for (let stage = 1; stage <= 10; stage++) {
      // Fixed scout draws represent one possible roster, not a population win rate.
      if (stage > 1 && save.gold >= 120) scout(save, () => 0, e.state)
      const placements = []
      for (const type of [
        'tank',
        'soldier',
        'runner',
        'archer',
        ...availableAllies(save, stage).filter((t) => !['tank', 'soldier', 'runner', 'archer'].includes(t))
      ] as AllyType[]) {
        if (e.state.units.some((u) => u.owner === 'player' && u.type === type)) continue
        const [dx, dy] = offsets[type]
        const p = { x: 640 + dx, y: anchor + dy }
        const check = e.previewPlacement(type, p)
        placements.push({ type, p, reason: check.reason })
        if (check.valid) e.place(type, p)
      }
      if (stage >= 8) {
        const casters = e.state.units
          .filter((u) => u.owner === 'player' && ['cannon', 'mage'].includes(u.type))
          .sort((a, b) => (a.type === 'cannon' ? -1 : 1))
        for (let level = 2; level <= 3; level++)
          for (const u of casters) if ((u.level ?? 1) < level) e.upgradeDefender(u.id)
        for (const u of casters) if ((u.level ?? 1) >= 3) e.equipDefender(u.id, 'armor')
      }
      const before = save.gold
      expect(save.gold).toBeGreaterThanOrEqual(0)
      expect(e.startAssault()).toBe(true)
      for (let i = 0; i < 9000 && e.state.phase === 'assault'; i++) {
        clock += 50
        e.update(0.05)
        if (i % 20 === 0) {
          const foes = e.state.units.filter((u) => u.owner === 'ai' && u.hp > 0)
          for (const u of e.state.units.filter((u) => u.owner === 'player' && u.hp > 0)) {
            if (!specialReady(e.state, u.id)) continue
            const spec = SPECIALS[u.type as keyof typeof SPECIALS]
            if (u.type === 'healer') {
              const hurt = e.state.units.filter(
                (v) =>
                  v.owner === 'player' &&
                  v.hp > 0 &&
                  v.maxHp - v.hp > 25 &&
                  Math.hypot(v.x - u.x, v.y - u.y) <= spec.range
              )[0]
              if (hurt) e.castSpecial(u.id, hurt)
              continue
            }
            // One offensive action per second; reserve the two heavy spells for bosses.
            const inRange = foes.filter((v) => Math.hypot(v.x - u.x, v.y - u.y) <= spec.range)
            inRange.sort(
              (a, b) =>
                (b.boss ? 1000 : 0) +
                foes.filter((v) => Math.hypot(v.x - b.x, v.y - b.y) < spec.radius).length * 100 -
                ((a.boss ? 1000 : 0) + foes.filter((v) => Math.hypot(v.x - a.x, v.y - a.y) < spec.radius).length * 100)
            )
            const t = inRange[0]
            if (t && (t.boss || (!['mage', 'cannon'].includes(u.type) && inRange.length >= 2))) {
              if (e.castSpecial(u.id, t)) break
            }
          }
        }
        for (let j = 0; j < 12; j++) await Promise.resolve()
      }
      logs.push({
        seed,
        rules: stageRules(stage),
        anchor,
        policy,
        stage,
        result: e.state.phase,
        seconds: e.state.time,
        goldBefore: before,
        goldAfter: save.gold,
        hp: e.state.playerBaseHp,
        placements,
        allies: e.state.units
          .filter((u) => u.owner === 'player')
          .map((u) => ({ type: u.type, hp: u.hp, level: u.level, equipment: u.equipment })),
        summary: e.state.stageSummary
      })
      if (process.env.TOWER_DIFFICULTY_REPORT)
        writeFileSync(process.env.TOWER_DIFFICULTY_REPORT, JSON.stringify(logs, null, 2))
      if (!e.nextStage()) {
        expect(e.state.phase, `seed ${seed} stage ${stage}`).toBe('victory')
        expect(stage).toBe(10)
        break
      }
    }
  }
}, 240000)

it('keeps wave rosters and stats compatible while spacing late attacks', () => {
  expect([1, 2, 3, 4, 5].map((stage) => stageRules(stage).enemyCount)).toEqual([5, 7, 9, 11, 13])
  expect([1, 2, 3, 4, 5].map((stage) => stageRules(stage).strength)).toEqual([1, 1.1, 1.2, 1.3, 1.4])
  expect([6, 7, 8, 9, 10].map((stage) => stageRules(stage).enemyCount)).toEqual([15, 17, 19, 21, 23])
  expect(stageRules(10).strength).toBeCloseTo(1.9)
  expect(stageRules(10).spawnBudget).toBe(120)
  expect(stageRules(10).spawnInterval).toBeCloseTo(4)
  expect(stageRules(6).spawnInterval).toBeCloseTo(2.48)
})

// Genuine seed-42 playthrough checkpoints generated against 2f6e26d9 before balance changes.
// The assault fixture has all 23 enemies spawned and a budget above the rejected reduced cap.
for (const phase of ['preparation', 'assault'])
  it(`resumes an original late-wave ${phase} checkpoint without rewriting its input`, () => {
    const raw = readFileSync(new URL(`./fixtures/difficulty-v1/${phase}.json`, import.meta.url), 'utf8')
    const checkpoint = JSON.parse(raw)
    const save = resumeProgress(checkpoint.profile, checkpoint.progress)
    const restored = GameEngine.fromCheckpoint(checkpoint, new RuleBasedAI(), save, () => 0, DRAGON_BREATH_MOUTHS)
    expect(restored).not.toBeNull()
    expect(restored!.state.phase).toBe(phase)
    if (phase === 'assault') {
      expect(restored!.state.enemiesSpawned).toBe(23)
      expect(restored!.state.budgetSpent).toBe(68)
    }
    expect(restored!.state.waveBossPolicy).toBe(phase === 'assault' ? 2 : 3)
    const exported = restored!.exportCheckpoint()
    expect(exported).not.toBeNull()
    expect(exported!.version).toBe(19)
    expect(exported!.state.waveBossPolicy).toBe(phase === 'assault' ? 2 : 3)
    expect(JSON.stringify(checkpoint)).toBe(raw)
  })
