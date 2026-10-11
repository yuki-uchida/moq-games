import type { SandbagPlacement } from '../game/model'

export { GroundTapInput as SandbagInput } from './GroundTapInput'

export function sandbagPlacementLabel(result: SandbagPlacement): string {
  const reasons = {
    phase: '土のうは準備中だけ配置できます。',
    'invalid-point': '道の上を選んでください。',
    'off-road': '土のうは道の上に配置してください。',
    'entry-clearance': '敵の入口からもう少し離してください。',
    'core-clearance': '王国の門からもう少し離してください。',
    'defender-overlap': '仲間の配置場所から離してください。',
    unavailable: '土のうの在庫がありません。次のステージで1個補給されます。',
    'barrier-overlap': 'ほかの土のうから少し離してください。',
    'missing-barrier': '選択した土のうはもうありません。もう一度選んでください。'
  }
  return result.reason ? reasons[result.reason] : 'ここに土のうを配置'
}
