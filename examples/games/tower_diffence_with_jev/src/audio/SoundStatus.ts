import type { SoundPlayerStatus } from './SoundPlayer'

export function soundStatusMessage(
  status: Pick<SoundPlayerStatus, 'enabled' | 'message'>,
  packAvailable: boolean
): string {
  if (!packAvailable) return '効果音素材はこのビルドに含まれていません。'
  return status.enabled ? status.message : '効果音はミュート中'
}
