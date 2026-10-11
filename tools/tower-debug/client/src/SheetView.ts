import type { AssetRef, Clip } from './contracts'
import { verifiedBytes } from './api'
import { frameAt } from './Transport'

export class SheetView {
  private generation = 0
  private disposed = false
  private bitmap: ImageBitmap | null = null
  private clip: Clip | null = null
  private imageOnly = false
  private zoom = 3
  private fullSheet = false
  constructor(private readonly canvas: HTMLCanvasElement) {}
  async load(reference: AssetRef, clip: Clip | null, signal: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error('Sheet viewer is disposed')
    const generation = ++this.generation
    const bytes = await verifiedBytes(reference, signal)
    const bitmap = await createImageBitmap(new Blob([bytes], { type: reference.mimeType }))
    if (signal.aborted || this.disposed || generation !== this.generation) {
      bitmap.close()
      throw new DOMException('Selection cancelled', 'AbortError')
    }
    if (clip && (bitmap.width !== clip.textureWidth || bitmap.height !== clip.textureHeight)) {
      bitmap.close()
      throw new Error('Sheet dimensions mismatch')
    }
    this.bitmap?.close()
    this.bitmap = bitmap
    this.clip = clip
    this.imageOnly = !clip
    this.render(0)
  }
  setZoom(value: number): void {
    this.zoom = value
  }
  setFullSheet(value: boolean): void {
    this.fullSheet = value
  }
  render(timeMs: number): void {
    const bitmap = this.bitmap
    if (!bitmap) return
    const context = this.canvas.getContext('2d')!
    const cell = this.clip?.frames?.[frameAt(this.clip, timeMs)]
    const whole = this.imageOnly || this.fullSheet || !cell
    const width = whole ? bitmap.width : cell.width,
      height = whole ? bitmap.height : cell.height
    this.canvas.width = Math.max(1, Math.round(width * (this.imageOnly ? 1 : this.zoom)))
    this.canvas.height = Math.max(1, Math.round(height * (this.imageOnly ? 1 : this.zoom)))
    context.imageSmoothingEnabled = this.imageOnly
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    context.drawImage(
      bitmap,
      whole ? 0 : cell.x,
      whole ? 0 : cell.y,
      width,
      height,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    )
    if (this.fullSheet && cell) {
      context.strokeStyle = '#f7cf63'
      context.lineWidth = 2
      context.strokeRect(cell.x * this.zoom, cell.y * this.zoom, cell.width * this.zoom, cell.height * this.zoom)
    }
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation++
    this.bitmap?.close()
    this.bitmap = null
    this.clip = null
    this.canvas.width = 1
    this.canvas.height = 1
  }
}
