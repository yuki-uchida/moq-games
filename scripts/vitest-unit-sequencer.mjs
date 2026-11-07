import { posix } from 'node:path'
import { BaseSequencer } from 'vitest/node'
import weights from './vitest-unit-weights.json' with { type: 'json' }

function weightedFile(spec, normalizedRoot) {
  const moduleId = posix.normalize(spec.moduleId.replaceAll('\\', '/'))
  const path = posix.relative(
    normalizedRoot,
    posix.isAbsolute(moduleId) || /^[a-z]:\//i.test(moduleId) ? moduleId : posix.join(normalizedRoot, moduleId)
  )
  return { spec, path, seconds: weights.seconds[path] ?? weights.defaultSeconds }
}

export default class WeightedUnitSequencer extends BaseSequencer {
  async sort(files) {
    const sorted = await super.sort(files)
    if (!this.ctx.config.shard) return sorted
    const normalizedRoot = posix.normalize(this.ctx.config.root.replaceAll('\\', '/'))
    return sorted
      .map((spec) => weightedFile(spec, normalizedRoot))
      .sort((left, right) => {
        const leftProject = left.spec.project
        const rightProject = right.spec.project
        return (
          leftProject.config.sequence.groupOrder - rightProject.config.sequence.groupOrder ||
          (leftProject.name < rightProject.name ? -1 : leftProject.name > rightProject.name ? 1 : 0) ||
          Number(rightProject.config.isolate) - Number(leftProject.config.isolate) ||
          right.seconds - left.seconds
        )
      })
      .map(({ spec }) => spec)
  }

  async shard(files) {
    const { root, shard } = this.ctx.config
    if (!shard) return [...files]
    const normalizedRoot = posix.normalize(root.replaceAll('\\', '/'))
    const weighted = files.map((spec) => weightedFile(spec, normalizedRoot))
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
