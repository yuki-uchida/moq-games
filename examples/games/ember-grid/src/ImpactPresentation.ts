import { impactCanvas, impactStyle, impactDuration } from '../../shared/ImpactArt'

const sheets = new Map<string, string>()
/** Attached at the existing victim contact callback; parent cancellation owns cleanup. */
export function showContact(victim: HTMLElement, role: string, angle: number): void {
  const style = impactStyle(role)
  let url = sheets.get(style)
  if (!url) {
    const sheet = document.createElement('canvas')
    sheet.width = 256
    sheet.height = 32
    const context = sheet.getContext('2d')!
    for (let frame = 0; frame < 8; frame++) context.drawImage(impactCanvas(style, frame), frame * 32, 0)
    url = sheet.toDataURL()
    sheets.set(style, url)
  }
  const contact = document.createElement('span')
  contact.className = 'combat-contact'
  contact.setAttribute('aria-hidden', 'true')
  contact.style.backgroundImage = `url("${url}")`
  contact.style.transform = `rotate(${angle}rad)`
  contact.style.animationDuration = `${impactDuration(style)}s`
  victim.append(contact)
}
