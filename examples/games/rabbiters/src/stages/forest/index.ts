import type { StageDef } from '../../story'
import { CONVERSATIONS, NAMES } from './conversations'
import { LOOK, scenery } from './scenery'
import { script } from './script'

const forest: StageDef = {
  id: 'forest',
  title: '森へ',
  script,
  conversations: CONVERSATIONS,
  names: NAMES,
  look: LOOK,
  scenery
}
export default forest
