import type { StageDef } from '../../story'
import { CONVERSATIONS, NAMES } from './conversations'
import { LOOK, scenery } from './scenery'
import { script } from './script'

const waterway: StageDef = {
  id: 'waterway',
  title: '水の道',
  script,
  conversations: CONVERSATIONS,
  names: NAMES,
  look: LOOK,
  scenery
}
export default waterway
