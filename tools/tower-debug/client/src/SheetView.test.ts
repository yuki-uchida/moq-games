import { afterEach, expect, it, vi } from 'vitest'
import { SheetView } from './SheetView'
import { verifiedBytes } from './api'
import type { AssetRef } from './contracts'
vi.mock('./api', () => ({ verifiedBytes: vi.fn(async () => new ArrayBuffer(4)) }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('closes a decoded sheet arriving after disposal', async () => {
  // Arrange
  let resolve!: (value: ImageBitmap) => void
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(
      () =>
        new Promise<ImageBitmap>((done) => {
          resolve = done
        })
    )
  )
  const bitmap = { close: vi.fn(), width: 128, height: 112 } as unknown as ImageBitmap
  const canvas = { width: 128, height: 112 } as HTMLCanvasElement
  const view = new SheetView(canvas)
  const loading = view.load({} as AssetRef, null, new AbortController().signal)
  const rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
  await new Promise<void>((done) => setImmediate(done))
  // Act
  view.dispose()
  resolve(bitmap)
  await rejected
  // Assert
  expect(bitmap.close).toHaveBeenCalledOnce()
  expect(canvas.width).toBe(1)
  expect(canvas.height).toBe(1)
  expect(verifiedBytes).toHaveBeenCalled()
})
