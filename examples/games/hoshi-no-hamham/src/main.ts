import './style.css'
import { App } from './game/app'

const app = new App()

// Test hook: lets the browser suite read the live world state.
;(window as unknown as { __hamham: App }).__hamham = app
