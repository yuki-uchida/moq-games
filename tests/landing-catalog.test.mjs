import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { samples } from '../landing/samples.js'

test('catalog exposes only real, unique, playable samples with local entrypoints', async () => {
  assert.equal(samples.length, 1)
  assert.equal(samples[0].title, 'smart defence with jev')
  assert.equal(new Set(samples.map((sample) => sample.id)).size, samples.length)
  for (const sample of samples) {
    assert.ok(sample.description && sample.category && sample.tags.length)
    assert.match(sample.href, /^\.\/examples\//)
    await access(new URL(`../${sample.href}`, import.meta.url))
  }
})

test('home is no longer a redirect and preserves a non-JavaScript play link', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /<title>MoQ Games<\/title>/)
  assert.doesNotMatch(html, /http-equiv="refresh"/i)
  assert.ok(html.includes(samples[0].href))
  assert.match(html, /class="skip-link"/)
})

test('landing uses existing roster artwork and has no runtime game/audio imports', async () => {
  const js = await readFile(new URL('../landing/main.js', import.meta.url), 'utf8')
  assert.doesNotMatch(js, /from ['"](?:three|.*GameRenderer|.*SoundPlayer|@moq-games)/)
  assert.doesNotMatch(js, /requestAnimationFrame|setInterval|\.play\(/)
  for (const unit of ['soldier', 'tank', 'mage', 'archer', 'slime', 'goblin']) {
    await access(new URL(`../public/tower-defense-art/${unit}/portrait.png`, import.meta.url))
  }
  const css = await readFile(new URL('../landing/style.css', import.meta.url), 'utf8')
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /focus-visible/)
})
