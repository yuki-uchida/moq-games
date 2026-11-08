import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const INSTALL = 'apt-get update&& apt-get install -y --no-install-recommends '

/** Playwright's own exact Linux package set for Chromium, read from its dry run. */
export function chromiumPackages(dryRun) {
  const lines = dryRun.split('\n').filter((line) => line.includes(INSTALL))
  if (lines.length !== 1) throw new Error(`Unexpected Playwright dependency command:\n${dryRun}`)
  const packages = lines[0]
    .slice(lines[0].indexOf(INSTALL) + INSTALL.length)
    .replace(/"\s*$/, '')
    .trim()
    .split(/\s+/)
  if (!packages.length || packages.some((name) => !/^[a-z0-9][a-z0-9.+-]+$/.test(name)))
    throw new Error(`Unexpected Playwright dependency packages: ${packages.join(' ')}`)
  return packages
}

/** Install the same packages as `--with-deps`, refreshing package lists only when the image cannot satisfy them. */
export function installChromium({ run, read }) {
  if (!run('npx', ['playwright', 'install', 'chromium'])) return false
  let packages
  try {
    packages = chromiumPackages(read('npx', ['playwright', 'install-deps', '--dry-run', 'chromium']))
  } catch (error) {
    console.log(
      `${error instanceof Error ? error.message : error}\nFalling back to Playwright's own dependency install.`
    )
    return run('npx', ['playwright', 'install-deps', 'chromium'])
  }
  const install = () => run('sudo', ['apt-get', 'install', '-y', '--no-install-recommends', ...packages])
  if (install()) return true
  console.log('Package lists could not satisfy Playwright dependencies; refreshing them once.')
  return run('sudo', ['apt-get', 'update']) && install()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const ok = installChromium({
    run: (command, args) => spawnSync(command, args, { stdio: 'inherit' }).status === 0,
    read: (command, args) => execFileSync(command, args, { encoding: 'utf8' })
  })
  if (!ok) process.exit(1)
}
