import { posix } from 'node:path'
import { BaseSequencer } from 'vitest/node'
import weights from './vitest-unit-weights.json' with { type: 'json' }

export default class WeightedUnitSequencer extends BaseSequencer {
  async shard(files) {
    const { root, shard } = this.ctx.config
    if (!shard) return [...files]
    const normalizedRoot = posix.normalize(root.replaceAll('\\', '/'))
    const weighted = files.map((spec) => {
      const moduleId = posix.normalize(spec.moduleId.replaceAll('\\', '/'))
      const path = posix.relative(
        normalizedRoot,
        posix.isAbsolute(moduleId) || /^[a-z]:\//i.test(moduleId) ? moduleId : posix.join(normalizedRoot, moduleId)
      )
      return { spec, path, seconds: weights.seconds[path] ?? weights.defaultSeconds }
    })
    weighted.sort(
      (left, right) => right.seconds - left.seconds || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    )
    const partitions = Array.from({ length: shard.count }, () => ({ seconds: 0, files: [] }))
    for (const { spec, seconds } of weighted) {
      const partition = partitions.reduce((best, candidate) => (candidate.seconds < best.seconds ? candidate : best))
      partition.seconds += seconds
      partition.files.push(spec)
    }
    return partitions[shard.index - 1].files
  }
}
