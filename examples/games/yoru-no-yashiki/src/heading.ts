import type { WorldFrame } from './world'

const headings = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'] as const

export function headingFromYaw(yaw: number): string {
  if (!Number.isFinite(yaw)) return '不明'
  const sector = Math.floor((yaw % (2 * Math.PI)) / (Math.PI / 4) + 0.5 + Number.EPSILON * 8)
  return headings[((sector % 8) + 8) % 8]
}

export function cameraHeading(frame: Pick<WorldFrame, 'role' | 'human' | 'haunter'>): string {
  const viewer = frame.role === 'human' ? frame.human : frame.haunter
  return '現在の向き：' + headingFromYaw(viewer.yaw)
}
