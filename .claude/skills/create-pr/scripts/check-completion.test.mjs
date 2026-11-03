import assert from 'node:assert/strict'
import test from 'node:test'
import { checkCompletion, completionProblems } from './check-completion.mjs'

const head = 'a'.repeat(40)
const merge = 'b'.repeat(40)
const pr = { headRefOid: head, state: 'MERGED', baseRefName: 'main', mergeCommit: { oid: merge } }
const run = { name: 'CI', headSha: merge, headBranch: 'main', status: 'completed', conclusion: 'success' }

test('requires the pushed commit, merged PR and successful merge CI', () => {
  assert.deepEqual(completionProblems(pr, head, head, [run]), [])
})

test('rejects unpublished or changed commits', () => {
  assert.equal(completionProblems({ ...pr, headRefOid: merge }, head, undefined, [run]).length, 2)
})

test('rejects open PRs and absent CI', () => {
  assert.equal(completionProblems({ ...pr, state: 'OPEN', mergeCommit: null }, head, head, []).length, 2)
})

for (const overrides of [
  { status: 'in_progress', conclusion: null },
  { conclusion: 'failure' },
  { conclusion: 'skipped' },
  { conclusion: 'cancelled' },
  { headSha: head },
  { headBranch: 'other' }
]) {
  test(`rejects incomplete or unrelated CI: ${JSON.stringify(overrides)}`, () => {
    assert.equal(completionProblems(pr, head, head, [{ ...run, ...overrides }]).length, 1)
  })
}

test('does not hide a failed run behind a successful one', () => {
  assert.equal(completionProblems(pr, head, head, [run, { ...run, conclusion: 'failure' }]).length, 1)
})

test('rejects malformed input before calling external tools', () => {
  assert.throws(() => checkCompletion('--help', head), /Usage:/)
  assert.throws(() => checkCompletion('https://github.com/owner/repo/pull/1', 'abc'), /Usage:/)
})
