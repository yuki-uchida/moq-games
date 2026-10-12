import { APPROVED_MAZE_SOURCE_SIZE } from '../game/ApprovedMazeLayout'

let image: HTMLImageElement | undefined
let loading: Promise<HTMLImageElement> | undefined
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
