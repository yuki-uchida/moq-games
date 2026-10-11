import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export function explicitStorePath(value) {
  if (typeof value !== 'string' || !value.trim() || !isAbsolute(value))
    throw new Error('Set TOWER_DEBUG_STORE to an explicit absolute asset-store path outside the checkout')
  const path = existsSync(value) ? realpathSync(value) : resolve(value)
  if (path === repositoryRoot || path.startsWith(repositoryRoot + sep))
    throw new Error('The debug asset store must stay outside the checkout')
  return path
}
export function generatedPath(toolRoot, name) {
  if (!['.vite', '.build'].includes(name)) throw new Error('Unsupported generated directory')
  const path = resolve(toolRoot, name)
  let stat
  try {
    stat = lstatSync(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (stat?.isSymbolicLink()) throw new Error('Generated output directory must not be a symbolic link')
  return path
}

export function syntheticTemporaryRoot() {
  return realpathSync(process.platform === 'darwin' ? '/tmp' : tmpdir())
}
