import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stage } from '../src/stage'

describe('prepared contact images', () => {
  const drawImage = vi.fn()
  const toDataURL = vi.fn(() => 'data:image/png;base64,impact')
  const getContext = vi.fn((): object | null => ({ drawImage, fillRect: vi.fn() }))
  const createElement = vi.fn((tag: string) =>
    tag === 'canvas'
      ? { getContext, toDataURL }
      : { style: {}, setAttribute: vi.fn(), className: '', classList: { add: vi.fn() }, remove: vi.fn() }
  )
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getContext.mockImplementation(() => ({ drawImage, fillRect: vi.fn() }))
    toDataURL.mockImplementation(() => 'data:image/png;base64,impact')
    vi.stubGlobal('document', { createElement })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('prepares new chapter styles once, including enemy roles and fallback attacks', async () => {
    const { prepareContacts, showContact } = await import('../src/ImpactPresentation')
    prepareContacts(['soldier', 'goblin', 'archer', 'mage', 'soldier'])
    expect(toDataURL).toHaveBeenCalledTimes(3)
    prepareContacts([
      'soldier',
      'healer',
      'slime',
      'bat',
      'wolf',
      'beetle',
      'ogre',
      'wraith',
      'shaman',
      'dragon',
      'frost'
    ])
    expect(toDataURL).toHaveBeenCalledTimes(6)
    prepareContacts(['ranger', 'runner', 'cannon', 'unknown'])
    expect(toDataURL).toHaveBeenCalledTimes(6)
    const victim = { append: vi.fn() } as unknown as HTMLElement
    createElement.mockClear()
    for (const role of ['soldier', 'archer', 'mage', 'frost', 'shaman', 'dragon', 'healer', 'unknown']) {
      showContact(victim, role, 0.5)
    }
    expect(victim.append).toHaveBeenCalledTimes(8)
    expect(createElement.mock.calls.every(([tag]) => tag === 'span')).toBe(true)
    expect(toDataURL).toHaveBeenCalledTimes(6)
    expect(victim.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        className: 'combat-contact',
        style: {
          backgroundImage: 'url("data:image/png;base64,impact")',
          transform: 'rotate(0.5rad)',
          animationDuration: '0.16s'
        }
      })
    )
  })

  it('never generates an unprepared image during contact', async () => {
    const { showContact } = await import('../src/ImpactPresentation')
    const victim = { append: vi.fn() } as unknown as HTMLElement
    showContact(victim, 'dragon', 0)
    expect(createElement).not.toHaveBeenCalled()
    expect(victim.append).not.toHaveBeenCalled()
  })

  it('keeps healing on its existing overlay without generating contact images', async () => {
    const { BattleAnimation, snapshot } = await import('../src/animation')
    const { createGame } = await import('../src/game')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal('document', { createElement, hidden: true })
    const game = createGame(3)
    const acting = game.units.find((unit) => unit.role === 'healer')!
    const target = game.units.find((unit) => unit.side === 'ally' && unit !== acting)!
    const before = snapshot(game)
    target.hp += 2
    const release = vi.fn()
    const stage = { get: () => ({}), screen: () => ({ x: 0, y: 0 }), figure: 1, release }
    const field = { append: vi.fn() }
    const cue = vi.fn()
    await new BattleAnimation(stage as unknown as Stage, field as unknown as HTMLElement, cue).present(
      game,
      before,
      acting,
      { kind: 'heal', target }
    )
    expect(field.append).toHaveBeenCalledTimes(1)
    expect(field.append.mock.calls[0][0]).toMatchObject({ textContent: '✚ +2' })
    expect(field.append.mock.calls[0][0].classList.add).toHaveBeenCalledWith('healing-effect')
    expect(cue).toHaveBeenCalledWith('healer')
    expect(release).toHaveBeenCalledTimes(1)
    expect(toDataURL).not.toHaveBeenCalled()
  })

  it.each(['context', 'encoding', 'empty'] as const)(
    'keeps battle playable after %s failures and retries missing styles',
    async (failure) => {
      const { BattleAnimation } = await import('../src/animation')
      const load = vi.fn().mockResolvedValue(undefined)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const animation = new BattleAnimation({ load } as unknown as Stage, {} as HTMLElement, vi.fn())
      const progress = vi.fn()
      await animation.prepare(['soldier'], progress)
      if (failure === 'context') getContext.mockReturnValueOnce(null)
      if (failure === 'encoding')
        toDataURL.mockImplementationOnce(() => {
          throw new Error('encoding failed')
        })
      if (failure === 'empty') toDataURL.mockReturnValueOnce('data:,')
      await expect(animation.prepare(['soldier', 'dragon'], progress)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledOnce()
      expect(load).toHaveBeenCalledTimes(2)
      await animation.prepare(['soldier', 'dragon'], progress)
      await animation.prepare(['dragon', 'soldier', 'dragon'], progress)
      expect(load).toHaveBeenCalledTimes(4)
      expect(load).toHaveBeenLastCalledWith(['dragon', 'soldier', 'dragon'], progress)
      expect(toDataURL).toHaveBeenCalledTimes(failure === 'context' ? 2 : 3)
    }
  )

  it('retains prepared images after model loading fails and allows another preparation', async () => {
    const { BattleAnimation } = await import('../src/animation')
    const load = vi.fn().mockRejectedValueOnce(new Error('model failed')).mockResolvedValue(undefined)
    const animation = new BattleAnimation({ load } as unknown as Stage, {} as HTMLElement, vi.fn())
    await expect(animation.prepare(['archer'], vi.fn())).rejects.toThrow('model failed')
    await animation.prepare(['archer', 'mage'], vi.fn())
    expect(toDataURL).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
