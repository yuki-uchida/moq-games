import { showContact } from './ImpactPresentation'
import { path, size, type Game, type Unit } from './game'

type Point = { x: number; y: number }
type Clip = {
  texture: string
  durationMs: number
  events?: { type: string; atMs: number }[]
  frames: { x: number; y: number; durationMs: number }[]
}
const characters: Record<string, string> = {
  soldier: 'leaf-squire',
  archer: 'forest-archer',
  mage: 'star-mage',
  goblin: 'mischief-goblin',
  wolf: 'dusk-wolf'
}
// Preserve the accepted 220 ms/tile and one authored cycle/cell. The experimental
// distance-clock made tiny source strides shuffle rapidly; stretching the move
// to fit them delayed tactical input. New foot planting requires new sprite art.
/** Waits ms, but resolves at once while/when the tab is hidden so turns never stall on throttled timers. */
export function pause(ms: number) {
  return new Promise<void>((resolve) => {
    if (document.hidden) return resolve()
    const done = () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    document.addEventListener('visibilitychange', done)
  })
}
export const snapshot = (game: Game) => game.units.map((u) => ({ ...u }))
/** Nominal floor squash (style.css --tilt, 0.6–0.78). Facings for grid steps are identical across that range. */
export const TILT = 0.6
/** Back-to-front order: the far corner is (size-1, 0), the near corner (0, size-1). */
export const depth = (p: Point) => p.y - p.x + size - 1
/** Sprite facing for the projected screen vector, not the grid vector. */
export function facing(a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y
  if (!dx && !dy) return 's'
  const step = Math.round(Math.atan2((dy - dx) * TILT, dx + dy) / (Math.PI / 4))
  return ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'][(step + 8) % 8]
}
/** Walk the same legal path as movement rules: through same-side units, never through rocks or foes. */
export function route(game: Game, before: Unit[], from: Unit, to: Point): Point[] {
  return path({ rocks: game.rocks, units: before }, from, to)
}

export class BattleAnimation {
  private clips = new Map<string, Promise<Clip>>()
  private images = new Map<string, Promise<HTMLImageElement>>()
  private nodes = new Set<HTMLElement>()
  private hidden = new Set<HTMLElement>()
  private version = 0
  constructor(
    private board: HTMLElement,
    private cue: (role: string) => void
  ) {}
  cancel() {
    this.version++
    this.nodes.forEach((n) => n.remove())
    this.nodes.clear()
    this.hidden.forEach((n) => (n.style.visibility = ''))
    this.hidden.clear()
  }
  private async clip(role: string, motion: string, facing: string) {
    const id = `${role}/${characters[role]}-${motion}-${facing}`
    if (!this.clips.has(id)) {
      const pending = (async () => {
        const response = await fetch(`${import.meta.env.BASE_URL}tower-defense-art/${id}.json`, {
          signal: AbortSignal.timeout(15000)
        })
        if (!response.ok) throw new Error(`Animation ${response.status}: ${id}`)
        const clip: Clip = await response.json()
        const url = `${import.meta.env.BASE_URL}tower-defense-art/${role}/${clip.texture}`
        if (!this.images.has(url)) {
          const loading = (async () => {
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
            if (!response.ok) throw new Error(`Texture ${response.status}: ${url}`)
            const objectURL = URL.createObjectURL(await response.blob())
            const image = new Image()
            image.src = objectURL
            try {
              await image.decode()
              return image
            } catch (error) {
              URL.revokeObjectURL(objectURL)
              throw error
            }
          })()
          this.images.set(url, loading)
          void loading.catch(() => this.images.delete(url))
        }
        await this.images.get(url)!
        return clip
      })()
      this.clips.set(id, pending)
      void pending.catch(() => this.clips.delete(id))
    }
    return this.clips.get(id)!
  }
  /** Bound transfers and decode work; retain decoded images across missions/replay. */
  async prepare(progress: (done: number, total: number) => void) {
    const tasks = Object.keys(characters).flatMap((role) =>
      ['idle', 'walk', 'attack'].flatMap((motion) =>
        ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((facing) => () => this.clip(role, motion, facing))
      )
    )
    let next = 0,
      done = 0
    const failures: unknown[] = []
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < tasks.length) {
          const task = tasks[next++]
          try {
            await task()
          } catch (error) {
            failures.push(error)
          }
          progress(++done, tasks.length)
        }
      })
    )
    if (failures.length) throw new Error(`${failures.length} animation assets unavailable`)
  }
  private texture(role: string, clip: Clip) {
    return this.images.get(`${import.meta.env.BASE_URL}tower-defense-art/${role}/${clip.texture}`)!
  }
  private cell(p: Point) {
    return this.board.children[p.y * size + p.x] as HTMLElement
  }
  private hide(p: Point) {
    this.cell(p)
      .querySelectorAll<HTMLElement>('.portrait, .foot')
      .forEach((n) => {
        n.style.visibility = 'hidden'
        this.hidden.add(n)
      })
  }
  /** Projected cell centre in field coordinates; the bounding box of a transformed diamond shares its centre. */
  private center(p: Point) {
    const r = this.cell(p).getBoundingClientRect(),
      field = this.board.parentElement!.getBoundingClientRect()
    return { x: r.left - field.left + r.width / 2, y: r.top - field.top + r.height / 2, width: r.width }
  }
  private actor(u: Unit, p: Point) {
    const node = document.createElement('span')
    node.className = `motion-actor ${u.side}`
    node.setAttribute('aria-hidden', 'true')
    node.innerHTML = '<span class="foot"></span><span class="portrait"></span>'
    // Inside the projected board so depth interleaves with props and units in front.
    this.board.append(node)
    this.nodes.add(node)
    this.place(node, p)
    return node
  }
  private place(node: HTMLElement, p: Point) {
    node.style.left = `${((p.x + 0.5) * 100) / size}%`
    node.style.top = `${((p.y + 0.5) * 100) / size}%`
    // Cells use 2·depth+1: stay above every cell up to the step's nearer end, below the rest.
    node.style.zIndex = String(2 * Math.ceil(depth(p)) + 2)
  }
  private async play(
    node: HTMLElement,
    u: Unit,
    motion: string,
    facing: string,
    token: number,
    travel?: [Point, Point],
    contact?: () => void
  ) {
    const clip = await this.clip(u.role, motion, facing)
    if (token !== this.version) return
    const portrait = node.querySelector<HTMLElement>('.portrait')!
    const image = await this.texture(u.role, clip)
    const first = clip.frames[0]
    portrait.style.backgroundPosition = `-${first.x}px -${first.y}px`
    portrait.style.backgroundImage = `url('${image.src}')`
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 80 : motion === 'walk' ? 220 : clip.durationMs
    const event = clip.events?.find((e) => e.type === 'hit' || e.type === 'release')?.atMs ?? clip.durationMs * 0.5
    const contactAt = (event / clip.durationMs) * duration
    let hit = false
    await new Promise<void>((resolve) => {
      const start = performance.now()
      let done = false
      // rAF stops in hidden tabs; jump to the final frame so turns keep advancing.
      const skip = () => document.hidden && frame(start + duration)
      const finish = () => {
        done = true
        document.removeEventListener('visibilitychange', skip)
        resolve()
      }
      const frame = (now: number) => {
        if (done) return
        if (token !== this.version) {
          finish()
          return
        }
        const elapsed = Math.min(now - start, duration)
        let clock = (elapsed / duration) * clip.durationMs
        const f =
          clip.frames.find((f) => {
            clock -= f.durationMs
            return clock < 0
          }) ?? clip.frames[clip.frames.length - 1]
        portrait.style.backgroundPosition = `-${f.x}px -${f.y}px`
        if (travel) {
          const t = elapsed / duration
          this.place(node, {
            x: travel[0].x + (travel[1].x - travel[0].x) * t,
            y: travel[0].y + (travel[1].y - travel[0].y) * t
          })
        }
        if (!hit && elapsed >= contactAt) {
          hit = true
          contact?.()
        }
        if (elapsed < duration) requestAnimationFrame(frame)
        else finish()
      }
      document.addEventListener('visibilitychange', skip)
      if (document.hidden) frame(start + duration)
      else requestAnimationFrame(frame)
    })
  }
  private async projectile(from: Unit, to: Unit, token: number) {
    const arrow = document.createElement('span')
    arrow.className = `projectile ${from.role === 'mage' ? 'spell' : 'arrow'}`
    arrow.setAttribute('aria-hidden', 'true')
    this.board.parentElement!.append(arrow)
    this.nodes.add(arrow)
    const source = this.center(from),
      target = this.center(to)
    const dx = target.x - source.x,
      dy = target.y - source.y
    const length = Math.hypot(dx, dy)
    const tip = Math.min(source.width * 0.12, length * 0.25)
    // Released at chest height of a standing billboard, not the floor.
    const x = source.x + (dx / length) * tip
    const y = source.y - source.width * 0.38 + (dy / length) * tip
    arrow.style.left = `${x}px`
    arrow.style.top = `${y}px`
    const angle = Math.atan2(dy, dx)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 80 : 240
    const flight = arrow
      .animate(
        [
          { transform: `rotate(${angle}rad)` },
          { transform: `translate(${dx - (dx / length) * tip}px, ${dy - (dy / length) * tip}px) rotate(${angle}rad)` }
        ],
        { duration, easing: 'linear', fill: 'forwards' }
      )
      .finished.catch(() => {})
    // The animation timeline may freeze while hidden; pause() releases it.
    await Promise.race([flight, pause(duration)])
    arrow.remove()
    this.nodes.delete(arrow)
    return token === this.version
  }
  async present(game: Game, before: Unit[], acting: Unit) {
    const token = this.version
    const from = before.find((u) => u.id === acting.id)!
    const target = game.units.find((u) => u.hp < before.find((old) => old.id === u.id)!.hp)
    const path = route(game, before, from, acting)
    const moved = from.x !== acting.x || from.y !== acting.y
    if (!moved && !target) return
    try {
      // Never hide the source while a missing/failed asset is still loading.
      await Promise.all([
        ...path.slice(1).map((point, i) => this.clip(acting.role, 'walk', facing(path[i], point))),
        ...(target
          ? [
              this.clip(target.role, 'idle', facing(target, acting)),
              this.clip(acting.role, 'attack', facing(acting, target))
            ]
          : [])
      ])
      if (token !== this.version) return
      this.hide(from)
      const actor = this.actor(acting, from)
      if (moved) {
        this.cue('healer')
        for (let i = 1; i < path.length && token === this.version; i++) {
          await this.play(actor, acting, 'walk', facing(path[i - 1], path[i]), token, [path[i - 1], path[i]])
        }
      }
      if (target && token === this.version) {
        this.hide(target)
        const victim = this.actor(target, target)
        const old = before.find((u) => u.id === target.id)!
        const a = this.center(acting),
          b = this.center(target)
        const angle = Math.atan2(b.y - a.y, b.x - a.x)
        victim.style.setProperty('--impact-x', `${Math.cos(angle) * 7}px`)
        victim.style.setProperty('--impact-y', `${Math.sin(angle) * 7}px`)
        // Victim retains the complete accepted source cell; recoil never deforms anatomy.
        const idle = await this.clip(target.role, 'idle', facing(target, acting))
        const p = victim.querySelector<HTMLElement>('.portrait')!
        p.style.backgroundImage = `url('${(await this.texture(target.role, idle)).src}')`
        p.style.backgroundPosition = `-${idle.frames[0].x}px -${idle.frames[0].y}px`
        let impact: Promise<void> = Promise.resolve()
        let impactedAt: number | undefined
        await this.play(actor, acting, 'attack', facing(acting, target), token, undefined, () => {
          this.cue(acting.role)
          impact = (async () => {
            if ((acting.role === 'archer' || acting.role === 'mage') && !(await this.projectile(acting, target, token)))
              return
            if (token !== this.version) return
            impactedAt = performance.now()
            showContact(victim, acting.role, angle)
            victim.classList.add(target.hp === 0 ? 'motion-death' : 'motion-hit')
            const number = document.createElement('span')
            number.className = 'damage-number'
            number.textContent = `−${old.hp - target.hp}${target.hp === 0 ? ' ✦' : ''}`
            victim.append(number)
          })()
        })
        await impact
        // Finish the actual reaction instead of adding a second fixed 550 ms pause
        // after an attack clip whose recovery already contains most/all of it.
        if (token === this.version && impactedAt !== undefined) {
          const remaining = (target.hp === 0 ? 550 : 300) - (performance.now() - impactedAt)
          if (remaining > 0) await pause(remaining)
        }
      }
    } catch (error) {
      // Failed art decoding must never strand input or change the tactical result.
      console.warn('Ember animation unavailable', error)
    } finally {
      if (token === this.version) {
        this.nodes.forEach((n) => n.remove())
        this.nodes.clear()
        this.hidden.forEach((n) => (n.style.visibility = ''))
        this.hidden.clear()
      }
    }
  }
}
