import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

it('uses built-in item icons and avoids sound requests when optional packs are absent', async () => {
  // Arrange
  vi.stubEnv('VITE_TOWER_ENVIRONMENT_AVAILABLE', 'false')
  vi.stubEnv('VITE_TOWER_AUDIO_AVAILABLE', 'false')
  vi.resetModules()
  const { fortificationIcon } = await import('../src/fortification-ui')
  const { soundCatalog } = await import('../src/audio/SoundCatalog')
  // Act / Assert
  for (const kind of ['sandbag', 'spike', 'mud'] as const) {
    expect(fortificationIcon(kind)).toContain('<svg')
    expect(fortificationIcon(kind)).not.toContain('<img')
  }
  expect(soundCatalog(new URL('https://example.invalid/audio/'))).toEqual([])
})

it('retains existing image icons and sound catalog when local packs are available', async () => {
  // Arrange
  vi.stubEnv('VITE_TOWER_ENVIRONMENT_AVAILABLE', 'true')
  vi.stubEnv('VITE_TOWER_AUDIO_AVAILABLE', 'true')
  vi.resetModules()
  const { fortificationIcon } = await import('../src/fortification-ui')
  const { soundCatalog } = await import('../src/audio/SoundCatalog')
  // Act / Assert
  expect(fortificationIcon('sandbag')).toContain('environment-3d-trial/sandbag-intact-0.png')
  expect(soundCatalog(new URL('https://example.invalid/audio/')).length).toBeGreaterThan(0)
})

it('rejects unavailable environment packs before making any network request', async () => {
  vi.stubEnv('VITE_TOWER_ENVIRONMENT_AVAILABLE', 'false')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const { loadEnvironmentArt, loadEnvironmentArtBundle } = await import('../src/rendering/EnvironmentArt')
  const base = new URL('https://example.invalid/moq-games/tower-defense-art/')
  await expect(loadEnvironmentArt(base, 'meadow')).rejects.toThrow('not included in this build')
  await expect(loadEnvironmentArtBundle(base)).rejects.toThrow('not included in this build')
  expect(fetch).not.toHaveBeenCalled()
})

it('identifies the missing manifest and HTTP status when an included pack is broken', async () => {
  vi.stubEnv('VITE_TOWER_ENVIRONMENT_AVAILABLE', 'true')
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
  vi.stubGlobal('fetch', fetch)
  const { loadEnvironmentArt } = await import('../src/rendering/EnvironmentArt')
  await expect(
    loadEnvironmentArt(new URL('https://example.invalid/moq-games/tower-defense-art/'), 'meadow')
  ).rejects.toThrow('Environment asset request failed (404): runtime-manifest.json')
  expect(String(fetch.mock.calls[0][0])).toBe(
    'https://example.invalid/moq-games/tower-defense-art/environment-3d-trial/runtime-manifest.json'
  )
})

it('keeps omitted environment choices disabled across title, preparation and battle updates', async () => {
  const { environmentArtControls } = await import('../src/BuildAssets')
  for (const available of [false, true])
    for (const started of [false, true])
      for (const preparing of [false, true]) {
        const controls = environmentArtControls(available, started, preparing)
        expect(controls.environmentDisabled).toBe(!available || (started && !preparing))
        expect(controls.allArtDisabled).toBe(started && !preparing)
        expect(controls.threeDOptionDisabled).toBe(!available)
      }
})

it('wires availability policy into both periodic art-control updates', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  expect(source.match(/environmentArtControls\(environmentPackAvailable, started, preparing\(\)\)/g)).toHaveLength(2)
  expect(source.match(/\.disabled = controls\.threeDOptionDisabled/g)).toHaveLength(2)
  expect(source).toContain('selector.disabled = controls.environmentDisabled')
  expect(source).toContain('selector.disabled = controls.allArtDisabled')
})
