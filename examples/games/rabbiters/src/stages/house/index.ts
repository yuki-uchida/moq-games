import type { StageDef } from '../../story'
import { BARKS, CONVERSATIONS, NAMES } from './conversations'
import { itemModel } from './props'
import { LOOK, scenery } from './scenery'
import { script } from './script'

const house: StageDef = {
  id: 'house',
  title: 'ケージの外へ',
  script,
  conversations: CONVERSATIONS,
  names: NAMES,
  look: LOOK,
  scenery,
  barks: BARKS,
  itemModel
}
export default house
