/** A still frontispiece while the live battle is loading or motion is reduced. */
export function paintTitleLandscape(canvas: HTMLCanvasElement): void {
  const c = canvas.getContext('2d')
  if (!c) return
  const { width, height } = canvas
  const sky = c.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#426b72')
  sky.addColorStop(0.38, '#d5b780')
  sky.addColorStop(0.57, '#eee0b8')
  sky.addColorStop(1, '#436d5b')
  c.fillStyle = sky
  c.fillRect(0, 0, width, height)
  const sun = c.createRadialGradient(480, 155, 38, 480, 155, 230)
  sun.addColorStop(0, '#fff0bd')
  sun.addColorStop(0.18, '#f4d492ab')
  sun.addColorStop(1, '#efc67d00')
  c.fillStyle = sun
  c.fillRect(0, 0, width, height)
  for (let i = 0; i < 24; i++) {
    c.fillStyle = i % 3 === 0 ? '#fff2cf32' : '#eee3c21a'
    c.beginPath()
    c.ellipse((i * 137) % width, 28 + ((i * 41) % 175), 16 + ((i * 19) % 85), 1 + (i % 4), -0.045, 0, Math.PI * 2)
    c.fill()
  }

  const ridge = (x: number, y: number, height: number) =>
    y + height * (Math.sin(x / 164) + 0.37 * Math.sin(x / 51) + 0.13 * Math.cos(x / 23))
  const hills = (y: number, amplitude: number, color: string) => {
    c.fillStyle = color
    c.beginPath()
    c.moveTo(0, height)
    for (let x = 0; x <= width; x += 10) c.lineTo(x, ridge(x, y, amplitude))
    c.lineTo(width, height)
    c.fill()
  }
  hills(252, 68, '#85968a')
  hills(273, 52, '#708779')

  const roof = new Path2D('M-.72 0 0 -1.12 .72 0Z')
  const litRoof = new Path2D('M-.72 0 0 -1.12 -.2 0Z')
  const pennant = new Path2D('M0 0 11 2 18 1 15 7 7 6 0 7Z')
  c.fillStyle = '#718675'
  c.fillRect(505, 207, 160, 85)
  for (let x = 505; x < 665; x += 13) c.fillRect(x, 200, 8, 9)
  for (const [x, top, span] of [
    [523, 198, 26],
    [560, 169, 43],
    [597, 193, 31],
    [641, 196, 24]
  ]) {
    c.fillStyle = '#526d64'
    c.fillRect(x - span / 2, top, span, 295 - top)
    c.fillStyle = '#778b76'
    c.fillRect(x - span / 2, top, span * 0.36, 295 - top)
    c.fillStyle = '#435e57'
    c.fillRect(x - span / 2 - 2, top - 3, span + 4, 5)
    c.fillStyle = '#efcc86'
    c.fillRect(x - 2, top + 8, 4, 7)
    c.fillStyle = '#344f4b'
    c.fillRect(x - 2, top + 24, 4, 7)
    c.save()
    c.translate(x, top - 3)
    c.scale(span, span)
    c.fillStyle = '#456863'
    c.fill(roof)
    c.fillStyle = '#748777'
    c.fill(litRoof)
    c.restore()
    c.save()
    c.translate(x, top - 3 - span * 1.12 - 14)
    c.fillStyle = '#776b4b'
    c.fillRect(-1, 0, 2, 15)
    c.fillStyle = '#cba458'
    c.fill(pennant)
    c.restore()
  }

  const fir = new Path2D(
    'M0 -1 .17 -.65 .1 -.66 .27 -.4 .18 -.43 .37 -.12 .11 -.15 .04 0 -.08 0 -.1 -.16 -.33 -.12 -.15 -.44 -.25 -.4 -.08 -.69 -.14 -.65Z'
  )
  const tree = (x: number, y: number, size: number) => {
    c.save()
    c.translate(x, y)
    c.scale(size, size)
    c.fill(fir)
    c.restore()
  }
  hills(298, 38, '#537366')
  for (let x = -15, i = 0; x < width + 30; x += 11, i++) tree(x, ridge(x, 300, 38) + 14, 14 + ((i * 19) % 36))
  hills(374, 48, '#315b50')
  for (let x = -8, i = 0; x < width + 20; x += 17, i++) tree(x, ridge(x, 374, 48) + 20, 18 + ((i * 23) % 56))
  c.fillStyle = '#244f45'
  for (let x = -30, i = 0; x < width + 40; x += 33, i++) {
    if (x < 170 || x > 725) tree(x, 460 + ((i * 63) % 160), 80 + ((i * 47) % 108))
  }
}
