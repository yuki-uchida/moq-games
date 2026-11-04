import { POOPS, card, rng } from './simulation.js'
import { addEntry, levelUp, newCampaign } from './campaign.js'
import { chooseFormation, playCampaign } from './bot.js'

export function collectRealisticSamples(stages, clearStages = []) {
  const samples = Object.fromEntries(stages.map((stage) => [stage, []]))
  for (const seed of [3, 11, 29, 42, 77, 101]) {
    const seen = new Set()
    playCampaign(rng(seed), {
      casual: true,
      untilCleared: Math.max(...stages.map((stage) => stage + (clearStages.includes(stage) ? 1 : 0))),
      log: (_battle, report, campaign) => {
        for (const stage of stages) {
          const ready = clearStages.includes(stage)
            ? report.victory && campaign.cleared === stage + 1
            : campaign.cleared === stage
          if (!ready || seen.has(stage)) continue
          seen.add(stage)
          samples[stage].push(
            campaign.roster.map((entry) => ({ ...entry, equipped: campaign.loadout.includes(entry.uid) }))
          )
        }
      }
    })
  }
  return samples
}

export function realisticFormation(stage, samples, special = null, owned = null) {
  if (samples.length !== 6) throw new Error(`stage ${stage} needs six campaign samples`)
  const campaign = newCampaign()
  campaign.cleared = stage
  const growthRandom = rng(stage)
  const eligible = POOPS.filter(
    (type) =>
      type.unlock <= stage && samples.filter((roster) => roster.some((entry) => entry.key === type.key)).length >= 4
  )
  campaign.roster = campaign.roster.filter((entry) => eligible.some((type) => type.key === entry.key))
  for (const type of eligible) {
    const levels = samples.flatMap((roster) =>
      roster.filter((entry) => entry.key === type.key).map((entry) => entry.level)
    )
    levels.sort((a, b) => a - b)
    const middle = Math.floor(levels.length / 2)
    const median = levels.length % 2 ? levels[middle] : Math.round((levels[middle - 1] + levels[middle]) / 2)
    const entry = campaign.roster.find((unit) => unit.key === type.key) ?? addEntry(campaign, type.key)
    while (entry.level < median) levelUp(entry, growthRandom)
  }
  chooseFormation(campaign)
  const entries = campaign.loadout.map((uid) => campaign.roster.find((entry) => entry.uid === uid))
  const specialIndex = special ? Math.min(4, entries.length) : -1
  if (special) {
    const entry = addEntry(campaign, special.key, stage)
    entries.splice(specialIndex, 0, owned ? { ...owned, uid: entry.uid } : entry)
  }
  return { deck: entries.slice(0, 6).map(card), specialIndex }
}
