/** Formation detection (DESIGN §6): links ≤ 104 px, connected components, all members within 150 px of the centroid. */
import { banner, emit, roomOf, sfx } from './core'
import type { Formation, Hero, WorldState } from './state'
import { FORM, FORM_NAMES } from './tables'

export interface FormPoint {
  slot: number
  x: number
  y: number
}

/** Pure detection on points (used by tests and the world). */
export function detectFormations(points: readonly FormPoint[]): Formation[] {
  const n = points.length
  const seen = new Array(n).fill(false)
  const out: Formation[] = []
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue
    const comp: number[] = []
    const stack = [i]
    seen[i] = true
    while (stack.length) {
      const a = stack.pop()!
      comp.push(a)
      for (let b = 0; b < n; b++) {
        if (seen[b]) continue
        if (Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) <= FORM.link) {
          seen[b] = true
          stack.push(b)
        }
      }
    }
    if (comp.length < 2) continue
    const cx = comp.reduce((s, k) => s + points[k].x, 0) / comp.length
    const cy = comp.reduce((s, k) => s + points[k].y, 0) / comp.length
    if (!comp.every((k) => Math.hypot(points[k].x - cx, points[k].y - cy) <= FORM.radius)) continue
    out.push({ slots: comp.map((k) => points[k].slot).sort((a, b) => a - b), x: cx, y: cy })
  }
  return out
}

const eligible = (h: Hero) => h.state !== 'down' && h.state !== 'fall' && h.hp > 0

export function updateFormations(W: WorldState, dt: number): void {
  // Members of a running technique keep their formation.
  const inTech = new Set(W.techs.flatMap((t) => t.slots))
  const pts = W.heroes
    .filter((h) => eligible(h) && !inTech.has(h.slot))
    .map((h) => ({ slot: h.slot, x: h.body.x, y: h.body.y }))
  const forms = detectFormations(pts)
  for (const t of W.techs) forms.push({ slots: [...t.slots], x: t.x, y: t.y })
  W.formations = forms
  for (const h of W.heroes) h.form = -1
  forms.forEach((f, i) => {
    for (const s of f.slots) {
      const h = W.heroes.find((m) => m.slot === s)
      if (h) {
        h.form = i
        h.stats.formTime += dt
      }
    }
  })
  // Events when a formation forms or changes size (keyed by its lowest slot).
  const now = new Map<string, number>()
  for (const f of forms) now.set(f.slots.join(','), f.slots.length)
  for (const f of forms) {
    const key = f.slots.join(',')
    if (W.prevForms.has(key)) continue
    const overlapPrev = [...W.prevForms.keys()].some((k) => k.split(',').some((s) => f.slots.includes(Number(s))))
    const prevSize = Math.max(
      0,
      ...[...W.prevForms.keys()]
        .filter((k) => k.split(',').some((s) => f.slots.includes(Number(s))))
        .map((k) => k.split(',').length)
    )
    if (overlapPrev && prevSize === f.slots.length) continue
    emit(W, 'form', f.x, f.y, { a: f.slots.length, s: FORM_NAMES[f.slots.length] })
    sfx(W, 'formLink', f.x, f.y)
    if (f.slots.length === 4) {
      const room = roomOf(W, f.x, f.y)?.id ?? ''
      if (!W.bigFormRooms.has(room)) {
        W.bigFormRooms.add(room)
        banner(W, '四方陣！')
      }
    }
  }
  for (const k of W.prevForms.keys())
    if (!now.has(k) && ![...now.keys()].some((n) => n.split(',').some((s) => k.split(',').includes(s))))
      sfx(W, 'formBreak', 0, 0)
  W.prevForms = now
}
