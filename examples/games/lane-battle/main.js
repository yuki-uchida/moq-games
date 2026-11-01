import { impactCanvas, impactFrame, impactDuration } from '../shared/ImpactArt.ts'
import { LaneModels } from './models.js'
import { BattleAudio } from './audio.js'
import { BattleClock } from './clock.js'
import { bindUiSounds, playUiSound, warmUpAudio } from '../shared/UiSound.ts'
import { STAGES, income, TYPES, createGame, summon, upgrade, upgradeCost, burst, step } from './simulation.js'
const $ = (id) => document.getElementById(id)
const canvas = document.querySelector('canvas'),
  ctx = canvas.getContext('2d')
/** Screen-space contact only; the simulation owns recipient, arrival and damage. */
function drawContact(effect, y, age, aspect, style) {
  const frame = impactFrame(age, true, style)
  if (frame === null) return
  ctx.save()
  ctx.globalAlpha = 1 - (age / impactDuration(style)) ** 2
  ctx.translate(effect.x, y)
  ctx.scale(effect.side || 1, aspect)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(impactCanvas(style, frame), -16, -16, 32, 32)
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
  b.dataset.sfx = 'none'
  b.innerHTML = `<canvas class="portrait" width="128" height="112"></canvas><span>${t.name}</span><b>${t.cost} ✦</b>`
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
$('help').onclick = () =>
  !clock.pending &&
  modal(
    '森の砦を守ろう',
    '兵のアイコンを押すと左の砦から出撃します。衛兵で受け止め、射手で援護、狼で突破。✦は自動で増加し、生産強化で増加速度が上がります。砦の衝撃は戦場の左半分を守ります。右の水晶砦を壊せば勝利。キー1〜3で召喚、Uで強化、Spaceで一時停止。'
  )
$('pause').onclick = () => {
  tick(performance.now())
  if (document.querySelector('dialog').open || clock.pending) return
  paused = !paused
  clock.reset(performance.now())
  syncAudio()
  $('pause').textContent = paused ? '▶' : 'Ⅱ'
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
    $('pause').click()
  }
  if (!paused) {
    if (['1', '2', '3'].includes(e.key)) deploy(Number(e.key) - 1)
    if (e.key.toLowerCase() === 'u') invest()
  }
})
function draw() {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(devicePixelRatio, 2)
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
  }
  ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 450, 0, 0)
  const sky = ctx.createLinearGradient(0, 0, 0, 450)
  sky.addColorStop(0, STAGES[state.stage].color)
  sky.addColorStop(0.63, '#e6dab0')
  sky.addColorStop(1, '#507e62')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 1000, 450)
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#46796f66' : '#6b938366'
    ctx.beginPath()
    ctx.moveTo(i * 110 - 80, 310)
    ctx.lineTo(i * 110 + 30, 110 + (i % 3) * 30)
    ctx.lineTo(i * 110 + 160, 310)
    ctx.fill()
  }
  ctx.fillStyle = '#6d8962'
  ctx.fillRect(0, 320, 1000, 130)
  ctx.fillStyle = '#c5b48a'
  ctx.beginPath()
  ctx.moveTo(0, 355)
  ctx.quadraticCurveTo(500, 320, 1000, 355)
  ctx.lineTo(1000, 425)
  ctx.quadraticCurveTo(500, 385, 0, 425)
  ctx.fill()
  for (const [x, color, hp, max] of [
    [55, '#244f49', state.home, 1400],
    [945, '#605177', state.enemy, STAGES[state.stage].enemy]
  ]) {
    ctx.fillStyle = '#23433c44'
    ctx.beginPath()
    ctx.ellipse(x, 372, 57, 12, 0, 0, 7)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillRect(x - 33, 247, 66, 117)
    for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * 23 - 9, 230, 18, 35)
    ctx.fillStyle = '#e2c575'
    ctx.fillRect(x - 10, 315, 20, 49)
    ctx.fillStyle = '#173b3d'
    ctx.fillRect(x - 39, 211, 78, 8)
    ctx.fillStyle = '#f6d37f'
    ctx.fillRect(x - 39, 211, (78 * hp) / max, 8)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, 230)
    ctx.lineTo(x, 173)
    ctx.lineTo(x + 38, 188)
    ctx.lineTo(x, 202)
    ctx.fill()
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
    ctx.fillStyle = u.side === 1 ? '#2c9b9755' : '#9c455755'
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
    ctx.fillStyle = '#203c43'
    ctx.fillRect(u.x - 18, y - (scale * 0.8 * (rect.width / 1000)) / (rect.height / 450), 36, 4)
    ctx.fillStyle = u.side === 1 ? '#8de8cf' : '#ffac91'
    ctx.fillRect(
      u.x - 18,
      y - (scale * 0.8 * (rect.width / 1000)) / (rect.height / 450),
      36 * Math.max(0, u.hp / u.maxHp),
      4
    )
  }
  for (const e of state.effects) {
    ctx.strokeStyle = e.side === 1 ? '#ffeb9b' : '#ef9275'
    ctx.lineWidth = e.blast ? 8 : 3
    ctx.beginPath()
    if (e.blast) {
      ctx.arc(e.x, 350, (0.6 - e.life) * 430, 0, 7)
    } else if (e.ranged) {
      const source = e.source
      const emitter = { x: source?.side === 1 ? 100 : 28, y: 65 }
      const y = 361 + ((source?.id || 0) % 3) * 8
      const fromX = e.from + (emitter.x / 128 - 0.5) * scale
      const fromY = y + (-94 / 128 + emitter.y / 128) * scale * aspect
      const targetY = e.targetY ?? fromY
      const progress = e.arrived ? 1 : Math.min(0.999, Math.max(0, (state.time - e.releasedAt) / 0.12))
      const x = fromX + (e.x - fromX) * progress
      const yArrow = fromY + (targetY - fromY) * progress
      if (progress < 1) {
        const angle = Math.atan2(targetY - fromY, e.x - fromX)
        ctx.save()
        ctx.translate(x, yArrow)
        ctx.rotate(angle)
        ctx.strokeStyle = '#57412b'
        ctx.lineWidth = 2
        ctx.moveTo(-17, 0)
        ctx.lineTo(2, 0)
        ctx.moveTo(-2, -3)
        ctx.lineTo(3, 0)
        ctx.lineTo(-2, 3)
        ctx.moveTo(-14, -3)
        ctx.lineTo(-11, 0)
        ctx.lineTo(-14, 3)
        ctx.stroke()
        ctx.restore()
        ctx.beginPath()
      } else if (e.arrived && !e.missed) {
        drawContact(e, targetY, state.time - e.releasedAt - 0.12, aspect, 'pierce')
      }
    } else {
      const y = e.targetY ?? 361 - 30 * aspect
      drawContact(e, y, state.time - e.releasedAt, aspect, 'cut')
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  document.querySelector('header small').textContent = `${state.stage + 1}/3 · ${STAGES[state.stage].name}`
  $('gold').textContent = Math.floor(state.gold)
  $('rate').textContent = `+${income(state)}/秒 · Lv.${state.level}`
  $('home').textContent = `${state.home} / 1400`
  $('enemy').textContent = `${state.enemy} / ${STAGES[state.stage].enemy}`
  $('clock').textContent = `${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`
  $('notice').textContent = paused
    ? '一時停止中'
    : state.time < 8
      ? 'アイコンで召喚 → 右の砦を攻略'
      : state.time < 18
        ? '✦ 生産を強化すると援軍が増える'
        : `撃退 ${state.kills}`
  buttons.forEach((b, i) => {
    b.disabled = paused || state.gold < TYPES[i].cost || state.cooldowns[i] > 0
    b.querySelector('b').textContent =
      state.cooldowns[i] > 0 ? `${state.cooldowns[i].toFixed(1)} 秒` : `${TYPES[i].cost} ✦`
  })
  $('upgrade').disabled = paused || state.level >= 5 || state.gold < upgradeCost(state)
  $('upgrade').querySelector('b').textContent = state.level >= 5 ? 'MAX' : `${upgradeCost(state)} ✦`
  $('burst').disabled = paused || state.burst > 0
  $('burst').querySelector('b').textContent = state.burst > 0 ? `${Math.ceil(state.burst)} 秒` : '準備完了'
  $('pause').textContent = paused ? '▶' : 'Ⅱ'
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
      state.result === 'victory' ? '境界を取り戻した！' : '森の砦が陥落',
      `${Math.floor(state.time)}秒 · ${state.kills}体撃退。${state.result === 'victory' ? (state.stage === 2 ? '全3ステージ踏破！別の編成でもう一度挑戦しよう。' : '次の道が開かれました。次のステージへ進もう。') : '衛兵で前線を守り、生産強化と射手の援護を試そう。'}`,
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
models
  .load(TYPES.map((t) => t.role))
  .then(() => {
    buttons.forEach((b, i) => models.portrait(TYPES[i].role, b.querySelector('canvas')))
    modal(
      '芽吹きの境界',
      '森の軍勢を率いて、水晶砦へ。衛兵は盾、射手は遠距離、狼は突破役。資源を生産強化に投資するか、援軍に使うか。あなたの采配で道を開こう。'
    )
    requestAnimationFrame(frame)
  })
  .catch((e) => {
    $('notice').textContent = '素材を読み込めません。ページを再読み込みしてください。'
    console.error(e)
  })
