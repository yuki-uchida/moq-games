/**
 * Background pulse for a hidden host tab: worker timers keep running (and are barely throttled) when the page gets
 * no animation frames. Commands: 'start' (pulse every ~1/60 s) and 'stop'.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope
let timer: ReturnType<typeof setInterval> | undefined

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  clearInterval(timer)
  timer = undefined
  if (event.data === 'start') timer = setInterval(() => scope.postMessage('tick'), 1000 / 60)
})
