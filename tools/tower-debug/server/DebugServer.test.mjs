import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, unlink, symlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { httpFixture, submission, rawHttp } from './test-support.mjs'

const denied = [
  ['host', { Host: 'evil.example' }, 403],
  ['origin', { Origin: 'https://evil.example' }, 403],
  ['null origin', { Origin: 'null' }, 403],
  ['missing origin', { Origin: undefined }, 403],
  ['cross site', { 'Sec-Fetch-Site': 'cross-site' }, 403],
  ['different localhost origin', { 'Sec-Fetch-Site': 'same-site' }, 403],
  ['csrf', { 'X-Debug-CSRF': '0'.repeat(64) }, 403],
  ['unicode csrf', { 'X-Debug-CSRF': 'é'.repeat(64) }, 403],
  ['missing session', { Cookie: undefined }, 401],
  ['simple form', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415]
]
for (const [name, changes, expected] of denied) {
  test(`synthetic API rejects ${name} without saving`, async () => {
    // Arrange
    const fixture = await httpFixture()
    const draft = submission(fixture.ref)
    const headers = {
      ...fixture.headers,
      'Idempotency-Key': draft.clientSubmissionId,
      ...changes
    }
    for (const [key, value] of Object.entries(headers)) if (value === undefined) delete headers[key]
    try {
      // Act
      const init = { method: 'POST', headers, body: JSON.stringify(draft) }
      const response =
        name === 'host'
          ? await rawHttp(fixture.origin, '/api/v1/tickets', init)
          : await fetch(fixture.origin + '/api/v1/tickets', init)
      // Assert
      assert.equal(response.status, expected, await response.text())
      assert.equal(fixture.service.tickets.list().tickets.length, 0)
    } finally {
      await fixture.cleanup()
    }
  })
}
test('synthetic browser API persists once and has no receipt/admin mutation route', async () => {
  // Arrange
  const fixture = await httpFixture()
  const draft = submission(fixture.ref)
  const init = {
    method: 'POST',
    headers: {
      ...fixture.headers,
      'Idempotency-Key': draft.clientSubmissionId
    },
    body: JSON.stringify(draft)
  }
  try {
    // Act
    const first = await fetch(fixture.origin + '/api/v1/tickets', init),
      ticket = await first.json()
    const repeat = await fetch(fixture.origin + '/api/v1/tickets', init)
    const admin = await fetch(fixture.origin + `/api/v1/tickets/${ticket.ticketId}/receipt`, init)
    // Assert
    assert.equal(first.status, 201)
    assert.equal(repeat.status, 200)
    assert.equal(admin.status, 404)
    assert.deepEqual(ticket.parentReceipts, [])
    assert.equal(fixture.service.tickets.list().tickets.length, 1)
    assert.equal(first.headers.get('access-control-allow-origin'), null)
    assert.equal(first.headers.get('x-content-type-options'), 'nosniff')
  } finally {
    await fixture.cleanup()
  }
})
test('synthetic assets allow exact IDs/ranges but reject traversal, state and tampering', async () => {
  // Arrange
  const fixture = await httpFixture()
  try {
    // Act / Assert
    for (const path of [
      '/api/v1/assets/..%2fstate%2ftickets.json',
      '/api/v1/assets/%252e%252e',
      '/@fs/etc/passwd',
      '/api/v1/assets/unknown'
    ]) {
      const response = await fetch(fixture.origin + path, {
        headers: fixture.headers
      })
      assert.ok(response.status >= 400, path)
    }
    const response = await fetch(fixture.origin + '/api/v1/assets/' + fixture.ref.assetId, {
      headers: { ...fixture.headers, Range: 'bytes=0-2' }
    })
    assert.equal(response.status, 206)
    assert.equal((await response.arrayBuffer()).byteLength, 3)
    const multi = await fetch(fixture.origin + '/api/v1/assets/' + fixture.ref.assetId, {
      headers: { ...fixture.headers, Range: 'bytes=0-1,3-4' }
    })
    assert.equal(multi.status, 416)
    const path = resolve(fixture.root, 'assets', fixture.ref.sha256 + '.json')
    await writeFile(path, 'X'.repeat(fixture.ref.bytes))
    const tampered = await fetch(fixture.origin + '/api/v1/assets/' + fixture.ref.assetId, { headers: fixture.headers })
    assert.equal(tampered.status, 409)
    await unlink(path)
    await symlink('/etc/passwd', path)
    const linked = await fetch(fixture.origin + '/api/v1/assets/' + fixture.ref.assetId, { headers: fixture.headers })
    assert.equal(linked.status, 404)
  } finally {
    await fixture.cleanup()
  }
})
test('synthetic oversized request and arbitrary execution fields never reach persistence', async () => {
  // Arrange
  const fixture = await httpFixture()
  const draft = submission(fixture.ref)
  try {
    // Act / Assert
    for (const value of [
      { ...draft, shell: 'never execute' },
      { ...draft, text: 'a'.repeat(70000) }
    ]) {
      const response = await fetch(fixture.origin + '/api/v1/tickets', {
        method: 'POST',
        headers: {
          ...fixture.headers,
          'Idempotency-Key': draft.clientSubmissionId
        },
        body: JSON.stringify(value)
      })
      assert.ok([400, 413].includes(response.status))
      assert.equal(fixture.service.tickets.list().tickets.length, 0)
    }
  } finally {
    await fixture.cleanup()
  }
})

test('synthetic review and regeneration HTTP routes require CSRF and have no parent-status mutation endpoint', async () => {
  const { randomUUID } = await import('node:crypto')
  const f = await httpFixture()
  f.service.assets.catalog.public.audio = [
    { candidateId: 'synthetic-audio', batchId: 'synthetic-batch', eventId: 'synthetic-event', files: { wav: f.ref } }
  ]
  try {
    const decision = {
      schemaVersion: 1,
      actionId: randomUUID(),
      candidateId: 'synthetic-audio',
      batchId: 'synthetic-batch',
      asset: f.ref,
      expectedRevision: 0,
      status: 'selected',
      intent: 'explicit-user-review'
    }
    const post = (path, value, headers = f.headers) =>
      fetch(f.origin + path, { method: 'POST', headers, body: JSON.stringify(value) })
    const denied = await post('/api/v1/audio-reviews', decision, { ...f.headers, 'X-Debug-CSRF': '0'.repeat(64) })
    assert.equal(denied.status, 403)
    assert.equal(f.service.reviews.list().generation, 0)
    const accepted = await post('/api/v1/audio-reviews', decision)
    assert.equal(accepted.status, 200)
    assert.equal(f.service.reviews.list().generation, 1)
    const repeat = await post('/api/v1/audio-reviews', decision)
    assert.equal(repeat.status, 200)
    const arbitrary = await post('/api/v1/audio-reviews', { ...decision, shell: 'DO NOT EXECUTE' })
    assert.equal(arbitrary.status, 400)
    const queue = {
      schemaVersion: 1,
      actionId: randomUUID(),
      eventId: 'synthetic-event',
      candidates: [{ candidateId: decision.candidateId, batchId: decision.batchId, asset: f.ref }],
      prompt: '[SYNTHETIC] literal prompt',
      intent: 'explicit-user-regeneration-request'
    }
    assert.equal((await post('/api/v1/regeneration', queue)).status, 200)
    assert.equal(f.service.reviews.list().regeneration[0].execution, 'not-started')
    for (const path of [
      '/api/v1/results',
      '/api/v1/parent-status',
      '/api/v1/tickets/00000000-0000-4000-8000-000000000000/result'
    ])
      assert.equal((await post(path, {})).status, 404)
    assert.equal(
      (await fetch(f.origin + '/api/v1/roles/soldier/revisions/synthetic-v1', { headers: f.headers })).status,
      404
    )
  } finally {
    await f.cleanup()
  }
})
