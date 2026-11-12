import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'

test('Pages includes Rabbiters and its release notices, but not its source artwork', async () => {
  await access('dist/examples/games/rabbiters/index.html')
  await access('dist/examples/games/life-survivors/index.html')
  await access('dist/examples/games/yoru-no-yashiki/index.html')
  await access('dist/examples/games/mamono-jinkei/index.html')
  await access('dist/examples/games/hoshi-no-hamham/index.html')
  await access('dist/examples/games/anima-front/index.html')
  await assert.rejects(access('dist/examples/games/rabbiters/art-source'))
  const assets = await readdir('dist/assets')
  assert.ok(assets.some((asset) => /^moqt_bg-.*\.wasm$/.test(asset)))
  assert.ok(!assets.some((asset) => /^(rabbit|fox|wolf|hawk|snake|crocodile)-(concept|motion)-v1/.test(asset)))
  const notices = await readFile('dist/THIRD-PARTY-NOTICES.txt', 'utf8')
  assert.match(notices, /Official moq-wasm 0\.1\.0 release and dependency notices/)
  assert.match(notices, /c11cc136e4d4dec4a5579c06ab5942d722186e8c/)
  await access('dist/RUST-STANDARD-LIBRARY-NOTICES.html')
})
