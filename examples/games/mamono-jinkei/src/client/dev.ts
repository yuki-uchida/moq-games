/** Dev-only test hook `window.__mamono` (imported only when import.meta.env.DEV). */
import type { Command } from '../sim/api'
import type { Job, StageId } from '../vocab'
import type { App } from './app'

export function installDevHook(app: App) {
  Object.assign(window, {
    __mamono: {
      get app() {
        return app
      },
      get world() {
        return app.session?.world
      },
      /** The world's internal state (tests poke heroes and props). */
      get W() {
        return (app.session?.world as unknown as { W?: unknown } | undefined)?.W
      },
      get view() {
        return app.view
      },
      get latest() {
        return app.session?.latest()
      },
      get role() {
        return app.session?.role
      },
      get myId() {
        return app.session?.myId
      },
      get camera() {
        return { ...app.renderer.camera }
      },
      get screen() {
        return app.screen
      },
      command(c: Command) {
        app.session?.command(c)
      },
      warp(to: string) {
        app.session?.world?.command(app.session.myId, { type: 'warp', to })
      },
      /** Average and worst frame interval and the last render pass (ms). */
      stats() {
        const f = app.frames
        const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length)
        return { frameMs: avg, worstMs: Math.max(...f), renderMs: app.renderer.lastMs }
      },
      startSolo() {
        app.startSolo()
      },
      /** Solo straight into a stage (e.g. 'sewer'). */
      startStage(stage: StageId) {
        app.devStart(stage)
      },
      setJob(job: Job) {
        app.job = job
      }
    }
  })
}
