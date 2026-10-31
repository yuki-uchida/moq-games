import { showContact } from './ImpactPresentation'
import { key, size, type Game, type Unit } from './game'

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
export const snapshot = (game: Game) => game.units.map((u) => ({ ...u }))
export function direction(a: Point, b: Point) {
  return `${b.y < a.y ? 'n' : b.y > a.y ? 's' : ''}${b.x < a.x ? 'w' : b.x > a.x ? 'e' : ''}` || 's'
}
/** Follow the same four-neighbour occupancy rules as reachable; never glide through rocks. */
export function route(game: Game, before: Unit[], from: Unit, to: Point): Point[] {
  const queue: Point[][] = [[from]],
    seen = new Set([key(from.x, from.y)])
  for (const path of queue) {
    const last = path[path.length - 1]
    if (last.x === to.x && last.y === to.y) return path
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1]
    ]) {
      const p = { x: last.x + dx, y: last.y + dy },
        k = key(p.x, p.y)
      if (
        p.x < 0 ||
        p.y < 0 ||
        p.x >= size ||
        p.y >= size ||
        seen.has(k) ||
        game.rocks.has(k) ||
        before.some((u) => u.hp > 0 && u.id !== from.id && u.x === p.x && u.y === p.y)
      )
        continue
      seen.add(k)
      queue.push([...path, p])
    }
  }
  return [from]
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
    const n = this.cell(p).querySelector<HTMLElement>('.portrait')
    if (n) {
      n.style.visibility = 'hidden'
      this.hidden.add(n)
    }
  }
  private actor(u: Unit, p: Point) {
    const node = document.createElement('span')
    node.className = 'motion-actor'
    node.setAttribute('aria-hidden', 'true')
    node.innerHTML = '<span class="portrait"></span>'
    this.board.parentElement!.append(node)
    this.nodes.add(node)
    this.place(node, p)
    return node
  }
  private place(node: HTMLElement, p: Point) {
    const field = this.board.parentElement!.getBoundingClientRect()
    const first = this.cell({ x: 0, y: 0 }).getBoundingClientRect()
    const cell = this.cell({ x: 1, y: 1 }).getBoundingClientRect()
    node.style.left = `${first.left - field.left + first.width / 2 + p.x * (cell.left - first.left)}px`
    node.style.top = `${first.top - field.top + first.height / 2 + p.y * (cell.top - first.top)}px`
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
      const frame = (now: number) => {
        if (token !== this.version) {
          resolve()
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
        else resolve()
      }
      requestAnimationFrame(frame)
    })
  }
  private async projectile(from: Unit, to: Unit, token: number) {
    const arrow = document.createElement('span')
    arrow.className = `projectile ${from.role === 'mage' ? 'spell' : 'arrow'}`
    arrow.setAttribute('aria-hidden', 'true')
    this.board.parentElement!.append(arrow)
    this.nodes.add(arrow)
    const source = this.cell(from).getBoundingClientRect()
    const target = this.cell(to).getBoundingClientRect()
    const field = this.board.parentElement!.getBoundingClientRect()
    const dx = target.left - source.left,
      dy = target.top - source.top
    const length = Math.hypot(dx, dy)
    const tip = Math.min(source.width * 0.24, length * 0.25)
    const x = source.left - field.left + source.width / 2 + (dx / length) * tip
    const y = source.top - field.top + source.height / 2 - source.height * 0.23 + (dy / length) * tip
    arrow.style.left = `${x}px`
    arrow.style.top = `${y}px`
    const angle = Math.atan2(dy, dx)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    await arrow
      .animate(
        [
          { transform: `rotate(${angle}rad)` },
          { transform: `translate(${dx - (dx / length) * tip}px, ${dy - (dy / length) * tip}px) rotate(${angle}rad)` }
        ],
        { duration: reduced ? 80 : 240, easing: 'linear', fill: 'forwards' }
      )
      .finished.catch(() => {})
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
        ...path.slice(1).map((point, i) => this.clip(acting.role, 'walk', direction(path[i], point))),
        ...(target
          ? [
              this.clip(target.role, 'idle', direction(target, acting)),
              this.clip(acting.role, 'attack', direction(acting, target))
            ]
          : [])
      ])
      if (token !== this.version) return
      this.hide(from)
      const actor = this.actor(acting, from)
      if (moved) {
        this.cue('healer')
        for (let i = 1; i < path.length && token === this.version; i++) {
          const facing = direction(path[i - 1], path[i])
          await this.play(actor, acting, 'walk', facing, token, [path[i - 1], path[i]])
        }
      }
      if (target && token === this.version) {
        this.hide(target)
        const victim = this.actor(target, target)
        const old = before.find((u) => u.id === target.id)!
        const length = Math.hypot(target.x - acting.x, target.y - acting.y) || 1
        victim.style.setProperty('--impact-x', `${((target.x - acting.x) / length) * 7}px`)
        victim.style.setProperty('--impact-y', `${((target.y - acting.y) / length) * 7}px`)
        // Victim retains the complete accepted source cell; recoil never deforms anatomy.
        const idle = await this.clip(target.role, 'idle', direction(target, acting))
        const p = victim.querySelector<HTMLElement>('.portrait')!
        p.style.backgroundImage = `url('${(await this.texture(target.role, idle)).src}')`
        p.style.backgroundPosition = `-${idle.frames[0].x}px -${idle.frames[0].y}px`
        let impact: Promise<void> = Promise.resolve()
        let impactedAt: number | undefined
        await this.play(actor, acting, 'attack', direction(acting, target), token, undefined, () => {
          this.cue(acting.role)
          impact = (async () => {
            if ((acting.role === 'archer' || acting.role === 'mage') && !(await this.projectile(acting, target, token)))
              return
            if (token !== this.version) return
            impactedAt = performance.now()
            showContact(victim, acting.role, Math.atan2(target.y - acting.y, target.x - acting.x))
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
          if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
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
