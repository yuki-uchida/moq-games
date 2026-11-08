import { describe, expect, it } from 'vitest'
import { colourAlpha, hidesBehind, type PaintStyle } from '../src/hud-occlusion'

/** A computed style with the given background and extra properties. */
const style = (backgroundColor: string, backgroundImage = 'none', props: Record<string, string> = {}): PaintStyle => ({
  backgroundColor,
  backgroundImage,
  getPropertyValue: (name) => props[name] ?? ''
})

describe('colourAlpha', () => {
  it('reads the alpha of computed colours', () => {
    expect(colourAlpha('rgba(24, 18, 34, 0.86)')).toBe(0.86)
    expect(colourAlpha('rgba(0, 0, 0, 0)')).toBe(0)
    expect(colourAlpha('rgb(0, 0, 0)')).toBe(1)
    expect(colourAlpha('rgb(24, 18, 34)')).toBe(1)
    expect(colourAlpha('rgb(24 18 34 / 0.5)')).toBe(0.5)
    expect(colourAlpha('rgb(24 18 34 / 40%)')).toBe(0.4)
    expect(colourAlpha('color(srgb 0.1 0.2 0.3 / 0.25)')).toBe(0.25)
    expect(colourAlpha('transparent')).toBe(0)
  })
})

describe('hidesBehind', () => {
  it('takes panels with a mostly solid background, an image or a backdrop blur as opaque', () => {
    // The HUD panels: rgba(24, 18, 34, 0.86) with backdrop-filter: blur(6px).
    expect(hidesBehind(style('rgba(24, 18, 34, 0.86)', 'none', { 'backdrop-filter': 'blur(6px)' }))).toBe(true)
    expect(hidesBehind(style('rgba(20, 14, 30, 0.55)'))).toBe(true)
    expect(hidesBehind(style('rgb(0, 0, 0)'))).toBe(true)
    expect(hidesBehind(style('rgba(0, 0, 0, 0)', 'linear-gradient(red, blue)'))).toBe(true)
    expect(hidesBehind(style('rgba(0, 0, 0, 0)', 'none', { '-webkit-backdrop-filter': 'blur(4px)' }))).toBe(true)
  })
  it('sees through faint backgrounds, bare text and backgrounds clipped to the text', () => {
    expect(hidesBehind(style('rgba(0, 0, 0, 0)'))).toBe(false)
    expect(hidesBehind(style('rgba(20, 14, 30, 0.3)'))).toBe(false)
    expect(hidesBehind(style('rgba(0, 0, 0, 0)', 'none', { 'backdrop-filter': 'none' }))).toBe(false)
    // The stage banner title paints its gradient into the letters only.
    const title = style('rgba(0, 0, 0, 0)', 'linear-gradient(rgb(255, 255, 255), rgb(255, 214, 165))', {
      'background-clip': 'text'
    })
    expect(hidesBehind(title)).toBe(false)
    expect(
      hidesBehind(style('rgba(0, 0, 0, 0)', 'linear-gradient(red, blue)', { '-webkit-background-clip': 'text' }))
    ).toBe(false)
  })
})
