import { APPROVED_MAZE_SOURCE_SIZE } from '../game/ApprovedMazeLayout'

let image: HTMLImageElement | undefined
let loading: Promise<HTMLImageElement> | undefined
let forest: HTMLCanvasElement | undefined

export function forestMeadowArt(source: CanvasImageSource): CanvasImageSource {
  if (source !== image) return source
  if (forest) return forest
  const canvas = document.createElement('canvas')
  canvas.width = APPROVED_MAZE_SOURCE_SIZE.width
  canvas.height = APPROVED_MAZE_SOURCE_SIZE.height
  const context = canvas.getContext('2d')!
  context.drawImage(source, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index],
      green = pixels.data[index + 1],
      blue = pixels.data[index + 2]
    const leaf = clamp((green - red * 0.91 - 3) / 28) * clamp((green - blue - 10) / 35)
    const shade = clamp((190 - (0.24 * red + 0.63 * green + 0.13 * blue)) / 180)
    const baseRed = red * 0.91 + 12 * shade,
      baseGreen = green * 0.94 + 9 * shade,
      baseBlue = blue * 0.94 + 22 * shade
    pixels.data[index] = baseRed + (red * 0.39 + green * 0.13 + 13 - baseRed) * leaf
    pixels.data[index + 1] = baseGreen + (green * 0.57 + 36 - baseGreen) * leaf
    pixels.data[index + 2] = baseBlue + (blue * 0.58 + green * 0.16 + 37 - baseBlue) * leaf
  }
  context.putImageData(pixels, 0, 0)
  forest = canvas
  return canvas
}
export function approvedMazeArt(): HTMLImageElement | undefined {
  return image
}
export function loadApprovedMazeArt(): Promise<HTMLImageElement> {
  if (image) return Promise.resolve(image)
  if (loading) return loading
  loading = (async () => {
    const next = new Image()
    next.src = new URL(`${import.meta.env.BASE_URL}tower-defense-map/approved-meadow.png`, document.baseURI).href
    await next.decode()
    if (
      next.naturalWidth !== APPROVED_MAZE_SOURCE_SIZE.width ||
      next.naturalHeight !== APPROVED_MAZE_SOURCE_SIZE.height
    )
      throw new Error('Approved map dimensions do not match its traced geometry')
    image = next
    return next
  })().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}
