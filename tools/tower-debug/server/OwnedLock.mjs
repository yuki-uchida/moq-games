import { lstat, unlink } from 'node:fs/promises'
import { fail } from './Validation.mjs'

// An opened descriptor identifies the lock we acquired. Never unlink a replacement pathname.
export async function releaseOwnedLock(handle, path) {
  try {
    const acquired = await handle.stat()
    let current
    try {
      current = await lstat(path)
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    if (
      !current.isFile() ||
      current.isSymbolicLink() ||
      current.dev !== acquired.dev ||
      current.ino !== acquired.ino ||
      current.uid !== acquired.uid
    )
      fail('Lock identity changed; preserve it for owner inspection', 503, 'store-unavailable')
    await unlink(path)
  } finally {
    await handle.close()
  }
}
