import { expPerLevel, missions, mvp, type Game, type Progress, type Unit } from './game'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const stats = [
  ['max', 'HP'],
  ['power', '攻撃'],
  ['def', '防御']
] as const

let context: AudioContext | undefined
/** Short synthesized rising chime; no asset is added. */
function chime() {
  context ??= new AudioContext()
  const now = context.currentTime
  ;[523, 659, 784, 1047].forEach((frequency, i) => {
    const osc = context!.createOscillator(),
      gain = context!.createGain()
    osc.type = 'triangle'
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now + i * 0.09)
    gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.09 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.35)
    osc.connect(gain).connect(context!.destination)
    osc.start(now + i * 0.09)
    osc.stop(now + i * 0.09 + 0.4)
  })
}

/** Removes any in-flight EXP or level-up overlay (restart / mission change). */
export function clearProgress(field: HTMLElement) {
  field.querySelectorAll('.exp-gauge, .level-up').forEach((element) => element.remove())
}

/** FE-style EXP gauge fill, followed by a level-up window whose raised stats light one by one. */
export async function presentProgress(field: HTMLElement, unit: Unit, progress: Progress, sound: boolean) {
  clearProgress(field)
  const gauge = document.createElement('div')
  gauge.className = 'exp-gauge'
  gauge.setAttribute('role', 'status')
  gauge.innerHTML = `<span>${unit.name}</span><b>EXP</b><i><em></em></i><output>${progress.from}</output>`
  field.append(gauge)
  const bar = gauge.querySelector('em')!,
    value = gauge.querySelector('output')!
  bar.style.width = `${progress.from}%`
  const fill = async (to: number) => {
    await wait(30)
    bar.style.width = `${(to / expPerLevel) * 100}%`
    value.textContent = String(to)
    await wait(450)
  }
  if (!progress.gains) {
    await fill(progress.to)
    await wait(250)
    gauge.remove()
    return
  }
  await fill(expPerLevel)
  gauge.remove()
  const before = {
    max: unit.max - progress.gains.max,
    power: unit.power - progress.gains.power,
    def: unit.def - progress.gains.def
  }
  const panel = document.createElement('div')
  panel.className = 'level-up'
  panel.setAttribute('role', 'status')
  panel.innerHTML = `<h3>LEVEL UP!</h3><p>${unit.name}　Lv <b>${progress.level}</b> → <b>${unit.level}</b></p><dl>${stats
    .map(([stat, label]) => `<div data-stat="${stat}"><dt>${label}</dt><dd>${before[stat]}</dd><span></span></div>`)
    .join('')}</dl>`
  field.append(panel)
  if (sound) chime()
  await wait(420)
  for (const [stat] of stats) {
    if (!progress.gains[stat]) continue
    const row = panel.querySelector(`[data-stat="${stat}"]`)!
    row.classList.add('up')
    row.querySelector('dd')!.textContent = String(unit[stat])
    row.querySelector('span')!.textContent = '+1'
    await wait(320)
  }
  await wait(900)
  panel.remove()
}

/** Chapter-clear summary: turns, defeats, every ally's growth and the MVP. */
export function chapterReport(game: Game, portrait: (unit: Unit) => string) {
  const allies = game.units.filter((u) => u.side === 'ally'),
    best = mvp(game)
  const kills = allies.reduce((sum, u) => sum + u.kills, 0)
  return `<header><small>CHAPTER ${game.stage + 1} CLEAR</small><strong>${missions[game.stage].name}</strong></header>
<dl class="chapter-stats"><div><dt>ターン</dt><dd>${game.turn}</dd></div><div><dt>撃破</dt><dd>${kills}</dd></div><div><dt>生存</dt><dd>${allies.filter((u) => u.hp > 0).length}/${allies.length}</dd></div><div><dt>残り薬</dt><dd>${game.potions}</dd></div></dl>
<ul class="chapter-units">${allies
    .map(
      (u) =>
        `<li class="${u === best ? 'mvp' : ''}${u.hp > 0 ? '' : ' fallen'}">${portrait(u)}<div><p><b>${u.name}</b>${u === best ? '<mark>MVP</mark>' : ''}</p><p>Lv ${u.level}${u.level > u.startLevel ? `<ins>▲${u.level - u.startLevel}</ins>` : ''}　<span class="exp-line"><i><em style="width:${u.exp}%"></em></i>${u.exp}</span>　<ins>+${u.gained} EXP</ins></p><p>♥ ${u.max}　⚔ ${u.power}　⛨ ${u.def}　撃破 ${u.kills}</p></div></li>`
    )
    .join('')}</ul>`
}
