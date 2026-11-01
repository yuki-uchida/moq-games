import type { StageDef } from '../../story'
import { BARKS, CONVERSATIONS, NAMES } from './conversations'
import { LOOK, itemModel, scenery } from './scenery'
import { script } from './script'

const waterway: StageDef = {
  id: 'waterway',
  title: '水の道',
  script,
  conversations: CONVERSATIONS,
  names: NAMES,
  look: LOOK,
  scenery,
  barks: BARKS,
  itemModel
}
export default waterway
