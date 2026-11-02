import { LaneModels, modelSize, KO_SECONDS } from './models.js'
import { BattleAudio } from './audio.js'
import { BattleClock } from './clock.js'
import { bindUiSounds, playUiSound, warmUpAudio } from '../shared/UiSound.ts'
import {
  STAGES,
  POOPS,
  ENEMIES,
  HOME_X,
  ENEMY_X,
  income,
  typeOf,
  createGame,
  summon,
  upgrade,
  upgradeCost,
  burst,
  step,
  reach,
  WALK_PACE,
  BURST_COOLDOWN
} from './simulation.js'
import { SLOTS, MAX_LEVEL, expToNext, load, save, erase, deckOf, toggle, buy, settle } from './campaign.js'
const $ = (id) => document.getElementById(id)
const canvas = document.querySelector('#field canvas'),
  ctx = canvas.getContext('2d')
const dialog = document.querySelector('dialog')
const SPLAT_SECONDS = 0.22
/** Shot looks by shooter: fill, edge and radius. */
const SHOTS = {
  pellet: ['#6b3c1c', '#3d200c', 6],
  korokoro: ['#4a2810', '#2a1608', 7],
  water: ['#e9f7ffcc', '#4c9ad0', 6],
  turret: ['#e9f7ffcc', '#4c9ad0', 9],
  bichi: ['#a0703e', '#5e3a1c', 7],
  aircon: ['#e6f7ffdd', '#7cc8f0', 8],
  sake: ['#f2fff5dd', '#5f9e70', 5],
  garlic: ['#e3ee8cdd', '#93a53e', 9],
  energy: ['#dcff86dd', '#6f9a1c', 5],
  sayu: ['#ffffffdd', '#aab8bf', 6],
  seichou: ['#fff1f6dd', '#e07aa0', 6]
}
/** Screen-space splash only; the simulation owns recipient, arrival and damage. Poop hits splat brown, cleanup hits splash blue. */
function drawContact(effect, y, age, aspect) {
  if (age < 0 || age > SPLAT_SECONDS) return
  const t = age / SPLAT_SECONDS
  const size = effect.crit ? 1.7 : effect.splash ? 1.4 : 1
  ctx.save()
  ctx.globalAlpha = 1 - t * t
  ctx.translate(effect.x + (effect.dx ?? 0), y)
  ctx.scale(size, aspect * size)
  const shot = effect.ranged && !effect.turret && SHOTS[effect.source?.key]
  ctx.fillStyle = effect.crit ? '#e8a23a' : shot ? shot[0] : effect.side === -1 ? '#bfe6ff' : '#7a4722'
  ctx.beginPath()
  ctx.arc(0, 0, 9 * (1 - t) + 3, 0, 7)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4
    ctx.moveTo(Math.cos(a) * 30 * t, Math.sin(a) * 22 * t)
    ctx.arc(Math.cos(a) * 30 * t, Math.sin(a) * 22 * t, 4.5 * (1 - t) + 1, 0, 7)
  }
  ctx.fill()
  ctx.restore()
}
const models = new LaneModels()
let campaign = load()
let selected = Math.min(campaign.cleared, STAGES.length - 1)
const seed = () => Math.floor(Math.random() * 2 ** 31)
let state = createGame(selected, deckOf(campaign), seed()),
  paused = true,
  shown = false
const clock = new BattleClock()
const audio = new BattleAudio()
let muted = false
const heard = new WeakSet()
const heardImpacts = new WeakSet()
const fallen = []
let reconciling = false
let catchupScheduled = false
function tone(kind) {
  if (!document.hidden && !reconciling) audio.effect(kind)
}
function syncAudio() {
  audio.setRunning(!paused && !document.hidden)
}
document.addEventListener('visibilitychange', () => {
  tick(performance.now())
  syncAudio()
})
document.addEventListener('pointerdown', () => audio.unlock(), { once: true })
document.addEventListener('keydown', () => audio.unlock(), { once: true })
bindUiSounds(document, (kind) => !muted && !document.hidden && playUiSound(kind, audio.context))
warmUpAudio()
/** A short pop on the control that just acted; the sound already confirms it. */
const calm = matchMedia('(prefers-reduced-motion: reduce)')
const pop = (button) =>
  calm.matches || button.animate([{ scale: 1.08 }, { scale: 1 }], { duration: 160, easing: 'ease-out' })
$('sound').onclick = () => {
  muted = !muted
  audio.muted = muted
  if (!muted) audio.unlock()
  syncAudio()
  $('sound').textContent = muted ? '♪̸' : '♪'
  $('sound').setAttribute('aria-pressed', String(muted))
  if (!muted) tone('summon')
}
let buttons = []
function deploy(i) {
  if (!paused && !clock.pending && summon(state, i)) {
    tone('summon')
    pop(buttons[i])
  }
}
function invest() {
  if (!paused && !clock.pending && upgrade(state)) {
    tone('upgrade')
    pop($('upgrade'))
  }
}
/** Summon tray: one card per formation slot, in formation order. */
function buildTray() {
  $('tray').replaceChildren()
  buttons = state.deck.map((d, i) => {
    const b = document.createElement('button')
    b.setAttribute('aria-label', `${d.name}を召喚 ${d.cost}`)
    b.title = `${d.name} Lv.${d.level}`
    b.dataset.sfx = 'none'
    b.classList.toggle('special', d.special)
    b.innerHTML = `<canvas class="portrait" width="128" height="112"></canvas><b>${d.cost} 💩</b><small>Lv.${d.level}</small>`
    b.onclick = () => deploy(i)
    models.portrait(d.key, b.querySelector('canvas'))
    $('tray').append(b)
    return b
  })
}
function start(stage) {
  selected = stage
  state = createGame(stage, deckOf(campaign), seed())
  shown = false
  fallen.length = 0
  glides.clear()
  audio.beat = 0
  buildTray()
  $('stage-name').textContent = `${stage + 1}. ${STAGES[stage].sub}`
  dialog.close()
  $('map').hidden = true
  paused = false
  clock.reset(performance.now())
  tone('summon')
}

// ── ステージ選択: a world map of reached stages, each with its boss standing on it ──
const enemyKinds = (stage) => [...new Set(stage.pattern)].map((i) => ENEMIES[i])
/** The newest enemy of the stage; each restroom's last stage is guarded by its strongest one. */
const bossOf = (i) => {
  const ids = STAGES[i].pattern
  return ENEMIES[i % 6 === 5 ? ids.reduce((a, b) => (ENEMIES[b].hp > ENEMIES[a].hp ? b : a)) : ids.at(-1)]
}
const mapX = (i) => 110 + i * 150
const mapY = (i) => 54 + 15 * Math.sin(i * 1.25)
function el(tag, className, html = '') {
  const e = document.createElement(tag)
  e.className = className
  e.innerHTML = html
  return e
}
function renderStages() {
  $('progress').textContent = `${campaign.cleared} / ${STAGES.length} クリア`
  $('map-coins').textContent = `🧻 ${campaign.coins}`
  // Reached stages plus one silhouetted stage ahead; the rest of the world stays hidden.
  const count = Math.min(campaign.cleared + 2, STAGES.length)
  const width = mapX(count - 1) + 110
  const parts = []
  for (let a = 0; a * 6 < count; a++) {
    const from = a * 6,
      to = Math.min(from + 5, count - 1)
    const band = el('div', 'band', `<span>${STAGES[from].name.replace(/ \d+$/, '')}</span>`)
    band.style.cssText = `left:${mapX(from) - 72}px;width:${mapX(to) - mapX(from) + 144}px;--area:${STAGES[from].color}`
    parts.push(band)
  }
  const points = Array.from({ length: count }, (_, i) => `${mapX(i)},${mapY(i)}`).join(' ')
  const trail = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  trail.setAttribute('class', 'trail')
  trail.setAttribute('viewBox', `0 0 ${width} 100`)
  trail.setAttribute('preserveAspectRatio', 'none')
  trail.setAttribute('aria-hidden', 'true')
  trail.innerHTML = `<polyline points="${points}" /><polyline points="${points}" />`
  parts.push(trail)
  for (let i = 0; i < count; i++) {
    const boss = bossOf(i),
      cleared = i < campaign.cleared,
      sealed = i > campaign.cleared,
      king = i % 6 === 5
    const node = el(
      sealed ? 'span' : 'button',
      `stage${cleared ? ' cleared' : ''}${sealed ? ' sealed' : ''}${king ? ' king' : ''}${i === campaign.cleared ? ' next' : ''}`,
      `<img alt="" src="${models.portraitURL(boss.key)}">` +
        `<b>${king ? '<i aria-hidden="true">👑</i>' : ''}${sealed ? '？' : `${i + 1}${Number.isFinite(campaign.records[i]) ? '★' : ''}`}</b>` +
        `<small>${sealed ? '？？？' : STAGES[i].sub}</small>`
    )
    node.style.cssText = `left:${mapX(i)}px;top:${mapY(i)}%;--area:${STAGES[i].color}`
    if (sealed) node.setAttribute('aria-label', '未解放のステージ')
    else {
      node.dataset.sfx = 'select'
      node.setAttribute(
        'aria-label',
        `ステージ${i + 1} ${STAGES[i].sub} ボス ${boss.name}${cleared ? ' クリア済み' : ''}`
      )
      node.setAttribute('aria-pressed', String(i === selected))
      node.onclick = () => {
        selected = i
        renderStages()
      }
    }
    parts.push(node)
  }
  $('stages').style.width = `${width}px`
  $('stages').replaceChildren(...parts)
  const stage = STAGES[selected],
    best = campaign.records[selected],
    boss = bossOf(selected)
  $('boss').src = models.portraitURL(boss.key)
  $('stage-info').innerHTML =
    `<strong>${selected + 1}. ${stage.sub}</strong><small>${stage.name}${Number.isFinite(best) ? ` · ベスト${best}秒` : ''}</small>` +
    `<span class="foes">ボス ${boss.name} ・ 敵 ${enemyKinds(stage)
      .map((t) => `<img alt="${t.name}" title="${t.name}" src="${models.portraitURL(t.key)}">`)
      .join('')}</span><small>${stage.hint}</small>`
}
function showMap() {
  dialog.close()
  renderStages()
  $('map').hidden = false
  const world = $('world')
  world.scrollLeft = mapX(selected) - world.clientWidth / 2
  $('go').focus()
}
$('close').onclick = showMap
dialog.oncancel = (e) => {
  e.preventDefault()
  showMap()
}
$('go').onclick = () => start(selected)
$('hq').onclick = () => {
  $('map').hidden = true
  $('report').replaceChildren()
  modal('作戦室', '編成を整えて、うんこを買い足そう。')
}
// Mouse wheels scroll the map sideways.
$('world').addEventListener(
  'wheel',
  (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    $('world').scrollLeft += e.deltaY
    e.preventDefault()
  },
  { passive: false }
)

// ── 作戦室 (between battles): formation, shop ──
const statLine = (e) => `HP${e.hp} 攻${e.atk} 速${e.spd}`
function renderRoster() {
  $('slots').textContent = `${campaign.loadout.length} / ${SLOTS}`
  const order = (e) => (typeOf(e.key).special ? 100 - e.uid / 1000 : POOPS.findIndex((t) => t.key === e.key))
  const roster = [...campaign.roster].sort((a, b) => order(a) - order(b))
  $('roster').replaceChildren(
    ...roster.map((e) => {
      const t = typeOf(e.key)
      const slot = campaign.loadout.indexOf(e.uid)
      const b = document.createElement('button')
      b.dataset.sfx = 'select'
      b.className = t.special ? 'unit special' : 'unit'
      b.setAttribute('aria-pressed', String(slot >= 0))
      b.setAttribute('aria-label', `${t.name} Lv.${e.level}${slot >= 0 ? ' 編成中' : ''}`)
      b.title = t.line
      const exp = e.level >= MAX_LEVEL ? 1 : e.exp / expToNext(e.level)
      b.innerHTML = `<img alt="" src="${models.portraitURL(e.key)}"><span><strong>${t.name}</strong>${t.special ? '<em>特殊</em>' : ''}<small>Lv.${e.level} · ${t.cost}💩</small><small>${statLine(e)}</small><i style="--x:${exp}"></i></span>${slot >= 0 ? `<b class="slot">${slot + 1}</b>` : ''}`
      b.onclick = () => {
        if (toggle(campaign, e.uid)) {
          save(campaign)
          renderRoster()
        }
      }
      return b
    })
  )
}
function renderShop() {
  $('coins').textContent = `🧻 ${campaign.coins}`
  const items = POOPS.filter((t) => !campaign.roster.some((e) => e.key === t.key))
  $('shop').replaceChildren(
    ...items.map((t) => {
      const b = document.createElement('button')
      const locked = campaign.cleared < t.unlock
      b.dataset.sfx = 'confirm'
      b.className = 'unit'
      b.disabled = locked || campaign.coins < t.price
      b.setAttribute('aria-label', `${t.name}を購入 ${t.price}`)
      b.innerHTML = `<img alt="" src="${models.portraitURL(t.key)}"><span><strong>${t.name}</strong><small>${locked ? `ステージ${t.unlock}クリアで解禁` : `🧻 ${t.price}`}</small><small>${t.line}</small></span>`
      b.onclick = () => {
        if (buy(campaign, t.key)) {
          save(campaign)
          tone('upgrade')
          renderHQ()
        }
      }
      return b
    })
  )
  $('shop-section').hidden = !items.length
}
function renderHQ() {
  renderRoster()
  renderShop()
}
$('erase').onclick = () => {
  if (!confirm('セーブデータを消して最初から始めますか？')) return
  campaign = erase()
  selected = 0
  $('report').replaceChildren()
  renderHQ()
}
function describe(ups) {
  if (!ups.length) return ''
  const total = { hp: 0, atk: 0, spd: 0 }
  for (const u of ups) for (const k in total) total[k] += u[k]
  const parts = [total.hp && `HP+${total.hp}`, total.atk && `攻+${total.atk}`, total.spd && `速+${total.spd}`].filter(
    Boolean
  )
  return ` Lv.${ups[0].from}→${ups[0].from + ups.length} ${parts.length ? parts.join(' ') : '成長なし…'}`
}
function showReport(report) {
  const lines = []
  if (report.coins) lines.push(`🧻 +${report.coins}`)
  if (report.special) {
    const t = typeOf(report.special.key)
    lines.push(
      `<img alt="" src="${models.portraitURL(t.key)}"><strong>新しい仲間！ ${t.name}</strong>（特殊ユニット HP${report.special.hp} 攻${report.special.atk}）${t.line}`
    )
  }
  for (const u of report.units) {
    const t = typeOf(u.key)
    lines.push(`${t.name} +${u.exp}EXP${describe(u.ups)}`)
  }
  $('report').replaceChildren(
    ...lines.map((html) => {
      const li = document.createElement('li')
      li.innerHTML = html
      return li
    })
  )
}
function modal(title, message) {
  paused = true
  clock.reset(performance.now())
  syncAudio()
  $('title').textContent = title
  $('message').textContent = message
  renderHQ()
  dialog.showModal()
  dialog.querySelector('.sheet').scrollTop = 0
}
/** Keyboard-only pause (Space); the battlefield has no pause button. */
function togglePause() {
  tick(performance.now())
  if (dialog.open || !$('map').hidden || clock.pending) return
  paused = !paused
  clock.reset(performance.now())
  syncAudio()
}
$('upgrade').onclick = () => {
  invest()
}
$('burst').onclick = () => {
  if (!paused && !clock.pending && burst(state)) {
    tone('burst')
    pop($('burst'))
  }
}
window.addEventListener('keydown', (e) => {
  if (dialog.open || !$('map').hidden || clock.pending) return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePause()
  }
  if (!paused) {
    const n = Number(e.key)
    if (n >= 1 && n <= SLOTS) deploy(n - 1)
    if (e.key.toLowerCase() === 'u') invest()
  }
})
/** Draws `paint(x)` mirrored around x, so the forts face each other across the lane. */
function mirrored(x, paint) {
  ctx.save()
  ctx.translate(2 * x, 0)
  ctx.scale(-1, 1)
  paint(x)
  ctx.restore()
}
/** The player's fort: a giant swirl with a flag on top. */
function drawPoopTower(x) {
  ctx.fillStyle = '#3a241444'
  ctx.beginPath()
  ctx.ellipse(x, 372, 60, 12, 0, 0, 7)
  ctx.fill()
  for (const [y, rx, ry] of [
    [340, 52, 30],
    [298, 40, 24],
    [263, 28, 19],
    [237, 15, 13]
  ]) {
    ctx.fillStyle = '#6e3f1e'
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#9a6136'
    ctx.beginPath()
    ctx.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.45, ry * 0.3, 0, 0, 7)
    ctx.fill()
  }
  for (const dx of [-13, 13]) {
    ctx.fillStyle = '#fffaf0'
    ctx.beginPath()
    ctx.ellipse(x + dx, 293, 7, 8, 0, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#2a170a'
    ctx.beginPath()
    ctx.ellipse(x + dx + 2, 295, 3.5, 4.5, 0, 0, 7)
    ctx.fill()
  }
  ctx.strokeStyle = '#2a170a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, 312, 11, 0.2, Math.PI - 0.2)
  ctx.stroke()
  ctx.fillStyle = '#4b2810'
  ctx.fillRect(x - 1, 180, 3, 48)
  ctx.fillStyle = '#ffd166'
  ctx.beginPath()
  ctx.moveTo(x + 2, 180)
  ctx.lineTo(x + 36, 192)
  ctx.lineTo(x + 2, 204)
  ctx.fill()
}
/** The enemy fort: a western toilet the size of a castle, with a ウォシュレット cannon. */
function drawToiletCastle(x) {
  ctx.fillStyle = '#23364444'
  ctx.beginPath()
  ctx.ellipse(x, 372, 62, 12, 0, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#e6eef2'
  ctx.beginPath()
  ctx.roundRect(x - 8, 224, 50, 92, 8)
  ctx.fill()
  ctx.fillStyle = '#cfdbe1'
  ctx.fillRect(x - 12, 218, 58, 12)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(x - 50, 300)
  ctx.lineTo(x + 30, 300)
  ctx.quadraticCurveTo(x + 32, 340, x + 8, 350)
  ctx.lineTo(x + 14, 366)
  ctx.lineTo(x - 26, 366)
  ctx.lineTo(x - 20, 350)
  ctx.quadraticCurveTo(x - 50, 340, x - 50, 300)
  ctx.fill()
  ctx.fillStyle = '#bcd0da'
  ctx.beginPath()
  ctx.ellipse(x - 10, 300, 42, 9, 0, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#7fc4ec'
  ctx.beginPath()
  ctx.ellipse(x - 10, 301, 30, 5, 0, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#9fb6c2'
  ctx.fillRect(x + 22, 238, 14, 5)
  ctx.fillStyle = '#7a8a94'
  ctx.fillRect(x - 58, 292, 16, 7)
  ctx.fillStyle = '#4c9ad0'
  ctx.fillRect(x + 16, 180, 3, 40)
  ctx.beginPath()
  ctx.moveTo(x + 15, 180)
  ctx.lineTo(x - 18, 192)
  ctx.lineTo(x + 15, 204)
  ctx.fill()
}
/** Ground rows: three per side, interleaved so opposing units never stand at the same depth. */
const laneY = (u) => (u.side === 1 ? 356 : 350) + (u.id % 3) * 12
/** How far behind its logical point a unit stands (see LaneModels.offset). */
const standOff = (u) => models.offset(u.key, u.side, 2 - (u.id % 3))
/**
 * Drawn lane x follows the simulation closely but glides through sudden jumps (knockback, 大放屁) on the
 * battle clock, so a knocked-back unit slides instead of teleporting and nothing moves while paused.
 */
const glides = new Map()
function glideX(u) {
  let g = glides.get(u.id)
  if (!g || Math.abs(u.x - g.x) > 300) glides.set(u.id, (g = { x: u.x, t: state.time }))
  g.x += (u.x - g.x) * (1 - Math.exp(-Math.max(0, state.time - g.t) / 0.045))
  g.t = state.time
  return g.x
}
/** Where a unit is drawn along the lane; the simulation keeps its own x. */
const drawX = (u) => glideX(u) + standOff(u)
/**
 * Painter order: back rows first; within a row the unit nearest the enemy comes last, so whoever is
 * fighting stays on top. Each unit gets its own depth slot, so neighbours never cut into each other.
 */
/**
 * Extra lunge (model units) that lands a melee strike on its foe's drawn body: the gap between the striking
 * point on the contact frame and the front of the foe, capped so a strike never becomes a dash.
 */
function contact(u) {
  const { target } = reach(state, u)
  if (!target || u.range > 80) return 0
  const toward = -u.side
  const [ahead, height] = models.strike(u.key)
  const strikeX = drawX(u) + toward * ahead
  const frontX = drawX(target) - toward * models.front(target.key, height / modelSize(target.key))
  const scale = models.presentation[0] * modelSize(u.key)
  return Math.min(0.6, Math.max(-0.15, ((frontX - strikeX) * toward) / scale))
}
function depthSlots(list) {
  const ranked = [...list].sort((a, b) => laneY(a) - laneY(b) || (b.x - a.x) * b.side || a.id - b.id)
  return new Map(ranked.map((u, i) => [u, (i - ranked.length / 2) * 150]))
}
/** Seconds until a walking unit reaches its foe, so the renderer can wind up its first strike in stride. */
function lead(u) {
  if (u.motion !== 'walk') return Infinity
  const { target, gap } = reach(state, u)
  const closing = (u.speed + (target?.motion === 'walk' ? target.speed : 0)) * WALK_PACE
  return Math.max(0, gap) / closing
}
function draw() {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(devicePixelRatio, 2)
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
  }
  ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 450, 0, 0)
  // A tiled restroom: wall, floor and a toilet-paper road unrolled between the two forts. An opaque base
  // first, so anti-aliased seams at fractional pixels never blend in the previous frame.
  ctx.fillStyle = '#b9ac96'
  ctx.fillRect(0, 0, 1000, 450)
  ctx.fillStyle = STAGES[state.stage].color
  ctx.fillRect(0, 0, 1000, 320)
  ctx.strokeStyle = '#ffffff66'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= 1000; x += 50) ctx.rect(x, -2, 50, 322)
  for (let y = 20; y < 320; y += 50) ctx.rect(-2, y, 1004, 50)
  ctx.stroke()
  for (let i = 0; i < 4; i++) {
    const x = 170 + i * 180
    ctx.fillStyle = '#00000014'
    ctx.beginPath()
    ctx.roundRect(x, 140, 120, 180, [14, 14, 0, 0])
    ctx.fill()
    ctx.fillStyle = '#ffffff55'
    ctx.beginPath()
    ctx.arc(x + 20, 235, 5, 0, 7)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff40'
  for (let i = 0; i < 9; i++) {
    ctx.beginPath()
    ctx.arc(
      1000 - (((i * 137 + state.time * 9) % 1040) - 20),
      120 - ((i * 53 + state.time * 14) % 110),
      4 + (i % 3) * 3,
      0,
      7
    )
    ctx.fill()
  }
  ctx.fillStyle = '#8f7f6a'
  ctx.fillRect(0, 312, 1000, 10)
  for (let x = 0; x < 1000; x += 60)
    for (let y = 322; y < 450; y += 32) {
      ctx.fillStyle = (x / 60 + (y - 322) / 32) % 2 ? '#d9cfbd' : '#b9ac96'
      ctx.fillRect(x, y, 60, 32)
    }
  ctx.fillStyle = '#fbf8ee'
  ctx.beginPath()
  ctx.moveTo(0, 355)
  ctx.quadraticCurveTo(500, 320, 1000, 355)
  ctx.lineTo(1000, 425)
  ctx.quadraticCurveTo(500, 385, 0, 425)
  ctx.fill()
  ctx.strokeStyle = '#cfc7b4'
  ctx.setLineDash([3, 5])
  ctx.beginPath()
  for (let x = 70; x < 1000; x += 70) {
    const top = 355 - (70 * x * (1000 - x)) / 1e6,
      bottom = 425 - (80 * x * (1000 - x)) / 1e6
    ctx.moveTo(x, top + 3)
    ctx.lineTo(x, bottom - 3)
  }
  ctx.stroke()
  ctx.setLineDash([])
  mirrored(HOME_X, drawPoopTower)
  mirrored(ENEMY_X, drawToiletCastle)
  for (const [x, hp, max] of [
    [HOME_X, state.home, STAGES[state.stage].home],
    [ENEMY_X, state.enemy, STAGES[state.stage].enemy]
  ]) {
    ctx.fillStyle = '#3a2414'
    ctx.fillRect(x - 39, 211, 78, 8)
    ctx.fillStyle = x === HOME_X ? '#ffd166' : '#7fd1ff'
    ctx.fillRect(x - 39, 211, (78 * hp) / max, 8)
  }
  const scale = rect.width < 500 ? 180 : 120
  const aspect = rect.width / 1000 / (rect.height / 450)
  models.setPresentation(scale, aspect, rect.width / 1000)
  const units = [...state.units].sort((a, b) => a.id - b.id)
  const depth = depthSlots([...fallen, ...units])
  for (const ghost of fallen) models.fallen(ghost, drawX(ghost), laneY(ghost), depth.get(ghost), state.time - ghost.at)
  for (const u of units) {
    const y = laneY(u)
    ctx.fillStyle = u.side === 1 ? '#5a361a55' : '#4c9ad055'
    ctx.beginPath()
    ctx.ellipse(drawX(u), y + 2, 22 * modelSize(u.key), 6, 0, 0, 7)
    ctx.fill()
    models.unit(u, drawX(u), y, depth.get(u), state.time, lead(u), contact(u))
  }
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  for (const u of units) {
    const top = laneY(u) - (scale * 0.8 * modelSize(u.key) * (rect.width / 1000)) / (rect.height / 450)
    const x = drawX(u)
    // Health shows once a unit is hurt, beneath the characters so a bar never covers a face.
    if (u.hp < u.maxHp) {
      ctx.fillStyle = '#3a2414'
      ctx.fillRect(x - 18, top, 36, 4)
      ctx.fillStyle = u.side === 1 ? '#ffd166' : '#7fd1ff'
      ctx.fillRect(x - 18, top, 36 * Math.max(0, u.hp / u.maxHp), 4)
    }
    if (u.slowUntil > state.time) {
      ctx.save()
      ctx.translate(x + 24, top + 3)
      ctx.scale(1, aspect)
      ctx.fillStyle = '#5ab8ff'
      ctx.fillText('❄', 0, 0)
      ctx.restore()
    }
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(models.render(canvas.width, canvas.height), 0, 0)
  ctx.restore()
  for (const e of state.effects) {
    if (e.blast) {
      // The big fart: a green cloud billowing out over the right (home) half.
      const t = 1 - e.life / 0.6
      ctx.save()
      ctx.globalAlpha = 0.55 * (1 - t)
      ctx.fillStyle = '#9ccf5a'
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        ctx.beginPath()
        ctx.ellipse(
          e.x + Math.cos(a) * 230 * t,
          350 + Math.sin(a) * 60 * t,
          40 + 50 * t,
          (40 + 50 * t) * aspect,
          0,
          0,
          7
        )
        ctx.fill()
      }
      ctx.restore()
    } else if (e.ranged) {
      const source = e.source
      // Shots leave the shooter's own emitter (hand, bottle mouth, nozzle…) as posed on the release frame.
      const [dx, dy] = source?.key ? models.muzzle(source.key, source.side, source.period) : [0, 0]
      const fromX = e.turret ? e.from : (source?.key ? drawX(source) - source.x : 0) + e.from + dx
      const fromY = e.turret ? 296 : laneY(source ?? { id: 0 }) + dy
      const targetY = e.targetY ?? fromY
      const progress = e.arrived ? 1 : Math.min(0.999, Math.max(0, (state.time - e.releasedAt) / 0.12))
      if (progress < 1) {
        // The shooter's own shot (pellet, cold puff, sake, stink, fizz, water, powder) lobbed in a small arc.
        const x = fromX + (e.x + (e.dx ?? 0) - fromX) * progress
        const yShot = fromY + (targetY - fromY) * progress - Math.sin(progress * Math.PI) * 14
        const [fill, edge, radius] =
          SHOTS[e.turret ? 'turret' : source?.key] ?? (e.side === -1 ? SHOTS.water : SHOTS.pellet)
        ctx.save()
        ctx.translate(x, yShot)
        ctx.scale(1, aspect)
        ctx.beginPath()
        ctx.arc(0, 0, radius, 0, 7)
        ctx.fillStyle = fill
        ctx.fill()
        // A glint, like the pellet still in a thrower's hand.
        ctx.save()
        ctx.beginPath()
        ctx.arc(-radius * 0.35, -radius * 0.35, radius * 0.28, 0, 7)
        ctx.fillStyle = '#ffffffb0'
        ctx.fill()
        ctx.restore()
        ctx.strokeStyle = edge
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      } else if (e.arrived && !e.missed) {
        drawContact(e, targetY, state.time - e.releasedAt - 0.12, aspect)
      }
    } else {
      drawContact(e, e.targetY ?? 361 - 30 * aspect, state.time - e.releasedAt, aspect)
    }
  }
  $('gold').textContent = Math.floor(state.gold)
  $('rate').textContent = `+${income(state)}/s · Lv.${state.level}`
  $('home').textContent = `${Math.ceil(state.home)} / ${STAGES[state.stage].home}`
  $('enemy').textContent = `${Math.ceil(state.enemy)} / ${STAGES[state.stage].enemy}`
  $('clock').textContent = `${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`
  const alert = state.alert && state.time - state.alert.at < 2.5 ? state.alert.text : ''
  $('notice').textContent = paused ? 'Ⅱ' : alert
  $('notice').classList.toggle('paused', paused || !!alert)
  buttons.forEach((b, i) => {
    const d = state.deck[i]
    b.disabled = paused || state.gold < d.cost || state.cooldowns[i] > 0
    // Recharge shade: the remaining share of the cooldown darkens the card from the top.
    b.style.setProperty('--cd', state.cooldowns[i] / d.cooldown)
  })
  $('upgrade').disabled = paused || state.level >= 5 || state.gold < upgradeCost(state)
  $('upgrade').querySelector('b').textContent = state.level >= 5 ? 'MAX' : `${upgradeCost(state)} 💩`
  $('burst').disabled = paused || state.burst > 0
  $('burst').style.setProperty('--cd', state.burst / BURST_COOLDOWN)
  $('burst').querySelector('b').textContent = state.burst > 0 ? String(Math.ceil(state.burst)) : ''
}
function finish() {
  const report = settle(campaign, state, Math.random)
  save(campaign)
  const last = state.stage === STAGES.length - 1
  if (report.victory) selected = Math.min(state.stage + 1, campaign.cleared, STAGES.length - 1)
  showReport(report)
  const message = report.victory
    ? last
      ? '黄金の便器城、陥落！全30ステージ踏破！育てた軍団で好きなステージに再挑戦できます。'
      : `${Math.floor(state.time)}秒 · ${state.kills}体撃退。次のトイレが待っている。`
    : `${Math.floor(state.time)}秒 · ${state.kills}体撃退。倒した分の経験値は残ります。編成を見直すか、前のステージで鍛えよう。`
  modal(report.victory ? `${STAGES[state.stage].sub}、大惨事！` : 'うんこ塔が流された…', message)
  tone(state.result)
}
function tick(now) {
  reconciling = clock.pending > 0 || (clock.last !== null && now - clock.last > 250)
  const previous = state.units.map((u) => ({ ...u }))
  const elapsed = clock.advance(
    now,
    !paused && !state.result,
    (dt) => step(state, dt),
    () => !!state.result
  )
  if (!paused) {
    for (const u of previous) if (!state.units.some((v) => v.id === u.id)) fallen.push({ ...u, at: state.time })
    while (fallen.length && state.time - fallen[0].at > KO_SECONDS) fallen.shift()
    let impact = false,
      shot = false
    for (const effect of state.effects)
      if (!heard.has(effect)) {
        heard.add(effect)
        // Splashes land on the front of the recipient's drawn body, on its own row.
        const target = [...state.units, ...previous].find((u) => u.id === effect.targetId)
        if (target) {
          const rect = canvas.getBoundingClientRect()
          effect.targetY = laneY(target) - 35 * (rect.width / 1000 / (rect.height / 450))
          const height = 35 / (models.presentation[0] * modelSize(target.key))
          effect.dx = standOff(target) - target.side * models.front(target.key, height)
        }
        if (effect.ranged) effect.source = { ...[...state.units, ...previous].find((u) => u.id === effect.sourceId) }
        if (!effect.blast) {
          impact ||= !effect.ranged
          shot ||= effect.ranged
        }
      }
    for (const effect of state.effects)
      if (effect.ranged && effect.arrived && !effect.missed && !heardImpacts.has(effect)) {
        heardImpacts.add(effect)
        impact = true
      }
    if (impact) tone('hit')
    if (shot) tone('shot')
  }
  if (audio.running !== (!paused && !document.hidden)) syncAudio()
  audio.tick()
  if (!document.hidden) draw()
  if (state.result && !shown) {
    shown = true
    finish()
  }
  reconciling = false
  if (elapsed.pending && !state.result) {
    $('notice').textContent = '中断中の戦況を計算しています…'
    if (!catchupScheduled) {
      catchupScheduled = true
      setTimeout(() => {
        catchupScheduled = false
        tick(performance.now())
      }, 0)
    }
  }
}
function frame(now) {
  tick(now)
  requestAnimationFrame(frame)
}
// rAF stops for hidden or occluded windows, so a 250ms heartbeat keeps the battle running. A worker's
// timer escapes the main thread's background throttling; the shared clock reconciles whatever is still missed.
try {
  const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 250)']))
  new Worker(url).onmessage = () => tick(performance.now())
} catch {
  setInterval(() => tick(performance.now()), 250)
}
buildTray()
$('stage-name').textContent = `${selected + 1}. ${STAGES[selected].sub}`
modal(
  'うんこ大惨事',
  campaign.cleared
    ? `おかえり、うんこ軍団。${campaign.cleared}ステージ突破済み。編成を整えて次のトイレへ。`
    : 'うんこ軍団を率いて、清掃員・便器・ヨーグルト・薬が守る便器城へ。右のうんこ塔を守りながら左の敵陣へ攻め込もう。ステージを突破するたびに、お腹に悪い特殊ユニットがランダムで仲間になる。敵を倒すと経験値、レベルアップで能力がランダムに伸びる。'
)
requestAnimationFrame(frame)
