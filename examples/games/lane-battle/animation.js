// Pose timing changes only presentation; simulation damage/cooldowns stay unchanged.
export function animationFrame(meta, motion, phase, period, walkDistance = 0, size = meta.frameSize?.width ?? 128) {
  let frame = Math.floor(phase * meta.fps) % meta.frames.length
  if (motion === 'walk' && meta.strideWorldUnits) {
    const stride = (meta.strideWorldUnits * size) / (meta.frameSize?.width ?? 128)
    frame = Math.floor((walkDistance / stride) * meta.frames.length) % meta.frames.length
  } else if (motion === 'attack') {
    const duration = (meta.durationMs || 750) / 1000
    const contact =
      meta.releaseFrame ?? Math.floor(((meta.events?.[0]?.atMs ?? duration * 1000 * 0.48) / 1000) * meta.fps)
    const cycle = Math.min(phase / period, 0.999)
    // Damage occurs at cycle zero: show contact, recoil, then prepare the next strike.
    const pose =
      cycle < 0.3
        ? contact + (meta.frames.length - 1 - contact) * Math.min(1, cycle / 0.26)
        : cycle < 0.52
          ? 0
          : contact * Math.min(1, ((cycle - 0.52) / 0.48) ** 1.7)
    frame = Math.min(meta.frames.length - 1, Math.floor(pose))
  }
  return frame
}
export function spriteRect(frame, x, groundY, size, aspect = 1) {
  const pivot = frame.pivot || { x: 64, y: 94 }
  return [
    x - (pivot.x / frame.width) * size,
    groundY - (pivot.y / frame.width) * size * aspect,
    size,
    ((size * frame.height) / frame.width) * aspect
  ]
}

// Keep the authored ground pivot fixed while the whole body shifts weight.
export function walkPose(meta, distance, size, side, role) {
  const stride = (meta.strideWorldUnits * size) / (meta.frameSize?.width ?? 128)
  const wave = Math.sin((2 * Math.PI * distance) / stride)
  const amplitude = role === 'wolf' ? 0.025 : 0.055
  return { angle: side * amplitude * wave, height: 1 - (role === 'wolf' ? 0.015 : 0.035) * wave * wave }
}
