/** Entry point of マモノ陣形: builds the client application over the canvas. */
import './style.css'
import { App } from './client/app'

const root = document.querySelector<HTMLElement>('#app')!
new App(root)
