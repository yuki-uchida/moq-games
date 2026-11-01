import type { StageDef } from '../../story'
import { CONVERSATIONS, NAMES } from './conversations'
import { LOOK, scenery } from './scenery'
import { script } from './script'

const town: StageDef = {
  id: 'town',
  title: '知らない町',
  script,
  conversations: CONVERSATIONS,
  names: NAMES,
  look: LOOK,
  scenery
}
export default town
