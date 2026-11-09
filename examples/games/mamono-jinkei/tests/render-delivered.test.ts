import { describe, expect, test } from 'vitest'
import { hiddenDelivered } from '../src/render/delivered'
import { deliverText, sinkText } from '../src/sim/props'
import type { PropView } from '../src/sim/types'

const prop = (id: number, kind: PropView['kind'], x: number, y: number, state: string, z?: number): PropView => ({
  id,
  kind,
  x,
  y,
  state,
  st: 0,
  ...(z ? { z } : {})
})

describe('delivered items pictured by their acceptor are drawn once', () => {
  test('the delivered gold bell and log are hidden; their hook and cradle draw them', () => {
    const props = [prop(1, 'hook', 2784, 2016, 'on'), prop(2, 'goldbell', 2784, 2016, 'idle')]
    expect([...hiddenDelivered(props)]).toEqual([2])
    const forest = [prop(3, 'ramslot', 3104, 1856, 'on'), prop(4, 'log', 3104.4, 1855.6, 'idle')]
    expect([...hiddenDelivered(forest)]).toEqual([4])
  })

  test('before delivery the item is drawn: empty acceptor, carried, or elsewhere', () => {
    expect(hiddenDelivered([prop(1, 'hook', 100, 100, 'off'), prop(2, 'goldbell', 100, 100, 'idle')]).size).toBe(0)
    expect(hiddenDelivered([prop(1, 'hook', 100, 100, 'on'), prop(2, 'goldbell', 100, 100, 'lifted', 40)]).size).toBe(0)
    expect(hiddenDelivered([prop(1, 'ramslot', 100, 100, 'on'), prop(2, 'log', 300, 100, 'idle')]).size).toBe(0)
    // A log never hides on a hook, nor a bell on the ram cradle.
    expect(hiddenDelivered([prop(1, 'hook', 100, 100, 'on'), prop(2, 'log', 100, 100, 'idle')]).size).toBe(0)
  })

  test('the acorn and the cheese stay drawn on their (empty) pedestal and scale', () => {
    const props = [
      prop(1, 'pedestal', 100, 100, 'on'),
      prop(2, 'acorn', 100, 100, 'idle'),
      prop(3, 'scale', 500, 100, 'on'),
      prop(4, 'cheese', 500, 100, 'idle')
    ]
    expect(hiddenDelivered(props).size).toBe(0)
  })
})

describe('solve banners name the item and the place', () => {
  test('deliveries', () => {
    expect(deliverText('acorn')).toBe('どんぐりを台座にのせた！')
    expect(deliverText('cheese')).toBe('チーズを天秤にのせた！')
    expect(deliverText('goldbell')).toBe('金の鐘をかけ金にかけた！')
    expect(deliverText('log')).toBe('丸太を破城槌の台にのせた！')
  })
  test('sunk pushables', () => {
    expect(sinkText('block')).toBe('岩が沈んで道ができた！')
    expect(sinkText('boulder')).toBe('岩が沈んで道ができた！')
    for (const k of ['crate', 'bigcrate']) expect(sinkText(k)).toBe('木箱が汚水に沈んで足場になった！')
    expect(sinkText('iceblock')).toBe('氷のブロックが湖に沈んで道ができた！')
  })
})
