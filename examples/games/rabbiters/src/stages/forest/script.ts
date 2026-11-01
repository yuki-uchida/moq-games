// Chapter 4: the seasons campaign. Its rules (growing, bedding, pregnancy, kits, nests) live in game.ts and
// run only on this stage; the script adds the elder's greeting, season advice and the HUD objective.
import { CAMPAIGN, CHAPTERS, HAVEN } from '../../campaign'
import { npcNear } from '../../map'
import type { Game, GameState, Player } from '../../game'
import type { Marker, StageScript } from '../../story'

const PREGNANCY_NUTRITION = 50 // RULES.pregnancyNutrition

export const script: StageScript = {
  start(game: Game) {
    game.say('arrival')
  },
  tick(game: Game) {
    const { state } = game
    // Each new season gets a word from the elder, once.
    const bit = 1 << state.chapter
    if (state.chapter > 0 && !(state.flags & bit)) {
      state.flags |= bit
      game.say(`season-${state.chapter}`)
    }
  },
  interact(game: Game, player: Player, _held: boolean, pressed: boolean) {
    if (!pressed || !npcNear(player.x, player.z, 2.5) || !game.quiet) return false
    game.say(`yomogi-${game.state.chapter}`)
    return true
  },
  objective(state: GameState, player: Player) {
    const chapter = CHAPTERS[state.chapter]
    const pregnant = state.players.find((entry) => entry.pregnant && !entry.downed)
    const safe = state.kits.filter((kit) => kit.status === 'safe').length
    const alive = state.kits.filter((kit) => kit.status !== 'lost').length
    const who = (entry: { id: string; name: string }) => (entry.id === player.id ? 'あなた' : entry.name)
    // Short goal + one bar; situational guidance goes to the hint.
    const [goal, progress, label] =
      state.chapter === 0
        ? [chapter.goal, player.growth, `成長 ${Math.round(player.growth * 100)}%`]
        : state.chapter === 1
          ? [chapter.goal, state.bedding / CAMPAIGN.beddingGoal, `巣材 ${state.bedding} / ${CAMPAIGN.beddingGoal}`]
          : state.chapter === 2
            ? pregnant
              ? [
                  pregnant.hunger <= 0 ? '空腹で出産が止まっています' : '新しい命を守ろう',
                  pregnant.pregnancy,
                  `${who(pregnant)} · 出産まで ${Math.round(pregnant.pregnancy * 100)}%`
                ]
              : [chapter.goal, 0, `おなか ${PREGNANCY_NUTRITION}以上で妊娠`]
            : [chapter.goal, safe / CAMPAIGN.kitCount, `到着 ${safe} / ${alive}羽`]
    const straggling = state.kits.some(
      (kit) => kit.status === 'wait' && Math.hypot(kit.x - player.x, kit.z - player.z) < 14
    )
    const hint = straggling
      ? '子ウサギが待っています。そばに戻ろう'
      : player.carrying
        ? '巣材を巣穴へ（遅く、見つかりやすい）'
        : state.chapter === 1 && state.straws.some((straw) => straw.active) && !state.bedding
          ? '大人になった。野原の巣材を巣穴へ運ぼう'
          : state.chapter === 3 && !safe
            ? '子ウサギは歩くより遅い。小川を渡って大樫のうろへ'
            : undefined
    return { title: `${chapter.season}｜${goal}`, progress, label, hint }
  },
  markers(state: GameState) {
    const markers: Marker[] = []
    if (state.chapter === 1)
      for (const straw of state.straws) if (straw.active) markers.push({ x: straw.x, z: straw.z, kind: 'item' })
    if (state.chapter === 3) markers.push({ x: HAVEN.x, z: HAVEN.z, kind: 'goal' })
    return markers
  }
}
