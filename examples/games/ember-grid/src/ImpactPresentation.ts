import { impactCanvas, impactStyle, impactDuration } from '../../shared/ImpactArt'

const sheets = new Map<string, string>()
export function prepareContacts(roles: string[]): void {
  for (const role of roles) {
    const style = impactStyle(role)
    if (sheets.has(style)) continue
    const sheet = document.createElement('canvas')
    sheet.width = 256
    sheet.height = 32
    const context = sheet.getContext('2d')
    if (!context) throw new Error('Impact canvas unavailable')
    for (let frame = 0; frame < 8; frame++) context.drawImage(impactCanvas(style, frame), frame * 32, 0)
    const url = sheet.toDataURL()
    if (url === 'data:,') throw new Error('Impact image unavailable')
    sheets.set(style, url)
  }
}
/** Attached at the existing victim contact callback; parent cancellation owns cleanup. */
export function showContact(victim: HTMLElement, role: string, angle: number): void {
  const style = impactStyle(role)
  const url = sheets.get(style)
  if (!url) return
  const contact = document.createElement('span')
  contact.className = 'combat-contact'
  contact.setAttribute('aria-hidden', 'true')
  contact.style.backgroundImage = `url("${url}")`
  contact.style.transform = `rotate(${angle}rad)`
  contact.style.animationDuration = `${impactDuration(style)}s`
  victim.append(contact)
}
