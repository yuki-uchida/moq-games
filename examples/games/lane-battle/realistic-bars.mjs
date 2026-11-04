export function realisticBarFailures(stage, policy, rows, seeds) {
  const baseline = rows[0]
  const failures = []
  if (stage === 22 && baseline.wins < seeds * 0.5)
    failures.push(`${stage} ${policy} baseline: ${baseline.wins}/${seeds}, minimum ${Math.ceil(seeds * 0.5)}`)
  for (const row of rows.slice(1)) {
    const highBaseline = stage === 15 || baseline.wins >= seeds * 0.95
    const minimum = highBaseline
      ? Math.ceil(seeds * 0.9)
      : Math.max(Math.ceil(baseline.wins - seeds * 0.15), stage === 22 ? Math.ceil(baseline.wins * 0.75) : 0)
    if (row.wins < minimum || (policy === 'keep' && row.summons < 1))
      failures.push(`${stage} ${policy} ${row.name}: ${row.wins}/${seeds}, ${row.summons} summons; minimum ${minimum}`)
    if (highBaseline && row.blocks.some((block) => block < 34))
      failures.push(`${stage} ${policy} ${row.name}: blocks ${row.blocks.join(' ')}`)
  }
  return failures
}
