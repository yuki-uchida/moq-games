import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { aptInstall, runCommand } from './ci-apt-install.mjs'

const require = createRequire(import.meta.url)

/** The Linux package set `playwright install --with-deps chromium` installs: its Chromium group, then tools. */
export function chromiumPackages(deps, platform) {
  const info = deps[platform]
  if (!info?.chromium?.length || !info.tools?.length)
    throw new Error(`No Playwright Chromium dependencies for ${platform}`)
  const packages = [...new Set([...info.chromium, ...info.tools])]
  if (packages.some((name) => typeof name !== 'string' || !/^[a-z0-9][a-z0-9.+-]+$/.test(name)))
    throw new Error(`Unexpected Playwright dependency packages: ${packages.join(' ')}`)
  return packages
}

/** The installed Playwright's own Linux dependency table and host platform (as `install-deps` reads them). */
export function playwrightDependencies() {
  const root = dirname(require.resolve('playwright-core/package.json'))
  return {
    deps: require(join(root, 'lib/server/registry/nativeDeps.js')).deps,
    hostPlatform: require(join(root, 'lib/server/utils/hostPlatform.js')).hostPlatform
  }
}

export function playwrightPackages() {
  const { deps, hostPlatform } = playwrightDependencies()
  return chromiumPackages(deps, hostPlatform)
}

/** Same browser and packages as `--with-deps`, without refreshing package lists unless the image cannot satisfy them. */
export async function installChromium({ run = runCommand, packages = playwrightPackages } = {}) {
  let list
  try {
    list = packages()
  } catch (error) {
    console.log(`${error instanceof Error ? error.message : error}\nFalling back to Playwright's own install.`)
    return run('npx', ['playwright', 'install', '--with-deps', 'chromium'])
  }
  // The browser download and the system packages are independent.
  const [browser, system] = await Promise.all([
    run('npx', ['playwright', 'install', 'chromium']),
    aptInstall(['-y', '--no-install-recommends', ...list], run)
  ])
  return browser && system
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!(await installChromium())) process.exit(1)
}
