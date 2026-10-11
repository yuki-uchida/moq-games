import { WorkerPulse } from './WorkerPulse'
import { monotonicTimeMs, type ClockCommand } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope
const pulse = new WorkerPulse({
  now: monotonicTimeMs,
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  send: (message) => scope.postMessage(message)
})
scope.addEventListener('message', (event: MessageEvent<ClockCommand>) => pulse.receive(event.data))
