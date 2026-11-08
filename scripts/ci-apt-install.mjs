import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const UNSAFE_IO = 'Dpkg::Options::=--force-unsafe-io'

export function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', () => resolve(false))
    child.once('close', (code) => resolve(code === 0))
  })
}

/** `apt-get install` from the runner image's package lists, refreshing them once only when that fails. */
export async function aptInstall(args, run = runCommand) {
  // The runner is ephemeral, so dpkg need not fsync while unpacking.
  const install = ['apt-get', 'install', '-o', UNSAFE_IO, ...args]
  if (await run('sudo', install)) return true
  console.log('Package lists could not satisfy this install; refreshing them once.')
  return (await run('sudo', ['apt-get', 'update'])) && (await run('sudo', install))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!(await aptInstall(process.argv.slice(2)))) process.exit(1)
}
