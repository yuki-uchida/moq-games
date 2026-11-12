/**
 * Placeholder renderer until the real one is implemented (owned by the render workstream, which replaces this
 * file): clears the canvas so the app can run its loop.
 */
import * as THREE from 'three'
import type { CreateGameRenderer, GameRenderer, RendererOptions } from './api'

export const createGameRenderer: CreateGameRenderer = (canvas, _kit, _audio, options): GameRenderer => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1b2233)
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500)
  let opts: RendererOptions = { ...options }
  return {
    canvas,
    async setMap() {},
    frame() {
      renderer.render(scene, camera)
    },
    resize(width, height, dpr) {
      renderer.setPixelRatio(dpr * opts.resolutionScale)
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    },
    setOptions(next) {
      opts = { ...opts, ...next }
    },
    project() {
      return { x: 0, y: 0, onScreen: false, distance: Infinity }
    },
    stats() {
      return { fps: 0, frameMs: 0, drawCalls: renderer.info.render.calls, triangles: 0, quality: 'medium' }
    },
    dispose() {
      renderer.dispose()
    }
  }
}
