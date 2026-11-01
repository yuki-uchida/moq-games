import type { StageDef } from '../../story'
import { CONVERSATIONS, NAMES } from './conversations'
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
  barks: { mom: { suspicious: 'モチ？', chase: 'モチー！' } }
}
export default house
