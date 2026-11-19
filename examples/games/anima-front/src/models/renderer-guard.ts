/**
 * Detaches a WebGLRenderer's internal `dispose` event listeners from shared three.js resources (ModelKit
 * geometries/textures, post-processing FullScreenQuad) when that renderer is torn down, and frees its WebGL
 * context immediately. Without this, any cached geometry, texture or material that outlives a match retains
 * every past WebGLRenderer and its `<canvas>` through `_listeners.dispose`.
 */
import * as THREE from 'three'

type DisposeTarget = THREE.EventDispatcher<{ dispose: object }>
type DisposeListener = THREE.EventListener<object, 'dispose', DisposeTarget>
type Scope = Map<DisposeTarget, Set<DisposeListener>>

let installed = false
let activeScope: Scope | null = null
const liveScopes = new Set<Scope>()

function installHook(): void {
  if (installed) return
  installed = true
  const proto = THREE.EventDispatcher.prototype as unknown as {
    addEventListener(type: string, listener: DisposeListener): void
    removeEventListener(type: string, listener: DisposeListener): void
  }
  const origAdd = proto.addEventListener
  const origRemove = proto.removeEventListener

  proto.addEventListener = function addEventListener(this: DisposeTarget, type: string, listener: DisposeListener) {
    if (activeScope !== null && type === 'dispose') {
      let set = activeScope.get(this)
      if (!set) {
        set = new Set()
        activeScope.set(this, set)
      }
      set.add(listener)
    }
    return origAdd.call(this, type, listener)
  }

  proto.removeEventListener = function removeEventListener(
    this: DisposeTarget,
    type: string,
    listener: DisposeListener
  ) {
    if (type === 'dispose') {
      for (const scope of liveScopes) {
        const set = scope.get(this)
        if (!set) continue
        set.delete(listener)
        if (set.size === 0) scope.delete(this)
      }
    }
    return origRemove.call(this, type, listener)
  }
}

function runInScope<T>(scope: Scope, fn: () => T): T {
  const prev = activeScope
  activeScope = scope
  try {
    return fn()
  } finally {
    activeScope = prev
  }
}

/**
 * Tracks `dispose` listeners registered by `renderer` onto three.js objects during rendering/compilation.
 * Calling the returned `release()` removes only this renderer's listeners (leaving other live renderers such
 * as the menu backdrop intact), disposes the renderer, and forces immediate WebGL context loss.
 */
export function guardWebGLRenderer(renderer: THREE.WebGLRenderer): () => void {
  installHook()
  const scope: Scope = new Map()
  liveScopes.add(scope)

  const origRender = renderer.render
  const origCompile = renderer.compile
  const origInitTexture = renderer.initTexture
  const origSetRenderTarget = renderer.setRenderTarget
  const origRenderBufferDirect = renderer.renderBufferDirect

  renderer.render = function render(scene, camera) {
    return runInScope(scope, () => origRender.call(this, scene, camera))
  }
  renderer.compile = function compile(scene, camera, targetScene) {
    return runInScope(scope, () => origCompile.call(this, scene, camera, targetScene))
  }
  renderer.initTexture = function initTexture(texture) {
    return runInScope(scope, () => origInitTexture.call(this, texture))
  }
  renderer.setRenderTarget = function setRenderTarget(renderTarget, activeCubeFace, activeMipmapLevel) {
    return runInScope(scope, () => origSetRenderTarget.call(this, renderTarget, activeCubeFace, activeMipmapLevel))
  }
  renderer.renderBufferDirect = function renderBufferDirect(camera, scene, geometry, material, object, group) {
    return runInScope(scope, () => origRenderBufferDirect.call(this, camera, scene, geometry, material, object, group))
  }

  let released = false
  return function release() {
    if (released) return
    released = true
    liveScopes.delete(scope)
    for (const [target, listeners] of scope) {
      for (const fn of listeners) {
        target.removeEventListener('dispose', fn)
      }
    }
    scope.clear()
    renderer.render = origRender
    renderer.compile = origCompile
    renderer.initTexture = origInitTexture
    renderer.setRenderTarget = origSetRenderTarget
    renderer.renderBufferDirect = origRenderBufferDirect
    renderer.dispose()
    renderer.forceContextLoss?.()
    const dom = renderer.domElement
    if (dom) {
      dom.width = 0
      dom.height = 0
    }
  }
}
