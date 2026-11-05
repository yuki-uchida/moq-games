import { describe, expect, it } from 'vitest'
import { campaign } from '../src/campaign'
import { sections } from '../src/help'

const wide = (n: number) => String(n).replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0))

describe('help', () => {
  it('lists every chapter with its own victory condition', () => {
    const victory = sections.find(([label]) => label.includes('勝利条件'))!.join('')
    campaign.forEach((chapter, index) => {
      if (chapter.objective.type === 'rout') return
      expect(victory).toMatch(new RegExp(`第(${index + 1}|${wide(index + 1)})章`))
    })
  })
  it('says the objective can be pressed to show its full text', () => {
    const top = sections.find((section) => section.join('').includes('画面上部'))!.join('')
    expect(top).toContain('勝利条件を押すと')
    expect(top).toContain('全文')
  })
  it('explains page scrolling and board panning on small screens', () => {
    const controls = sections.find(([label]) => label.includes('操作'))!.join('')
    expect(controls).toContain('1本指の縦スワイプ')
    expect(controls).toContain('2本指のドラッグ')
  })
})
