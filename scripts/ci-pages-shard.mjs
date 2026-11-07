import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function parsePagesList(source) {
  const lines = source.replaceAll('\r\n', '\n').trimEnd().split('\n')
  if (lines.shift() !== 'Listing tests:') throw new Error('Missing Playwright list header')
  const total = lines.pop()?.match(/^Total: (\d+) tests? in (\d+) files?$/)
  if (!total) throw new Error('Missing Playwright list total')
  const names = lines.map((line) => {
    const match = line.match(/^  (.+?):[1-9]\d*:[1-9]\d* › (.+)$/)
    if (!match) throw new Error(`Unsupported Playwright list line: ${line}`)
    let spec = match[1].replaceAll('\\', '/')
    if (spec.includes(' › ')) throw new Error(`Unsupported test path: ${spec}`)
    if (/^(?:\/|[a-z]:\/)/i.test(spec) && spec.includes('/tests/')) spec = spec.slice(spec.indexOf('/tests/') + 1)
    if (/^(?:\/|[a-z]:\/|\.\.\/)/i.test(spec)) throw new Error(`Unsupported test path: ${spec}`)
    if (!spec.startsWith('tests/')) spec = `tests/${spec}`
    return `${spec.slice('tests/'.length)} › ${match[2]}`
  })
  if (names.length !== Number(total[1])) throw new Error('Playwright list count mismatch')
  return names
}

export function selectPagesShard(names, index, count, weights) {
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(index) || index < 1 || index > count)
    throw new Error('Shard index/count must be positive safe integers with index <= count')
  if (
    !weights ||
    !Number.isFinite(weights.defaultSeconds) ||
    weights.defaultSeconds <= 0 ||
    !weights.seconds ||
    typeof weights.seconds !== 'object' ||
    Array.isArray(weights.seconds) ||
    Object.values(weights.seconds).some((seconds) => !Number.isFinite(seconds) || seconds <= 0)
  )
    throw new Error('Invalid Pages test weights')
  const weighted = names.map((name) => ({ name, seconds: weights.seconds[`tests/${name}`] ?? weights.defaultSeconds }))
  weighted.sort(
    (left, right) => right.seconds - left.seconds || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  )
  const partitions = Array.from({ length: count }, () => ({ seconds: 0, names: [] }))
  for (const { name, seconds } of weighted) {
    const partition = partitions.reduce((best, candidate) => (candidate.seconds < best.seconds ? candidate : best))
    partition.seconds += seconds
    partition.names.push(name)
  }
  return partitions[index - 1].names
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 2 || args.some((arg) => !/^[1-9]\d*$/.test(arg)))
      throw new Error('Usage: node scripts/ci-pages-shard.mjs <index> <count> < playwright-list.txt')
    const weights = JSON.parse(readFileSync(new URL('./ci-pages-weights.json', import.meta.url), 'utf8'))
    const selected = selectPagesShard(
      parsePagesList(readFileSync(0, 'utf8')),
      Number(args[0]),
      Number(args[1]),
      weights
    )
    if (selected.length) process.stdout.write(selected.join('\n') + '\n')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
