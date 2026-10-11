import { expect, it } from 'vitest'
import { soundStatusMessage } from '../src/audio/SoundStatus'

it('keeps the missing-pack explanation through disabled and subsequent player updates', () => {
  for (const enabled of [false, true]) {
    for (const message of ['音声の準備中', '読み込み失敗', '再生可能']) {
      expect(soundStatusMessage({ enabled, message }, false))
        .toBe('効果音素材はこのビルドに含まれていません。')
    }
  }
})

it('reports mute only when an included pack is disabled', () => {
  expect(soundStatusMessage({ enabled: false, message: '再生可能' }, true))
    .toBe('効果音はミュート中')
})

it('preserves loading, readiness, and error messages for an enabled included pack', () => {
  for (const message of ['音声の準備中', '再生可能', '読み込み失敗: HTTP 404']) {
    expect(soundStatusMessage({ enabled: true, message }, true)).toBe(message)
  }
})
