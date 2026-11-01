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
  coverNames: {
    shelter: '遊具や物かげの奥',
    bush: '植え込みの奥',
    grass: '葦や草むら',
    water: '浅瀬',
    under: 'ベンチや物の下',
    tunnel: '横断管の中'
  },
  look: LOOK,
  scenery,
  barks: BARKS,
  itemModel
}
export default waterway
