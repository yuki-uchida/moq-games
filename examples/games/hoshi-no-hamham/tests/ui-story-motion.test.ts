import { describe, expect, it } from 'vitest'
import { allSheetSpecs, type AnimSpec } from '../src/art/contract'
import { defaultAnchor } from '../src/art/sheet'
import { anchorOf, draftSheet, frameAt } from '../src/art'
import { Raster } from '../src/art/raster'
import { figureSpan, frameFor } from '../src/ui/story-frame'
import {
  DASH_FADE,
  FALL_HEIGHT,
  FALL_SPEED,
  DASH_STILL,
  DASH_VIEW,
  DASH_REST,
  PACE_REACH,
  groundStrip,
  placeFigure,
  placeMark,
  shotScroll
} from '../src/ui/story-motion'
import {
  CREDITS_SHOT,
  ENDING_SCENES,
  GROUND,
  SCENE_W,
  STORY_SCENES,
  groundTiles,
  shotArt,
  type Figure,
  type Shot
} from '../src/ui/story-scenes'
import { SEAT_HALF, seatHeight } from '../src/ui/story-seat'
import { specDuration } from '../src/view/clips'

const SHOTS: [string, Shot][] = [
  ...Object.entries(STORY_SCENES).flatMap(([scene, shots]) =>
    shots.map((shot, page) => [`${scene} page ${page + 1}`, shot] as [string, Shot])
  ),
  ...ENDING_SCENES.map((shot, page) => [`ending page ${page + 1}`, shot] as [string, Shot]),
  ['credits', CREDITS_SHOT]
]

const specs = allSheetSpecs()
const specOf = (figure: Figure): AnimSpec => specs[figure.sheet][figure.clip]
const strideOf = (figure: Figure) => specOf(figure).stride
const DT = 1 / 60
const SECONDS = 9
const leadIndex = (shot: Shot, index: number) => {
  let lead = index
  for (let n = 0; n < shot.figures.length; n++) {
    const next = shot.figures[lead].follow
    if (next === undefined || next === lead) break
    lead = next
  }
  return lead
}

/** The figures of every shot whose clip covers ground. */
const RUNNERS = SHOTS.flatMap(([label, shot]) =>
  shot.figures.flatMap((figure, index) => (strideOf(figure) ? [{ label, shot, figure, index }] : []))
)

const extentOf = (figure: Figure, x: number, flip: boolean | undefined) => {
  const spec = specOf(figure)
  const [ax] = spec.anchor ?? defaultAnchor(spec.w, spec.h)
  const left = flip ? x - (spec.w - ax) : x - ax
  return [left, left + spec.w]
}

describe('story pictures: nobody runs on the spot', () => {
  it('lets only tracked, dashing or patrolling figures play a clip with a stride', () => {
    // The hero in opening 2, 4, stage 3 shot 2 and stage 5 shot 2, mom, the weasel, the wolf and the rat.
    expect(RUNNERS.length).toBe(8)
    for (const { label, shot, figure } of RUNNERS) {
      const tag = `${label} ${figure.sheet}:${figure.clip}`
      const tracked = Boolean(shot.pan) && figure.tracked === true
      expect(tracked || figure.motion === 'dash' || figure.motion === 'pace', tag).toBe(true)
    }
  })

  it('tracks only figures that cover ground, in shots that pan', () => {
    for (const [label, shot] of SHOTS)
      shot.figures.forEach((figure, index) => {
        const tag = `${label} figure ${index} ${figure.sheet}:${figure.clip}`
        if (figure.tracked) {
          expect(shot.pan, `${tag} is tracked in a shot that pans`).toBeGreaterThan(0)
          expect(strideOf(figure), `${tag} has a stride`).toBeGreaterThan(0)
        }
        // A rider sits on the figure it follows.
        if (figure.seat !== undefined) expect(figure.follow, `${tag} sits on a mount`).toBeDefined()
        // A follower belongs to another figure of the same shot, and the chain ends.
        if (figure.follow !== undefined) {
          expect(shot.figures[figure.follow], `${tag} follows a figure`).toBeDefined()
          expect(figure.follow, tag).not.toBe(index)
        }
      })
    for (const [label, shot] of SHOTS)
      for (const mark of shot.marks ?? [])
        if (mark.follow !== undefined) expect(shot.figures[mark.follow], `${label} ${mark.clip}`).toBeDefined()
  })

  it('keeps every planted foot still: the ground that passes equals what the clip advances', () => {
    let checked = 0
    for (const { label, shot, figure, index } of RUNNERS) {
      const spec = specOf(figure)
      const stride = spec.stride!
      let prev = placeFigure(shot, index, 0, false)
      for (let step = 1; step <= SECONDS * 60; step++) {
        const cur = placeFigure(shot, index, step * DT, false)
        const before = prev
        prev = cur
        // A dash that starts again (or has not come back yet) and a patrol that turns round are the exceptions.
        if (!cur || !before || cur.flip !== before.flip) continue
        const face = cur.flip ? -1 : 1
        const passed = (cur.x - before.x + (figure.tracked ? (shot.pan ?? 0) * DT : 0)) * face
        const advance = ((cur.clipTime - before.clipTime) / specDuration(spec)) * stride
        expect(Math.abs(passed - advance), `${label} ${figure.sheet}:${figure.clip} step ${step}`).toBeLessThan(1e-6)
        expect(passed, `${label} ${figure.sheet} moves the way it faces`).toBeGreaterThan(0)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('has the weasel carry the princess, and leaves the hero behind', () => {
    const shot = STORY_SCENES['3'][0]
    const weasel = shot.figures.findIndex((f) => f.sheet === 'weaselBoss')
    const rider = shot.figures.findIndex((f) => f.sheet === 'princess')
    const hero = shot.figures.findIndex((f) => f.sheet === 'hero')
    expect(shot.figures[rider].follow).toBe(weasel)
    for (const time of [0, 0.5, 3]) {
      const a = placeFigure(shot, weasel, time, false)!
      const b = placeFigure(shot, rider, time, false)!
      expect(a.x).toBe(shot.figures[weasel].x)
      expect(b.x).toBe(shot.figures[rider].x)
    }
    expect(placeFigure(shot, hero, 0, false)!.x).toBe(shot.figures[hero].x)
    // Left behind: he goes by to the left with the ground and never comes back.
    expect(placeFigure(shot, hero, 0.3, false)!.x).toBeCloseTo(shot.figures[hero].x - 0.3 * shot.pan!, 9)
    for (let time = 1.5; time < 20; time += 0.25) expect(placeFigure(shot, hero, time, false)).toBeNull()
    expect(placeMark(shot, 0, 0, false)!.x).toBe(shot.marks![0].x)
    expect(placeMark(shot, 0, 5, false)).toBeNull()
    expect(shotScroll(shot, 2, false)).toBe(shot.scroll! + 2 * shot.pan!)
  })

  it('makes a mark that follows a figure go where the figure goes', () => {
    const shot = STORY_SCENES.opening[1]
    const sweat = shot.marks!.findIndex((m) => m.clip === 'sweat')
    const anger = shot.marks!.findIndex((m) => m.clip === 'anger')
    const hero = shot.marks![sweat].follow!
    expect(shot.figures[hero].sheet).toBe('hero')
    for (const time of [0.3, 1, 2]) {
      const body = placeFigure(shot, hero, time, false)!
      const mark = placeMark(shot, sweat, time, false)!
      expect(mark.x - shot.marks![sweat].x).toBeCloseTo(body.x - shot.figures[hero].x, 9)
      expect(mark.alpha).toBe(body.alpha)
      expect(placeMark(shot, anger, time, false)!.x).toBe(shot.marks![anger].x)
    }
    // It goes with the hero when he is out of the picture and resting, and fades in with him.
    expect(placeMark(shot, sweat, 3.2, false)).toBeNull()
    const run = (SCENE_W + specOf(shot.figures[hero]).w) / shot.figures[hero].speed!
    expect(placeMark(shot, sweat, run + DASH_REST + 0.05, false)!.alpha).toBeCloseTo(0.25, 9)
  })
})

describe('story pictures: dash and patrol', () => {
  const dashShot = STORY_SCENES.opening[1]
  const dashIndex = dashShot.figures.findIndex((f) => f.motion === 'dash')
  const dash = dashShot.figures[dashIndex]
  const speed = dash.speed!
  const run = (SCENE_W + specOf(dash).w) / speed
  const cycle = run + DASH_REST

  it('runs a dash out of the picture, rests, and starts again from its x, fading in', () => {
    expect(dashIndex).toBe(0)
    const start = placeFigure(dashShot, dashIndex, 0, false)!
    expect(start).toMatchObject({ x: dash.x, alpha: 1, flip: undefined })
    expect(placeFigure(dashShot, dashIndex, 1, false)!.x).toBeCloseTo(dash.x + speed, 9)
    // Wholly outside the scene when the run ends.
    const end = placeFigure(dashShot, dashIndex, run - 1e-9, false)!
    const [left, right] = extentOf(dash, end.x, end.flip)
    expect(left).toBeGreaterThanOrEqual(SCENE_W)
    expect(right).toBeGreaterThan(left)
    // Not drawn while it rests.
    for (let time = run; time < cycle - 1e-6; time += 0.1)
      expect(placeFigure(dashShot, dashIndex, time, false)).toBeNull()
    // Starts again from its x, faint at first.
    const again = placeFigure(dashShot, dashIndex, cycle + DASH_FADE / 4, false)!
    expect(again.x).toBeCloseTo(dash.x + speed * (DASH_FADE / 4), 9)
    expect(again.alpha).toBeCloseTo(0.25, 9)
    expect(placeFigure(dashShot, dashIndex, cycle + DASH_FADE, false)!.alpha).toBe(1)
    expect(placeFigure(dashShot, dashIndex, cycle * 3 + 0.5, false)!.x).toBeCloseTo(dash.x + speed * 0.5, 9)
  })

  it('runs a dash the way it faces, whichever way that is', () => {
    const left: Shot = { theme: 'meadow', figures: [{ ...dash, x: 200, flip: true }] }
    const a = placeFigure(left, 0, 0, false)!
    const b = placeFigure(left, 0, 1, false)!
    expect(b.x - a.x).toBeCloseTo(-speed, 9)
    const [lo, hi] = extentOf(left.figures[0], placeFigure(left, 0, run - 1e-9, false)!.x, true)
    expect(hi).toBeLessThanOrEqual(0)
    expect(lo).toBeLessThan(hi)
  })

  const patrolShot = STORY_SCENES['7'][0]
  const patrolIndex = patrolShot.figures.findIndex((f) => f.motion === 'pace')
  const patrol = patrolShot.figures[patrolIndex]

  it('patrols a triangle wave and faces the way it goes', () => {
    let lo = Infinity
    let hi = -Infinity
    let turns = 0
    let before = placeFigure(patrolShot, patrolIndex, 0, false)!
    expect(before.x).toBe(patrol.x)
    expect(before.flip).toBe(false)
    for (let step = 1; step <= 20 * 60; step++) {
      const cur = placeFigure(patrolShot, patrolIndex, step * DT, false)!
      lo = Math.min(lo, cur.x - patrol.x)
      hi = Math.max(hi, cur.x - patrol.x)
      if (cur.flip !== before.flip) turns += 1
      else if (cur.x !== before.x) expect(cur.flip, `step ${step}`).toBe(cur.x < before.x)
      // Constant speed, never faster than the patrol's.
      expect(Math.abs(cur.x - before.x)).toBeLessThanOrEqual(40 * DT + 1e-9)
      before = cur
    }
    // Samples are 2/3 px apart, so the turning points are reached to within that.
    expect(lo).toBeGreaterThanOrEqual(-PACE_REACH)
    expect(lo).toBeLessThan(-PACE_REACH + 1)
    expect(hi).toBeLessThanOrEqual(PACE_REACH)
    expect(hi).toBeGreaterThan(PACE_REACH - 1)
    // A round trip of 4 reaches takes 2.4 s at 40 px/s: 20 s turn about 16 times.
    expect(turns).toBeGreaterThanOrEqual(15)
  })
})

describe('story pictures: reduced motion', () => {
  it('moves nothing and keeps a ground cycle on one frame', () => {
    for (const [label, shot] of SHOTS) {
      for (const time of [0, 0.77, 5]) {
        expect(shotScroll(shot, time, true), label).toBe(shot.scroll ?? 0)
        shot.figures.forEach((figure, index) => {
          const placed = placeFigure(shot, index, time, true)!
          const tag = `${label} ${figure.sheet}:${figure.clip}`
          // A dash stands 64 px along its run on a mid-stride frame; everything else is where its data puts it.
          const dashing = figure.motion === 'dash'
          expect(placed.x, tag).toBe(figure.x + (dashing ? (figure.flip ? -DASH_STILL : DASH_STILL) : 0))
          expect(placed.lift, tag).toBe(figure.lift ?? 0)
          expect(placed.flip, tag).toBe(figure.flip)
          expect(placed.alpha, tag).toBe(1)
          if (dashing) {
            expect(placed.clipTime, tag).toBeGreaterThan(0)
            expect(placed.clipTime, tag).toBeLessThan(specDuration(specOf(figure)))
          } else if (strideOf(figure)) expect(placed.clipTime, tag).toBe(figure.phase ?? 0)
        })
        shot.marks?.forEach((mark, index) => {
          const dash = mark.follow === undefined ? undefined : shot.figures[mark.follow]
          const dx = dash?.motion === 'dash' ? (dash.flip ? -DASH_STILL : DASH_STILL) : 0
          expect(placeMark(shot, index, time, true), label).toEqual({ x: mark.x + dx, lift: mark.lift, alpha: 1 })
        })
      }
      expect(groundStrip(shot, 0, true), label).toEqual(groundStrip(shot, 4, true))
    }
  })
})

describe('story pictures: the ground strip', () => {
  const PANNING = SHOTS.filter(([, shot]) => shot.pan)
  const tileKey = (q: unknown) => JSON.stringify(q)

  it('has tracking shots', () => {
    expect(PANNING.length).toBeGreaterThanOrEqual(4)
  })

  it('starts as the still strip does', () => {
    for (const [label, shot] of SHOTS) {
      const strip = groundStrip(shot, 0, false)
      const tiles = groundTiles(shot)
      strip.forEach((s, i) => {
        expect(s.x, label).toBe(i * 64 - ((shot.scroll ?? 0) % 64))
        expect(s.tile, label).toEqual(tiles[i])
      })
    }
  })

  for (const [label, shot] of PANNING)
    it(`${label}: covers every frame at all times with tiles of its own list, and never jumps`, () => {
      const own = new Set(groundTiles(shot).map(tileKey))
      const list = groundTiles(shot).map(tileKey)
      const frames = [{ x: 0, w: SCENE_W }, frameFor(shot, 1), frameFor(shot, 1.2)]
      const covering = (time: number) => {
        const strip = groundStrip(shot, time, false)
        return list.indexOf(tileKey(strip.find((s) => s.x <= 100 && 100 < s.x + 64)!.tile))
      }
      for (let time = 0; time < 14; time += 0.137) {
        const strip = groundStrip(shot, time, false)
        for (const s of strip) expect(own.has(tileKey(s.tile)), `${label} at ${time}`).toBe(true)
        strip.forEach((s, i) => i > 0 && expect(s.x - strip[i - 1].x).toBeCloseTo(64, 9))
        for (const frame of frames) {
          expect(strip[0].x, `${label} at ${time}`).toBeLessThanOrEqual(frame.x)
          expect(strip[strip.length - 1].x + 64, `${label} at ${time}`).toBeGreaterThanOrEqual(frame.x + frame.w)
        }
      }
      // The tile under one spot of the picture stays or becomes the next of the cycle: no jump when it wraps.
      let was = covering(0)
      for (let step = 1; step <= 14 * 60; step++) {
        const now = covering(step * DT)
        expect((now - was + list.length) % list.length, `${label} step ${step}`).toBeLessThanOrEqual(1)
        was = now
      }
      // Everything it draws is among what the app fetches ahead of time.
      const fetched = new Set(shotArt(shot).tiles.map(tileKey))
      for (const key of own) expect(fetched.has(key)).toBe(true)
    })
})

describe('story pictures: a rider sits on her mount', () => {
  const shot = STORY_SCENES['3'][0]
  const riderIndex = shot.figures.findIndex((f) => f.seat !== undefined)
  const rider = shot.figures[riderIndex]
  const mount = shot.figures[rider.follow!]
  const anim = draftSheet(mount.sheet)[mount.clip]
  const anchor = anchorOf(anim)
  const dx = rider.x - mount.x

  /** The back under her, measured another way: every column's topmost pixel, sorted, the middle one. */
  const back = (frame: Raster) => {
    const tops: number[] = []
    for (let x = anchor[0] + dx - SEAT_HALF; x <= anchor[0] + dx + SEAT_HALF; x++)
      for (let y = 0; y < frame.h; y++)
        if (frame.get(x, y)) {
          tops.push(anchor[1] - y)
          break
        }
    tops.sort((a, b) => a - b)
    return tops[Math.floor(tops.length / 2)]
  }

  it('has her feet on his back in every frame of his gallop, and moves them as the back moves', () => {
    expect(rider.lift).toBeUndefined()
    expect(anim.frames).toHaveLength(6)
    let before: number | null = null
    let backBefore = 0
    for (const [i, frame] of anim.frames.entries()) {
      const top = seatHeight(frame, anchor, dx, SEAT_HALF)!
      const lift = top - rider.seat!
      expect(Math.abs(lift - (back(frame) - rider.seat!)), `frame ${i}`).toBeLessThanOrEqual(1)
      if (before !== null) expect(lift - before, `frame ${i}`).toBe(top - backBefore)
      before = lift
      backBefore = top
    }
    // The back really does move under her: a fixed lift would leave her floating or sunk.
    const tops = anim.frames.map((f) => seatHeight(f, anchor, dx, SEAT_HALF)!)
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(4)
  })

  it('measures the median top of the columns, flips with the mount, and knows an empty frame', () => {
    const frame = new Raster(20, 20)
    for (let x = 0; x < 20; x++) frame.set(x, 12, 1)
    frame.set(10, 3, 1)
    // The column of a stray pixel does not lift her.
    expect(seatHeight(frame, [10, 18], 0, 3)).toBe(6)
    expect(seatHeight(frame, [10, 18], 5, 2)).toBe(6)
    expect(seatHeight(new Raster(8, 8), [4, 6], 0, 3)).toBeNull()
  })
})

describe('story pictures: marks stay with their owners', () => {
  it('has the stage 7 anger mark follow the patrolling rat', () => {
    const shot = STORY_SCENES['7'][0]
    const rat = shot.figures.findIndex((f) => f.motion === 'pace')
    const anger = shot.marks!.findIndex((m) => m.clip === 'anger')
    expect(shot.marks![anger].follow).toBe(rat)
    const body = placeFigure(shot, rat, 0.9, false)!
    expect(placeMark(shot, anger, 0.9, false)!.x - shot.marks![anger].x).toBeCloseTo(body.x - shot.figures[rat].x, 9)
  })
})

describe('story pictures: nobody passes through anybody', () => {
  const sheets = new Map<string, ReturnType<typeof draftSheet>>()
  const boundsOf = new WeakMap<Raster, ReturnType<Raster['bounds']>>()
  /** The opaque bounds of a character's frame as it is drawn (scene pixels), or null when nothing is drawn. */
  const drawnBox = (figure: Figure, shot: Shot, index: number, time: number, still: boolean) => {
    const placed = placeFigure(shot, index, time, still)
    if (!placed || placed.alpha <= 0) return null
    if (!sheets.has(figure.sheet)) sheets.set(figure.sheet, draftSheet(figure.sheet))
    const anim = sheets.get(figure.sheet)![figure.clip]
    const frame = anim.frames[frameAt(anim, placed.clipTime)]
    if (!boundsOf.has(frame)) boundsOf.set(frame, frame.bounds())
    const b = boundsOf.get(frame)
    if (!b) return null
    const [ax, ay] = anchorOf(anim)
    const left = placed.flip ? placed.x + ax - (b.x + b.w) : placed.x - ax + b.x
    const top = GROUND - placed.lift - ay + b.y
    return { left, right: left + b.w, top, bottom: top + b.h }
  }
  const isCharacter = (figure: Figure) => !figure.sheet.startsWith('prop:') && figure.sheet !== 'fx'
  /** The worst overlap of two characters over the shot's first ten seconds, or '' when there is none. */
  const worstOverlap = (shot: Shot) => {
    const people = shot.figures.flatMap((f, i) => (isCharacter(f) ? [i] : []))
    let worst = 0
    let at = ''
    for (const still of [false, true])
      for (let step = 0; step <= 600; step++) {
        const time = step * DT
        for (const [n, i] of people.entries())
          for (const j of people.slice(n + 1)) {
            if (leadIndex(shot, i) === leadIndex(shot, j)) continue
            const a = drawnBox(shot.figures[i], shot, i, time, still)
            const b = drawnBox(shot.figures[j], shot, j, time, still)
            if (!a || !b) continue
            const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
            const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            const share = across / Math.min(a.right - a.left, b.right - b.left)
            if (down > 0 && share > 0.2 && share > worst) {
              worst = share
              const [f, g] = [shot.figures[i], shot.figures[j]]
              at = `${(share * 100).toFixed(0)}% ${f.sheet}:${f.clip} and ${g.sheet}:${g.clip} at ${time.toFixed(2)} s${still ? ' (still)' : ''}`
            }
          }
      }
    return at
  }

  it('draws no two characters through each other, in motion or under reduced motion', () => {
    const found = SHOTS.flatMap(([label, shot]) => {
      const worst = worstOverlap(shot)
      return worst ? [`${label}: ${worst}`] : []
    })
    expect(found).toEqual([])
  })

  it('does see a hero who runs through his mother (the first version of opening page 2)', () => {
    const old: Shot = {
      theme: 'meadow',
      figures: [
        { sheet: 'hero', clip: 'run', x: 60, motion: 'dash', speed: 160 },
        { sheet: 'mom', clip: 'yell', x: 136 }
      ]
    }
    expect(worstOverlap(old)).toMatch(/^\d+% hero:run and mom:yell/)
  })

  it('never leaves a mark over nothing: a mark that follows a figure is not drawn while the figure is not', () => {
    let followers = 0
    for (const [label, shot] of SHOTS)
      shot.marks?.forEach((mark, index) => {
        if (mark.follow === undefined) return
        followers += 1
        for (const still of [false, true])
          for (let step = 0; step <= 600; step++) {
            const time = step * DT
            if (!placeFigure(shot, mark.follow, time, still))
              expect(placeMark(shot, index, time, still), `${label} ${mark.clip} at ${time}`).toBeNull()
          }
      })
    expect(followers).toBeGreaterThanOrEqual(5)
  })
})

describe('story pictures: the fall from the sky', () => {
  const shot = STORY_SCENES['2'][0]
  const index = shot.figures.findIndex((f) => f.motion === 'fall')
  const figure = shot.figures[index]
  const base = figure.lift ?? 0
  const landing = FALL_HEIGHT / FALL_SPEED

  it('starts wholly above the classic picture, so she comes in from outside it', () => {
    const anim = draftSheet(figure.sheet)[figure.clip]
    const [, ay] = anchorOf(anim)
    const lowest = Math.max(...anim.frames.map((f) => f.bounds()!.y + f.bounds()!.h))
    // The lowest row's bottom edge is above the picture's top edge (y = 0).
    expect(GROUND - placeFigure(shot, index, 0, false)!.lift - ay + lowest).toBeLessThanOrEqual(0)
    // And she is in the picture soon: the fall keeps its pace.
    expect(FALL_SPEED).toBe(40)
    expect(landing).toBeLessThan(4)
  })

  it('drifts down when the page comes up, lands and never goes below the ground', () => {
    expect(placeFigure(shot, index, 0, false)!.lift).toBe(base + FALL_HEIGHT)
    for (let time = 0; time < landing - 1e-9; time += 0.05)
      expect(placeFigure(shot, index, time, false)!.lift, `at ${time}`).toBeGreaterThan(base)
    for (let step = 0; step <= 600; step++) {
      const placed = placeFigure(shot, index, step * DT, false)!
      expect(placed.lift).toBeGreaterThanOrEqual(base)
      if (step * DT >= landing) {
        expect(placed.lift).toBe(base)
        expect(placed.x).toBe(figure.x)
      }
    }
  })

  it('sways while she is up, and under reduced motion she stands on the ground', () => {
    const xs = [0.3, 0.6, 0.9, 1.2].map((time) => placeFigure(shot, index, time, false)!.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2)
    for (const x of xs) expect(Math.abs(x - figure.x)).toBeLessThanOrEqual(8)
    for (const time of [0, 1, 5])
      expect(placeFigure(shot, index, time, true)).toMatchObject({ x: figure.x, lift: base })
  })

  it('turns to the hero she calls to (he stands to her left)', () => {
    const hero = shot.figures.find((f) => f.sheet === 'hero')!
    expect(hero.x).toBeLessThan(figure.x)
    expect(hero.flip).toBeUndefined()
    expect(figure.flip).toBe(true)
  })
})

describe('story pictures: opening page 2', () => {
  const shot = STORY_SCENES.opening[1]
  const hero = shot.figures.findIndex((f) => f.motion === 'dash')
  const mom = shot.figures.findIndex((f) => f.sheet === 'mom')
  const nest = shot.figures.findIndex((f) => f.sheet === 'prop:nest')

  it('has mom on the left yelling after the hero, the nest in the middle and the hero dashing right out of it', () => {
    expect(shot.figures[mom].flip).toBeUndefined()
    expect(shot.figures[mom].x).toBeLessThan(shot.figures[nest].x)
    expect(shot.figures[hero].x).toBeGreaterThan(shot.figures[nest].x)
    expect(hero).toBeLessThan(nest)
    expect(shot.figures[hero].flip).toBeUndefined()
  })

  it('keeps the run in view on a tall panel', () => {
    const span = figureSpan(shot.figures[hero])!
    const dash = shot.figures[hero]
    expect(span[1] - (dash.x - 32 + specOf(dash).w)).toBe(DASH_VIEW)
    for (const aspect of [1, 1.2]) {
      const frame = frameFor(shot, aspect)
      expect(frame.x + frame.w, `aspect ${aspect}`).toBeGreaterThanOrEqual(Math.min(SCENE_W, span[1] + 6) - 1)
    }
  })
})
