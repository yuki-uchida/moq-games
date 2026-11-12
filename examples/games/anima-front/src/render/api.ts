/**
 * The renderer's contract with the app (DESIGN §15). The app owns the loop: input → session → View; every
 * frame it hands the renderer the View to draw plus the local camera state. The renderer turns the View's
 * events into effects and sounds (it knows the camera, so it computes pan/volume), and draws in-world markers
 * (damage numbers, name tags, objective markers). Screen-fixed HUD is DOM (src/ui) and may use `project()`.
 */
import type { GameAudio } from '../audio/api'
import type { ModelKit, Quality } from '../models/api'
import type { MapDef, V3, View } from '../sim/types'

export interface RendererOptions {
  quality: Quality | 'auto'
  shadows: boolean
  bloom: boolean
  /** Render resolution multiplier 0.5..1. */
  resolutionScale: number
  /** Base horizontal-ish field of view in degrees (vertical FOV is derived). */
  fov: number
  damageNumbers: boolean
  reducedMotion: boolean
}

export const DEFAULT_RENDERER_OPTIONS: RendererOptions = {
  quality: 'auto',
  shadows: true,
  bloom: true,
  resolutionScale: 1,
  fov: 75,
  damageNumbers: true,
  reducedMotion: false
}

export interface CameraInput {
  /** The local player's look (predicted locally, so the camera never lags the mouse). */
  yaw: number
  pitch: number
  shoulder: 1 | -1
  /** 0 = normal, 1 = full zoom (owl sniper). */
  zoom: number
}

export interface FrameInput {
  /** The (interpolated) view to draw. */
  view: View
  /** Real seconds since the previous frame. */
  dt: number
  /** Local player id: the camera follows it, its own antiques get first-person style effects. */
  me?: string
  /** Follow another player (spectating / downed / away). */
  follow?: string
  camera: CameraInput
  /** Title demo / results: an automatic cinematic camera instead of the shoulder camera. */
  cinematic?: boolean
}

export interface ScreenPoint {
  x: number
  y: number
  /** In front of the camera and inside the viewport. */
  onScreen: boolean
  /** Distance from the camera in metres. */
  distance: number
}

export interface RendererStats {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
  quality: Quality
}

export interface GameRenderer {
  readonly canvas: HTMLCanvasElement
  /** Builds the environment for a map (and variant); resolves when it can be drawn. */
  setMap(map: MapDef, variant?: 'night' | 'crater'): Promise<void>
  /** Draws one frame. */
  frame(input: FrameInput): void
  /** CSS pixel size of the canvas and the device pixel ratio. */
  resize(width: number, height: number, dpr: number): void
  setOptions(options: Partial<RendererOptions>): void
  /** World → CSS pixel coordinates of the canvas. */
  project(p: V3): ScreenPoint
  stats(): RendererStats
  dispose(): void
}

export type CreateGameRenderer = (
  canvas: HTMLCanvasElement,
  kit: ModelKit,
  audio: GameAudio,
  options: RendererOptions
) => GameRenderer
