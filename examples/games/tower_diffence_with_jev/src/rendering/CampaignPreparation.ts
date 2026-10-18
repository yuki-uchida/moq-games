/** Yield between real jobs; cancellation never promotes unfinished work to ready. */
export async function preparationPause(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, 0)
    function done() {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    function abort() {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function preparationWait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('準備がタイムアウトしました。再試行してください。')), 90_000)
    const abort = () => finish(signal.reason)
    function finish(error?: unknown, value?: T, failed = true) {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      if (failed) reject(error)
      else resolve(value!)
    }
    signal.addEventListener('abort', abort, { once: true })
    work.then(
      (value) => finish(undefined, value, false),
      (error: unknown) => finish(error)
    )
  })
}

/** Wait asynchronously for the submitted uploads/draws, rather than only their JS calls. */
export async function preparationGpu(gl: WebGLRenderingContext | WebGL2RenderingContext, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  if (!('fenceSync' in gl)) throw new Error('このGPUでは準備完了を確認できません。')
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
  if (!fence) throw new Error('GPUの準備を確認できませんでした。ページを再読み込みしてください。')
  const start = performance.now()
  try {
    gl.flush()
    while (true) {
      signal.throwIfAborted()
      const status = gl.clientWaitSync(fence, 0, 0)
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break
      if (status === gl.WAIT_FAILED || performance.now() - start > 90_000)
        throw new Error('GPUの準備が完了しませんでした。ページを再読み込みしてください。')
      await preparationPause(signal)
    }
    if (gl.getError() !== gl.NO_ERROR) throw new Error('GPUの描画準備に失敗しました。ページを再読み込みしてください。')
  } finally { gl.deleteSync(fence) }
}
