import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { aptInstall, runCommand } from './ci-apt-install.mjs'

const require = createRequire(import.meta.url)

const PACKAGE_NAME = /^[a-z0-9][a-z0-9.+-]+$/

/** Extra apt package names given on the command line, validated like Playwright's own. */
export function extraPackages(names) {
  const bad = names.filter((name) => typeof name !== 'string' || !PACKAGE_NAME.test(name))
  if (bad.length) throw new Error(`Invalid apt package names: ${bad.join(' ')}`)
  return [...new Set(names)]
}

/** The Linux package set `playwright install --with-deps chromium` installs: its Chromium group, then tools. */
export function chromiumPackages(deps, platform) {
  const info = deps[platform]
  if (!info?.chromium?.length || !info.tools?.length)
    throw new Error(`No Playwright Chromium dependencies for ${platform}`)
  const packages = [...new Set([...info.chromium, ...info.tools])]
  if (packages.some((name) => typeof name !== 'string' || !PACKAGE_NAME.test(name)))
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
export async function installChromium({ run = runCommand, packages = playwrightPackages, extra = [] } = {}) {
  const more = extraPackages(extra)
  let list
  try {
    list = packages()
  } catch (error) {
    console.log(`${error instanceof Error ? error.message : error}\nFalling back to Playwright's own install.`)
    if (!(await run('npx', ['playwright', 'install', '--with-deps', 'chromium']))) return false
    return !more.length || aptInstall(['-y', '--no-install-recommends', ...more], run)
  }
  list = [...new Set([...list, ...more])]
  // The browser download and the system packages are independent.
  const [browser, system] = await Promise.all([
    run('npx', ['playwright', 'install', 'chromium']),
    aptInstall(['-y', '--no-install-recommends', ...list], run)
  ])
  return browser && system
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let extra
  try {
    extra = extraPackages(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
  if (!(await installChromium({ extra }))) process.exit(1)
}
