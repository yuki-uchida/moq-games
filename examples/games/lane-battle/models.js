import * as THREE from 'three'
import { ModelAssetCache } from '../tower_diffence_with_jev/src/rendering/ModelAssetCache.ts'
import { ModelUnitVisual } from '../tower_diffence_with_jev/src/rendering/ModelUnitVisual.ts'
import { ModelEnvironmentLighting } from '../tower_diffence_with_jev/src/rendering/ModelEnvironmentLighting.ts'
import { UNIT_MODEL_CATALOG } from '../tower_diffence_with_jev/src/rendering/models/catalog.ts'
import { attackSeconds } from './animation.js'

const MOTIONS = ['idle', 'walk', 'attack']
const FALL_SECONDS = 0.82
// A pure ±X heading reads as a back view under the board's tilted camera; lean toward the viewer.
const FACING_Y = 0.4
// Former sprites spanned 128 cells with lots of margin; the meshes fill their span less.
const MODEL_SIZE = 1.45

/** Real glTF actors from the tower game, rendered into an offscreen WebGL canvas in the 1000×450 lane space. */
export class LaneModels {
  canvas = document.createElement('canvas')
  renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(0, 1000, 0, 450, -2000, 2000)
  cache = new ModelAssetCache(undefined, Infinity)
  actors = new Map()
  presentation = [1, 1]

  constructor() {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0, 0)
    new ModelEnvironmentLighting(this.scene, 0.5).ensure(this.renderer)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x52785e, 2.5))
    const key = new THREE.DirectionalLight(0xfff4db, 3)
    key.position.set(-200, -400, 500)
    this.scene.add(key)
  }

  /** Resolves once every role's idle/walk/attack rig is decoded; rejects on any load error. */
  load(roles) {
    return new Promise((resolve, reject) => {
      const poll = () => {
        const states = roles.flatMap((role) =>
          MOTIONS.map((m) => this.cache.requestSource(UNIT_MODEL_CATALOG[role].clips[m]))
        )
        if (states.includes('error')) reject(Error('3D model load failed'))
        else if (states.every((s) => s === 'ready')) resolve()
        else setTimeout(poll, 50)
      }
      poll()
    })
  }

  actor(key, role) {
    let visual = this.actors.get(key)
    if (!visual) {
      visual = new ModelUnitVisual(UNIT_MODEL_CATALOG[role], this.cache)
      visual.setPresentation(...this.presentation)
      this.scene.add(visual.root)
      this.actors.set(key, visual)
    }
    visual.seen = true
    return visual
  }

  /** size: the former sprite width; aspect: x-to-y pixel ratio of the stretched lane canvas. */
  setPresentation(size, aspect) {
    const scale = (size / 128) * MODEL_SIZE
    if (this.presentation[0] === scale * aspect && this.presentation[1] === aspect) return
    this.presentation = [scale * aspect, aspect]
    for (const visual of this.actors.values()) visual.setPresentation(...this.presentation)
  }

  unit(u, x, y, time) {
    const visual = this.actor(u.id, u.role)
    visual.setPosition(x, y)
    const pose = { facingX: u.side, facingY: FACING_Y, boss: false, time }
    if (u.motion === 'attack')
      visual.sample({ ...pose, motion: 'attack', seconds: attackSeconds(u.role, u.phase, u.period), loop: false })
    else {
      const rate = visual.walkRate(u.side, FACING_Y, false) / visual.definition.walkDistance
      visual.sample({ ...pose, motion: 'walk', seconds: 0, cycle: u.walkDistance * rate, loop: true })
    }
    visual.setAppearance(1)
  }

  fallen(ghost, x, y, age, opacity) {
    const visual = this.actor(ghost.id, ghost.role)
    visual.setPosition(x, y)
    visual.sampleAllyDeath(Math.min(FALL_SECONDS, age * 2), { facingX: ghost.side, facingY: FACING_Y, boss: false })
    visual.setAppearance(Math.max(0, opacity))
  }

  /** Renders this frame's actors at width×height pixels; actors not touched since the last render are released. */
  render(width, height) {
    for (const [key, visual] of this.actors)
      if (!visual.seen) {
        visual.dispose()
        this.actors.delete(key)
      } else visual.seen = false
    if (this.canvas.width !== width || this.canvas.height !== height) this.renderer.setSize(width, height, false)
    this.renderer.render(this.scene, this.camera)
    return this.canvas
  }

  /** One idle pose for a summon card, centered in a 128×112 portrait. */
  portrait(role, target) {
    const camera = new THREE.OrthographicCamera(0, 128, 0, 112, -2000, 2000)
    const scene = new THREE.Scene()
    scene.environment = this.scene.environment
    for (const light of this.scene.children) if (light.isLight) scene.add(light.clone())
    const visual = new ModelUnitVisual(UNIT_MODEL_CATALOG[role], this.cache)
    visual.setPresentation(1.6, 1)
    visual.setPosition(64, 104)
    visual.sample({ motion: 'idle', seconds: 0, loop: true, facingX: 1, facingY: FACING_Y, boss: false })
    scene.add(visual.root)
    this.renderer.setSize(128, 112, false)
    this.renderer.render(scene, camera)
    const context = target.getContext('2d')
    context.clearRect(0, 0, target.width, target.height)
    context.drawImage(this.canvas, 0, 0, target.width, target.height)
    visual.dispose()
  }
}
