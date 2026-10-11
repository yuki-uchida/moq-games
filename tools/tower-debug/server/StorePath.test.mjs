import test from 'node:test'
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { mkdir, symlink } from 'node:fs/promises'
import { explicitStorePath, generatedPath, repositoryRoot } from './StorePath.mjs'
import { makeTowerDebugConfig } from '../../../vite.config.tower-debug.mjs'
import { fixture } from './test-support.mjs'

test('store is explicit and outside checkout; generated paths are namespaced to this tool', async () => {
  // Arrange
  const files = await fixture()
  try {
    // Act
    const config = makeTowerDebugConfig({
      storeRoot: files.root,
      receiptSocket: false
    })
    // Assert
    assert.equal(explicitStorePath(files.root), realpathSync(files.root))
    assert.throws(() => explicitStorePath(undefined), /explicit absolute/)
    assert.throws(() => explicitStorePath('relative-store'), /explicit absolute/)
    assert.throws(() => explicitStorePath(resolve(repositoryRoot, 'some-store')), /outside/)
    assert.equal(config.cacheDir, resolve(repositoryRoot, 'tools/tower-debug/.vite'))
    assert.equal(config.build.outDir, resolve(repositoryRoot, 'tools/tower-debug/.build'))
  } finally {
    await files.cleanup()
  }
})
test('generated cache/build paths refuse a symlink to unrelated contents', async () => {
  // Arrange
  const files = await fixture(),
    tool = resolve(files.root, 'synthetic-tool')
  await mkdir(tool)
  await symlink(files.root, resolve(tool, '.build'))
  await symlink(resolve(files.root, 'missing-target'), resolve(tool, '.vite'))
  try {
    // Act / Assert
    assert.throws(() => generatedPath(tool, '.build'), /symbolic link/)
    assert.throws(() => generatedPath(tool, '.vite'), /symbolic link/)
    assert.throws(() => generatedPath(tool, '../outside'), /Unsupported/)
  } finally {
    await files.cleanup()
  }
})
