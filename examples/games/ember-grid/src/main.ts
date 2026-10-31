import {
  attack,
  beginAlly,
  beginEnemy,
  createGame,
  damage,
  distance,
  enemyStep,
  missions,
  recover,
  key,
  move,
  reachable,
  size,
  type Unit
} from './game'
import './style.css'
import { ExpeditionAudio } from './audio'
import { BattleAnimation, snapshot } from './animation'
let busy = false
let ready = false
let game = createGame(),
  selected: string | undefined,
  generation = 0
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `<main><header><div><small>EMBER GRID · TACTICAL EXAMPLE</small><h1>燈の境界</h1></div><button id="sound" aria-label="音を有効にする" aria-pressed="false">♫×</button><button id="help" aria-label="遊び方">?</button><button id="restart" aria-label="再プレイ">↻</button></header><section class="status"><button id="mission" aria-label="任務と編成">⚑ 01</button><strong id="turn"></strong><span id="count"></span></section><div class="field"><div id="board" aria-label="戦術盤"></div><div id="result" hidden><p id="outcome"></p><button id="next">次の任務 ▶</button></div></div><section class="console"><div id="selection"></div><div id="log" role="status" aria-live="polite"></div><nav><button id="recover" aria-label="回復薬">✚ 2</button><button id="wait">✓ 待機</button><button id="end">▶ ターン終了</button></nav></section><dialog><h2>霧から燈を守ろう</h2><p>3 つの任務で灰の群れを倒し、燈をつなごう。各任務は敵全滅で勝利、味方全滅で敗北。⚑ から任務と編成を選べます。</p><p>味方を選び、青い ◇ へ移動。赤い敵を選ぶと攻撃。各自 1 回移動・1 回攻撃できます。攻撃すると行動終了。</p><p>♣ 木立：受けるダメージ −2。◆ 岩：通行不可。攻撃は距離のみで判定し、岩越しにも届きます。反撃なし。弓は狼に +3、剣はゴブリンに +1。盾持ちは物理 −2、魔法は盾を無視します。</p><p>✚ 回復薬：全員共有で任務ごとに 2 個。自分を 8 回復して行動終了。守備隊は HP +4・移動 2、標準隊は移動 3。任務間では全回復します。✓ は選択した味方の待機。▶ で敵のターン。敵は接近し、届く相手のうち残 HP の少ない相手を狙います。</p><p>キーボード：Tab でマスを選び Enter。↻ でいつでも再挑戦。</p><button id="close">戻る</button></dialog><dialog id="expedition"><h2>燈をつなぐ遠征</h2><div id="missions"></div><fieldset><legend>編成</legend><label><input type="radio" name="formation" value="balanced" checked> 標準隊 · 移動 3</label><label><input type="radio" name="formation" value="guard"> 守備隊 · HP +4 / 移動 2</label></fieldset><p>任務を選ぶと新しい戦闘を開始します。</p><button id="cancel-mission">戻る</button></dialog></main>`
const audio = new ExpeditionAudio((message) => {
  game.log = message
  document.querySelector('#log')!.textContent = message
})
const board = document.querySelector<HTMLDivElement>('#board')!
const animation = new BattleAnimation(board, (role) => audio.cue(role))
const cells: HTMLButtonElement[] = []
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const cell = document.createElement('button')
    cell.className = 'cell'
    cell.onclick = () => choose(x, y)
    board.append(cell)
    cells.push(cell)
  }
function lockPresentation() {
  busy = true
  cells.forEach((cell) => (cell.disabled = true))
  document.querySelectorAll<HTMLButtonElement>('nav button').forEach((button) => (button.disabled = true))
}
const art: Record<string, [string, string]> = {
  soldier: ['soldier', 'leaf-squire-idle-s'],
  archer: ['archer', 'forest-archer-s'],
  mage: ['mage', 'star-mage-s'],
  goblin: ['goblin', 'mischief-goblin-s'],
  wolf: ['wolf', 'dusk-wolf-walk-v2-combined-s']
}
// Read the accepted complete source cell; no animation retiming or asset mutation.
function portrait(u: Unit) {
  const [folder, file] = art[u.role]
  return `<span class="portrait" style="background-image:url('${import.meta.env.BASE_URL}tower-defense-art/${folder}/${file}.png')"></span>`
}
function render() {
  const unit = game.units.find((u) => u.id === selected && u.hp > 0),
    legal = unit && !unit.moved && !unit.done ? reachable(game, unit) : new Map()
  cells.forEach((cell, i) => {
    cell.disabled = busy || !ready
    const x = i % size,
      y = Math.floor(i / size),
      k = key(x, y),
      u = game.units.find((u) => u.x === x && u.y === y && u.hp > 0),
      canAttack = unit && u && u.side !== unit.side && !unit.done && distance(unit, u) <= unit.range
    cell.className = `cell ${(x + y) % 2 ? 'odd' : ''} ${game.rocks.has(k) ? 'rock' : ''} ${game.groves.has(k) ? 'grove' : ''} ${legal.has(k) && !u ? 'legal' : ''} ${u?.side ?? ''} ${u?.done ? 'done' : ''} ${u && u.id === selected ? 'selected' : ''} ${canAttack ? 'target' : ''}`
    cell.innerHTML = u
      ? `${portrait(u)}<span class="badge">${u.side === 'ally' ? '◆' : '▼'} ${u.hp}</span>${u.armor ? '<span class="armor">⬡</span>' : ''}${u.done ? '<span class="check">✓</span>' : ''}${canAttack ? `<span class="hit">−${damage(unit!, u, game)}</span>` : ''}`
      : `<span class="terrain">${game.rocks.has(k) ? '◆' : game.groves.has(k) ? '♣' : legal.has(k) ? '◇' : ''}</span>`
    cell.setAttribute(
      'aria-label',
      `${x + 1},${y + 1} ${u ? `${u.name} HP ${u.hp} ${u.done ? '行動済' : ''}${canAttack ? ` 攻撃 ${damage(unit!, u, game)} ダメージ` : ''}` : game.rocks.has(k) ? '岩' : game.groves.has(k) ? '木立' : '平地'}${legal.has(k) && !u ? ' 移動可能' : ''}`
    )
  })
  document.querySelector('#turn')!.textContent =
    `${game.phase === 'enemy' ? '▼ 敵' : game.phase === 'won' ? '✦ 勝利' : game.phase === 'lost' ? '◇ 敗北' : '◆ 味方'} · ${game.turn}`
  document.querySelector('#count')!.textContent =
    `◆ ${game.units.filter((u) => u.side === 'ally' && u.hp > 0).length} / ▼ ${game.units.filter((u) => u.side === 'enemy' && u.hp > 0).length}`
  document.querySelector('#selection')!.textContent = unit
    ? `${unit.name}　♥ ${unit.hp}/${unit.max}　⚔ ${unit.power}　◎ ${unit.range}　◇ ${unit.move}${unit.armor ? `　⬡ ${unit.armor}` : ''}`
    : '燈守を選択'
  document.querySelector('#log')!.textContent = game.log
  ;(document.querySelector('#wait') as HTMLButtonElement).disabled =
    !ready || !unit || unit.done || game.phase !== 'ally'
  ;(document.querySelector('#end') as HTMLButtonElement).disabled = !ready || game.phase !== 'ally'
  const potion = document.querySelector<HTMLButtonElement>('#recover')!
  potion.textContent = `✚ ${game.potions}`
  potion.disabled = !ready || !unit || unit.done || unit.hp >= unit.max || game.potions === 0 || game.phase !== 'ally'
  document.querySelector('#mission')!.textContent = `⚑ ${missions[game.stage].name}`
  const result = document.querySelector<HTMLDivElement>('#result')!
  result.hidden = game.phase !== 'won' && game.phase !== 'lost'
  document.querySelector('#outcome')!.textContent =
    game.phase === 'won'
      ? game.stage === 2
        ? '✦ 遠征達成！ 三つの燈がともった'
        : '✦ 霧が晴れた！'
      : '燈は消えた… ↻ で再挑戦'
  const next = document.querySelector<HTMLButtonElement>('#next')!
  next.hidden = game.phase !== 'won'
  next.textContent = game.stage === 2 ? '最初から遠征 ↻' : '次の任務 ▶'
  audio.setBattle(game.phase === 'ally' || game.phase === 'enemy')
}
async function choose(x: number, y: number) {
  if (busy || !ready) return
  if (game.phase !== 'ally') return
  const target = game.units.find((u) => u.hp > 0 && u.x === x && u.y === y),
    unit = game.units.find((u) => u.id === selected)
  if (target?.side === 'ally') {
    selected = target.id
    game.log =
      target.role === 'archer'
        ? '弓：狼に +3 · 射程 3'
        : target.role === 'mage'
          ? '魔法：装甲を無視 · 射程 2'
          : '剣：ゴブリンに +1 · 射程 1'
  } else if (unit) {
    const before = snapshot(game)
    let changed = false
    if (target) {
      if (attack(game, unit, target)) changed = true
      else game.log = `${target.name} ⚔ ${target.power} ◎ ${target.range}${target.armor ? ' ⬡ 2' : ''} · 射程外です`
    } else if (move(game, unit, x, y)) changed = true
    else game.log = 'そのマスには移動できません'
    if (changed) {
      const token = generation
      lockPresentation()
      await animation.present(game, before, unit)
      if (token !== generation) return
      busy = false
    }
  } else if (target)
    game.log = `${target.name} ♥ ${target.hp}/${target.max} ⚔ ${target.power} ◎ ${target.range}${target.armor ? ' ⬡ 2' : ''}`
  render()
}
async function end() {
  if (busy || !ready || !beginEnemy(game)) return
  selected = undefined
  const token = generation
  render()
  for (const u of game.units.filter((u) => u.side === 'enemy' && u.hp > 0)) {
    await new Promise((r) => setTimeout(r, 450))
    if (token !== generation) return
    const before = snapshot(game)
    enemyStep(game, u)
    lockPresentation()
    await animation.present(game, before, u)
    if (token !== generation) return
    busy = false
    render()
    if (game.phase !== 'enemy') return
  }
  beginAlly(game)
  render()
}
document.querySelector('#end')!.addEventListener('click', () => void end())
document.querySelector('#wait')!.addEventListener('click', () => {
  const u = game.units.find((u) => u.id === selected)
  if (!busy && u && game.phase === 'ally') {
    u.done = true
    game.log = `${u.name} 待機`
    selected = undefined
    render()
  }
})
document.querySelector('#restart')!.addEventListener('click', () => {
  generation++
  animation.cancel()
  busy = false
  game = createGame(game.stage, game.formation)
  audio.start()
  selected = undefined
  render()
})
document.querySelector('#recover')!.addEventListener('click', () => {
  const u = game.units.find((u) => u.id === selected)
  if (!busy && u && recover(game, u)) {
    audio.cue('healer')
    render()
  }
})
document.querySelector('#sound')!.addEventListener('click', () => {
  const enabled = audio.toggle()
  const button = document.querySelector('#sound')!
  button.textContent = enabled ? '♫' : '♫×'
  button.setAttribute('aria-pressed', String(enabled))
  button.setAttribute('aria-label', enabled ? '音を無効にする' : '音を有効にする')
})
function startMission(stage: number) {
  generation++
  animation.cancel()
  busy = false
  selected = undefined
  const formation = document.querySelector<HTMLInputElement>('input[name="formation"]:checked')!.value as
    | 'balanced'
    | 'guard'
  game = createGame(stage, formation)
  render()
  audio.start()
}
const expedition = document.querySelector<HTMLDialogElement>('#expedition')!
document.querySelector('#missions')!.innerHTML = missions
  .map((m, i) => `<button data-stage="${i}"><strong>${m.name}</strong><small>${m.hint}</small></button>`)
  .join('')
document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(
  (button) =>
    (button.onclick = () => {
      startMission(Number(button.dataset.stage))
      expedition.close()
    })
)
document.querySelector('#mission')!.addEventListener('click', () => expedition.showModal())
document.querySelector('#cancel-mission')!.addEventListener('click', () => expedition.close())
document.querySelector('#next')!.addEventListener('click', () => startMission((game.stage + 1) % 3))
const dialog = document.querySelector('dialog')!
document.querySelector('#help')!.addEventListener('click', () => dialog.showModal())
document.querySelector('#close')!.addEventListener('click', () => dialog.close())
render()

// Keep the complete field visible; only battle actions wait for decoded assets.
const preparation = document.createElement('div')
preparation.className = 'preparation'
preparation.innerHTML = '<span role="status" aria-live="polite"></span><button hidden>再試行</button>'
document.querySelector('.field')!.append(preparation)
const retry = preparation.querySelector('button')!
retry.onclick = () => void prepareBattle()
async function prepareBattle() {
  retry.hidden = true
  const status = preparation.querySelector('span')!
  status.textContent = '戦闘の準備中…'
  try {
    const results = await Promise.allSettled([
      animation.prepare((done, total) => {
        status.textContent = `戦闘の準備 ${Math.round((done / total) * 100)}%`
      }),
      audio.prepare()
    ])
    if (results.some((result) => result.status === 'rejected')) throw new Error('Preparation failed')
    ready = true
    preparation.remove()
    render()
  } catch {
    status.textContent = '素材を読み込めませんでした。接続を確認して再試行してください'
    retry.hidden = false
  }
}
void prepareBattle()
