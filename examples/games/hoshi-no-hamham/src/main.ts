import './style.css'
import { boot } from './app/boot'

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
    openEnding: () => app.openEnding()
  }
})
