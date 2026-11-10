/** Tiny DOM helpers for the menus and HUD (no framework). */
import { iconUrl } from '../render/sprites'

type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>

/** Creates an element: el('button.primary', { onclick }, 'text', child). */
export function el<K extends keyof HTMLElementTagNameMap = 'div'>(
  spec: K | `${K}.${string}` | `${K}#${string}` | (string & {}),
  attrs: Attrs = {},
  ...children: (Node | string | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const m = /^([a-z0-9]+)(?:#([\w-]+))?((?:\.[\w-]+)*)$/.exec(spec)
  const tag = (m?.[1] ?? spec) as K
  const node = document.createElement(tag)
  if (m?.[2]) node.id = m[2]
  if (m?.[3]) node.className = m[3].slice(1).replace(/\./g, ' ')
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (typeof v === 'function') node.addEventListener(k.replace(/^on/, ''), v as EventListener)
    else if (k === 'class') node.className += (node.className ? ' ' : '') + String(v)
    else if (k === 'text') node.textContent = String(v)
    else if (k === 'html') node.innerHTML = String(v)
    else if (v === true) node.setAttribute(k, '')
    else node.setAttribute(k, String(v))
  }
  for (const c of children) if (c !== undefined && c !== false) node.append(c)
  return node
}

/** A crisp pixel icon from a sprite sheet. */
export function icon(sheetId: string, name: string, size: number, className = 'px-icon', frame = 0): HTMLImageElement {
  const img = el('img', { class: className, alt: '', draggable: 'false', width: size, height: size })
  const url = iconUrl(sheetId, name, 1, frame)
  if (url) img.src = url
  else img.style.visibility = 'hidden'
  return img
}

/** Replaces children only when the key changed (cheap HUD updates). */
export function setText(node: Element, text: string) {
  if (node.textContent !== text) node.textContent = text
}

export function show(node: HTMLElement, visible: boolean) {
  if (node.hidden === visible) node.hidden = !visible
}

/**
 * Wraps `content` in a scrolling region that keeps its siblings (title, action buttons) pinned. While more content is
 * hidden above/below it sets `data-more-up` / `data-more-down`, which the stylesheet turns into a soft edge fade.
 */
export function scrollArea(content: HTMLElement, className = ''): HTMLElement {
  const area = el('div.scroll-area' + (className ? '.' + className : ''), {}, content)
  const sync = () => {
    const max = area.scrollHeight - area.clientHeight
    area.toggleAttribute('data-more-up', max > 1 && area.scrollTop > 1)
    area.toggleAttribute('data-more-down', max > 1 && area.scrollTop < max - 1)
  }
  area.addEventListener('scroll', sync, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(sync)
    ro.observe(area)
    ro.observe(content)
  }
  return area
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex="0"], select:not([disabled])'

/** Visible focusable elements inside a container, in order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (n) => n.offsetParent !== null && !n.closest('[hidden]')
  )
}

/**
 * Arrow-key navigation inside a menu container (`data-menu`): Up/Down (and Left/Right in `data-grid`) move focus.
 * `onMove` plays the menu sound.
 */
export function menuKeys(root: HTMLElement, onMove: () => void) {
  root.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text' && /Left|Right/.test(e.key)) return
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range' && /Left|Right/.test(e.key)) return
    const grid = !!target.closest('[data-grid]')
    const dir = { ArrowDown: 1, ArrowUp: -1, ArrowRight: grid ? 1 : 0, ArrowLeft: grid ? -1 : 0 }[e.key]
    if (!dir) return
    const list = focusables(root)
    const i = list.indexOf(target)
    if (i < 0) {
      list[0]?.focus()
    } else {
      const next = list[(i + dir + list.length) % list.length]
      next?.focus()
    }
    e.preventDefault()
    onMove()
  })
}

export function clearChildren(node: Element) {
  while (node.firstChild) node.firstChild.remove()
}

/** mm:ss of seconds. */
export function clock(s: number) {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}
