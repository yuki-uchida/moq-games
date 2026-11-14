import './style.css'
import { boot } from './app/boot'
import { artStats } from './art/stats'
import { sfxStats } from './audio/stats'

// The splash in index.html is already on screen; the boot warms the title's art in slices, builds the App and
// removes the splash once the title has been drawn.
boot(document.querySelector<HTMLCanvasElement>('#game')!).then((app) => {
  // Test hook: the browser suite reads the live world and view, and can open the ending directly.
  ;(window as unknown as { __hamham: unknown }).__hamham = {
    get world() {
      return app.world
    },
    get view() {
      return app.view
    },
    get demoWorld() {
      return app.demoWorld
    },
    /** The app itself, for browser tests that need to look inside (session, director, audio). */
    get app() {
      return app
    },
    /** What the main thread had to build by itself: art painted here, sound effects built live. */
    get stats() {
      return { art: artStats, sfx: sfxStats }
    },
    /** Lets the bot play the stages with sound and the HUD on, as the performance checks need. */
    autopilot: (on: boolean) => app.setAutopilot(on),
    openEnding: () => app.openEnding()
  }
  // `?perf` in the address: a readout of late frames in a corner, for checking the game on the device in hand.
  if (new URLSearchParams(location.search).has('perf'))
    void import('./app/perf-readout').then(({ startPerfReadout }) => startPerfReadout(app))
})
