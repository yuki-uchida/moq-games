import { LaneModels } from './models.js'
import { BattleAudio } from './audio.js'
import { BattleClock } from './clock.js'
import { bindUiSounds, playUiSound, warmUpAudio } from '../shared/UiSound.ts'
import {
  STAGES,
  income,
  TYPES,
  createGame,
  summon,
  upgrade,
  upgradeCost,
  burst,
  step,
  BURST_COOLDOWN
} from './simulation.js'
const $ = (id) => document.getElementById(id)
const canvas = document.querySelector('canvas'),
  ctx = canvas.getContext('2d')
const SPLAT_SECONDS = 0.22
/** Screen-space splash only; the simulation owns recipient, arrival and damage. Poop hits splat brown, foam hits splash blue. */
function drawContact(effect, y, age, aspect) {
  if (age < 0 || age > SPLAT_SECONDS) return
  const t = age / SPLAT_SECONDS
  ctx.save()
  ctx.globalAlpha = 1 - t * t
  ctx.translate(effect.x, y)
  ctx.scale(effect.side || 1, aspect)
  ctx.fillStyle = effect.side === -1 ? '#bfe6ff' : '#7a4722'
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
let state = createGame(),
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
function start(stage) {
  state = createGame(stage)
  shown = false
  fallen.length = 0
  audio.beat = 0
  document.querySelector('dialog').close()
  paused = false
  clock.reset(performance.now())
  tone('summon')
}
let records = {}
try {
  records = JSON.parse(localStorage.getItem('lane-battle-records') || '{}') || {}
} catch {
  records = {}
}
function stageLabel(i) {
  const best = records[i]
  return `${i + 1} · ${STAGES[i].name}${Number.isFinite(best) ? ` ★${best}秒` : ''}`
}
STAGES.forEach((stage, i) => {
  const b = document.createElement('button')
  b.dataset.sfx = 'select'
  b.textContent = stageLabel(i)
  b.onclick = () => {
    state = createGame(i)
    $('message').textContent = stage.hint
    document.querySelectorAll('#stages button').forEach((v, j) => v.setAttribute('aria-pressed', String(i === j)))
    $('next').hidden = true
    $('close').hidden = false
    $('restart').hidden = true
  }
  $('stages').append(b)
})
$('next').onclick = () => start((state.stage + 1) % STAGES.length)
const buttons = TYPES.map((t, i) => {
  const b = document.createElement('button')
  b.setAttribute('aria-label', `${t.name}を召喚 ${t.cost}`)
  b.title = t.name
  b.dataset.sfx = 'none'
  b.innerHTML = `<canvas class="portrait" width="128" height="112"></canvas><b>${t.cost} 💩</b>`
  b.onclick = () => {
    deploy(i)
  }
  $('tray').append(b)
  return b
})
function modal(title, message, ending = false) {
  paused = true
  clock.reset(performance.now())
  syncAudio()
  $('title').textContent = title
  $('message').textContent = message
  $('close').hidden = ending
  $('restart').hidden = !ending
  $('next').hidden = !ending || state.result !== 'victory'
  $('next').textContent = state.stage === 2 ? '最初のステージへ ↻' : '次のステージ →'
  document
    .querySelectorAll('#stages button')
    .forEach((b, i) => b.setAttribute('aria-pressed', String(state.stage === i)))
  document.querySelector('dialog').showModal()
}
$('close').onclick = () => {
  document.querySelector('dialog').close()
  paused = false
  clock.reset(performance.now())
}
$('restart').onclick = () => {
  start(state.stage)
}
/** Keyboard-only pause (Space); the battlefield has no pause button. */
function togglePause() {
  tick(performance.now())
  if (document.querySelector('dialog').open || clock.pending) return
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
  if (document.querySelector('dialog').open || clock.pending) return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePause()
  }
  if (!paused) {
    if (['1', '2', '3'].includes(e.key)) deploy(Number(e.key) - 1)
    if (e.key.toLowerCase() === 'u') invest()
  }
})
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
/** The enemy fort: a western toilet the size of a castle, guarded by foam. */
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
  ctx.fillStyle = '#4c9ad0'
  ctx.fillRect(x + 16, 180, 3, 40)
  ctx.beginPath()
  ctx.moveTo(x + 15, 180)
  ctx.lineTo(x - 18, 192)
  ctx.lineTo(x + 15, 204)
  ctx.fill()
}
function draw() {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(devicePixelRatio, 2)
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
  }
  ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 450, 0, 0)
  // A tiled restroom: wall, floor and a toilet-paper road unrolled between the two forts.
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
    ctx.arc(x + 100, 235, 5, 0, 7)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff40'
  for (let i = 0; i < 9; i++) {
    ctx.beginPath()
    ctx.arc(((i * 137 + state.time * 9) % 1040) - 20, 120 - ((i * 53 + state.time * 14) % 110), 4 + (i % 3) * 3, 0, 7)
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
  drawPoopTower(55)
  drawToiletCastle(945)
  for (const [x, hp, max] of [
    [55, state.home, 1400],
    [945, state.enemy, STAGES[state.stage].enemy]
  ]) {
    ctx.fillStyle = '#3a2414'
    ctx.fillRect(x - 39, 211, 78, 8)
    ctx.fillStyle = '#ffd166'
    ctx.fillRect(x - 39, 211, (78 * hp) / max, 8)
  }
  const scale = rect.width < 500 ? 155 : 120
  const aspect = rect.width / 1000 / (rect.height / 450)
  models.setPresentation(scale, aspect)
  for (const ghost of fallen) {
    const age = state.time - ghost.at
    models.fallen(ghost, ghost.x - ghost.side * age * 20, 361 + (ghost.id % 3) * 8, age, 1 - age / 0.42)
  }
  const units = [...state.units].sort((a, b) => a.id - b.id)
  for (const u of units) {
    const y = 361 + (u.id % 3) * 8
    ctx.fillStyle = u.side === 1 ? '#5a361a55' : '#4c9ad055'
    ctx.beginPath()
    ctx.ellipse(u.x, y + 2, 22, 6, 0, 0, 7)
    ctx.fill()
    models.unit(u, u.x, y, state.time)
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(models.render(canvas.width, canvas.height), 0, 0)
  ctx.restore()
  for (const u of units) {
    const y = 361 + (u.id % 3) * 8
    ctx.fillStyle = '#3a2414'
    ctx.fillRect(u.x - 18, y - (scale * 0.8 * (rect.width / 1000)) / (rect.height / 450), 36, 4)
    ctx.fillStyle = u.side === 1 ? '#ffd166' : '#7fd1ff'
    ctx.fillRect(
      u.x - 18,
      y - (scale * 0.8 * (rect.width / 1000)) / (rect.height / 450),
      36 * Math.max(0, u.hp / u.maxHp),
      4
    )
  }
  for (const e of state.effects) {
    if (e.blast) {
      // The big fart: a green cloud billowing out over the left half.
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
      const y = 361 + ((source?.id || 0) % 3) * 8
      const fromX = e.from + (source?.side === -1 ? -0.2 : 0.2) * scale
      const fromY = y - 0.24 * scale * aspect
      const targetY = e.targetY ?? fromY
      const progress = e.arrived ? 1 : Math.min(0.999, Math.max(0, (state.time - e.releasedAt) / 0.12))
      if (progress < 1) {
        // A thrown pellet (poop side) or soap bubble (foam side), lobbed in a small arc.
        const x = fromX + (e.x - fromX) * progress
        const yShot = fromY + (targetY - fromY) * progress - Math.sin(progress * Math.PI) * 14
        ctx.save()
        ctx.translate(x, yShot)
        ctx.scale(1, aspect)
        ctx.beginPath()
        ctx.arc(0, 0, 6, 0, 7)
        ctx.fillStyle = e.side === -1 ? '#e9f7ffcc' : '#6b3c1c'
        ctx.fill()
        ctx.strokeStyle = e.side === -1 ? '#4c9ad0' : '#3d200c'
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
  $('home').textContent = `${state.home} / 1400`
  $('enemy').textContent = `${state.enemy} / ${STAGES[state.stage].enemy}`
  $('clock').textContent = `${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`
  $('notice').textContent = paused ? 'Ⅱ' : ''
  $('notice').classList.toggle('paused', paused)
  buttons.forEach((b, i) => {
    b.disabled = paused || state.gold < TYPES[i].cost || state.cooldowns[i] > 0
    // Recharge shade: the remaining share of the cooldown darkens the card from the top.
    b.style.setProperty('--cd', state.cooldowns[i] / TYPES[i].cooldown)
  })
  $('upgrade').disabled = paused || state.level >= 5 || state.gold < upgradeCost(state)
  $('upgrade').querySelector('b').textContent = state.level >= 5 ? 'MAX' : `${upgradeCost(state)} 💩`
  $('burst').disabled = paused || state.burst > 0
  $('burst').style.setProperty('--cd', state.burst / BURST_COOLDOWN)
  $('burst').querySelector('b').textContent = state.burst > 0 ? String(Math.ceil(state.burst)) : ''
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
    while (fallen.length && state.time - fallen[0].at > 0.42) fallen.shift()
    let impact = false,
      shot = false
    for (const effect of state.effects)
      if (!heard.has(effect)) {
        heard.add(effect)
        if (effect.ranged) {
          effect.source = { ...[...state.units, ...previous].find((u) => u.id === effect.sourceId) }
          const target = [...state.units, ...previous].find((u) => u.id === effect.targetId)
          if (target) {
            const rect = canvas.getBoundingClientRect()
            const aspect = rect.width / 1000 / (rect.height / 450)
            effect.targetY = 361 + (target.id % 3) * 8 - 35 * aspect
          }
        }
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
    if (state.result === 'victory') {
      records[state.stage] = Math.min(records[state.stage] ?? Infinity, Math.floor(state.time))
      try {
        localStorage.setItem('lane-battle-records', JSON.stringify(records))
      } catch {}
      document.querySelectorAll('#stages button').forEach((b, i) => (b.textContent = stageLabel(i)))
    }
    modal(
      state.result === 'victory' ? '便器城、大惨事！' : 'うんこ塔が流された…',
      `${Math.floor(state.time)}秒 · ${state.kills}体撃退。${state.result === 'victory' ? (state.stage === 2 ? '全3ステージ踏破！別の編成でもう一度挑戦しよう。' : '次のトイレが待っている。次のステージへ進もう。') : 'カチカチうんこで前線を守り、腸活とコロコロうんこの援護を試そう。'}`,
      true
    )
    tone(state.result)
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
// Browsers may throttle or suspend this timer; the same clock reconciles on return.
setInterval(() => {
  if (document.hidden) tick(performance.now())
}, 250)
buttons.forEach((b, i) => models.portrait(TYPES[i].role, b.querySelector('canvas')))
modal(
  'うんこ大惨事',
  'うんこ軍団を率いて、泡の兵団が守る便器城へ。カチカチうんこは盾、コロコロうんこは遠距離、ゲリラうんこは突撃役。資源を腸活に投資するか、援軍に使うか。便器城を大惨事にしてやろう。'
)
requestAnimationFrame(frame)
