import './style.css'
import { App } from './app/app'

const app = new App(document.querySelector<HTMLCanvasElement>('#game')!)

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
