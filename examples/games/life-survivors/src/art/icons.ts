import { evolve, sheet } from './index'

/**
 * HUD icons: the same pixel-art icons the world uses, drawn by the art code onto a canvas once and handed
 * to `<img>` as a cached data URL (CSS keeps them crisp with `image-rendering: pixelated`).
 */
const urls = new Map<string, string>()

/** Icon id for a level-up choice ('w:id' / 'p:id' / 'x:meal' / 'x:coin'). */
export const choiceIcon = (choice: string) =>
  choice === 'x:meal' ? 'meal' : choice === 'x:coin' ? 'coin' : choice.split(':')[1]

export function iconUrl(id: string, evolved = false) {
  const key = `${id}:${evolved}`
  let url = urls.get(key)
  if (url) return url
  const base = sheet('icons')[id]?.frames[0]
  if (!base) return ''
  const r = evolved ? evolve(base) : base
  const canvas = document.createElement('canvas')
  canvas.width = r.w
  canvas.height = r.h
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.rgba()), r.w, r.h), 0, 0)
  url = canvas.toDataURL()
  urls.set(key, url)
  return url
}

export function iconImg(id: string, label: string, evolved = false) {
  const img = document.createElement('img')
  img.className = 'pixel-icon'
  img.src = iconUrl(id, evolved)
  img.alt = label
  img.title = label
  img.width = 32
  img.height = 32
  return img
}
