type Settings = {
  bgm: number
  sfx: number
  speed: 'normal' | 'fast'
  confirm: boolean
  danger: boolean
  story: boolean
  tutorial: boolean
  motion: 'system' | 'reduce'
}
const defaults: Settings = {
  bgm: 100,
  sfx: 100,
  speed: 'normal',
  confirm: true,
  danger: false,
  story: true,
  tutorial: true,
  motion: 'system'
}
const key = 'ember-grid:settings:v1'
let settings = { ...defaults }
try {
  const saved = JSON.parse(localStorage.getItem(key) || 'null')
  if (saved?.version === 1) {
    for (const name of ['bgm', 'sfx'] as const)
      if (Number.isFinite(saved[name]) && saved[name] >= 0 && saved[name] <= 100) settings[name] = saved[name]
    for (const name of ['confirm', 'danger', 'story', 'tutorial'] as const)
      if (typeof saved[name] === 'boolean') settings[name] = saved[name]
    if (saved.speed === 'normal' || saved.speed === 'fast') settings.speed = saved.speed
    if (saved.motion === 'system' || saved.motion === 'reduce') settings.motion = saved.motion
  }
} catch {}
export const bgmVolume = () => settings.bgm / 100
export const sfxVolume = () => settings.sfx / 100
export const battleSpeed = () => (settings.speed === 'fast' ? 0.5 : 1)
export const attackConfirmation = () => settings.confirm
export const dangerZoneDefault = () => settings.danger
export const storyEnabled = () => settings.story
export const tutorialEnabled = () => settings.tutorial
export const reducedMotion = () =>
  settings.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches
export function openSettings(onChange: () => void, notice: () => void) {
  const dialog = document.createElement('dialog')
  dialog.className = 'shell-dialog'
  const range = (name: 'bgm' | 'sfx', label: string) =>
    `<label class="set-row"><span class="set-label">${label}</span> <input name="${name}" type="range" min="0" max="100" value="${settings[name]}"><output>${settings[name]}%</output></label>`
  const check = (name: string, label: string, note: string) =>
    `<label class="set-row set-check"><input name="${name}" type="checkbox"><span>${label}<small>${note}</small></span></label>`
  dialog.innerHTML = `<div class="set-head"><h2>⚙ 設定</h2><button type="button">戻る</button></div><section class="set-group"><h3>サウンド</h3>${range('bgm', 'BGM 音量')}${range('sfx', '効果音 音量')}</section><section class="set-group"><h3>戦闘</h3><label class="set-row">戦闘速度 <select name="speed"><option value="normal">通常</option><option value="fast">高速</option></select></label>${check('confirm', '攻撃・回復の確認', '実行前に予測カードを表示')}${check('danger', '危険範囲を初期表示', '章の開始時から敵の攻撃範囲を表示')}</section><section class="set-group"><h3>表示と演出</h3>${check('story', 'ストーリー', '会話シーンを表示（章タイトルは常に表示）')}${check('tutorial', 'チュートリアル', '第1章で操作ガイドを表示')}<label class="set-row">動き <select name="motion"><option value="system">システムに従う</option><option value="reduce">減らす</option></select></label></section>`
  document.body.append(dialog)
  for (const name of ['confirm', 'danger', 'story', 'tutorial'] as const)
    dialog.querySelector<HTMLInputElement>(`[name=${name}]`)!.checked = settings[name]
  for (const name of ['speed', 'motion'] as const)
    dialog.querySelector<HTMLSelectElement>(`[name=${name}]`)!.value = settings[name]
  dialog.oninput = () => {
    dialog.querySelectorAll('output').forEach((out) => {
      out.textContent = `${out.parentElement!.querySelector<HTMLInputElement>('input')!.value}%`
    })
    settings = {
      bgm: Number(dialog.querySelector<HTMLInputElement>('[name=bgm]')!.value),
      sfx: Number(dialog.querySelector<HTMLInputElement>('[name=sfx]')!.value),
      speed: dialog.querySelector<HTMLSelectElement>('[name=speed]')!.value as Settings['speed'],
      motion: dialog.querySelector<HTMLSelectElement>('[name=motion]')!.value as Settings['motion'],
      confirm: dialog.querySelector<HTMLInputElement>('[name=confirm]')!.checked,
      danger: dialog.querySelector<HTMLInputElement>('[name=danger]')!.checked,
      story: dialog.querySelector<HTMLInputElement>('[name=story]')!.checked,
      tutorial: dialog.querySelector<HTMLInputElement>('[name=tutorial]')!.checked
    }
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, ...settings }))
    } catch {
      notice()
    }
    document.documentElement.classList.toggle('reduce-motion', reducedMotion())
    onChange()
  }
  dialog.querySelector('button')!.onclick = () => dialog.close()
  dialog.onclose = () => dialog.remove()
  dialog.showModal()
}
