import { describe, expect, it } from 'vitest'
import { STAGES } from '../src/game/stages'
import { aimLine, aimTexts, hintForInput, stageText } from '../src/ui/hud-model'
import { AHEAD_CHUNK, AHEAD_CHUNK_IN_PLAY, KANA, TextAhead } from '../src/ui/text-ahead'

/** A box whose lines write down every text they are given. */
function box() {
  const lines: Array<{ textContent: string | null; style: { font: string }; texts: string[] }> = []
  const ahead = new TextAhead(() => {
    const texts: string[] = []
    const line = {
      style: { font: '' },
      texts,
      get textContent() {
        return texts.at(-1) ?? null
      },
      set textContent(value: string | null) {
        texts.push(value ?? '')
      }
    }
    lines.push(line)
    return line
  })
  /** Steps until there is nothing left of the kind; returns the number of steps. */
  const drain = (all = false, chunk = AHEAD_CHUNK) => {
    let steps = 0
    while (!ahead.idle(all) && steps < 100000) {
      ahead.step(chunk, all)
      steps += 1
    }
    return steps
  }
  /** Every character the line of a font was given, in order. */
  const laid = (font: string) =>
    lines
      .filter((line) => line.style.font === font)
      .map((line) => line.texts.join(''))
      .join('')
  return { ahead, lines, drain, laid }
}

describe('text laid out ahead', () => {
  it('has nothing to do until a text is wanted', () => {
    const b = box()
    expect(b.ahead.idle()).toBe(true)
    expect(b.ahead.idle(true)).toBe(true)
    expect(b.ahead.step()).toBe(false)
    expect(b.lines.length).toBe(0)
  })

  it('lays every wanted character out once in its font, a few in each step', () => {
    const b = box()
    b.ahead.want('800 14px Test', 'ゆっくり ねらえば むずかしく ないよ', true)
    b.ahead.want('800 22px Test', 'ゆっくり', true)
    const distinct = [...new Set('ゆっくりねらえばむずかしくないよ')]
    const steps = b.drain()
    expect([...b.laid('800 14px Test')]).toEqual(distinct)
    expect(b.laid('800 22px Test')).toBe('ゆっくり')
    // Never more than a chunk in one step, and a line holds only the newest characters.
    for (const line of b.lines) for (const text of line.texts) expect([...text].length).toBeLessThanOrEqual(AHEAD_CHUNK)
    expect(steps).toBe(Math.ceil(distinct.length / AHEAD_CHUNK) + 1)
    expect(b.ahead.step()).toBe(false)
  })

  it('does one line in a step, so a frame pays for one font', () => {
    const b = box()
    for (const font of ['a', 'b', 'c']) b.ahead.want(font, 'あいうえお', true)
    b.ahead.step()
    expect(b.lines.map((line) => line.texts.filter(Boolean).length)).toEqual([1, 0, 0])
    b.ahead.step()
    expect(b.lines.map((line) => line.texts.filter(Boolean).length)).toEqual([1, 1, 0])
  })

  it('lays a character out only the first time it is wanted in a font', () => {
    const b = box()
    b.ahead.want('a', 'かじって たおそう', true)
    b.drain()
    const before = b.laid('a')
    b.ahead.want('a', 'たおそう かじって', true)
    expect(b.ahead.idle()).toBe(true)
    b.ahead.want('a', 'かじって ジャンプ', true)
    b.drain()
    expect(b.laid('a')).toBe(`${before}ジャンプ`)
    // Another font has seen none of them.
    b.ahead.want('b', 'かじ', true)
    b.drain()
    expect(b.laid('b')).toBe('かじ')
  })

  it('lays out what is wanted first, and the rest only when there is time', () => {
    const b = box()
    b.ahead.want('a', 'あいうえお')
    b.ahead.want('b', 'かきくけこ', true)
    expect(b.ahead.idle()).toBe(false)
    // A stage's frames: only what was wanted first.
    b.drain(false, AHEAD_CHUNK_IN_PLAY)
    expect(b.laid('b')).toBe('かきくけこ')
    expect(b.laid('a')).toBe('')
    expect(b.ahead.idle()).toBe(true)
    expect(b.ahead.idle(true)).toBe(false)
    expect(b.ahead.step(AHEAD_CHUNK_IN_PLAY)).toBe(false)
    expect(b.laid('a')).toBe('')
    // A menu's frames: everything.
    b.drain(true)
    expect(b.laid('a')).toBe('あいうえお')
    expect(b.ahead.idle(true)).toBe(true)
  })

  it('moves a character up when it is wanted first after all', () => {
    const b = box()
    b.ahead.want('a', 'あいうえおかきくけこ')
    b.ahead.want('a', 'こう', true)
    b.drain(false)
    expect(b.laid('a')).toBe('こう')
    b.drain(true)
    // Each of them once.
    expect([...b.laid('a')].sort().join('')).toBe([...'あいうえおかきくけこ'].sort().join(''))
  })

  it('takes a text wished for again in the same way as nothing new, whatever was laid out meanwhile', () => {
    const b = box()
    b.ahead.want('a', 'かじって たおそう')
    b.ahead.want('a', 'かじって たおそう')
    b.drain(true)
    expect(b.laid('a')).toBe('かじってたおそう')
    // Every start of a stage asks again, for later and first.
    b.ahead.want('a', 'かじって たおそう')
    b.ahead.want('a', 'かじって たおそう', true)
    b.ahead.want('a', 'かじって たおそう', true)
    expect(b.ahead.idle(true)).toBe(true)
    expect(b.laid('a')).toBe('かじってたおそう')
  })

  it('moves a waiting character up once, however many texts want it first', () => {
    const b = box()
    b.ahead.want('a', 'あいう')
    b.ahead.want('a', 'う', true)
    b.ahead.want('a', 'うう', true)
    b.ahead.want('a', 'あう', true)
    b.drain(false)
    expect(b.laid('a')).toBe('うあ')
    b.drain(true)
    expect(b.laid('a')).toBe('うあい')
  })

  it('does not look among the waiting for a character that was laid out from there', () => {
    const b = box()
    b.ahead.want('a', 'あいうえ')
    // A menu's frame lays the first two out.
    b.ahead.step(2, true)
    expect(b.laid('a')).toBe('あい')
    // The stage wants one that is laid out and one that waits: only the waiting one moves, and none is lost.
    b.ahead.want('a', 'あう', true)
    b.drain(false)
    expect(b.laid('a')).toBe('あいう')
    b.drain(true)
    expect(b.laid('a')).toBe('あいうえ')
  })

  it('keeps a wish by its font: another font is laid out anew, the first stays done', () => {
    const b = box()
    b.ahead.want('800 14px Test', 'はしる', true)
    b.drain()
    // The phone was turned: the same place has another font.
    b.ahead.want('800 12px Test', 'はしる', true)
    b.drain()
    expect(b.laid('800 12px Test')).toBe('はしる')
    // Turned back: nothing to do.
    b.ahead.want('800 14px Test', 'はしる', true)
    expect(b.ahead.idle(true)).toBe(true)
    expect(b.lines.length).toBe(2)
  })

  it('leaves out a font it cannot name', () => {
    const b = box()
    b.ahead.want('', 'あ', true)
    expect(b.ahead.idle(true)).toBe(true)
    expect(b.lines.length).toBe(0)
  })

  it('keeps characters outside the basic plane whole', () => {
    const b = box()
    b.ahead.want('a', '𠮷野家の🍙', true)
    b.drain(false, 2)
    expect([...b.laid('a')]).toEqual(['𠮷', '野', '家', 'の', '🍙'])
    for (const text of b.lines[0].texts) expect(text.isWellFormed?.() ?? true).toBe(true)
  })

  it('leaves spaces and line breaks out', () => {
    const b = box()
    b.ahead.want('a', ' あ\n\tい　う', true)
    b.drain()
    // The wide space is a character like any other.
    expect(b.laid('a')).toBe('あい　う')
  })
})

describe('what is laid out ahead', () => {
  it('every kana, with the marks that go with them', () => {
    for (const char of 'あんがぱゃっアンヴァヶー・、。！？…「」') expect(KANA, char).toContain(char)
    expect(new Set(KANA).size).toBe(KANA.length)
  })

  it("a stage's name, subtitle, boss and hints, the hints as touch words them too", () => {
    for (const stage of STAGES) {
      const text = stageText(stage)
      for (const part of [stage.name, stage.subtitle, stage.boss.name, stage.boss.title, ...stage.hints])
        expect(text).toContain(part)
      for (const hint of stage.hints) expect(text).toContain(hintForInput(hint, true))
    }
  })

  it('every aim line a stage can come to', () => {
    for (const stage of STAGES) {
      const texts = aimTexts(stage)
      // Whatever the run does: the aim of every state it can be in is among them.
      for (const collected of [0, 3])
        for (const goalOpen of [false, true])
          for (const state of ['play', 'clear'] as const)
            for (const active of [false, true])
              for (const dead of [false, true]) {
                const line = aimLine({
                  objective: stage.objective,
                  collected,
                  need: stage.collect ?? 0,
                  goalOpen,
                  state,
                  boss: { name: stage.boss.name, active, dead, stamina: Boolean(stage.boss.stamina) }
                })
                // The count of a collect stage changes its digits only, and the digits are wished for.
                const known = texts.some((text) => text.replace(/[0-9]/g, '0') === line.text.replace(/[0-9]/g, '0'))
                expect(known, `${stage.name}: ${line.text}`).toBe(true)
              }
      const all = stageText(stage)
      for (const text of texts) expect(all).toContain(text)
      expect(all).toContain('0123456789')
    }
  })

  it('what a stage shows is laid out within its opening, a few characters a frame', () => {
    for (const stage of STAGES) {
      const b = box()
      // Three fonts for free text, three for the name, three for the boss's name, two for the title, and so on.
      for (const font of ['hint', 'aim', 'say']) b.ahead.want(font, stageText(stage), true)
      for (const font of ['tag', 'banner', 'deck']) b.ahead.want(font, `${stage.no}. ${stage.name}`, true)
      for (const font of ['bar', 'plate', 'who']) b.ahead.want(font, stage.boss.name, true)
      for (const font of ['bar title', 'plate title']) b.ahead.want(font, stage.boss.title, true)
      b.ahead.want('sub', stage.subtitle, true)
      const frames = b.drain(false, AHEAD_CHUNK_IN_PLAY)
      // The opening staging lasts four and a half seconds: 270 frames at 60 a second.
      expect(frames, stage.name).toBeLessThan(200)
    }
  })
})
