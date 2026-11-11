/**
 * The touch controls' markup: a slide pad (left / right) and two round action buttons. The pointer logic lives in
 * `Input.bindTouch` (`[data-pad]` is the slide pad, other `[data-key]` elements are buttons); this file only
 * builds the DOM and paints the pixel plates. The App shows or hides `#touch-controls` after a real touch.
 */
import './touch.css'
import { clipRaster, plateUrl, rasterUrl } from './hud-sprites'

/** Art-pixel sizes of the plates: arrows and jump are 22 px discs, bite is a 26 px disc. */
const DISC = 22
const BITE_DISC = 26

function key(name: string, label: string, icon: string, plate: 'pad' | 'jump' | 'bite', size: number): HTMLElement {
  const element = document.createElement('div')
  element.className = `hudt-key hudt-${name}`
  element.dataset.key = name
  element.setAttribute('role', 'presentation')
  element.title = label
  element.style.setProperty('--icon', rasterUrl(clipRaster('ui', icon)))
  element.style.setProperty('--plate', plateUrl(plate, size, 'disc'))
  element.style.setProperty('--plate-down', plateUrl(`${plate}Down`, size, 'disc'))
  return element
}

/** Replaces the content of the `#touch-controls` element with the controls. */
export function buildTouchControls(root: HTMLElement) {
  root.className = 'hudt'
  root.hidden = true
  root.setAttribute('aria-hidden', 'true')
  root.dataset.touchRoot = ''
  const pad = document.createElement('div')
  pad.className = 'hudt-pad'
  pad.dataset.pad = ''
  pad.dataset.hudbox = ''
  pad.append(key('left', 'ひだり', 'arrowLeft', 'pad', DISC), key('right', 'みぎ', 'arrowRight', 'pad', DISC))
  const actions = document.createElement('div')
  actions.className = 'hudt-actions'
  actions.dataset.hudbox = ''
  actions.append(key('jump', 'ジャンプ', 'jump', 'jump', DISC), key('bite', 'かじる', 'tooth', 'bite', BITE_DISC))
  root.replaceChildren(pad, actions)
}
