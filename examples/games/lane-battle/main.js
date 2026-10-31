import { STAGES, income, TYPES, createGame, summon, upgrade, upgradeCost, burst, step } from './simulation.js'
const $ = (id) => document.getElementById(id)
const canvas = document.querySelector('canvas'),
  ctx = canvas.getContext('2d')
const assets = new Map()
const base = new URL(import.meta.env.BASE_URL, location.origin)
async function load(t, motion, dir) {
  const url = new URL(`tower-defense-art/${t.role}/${t.file}-${motion}-${dir}.json`, base)
  const meta = await fetch(url).then((r) => {
    if (!r.ok) throw Error(url)
    return r.json()
  })
  const img = new Image()
  img.src = new URL(meta.texture, url).href
  await img.decode()
  assets.set(`${t.role}-${motion}-${dir}`, { meta, img })
}
let state = createGame(),
  paused = true,
  last = 0,
  shown = false
let audio,
  muted = false,
  lastSound = -1
function tone(kind) {
  if (muted) return
  try {
    audio ||= new AudioContext()
    if (audio.state === 'suspended') audio.resume()
    const osc = audio.createOscillator(),
      gain = audio.createGain()
    const notes = {
      summon: [520, 780],
      upgrade: [660, 990],
      burst: [120, 45],
      hit: [180, 80],
      victory: [660, 1320],
      defeat: [220, 70]
    }
    const [a, b] = notes[kind]
    osc.type = kind === 'burst' ? 'sawtooth' : 'sine'
    osc.frequency.setValueAtTime(a, audio.currentTime)
    osc.frequency.exponentialRampToValueAtTime(b, audio.currentTime + 0.14)
    gain.gain.setValueAtTime(0.035, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18)
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.2)
  } catch {
    /* Audio may be unavailable; gameplay continues. */
  }
}
$('sound').onclick = () => {
  muted = !muted
  $('sound').textContent = muted ? '♪̸' : '♪'
  $('sound').setAttribute('aria-pressed', String(muted))
  if (!muted) tone('summon')
}
function deploy(i) {
  if (!paused && summon(state, i)) tone('summon')
}
function invest() {
  if (!paused && upgrade(state)) tone('upgrade')
}
function start(stage) {
  state = createGame(stage)
  shown = false
  lastSound = -1
  document.querySelector('dialog').close()
  paused = false
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
  b.innerHTML = `<canvas class="portrait" width="128" height="112"></canvas><span>${t.name}</span><b>${t.cost} ✦</b>`
  b.onclick = () => {
    deploy(i)
  }
  $('tray').append(b)
  return b
})
function modal(title, message, ending = false) {
  paused = true
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
}
$('restart').onclick = () => {
  start(state.stage)
}
$('help').onclick = () =>
  modal(
    '森の砦を守ろう',
    '兵のアイコンを押すと左の砦から出撃します。衛兵で受け止め、射手で援護、狼で突破。✦は自動で増加し、生産強化で増加速度が上がります。砦の衝撃は戦場の左半分を守ります。右の水晶砦を壊せば勝利。キー1〜3で召喚、Uで強化、Spaceで一時停止。'
  )
$('pause').onclick = () => {
  paused = !paused
  $('pause').textContent = paused ? '▶' : 'Ⅱ'
}
$('upgrade').onclick = () => {
  invest()
}
$('burst').onclick = () => {
  if (!paused && burst(state)) tone('burst')
}
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog').open) return
  if (e.code === 'Space') {
    e.preventDefault()
    $('pause').click()
  }
  if (!paused) {
    if (['1', '2', '3'].includes(e.key)) deploy(Number(e.key) - 1)
    if (e.key.toLowerCase() === 'u') invest()
  }
})
function sprite(context, t, motion, side, phase, x, y, size, aspect = 1) {
  const a = assets.get(`${t.role}-${motion}-${side === 1 ? 'e' : 'w'}`)
  if (!a) return
  const f = a.meta.frames[Math.floor(phase * a.meta.fps) % a.meta.frames.length]
  context.drawImage(
    a.img,
    f.x,
    f.y,
    f.width,
    f.height,
    x - size / 2,
    y - size * 0.84 * aspect,
    size,
    size * 0.875 * aspect
  )
}
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
  for (const u of [...state.units].sort((a, b) => a.id - b.id)) {
    const y = 361 + (u.id % 3) * 8
    ctx.fillStyle = u.side === 1 ? '#2c9b9755' : '#9c455755'
    ctx.beginPath()
    ctx.ellipse(u.x, y + 2, 22, 6, 0, 0, 7)
    ctx.fill()
    sprite(ctx, u, u.motion, u.side, u.phase, u.x, y, scale, rect.width / 1000 / (rect.height / 450))
    ctx.fillStyle = '#203c43'
    ctx.fillRect(u.x - 18, y - (scale * 0.56 * (rect.width / 1000)) / (rect.height / 450), 36, 4)
    ctx.fillStyle = u.side === 1 ? '#8de8cf' : '#ffac91'
    ctx.fillRect(
      u.x - 18,
      y - (scale * 0.56 * (rect.width / 1000)) / (rect.height / 450),
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
      ctx.moveTo(e.from, 310)
      ctx.lineTo(e.x, 330)
    } else {
      ctx.arc(e.x, 332, 12 + e.life * 30, 0, 7)
    }
    ctx.stroke()
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
        : `${state.stage + 1}/3 · ${STAGES[state.stage].name} · 撃退 ${state.kills}`
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
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  if (!paused) {
    step(state, dt)
    if (state.effects.some((e) => !e.blast) && state.time - lastSound > 0.22) {
      tone('hit')
      lastSound = state.time
    }
  }
  draw()
  if (state.result && !shown) {
    shown = true
    tone(state.result)
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
  }
  requestAnimationFrame(frame)
}
Promise.all(TYPES.flatMap((t) => ['walk', 'attack', 'idle'].flatMap((m) => ['e', 'w'].map((d) => load(t, m, d)))))
  .then(() => {
    buttons.forEach((b, i) => sprite(b.querySelector('canvas').getContext('2d'), TYPES[i], 'idle', 1, 0, 64, 145, 240))
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
