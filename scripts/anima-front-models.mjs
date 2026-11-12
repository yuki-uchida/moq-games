/**
 * Contact sheets of アニマフロント's procedural models for visual review.
 *
 * Usage: node scripts/anima-front-models.mjs [--only species,views,poses,items,held,looks,faces,foes,states,
 *                                                   crowds,bosses,props,shots]
 *                                            [--species shiba,fox] [--quality medium] [--out DIR]
 *
 * Reuses a models server already listening on port 5210, or starts one (.build/anima-front/vite-models.mjs)
 * in this process; opens
 * review.html in headless Chromium with hardware GL and writes labelled PNG sheets plus stats.json (generation
 * times and triangle counts reported by the page) to .build/anima-front/models/ (ignored by Git). The server and
 * browser are always closed, also on failure. Exit code 1 when a page reported an error.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const SECTIONS = [
  'species',
  'views',
  'poses',
  'items',
  'held',
  'looks',
  'faces',
  'foes',
  'states',
  'crowds',
  'bosses',
  'props',
  'shots'
]
const CROWD = ['tsubute', 'harigane', 'oagos', 'kagerou', 'mitsume', 'ashinaga', 'korogashi', 'tategami']
const only = new Set((valueOf('--only') ?? SECTIONS.join(',')).split(',').map((s) => s.trim()))
const SPECIES = ['shiba', 'cat', 'rabbit', 'bear', 'fox', 'penguin', 'hamster', 'owl']
const speciesList = (valueOf('--species') ?? SPECIES.join(',')).split(',')
const quality = valueOf('--quality') ?? 'medium'
const out = resolve(valueOf('--out') ?? join(root, '.build/anima-front/models'))
mkdirSync(out, { recursive: true })

/** [file name, query] */
const jobs = []
if (only.has('species')) {
  jobs.push(['species-front', 'sheet=species&angle=0'])
  jobs.push(['species-back', 'sheet=species&angle=180'])
}
if (only.has('views')) jobs.push(['species-views', 'sheet=views'])
if (only.has('poses'))
  for (const id of speciesList) {
    jobs.push([`poses-${id}`, `sheet=poses&species=${id}`])
    jobs.push([`poses-${id}-armed`, `sheet=poses&species=${id}&r=orca&l=bee`])
  }
if (only.has('items')) {
  jobs.push(['items', 'sheet=items'])
  jobs.push(['items-active', 'sheet=items&act=charge&charge=1'])
}
if (only.has('held')) for (const id of speciesList) jobs.push([`held-${id}`, `sheet=held&species=${id}&pose=aim`])
if (only.has('looks')) for (const id of speciesList) jobs.push([`looks-${id}`, `sheet=looks&species=${id}`])
if (only.has('faces'))
  for (const pose of ['idle', 'hurt', 'victory', 'defeat', 'down'])
    jobs.push([`faces-${pose}`, `sheet=faces&pose=${pose}`])

if (only.has('foes')) {
  jobs.push(['foes-idle', 'sheet=foes&state=idle'])
  jobs.push(['foes-move', 'sheet=foes&state=move'])
  jobs.push(['foes-windup', 'sheet=foes&state=windup'])
}
if (only.has('states')) for (const id of CROWD) jobs.push([`states-${id}`, `sheet=foe-states&foe=${id}`])
if (only.has('crowds')) for (const id of CROWD) jobs.push([`crowd-${id}`, `sheet=crowd&foe=${id}&n=30`])
if (only.has('bosses')) jobs.push(['bosses', 'sheet=bosses&cell=700x700'])
if (only.has('props')) jobs.push(['props', 'sheet=props'])
if (only.has('shots')) jobs.push(['shots', 'sheet=shots&bg=dark'])

const running = await fetch('http://127.0.0.1:5210/review.html').then(
  (r) => r.ok,
  () => false
)
const server = running
  ? null
  : await createServer({
      configFile: join(root, '.build/anima-front/vite-models.mjs'),
      logLevel: 'warn',
      server: { port: 5210, strictPort: true }
    })
let browser
let failed = false
const report = { quality, sheets: {} }
try {
  await server?.listen()
  const base = `http://127.0.0.1:5210/review.html`
  browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 2200, height: 1400 } })
  page.on('pageerror', (e) => {
    failed = true
    console.error('page error:', e.message)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') {
      failed = true
      console.error('console error:', m.text())
    }
  })
  for (const [name, query] of jobs) {
    const started = Date.now()
    await page.goto(`${base}?${query}&quality=${quality}`)
    await page.waitForFunction(() => window.__review?.ready === true, null, { timeout: 180_000 })
    const info = await page.evaluate(() => window.__review)
    const file = join(out, `${name}.png`)
    await page.locator('.grid').screenshot({ path: file })
    report.sheets[name] = { query, cells: info.cells, pageMs: Math.round(info.ms), stats: info.stats }
    console.log(`${name}.png  ${info.cells} cells  ${((Date.now() - started) / 1000).toFixed(1)} s`)
  }
} catch (error) {
  failed = true
  console.error(error)
} finally {
  await browser?.close()
  await server?.close()
}
writeFileSync(join(out, 'stats.json'), JSON.stringify(report, null, 2))
console.log(`wrote ${out}`)
process.exit(failed ? 1 : 0)
