import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function completionProblems(pr, expectedHead, remoteHead, runs) {
  const problems = []
  if (pr.headRefOid !== expectedHead) problems.push('PR HEAD differs from the validated commit')
  if (remoteHead !== expectedHead) problems.push('Remote branch HEAD is missing or differs from the validated commit')
  if (pr.state !== 'MERGED' || !pr.mergeCommit?.oid) problems.push('PR is not merged')
  if (!runs.length) problems.push('No CI runs found for the merge commit')
  for (const run of runs) {
    if (
      run.headSha !== pr.mergeCommit?.oid ||
      run.headBranch !== pr.baseRefName ||
      run.status !== 'completed' ||
      run.conclusion !== 'success'
    ) {
      problems.push(`CI is not successful on the merge commit: ${run.name} (${run.status}/${run.conclusion})`)
    }
  }
  return problems
}

function read(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).trim()
}

export function checkCompletion(url, expectedHead) {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)$/.exec(url ?? '')
  if (!match || !/^[a-f0-9]{40}$/.test(expectedHead ?? ''))
    throw new Error(
      'Usage: node check-completion.mjs <https://github.com/owner/repo/pull/number> <40-character HEAD SHA>'
    )
  const repo = match[1]
  const pr = JSON.parse(
    read('gh', [
      'pr',
      'view',
      match[2],
      '--repo',
      repo,
      '--json',
      'state,headRefOid,headRefName,baseRefName,mergeCommit,isCrossRepository'
    ])
  )
  if (pr.isCrossRepository) throw new Error('Cross-repository PRs require a separate remote HEAD check')
  const remote = JSON.parse(read('gh', ['api', `repos/${repo}/git/ref/heads/${pr.headRefName}`]))
  const runs = pr.mergeCommit?.oid
    ? JSON.parse(
        read('gh', [
          'run',
          'list',
          '--repo',
          repo,
          '--commit',
          pr.mergeCommit.oid,
          '--branch',
          pr.baseRefName,
          '--limit',
          '100',
          '--json',
          'name,headSha,headBranch,status,conclusion'
        ])
      )
    : []
  if (runs.length === 100) throw new Error('CI result limit reached; verify all runs separately')
  const problems = completionProblems(pr, expectedHead, remote.object?.sha, runs)
  if (problems.length) throw new Error(problems.join('\n'))
  console.log(`Complete: ${url}, HEAD ${expectedHead}, merge ${pr.mergeCommit.oid}, CI success`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkCompletion(process.argv[2], process.argv[3])
  } catch (error) {
    console.error(`Incomplete: ${error.message}`)
    process.exitCode = 1
  }
}
