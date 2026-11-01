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
  coverNames: {
    shelter: 'ケージ・押し入れの中',
    bush: 'カーテンや物かげの奥',
    canopy: '物かげ',
    grass: '花壇や畑の中',
    under: '家具の下',
    tunnel: 'ネズミの抜け穴'
  },
  look: LOOK,
  scenery,
  barks: BARKS,
  itemModel
}
export default house
