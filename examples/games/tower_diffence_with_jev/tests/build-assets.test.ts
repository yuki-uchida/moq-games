import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
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
