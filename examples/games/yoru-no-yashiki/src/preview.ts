import type { VoiceAssessment } from './voice'

export function previewStatus(assessment: VoiceAssessment, threshold: number, penalty: number): string {
  if (assessment.rms < threshold) return '音量不足'
  if (!assessment.voiced) return '声候補なし'
  return penalty > 0 ? '減点候補' : '声候補あり・0.3秒待ち'
}
