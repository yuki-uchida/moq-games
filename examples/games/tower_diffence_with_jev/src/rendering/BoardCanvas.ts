export function orientBoardCanvas(canvas: HTMLCanvasElement): void {
  canvas.style.transform = 'scaleY(-1)'
  // The board renders into a supersampled buffer; smooth filtering on the final fit avoids
  // uneven nearest-neighbour pixel widths at fractional viewport scales.
  canvas.style.imageRendering = 'auto'
}

export function drawBoardCanvas(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  crop = { x: 0, y: 0, width: source.width, height: source.height },
  destination = { y: 0, width: crop.width, height: crop.height }
): void {
  context.save()
  context.clearRect(0, destination.y, destination.width, destination.height)
  context.translate(0, destination.y + destination.height)
  context.scale(1, -1)
  context.drawImage(
    source,
    crop.x,
    source.height - crop.y - crop.height,
    crop.width,
    crop.height,
    0,
    0,
    destination.width,
    destination.height
  )
  context.restore()
}
