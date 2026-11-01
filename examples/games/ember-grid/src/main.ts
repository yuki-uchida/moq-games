import {
  allyTurnOver,
  attack,
  attackRange,
  beginAlly,
  beginEnemy,
  createGame,
  damage,
  distance,
  enemyStep,
  finished,
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
import { BattleAnimation, depth, snapshot } from './animation'
let busy = false
let ready = false
let game = createGame(),
  selected: string | undefined,
  inspected: string | undefined,
  hovered: string | undefined,
  generation = 0
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `<main><header><div><small>EMBER GRID · TACTICAL EXAMPLE</small><h1>燈の境界</h1></div><button id="sound" aria-label="音を有効にする" aria-pressed="false">♫×</button><button id="help" aria-label="遊び方">?</button><button id="restart" aria-label="再プレイ">↻</button></header><section class="status"><button id="mission" aria-label="任務と編成">⚑ 01</button><strong id="turn"></strong><span id="count"></span></section><div class="field"><div id="board" aria-label="戦術盤"></div><div id="result" hidden><p id="outcome"></p><button id="next">次の任務 ▶</button></div></div><section class="console"><div id="selection"></div><div id="log" role="status" aria-live="polite"></div><nav><button id="recover" aria-label="回復薬">✚ 2</button><button id="wait">✓ 待機</button><button id="end">▶ ターン終了</button></nav></section><dialog><h2>霧から燈を守ろう</h2><p>3 つの任務で灰の群れを倒し、燈をつなごう。各任務は敵全滅で勝利、味方全滅で敗北。⚑ から任務と編成を選べます。</p><p>味方を選び、青く光るマスへ移動。赤い敵を選ぶと攻撃。各自 1 回移動・1 回攻撃できます。攻撃すると行動終了。赤いマスは移動後に攻撃が届く範囲。敵に触れるとその敵の移動範囲（くすんだ青）と攻撃範囲（赤）を表示。味方同士はすり抜けられます（止まれるのは空きマスのみ）。</p><p>木立（針葉樹のマス）：受けるダメージ −2。岩：通行不可。攻撃は距離のみで判定し、岩越しにも届きます。反撃なし。弓は狼に +3、剣はゴブリンに +1。盾持ちは物理 −2、魔法は盾を無視します。</p><p>✚ 回復薬：全員共有で任務ごとに 2 個。自分を 8 回復して行動終了。守備隊は HP +4・移動 2、標準隊は移動 3。任務間では全回復します。✓ は選択した味方の待機。▶ で敵のターン（全員が行動を終えると自動で移ります）。敵は接近し、届く相手のうち残 HP の少ない相手を狙います。</p><p>キーボード：Tab でマスを選び Enter。↻ でいつでも再挑戦。</p><button id="close">戻る</button></dialog><dialog id="expedition"><h2>燈をつなぐ遠征</h2><div id="missions"></div><fieldset><legend>編成</legend><label><input type="radio" name="formation" value="balanced" checked> 標準隊 · 移動 3</label><label><input type="radio" name="formation" value="guard"> 守備隊 · HP +4 / 移動 2</label></fieldset><p>任務を選ぶと新しい戦闘を開始します。</p><button id="cancel-mission">戻る</button></dialog></main>`
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
    cell.style.cssText = `--x:${x};--y:${y};z-index:${2 * depth({ x, y }) + 1}`
    cell.onclick = () => choose(x, y)
    cell.onpointerenter = cell.onfocus = () => hover(x, y)
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
// Procedural terrain props (screen-upright, viewBox tile centre at 50,70); no new image assets.
const tree = (x: number, y: number, s: number) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="9" cy="1" rx="17" ry="6" fill="#050c0a" opacity=".5"/><rect x="-2.5" y="-12" width="5" height="13" fill="#3a2618"/><path d="M0-36-19-6H0Z" fill="#3c7048"/><path d="M0-36 19-6H0Z" fill="#1d3a2a"/><path d="M0-52-14-22H0Z" fill="#4c8754"/><path d="M0-52 14-22H0Z" fill="#244632"/><path d="M0-62-8-40H0Z" fill="#6aa064"/><path d="M0-62 8-40H0Z" fill="#2c533a"/><path d="M-1-60-6-44" stroke="#ffc27a" stroke-width="1.4" opacity=".55"/></g>`
const bush = (x: number, y: number) =>
  `<g transform="translate(${x} ${y})"><ellipse cx="4" cy="1" rx="11" ry="4" fill="#050c0a" opacity=".45"/><circle cx="-5" cy="-4" r="6" fill="#2f5a3c"/><circle cx="4" cy="-5" r="7" fill="#24452f"/><circle cx="-2" cy="-8" r="5" fill="#4a7f50"/></g>`
const svg = (part: string, body: string) =>
  `<svg class="prop ${part}" viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`
const groveBack = svg('back', tree(50, 50, 0.95) + tree(22, 64, 0.8) + tree(78, 62, 0.85))
const groveFront = svg('front', bush(32, 88) + bush(70, 86))
const rock = svg(
  'rock',
  '<ellipse cx="56" cy="86" rx="40" ry="11" fill="#030608" opacity=".55"/><path d="M14 80 20 50 42 30 68 32 86 52 88 76 64 94 32 93Z" fill="#3a3e45"/><path d="M20 50 42 30 68 32 60 54 34 58Z" fill="#a3a49f"/><path d="M42 30 52 24 66 27 68 32Z" fill="#c4c0b3"/><path d="M14 80 20 50 34 58 38 92 32 93Z" fill="#70767c"/><path d="M34 58 60 54 64 94 38 92Z" fill="#596068"/><path d="M60 54 68 32 86 52 88 76 64 94Z" fill="#30343b"/><path d="M41 64 48 74 45 86" fill="none" stroke="#ff9a4a" stroke-width="1.6" opacity=".85"/><path d="M28 45 36 41 44 44" fill="none" stroke="#7d8a6a" stroke-width="3" opacity=".7"/>'
)
// Read the accepted complete source cell; no animation retiming or asset mutation.
function portrait(u: Unit) {
  const [folder, file] = art[u.role]
  return `<span class="portrait" style="background-image:url('${import.meta.env.BASE_URL}tower-defense-art/${folder}/${file}.png')"></span>`
}
board.onpointerleave = () => hover(-1, -1)
/** Preview an enemy's move and strike range while it is hovered or focused. */
function hover(x: number, y: number) {
  const id = game.units.find((u) => u.side === 'enemy' && u.hp > 0 && u.x === x && u.y === y)?.id
  if (id === hovered) return
  hovered = id
  if (!busy) render()
}
function render() {
  const unit = game.units.find((u) => u.id === selected && u.hp > 0),
    legal = unit && !unit.moved && !unit.done ? reachable(game, unit) : new Map(),
    foe =
      !unit && game.phase === 'ally'
        ? game.units.find((u) => u.side === 'enemy' && u.hp > 0 && u.id === (hovered ?? inspected))
        : undefined,
    foeMove = foe ? reachable(game, foe) : new Map(),
    reach = unit ? attackRange(game, unit) : foe ? attackRange(game, foe) : new Set<string>()
  cells.forEach((cell, i) => {
    cell.disabled = busy || !ready
    const x = i % size,
      y = Math.floor(i / size),
      k = key(x, y),
      u = game.units.find((u) => u.x === x && u.y === y && u.hp > 0),
      canAttack = unit && u && u.side !== unit.side && !unit.done && distance(unit, u) <= unit.range
    cell.className = `cell ${(x + y) % 2 ? 'odd' : ''} ${game.rocks.has(k) ? 'rock' : ''} ${game.groves.has(k) ? 'grove' : ''} ${legal.has(k) && !u ? 'legal' : ''} ${foeMove.has(k) && !u ? 'enemy-move' : ''} ${reach.has(k) ? 'reach' : ''} ${u?.side ?? ''} ${u && finished(game, u) ? 'done' : ''} ${u && u.id === selected ? 'selected' : ''} ${canAttack ? 'target' : ''}`
    const grove = game.groves.has(k) && !game.rocks.has(k)
    // Billboard layer: undoes the floor projection so props and sprites stand upright.
    cell.innerHTML = `<span class="stand">${game.rocks.has(k) ? rock : ''}${grove ? groveBack : ''}${
      u
        ? `<span class="foot"></span>${portrait(u)}<span class="tag">${u.armor ? '<span class="armor">⬡</span>' : ''}<span class="badge">${u.side === 'ally' ? '◆' : '▼'} ${u.hp}</span>${finished(game, u) ? '<span class="check">✓</span>' : ''}${canAttack ? `<span class="hit">−${damage(unit!, u, game)}</span>` : ''}</span>`
        : ''
    }${grove ? groveFront : ''}</span>`
    cell.setAttribute(
      'aria-label',
      `${x + 1},${y + 1} ${u ? `${u.name} HP ${u.hp} ${u.done ? '行動済' : ''}${canAttack ? ` 攻撃 ${damage(unit!, u, game)} ダメージ` : ''}` : game.rocks.has(k) ? '岩' : game.groves.has(k) ? '木立' : '平地'}${legal.has(k) && !u ? ' 移動可能' : ''}${foeMove.has(k) && !u ? ' 敵の移動範囲' : ''}${reach.has(k) ? ' 攻撃範囲' : ''}`
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
  } else if (target) {
    inspected = target.id
    game.log = `${target.name} ♥ ${target.hp}/${target.max} ⚔ ${target.power} ◎ ${target.range}${target.armor ? ' ⬡ 2' : ''}`
  } else inspected = undefined
  afterAction()
}
/** Hand over to the enemy once every living ally is spent (after the last presentation). */
function afterAction() {
  render()
  if (!allyTurnOver(game)) return
  game.log = '全員行動終了 · 敵のターンへ'
  void end()
}
async function end() {
  if (busy || !ready || !beginEnemy(game)) return
  selected = inspected = undefined
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
    afterAction()
  }
})
document.querySelector('#restart')!.addEventListener('click', () => {
  generation++
  animation.cancel()
  busy = false
  game = createGame(game.stage, game.formation)
  audio.start()
  selected = inspected = undefined
  render()
})
document.querySelector('#recover')!.addEventListener('click', () => {
  const u = game.units.find((u) => u.id === selected)
  if (!busy && u && recover(game, u)) {
    audio.cue('healer')
    afterAction()
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
  selected = inspected = undefined
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
