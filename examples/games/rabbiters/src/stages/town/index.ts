import * as THREE from 'three'
import type { StageDef } from '../../story'
import { buildFood } from '../../food'
import { buildItem } from '../../models'
import { CONVERSATIONS, NAMES } from './conversations'
import { LOOK, scenery } from './scenery'
import { script } from './script'

/** A crust of bread: a small golden slab. */
function bread() {
  const crust = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.18, 0.35),
    new THREE.MeshStandardMaterial({ color: '#c8904a', roughness: 0.9 })
  )
  crust.position.y = 0.15
  const group = new THREE.Group()
  group.add(crust)
  return group
}

const town: StageDef = {
  id: 'town',
  title: '知らない町',
  script,
  conversations: CONVERSATIONS,
  names: NAMES,
  coverNames: {
    shelter: '神社の床下',
    bush: '物かげの奥',
    canopy: '植え込みの中',
    grass: '草むら',
    under: '車や台の下',
    tunnel: '排水管の中'
  },
  look: LOOK,
  scenery,
  barks: {
    cat: { suspicious: 'ニャ？', chase: 'シャーッ！', search: 'ニャーオ……' },
    tora: { suspicious: 'ニャ？', chase: 'シャーッ！ おれのシマだ！', search: 'ニャーオ……' },
    crow: { suspicious: 'カァ？', chase: 'カァ！カァ！', search: 'カァ……' },
    human: { suspicious: 'あら？', chase: 'ウサギだ！', search: 'どこ行ったのかしら' },
    keeper: { suspicious: 'おや？', chase: 'これこれ、待ちなさい', search: 'はて……' },
    child: { suspicious: 'あれ？', chase: 'ウサギさんだー！', search: 'どこー？' },
    dog: { suspicious: 'クゥン？', chase: 'ワン！ワン！', search: 'クンクン……' },
    walker: { suspicious: 'ん？', chase: 'こら、ポチ！', search: 'なにかいた？' }
  },
  itemModel: (kind) => (kind === 'bread' ? bread() : kind === 'cabbage' ? buildFood('cabbage') : buildItem(kind))
}
export default town
