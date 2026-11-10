/** Screen flow, game loop and persistence for 星のハムハム. */
import { bakeArt, getArt, type BakedArt } from '../art'
import { AudioEngine } from './audio'
import { Hud } from './hud'
import { Input } from './input'
import { Renderer } from './render'
import { World, type SimEvent } from './sim'
import { ENDING_PAGES, OPENING_PAGES, STAGES, stageByNo } from './stages'
import { loadSave, storeSave, type SaveData, type StageDef } from './types'

const STEP = 1 / 60

type ScreenName = 'title' | 'select' | 'story' | 'play' | 'result' | 'dead' | 'ending'

const EVENT_SFX: Record<SimEvent['type'], Parameters<AudioEngine['play']>[0]> = {
  jump: 'jump',
  land: 'land',
  bite: 'bite',
  dig: 'dig',
  tree: 'tree',
  pipe: 'pipe',
  hive: 'hive',
  animal: 'animal',
  rock: 'rock',
  switch: 'switch',
  fruit: 'fruit',
  hurt: 'hurt',
  'enemy-down': 'enemy-down',
  'boss-hit': 'boss-hit',
  'boss-awake': 'shock',
  'boss-down': 'boss-down',
  clear: 'clear',
  dead: 'dead',
  splash: 'pipe',
  shock: 'shock',
  pickup: 'pickup'
}

export class App {
  private canvas = document.querySelector<HTMLCanvasElement>('#game')!
  private art: BakedArt
  private renderer: Renderer
  private input: Input
  private hud: Hud
  private audio: AudioEngine
  private save: SaveData
  private world: World | null = null
  private stage: StageDef = STAGES[0]
  private screen: ScreenName = 'title'
  private paused = false
  private helpOpen = false
  private lastTime = 0
  private accumulator = 0
  private raf = 0
  private storyPages: string[] = []
  private storyIndex = 0
  private storyDone: () => void = () => {}
  private bossBarShown = false
  private resultTimer = 0
  private ended = false
  private touch = false

  constructor() {
    this.art = bakeArt(getArt(), 1)
    this.renderer = new Renderer(this.canvas, this.art)
    this.input = new Input()
    this.hud = new Hud()
    this.audio = new AudioEngine()
    this.save = loadSave()
    this.audio.muted = this.save.muted
    // Touch controls appear only after a real touch, so mouse and keyboard play stays clean.
    window.addEventListener('touchstart', () => {
      this.touch = true
      if (this.screen === 'play') document.querySelector<HTMLElement>('#touch-controls')!.hidden = false
    })
    this.bindUi()
    this.input.bindTouch(document)
    this.openTitle()
    this.lastTime = performance.now() / 1000
    this.raf = requestAnimationFrame(this.loop)
  }

  // ------------------------------------------------------------------ UI

  private bindUi() {
    const on = (selector: string, handler: () => void) => {
      document.querySelector<HTMLButtonElement>(selector)!.addEventListener('click', () => {
        this.audio.unlock()
        this.audio.play('select')
        handler()
      })
    }
    on('#start', () => {
      this.save.seenOpening = false
      this.openStory(null)
    })
    on('#continue', () => this.openSelect())
    on('#help-open', () => this.openHelp())
    on('#help-close', () => this.closeHelp())
    on('#help-done', () => this.closeHelp())
    on('#select-back', () => this.openTitle())
    on('#story-next', () => this.advanceStory())
    on('#result-next', () => {
      if (this.stage.no >= STAGES.length) this.openEnding()
      else this.openStory(stageByNo(this.stage.no + 1))
    })
    on('#result-retry', () => this.startStage(this.stage))
    on('#result-select', () => this.openSelect())
    on('#dead-retry', () => this.startStage(this.stage))
    on('#dead-select', () => this.openSelect())
    on('#ending-select', () => this.openSelect())
    on('#ending-title-button', () => this.openTitle())
    on('#ending-next', () => this.advanceEnding())
    on('#pause-resume', () => this.togglePause())
    on('#pause-retry', () => {
      this.togglePause()
      this.startStage(this.stage)
    })
    on('#pause-select', () => {
      this.togglePause()
      this.openSelect()
    })
    document.querySelector('#mute')!.addEventListener('click', () => this.toggleMute())
    document.querySelector('#pause')!.addEventListener('click', () => {
      if (this.screen === 'play') this.togglePause()
    })
  }

  private showOnly(id: string | null) {
    for (const screen of Array.from(document.querySelectorAll<HTMLElement>('.screen'))) screen.hidden = true
    if (id) document.querySelector<HTMLElement>(`#${id}`)!.hidden = false
  }

  private openTitle() {
    this.screen = 'title'
    this.world = null
    this.hud.hide()
    this.hud.hideBoss()
    this.audio.stopMusic()
    this.showOnly('title-screen')
    const hasSave = this.save.cleared.length > 0 || this.save.unlocked > 1
    document.querySelector<HTMLButtonElement>('#continue')!.hidden = !hasSave
    document.querySelector<HTMLElement>('#save-note')!.textContent = hasSave
      ? `クリア ${this.save.cleared.length}/${STAGES.length} ステージ`
      : 'からだを動かして、はじめよう！'
    document.querySelector<HTMLButtonElement>('#mute')!.textContent = this.save.muted ? '🔇' : '🔊'
  }

  private openSelect() {
    this.screen = 'select'
    this.hud.hide()
    this.audio.stopMusic()
    this.showOnly('select-screen')
    const grid = document.querySelector<HTMLElement>('#stage-grid')!
    grid.replaceChildren()
    for (const stage of STAGES) {
      const unlocked = stage.no <= this.save.unlocked
      const cleared = this.save.cleared.includes(stage.no)
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'stage-card' + (unlocked ? '' : ' is-locked') + (cleared ? ' is-cleared' : '')
      card.disabled = !unlocked
      card.innerHTML = `
        <span class="stage-no">${unlocked ? String(stage.no).padStart(2, '0') : '🔒'}</span>
        <span class="stage-body">
          <b>${stage.name}</b>
          <small>${unlocked ? stage.subtitle : '？？？'}</small>
          <em>${unlocked ? `ボス：${stage.boss.name}` : 'まだ開かない'}</em>
        </span>
        <span class="stage-mark">${cleared ? '★' : unlocked ? '▶' : ''}</span>`
      if (unlocked) {
        card.addEventListener('click', () => {
          this.audio.unlock()
          this.audio.play('select')
          this.openStory(stage)
        })
      }
      grid.appendChild(card)
    }
  }

  private openStory(stage: StageDef | null) {
    this.screen = 'story'
    this.showOnly('story-screen')
    if (stage) {
      this.stage = stage
      this.storyPages = [...stage.intro]
      document.querySelector<HTMLElement>('#story-kicker')!.textContent = `第${stage.no}話`
      document.querySelector<HTMLElement>('#story-title')!.textContent = stage.name
      this.storyDone = () => this.startStage(stage)
    } else {
      this.storyPages = [...OPENING_PAGES]
      document.querySelector<HTMLElement>('#story-kicker')!.textContent = 'プロローグ'
      document.querySelector<HTMLElement>('#story-title')!.textContent = '星のハムハム'
      this.storyDone = () => this.openSelect()
    }
    this.storyIndex = 0
    this.renderStoryPage()
  }

  private renderStoryPage() {
    const box = document.querySelector<HTMLElement>('#story-pages')!
    box.replaceChildren()
    const p = document.createElement('p')
    p.textContent = this.storyPages[this.storyIndex]
    box.appendChild(p)
    const dots = document.createElement('div')
    dots.className = 'story-dots'
    this.storyPages.forEach((_, index) => {
      const dot = document.createElement('i')
      if (index === this.storyIndex) dot.className = 'is-active'
      dots.appendChild(dot)
    })
    box.appendChild(dots)
    document.querySelector<HTMLButtonElement>('#story-next')!.textContent =
      this.storyIndex >= this.storyPages.length - 1 ? 'はじめる' : 'つぎへ'
  }

  private advanceStory() {
    if (this.storyIndex < this.storyPages.length - 1) {
      this.storyIndex += 1
      this.renderStoryPage()
      return
    }
    this.storyDone()
  }

  private openHelp() {
    this.helpOpen = true
    document.querySelector<HTMLElement>('#help-screen')!.hidden = false
  }

  private closeHelp() {
    this.helpOpen = false
    document.querySelector<HTMLElement>('#help-screen')!.hidden = true
  }

  private openEnding() {
    this.screen = 'ending'
    this.ended = true
    this.hud.hide()
    this.audio.stopMusic()
    this.showOnly('ending-screen')
    this.storyPages = [...ENDING_PAGES]
    this.storyIndex = 0
    const totalTime = Object.values(this.save.best).reduce((sum, value) => sum + value, 0)
    const stats = document.querySelector<HTMLElement>('#ending-stats')!
    stats.innerHTML =
      `<span>クリア ${this.save.cleared.length}/${STAGES.length}</span><span>合計タイム ${formatTime(totalTime)}</span><span>★ ありがとう！</span>`
    stats.hidden = true
    document.querySelector<HTMLButtonElement>('#ending-select')!.hidden = true
    document.querySelector<HTMLButtonElement>('#ending-title-button')!.hidden = true
    document.querySelector<HTMLButtonElement>('#ending-next')!.hidden = false
    this.renderEndingPage()
  }

  private renderEndingPage() {
    const box = document.querySelector<HTMLElement>('#ending-pages')!
    box.replaceChildren()
    const p = document.createElement('p')
    p.textContent = this.storyPages[this.storyIndex]
    box.appendChild(p)
    const dots = document.querySelector<HTMLElement>('#ending-dots')!
    dots.replaceChildren()
    this.storyPages.forEach((_, index) => {
      const dot = document.createElement('i')
      if (index === this.storyIndex) dot.className = 'is-active'
      dots.appendChild(dot)
    })
    document.querySelector<HTMLButtonElement>('#ending-next')!.textContent =
      this.storyIndex >= this.storyPages.length - 1 ? 'おしまい' : 'つぎへ'
  }

  private advanceEnding() {
    if (this.storyIndex < this.storyPages.length - 1) {
      this.storyIndex += 1
      this.renderEndingPage()
      return
    }
    document.querySelector<HTMLElement>('#ending-stats')!.hidden = false
    document.querySelector<HTMLButtonElement>('#ending-next')!.hidden = true
    document.querySelector<HTMLButtonElement>('#ending-select')!.hidden = false
    document.querySelector<HTMLButtonElement>('#ending-title-button')!.hidden = false
  }

  // ------------------------------------------------------------------ play

  private startStage(stage: StageDef) {
    this.stage = stage
    this.world = new World(stage, { seed: stage.no * 7919 + 101 })
    this.screen = 'play'
    this.paused = false
    this.accumulator = 0
    this.bossBarShown = false
    this.resultTimer = 0
    this.showOnly(null)
    this.hud.show()
    this.hud.setStage(stage)
    this.hud.hideBoss()
    this.hud.showBanner(`${stage.no}. ${stage.name}`, stage.subtitle)
    if (this.touch) document.querySelector<HTMLElement>('#touch-controls')!.hidden = false
    this.audio.unlock()
    this.audio.startMusic(stage.theme)
    if (stage.hints[0]) this.hud.showToast(stage.hints[0])
  }

  private togglePause() {
    if (this.screen !== 'play') return
    this.paused = !this.paused
    document.querySelector<HTMLElement>('#pause-screen')!.hidden = !this.paused
    this.audio.play('select')
  }

  private toggleMute() {
    this.save.muted = !this.save.muted
    storeSave(this.save)
    this.audio.setMuted(this.save.muted)
    document.querySelector<HTMLButtonElement>('#mute')!.textContent = this.save.muted ? '🔇' : '🔊'
    document.querySelector<HTMLButtonElement>('#mute')!.setAttribute('aria-pressed', String(this.save.muted))
  }

  private loop = (time: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const now = time / 1000
    let frame = now - this.lastTime
    this.lastTime = now
    if (frame > 0.25) frame = 0.25
    if (this.input.mutePressed) this.toggleMute()
    if (this.input.confirmPressed && this.screen === 'story') this.advanceStory()
    if (this.input.confirmPressed && this.screen === 'ending') this.advanceEnding()
    if (this.input.confirmPressed && this.helpOpen) this.closeHelp()

    if (this.screen === 'play' && this.world) {
      if (this.input.pausePressed && !this.paused) this.togglePause()
      if (!this.paused) {
        this.accumulator += frame
        let steps = 0
        while (this.accumulator >= STEP && steps < 4) {
          this.step(STEP)
          this.accumulator -= STEP
          steps += 1
        }
        if (steps === 4) this.accumulator = 0
        this.handleEvents()
        this.renderer.draw(this.world, frame)
        this.hud.update(this.world, frame)
        if (this.world.boss && !this.world.boss.dead && this.world.boss.active && !this.bossBarShown) {
          this.bossBarShown = true
          this.hud.showBoss(this.world.boss.def.name, this.world.boss.def.title)
          if (this.world.boss.state !== 'tired') this.hud.showToast(`${this.world.boss.def.name} が現れた！`)
        }
        if (this.world.boss?.dead && this.bossBarShown) {
          this.bossBarShown = false
          this.hud.hideBoss()
        }
        if (this.world.state === 'clear') {
          this.resultTimer += frame
          if (this.resultTimer > 1.4) this.finishStage()
        } else if (this.world.state === 'dead') {
          this.resultTimer += frame
          if (this.resultTimer > 1.2) this.openDead()
        }
      }
    }
    this.input.endFrame()
  }

  private step(dt: number) {
    const input = this.input.poll()
    this.world!.step(dt, input)
  }

  private handleEvents() {
    const world = this.world!
    for (const event of world.events) {
      this.audio.play(EVENT_SFX[event.type])
      if (event.type === 'boss-down') this.hud.showToast('ボスを倒した！ゴールが開くよ')
      if (event.type === 'hurt') this.hud.showToast('いたい！')
      if (event.type === 'switch') this.hud.showToast('スイッチ！門が開いた')
      if (event.type === 'pipe') this.hud.showToast('水が噴き出した！')
      if (event.type === 'hive') this.hud.showToast('蜂の巣を怒らせた！')
      if (event.type === 'animal') this.hud.showToast('動物が起きた！')
      if (event.type === 'clear') this.hud.showBanner('クリア！', this.stage.name)
      if (event.type === 'dead') this.hud.showBanner('ゲームオーバー', '')
    }
    world.events.length = 0
  }

  private finishStage() {
    const stage = this.stage
    const world = this.world!
    this.resultTimer = 0
    this.screen = 'result'
    this.hud.hideBoss()
    this.audio.stopMusic()
    if (!this.save.cleared.includes(stage.no)) this.save.cleared.push(stage.no)
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(STAGES.length, stage.no + 1))
    const elapsed = world.time
    const best = this.save.best[stage.id]
    if (!best || elapsed < best) this.save.best[stage.id] = Math.round(elapsed * 10) / 10
    storeSave(this.save)
    document.querySelector<HTMLElement>('#result-kicker')!.textContent = `STAGE ${stage.no} CLEAR`
    document.querySelector<HTMLElement>('#result-title')!.textContent = `${stage.name} クリア！`
    document.querySelector<HTMLElement>('#result-text')!.textContent = stage.clear.join(' ')
    document.querySelector<HTMLElement>('#result-stats')!.innerHTML =
      `<span>タイム ${formatTime(elapsed)}</span><span>たおした数 ${world.kills}</span>` +
      (stage.objective === 'collect' ? `<span>集めた材料 ${world.collected}</span>` : '')
    document.querySelector<HTMLButtonElement>('#result-next')!.textContent =
      stage.no >= STAGES.length ? 'エンディングへ' : '次のステージへ'
    this.showOnly('result-screen')
  }

  private openDead() {
    this.screen = 'dead'
    this.resultTimer = 0
    this.audio.stopMusic()
    this.showOnly('dead-screen')
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
