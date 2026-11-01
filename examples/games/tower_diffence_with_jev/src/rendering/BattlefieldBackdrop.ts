/** A non-interactive continuation behind the fitted board; the playable map stays intact. */
export class BattlefieldBackdrop {
  private readonly canvas = document.createElement('canvas')
  private readonly observer: ResizeObserver
  private source?: HTMLCanvasElement

  constructor(private readonly viewport: HTMLElement) {
    const style = this.canvas.style
    style.position = 'absolute'
    style.inset = '0'
    style.width = '100%'
    style.height = '100%'
    style.pointerEvents = 'none'
    this.canvas.setAttribute('aria-hidden', 'true')
    viewport.prepend(this.canvas)
    this.observer = new ResizeObserver(() => this.draw())
    this.observer.observe(viewport)
    const world = viewport.querySelector<HTMLElement>('#map-world')
    if (world) this.observer.observe(world)
  }

  setSource(source?: HTMLCanvasElement): void {
    this.source = source
    this.canvas.hidden = !source
    this.draw()
  }

  private draw(): void {
    const source = this.source
    if (!source) return
    const width = Math.max(1, this.viewport.clientWidth)
    const height = Math.max(1, this.viewport.clientHeight)
    // Backdrop needs no device-pixel-ratio multiplier: it is intentionally soft.
    this.canvas.width = width
    this.canvas.height = height
    const c = this.canvas.getContext('2d')!
    const world = this.viewport.querySelector<HTMLElement>('#field')
    if (!world) return
    const scale = world.getBoundingClientRect().height / source.height
    if (scale <= 0) return
    // The southern tree line is free of roads, the entrance and the castle.
    // Stagger and mirror long strips to extend scenery without inventing
    // extra playable landmarks or an obvious repeated grid.
    const scenery = document.createElement('canvas')
    scenery.width = width
    scenery.height = height
    const paint = scenery.getContext('2d')!
    const stripHeight = Math.max(1, Math.round(source.height * 0.05))
    const tileWidth = Math.max(1, source.width * scale)
    const tileHeight = Math.max(1, stripHeight * scale)
    for (let row = 0; row * tileHeight < height; row++) {
      const shift = ((row * 0.381966) % 1) * tileWidth
      for (let x = -tileWidth + shift; x < width; x += tileWidth) {
        paint.save()
        paint.translate(x + (row % 2 ? tileWidth : 0), row * tileHeight)
        paint.scale(row % 2 ? -1 : 1, 1)
        paint.drawImage(source, 0, source.height - stripHeight, source.width, stripHeight, 0, 0, tileWidth, tileHeight)
        paint.restore()
      }
    }
    c.filter = 'blur(8px)'
    c.drawImage(scenery, -12, -12, width + 24, height + 24)
    c.filter = 'none'
    c.fillStyle = 'rgba(16, 26, 22, 0.18)'
    c.fillRect(0, 0, width, height)
  }

  dispose(): void {
    this.observer.disconnect()
    this.canvas.remove()
  }
}
