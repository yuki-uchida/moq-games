import { LaneModels, modelSize, koSeconds, hurtSeconds } from './models.js'
import { BattleAudio } from './audio.js'
import { BattleClock } from './clock.js'
import { heldStrike, timing } from './animation.js'
import { drawArea, drawStatus, drawZones, HURT_VFX, DEATH_VFX } from './visual-effects.js'
import { bindUiSounds, playUiSound } from '../shared/UiSound.ts'
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
  MAX_UNITS,
  BURST_COOLDOWN
} from './simulation.js'
import { createAttract, stepAttract } from './attract.js'
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
  sake: ['#f2ffffdd', '#92cbdc', 5],
  garlic: ['#e3ee8cdd', '#93a53e', 9],
  energy: ['#dcff86dd', '#6f9a1c', 5],
  sayu: ['#ffffffdd', '#aab8bf', 6],
  seichou: ['#fff1f6dd', '#e07aa0', 6]
}
/** Screen-space splash only; the simulation owns recipient, arrival and damage. Poop hits splat brown, cleanup hits splash blue. */
function drawContact(effect, x, y, age, aspect) {
  if (age < 0 || age > SPLAT_SECONDS) return
  const t = age / SPLAT_SECONDS
  const size = effect.crit ? 1.7 : effect.splash ? 1.4 : 1
  ctx.save()
  ctx.globalAlpha = 1 - t * t
  ctx.translate(x, y)
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
let fallen = []
let resultVisual = null
const shotVisuals = new WeakMap()
let visualLast = null
let reconciling = false
let catchupScheduled = false
let capNoticeUntil = 0
const allyCount = () => state.units.filter((unit) => unit.side === 1).length
function tone(kind) {
  if (!document.hidden && !reconciling) audio.effect(kind)
}
function syncAudio() {
  audio.setRunning(!paused && !document.hidden)
}
document.addEventListener('visibilitychange', () => {
  visualLast = null
  if (resultVisual) clock.reset(performance.now())
  tick(performance.now())
  syncAudio()
})
document.addEventListener('pointerdown', () => audio.unlock())
document.addEventListener('touchend', () => audio.unlock())
document.addEventListener('click', () => audio.unlock(), true)
document.addEventListener('keydown', () => audio.unlock())
bindUiSounds(document, (kind) => !muted && !document.hidden && playUiSound(kind, audio.context))
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
  if (!paused && !state.result && !clock.pending && allyCount() >= MAX_UNITS) {
    capNoticeUntil = performance.now() + 2000
    $('notice').textContent = `味方が満員です ${MAX_UNITS}/${MAX_UNITS}`
    return
  }
  if (!paused && !state.result && !clock.pending && summon(state, i)) {
    tone('summon')
    pop(buttons[i])
  }
}
function invest() {
  if (!paused && !state.result && !clock.pending && upgrade(state)) {
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
    b.title = `${d.name} Lv.${d.level}：${d.area} ／ ${d.effect} — ${d.effectLine}`
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
  endTitle()
  selected = stage
  state = createGame(stage, deckOf(campaign), seed())
  shown = false
  resultVisual = null
  fallen.length = 0
  capNoticeUntil = 0
  glides.clear()
  contacts.clear()
  audio.beat = 0
  buildTray()
  $('stage-name').textContent = `${stage + 1}. ${STAGES[stage].sub}`
  dialog.close()
  $('map').hidden = true
  paused = false
  visualLast = null
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
  $('boss').title = `${boss.name}：${boss.effect}`
  $('stage-info').innerHTML =
    `<strong>${selected + 1}. ${stage.sub}</strong><small>${stage.name}${Number.isFinite(best) ? ` · ベスト${best}秒` : ''}</small>` +
    `<span class="foes">ボス ${boss.name} ・ 敵 ${enemyKinds(stage)
      .map((t) => `<img alt="${t.name}" title="${t.name}：${t.effect}" src="${models.portraitURL(t.key)}">`)
      .join('')}</span><small>${stage.hint}</small>`
}
function showMap() {
  endTitle()
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
function showUnitDetail(entry, trigger, shop = false) {
  const type = typeOf(entry.key)
  const detail = document.createElement('dialog')
  detail.className = 'unit-detail'
  detail.setAttribute('aria-labelledby', 'unit-detail-name')
  detail.innerHTML = `<div class="detail-heading"><img alt="" src="${models.portraitURL(entry.key)}"><div><h2 id="unit-detail-name">${type.name}</h2><p>Lv.${entry.level} · ${type.cost}💩<br>${statLine(entry)}</p></div></div>${shop ? `<p>🧻 ${type.price} · ${type.unlock ? `ステージ${type.unlock}クリアで解禁` : '最初から解禁'}</p>` : ''}<p>${type.line}</p><h3>${type.area} ／ ${type.effect}</h3><p>${type.effectLine}</p><button class="detail-close" autofocus>閉じる</button>`
  detail.querySelector('button').onclick = () => detail.close()
  detail.onclick = (event) => {
    const rect = detail.getBoundingClientRect()
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      detail.close()
  }
  detail.onclose = () => {
    detail.remove()
    trigger.focus()
  }
  document.body.append(detail)
  detail.showModal()
}
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
      b.title = `${t.line}：${t.area} ／ ${t.effect} — ${t.effectLine}`
      const exp = e.level >= MAX_LEVEL ? 1 : Math.min(1, e.exp / expToNext(e.level))
      b.innerHTML = `<img alt="" src="${models.portraitURL(e.key)}"><span><strong>${t.name}</strong>${t.special ? '<em>特殊</em>' : ''}<small>Lv.${e.level} · ${t.cost}💩</small><small>${statLine(e)}</small><small>${t.area} ／ ${t.effect}</small><i style="--x:${exp}"></i></span>${slot >= 0 ? `<b class="slot">${slot + 1}</b>` : ''}`
      b.onclick = () => {
        if (toggle(campaign, e.uid)) {
          save(campaign)
          renderRoster()
        }
      }
      const card = document.createElement('div')
      card.className = 'roster-card'
      const info = document.createElement('button')
      info.className = 'unit-info'
      info.setAttribute('aria-label', `${t.name}の詳細`)
      info.textContent = 'ⓘ'
      info.onclick = () => showUnitDetail(e, info)
      card.append(b, info)
      return card
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
      b.title = t.effectLine
      b.innerHTML = `<img alt="" src="${models.portraitURL(t.key)}"><span><strong>${t.name}</strong><small>${locked ? `ステージ${t.unlock}クリアで解禁` : `🧻 ${t.price}`}</small><small>${t.area} ／ ${t.effect}</small></span>`
      b.onclick = () => {
        if (buy(campaign, t.key)) {
          save(campaign)
          tone('upgrade')
          renderHQ()
        }
      }
      const card = document.createElement('div')
      card.className = 'roster-card'
      const info = document.createElement('button')
      info.className = 'unit-info'
      info.setAttribute('aria-label', `${t.name}の詳細`)
      info.textContent = 'ⓘ'
      info.onclick = () => showUnitDetail({ key: t.key, level: 1, hp: t.hp, atk: t.atk, spd: 0 }, info, true)
      card.append(b, info)
      return card
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
      `<img alt="" src="${models.portraitURL(t.key)}"><strong>新しい仲間！ ${t.name}</strong>（特殊ユニット HP${report.special.hp} 攻${report.special.atk}）${t.area} ／ ${t.effect} — ${t.effectLine}`
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
function togglePause() {
  tick(performance.now())
  if (dialog.open || !$('map').hidden || clock.pending) return
  paused = !paused
  visualLast = null
  clock.reset(performance.now())
  syncAudio()
}
$('pause').onclick = togglePause
$('upgrade').onclick = () => {
  invest()
}
$('burst').onclick = () => {
  if (!paused && !state.result && !clock.pending && burst(state)) {
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
const launchHeight = (u, scale, aspect) =>
  u.control?.kind === 'launch' && u.control.end > state.time + (resultVisual?.elapsed ?? 0)
    ? Math.sin(
        (Math.PI * (state.time + (resultVisual?.elapsed ?? 0) - u.control.start)) / (u.control.end - u.control.start)
      ) *
      scale *
      0.8 *
      modelSize(u.key) *
      aspect
    : 0
/** How far behind its logical point a unit stands (see LaneModels.offset). */
const standOff = (u) => models.offset(u.key, u.side, 2 - (u.id % 3))
/**
 * Drawn lane x follows the simulation closely but glides through sudden jumps (knockback, 大放屁) on the
 * battle clock, so a knocked-back unit slides instead of teleporting and nothing moves while paused.
 */
let glides = new Map()
let contacts = new Map()
function glideX(u) {
  let g = glides.get(u.id)
  if (!g || Math.abs(u.x - g.x) > 300) glides.set(u.id, (g = { x: u.x, t: state.time }))
  g.x += (u.x - g.x) * (1 - Math.exp(-Math.max(0, state.time - g.t) / 0.045))
  g.t = state.time
  return g.x
}
/** Where a unit is drawn along the lane; the simulation keeps its own x. */
const drawX = (u) => glideX(u) + standOff(u)
const drawnFront = (u) => ({
  x: drawX(u) - u.side * models.front(u.key, 35 / (models.presentation[0] * modelSize(u.key))),
  y: laneY(u) - launchHeight(u, models.presentation[0] / 0.62, models.presentation[1]) - 35 * models.presentation[1]
})
/**
 * Painter order: back rows first; within a row the unit nearest the enemy comes last, so whoever is
 * fighting stays on top. Each unit gets its own depth slot, so neighbours never cut into each other.
 */
/**
 * Extra lunge (model units) that lands a melee strike on its foe's drawn body: the gap between the striking
 * point on the contact frame and the front of the foe, capped so a strike never becomes a dash.
 */
function contact(u) {
  const target = heldStrike(contacts.get(u.id), u, state.time)?.target ?? reach(state, u).target
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
/** The battlefield canvas for the current scene (the real battle, or the title demo while it is swapped in). */
function drawScene() {
  const visualTime = state.time + (resultVisual?.elapsed ?? 0)
  for (const ghost of fallen) {
    if (!ghost.visualStarted) {
      ghost.visualAge = 0
      ghost.visualStarted = true
    }
    if (resultVisual)
      resultVisual.duration = Math.max(
        resultVisual.duration,
        resultVisual.elapsed +
          Math.max(ghost.flushed ? 0.8 : 0, koSeconds(ghost.key)) -
          ghost.visualAge +
          (calm.matches ? 0.05 : 0.15)
      )
  }
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
  drawZones(ctx, state.zones, visualTime, aspect, calm.matches)
  models.setPresentation(scale, aspect, rect.width / 1000)
  const units = [...state.units].sort((a, b) => a.id - b.id)
  const depth = depthSlots([...fallen, ...units])
  const unitEffects = (layer) => {
    for (const u of units) {
      const age = visualTime - (u.hurt?.at ?? Infinity)
      if (age >= 0 && age < hurtSeconds(u.key)) {
        ctx.save()
        HURT_VFX[u.key]?.(ctx, u, age, layer, drawX(u), laneY(u), aspect)
        ctx.restore()
      }
    }
    for (const ghost of fallen) {
      ctx.save()
      DEATH_VFX[ghost.key]?.(ctx, ghost, ghost.visualAge, layer, drawX(ghost), laneY(ghost), aspect)
      ctx.restore()
    }
  }
  unitEffects('floor')
  const present = new Set([...fallen, ...units].map((u) => u.id))
  for (const id of glides.keys()) if (!present.has(id)) glides.delete(id)
  for (const [id, held] of contacts) {
    const unit = units.find((entry) => entry.id === id)
    if (!unit || !heldStrike(held, unit, visualTime)) contacts.delete(id)
  }
  for (const ghost of fallen) models.fallen(ghost, drawX(ghost), laneY(ghost), depth.get(ghost), ghost.visualAge)
  for (const u of units) {
    const y = laneY(u)
    ctx.fillStyle = u.side === 1 ? '#5a361a55' : '#4c9ad055'
    ctx.beginPath()
    ctx.ellipse(drawX(u), y + 2, 22 * modelSize(u.key), 6, 0, 0, 7)
    ctx.fill()
    if (u.slide && visualTime - u.slide.at < 0.15) {
      ctx.fillStyle = '#c4ae8d99'
      ctx.beginPath()
      ctx.ellipse(drawX(u) + u.side * 15, y, 12, 5 * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    const held = heldStrike(contacts.get(u.id), u, visualTime)
    let visual = held && u.motion === 'walk' ? { ...u, motion: 'attack', phase: visualTime - held.at } : u
    if (resultVisual) {
      const recovery = timing(visual.cycle).recovery
      visual = {
        ...visual,
        phase:
          visual === u && u.motion === 'attack'
            ? Math.min(u.phase + resultVisual.elapsed, Math.max(u.phase, recovery))
            : visual.phase,
        walkDistance: u.walkDistance + (u.motion === 'walk' ? resultVisual.elapsed * u.speed * WALK_PACE : 0)
      }
    }
    models.unit(
      visual,
      drawX(u),
      y - launchHeight(u, scale, aspect),
      depth.get(u),
      visualTime,
      resultVisual ? Infinity : lead(u),
      contact(u),
      y
    )
  }
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  for (const u of units) {
    const y = laneY(u) - launchHeight(u, scale, aspect)
    const top = y - (scale * 0.8 * modelSize(u.key) * (rect.width / 1000)) / (rect.height / 450)
    const x = drawX(u)
    // Health shows once a unit is hurt, beneath the characters so a bar never covers a face.
    if (u.hp < u.maxHp) {
      ctx.fillStyle = '#3a2414'
      ctx.fillRect(x - 18, top, 36, 4)
      ctx.fillStyle = u.side === 1 ? '#ffd166' : '#7fd1ff'
      ctx.fillRect(x - 18, top, 36 * Math.max(0, u.hp / u.maxHp), 4)
    }
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(models.render(canvas.width, canvas.height), 0, 0)
  ctx.restore()
  unitEffects('above')
  for (const ghost of fallen) {
    const age = ghost.visualAge
    if (!ghost.flushed || age < 0 || age >= 0.8) continue
    ctx.save()
    ctx.translate(ghost.x, laneY(ghost))
    ctx.scale(1, aspect)
    ctx.globalAlpha = 1 - age / 0.8
    ctx.strokeStyle = '#a6eaff'
    ctx.lineWidth = 3
    for (let ring = 0; ring < 3; ring++) {
      ctx.beginPath()
      ctx.ellipse(
        0,
        -ring * 4,
        10 + ring * 8 + age * 10,
        3 + ring * 2,
        0,
        age * 7 + ring,
        age * 7 + ring + Math.PI * 1.7
      )
      ctx.stroke()
    }
    ctx.beginPath()
    for (let point = 0; point <= 36; point++) {
      const angle = point * 0.5 + age * 8
      const radius = 2 + point * 0.55
      if (!point) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.3)
      else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.3 - point * age * 1.5)
    }
    ctx.stroke()
    ctx.restore()
  }
  for (const unit of units) {
    const age = visualTime - (unit.control?.end ?? 0)
    if (unit.control?.kind !== 'launch' || age < 0 || age >= 0.3) continue
    ctx.save()
    ctx.globalAlpha = 1 - age / 0.3
    ctx.fillStyle = unit.side === 1 ? '#bb8a50' : '#79aabd'
    for (let index = 0; index < (calm.matches ? 3 : 6); index++) {
      ctx.beginPath()
      ctx.ellipse(
        drawX(unit) + (index - 2.5) * (5 + age * 25),
        laneY(unit) - age * 8,
        5 + age * 10,
        (3 + age * 7) * aspect,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    ctx.restore()
  }
  for (const u of units) {
    const y = laneY(u) - launchHeight(u, scale, aspect)
    const top = y - (scale * 0.8 * modelSize(u.key) * (rect.width / 1000)) / (rect.height / 450)
    drawStatus(ctx, u, drawX(u), y, top, visualTime, aspect, calm.matches)
  }
  for (const e of state.effects) {
    if (e.cancelled) continue
    if (resultVisual && resultVisual.elapsed >= e.life) continue
    const source = e.source
    const [dx, dy] = source?.key ? models.muzzle(source.key, source.side, source.cycle ?? source.period) : [0, 0]
    const liveShooter = e.ranged && !e.turret && [...units, ...fallen].find((unit) => unit.id === e.sourceId)
    let fromX = e.turret
      ? e.from
      : (liveShooter ? drawX(liveShooter) : e.from + (source?.key ? standOff(source) + (e.releaseGlide ?? 0) : 0)) + dx
    let fromY = e.turret ? 296 : laneY(liveShooter || source || { id: 0 }) + dy
    if (e.ranged) {
      if (!shotVisuals.has(e)) shotVisuals.set(e, { fromX, fromY, x: fromX })
      ;({ fromX, fromY } = shotVisuals.get(e))
    }
    if (!e.blast && !e.turret)
      drawArea(
        ctx,
        e,
        typeOf(e.attackerKey),
        [...units, ...fallen],
        visualTime,
        aspect,
        calm.matches,
        { x: fromX, y: fromY },
        laneY,
        drawnFront
      )
    if (e.blast) {
      // The big fart: a green cloud billowing out over the right (home) half.
      const t = 1 - (e.life - (resultVisual?.elapsed ?? 0)) / 0.6
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
      // Shots leave the shooter's own emitter (hand, bottle mouth, nozzle…) as posed on the release frame and
      // home on the target's drawn front, following it if it is knocked back or falls mid-flight.
      const target = [...units, ...fallen].find((unit) => unit.id === e.targetId)
      const front = target ? drawnFront(target) : { x: e.x + (e.dx ?? 0), y: e.targetY ?? fromY }
      const targetY = front.y
      const progress = e.arrived ? 1 : Math.min(0.999, Math.max(0, (visualTime - e.releasedAt) / 0.12))
      if (progress < 1 && !['aircon', 'yoshiki'].includes(e.attackerKey)) {
        // The shooter's own shot (pellet, cold puff, sake, stink, fizz, water, powder) lobbed in a small arc.
        const shot = shotVisuals.get(e)
        const candidate = fromX + (front.x - fromX) * progress
        const x = front.x >= shot.x ? Math.max(shot.x, candidate) : Math.min(shot.x, candidate)
        shot.x = x
        const yShot = fromY + (targetY - fromY) * progress - Math.sin(progress * Math.PI) * 14
        const [fill, edge, radius] =
          SHOTS[e.turret ? 'turret' : source?.key] ?? (e.side === -1 ? SHOTS.water : SHOTS.pellet)
        ctx.save()
        ctx.translate(x, yShot)
        ctx.scale(1, aspect)
        ctx.fillStyle = fill
        ctx.strokeStyle = edge
        ctx.lineWidth = 1.5
        if (['sake', 'energy'].includes(e.attackerKey)) {
          const count = calm.matches ? 3 : 6
          for (let index = 0; index < count; index++) {
            const offset = index * 6
            ctx.beginPath()
            ctx.arc(
              e.side * offset,
              Math.sin(index * 2 + progress * 5) * 3,
              radius * (0.4 + (source?.ramp ?? 0) * 0.08),
              0,
              7
            )
            ctx.fill()
            ctx.stroke()
          }
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, radius, 0, 7)
          ctx.fill()
          ctx.stroke()
          if (e.attackerKey === 'korokoro') {
            // A glint, like the pellet still in a thrower's hand.
            ctx.beginPath()
            ctx.arc(-radius * 0.35, -radius * 0.35, radius * 0.28, 0, 7)
            ctx.fillStyle = '#ffffffb0'
            ctx.fill()
          }
          if (['garlic', 'sayu'].includes(e.attackerKey)) {
            for (let index = 0; index < (calm.matches ? 2 : 4); index++) {
              ctx.beginPath()
              const trailX = e.side * (12 + index * 7)
              if (e.attackerKey === 'garlic') {
                ctx.moveTo(trailX, -5)
                ctx.bezierCurveTo(trailX - 4, -1, trailX + 4, 1, trailX, 5)
              } else ctx.arc(trailX, -4 - (index % 2) * 5, 2 + index, 0, 7)
              ctx.stroke()
            }
          }
          if (e.attackerKey === 'seichou') {
            for (let index = 0; index < (calm.matches ? 2 : 4); index++) {
              ctx.beginPath()
              ctx.arc((index - 1.5) * 5, (index % 2) * 5 - 3, 4, 0, 7)
              ctx.fill()
            }
          }
        }
        ctx.restore()
      } else if (e.turret && e.arrived && !e.missed) {
        drawContact(e, front.x, targetY, visualTime - e.releasedAt - 0.12, aspect)
      }
    }
  }
}
function draw() {
  drawScene()
  drawHud()
}
/** Header, notice, tray and buttons: always the real battle's, never the title demo's. */
function drawHud() {
  $('gold').textContent = Math.floor(state.gold)
  const allies = allyCount()
  const full = allies >= MAX_UNITS
  if (!full) capNoticeUntil = 0
  $('rate').textContent =
    `+${income(state)}/s · Lv.${state.level}${allies >= MAX_UNITS - 4 ? ` · 味方 ${allies}/${MAX_UNITS}` : ''}`
  $('home').textContent = `${Math.ceil(state.home)} / ${STAGES[state.stage].home}`
  $('enemy').textContent = `${Math.ceil(state.enemy)} / ${STAGES[state.stage].enemy}`
  $('clock').textContent = `${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`
  const alert = state.alert && state.time - state.alert.at < 2.5 ? state.alert.text : ''
  $('notice').textContent = paused
    ? 'Ⅱ'
    : performance.now() < capNoticeUntil
      ? `味方が満員です ${MAX_UNITS}/${MAX_UNITS}`
      : alert
  $('notice').classList.toggle('paused', paused || (!!alert && performance.now() >= capNoticeUntil))
  $('pause').textContent = paused ? '▶' : 'Ⅱ'
  $('pause').setAttribute('aria-label', paused ? '再開' : '一時停止')
  $('pause').setAttribute('aria-pressed', String(paused))
  buttons.forEach((b, i) => {
    const d = state.deck[i]
    b.disabled = paused || !!state.result || (!full && (state.gold < d.cost || state.cooldowns[i] > 0))
    b.setAttribute('aria-disabled', String(full || b.disabled))
    b.setAttribute('aria-label', `${d.name}を召喚 ${d.cost}${full ? ' 味方が満員' : ''}`)
    b.classList.toggle('full', full)
    // Recharge shade: the remaining share of the cooldown darkens the card from the top.
    b.style.setProperty('--cd', state.cooldowns[i] / d.cooldown)
  })
  $('upgrade').disabled = paused || !!state.result || state.level >= 5 || state.gold < upgradeCost(state)
  $('upgrade').querySelector('b').textContent = state.level >= 5 ? 'MAX' : `${upgradeCost(state)} 💩`
  $('burst').disabled = paused || !!state.result || state.burst > 0
  $('burst').style.setProperty('--cd', state.burst / BURST_COOLDOWN)
  $('burst').querySelector('b').textContent = state.burst > 0 ? String(Math.ceil(state.burst)) : ''
}
function finish(report) {
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
/** Per-step visual bookkeeping for the current scene; returns which sounds the real battle should make. */
function digest(previous, releaseGlides) {
  fallen.push(...state.deaths.splice(0))
  for (let index = fallen.length - 1; index >= 0; index--)
    if (
      fallen[index].visualStarted &&
      fallen[index].visualAge > Math.max(fallen[index].flushed ? 0.8 : 0, koSeconds(fallen[index].key))
    )
      fallen.splice(index, 1)
  let impact = false,
    shot = false
  for (const effect of state.effects)
    if (!heard.has(effect)) {
      heard.add(effect)
      // Splashes land on the front of the recipient's drawn body, on its own row.
      const target = [...state.units, ...previous].find((u) => u.id === effect.targetId)
      const attacker = state.units.find((u) => u.id === effect.sourceId)
      if (attacker && !effect.ranged && !effect.explosion) {
        if (target)
          contacts.set(attacker.id, {
            target,
            at: effect.releasedAt,
            cycle: attacker.cycle,
            strikes: attacker.strikes
          })
        else contacts.delete(attacker.id)
      }
      if (target) {
        effect.targetY = laneY(target) - 35 * models.presentation[1]
        const height = 35 / (models.presentation[0] * modelSize(target.key))
        effect.dx = standOff(target) - target.side * models.front(target.key, height)
      }
      if (effect.sourceId != null)
        effect.source = { ...[...state.units, ...previous].find((u) => u.id === effect.sourceId) }
      effect.releaseGlide = releaseGlides.get(effect.sourceId) ?? 0
      effect.victimOrigins = (effect.victims ?? [])
        .map(({ id }) => previous.find((unit) => unit.id === id))
        .filter(Boolean)
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
  return { impact, shot }
}
function tick(now) {
  // Death motions age with real visible time, so they keep real speed down to 4 fps; a longer stall
  // advances them by at most 0.25 s, so a death the player has barely seen still plays out.
  const visible =
    !paused && !document.hidden && !clock.pending && (state.result || clock.last === null || now - clock.last <= 30000)
  const visualDelta = visible && visualLast !== null ? Math.min(0.25, Math.max(0, (now - visualLast) / 1000)) : 0
  visualLast = visible ? now : null
  for (const ghost of fallen) if (ghost.visualStarted) ghost.visualAge += visualDelta
  if (resultVisual) resultVisual.elapsed += visualDelta
  reconciling = clock.pending > 0 || (clock.last !== null && now - clock.last > 250)
  // The unit objects as they were before this tick's steps: units that fall keep their final state.
  const previous = state.units.slice()
  const releaseGlides = new Map(previous.map((unit) => [unit.id, (glides.get(unit.id)?.x ?? unit.x) - unit.x]))
  const elapsed = clock.advance(
    now,
    !paused && !state.result,
    (dt) => step(state, dt),
    () => !!state.result
  )
  const resultStarted = state.result && !resultVisual
  if (resultStarted) {
    for (const projectile of state.projectiles) {
      if (projectile.victim) projectile.victim.missed = true
      if (!projectile.effect.hit) projectile.effect.cancelled = true
    }
    const report = settle(campaign, state, Math.random)
    save(campaign)
    resultVisual = { report, elapsed: 0 }
  }
  if (!paused) {
    const { impact, shot } = digest(previous, releaseGlides)
    if (impact) tone('hit')
    if (shot) tone('shot')
  }
  if (resultStarted)
    resultVisual.duration =
      Math.max(
        0,
        ...fallen.map((unit) => Math.max(unit.flushed ? 0.8 : 0, koSeconds(unit.key)) - (unit.visualAge ?? 0)),
        ...state.effects.map((effect) => effect.life),
        ...state.units.map((unit) => (unit.hurt ? hurtSeconds(unit.key) - (state.time - unit.hurt.at) : 0)),
        ...state.units.map((unit) => {
          const held = heldStrike(contacts.get(unit.id), unit, state.time)
          const phase =
            unit.motion === 'attack' ? unit.phase : held && unit.motion === 'walk' ? state.time - held.at : Infinity
          return timing(unit.cycle).recovery - phase
        })
      ) + (calm.matches ? 0.05 : 0.15)
  if (audio.running !== (!paused && !document.hidden)) syncAudio()
  audio.tick()
  if (!document.hidden) {
    if (demoShowing()) drawHud()
    else draw()
  }
  if (
    state.result &&
    !shown &&
    fallen.every((ghost) => ghost.visualStarted) &&
    resultVisual.elapsed >= resultVisual.duration
  ) {
    shown = true
    finish(resultVisual.report)
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
// ── Title demo: while the boot 作戦室 is up, a bot plays a separate battle (attract.js) on the same canvas. ──
// It has its own state and visual buffers, swapped in only while it is stepped and drawn; it makes no sound, writes
// no storage and leaves the real battle, header, tray and notices alone. rAF drives it (never the worker heartbeat).
const DEMO_DELAY = 400
let titleUp = false
let demo = null
let demoFailed = false
let demoReadyAt = 0
const demoRunning = () => titleUp && !demoFailed && dialog.open
const demoShowing = () => !!demo && demoRunning()
function endTitle() {
  titleUp = false
  demo = null
  dialog.classList.remove('title')
}
dialog.addEventListener('close', endTitle)
function runDemo(now) {
  if (!demoRunning() || document.hidden) {
    if (demo) demo.last = null
    return
  }
  try {
    if (!demo) {
      if (now < demoReadyAt) return
      demo = {
        attract: createAttract(0),
        generation: 0,
        last: null,
        fallen: [],
        glides: new Map(),
        contacts: new Map()
      }
    }
    const dt = demo.last === null ? 0 : Math.min(0.05, Math.max(0, (now - demo.last) / 1000)) * (calm.matches ? 0.4 : 1)
    demo.last = now
    const saved = { state, fallen, glides, contacts, resultVisual }
    try {
      state = demo.attract.state
      ;({ fallen, glides, contacts } = demo)
      resultVisual = null
      const previous = state.units.slice()
      const releaseGlides = new Map(previous.map((unit) => [unit.id, (glides.get(unit.id)?.x ?? unit.x) - unit.x]))
      stepAttract(demo.attract, dt)
      if (demo.attract.generation !== demo.generation) {
        demo.generation = demo.attract.generation
        demo.fallen = fallen = []
        demo.glides = glides = new Map()
        demo.contacts = contacts = new Map()
        state = demo.attract.state
      } else {
        for (const ghost of fallen) if (ghost.visualStarted) ghost.visualAge += dt
        digest(previous, releaseGlides)
      }
      drawScene()
    } finally {
      ;({ state, fallen, glides, contacts, resultVisual } = saved)
    }
  } catch {
    // Anything unexpected: forget the demo; the title falls back to today's empty battlefield.
    demoFailed = true
    demo = null
  }
}
function frame(now) {
  tick(now)
  runDemo(now)
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
dialog.classList.add('title')
titleUp = true
demoReadyAt = performance.now() + DEMO_DELAY
modal(
  'うんこ大惨事',
  campaign.cleared
    ? `おかえり、うんこ軍団。${campaign.cleared}ステージ突破済み。編成を整えて次のトイレへ。`
    : 'うんこ軍団を率いて、清掃員・便器・ヨーグルト・薬が守る便器城へ。右のうんこ塔を守りながら左の敵陣へ攻め込もう。ステージを突破するたびに、お腹に悪い特殊ユニットがランダムで仲間になる。敵を倒すと経験値、レベルアップで能力がランダムに伸びる。'
)
requestAnimationFrame(frame)
